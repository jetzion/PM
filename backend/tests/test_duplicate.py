def test_duplicate_copies_everything_independently(client, board_url):
    client.patch(f"{board_url}/cards/card-1", json={"priority": "low", "dueDate": "2026-12-01"})
    client.put(f"{board_url}/done-column", json={"columnId": "col-review"})
    original = client.get(board_url).json()

    response = client.post(f"{board_url}/duplicate", json={"name": " Studio copy "})

    assert response.status_code == 201
    summary = response.json()
    assert (summary["name"], summary["cardCount"], summary["columnCount"]) == ("Studio copy", 8, 5)
    copy_url = f"/api/boards/{summary['id']}"
    assert client.get(copy_url).json() == original
    assert [b["name"] for b in client.get("/api/boards").json()] == ["Kanban Studio", "Studio copy"]

    client.patch(f"{copy_url}/cards/card-1", json={"title": "Only in the copy"})
    client.post(f"{copy_url}/cards/card-5/checklist", json={"text": "Copy item"})
    client.delete(f"{copy_url}/labels/label-design")
    assert client.get(board_url).json() == original


def test_duplicate_requires_a_name_and_ownership(make_client):
    owner = make_client("dup-owner")
    board_url = f"/api/boards/{owner.get('/api/boards').json()[0]['id']}"
    assert owner.post(f"{board_url}/duplicate", json={"name": " "}).status_code == 400

    intruder = make_client("dup-intruder")
    assert intruder.post(f"{board_url}/duplicate", json={"name": "Mine"}).status_code == 404
    assert len(intruder.get("/api/boards").json()) == 1
