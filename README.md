# AquaSense Mini-Build

An AI-assisted submission for the Nivoryx Systems AquaSense assignment. This project demonstrates a tank-level dashboard, a mocked device API test suite, and a mobile Wi-Fi interruption testing strategy.


<img width="949" height="418" alt="Screenshot 2026-11-05 030056" src="https://github.com/user-attachments/assets/2be7db77-6df3-4e10-b818-ddff60768e10" />


## Assignment Deliverables

| Requirement | Implementation |
|---|---|
| Part A: current, minimum, and maximum tank level | Interactive dashboard in `src/App.tsx` |
| Part A: alert below 20% | Strict `< 20%` alert with historical alert tracking |
| Part A: AI usage note | In the dashboard and in this README |
| Part B: API test plan with at least 8 cases | 10 cases documented below and in the dashboard |
| Part B: automate at least 4 cases | 8 mocked JavaScript tests, plus a pytest suite |
| Part B: Wi-Fi loss strategy | Written strategy and four-state interactive simulator |

## What This Demo Shows

- Current tank level, today's minimum, and today's maximum.
- Interactive level chart and timestamp inspection.
- Low-water warning when the selected reading is below 20%.
- Alert history, stale/historical reading indicators, and CSV export.
- Mock login and device-status API responses.
- API test-plan filtering, pass-rate summary, and assertion details.
- Offline device, invalid token, stale telemetry, and malformed payload scenarios.
- Wi-Fi loss, cached state, retry, and idempotent reconnection workflow.

## Sample Data Result

The supplied readings are evaluated for `2026-11-02`:

- Current/latest level at 20:00: **55%**
- Today's minimum at 16:00: **18%**
- Today's maximum at 06:00: **78%**
- Low-level alert: **triggered at 18%**, because `18 < 20`
- Exactly `20%` is treated as safe and does not trigger the alert

## Run Locally

Requirements: Node.js 18+ and npm.

```bash
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`.

The `--legacy-peer-deps` option is currently needed because the repository's existing Vite and esbuild version ranges have a peer-dependency mismatch.

## Build and Validate

```bash
npm run lint
npm run build
node --test tests/deviceApi.test.js
```

Run the Python suite after installing pytest:

```bash
python -m pip install pytest
python -m pytest -q tests/test_device_api.py
```

The API tests use local mock responses. They do not require a live backend, cloud account, or physical IoT device.

## Part A — Tank Level Dashboard

<img width="959" height="417" alt="Screenshot 2026-11-05 030113" src="https://github.com/user-attachments/assets/9ad5c065-8b95-4a16-9622-49d81f774cb5" />

<img width="959" height="412" alt="Screenshot 2026-11-05 030137" src="https://github.com/user-attachments/assets/1228de68-2c52-4268-8dcc-93c70e905937" />


The dashboard uses the assignment JSON readings from `src/data/assignmentData.ts`.

<img width="959" height="418" alt="Screenshot 2026-11-05 030203" src="https://github.com/user-attachments/assets/00571018-0049-4d10-9fda-ab650d4cb25b" />


### User flow

1. Review the current level and daily minimum/maximum.
2. Select a timestamp to inspect that reading.
3. Select the 16:00 / 18% reading to view the low-water alert.
4. Review the alert history and the chart threshold line.
5. Export the readings as CSV if required.

The alert condition is intentionally implemented as:

```ts
level_percent < 20
```
<img width="959" height="424" alt="Screenshot 2026-11-05 030250" src="https://github.com/user-attachments/assets/bbbd1b02-eb01-444a-aae8-fffd5c0793c4" />


This prevents an incorrect alert at exactly 20% and preserves valid 0% readings during schema validation.

## Part B — API Test Plan

The assumed API is:

```text
POST /login
GET /device/{id}/status
```

The status response is expected to contain:

```json
{
  "level_percent": 55,
  "pump_state": "off",
  "last_seen": "2026-11-02T19:59:10Z"
}
```

### Test cases

| ID | Endpoint | Type | Scenario | Expected result | Automated |
|---|---|---|---|---|---|
| TC-01 | `POST /login` | Positive | Valid credentials | `200` and a non-empty auth token | Yes |
| TC-02 | `POST /login` | Negative | Invalid password or missing credentials | `401`; no token issued | Yes |
| TC-03 | `GET /device/{id}/status` | Positive | Authorized online device | `200` with valid telemetry and fresh `last_seen` | Yes |
| TC-04 | `GET /device/{id}/status` | Negative | Missing, malformed, or expired token | `401`; telemetry withheld | Yes |
| TC-05 | `GET /device/{id}/status` | Negative | Device offline or gateway unreachable | `503`/`504` with `DEVICE_OFFLINE` | Yes |
| TC-06 | `GET /device/{id}/status` | Edge | `last_seen` is over 15 minutes old | Response is flagged as stale | Yes |
| TC-07 | `GET /device/{id}/status` | Negative | Invalid level, pump state, or timestamp | Client rejects the schema | Yes |
| TC-08 | `GET /device/{id}/status` | Edge | Boundary levels: 0%, 19%, 20%, 100% | Only values below 20% alert | Yes |
| TC-09 | `GET /device/{id}/status` | Negative | Unknown device ID | `404` with a clean error response | No |
| TC-10 | `POST /login` | Edge | Repeated failed login attempts | `429` with `Retry-After` | No |

![Uploading Screenshot 2026-11-05 030415.png…]()


### Automated test files

- `tests/deviceApi.test.js` — Node.js built-in test runner; 8 tests.
- `tests/test_device_api.py` — pytest version of the mocked API checks.
- `postman/AquaSense_API.postman_collection.json` — importable Postman examples.

The Postman collection uses the deterministic collection variable `simulatedNow` (`2026-11-02T20:00:00Z`) so the freshness assertion is not affected by the computer's current date.

## Mobile Wi-Fi Loss Strategy

During a pump command or status request, drop Wi-Fi after the request is sent but before the response is received. Verify that the app exits the loading state within a bounded timeout, shows a clear connection-lost message, and does not crash. While offline, preserve the last valid telemetry with a “last synced” time instead of showing zero or blank data. When connectivity returns, re-authenticate, fetch authoritative device status, and retry commands with an idempotency key or a status check so a delayed request cannot toggle the pump twice.

The page includes an interactive four-state simulator:

1. Online dispatch
2. Wi-Fi dropped mid-flight
3. Offline cached snapshot
4. Reconnect and reconcile

## AI-Assisted Development Note

- Tool used: GitHub Copilot / ChatGPT.
- Prompt 1: Build a React TypeScript dashboard from the supplied tank telemetry JSON.
- Prompt 2: Write mocked API tests for login, device status, stale telemetry, and malformed responses.
- The generated alert initially used `<= 20` instead of the required strict `< 20`.
- I changed the comparator so exactly 20% does not trigger an alert.
- I added historical breach tracking so the 18% reading remains visible after the level recovers.
- The validator initially used a truthiness check that rejected a valid 0% reading.
- I replaced it with explicit numeric and range validation, then ran the automated tests.

## Deployment on Vercel

Recommended Vercel settings:

```text
Framework preset: Vite
Build command: npm run build
Output directory: dist
Install command: npm install --legacy-peer-deps
```

This is a static frontend demonstration. Vercel will serve the dashboard, images, local mock API scenarios, charts, simulators, CSV export, and theme controls.

It does not connect to a real backend, authenticate real users, send real email alerts, communicate with physical IoT hardware, or control a real pump.

## Project Structure

```text
src/
  App.tsx
  data/
    assignmentData.ts
    exportableFiles.ts
tests/
  deviceApi.test.js
  test_device_api.py
postman/
  AquaSense_API.postman_collection.json
public/
  aquasense-hero-banner.svg
  api-device-architecture.png
  low-water-alert.png
  wifi-recovery-flow.png
```
