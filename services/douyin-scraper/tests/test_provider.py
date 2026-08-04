from app.provider import extract_structured_related_accounts


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
