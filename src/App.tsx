import React, { useState, useMemo, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Copy,
  Check,
  Download,
  RotateCcw,
  Sliders,
  WifiOff,
  FileCode2,
  Terminal,
  ArrowUpRight,
  ArrowDownRight,
  Droplets,
  Mail,
  Sun,
  Moon,
} from "lucide-react";
import {
  INITIAL_TANK_DATA,
  LOW_LEVEL_THRESHOLD,
  API_TEST_PLAN,
  AI_ASSISTANT_NOTE,
  MOBILE_WIFI_PARAGRAPH,
  runAutomatedTests,
  mockApiRequest,
  validateTelemetrySchema,
  type TankReading,
  type AutomatedTestResult,
} from "./data/telemetryData";
import { DELIVERABLE_FILES } from "./data/exportableFiles";

function formatTimeShort(isoTimestamp: string): string {
  const parts = isoTimestamp.split("T");
  if (parts.length < 2) return isoTimestamp;
  return parts[1].slice(0, 5);
}

function formatDateDisplay(isoTimestamp: string): string {
  const parts = isoTimestamp.split("T");
  return parts[0] || isoTimestamp;
}

export default function App() {
  // Theme State (Light / Dark Mode) synced with <html class="dark">
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  // Part A State: Tank Readings & Active Inspection
  const [readings, setReadings] = useState<TankReading[]>(INITIAL_TANK_DATA);
  const [selectedIndex, setSelectedIndex] = useState<number>(INITIAL_TANK_DATA.length - 1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [simulatedLevel, setSimulatedLevel] = useState<number | null>(null);
  const [newTimeInput, setNewTimeInput] = useState<string>("22:00");
  const [newLevelInput, setNewLevelInput] = useState<string>("16");

  // Email Alert Notification Configuration State
  const [alertEmailInput, setAlertEmailInput] = useState<string>("operator@example.com");
  const [savedAlertEmail, setSavedAlertEmail] = useState<string>("operator@example.com");
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState<boolean>(true);
  const [emailStatusMessage, setEmailStatusMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Pre-Emptive Depletion Forecast Warning Threshold (in hours, default 6h)
  const [depletionWarningHours, setDepletionWarningHours] = useState<number>(6);

  // Booster Pump Controller & Step Simulation State
  const [pumpControllerMode, setPumpControllerMode] = useState<"auto" | "manual_on" | "manual_off">("auto");

  // Part B.3 Interactive Mid-Operation Wi-Fi Drop Simulator State
  const [wifiSimState, setWifiSimState] = useState<
    "normal_online" | "midflight_wifi_lost" | "offline_cached" | "reconnected_idempotent"
  >("normal_online");

  // Part B State: Test Plan Filter, Automated Runner & API Playground
  const [categoryFilter, setCategoryFilter] = useState<"All" | "Positive" | "Negative" | "Edge">("All");
  const [testResults, setTestResults] = useState<AutomatedTestResult[]>(() => runAutomatedTests());
  const [selectedTestId, setSelectedTestId] = useState<string>("TC-03");
  const [lastRunTimestamp, setLastRunTimestamp] = useState<string>("2026-11-02T20:00:00Z");

  // Interactive API Sandbox State
  const [sandboxDevice, setSandboxDevice] = useState<string>("tank-01");
  const [sandboxTokenMode, setSandboxTokenMode] = useState<"valid" | "expired">("valid");

  // Deliverables Viewer & Copy States
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Derived Tank Metrics
  const activeReading = readings[selectedIndex] || readings[readings.length - 1];
  const currentLevel = simulatedLevel !== null ? simulatedLevel : activeReading.level_percent;
  const isBelowThreshold = currentLevel < LOW_LEVEL_THRESHOLD;

  // Compare current/latest reading with the previous reading for the trend indicator
  const previousReading =
    simulatedLevel !== null
      ? activeReading
      : selectedIndex > 0
      ? readings[selectedIndex - 1]
      : null;
  const levelTrendDelta = previousReading ? currentLevel - previousReading.level_percent : null;

  const { minReading, maxReading, breachReadings } = useMemo(() => {
    let minR = readings[0];
    let maxR = readings[0];
    const breaches: { reading: TankReading; index: number }[] = [];

    readings.forEach((r, idx) => {
      if (r.level_percent < minR.level_percent) minR = r;
      if (r.level_percent > maxR.level_percent) maxR = r;
      if (r.level_percent < LOW_LEVEL_THRESHOLD) {
        breaches.push({ reading: r, index: idx });
      }
    });

    return { minReading: minR, maxReading: maxR, breachReadings: breaches };
  }, [readings]);

  // Predicted Time to Empty based on the last 3 hours of consumption data
  const depletionForecast = useMemo(() => {
    const parseMs = (ts: string) => Date.parse(ts);
    const formatMsToHHMM = (ms: number) => {
      const d = new Date(ms);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    };
    const formatHoursToDuration = (hours: number) => {
      if (hours <= 0) return "0h 00m";
      const totalMinutes = Math.round(hours * 60);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${h}h ${String(m).padStart(2, "0")}m`;
    };

    const interpolateLevelAt = (targetMs: number, slice: TankReading[]): number => {
      if (slice.length === 0) return currentLevel;
      if (targetMs <= parseMs(slice[0].timestamp)) return slice[0].level_percent;
      if (targetMs >= parseMs(slice[slice.length - 1].timestamp)) {
        return slice[slice.length - 1].level_percent;
      }
      for (let i = 0; i < slice.length - 1; i++) {
        const t0 = parseMs(slice[i].timestamp);
        const t1 = parseMs(slice[i + 1].timestamp);
        if (targetMs >= t0 && targetMs <= t1) {
          if (t1 === t0) return slice[i + 1].level_percent;
          const ratio = (targetMs - t0) / (t1 - t0);
          return slice[i].level_percent + ratio * (slice[i + 1].level_percent - slice[i].level_percent);
        }
      }
      return slice[slice.length - 1].level_percent;
    };

    const effectiveSlice = readings.slice(0, selectedIndex + 1).map((r, idx) =>
      idx === selectedIndex ? { ...r, level_percent: currentLevel } : r
    );

    const endMs = parseMs(activeReading.timestamp);
    const firstMs = parseMs(effectiveSlice[0].timestamp);
    const threeHoursMs = 3 * 3600 * 1000;

    const immediateStartMs = Math.max(firstMs, endMs - threeHoursMs);
    const immediateSpanHours = Math.max(0.5, (endMs - immediateStartMs) / (3600 * 1000));
    const immediateStartLevel = interpolateLevelAt(immediateStartMs, effectiveSlice);
    const immediateDrop = immediateStartLevel - currentLevel;

    let consumptionRatePerHour = 0;
    let total3hConsumptionPct = 0;
    let windowRangeText = `${formatMsToHHMM(immediateStartMs)} – ${formatTimeShort(activeReading.timestamp)}`;
    let isRefillingWindow = false;
    let refillRatePerHour = 0;

    if (immediateDrop > 0) {
      consumptionRatePerHour = immediateDrop / immediateSpanHours;
      total3hConsumptionPct = consumptionRatePerHour * 3;
    } else {
      isRefillingWindow = true;
      refillRatePerHour = Math.abs(immediateDrop) / immediateSpanHours;

      let lastDrainIndex = effectiveSlice.length - 1;
      for (let i = effectiveSlice.length - 1; i > 0; i--) {
        if (effectiveSlice[i].level_percent < effectiveSlice[i - 1].level_percent) {
          lastDrainIndex = i;
          break;
        }
      }
      const drainEndMs = parseMs(effectiveSlice[lastDrainIndex].timestamp);
      const drainStartMs = Math.max(firstMs, drainEndMs - threeHoursMs);
      const drainSpanHours = Math.max(1, (drainEndMs - drainStartMs) / (3600 * 1000));
      const drainStartLevel = interpolateLevelAt(drainStartMs, effectiveSlice);
      const drainEndLevel = effectiveSlice[lastDrainIndex].level_percent;
      const drainDrop = Math.max(1, drainStartLevel - drainEndLevel);

      consumptionRatePerHour = drainDrop / drainSpanHours;
      total3hConsumptionPct = consumptionRatePerHour * 3;
      windowRangeText = `${formatMsToHHMM(drainStartMs)} – ${formatMsToHHMM(drainEndMs)} (Last 3h Drain)`;
    }

    const hoursToEmpty = consumptionRatePerHour > 0 ? currentLevel / consumptionRatePerHour : 0;
    const hoursToReserve =
      currentLevel > LOW_LEVEL_THRESHOLD && consumptionRatePerHour > 0
        ? (currentLevel - LOW_LEVEL_THRESHOLD) / consumptionRatePerHour
        : 0;

    const predictedEmptyMs = endMs + hoursToEmpty * 3600 * 1000;
    const predictedEmptyTimeStr = formatMsToHHMM(predictedEmptyMs);

    return {
      consumptionRatePerHour,
      total3hConsumptionPct,
      litersPerHour: Math.round(consumptionRatePerHour * 100),
      hoursToEmpty,
      formattedTimeToEmpty: formatHoursToDuration(hoursToEmpty),
      hoursToReserve,
      formattedTimeToReserve:
        currentLevel <= LOW_LEVEL_THRESHOLD ? "0h 00m (Breached)" : formatHoursToDuration(hoursToReserve),
      predictedEmptyTimeStr,
      windowRangeText,
      isRefillingWindow,
      refillRatePerHour,
    };
  }, [readings, selectedIndex, currentLevel, activeReading.timestamp]);

  // Filtered Test Plan
  const filteredTestPlan = useMemo(() => {
    if (categoryFilter === "All") return API_TEST_PLAN;
    return API_TEST_PLAN.filter((tc) => tc.category === categoryFilter);
  }, [categoryFilter]);

  const activeAutomatedResult = useMemo(() => {
    return testResults.find((r) => r.id === selectedTestId) || testResults[0];
  }, [testResults, selectedTestId]);

  // Live API Sandbox Result
  const sandboxResponse = useMemo(() => {
    const token =
      sandboxTokenMode === "valid"
        ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aquasense_mock_token_2026"
        : "expired_or_tampered_jwt";
    const res = mockApiRequest("GET", `/device/${sandboxDevice}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const schemaCheck = res.status === 200 ? validateTelemetrySchema(res.body) : null;
    return { res, schemaCheck };
  }, [sandboxDevice, sandboxTokenMode]);

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const headers = ["timestamp", "level_percent", "delta_percent", "alert_status"];
    const rows = readings.map((r, idx) => {
      const prev = idx > 0 ? readings[idx - 1].level_percent : null;
      const delta = prev !== null ? r.level_percent - prev : "";
      const status = r.level_percent < LOW_LEVEL_THRESHOLD ? "LOW_LEVEL_ALERT" : "NOMINAL";
      return `${r.timestamp},${r.level_percent},${delta},${status}`;
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aquasense_tank_readings.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddReading = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLevel = Number(newLevelInput);
    if (Number.isNaN(parsedLevel) || parsedLevel < 0 || parsedLevel > 100) return;
    const formattedTs = `2026-11-02T${newTimeInput.length === 5 ? newTimeInput : "22:00"}:00`;
    const updated = [...readings, { timestamp: formattedTs, level_percent: Math.round(parsedLevel) }];
    setReadings(updated);
    setSelectedIndex(updated.length - 1);
    setSimulatedLevel(null);
  };

  const handleResetDataset = () => {
    setReadings(INITIAL_TANK_DATA);
    setSelectedIndex(INITIAL_TANK_DATA.length - 1);
    setSimulatedLevel(null);
  };

  const handleRunTests = () => {
    const fresh = runAutomatedTests();
    setTestResults(fresh);
    setLastRunTimestamp(new Date().toISOString().slice(0, 19) + "Z");
  };

  // SVG Chart Geometry
  const chartWidth = 680;
  const chartHeight = 240;
  const padLeft = 42;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 34;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;

  const chartPoints = readings.map((r, i) => {
    const x = padLeft + (readings.length > 1 ? (i / (readings.length - 1)) * plotWidth : plotWidth / 2);
    const y = padTop + ((100 - r.level_percent) / 100) * plotHeight;
    return { x, y, reading: r, index: i };
  });

  const polylinePoints = chartPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = `${chartPoints[0].x},${padTop + plotHeight} ${polylinePoints} ${
    chartPoints[chartPoints.length - 1].x
  },${padTop + plotHeight}`;
  const thresholdY = padTop + ((100 - LOW_LEVEL_THRESHOLD) / 100) * plotHeight;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-150">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors duration-150">
        <a
          href="#dashboard"
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          AquaSense
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a
            href="#dashboard"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Tank Dashboard
          </a>
          <a
            href="#ai-note"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            AI Development
          </a>
          <a
            href="#api-testing"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            API Test Suite
          </a>
          <a
            href="#mobile-wifi"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Wi-Fi Drop Strategy
          </a>
          <a
            href="#deliverables"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Deliverables
          </a>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsDarkMode((prev) => !prev)}
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isDarkMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-700" />
                <span>Dark Mode</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </header>

      {/* Main Content Container (1440px baseline, 1200px max-w) */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 space-y-12">
        {/* Front Hero Showcase Banner */}
        <section className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-sm">
          <img
            src="/aquasense-hero-banner.svg"
            alt="AquaSense Smart Tank Monitoring and Device API QA Suite Showcase Banner"
            referrerPolicy="no-referrer"
            className="w-full h-auto block object-cover"
          />
        </section>

        {/* Assignment Context Header */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>AquaSense</span>
              <span aria-hidden="true">·</span>
              <span>IoT Monitoring Project</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Dataset 2026-11-02</span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
              AquaSense Tank Level Telemetry &amp; Device API QA Suite
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Interactive submission covering Part A (Tank Level Dashboard with &lt;20% low-level alerting and AI
              assistant reflection) and Part B (10-case API test plan, 8 live-automated mock API tests, and mobile
              mid-operation Wi-Fi drop testing strategy).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const breachIdx = readings.findIndex((r) => r.level_percent < LOW_LEVEL_THRESHOLD);
                if (breachIdx !== -1) {
                  setSelectedIndex(breachIdx);
                  setSimulatedLevel(null);
                } else {
                  setSimulatedLevel(18);
                }
              }}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Inspect 16:00 Breach (18%)
            </button>
            <button
              onClick={() => {
                setSelectedIndex(readings.length - 1);
                setSimulatedLevel(null);
              }}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              View Latest Reading (20:00 · 55%)
            </button>
          </div>
        </section>

        {/* PART A: TANK LEVEL DASHBOARD */}
        <section id="dashboard" className="space-y-6 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Part A</span>
                <span aria-hidden="true">·</span>
                <span>Tank Level Dashboard</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{readings.length} telemetry frames</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                01. Real-Time Tank Telemetry &amp; Threshold Alerting
              </h2>
            </div>

            {/* Segmented Timestamp Selector + Export CSV Action */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Inspect Timestamp:</span>
              <div className="flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-lg overflow-x-auto">
                {readings.map((r, idx) => {
                  const isSelected = simulatedLevel === null && selectedIndex === idx;
                  const isLow = r.level_percent < LOW_LEVEL_THRESHOLD;
                  return (
                    <button
                      key={r.timestamp + idx}
                      onClick={() => {
                        setSelectedIndex(idx);
                        setSimulatedLevel(null);
                      }}
                      className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected
                          ? isLow
                            ? "bg-red-600 text-white font-semibold"
                            : "bg-slate-900 dark:bg-sky-600 text-white font-semibold"
                          : isLow
                          ? "text-red-700 dark:text-red-400 hover:bg-red-100/70 dark:hover:bg-red-950/60 font-semibold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700"
                      }`}
                    >
                      {formatTimeShort(r.timestamp)} ({r.level_percent}%)
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Requirement A.2: Alert Banner when level falls below 20% */}
          {isBelowThreshold ? (
            <div
              role="alert"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-950 dark:text-red-100"
            >
              <div className="flex items-start gap-3.5">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300">
                    <span>CRITICAL LOW WATER ALERT</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      LEVEL {currentLevel}% &lt; {LOW_LEVEL_THRESHOLD}% THRESHOLD
                    </span>
                  </div>
                  <p className="text-sm font-medium text-red-900 dark:text-red-200">
                    Tank level has fallen below the 20% safety reserve (
                    {simulatedLevel !== null
                      ? `Live Simulation at ${currentLevel}%`
                      : `Recorded at ${formatTimeShort(activeReading.timestamp)} on ${formatDateDisplay(
                          activeReading.timestamp
                        )} with ${currentLevel}%`}
                    ). Dry-run protection engaged; inflow booster pump command recommended immediately.
                  </p>
                  {emailAlertsEnabled && savedAlertEmail && (
                    <p className="text-xs font-mono text-red-800 dark:text-red-300 pt-0.5">
                      Notification dispatched to <span className="font-semibold">{savedAlertEmail}</span> (Trigger:
                      Level {currentLevel}% &lt; {LOW_LEVEL_THRESHOLD}%)
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedIndex(readings.length - 1);
                  setSimulatedLevel(null);
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-white dark:bg-slate-900 text-red-900 dark:text-red-200 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Return to 20:00 (55%)
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Active Level Nominal ({currentLevel}%)
                  </span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span>
                    Above the {LOW_LEVEL_THRESHOLD}% minimum threshold. Note: 1 historical low-level breach occurred
                    today at{" "}
                    <span className="font-mono font-semibold text-red-700 dark:text-red-400 tabular-nums">
                      16:00 (18%)
                    </span>
                    .
                  </span>
                </div>
              </div>
              {breachReadings.length > 0 && (
                <button
                  onClick={() => {
                    setSelectedIndex(breachReadings[0].index);
                    setSimulatedLevel(null);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Trigger 16:00 Alert View (18%)
                </button>
              )}
            </div>
          )}

          {/* Threshold Email Notification Configuration Panel */}
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Mail className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Low-Level Email Alert Configuration (&lt;20% Threshold)
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {emailAlertsEnabled && savedAlertEmail
                    ? `Armed for ${savedAlertEmail}`
                    : "Notifications Paused"}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Configure the recipient email address to automatically receive an alert notification whenever tank
                telemetry drops below {LOW_LEVEL_THRESHOLD}%.
              </p>
              {emailError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                  {emailError}
                </p>
              )}
              {emailStatusMessage && !emailError && (
                <p className="text-xs font-mono font-medium text-emerald-700 dark:text-emerald-400">
                  {emailStatusMessage}
                </p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = alertEmailInput.trim();
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(trimmed)) {
                  setEmailError("Please enter a valid email address (e.g., operator@example.com).");
                  setEmailStatusMessage(null);
                  return;
                }
                setEmailError(null);
                setSavedAlertEmail(trimmed);
                setEmailAlertsEnabled(true);
                setEmailStatusMessage(
                  `Saved recipient ${trimmed} for <${LOW_LEVEL_THRESHOLD}% threshold alerts.`
                );
              }}
              className="flex flex-wrap items-center gap-2 shrink-0"
            >
              <input
                type="email"
                value={alertEmailInput}
                onChange={(e) => {
                  setAlertEmailInput(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="Enter recipient email..."
                aria-label="Notification email address for low tank level alert"
                className="w-60 px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Save Recipient
              </button>
              <button
                type="button"
                onClick={() => {
                  const trimmed = alertEmailInput.trim() || savedAlertEmail;
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(trimmed)) {
                    setEmailError("Please enter a valid email address before sending a test alert.");
                    return;
                  }
                  setEmailError(null);
                  setSavedAlertEmail(trimmed);
                  setEmailStatusMessage(
                    `Test <20% alert dispatched to ${trimmed} (Current level: ${currentLevel}%).`
                  );
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Send Test Alert
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !emailAlertsEnabled;
                  setEmailAlertsEnabled(next);
                  setEmailStatusMessage(
                    next
                      ? `Email notifications enabled for ${savedAlertEmail}.`
                      : "Email notifications paused."
                  );
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  emailAlertsEnabled
                    ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                }`}
              >
                {emailAlertsEnabled ? "Alerts: ON" : "Alerts: OFF"}
              </button>
            </form>
          </div>

          {/* Requirement A.1: 3 Primary Metric Strip (Current Level, Today's Min, Today's Max) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Metric 1: Current / Active Tank Level */}
            <div
              className={`p-6 rounded-xl border transition-colors ${
                isBelowThreshold
                  ? "bg-red-50/60 dark:bg-red-950/40 border-red-300 dark:border-red-800"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {simulatedLevel !== null
                    ? "Simulated Tank Level"
                    : selectedIndex === readings.length - 1
                    ? "Current Tank Level (Latest)"
                    : `Inspected Level (${formatTimeShort(activeReading.timestamp)})`}
                </span>
                <span className="font-mono tabular-nums">
                  {simulatedLevel !== null ? "MANUAL OVERRIDE" : formatTimeShort(activeReading.timestamp)}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-3">
                  <span
                    className={`font-display text-4xl font-bold font-mono tabular-nums ${
                      isBelowThreshold ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-50"
                    }`}
                  >
                    {currentLevel}%
                  </span>
                  {levelTrendDelta !== null && previousReading && (
                    <span
                      title={`Compared to ${formatTimeShort(previousReading.timestamp)} (${previousReading.level_percent}%) · >5% threshold for trend arrow`}
                      className={`inline-flex items-center gap-1 text-xs font-mono font-semibold tabular-nums ${
                        levelTrendDelta > 5
                          ? "text-emerald-700 dark:text-emerald-400"
                          : levelTrendDelta < -5
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {levelTrendDelta > 5 ? (
                        <ArrowUpRight className="w-4 h-4 stroke-[2.5] shrink-0" aria-label="Rising trend (>5%)" />
                      ) : levelTrendDelta < -5 ? (
                        <ArrowDownRight className="w-4 h-4 stroke-[2.5] shrink-0" aria-label="Falling trend (>5%)" />
                      ) : null}
                      <span>
                        {Math.abs(levelTrendDelta) > 5
                          ? levelTrendDelta > 0
                            ? `+${levelTrendDelta}%`
                            : `${levelTrendDelta}%`
                          : `Stable (${levelTrendDelta >= 0 ? `+${levelTrendDelta}%` : `${levelTrendDelta}%`})`}
                      </span>
                    </span>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold ${
                    isBelowThreshold ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {isBelowThreshold ? "BELOW 20% LIMIT" : "NORMAL RANGE"}
                </span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {previousReading && levelTrendDelta !== null
                    ? Math.abs(levelTrendDelta) > 5
                      ? `${levelTrendDelta > 0 ? "Up" : "Down"} from ${previousReading.level_percent}% at ${formatTimeShort(
                          previousReading.timestamp
                        )}`
                      : `Within ±5% threshold vs ${previousReading.level_percent}% at ${formatTimeShort(
                          previousReading.timestamp
                        )}`
                    : "Initial reading of the day"}
                </span>
                <span className="font-mono tabular-nums">Reserve: {LOW_LEVEL_THRESHOLD}%</span>
              </div>
            </div>

            {/* Metric 2: Today's Minimum */}
            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Today&apos;s Minimum Level</span>
                <span className="font-mono tabular-nums">{formatTimeShort(minReading.timestamp)}</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-display text-4xl font-bold font-mono tabular-nums text-red-700 dark:text-red-400">
                  {minReading.level_percent}%
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  Breached &lt;20% Alert
                </span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Recorded on {formatDateDisplay(minReading.timestamp)}</span>
                <button
                  onClick={() => {
                    const idx = readings.findIndex((r) => r.timestamp === minReading.timestamp);
                    if (idx !== -1) {
                      setSelectedIndex(idx);
                      setSimulatedLevel(null);
                    }
                  }}
                  className="font-semibold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  Inspect 16:00 frame
                </button>
              </div>
            </div>

            {/* Metric 3: Today's Maximum */}
            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Today&apos;s Maximum Level</span>
                <span className="font-mono tabular-nums">{formatTimeShort(maxReading.timestamp)}</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-display text-4xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50">
                  {maxReading.level_percent}%
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  Morning Peak Fill
                </span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Recorded on {formatDateDisplay(maxReading.timestamp)}</span>
                <span className="font-mono tabular-nums">
                  Daily Range: {maxReading.level_percent - minReading.level_percent}% swing
                </span>
              </div>
            </div>
          </div>

          {/* Visual Tank Gauge + SVG Telemetry Chart & Simulator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left 4 cols: Physical Tank Cutaway Visualization + Live Threshold Simulator */}
            <div className="lg:col-span-4 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Vessel Cutaway</span>
                  <span className="font-mono tabular-nums">TANK-01 · 10,000L</span>
                </div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                  Physical Level &amp; 20% Reserve Line
                </h3>
              </div>

              {/* Tank SVG / CSS Gauge */}
              <div className="relative mx-auto w-48 h-56 rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 overflow-hidden flex flex-col justify-end">
                {/* 20% Threshold Line */}
                <div
                  className="absolute left-0 right-0 z-20 border-t-2 border-dashed border-red-600 dark:border-red-500 flex items-center justify-end pr-2"
                  style={{ bottom: `${LOW_LEVEL_THRESHOLD}%` }}
                >
                  <span className="text-[10px] font-mono font-semibold text-red-700 dark:text-red-300 bg-white/90 dark:bg-slate-900/90 px-1 rounded">
                    20% ALERT
                  </span>
                </div>

                {/* Water Fill */}
                <div
                  className={`w-full transition-all duration-150 ${
                    isBelowThreshold ? "bg-red-600/85" : "bg-sky-600/85"
                  }`}
                  style={{ height: `${Math.max(0, Math.min(100, currentLevel))}%` }}
                />

                {/* Center Readout Overlay */}
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
                  <div className="px-3 py-1.5 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-center shadow-2xs">
                    <span
                      className={`font-mono text-2xl font-bold tabular-nums ${
                        isBelowThreshold ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {currentLevel}%
                    </span>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {(currentLevel * 100).toLocaleString()} L
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Level Slider & Automated Booster Pump Controller */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      Test Alert Threshold Slider
                    </span>
                    <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">{currentLevel}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={currentLevel}
                    onChange={(e) => setSimulatedLevel(Number(e.target.value))}
                    aria-label="Simulate tank level percentage"
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span>0% (Empty)</span>
                    <span className="text-red-600 dark:text-red-400 font-semibold">19% (Alert)</span>
                    <span>20% (Safe)</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Booster Pump Controller & Step +1h Physics Simulator */}
                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Booster Pump Mode:</span>
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {pumpControllerMode === "auto"
                        ? isBelowThreshold
                          ? "AUTO · PUMP ENGAGED"
                          : "AUTO · STANDBY"
                        : pumpControllerMode === "manual_on"
                        ? "MANUAL · ON (+12%/h)"
                        : "MANUAL · OFF (-7%/h)"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
                    {(
                      [
                        { id: "auto", label: "Auto (<20%)" },
                        { id: "manual_on", label: "Force ON" },
                        { id: "manual_off", label: "Force OFF" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPumpControllerMode(m.id)}
                        className={`py-1 px-2 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                          pumpControllerMode === m.id
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const lastReading = readings[readings.length - 1];
                      const baseLevel = simulatedLevel !== null ? simulatedLevel : lastReading.level_percent;
                      const lastMs = Date.parse(lastReading.timestamp);
                      const nextDate = new Date(lastMs + 3600 * 1000);
                      const yyyy = nextDate.getFullYear();
                      const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
                      const dd = String(nextDate.getDate()).padStart(2, "0");
                      const hh = String(nextDate.getHours()).padStart(2, "0");
                      const min = String(nextDate.getMinutes()).padStart(2, "0");
                      const nextIso = `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;

                      const pumpActive =
                        pumpControllerMode === "manual_on" ||
                        (pumpControllerMode === "auto" && baseLevel < LOW_LEVEL_THRESHOLD);
                      const nextLevel = Math.max(0, Math.min(100, baseLevel + (pumpActive ? 12 : -7)));
                      const nextReadings = [...readings, { timestamp: nextIso, level_percent: nextLevel }];
                      setReadings(nextReadings);
                      setSelectedIndex(nextReadings.length - 1);
                      setSimulatedLevel(null);
                    }}
                    className="w-full py-1.5 px-3 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Simulate +1h Telemetry Frame
                  </button>
                </div>
              </div>
            </div>

            {/* Right 8 cols: Interactive SVG Telemetry Curve & Secondary Delta Sparkline */}
            <div className="lg:col-span-8 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>2026-11-02 Profile</span>
                    <span aria-hidden="true">·</span>
                    <span>Hover or click any node to inspect reading</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    24-Hour Tank Level Curve &amp; Threshold Breach Visualization
                  </h3>
                </div>
                {readings.length !== INITIAL_TANK_DATA.length && (
                  <button
                    onClick={handleResetDataset}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Sample Data
                  </button>
                )}
              </div>

              {/* SVG Chart with Interactive Nearest-Point Hover Tooltip */}
              <div className="relative w-full overflow-x-auto">
                {hoveredIndex !== null && chartPoints[hoveredIndex] && (() => {
                  const hp = chartPoints[hoveredIndex];
                  const isLow = hp.reading.level_percent < LOW_LEVEL_THRESHOLD;
                  const xPct = (hp.x / chartWidth) * 100;
                  const yPct = (hp.y / chartHeight) * 100;
                  const alignClass =
                    xPct < 20
                      ? "translate-x-0"
                      : xPct > 80
                      ? "-translate-x-full"
                      : "-translate-x-1/2";
                  const verticalClass = yPct < 32 ? "translate-y-3" : "-translate-y-[calc(100%+12px)]";

                  return (
                    <div
                      role="tooltip"
                      style={{ left: `${xPct}%`, top: `${yPct}%` }}
                      className={`pointer-events-none absolute z-20 ${alignClass} ${verticalClass} px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white shadow-md border border-slate-700 whitespace-nowrap transition-transform duration-75`}
                    >
                      <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                        {hp.reading.timestamp}
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-2">
                        <span className="font-mono text-sm font-bold text-white tabular-nums">
                          Level: {hp.reading.level_percent}%
                        </span>
                        <span className="text-[11px] font-mono text-slate-300 tabular-nums">
                          ({(hp.reading.level_percent * 100).toLocaleString()} L)
                        </span>
                        <span
                          className={`text-[10px] font-semibold ${
                            isLow ? "text-red-400" : "text-emerald-400"
                          }`}
                        >
                          {isLow ? "· BELOW 20%" : "· Nominal"}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto select-none cursor-crosshair"
                  role="img"
                  aria-label="Tank level percentage over time on 2026-11-02"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (rect.width === 0 || chartPoints.length === 0) return;
                    const svgX = ((e.clientX - rect.left) / rect.width) * chartWidth;
                    let nearestIdx = 0;
                    let minDist = Infinity;
                    for (let i = 0; i < chartPoints.length; i++) {
                      const dist = Math.abs(chartPoints[i].x - svgX);
                      if (dist < minDist) {
                        minDist = dist;
                        nearestIdx = i;
                      }
                    }
                    setHoveredIndex(nearestIdx);
                  }}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Horizontal Grid Lines (100%, 75%, 50%, 0%) */}
                  {[100, 75, 50, 0].map((pct) => {
                    const y = padTop + ((100 - pct) / 100) * plotHeight;
                    return (
                      <g key={pct}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={chartWidth - padRight}
                          y2={y}
                          stroke={isDarkMode ? "#1e293b" : "#e2e8f0"}
                          strokeWidth="1"
                        />
                        <text
                          x={padLeft - 8}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                        >
                          {pct}%
                        </text>
                      </g>
                    );
                  })}

                  {/* 20% Alert Zone Shading */}
                  <rect
                    x={padLeft}
                    y={thresholdY}
                    width={plotWidth}
                    height={padTop + plotHeight - thresholdY}
                    fill={isDarkMode ? "rgba(127, 29, 29, 0.22)" : "#fef2f2"}
                  />

                  {/* 20% Dashed Alert Line */}
                  <line
                    x1={padLeft}
                    y1={thresholdY}
                    x2={chartWidth - padRight}
                    y2={thresholdY}
                    stroke="#dc2626"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padLeft - 8}
                    y={thresholdY + 4}
                    textAnchor="end"
                    className="fill-red-600 dark:fill-red-400 text-[10px] font-mono font-semibold"
                  >
                    20%
                  </text>

                  {/* Area under curve */}
                  <polygon
                    points={areaPoints}
                    fill={isDarkMode ? "rgba(56, 189, 248, 0.12)" : "rgba(2, 132, 199, 0.08)"}
                  />

                  {/* Vertical Crosshair Guide for Hovered Nearest Point */}
                  {hoveredIndex !== null && chartPoints[hoveredIndex] && (
                    <line
                      x1={chartPoints[hoveredIndex].x}
                      y1={padTop}
                      x2={chartPoints[hoveredIndex].x}
                      y2={padTop + plotHeight}
                      stroke="#64748b"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Telemetry Line */}
                  <polyline
                    fill="none"
                    stroke={isDarkMode ? "#38bdf8" : "#0284c7"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polylinePoints}
                  />

                  {/* Data Nodes */}
                  {chartPoints.map((pt) => {
                    const isLow = pt.reading.level_percent < LOW_LEVEL_THRESHOLD;
                    const isSelected = simulatedLevel === null && selectedIndex === pt.index;
                    const isHovered = hoveredIndex === pt.index;
                    return (
                      <g
                        key={pt.reading.timestamp + pt.index}
                        onMouseEnter={() => setHoveredIndex(pt.index)}
                        onClick={() => {
                          setSelectedIndex(pt.index);
                          setSimulatedLevel(null);
                        }}
                        className="cursor-pointer"
                      >
                        {(isSelected || isHovered) && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isHovered ? 10 : 9}
                            fill={isLow ? "rgba(220, 38, 38, 0.25)" : "rgba(56, 189, 248, 0.2)"}
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 6 : isSelected ? 5.5 : 4.5}
                          fill={isLow ? "#dc2626" : isDarkMode ? "#0f172a" : "#ffffff"}
                          stroke={isLow ? "#f87171" : isDarkMode ? "#38bdf8" : "#0284c7"}
                          strokeWidth="2.5"
                        />
                        <text
                          x={pt.x}
                          y={pt.y - 10}
                          textAnchor="middle"
                          className={`text-[11px] font-mono font-semibold ${
                            isLow
                              ? "fill-red-700 dark:fill-red-400"
                              : "fill-slate-700 dark:fill-slate-200"
                          }`}
                        >
                          {pt.reading.level_percent}%
                        </text>
                        <text
                          x={pt.x}
                          y={chartHeight - 10}
                          textAnchor="middle"
                          className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                        >
                          {formatTimeShort(pt.reading.timestamp)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Secondary Sparkline Chart: 24-Hour Rate of Change (Delta / Consumption Velocity) */}
              {(() => {
                const sparkHeight = 112;
                const sparkPadTop = 18;
                const sparkPadBottom = 22;
                const sparkPlotHeight = sparkHeight - sparkPadTop - sparkPadBottom;

                const deltas = readings.map((r, i) => (i > 0 ? r.level_percent - readings[i - 1].level_percent : 0));
                const maxAbsDelta = Math.max(25, ...deltas.map((d) => Math.abs(d)));
                const zeroY = sparkPadTop + sparkPlotHeight / 2;

                const sparkPoints = chartPoints.map((pt, i) => {
                  const delta = deltas[i];
                  const y = zeroY - (delta / maxAbsDelta) * (sparkPlotHeight / 2);
                  return { x: pt.x, y, delta, reading: pt.reading, index: i };
                });

                const sparkPolyline = sparkPoints.map((p) => `${p.x},${p.y}`).join(" ");
                const peakDrawdown = Math.min(...deltas);
                const peakRefill = Math.max(...deltas);

                return (
                  <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          24-Hour Rate of Change (Δ% Consumption Velocity Sparkline)
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Interval Delta</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="text-amber-700 dark:text-amber-400">Peak Drain: {peakDrawdown}%</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 dark:text-emerald-400">Peak Refill: +{peakRefill}%</span>
                      </div>
                    </div>

                    <div className="w-full overflow-x-auto">
                      <svg
                        viewBox={`0 0 ${chartWidth} ${sparkHeight}`}
                        className="w-full h-auto select-none cursor-crosshair"
                        role="img"
                        aria-label="24-hour rate of change delta sparkline chart"
                        onMouseMove={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          if (rect.width === 0 || sparkPoints.length === 0) return;
                          const svgX = ((e.clientX - rect.left) / rect.width) * chartWidth;
                          let nearestIdx = 0;
                          let minDist = Infinity;
                          for (let i = 0; i < sparkPoints.length; i++) {
                            const dist = Math.abs(sparkPoints[i].x - svgX);
                            if (dist < minDist) {
                              minDist = dist;
                              nearestIdx = i;
                            }
                          }
                          setHoveredIndex(nearestIdx);
                        }}
                        onMouseLeave={() => setHoveredIndex(null)}
                      >
                        <line
                          x1={padLeft}
                          y1={sparkPadTop}
                          x2={chartWidth - padRight}
                          y2={sparkPadTop}
                          stroke={isDarkMode ? "#1e293b" : "#f1f5f9"}
                          strokeWidth="1"
                        />
                        <text
                          x={padLeft - 8}
                          y={sparkPadTop + 4}
                          textAnchor="end"
                          className="fill-emerald-700 dark:fill-emerald-400 text-[9px] font-mono"
                        >
                          +{maxAbsDelta}%
                        </text>

                        <line
                          x1={padLeft}
                          y1={zeroY}
                          x2={chartWidth - padRight}
                          y2={zeroY}
                          stroke="#64748b"
                          strokeWidth="1"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={padLeft - 8}
                          y={zeroY + 3}
                          textAnchor="end"
                          className="fill-slate-400 text-[9px] font-mono"
                        >
                          0%
                        </text>

                        <line
                          x1={padLeft}
                          y1={sparkPadTop + sparkPlotHeight}
                          x2={chartWidth - padRight}
                          y2={sparkPadTop + sparkPlotHeight}
                          stroke={isDarkMode ? "#1e293b" : "#f1f5f9"}
                          strokeWidth="1"
                        />
                        <text
                          x={padLeft - 8}
                          y={sparkPadTop + sparkPlotHeight + 3}
                          textAnchor="end"
                          className="fill-amber-700 dark:fill-amber-400 text-[9px] font-mono"
                        >
                          -{maxAbsDelta}%
                        </text>

                        {hoveredIndex !== null && sparkPoints[hoveredIndex] && (
                          <line
                            x1={sparkPoints[hoveredIndex].x}
                            y1={sparkPadTop}
                            x2={sparkPoints[hoveredIndex].x}
                            y2={sparkPadTop + sparkPlotHeight}
                            stroke="#64748b"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                          />
                        )}

                        {sparkPoints.map((sp) => {
                          if (sp.index === 0) return null;
                          const isPositive = sp.delta > 0;
                          const barY = isPositive ? sp.y : zeroY;
                          const barH = Math.max(2, Math.abs(sp.y - zeroY));
                          return (
                            <rect
                              key={`bar-${sp.index}`}
                              x={sp.x - 5}
                              y={barY}
                              width={10}
                              height={barH}
                              rx={2}
                              fill={isPositive ? "rgba(16, 185, 129, 0.28)" : "rgba(245, 158, 11, 0.28)"}
                            />
                          );
                        })}

                        <polyline
                          fill="none"
                          stroke={isDarkMode ? "#94a3b8" : "#475569"}
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={sparkPolyline}
                        />

                        {sparkPoints.map((sp) => {
                          const isSelected = simulatedLevel === null && selectedIndex === sp.index;
                          const isHovered = hoveredIndex === sp.index;
                          const isPositive = sp.delta > 0;
                          const isNegative = sp.delta < 0;
                          const labelY = sp.delta >= 0 ? sp.y - 7 : sp.y + 12;

                          return (
                            <g
                              key={`spark-${sp.reading.timestamp}-${sp.index}`}
                              onMouseEnter={() => setHoveredIndex(sp.index)}
                              onClick={() => {
                                setSelectedIndex(sp.index);
                                setSimulatedLevel(null);
                              }}
                              className="cursor-pointer"
                            >
                              <circle
                                cx={sp.x}
                                cy={sp.y}
                                r={isHovered || isSelected ? 4.5 : 3.5}
                                fill={isPositive ? "#10b981" : isNegative ? "#f59e0b" : "#64748b"}
                                stroke={isDarkMode ? "#0f172a" : "#ffffff"}
                                strokeWidth="1.5"
                              />
                              <text
                                x={sp.x}
                                y={labelY}
                                textAnchor="middle"
                                className={`text-[10px] font-mono font-semibold ${
                                  isPositive
                                    ? "fill-emerald-700 dark:fill-emerald-400"
                                    : isNegative
                                    ? "fill-amber-700 dark:fill-amber-400"
                                    : "fill-slate-400"
                                }`}
                              >
                                {sp.index === 0 ? "0%" : sp.delta > 0 ? `+${sp.delta}%` : `${sp.delta}%`}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                );
              })()}

              {/* Append Custom Reading Form & Compact Telemetry Log */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <form onSubmit={handleAddReading} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Append Test Reading:</span>
                  <input
                    type="time"
                    value={newTimeInput}
                    onChange={(e) => setNewTimeInput(e.target.value)}
                    className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    aria-label="New reading time"
                  />
                  <div className="flex items-center">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newLevelInput}
                      onChange={(e) => setNewLevelInput(e.target.value)}
                      className="w-16 px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-l-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                      aria-label="New reading level percentage"
                    />
                    <span className="px-2 py-1.5 text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-l-0 border-slate-300 dark:border-slate-700 rounded-r-md text-slate-600 dark:text-slate-400">
                      %
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-sky-600 rounded-md hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors cursor-pointer"
                  >
                    Log Reading
                  </button>
                </form>

                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  Min: 18% (16:00) · Max: 78% (06:00) · Latest: {readings[readings.length - 1].level_percent}%
                </div>
              </div>
            </div>
          </div>

          {/* Predicted Time to Empty Section (Based on Last 3 Hours of Consumption Data) */}
          {(() => {
            const isPreemptiveWarning = depletionForecast.hoursToEmpty < depletionWarningHours;
            const isCriticalRunway = depletionForecast.hoursToEmpty < 3 || isBelowThreshold;

            const containerStyle = isCriticalRunway
              ? "bg-red-50/50 dark:bg-red-950/35 border-red-300 dark:border-red-800"
              : isPreemptiveWarning
              ? "bg-amber-50/50 dark:bg-amber-950/35 border-amber-300 dark:border-amber-800"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800";

            const indicatorColor = isCriticalRunway
              ? "text-red-700 dark:text-red-400"
              : isPreemptiveWarning
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400";

            const indicatorLabel = isCriticalRunway
              ? `CRITICAL DEPLETION (<${depletionWarningHours}h Threshold)`
              : isPreemptiveWarning
              ? `PRE-EMPTIVE WARNING (<${depletionWarningHours}h to Empty)`
              : `HEALTHY RUNWAY (≥${depletionWarningHours}h to Empty)`;

            return (
              <div className={`p-6 rounded-xl border transition-colors space-y-5 ${containerStyle}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>Depletion Forecast</span>
                      <span aria-hidden="true">·</span>
                      <span>3-Hour Consumption Model</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Window {depletionForecast.windowRangeText}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`inline-flex items-center gap-1 font-semibold ${indicatorColor}`}>
                        {isPreemptiveWarning ? (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{indicatorLabel}</span>
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      Predicted Time to Empty
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <span className="whitespace-nowrap">Warning Threshold:</span>
                      <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 dark:bg-slate-800 rounded-md">
                        {[4, 6, 8, 12].map((hrs) => (
                          <button
                            key={hrs}
                            type="button"
                            onClick={() => setDepletionWarningHours(hrs)}
                            className={`px-2 py-0.5 text-xs font-mono font-semibold rounded transition-colors cursor-pointer ${
                              depletionWarningHours === hrs
                                ? "bg-slate-900 dark:bg-sky-600 text-white"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                            }`}
                          >
                            &lt;{hrs}h
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {isPreemptiveWarning ? (
                  <div
                    role="alert"
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${
                      isCriticalRunway
                        ? "border-red-200 dark:border-red-800/80 text-red-950 dark:text-red-100"
                        : "border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className={`w-5 h-5 shrink-0 mt-0.5 ${
                          isCriticalRunway ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                        }`}
                      />
                      <div className="space-y-0.5">
                        <div
                          className={`text-xs font-semibold font-mono tabular-nums ${
                            isCriticalRunway ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"
                          }`}
                        >
                          PRE-EMPTIVE DEPLETION WARNING · EST. {depletionForecast.formattedTimeToEmpty} REMAINING
                          (&lt; {depletionWarningHours}h THRESHOLD)
                        </div>
                        <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                          At the current 3-hour consumption velocity of{" "}
                          <span className="font-mono font-semibold tabular-nums">
                            {depletionForecast.consumptionRatePerHour.toFixed(2)}%/hr
                          </span>{" "}
                          ({depletionForecast.litersPerHour} L/hr), the tank will completely exhaust its{" "}
                          <span className="font-mono font-semibold tabular-nums">{currentLevel}%</span> level by{" "}
                          <span className="font-mono font-semibold tabular-nums">
                            {depletionForecast.predictedEmptyTimeStr}
                          </span>
                          . Pre-emptive pump scheduling is advised before reaching the 20% emergency cutoff.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIndex(readings.length - 1);
                        setSimulatedLevel(null);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Reset to 20:00 (13h 12m)
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        Depletion runway (
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {depletionForecast.formattedTimeToEmpty}
                        </span>
                        ) is safely above the{" "}
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {depletionWarningHours}h
                        </span>{" "}
                        pre-emptive warning threshold.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const idx14 = readings.findIndex((r) => r.timestamp.includes("T14:00"));
                        if (idx14 !== -1) {
                          setSelectedIndex(idx14);
                          setSimulatedLevel(null);
                        } else {
                          setSimulatedLevel(22);
                        }
                      }}
                      className="px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Preview Pre-Emptive Warning (14:00 · 3h 33m)
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Predicted Time to Empty (0%)</div>
                    <div className={`font-display text-3xl font-bold font-mono tabular-nums ${indicatorColor}`}>
                      {depletionForecast.formattedTimeToEmpty}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Est. Empty Clock Time: {depletionForecast.predictedEmptyTimeStr}
                    </div>
                  </div>

                  <div className="space-y-1 sm:border-l sm:border-slate-200/80 dark:sm:border-slate-800 sm:pl-6">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Time to 20% Alert Reserve</div>
                    <div
                      className={`font-display text-3xl font-bold font-mono tabular-nums ${
                        currentLevel <= LOW_LEVEL_THRESHOLD
                          ? "text-red-700 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {depletionForecast.formattedTimeToReserve}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {currentLevel <= LOW_LEVEL_THRESHOLD
                        ? "Currently at or below 20% threshold"
                        : `${currentLevel - LOW_LEVEL_THRESHOLD}% usable buffer above reserve`}
                    </div>
                  </div>

                  <div className="space-y-1 lg:border-l lg:border-slate-200/80 dark:lg:border-slate-800 lg:pl-6">
                    <div className="text-xs text-slate-500 dark:text-slate-400">3-Hour Consumption Rate</div>
                    <div className="font-display text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {depletionForecast.consumptionRatePerHour.toFixed(2)}%
                      <span className="text-base font-normal text-slate-500 dark:text-slate-400"> / hr</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Outflow: ~{depletionForecast.litersPerHour} L/hr (-
                      {depletionForecast.total3hConsumptionPct.toFixed(1)}% per 3h)
                    </div>
                  </div>

                  <div className="space-y-1 sm:border-l sm:border-slate-200/80 dark:sm:border-slate-800 sm:pl-6">
                    <div className="text-xs text-slate-500 dark:text-slate-400">3-Hour Telemetry Regime</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 pt-1">
                      {depletionForecast.isRefillingWindow
                        ? `Pump Refill Active (+${depletionForecast.refillRatePerHour.toFixed(1)}%/hr)`
                        : "Active Drawdown (Pump Off)"}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {depletionForecast.isRefillingWindow
                        ? `Projected using the last 3h consumption window (${depletionForecast.windowRangeText}) assuming inflow pump stops.`
                        : `Calculated directly from the preceding 3h drawdown window (${depletionForecast.windowRangeText}).`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Telemetry Data Table */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Droplets className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">Sample Telemetry Log</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{readings.length} JSON Records</span>
              </div>
              <button
                onClick={() => handleCopyText("mock-json", JSON.stringify(INITIAL_TANK_DATA, null, 2))}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {copiedKey === "mock-json" ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Copied JSON
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Raw JSON
                  </>
                )}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-950/50">
                    <th className="py-2.5 px-6">Timestamp (ISO-8601)</th>
                    <th className="py-2.5 px-6 text-right">Level (%)</th>
                    <th className="py-2.5 px-6 text-right">Delta vs Previous</th>
                    <th className="py-2.5 px-6">Daily Extremes</th>
                    <th className="py-2.5 px-6">Threshold Status (&lt;20%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {readings.map((r, idx) => {
                    const prev = idx > 0 ? readings[idx - 1].level_percent : null;
                    const delta = prev !== null ? r.level_percent - prev : null;
                    const isLow = r.level_percent < LOW_LEVEL_THRESHOLD;
                    const isMin = r.level_percent === minReading.level_percent;
                    const isMax = r.level_percent === maxReading.level_percent;
                    const isLatest = idx === readings.length - 1;

                    return (
                      <tr
                        key={r.timestamp + idx}
                        onClick={() => {
                          setSelectedIndex(idx);
                          setSimulatedLevel(null);
                        }}
                        className={`cursor-pointer transition-colors ${
                          simulatedLevel === null && selectedIndex === idx
                            ? "bg-sky-50/70 dark:bg-sky-950/40"
                            : isLow
                            ? "bg-red-50/30 dark:bg-red-950/25 hover:bg-red-50/60 dark:hover:bg-red-950/40"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <td className="py-2.5 px-6 font-mono text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                          {r.timestamp}
                        </td>
                        <td
                          className={`py-2.5 px-6 text-right font-mono font-semibold tabular-nums ${
                            isLow ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-100"
                          }`}
                        >
                          {r.level_percent}%
                        </td>
                        <td className="py-2.5 px-6 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {delta === null ? "—" : delta > 0 ? `+${delta}%` : `${delta}%`}
                        </td>
                        <td className="py-2.5 px-6 text-xs text-slate-600 dark:text-slate-400">
                          {isMax && (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              Today&apos;s Maximum
                            </span>
                          )}
                          {isMin && (
                            <span className="font-semibold text-red-700 dark:text-red-400">
                              Today&apos;s Minimum
                            </span>
                          )}
                          {isLatest && !isMax && !isMin && (
                            <span className="font-semibold text-slate-900 dark:text-slate-100">Current (Latest)</span>
                          )}
                          {!isMax && !isMin && !isLatest && (
                            <span className="text-slate-400 dark:text-slate-500">Intermediate</span>
                          )}
                        </td>
                        <td className="py-2.5 px-6 text-xs">
                          {isLow ? (
                            <span className="font-semibold text-red-700 dark:text-red-400">
                              ALERT · Below 20% Reserve ({r.level_percent}%)
                            </span>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-400">Nominal (≥ 20%)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* PART A.3: AI CODING ASSISTANT NOTE (5-10 LINES) */}
        <section id="ai-note" className="space-y-4 scroll-mt-20">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Part A · Requirement 3</span>
                <span aria-hidden="true">·</span>
                <span>AI Coding Assistant Reflection (7 Lines)</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                02. AI Assistant Usage, Prompts &amp; Bug Remediation Note
              </h2>
            </div>

            <button
              onClick={() =>
                handleCopyText(
                  "ai-note",
                  `Tool Used: ${AI_ASSISTANT_NOTE.toolUsed}\n${AI_ASSISTANT_NOTE.prompt1}\n${AI_ASSISTANT_NOTE.prompt2}\n${AI_ASSISTANT_NOTE.whatItGotWrongAndFix}`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {copiedKey === "ai-note" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Copied Note
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy 7-Line Note
                </>
              )}
            </button>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                Assistant &amp; Environment:
              </span>
              <span>{AI_ASSISTANT_NOTE.toolUsed}</span>
            </div>

            <div className="space-y-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <p className="font-mono text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                {AI_ASSISTANT_NOTE.prompt1}
              </p>
              <p className="font-mono text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                {AI_ASSISTANT_NOTE.prompt2}
              </p>
            </div>

            <div>
              <p className="text-slate-800 dark:text-slate-200">{AI_ASSISTANT_NOTE.whatItGotWrongAndFix}</p>
            </div>
          </div>
        </section>

        {/* PART B: DEVICE API TESTING (TEST PLAN + AUTOMATED RUNNER) */}
        <section id="api-testing" className="space-y-6 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Part B · Requirements 1 &amp; 2</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">POST /login</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">GET /device/&#123;id&#125;/status</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                03. Device API Test Plan (10 Cases) &amp; Automated Test Suite
              </h2>
            </div>

            {/* Category Filter Controls */}
            <div className="flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-lg">
              {(["All", "Positive", "Negative", "Edge"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === cat
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {cat === "All" ? `All (${API_TEST_PLAN.length})` : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Part B.1: 10-Case Test Plan Table */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-950/50">
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Endpoint &amp; Category</th>
                    <th className="py-3 px-4">Test Case &amp; Request</th>
                    <th className="py-3 px-4 text-right">HTTP</th>
                    <th className="py-3 px-4">Expected Behaviour</th>
                    <th className="py-3 px-4 text-right">Automation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {filteredTestPlan.map((tc) => (
                    <tr
                      key={tc.id}
                      onClick={() => {
                        if (tc.automated) setSelectedTestId(tc.id);
                      }}
                      className={`transition-colors ${
                        tc.automated
                          ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      } ${selectedTestId === tc.id ? "bg-sky-50/60 dark:bg-sky-950/40" : ""}`}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap tabular-nums">
                        {tc.id}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{tc.endpoint}</div>
                        <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                          {tc.category} Condition · {tc.preconditions}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{tc.title}</div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {tc.requestSummary}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                        {tc.expectedStatus}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 leading-relaxed max-w-md">
                        {tc.expectedBehaviour}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {tc.automated ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">Automated (PASS)</span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">Manual Plan</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Part B.2: Automated Test Runner & Interactive Mock API Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left 5 cols: Automated Test Suite Execution List */}
            <div className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Terminal className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                    <span>Automated Mock API Suite</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">8 / 8 Passing</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    Executed Test Cases (Click to Inspect)
                  </h3>
                </div>

                <button
                  onClick={handleRunTests}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Re-run Suite
                </button>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
                {testResults.map((tr) => {
                  const isSelected = tr.id === activeAutomatedResult.id;
                  return (
                    <button
                      key={tr.id}
                      onClick={() => setSelectedTestId(tr.id)}
                      className={`w-full py-2.5 px-3 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-sky-50/80 dark:bg-sky-950/50 text-slate-900 dark:text-slate-100"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {tr.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                        )}
                        <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                          {tr.id}
                        </span>
                        <span className="text-xs truncate">{tr.name}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                        {tr.durationMs}ms
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                <span>Last run: {lastRunTimestamp}</span>
                <span>Jest + pytest + Postman included</span>
              </div>
            </div>

            {/* Right 7 cols: Selected Automated Test Assertions + Live Mock Endpoint Sandbox */}
            <div className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      <span>{activeAutomatedResult.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {activeAutomatedResult.request.method} {activeAutomatedResult.request.url}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {activeAutomatedResult.name}
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    HTTP {activeAutomatedResult.response.status} · PASS
                  </span>
                </div>

                {/* Assertions List */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Automated Assertions Verified:
                  </div>
                  {activeAutomatedResult.assertions.map((a, i) => (
                    <div
                      key={i}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{a.description}</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                        actual:{" "}
                        <span className="text-slate-900 dark:text-slate-100 font-semibold">{a.actual}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Request & Mocked Response JSON */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                      Mock Request Dispatched
                    </div>
                    <pre className="p-3 rounded-lg bg-slate-900 dark:bg-slate-950 border border-slate-800 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed">
                      {JSON.stringify(activeAutomatedResult.request, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                      Mock API Response (HTTP {activeAutomatedResult.response.status})
                    </div>
                    <pre className="p-3 rounded-lg bg-slate-900 dark:bg-slate-950 border border-slate-800 text-emerald-300 font-mono text-[11px] overflow-x-auto leading-relaxed">
                      {JSON.stringify(activeAutomatedResult.response.body, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Interactive API Probe Sandbox */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Interactive Endpoint Probe: GET /device/&#123;id&#125;/status
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={sandboxDevice}
                      onChange={(e) => setSandboxDevice(e.target.value)}
                      aria-label="Select mock device ID"
                      className="px-2.5 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value="tank-01">tank-01 (Online · 55%)</option>
                      <option value="tank-offline-02">tank-offline-02 (Offline · 503)</option>
                      <option value="tank-stale-03">tank-stale-03 (Stale last_seen · 2.5h old)</option>
                      <option value="tank-malformed-04">tank-malformed-04 (Malformed schema)</option>
                      <option value="tank-boundary-19">tank-boundary-19 (Boundary 19% Alert)</option>
                    </select>
                    <select
                      value={sandboxTokenMode}
                      onChange={(e) => setSandboxTokenMode(e.target.value as "valid" | "expired")}
                      aria-label="Select auth token state"
                      className="px-2.5 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value="valid">Token: Valid Bearer JWT</option>
                      <option value="expired">Token: Expired / Invalid (401)</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      HTTP {sandboxResponse.res.status}
                    </span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {JSON.stringify(sandboxResponse.res.body)}
                    </span>
                  </div>
                  {sandboxResponse.schemaCheck && (
                    <span
                      className={`shrink-0 font-semibold ${
                        !sandboxResponse.schemaCheck.valid
                          ? "text-red-700 dark:text-red-400"
                          : sandboxResponse.schemaCheck.isStale
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {!sandboxResponse.schemaCheck.valid
                        ? "SCHEMA INVALID"
                        : sandboxResponse.schemaCheck.isStale
                        ? `STALE (${sandboxResponse.schemaCheck.stalenessMinutes}m lag)`
                        : "SCHEMA & FRESHNESS OK"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PART B.3: MOBILE APP WI-FI DROP TESTING STRATEGY (ONE PARAGRAPH) */}
        <section id="mobile-wifi" className="space-y-4 scroll-mt-20">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <WifiOff className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <span>Part B · Requirement 3</span>
                <span aria-hidden="true">·</span>
                <span>One-Paragraph QA Strategy</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                04. Testing Mobile App Behaviour When Device Loses Wi-Fi Mid-Operation
              </h2>
            </div>

            <button
              onClick={() => handleCopyText("wifi-paragraph", MOBILE_WIFI_PARAGRAPH)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {copiedKey === "wifi-paragraph" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Copied Paragraph
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Paragraph
                </>
              )}
            </button>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
            <p className="text-sm md:text-base text-slate-800 dark:text-slate-200 leading-relaxed">
              {MOBILE_WIFI_PARAGRAPH}
            </p>

            {/* Interactive Mid-Operation Wi-Fi Drop & Idempotency Simulator */}
            <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Interactive Mid-Operation Wi-Fi Drop &amp; Idempotent Retry Harness
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Step through the 4 network states described above to verify mobile UI resilience and command
                    deduplication:
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: "normal_online", label: "1. Online Dispatch" },
                      { id: "midflight_wifi_lost", label: "2. Drop Wi-Fi Mid-Flight" },
                      { id: "offline_cached", label: "3. Offline Snapshot Fallback" },
                      { id: "reconnected_idempotent", label: "4. Reconnect & Reconcile" },
                    ] as const
                  ).map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setWifiSimState(stage.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        wifiSimState === stage.id
                          ? "bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-600"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {stage.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="text-slate-500 dark:text-slate-400 font-medium">1. Network &amp; Transport Layer</div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {wifiSimState === "normal_online" && "Wi-Fi Connected · RTT 38ms"}
                    {wifiSimState === "midflight_wifi_lost" && "Wi-Fi Dropped After TCP Send (No ACK)"}
                    {wifiSimState === "offline_cached" && "0.0 kbps · Airplane / Dead Zone"}
                    {wifiSimState === "reconnected_idempotent" && "Wi-Fi Restored · Re-authenticated"}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {wifiSimState === "normal_online" &&
                      "POST /device/tank-01/pump dispatched with Idempotency-Key: aqs-cmd-9042."}
                    {wifiSimState === "midflight_wifi_lost" &&
                      "MITM proxy drops link after HTTP request leaves phone but before 200 OK response arrives."}
                    {wifiSimState === "offline_cached" &&
                      "Polling suspended with exponential backoff; zero unhandled promise rejections."}
                    {wifiSimState === "reconnected_idempotent" &&
                      "Replays queued command with identical Idempotency-Key: aqs-cmd-9042 after GET /status check."}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="text-slate-500 dark:text-slate-400 font-medium">2. Mobile App UI Behaviour</div>
                  <div
                    className={`font-mono font-semibold ${
                      wifiSimState === "midflight_wifi_lost" || wifiSimState === "offline_cached"
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {wifiSimState === "normal_online" && "Pump State: ON · Synced Live"}
                    {wifiSimState === "midflight_wifi_lost" && "Connection Lost — Retrying (3s timeout)"}
                    {wifiSimState === "offline_cached" &&
                      `Offline · Last synced ${formatTimeShort(activeReading.timestamp)} (${currentLevel}%)`}
                    {wifiSimState === "reconnected_idempotent" && "Synced · Authoritative State Reconciled"}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {wifiSimState === "normal_online" &&
                      "Optimistic toggle resolves immediately upon receiving 200 OK server confirmation."}
                    {wifiSimState === "midflight_wifi_lost" &&
                      "Bounded 3–5s timeout clears spinner and surfaces non-blocking retry banner."}
                    {wifiSimState === "offline_cached" &&
                      "Preserves last known valid telemetry in local storage instead of wiping UI to 0%."}
                    {wifiSimState === "reconnected_idempotent" &&
                      "WebSocket & polling subscriptions resume; UI updates to match authoritative server state."}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="text-slate-500 dark:text-slate-400 font-medium">
                    3. Pump Safety &amp; Idempotency Assertion
                  </div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {wifiSimState === "normal_online" && "Key aqs-cmd-9042 · Executed Once"}
                    {wifiSimState === "midflight_wifi_lost" && "Key aqs-cmd-9042 · Pending ACK"}
                    {wifiSimState === "offline_cached" && "Command Queued Locally (1 Item)"}
                    {wifiSimState === "reconnected_idempotent" && "Deduplicated · 0 Double-Toggles"}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {wifiSimState === "reconnected_idempotent"
                      ? "PASS: Server recognizes Idempotency-Key aqs-cmd-9042 and returns cached 200 OK without toggling pump off."
                      : "Ensures a delayed network retry never accidentally reverses or double-triggers the physical relay."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* DELIVERABLES & REPOSITORY ARTIFACT VIEWER */}
        <section id="deliverables" className="space-y-4 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <FileCode2 className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <span>Repository Submission Artifacts</span>
                <span aria-hidden="true">·</span>
                <span>Ready for GitHub or ZIP Submission</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                05. Exportable Code &amp; Test Suite Files
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-lg overflow-x-auto">
              {DELIVERABLE_FILES.map((file, idx) => (
                <button
                  key={file.filename}
                  onClick={() => setActiveFileIndex(idx)}
                  className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeFileIndex === idx
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {file.filename}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-950/50">
              <div>
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {DELIVERABLE_FILES[activeFileIndex].path}
                </span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {DELIVERABLE_FILES[activeFileIndex].description}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() =>
                    handleCopyText(
                      DELIVERABLE_FILES[activeFileIndex].filename,
                      DELIVERABLE_FILES[activeFileIndex].content
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  {copiedKey === DELIVERABLE_FILES[activeFileIndex].filename ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy File
                    </>
                  )}
                </button>
                <button
                  onClick={() =>
                    handleDownloadFile(
                      DELIVERABLE_FILES[activeFileIndex].filename,
                      DELIVERABLE_FILES[activeFileIndex].content
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download {DELIVERABLE_FILES[activeFileIndex].filename}
                </button>
              </div>
            </div>
            <pre className="p-6 bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto max-h-96 leading-relaxed">
              {DELIVERABLE_FILES[activeFileIndex].content}
            </pre>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 px-6 mt-12 transition-colors duration-150">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>AquaSense Mini-Build · Prepared for AquaSense</div>
          <div className="flex items-center gap-4">
            <a href="#dashboard" className="hover:text-slate-900 dark:hover:text-slate-100">
              Part A: Tank Dashboard
            </a>
            <span aria-hidden="true">·</span>
            <a href="#api-testing" className="hover:text-slate-900 dark:hover:text-slate-100">
              Part B: API Testing
            </a>
            <span aria-hidden="true">·</span>
            <a href="#deliverables" className="hover:text-slate-900 dark:hover:text-slate-100">
              Export Files
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
