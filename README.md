# AquaSense — IoT Tank Monitoring & Device QA

A responsive tank telemetry dashboard with historical level visualization, configurable low-level alerting, and a mock device API validation playground.

## Features

- Current, minimum, and maximum tank-level metrics derived from telemetry readings.
- Interactive tank visualization and historical level chart.
- Low-level warning when the selected reading is below 20%.
- Mock REST API scenarios for authentication and device status.
- API test plan covering positive, negative, and boundary conditions.
- Mobile connectivity test strategy for Wi-Fi interruptions.

## Tech Stack

- React, TypeScript, Vite
- Tailwind CSS
- Recharts
- Node.js test runner, pytest, and Postman collection

## Getting Started

```bash
npm install
npm run dev
```

## Automated Tests

Run the JavaScript tests:

```bash
node --test tests/deviceApi.test.js
```

Run the Python tests (after installing pytest):

```bash
python -m pip install pytest
python -m pytest tests/test_device_api.py
```

The API scenarios use local mock responses; no live backend or physical IoT device is required.

## API Test Coverage

The test plan includes successful and failed login, authorization checks, online and offline devices, stale telemetry, malformed payloads, boundary tank levels, unknown devices, and login rate limiting.

An importable Postman collection is available in `postman/AquaSense_API.postman_collection.json`.

## Connectivity Testing

The mobile connectivity strategy covers interruption during an in-flight operation, offline state presentation, cached telemetry, retry/reconnection handling, and avoiding duplicate device commands.

## Project Structure

```text
src/
  App.tsx
  data/
tests/
  deviceApi.test.js
  test_device_api.py
postman/
  AquaSense_API.postman_collection.json
public/
  aquasense-hero-banner.svg
```

## Notes

This project is a frontend demonstration using sample telemetry and mocked API responses. It does not communicate with a physical tank sensor or control a real pump.
