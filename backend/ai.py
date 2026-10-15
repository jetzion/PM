import json
import os
from datetime import date
import urllib.error
import urllib.request

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"
# Without a cap OpenRouter reserves the model's full output (~118k tokens) per
# request and rejects it with 402 when the balance cannot cover that.
MAX_TOKENS = 8000
PING_PROMPT = "What is 2+2? Reply with only the number."


SYSTEM_PROMPT = """You manage one Kanban board.
You may add, rename, and delete columns.
You may create, edit, move, and delete cards.
Return JSON with a user-facing message and either a full replacement board or null.
Use null when the board does not change.
When the board changes, return the entire board, not a patch.
Keep existing ids for items that remain. New ids must start with col- or card-.
Every card must appear in exactly one column.
Each card has a priority (low, medium, or high) and a dueDate (YYYY-MM-DD or null).
Keep existing priorities and due dates unless asked to change them.
The board has a list of labels ({id, name, color}); colors are yellow, blue, purple, navy, or gray.
Cards list the ids of their labels in labelIds. New label ids must start with label-.
doneColumnId is the id of the column holding completed cards, or null. Moving a card there marks it done.
Each card has a checklist: an ordered list of {id, text, done}. New item ids must start with item-."""

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
                        "labels": {
                            "type": "array",
                            "items": {"$ref": "#/$defs/label"},
                        },
                        "doneColumnId": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    },
                    "required": ["columns", "cards", "labels", "doneColumnId"],
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
                        "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                        "dueDate": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                        "labelIds": {"type": "array", "items": {"type": "string"}},
                        "checklist": {
                            "type": "array",
                            "items": {"$ref": "#/$defs/checklistItem"},
                        },
                    },
                    "required": [
                        "id",
                        "title",
                        "details",
                        "priority",
                        "dueDate",
                        "labelIds",
                        "checklist",
                    ],
                },
                "checklistItem": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"},
                        "text": {"type": "string"},
                        "done": {"type": "boolean"},
                    },
                    "required": ["id", "text", "done"],
                },
                "label": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "color": {
                            "type": "string",
                            "enum": ["yellow", "blue", "purple", "navy", "gray"],
                        },
                    },
                    "required": ["id", "name", "color"],
                },
            },
        },
    },
}


# OpenRouter statuses worth explaining to the user instead of a generic failure.
HTTP_ERROR_MESSAGES = {
    401: "The OpenRouter API key was rejected. Check OPENROUTER_API_KEY.",
    402: "The OpenRouter account is out of credits. Add credits at openrouter.ai to use the AI.",
    429: "The AI is rate limited right now. Wait a moment and try again.",
}


class MissingAPIKey(Exception):
    pass


class AIRequestError(Exception):
    pass


def ping() -> str:
    return complete_messages([{"role": "user", "content": PING_PROMPT}])


def chat(board: dict, message: str, history: list[dict]) -> dict:
    messages = [
        {
            "role": "system",
            "content": (
                f"{SYSTEM_PROMPT}\n\nToday is {date.today().isoformat()}."
                f"\n\nCurrent board:\n{json.dumps(board)}"
            ),
        }
    ]
    for item in history:
        if item["role"] in {"user", "assistant"}:
            messages.append({"role": item["role"], "content": item["content"]})
    messages.append({"role": "user", "content": message})

    return parse_chat_content(complete_messages(messages, CHAT_RESPONSE_FORMAT))


def complete_messages(messages: list[dict], response_format: dict | None = None) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise MissingAPIKey("OPENROUTER_API_KEY is not configured")

    payload = {"model": MODEL, "messages": messages, "max_tokens": MAX_TOKENS}
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
    except urllib.error.HTTPError as exc:
        # HTTPError is a URLError, so it must be caught first to keep its status.
        raise AIRequestError(HTTP_ERROR_MESSAGES.get(exc.code, "OpenRouter request failed")) from exc
    except TimeoutError as exc:
        raise AIRequestError("The AI took too long to respond. Try again.") from exc
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
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
    board = data.get("board")
    if board is not None and not isinstance(board, dict):
        raise AIRequestError("OpenRouter returned an unexpected response")
    return {"message": data["message"], "board": board}
