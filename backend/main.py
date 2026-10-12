from pathlib import Path
from typing import Any

from contextlib import asynccontextmanager

import sqlite3
from fastapi import Depends, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from ai import AIRequestError, MissingAPIKey, chat, ping
from database import (
    create_id,
    get_board,
    get_connection,
    get_demo_user_id,
    init_database,
    reindex_cards,
    reindex_columns,
    replace_board,
)

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    yield


app = FastAPI(lifespan=lifespan)


class CardData(BaseModel):
    id: str
    title: str
    details: str = ""


class ColumnData(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    card_ids: list[str] = Field(alias="cardIds")


class BoardData(BaseModel):
    columns: list[ColumnData]
    cards: dict[str, CardData]


class ColumnCreate(BaseModel):
    title: str


class ColumnUpdate(BaseModel):
    title: str


class CardCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    column_id: str = Field(alias="columnId")
    title: str
    details: str = ""


class CardUpdate(BaseModel):
    title: str | None = None
    details: str | None = None


class CardMove(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    column_id: str = Field(alias="columnId")
    position: int


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatHistoryItem] = []


def db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def demo_user_id(conn: sqlite3.Connection) -> int:
    try:
        return get_demo_user_id(conn)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def clean_required(value: str, message: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=message)
    return cleaned


def board_model_to_dict(board: BoardData) -> dict[str, Any]:
    return {
        "columns": [
            {"id": column.id, "title": column.title, "cardIds": column.card_ids}
            for column in board.columns
        ],
        "cards": {
            card_id: {
                "id": card.id,
                "title": card.title,
                "details": card.details,
            }
            for card_id, card in board.cards.items()
        },
    }


def response_board(conn: sqlite3.Connection) -> dict[str, Any]:
    return get_board(conn, demo_user_id(conn))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/ai/ping")
def ai_ping() -> dict[str, str]:
    try:
        return {"answer": ping()}
    except MissingAPIKey as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/chat")
def chat_with_ai(
    request: ChatRequest, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    user_id = demo_user_id(conn)
    current_board = get_board(conn, user_id)
    try:
        result = chat(
            current_board,
            request.message,
            [item.model_dump() for item in request.history],
        )
    except MissingAPIKey as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    updated_board = result["board"]
    if updated_board is None:
        return {"message": result["message"], "board": None}

    try:
        with conn:
            replace_board(conn, user_id, updated_board)
    except (ValueError, KeyError):
        return {
            "message": f"{result['message']} The board update was not applied.",
            "board": None,
        }

    return {"message": result["message"], "board": get_board(conn, user_id)}


@app.get("/api/board")
def read_board(conn: sqlite3.Connection = Depends(db)) -> dict[str, Any]:
    return response_board(conn)


@app.put("/api/board")
def replace_current_board(
    board: BoardData, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    user_id = demo_user_id(conn)
    try:
        with conn:
            replace_board(conn, user_id, board_model_to_dict(board))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return response_board(conn)


@app.post("/api/columns")
def create_column(
    request: ColumnCreate, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    title = clean_required(request.title, "Column title is required")
    user_id = demo_user_id(conn)
    with conn:
        position = conn.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM columns WHERE user_id = ?",
            (user_id,),
        ).fetchone()[0]
        conn.execute(
            """
            INSERT INTO columns (id, user_id, title, position)
            VALUES (?, ?, ?, ?)
            """,
            (create_id("col"), user_id, title, position),
        )
    return response_board(conn)


@app.patch("/api/columns/{column_id}")
def update_column(
    column_id: str, request: ColumnUpdate, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    title = clean_required(request.title, "Column title is required")
    user_id = demo_user_id(conn)
    with conn:
        cursor = conn.execute(
            "UPDATE columns SET title = ? WHERE id = ? AND user_id = ?",
            (title, column_id, user_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Column not found")
    return response_board(conn)


@app.delete("/api/columns/{column_id}")
def delete_column(
    column_id: str, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    user_id = demo_user_id(conn)
    with conn:
        cursor = conn.execute(
            "DELETE FROM columns WHERE id = ? AND user_id = ?",
            (column_id, user_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Column not found")
        reindex_columns(conn, user_id)
    return response_board(conn)


@app.post("/api/cards")
def create_card(
    request: CardCreate, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    title = clean_required(request.title, "Card title is required")
    user_id = demo_user_id(conn)
    with conn:
        column = conn.execute(
            "SELECT id FROM columns WHERE id = ? AND user_id = ?",
            (request.column_id, user_id),
        ).fetchone()
        if column is None:
            raise HTTPException(status_code=404, detail="Column not found")
        position = conn.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM cards WHERE column_id = ?",
            (request.column_id,),
        ).fetchone()[0]
        conn.execute(
            """
            INSERT INTO cards (id, column_id, title, details, position)
            VALUES (?, ?, ?, ?, ?)
            """,
            (create_id("card"), request.column_id, title, request.details, position),
        )
    return response_board(conn)


@app.patch("/api/cards/{card_id}")
def update_card(
    card_id: str, request: CardUpdate, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    updates = []
    params = []
    if request.title is not None:
        updates.append("title = ?")
        params.append(clean_required(request.title, "Card title is required"))
    if request.details is not None:
        updates.append("details = ?")
        params.append(request.details)
    if not updates:
        return response_board(conn)

    params.append(card_id)
    with conn:
        cursor = conn.execute(
            f"UPDATE cards SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Card not found")
    return response_board(conn)


@app.delete("/api/cards/{card_id}")
def delete_card(card_id: str, conn: sqlite3.Connection = Depends(db)) -> dict[str, Any]:
    with conn:
        card = conn.execute(
            "SELECT column_id FROM cards WHERE id = ?",
            (card_id,),
        ).fetchone()
        if card is None:
            raise HTTPException(status_code=404, detail="Card not found")
        conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        reindex_cards(conn, card["column_id"])
    return response_board(conn)


@app.post("/api/cards/{card_id}/move")
def move_card(
    card_id: str, request: CardMove, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    if request.position < 0:
        raise HTTPException(status_code=400, detail="Position must be non-negative")

    user_id = demo_user_id(conn)
    with conn:
        target_column = conn.execute(
            "SELECT id FROM columns WHERE id = ? AND user_id = ?",
            (request.column_id, user_id),
        ).fetchone()
        if target_column is None:
            raise HTTPException(status_code=404, detail="Column not found")

        card = conn.execute(
            "SELECT id, column_id, title, details FROM cards WHERE id = ?",
            (card_id,),
        ).fetchone()
        if card is None:
            raise HTTPException(status_code=404, detail="Card not found")

        conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        reindex_cards(conn, card["column_id"])

        target_count = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE column_id = ?",
            (request.column_id,),
        ).fetchone()[0]
        position = min(request.position, target_count)
        conn.execute(
            """
            UPDATE cards
            SET position = position + 1
            WHERE column_id = ? AND position >= ?
            """,
            (request.column_id, position),
        )
        conn.execute(
            """
            INSERT INTO cards (id, column_id, title, details, position)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                card["id"],
                request.column_id,
                card["title"],
                card["details"],
                position,
            ),
        )
    return response_board(conn)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
