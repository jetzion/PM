import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app  # noqa: E402

PASSWORD = "correct-horse"


@pytest.fixture(autouse=True)
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("PM_DB_PATH", str(path))
    return path


class FakeResponse:
    def __init__(self, content: str) -> None:
        self.content = content

    def read(self) -> bytes:
        return json.dumps({"choices": [{"message": {"content": self.content}}]}).encode()

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args) -> bool:
        return False


@pytest.fixture
def mock_openrouter(monkeypatch):
    """Return a function that makes OpenRouter reply with `content` and records the request."""
    seen = {}

    def install(content: str) -> dict:
        def fake_urlopen(request, timeout):
            seen["body"] = json.loads(request.data.decode())
            seen["authorization"] = request.headers["Authorization"]
            return FakeResponse(content)

        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
        monkeypatch.setattr("ai.urllib.request.urlopen", fake_urlopen)
        return seen

    return install


@pytest.fixture
def make_client():
    """Return a function that opens a client, optionally registered as `username`."""
    clients = []

    def open_client(username: str | None = None) -> TestClient:
        client = TestClient(app)
        client.__enter__()
        clients.append(client)
        if username:
            response = client.post(
                "/api/auth/register", json={"username": username, "password": PASSWORD}
            )
            assert response.status_code == 201
        return client

    yield open_client
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    """A client signed in as a freshly registered user."""
    return make_client("alice")


@pytest.fixture
def board_url(client) -> str:
    """URL of the signed-in user's starter board."""
    board_id = client.get("/api/boards").json()[0]["id"]
    return f"/api/boards/{board_id}"
