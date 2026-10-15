import json


def test_create_card_with_priority_and_due_date(client, board_url):
    board = client.post(
        f"{board_url}/cards",
        json={
            "columnId": "col-backlog",
            "title": "Urgent",
            "priority": "high",
            "dueDate": "2026-12-01",
        },
    ).json()
    card_id = board["columns"][0]["cardIds"][-1]

    assert board["cards"][card_id]["priority"] == "high"
    assert board["cards"][card_id]["dueDate"] == "2026-12-01"


def test_new_cards_default_to_medium_without_due_date(client, board_url):
    board = client.post(
        f"{board_url}/cards", json={"columnId": "col-backlog", "title": "Plain"}
    ).json()
    card = board["cards"][board["columns"][0]["cardIds"][-1]]

    assert (card["priority"], card["dueDate"]) == ("medium", None)


def test_demo_cards_carry_priorities(client, board_url):
    cards = client.get(board_url).json()["cards"]
    assert cards["card-1"]["priority"] == "high"
    assert cards["card-4"]["priority"] == "low"
    assert all(card["dueDate"] is None for card in cards.values())


def test_update_priority_and_due_date(client, board_url):
    url = f"{board_url}/cards/card-1"

    card = client.patch(url, json={"priority": "low", "dueDate": "2026-10-20"}).json()["cards"]["card-1"]
    assert (card["priority"], card["dueDate"]) == ("low", "2026-10-20")

    # Omitting dueDate keeps it.
    card = client.patch(url, json={"title": "Renamed"}).json()["cards"]["card-1"]
    assert (card["title"], card["dueDate"]) == ("Renamed", "2026-10-20")

    # An explicit null clears it.
    card = client.patch(url, json={"dueDate": None}).json()["cards"]["card-1"]
    assert card["dueDate"] is None
    assert card["priority"] == "low"


def test_rejects_invalid_priority_and_dates(client, board_url):
    create = {"columnId": "col-backlog", "title": "X"}
    assert client.post(f"{board_url}/cards", json={**create, "priority": "urgent"}).status_code == 422
    for bad in ["tomorrow", "2026-02-30", "2026-1-5", "20261015"]:
        response = client.post(f"{board_url}/cards", json={**create, "dueDate": bad})
        assert response.status_code == 400, bad
        assert response.json()["detail"] == "Due date must be a YYYY-MM-DD date"
        assert client.patch(f"{board_url}/cards/card-1", json={"dueDate": bad}).status_code == 400
    assert client.patch(f"{board_url}/cards/card-1", json={"priority": "nope"}).status_code == 422


def test_put_board_validates_card_fields(client, board_url):
    before = client.get(board_url).json()

    for field, value in [("priority", "critical"), ("dueDate", "soon")]:
        board = json.loads(json.dumps(before))
        board["cards"]["card-1"][field] = value
        assert client.put(board_url, json=board).status_code in (400, 422)

    assert client.get(board_url).json() == before


def test_moving_a_card_keeps_its_fields(client, board_url):
    client.patch(f"{board_url}/cards/card-1", json={"priority": "high", "dueDate": "2026-11-11"})
    board = client.post(
        f"{board_url}/cards/card-1/move", json={"columnId": "col-done", "position": 0}
    ).json()
    card = board["cards"]["card-1"]
    assert (card["priority"], card["dueDate"]) == ("high", "2026-11-11")
