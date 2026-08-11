from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
import re
import unicodedata
from typing import Any, Literal
from urllib.parse import urljoin, urlparse, urlunparse

from app.config import Settings
from app.models import Account, Diagnostics, LatestWork, Profile, ProfileFetchResponse, RelatedAccount


SEC_USER_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]+")
DIRECT_USER_PATTERN = re.compile(r"/user/([A-Za-z0-9_-]{1,512})/?")
SHORT_PROFILE_PATTERN = re.compile(r"/[A-Za-z0-9_-]{1,512}/?")
MENTION_PATTERN = re.compile(r"@([^\s@，。,;；:：/➡️()（）]+)")
ALLOWED_HOSTS = {"www.douyin.com", "douyin.com", "v.douyin.com"}
MAX_SEC_USER_ID_LENGTH = 512
MAX_NICKNAME_LENGTH = 256
MAX_RELATED_ACCOUNTS = 100
LATEST_WORK_PAGE_SIZE = 20
LATEST_WORK_MAX_PAGES = 3


def _is_safe_sec_user_id(value: Any) -> bool:
    return (
        isinstance(value, str)
        and 1 <= len(value) <= MAX_SEC_USER_ID_LENGTH
        and SEC_USER_ID_PATTERN.fullmatch(value) is not None
    )


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
    if parsed.hostname != "v.douyin.com" and not _is_safe_sec_user_id(valid_path.group(1)):
        raise ScraperProviderError("INVALID_PROFILE_URL", "The profile account identifier is invalid.", False, 400)
    return urlunparse(parsed._replace(query="", fragment=""))


def canonical_user_url(sec_user_id: str) -> str:
    if not _is_safe_sec_user_id(sec_user_id):
        raise ScraperProviderError("INVALID_UPSTREAM_RESPONSE", "The profile account identifier is invalid.", True)
    return f"https://www.douyin.com/user/{sec_user_id}"


def _candidate_account(value: Any) -> RelatedAccount | None:
    if not isinstance(value, dict):
        return None
    sec_user_id = value.get("sec_uid") or value.get("sec_user_id")
    nickname = value.get("nickname") or value.get("name")
    if (
        not isinstance(sec_user_id, str)
        or not _is_safe_sec_user_id(sec_user_id)
        or not isinstance(nickname, str)
        or not nickname
        or len(nickname) > MAX_NICKNAME_LENGTH
    ):
        return None
    return RelatedAccount(nickname=nickname, sec_user_id=sec_user_id, url=canonical_user_url(sec_user_id))


def _candidate_account_from_signature_slice(
    value: Any,
    signature_raw: str,
) -> RelatedAccount | None:
    if not isinstance(value, dict):
        return None

    sec_user_id = value.get("sec_uid") or value.get("sec_user_id")
    start = value.get("start")
    end = value.get("end")
    if (
        not _is_safe_sec_user_id(sec_user_id)
        or not isinstance(start, int)
        or isinstance(start, bool)
        or not isinstance(end, int)
        or isinstance(end, bool)
        or start < 0
        or end <= start
    ):
        return None

    candidate_slices: set[str] = set()
    if end <= len(signature_raw):
        candidate_slices.add(signature_raw[start:end])

    utf16_bytes = signature_raw.encode("utf-16-le")
    if end <= len(utf16_bytes) // 2:
        try:
            candidate_slices.add(utf16_bytes[start * 2 : end * 2].decode("utf-16-le"))
        except UnicodeDecodeError:
            pass

    nicknames = {
        nickname
        for candidate in candidate_slices
        if (nickname := _nickname_from_structured_mention(candidate)) is not None
    }
    if len(nicknames) != 1:
        return None
    nickname = next(iter(nicknames))
    return RelatedAccount(
        nickname=nickname,
        sec_user_id=sec_user_id,
        url=canonical_user_url(sec_user_id),
    )


def _nickname_from_structured_mention(value: str) -> str | None:
    if not value.startswith("@"):
        return None
    nickname = value[1:]
    if (
        not nickname
        or len(nickname) > MAX_NICKNAME_LENGTH
        or nickname != nickname.strip()
        or "@" in nickname
        or any(unicodedata.category(character) in {"Cc", "Zl", "Zp"} for character in nickname)
    ):
        return None
    return nickname


def extract_structured_related_accounts(
    raw_user: dict[str, Any],
    primary_sec_user_id: str,
    signature_raw: str,
) -> list[RelatedAccount]:
    found: dict[str, RelatedAccount] = {}

    def visit(value: Any, context_key: str = "", within_signature_extra: bool = False) -> None:
        if isinstance(value, dict):
            account = None
            if within_signature_extra:
                account = _candidate_account_from_signature_slice(value, signature_raw)
            elif any(token in context_key.lower() for token in ("signature", "mention")):
                account = _candidate_account(value)
            if account and account.sec_user_id != primary_sec_user_id:
                found.setdefault(account.sec_user_id, account)
            for key, child in value.items():
                child_within_signature_extra = within_signature_extra or key.lower() == "signature_extra"
                visit(child, str(key), child_within_signature_extra)
        elif isinstance(value, list):
            list_within_signature_extra = within_signature_extra or context_key.lower() == "signature_extra"
            for child in value:
                visit(child, context_key, list_within_signature_extra)

    visit(raw_user)
    return list(found.values())[:MAX_RELATED_ACCOUNTS]


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
                    if not _is_safe_sec_user_id(sec_user_id):
                        continue
                    found[sec_user_id] = RelatedAccount(
                        nickname=text,
                        sec_user_id=sec_user_id,
                        url=canonical_user_url(sec_user_id),
                    )
                if len({account.nickname for account in found.values()}) != len(expected_names):
                    return []
                return list(found.values())[:MAX_RELATED_ACCOUNTS]
            finally:
                await browser.close()
    except Exception:
        return []


def select_latest_work(pages: list[dict[str, Any]]) -> tuple[LatestWork | None, str]:
    works: list[dict[str, Any]] = []
    for page in pages:
        page_works = page.get("aweme_list")
        if isinstance(page_works, list):
            works.extend(work for work in page_works if isinstance(work, dict))

    valid = [
        work
        for work in works
        if str(work.get("aweme_id", "")).isdigit()
        and isinstance(work.get("create_time"), int)
        and not isinstance(work.get("create_time"), bool)
    ]
    if not valid:
        return None, "empty"

    work = max(valid, key=lambda item: item["create_time"])
    aweme_id = str(work["aweme_id"])
    is_note = bool(work.get("images"))
    path = "note" if is_note else "video"
    caption = work.get("desc") if isinstance(work.get("desc"), str) else ""
    return LatestWork(
        url=f"https://www.douyin.com/{path}/{aweme_id}",
        caption=caption[:5_000],
        published_at=datetime.fromtimestamp(work["create_time"], timezone.utc),
    ), "available"


class F2ProfileProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._visitor_cookie: str | None = None
        self._cookie_lock = asyncio.Lock()

    async def _resolve_sec_user_id(self, profile_url: str) -> str:
        direct_match = DIRECT_USER_PATTERN.fullmatch(urlparse(profile_url).path)
        if direct_match:
            sec_user_id = direct_match.group(1)
            if _is_safe_sec_user_id(sec_user_id):
                return sec_user_id
            raise ScraperProviderError("INVALID_PROFILE_URL", "Unable to resolve the Douyin profile.", False, 400)

        try:
            from f2.apps.douyin.utils import SecUserIdFetcher

            _silence_f2_logging()
            sec_user_id = await SecUserIdFetcher.get_sec_user_id(profile_url)
            if not _is_safe_sec_user_id(sec_user_id):
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

    def _request_kwargs(self, cookie: str) -> dict[str, Any]:
        return {
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

    async def _fetch_user(self, sec_user_id: str, refresh_cookie: bool = False):
        try:
            from f2.apps.douyin.handler import DouyinHandler

            _silence_f2_logging()
            cookie = await self._get_cookie(refresh=refresh_cookie)
            kwargs = self._request_kwargs(cookie)
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

    async def _fetch_latest_work(self, sec_user_id: str) -> tuple[LatestWork | None, str]:
        try:
            from f2.apps.douyin.crawler import DouyinCrawler
            from f2.apps.douyin.model import UserPost

            _silence_f2_logging()
            cookie = await self._get_cookie()
            kwargs = self._request_kwargs(cookie)
            pages: list[dict[str, Any]] = []
            max_cursor = 0
            async with DouyinCrawler(kwargs) as crawler:
                for _ in range(LATEST_WORK_MAX_PAGES):
                    response = await asyncio.wait_for(
                        crawler.fetch_user_post(
                            UserPost(
                                max_cursor=max_cursor,
                                count=LATEST_WORK_PAGE_SIZE,
                                sec_user_id=sec_user_id,
                            )
                        ),
                        timeout=self.settings.request_timeout_seconds + 4,
                    )
                    if not isinstance(response, dict):
                        break
                    pages.append(response)

                    next_cursor_value = response.get("max_cursor")
                    if isinstance(next_cursor_value, bool):
                        break
                    if isinstance(next_cursor_value, int):
                        next_cursor = next_cursor_value
                    elif isinstance(next_cursor_value, str) and next_cursor_value.isdigit():
                        next_cursor = int(next_cursor_value)
                    else:
                        break
                    if response.get("has_more") in {False, 0, "0"} or next_cursor == max_cursor:
                        break
                    max_cursor = next_cursor

            return select_latest_work(pages)
        except Exception:
            return None, "unavailable"

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
        if (
            not isinstance(raw_user, dict)
            or not isinstance(user.nickname_raw, str)
            or len(user.nickname_raw) > MAX_NICKNAME_LENGTH
        ):
            raise ScraperProviderError("PROFILE_NOT_FOUND_OR_PRIVATE", "The profile is unavailable.", False, 404)

        signature_raw = user.signature_raw if isinstance(user.signature_raw, str) else ""
        if len(signature_raw) > 5_000:
            raise ScraperProviderError("INVALID_UPSTREAM_RESPONSE", "Profile signature is too long.", True)
        follower_count = user.follower_count
        if not isinstance(follower_count, int) or isinstance(follower_count, bool) or follower_count < 0:
            raise ScraperProviderError("INVALID_UPSTREAM_RESPONSE", "Follower count is invalid.", True)

        structured_accounts = extract_structured_related_accounts(
            raw_user,
            sec_user_id,
            signature_raw,
        )
        latest_work_task = asyncio.create_task(self._fetch_latest_work(sec_user_id))
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

        latest_work, latest_work_status = await latest_work_task

        return ProfileFetchResponse(
            fetched_at=datetime.now(timezone.utc),
            account=Account(
                sec_user_id=sec_user_id,
                nickname=user.nickname_raw,
                canonical_url=canonical_user_url(sec_user_id),
            ),
            profile=Profile(
                signature_raw=signature_raw,
                follower_count=follower_count,
            ),
            related_accounts=extraction.accounts,
            latest_work=latest_work,
            diagnostics=Diagnostics(link_source=extraction.source, latest_work_status=latest_work_status),
        )
