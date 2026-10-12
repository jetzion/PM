import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any

DB_PATH = "/data/app.db"
DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"

DEMO_COLUMNS = [
    {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
    {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
    {"id": "col-progress", "title": "In Progress", "cardIds": ["card-4", "card-5"]},
    {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
    {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
]

DEMO_CARDS = {
    "card-1": {
        "id": "card-1",
        "title": "Align roadmap themes",
        "details": "Draft quarterly themes with impact statements and metrics.",
    },
    "card-2": {
        "id": "card-2",
        "title": "Gather customer signals",
        "details": "Review support tags, sales notes, and churn feedback.",
    },
    "card-3": {
        "id": "card-3",
        "title": "Prototype analytics view",
        "details": "Sketch initial dashboard layout and key drill-downs.",
    },
    "card-4": {
        "id": "card-4",
        "title": "Refine status language",
        "details": "Standardize column labels and tone across the board.",
    },
    "card-5": {
        "id": "card-5",
        "title": "Design card layout",
        "details": "Add hierarchy and spacing for scanning dense lists.",
    },
    "card-6": {
        "id": "card-6",
        "title": "QA micro-interactions",
        "details": "Verify hover, focus, and loading states.",
    },
    "card-7": {
        "id": "card-7",
        "title": "Ship marketing page",
        "details": "Final copy approved and asset pack delivered.",
    },
    "card-8": {
        "id": "card-8",
        "title": "Close onboarding sprint",
        "details": "Document release notes and share internally.",
    },
}

DEMO_BOARD = {"columns": DEMO_COLUMNS, "cards": DEMO_CARDS}


def get_db_path() -> str:
    return os.environ.get("PM_DB_PATH", DB_PATH)


def get_connection() -> sqlite3.Connection:
    db_path = Path(get_db_path())
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_database() -> None:
    with get_connection() as conn:
        create_schema(conn)
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count == 0:
            user_id = create_user(conn, DEMO_USERNAME, DEMO_PASSWORD)
            replace_board(conn, user_id, DEMO_BOARD)


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS columns (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          position INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_columns_user_position
          ON columns (user_id, position);

        CREATE TABLE IF NOT EXISTS cards (
          id TEXT PRIMARY KEY,
          column_id TEXT NOT NULL,
          title TEXT NOT NULL,
          details TEXT NOT NULL,
          position INTEGER NOT NULL,
          FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_cards_column_position
          ON cards (column_id, position);
        """
    )


def create_user(conn: sqlite3.Connection, username: str, password: str) -> int:
    cursor = conn.execute(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        (username, password),
    )
    return int(cursor.lastrowid)


def get_demo_user_id(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?",
        (DEMO_USERNAME,),
    ).fetchone()
    if row is None:
        raise ValueError("Demo user is not seeded")
    return int(row["id"])


def create_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def get_board(conn: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    columns = conn.execute(
        """
        SELECT id, title
        FROM columns
        WHERE user_id = ?
        ORDER BY position
        """,
        (user_id,),
    ).fetchall()

    board_columns = []
    cards: dict[str, dict[str, str]] = {}

    for column in columns:
        card_rows = conn.execute(
            """
            SELECT id, title, details
            FROM cards
            WHERE column_id = ?
            ORDER BY position
            """,
            (column["id"],),
        ).fetchall()
        card_ids = []
        for card in card_rows:
            card_ids.append(card["id"])
            cards[card["id"]] = {
                "id": card["id"],
                "title": card["title"],
                "details": card["details"],
            }

        board_columns.append(
            {"id": column["id"], "title": column["title"], "cardIds": card_ids}
        )

    return {"columns": board_columns, "cards": cards}


def validate_board(board: dict[str, Any]) -> None:
    columns = board["columns"]
    cards = board["cards"]

    column_ids = [column["id"] for column in columns]
    if len(column_ids) != len(set(column_ids)):
        raise ValueError("Column ids must be unique")

    if len(cards) != len(set(cards.keys())):
        raise ValueError("Card ids must be unique")

    seen_card_ids = []
    for column in columns:
        if not column["title"].strip():
            raise ValueError("Column titles are required")
        seen_card_ids.extend(column["cardIds"])

    if len(seen_card_ids) != len(set(seen_card_ids)):
        raise ValueError("A card can only appear in one column")

    missing_cards = set(seen_card_ids) - set(cards.keys())
    if missing_cards:
        raise ValueError("Every card id must reference an existing card")

    unplaced_cards = set(cards.keys()) - set(seen_card_ids)
    if unplaced_cards:
        raise ValueError("Every card must appear in a column")

    for card_id, card in cards.items():
        if card["id"] != card_id:
            raise ValueError("Card record keys must match card ids")
        if not card["title"].strip():
            raise ValueError("Card titles are required")


def replace_board(conn: sqlite3.Connection, user_id: int, board: dict[str, Any]) -> None:
    validate_board(board)

    conn.execute("DELETE FROM columns WHERE user_id = ?", (user_id,))

    for column_position, column in enumerate(board["columns"]):
        conn.execute(
            """
            INSERT INTO columns (id, user_id, title, position)
            VALUES (?, ?, ?, ?)
            """,
            (column["id"], user_id, column["title"].strip(), column_position),
        )

        for card_position, card_id in enumerate(column["cardIds"]):
            card = board["cards"][card_id]
            conn.execute(
                """
                INSERT INTO cards (id, column_id, title, details, position)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    card["id"],
                    column["id"],
                    card["title"].strip(),
                    card.get("details", ""),
                    card_position,
                ),
            )


def reindex_columns(conn: sqlite3.Connection, user_id: int) -> None:
    rows = conn.execute(
        "SELECT id FROM columns WHERE user_id = ? ORDER BY position",
        (user_id,),
    ).fetchall()
    for position, row in enumerate(rows):
        conn.execute(
            "UPDATE columns SET position = ? WHERE id = ?",
            (position, row["id"]),
        )


def reindex_cards(conn: sqlite3.Connection, column_id: str) -> None:
    rows = conn.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
        (column_id,),
    ).fetchall()
    for position, row in enumerate(rows):
        conn.execute(
            "UPDATE cards SET position = ? WHERE id = ?",
            (position, row["id"]),
        )
