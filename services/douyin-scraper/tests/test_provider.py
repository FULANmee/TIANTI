from types import SimpleNamespace

from app.provider import extract_structured_mcn, extract_structured_related_accounts
from app.provider import F2ProfileProvider
from app.config import Settings


def test_extracts_only_explicit_structured_mcn_fields():
    assert extract_structured_mcn({"mcn_name": " 星河机构 "}) == "星河机构"
    assert extract_structured_mcn({"mcn": {"name": " 星河机构 "}}) == "星河机构"
    assert extract_structured_mcn({"enterprise_user_info": {"enterprise_name": "企业账号"}}) == "企业账号"
    assert extract_structured_mcn({"signature": "简介里自称某机构旗下"}) is None


def test_extracts_mcn_from_mobile_profile_card():
    assert (
        extract_structured_mcn(
            {
                "card_entries": [
                    {"title": "所属MCN机构", "sub_title": "星河机构", "type": 42},
                ]
            }
        )
        == "星河机构"
    )


def test_extracts_mcn_from_json_encoded_structured_card_data():
    assert extract_structured_mcn({"mcn_info": '{"mcn_name":"星河机构"}'}) == "星河机构"
    assert extract_structured_mcn({"enterprise_user_info": '{"mcn_name":"星河机构"}'}) == "星河机构"
    assert (
        extract_structured_mcn(
            {
                "card_entries": [
                    {
                        "title": "达人资料",
                        "card_data": '{"mcn_name":"星河机构"}',
                    }
                ]
            }
        )
        == "星河机构"
    )


def test_ignores_unrelated_profile_cards_and_mcn_text_in_bio():
    assert (
        extract_structured_mcn(
            {
                "signature": "MCN机构：星河机构",
                "card_entries": [{"title": "进入橱窗", "sub_title": "148件好物", "type": 35}],
            }
        )
        is None
    )
    assert (
        extract_structured_mcn(
            {
                "card_entries": [
                    {"mcn_id": "123", "title": "达人资料", "sub_title": "更多信息"},
                ]
            }
        )
        is None
    )


def test_profile_fetch_falls_back_to_mobile_profile_card_for_mcn(monkeypatch):
    provider = F2ProfileProvider(
        Settings(
            shared_secret="test",
            configured_cookie=None,
            enable_browser_links=False,
            request_timeout_seconds=1,
            browser_timeout_seconds=1,
        )
    )
    sec_user_id = "MS4wLjABAAAA-primary"
    desktop_user = SimpleNamespace(
        nickname_raw="测试达人",
        signature_raw="简介",
        follower_count=100,
        _to_raw=lambda: {
            "user": {
                "nickname": "测试达人",
                "signature": "简介",
            }
        },
    )

    async def fake_fetch_user(_sec_user_id):
        return desktop_user

    async def fake_mobile_profile(_sec_user_id):
        return {"card_entries": [{"title": "所属MCN机构", "sub_title": "星河机构"}]}

    async def fake_latest_work(_sec_user_id):
        return None, "empty"

    monkeypatch.setattr(provider, "_fetch_user", fake_fetch_user)
    monkeypatch.setattr(provider, "_fetch_mobile_profile_raw", fake_mobile_profile)
    monkeypatch.setattr(provider, "_fetch_latest_work", fake_latest_work)

    import asyncio

    response = asyncio.run(provider.fetch_profile(f"https://www.douyin.com/user/{sec_user_id}"))
    assert response.profile.mcn == "星河机构"


def _span(signature: str, mention: str) -> tuple[int, int]:
    start = signature.index(mention)
    return start, start + len(mention)


def test_extracts_signature_extra_account_name_from_signature_offsets():
    signature = "另一个我：@腥味猫罐"
    start, end = _span(signature, "@腥味猫罐")

    accounts = extract_structured_related_accounts(
        {
            "signature_extra": [
                {
                    "sec_uid": "MS4wLjABAAAA-related",
                    "nickname": "不应采用的冲突名称",
                    "start": start,
                    "end": end,
                }
            ]
        },
        "MS4wLjABAAAA-primary",
        signature,
    )

    assert len(accounts) == 1
    assert accounts[0].nickname == "腥味猫罐"
    assert accounts[0].sec_user_id == "MS4wLjABAAAA-related"
    assert str(accounts[0].url) == "https://www.douyin.com/user/MS4wLjABAAAA-related"


def test_extracts_signature_extra_with_utf16_offsets_after_non_bmp_emoji():
    signature = "😀另一个我：@腥味猫罐"
    mention = "@腥味猫罐"
    code_point_start = signature.index(mention)
    utf16_start = len(signature[:code_point_start].encode("utf-16-le")) // 2
    utf16_end = utf16_start + len(mention.encode("utf-16-le")) // 2

    accounts = extract_structured_related_accounts(
        {
            "signature_extra": [
                {
                    "sec_uid": "MS4wLjABAAAA-related",
                    "start": utf16_start,
                    "end": utf16_end,
                }
            ]
        },
        "MS4wLjABAAAA-primary",
        signature,
    )

    assert [(account.nickname, account.sec_user_id) for account in accounts] == [
        ("腥味猫罐", "MS4wLjABAAAA-related")
    ]


def test_rejects_ambiguous_code_point_and_utf16_signature_offsets():
    signature = "😀😀@甲@乙"
    mention = "@甲"
    code_point_start = signature.index(mention)
    utf16_start = len(signature[:code_point_start].encode("utf-16-le")) // 2
    utf16_end = utf16_start + len(mention.encode("utf-16-le")) // 2

    # The authoritative UTF-16 slice is @甲, while treating the same offsets as
    # Python code-point indexes produces @乙. A conflicting target must fail closed.
    accounts = extract_structured_related_accounts(
        {
            "signature_extra": [
                {
                    "sec_uid": "MS4wLjABAAAA-related",
                    "start": utf16_start,
                    "end": utf16_end,
                }
            ]
        },
        "MS4wLjABAAAA-primary",
        signature,
    )

    assert accounts == []


def test_signature_extra_nickname_cannot_bypass_invalid_offsets():
    accounts = extract_structured_related_accounts(
        {
            "signature_extra": [
                {
                    "sec_uid": "MS4wLjABAAAA-related",
                    "nickname": "伪造账号名",
                    "start": 0,
                    "end": 4,
                }
            ]
        },
        "MS4wLjABAAAA-primary",
        "主页简介：@真实账号",
    )

    assert accounts == []


def test_structured_signature_slice_accepts_a_nickname_with_internal_spaces():
    signature = "理想型：@我是 闪电侠"
    start, end = _span(signature, "@我是 闪电侠")

    accounts = extract_structured_related_accounts(
        {
            "signature_extra": [
                {
                    "sec_uid": "MS4wLjABAAAA-related",
                    "start": start,
                    "end": end,
                }
            ]
        },
        "MS4wLjABAAAA-primary",
        signature,
    )

    assert [(account.nickname, account.sec_user_id) for account in accounts] == [
        ("我是 闪电侠", "MS4wLjABAAAA-related")
    ]


def test_ignores_an_oversized_structured_sec_user_id():
    signature = "小号：@安全昵称"
    start, end = _span(signature, "@安全昵称")

    assert extract_structured_related_accounts(
        {
            "signature_extra": [
                {
                    "sec_uid": "a" * 513,
                    "start": start,
                    "end": end,
                }
            ]
        },
        "MS4wLjABAAAA-primary",
        signature,
    ) == []


def test_ignores_malformed_or_out_of_range_signature_extra_entries():
    signature = "另一个我：@腥味猫罐"
    valid_start, valid_end = _span(signature, "@腥味猫罐")
    malformed_entries = [
        {"sec_uid": "MS4wLjABAAAA-one", "start": -1, "end": valid_end},
        {"sec_uid": "MS4wLjABAAAA-two", "start": valid_start, "end": len(signature) + 1},
        {"sec_uid": "MS4wLjABAAAA-three", "start": valid_end, "end": valid_start},
        {"sec_uid": "MS4wLjABAAAA-four", "start": str(valid_start), "end": valid_end},
        {"sec_uid": "MS4wLjABAAAA-five", "start": True, "end": valid_end},
        {"sec_uid": "bad id", "start": valid_start, "end": valid_end},
        {"sec_uid": "MS4wLjABAAAA-six", "start": 0, "end": 4},
    ]

    assert (
        extract_structured_related_accounts(
            {"signature_extra": malformed_entries},
            "MS4wLjABAAAA-primary",
            signature,
        )
        == []
    )


def test_deduplicates_structured_targets_and_excludes_the_primary_account():
    signature = "@腥味猫罐 / @腥味猫罐 / @主账号"
    first_start, first_end = _span(signature, "@腥味猫罐")
    second_start = signature.index("@腥味猫罐", first_end)
    second_end = second_start + len("@腥味猫罐")
    primary_start, primary_end = _span(signature, "@主账号")

    accounts = extract_structured_related_accounts(
        {
            "signature_extra": [
                {
                    "sec_uid": "MS4wLjABAAAA-related",
                    "start": first_start,
                    "end": first_end,
                },
                {
                    "sec_uid": "MS4wLjABAAAA-related",
                    "start": second_start,
                    "end": second_end,
                },
                {
                    "sec_uid": "MS4wLjABAAAA-primary",
                    "start": primary_start,
                    "end": primary_end,
                },
            ]
        },
        "MS4wLjABAAAA-primary",
        signature,
    )

    assert [(account.nickname, account.sec_user_id) for account in accounts] == [
        ("腥味猫罐", "MS4wLjABAAAA-related")
    ]


def test_retains_recursive_structured_nickname_extraction_compatibility():
    accounts = extract_structured_related_accounts(
        {
            "nested": {
                "mention_entities": [
                    {
                        "sec_uid": "MS4wLjABAAAA-existing",
                        "nickname": "既有结构账号",
                    }
                ]
            }
        },
        "MS4wLjABAAAA-primary",
        "",
    )

    assert [(account.nickname, account.sec_user_id) for account in accounts] == [
        ("既有结构账号", "MS4wLjABAAAA-existing")
    ]
