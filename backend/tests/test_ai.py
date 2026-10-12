import json
import urllib.error

from fastapi.testclient import TestClient

from main import app


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def read(self) -> bytes:
        return json.dumps(self.payload).encode()

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args) -> bool:
        return False


def test_ai_ping_returns_mocked_answer(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    seen = {}

    def fake_urlopen(request, timeout=60):
        seen["body"] = json.loads(request.data.decode())
        seen["authorization"] = request.headers["Authorization"]
        return FakeResponse({"choices": [{"message": {"content": "4"}}]})

    monkeypatch.setattr("ai.urllib.request.urlopen", fake_urlopen)

    with TestClient(app) as client:
        response = client.post("/api/ai/ping")

    assert response.status_code == 200
    assert response.json() == {"answer": "4"}
    assert seen["body"]["model"] == "openai/gpt-oss-120b"
    assert seen["body"]["messages"] == [
        {"role": "user", "content": "What is 2+2? Reply with only the number."}
    ]
    assert "test-key" not in response.text


def test_ai_ping_missing_key_is_a_controlled_error(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with TestClient(app) as client:
        response = client.post("/api/ai/ping")

    assert response.status_code == 503
    assert response.json() == {"detail": "OPENROUTER_API_KEY is not configured"}
    assert "Traceback" not in response.text


def test_ai_ping_openrouter_failure_is_a_controlled_error(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def fake_urlopen(request, timeout=60):
        raise urllib.error.URLError("connection failed")

    monkeypatch.setattr("ai.urllib.request.urlopen", fake_urlopen)

    with TestClient(app) as client:
        response = client.post("/api/ai/ping")

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenRouter request failed"}
    assert "Traceback" not in response.text
    assert "test-key" not in response.text
