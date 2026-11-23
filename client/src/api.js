const BASE = import.meta.env.VITE_API_URL || '/api';

// The access token lives in memory only (never localStorage). The refresh token is an
// httpOnly cookie that JavaScript cannot read, so an XSS bug can't steal a long-lived session.
let accessToken = null;
let onSessionExpired = () => { };

try { localStorage.removeItem('sweety_token'); } catch { /* storage unavailable */ }

export function setToken(token) {
  accessToken = token;
}

export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

const networkError = () => new Error('Cannot reach the server. Please check your connection.');

function send(path, { method = 'GET', body } = {}) {
  return fetch(`${BASE}${path}`, {
    method,
    credentials: 'include', // send/receive the refresh cookie
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function parse(res) {
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Single-flight: if several requests hit 401 together they share one refresh call.
let refreshing = null;
function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      let res;
      try { res = await send('/auth/refresh', { method: 'POST' }); } catch { throw networkError(); }
      const data = await parse(res);
      accessToken = data.token;
      return data;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function request(path, options = {}, canRetry = true) {
  let res;
  try { res = await send(path, options); } catch { throw networkError(); }

  // Access token expired: refresh once, then retry the original request.
  if (res.status === 401 && canRetry && !path.startsWith('/auth/')) {
    try {
      await refresh();
    } catch {
      accessToken = null;
      onSessionExpired();
      throw new Error('Your session has expired. Please log in again.');
    }
    return request(path, options, false);
  }
  return parse(res);
}

const qs = (params) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
  return p.toString() ? `?${p}` : '';
};

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  refresh, // used once on page load to restore the session from the cookie
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: { token, password } }),
  listReadings: (params = {}) => request(`/readings${qs(params)}`),
  createReading: (body) => request('/readings', { method: 'POST', body }),
  updateReading: (id, body) => request(`/readings/${id}`, { method: 'PUT', body }),
  deleteReading: (id) => request(`/readings/${id}`, { method: 'DELETE' }),
  report: (date) => request(`/reports${qs({ date })}`),
};