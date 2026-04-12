import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./services/api";
import { getPrimaryApiBase, getRuntimeApiBase, setRuntimeApiBase } from "./services/config";
import { stream, type StreamEvent } from "./services/stream";
import type {
  BookingRecord,
  NotificationItem,
  ReadinessStatus,
  SchedulingRecommendation,
  VehicleSummary,
} from "./types";

type ViewKey = "dashboard" | "inbox" | "calendar" | "notifications" | "vehicles" | "settings";

type FeedbackKind = "success" | "error" | "info";

interface FeedbackMessage {
  kind: FeedbackKind;
  text: string;
}

interface UiSettings {
  pollingSeconds: number;
  recipientFilter: string;
  approverEmail: string;
  apiBaseOverride: string;
}

const UI_SETTINGS_KEY = "serviceCenter.ui.settings.v1";

const DEFAULT_SETTINGS: UiSettings = {
  pollingSeconds: 20,
  recipientFilter: "",
  approverEmail: "maintenance.manager@fleet.local",
  apiBaseOverride: getRuntimeApiBase() || "",
};

const VIEW_ITEMS: Array<{ key: ViewKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "inbox", label: "Approval Inbox" },
  { key: "calendar", label: "Booking Calendar" },
  { key: "notifications", label: "Notification Center" },
  { key: "vehicles", label: "Vehicle Quick Panel" },
];

const STATUS_BADGE_CLASS: Record<string, string> = {
  recommended: "status-recommended",
  booked: "status-booked",
  pending_customer_confirmation: "status-pending",
  customer_declined: "status-declined",
  conflict: "status-conflict",
  rejected: "status-rejected",
  scheduled: "status-booked",
};

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  critical: "priority-critical",
  high: "priority-high",
  medium: "priority-medium",
  low: "priority-low",
};

const safeParseSettings = (): UiSettings => {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  const raw = window.localStorage.getItem(UI_SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      pollingSeconds:
        typeof parsed.pollingSeconds === "number" && Number.isFinite(parsed.pollingSeconds)
          ? Math.min(120, Math.max(5, parsed.pollingSeconds))
          : DEFAULT_SETTINGS.pollingSeconds,
      recipientFilter: typeof parsed.recipientFilter === "string" ? parsed.recipientFilter : "",
      approverEmail: typeof parsed.approverEmail === "string" ? parsed.approverEmail : DEFAULT_SETTINGS.approverEmail,
      apiBaseOverride:
        typeof parsed.apiBaseOverride === "string" ? parsed.apiBaseOverride : DEFAULT_SETTINGS.apiBaseOverride,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const persistSettings = (settings: UiSettings): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(settings));
};

const toDateKey = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const prettyText = (value?: string | null): string => {
  if (!value) {
    return "-";
  }
  return value.replace(/_/g, " ");
};

const shouldRefreshFromStream = (event: StreamEvent): boolean => {
  const topic = String(event.topic || "").toLowerCase();
  return (
    topic.startsWith("scheduling.") ||
    topic.startsWith("notification.") ||
    topic.startsWith("analysis.") ||
    topic.startsWith("anomaly.") ||
    topic.startsWith("telemetry.")
  );
};

const getCalendarDays = (monthAnchor: Date): Date[] => {
  const anchor = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const firstWeekday = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - firstWeekday);

  const days: Date[] = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    days.push(day);
  }
  return days;
};

const App = () => {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [settings, setSettings] = useState<UiSettings>(safeParseSettings);

  const [fleet, setFleet] = useState<VehicleSummary[]>([]);
  const [recommendations, setRecommendations] = useState<SchedulingRecommendation[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);

  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [busyRecommendationId, setBusyRecommendationId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [streamConnected, setStreamConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const [vehicleQuery, setVehicleQuery] = useState<string>("");
  const [recommendationStatusFilter, setRecommendationStatusFilter] = useState<string>("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState<boolean>(false);

  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateKey(new Date()));

  const [settingsDraft, setSettingsDraft] = useState<UiSettings>(settings);

  const refreshAll = useCallback(
    async (showLoader: boolean) => {
      if (showLoader) {
        setLoading(true);
      }
      setErrorMessage("");

      const visibleCalendarDays = getCalendarDays(calendarMonth);
      const calendarFrom = new Date(visibleCalendarDays[0]);
      calendarFrom.setHours(0, 0, 0, 0);

      const calendarTo = new Date(visibleCalendarDays[visibleCalendarDays.length - 1]);
      calendarTo.setHours(23, 59, 59, 999);

      try {
        const [fleetRows, recommendationRows, bookingRows, notificationRows, readinessStatus] = await Promise.all([
          api.getFleetStatus(),
          api.getRecommendations({
            recipient: settings.recipientFilter.trim() || undefined,
            limit: 140,
          }),
          api.getBookings({
            fromDate: calendarFrom.toISOString(),
            toDate: calendarTo.toISOString(),
            limit: 1500,
          }),
          api.getNotifications({
            recipient: settings.recipientFilter.trim() || undefined,
            limit: 160,
          }),
          api.getReadiness(),
        ]);

        setFleet(fleetRows);
        setRecommendations(recommendationRows);
        setBookings(bookingRows);
        setNotifications(notificationRows);
        setReadiness(readinessStatus);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to refresh service center data";
        setErrorMessage(message);
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [calendarMonth, settings.recipientFilter],
  );

  useEffect(() => {
    void refreshAll(true);
  }, [refreshAll]);

  useEffect(() => {
    stream.start();

    let refreshTimer: number | null = null;

    const unsubscribeConnection = stream.subscribeConnection((connected) => {
      setStreamConnected(connected);
    });

    const unsubscribeEvents = stream.subscribe((event) => {
      if (!shouldRefreshFromStream(event)) {
        return;
      }

      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshAll(false);
      }, 750);
    });

    return () => {
      unsubscribeConnection();
      unsubscribeEvents();
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      stream.stop();
    };
  }, [refreshAll]);

  useEffect(() => {
    const disconnectedDelay = Math.max(5, settings.pollingSeconds) * 1000;
    const connectedDelay = Math.max(45, settings.pollingSeconds * 3) * 1000;
    const intervalDelay = streamConnected ? connectedDelay : disconnectedDelay;

    const intervalId = window.setInterval(() => {
      void refreshAll(false);
    }, intervalDelay);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshAll, settings.pollingSeconds, streamConnected]);

  useEffect(() => {
    setSettingsDraft(settings);
  }, [settings]);

  const dashboardMetrics = useMemo(() => {
    const unread = notifications.filter((item) => !item.read).length;
    const openRecommendations = recommendations.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return status === "recommended" || status === "pending_customer_confirmation";
    }).length;
    const criticalVehicles = fleet.filter((vehicle) => Number(vehicle.probability) >= 80).length;
    const today = toDateKey(new Date());
    const todayBookings = bookings.filter((booking) => toDateKey(booking.scheduled_date) === today).length;

    return {
      totalVehicles: fleet.length,
      openRecommendations,
      criticalVehicles,
      todayBookings,
      unreadNotifications: unread,
    };
  }, [bookings, fleet, notifications, recommendations]);

  const filteredVehicles = useMemo(() => {
    const query = vehicleQuery.trim().toLowerCase();
    if (!query) {
      return fleet;
    }
    return fleet.filter((vehicle) => {
      const haystack = [vehicle.vin, vehicle.model, vehicle.location, vehicle.predictedFailure]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [fleet, vehicleQuery]);

  const filteredRecommendations = useMemo(() => {
    if (recommendationStatusFilter === "all") {
      return recommendations;
    }
    return recommendations.filter(
      (recommendation) => String(recommendation.status || "").toLowerCase() === recommendationStatusFilter,
    );
  }, [recommendationStatusFilter, recommendations]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (showUnreadOnly && item.read) {
        return false;
      }
      if (settings.recipientFilter.trim()) {
        return String(item.recipient || "").toLowerCase().includes(settings.recipientFilter.trim().toLowerCase());
      }
      return true;
    });
  }, [notifications, settings.recipientFilter, showUnreadOnly]);

  const bookingMapByDate = useMemo(() => {
    const map = new Map<string, BookingRecord[]>();
    bookings.forEach((booking) => {
      const key = toDateKey(booking.scheduled_date);
      if (!key) {
        return;
      }
      const existing = map.get(key);
      if (existing) {
        existing.push(booking);
      } else {
        map.set(key, [booking]);
      }
    });

    map.forEach((value) => {
      value.sort((left, right) => new Date(left.scheduled_date).getTime() - new Date(right.scheduled_date).getTime());
    });

    return map;
  }, [bookings]);

  const selectedDateBookings = useMemo(() => bookingMapByDate.get(selectedDate) || [], [bookingMapByDate, selectedDate]);

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);

  const handleRecommendationDecision = useCallback(
    async (recommendationId: string, decision: "approve" | "reject") => {
      setBusyRecommendationId(recommendationId);
      setFeedback(null);

      try {
        const notes = decisionNotes[recommendationId] || "";
        const approver = settings.approverEmail.trim() || undefined;

        if (decision === "approve") {
          const result = await api.approveRecommendation(recommendationId, approver, notes);
          const summary =
            result.status === "booked"
              ? `Approved ${recommendationId}. Booking ${result.booking_id || "generated"} confirmed.`
              : `Approved ${recommendationId}. Status: ${prettyText(result.status)}.`;
          setFeedback({ kind: "success", text: summary });
        } else {
          const result = await api.rejectRecommendation(recommendationId, approver, notes);
          setFeedback({ kind: "info", text: `Rejected ${recommendationId}. Status: ${prettyText(result.status)}.` });
        }

        await refreshAll(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Recommendation decision failed";
        setFeedback({ kind: "error", text: message });
      } finally {
        setBusyRecommendationId(null);
      }
    },
    [decisionNotes, refreshAll, settings.approverEmail],
  );

  const handlePendingAdminAction = useCallback(
    async (recommendationId: string, action: "force_book" | "cancel_pending") => {
      setBusyRecommendationId(recommendationId);
      setFeedback(null);

      try {
        const notes = decisionNotes[recommendationId] || "";
        const approver = settings.approverEmail.trim() || undefined;

        if (action === "force_book") {
          const result = await api.adminForceBookRecommendation(recommendationId, approver, notes);
          const message =
            result.status === "booked"
              ? `Force-booked ${recommendationId}. Booking ${result.booking_id || "generated"} confirmed.`
              : `Force-book action returned status: ${prettyText(result.status)}.`;
          setFeedback({ kind: "success", text: message });
        } else {
          const result = await api.adminCancelPendingRecommendation(recommendationId, approver, notes);
          setFeedback({
            kind: "info",
            text: `Cancelled pending confirmation for ${recommendationId}. Status: ${prettyText(result.status)}.`,
          });
        }

        await refreshAll(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Admin action failed";
        setFeedback({ kind: "error", text: message });
      } finally {
        setBusyRecommendationId(null);
      }
    },
    [decisionNotes, refreshAll, settings.approverEmail],
  );

  const handleNotificationRead = useCallback(
    async (notificationId: string) => {
      try {
        await api.markNotificationRead(notificationId);
        setFeedback({ kind: "success", text: `Notification ${notificationId} marked as read.` });
        await refreshAll(false);
      } catch (error) {
        setFeedback({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to mark notification as read",
        });
      }
    },
    [refreshAll],
  );

  const handleNotificationAcknowledge = useCallback(
    async (notificationId: string) => {
      try {
        await api.acknowledgeNotification(notificationId);
        setFeedback({ kind: "success", text: `Notification ${notificationId} acknowledged.` });
        await refreshAll(false);
      } catch (error) {
        setFeedback({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to acknowledge notification",
        });
      }
    },
    [refreshAll],
  );

  const applySettings = useCallback(async () => {
    const sanitizedPolling = Math.max(5, Math.min(120, Number(settingsDraft.pollingSeconds) || DEFAULT_SETTINGS.pollingSeconds));
    const sanitizedSettings: UiSettings = {
      pollingSeconds: sanitizedPolling,
      recipientFilter: settingsDraft.recipientFilter.trim(),
      approverEmail: settingsDraft.approverEmail.trim() || DEFAULT_SETTINGS.approverEmail,
      apiBaseOverride: settingsDraft.apiBaseOverride.trim(),
    };

    setRuntimeApiBase(sanitizedSettings.apiBaseOverride);
    setSettings(sanitizedSettings);
    persistSettings(sanitizedSettings);
    setFeedback({ kind: "success", text: "Settings applied. Refreshing data source." });

    stream.stop();
    stream.start();
    await refreshAll(true);
  }, [refreshAll, settingsDraft]);

  const resetSettings = useCallback(() => {
    setRuntimeApiBase("");
    setSettings(DEFAULT_SETTINGS);
    setSettingsDraft(DEFAULT_SETTINGS);
    persistSettings(DEFAULT_SETTINGS);
    setFeedback({ kind: "info", text: "Settings reset to defaults." });
  }, []);

  return (
    <div className="service-center-app">
      <div className="ambient-layer" aria-hidden="true" />

      <aside className="sidebar">
        <div className="brand">
          <p className="brand-kicker">Operations</p>
          <h1>Service Center Console</h1>
          <p className="brand-copy">Manage approvals, bookings, and customer-facing notifications in one cockpit.</p>
        </div>

        <nav className="view-nav" aria-label="Service center sections">
          {VIEW_ITEMS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={`view-tab ${activeView === item.key ? "active" : ""}`}
              onClick={() => setActiveView(item.key)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-health">
          <div className={`pill ${streamConnected ? "ok" : "warn"}`}>
            Stream: {streamConnected ? "connected" : "polling fallback"}
          </div>
          <div className={`pill ${(readiness?.ready ?? false) ? "ok" : "warn"}`}>
            Backend: {(readiness?.ready ?? false) ? "ready" : "check warnings"}
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h2>{VIEW_ITEMS.find((item) => item.key === activeView)?.label}</h2>
            <p>
              API base: {settings.apiBaseOverride || getPrimaryApiBase()}
              {lastUpdated ? ` | Last updated: ${lastUpdated}` : ""}
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={() => void refreshAll(true)}>
            Refresh Now
          </button>
        </header>

        {feedback ? <div className={`alert-banner ${feedback.kind}`}>{feedback.text}</div> : null}
        {errorMessage ? <div className="alert-banner error">{errorMessage}</div> : null}

        {loading ? <div className="loading-card">Loading live service data...</div> : null}

        {!loading && activeView === "dashboard" ? (
          <section className="view-stack">
            <div className="metric-grid">
              <article className="metric-card">
                <p>Total Vehicles</p>
                <h3>{dashboardMetrics.totalVehicles}</h3>
              </article>
              <article className="metric-card">
                <p>Open Recommendations</p>
                <h3>{dashboardMetrics.openRecommendations}</h3>
              </article>
              <article className="metric-card">
                <p>Critical Vehicles</p>
                <h3>{dashboardMetrics.criticalVehicles}</h3>
              </article>
              <article className="metric-card">
                <p>Today Bookings</p>
                <h3>{dashboardMetrics.todayBookings}</h3>
              </article>
              <article className="metric-card">
                <p>Unread Notifications</p>
                <h3>{dashboardMetrics.unreadNotifications}</h3>
              </article>
            </div>

            <div className="panel two-column">
              <section>
                <h3>Live Risk Radar</h3>
                <div className="list-stack">
                  {fleet.slice(0, 8).map((vehicle) => (
                    <article key={vehicle.vin} className="list-card">
                      <div>
                        <strong>{vehicle.vin}</strong>
                        <p>{vehicle.model}</p>
                      </div>
                      <div>
                        <span className={`risk-dot ${Number(vehicle.probability) >= 80 ? "critical" : "normal"}`} />
                        <strong>{Math.round(Number(vehicle.probability) || 0)}%</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section>
                <h3>Recent Notifications</h3>
                <div className="list-stack">
                  {notifications.slice(0, 8).map((notification, index) => (
                    <article key={notification.id || `${notification.vehicle_id}-${index}`} className="list-card compact">
                      <div>
                        <strong>{notification.title || notification.notification_type || "Notification"}</strong>
                        <p>{notification.vehicle_id}</p>
                      </div>
                      <div>
                        <span className={`mini-pill ${notification.read ? "muted" : "active"}`}>
                          {notification.read ? "read" : "unread"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {!loading && activeView === "inbox" ? (
          <section className="view-stack">
            <div className="panel-controls">
              <label>
                Status Filter
                <select
                  value={recommendationStatusFilter}
                  onChange={(event) => setRecommendationStatusFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="recommended">Recommended</option>
                  <option value="pending_customer_confirmation">Pending Customer Confirmation</option>
                  <option value="booked">Booked</option>
                  <option value="conflict">Conflict</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>

              <label>
                Approver Email
                <input
                  type="email"
                  value={settings.approverEmail}
                  onChange={(event) => {
                    const next = { ...settings, approverEmail: event.target.value };
                    setSettings(next);
                    persistSettings(next);
                  }}
                />
              </label>
            </div>

            <div className="list-stack">
              {filteredRecommendations.length === 0 ? <p className="empty-text">No recommendations found.</p> : null}

              {filteredRecommendations.map((recommendation) => {
                const status = String(recommendation.status || "").toLowerCase();
                const priority = String(recommendation.priority || "medium").toLowerCase();
                const canDecide = status === "recommended";
                const note = decisionNotes[recommendation.recommendation_id] || "";
                const busy = busyRecommendationId === recommendation.recommendation_id;

                return (
                  <article key={recommendation.recommendation_id} className="detail-card">
                    <header>
                      <div>
                        <strong>{recommendation.vehicle_id}</strong>
                        <p>{recommendation.recommendation_id}</p>
                      </div>
                      <div className="inline-badges">
                        <span className={`badge ${PRIORITY_BADGE_CLASS[priority] || PRIORITY_BADGE_CLASS.medium}`}>
                          {prettyText(priority)}
                        </span>
                        <span className={`badge ${STATUS_BADGE_CLASS[status] || "status-recommended"}`}>
                          {prettyText(status)}
                        </span>
                      </div>
                    </header>

                    <div className="detail-grid">
                      <p>
                        <span>Recommended Start</span>
                        {formatDateTime(recommendation.recommended_start)}
                      </p>
                      <p>
                        <span>Duration</span>
                        {recommendation.estimated_duration_hours}h
                      </p>
                      <p>
                        <span>Service Type</span>
                        {recommendation.service_type || "repair"}
                      </p>
                      <p>
                        <span>Recipient</span>
                        {recommendation.recipient || "-"}
                      </p>
                    </div>

                    <p className="reason-copy">{recommendation.reason || "No notes available."}</p>

                    {status === "pending_customer_confirmation" ? (
                      <p className="channel-note">
                        Awaiting customer {recommendation.customer_confirmation_method || "confirmation"}
                        {recommendation.customer_confirmation_phone
                          ? ` (${recommendation.customer_confirmation_phone})`
                          : recommendation.customer_confirmation_email
                            ? ` (${recommendation.customer_confirmation_email})`
                            : ""}
                      </p>
                    ) : null}

                    <textarea
                      placeholder="Add decision note"
                      value={note}
                      onChange={(event) =>
                        setDecisionNotes((previous) => ({
                          ...previous,
                          [recommendation.recommendation_id]: event.target.value,
                        }))
                      }
                    />

                    <div className="row-actions">
                      <button
                        type="button"
                        disabled={!canDecide || busy}
                        onClick={() => void handleRecommendationDecision(recommendation.recommendation_id, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={!canDecide || busy}
                        onClick={() => void handleRecommendationDecision(recommendation.recommendation_id, "reject")}
                      >
                        Reject
                      </button>
                      {status === "pending_customer_confirmation" ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handlePendingAdminAction(recommendation.recommendation_id, "force_book")
                            }
                            title="Emergency override: force booking without waiting for customer reply"
                          >
                            Force Book (Admin)
                          </button>
                          <button
                            type="button"
                            className="danger"
                            disabled={busy}
                            onClick={() =>
                              void handlePendingAdminAction(recommendation.recommendation_id, "cancel_pending")
                            }
                            title="Cancel the pending customer confirmation request"
                          >
                            Cancel Pending
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {!loading && activeView === "calendar" ? (
          <section className="view-stack">
            <div className="panel-controls split">
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))
                }
              >
                Previous
              </button>
              <h3>
                {calendarMonth.toLocaleString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))
                }
              >
                Next
              </button>
            </div>

            <div className="calendar-grid">
              {"Mon Tue Wed Thu Fri Sat Sun".split(" ").map((label) => (
                <div key={label} className="calendar-head">
                  {label}
                </div>
              ))}

              {calendarDays.map((day) => {
                const key = toDateKey(day);
                const dayBookings = bookingMapByDate.get(key) || [];
                const isInCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isSelected = key === selectedDate;

                return (
                  <button
                    type="button"
                    key={key}
                    className={`calendar-cell ${isInCurrentMonth ? "" : "outside"} ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedDate(key)}
                  >
                    <span>{day.getDate()}</span>
                    {dayBookings.length > 0 ? <small>{dayBookings.length} bookings</small> : null}
                  </button>
                );
              })}
            </div>

            <div className="panel">
              <h3>Bookings on {selectedDate || "selected day"}</h3>
              {selectedDateBookings.length === 0 ? <p className="empty-text">No bookings on this date.</p> : null}

              <div className="list-stack">
                {selectedDateBookings.map((booking) => {
                  const bookingStatus = String(booking.status || "scheduled").toLowerCase();
                  return (
                    <article key={booking.booking_id} className="list-card wide">
                      <div>
                        <strong>{booking.vehicle_id}</strong>
                        <p>{booking.booking_id}</p>
                        <p>{formatDateTime(booking.scheduled_date)}</p>
                      </div>
                      <div className="inline-badges">
                        <span className={`badge ${STATUS_BADGE_CLASS[bookingStatus] || "status-booked"}`}>
                          {prettyText(bookingStatus)}
                        </span>
                        <span className="badge priority-medium">{prettyText(booking.service_type || "repair")}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {!loading && activeView === "notifications" ? (
          <section className="view-stack">
            <div className="panel-controls">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showUnreadOnly}
                  onChange={(event) => setShowUnreadOnly(event.target.checked)}
                />
                Show unread only
              </label>
            </div>

            <div className="list-stack">
              {filteredNotifications.length === 0 ? <p className="empty-text">No notifications found.</p> : null}

              {filteredNotifications.map((notification, index) => {
                const id = notification.id || `fallback-${notification.vehicle_id}-${index}`;
                return (
                  <article key={id} className="detail-card">
                    <header>
                      <div>
                        <strong>{notification.title || notification.notification_type || "Notification"}</strong>
                        <p>
                          {notification.vehicle_id} | {notification.recipient || "no recipient"}
                        </p>
                      </div>
                      <div className="inline-badges">
                        <span className={`badge ${notification.read ? "status-rejected" : "status-pending"}`}>
                          {notification.read ? "read" : "unread"}
                        </span>
                        <span className={`badge ${notification.acknowledged ? "status-booked" : "status-conflict"}`}>
                          {notification.acknowledged ? "acknowledged" : "pending ack"}
                        </span>
                      </div>
                    </header>

                    <p className="reason-copy">{notification.message || "No message."}</p>

                    <div className="detail-grid">
                      <p>
                        <span>Channel</span>
                        {notification.channel || "-"}
                      </p>
                      <p>
                        <span>Sent At</span>
                        {formatDateTime(notification.sent_at)}
                      </p>
                    </div>

                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => void handleNotificationRead(id)}
                        disabled={!notification.id || Boolean(notification.read)}
                      >
                        Mark Read
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleNotificationAcknowledge(id)}
                        disabled={!notification.id || Boolean(notification.acknowledged)}
                      >
                        Acknowledge
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {!loading && activeView === "vehicles" ? (
          <section className="view-stack">
            <div className="panel-controls">
              <label>
                Search Vehicle
                <input
                  type="text"
                  value={vehicleQuery}
                  onChange={(event) => setVehicleQuery(event.target.value)}
                  placeholder="VIN, model, location, issue"
                />
              </label>
            </div>

            <div className="vehicle-grid">
              {filteredVehicles.length === 0 ? <p className="empty-text">No vehicles match your search.</p> : null}

              {filteredVehicles.map((vehicle) => (
                <article key={vehicle.vin} className="vehicle-card">
                  <header>
                    <div>
                      <h3>{vehicle.vin}</h3>
                      <p>{vehicle.model}</p>
                    </div>
                    <span className={`badge ${Number(vehicle.probability) >= 80 ? "priority-critical" : "priority-low"}`}>
                      {Math.round(Number(vehicle.probability) || 0)}%
                    </span>
                  </header>

                  <p className="fault-line">{vehicle.predictedFailure}</p>

                  <div className="detail-grid">
                    <p>
                      <span>Action</span>
                      {vehicle.action}
                    </p>
                    <p>
                      <span>Location</span>
                      {vehicle.location}
                    </p>
                    <p>
                      <span>Engine Temp</span>
                      {vehicle.engine_temp ?? "-"}
                    </p>
                    <p>
                      <span>Oil Pressure</span>
                      {vehicle.oil_pressure ?? "-"}
                    </p>
                    <p>
                      <span>Owner</span>
                      {vehicle.owners?.full_name || "-"}
                    </p>
                    <p>
                      <span>Contact</span>
                      {vehicle.owners?.phone_number || vehicle.owners?.email || "-"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && activeView === "settings" ? (
          <section className="view-stack">
            <div className="panel">
              <h3>Runtime Connectivity</h3>
              <p className="panel-copy">
                Use this page to point the Service Center UI to another backend instance without changing code.
              </p>

              <div className="form-grid">
                <label>
                  API Base URL Override
                  <input
                    type="text"
                    value={settingsDraft.apiBaseOverride}
                    onChange={(event) =>
                      setSettingsDraft((previous) => ({
                        ...previous,
                        apiBaseOverride: event.target.value,
                      }))
                    }
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
                  Recipient Filter
                  <input
                    type="text"
                    value={settingsDraft.recipientFilter}
                    onChange={(event) =>
                      setSettingsDraft((previous) => ({
                        ...previous,
                        recipientFilter: event.target.value,
                      }))
                    }
                    placeholder="maintenance.manager@fleet.local"
                  />
                </label>

                <label>
                  Default Approver Email
                  <input
                    type="email"
                    value={settingsDraft.approverEmail}
                    onChange={(event) =>
                      setSettingsDraft((previous) => ({
                        ...previous,
                        approverEmail: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="row-actions">
                <button type="button" onClick={() => void applySettings()}>
                  Apply Settings
                </button>
                <button type="button" className="danger" onClick={resetSettings}>
                  Reset Defaults
                </button>
              </div>
            </div>

            <div className="panel">
              <h3>Multi-Frontend Notes</h3>
              <p className="panel-copy">
                You can run multiple frontends against the same backend. Ensure backend CORS allows each frontend origin,
                for example localhost:5173 and localhost:5174 together.
              </p>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
};

export default App;
