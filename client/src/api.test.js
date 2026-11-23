import { vi } from 'vitest';

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
let mod;

beforeEach(async () => {
    vi.resetModules(); // api.js keeps the token in module state, so start fresh each test
    global.fetch = vi.fn();
    mod = await import('./api');
});

test('refreshes once and retries when the access token has expired', async () => {
    mod.setToken('old');
    fetch
        .mockResolvedValueOnce(json(401, { message: 'expired' }))        // GET /readings
        .mockResolvedValueOnce(json(200, { token: 'new', user: { id: 1 } })) // POST /auth/refresh
        .mockResolvedValueOnce(json(200, { data: [] }));                  // retry

    const res = await mod.api.listReadings();

    expect(res).toEqual({ data: [] });
    expect(fetch.mock.calls[1][0]).toMatch(/\/auth\/refresh$/);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer new');
});

test('logs the user out when the refresh fails', async () => {
    const expired = vi.fn();
    mod.setSessionExpiredHandler(expired);
    mod.setToken('old');
    fetch
        .mockResolvedValueOnce(json(401, { message: 'expired' }))
        .mockResolvedValueOnce(json(401, { message: 'Your session has expired. Please log in again.' }));

    await expect(mod.api.listReadings()).rejects.toThrow(/session has expired/i);
    expect(expired).toHaveBeenCalledTimes(1);
});

test('simultaneous 401s share a single refresh call', async () => {
    mod.setToken('old');
    fetch.mockImplementation(async (url, opts) => {
        if (url.endsWith('/auth/refresh')) return json(200, { token: 'new', user: {} });
        return opts.headers.Authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, {});
    });

    await Promise.all([mod.api.listReadings(), mod.api.report('2025-10-15')]);

    const refreshCalls = fetch.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
});

test('a wrong password is shown as an error and never triggers a refresh', async () => {
    fetch.mockResolvedValueOnce(json(401, { message: 'Invalid email or password.' }));
    await expect(mod.api.login({ email: 'a@b.co', password: 'x' })).rejects.toThrow('Invalid email or password.');
    expect(fetch).toHaveBeenCalledTimes(1);
});

test('requests carry the in-memory access token and the cookie flag', async () => {
    mod.setToken('abc');
    fetch.mockResolvedValueOnce(json(200, { data: [] }));
    await mod.api.listReadings();
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
});