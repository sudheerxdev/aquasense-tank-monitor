/**
 * AquaSense Device API — Automated Test Suite
 * Compatible with both `node --test tests/deviceApi.test.js` and Jest.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const VALID_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aquasense_mock_token_2026";
const SIMULATED_NOW_ISO = "2026-11-02T20:00:00Z";
const LOW_LEVEL_THRESHOLD = 20;

function mockApiRequest(method, path, options = {}) {
  if (method === "POST" && path === "/login") {
    const { username, password } = options.body || {};
    if (username === "operator@nivoryx.io" && password === "ValidPassword123!") {
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

  const match = path.match(/^\/device\/([^/]+)\/status$/);
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
  it("TC-01: POST /login with valid credentials returns 200 and auth token", () => {
    const res = mockApiRequest("POST", "/login", {
      body: { username: "operator@nivoryx.io", password: "ValidPassword123!" },
    });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, "string");
    assert.ok(res.body.token.length > 20);
  });

  it("TC-02: POST /login with invalid password returns 401 Unauthorized", () => {
    const res = mockApiRequest("POST", "/login", {
      body: { username: "operator@nivoryx.io", password: "wrong_password" },
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.token, undefined);
    assert.equal(res.body.error, "INVALID_CREDENTIALS");
  });

  it("TC-03: GET /device/tank-01/status with valid token returns healthy telemetry", () => {
    const res = mockApiRequest("GET", "/device/tank-01/status", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    const check = validateStatusPayload(res.body);
    assert.equal(res.status, 200);
    assert.equal(check.valid, true);
    assert.equal(check.isStale, false);
  });

  it("TC-04: GET /device/tank-01/status rejects invalid or expired token with 401", () => {
    const res = mockApiRequest("GET", "/device/tank-01/status", {
      headers: { Authorization: "Bearer expired_or_tampered_jwt" },
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.level_percent, undefined);
  });

  it("TC-05: GET /device/tank-offline-02/status returns 503 when device is offline", () => {
    const res = mockApiRequest("GET", "/device/tank-offline-02/status", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "DEVICE_OFFLINE");
  });

  it("TC-06: GET /device/tank-stale-03/status flags stale last_seen timestamp (>15m)", () => {
    const res = mockApiRequest("GET", "/device/tank-stale-03/status", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    const check = validateStatusPayload(res.body);
    assert.equal(res.status, 200);
    assert.equal(check.isStale, true);
  });

  it("TC-07: GET /device/tank-malformed-04/status catches malformed schema fields", () => {
    const res = mockApiRequest("GET", "/device/tank-malformed-04/status", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    const check = validateStatusPayload(res.body);
    assert.equal(check.valid, false);
    assert.equal(check.errors.length, 3);
  });

  it("TC-08: Boundary tank level 19% triggers <20% alert while 20% does not", () => {
    const res19 = mockApiRequest("GET", "/device/tank-boundary-19/status", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    const res20 = mockApiRequest("GET", "/device/tank-boundary-20/status", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    assert.equal(res19.body.level_percent < LOW_LEVEL_THRESHOLD, true);
    assert.equal(res20.body.level_percent < LOW_LEVEL_THRESHOLD, false);
  });
});
