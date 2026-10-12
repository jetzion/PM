import os

from fastapi.testclient import TestClient

from database import init_database
from main import app


def make_client(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "test.db"))
    return TestClient(app)


def test_missing_db_is_created_and_seeded(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))

    assert not db_path.exists()
    init_database()

    assert db_path.exists()
    with TestClient(app) as client:
        board = client.get("/api/board").json()

    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert board["columns"][0]["cardIds"] == ["card-1", "card-2"]
    assert board["cards"]["card-1"]["title"] == "Align roadmap themes"


def test_second_startup_does_not_duplicate_seed_data(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    with client:
        first_board = client.get("/api/board").json()

    init_database()

    with TestClient(app) as client:
        second_board = client.get("/api/board").json()

    assert len(second_board["columns"]) == len(first_board["columns"])
    assert len(second_board["cards"]) == len(first_board["cards"])


def test_column_lifecycle(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    with client:
        created = client.post("/api/columns", json={"title": "Blocked"}).json()
        blocked = created["columns"][-1]
        assert blocked["title"] == "Blocked"

        renamed = client.patch(
            f"/api/columns/{blocked['id']}", json={"title": "Risks"}
        ).json()
        assert renamed["columns"][-1]["title"] == "Risks"

        deleted = client.delete(f"/api/columns/{blocked['id']}").json()
        assert all(column["id"] != blocked["id"] for column in deleted["columns"])


def test_deleting_column_deletes_its_cards(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    with client:
        board = client.delete("/api/columns/col-backlog").json()

    assert all(column["id"] != "col-backlog" for column in board["columns"])
    assert "card-1" not in board["cards"]
    assert "card-2" not in board["cards"]


def test_card_lifecycle_and_move(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    with client:
        created = client.post(
            "/api/cards",
            json={
                "columnId": "col-backlog",
                "title": "API card",
                "details": "Created by a test.",
            },
        ).json()
        card_id = created["columns"][0]["cardIds"][-1]
        assert created["cards"][card_id]["title"] == "API card"

        updated = client.patch(
            f"/api/cards/{card_id}",
            json={"title": "Updated API card", "details": "Updated details."},
        ).json()
        assert updated["cards"][card_id]["title"] == "Updated API card"

        moved = client.post(
            f"/api/cards/{card_id}/move",
            json={"columnId": "col-review", "position": 0},
        ).json()
        review = next(column for column in moved["columns"] if column["id"] == "col-review")
        assert review["cardIds"][0] == card_id

        deleted = client.delete(f"/api/cards/{card_id}").json()
        assert card_id not in deleted["cards"]


def test_put_board_replaces_the_whole_board(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    replacement = {
        "columns": [{"id": "col-only", "title": "Only", "cardIds": ["card-only"]}],
        "cards": {
            "card-only": {
                "id": "card-only",
                "title": "Only card",
                "details": "Replacement board.",
            }
        },
    }

    with client:
        board = client.put("/api/board", json=replacement).json()
        persisted = client.get("/api/board").json()

    assert board == replacement
    assert persisted == replacement


def test_put_board_rejects_invalid_board_without_changing_db(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    invalid = {
        "columns": [{"id": "col-only", "title": "Only", "cardIds": ["missing-card"]}],
        "cards": {},
    }

    with client:
        before = client.get("/api/board").json()
        response = client.put("/api/board", json=invalid)
        after = client.get("/api/board").json()

    assert response.status_code == 400
    assert after == before


def test_container_db_path_can_persist_between_clients(tmp_path, monkeypatch):
    db_path = tmp_path / "persistent.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))

    with TestClient(app) as client:
        client.patch("/api/columns/col-backlog", json={"title": "Persisted"})

    with TestClient(app) as client:
        board = client.get("/api/board").json()

    assert board["columns"][0]["title"] == "Persisted"
    assert os.path.exists(db_path)
