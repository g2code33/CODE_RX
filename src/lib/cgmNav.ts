/**
 * CODE Rx — where the organizer is, written down in the address.
 *
 * A phone reloads a page whenever it feels like it (memory pressure, a tab
 * coming back from the background, a pull-to-refresh). Until now that sent the
 * organizer back to the overview, losing the tab they were working in, the
 * class and the activity they had picked.
 *
 * The whole position now lives in the hash:
 *
 *   #class-groups/w/elections?class=12&activity=7
 *
 * The `/w/` segment keeps the organizer workspace distinct from the two other
 * `#class-groups/...` pages (`/student`, `/phantom`) — those prefixes must never
 * collide with an area key, and `students` would.
 *
 * Everything here is pure: parse a hash, build a hash. No DOM, no state.
 */

export interface WorkspaceNav {
  /** The tab/section the organizer is looking at. */
  area: string;
  classId: number | null;
  activityId: number | null;
}

export const DEFAULT_AREA = 'overview';

/** `#class-groups/w/<area>?class=<id>&activity=<id>` — null when off-workspace. */
export const parseWorkspaceNav = (hash: string): WorkspaceNav | null => {
  const raw = String(hash || '');
  if (!raw.startsWith('#class-groups')) return null;
  const body = raw.slice('#class-groups'.length).replace(/^\//, '');
  if (!body.startsWith('w')) return null;
  const [path, query = ''] = body.slice(1).replace(/^\//, '').split('?');
  const area = decodeURIComponent(path || '').trim() || DEFAULT_AREA;
  const params = new URLSearchParams(query);
  const number = (key: string) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  return { area, classId: number('class'), activityId: number('activity') };
};

export const buildWorkspaceHash = (nav: Partial<WorkspaceNav>): string => {
  const area = String(nav.area || DEFAULT_AREA).trim() || DEFAULT_AREA;
  const params = new URLSearchParams();
  if (nav.classId) params.set('class', String(nav.classId));
  if (nav.activityId) params.set('activity', String(nav.activityId));
  const query = params.toString();
  return `#class-groups/w/${area}${query ? `?${query}` : ''}`;
};

/**
 * Writes the position into the address bar without adding a history entry: a
 * reload restores it, but Back still leaves the workspace instead of walking
 * through every tab the organizer opened.
 */
export const rememberWorkspaceNav = (nav: Partial<WorkspaceNav>): void => {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const next = buildWorkspaceHash(nav);
  if (window.location.hash === next) return;
  try { window.history.replaceState(null, '', next); } catch { /* a blocked history is not fatal */ }
};
