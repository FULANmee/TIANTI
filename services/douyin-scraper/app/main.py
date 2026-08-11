from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.models import ErrorBody, ProfileFetchRequest, ProfileFetchResponse
from app.provider import F2ProfileProvider, ScraperProviderError
from app.security import require_internal_auth


app = FastAPI(title="TIANTI Douyin Scraper", version="5.1.0", docs_url=None, redoc_url=None)


@lru_cache(maxsize=1)
def get_provider() -> F2ProfileProvider:
    return F2ProfileProvider(get_settings())


@app.exception_handler(ScraperProviderError)
async def handle_provider_error(_request, error: ScraperProviderError):
    body = ErrorBody(code=error.code, message=error.message, retryable=error.retryable)
    return JSONResponse(status_code=error.status_code, content=body.model_dump(by_alias=True))


@app.get("/healthz")
async def healthz():
    return {"ok": True, "version": "5.1.0"}


@app.post(
    "/v1/profiles/fetch",
    response_model=ProfileFetchResponse,
    dependencies=[Depends(require_internal_auth)],
    responses={400: {"model": ErrorBody}, 401: {"model": ErrorBody}, 502: {"model": ErrorBody}},
)
async def fetch_profile(
    request: ProfileFetchRequest,
    provider: F2ProfileProvider = Depends(get_provider),
):
    try:
        return await provider.fetch_profile(str(request.profile_url))
    except ScraperProviderError:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={"code": "INTERNAL_ERROR", "message": "Unexpected scraper error.", "retryable": True},
        ) from error
