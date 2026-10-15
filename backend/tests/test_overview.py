def set_due(client, board_url, card_id, due_date, **fields):
    response = client.patch(f"{board_url}/cards/{card_id}", json={"dueDate": due_date, **fields})
    assert response.status_code == 200


def test_overview_summarizes_each_board(client, board_url):
    client.post("/api/boards", json={"name": "Empty"})
    set_due(client, board_url, "card-1", "2026-10-01")
    set_due(client, board_url, "card-2", "2026-10-14")
    set_due(client, board_url, "card-3", "2026-10-15")

    data = client.get("/api/overview", params={"today": "2026-10-15"}).json()

    assert data["today"] == "2026-10-15"
    studio, empty = data["boards"]
    assert studio["name"] == "Kanban Studio"
    assert studio["cardCount"] == 8
    assert studio["overdueCount"] == 2
    assert studio["doneCount"] == 2
    assert studio["priorities"] == {"low": 3, "medium": 3, "high": 2}
    assert empty == {
        "id": empty["id"],
        "name": "Empty",
        "cardCount": 0,
        "overdueCount": 0,
        "doneCount": 0,
        "priorities": {"low": 0, "medium": 0, "high": 0},
    }


def test_due_soon_lists_overdue_and_next_seven_days_in_date_order(client, board_url):
    set_due(client, board_url, "card-5", "2026-10-22")  # today + 7: included
    set_due(client, board_url, "card-6", "2026-10-23")  # today + 8: excluded
    set_due(client, board_url, "card-2", "2026-09-01")  # overdue
    set_due(client, board_url, "card-1", "2026-10-15")  # today

    due = client.get("/api/overview", params={"today": "2026-10-15"}).json()["dueSoon"]

    assert [item["cardId"] for item in due] == ["card-2", "card-1", "card-5"]
    assert due[0] == {
        "boardId": int(board_url.rsplit("/", 1)[1]),
        "boardName": "Kanban Studio",
        "cardId": "card-2",
        "title": "Gather customer signals",
        "dueDate": "2026-09-01",
        "priority": "medium",
        "columnTitle": "Backlog",
    }


def test_due_soon_spans_boards_and_is_capped(client, board_url):
    other = client.post("/api/boards", json={"name": "Other"}).json()
    other_url = f"/api/boards/{other['id']}"
    for index in range(25):
        client.post(
            f"{other_url}/cards",
            json={"columnId": "col-todo", "title": f"Task {index:02d}", "dueDate": "2026-10-16"},
        )
    set_due(client, board_url, "card-1", "2026-10-02")

    due = client.get("/api/overview", params={"today": "2026-10-15"}).json()["dueSoon"]

    assert len(due) == 20
    assert due[0]["boardName"] == "Kanban Studio"
    assert {item["boardName"] for item in due[1:]} == {"Other"}


def test_overview_defaults_today_and_validates_it(client):
    from datetime import date

    assert client.get("/api/overview").json()["today"] == date.today().isoformat()
    assert client.get("/api/overview", params={"today": "yesterday"}).status_code == 400


def test_overview_only_includes_own_boards(make_client):
    owner = make_client("ov-owner")
    other = make_client("ov-other")
    board_url = f"/api/boards/{owner.get('/api/boards').json()[0]['id']}"
    owner.patch(f"{board_url}/cards/card-1", json={"dueDate": "2026-01-01"})

    data = other.get("/api/overview", params={"today": "2026-10-15"}).json()

    assert len(data["boards"]) == 1
    assert data["dueSoon"] == []
    assert make_client().get("/api/overview").status_code == 401


def test_done_cards_are_never_overdue_or_due_soon(client, board_url):
    set_due(client, board_url, "card-7", "2026-09-01")  # in the Done column
    set_due(client, board_url, "card-4", "2026-09-02")

    data = client.get("/api/overview", params={"today": "2026-10-15"}).json()
    assert data["boards"][0]["overdueCount"] == 1
    assert [item["cardId"] for item in data["dueSoon"]] == ["card-4"]

    # With no done column, the same card is overdue again.
    client.put(f"{board_url}/done-column", json={"columnId": None})
    data = client.get("/api/overview", params={"today": "2026-10-15"}).json()
    assert data["boards"][0]["overdueCount"] == 2
    assert data["boards"][0]["doneCount"] == 0
    assert [item["cardId"] for item in data["dueSoon"]] == ["card-7", "card-4"]
