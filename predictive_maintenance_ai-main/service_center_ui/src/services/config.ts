const DEFAULT_API_BASE_URL = "http://localhost:8000/api";
const API_OVERRIDE_KEY = "serviceCenter.runtime.apiBaseUrl";

const sanitizeBaseUrl = (value: string): string => value.replace(/\/$/, "");

const ensureApiPath = (value: string): string => {
  const cleaned = sanitizeBaseUrl(value.trim());
  if (!cleaned) {
    return DEFAULT_API_BASE_URL;
  }

  try {
    const url = new URL(cleaned);
    const normalizedPath = url.pathname.replace(/\/$/, "");
    if (!normalizedPath.endsWith("/api")) {
      url.pathname = `${normalizedPath}/api`.replace("//", "/");
    }
    return sanitizeBaseUrl(url.toString());
  } catch {
    return cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;
  }
};

const stripApiPath = (value: string): string => {
  const cleaned = sanitizeBaseUrl(value);
  try {
    const url = new URL(cleaned);
    const normalizedPath = url.pathname.replace(/\/$/, "");
    if (normalizedPath.endsWith("/api")) {
      const withoutApi = normalizedPath.slice(0, -4);
      url.pathname = withoutApi || "/";
    }
    return sanitizeBaseUrl(url.toString());
  } catch {
    return cleaned.endsWith("/api") ? sanitizeBaseUrl(cleaned.slice(0, -4)) : cleaned;
  }
};

const resolveWsUrl = (apiBase: string): string => {
  try {
    const url = new URL(ensureApiPath(apiBase));
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/stream/ws`;
    url.search = "";
    url.hash = "";
    return sanitizeBaseUrl(url.toString());
  } catch {
    const normalized = ensureApiPath(apiBase);
    return `${normalized.replace(/^http/i, "ws")}/stream/ws`;
  }
};

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

export const getRuntimeApiBase = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(API_OVERRIDE_KEY);
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
};

export const setRuntimeApiBase = (value: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(API_OVERRIDE_KEY);
    return;
  }

  window.localStorage.setItem(API_OVERRIDE_KEY, trimmed);
};

export const getApiBaseCandidates = (): string[] => {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || DEFAULT_API_BASE_URL;
  const runtimeBase = getRuntimeApiBase();
  const primary = ensureApiPath(runtimeBase || envBase);

  return unique([primary, ensureApiPath(stripApiPath(primary))]);
};

export const getServiceRootCandidates = (): string[] => {
  const apiBases = getApiBaseCandidates();
  // Service-root calls (e.g. /health/ready) should not be retried against /api base.
  // Retrying with /api creates invalid paths like /api/health/ready -> 404.
  return unique(apiBases.map((entry) => stripApiPath(entry)));
};

export const getPrimaryApiBase = (): string => {
  const candidates = getApiBaseCandidates();
  return candidates[0] || DEFAULT_API_BASE_URL;
};

export const getStreamWsCandidates = (): string[] => {
  const explicit =
    (import.meta.env.VITE_STREAM_WS_URL as string | undefined)?.trim() ||
    (import.meta.env.VITE_WS_URL as string | undefined)?.trim();

  const apiCandidates = getApiBaseCandidates();
  const resolved = apiCandidates.map((entry) => resolveWsUrl(entry));

  if (explicit) {
    return unique([sanitizeBaseUrl(explicit), ...resolved]);
  }

  return unique(resolved);
};
