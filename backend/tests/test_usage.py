"""Tests for usage_ingestion — REST fallback + summary."""


def test_report_usage(client, auth_headers):
    # Register a device first
    resp = client.post("/api/v1/devices/register", json={"name": "Phone", "type": "phone"}, headers=auth_headers)
    device_id = resp.json()["id"]

    resp = client.post(
        "/api/v1/usage/report",
        json={"device_id": device_id, "category": "social", "duration_seconds": 300},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "recorded"


def test_usage_summary(client, auth_headers):
    from datetime import date

    resp = client.post("/api/v1/devices/register", json={"name": "Phone", "type": "phone"}, headers=auth_headers)
    device_id = resp.json()["id"]

    # Report some usage
    client.post(
        "/api/v1/usage/report",
        json={"device_id": device_id, "category": "social", "duration_seconds": 300},
        headers=auth_headers,
    )
    client.post(
        "/api/v1/usage/report",
        json={"device_id": device_id, "category": "productivity", "duration_seconds": 600},
        headers=auth_headers,
    )

    today = date.today().isoformat()
    resp = client.get(f"/api/v1/usage/summary?date={today}", headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()
    assert len(data) == 1
    assert data[0]["total_seconds"] == 900