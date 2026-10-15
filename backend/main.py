import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from ai import AIRequestError, MissingAPIKey, chat, ping
from auth import SESSION_COOKIE, SESSION_DAYS, hash_password, new_session_token, verify_password
from database import (
    ACCESSIBLE_BOARDS,
    board_role,
    create_board,
    create_id,
    create_user,
    get_board,
    get_board_summary,
    get_connection,
    init_database,
    list_boards,
    parse_due_date,
    prune_comments,
    set_card_labels,
    validate_label,
    reindex_cards,
    reindex_columns,
    replace_board,
)

STATIC_DIR = Path(__file__).parent / "static"
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MIN_PASSWORD_LENGTH = 8


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    yield


app = FastAPI(lifespan=lifespan)


@app.exception_handler(MissingAPIKey)
def missing_api_key(request: Request, exc: MissingAPIKey) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(AIRequestError)
def ai_request_error(request: Request, exc: AIRequestError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


Priority = Literal["low", "medium", "high"]
LabelColor = Literal["yellow", "blue", "purple", "navy", "gray"]


class ChecklistItemData(BaseModel):
    id: str
    text: str
    done: bool = False


class CardData(CamelModel):
    id: str
    title: str
    details: str = ""
    priority: Priority = "medium"
    due_date: str | None = Field(None, alias="dueDate")
    label_ids: list[str] = Field([], alias="labelIds")
    checklist: list[ChecklistItemData] = []


class LabelData(BaseModel):
    id: str
    name: str
    color: LabelColor


class ColumnData(CamelModel):
    id: str
    title: str
    card_ids: list[str] = Field(alias="cardIds")


class BoardData(CamelModel):
    columns: list[ColumnData]
    cards: dict[str, CardData]
    labels: list[LabelData] = []
    done_column_id: str | None = Field(None, alias="doneColumnId")


class DoneColumn(CamelModel):
    column_id: str | None = Field(alias="columnId")


class LabelCreate(BaseModel):
    name: str
    color: LabelColor


class LabelUpdate(BaseModel):
    name: str | None = None
    color: LabelColor | None = None


class Credentials(BaseModel):
    username: str
    password: str


class PasswordChange(CamelModel):
    current_password: str = Field(alias="currentPassword")
    new_password: str = Field(alias="newPassword")


class PasswordConfirm(BaseModel):
    password: str


class MemberAdd(BaseModel):
    username: str


class BoardName(BaseModel):
    name: str


class ColumnTitle(BaseModel):
    title: str


class CardCreate(CamelModel):
    column_id: str = Field(alias="columnId")
    title: str
    details: str = ""
    priority: Priority = "medium"
    due_date: str | None = Field(None, alias="dueDate")
    label_ids: list[str] = Field([], alias="labelIds")


class CardUpdate(CamelModel):
    title: str | None = None
    details: str | None = None
    priority: Priority | None = None
    # Sending "dueDate": null clears it; omitting the field leaves it unchanged.
    due_date: str | None = Field(None, alias="dueDate")
    label_ids: list[str] | None = Field(None, alias="labelIds")


class CommentCreate(BaseModel):
    body: str


class ChecklistItemCreate(BaseModel):
    text: str


class ChecklistItemUpdate(BaseModel):
    text: str | None = None
    done: bool | None = None


class CardMove(CamelModel):
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


def current_user(request: Request, conn: sqlite3.Connection = Depends(db)) -> dict[str, Any]:
    token = request.cookies.get(SESSION_COOKIE)
    row = None
    if token:
        row = conn.execute(
            """
            SELECT u.id, u.username FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.created_at > datetime('now', ?)
            """,
            (token, f"-{SESSION_DAYS} days"),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return {"id": row["id"], "username": row["username"]}


def shared_board(
    board_id: int,
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> int:
    """The board's owner or a member. Anyone else gets 404 so boards do not leak."""
    if board_role(conn, board_id, user["id"]) is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board_id


def owned_board(
    board_id: int,
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> int:
    """Owner-only actions: members get 403, everyone else 404."""
    role = board_role(conn, board_id, user["id"])
    if role is None:
        raise HTTPException(status_code=404, detail="Board not found")
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only the board owner can do that")
    return board_id


def clean_required(value: str, message: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=message)
    return cleaned


def checked_due_date(value: str | None) -> str | None:
    try:
        return parse_due_date(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def checked_label_ids(
    conn: sqlite3.Connection, board_id: int, label_ids: list[str]
) -> list[str]:
    known = {
        row["id"] for row in conn.execute("SELECT id FROM labels WHERE board_id = ?", (board_id,))
    }
    if len(label_ids) != len(set(label_ids)) or set(label_ids) - known:
        raise HTTPException(status_code=400, detail="Unknown or repeated label")
    return label_ids


def validate_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )


def require_password(conn: sqlite3.Connection, user_id: int, password: str, message: str) -> None:
    stored = conn.execute(
        "SELECT password_hash FROM users WHERE id = ?", (user_id,)
    ).fetchone()["password_hash"]
    if not verify_password(password, stored):
        raise HTTPException(status_code=400, detail=message)


def start_session(conn: sqlite3.Connection, response: Response, user_id: int) -> None:
    token = new_session_token()
    with conn:
        # Prune expired sessions here rather than on every request.
        conn.execute(
            "DELETE FROM sessions WHERE created_at <= datetime('now', ?)", (f"-{SESSION_DAYS} days",)
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id)
        )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
    )


def require_column(conn: sqlite3.Connection, board_id: int, column_id: str) -> None:
    column = conn.execute(
        "SELECT id FROM columns WHERE board_id = ? AND id = ?",
        (board_id, column_id),
    ).fetchone()
    if column is None:
        raise HTTPException(status_code=404, detail="Column not found")


def column_card_ids(conn: sqlite3.Connection, board_id: int, column_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position",
        (board_id, column_id),
    ).fetchall()
    return [row["id"] for row in rows]


def write_card_order(
    conn: sqlite3.Connection, board_id: int, column_id: str, card_ids: list[str]
) -> None:
    for position, card_id in enumerate(card_ids):
        conn.execute(
            "UPDATE cards SET column_id = ?, position = ? WHERE board_id = ? AND id = ?",
            (column_id, position, board_id, card_id),
        )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# --- Auth and account ---


@app.post("/api/auth/register", status_code=201)
def register(
    credentials: Credentials, response: Response, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    username = credentials.username.strip()
    if not USERNAME_PATTERN.fullmatch(username):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-32 letters, numbers, dots, dashes, or underscores",
        )
    validate_password(credentials.password)
    try:
        with conn:
            user_id = create_user(conn, username, credentials.password)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Username is already taken") from exc
    start_session(conn, response, user_id)
    return {"id": user_id, "username": username}


@app.post("/api/auth/login")
def login(
    credentials: Credentials, response: Response, conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (credentials.username.strip(),),
    ).fetchone()
    if row is None or not verify_password(credentials.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    start_session(conn, response, row["id"])
    return {"id": row["id"], "username": row["username"]}


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, conn: sqlite3.Connection = Depends(db)) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    response.delete_cookie(SESSION_COOKIE)


@app.get("/api/auth/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return user


@app.put("/api/auth/password", status_code=204)
def change_password(
    request: PasswordChange,
    http_request: Request,
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> None:
    require_password(conn, user["id"], request.current_password, "Current password is incorrect")
    validate_password(request.new_password)
    with conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(request.new_password), user["id"]),
        )
        # Sign out every other session for this user.
        conn.execute(
            "DELETE FROM sessions WHERE user_id = ? AND token != ?",
            (user["id"], http_request.cookies.get(SESSION_COOKIE)),
        )


@app.post("/api/auth/logout-all", status_code=204)
def logout_everywhere(
    response: Response,
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> None:
    with conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
    response.delete_cookie(SESSION_COOKIE)


@app.post("/api/auth/delete-account", status_code=204)
def delete_account(
    request: PasswordConfirm,
    response: Response,
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> None:
    require_password(conn, user["id"], request.password, "Password is incorrect")
    with conn:
        # Sessions, boards, columns, cards, and labels cascade from users.
        conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    response.delete_cookie(SESSION_COOKIE)


@app.post("/api/ai/ping")
def ai_ping(user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    return {"answer": ping()}


# --- Boards ---


@app.get("/api/boards")
def read_boards(
    user: dict[str, Any] = Depends(current_user), conn: sqlite3.Connection = Depends(db)
) -> list[dict[str, Any]]:
    return list_boards(conn, user["id"])


@app.post("/api/boards", status_code=201)
def add_board(
    request: BoardName,
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    name = clean_required(request.name, "Board name is required")
    with conn:
        board_id = create_board(conn, user["id"], name)
    return get_board_summary(conn, board_id, user["id"])


DUE_SOON_DAYS = 7
DUE_SOON_LIMIT = 20


@app.get("/api/overview")
def overview(
    today: str | None = None,
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    """Per-board stats plus overdue and soon-due cards across all of the user's boards.

    Cards in a board's done column are never overdue or due soon.

    The client passes its local `today` so "overdue" matches what the user sees.
    """
    today = checked_due_date(today) or date.today().isoformat()
    horizon = (date.fromisoformat(today) + timedelta(days=DUE_SOON_DAYS)).isoformat()

    board_rows = conn.execute(
        f"""
        SELECT b.id, b.name, COUNT(c.id) AS card_count,
          COALESCE(SUM(c.priority = 'low'), 0) AS low,
          COALESCE(SUM(c.priority = 'medium'), 0) AS medium,
          COALESCE(SUM(c.priority = 'high'), 0) AS high,
          COALESCE(SUM(c.column_id = b.done_column_id), 0) AS done,
          COALESCE(SUM(c.due_date < :today AND c.column_id IS NOT b.done_column_id), 0) AS overdue
        FROM boards b LEFT JOIN cards c ON c.board_id = b.id
        WHERE {ACCESSIBLE_BOARDS}
        GROUP BY b.id
        ORDER BY b.id
        """,
        {"today": today, "user_id": user["id"]},
    ).fetchall()
    due_rows = conn.execute(
        f"""
        SELECT b.id AS board_id, b.name AS board_name, c.id, c.title, c.due_date,
          c.priority, col.title AS column_title
        FROM cards c
        JOIN boards b ON b.id = c.board_id
        JOIN columns col ON col.board_id = c.board_id AND col.id = c.column_id
        WHERE {ACCESSIBLE_BOARDS} AND c.due_date IS NOT NULL AND c.due_date <= :horizon
          AND c.column_id IS NOT b.done_column_id
        ORDER BY c.due_date, b.id, c.title
        LIMIT :limit
        """,
        {"user_id": user["id"], "horizon": horizon, "limit": DUE_SOON_LIMIT},
    ).fetchall()

    return {
        "today": today,
        "boards": [
            {
                "id": row["id"],
                "name": row["name"],
                "cardCount": row["card_count"],
                "overdueCount": row["overdue"],
                "doneCount": row["done"],
                "priorities": {"low": row["low"], "medium": row["medium"], "high": row["high"]},
            }
            for row in board_rows
        ],
        "dueSoon": [
            {
                "boardId": row["board_id"],
                "boardName": row["board_name"],
                "cardId": row["id"],
                "title": row["title"],
                "dueDate": row["due_date"],
                "priority": row["priority"],
                "columnTitle": row["column_title"],
            }
            for row in due_rows
        ],
    }


board_router = APIRouter(prefix="/api/boards/{board_id}")


@board_router.patch("")
def rename_board(
    request: BoardName,
    board_id: int = Depends(owned_board),
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    name = clean_required(request.name, "Board name is required")
    with conn:
        conn.execute("UPDATE boards SET name = ? WHERE id = ?", (name, board_id))
    return get_board_summary(conn, board_id, user["id"])


@board_router.delete("", status_code=204)
def delete_board(
    board_id: int = Depends(owned_board), conn: sqlite3.Connection = Depends(db)
) -> None:
    with conn:
        conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def board_members(conn: sqlite3.Connection, board_id: int) -> list[dict[str, Any]]:
    """Owner first, then members in the order they were added."""
    rows = conn.execute(
        """
        SELECT u.id, u.username, 'owner' AS role, 0 AS sort FROM boards b
        JOIN users u ON u.id = b.user_id WHERE b.id = :board_id
        UNION ALL
        SELECT u.id, u.username, 'member', m.rowid FROM board_members m
        JOIN users u ON u.id = m.user_id WHERE m.board_id = :board_id
        ORDER BY sort
        """,
        {"board_id": board_id},
    ).fetchall()
    return [{"id": row["id"], "username": row["username"], "role": row["role"]} for row in rows]


@board_router.get("/members")
def read_members(
    board_id: int = Depends(shared_board), conn: sqlite3.Connection = Depends(db)
) -> list[dict[str, Any]]:
    return board_members(conn, board_id)


@board_router.post("/members", status_code=201)
def add_member(
    request: MemberAdd,
    board_id: int = Depends(owned_board),
    conn: sqlite3.Connection = Depends(db),
) -> list[dict[str, Any]]:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (request.username.strip(),)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No user with that username")
    if board_role(conn, board_id, row["id"]) is not None:
        raise HTTPException(status_code=409, detail="That user already has access")
    with conn:
        conn.execute(
            "INSERT INTO board_members (board_id, user_id) VALUES (?, ?)", (board_id, row["id"])
        )
    return board_members(conn, board_id)


@board_router.delete("/members/{member_id}")
def remove_member(
    member_id: int,
    board_id: int = Depends(shared_board),
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> list[dict[str, Any]]:
    """The owner removes anyone; a member can remove only themselves (leave)."""
    if member_id != user["id"] and board_role(conn, board_id, user["id"]) != "owner":
        raise HTTPException(status_code=403, detail="Only the board owner can remove members")
    with conn:
        cursor = conn.execute(
            "DELETE FROM board_members WHERE board_id = ? AND user_id = ?", (board_id, member_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Member not found")
    return board_members(conn, board_id)


@board_router.post("/duplicate", status_code=201)
def duplicate_board(
    request: BoardName,
    board_id: int = Depends(shared_board),
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    """Copy columns, cards, checklists, labels, and the done column (not comments)."""
    name = clean_required(request.name, "Board name is required")
    with conn:
        copy_id = create_board(conn, user["id"], name, get_board(conn, board_id))
    return get_board_summary(conn, copy_id, user["id"])


@board_router.get("")
def read_board(
    board_id: int = Depends(shared_board), conn: sqlite3.Connection = Depends(db)
) -> dict[str, Any]:
    return get_board(conn, board_id)


@board_router.put("")
def replace_whole_board(
    board: BoardData,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    try:
        with conn:
            replace_board(conn, board_id, board.model_dump(by_alias=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return get_board(conn, board_id)


@board_router.post("/chat")
def chat_with_ai(
    request: ChatRequest,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    result = chat(
        get_board(conn, board_id),
        request.message,
        [item.model_dump() for item in request.history],
    )

    updated_board = result["board"]
    if updated_board is None:
        return {"message": result["message"], "board": None}

    try:
        with conn:
            replace_board(conn, board_id, updated_board)
    except (ValueError, KeyError):
        return {
            "message": f"{result['message']} The board update was not applied.",
            "board": None,
        }

    return {"message": result["message"], "board": get_board(conn, board_id)}


@board_router.post("/columns")
def create_column(
    request: ColumnTitle,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    title = clean_required(request.title, "Column title is required")
    with conn:
        position = conn.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM columns WHERE board_id = ?",
            (board_id,),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO columns (board_id, id, title, position) VALUES (?, ?, ?, ?)",
            (board_id, create_id("col"), title, position),
        )
    return get_board(conn, board_id)


@board_router.patch("/columns/{column_id}")
def update_column(
    column_id: str,
    request: ColumnTitle,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    title = clean_required(request.title, "Column title is required")
    with conn:
        cursor = conn.execute(
            "UPDATE columns SET title = ? WHERE board_id = ? AND id = ?",
            (title, board_id, column_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Column not found")
    return get_board(conn, board_id)


@board_router.delete("/columns/{column_id}")
def delete_column(
    column_id: str,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    with conn:
        cursor = conn.execute(
            "DELETE FROM columns WHERE board_id = ? AND id = ?",
            (board_id, column_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Column not found")
        reindex_columns(conn, board_id)
        conn.execute(
            "UPDATE boards SET done_column_id = NULL WHERE id = ? AND done_column_id = ?",
            (board_id, column_id),
        )
        prune_comments(conn, board_id)
    return get_board(conn, board_id)


@board_router.put("/done-column")
def set_done_column(
    request: DoneColumn,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    if request.column_id is not None:
        require_column(conn, board_id, request.column_id)
    with conn:
        conn.execute(
            "UPDATE boards SET done_column_id = ? WHERE id = ?", (request.column_id, board_id)
        )
    return get_board(conn, board_id)


@board_router.post("/cards")
def create_card(
    request: CardCreate,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    title = clean_required(request.title, "Card title is required")
    due_date = checked_due_date(request.due_date)
    label_ids = checked_label_ids(conn, board_id, request.label_ids)
    card_id = create_id("card")
    with conn:
        require_column(conn, board_id, request.column_id)
        position = conn.execute(
            """
            SELECT COALESCE(MAX(position) + 1, 0) FROM cards
            WHERE board_id = ? AND column_id = ?
            """,
            (board_id, request.column_id),
        ).fetchone()[0]
        conn.execute(
            """
            INSERT INTO cards
              (board_id, id, column_id, title, details, priority, due_date, position)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                board_id,
                card_id,
                request.column_id,
                title,
                request.details,
                request.priority,
                due_date,
                position,
            ),
        )
        set_card_labels(conn, board_id, card_id, label_ids)
    return get_board(conn, board_id)


@board_router.patch("/cards/{card_id}")
def update_card(
    card_id: str,
    request: CardUpdate,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    updates = []
    params: list[Any] = []
    if request.title is not None:
        updates.append("title = ?")
        params.append(clean_required(request.title, "Card title is required"))
    if request.details is not None:
        updates.append("details = ?")
        params.append(request.details)
    if request.priority is not None:
        updates.append("priority = ?")
        params.append(request.priority)
    if "due_date" in request.model_fields_set:
        updates.append("due_date = ?")
        params.append(checked_due_date(request.due_date))
    label_ids = request.label_ids
    if label_ids is not None:
        checked_label_ids(conn, board_id, label_ids)
    if not updates and label_ids is None:
        return get_board(conn, board_id)

    with conn:
        exists = conn.execute(
            "SELECT 1 FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id)
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Card not found")
        if updates:
            conn.execute(
                f"UPDATE cards SET {', '.join(updates)} WHERE board_id = ? AND id = ?",
                [*params, board_id, card_id],
            )
        if label_ids is not None:
            set_card_labels(conn, board_id, card_id, label_ids)
    return get_board(conn, board_id)


@board_router.delete("/cards/{card_id}")
def delete_card(
    card_id: str,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    with conn:
        card = conn.execute(
            "SELECT column_id FROM cards WHERE board_id = ? AND id = ?",
            (board_id, card_id),
        ).fetchone()
        if card is None:
            raise HTTPException(status_code=404, detail="Card not found")
        conn.execute("DELETE FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id))
        reindex_cards(conn, board_id, card["column_id"])
        prune_comments(conn, board_id)
    return get_board(conn, board_id)


@board_router.post("/cards/{card_id}/move")
def move_card(
    card_id: str,
    request: CardMove,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    if request.position < 0:
        raise HTTPException(status_code=400, detail="Position must be non-negative")

    with conn:
        require_column(conn, board_id, request.column_id)
        card = conn.execute(
            "SELECT column_id FROM cards WHERE board_id = ? AND id = ?",
            (board_id, card_id),
        ).fetchone()
        if card is None:
            raise HTTPException(status_code=404, detail="Card not found")

        source_ids = column_card_ids(conn, board_id, card["column_id"])
        source_ids.remove(card_id)
        if card["column_id"] == request.column_id:
            target_ids = source_ids
        else:
            target_ids = column_card_ids(conn, board_id, request.column_id)
            write_card_order(conn, board_id, card["column_id"], source_ids)
        target_ids.insert(min(request.position, len(target_ids)), card_id)
        write_card_order(conn, board_id, request.column_id, target_ids)
    return get_board(conn, board_id)


def require_card(conn: sqlite3.Connection, board_id: int, card_id: str) -> None:
    card = conn.execute(
        "SELECT 1 FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id)
    ).fetchone()
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")


def require_checklist_item(
    conn: sqlite3.Connection, board_id: int, card_id: str, item_id: str
) -> None:
    item = conn.execute(
        "SELECT 1 FROM checklist_items WHERE board_id = ? AND card_id = ? AND id = ?",
        (board_id, card_id, item_id),
    ).fetchone()
    if item is None:
        raise HTTPException(status_code=404, detail="Checklist item not found")


def card_comments(conn: sqlite3.Connection, board_id: int, card_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT c.id, c.body, c.created_at, u.username FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.board_id = ? AND c.card_id = ?
        ORDER BY c.rowid
        """,
        (board_id, card_id),
    ).fetchall()
    return [
        {"id": row["id"], "body": row["body"], "author": row["username"], "createdAt": row["created_at"]}
        for row in rows
    ]


@board_router.get("/cards/{card_id}/comments")
def read_comments(
    card_id: str,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> list[dict[str, Any]]:
    require_card(conn, board_id, card_id)
    return card_comments(conn, board_id, card_id)


@board_router.post("/cards/{card_id}/comments", status_code=201)
def add_comment(
    card_id: str,
    request: CommentCreate,
    board_id: int = Depends(shared_board),
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> list[dict[str, Any]]:
    body = clean_required(request.body, "Comment text is required")
    with conn:
        require_card(conn, board_id, card_id)
        conn.execute(
            "INSERT INTO comments (board_id, id, card_id, user_id, body) VALUES (?, ?, ?, ?, ?)",
            (board_id, create_id("comment"), card_id, user["id"], body),
        )
    return card_comments(conn, board_id, card_id)


@board_router.delete("/cards/{card_id}/comments/{comment_id}")
def delete_comment(
    card_id: str,
    comment_id: str,
    board_id: int = Depends(shared_board),
    user: dict[str, Any] = Depends(current_user),
    conn: sqlite3.Connection = Depends(db),
) -> list[dict[str, Any]]:
    comment = conn.execute(
        "SELECT user_id FROM comments WHERE board_id = ? AND card_id = ? AND id = ?",
        (board_id, card_id, comment_id),
    ).fetchone()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment["user_id"] != user["id"] and board_role(conn, board_id, user["id"]) != "owner":
        raise HTTPException(status_code=403, detail="Only the author or the board owner can delete it")
    with conn:
        conn.execute("DELETE FROM comments WHERE board_id = ? AND id = ?", (board_id, comment_id))
    return card_comments(conn, board_id, card_id)


@board_router.post("/cards/{card_id}/checklist")
def add_checklist_item(
    card_id: str,
    request: ChecklistItemCreate,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    text = clean_required(request.text, "Checklist item text is required")
    with conn:
        require_card(conn, board_id, card_id)
        position = conn.execute(
            """
            SELECT COALESCE(MAX(position) + 1, 0) FROM checklist_items
            WHERE board_id = ? AND card_id = ?
            """,
            (board_id, card_id),
        ).fetchone()[0]
        conn.execute(
            """
            INSERT INTO checklist_items (board_id, id, card_id, text, done, position)
            VALUES (?, ?, ?, ?, 0, ?)
            """,
            (board_id, create_id("item"), card_id, text, position),
        )
    return get_board(conn, board_id)


@board_router.patch("/cards/{card_id}/checklist/{item_id}")
def update_checklist_item(
    card_id: str,
    item_id: str,
    request: ChecklistItemUpdate,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    require_checklist_item(conn, board_id, card_id, item_id)
    with conn:
        if request.text is not None:
            conn.execute(
                "UPDATE checklist_items SET text = ? WHERE board_id = ? AND id = ?",
                (clean_required(request.text, "Checklist item text is required"), board_id, item_id),
            )
        if request.done is not None:
            conn.execute(
                "UPDATE checklist_items SET done = ? WHERE board_id = ? AND id = ?",
                (request.done, board_id, item_id),
            )
    return get_board(conn, board_id)


@board_router.delete("/cards/{card_id}/checklist/{item_id}")
def delete_checklist_item(
    card_id: str,
    item_id: str,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    require_checklist_item(conn, board_id, card_id, item_id)
    with conn:
        conn.execute(
            "DELETE FROM checklist_items WHERE board_id = ? AND id = ?", (board_id, item_id)
        )
        rows = conn.execute(
            """
            SELECT id FROM checklist_items WHERE board_id = ? AND card_id = ?
            ORDER BY position
            """,
            (board_id, card_id),
        ).fetchall()
        conn.executemany(
            "UPDATE checklist_items SET position = ? WHERE board_id = ? AND id = ?",
            [(position, board_id, row["id"]) for position, row in enumerate(rows)],
        )
    return get_board(conn, board_id)


@board_router.post("/labels")
def create_label(
    request: LabelCreate,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    name = clean_required(request.name, "Label name is required")
    with conn:
        conn.execute(
            "INSERT INTO labels (board_id, id, name, color) VALUES (?, ?, ?, ?)",
            (board_id, create_id("label"), name, request.color),
        )
    return get_board(conn, board_id)


@board_router.patch("/labels/{label_id}")
def update_label(
    label_id: str,
    request: LabelUpdate,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    label = conn.execute(
        "SELECT name, color FROM labels WHERE board_id = ? AND id = ?", (board_id, label_id)
    ).fetchone()
    if label is None:
        raise HTTPException(status_code=404, detail="Label not found")
    name = label["name"] if request.name is None else request.name.strip()
    color = request.color or label["color"]
    try:
        validate_label(name, color)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    with conn:
        conn.execute(
            "UPDATE labels SET name = ?, color = ? WHERE board_id = ? AND id = ?",
            (name, color, board_id, label_id),
        )
    return get_board(conn, board_id)


@board_router.delete("/labels/{label_id}")
def delete_label(
    label_id: str,
    board_id: int = Depends(shared_board),
    conn: sqlite3.Connection = Depends(db),
) -> dict[str, Any]:
    with conn:
        cursor = conn.execute(
            "DELETE FROM labels WHERE board_id = ? AND id = ?", (board_id, label_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Label not found")
    return get_board(conn, board_id)


app.include_router(board_router)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
