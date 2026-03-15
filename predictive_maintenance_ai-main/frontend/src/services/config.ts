const DEFAULT_API_BASE_URL = "http://localhost:8000/api";

const sanitizeBaseUrl = (value: string): string => value.replace(/\/$/, "");

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
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || DEFAULT_API_BASE_URL
);

export const STREAM_WS_URL = resolveWsUrl(API_BASE_URL);