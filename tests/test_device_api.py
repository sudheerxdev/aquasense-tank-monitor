"""
AquaSense Device API — Automated pytest Suite
Run with: pytest tests/test_device_api.py
"""
from datetime import datetime, timezone

VALID_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aquasense_mock_token_2026"
SIMULATED_NOW = datetime(2026, 11, 2, 20, 0, 0, tzinfo=timezone.utc)


def mock_api_request(method: str, path: str, headers: dict = None, json_body: dict = None):
    headers = headers or {}
    json_body = json_body or {}

    if method == "POST" and path == "/login":
        if json_body.get("username") == "operator@nivoryx.io" and json_body.get("password") == "ValidPassword123!":
            return 200, {"token": VALID_TOKEN, "token_type": "Bearer", "expires_in": 3600}
        return 401, {"error": "INVALID_CREDENTIALS"}

    if method == "GET" and path.startswith("/device/") and path.endswith("/status"):
        auth = headers.get("Authorization", "")
        if auth != f"Bearer {VALID_TOKEN}":
            return 401, {"error": "UNAUTHORIZED"}

        device_id = path.split("/")[2]
        fixtures = {
            "tank-01": (200, {"level_percent": 55, "pump_state": "off", "last_seen": "2026-11-02T19:59:10Z"}),
            "tank-offline-02": (503, {"error": "DEVICE_OFFLINE", "last_seen": "2026-11-02T14:12:00Z"}),
            "tank-stale-03": (200, {"level_percent": 62, "pump_state": "on", "last_seen": "2026-11-02T17:30:00Z"}),
            "tank-malformed-04": (200, {"level_percent": "145%", "pump_state": "running", "last_seen": "bad-ts"}),
        }
        return fixtures.get(device_id, (404, {"error": "DEVICE_NOT_FOUND"}))

    return 404, {"error": "NOT_FOUND"}


def validate_telemetry(payload: dict):
    errors = []
    lvl = payload.get("level_percent")
    if not isinstance(lvl, (int, float)) or isinstance(lvl, bool) or not (0 <= lvl <= 100):
        errors.append("level_percent out of bounds or invalid type")
    if payload.get("pump_state") not in ("on", "off"):
        errors.append("pump_state must be 'on' or 'off'")
    try:
        seen_dt = datetime.fromisoformat(str(payload.get("last_seen")).replace("Z", "+00:00"))
        lag_minutes = (SIMULATED_NOW - seen_dt).total_seconds() / 60.0
    except ValueError:
        errors.append("last_seen invalid ISO-8601")
        lag_minutes = float("inf")

    return len(errors) == 0, errors, lag_minutes > 15


def test_tc01_login_success():
    status, body = mock_api_request("POST", "/login", json_body={"username": "operator@nivoryx.io", "password": "ValidPassword123!"})
    assert status == 200
    assert isinstance(body.get("token"), str) and len(body["token"]) > 20


def test_tc02_login_invalid_credentials():
    status, body = mock_api_request("POST", "/login", json_body={"username": "operator@nivoryx.io", "password": "bad"})
    assert status == 401
    assert "token" not in body


def test_tc03_status_healthy_online():
    status, body = mock_api_request("GET", "/device/tank-01/status", headers={"Authorization": f"Bearer {VALID_TOKEN}"})
    valid, errors, is_stale = validate_telemetry(body)
    assert status == 200
    assert valid is True
    assert is_stale is False


def test_tc04_status_invalid_token():
    status, body = mock_api_request("GET", "/device/tank-01/status", headers={"Authorization": "Bearer bad_token"})
    assert status == 401
    assert body["error"] == "UNAUTHORIZED"


def test_tc05_status_device_offline():
    status, body = mock_api_request("GET", "/device/tank-offline-02/status", headers={"Authorization": f"Bearer {VALID_TOKEN}"})
    assert status == 503
    assert body["error"] == "DEVICE_OFFLINE"


def test_tc06_status_stale_timestamp():
    status, body = mock_api_request("GET", "/device/tank-stale-03/status", headers={"Authorization": f"Bearer {VALID_TOKEN}"})
    valid, _, is_stale = validate_telemetry(body)
    assert status == 200
    assert valid is True
    assert is_stale is True


def test_tc07_status_malformed_response():
    status, body = mock_api_request("GET", "/device/tank-malformed-04/status", headers={"Authorization": f"Bearer {VALID_TOKEN}"})
    valid, errors, _ = validate_telemetry(body)
    assert status == 200
    assert valid is False
    assert len(errors) == 3
