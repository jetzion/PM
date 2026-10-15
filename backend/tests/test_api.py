from fastapi.testclient import TestClient

from database import get_connection, init_database
from main import app


def column(board, column_id):
    return next(c for c in board["columns"] if c["id"] == column_id)


def test_missing_db_is_created_with_demo_user(db_path):
    assert not db_path.exists()
    init_database()

    assert db_path.exists()
    conn = get_connection()
    usernames = [row["username"] for row in conn.execute("SELECT username FROM users")]
    conn.close()
    assert usernames == ["user"]


def test_second_startup_does_not_duplicate_seed_data(db_path):
    init_database()
    init_database()

    conn = get_connection()
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 1
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 7
    conn.close()


def test_new_user_starts_with_demo_board(client, board_url):
    board = client.get(board_url).json()

    assert [c["title"] for c in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert board["columns"][0]["cardIds"] == ["card-1", "card-2"]
    assert board["cards"]["card-1"]["title"] == "Align roadmap themes"


def test_column_lifecycle(client, board_url):
    created = client.post(f"{board_url}/columns", json={"title": "Blocked"}).json()
    blocked = created["columns"][-1]
    assert blocked["title"] == "Blocked"

    renamed = client.patch(
        f"{board_url}/columns/{blocked['id']}", json={"title": "Risks"}
    ).json()
    assert renamed["columns"][-1]["title"] == "Risks"

    deleted = client.delete(f"{board_url}/columns/{blocked['id']}").json()
    assert all(c["id"] != blocked["id"] for c in deleted["columns"])


def test_column_errors(client, board_url):
    assert client.post(f"{board_url}/columns", json={"title": "  "}).status_code == 400
    assert (
        client.patch(f"{board_url}/columns/col-missing", json={"title": "X"}).status_code
        == 404
    )
    assert client.delete(f"{board_url}/columns/col-missing").status_code == 404


def test_deleting_column_deletes_its_cards(client, board_url):
    board = client.delete(f"{board_url}/columns/col-backlog").json()

    assert all(c["id"] != "col-backlog" for c in board["columns"])
    assert "card-1" not in board["cards"]
    assert "card-2" not in board["cards"]


def test_card_lifecycle_and_move(client, board_url):
    created = client.post(
        f"{board_url}/cards",
        json={"columnId": "col-backlog", "title": "API card", "details": "From a test."},
    ).json()
    card_id = created["columns"][0]["cardIds"][-1]
    assert created["cards"][card_id]["title"] == "API card"

    updated = client.patch(
        f"{board_url}/cards/{card_id}",
        json={"title": "Updated API card", "details": "Updated details."},
    ).json()
    assert updated["cards"][card_id] == {
        "id": card_id,
        "title": "Updated API card",
        "details": "Updated details.",
        "priority": "medium",
        "dueDate": None,
        "labelIds": [],
        "checklist": [],
        "commentCount": 0,
    }

    moved = client.post(
        f"{board_url}/cards/{card_id}/move",
        json={"columnId": "col-review", "position": 0},
    ).json()
    assert column(moved, "col-review")["cardIds"] == [card_id, "card-6"]
    assert column(moved, "col-backlog")["cardIds"] == ["card-1", "card-2"]

    deleted = client.delete(f"{board_url}/cards/{card_id}").json()
    assert card_id not in deleted["cards"]
    assert column(deleted, "col-review")["cardIds"] == ["card-6"]


def test_card_errors(client, board_url):
    missing_column = {"columnId": "col-missing", "title": "X"}
    assert client.post(f"{board_url}/cards", json=missing_column).status_code == 404
    blank = {"columnId": "col-backlog", "title": " "}
    assert client.post(f"{board_url}/cards", json=blank).status_code == 400
    assert client.patch(f"{board_url}/cards/nope", json={"title": "X"}).status_code == 404
    assert client.patch(f"{board_url}/cards/card-1", json={"title": ""}).status_code == 400
    assert client.delete(f"{board_url}/cards/nope").status_code == 404
    move = {"columnId": "col-review", "position": 0}
    assert client.post(f"{board_url}/cards/nope/move", json=move).status_code == 404
    bad_column = {"columnId": "col-missing", "position": 0}
    assert client.post(f"{board_url}/cards/card-1/move", json=bad_column).status_code == 404
    negative = {"columnId": "col-review", "position": -1}
    assert client.post(f"{board_url}/cards/card-1/move", json=negative).status_code == 400


def test_empty_card_patch_returns_board_unchanged(client, board_url):
    before = client.get(board_url).json()
    assert client.patch(f"{board_url}/cards/card-1", json={}).json() == before


def test_move_reorders_within_a_column(client, board_url):
    moved = client.post(
        f"{board_url}/cards/card-1/move", json={"columnId": "col-backlog", "position": 1}
    ).json()
    assert column(moved, "col-backlog")["cardIds"] == ["card-2", "card-1"]

    back = client.post(
        f"{board_url}/cards/card-1/move", json={"columnId": "col-backlog", "position": 0}
    ).json()
    assert column(back, "col-backlog")["cardIds"] == ["card-1", "card-2"]


def test_move_clamps_position_and_keeps_positions_contiguous(client, board_url):
    moved = client.post(
        f"{board_url}/cards/card-4/move", json={"columnId": "col-done", "position": 99}
    ).json()
    assert column(moved, "col-done")["cardIds"] == ["card-7", "card-8", "card-4"]
    assert column(moved, "col-progress")["cardIds"] == ["card-5"]

    conn = get_connection()
    rows = conn.execute(
        "SELECT board_id, column_id, position FROM cards ORDER BY board_id, column_id, position"
    ).fetchall()
    conn.close()
    by_column: dict[tuple, list[int]] = {}
    for row in rows:
        by_column.setdefault((row["board_id"], row["column_id"]), []).append(row["position"])
    assert all(positions == list(range(len(positions))) for positions in by_column.values())


def test_put_board_replaces_the_whole_board(client, board_url):
    replacement = {
        "doneColumnId": "col-only",
        "labels": [],
        "columns": [{"id": "col-only", "title": "Only", "cardIds": ["card-only"]}],
        "cards": {
            "card-only": {
                "id": "card-only",
                "title": "Only card",
                "details": "Replaced.",
                "priority": "high",
                "dueDate": "2026-11-01",
                "labelIds": [],
                "checklist": [],
                "commentCount": 0,
            }
        },
    }

    assert client.put(board_url, json=replacement).json() == replacement
    assert client.get(board_url).json() == replacement


def test_put_board_rejects_invalid_board_without_changing_db(client, board_url):
    before = client.get(board_url).json()
    invalid_boards = [
        {"columns": [{"id": "c", "title": "C", "cardIds": ["missing"]}], "cards": {}},
        {
            "columns": [{"id": "c", "title": "C", "cardIds": []}, {"id": "c", "title": "D", "cardIds": []}],
            "cards": {},
        },
        {"columns": [{"id": "c", "title": " ", "cardIds": []}], "cards": {}},
        {
            "columns": [{"id": "c", "title": "C", "cardIds": []}],
            "cards": {"x": {"id": "x", "title": "Orphan", "details": ""}},
        },
    ]
    for invalid in invalid_boards:
        assert client.put(board_url, json=invalid).status_code == 400

    assert client.get(board_url).json() == before


def test_board_persists_between_clients(make_client):
    first = make_client("persist")
    board_url = f"/api/boards/{first.get('/api/boards').json()[0]['id']}"
    first.patch(f"{board_url}/columns/col-backlog", json={"title": "Persisted"})

    second = make_client()
    second.post("/api/auth/login", json={"username": "persist", "password": "correct-horse"})
    assert second.get(board_url).json()["columns"][0]["title"] == "Persisted"


def test_board_routes_require_sign_in():
    with TestClient(app) as anonymous:
        assert anonymous.get("/api/boards").status_code == 401
        assert anonymous.get("/api/boards/1").status_code == 401
        assert anonymous.post("/api/boards", json={"name": "X"}).status_code == 401
        assert anonymous.post("/api/boards/1/columns", json={"title": "X"}).status_code == 401
