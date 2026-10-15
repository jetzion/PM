import sqlite3

from database import get_connection, init_database

LEGACY_SCHEMA = """
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);
CREATE TABLE columns (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_columns_user_position ON columns (user_id, position);
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  column_id TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
);
CREATE INDEX idx_cards_column_position ON cards (column_id, position);
INSERT INTO users (id, username, password) VALUES (1, 'user', 'password');
INSERT INTO columns VALUES ('col-a', 1, 'Saved column', 0);
INSERT INTO columns VALUES ('col-b', 1, 'Second', 1);
INSERT INTO cards VALUES ('card-x', 'col-a', 'Saved card', 'Kept', 0);
INSERT INTO cards VALUES ('card-y', 'col-b', 'Other', '', 0);
"""


def test_legacy_single_board_database_is_migrated(db_path, make_client):
    legacy = sqlite3.connect(db_path)
    legacy.executescript(LEGACY_SCHEMA)
    legacy.close()

    init_database()

    client = make_client()
    login = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert login.status_code == 200

    boards = client.get("/api/boards").json()
    assert [b["name"] for b in boards] == ["Kanban Studio"]
    board = client.get(f"/api/boards/{boards[0]['id']}").json()
    assert board == {
        "doneColumnId": None,
        "labels": [],
        "columns": [
            {"id": "col-a", "title": "Saved column", "cardIds": ["card-x"]},
            {"id": "col-b", "title": "Second", "cardIds": ["card-y"]},
        ],
        "cards": {
            "card-x": {
                "id": "card-x",
                "title": "Saved card",
                "details": "Kept",
                "priority": "medium",
                "dueDate": None,
                "labelIds": [],
                "checklist": [],
                "commentCount": 0,
            },
            "card-y": {
                "id": "card-y",
                "title": "Other",
                "details": "",
                "priority": "medium",
                "dueDate": None,
                "labelIds": [],
                "checklist": [],
                "commentCount": 0,
            },
        },
    }

    conn = get_connection()
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert not any(name.startswith("legacy_") for name in tables)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 7
    conn.close()


def test_v1_database_gains_card_fields_and_labels(db_path, make_client):
    v1 = sqlite3.connect(db_path)
    v1.executescript(
        """
        CREATE TABLE cards (
          board_id INTEGER NOT NULL, id TEXT NOT NULL, column_id TEXT NOT NULL,
          title TEXT NOT NULL, details TEXT NOT NULL, position INTEGER NOT NULL,
          PRIMARY KEY (board_id, id)
        );
        INSERT INTO cards VALUES (1, 'card-old', 'col-a', 'Old card', '', 0);
        PRAGMA user_version = 1;
        """
    )
    v1.close()

    init_database()

    conn = get_connection()
    row = conn.execute("SELECT priority, due_date FROM cards WHERE id = 'card-old'").fetchone()
    assert (row["priority"], row["due_date"]) == ("medium", None)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"labels", "card_labels"} <= tables
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 7
    conn.close()
