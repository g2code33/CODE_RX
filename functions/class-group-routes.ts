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
 */

import type { Hono } from 'hono';
import { registerCgmStudentRoutes } from './lib/cgm/routes-student';
import { registerCgmOrganizerRoutes } from './lib/cgm/routes-organizer';
import { registerCgmActivityRoutes } from './lib/cgm/routes-activities';

export const registerClassGroupRoutes = (app: Hono<any>) => {
  registerCgmStudentRoutes(app);
  registerCgmOrganizerRoutes(app);
  registerCgmActivityRoutes(app);
};
