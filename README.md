# AquaSense Mini-Build — Nivoryx Systems Assignment

This repository contains the complete submission for the **AquaSense Mini-Build** assignment (**Part A: Tank Level Dashboard** and **Part B: API Testing**).

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the interactive dashboard & in-browser API test suite
npm run dev

# 3. Run the automated Jest/Node test suite from CLI
node --test tests/deviceApi.test.js
```

---

## PART A — Tank Level Dashboard

### 1. Summary of Metrics (from Mock Dataset `2026-11-02`)
- **Current Tank Level (latest reading at `20:00:00`)**: **55%**
- **Today's Minimum Level**: **18%** (recorded at `2026-11-02T16:00:00`)
- **Today's Maximum Level**: **78%** (recorded at `2026-11-02T06:00:00`)
- **Low-Level Alert (< 20%)**: Triggered whenever the active/selected tank reading is `< 20%` (such as the `16:00:00` reading at **18%**, or any simulated live reading below 20%).

### 2. AI Coding Assistant Note (7 Lines)
1. **Tool Used**: Claude 3.7 Sonnet inside Cursor IDE.
2. **Prompt 1**: *"Build a React TypeScript dashboard component for AquaSense that parses this JSON array of tank readings, displays the current tank level alongside today's min and max percentages, and triggers a high-visibility low-water alert banner whenever the level drops below 20%."*
3. **Prompt 2**: *"Write a Jest automated test suite mocking POST /login and GET /device/{id}/status that validates token authentication, 503 offline device handling, malformed firmware JSON schema validation, and stale last_seen timestamps older than 15 minutes."*
4. **What It Got Wrong**: First, it used `<= 20` instead of strictly `< 20` for the low-level alert, and it only checked the final reading (`55%` at `20:00`) without surfacing that the tank had dropped to `18%` at `16:00`.
5. **What Else It Got Wrong**: Second, in the API telemetry validator, it wrote `if (!data.level_percent)` to check for missing fields, which falsely rejected a valid `0%` empty-tank reading because `0` is falsy in JavaScript.
6. **How I Fixed It**: I changed the threshold condition to `level_percent < 20`, added both active reading inspection and a historical breach warning for the `16:00` (`18%`) event, and replaced `!data.level_percent` with `typeof data.level_percent !== 'number' || Number.isNaN(data.level_percent)`.

---

## PART B — Device API Testing (`POST /login` & `GET /device/{id}/status`)

### 1. Test Plan (10 Test Cases — Positive, Negative & Edge Conditions)

| ID | Endpoint | Category | Test Case | Expected HTTP Status & Behaviour | Automated |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | `POST /login` | Positive | Valid credentials return auth token | `200 OK` — Returns non-empty Bearer token in `{ token, expires_in }` | Yes |
| **TC-02** | `POST /login` | Negative | Invalid password or unknown user | `401 Unauthorized` — Returns error code `INVALID_CREDENTIALS`, no token | Yes |
| **TC-03** | `GET /device/{id}/status` | Positive | Authorized status fetch for online sensor | `200 OK` — Returns `level_percent` (0–100), `pump_state` (`on`/`off`), fresh `last_seen` | Yes |
| **TC-04** | `GET /device/{id}/status` | Negative | Expired, malformed, or missing token | `401 Unauthorized` — Rejects request and withholds telemetry | Yes |
| **TC-05** | `GET /device/{id}/status` | Negative | Device offline / gateway unreachable | `503 Service Unavailable` — Returns `DEVICE_OFFLINE` with last known timestamp | Yes |
| **TC-06** | `GET /device/{id}/status` | Edge | Stale `last_seen` timestamp (>15 min lag) | `200 OK` — Client parser flags reading as `STALE` so UI warns operator | Yes |
| **TC-07** | `GET /device/{id}/status` | Negative | Malformed response / schema violation | `502 / Schema Error` — Rejects string `level_percent: "145%"` or `pump_state: "running"` | Yes |
| **TC-08** | `GET /device/{id}/status` | Edge | Boundary levels (`0%`, `19%`, `20%`, `100%`) | `200 OK` — `19%` triggers `< 20%` alert; `20%` does not; `0%` parses without falsy bug | Yes |
| **TC-09** | `GET /device/{id}/status` | Negative | Non-existent or unauthorized device ID | `404 Not Found` — Clean JSON error without leaking tenant devices | Manual |
| **TC-10** | `POST /login` | Edge | Rate limiting on rapid failed logins | `429 Too Many Requests` — Returns `Retry-After` header after 10 failed attempts | Manual |

---

### 2. Automated Tests Included
We provide **8 automated tests** (exceeding the minimum 4 requirement) in three formats:
1. **JavaScript / Jest / Node Test Runner**: `tests/deviceApi.test.js`
2. **Python / pytest Suite**: `tests/test_device_api.py`
3. **Postman Collection v2.1**: `postman/AquaSense_API.postman_collection.json`

---

### 3. Mobile App Behaviour When Losing Wi-Fi Mid-Operation
To test the AquaSense mobile app when the phone or IoT controller loses Wi-Fi mid-operation (such as while toggling the pump or polling tank status), I would execute a three-layer test strategy combining network link conditioning, local state persistence checks, and idempotency verification upon reconnection. First, using Android Emulator Network Throttling / iOS Network Link Conditioner and a MITM proxy (Charles or mitmproxy), I would drop Wi-Fi connectivity mid-flight—specifically after the TCP handshake or HTTP request dispatch for a pump state change, but before the response ACK arrives—and verify that the UI transitions from an optimistic/loading spinner to a clear "Connection Lost — Retrying" state within a bounded timeout (3–5 seconds) without freezing or crashing. Second, I would test whether the app falls back to cellular data smoothly or, if completely offline, preserves the last valid telemetry snapshot in local storage with an explicit "Offline · Last synced at [timestamp]" indicator rather than wiping the screen to blank/zero values. Finally, when Wi-Fi is restored, I would verify that queued or retried commands include an idempotency key (or re-fetch `GET /device/{id}/status` first) so a delayed retry never double-toggles the pump, and that WebSocket/polling subscriptions automatically re-authenticate and reconcile with the server's authoritative state.
