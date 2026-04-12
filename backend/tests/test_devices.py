"""Tests for device_registry — register, heartbeat, list, delete."""


def test_register_device(client, auth_headers):
    resp = client.post(
        "/api/v1/devices/register",
        json={"name": "Test Phone", "type": "phone", "priority": 5},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Phone"
    assert data["type"] == "phone"
    assert data["priority"] == 5
    assert data["is_online"] is False


def test_register_device_invalid_type(client, auth_headers):
    resp = client.post(
        "/api/v1/devices/register",
        json={"name": "Bad Device", "type": "smartwatch"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_list_devices(client, auth_headers):
    client.post("/api/v1/devices/register", json={"name": "Phone", "type": "phone"}, headers=auth_headers)
    client.post("/api/v1/devices/register", json={"name": "Tablet", "type": "tablet"}, headers=auth_headers)

    resp = client.get("/api/v1/devices/", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_heartbeat(client, auth_headers):
    resp = client.post("/api/v1/devices/register", json={"name": "Phone", "type": "phone"}, headers=auth_headers)
    device_id = resp.json()["id"]

    resp = client.post(f"/api/v1/devices/{device_id}/heartbeat", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_delete_device(client, auth_headers):
    resp = client.post("/api/v1/devices/register", json={"name": "Phone", "type": "phone"}, headers=auth_headers)
    device_id = resp.json()["id"]

    resp = client.delete(f"/api/v1/devices/{device_id}", headers=auth_headers)
    assert resp.status_code == 204

    resp = client.get("/api/v1/devices/", headers=auth_headers)
    assert len(resp.json()) == 0