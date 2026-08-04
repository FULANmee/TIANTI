from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os


def _read_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _read_positive_int(name: str, default: int) -> int:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    parsed = int(value)
    if parsed <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return parsed


@dataclass(frozen=True)
class Settings:
    shared_secret: str
    configured_cookie: str | None
    enable_browser_links: bool
    request_timeout_seconds: int
    browser_timeout_seconds: int


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    shared_secret = os.getenv("SCRAPER_SHARED_SECRET", "").strip()
    cookie = os.getenv("DOUYIN_COOKIE", "").strip()
    return Settings(
        shared_secret=shared_secret,
        configured_cookie=cookie or None,
        enable_browser_links=_read_bool("DOUYIN_ENABLE_BROWSER_LINKS"),
        request_timeout_seconds=_read_positive_int("DOUYIN_REQUEST_TIMEOUT_SECONDS", 12),
        browser_timeout_seconds=_read_positive_int("DOUYIN_BROWSER_TIMEOUT_SECONDS", 20),
    )

