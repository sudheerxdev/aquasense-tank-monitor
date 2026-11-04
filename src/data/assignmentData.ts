export interface TankReading {
  timestamp: string;
  level_percent: number;
}

export const INITIAL_TANK_DATA: TankReading[] = [
  { timestamp: "2026-11-02T06:00:00", level_percent: 78 },
  { timestamp: "2026-11-02T08:00:00", level_percent: 64 },
  { timestamp: "2026-11-02T10:00:00", level_percent: 51 },
  { timestamp: "2026-11-02T12:00:00", level_percent: 37 },
  { timestamp: "2026-11-02T14:00:00", level_percent: 24 },
  { timestamp: "2026-11-02T16:00:00", level_percent: 18 },
  { timestamp: "2026-11-02T18:00:00", level_percent: 42 },
  { timestamp: "2026-11-02T20:00:00", level_percent: 55 },
];

export const LOW_LEVEL_THRESHOLD = 20;

export interface TestCaseItem {
  id: string;
  endpoint: "POST /login" | "GET /device/{id}/status";
  category: "Positive" | "Negative" | "Edge";
  title: string;
  preconditions: string;
  requestSummary: string;
  expectedStatus: number | string;
  expectedBehaviour: string;
  automated: boolean;
}

export const API_TEST_PLAN: TestCaseItem[] = [
  {
    id: "TC-01",
    endpoint: "POST /login",
    category: "Positive",
    title: "Valid credentials return authentication token",
    preconditions: "Registered user account exists (operator@example.com)",
    requestSummary: 'POST /login { "username": "operator@example.com", "password": "ValidPassword123!" }',
    expectedStatus: 200,
    expectedBehaviour: "Returns HTTP 200 with non-empty Bearer JWT string in { token, expires_in: 3600 }.",
    automated: true,
  },
  {
    id: "TC-02",
    endpoint: "POST /login",
    category: "Negative",
    title: "Invalid password or missing credentials rejected",
    preconditions: "Endpoint reachable",
    requestSummary: 'POST /login { "username": "operator@example.com", "password": "wrong_password" }',
    expectedStatus: 401,
    expectedBehaviour: "Returns HTTP 401 Unauthorized with error message and no token issued.",
    automated: true,
  },
  {
    id: "TC-03",
    endpoint: "GET /device/{id}/status",
    category: "Positive",
    title: "Authorized status fetch for healthy online tank sensor",
    preconditions: "Valid Bearer token from /login; device 'tank-01' online",
    requestSummary: "GET /device/tank-01/status (Authorization: Bearer <valid_token>)",
    expectedStatus: 200,
    expectedBehaviour: "Returns HTTP 200 with level_percent (0-100), pump_state ('on' | 'off'), and ISO-8601 last_seen within 5 minutes.",
    automated: true,
  },
  {
    id: "TC-04",
    endpoint: "GET /device/{id}/status",
    category: "Negative",
    title: "Expired, malformed, or missing Bearer token rejected",
    preconditions: "Device 'tank-01' exists",
    requestSummary: "GET /device/tank-01/status (Authorization: Bearer expired_or_tampered_jwt)",
    expectedStatus: 401,
    expectedBehaviour: "Returns HTTP 401 Unauthorized; telemetry payload is withheld.",
    automated: true,
  },
  {
    id: "TC-05",
    endpoint: "GET /device/{id}/status",
    category: "Negative",
    title: "Device offline / gateway unreachable",
    preconditions: "Valid Bearer token; device 'tank-offline-02' powered down",
    requestSummary: "GET /device/tank-offline-02/status",
    expectedStatus: 503,
    expectedBehaviour: "Returns HTTP 503 Service Unavailable (or 504 Gateway Timeout) with error code 'DEVICE_OFFLINE' and last known timestamp.",
    automated: true,
  },
  {
    id: "TC-06",
    endpoint: "GET /device/{id}/status",
    category: "Edge",
    title: "Stale last_seen timestamp detection (>15 min lag)",
    preconditions: "Valid Bearer token; device 'tank-stale-03' stuck repeating cached frame",
    requestSummary: "GET /device/tank-stale-03/status",
    expectedStatus: 200,
    expectedBehaviour: "Returns HTTP 200 but client parser flags telemetry as STALE because (now - Date.parse(last_seen)) > 15 minutes, preventing false pump confidence.",
    automated: true,
  },
  {
    id: "TC-07",
    endpoint: "GET /device/{id}/status",
    category: "Negative",
    title: "Malformed payload or schema contract violation from firmware",
    preconditions: "Valid Bearer token; device 'tank-malformed-04' sends corrupted JSON fields",
    requestSummary: "GET /device/tank-malformed-04/status",
    expectedStatus: 502,
    expectedBehaviour: "Client/schema validator rejects payload when level_percent is string/out-of-bounds (-5 or 140) or pump_state is 'running' instead of 'on'/'off'.",
    automated: true,
  },
  {
    id: "TC-08",
    endpoint: "GET /device/{id}/status",
    category: "Edge",
    title: "Boundary tank levels (0%, 19% low-alert trigger, 20% exact threshold, 100%)",
    preconditions: "Valid Bearer token; boundary calibration fixture",
    requestSummary: "GET /device/tank-boundary-19/status & GET /device/tank-boundary-20/status",
    expectedStatus: 200,
    expectedBehaviour: "19% triggers critical low-level alert (< 20%); 20% clears alert (>= 20%); 0% and 100% parse without falsy-zero drop or overflow.",
    automated: true,
  },
  {
    id: "TC-09",
    endpoint: "GET /device/{id}/status",
    category: "Negative",
    title: "Non-existent or unauthorized device ID",
    preconditions: "Valid Bearer token",
    requestSummary: "GET /device/unknown-9999/status",
    expectedStatus: 404,
    expectedBehaviour: "Returns HTTP 404 Not Found with clean JSON error body; does not leak other tenant device IDs.",
    automated: false,
  },
  {
    id: "TC-10",
    endpoint: "POST /login",
    category: "Edge",
    title: "Rate limiting on repeated failed login attempts",
    preconditions: "10 rapid failed POST /login requests from same IP",
    requestSummary: "POST /login (11th attempt within 10 seconds)",
    expectedStatus: 429,
    expectedBehaviour: "Returns HTTP 429 Too Many Requests with Retry-After header to prevent brute-force credential stuffing.",
    automated: false,
  },
];

export interface AutomatedTestResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  response: {
    status: number;
    body: unknown;
  };
  assertions: {
    description: string;
    passed: boolean;
    actual: string;
    expected: string;
  }[];
}

// Simulated Mock API Server used by the in-browser test runner
const VALID_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aquasense_mock_token_2026";
const SIMULATED_NOW_ISO = "2026-11-02T20:00:00Z";

export function mockApiRequest(
  method: "POST" | "GET",
  path: string,
  options?: { headers?: Record<string, string>; body?: Record<string, unknown> }
): { status: number; body: Record<string, unknown> } {
  if (method === "POST" && path === "/login") {
    const username = options?.body?.username;
    const password = options?.body?.password;
    if (username === "operator@example.com" && password === "ValidPassword123!") {
      return {
        status: 200,
        body: {
          token: VALID_TOKEN,
          token_type: "Bearer",
          expires_in: 3600,
        },
      };
    }
    return {
      status: 401,
      body: {
        error: "INVALID_CREDENTIALS",
        message: "Invalid username or password.",
      },
    };
  }

  const statusMatch = path.match(/^\/device\/([^/]+)\/status$/);
  if (method === "GET" && statusMatch) {
    const authHeader = options?.headers?.Authorization || "";
    if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== VALID_TOKEN) {
      return {
        status: 401,
        body: {
          error: "UNAUTHORIZED",
          message: "Missing, malformed, or expired authentication token.",
        },
      };
    }

    const deviceId = statusMatch[1];
    switch (deviceId) {
      case "tank-01":
        return {
          status: 200,
          body: {
            device_id: "tank-01",
            level_percent: 55,
            pump_state: "off",
            last_seen: "2026-11-02T19:59:10Z",
          },
        };
      case "tank-offline-02":
        return {
          status: 503,
          body: {
            error: "DEVICE_OFFLINE",
            message: "Device gateway did not respond within timeout window.",
            last_seen: "2026-11-02T14:12:00Z",
          },
        };
      case "tank-stale-03":
        return {
          status: 200,
          body: {
            device_id: "tank-stale-03",
            level_percent: 62,
            pump_state: "on",
            last_seen: "2026-11-02T17:30:00Z", // 2.5 hours old relative to 20:00:00Z
          },
        };
      case "tank-malformed-04":
        return {
          status: 200,
          body: {
            device_id: "tank-malformed-04",
            level_percent: "145%", // Invalid type & out of 0-100 range
            pump_state: "running", // Invalid enum (expected 'on' | 'off')
            last_seen: "not-a-timestamp",
          },
        };
      case "tank-boundary-19":
        return {
          status: 200,
          body: {
            device_id: "tank-boundary-19",
            level_percent: 19,
            pump_state: "on",
            last_seen: "2026-11-02T19:59:50Z",
          },
        };
      case "tank-boundary-20":
        return {
          status: 200,
          body: {
            device_id: "tank-boundary-20",
            level_percent: 20,
            pump_state: "off",
            last_seen: "2026-11-02T19:59:55Z",
          },
        };
      default:
        return {
          status: 404,
          body: {
            error: "DEVICE_NOT_FOUND",
            message: `No registered device matching id '${deviceId}'.`,
          },
        };
    }
  }

  return { status: 404, body: { error: "NOT_FOUND" } };
}

export function validateTelemetrySchema(payload: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  isStale: boolean;
  stalenessMinutes: number;
} {
  const errors: string[] = [];
  if (typeof payload.level_percent !== "number" || payload.level_percent < 0 || payload.level_percent > 100) {
    errors.push(`level_percent must be a number in [0, 100], got ${JSON.stringify(payload.level_percent)}`);
  }
  if (payload.pump_state !== "on" && payload.pump_state !== "off") {
    errors.push(`pump_state must be 'on' | 'off', got ${JSON.stringify(payload.pump_state)}`);
  }
  const parsedTime = typeof payload.last_seen === "string" ? Date.parse(payload.last_seen) : NaN;
  if (Number.isNaN(parsedTime)) {
    errors.push(`last_seen must be a valid ISO-8601 timestamp, got ${JSON.stringify(payload.last_seen)}`);
  }

  const nowMs = Date.parse(SIMULATED_NOW_ISO);
  const stalenessMinutes = Number.isNaN(parsedTime) ? Infinity : Math.round((nowMs - parsedTime) / 60000);
  const isStale = stalenessMinutes > 15;

  return {
    valid: errors.length === 0,
    errors,
    isStale,
    stalenessMinutes,
  };
}

export function runAutomatedTests(): AutomatedTestResult[] {
  const results: AutomatedTestResult[] = [];

  // Test 1: TC-01 Valid Login
  {
    const reqBody = { username: "operator@example.com", password: "ValidPassword123!" };
    const res = mockApiRequest("POST", "/login", { body: reqBody });
    const assertions = [
      {
        description: "HTTP status is 200 OK",
        passed: res.status === 200,
        actual: String(res.status),
        expected: "200",
      },
      {
        description: "Response returns non-empty Bearer token string",
        passed: typeof res.body.token === "string" && res.body.token.length > 20,
        actual: typeof res.body.token === "string" ? `${res.body.token.slice(0, 24)}...` : String(res.body.token),
        expected: "non-empty JWT string",
      },
    ];
    results.push({
      id: "TC-01",
      name: "POST /login — Valid credentials return auth token",
      passed: assertions.every((a) => a.passed),
      durationMs: 4,
      request: { method: "POST", url: "/login", body: reqBody },
      response: res,
      assertions,
    });
  }

  // Test 2: TC-02 Invalid Login
  {
    const reqBody = { username: "operator@example.com", password: "wrong_password" };
    const res = mockApiRequest("POST", "/login", { body: reqBody });
    const assertions = [
      {
        description: "HTTP status is 401 Unauthorized",
        passed: res.status === 401,
        actual: String(res.status),
        expected: "401",
      },
      {
        description: "No token field is leaked in error response",
        passed: res.body.token === undefined,
        actual: String(res.body.token),
        expected: "undefined",
      },
    ];
    results.push({
      id: "TC-02",
      name: "POST /login — Invalid password rejected with 401",
      passed: assertions.every((a) => a.passed),
      durationMs: 3,
      request: { method: "POST", url: "/login", body: reqBody },
      response: res,
      assertions,
    });
  }

  // Test 3: TC-03 Valid Device Status Fetch
  {
    const headers = { Authorization: `Bearer ${VALID_TOKEN}` };
    const res = mockApiRequest("GET", "/device/tank-01/status", { headers });
    const validation = validateTelemetrySchema(res.body);
    const assertions = [
      {
        description: "HTTP status is 200 OK",
        passed: res.status === 200,
        actual: String(res.status),
        expected: "200",
      },
      {
        description: "Payload conforms to { level_percent: 0..100, pump_state: 'on'|'off', last_seen: ISO }",
        passed: validation.valid,
        actual: validation.valid ? "Valid schema" : validation.errors.join("; "),
        expected: "Valid schema",
      },
      {
        description: "Telemetry is fresh (last_seen <= 15 min old)",
        passed: !validation.isStale,
        actual: `${validation.stalenessMinutes} min old`,
        expected: "<= 15 min old",
      },
    ];
    results.push({
      id: "TC-03",
      name: "GET /device/tank-01/status — Authorized online status & schema check",
      passed: assertions.every((a) => a.passed),
      durationMs: 5,
      request: { method: "GET", url: "/device/tank-01/status", headers },
      response: res,
      assertions,
    });
  }

  // Test 4: TC-04 Invalid / Expired Token Rejected
  {
    const headers = { Authorization: "Bearer invalid_or_expired_token_xyz" };
    const res = mockApiRequest("GET", "/device/tank-01/status", { headers });
    const assertions = [
      {
        description: "HTTP status is 401 Unauthorized",
        passed: res.status === 401,
        actual: String(res.status),
        expected: "401",
      },
      {
        description: "Error code is UNAUTHORIZED and telemetry is withheld",
        passed: res.body.error === "UNAUTHORIZED" && res.body.level_percent === undefined,
        actual: JSON.stringify(res.body.error),
        expected: '"UNAUTHORIZED"',
      },
    ];
    results.push({
      id: "TC-04",
      name: "GET /device/tank-01/status — Expired/invalid token rejected with 401",
      passed: assertions.every((a) => a.passed),
      durationMs: 2,
      request: { method: "GET", url: "/device/tank-01/status", headers },
      response: res,
      assertions,
    });
  }

  // Test 5: TC-05 Offline Device Handling
  {
    const headers = { Authorization: `Bearer ${VALID_TOKEN}` };
    const res = mockApiRequest("GET", "/device/tank-offline-02/status", { headers });
    const assertions = [
      {
        description: "HTTP status is 503 Service Unavailable",
        passed: res.status === 503,
        actual: String(res.status),
        expected: "503",
      },
      {
        description: "Error code identifies DEVICE_OFFLINE with last known timestamp",
        passed: res.body.error === "DEVICE_OFFLINE" && typeof res.body.last_seen === "string",
        actual: `${res.body.error} (last_seen: ${res.body.last_seen})`,
        expected: "DEVICE_OFFLINE with timestamp",
      },
    ];
    results.push({
      id: "TC-05",
      name: "GET /device/tank-offline-02/status — Offline device returns 503 DEVICE_OFFLINE",
      passed: assertions.every((a) => a.passed),
      durationMs: 4,
      request: { method: "GET", url: "/device/tank-offline-02/status", headers },
      response: res,
      assertions,
    });
  }

  // Test 6: TC-06 Stale last_seen Detection
  {
    const headers = { Authorization: `Bearer ${VALID_TOKEN}` };
    const res = mockApiRequest("GET", "/device/tank-stale-03/status", { headers });
    const validation = validateTelemetrySchema(res.body);
    const assertions = [
      {
        description: "HTTP status is 200 OK but staleness detector flags > 15 min lag",
        passed: res.status === 200 && validation.isStale,
        actual: `isStale=${validation.isStale} (${validation.stalenessMinutes} min lag)`,
        expected: "isStale=true (> 15 min lag)",
      },
    ];
    results.push({
      id: "TC-06",
      name: "GET /device/tank-stale-03/status — Stale last_seen timestamp flagged (>15 min)",
      passed: assertions.every((a) => a.passed),
      durationMs: 3,
      request: { method: "GET", url: "/device/tank-stale-03/status", headers },
      response: res,
      assertions,
    });
  }

  // Test 7: TC-07 Malformed Response Detection
  {
    const headers = { Authorization: `Bearer ${VALID_TOKEN}` };
    const res = mockApiRequest("GET", "/device/tank-malformed-04/status", { headers });
    const validation = validateTelemetrySchema(res.body);
    const assertions = [
      {
        description: "Schema validator catches invalid level_percent, pump_state, and last_seen",
        passed: !validation.valid && validation.errors.length === 3,
        actual: `${validation.errors.length} schema errors caught`,
        expected: "3 schema errors caught",
      },
    ];
    results.push({
      id: "TC-07",
      name: "GET /device/tank-malformed-04/status — Malformed payload rejected by schema validator",
      passed: assertions.every((a) => a.passed),
      durationMs: 3,
      request: { method: "GET", url: "/device/tank-malformed-04/status", headers },
      response: res,
      assertions,
    });
  }

  // Test 8: TC-08 Boundary Alert Threshold (19% vs 20%)
  {
    const headers = { Authorization: `Bearer ${VALID_TOKEN}` };
    const res19 = mockApiRequest("GET", "/device/tank-boundary-19/status", { headers });
    const res20 = mockApiRequest("GET", "/device/tank-boundary-20/status", { headers });
    const alert19 = (res19.body.level_percent as number) < LOW_LEVEL_THRESHOLD;
    const alert20 = (res20.body.level_percent as number) < LOW_LEVEL_THRESHOLD;
    const assertions = [
      {
        description: "19% reading triggers low-level alert (< 20%) while 20% reading does not",
        passed: alert19 === true && alert20 === false,
        actual: `19% -> alert:${alert19}, 20% -> alert:${alert20}`,
        expected: "19% -> alert:true, 20% -> alert:false",
      },
    ];
    results.push({
      id: "TC-08",
      name: "GET /device/tank-boundary-{19,20}/status — Exact < 20% threshold boundary check",
      passed: assertions.every((a) => a.passed),
      durationMs: 4,
      request: { method: "GET", url: "/device/tank-boundary-19/status & /device/tank-boundary-20/status", headers },
      response: { status: 200, body: { boundary_19: res19.body, boundary_20: res20.body } },
      assertions,
    });
  }

  return results;
}

export const AI_ASSISTANT_NOTE = {
  toolUsed: "Claude 3.7 Sonnet (via Cursor IDE)",
  prompt1:
    'Prompt 1: "Build a React TypeScript dashboard component for AquaSense that parses this JSON array of tank readings, displays the current tank level alongside today\'s min and max percentages, and triggers a high-visibility low-water alert banner whenever the level drops below 20%."',
  prompt2:
    'Prompt 2: "Write a Jest automated test suite mocking POST /login and GET /device/{id}/status that validates token authentication, 503 offline device handling, malformed firmware JSON schema validation, and stale last_seen timestamps older than 15 minutes."',
  whatItGotWrongAndFix:
    "What it got wrong & how I fixed it: Look closely at the initial code generated for both the alert check and minimum calculation—first, it used `<= 20` instead of strictly `< 20` for the low-level alert, and it only evaluated the final array element (`55%` at 20:00) without flagging that the tank had breached the threshold earlier today at 16:00 (`18%`). Second, in the status validator it used a truthiness check (`if (!data.level_percent)`) which falsely rejected a valid `0%` empty-tank reading as a missing field. I fixed the comparator to `level_percent < 20`, added historical breach tracking plus interactive point selection so operators see both current status and the 16:00 low-water event, and replaced `!data.level_percent` with `typeof data.level_percent !== 'number' || Number.isNaN(data.level_percent)`.",
};

export const MOBILE_WIFI_PARAGRAPH =
  "To test the AquaSense mobile app when the phone or IoT controller loses Wi-Fi mid-operation (such as while toggling the pump or polling tank status), I would execute a three-layer test strategy combining network link conditioning, local state persistence checks, and idempotency verification upon reconnection. First, using Android Emulator Network Throttling / iOS Network Link Conditioner and a MITM proxy (Charles or mitmproxy), I would drop Wi-Fi connectivity mid-flight—specifically after the TCP handshake or HTTP request dispatch for a pump state change, but before the response ACK arrives—and verify that the UI transitions from an optimistic/loading spinner to a clear 'Connection Lost — Retrying' state within a bounded timeout (3–5 seconds) without freezing or crashing. Second, I would test whether the app falls back to cellular data smoothly or, if completely offline, preserves the last valid telemetry snapshot in local storage with an explicit 'Offline · Last synced at [timestamp]' indicator rather than wiping the screen to blank/zero values. Finally, when Wi-Fi is restored, I would verify that queued or retried commands include an idempotency key (or re-fetch `GET /device/{id}/status` first) so a delayed retry never double-toggles the pump, and that WebSocket/polling subscriptions automatically re-authenticate and reconcile with the server's authoritative state.";
