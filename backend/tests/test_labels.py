import json


def label_named(board, name):
    return next(label for label in board["labels"] if label["name"] == name)


def test_new_users_get_demo_labels(client, board_url):
    board = client.get(board_url).json()

    assert board["labels"] == [
        {"id": "label-research", "name": "Research", "color": "blue"},
        {"id": "label-design", "name": "Design", "color": "purple"},
        {"id": "label-launch", "name": "Launch", "color": "yellow"},
    ]
    assert board["cards"]["card-3"]["labelIds"] == ["label-research", "label-design"]
    assert board["cards"]["card-4"]["labelIds"] == []


def test_new_boards_have_no_labels(client):
    created = client.post("/api/boards", json={"name": "Blank"}).json()
    assert client.get(f"/api/boards/{created['id']}").json()["labels"] == []


def test_label_lifecycle(client, board_url):
    board = client.post(f"{board_url}/labels", json={"name": " Bug ", "color": "navy"}).json()
    bug = label_named(board, "Bug")
    assert bug["color"] == "navy"
    assert board["labels"][-1] == bug

    board = client.patch(f"{board_url}/labels/{bug['id']}", json={"color": "gray"}).json()
    assert label_named(board, "Bug")["color"] == "gray"
    board = client.patch(f"{board_url}/labels/{bug['id']}", json={"name": "Defect"}).json()
    assert label_named(board, "Defect") == {"id": bug["id"], "name": "Defect", "color": "gray"}

    board = client.delete(f"{board_url}/labels/{bug['id']}").json()
    assert all(label["id"] != bug["id"] for label in board["labels"])


def test_label_errors(client, board_url):
    assert client.post(f"{board_url}/labels", json={"name": " ", "color": "blue"}).status_code == 400
    assert client.post(f"{board_url}/labels", json={"name": "X", "color": "pink"}).status_code == 422
    assert client.patch(f"{board_url}/labels/label-design", json={"name": ""}).status_code == 400
    assert client.patch(f"{board_url}/labels/nope", json={"name": "X"}).status_code == 404
    assert client.delete(f"{board_url}/labels/nope").status_code == 404


def test_deleting_a_label_removes_it_from_cards(client, board_url):
    board = client.delete(f"{board_url}/labels/label-research").json()

    assert board["cards"]["card-2"]["labelIds"] == []
    assert board["cards"]["card-3"]["labelIds"] == ["label-design"]


def test_cards_take_labels_on_create_and_update(client, board_url):
    board = client.post(
        f"{board_url}/cards",
        json={"columnId": "col-backlog", "title": "Tagged", "labelIds": ["label-launch", "label-design"]},
    ).json()
    card_id = board["columns"][0]["cardIds"][-1]
    # Returned in board label order, not request order.
    assert board["cards"][card_id]["labelIds"] == ["label-design", "label-launch"]

    url = f"{board_url}/cards/{card_id}"
    assert client.patch(url, json={"title": "Still tagged"}).json()["cards"][card_id]["labelIds"] == [
        "label-design",
        "label-launch",
    ]
    assert client.patch(url, json={"labelIds": ["label-research"]}).json()["cards"][card_id][
        "labelIds"
    ] == ["label-research"]
    assert client.patch(url, json={"labelIds": []}).json()["cards"][card_id]["labelIds"] == []


def test_card_label_errors(client, board_url):
    create = {"columnId": "col-backlog", "title": "X"}
    for label_ids in (["label-missing"], ["label-design", "label-design"]):
        assert client.post(f"{board_url}/cards", json={**create, "labelIds": label_ids}).status_code == 400
        assert client.patch(f"{board_url}/cards/card-1", json={"labelIds": label_ids}).status_code == 400
    assert client.patch(f"{board_url}/cards/nope", json={"labelIds": []}).status_code == 404


def test_labels_survive_moves_and_column_deletes_clean_up(client, board_url):
    board = client.post(
        f"{board_url}/cards/card-3/move", json={"columnId": "col-done", "position": 0}
    ).json()
    assert board["cards"]["card-3"]["labelIds"] == ["label-research", "label-design"]

    client.delete(f"{board_url}/columns/col-done")
    from database import get_connection

    conn = get_connection()
    board_id = int(board_url.rsplit("/", 1)[1])
    orphans = conn.execute(
        "SELECT COUNT(*) FROM card_labels"
        " WHERE board_id = ? AND card_id IN ('card-3', 'card-7', 'card-8')",
        (board_id,),
    ).fetchone()[0]
    conn.close()
    assert orphans == 0


def test_labels_are_per_board(client, board_url):
    other = client.post("/api/boards", json={"name": "Other"}).json()
    other_url = f"/api/boards/{other['id']}"

    response = client.post(
        f"{other_url}/cards",
        json={"columnId": "col-todo", "title": "X", "labelIds": ["label-design"]},
    )
    assert response.status_code == 400
    assert client.delete(f"{other_url}/labels/label-design").status_code == 404
    assert len(client.get(board_url).json()["labels"]) == 3


def test_put_board_round_trips_and_validates_labels(client, board_url):
    board = client.get(board_url).json()
    assert client.put(board_url, json=board).json() == board

    bad_boards = []
    for mutate in (
        lambda b: b["labels"].append(dict(b["labels"][0])),
        lambda b: b["labels"][0].update(name=" "),
        lambda b: b["labels"][0].update(color="pink"),
        lambda b: b["cards"]["card-4"]["labelIds"].append("label-ghost"),
        lambda b: b["cards"]["card-1"]["labelIds"].append("label-launch"),
    ):
        candidate = json.loads(json.dumps(board))
        mutate(candidate)
        bad_boards.append(candidate)

    for candidate in bad_boards:
        assert client.put(board_url, json=candidate).status_code in (400, 422)
    assert client.get(board_url).json() == board


def test_put_board_without_labels_clears_them(client, board_url):
    board = client.get(board_url).json()
    del board["labels"]
    for card in board["cards"].values():
        card["labelIds"] = []

    assert client.put(board_url, json=board).json()["labels"] == []


def test_ai_can_add_labels(mock_openrouter, client, board_url):
    board = client.get(board_url).json()
    board["labels"].append({"id": "label-ai", "name": "Blocked", "color": "gray"})
    board["cards"]["card-4"]["labelIds"] = ["label-ai"]
    mock_openrouter(json.dumps({"message": "Labeled.", "board": board}))

    saved = client.post(f"{board_url}/chat", json={"message": "Mark card 4 blocked"}).json()["board"]

    assert saved["cards"]["card-4"]["labelIds"] == ["label-ai"]
    assert saved["labels"][-1]["name"] == "Blocked"


def test_intruders_cannot_touch_labels(make_client):
    owner = make_client("label-owner")
    intruder = make_client("label-intruder")
    board_url = f"/api/boards/{owner.get('/api/boards').json()[0]['id']}"

    assert intruder.post(f"{board_url}/labels", json={"name": "X", "color": "blue"}).status_code == 404
    assert intruder.patch(f"{board_url}/labels/label-design", json={"name": "X"}).status_code == 404
    assert intruder.delete(f"{board_url}/labels/label-design").status_code == 404
