const DEFAULT_API_BASE_URL = "http://localhost:8000/api";

const sanitizeBaseUrl = (value: string): string => value.replace(/\/$/, "");

const ensureApiPath = (value: string): string => {
  const cleaned = sanitizeBaseUrl(value.trim());
  if (!cleaned) {
    return DEFAULT_API_BASE_URL;
  }

  try {
    const url = new URL(cleaned);
    const normalizedPath = url.pathname.replace(/\/$/, "");
    if (!normalizedPath || normalizedPath === "") {
      url.pathname = "/api";
    }
    return sanitizeBaseUrl(url.toString());
  } catch {
    return cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;
  }
};

const deriveAlternateApiBase = (apiBaseUrl: string): string | null => {
  try {
    const url = new URL(apiBaseUrl);
    const normalizedPath = url.pathname.replace(/\/$/, "");

    if (normalizedPath.endsWith("/api")) {
      const withoutApi = normalizedPath.slice(0, -4);
      url.pathname = withoutApi || "/";
      return sanitizeBaseUrl(url.toString());
    }

    url.pathname = `${normalizedPath || ""}/api`;
    return sanitizeBaseUrl(url.toString());
  } catch {
    if (apiBaseUrl.endsWith("/api")) {
      return sanitizeBaseUrl(apiBaseUrl.slice(0, -4));
    }
    return `${apiBaseUrl}/api`;
  }
};

const resolveWsUrl = (apiBaseUrl: string): string => {
  const explicitWsUrl =
    (import.meta.env.VITE_STREAM_WS_URL as string | undefined)?.trim() ||
    (import.meta.env.VITE_WS_URL as string | undefined)?.trim();

  if (explicitWsUrl) {
    return sanitizeBaseUrl(explicitWsUrl);
  }

  try {
    const url = new URL(apiBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/stream/ws`;
    url.search = "";
    url.hash = "";
    return sanitizeBaseUrl(url.toString());
  } catch {
    return `${apiBaseUrl.replace(/^http/i, "ws")}/stream/ws`;
  }
};

export const API_BASE_URL = sanitizeBaseUrl(
  ensureApiPath((import.meta.env.VITE_API_BASE_URL as string | undefined) || DEFAULT_API_BASE_URL)
);

const API_BASE_URL_ALTERNATE = deriveAlternateApiBase(API_BASE_URL);

export const API_BASE_URL_CANDIDATES = Array.from(
  new Set([API_BASE_URL, API_BASE_URL_ALTERNATE].filter((entry): entry is string => Boolean(entry)))
);

const resolveWsCandidates = (apiBaseCandidates: string[]): string[] => {
  const explicitWsUrl =
    (import.meta.env.VITE_STREAM_WS_URL as string | undefined)?.trim() ||
    (import.meta.env.VITE_WS_URL as string | undefined)?.trim();

  const derived = apiBaseCandidates.map((entry) => resolveWsUrl(entry));

  if (explicitWsUrl) {
    return Array.from(new Set([sanitizeBaseUrl(explicitWsUrl), ...derived]));
  }

  return Array.from(new Set(derived));
};

export const STREAM_WS_URL_CANDIDATES = resolveWsCandidates(API_BASE_URL_CANDIDATES);

export const STREAM_WS_URL = STREAM_WS_URL_CANDIDATES[0] || resolveWsUrl(API_BASE_URL);