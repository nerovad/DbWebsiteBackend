const BASE = "http://localhost:4000";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Build a Headers object so we don't fight union types (HeadersInit)
  const headers = new Headers(init.headers || {});
  // set JSON content-type unless caller already set it
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  // add auth header if present
  const auth = authHeaders();
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON, ignore */ }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  // channels
  createChannel: (body: { name: string; slug?: string; stream_url?: string }) =>
    request("/api/channels", { method: "POST", body: JSON.stringify(body) }),
  listChannels: () =>
    request<Array<{ id: number; slug: string; name: string; stream_url: string | null }>>("/api/channels"),
  getChannel: (slug: string) =>
    request<{ id: number; slug: string; name: string; stream_url: string | null; latestSession?: any }>(`/api/channels/${slug}`),

  // festivals/sessions
  createSession: (body: { channelSlug: string; title: string; starts_at?: string; ends_at?: string; status?: string; timezone?: string }) =>
    request(`/api/festivals`, { method: "POST", body: JSON.stringify(body) }),
  startSession: (sessionId: number) => request(`/api/festivals/${sessionId}/start`, { method: "POST" }),
  closeSession: (sessionId: number) => request(`/api/festivals/${sessionId}/close`, { method: "POST" }),
  lineup: (sessionId: number) => request(`/api/festivals/${sessionId}/lineup`),

  addEntry: (sessionId: number, body: { filmId?: number; filmTitle?: string; order_index?: number }) =>
    request(`/api/festivals/${sessionId}/entries`, { method: "POST", body: JSON.stringify(body) }),

  // films
  createFilm: (title: string) => request(`/api/films`, { method: "POST", body: JSON.stringify({ title }) }),
  listFilms: () => request<Array<{ id: number; title: string }>>(`/api/films`),

  // voting
  leaderboard: (sessionId: number) =>
    request<Array<{ entry_id: number; title: string; weighted_avg: number; votes: number }>>(`/api/sessions/${sessionId}/leaderboard`),
};
