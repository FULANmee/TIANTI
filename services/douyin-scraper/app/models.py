from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)


class ProfileFetchRequest(ApiModel):
    request_id: str = Field(min_length=1, max_length=128)
    profile_url: HttpUrl


class Account(ApiModel):
    sec_user_id: str = Field(min_length=1, max_length=512)
    nickname: str = Field(max_length=256)
    canonical_url: HttpUrl


class Profile(ApiModel):
    signature_raw: str = Field(max_length=5_000)
    follower_count: int = Field(ge=0)
    mcn: str | None = Field(default=None, max_length=256)


class LatestWork(ApiModel):
    url: HttpUrl
    caption: str = Field(max_length=5_000)
    published_at: datetime


class RelatedAccount(ApiModel):
    nickname: str = Field(max_length=256)
    sec_user_id: str = Field(min_length=1, max_length=512)
    url: HttpUrl


class Diagnostics(ApiModel):
    profile_source: Literal["f2-user-detail"] = "f2-user-detail"
    link_source: Literal["structured", "rendered", "unavailable"]
    latest_work_status: Literal["available", "empty", "unavailable"] = "unavailable"


class ProfileFetchResponse(ApiModel):
    schema_version: Literal[2] = 2
    fetched_at: datetime
    account: Account
    profile: Profile
    related_accounts: list[RelatedAccount] = Field(max_length=100)
    latest_work: LatestWork | None = None
    diagnostics: Diagnostics


class ErrorBody(ApiModel):
    code: str
    message: str
    retryable: bool
