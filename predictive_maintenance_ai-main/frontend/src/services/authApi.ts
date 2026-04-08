import { AUTH_BASE_URL, AUTH_BASE_URL_CANDIDATES } from './config';

export interface UserProfile {
  fullName: string;
  email: string;
  role: string;
  location: string;
  plant: string;
}

interface AuthTokenResponse {
  token: string;
}

const resolveErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = await response.json();
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // Ignore parse failures and return fallback.
  }
  return fallback;
};

const requestWithAuthBaseFallback = async <T>(
  executor: (authBaseUrl: string) => Promise<T>,
  fallbackMessage: string,
): Promise<T> => {
  let lastError: unknown = null;
  const candidates = AUTH_BASE_URL_CANDIDATES.length > 0 ? AUTH_BASE_URL_CANDIDATES : [AUTH_BASE_URL];

  for (const candidate of candidates) {
    try {
      return await executor(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(fallbackMessage);
};

export const authApi = {
  login: async (email: string, password: string): Promise<AuthTokenResponse> =>
    requestWithAuthBaseFallback(async (authBaseUrl) => {
      const response = await fetch(`${authBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error(await resolveErrorMessage(response, 'Invalid email or password'));
      }

      return (await response.json()) as AuthTokenResponse;
    }, 'Login failed'),

  register: async (payload: {
    fullName: string;
    email: string;
    password: string;
    role: string;
    location: string;
    plant: string;
  }): Promise<AuthTokenResponse> =>
    requestWithAuthBaseFallback(async (authBaseUrl) => {
      const response = await fetch(`${authBaseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await resolveErrorMessage(response, 'Registration failed'));
      }

      return (await response.json()) as AuthTokenResponse;
    }, 'Registration failed'),

  googleLogin: async (token: string): Promise<AuthTokenResponse> =>
    requestWithAuthBaseFallback(async (authBaseUrl) => {
      const response = await fetch(`${authBaseUrl}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        throw new Error(await resolveErrorMessage(response, 'Google authentication failed'));
      }

      return (await response.json()) as AuthTokenResponse;
    }, 'Google authentication failed'),

  getCurrentUser: async (token: string): Promise<UserProfile> =>
    requestWithAuthBaseFallback(async (authBaseUrl) => {
      const response = await fetch(`${authBaseUrl}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(await resolveErrorMessage(response, 'Session expired. Please login again.'));
      }

      return (await response.json()) as UserProfile;
    }, 'Failed to load user profile'),
};
