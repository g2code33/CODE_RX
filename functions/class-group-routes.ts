/**
 * CODE Rx SOCIETY — Class & Group Management module route registration.
 *
 * Registered additively from `functions/[[path]].ts` exactly like the client
 * portal. No existing route, guard, or helper is modified here.
 *
 *   Student surface     /api/cgm/student/*          (student session credential)
 *   Public surface      /api/cgm/invitations/*      (invitation landing)
 *   Organizer surface   /api/cgm/classes/*          (Society member bearer token)
 *   PHANTOM surface     /api/cgm/phantom/*          (PHANTOM authority, re-checked)
 *   Passkey desk        /api/cgm/classes/:id/passkeys* (organizer) and
 *                       /api/cgm/passkey-links/*    (public one-time links)
 */

import type { Hono } from 'hono';
import { registerCgmStudentRoutes } from './lib/cgm/routes-student';
import { registerCgmOrganizerRoutes } from './lib/cgm/routes-organizer';
import { registerCgmActivityRoutes } from './lib/cgm/routes-activities';
import { registerCgmPasskeyRoutes } from './lib/cgm/routes-passkeys';

export const registerClassGroupRoutes = (app: Hono<any>) => {
  registerCgmStudentRoutes(app);
  registerCgmOrganizerRoutes(app);
  registerCgmActivityRoutes(app);
  // The passkey desk (organizer) and the one-time self-service links (public).
  registerCgmPasskeyRoutes(app);
};

// Operational reuse + suite access: the idempotent invitation-seal backfill
// (legacy plaintext secrets → AES-GCM). It runs automatically once per
// isolate on the first CGM request (requireModuleEnabled) and is safe to
// invoke directly at any time.
export { migrateInvitationTokenStorage } from './lib/cgm/invite-crypto';
