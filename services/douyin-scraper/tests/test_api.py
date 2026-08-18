from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app, get_provider
from app.models import Account, Diagnostics, Profile, ProfileFetchResponse, RelatedAccount
from app.provider import ScraperProviderError, validate_profile_url
from main import app as vercel_service_app


class FakeProvider:
    async def fetch_profile(self, _profile_url: str) -> ProfileFetchResponse:
        return ProfileFetchResponse(
            fetched_at=datetime(2026, 8, 4, tzinfo=timezone.utc),
            account=Account(
                sec_user_id="MS4wLjABAAAA-test",
                nickname="测试达人",
                canonical_url="https://www.douyin.com/user/MS4wLjABAAAA-test",
            ),
            profile=Profile(signature_raw="8.8深圳金铲铲", follower_count=126438),
            related_accounts=[
                RelatedAccount(
                    nickname="小号",
                    sec_user_id="MS4wLjABAAAA-alt",
                    url="https://www.douyin.com/user/MS4wLjABAAAA-alt",
                )
            ],
            diagnostics=Diagnostics(link_source="structured"),
        )


def test_vercel_service_entrypoint_exports_the_fastapi_app():
    assert vercel_service_app is app


def test_health_does_not_require_authentication():
    with TestClient(app) as client:
        response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "version": "5.1.0"}


def test_profile_contract_and_authentication(monkeypatch):
    monkeypatch.setenv("SCRAPER_SHARED_SECRET", "test-secret")
    get_settings.cache_clear()
    app.dependency_overrides[get_provider] = lambda: FakeProvider()

    try:
        with TestClient(app) as client:
            unauthorized = client.post(
                "/v1/profiles/fetch",
                json={"requestId": "request-1", "profileUrl": "https://www.douyin.com/user/main"},
            )
            response = client.post(
                "/v1/profiles/fetch",
                headers={"Authorization": "Bearer test-secret"},
                json={"requestId": "request-1", "profileUrl": "https://www.douyin.com/user/main"},
            )
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    assert response.json() == {
        "schemaVersion": 2,
        "fetchedAt": "2026-08-04T00:00:00Z",
        "account": {
            "secUserId": "MS4wLjABAAAA-test",
            "nickname": "测试达人",
            "canonicalUrl": "https://www.douyin.com/user/MS4wLjABAAAA-test",
        },
        "profile": {"signatureRaw": "8.8深圳金铲铲", "followerCount": 126438},
        "diagnostics": {"profileSource": "f2-user-detail"},
    }


def test_deployed_profile_endpoint_requires_https(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("SCRAPER_SHARED_SECRET", "test-secret")
    get_settings.cache_clear()
    app.dependency_overrides[get_provider] = lambda: FakeProvider()

    try:
        with TestClient(app) as client:
            response = client.post(
                "/v1/profiles/fetch",
                headers={"Authorization": "Bearer test-secret"},
                json={"requestId": "request-1", "profileUrl": "https://www.douyin.com/user/main"},
            )
        with TestClient(app, base_url="https://testserver") as client:
            secure_response = client.post(
                "/v1/profiles/fetch",
                headers={"Authorization": "Bearer test-secret"},
                json={"requestId": "request-1", "profileUrl": "https://www.douyin.com/user/main"},
            )
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "HTTPS_REQUIRED"
    assert secure_response.status_code == 200


def test_vercel_local_development_allows_http(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("VERCEL_ENV", "development")
    monkeypatch.setenv("SCRAPER_SHARED_SECRET", "test-secret")
    get_settings.cache_clear()
    app.dependency_overrides[get_provider] = lambda: FakeProvider()

    try:
        with TestClient(app) as client:
            response = client.post(
                "/v1/profiles/fetch",
                headers={"Authorization": "Bearer test-secret"},
                json={"requestId": "request-1", "profileUrl": "https://www.douyin.com/user/main"},
            )
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()

    assert response.status_code == 200


def test_profile_url_validation_rejects_non_profile_paths_and_ports():
    assert validate_profile_url("https://www.douyin.com/user/MS4wLjABAAAA-test")
    assert validate_profile_url("https://v.douyin.com/short-code/")
    assert (
        validate_profile_url(
            "https://www.douyin.com/user/MS4wLjABAAAA-test?from_tab_name=main#profile"
        )
        == "https://www.douyin.com/user/MS4wLjABAAAA-test"
    )

    for value in (
        "https://www.douyin.com/user/account/extra",
        "https://www.douyin.com:8443/user/account",
        "https://v.douyin.com/",
        "https://v.douyin.com/short-code/extra",
        f"https://www.douyin.com/user/{'a' * 513}",
        f"https://v.douyin.com/{'a' * 513}",
    ):
        try:
            validate_profile_url(value)
        except ScraperProviderError as error:
            assert error.code == "INVALID_PROFILE_URL"
        else:
            raise AssertionError(f"expected rejection for {value}")
