import json

from fastapi.testclient import TestClient

from main import app


class FakeResponse:
    def __init__(self, content: str) -> None:
        self.content = content

    def read(self) -> bytes:
        return json.dumps(
            {"choices": [{"message": {"content": self.content}}]}
        ).encode()

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args) -> bool:
        return False


def mock_model(monkeypatch, content: str) -> dict:
    seen = {}

    def fake_urlopen(request, timeout=90):
        seen["body"] = json.loads(request.data.decode())
        return FakeResponse(content)

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("ai.urllib.request.urlopen", fake_urlopen)
    return seen


def test_reply_only_does_not_change_the_board(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "test.db"))
    mock_model(monkeypatch, json.dumps({"message": "Nothing changed.", "board": None}))

    with TestClient(app) as client:
        before = client.get("/api/board").json()
        response = client.post(
            "/api/chat",
            json={"message": "What is on the board?", "history": []},
        )
        after = client.get("/api/board").json()

    assert response.status_code == 200
    assert response.json() == {"message": "Nothing changed.", "board": None}
    assert after == before


def test_valid_board_is_saved_and_returned(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "test.db"))
    replacement = {
        "columns": [{"id": "col-only", "title": "Only", "cardIds": ["card-only"]}],
        "cards": {
            "card-only": {
                "id": "card-only",
                "title": "Only card",
                "details": "From the model.",
            }
        },
    }
    mock_model(
        monkeypatch,
        json.dumps({"message": "Board replaced.", "board": replacement}),
    )

    with TestClient(app) as client:
        response = client.post("/api/chat", json={"message": "Replace the board."})
        saved = client.get("/api/board").json()

    assert response.status_code == 200
    assert response.json()["message"] == "Board replaced."
    assert response.json()["board"] == replacement
    assert saved == replacement


def test_invalid_board_is_not_saved(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "test.db"))
    invalid = {
        "columns": [{"id": "col-only", "title": "Only", "cardIds": ["missing"]}],
        "cards": {},
    }
    mock_model(
        monkeypatch,
        json.dumps({"message": "I tried to update it.", "board": invalid}),
    )

    with TestClient(app) as client:
        before = client.get("/api/board").json()
        response = client.post("/api/chat", json={"message": "Break the board."})
        after = client.get("/api/board").json()

    assert response.status_code == 200
    assert response.json()["board"] is None
    assert "not applied" in response.json()["message"]
    assert after == before


def test_model_request_includes_board_and_history(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "test.db"))
    seen = mock_model(monkeypatch, json.dumps({"message": "Noted.", "board": None}))

    with TestClient(app) as client:
        board = client.get("/api/board").json()
        client.post(
            "/api/chat",
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
