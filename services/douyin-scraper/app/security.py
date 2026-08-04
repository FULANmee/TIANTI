from __future__ import annotations

import hmac
import os

from fastapi import Header, HTTPException, Request, status

from app.config import get_settings


async def require_internal_auth(
    request: Request,
    authorization: str | None = Header(default=None),
) -> None:
    if os.getenv("VERCEL_ENV", "").strip().lower() in {"preview", "production"}:
        forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", maxsplit=1)[0].strip().lower()
        if request.url.scheme != "https" and forwarded_proto != "https":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "HTTPS_REQUIRED",
                    "message": "HTTPS is required.",
                    "retryable": False,
                },
            )

    expected = get_settings().shared_secret
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SERVICE_NOT_CONFIGURED", "message": "Scraper secret is not configured.", "retryable": False},
        )

    supplied = ""
    if authorization and authorization.startswith("Bearer "):
        supplied = authorization.removeprefix("Bearer ")

    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Unauthorized.", "retryable": False},
        )
