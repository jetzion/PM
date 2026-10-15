import os
import re
import sqlite3
import uuid
from datetime import date
from pathlib import Path
from typing import Any

from auth import hash_password

DB_PATH = "/data/app.db"
SCHEMA_VERSION = 7
PRIORITIES = ("low", "medium", "high")
LABEL_COLORS = ("yellow", "blue", "purple", "navy", "gray")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
DEMO_BOARD_NAME = "Kanban Studio"

DEMO_BOARD = {
    "doneColumnId": "col-done",
    "labels": [
        {"id": "label-research", "name": "Research", "color": "blue"},
        {"id": "label-design", "name": "Design", "color": "purple"},
        {"id": "label-launch", "name": "Launch", "color": "yellow"},
    ],
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {"id": "col-progress", "title": "In Progress", "cardIds": ["card-4", "card-5"]},
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Align roadmap themes",
            "details": "Draft quarterly themes with impact statements and metrics.",
            "priority": "high",
            "dueDate": None,
            "labelIds": ["label-launch"],
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
            "priority": "medium",
            "dueDate": None,
            "labelIds": ["label-research"],
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
            "priority": "medium",
            "dueDate": None,
            "labelIds": ["label-research", "label-design"],
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
            "priority": "low",
            "dueDate": None,
            "labelIds": [],
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
            "priority": "high",
            "dueDate": None,
            "labelIds": ["label-design"],
            "checklist": [
                {"id": "item-1", "text": "Pick a spacing scale", "done": True},
                {"id": "item-2", "text": "Review with design", "done": False},
            ],
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
            "priority": "medium",
            "dueDate": None,
            "labelIds": ["label-design"],
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
            "priority": "low",
            "dueDate": None,
            "labelIds": ["label-launch"],
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
            "priority": "low",
            "dueDate": None,
            "labelIds": [],
        },
    },
}

# Starting layout for boards created after sign-up.
EMPTY_BOARD = {
    "columns": [
        {"id": "col-todo", "title": "To Do", "cardIds": []},
        {"id": "col-progress", "title": "In Progress", "cardIds": []},
        {"id": "col-done", "title": "Done", "cardIds": []},
    ],
    "cards": {},
    "labels": [],
    "doneColumnId": "col-done",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  -- Cards in this column count as completed. Not a foreign key: a composite
  -- ON DELETE SET NULL would also null board_id, so routes clear it instead.
  done_column_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_boards_user ON boards (user_id);

-- Users a board is shared with. The owner is boards.user_id and is never a row here.
CREATE TABLE IF NOT EXISTS board_members (
  board_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (board_id, user_id),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_board_members_user ON board_members (user_id);

CREATE TABLE IF NOT EXISTS columns (
  board_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (board_id, id),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_columns_board_position
  ON columns (board_id, position);

CREATE TABLE IF NOT EXISTS cards (
  board_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date TEXT,
  position INTEGER NOT NULL,
  PRIMARY KEY (board_id, id),
  FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cards_board_column_position
  ON cards (board_id, column_id, position);

CREATE TABLE IF NOT EXISTS labels (
  board_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  PRIMARY KEY (board_id, id),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklist_items (
  board_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  PRIMARY KEY (board_id, id),
  FOREIGN KEY (board_id, card_id) REFERENCES cards(board_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_card_position
  ON checklist_items (board_id, card_id, position);

-- Comments hang off the board, not the card: replace_board deletes and re-inserts
-- every card, so a card foreign key would cascade them away on each AI update.
-- prune_comments removes comments whose card is really gone.
CREATE TABLE IF NOT EXISTS comments (
  board_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (board_id, id),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_card ON comments (board_id, card_id);

CREATE TABLE IF NOT EXISTS card_labels (
  board_id INTEGER NOT NULL,
  card_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  PRIMARY KEY (board_id, card_id, label_id),
  FOREIGN KEY (board_id, card_id) REFERENCES cards(board_id, id) ON DELETE CASCADE,
  FOREIGN KEY (board_id, label_id) REFERENCES labels(board_id, id) ON DELETE CASCADE
);
"""


def get_connection() -> sqlite3.Connection:
    db_path = Path(os.environ.get("PM_DB_PATH", DB_PATH))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # FastAPI may close a request's connection on a different worker thread.
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_database() -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute("BEGIN")
            if is_legacy_schema(conn):
                migrate_legacy(conn)
            create_schema(conn)
            add_card_fields(conn)
            add_done_column(conn)
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if user_count == 0:
                create_user(conn, DEMO_USERNAME, DEMO_PASSWORD)
    finally:
        conn.close()


def create_schema(conn: sqlite3.Connection) -> None:
    # One statement at a time: executescript would commit the open transaction.
    for statement in SCHEMA.split(";"):
        if statement.strip():
            conn.execute(statement)


def add_card_fields(conn: sqlite3.Connection) -> None:
    """Schema v2: cards gained priority and due_date."""
    column_names = {row["name"] for row in conn.execute("PRAGMA table_info(cards)")}
    if "priority" not in column_names:
        conn.execute("ALTER TABLE cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'")
        conn.execute("ALTER TABLE cards ADD COLUMN due_date TEXT")


def add_done_column(conn: sqlite3.Connection) -> None:
    """Schema v4: boards gained done_column_id, backfilled once from a column titled Done."""
    column_names = {row["name"] for row in conn.execute("PRAGMA table_info(boards)")}
    if "done_column_id" not in column_names:
        conn.execute("ALTER TABLE boards ADD COLUMN done_column_id TEXT")
        backfill_done_columns(conn)


def backfill_done_columns(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        UPDATE boards SET done_column_id = (
          SELECT id FROM columns
          WHERE board_id = boards.id AND lower(trim(title)) = 'done'
          ORDER BY position LIMIT 1
        )
        WHERE done_column_id IS NULL
        """
    )


def is_legacy_schema(conn: sqlite3.Connection) -> bool:
    """The pre-boards schema had columns keyed by user_id and plain-text passwords."""
    column_names = {row["name"] for row in conn.execute("PRAGMA table_info(columns)")}
    return "user_id" in column_names


def migrate_legacy(conn: sqlite3.Connection) -> None:
    """Move each legacy user's single board into the boards schema."""
    for table in ("users", "columns", "cards"):
        conn.execute(f"ALTER TABLE {table} RENAME TO legacy_{table}")
    create_schema(conn)

    for user in conn.execute("SELECT id, username, password FROM legacy_users").fetchall():
        conn.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
            (user["id"], user["username"], hash_password(user["password"])),
        )
        board_id = insert_board(conn, user["id"], DEMO_BOARD_NAME)
        conn.execute(
            """
            INSERT INTO columns (board_id, id, title, position)
            SELECT ?, id, title, position FROM legacy_columns WHERE user_id = ?
            """,
            (board_id, user["id"]),
        )
        conn.execute(
            """
            INSERT INTO cards (board_id, id, column_id, title, details, position)
            SELECT ?, c.id, c.column_id, c.title, c.details, c.position
            FROM legacy_cards c JOIN legacy_columns col ON col.id = c.column_id
            WHERE col.user_id = ?
            """,
            (board_id, user["id"]),
        )

    backfill_done_columns(conn)
    for table in ("cards", "columns", "users"):
        conn.execute(f"DROP TABLE legacy_{table}")


def create_user(conn: sqlite3.Connection, username: str, password: str) -> int:
    """Create a user with the demo board as their first project."""
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, hash_password(password)),
    )
    user_id = int(cursor.lastrowid)
    create_board(conn, user_id, DEMO_BOARD_NAME, DEMO_BOARD)
    return user_id


def insert_board(conn: sqlite3.Connection, user_id: int, name: str) -> int:
    cursor = conn.execute(
        "INSERT INTO boards (user_id, name) VALUES (?, ?)", (user_id, name)
    )
    return int(cursor.lastrowid)


def create_board(
    conn: sqlite3.Connection, user_id: int, name: str, board: dict[str, Any] = EMPTY_BOARD
) -> int:
    board_id = insert_board(conn, user_id, name)
    replace_board(conn, board_id, board)
    return board_id


# Boards the user owns or is a member of. Used by every query that lists boards.
ACCESSIBLE_BOARDS = """
  (b.user_id = :user_id
   OR b.id IN (SELECT board_id FROM board_members WHERE user_id = :user_id))
"""

SUMMARY_QUERY = f"""
SELECT b.id, b.name, b.created_at, owner.username AS owner,
  b.user_id = :user_id AS is_owner,
  (SELECT COUNT(*) FROM columns WHERE board_id = b.id) AS column_count,
  (SELECT COUNT(*) FROM cards WHERE board_id = b.id) AS card_count
FROM boards b JOIN users owner ON owner.id = b.user_id
WHERE {ACCESSIBLE_BOARDS}
"""


def list_boards(conn: sqlite3.Connection, user_id: int) -> list[dict[str, Any]]:
    # Own boards first, then boards shared with the user.
    rows = conn.execute(
        f"{SUMMARY_QUERY} ORDER BY is_owner DESC, b.id", {"user_id": user_id}
    ).fetchall()
    return [board_summary(row) for row in rows]


def get_board_summary(conn: sqlite3.Connection, board_id: int, user_id: int) -> dict[str, Any]:
    row = conn.execute(
        f"{SUMMARY_QUERY} AND b.id = :board_id", {"user_id": user_id, "board_id": board_id}
    ).fetchone()
    return board_summary(row)


def board_summary(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "createdAt": row["created_at"],
        "columnCount": row["column_count"],
        "cardCount": row["card_count"],
        "role": "owner" if row["is_owner"] else "member",
        "owner": row["owner"],
    }


def board_role(conn: sqlite3.Connection, board_id: int, user_id: int) -> str | None:
    """'owner', 'member', or None when the user cannot see the board."""
    row = conn.execute(
        """
        SELECT CASE
          WHEN b.user_id = :user_id THEN 'owner'
          WHEN m.user_id IS NOT NULL THEN 'member'
        END AS role
        FROM boards b
        LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = :user_id
        WHERE b.id = :board_id
        """,
        {"user_id": user_id, "board_id": board_id},
    ).fetchone()
    return row["role"] if row else None


def create_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def get_board(conn: sqlite3.Connection, board_id: int) -> dict[str, Any]:
    columns = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()
    card_rows = conn.execute(
        """
        SELECT id, column_id, title, details, priority, due_date
        FROM cards
        WHERE board_id = ?
        ORDER BY position
        """,
        (board_id,),
    ).fetchall()

    # Labels keep insertion order (rowid); replace_board inserts them in array order.
    label_rows = conn.execute(
        "SELECT id, name, color FROM labels WHERE board_id = ? ORDER BY rowid",
        (board_id,),
    ).fetchall()
    card_label_rows = conn.execute(
        """
        SELECT cl.card_id, cl.label_id FROM card_labels cl
        JOIN labels l ON l.board_id = cl.board_id AND l.id = cl.label_id
        WHERE cl.board_id = ?
        ORDER BY l.rowid
        """,
        (board_id,),
    ).fetchall()
    label_ids_by_card: dict[str, list[str]] = {}
    for row in card_label_rows:
        label_ids_by_card.setdefault(row["card_id"], []).append(row["label_id"])

    checklist_by_card: dict[str, list[dict[str, Any]]] = {}
    for row in conn.execute(
        """
        SELECT card_id, id, text, done FROM checklist_items
        WHERE board_id = ? ORDER BY position
        """,
        (board_id,),
    ):
        checklist_by_card.setdefault(row["card_id"], []).append(
            {"id": row["id"], "text": row["text"], "done": bool(row["done"])}
        )

    comment_counts = dict(
        conn.execute(
            "SELECT card_id, COUNT(*) FROM comments WHERE board_id = ? GROUP BY card_id",
            (board_id,),
        ).fetchall()
    )

    card_ids_by_column: dict[str, list[str]] = {column["id"]: [] for column in columns}
    cards: dict[str, dict[str, Any]] = {}
    for card in card_rows:
        card_ids_by_column[card["column_id"]].append(card["id"])
        cards[card["id"]] = {
            "id": card["id"],
            "title": card["title"],
            "details": card["details"],
            "priority": card["priority"],
            "dueDate": card["due_date"],
            "labelIds": label_ids_by_card.get(card["id"], []),
            "checklist": checklist_by_card.get(card["id"], []),
            # Read-only; comments have their own routes and are ignored on write.
            "commentCount": comment_counts.get(card["id"], 0),
        }

    return {
        "columns": [
            {
                "id": column["id"],
                "title": column["title"],
                "cardIds": card_ids_by_column[column["id"]],
            }
            for column in columns
        ],
        "cards": cards,
        "labels": [dict(label) for label in label_rows],
        "doneColumnId": conn.execute(
            "SELECT done_column_id FROM boards WHERE id = ?", (board_id,)
        ).fetchone()[0],
    }


def validate_board(board: dict[str, Any]) -> None:
    columns = board["columns"]
    cards = board["cards"]
    labels = board.get("labels", [])

    label_ids = [label["id"] for label in labels]
    if len(label_ids) != len(set(label_ids)):
        raise ValueError("Label ids must be unique")
    for label in labels:
        validate_label(label["name"], label["color"])

    column_ids = [column["id"] for column in columns]
    if len(column_ids) != len(set(column_ids)):
        raise ValueError("Column ids must be unique")

    done_column_id = board.get("doneColumnId")
    if done_column_id is not None and done_column_id not in column_ids:
        raise ValueError("The done column must be one of the board's columns")

    placed_card_ids = []
    for column in columns:
        if not column["title"].strip():
            raise ValueError("Column titles are required")
        placed_card_ids.extend(column["cardIds"])

    if len(placed_card_ids) != len(set(placed_card_ids)):
        raise ValueError("A card can only appear in one column")
    if set(placed_card_ids) - cards.keys():
        raise ValueError("Every card id must reference an existing card")
    if cards.keys() - set(placed_card_ids):
        raise ValueError("Every card must appear in a column")

    item_ids: list[str] = []
    for card_id, card in cards.items():
        if card["id"] != card_id:
            raise ValueError("Card record keys must match card ids")
        if not card["title"].strip():
            raise ValueError("Card titles are required")
        if card.get("priority", "medium") not in PRIORITIES:
            raise ValueError("Card priority must be low, medium, or high")
        parse_due_date(card.get("dueDate"))
        card_label_ids = card.get("labelIds", [])
        if len(card_label_ids) != len(set(card_label_ids)):
            raise ValueError("A card cannot have the same label twice")
        if set(card_label_ids) - set(label_ids):
            raise ValueError("Card labels must reference board labels")
        for item in card.get("checklist", []):
            if not item["text"].strip():
                raise ValueError("Checklist items need text")
            item_ids.append(item["id"])

    if len(item_ids) != len(set(item_ids)):
        raise ValueError("Checklist item ids must be unique")


def validate_label(name: str, color: str) -> None:
    if not name.strip():
        raise ValueError("Label names are required")
    if color not in LABEL_COLORS:
        raise ValueError(f"Label color must be one of: {', '.join(LABEL_COLORS)}")


def parse_due_date(value: str | None) -> str | None:
    """Accept None or a real YYYY-MM-DD date."""
    if value is None:
        return None
    try:
        valid = bool(DATE_PATTERN.fullmatch(value)) and bool(date.fromisoformat(value))
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("Due date must be a YYYY-MM-DD date")
    return value


def replace_board(conn: sqlite3.Connection, board_id: int, board: dict[str, Any]) -> None:
    validate_board(board)

    conn.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))
    conn.execute("DELETE FROM labels WHERE board_id = ?", (board_id,))
    conn.execute(
        "UPDATE boards SET done_column_id = ? WHERE id = ?",
        (board.get("doneColumnId"), board_id),
    )

    for label in board.get("labels", []):
        conn.execute(
            "INSERT INTO labels (board_id, id, name, color) VALUES (?, ?, ?, ?)",
            (board_id, label["id"], label["name"].strip(), label["color"]),
        )

    for column_position, column in enumerate(board["columns"]):
        conn.execute(
            "INSERT INTO columns (board_id, id, title, position) VALUES (?, ?, ?, ?)",
            (board_id, column["id"], column["title"].strip(), column_position),
        )

        for card_position, card_id in enumerate(column["cardIds"]):
            card = board["cards"][card_id]
            conn.execute(
                """
                INSERT INTO cards
                  (board_id, id, column_id, title, details, priority, due_date, position)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    board_id,
                    card["id"],
                    column["id"],
                    card["title"].strip(),
                    card.get("details", ""),
                    card.get("priority", "medium"),
                    card.get("dueDate"),
                    card_position,
                ),
            )
            set_card_labels(conn, board_id, card["id"], card.get("labelIds", []))
            conn.executemany(
                """
                INSERT INTO checklist_items (board_id, id, card_id, text, done, position)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (board_id, item["id"], card["id"], item["text"].strip(), item["done"], index)
                    for index, item in enumerate(card.get("checklist", []))
                ],
            )

    prune_comments(conn, board_id)


def prune_comments(conn: sqlite3.Connection, board_id: int) -> None:
    conn.execute(
        """
        DELETE FROM comments WHERE board_id = ?
          AND card_id NOT IN (SELECT id FROM cards WHERE board_id = ?)
        """,
        (board_id, board_id),
    )


def set_card_labels(
    conn: sqlite3.Connection, board_id: int, card_id: str, label_ids: list[str]
) -> None:
    conn.execute(
        "DELETE FROM card_labels WHERE board_id = ? AND card_id = ?", (board_id, card_id)
    )
    conn.executemany(
        "INSERT INTO card_labels (board_id, card_id, label_id) VALUES (?, ?, ?)",
        [(board_id, card_id, label_id) for label_id in label_ids],
    )


def reindex_columns(conn: sqlite3.Connection, board_id: int) -> None:
    rows = conn.execute(
        "SELECT id FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()
    for position, row in enumerate(rows):
        conn.execute(
            "UPDATE columns SET position = ? WHERE board_id = ? AND id = ?",
            (position, board_id, row["id"]),
        )


def reindex_cards(conn: sqlite3.Connection, board_id: int, column_id: str) -> None:
    rows = conn.execute(
        "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position",
        (board_id, column_id),
    ).fetchall()
    for position, row in enumerate(rows):
        conn.execute(
            "UPDATE cards SET position = ? WHERE board_id = ? AND id = ?",
            (position, board_id, row["id"]),
        )
