import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./services/api";
import { getAuthBaseUrl, getPrimaryApiBase, getRuntimeApiBase, setRuntimeApiBase } from "./services/config";
import { stream, type StreamEvent } from "./services/stream";
import type { NotificationItem, ReadinessStatus, SchedulingRecommendation, VehicleSummary } from "./types";

type ViewKey = "dashboard" | "users" | "fleet" | "security" | "audit" | "settings" | "diagnostics";
type FeedbackKind = "success" | "error" | "info";

interface FeedbackMessage {
  kind: FeedbackKind;
  text: string;
}

interface AdminUser {
  fullName: string;
  email: string;
  role: string;
  location?: string;
  plant?: string;
}

interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  actor: string;
  time: string;
}

interface DashboardEvent {
  id: string;
  topic: string;
  summary: string;
  severity: "critical" | "warning" | "normal";
  time: string;
}

interface VehicleRequestDraft {
  id: string;
  vin: string;
  model: string;
  location: string;
  createdAt: string;
  status: "pending-endpoint";
}

interface AdminSettings {
  pollingSeconds: number;
  defaultRecipient: string;
  apiBaseOverride: string;
}

const ADMIN_SETTINGS_KEY = "admin.ui.settings.v1";
const ADMIN_AUDIT_KEY = "admin.ui.audit.v1";
const ADMIN_VEHICLE_DRAFTS_KEY = "admin.ui.vehicleDrafts.v1";
const AUTH_ENABLED = ((import.meta.env.VITE_ADMIN_AUTH_ENABLED as string | undefined) || "false").toLowerCase() === "true";

const DEFAULT_SETTINGS: AdminSettings = {
  pollingSeconds: 20,
  defaultRecipient: "",
  apiBaseOverride: getRuntimeApiBase() || "",
};

const VIEW_ITEMS: Array<{ key: ViewKey; label: string; symbol: string }> = [
  { key: "dashboard", label: "Control Dashboard", symbol: "01" },
  { key: "users", label: "Users & Roles", symbol: "02" },
  { key: "fleet", label: "Fleet Control", symbol: "03" },
  { key: "security", label: "Security Monitor", symbol: "04" },
  { key: "audit", label: "Audit Timeline", symbol: "05" },
  { key: "settings", label: "Global Settings", symbol: "06" },
  { key: "diagnostics", label: "Diagnostics", symbol: "07" },
];

const ROLE_MATRIX = [
  { role: "SYSTEM_ADMIN", scope: "Full platform power", modules: "All modules" },
  { role: "ADMIN", scope: "Operational administration", modules: "Users, Fleet, Security, Audit, Settings" },
  { role: "SERVICE_MANAGER", scope: "Service operations", modules: "No access to Admin app" },
  { role: "MANUFACTURING_ENGINEER", scope: "Manufacturing analytics", modules: "No access to Admin app" },
  { role: "USER", scope: "Read-only product user", modules: "No access to Admin app" },
];

const parseStoredJson = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const normalizeRole = (role?: string | null): string => {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
};

const hasAdminPower = (role?: string | null): boolean => {
  const normalized = normalizeRole(role);
  return normalized === "system-admin" || normalized === "admin";
};

const safeParseSettings = (): AdminSettings => {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  const parsed = parseStoredJson<Partial<AdminSettings>>(window.localStorage.getItem(ADMIN_SETTINGS_KEY), {});

  return {
    pollingSeconds:
      typeof parsed.pollingSeconds === "number" && Number.isFinite(parsed.pollingSeconds)
        ? Math.min(120, Math.max(5, parsed.pollingSeconds))
        : DEFAULT_SETTINGS.pollingSeconds,
    defaultRecipient: typeof parsed.defaultRecipient === "string" ? parsed.defaultRecipient : "",
    apiBaseOverride: typeof parsed.apiBaseOverride === "string" ? parsed.apiBaseOverride : DEFAULT_SETTINGS.apiBaseOverride,
  };
};

const safeParseAudit = (): AuditEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const parsed = parseStoredJson<AuditEntry[]>(window.localStorage.getItem(ADMIN_AUDIT_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
};

const safeParseDraftVehicles = (): VehicleRequestDraft[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const parsed = parseStoredJson<VehicleRequestDraft[]>(window.localStorage.getItem(ADMIN_VEHICLE_DRAFTS_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
};

const compactDateTime = (value?: string | null): string => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const toReadable = (value?: string | null): string => {
  if (!value) {
    return "-";
  }
  return value.replace(/_/g, " ");
};

const summarizeStreamEvent = (event: StreamEvent): DashboardEvent => {
  const payload = event.payload || {};
  const vehicleId = typeof payload.vehicle_id === "string" ? payload.vehicle_id : undefined;
  const status = typeof payload.status === "string" ? payload.status : undefined;
  const reason = typeof payload.reason === "string" ? payload.reason : undefined;

  const summaryParts = [vehicleId, status, reason].filter(Boolean);
  const summary = summaryParts.length > 0 ? summaryParts.join(" | ") : "System event received";

  const topic = String(event.topic || "stream.event");
  const lowered = topic.toLowerCase();
  const severity: DashboardEvent["severity"] =
    lowered.includes("critical") || lowered.includes("security") || lowered.includes("anomaly")
      ? "critical"
      : lowered.includes("warning") || lowered.includes("recommendation")
        ? "warning"
        : "normal";

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    topic,
    summary,
    severity,
    time: new Date().toLocaleTimeString(),
  };
};

const shouldRefreshForTopic = (topic: string): boolean => {
  const lowered = topic.toLowerCase();
  return (
    lowered.startsWith("telemetry.") ||
    lowered.startsWith("anomaly.") ||
    lowered.startsWith("analysis.") ||
    lowered.startsWith("scheduling.") ||
    lowered.startsWith("notification.")
  );
};

const App = () => {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");

  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem("token"),
  );
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string>("");
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [loginBusy, setLoginBusy] = useState<boolean>(false);

  const [settings, setSettings] = useState<AdminSettings>(safeParseSettings);
  const [settingsDraft, setSettingsDraft] = useState<AdminSettings>(safeParseSettings);

  const [fleet, setFleet] = useState<VehicleSummary[]>([]);
  const [recommendations, setRecommendations] = useState<SchedulingRecommendation[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);

  const [streamConnected, setStreamConnected] = useState<boolean>(false);
  const [events, setEvents] = useState<DashboardEvent[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(safeParseAudit);
  const [vehicleDrafts, setVehicleDrafts] = useState<VehicleRequestDraft[]>(safeParseDraftVehicles);

  const [newVehicleVin, setNewVehicleVin] = useState("");
  const [newVehicleModel, setNewVehicleModel] = useState("");
  const [newVehicleLocation, setNewVehicleLocation] = useState("");

  const [busyRecommendationId, setBusyRecommendationId] = useState<string | null>(null);

  const userHasAdminPower = useMemo(() => (AUTH_ENABLED ? hasAdminPower(user?.role) : true), [user?.role]);

  const persistSettings = useCallback((next: AdminSettings) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(next));
  }, []);

  const persistAudit = useCallback((next: AuditEntry[]) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ADMIN_AUDIT_KEY, JSON.stringify(next));
  }, []);

  const persistVehicleDrafts = useCallback((next: VehicleRequestDraft[]) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ADMIN_VEHICLE_DRAFTS_KEY, JSON.stringify(next));
  }, []);

  const appendAudit = useCallback(
    (action: string, detail: string) => {
      setAuditEntries((previous) => {
        const next: AuditEntry[] = [
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            action,
            detail,
            actor: user?.email || "unknown-admin",
            time: new Date().toISOString(),
          },
          ...previous,
        ].slice(0, 250);

        persistAudit(next);
        return next;
      });
    },
    [persistAudit, user?.email],
  );

  const fetchCurrentUser = useCallback(async () => {
    if (!AUTH_ENABLED) {
      setUser({
        fullName: "UI Preview Admin",
        email: "preview@local",
        role: "SYSTEM_ADMIN",
        location: "-",
        plant: "-",
      });
      setAuthLoading(false);
      setAuthError("");
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    if (!token) {
      setUser(null);
      setAuthLoading(false);
      setAuthError("No auth token found. Login from the main app first.");
      return;
    }

    try {
      const response = await fetch(`${getAuthBaseUrl()}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load current user profile from auth service.");
      }

      const payload = (await response.json()) as Partial<AdminUser>;
      setUser({
        fullName: String(payload.fullName || "Admin User"),
        email: String(payload.email || "unknown@local"),
        role: String(payload.role || "USER"),
        location: payload.location ? String(payload.location) : "-",
        plant: payload.plant ? String(payload.plant) : "-",
      });
    } catch (error) {
      setUser(null);
      setAuthError(error instanceof Error ? error.message : "Failed to resolve admin profile.");
    } finally {
      setAuthLoading(false);
    }
  }, [token]);

  const handleLoginSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!AUTH_ENABLED) {
        return;
      }

      const email = loginEmail.trim();
      const password = loginPassword;

      if (!email || !password) {
        setAuthError("Email and password are required.");
        return;
      }

      setLoginBusy(true);
      setAuthError("");

      try {
        const response = await fetch(`${getAuthBaseUrl()}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        const payload = (await response.json().catch(() => ({}))) as { token?: string; message?: string; detail?: string };

        if (!response.ok || !payload.token) {
          const reason = payload.detail || payload.message || "Unable to login from admin UI.";
          throw new Error(reason);
        }

        if (typeof window !== "undefined") {
          window.localStorage.setItem("token", payload.token);
        }

        setToken(payload.token);
        setLoginPassword("");
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "Admin login failed.");
      } finally {
        setLoginBusy(false);
      }
    },
    [loginEmail, loginPassword],
  );

  const handleLogout = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("token");
    }
    setToken(null);
    setUser(null);
    setEvents([]);
    setAuthError("");
  }, []);

  const refreshAdminData = useCallback(
    async (showLoader: boolean) => {
      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setErrorMessage("");

      try {
        const [fleetRows, recommendationRows, notificationRows, readinessStatus] = await Promise.all([
          api.getFleetStatus(),
          api.getRecommendations({ pendingOnly: true, recipient: settings.defaultRecipient || undefined, limit: 120 }),
          api.getNotifications({ recipient: settings.defaultRecipient || undefined, limit: 120 }),
          api.getReadiness(),
        ]);

        setFleet(fleetRows);
        setRecommendations(recommendationRows);
        setNotifications(notificationRows);
        setReadiness(readinessStatus);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to refresh admin control-plane data.");
      } finally {
        if (showLoader) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    },
    [settings.defaultRecipient],
  );

  useEffect(() => {
    void fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (!userHasAdminPower) {
      setLoading(false);
      return;
    }

    void refreshAdminData(true);
  }, [refreshAdminData, userHasAdminPower]);

  useEffect(() => {
    if (!userHasAdminPower) {
      return;
    }

    stream.start();
    let refreshTimeoutId: number | null = null;

    const unsubscribeConnection = stream.subscribeConnection((connected) => {
      setStreamConnected(connected);
    });

    const unsubscribeEvents = stream.subscribe((event) => {
      setEvents((previous) => [summarizeStreamEvent(event), ...previous].slice(0, 60));

      if (!shouldRefreshForTopic(String(event.topic || ""))) {
        return;
      }

      if (refreshTimeoutId !== null) {
        window.clearTimeout(refreshTimeoutId);
      }

      refreshTimeoutId = window.setTimeout(() => {
        refreshTimeoutId = null;
        void refreshAdminData(false);
      }, 900);
    });

    return () => {
      unsubscribeConnection();
      unsubscribeEvents();
      if (refreshTimeoutId !== null) {
        window.clearTimeout(refreshTimeoutId);
      }
      stream.stop();
    };
  }, [refreshAdminData, userHasAdminPower]);

  useEffect(() => {
    if (!userHasAdminPower) {
      return;
    }

    const delayMs = Math.max(5, settings.pollingSeconds) * 1000;
    const intervalId = window.setInterval(() => {
      void refreshAdminData(false);
    }, streamConnected ? delayMs * 2 : delayMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshAdminData, settings.pollingSeconds, streamConnected, userHasAdminPower]);

  const metrics = useMemo(() => {
    const criticalVehicles = fleet.filter((vehicle) => Number(vehicle.probability) >= 80).length;
    const unreadNotifications = notifications.filter((notification) => !notification.read).length;

    return {
      fleetCount: fleet.length,
      criticalVehicles,
      pendingApprovals: recommendations.length,
      unreadNotifications,
      securityEvents: events.filter((event) => event.severity !== "normal").length,
      pendingVehicleRequests: vehicleDrafts.length,
    };
  }, [events, fleet, notifications, recommendations.length, vehicleDrafts.length]);

  const highRiskVehicles = useMemo(() => {
    return [...fleet]
      .sort((left, right) => Number(right.probability) - Number(left.probability))
      .slice(0, 10);
  }, [fleet]);

  const topRecommendations = useMemo(() => {
    return [...recommendations]
      .sort((left, right) => Number(right.risk_score || 0) - Number(left.risk_score || 0))
      .slice(0, 8);
  }, [recommendations]);

  const handleRecommendationAction = useCallback(
    async (recommendationId: string, action: "approve" | "reject") => {
      if (!userHasAdminPower) {
        setFeedback({ kind: "error", text: "Only admin roles can run control-plane actions." });
        return;
      }

      setBusyRecommendationId(recommendationId);
      setFeedback(null);

      try {
        if (action === "approve") {
          await api.approveRecommendation(recommendationId, user?.email, "Approved from admin control plane");
          appendAudit("recommendation.approve", `Approved ${recommendationId}`);
          setFeedback({ kind: "success", text: `Approved recommendation ${recommendationId}.` });
        } else {
          await api.rejectRecommendation(recommendationId, user?.email, "Rejected from admin control plane");
          appendAudit("recommendation.reject", `Rejected ${recommendationId}`);
          setFeedback({ kind: "info", text: `Rejected recommendation ${recommendationId}.` });
        }

        await refreshAdminData(false);
      } catch (error) {
        setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Decision failed." });
      } finally {
        setBusyRecommendationId(null);
      }
    },
    [appendAudit, refreshAdminData, user?.email, userHasAdminPower],
  );

  const handleMarkNotificationRead = useCallback(
    async (notificationId: string) => {
      try {
        await api.markNotificationRead(notificationId);
        appendAudit("notification.read", `Marked ${notificationId} as read`);
        setFeedback({ kind: "success", text: `Notification ${notificationId} marked as read.` });
        await refreshAdminData(false);
      } catch (error) {
        setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Failed to mark notification as read." });
      }
    },
    [appendAudit, refreshAdminData],
  );

  const handleAddVehicleDraft = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const vin = newVehicleVin.trim();
      const model = newVehicleModel.trim();
      const location = newVehicleLocation.trim();
      if (!vin || !model || !location) {
        setFeedback({ kind: "error", text: "VIN, model, and location are required." });
        return;
      }

      const nextDraft: VehicleRequestDraft = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        vin,
        model,
        location,
        createdAt: new Date().toISOString(),
        status: "pending-endpoint",
      };

      setVehicleDrafts((previous) => {
        const next = [nextDraft, ...previous].slice(0, 100);
        persistVehicleDrafts(next);
        return next;
      });

      appendAudit("fleet.add-request", `Captured new vehicle request for ${vin}`);
      setFeedback({
        kind: "info",
        text: "Vehicle request saved in admin queue. Backend create-vehicle endpoint is pending implementation.",
      });

      setNewVehicleVin("");
      setNewVehicleModel("");
      setNewVehicleLocation("");
    },
    [appendAudit, newVehicleLocation, newVehicleModel, newVehicleVin, persistVehicleDrafts],
  );

  const handleFleetLifecycleAction = useCallback(
    (vehicle: VehicleSummary, action: "retire" | "delete") => {
      appendAudit(`fleet.${action}`, `${action.toUpperCase()} requested for ${vehicle.vin}`);
      setFeedback({
        kind: "info",
        text: `${action.toUpperCase()} action recorded for ${vehicle.vin}. Endpoint wiring is planned in next backend iteration.`,
      });
    },
    [appendAudit],
  );

  const applySettings = useCallback(async () => {
    const sanitized: AdminSettings = {
      pollingSeconds: Math.max(5, Math.min(120, Number(settingsDraft.pollingSeconds) || DEFAULT_SETTINGS.pollingSeconds)),
      defaultRecipient: settingsDraft.defaultRecipient.trim(),
      apiBaseOverride: settingsDraft.apiBaseOverride.trim(),
    };

    setRuntimeApiBase(sanitized.apiBaseOverride);
    setSettings(sanitized);
    setSettingsDraft(sanitized);
    persistSettings(sanitized);

    appendAudit("settings.apply", "Updated admin runtime settings");
    setFeedback({ kind: "success", text: "Admin settings applied." });

    await refreshAdminData(true);
  }, [appendAudit, persistSettings, refreshAdminData, settingsDraft]);

  const resetSettings = useCallback(() => {
    setRuntimeApiBase("");
    setSettings(DEFAULT_SETTINGS);
    setSettingsDraft(DEFAULT_SETTINGS);
    persistSettings(DEFAULT_SETTINGS);

    appendAudit("settings.reset", "Reset admin runtime settings");
    setFeedback({ kind: "info", text: "Admin settings reset to defaults." });
  }, [appendAudit, persistSettings]);

  const exportAudit = useCallback(() => {
    const content = JSON.stringify(auditEntries, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `admin-audit-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();

    URL.revokeObjectURL(url);
  }, [auditEntries]);

  const clearAudit = useCallback(() => {
    setAuditEntries([]);
    persistAudit([]);
    setFeedback({ kind: "info", text: "Local audit timeline cleared." });
  }, [persistAudit]);

  const showAccessGate = AUTH_ENABLED && (authLoading || !user || !userHasAdminPower);

  return (
    <div className="service-center-app">
      <div className="ambient-layer" aria-hidden="true" />

      <aside className="sidebar">
        <div className="brand">
          <p className="brand-kicker">Governance</p>
          <h1>Admin Control Plane</h1>
          <p className="brand-copy">
            Central authority for users, security, audit, settings, and fleet lifecycle decisions.
          </p>
        </div>

        <nav className="view-nav" aria-label="Admin modules">
          {VIEW_ITEMS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={`view-tab ${activeView === item.key ? "active" : ""}`}
              onClick={() => setActiveView(item.key)}
              disabled={showAccessGate}
            >
              <span className="view-index">{item.symbol}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-health">
          <div className={`pill ${streamConnected ? "ok" : "warn"}`}>
            Stream: {streamConnected ? "connected" : "polling fallback"}
          </div>
          <div className={`pill ${(readiness?.ready ?? false) ? "ok" : "warn"}`}>
            Backend: {(readiness?.ready ?? false) ? "ready" : "attention needed"}
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h2>{VIEW_ITEMS.find((item) => item.key === activeView)?.label || "Admin"}</h2>
            <p>
              API base: {settings.apiBaseOverride || getPrimaryApiBase()}
              {lastUpdated ? ` | Last sync: ${lastUpdated}` : ""}
            </p>
          </div>
          <div className="topbar-actions">
            <div className="op-signal ok">Role: {user?.role || "unknown"}</div>
            <button type="button" className="ghost-button" onClick={() => void refreshAdminData(true)} disabled={showAccessGate || refreshing}>
              Refresh
            </button>
            {AUTH_ENABLED ? (
              <button type="button" className="ghost-button" onClick={handleLogout} disabled={!token}>
                Logout
              </button>
            ) : null}
          </div>
        </header>

        {!AUTH_ENABLED ? (
          <div className="alert-banner info">
            UI-first mode active: authentication gate is disabled. Backend data and modules are available for design and integration.
          </div>
        ) : null}

        {feedback ? <div className={`alert-banner ${feedback.kind}`}>{feedback.text}</div> : null}
        {errorMessage ? <div className="alert-banner error">{errorMessage}</div> : null}

        {showAccessGate ? (
          <section className="panel">
            <h3>Admin Access Required</h3>
            {authLoading ? <p className="panel-copy">Validating your admin identity...</p> : null}
            {!authLoading && !token ? (
              <>
                <p className="panel-copy">
                  No token found for this Admin UI origin. Sign in below to create an admin session for this app.
                </p>
                <form className="form-grid" onSubmit={handleLoginSubmit}>
                  <label>
                    Email
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      placeholder="admin@fleet.local"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      placeholder="Enter your password"
                    />
                  </label>
                  <div className="row-actions">
                    <button type="submit" disabled={loginBusy}>
                      {loginBusy ? "Signing In..." : "Sign In"}
                    </button>
                  </div>
                </form>
              </>
            ) : null}
            {!authLoading && token && !user ? (
              <>
                <p className="panel-copy">{authError || "Unable to load user profile from auth service."}</p>
                <div className="row-actions">
                  <button type="button" onClick={handleLogout}>Clear Session</button>
                </div>
              </>
            ) : null}
            {!authLoading && user && !userHasAdminPower ? (
              <p className="panel-copy">
                Your role ({user.role}) does not have admin control-plane permission. Use SYSTEM_ADMIN or ADMIN.
              </p>
            ) : null}
          </section>
        ) : null}

        {!showAccessGate && loading ? <div className="loading-card">Loading admin control-plane data...</div> : null}

        {!showAccessGate && !loading && activeView === "dashboard" ? (
          <section className="view-stack">
            <div className="metric-grid">
              <article className="metric-card tone-cyan">
                <p>Fleet Assets</p>
                <h3>{metrics.fleetCount}</h3>
              </article>
              <article className="metric-card tone-rose">
                <p>Critical Vehicles</p>
                <h3>{metrics.criticalVehicles}</h3>
              </article>
              <article className="metric-card tone-amber">
                <p>Pending Approvals</p>
                <h3>{metrics.pendingApprovals}</h3>
              </article>
              <article className="metric-card tone-violet">
                <p>Unread Alerts</p>
                <h3>{metrics.unreadNotifications}</h3>
              </article>
              <article className="metric-card tone-slate">
                <p>Security Events</p>
                <h3>{metrics.securityEvents}</h3>
              </article>
              <article className="metric-card tone-teal">
                <p>Add-Vehicle Queue</p>
                <h3>{metrics.pendingVehicleRequests}</h3>
              </article>
            </div>

            <div className="panel two-column">
              <section>
                <h3>Priority Recommendations</h3>
                <div className="list-stack">
                  {topRecommendations.length === 0 ? <p className="empty-text">No pending recommendations.</p> : null}
                  {topRecommendations.map((recommendation) => {
                    const busy = busyRecommendationId === recommendation.recommendation_id;
                    return (
                      <article key={recommendation.recommendation_id} className="detail-card">
                        <header>
                          <div>
                            <strong>{recommendation.vehicle_id}</strong>
                            <p>{recommendation.recommendation_id}</p>
                          </div>
                          <div className="inline-badges">
                            <span className="badge priority-high">{toReadable(recommendation.priority || "medium")}</span>
                            <span className="badge status-recommended">{toReadable(recommendation.status)}</span>
                          </div>
                        </header>
                        <p className="reason-copy">{recommendation.reason || "No recommendation note."}</p>
                        <div className="row-actions">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRecommendationAction(recommendation.recommendation_id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="danger"
                            disabled={busy}
                            onClick={() => void handleRecommendationAction(recommendation.recommendation_id, "reject")}
                          >
                            Reject
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3>Live Security Pulse</h3>
                <div className="list-stack">
                  {events.length === 0 ? <p className="empty-text">Waiting for stream events.</p> : null}
                  {events.slice(0, 10).map((event) => (
                    <article key={event.id} className="list-card wide">
                      <div>
                        <strong>{event.topic}</strong>
                        <p>{event.summary}</p>
                      </div>
                      <div className="inline-badges">
                        <span className={`badge ${event.severity === "critical" ? "priority-critical" : event.severity === "warning" ? "priority-medium" : "priority-low"}`}>
                          {event.severity}
                        </span>
                        <span className="badge status-rejected">{event.time}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {!showAccessGate && !loading && activeView === "users" ? (
          <section className="view-stack">
            <div className="panel">
              <h3>Current Admin Identity</h3>
              <div className="detail-grid">
                <p>
                  <span>Full Name</span>
                  {user?.fullName || "-"}
                </p>
                <p>
                  <span>Email</span>
                  {user?.email || "-"}
                </p>
                <p>
                  <span>Role</span>
                  {user?.role || "-"}
                </p>
                <p>
                  <span>Location</span>
                  {user?.location || "-"}
                </p>
                <p>
                  <span>Plant</span>
                  {user?.plant || "-"}
                </p>
              </div>
            </div>

            <div className="panel">
              <h3>User and Role Matrix (Phase 1)</h3>
              <p className="panel-copy">
                Backend user CRUD endpoints are planned; this matrix defines permission intent and control ownership.
              </p>
              <div className="table-wrap">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Scope</th>
                      <th>Modules</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_MATRIX.map((row) => (
                      <tr key={row.role}>
                        <td>{row.role}</td>
                        <td>{row.scope}</td>
                        <td>{row.modules}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {!showAccessGate && !loading && activeView === "fleet" ? (
          <section className="view-stack">
            <div className="panel">
              <h3>Add New Vehicle Request</h3>
              <p className="panel-copy">
                Captures admin requests now and records audit entries. Backend vehicle-create endpoint is queued for the next iteration.
              </p>
              <form className="form-grid" onSubmit={handleAddVehicleDraft}>
                <label>
                  VIN
                  <input value={newVehicleVin} onChange={(event) => setNewVehicleVin(event.target.value)} placeholder="V-501" />
                </label>
                <label>
                  Model
                  <input value={newVehicleModel} onChange={(event) => setNewVehicleModel(event.target.value)} placeholder="Tesla Semi" />
                </label>
                <label>
                  Location
                  <input value={newVehicleLocation} onChange={(event) => setNewVehicleLocation(event.target.value)} placeholder="Detroit Plant" />
                </label>
                <div className="row-actions">
                  <button type="submit">Save Request</button>
                </div>
              </form>
            </div>

            <div className="panel two-column">
              <section>
                <h3>Vehicle Request Queue</h3>
                <div className="list-stack">
                  {vehicleDrafts.length === 0 ? <p className="empty-text">No pending vehicle requests.</p> : null}
                  {vehicleDrafts.map((request) => (
                    <article key={request.id} className="list-card wide">
                      <div>
                        <strong>{request.vin}</strong>
                        <p>
                          {request.model} | {request.location}
                        </p>
                      </div>
                      <div className="inline-badges">
                        <span className="badge status-pending">{request.status}</span>
                        <span className="badge status-rejected">{compactDateTime(request.createdAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section>
                <h3>Fleet Lifecycle Actions</h3>
                <div className="list-stack">
                  {highRiskVehicles.slice(0, 8).map((vehicle) => (
                    <article key={vehicle.vin} className="detail-card">
                      <header>
                        <div>
                          <strong>{vehicle.vin}</strong>
                          <p>{vehicle.model}</p>
                        </div>
                        <span className="badge priority-high">{Math.round(Number(vehicle.probability) || 0)}%</span>
                      </header>
                      <p className="reason-copy">{vehicle.predictedFailure}</p>
                      <div className="row-actions">
                        <button type="button" onClick={() => handleFleetLifecycleAction(vehicle, "retire")}>Retire</button>
                        <button type="button" className="danger" onClick={() => handleFleetLifecycleAction(vehicle, "delete")}>Delete</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {!showAccessGate && !loading && activeView === "security" ? (
          <section className="view-stack">
            <div className="panel two-column">
              <section>
                <h3>High-Risk Vehicle Watch</h3>
                <div className="list-stack">
                  {highRiskVehicles.length === 0 ? <p className="empty-text">No fleet data in scope.</p> : null}
                  {highRiskVehicles.map((vehicle) => (
                    <article key={vehicle.vin} className="list-card wide">
                      <div>
                        <strong>{vehicle.vin}</strong>
                        <p>{vehicle.location}</p>
                      </div>
                      <div className="inline-badges">
                        <span className={`badge ${Number(vehicle.probability) >= 80 ? "priority-critical" : "priority-medium"}`}>
                          {Math.round(Number(vehicle.probability) || 0)}%
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section>
                <h3>Realtime Security Events</h3>
                <div className="list-stack">
                  {events.length === 0 ? <p className="empty-text">No security events captured yet.</p> : null}
                  {events.slice(0, 14).map((event) => (
                    <article key={event.id} className="detail-card">
                      <header>
                        <div>
                          <strong>{event.topic}</strong>
                          <p>{event.time}</p>
                        </div>
                        <span className={`badge ${event.severity === "critical" ? "priority-critical" : event.severity === "warning" ? "priority-medium" : "priority-low"}`}>
                          {event.severity}
                        </span>
                      </header>
                      <p className="reason-copy">{event.summary}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {!showAccessGate && !loading && activeView === "audit" ? (
          <section className="view-stack">
            <div className="panel-controls">
              <button type="button" onClick={exportAudit} disabled={auditEntries.length === 0}>Export JSON</button>
              <button type="button" className="danger" onClick={clearAudit} disabled={auditEntries.length === 0}>Clear Local Audit</button>
            </div>

            <div className="panel">
              <h3>Audit Timeline</h3>
              <p className="panel-copy">Phase 1 stores admin audit entries locally. Server-side immutable audit API is the next backend milestone.</p>
              <div className="list-stack">
                {auditEntries.length === 0 ? <p className="empty-text">No audit entries recorded yet.</p> : null}
                {auditEntries.map((entry) => (
                  <article key={entry.id} className="list-card wide">
                    <div>
                      <strong>{entry.action}</strong>
                      <p>{entry.detail}</p>
                      <p>{entry.actor}</p>
                    </div>
                    <span className="badge status-rejected">{compactDateTime(entry.time)}</span>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!showAccessGate && !loading && activeView === "settings" ? (
          <section className="view-stack">
            <div className="panel">
              <h3>Global Runtime Settings</h3>
              <div className="form-grid">
                <label>
                  API Base URL Override
                  <input
                    value={settingsDraft.apiBaseOverride}
                    onChange={(event) => setSettingsDraft((previous) => ({ ...previous, apiBaseOverride: event.target.value }))}
                    placeholder="http://localhost:8000/api"
                  />
                </label>
                <label>
                  Polling Interval (seconds)
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={settingsDraft.pollingSeconds}
                    onChange={(event) =>
                      setSettingsDraft((previous) => ({
                        ...previous,
                        pollingSeconds: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Default Recipient Filter
                  <input
                    value={settingsDraft.defaultRecipient}
                    onChange={(event) => setSettingsDraft((previous) => ({ ...previous, defaultRecipient: event.target.value }))}
                    placeholder="maintenance.manager@fleet.local"
                  />
                </label>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => void applySettings()}>Apply Settings</button>
                <button type="button" className="danger" onClick={resetSettings}>Reset</button>
              </div>
            </div>
          </section>
        ) : null}

        {!showAccessGate && !loading && activeView === "diagnostics" ? (
          <section className="view-stack">
            <div className="panel">
              <h3>System Diagnostics</h3>
              <div className="detail-grid">
                <p>
                  <span>Auth Service</span>
                  {getAuthBaseUrl()}
                </p>
                <p>
                  <span>API Base</span>
                  {settings.apiBaseOverride || getPrimaryApiBase()}
                </p>
                <p>
                  <span>Stream Status</span>
                  {streamConnected ? "Connected" : "Fallback polling"}
                </p>
                <p>
                  <span>Readiness</span>
                  {readiness?.ready ? "Ready" : "Warning"}
                </p>
              </div>
            </div>

            <div className="panel">
              <h3>Readiness Detail</h3>
              {!readiness ? <p className="empty-text">No readiness payload available.</p> : null}
              {readiness ? (
                <pre className="diagnostic-pre">{JSON.stringify(readiness, null, 2)}</pre>
              ) : null}
            </div>

            <div className="panel">
              <h3>Recent Notifications</h3>
              <div className="list-stack">
                {notifications.slice(0, 10).map((notification, index) => {
                  const identifier = notification.id || `fallback-${notification.vehicle_id}-${index}`;
                  return (
                    <article key={identifier} className="list-card wide">
                      <div>
                        <strong>{notification.title || notification.notification_type || "Notification"}</strong>
                        <p>{notification.vehicle_id}</p>
                      </div>
                      <div className="row-actions">
                        <span className={`badge ${notification.read ? "status-rejected" : "status-pending"}`}>
                          {notification.read ? "Read" : "Unread"}
                        </span>
                        <button
                          type="button"
                          disabled={!notification.id || Boolean(notification.read)}
                          onClick={() => notification.id && void handleMarkNotificationRead(notification.id)}
                        >
                          Mark Read
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
};

export default App;
