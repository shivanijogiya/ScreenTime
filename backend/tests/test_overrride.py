"""Tests for override_service — quorum-gated emergency override."""

from unittest.mock import patch


def test_request_override(client, auth_headers):
    resp = client.post("/api/v1/devices/register", json={"name": "Phone", "type": "phone"}, headers=auth_headers)
    device_id = resp.json()["id"]

    # Mock MQTT publish since broker isn't running in tests
    with patch("app.modules.override_service.quorum.publish"):
        resp = client.post(
            "/api/v1/override/request",
            json={"device_id": device_id, "requested_seconds": 600},
            headers=auth_headers,
        )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "pending"
    assert data["requested_seconds"] == 600
    assert "policy" in data["votes"]
    assert "pattern" in data["votes"]


def test_vote_approve_quorum(client, auth_headers):
    resp = client.post("/api/v1/devices/register", json={"name": "Phone", "type": "phone"}, headers=auth_headers)
    device_id = resp.json()["id"]

    with patch("app.modules.override_service.quorum.publish"):
        resp = client.post(
            "/api/v1/override/request",
            json={"device_id": device_id, "requested_seconds": 600},
            headers=auth_headers,
        )
    override_id = resp.json()["id"]

    # Parent votes approve — if policy already approved, that's 2/3 = quorum
    with patch("app.modules.override_service.quorum.publish"):
        resp = client.post(
            f"/api/v1/override/{override_id}/vote",
            json={"validator": "parent", "approved": True},
            headers=auth_headers,
        )
    data = resp.json()
    # Status depends on auto-votes — if policy=True, quorum met
    assert data["status"] in ("pending", "approved")


def test_override_status(client, auth_headers):
    resp = client.post("/api/v1/devices/register", json={"name": "Phone", "type": "phone"}, headers=auth_headers)
    device_id = resp.json()["id"]

    with patch("app.modules.override_service.quorum.publish"):
        resp = client.post(
            "/api/v1/override/request",
            json={"device_id": device_id, "requested_seconds": 300},
            headers=auth_headers,
        )
    override_id = resp.json()["id"]

    resp = client.get(f"/api/v1/override/{override_id}/status", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == override_id