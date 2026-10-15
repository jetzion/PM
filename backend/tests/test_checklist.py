import json


def checklist(board, card_id="card-1"):
    return board["cards"][card_id]["checklist"]


def test_demo_card_has_a_checklist(client, board_url):
    board = client.get(board_url).json()
    assert checklist(board, "card-5") == [
        {"id": "item-1", "text": "Pick a spacing scale", "done": True},
        {"id": "item-2", "text": "Review with design", "done": False},
    ]
    assert checklist(board) == []


def test_checklist_lifecycle(client, board_url):
    url = f"{board_url}/cards/card-1/checklist"

    client.post(url, json={"text": " Draft themes "})
    board = client.post(url, json={"text": "Share with leads"}).json()
    first, second = checklist(board)
    assert (first["text"], first["done"], second["text"]) == ("Draft themes", False, "Share with leads")

    board = client.patch(f"{url}/{first['id']}", json={"done": True}).json()
    assert checklist(board)[0]["done"] is True
    board = client.patch(f"{url}/{first['id']}", json={"text": "Draft the themes"}).json()
    assert checklist(board)[0] == {"id": first["id"], "text": "Draft the themes", "done": True}

    board = client.delete(f"{url}/{first['id']}").json()
    assert [item["id"] for item in checklist(board)] == [second["id"]]

    # Positions stay contiguous, so a new item lands after the remaining one.
    board = client.post(url, json={"text": "Third"}).json()
    assert [item["text"] for item in checklist(board)] == ["Share with leads", "Third"]


def test_checklist_errors(client, board_url):
    url = f"{board_url}/cards/card-1/checklist"
    assert client.post(url, json={"text": "  "}).status_code == 400
    assert client.post(f"{board_url}/cards/nope/checklist", json={"text": "X"}).status_code == 404
    assert client.patch(f"{url}/nope", json={"done": True}).status_code == 404
    assert client.delete(f"{url}/nope").status_code == 404
    # An item is addressed through its own card only.
    assert client.patch(f"{board_url}/cards/card-1/checklist/item-1", json={"done": False}).status_code == 404
    assert client.patch(f"{board_url}/cards/card-5/checklist/item-1", json={"text": " "}).status_code == 400


def test_checklist_follows_card_moves_and_deletes(client, board_url):
    board = client.post(
        f"{board_url}/cards/card-5/move", json={"columnId": "col-done", "position": 0}
    ).json()
    assert len(checklist(board, "card-5")) == 2

    client.delete(f"{board_url}/cards/card-5")
    from database import get_connection

    conn = get_connection()
    board_id = int(board_url.rsplit("/", 1)[1])
    left = conn.execute(
        "SELECT COUNT(*) FROM checklist_items WHERE board_id = ?", (board_id,)
    ).fetchone()[0]
    conn.close()
    assert left == 0


def test_put_board_round_trips_and_validates_checklists(client, board_url):
    board = client.get(board_url).json()
    assert client.put(board_url, json=board).json() == board

    for mutate in (
        lambda b: b["cards"]["card-1"]["checklist"].append({"id": "item-1", "text": "Dup", "done": False}),
        lambda b: b["cards"]["card-5"]["checklist"][0].update(text=" "),
    ):
        candidate = json.loads(json.dumps(board))
        mutate(candidate)
        assert client.put(board_url, json=candidate).status_code == 400
    assert client.get(board_url).json() == board


def test_ai_can_check_items(mock_openrouter, client, board_url):
    board = client.get(board_url).json()
    board["cards"]["card-5"]["checklist"][1]["done"] = True
    board["cards"]["card-2"]["checklist"] = [{"id": "item-ai", "text": "Tag tickets", "done": False}]
    mock_openrouter(json.dumps({"message": "Done.", "board": board}))

    saved = client.post(f"{board_url}/chat", json={"message": "Check it off"}).json()["board"]

    assert all(item["done"] for item in checklist(saved, "card-5"))
    assert checklist(saved, "card-2")[0]["text"] == "Tag tickets"


def test_intruders_cannot_touch_checklists(make_client):
    owner = make_client("check-owner")
    intruder = make_client("check-intruder")
    url = f"/api/boards/{owner.get('/api/boards').json()[0]['id']}/cards/card-5/checklist"

    assert intruder.post(url, json={"text": "X"}).status_code == 404
    assert intruder.patch(f"{url}/item-1", json={"done": False}).status_code == 404
    assert intruder.delete(f"{url}/item-1").status_code == 404
