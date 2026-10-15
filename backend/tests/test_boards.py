def test_list_boards_returns_summaries(client):
    boards = client.get("/api/boards").json()

    assert len(boards) == 1
    assert boards[0]["name"] == "Kanban Studio"
    assert boards[0]["columnCount"] == 5
    assert boards[0]["cardCount"] == 8
    assert boards[0]["createdAt"]


def test_create_board_starts_with_empty_columns(client):
    response = client.post("/api/boards", json={"name": "  Launch plan  "})

    assert response.status_code == 201
    summary = response.json()
    assert summary["name"] == "Launch plan"
    assert summary["cardCount"] == 0

    board = client.get(f"/api/boards/{summary['id']}").json()
    assert [c["title"] for c in board["columns"]] == ["To Do", "In Progress", "Done"]
    assert board["cards"] == {}
    assert [b["name"] for b in client.get("/api/boards").json()] == [
        "Kanban Studio",
        "Launch plan",
    ]


def test_create_board_requires_a_name(client):
    assert client.post("/api/boards", json={"name": " "}).status_code == 400


def test_rename_board(client, board_url):
    response = client.patch(board_url, json={"name": "Renamed"})

    assert response.json()["name"] == "Renamed"
    assert client.get("/api/boards").json()[0]["name"] == "Renamed"
    assert client.patch(board_url, json={"name": ""}).status_code == 400


def test_delete_board_removes_its_columns_and_cards(client, board_url):
    from database import get_connection

    board_id = int(board_url.rsplit("/", 1)[1])
    assert client.delete(board_url).status_code == 204
    assert client.get("/api/boards").json() == []
    assert client.get(board_url).status_code == 404

    conn = get_connection()
    leftovers = conn.execute(
        "SELECT (SELECT COUNT(*) FROM columns WHERE board_id = ?)"
        " + (SELECT COUNT(*) FROM cards WHERE board_id = ?)",
        (board_id, board_id),
    ).fetchone()[0]
    conn.close()
    assert leftovers == 0


def test_boards_with_the_same_ids_are_independent(client, board_url):
    second = client.post("/api/boards", json={"name": "Second"}).json()
    second_url = f"/api/boards/{second['id']}"
    demo = client.get(board_url).json()

    # Same column and card ids as the first board must not collide.
    client.put(second_url, json=demo)
    client.patch(f"{second_url}/cards/card-1", json={"title": "Only on second"})
    client.delete(f"{second_url}/columns/col-done")

    first = client.get(board_url).json()
    assert first["cards"]["card-1"]["title"] == "Align roadmap themes"
    assert len(first["columns"]) == 5
    assert client.get(second_url).json()["cards"]["card-1"]["title"] == "Only on second"


def test_users_cannot_reach_each_others_boards(make_client):
    owner = make_client("owner")
    intruder = make_client("intruder")
    board_url = f"/api/boards/{owner.get('/api/boards').json()[0]['id']}"
    before = owner.get(board_url).json()

    attempts = [
        intruder.get(board_url),
        intruder.patch(board_url, json={"name": "Mine"}),
        intruder.delete(board_url),
        intruder.put(board_url, json={"columns": [], "cards": {}}),
        intruder.post(f"{board_url}/columns", json={"title": "X"}),
        intruder.patch(f"{board_url}/columns/col-backlog", json={"title": "X"}),
        intruder.delete(f"{board_url}/columns/col-backlog"),
        intruder.post(f"{board_url}/cards", json={"columnId": "col-backlog", "title": "X"}),
        intruder.patch(f"{board_url}/cards/card-1", json={"title": "X"}),
        intruder.delete(f"{board_url}/cards/card-1"),
        intruder.post(
            f"{board_url}/cards/card-1/move", json={"columnId": "col-done", "position": 0}
        ),
        intruder.post(f"{board_url}/chat", json={"message": "hi"}),
    ]

    assert [response.status_code for response in attempts] == [404] * len(attempts)
    assert owner.get(board_url).json() == before
    assert [b["name"] for b in owner.get("/api/boards").json()] == ["Kanban Studio"]
    assert len(intruder.get("/api/boards").json()) == 1
