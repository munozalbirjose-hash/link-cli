import json
from typing import Any
from urllib.parse import unquote

import pytest
from conftest import API

from link import (
    EditableShippingAddress,
    GetAccessTokenOptions,
    LinkAPIError,
    LinkResponseError,
    LinkSDKError,
    ShippingAddressRecord,
    UpdateShippingAddressParams,
)

UPDATED = {
    "id": "addr_1",
    "is_default": False,
    "nickname": None,
    "address": {"line_2": "", "country_code": "US"},
}


@pytest.mark.parametrize(
    "params",
    [
        {
            "address": {
                "name": " Jane Doe ",
                "country_code": "US",
                "line_1": "123 Main St",
                "line_2": "",
                "locality": "Boston",
                "administrative_area": "MA",
                "postal_code": "02110",
            }
        },
        {"address": {"line_2": ""}, "is_default": False},
        {"address": {"locality": "Boston"}},
        {"is_default": True},
        {"is_default": False},
    ],
)
async def test_update_shipping_address(
    api: API, params: UpdateShippingAddressParams
) -> None:
    api.respond(UPDATED)
    result = await api.call("shipping_addresses", "update", "addr_1", **params)
    assert isinstance(result, ShippingAddressRecord)
    assert result.model_dump(exclude_unset=True) == UPDATED
    assert len(api.requests) == 1
    request = api.requests[0]
    assert request.method == "POST"
    assert str(request.url) == "https://api.link.com/shipping_addresses/addr_1"
    assert request.headers["Authorization"] == "Bearer test-token"
    assert request.headers["Content-Type"] == "application/json"
    assert json.loads(request.content) == params


async def test_typed_address_input(api: API) -> None:
    address: EditableShippingAddress = {"line_2": ""}
    params: UpdateShippingAddressParams = {"address": address}
    api.respond(UPDATED)
    await api.call("shipping_addresses", "update", "addr_1", **params)
    assert json.loads(api.requests[0].content) == {"address": {"line_2": ""}}


@pytest.mark.parametrize("id", ["addr/a?b#c%", "..", ".", "a b", "é"])
async def test_update_path_encoding(api: API, id: str) -> None:
    api.respond(UPDATED)
    await api.call("shipping_addresses", "update", id, is_default=False)
    segment = api.requests[0].url.raw_path.decode().removeprefix("/shipping_addresses/")
    assert "/" not in segment
    assert unquote(segment) == id


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"address": {}, "is_default": False}, {"is_default": False}),
        (
            {
                "address": {
                    "line_2": "",
                    "sorting_code": "hidden",
                    "dependent_locality": "hidden",
                },
                "nickname": "hidden",
            },
            {"address": {"line_2": ""}},
        ),
    ],
)
async def test_only_editable_fields(
    api: API, params: dict[str, Any], expected: dict[str, Any]
) -> None:
    api.respond(UPDATED)
    await api.call("shipping_addresses", "update", "addr_1", **params)
    assert json.loads(api.requests[0].content) == expected


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"address": {}},
        {"address": None},
        {"is_default": None},
        {"address": {"line_2": None}},
        {"address": {"line_2": 42}},
        {"address": {"sorting_code": "hidden"}},
        {"is_default": 0},
    ],
)
async def test_invalid_input(api: API, params: dict[str, Any]) -> None:
    with pytest.raises(LinkSDKError):
        await api.call("shipping_addresses", "update", "addr_1", **params)
    assert not api.requests


@pytest.mark.parametrize("status", [400, 403, 404, 500])
async def test_api_errors(api: API, status: int) -> None:
    details = {"error": {"message": "Update unavailable"}}
    api.respond(details, status)
    with pytest.raises(LinkAPIError) as caught:
        await api.call("shipping_addresses", "update", "addr_1", is_default=False)
    assert caught.value.status == status
    assert caught.value.details == details


@pytest.mark.parametrize(
    "body", [{}, {"id": 123}, {**UPDATED, "address": {"line_2": 42}}, None]
)
async def test_malformed_response(api: API, body: Any) -> None:
    api.respond(body)
    with pytest.raises(LinkResponseError):
        await api.call("shipping_addresses", "update", "addr_1", is_default=False)


@pytest.mark.parametrize("status", [200, 401])
async def test_refresh_once(mode: str, status: int) -> None:
    calls = []

    def provider(options: GetAccessTokenOptions) -> str:
        calls.append(options.force_refresh)
        return "new" if options.force_refresh else "old"

    api = API(mode, get_access_token=provider)
    try:
        api.respond({"error": "expired"}, 401)
        api.respond(UPDATED, status)
        if status == 200:
            await api.call(
                "shipping_addresses",
                "update",
                "addr_1",
                address={"line_2": ""},
                is_default=False,
            )
        else:
            with pytest.raises(LinkAPIError):
                await api.call(
                    "shipping_addresses",
                    "update",
                    "addr_1",
                    address={"line_2": ""},
                    is_default=False,
                )
        assert calls == [False, True]
        assert len(api.requests) == 2
        assert api.requests[0].content == api.requests[1].content
        assert api.requests[1].headers["Authorization"] == "Bearer new"
    finally:
        await api.close()
