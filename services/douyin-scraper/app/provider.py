from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
import re
from typing import Any, Literal
from urllib.parse import urljoin, urlparse

from app.config import Settings
from app.models import Account, Diagnostics, Profile, ProfileFetchResponse, RelatedAccount


SEC_USER_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]+")
DIRECT_USER_PATTERN = re.compile(r"/user/([A-Za-z0-9_-]+)/?")
SHORT_PROFILE_PATTERN = re.compile(r"/[A-Za-z0-9_-]+/?")
MENTION_PATTERN = re.compile(r"@([^\s@，。,;；:：/➡️()（）]+)")
ALLOWED_HOSTS = {"www.douyin.com", "douyin.com", "v.douyin.com"}


def _silence_f2_logging() -> None:
    # f2 configures rotating file handlers at import time and its trace logger can
    # include signed upstream endpoints. TIANTI persists safe error codes instead,
    # so discard both f2 logger streams before invoking any upstream operation.
    for name in ("f2", "f2-trace"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        logger.setLevel(logging.CRITICAL + 1)


class ScraperProviderError(Exception):
    def __init__(self, code: str, message: str, retryable: bool, status_code: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.status_code = status_code


@dataclass(frozen=True)
class RelatedAccountExtraction:
    accounts: list[RelatedAccount]
    source: Literal["structured", "rendered", "unavailable"]


def validate_profile_url(value: str) -> str:
    parsed = urlparse(value)
    try:
        port = parsed.port
    except ValueError as error:
        raise ScraperProviderError("INVALID_PROFILE_URL", "The profile URL port is invalid.", False, 400) from error
    if (
        parsed.scheme != "https"
        or parsed.hostname not in ALLOWED_HOSTS
        or parsed.username is not None
        or parsed.password is not None
        or port not in (None, 443)
    ):
        raise ScraperProviderError(
            "INVALID_PROFILE_URL",
            "Only HTTPS Douyin profile URLs are allowed.",
            False,
            400,
        )
    valid_path = (
        SHORT_PROFILE_PATTERN.fullmatch(parsed.path)
        if parsed.hostname == "v.douyin.com"
        else DIRECT_USER_PATTERN.fullmatch(parsed.path)
    )
    if not valid_path:
        raise ScraperProviderError("INVALID_PROFILE_URL", "The URL is not a Douyin user profile.", False, 400)
    return value


def canonical_user_url(sec_user_id: str) -> str:
    if not SEC_USER_ID_PATTERN.fullmatch(sec_user_id):
        raise ScraperProviderError("INVALID_UPSTREAM_RESPONSE", "The profile account identifier is invalid.", True)
    return f"https://www.douyin.com/user/{sec_user_id}"


def _candidate_account(value: Any) -> RelatedAccount | None:
    if not isinstance(value, dict):
        return None
    sec_user_id = value.get("sec_uid") or value.get("sec_user_id")
    nickname = value.get("nickname") or value.get("name")
    if (
        not isinstance(sec_user_id, str)
        or not SEC_USER_ID_PATTERN.fullmatch(sec_user_id)
        or not isinstance(nickname, str)
        or not nickname
    ):
        return None
    return RelatedAccount(nickname=nickname, sec_user_id=sec_user_id, url=canonical_user_url(sec_user_id))


def extract_structured_related_accounts(raw_user: dict[str, Any], primary_sec_user_id: str) -> list[RelatedAccount]:
    found: dict[str, RelatedAccount] = {}

    def visit(value: Any, context_key: str = "") -> None:
        if isinstance(value, dict):
            if any(token in context_key.lower() for token in ("signature", "mention")):
                account = _candidate_account(value)
                if account and account.sec_user_id != primary_sec_user_id:
                    found[account.sec_user_id] = account
            for key, child in value.items():
                visit(child, str(key))
        elif isinstance(value, list):
            for child in value:
                visit(child, context_key)

    visit(raw_user)
    return list(found.values())


async def extract_rendered_related_accounts(
    profile_url: str,
    signature_raw: str,
    primary_sec_user_id: str,
    timeout_seconds: int,
) -> list[RelatedAccount]:
    expected_names = {name.strip() for name in MENTION_PATTERN.findall(signature_raw) if name.strip()}
    if not expected_names:
        return []

    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                page = await browser.new_page()
                await page.goto(profile_url, wait_until="domcontentloaded", timeout=timeout_seconds * 1000)
                await page.wait_for_timeout(1200)
                anchors = page.locator('a[href*="/user/"]')
                count = min(await anchors.count(), 200)
                found: dict[str, RelatedAccount] = {}
                for index in range(count):
                    anchor = anchors.nth(index)
                    text = (await anchor.inner_text()).strip().removeprefix("@").strip()
                    if text not in expected_names:
                        continue
                    href = await anchor.get_attribute("href")
                    target = urlparse(urljoin(profile_url, href or ""))
                    match = DIRECT_USER_PATTERN.fullmatch(target.path)
                    if not match or match.group(1) == primary_sec_user_id:
                        continue
                    if target.scheme != "https" or target.hostname not in {"douyin.com", "www.douyin.com"}:
                        continue
                    sec_user_id = match.group(1)
                    found[sec_user_id] = RelatedAccount(
                        nickname=text,
                        sec_user_id=sec_user_id,
                        url=canonical_user_url(sec_user_id),
                    )
                if len({account.nickname for account in found.values()}) != len(expected_names):
                    return []
                return list(found.values())
            finally:
                await browser.close()
    except Exception:
        return []


class F2ProfileProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._visitor_cookie: str | None = None
        self._cookie_lock = asyncio.Lock()

    async def _resolve_sec_user_id(self, profile_url: str) -> str:
        direct_match = DIRECT_USER_PATTERN.fullmatch(urlparse(profile_url).path)
        if direct_match:
            return direct_match.group(1)

        try:
            from f2.apps.douyin.utils import SecUserIdFetcher

            _silence_f2_logging()
            sec_user_id = await SecUserIdFetcher.get_sec_user_id(profile_url)
            if not isinstance(sec_user_id, str) or not SEC_USER_ID_PATTERN.fullmatch(sec_user_id):
                raise ValueError("invalid sec_user_id")
            return sec_user_id
        except Exception as error:
            raise ScraperProviderError("INVALID_PROFILE_URL", "Unable to resolve the Douyin profile.", False, 400) from error

    async def _get_cookie(self, refresh: bool = False) -> str:
        if self.settings.configured_cookie:
            return self.settings.configured_cookie

        async with self._cookie_lock:
            if self._visitor_cookie and not refresh:
                return self._visitor_cookie
            try:
                from f2.apps.douyin.utils import TokenManager

                _silence_f2_logging()
                ttwid = await asyncio.to_thread(TokenManager.gen_ttwid)
            except Exception as error:
                raise ScraperProviderError("COOKIE_REJECTED", "Unable to create visitor state.", True) from error
            self._visitor_cookie = f"ttwid={ttwid}"
            return self._visitor_cookie

    async def _fetch_user(self, sec_user_id: str, refresh_cookie: bool = False):
        try:
            from f2.apps.douyin.handler import DouyinHandler

            _silence_f2_logging()
            cookie = await self._get_cookie(refresh=refresh_cookie)
            kwargs = {
                "headers": {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                    "Referer": "https://www.douyin.com/",
                },
                "proxies": {"http://": None, "https://": None},
                "cookie": cookie,
                "timeout": self.settings.request_timeout_seconds,
                "max_retries": 1,
                "max_connections": 1,
            }
            return await asyncio.wait_for(
                DouyinHandler(kwargs).fetch_user_profile(sec_user_id),
                timeout=self.settings.request_timeout_seconds + 4,
            )
        except asyncio.TimeoutError as error:
            raise ScraperProviderError("UPSTREAM_TIMEOUT", "Douyin profile request timed out.", True) from error
        except ScraperProviderError:
            raise
        except Exception as error:
            raise ScraperProviderError("UPSTREAM_EMPTY_RESPONSE", "Douyin returned no usable profile.", True) from error

    async def fetch_profile(self, profile_url: str) -> ProfileFetchResponse:
        validated_url = validate_profile_url(profile_url)
        sec_user_id = await self._resolve_sec_user_id(validated_url)

        try:
            user = await self._fetch_user(sec_user_id)
        except ScraperProviderError:
            if self.settings.configured_cookie:
                raise
            user = await self._fetch_user(sec_user_id, refresh_cookie=True)

        raw = user._to_raw()
        raw_user = raw.get("user") if isinstance(raw, dict) else None
        if not isinstance(raw_user, dict) or not isinstance(user.nickname_raw, str):
            raise ScraperProviderError("PROFILE_NOT_FOUND_OR_PRIVATE", "The profile is unavailable.", False, 404)

        signature_raw = user.signature_raw if isinstance(user.signature_raw, str) else ""
        follower_count = user.follower_count
        if not isinstance(follower_count, int) or follower_count < 0:
            raise ScraperProviderError("INVALID_UPSTREAM_RESPONSE", "Follower count is invalid.", True)

        structured_accounts = extract_structured_related_accounts(raw_user, sec_user_id)
        extraction = RelatedAccountExtraction(structured_accounts, "structured")
        if not structured_accounts and "@" in signature_raw and self.settings.enable_browser_links:
            rendered_accounts = await extract_rendered_related_accounts(
                canonical_user_url(sec_user_id),
                signature_raw,
                sec_user_id,
                self.settings.browser_timeout_seconds,
            )
            extraction = RelatedAccountExtraction(
                rendered_accounts,
                "rendered" if rendered_accounts else "unavailable",
            )
        elif not structured_accounts:
            extraction = RelatedAccountExtraction([], "unavailable")

        return ProfileFetchResponse(
            fetched_at=datetime.now(timezone.utc),
            account=Account(
                sec_user_id=sec_user_id,
                nickname=user.nickname_raw,
                canonical_url=canonical_user_url(sec_user_id),
            ),
            profile=Profile(signature_raw=signature_raw, follower_count=follower_count),
            related_accounts=extraction.accounts,
            diagnostics=Diagnostics(link_source=extraction.source),
        )
