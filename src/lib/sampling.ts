/**
 * CODE Rx — Sampling (Phase 1) frontend client.
 *
 * Sampling is a standalone workspace, not a Class & Group tab: it has its own
 * routes, its own screens and its own two credentials.
 *
 *   #sampling                     organizer workspace (Society member session)
 *   #sampling/game/<id>           one game's monitoring + link desk
 *   #sampling/team/<token>        a team's play screen (the link IS the key)
 *
 * Organizer calls ride the existing member bearer token; team calls carry only
 * the team token in the URL and are sent without any member credential.
 */

import { API_BASE } from './cloudflare';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export type SamplingRoute =
  | { page: 'home' }
  | { page: 'game'; id: number }
  | { page: 'team'; token: string };

export const parseSamplingHash = (hash: string): SamplingRoute | null => {
  const raw = String(hash || '');
  if (!/^#sampling(?:\/|$)/.test(raw)) return null;
  const rest = raw.slice('#sampling'.length).replace(/^\//, '');
  if (!rest) return { page: 'home' };
  const [kind, ...tail] = rest.split('/');
  const value = decodeURIComponent(tail.join('/') || '').trim();
  if (kind === 'game') {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? { page: 'game', id: Math.floor(id) } : { page: 'home' };
  }
  if (kind === 'team' && value) return { page: 'team', token: value };
  return { page: 'home' };
};

export const samplingHash = (route: SamplingRoute): string => {
  if (route.page === 'game') return `#sampling/game/${route.id}`;
  if (route.page === 'team') return `#sampling/team/${route.token}`;
  return '#sampling';
};

/** Navigates without leaving the app: the workspace listens to hashchange. */
export const goToSampling = (route: SamplingRoute): void => {
  if (typeof window === 'undefined') return;
  const next = samplingHash(route);
  if (window.location.hash === next) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = next;
};

// ---------------------------------------------------------------------------
// Types (mirroring the Worker snapshots)
// ---------------------------------------------------------------------------

export type SamplingGameStatus = 'draft' | 'active' | 'paused' | 'completed' | 'ended';

export interface SamplingGameSummary {
  id: number;
  title: string;
  instructions: string | null;
  status: SamplingGameStatus;
  statusLabel: string;
  totalNumbers: number;
  teamCount: number;
  turn: number;
  turnNumber: number;
  currentTeamId: number | null;
  currentTeamName: string | null;
  drawnCount: number;
  remaining: number;
  progress: number;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  latestDraw: { number: number; teamId: number } | null;
  organizer?: string;
}

export interface SamplingTeamSummary {
  id: number;
  name: string;
  position: number;
  status: 'active' | 'revoked';
  drawCount: number;
  numbers: number[];
  lastDrawAt: string | null;
  link?: string | null;
  tokenHint?: string;
  tokenSealed?: boolean;
}

export interface SamplingDraw {
  teamId: number;
  teamName: string;
  number: number;
  turn: number;
  drawnAt: string;
}

export interface SamplingEvent {
  id: number;
  action: string;
  actor: string;
  actorType: string;
  detail: Record<string, unknown>;
  at: string;
}

export interface OrganizerGameBundle {
  game: SamplingGameSummary;
  organizer: string;
  organizerName?: string;
  ownerUserId: number | null;
  teams: SamplingTeamSummary[];
  draws: SamplingDraw[];
  events: SamplingEvent[];
  canManage: boolean;
}

export interface SamplingWorkspace {
  games: SamplingGameSummary[];
  active: SamplingGameSummary[];
  previous: SamplingGameSummary[];
  organizer: string;
  isPhantom: boolean;
}

export interface TeamGameBundle {
  game: SamplingGameSummary;
  team: {
    id: number;
    name: string;
    position: number;
    status: 'active' | 'revoked';
    numbers: number[];
    drawCount: number;
    lastDrawAt: string | null;
  };
  teams: Array<{
    id: number; name: string; position: number; draws: number[]; drawCount: number;
    status: 'active' | 'revoked'; lastDrawAt: string | null;
  }>;
  draws: SamplingDraw[];
  isMyTurn: boolean;
  hasLink: boolean;
}

export interface SpinResult extends TeamGameBundle {
  draw: { number: number; turn: number; drawnAt: string; teamId: number; teamName: string };
  replayed: boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SamplingError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'SamplingError';
    this.status = status;
    this.code = code;
  }
}

const TIMEOUT_MS = 15_000;
const SPIN_TIMEOUT_MS = 25_000;

const request = async <T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null; timeout?: number; raw?: boolean } = {},
): Promise<T> => {
  const method = options.method || 'GET';
  const headers = new Headers({ Accept: options.raw ? 'text/csv, application/json' : 'application/json' });
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (failure: any) {
    if (failure?.name === 'AbortError') {
      throw new SamplingError('The server took too long to answer. Check your connection and try again.', 0, 'timeout');
    }
    throw new SamplingError('We could not reach the server. Check your connection and try again.', 0, 'offline');
  } finally {
    clearTimeout(timer);
  }

  if (options.raw) {
    const text = await response.text();
    if (!response.ok) throw new SamplingError('The results could not be exported.', response.status);
    return text as unknown as T;
  }

  let json: any = null;
  try { json = await response.json(); } catch { /* non-JSON */ }
  if (!response.ok) {
    throw new SamplingError(
      json?.error || 'The request could not be completed.',
      response.status,
      json?.code || null,
    );
  }
  return (json?.data !== undefined ? json.data : json) as T;
};

const memberToken = async (): Promise<string | null> => {
  const { getToken } = await import('./cloudflare');
  return getToken();
};

const memberRequest = async <T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> => {
  const token = await memberToken();
  return request<T>(path, { ...options, token });
};

// ---------------------------------------------------------------------------
// Organizer surface
// ---------------------------------------------------------------------------

export const sampling = {
  workspace: () => memberRequest<SamplingWorkspace>('/api/sampling/games'),
  create: (body: {
    title?: string;
    totalNumbers: number;
    teamNames: string[];
    instructions?: string;
  }) => memberRequest<OrganizerGameBundle>('/api/sampling/games', { method: 'POST', body }),
  game: (id: number) => memberRequest<OrganizerGameBundle>(`/api/sampling/games/${id}`),
  history: (id: number) => memberRequest<{ events: SamplingEvent[] }>(`/api/sampling/games/${id}/history`),
  start: (id: number) => memberRequest<OrganizerGameBundle>(`/api/sampling/games/${id}/start`, { method: 'POST', body: {} }),
  pause: (id: number) => memberRequest<OrganizerGameBundle>(`/api/sampling/games/${id}/pause`, { method: 'POST', body: {} }),
  resume: (id: number) => memberRequest<OrganizerGameBundle>(`/api/sampling/games/${id}/resume`, { method: 'POST', body: {} }),
  end: (id: number, reason?: string) =>
    memberRequest<OrganizerGameBundle>(`/api/sampling/games/${id}/end`, { method: 'POST', body: { confirm: true, reason } }),
  skip: (id: number, expectedTurn: number, reason?: string) =>
    memberRequest<OrganizerGameBundle>(`/api/sampling/games/${id}/skip`, {
      method: 'POST',
      body: { confirm: true, expectedTurn, reason },
    }),
  regenerate: (id: number, teamId: number) =>
    memberRequest<{ teamId: number; teamName: string; link: string; hint: string; bundle: OrganizerGameBundle }>(
      `/api/sampling/games/${id}/teams/${teamId}/regenerate`, { method: 'POST', body: { confirm: true } },
    ),
  revoke: (id: number, teamId: number) =>
    memberRequest<OrganizerGameBundle>(`/api/sampling/games/${id}/teams/${teamId}/revoke`, { method: 'POST', body: { confirm: true } }),
  restore: (id: number, teamId: number) =>
    memberRequest<{ teamId: number; teamName: string; link: string; bundle: OrganizerGameBundle }>(
      `/api/sampling/games/${id}/teams/${teamId}/restore`, { method: 'POST', body: {} },
    ),
  exportCsv: async (id: number): Promise<string> => {
    const token = await memberToken();
    return request<string>(`/api/sampling/games/${id}/export?format=csv`, { token, raw: true, timeout: 30_000 });
  },
};

// ---------------------------------------------------------------------------
// Team surface — no member credential, ever
// ---------------------------------------------------------------------------

export const samplingTeam = {
  view: (token: string, timeout = TIMEOUT_MS) =>
    request<TeamGameBundle>(`/api/sampling/team/${encodeURIComponent(token)}`, { timeout }),
  spin: (token: string, requestId: string) =>
    request<SpinResult>(`/api/sampling/team/${encodeURIComponent(token)}/spin`, {
      method: 'POST',
      body: { requestId },
      timeout: SPIN_TIMEOUT_MS,
    }),
};

// ---------------------------------------------------------------------------
// Small browser helpers shared by both surfaces
// ---------------------------------------------------------------------------

export const copyText = async (value: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', 'true');
    area.style.cssText = 'position:fixed;top:-1000px;left:-1000px;';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
};

/** Native share where the browser supports it; otherwise false to fall back. */
export const shareLink = async (title: string, text: string, url: string): Promise<'shared' | 'unsupported' | 'cancelled'> => {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') return 'cancelled';
  }
  return 'unsupported';
};

export const downloadText = (filename: string, text: string, type = 'text/csv;charset=utf-8'): void => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
};

/** A retry-stable id for one spin attempt (kept across network failures). */
const spinKey = (token: string): string => `codeRx_samplingSpin_${token.slice(-12)}`;
export const readSpinKey = (token: string): string | null => {
  try { return sessionStorage.getItem(spinKey(token)); } catch { return null; }
};
export const writeSpinKey = (token: string, value: string | null): void => {
  try {
    if (value) sessionStorage.setItem(spinKey(token), value);
    else sessionStorage.removeItem(spinKey(token));
  } catch { /* private mode */ }
};
export const newRequestId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* older browser */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};
