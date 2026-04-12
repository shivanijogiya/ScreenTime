"""Tests for auth_service — register, login, JWT."""


def test_register_success(client):
    resp = client.post("/api/v1/auth/register", json={"email": "new@test.com", "password": "pass123"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "new@test.com"
    assert "id" in data


def test_register_duplicate_email(client):
    client.post("/api/v1/auth/register", json={"email": "dup@test.com", "password": "pass123"})
    resp = client.post("/api/v1/auth/register", json={"email": "dup@test.com", "password": "pass456"})
    assert resp.status_code == 409


def test_login_success(client):
    client.post("/api/v1/auth/register", json={"email": "login@test.com", "password": "pass123"})
    resp = client.post("/api/v1/auth/login", data={"username": "login@test.com", "password": "pass123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client):
    client.post("/api/v1/auth/register", json={"email": "wrong@test.com", "password": "pass123"})
    resp = client.post("/api/v1/auth/login", data={"username": "wrong@test.com", "password": "wrongpass"})
    assert resp.status_code == 401


def test_protected_route_no_token(client):
    resp = client.get("/api/v1/devices/")
    assert resp.status_code == 401