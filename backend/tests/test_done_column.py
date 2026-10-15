import json
import sqlite3

from database import get_connection, init_database


def test_new_boards_use_their_done_column(client, board_url):
    assert client.get(board_url).json()["doneColumnId"] == "col-done"
    created = client.post("/api/boards", json={"name": "Fresh"}).json()
    assert client.get(f"/api/boards/{created['id']}").json()["doneColumnId"] == "col-done"


def test_set_and_clear_the_done_column(client, board_url):
    url = f"{board_url}/done-column"

    assert client.put(url, json={"columnId": "col-review"}).json()["doneColumnId"] == "col-review"
    assert client.put(url, json={"columnId": None}).json()["doneColumnId"] is None
    assert client.put(url, json={"columnId": "col-missing"}).status_code == 404
    assert client.get(board_url).json()["doneColumnId"] is None


def test_deleting_the_done_column_clears_it(client, board_url):
    assert client.delete(f"{board_url}/columns/col-review").json()["doneColumnId"] == "col-done"
    assert client.delete(f"{board_url}/columns/col-done").json()["doneColumnId"] is None


def test_put_board_sets_and_validates_the_done_column(client, board_url):
    board = client.get(board_url).json()
    board["doneColumnId"] = "col-backlog"
    assert client.put(board_url, json=board).json()["doneColumnId"] == "col-backlog"

    board["doneColumnId"] = "col-ghost"
    assert client.put(board_url, json=board).status_code == 400
    assert client.get(board_url).json()["doneColumnId"] == "col-backlog"

    del board["doneColumnId"]
    assert client.put(board_url, json=board).json()["doneColumnId"] is None


def test_ai_can_change_the_done_column(mock_openrouter, client, board_url):
    board = client.get(board_url).json()
    board["doneColumnId"] = "col-review"
    mock_openrouter(json.dumps({"message": "Review is done now.", "board": board}))

    saved = client.post(f"{board_url}/chat", json={"message": "Treat review as done"}).json()

    assert saved["board"]["doneColumnId"] == "col-review"


def test_other_users_cannot_set_the_done_column(make_client):
    owner = make_client("done-owner")
    board_url = f"/api/boards/{owner.get('/api/boards').json()[0]['id']}"
    intruder = make_client("done-intruder")

    response = intruder.put(f"{board_url}/done-column", json={"columnId": None})

    assert response.status_code == 404
    assert owner.get(board_url).json()["doneColumnId"] == "col-done"


def test_v3_database_backfills_done_columns_by_title(db_path):
    v3 = sqlite3.connect(db_path)
    v3.executescript(
        """
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE boards (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE columns (board_id INTEGER, id TEXT, title TEXT, position INTEGER,
          PRIMARY KEY (board_id, id));
        INSERT INTO users (id, username, password_hash) VALUES (1, 'old', 'x');
        INSERT INTO boards (id, user_id, name) VALUES (1, 1, 'Has done'), (2, 1, 'No done');
        INSERT INTO columns VALUES (1, 'col-a', 'Todo', 0), (1, 'col-z', ' DONE ', 1);
        INSERT INTO columns VALUES (2, 'col-a', 'Todo', 0);
        PRAGMA user_version = 3;
        """
    )
    v3.close()

    init_database()
    conn = get_connection()
    done = dict(conn.execute("SELECT id, done_column_id FROM boards ORDER BY id").fetchall())
    conn.execute("UPDATE boards SET done_column_id = NULL WHERE id = 1")
    conn.commit()
    conn.close()
    assert done == {1: "col-z", 2: None}

    # The backfill runs once, at upgrade time; a cleared done column stays cleared.
    init_database()
    conn = get_connection()
    assert conn.execute("SELECT done_column_id FROM boards WHERE id = 1").fetchone()[0] is None
    conn.close()
