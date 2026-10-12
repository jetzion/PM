import json
import os
import urllib.error
import urllib.request

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"
PING_PROMPT = "What is 2+2? Reply with only the number."


class MissingAPIKey(Exception):
    pass


class AIRequestError(Exception):
    pass


SYSTEM_PROMPT = """You manage one Kanban board.
You may add, rename, and delete columns.
You may create, edit, move, and delete cards.
Return JSON with a user-facing message and either a full replacement board or null.
Use null when the board does not change.
When the board changes, return the entire board, not a patch.
Keep existing ids for items that remain. New ids must start with col- or card-.
Every card must appear in exactly one column."""

CHAT_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "kanban_chat",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "message": {"type": "string"},
                "board": {
                    "anyOf": [
                        {"type": "null"},
                        {"$ref": "#/$defs/board"},
                    ]
                },
            },
            "required": ["message", "board"],
            "$defs": {
                "board": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "columns": {
                            "type": "array",
                            "items": {"$ref": "#/$defs/column"},
                        },
                        "cards": {
                            "type": "object",
                            "additionalProperties": {"$ref": "#/$defs/card"},
                        },
                    },
                    "required": ["columns", "cards"],
                },
                "column": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"},
                        "title": {"type": "string"},
                        "cardIds": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["id", "title", "cardIds"],
                },
                "card": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"},
                        "title": {"type": "string"},
                        "details": {"type": "string"},
                    },
                    "required": ["id", "title", "details"],
                },
            },
        },
    },
}


def ping() -> str:
    return complete(PING_PROMPT)


def complete(prompt: str) -> str:
    return complete_messages([{"role": "user", "content": prompt}])


def chat(board: dict, message: str, history: list[dict]) -> dict:
    messages = [
        {
            "role": "system",
            "content": f"{SYSTEM_PROMPT}\n\nCurrent board:\n{json.dumps(board)}",
        }
    ]
    for item in history:
        if item["role"] in {"user", "assistant"}:
            messages.append({"role": item["role"], "content": item["content"]})
    messages.append({"role": "user", "content": message})

    content = complete_messages(messages, CHAT_RESPONSE_FORMAT)
    return parse_chat_content(content)


def complete_messages(messages: list[dict], response_format: dict | None = None) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise MissingAPIKey("OPENROUTER_API_KEY is not configured")

    payload = {"model": MODEL, "messages": messages}
    if response_format is not None:
        payload["response_format"] = response_format
    request = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = json.loads(response.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AIRequestError("OpenRouter request failed") from exc

    try:
        return body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIRequestError("OpenRouter returned an unexpected response") from exc


def parse_chat_content(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```").strip()
        text = text.removesuffix("```").strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AIRequestError("OpenRouter returned an unexpected response") from exc

    if not isinstance(data, dict) or not isinstance(data.get("message"), str):
        raise AIRequestError("OpenRouter returned an unexpected response")
    if data.get("board") is not None and not isinstance(data["board"], dict):
        raise AIRequestError("OpenRouter returned an unexpected response")
    return {"message": data["message"], "board": data.get("board")}
