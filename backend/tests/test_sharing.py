import json

import pytest

PASSWORD = "correct-horse"


@pytest.fixture
def shared(make_client):
    """Owner shares their starter board with member; outsider has no access."""
    owner = make_client("owner")
    member = make_client("member")
    outsider = make_client("outsider")
    board_id = owner.get("/api/boards").json()[0]["id"]
    url = f"/api/boards/{board_id}"
    assert owner.post(f"{url}/members", json={"username": "member"}).status_code == 201
    return {"owner": owner, "member": member, "outsider": outsider, "url": url, "id": board_id}


def test_shared_board_appears_for_the_member_with_role(shared):
    member_boards = shared["member"].get("/api/boards").json()
    assert [(b["name"], b["role"], b["owner"]) for b in member_boards] == [
        ("Kanban Studio", "owner", "member"),
        ("Kanban Studio", "member", "owner"),
    ]
    owner_boards = shared["owner"].get("/api/boards").json()
    assert [(b["role"], b["owner"]) for b in owner_boards] == [("owner", "owner")]


def test_members_list_owner_first(shared):
    members = shared["member"].get(f"{shared['url']}/members").json()
    assert [(m["username"], m["role"]) for m in members] == [("owner", "owner"), ("member", "member")]


def test_members_can_work_on_board_content(shared, mock_openrouter):
    member, url = shared["member"], shared["url"]

    assert member.post(f"{url}/cards", json={"columnId": "col-backlog", "title": "From member"}).status_code == 200
    assert member.patch(f"{url}/cards/card-1", json={"priority": "low"}).status_code == 200
    assert member.post(f"{url}/columns", json={"title": "QA"}).status_code == 200
    assert member.post(f"{url}/labels", json={"name": "Bug", "color": "navy"}).status_code == 200
    assert member.post(f"{url}/cards/card-1/checklist", json={"text": "Item"}).status_code == 200
    assert member.put(f"{url}/done-column", json={"columnId": "col-review"}).status_code == 200
    mock_openrouter(json.dumps({"message": "Hi.", "board": None}))
    assert member.post(f"{url}/chat", json={"message": "Hi"}).status_code == 200

    board = shared["owner"].get(url).json()
    assert any(card["title"] == "From member" for card in board["cards"].values())
    assert board["doneColumnId"] == "col-review"


def test_owner_only_actions_are_forbidden_for_members(shared):
    member, url = shared["member"], shared["url"]

    for response in (
        member.patch(url, json={"name": "Mine now"}),
        member.delete(url),
        member.post(f"{url}/members", json={"username": "outsider"}),
    ):
        assert response.status_code == 403
        assert response.json()["detail"] == "Only the board owner can do that"
    assert shared["owner"].get("/api/boards").json()[0]["name"] == "Kanban Studio"


def test_outsiders_still_get_404(shared):
    outsider, url = shared["outsider"], shared["url"]
    assert outsider.get(url).status_code == 404
    assert outsider.get(f"{url}/members").status_code == 404
    assert outsider.patch(url, json={"name": "X"}).status_code == 404
    assert outsider.delete(f"{url}/members/{shared['id']}").status_code == 404


def test_add_member_errors(shared):
    owner, url = shared["owner"], shared["url"]
    assert owner.post(f"{url}/members", json={"username": "nobody"}).status_code == 404
    assert owner.post(f"{url}/members", json={"username": "member"}).status_code == 409
    assert owner.post(f"{url}/members", json={"username": "owner"}).status_code == 409
    # Username lookup ignores case, like sign-in.
    assert owner.post(f"{url}/members", json={"username": " OUTSIDER "}).status_code == 201


def test_member_can_leave_but_not_remove_others(shared, make_client):
    owner, member, url = shared["owner"], shared["member"], shared["url"]
    owner.post(f"{url}/members", json={"username": "outsider"})
    ids = {m["username"]: m["id"] for m in owner.get(f"{url}/members").json()}

    assert member.delete(f"{url}/members/{ids['outsider']}").status_code == 403
    assert member.delete(f"{url}/members/{ids['owner']}").status_code == 403

    remaining = member.delete(f"{url}/members/{ids['member']}").json()
    assert [m["username"] for m in remaining] == ["owner", "outsider"]
    assert member.get(url).status_code == 404

    assert owner.delete(f"{url}/members/{ids['outsider']}").status_code == 200
    assert shared["outsider"].get(url).status_code == 404
    assert owner.delete(f"{url}/members/{ids['owner']}").status_code == 404


def test_comment_authors_and_owner_permissions(shared):
    owner, member, url = shared["owner"], shared["member"], shared["url"]
    comments_url = f"{url}/cards/card-1/comments"
    owner_comment = owner.post(comments_url, json={"body": "From owner"}).json()[0]
    comments = member.post(comments_url, json={"body": "From member"}).json()
    member_comment = comments[1]
    assert [c["author"] for c in comments] == ["owner", "member"]

    assert member.delete(f"{comments_url}/{owner_comment['id']}").status_code == 403
    assert member.delete(f"{comments_url}/{member_comment['id']}").status_code == 200
    member.post(comments_url, json={"body": "Again"})
    again = owner.get(comments_url).json()[-1]
    assert owner.delete(f"{comments_url}/{again['id']}").status_code == 200


def test_overview_includes_shared_boards(shared):
    shared["owner"].patch(f"{shared['url']}/cards/card-1", json={"dueDate": "2026-01-01"})

    data = shared["member"].get("/api/overview", params={"today": "2026-10-15"}).json()

    assert len(data["boards"]) == 2
    assert [item["cardId"] for item in data["dueSoon"]] == ["card-1"]
    assert shared["outsider"].get("/api/overview", params={"today": "2026-10-15"}).json()["dueSoon"] == []


def test_member_duplicate_creates_their_own_board(shared):
    member, url = shared["member"], shared["url"]

    copy = member.post(f"{url}/duplicate", json={"name": "My copy"}).json()

    assert (copy["role"], copy["owner"]) == ("owner", "member")
    assert shared["owner"].get(f"/api/boards/{copy['id']}").status_code == 404


def test_deleting_accounts_cleans_up_sharing(shared, make_client):
    owner, member, url = shared["owner"], shared["member"], shared["url"]

    member.post("/api/auth/delete-account", json={"password": PASSWORD})
    assert [m["username"] for m in owner.get(f"{url}/members").json()] == ["owner"]

    owner.post(f"{url}/members", json={"username": "outsider"})
    owner.post("/api/auth/delete-account", json={"password": PASSWORD})
    assert len(shared["outsider"].get("/api/boards").json()) == 1
    assert shared["outsider"].get(url).status_code == 404
