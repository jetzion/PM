import json


def test_reply_only_does_not_change_the_board(mock_openrouter, client, board_url):
    mock_openrouter(json.dumps({"message": "Nothing changed.", "board": None}))

    before = client.get(board_url).json()
    response = client.post(
        f"{board_url}/chat",
        json={"message": "What is on the board?", "history": []},
    )
    after = client.get(board_url).json()

    assert response.status_code == 200
    assert response.json() == {"message": "Nothing changed.", "board": None}
    assert after == before


def test_valid_board_is_saved_and_returned(mock_openrouter, client, board_url):
    replacement = {
        "doneColumnId": "col-only",
        "labels": [],
        "columns": [{"id": "col-only", "title": "Only", "cardIds": ["card-only"]}],
        "cards": {
            "card-only": {
                "id": "card-only",
                "title": "Only card",
                "details": "From the model.",
                "priority": "low",
                "dueDate": None,
                "labelIds": [],
                "checklist": [],
                "commentCount": 0,
            }
        },
    }
    mock_openrouter(
        json.dumps({"message": "Board replaced.", "board": replacement}),
    )

    response = client.post(f"{board_url}/chat", json={"message": "Replace the board."})
    saved = client.get(board_url).json()

    assert response.status_code == 200
    assert response.json()["message"] == "Board replaced."
    assert response.json()["board"] == replacement
    assert saved == replacement


def test_invalid_board_is_not_saved(mock_openrouter, client, board_url):
    invalid = {
        "columns": [{"id": "col-only", "title": "Only", "cardIds": ["missing"]}],
        "cards": {},
    }
    mock_openrouter(
        json.dumps({"message": "I tried to update it.", "board": invalid}),
    )

    before = client.get(board_url).json()
    response = client.post(f"{board_url}/chat", json={"message": "Break the board."})
    after = client.get(board_url).json()

    assert response.status_code == 200
    assert response.json()["board"] is None
    assert "not applied" in response.json()["message"]
    assert after == before


def test_model_request_includes_board_and_history(mock_openrouter, client, board_url):
    seen = mock_openrouter(json.dumps({"message": "Noted.", "board": None}))

    board = client.get(board_url).json()
    client.post(
        f"{board_url}/chat",
        json={
            "message": "Add context.",
            "history": [{"role": "user", "content": "Earlier question"}],
        },
    )

    messages = seen["body"]["messages"]
    combined = json.dumps(messages)
    assert board["columns"][0]["id"] in combined
    assert "Earlier question" in combined
    assert messages[-1] == {"role": "user", "content": "Add context."}
    assert seen["body"]["response_format"]["type"] == "json_schema"


def test_model_board_with_bad_card_fields_is_not_saved(mock_openrouter, client, board_url):
    board = client.get(board_url).json()
    board["cards"]["card-1"]["dueDate"] = "next week"
    mock_openrouter(json.dumps({"message": "Set a date.", "board": board}))

    response = client.post(f"{board_url}/chat", json={"message": "Due next week"})

    assert response.json()["board"] is None
    assert client.get(board_url).json()["cards"]["card-1"]["dueDate"] is None


def test_prompt_includes_today_and_card_field_schema(mock_openrouter, client, board_url):
    from datetime import date

    seen = mock_openrouter(json.dumps({"message": "Ok.", "board": None}))
    client.post(f"{board_url}/chat", json={"message": "Hi"})

    assert f"Today is {date.today().isoformat()}" in seen["body"]["messages"][0]["content"]
    card_schema = seen["body"]["response_format"]["json_schema"]["schema"]["$defs"]["card"]
    assert set(card_schema["required"]) == {"id", "title", "details", "priority", "dueDate", "labelIds", "checklist"}


import io
import urllib.error

import pytest


@pytest.mark.parametrize(
    ("failure", "detail"),
    [
        (
            urllib.error.HTTPError("u", 402, "Payment Required", {}, io.BytesIO(b"{}")),
            "The OpenRouter account is out of credits. Add credits at openrouter.ai to use the AI.",
        ),
        (
            urllib.error.HTTPError("u", 401, "Unauthorized", {}, io.BytesIO(b"{}")),
            "The OpenRouter API key was rejected. Check OPENROUTER_API_KEY.",
        ),
        (
            urllib.error.HTTPError("u", 429, "Too Many Requests", {}, io.BytesIO(b"{}")),
            "The AI is rate limited right now. Wait a moment and try again.",
        ),
        (
            urllib.error.HTTPError("u", 500, "Server Error", {}, io.BytesIO(b"{}")),
            "OpenRouter request failed",
        ),
        (TimeoutError("read timed out"), "The AI took too long to respond. Try again."),
        (urllib.error.URLError("no route"), "OpenRouter request failed"),
    ],
)
def test_openrouter_failures_explain_themselves(monkeypatch, client, board_url, failure, detail):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def fail(request, timeout):
        raise failure

    monkeypatch.setattr("ai.urllib.request.urlopen", fail)
    before = client.get(board_url).json()

    response = client.post(f"{board_url}/chat", json={"message": "Hi"})

    assert response.status_code == 502
    assert response.json() == {"detail": detail}
    assert client.get(board_url).json() == before
