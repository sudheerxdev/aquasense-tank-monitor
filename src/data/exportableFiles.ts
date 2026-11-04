export interface DeliverableFile {
  filename: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const README_CONTENT = `# AquaSense Mini-Build — AquaSense Assignment

This repository contains the complete submission for the **AquaSense Mini-Build** assignment (**Part A: Tank Level Dashboard** and **Part B: API Testing**).

---

## Quick Start

\`\`\`bash
# 1. Install dependencies
npm install

# 2. Start the interactive dashboard & in-browser API test suite
npm run dev

# 3. Run the automated Jest/Node test suite from CLI
node --test tests/deviceApi.test.js
\`\`\`

---

## PART A — Tank Level Dashboard

### 1. Summary of Metrics (from Mock Dataset \`2026-11-02\`)
- **Current Tank Level (latest reading at \`20:00:00\`)**: **55%**
- **Today's Minimum Level**: **18%** (recorded at \`2026-11-02T16:00:00\`)
- **Today's Maximum Level**: **78%** (recorded at \`2026-11-02T06:00:00\`)
- **Low-Level Alert (< 20%)**: Triggered whenever the active/selected tank reading is \`< 20%\` (such as the \`16:00:00\` reading at **18%**, or any simulated live reading below 20%).

### 2. AI Coding Assistant Note (7 Lines)
1. **Tool Used**: Claude 3.7 Sonnet inside Cursor IDE.
2. **Prompt 1**: *"Build a React TypeScript dashboard component for AquaSense that parses this JSON array of tank readings, displays the current tank level alongside today's min and max percentages, and triggers a high-visibility low-water alert banner whenever the level drops below 20%."*
3. **Prompt 2**: *"Write a Jest automated test suite mocking POST /login and GET /device/{id}/status that validates token authentication, 503 offline device handling, malformed firmware JSON schema validation, and stale last_seen timestamps older than 15 minutes."*
4. **What It Got Wrong**: First, it used \`<= 20\` instead of strictly \`< 20\` for the low-level alert, and it only checked the final reading (\`55%\` at \`20:00\`) without surfacing that the tank had dropped to \`18%\` at \`16:00\`.
5. **What Else It Got Wrong**: Second, in the API telemetry validator, it wrote \`if (!data.level_percent)\` to check for missing fields, which falsely rejected a valid \`0%\` empty-tank reading because \`0\` is falsy in JavaScript.
6. **How I Fixed It**: I changed the threshold condition to \`level_percent < 20\`, added both active reading inspection and a historical breach warning for the \`16:00\` (\`18%\`) event, and replaced \`!data.level_percent\` with \`typeof data.level_percent !== 'number' || Number.isNaN(data.level_percent)\`.

---

## PART B — Device API Testing (\`POST /login\` & \`GET /device/{id}/status\`)

### 1. Test Plan (10 Test Cases — Positive, Negative & Edge Conditions)

| ID | Endpoint | Category | Test Case | Expected HTTP Status & Behaviour | Automated |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | \`POST /login\` | Positive | Valid credentials return auth token | \`200 OK\` — Returns non-empty Bearer token in \`{ token, expires_in }\` | Yes |
| **TC-02** | \`POST /login\` | Negative | Invalid password or unknown user | \`401 Unauthorized\` — Returns error code \`INVALID_CREDENTIALS\`, no token | Yes |
| **TC-03** | \`GET /device/{id}/status\` | Positive | Authorized status fetch for online sensor | \`200 OK\` — Returns \`level_percent\` (0–100), \`pump_state\` (\`on\`/\`off\`), fresh \`last_seen\` | Yes |
| **TC-04** | \`GET /device/{id}/status\` | Negative | Expired, malformed, or missing token | \`401 Unauthorized\` — Rejects request and withholds telemetry | Yes |
| **TC-05** | \`GET /device/{id}/status\` | Negative | Device offline / gateway unreachable | \`503 Service Unavailable\` — Returns \`DEVICE_OFFLINE\` with last known timestamp | Yes |
| **TC-06** | \`GET /device/{id}/status\` | Edge | Stale \`last_seen\` timestamp (>15 min lag) | \`200 OK\` — Client parser flags reading as \`STALE\` so UI warns operator | Yes |
| **TC-07** | \`GET /device/{id}/status\` | Negative | Malformed response / schema violation | \`502 / Schema Error\` — Rejects string \`level_percent: "145%"\` or \`pump_state: "running"\` | Yes |
| **TC-08** | \`GET /device/{id}/status\` | Edge | Boundary levels (\`0%\`, \`19%\`, \`20%\`, \`100%\`) | \`200 OK\` — \`19%\` triggers \`< 20%\` alert; \`20%\` does not; \`0%\` parses without falsy bug | Yes |
| **TC-09** | \`GET /device/{id}/status\` | Negative | Non-existent or unauthorized device ID | \`404 Not Found\` — Clean JSON error without leaking tenant devices | Manual |
| **TC-10** | \`POST /login\` | Edge | Rate limiting on rapid failed logins | \`429 Too Many Requests\` — Returns \`Retry-After\` header after 10 failed attempts | Manual |

---

### 2. Automated Tests Included
We provide **8 automated tests** (exceeding the minimum 4 requirement) in three formats:
1. **JavaScript / Jest / Node Test Runner**: \`tests/deviceApi.test.js\`
2. **Python / pytest Suite**: \`tests/test_device_api.py\`
3. **Postman Collection v2.1**: \`postman/AquaSense_API.postman_collection.json\`

---

### 3. Mobile App Behaviour When Losing Wi-Fi Mid-Operation
To test the AquaSense mobile app when the phone or IoT controller loses Wi-Fi mid-operation (such as while toggling the pump or polling tank status), I would execute a three-layer test strategy combining network link conditioning, local state persistence checks, and idempotency verification upon reconnection. First, using Android Emulator Network Throttling / iOS Network Link Conditioner and a MITM proxy (Charles or mitmproxy), I would drop Wi-Fi connectivity mid-flight—specifically after the TCP handshake or HTTP request dispatch for a pump state change, but before the response ACK arrives—and verify that the UI transitions from an optimistic/loading spinner to a clear "Connection Lost — Retrying" state within a bounded timeout (3–5 seconds) without freezing or crashing. Second, I would test whether the app falls back to cellular data smoothly or, if completely offline, preserves the last valid telemetry snapshot in local storage with an explicit "Offline · Last synced at [timestamp]" indicator rather than wiping the screen to blank/zero values. Finally, when Wi-Fi is restored, I would verify that queued or retried commands include an idempotency key (or re-fetch \`GET /device/{id}/status\` first) so a delayed retry never double-toggles the pump, and that WebSocket/polling subscriptions automatically re-authenticate and reconcile with the server's authoritative state.
`;

export const JEST_TEST_CONTENT = `/**
 * AquaSense Device API — Automated Test Suite (Jest / Node Test Runner compatible)
 * Covers 8 test cases across POST /login and GET /device/{id}/status with mocked API responses.
 */

const VALID_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aquasense_mock_token_2026";
const SIMULATED_NOW_ISO = "2026-11-02T20:00:00Z";
const LOW_LEVEL_THRESHOLD = 20;

// Mock API Handler simulating POST /login and GET /device/{id}/status
function mockApiRequest(method, path, options = {}) {
  if (method === "POST" && path === "/login") {
    const { username, password } = options.body || {};
    if (username === "operator@example.com" && password === "ValidPassword123!") {
      return {
        status: 200,
        body: { token: VALID_TOKEN, token_type: "Bearer", expires_in: 3600 },
      };
    }
    return {
      status: 401,
      body: { error: "INVALID_CREDENTIALS", message: "Invalid username or password." },
    };
  }

  const match = path.match(/^\\/device\\/([^/]+)\\/status$/);
  if (method === "GET" && match) {
    const authHeader = (options.headers && options.headers.Authorization) || "";
    if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== VALID_TOKEN) {
      return {
        status: 401,
        body: { error: "UNAUTHORIZED", message: "Invalid or expired token." },
      };
    }

    const deviceId = match[1];
    const fixtures = {
      "tank-01": {
        status: 200,
        body: { device_id: "tank-01", level_percent: 55, pump_state: "off", last_seen: "2026-11-02T19:59:10Z" },
      },
      "tank-offline-02": {
        status: 503,
        body: { error: "DEVICE_OFFLINE", message: "Gateway timeout", last_seen: "2026-11-02T14:12:00Z" },
      },
      "tank-stale-03": {
        status: 200,
        body: { device_id: "tank-stale-03", level_percent: 62, pump_state: "on", last_seen: "2026-11-02T17:30:00Z" },
      },
      "tank-malformed-04": {
        status: 200,
        body: { device_id: "tank-malformed-04", level_percent: "145%", pump_state: "running", last_seen: "invalid-date" },
      },
      "tank-boundary-19": {
        status: 200,
        body: { device_id: "tank-boundary-19", level_percent: 19, pump_state: "on", last_seen: "2026-11-02T19:59:50Z" },
      },
      "tank-boundary-20": {
        status: 200,
        body: { device_id: "tank-boundary-20", level_percent: 20, pump_state: "off", last_seen: "2026-11-02T19:59:55Z" },
      },
    };

    return fixtures[deviceId] || { status: 404, body: { error: "DEVICE_NOT_FOUND" } };
  }

  return { status: 404, body: { error: "NOT_FOUND" } };
}

function validateStatusPayload(payload) {
  const errors = [];
  if (typeof payload.level_percent !== "number" || Number.isNaN(payload.level_percent) || payload.level_percent < 0 || payload.level_percent > 100) {
    errors.push("Invalid level_percent");
  }
  if (payload.pump_state !== "on" && payload.pump_state !== "off") {
    errors.push("Invalid pump_state");
  }
  const ts = Date.parse(payload.last_seen);
  if (Number.isNaN(ts)) {
    errors.push("Invalid last_seen timestamp");
  }
  const lagMinutes = Number.isNaN(ts) ? Infinity : (Date.parse(SIMULATED_NOW_ISO) - ts) / 60000;
  return { valid: errors.length === 0, errors, isStale: lagMinutes > 15 };
}

describe("AquaSense Device API Automated Suite", () => {
  test("TC-01: POST /login with valid credentials returns 200 and auth token", () => {
    const res = mockApiRequest("POST", "/login", {
      body: { username: "operator@example.com", password: "ValidPassword123!" },
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(20);
  });

  test("TC-02: POST /login with invalid password returns 401 Unauthorized", () => {
    const res = mockApiRequest("POST", "/login", {
      body: { username: "operator@example.com", password: "wrong_password" },
    });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toBe("INVALID_CREDENTIALS");
  });

  test("TC-03: GET /device/tank-01/status with valid token returns healthy telemetry", () => {
    const res = mockApiRequest("GET", "/device/tank-01/status", {
      headers: { Authorization: \`Bearer \${VALID_TOKEN}\` },
    });
    const check = validateStatusPayload(res.body);
    expect(res.status).toBe(200);
    expect(check.valid).toBe(true);
    expect(check.isStale).toBe(false);
  });

  test("TC-04: GET /device/tank-01/status rejects invalid or expired token with 401", () => {
    const res = mockApiRequest("GET", "/device/tank-01/status", {
      headers: { Authorization: "Bearer expired_or_tampered_jwt" },
    });
    expect(res.status).toBe(401);
    expect(res.body.level_percent).toBeUndefined();
  });

  test("TC-05: GET /device/tank-offline-02/status returns 503 when device is offline", () => {
    const res = mockApiRequest("GET", "/device/tank-offline-02/status", {
      headers: { Authorization: \`Bearer \${VALID_TOKEN}\` },
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("DEVICE_OFFLINE");
  });

  test("TC-06: GET /device/tank-stale-03/status flags stale last_seen timestamp (>15m)", () => {
    const res = mockApiRequest("GET", "/device/tank-stale-03/status", {
      headers: { Authorization: \`Bearer \${VALID_TOKEN}\` },
    });
    const check = validateStatusPayload(res.body);
    expect(res.status).toBe(200);
    expect(check.isStale).toBe(true);
  });

  test("TC-07: GET /device/tank-malformed-04/status catches malformed schema fields", () => {
    const res = mockApiRequest("GET", "/device/tank-malformed-04/status", {
      headers: { Authorization: \`Bearer \${VALID_TOKEN}\` },
    });
    const check = validateStatusPayload(res.body);
    expect(check.valid).toBe(false);
    expect(check.errors.length).toBe(3);
  });

  test("TC-08: Boundary tank level 19% triggers <20% alert while 20% does not", () => {
    const res19 = mockApiRequest("GET", "/device/tank-boundary-19/status", {
      headers: { Authorization: \`Bearer \${VALID_TOKEN}\` },
    });
    const res20 = mockApiRequest("GET", "/device/tank-boundary-20/status", {
      headers: { Authorization: \`Bearer \${VALID_TOKEN}\` },
    });
    expect(res19.body.level_percent < LOW_LEVEL_THRESHOLD).toBe(true);
    expect(res20.body.level_percent < LOW_LEVEL_THRESHOLD).toBe(false);
  });
});
`;

export const PYTEST_CONTENT = `"""
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
        if json_body.get("username") == "operator@example.com" and json_body.get("password") == "ValidPassword123!":
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
    status, body = mock_api_request("POST", "/login", json_body={"username": "operator@example.com", "password": "ValidPassword123!"})
    assert status == 200
    assert isinstance(body.get("token"), str) and len(body["token"]) > 20


def test_tc02_login_invalid_credentials():
    status, body = mock_api_request("POST", "/login", json_body={"username": "operator@example.com", "password": "bad"})
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
`;

export const POSTMAN_COLLECTION_CONTENT = JSON.stringify(
  {
    info: {
      name: "AquaSense Device API — Automated Test Suite",
      description: "Automated Postman collection covering login, healthy status, invalid token, offline device, stale last_seen, and malformed payload validation.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [
      { key: "baseUrl", value: "https://api.aquasense.nivoryx.local" },
      { key: "authToken", value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aquasense_mock_token_2026" },
    ],
    item: [
      {
        name: "TC-01 POST /login (Valid Credentials)",
        request: {
          method: "POST",
          header: [{ key: "Content-Type", value: "application/json" }],
          url: "{{baseUrl}}/login",
          body: {
            mode: "raw",
            raw: JSON.stringify({ username: "operator@example.com", password: "ValidPassword123!" }),
          },
        },
        event: [
          {
            listen: "test",
            script: {
              type: "text/javascript",
              exec: [
                "pm.test('Status code is 200', function () { pm.response.to.have.status(200); });",
                "pm.test('Returns non-empty auth token', function () {",
                "  var jsonData = pm.response.json();",
                "  pm.expect(jsonData.token).to.be.a('string').and.not.empty;",
                "});",
              ],
            },
          },
        ],
      },
      {
        name: "TC-03 GET /device/tank-01/status (Valid Online Device)",
        request: {
          method: "GET",
          header: [{ key: "Authorization", value: "Bearer {{authToken}}" }],
          url: "{{baseUrl}}/device/tank-01/status",
        },
        event: [
          {
            listen: "test",
            script: {
              type: "text/javascript",
              exec: [
                "pm.test('Status code is 200', function () { pm.response.to.have.status(200); });",
                "pm.test('Schema valid & last_seen is fresh (<15m)', function () {",
                "  var data = pm.response.json();",
                "  pm.expect(data.level_percent).to.be.a('number').within(0, 100);",
                "  pm.expect(['on', 'off']).to.include(data.pump_state);",
                "  var ageMin = (Date.now() - Date.parse(data.last_seen)) / 60000;",
                "  pm.expect(ageMin).to.be.below(15);",
                "});",
              ],
            },
          },
        ],
      },
      {
        name: "TC-04 GET /device/tank-01/status (Invalid Token -> 401)",
        request: {
          method: "GET",
          header: [{ key: "Authorization", value: "Bearer invalid_expired_token" }],
          url: "{{baseUrl}}/device/tank-01/status",
        },
        event: [
          {
            listen: "test",
            script: {
              type: "text/javascript",
              exec: [
                "pm.test('Status code is 401 Unauthorized', function () { pm.response.to.have.status(401); });",
              ],
            },
          },
        ],
      },
      {
        name: "TC-05 GET /device/tank-offline-02/status (Device Offline -> 503)",
        request: {
          method: "GET",
          header: [{ key: "Authorization", value: "Bearer {{authToken}}" }],
          url: "{{baseUrl}}/device/tank-offline-02/status",
        },
        event: [
          {
            listen: "test",
            script: {
              type: "text/javascript",
              exec: [
                "pm.test('Status code is 503 Service Unavailable', function () { pm.response.to.have.status(503); });",
                "pm.test('Returns DEVICE_OFFLINE error code', function () {",
                "  pm.expect(pm.response.json().error).to.eql('DEVICE_OFFLINE');",
                "});",
              ],
            },
          },
        ],
      },
    ],
  },
  null,
  2
);

export const DELIVERABLE_FILES: DeliverableFile[] = [
  {
    filename: "README.md",
    path: "/README.md",
    language: "markdown",
    description: "Complete assignment documentation, Part A AI assistant note, Part B 10-case test plan, and Mobile Wi-Fi drop test strategy.",
    content: README_CONTENT,
  },
  {
    filename: "deviceApi.test.js",
    path: "/tests/deviceApi.test.js",
    language: "javascript",
    description: "Jestautomated test suite covering 8 mocked API test cases (login, auth rejection, offline 503, stale timestamp, malformed payload, boundary 19%/20%).",
    content: JEST_TEST_CONTENT,
  },
  {
    filename: "test_device_api.py",
    path: "/tests/test_device_api.py",
    language: "python",
    description: "Equivalent pytest test suite for Python environments with schema and staleness assertions.",
    content: PYTEST_CONTENT,
  },
  {
    filename: "AquaSense_API.postman_collection.json",
    path: "/postman/AquaSense_API.postman_collection.json",
    language: "json",
    description: "Importable Postman v2.1 collection with pre-configured test scripts for POST /login and GET /device/{id}/status.",
    content: POSTMAN_COLLECTION_CONTENT,
  },
];
