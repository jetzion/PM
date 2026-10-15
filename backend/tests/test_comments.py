import json

from database import get_connection


def comment_count(client, board_url, card_id):
    return client.get(board_url).json()["cards"][card_id]["commentCount"]


def test_comment_lifecycle(client, board_url):
    url = f"{board_url}/cards/card-1/comments"
    assert client.get(url).json() == []

    response = client.post(url, json={"body": "  First thought  "})
    assert response.status_code == 201
    [first] = response.json()
    assert (first["body"], first["author"]) == ("First thought", "alice")
    assert first["createdAt"].endswith("Z")

    comments = client.post(url, json={"body": "Second"}).json()
    assert [c["body"] for c in comments] == ["First thought", "Second"]
    assert comment_count(client, board_url, "card-1") == 2
    assert comment_count(client, board_url, "card-2") == 0

    remaining = client.delete(f"{url}/{first['id']}").json()
    assert [c["body"] for c in remaining] == ["Second"]
    assert client.get(url).json() == remaining


def test_comment_errors(client, board_url):
    url = f"{board_url}/cards/card-1/comments"
    assert client.post(url, json={"body": " "}).status_code == 400
    assert client.get(f"{board_url}/cards/nope/comments").status_code == 404
    assert client.post(f"{board_url}/cards/nope/comments", json={"body": "X"}).status_code == 404
    assert client.delete(f"{url}/comment-nope").status_code == 404

    # A comment is addressed through its own card only.
    comment_id = client.post(url, json={"body": "Mine"}).json()[0]["id"]
    assert client.delete(f"{board_url}/cards/card-2/comments/{comment_id}").status_code == 404


def test_comments_survive_board_replacement_and_moves(mock_openrouter, client, board_url):
    client.post(f"{board_url}/cards/card-1/comments", json={"body": "Keep me"})
    client.post(f"{board_url}/cards/card-1/move", json={"columnId": "col-done", "position": 0})

    board = client.get(board_url).json()
    board["cards"]["card-1"]["title"] = "Retitled by AI"
    mock_openrouter(json.dumps({"message": "Renamed.", "board": board}))
    client.post(f"{board_url}/chat", json={"message": "Rename card 1"})
    client.put(board_url, json=client.get(board_url).json())

    assert [c["body"] for c in client.get(f"{board_url}/cards/card-1/comments").json()] == ["Keep me"]


def test_comments_are_pruned_with_their_card(client, board_url):
    for card_id in ("card-1", "card-2", "card-3", "card-4"):
        client.post(f"{board_url}/cards/{card_id}/comments", json={"body": "Note"})

    client.delete(f"{board_url}/cards/card-1")
    client.delete(f"{board_url}/columns/col-discovery")  # holds card-3
    board = client.get(board_url).json()
    del board["cards"]["card-4"]
    board["columns"][1]["cardIds"].remove("card-4")  # In Progress, now at index 1
    assert client.put(board_url, json=board).status_code == 200

    board_id = int(board_url.rsplit("/", 1)[1])
    conn = get_connection()
    left = [
        row[0]
        for row in conn.execute("SELECT card_id FROM comments WHERE board_id = ?", (board_id,))
    ]
    conn.close()
    assert left == ["card-2"]


def test_duplicated_boards_do_not_copy_comments(client, board_url):
    client.post(f"{board_url}/cards/card-1/comments", json={"body": "Original only"})
    copy = client.post(f"{board_url}/duplicate", json={"name": "Copy"}).json()

    copy_url = f"/api/boards/{copy['id']}"
    assert client.get(f"{copy_url}/cards/card-1/comments").json() == []
    assert comment_count(client, copy_url, "card-1") == 0


def test_intruders_cannot_read_or_write_comments(make_client):
    owner = make_client("comment-owner")
    board_url = f"/api/boards/{owner.get('/api/boards').json()[0]['id']}"
    comment_id = owner.post(
        f"{board_url}/cards/card-1/comments", json={"body": "Private"}
    ).json()[0]["id"]
    intruder = make_client("comment-intruder")
    url = f"{board_url}/cards/card-1/comments"

    assert intruder.get(url).status_code == 404
    assert intruder.post(url, json={"body": "Hi"}).status_code == 404
    assert intruder.delete(f"{url}/{comment_id}").status_code == 404
    assert len(owner.get(url).json()) == 1
