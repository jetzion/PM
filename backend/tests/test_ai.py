import urllib.error


def test_ai_ping_returns_mocked_answer(mock_openrouter, client):
    seen = mock_openrouter("4")

    response = client.post("/api/ai/ping")

    assert response.status_code == 200
    assert response.json() == {"answer": "4"}
    assert seen["body"]["model"] == "openai/gpt-oss-120b"
    assert seen["body"]["max_tokens"] == 8000
    assert seen["body"]["messages"] == [
        {"role": "user", "content": "What is 2+2? Reply with only the number."}
    ]
    assert seen["authorization"] == "Bearer test-key"
    assert "test-key" not in response.text


def test_ai_ping_missing_key_is_a_controlled_error(monkeypatch, client):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = client.post("/api/ai/ping")

    assert response.status_code == 503
    assert response.json() == {"detail": "OPENROUTER_API_KEY is not configured"}
    assert "Traceback" not in response.text


def test_ai_ping_openrouter_failure_is_a_controlled_error(monkeypatch, client):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def fake_urlopen(request, timeout):
        raise urllib.error.URLError("connection failed")

    monkeypatch.setattr("ai.urllib.request.urlopen", fake_urlopen)

    response = client.post("/api/ai/ping")

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenRouter request failed"}
    assert "Traceback" not in response.text
    assert "test-key" not in response.text


def test_ai_ping_requires_sign_in(make_client):
    assert make_client().post("/api/ai/ping").status_code == 401
