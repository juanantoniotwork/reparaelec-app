import * as SecureStore from 'expo-secure-store';

const BASE = 'https://api.reparaelec.servidortigres.com/api';

async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error('Sin conexión. Comprueba tu red.');
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync('token');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Category = {
  id: string | number;
  name: string;
};

export type Suggestion = {
  query: string;
  hit_count: number;
};

export type Interaction = {
  id: number;
  query: string;
  response: string;
  session_id?: number;
  created_at: string;
};

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<string> {
  const res = await safeFetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Credenciales incorrectas.');
  const token: string = data.token ?? data.access_token;
  if (!token) throw new Error('No se recibió token del servidor.');
  return token;
}

export async function logout(): Promise<void> {
  const headers = await authHeaders();
  await safeFetch(`${BASE}/logout`, { method: 'POST', headers });
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<Category[]> {
  const headers = await authHeaders();
  const res = await safeFetch(`${BASE}/categories`, { headers });
  if (!res.ok) throw new Error('Error al cargar categorías.');
  const data = await res.json();
  return Array.isArray(data) ? data : data.data ?? [];
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export async function fetchSuggestions(): Promise<Suggestion[]> {
  const headers = await authHeaders();
  const res = await safeFetch(`${BASE}/chat/suggestions`, { headers });
  if (!res.ok) throw new Error('Error al cargar sugerencias.');
  const data = await res.json();
  return Array.isArray(data) ? data : data.data ?? [];
}

// ── Interactions ──────────────────────────────────────────────────────────────

export async function fetchInteractions(sessionId?: number): Promise<Interaction[]> {
  const headers = await authHeaders();
  const url = sessionId != null
    ? `${BASE}/interactions?session_id=${sessionId}`
    : `${BASE}/interactions`;
  const res = await safeFetch(url, { headers });
  if (!res.ok) throw new Error('Error al cargar el historial.');
  const data = await res.json();
  return Array.isArray(data) ? data : data.data ?? [];
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function deleteSession(id: number): Promise<void> {
  const headers = await authHeaders();
  const res = await safeFetch(`${BASE}/sessions/${id}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error('No se pudo eliminar la sesión.');
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export async function sendFeedback(
  interactionId: number,
  feedback: 'positive' | 'negative'
): Promise<void> {
  const headers = await authHeaders();
  const res = await safeFetch(`${BASE}/interactions/${interactionId}/feedback`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback }),
  });
  if (!res.ok) throw new Error('Error al enviar feedback.');
}

// ── Chat stream ───────────────────────────────────────────────────────────────
// Devuelve el XHR configurado y una función send() para que el llamador pueda
// registrar onprogress/onload/onerror antes de disparar la petición.

export async function buildChatStreamXhr(
  body: Record<string, unknown>
): Promise<{ xhr: XMLHttpRequest; send: () => void }> {
  const token = await SecureStore.getItemAsync('token');
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${BASE}/chat/stream`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  return { xhr, send: () => xhr.send(JSON.stringify(body)) };
}
