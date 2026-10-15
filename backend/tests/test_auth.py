from database import get_connection

PASSWORD = "correct-horse"


def test_register_signs_in_and_me_returns_user(make_client):
    client = make_client()
    response = client.post(
        "/api/auth/register", json={"username": "bob", "password": PASSWORD}
    )

    assert response.status_code == 201
    assert response.json()["username"] == "bob"
    assert client.get("/api/auth/me").json() == response.json()


def test_register_validation(make_client):
    client = make_client()
    cases = [
        ({"username": "ab", "password": PASSWORD}, 400),
        ({"username": "has space", "password": PASSWORD}, 400),
        ({"username": "x" * 33, "password": PASSWORD}, 400),
        ({"username": "carol", "password": "short"}, 400),
    ]
    for body, status in cases:
        assert client.post("/api/auth/register", json=body).status_code == status
    assert client.get("/api/auth/me").status_code == 401


def test_usernames_are_unique_ignoring_case(make_client):
    make_client("dave")
    other = make_client()
    response = other.post(
        "/api/auth/register", json={"username": "DAVE", "password": PASSWORD}
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Username is already taken"


def test_login_and_logout(make_client):
    make_client("erin")
    client = make_client()

    wrong = client.post("/api/auth/login", json={"username": "erin", "password": "nope-nope"})
    assert wrong.status_code == 401
    unknown = client.post("/api/auth/login", json={"username": "ghost", "password": PASSWORD})
    assert unknown.status_code == 401

    assert client.post(
        "/api/auth/login", json={"username": "erin", "password": PASSWORD}
    ).status_code == 200
    assert client.get("/api/auth/me").json()["username"] == "erin"

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_logout_revokes_the_session_server_side(make_client):
    client = make_client("frank")
    token = client.cookies.get("pm_session")
    client.post("/api/auth/logout")

    replay = make_client()
    replay.cookies.set("pm_session", token)
    assert replay.get("/api/auth/me").status_code == 401


def test_demo_user_can_sign_in(make_client):
    client = make_client()
    response = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    boards = client.get("/api/boards").json()
    assert [board["name"] for board in boards] == ["Kanban Studio"]


def test_passwords_are_hashed(make_client):
    make_client("grace")
    conn = get_connection()
    stored = conn.execute(
        "SELECT password_hash FROM users WHERE username = 'grace'"
    ).fetchone()[0]
    conn.close()
    assert PASSWORD not in stored
    assert stored.startswith("scrypt$")


def test_change_password(make_client):
    client = make_client("heidi")
    other_session = make_client()
    other_session.post("/api/auth/login", json={"username": "heidi", "password": PASSWORD})

    wrong = client.put(
        "/api/auth/password",
        json={"currentPassword": "wrong-pass", "newPassword": "new-password"},
    )
    assert wrong.status_code == 400
    short = client.put(
        "/api/auth/password", json={"currentPassword": PASSWORD, "newPassword": "short"}
    )
    assert short.status_code == 400

    changed = client.put(
        "/api/auth/password",
        json={"currentPassword": PASSWORD, "newPassword": "new-password"},
    )
    assert changed.status_code == 204
    assert client.get("/api/auth/me").status_code == 200
    assert other_session.get("/api/auth/me").status_code == 401

    fresh = make_client()
    assert fresh.post(
        "/api/auth/login", json={"username": "heidi", "password": PASSWORD}
    ).status_code == 401
    assert fresh.post(
        "/api/auth/login", json={"username": "heidi", "password": "new-password"}
    ).status_code == 200


def test_logout_everywhere_ends_every_session(make_client):
    first = make_client("ivan")
    second = make_client()
    second.post("/api/auth/login", json={"username": "ivan", "password": PASSWORD})
    bystander = make_client("judy")

    assert first.post("/api/auth/logout-all").status_code == 204

    assert first.get("/api/auth/me").status_code == 401
    assert second.get("/api/auth/me").status_code == 401
    assert bystander.get("/api/auth/me").status_code == 200
    assert make_client().post("/api/auth/logout-all").status_code == 401


def test_delete_account_requires_password_and_removes_all_data(make_client):
    client = make_client("kim")
    board_id = client.get("/api/boards").json()[0]["id"]
    second_id = client.post("/api/boards", json={"name": "Second"}).json()["id"]
    other_session = make_client()
    other_session.post("/api/auth/login", json={"username": "kim", "password": PASSWORD})
    bystander = make_client("lee")

    wrong = client.post("/api/auth/delete-account", json={"password": "not-it-at-all"})
    assert wrong.status_code == 400
    assert wrong.json()["detail"] == "Password is incorrect"
    assert client.get("/api/auth/me").status_code == 200

    assert client.post("/api/auth/delete-account", json={"password": PASSWORD}).status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert other_session.get("/api/auth/me").status_code == 401

    conn = get_connection()
    counts = {
        table: conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE board_id = ?", (board_id,)
        ).fetchone()[0]
        for table in ("columns", "cards", "labels", "card_labels")
    }
    user_rows = conn.execute("SELECT COUNT(*) FROM users WHERE username = 'kim'").fetchone()[0]
    board_rows = conn.execute(
        "SELECT COUNT(*) FROM boards WHERE id IN (?, ?)", (board_id, second_id)
    ).fetchone()[0]
    conn.close()
    assert counts == {"columns": 0, "cards": 0, "labels": 0, "card_labels": 0}
    assert (user_rows, board_rows) == (0, 0)

    # The bystander's data is untouched and the username is free again.
    assert len(bystander.get("/api/boards").json()) == 1
    assert make_client("kim").get("/api/auth/me").json()["username"] == "kim"


def test_sessions_expire_after_thirty_days(make_client):
    client = make_client("old-timer")
    token = client.cookies.get("pm_session")
    assert client.get("/api/auth/me").status_code == 200

    conn = get_connection()
    with conn:
        conn.execute(
            "UPDATE sessions SET created_at = datetime('now', '-31 days') WHERE token = ?", (token,)
        )
    conn.close()
    assert client.get("/api/auth/me").status_code == 401

    # The next sign-in prunes expired rows.
    make_client().post("/api/auth/login", json={"username": "old-timer", "password": PASSWORD})
    conn = get_connection()
    remaining = conn.execute("SELECT COUNT(*) FROM sessions WHERE token = ?", (token,)).fetchone()[0]
    conn.close()
    assert remaining == 0


def test_session_cookie_is_httponly_with_max_age(make_client):
    response = make_client().post(
        "/api/auth/register", json={"username": "cookie-check", "password": PASSWORD}
    )
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "max-age=2592000" in cookie
    assert "samesite=lax" in cookie
