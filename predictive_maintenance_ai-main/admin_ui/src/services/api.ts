import {
  getApiBaseCandidates,
  getServiceRootCandidates,
} from "./config";
import type {
  BookingRecord,
  NotificationItem,
  ReadinessStatus,
  SchedulingDecisionResult,
  SchedulingRecommendation,
  VehicleSummary,
} from "../types";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

interface RecommendationQuery {
  status?: string;
  recipient?: string;
  pendingOnly?: boolean;
  limit?: number;
}

interface NotificationQuery {
  vehicleId?: string;
  recipient?: string;
  unreadOnly?: boolean;
  limit?: number;
}

interface BookingQuery {
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

const DEFAULT_TIMEOUT_MS = 9000;

const buildUrl = (baseUrl: string, path: string, query?: RequestOptions["query"]): string => {
  const base = baseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
};

const extractError = (payload: unknown, fallback: string): string => {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const asRecord = payload as Record<string, unknown>;
    const detail = asRecord.detail;
    const message = asRecord.message;

    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
};

const requestWithCandidates = async <T>(
  candidates: string[],
  path: string,
  options: RequestOptions = {},
  fallbackMessage: string,
): Promise<T> => {
  let lastError = fallbackMessage;

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {};
      if (options.body) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(buildUrl(candidate, path, options.query), {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const textBody = await response.text();
      const payload = textBody ? (JSON.parse(textBody) as unknown) : null;

      if (!response.ok) {
        lastError = extractError(payload, fallbackMessage);
        continue;
      }

      return payload as T;
    } catch (error) {
      if (error instanceof Error) {
        lastError = error.message || fallbackMessage;
      }
    } finally {
      window.clearTimeout(timer);
    }
  }

  throw new Error(lastError || fallbackMessage);
};

const requestApi = async <T>(path: string, options: RequestOptions = {}, fallbackMessage: string): Promise<T> => {
  return requestWithCandidates<T>(getApiBaseCandidates(), path, options, fallbackMessage);
};

const requestServiceRoot = async <T>(
  path: string,
  options: RequestOptions = {},
  fallbackMessage: string,
): Promise<T> => {
  return requestWithCandidates<T>(getServiceRootCandidates(), path, options, fallbackMessage);
};

export const api = {
  getFleetStatus: async (): Promise<VehicleSummary[]> => {
    return requestApi<VehicleSummary[]>("/fleet/status", {}, "Failed to load fleet status");
  },

  getBookings: async (query: BookingQuery = {}): Promise<BookingRecord[]> => {
    const result = await requestApi<{ bookings?: BookingRecord[] }>(
      "/scheduling/list",
      {
        query: {
          from_date: query.fromDate,
          to_date: query.toDate,
          limit: query.limit ?? 1200,
        },
      },
      "Failed to load service bookings",
    );
    return result.bookings || [];
  },

  getRecommendations: async (query: RecommendationQuery = {}): Promise<SchedulingRecommendation[]> => {
    const path = query.pendingOnly ? "/scheduling/recommendations/pending" : "/scheduling/recommendations";
    const result = await requestApi<{ recommendations?: SchedulingRecommendation[] }>(
      path,
      {
        query: {
          status: query.status,
          recipient: query.recipient,
          limit: query.limit ?? 120,
        },
      },
      "Failed to load recommendations",
    );
    return result.recommendations || [];
  },

  approveRecommendation: async (
    recommendationId: string,
    approverEmail?: string,
    notes?: string,
  ): Promise<SchedulingDecisionResult> => {
    return requestApi<SchedulingDecisionResult>(
      `/scheduling/recommendations/${recommendationId}/approve`,
      {
        method: "POST",
        body: {
          approver_email: approverEmail,
          notes: notes || "",
        },
      },
      "Failed to approve recommendation",
    );
  },

  rejectRecommendation: async (
    recommendationId: string,
    approverEmail?: string,
    notes?: string,
  ): Promise<SchedulingDecisionResult> => {
    return requestApi<SchedulingDecisionResult>(
      `/scheduling/recommendations/${recommendationId}/reject`,
      {
        method: "POST",
        body: {
          approver_email: approverEmail,
          notes: notes || "",
        },
      },
      "Failed to reject recommendation",
    );
  },

  getNotifications: async (query: NotificationQuery = {}): Promise<NotificationItem[]> => {
    return requestApi<NotificationItem[]>(
      "/notifications/",
      {
        query: {
          vehicle_id: query.vehicleId,
          recipient: query.recipient,
          unread_only: query.unreadOnly,
          limit: query.limit ?? 100,
        },
      },
      "Failed to load notifications",
    );
  },

  markNotificationRead: async (notificationId: string): Promise<void> => {
    await requestApi(`/notifications/${notificationId}/read`, { method: "PATCH" }, "Failed to mark notification read");
  },

  acknowledgeNotification: async (notificationId: string): Promise<void> => {
    await requestApi(
      `/notifications/${notificationId}/acknowledge`,
      { method: "PATCH" },
      "Failed to acknowledge notification",
    );
  },

  getReadiness: async (): Promise<ReadinessStatus | null> => {
    try {
      return await requestServiceRoot<ReadinessStatus>(
        "/health/ready",
        {
          timeoutMs: 5000,
        },
        "Failed to check backend readiness",
      );
    } catch {
      return null;
    }
  },
};
