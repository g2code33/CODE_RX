/**
 * CODE Rx SOCIETY — CGM activities, groups, leadership, elections,
 * announcements, WhatsApp, attendance, reports and PHANTOM oversight.
 *
 * Every handler re-checks organizer permissions from the database; PHANTOM
 * routes re-verify platform authority server-side through the actor row, never
 * through a frontend flag.
 */

import type { Hono } from 'hono';
import { recordPhantomInboxItem } from '../phantom-inbox';
import { markPhantomTabSeen, phantomAttentionBoard } from './attention';
import { createNotification } from '../notifications';
import { cleanEmail } from '../validate';
import { buildReportPdf } from './pdf';
import {
  planAssignments,
  rebalanceGenders,
  secureRng,
  type AssignableGroup,
  type AssignableStudent,
} from './assignment';
import {
  ACTIVITY_LIFECYCLE_LABELS,
  ATTENDANCE_STATUSES,
  lookupKey,
  phoneKey,
  groupLabel,
  sanitizeActivityConfig,
  sanitizeLeaderPermissions,
  sanitizeClassPermissions,
  type AttendanceStatus,
  type ClassPermission,
} from './core';
import {
  activeAssignmentId,
  activeDesignationsFor,
  ensureForceGetSchema,
  forceGetComposition,
  forcedMemberCounts,
  groupGenderPools,
  groupHoldsOtherPool,
  studentGenders,
  insertAssignmentRespectingDesignations,
  markDesignationApplied,
  reservedSeatsFor,
  reserveRosterEntry,
  rosterReservationsFor,
} from './forceGet';
import {
  ensureRechooseSchema,
  insertAssignmentGuarded,
  requireCgmPhantom,
  restoreAssignment,
  asRows,
  auditCgm,
  bad,
  clean,
  cleanOrNull,
  memberFromRequest,
  notifyStudent,
  organizerContextFor,
  readBody,
  requireClassPermission,
  requireModuleEnabled,
  studentFromRequest,
  throttle,
} from './service';
import { emailConfigStatus } from '../email';

type CgmApp = Hono<any>;

export const registerCgmActivityRoutes = (app: CgmApp) => {

  const activityCore = async (db: D1Database, activityId: number) => {
    const rows = await asRows<any>(db.prepare(
      `SELECT a.*, cl.name AS class_name, cl.code AS class_code FROM cgm_activities a
       JOIN cgm_classes cl ON cl.id = a.class_id WHERE a.id = ?`
    ).bind(activityId));
    return rows[0] || null;
  };

  const groupCore = async (db: D1Database, groupId: number) => {
    const rows = await asRows<any>(db.prepare(
      `SELECT g.*, a.class_id, a.name AS activity_name, a.status AS activity_status FROM cgm_groups g
       JOIN cgm_activities a ON a.id = g.activity_id WHERE g.id = ?`
    ).bind(groupId));
    return rows[0] || null;
  };

  // -------------------------------------------------------------------------
  // Activities: CRUD, eligibility, templates, lifecycle
  // -------------------------------------------------------------------------
  app.get('/api/cgm/classes/:id/activities', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_activities');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM cgm_groups g WHERE g.activity_id = a.id AND g.status = 'active') AS group_count,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.activity_id = a.id AND ga.status = 'active') AS assigned_count,
              (SELECT COUNT(*) FROM cgm_activity_eligible e WHERE e.activity_id = a.id) AS eligible_count
       FROM cgm_activities a WHERE a.class_id = ? ORDER BY a.created_at DESC LIMIT 100`
    ).bind(classId));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), name: row.name, type: row.type, description: row.description,
        status: row.status, createdAt: row.created_at, publishedAt: row.published_at,
        completedAt: row.completed_at, archivedAt: row.archived_at, cancelledReason: row.cancelled_reason,
        groupCount: Number(row.group_count), assignedCount: Number(row.assigned_count),
        eligibleCount: Number(row.eligible_count),
        config: sanitizeActivityConfig(JSON.parse(row.config_json || '{}')),
      })),
    });
  });

  app.post('/api/cgm/classes/:id/activities', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_activities');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const name = clean(body.name, 160);
    if (!name) return bad(c, 'Name the activity.');
    const config = sanitizeActivityConfig(body.config);
    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_activities (class_id, name, type, description, config_json, created_by_profile_id, created_by_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(classId, name, clean(body.type, 30) || 'custom', cleanOrNull(body.description, 2000),
      JSON.stringify(config), member.profileId, member.name).run();
    const activityId = Number(result.meta.last_row_id);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.activity.created', entityType: 'activity', entityId: activityId, classId, activityId,
      context: { name, method: config.method },
    });
    return c.json({ success: true, data: { activityId } });
  });

  app.get('/api/cgm/activities/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    await ensureRechooseSchema(c.env.DB);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'view_roster');
    if (!guard.ok) return guard.response;
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    const groups = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.name, g.position, g.capacity,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active' ORDER BY g.position`
    ).bind(activityId));
    // Who can still be placed. With eligibility 'selected' the eligible table
    // is authoritative; with 'all' it is never filled, so the class roster is —
    // otherwise the picker was silently empty for every open activity.
    const unassigned = config.eligibility === 'selected'
      ? await asRows<any>(c.env.DB.prepare(
        `SELECT s.id, s.full_name, s.index_number FROM cgm_activity_eligible e JOIN cgm_students s ON s.id = e.student_id
         WHERE e.activity_id = ? AND NOT EXISTS
           (SELECT 1 FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = s.id AND ga.status = 'active')
         ORDER BY s.full_name`
      ).bind(activityId, activityId))
      : await asRows<any>(c.env.DB.prepare(
        `SELECT s.id, s.full_name, s.index_number FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id
         WHERE cm.class_id = ? AND cm.status = 'active' AND NOT EXISTS
           (SELECT 1 FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = s.id AND ga.status = 'active')
         ORDER BY s.full_name`
      ).bind(Number(activity.class_id), activityId));
    // The class members, each with their live placement in THIS activity (if
    // any) and the state of their latest re-choose request, so the Groups tab
    // can group them correctly and offer Re-choose without another round trip.
    const members = await asRows<any>(c.env.DB.prepare(
      `SELECT s.id, s.full_name, s.index_number,
              ga.id AS assignment_id, ga.group_id,
              (SELECT rc.status FROM cgm_rechoose_requests rc
               WHERE rc.activity_id = ? AND rc.student_id = s.id ORDER BY rc.id DESC LIMIT 1) AS rechoose_status
       FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id
       LEFT JOIN cgm_group_assignments ga ON ga.activity_id = ? AND ga.student_id = s.id AND ga.status = 'active'
       WHERE cm.class_id = ? AND cm.status = 'active' ORDER BY s.full_name`
    ).bind(activityId, activityId, Number(activity.class_id)));
    const changeRequests = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, s.full_name FROM cgm_group_change_requests r JOIN cgm_students s ON s.id = r.student_id
       WHERE r.activity_id = ? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 100`
    ).bind(activityId));
    await ensureForceGetSchema(c.env.DB);
    const forcedCounts = await forcedMemberCounts(c.env.DB, activityId);
    const reservedCounts = await reservedSeatsFor(c.env.DB, activityId);
    const history = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, s.full_name FROM cgm_assignment_events e JOIN cgm_students s ON s.id = e.student_id
       WHERE e.activity_id = ? ORDER BY e.id DESC LIMIT 200`
    ).bind(activityId));
    const whatsappLinks = await asRows<any>(c.env.DB.prepare(
      `SELECT w.id, w.group_id, w.url, w.status, w.click_count, w.created_at FROM cgm_whatsapp_links w
       WHERE w.activity_id = ? ORDER BY w.id DESC LIMIT 100`
    ).bind(activityId));
    const waitlist = await asRows<any>(c.env.DB.prepare(
      `SELECT w.*, s.full_name FROM cgm_activity_waitlist w JOIN cgm_students s ON s.id = w.student_id
       WHERE w.activity_id = ? AND w.status = 'waiting' ORDER BY w.id`
    ).bind(activityId));
    return c.json({
      success: true,
      data: {
        activity: {
          id: activityId, name: activity.name, type: activity.type, description: activity.description,
          status: activity.status, createdAt: activity.created_at, publishedAt: activity.published_at,
          completedAt: activity.completed_at, archivedAt: activity.archived_at,
          cancelledReason: activity.cancelled_reason, className: activity.class_name, classCode: activity.class_code,
        },
        config,
        groups: groups.map((row) => ({
          id: Number(row.id), name: row.name || `Group ${row.position}`, position: Number(row.position),
          capacity: row.capacity === null ? null : Number(row.capacity), size: Number(row.size),
          // Backend-only counters for the "6/14 (2)" board label: `forced` is a
          // SUBSET of `size` (members placed through an approved Force Get
          // designation), `reserved` is approved-but-not-yet-applied seats.
          forced: forcedCounts.get(Number(row.id)) || 0,
          reserved: reservedCounts.get(Number(row.id)) || 0,
        })),
        unassigned, members, changeRequests, history, waitlist,
        whatsapp: whatsappLinks.map((row) => ({
          id: Number(row.id), groupId: Number(row.group_id), url: row.url, status: row.status,
          clickCount: Number(row.click_count || 0), createdAt: row.created_at,
        })),
      },
    });
  });

  app.patch('/api/cgm/activities/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'manage_activities');
    if (!guard.ok) return guard.response;
    if (['completed', 'archived'].includes(activity.status)) return bad(c, 'Completed and archived activities are locked.', 409);
    const body = await readBody(c);
    const current = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    const config = sanitizeActivityConfig({ ...current, ...((body.config && typeof body.config === 'object') ? body.config : {}) });
    // §13 — published assignments never silently change. Once students can see
    // their activity, the structure that decides their groups is frozen: only
    // deadline extensions and everyday logistics may change. Draft and open
    // activities stay fully editable; duplicating is the way to restructure.
    const STRUCTURE_FIELDS = ['method', 'groupCount', 'targetGroupSize', 'capacity', 'genderRule', 'overflow'] as const;
    const GROUP_PLAN_FIELDS = ['groupCount', 'targetGroupSize', 'capacity', 'groupNaming', 'groupNames'] as const;
    if (['published', 'active'].includes(activity.status) && body.config && typeof body.config === 'object') {
      const changed = STRUCTURE_FIELDS.filter((key) => JSON.stringify((current as any)[key] ?? null) !== JSON.stringify((config as any)[key] ?? null));
      if (changed.length) {
        // The GROUP PLAN (count, target size, capacity, naming) stays editable
        // on a published activity until the FIRST student is placed — with no
        // placements there is nothing students already see that could change,
        // and the save re-syncs the real groups to the new plan below. Once
        // anyone is placed (or the change touches method/gender/overflow),
        // the freeze holds exactly as before.
        const placedRows = await asRows<{ c: number }>(c.env.DB.prepare(
          `SELECT COUNT(*) AS c FROM cgm_group_assignments WHERE activity_id = ? AND status = 'active'`
        ).bind(activityId));
        const placed = Number(placedRows[0]?.c || 0);
        const planOnly = changed.every((key) => (GROUP_PLAN_FIELDS as readonly string[]).includes(key));
        if (placed > 0 || !planOnly) {
          return bad(c, `A published activity cannot change ${changed.join(', ')} — group assignments students already see would silently change. Extend deadlines instead, or duplicate the activity with the new structure.`, 409);
        }
      }
    }
    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(clean(body.name, 160)); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(cleanOrNull(body.description, 2000)); }
    updates.push('config_json = ?'); values.push(JSON.stringify(config));
    values.push(activityId);
    await c.env.DB.prepare(`UPDATE cgm_activities SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    // Eligibility list
    if (Array.isArray(body.eligibleStudentIds)) {
      const ids = [...new Set(body.eligibleStudentIds.map((v: any) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0))].slice(0, 1000);
      await c.env.DB.prepare('DELETE FROM cgm_activity_eligible WHERE activity_id = ?').bind(activityId).run();
      if (config.eligibility === 'selected' && ids.length) {
        for (let i = 0; i < ids.length; i += 40) {
          await c.env.DB.batch(ids.slice(i, i + 40).map((id) => c.env.DB.prepare(
            'INSERT OR IGNORE INTO cgm_activity_eligible (activity_id, student_id) VALUES (?, ?)'
          ).bind(activityId, id)));
        }
      }
    }
    // The plan just changed (or was re-saved): make the real groups match it —
    // missing groups are created with the plan's names and capacity, every
    // group carries its planned name. This is what makes an edited plan
    // "republish" instantly instead of drifting from the Groups page.
    let synced: { created: number; renamed: number; archived: number } = { created: 0, renamed: 0, archived: 0 };
    if (config.groupCount || config.groupNaming !== 'numbers' || (config.groupNames || []).length) {
      synced = await syncGroupsToPlan(c.env.DB, activityId, config);
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.activity.updated', entityType: 'activity', entityId: activityId,
      classId: Number(activity.class_id), activityId,
      context: { groupsCreated: synced.created, groupsRenamed: synced.renamed, groupsArchived: synced.archived },
    });
    return c.json({ success: true, data: { groupsCreated: synced.created, groupsRenamed: synced.renamed, groupsArchived: synced.archived } });
  });

  app.post('/api/cgm/activities/:id/lifecycle', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const body = await readBody(c);
    const action = String(body.action || '');
    const reason = cleanOrNull(body.reason, 500);
    const archive = ['archive', 'restore', 'cancel', 'complete'].includes(action);
    const guard = await requireClassPermission(c, member, Number(activity.class_id),
      archive ? 'archive_activities' : 'manage_activities');
    if (!guard.ok) return guard.response;

    const allowed: Record<string, { from: string[]; to: string; stamp?: string }> = {
      open: { from: ['draft', 'paused'], to: 'open', stamp: 'opened_at' },
      publish: { from: ['draft', 'open'], to: 'published', stamp: 'published_at' },
      pause: { from: ['open', 'published', 'active'], to: 'paused' },
      resume: { from: ['paused'], to: 'active' },
      complete: { from: ['open', 'published', 'active', 'paused'], to: 'completed', stamp: 'completed_at' },
      archive: { from: ['completed', 'cancelled'], to: 'archived', stamp: 'archived_at' },
      reopen: { from: ['completed'], to: 'active' },
      cancel: { from: ['draft', 'open', 'published', 'active', 'paused'], to: 'cancelled' },
      restore: { from: ['archived', 'cancelled'], to: 'draft' },
    };
    const rule = allowed[action];
    if (!rule) return bad(c, 'Unknown lifecycle action.', 400);
    if (!rule.from.includes(activity.status)) {
      return bad(c, `Cannot ${action} an activity that is ${ACTIVITY_LIFECYCLE_LABELS[activity.status] || activity.status}.`, 409);
    }
    if (action === 'cancel' && !reason) return bad(c, 'Give a reason when cancelling an activity.');
    if (action === 'cancel' || action === 'archive') {
      if (!member.isPhantom && !guard.context.permissions.has('archive_activities' as ClassPermission)) {
        return bad(c, 'You are not authorized to archive or cancel activities.', 403);
      }
    }

    const updates = [`status = '${rule.to}'`];
    if (rule.stamp) updates.push(`${rule.stamp} = CURRENT_TIMESTAMP`);
    if (action === 'cancel') updates.push('cancelled_reason = ?');
    await c.env.DB.prepare(
      `UPDATE cgm_activities SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(...(action === 'cancel' ? [reason, activityId] : [activityId])).run();

    // Snapshots preserve the state at the three protected moments.
    if (['publish', 'complete', 'archive', 'cancel'].includes(action)) {
      const groups = await asRows<any>(c.env.DB.prepare(
        `SELECT g.id, g.name, g.position, g.capacity,
                (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
         FROM cgm_groups g WHERE g.activity_id = ?`
      ).bind(activityId));
      const assignments = await asRows<any>(c.env.DB.prepare(
        `SELECT ga.student_id, ga.group_id FROM cgm_group_assignments ga
         WHERE ga.activity_id = ? AND ga.status = 'active'`
      ).bind(activityId));
      const leaders = await asRows<any>(c.env.DB.prepare(
        `SELECT l.group_id, l.student_id, l.role FROM cgm_leadership_appointments l
         WHERE l.activity_id = ? AND l.status = 'active'`
      ).bind(activityId));
      const electionOutcomes = await asRows<any>(c.env.DB.prepare(
        `SELECT id, group_id, title, status, results_json FROM cgm_elections WHERE activity_id = ?`
      ).bind(activityId));
      await c.env.DB.prepare(
        `INSERT INTO cgm_activity_snapshots (activity_id, kind, payload_json, created_by_label) VALUES (?, ?, ?, ?)`
      ).bind(activityId, action === 'publish' ? 'publication' : action === 'complete' ? 'completion' : action === 'archive' ? 'archive' : 'cancellation',
        JSON.stringify({ groups, assignments, leaders, electionOutcomes, status: rule.to, reason: reason || null }),
        member.name).run();
    }

    // Going live with a planned group structure: the groups students will
    // draw into or pick from are ALREADY DEFINED — created here with the
    // plan's names (Group 1…/Group A…/custom) and capacity, so nobody has to
    // stage them separately and the Groups page opens fully formed.
    if (['open', 'publish', 'resume', 'reopen'].includes(action)) {
      const liveConfig = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
      if (liveConfig.groupCount) await syncGroupsToPlan(c.env.DB, activityId, liveConfig);
    }

    if (action === 'cancel') {
      await recordPhantomInboxItem(c.env.DB, {
        channel: 'class_groups',
        title: 'Activity cancelled',
        summary: `${activity.name} in ${activity.class_name} was cancelled.`,
        source: 'cgm_activity', sourceId: String(activityId), actorProfileId: member.profileId,
        actorLabel: member.name, link: '#classes', body: reason || '',
      });
    }

    // Student notifications for the moments they experience directly.
    if (['publish', 'complete', 'cancel'].includes(action)) {
      const students = await asRows<{ student_id: number }>(c.env.DB.prepare(
        `SELECT student_id FROM cgm_class_members WHERE class_id = ? AND status = 'active'`
      ).bind(Number(activity.class_id)));
      const messages: Record<string, [string, string]> = {
        publish: ['New activity published', `${activity.name} is now open in ${activity.class_name}.`],
        complete: ['Activity completed', `${activity.name} has been completed. Groups and results are preserved.`],
        cancel: ['Activity cancelled', `${activity.name} was cancelled. ${reason || ''}`],
      };
      const [title, message] = messages[action];
      for (const row of students) {
        await notifyStudent(c.env.DB, Number(row.student_id), 'activity', title, message);
      }
    }

    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: `cgm.activity.${action}`, entityType: 'activity', entityId: activityId,
      classId: Number(activity.class_id), activityId, context: { reason },
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/activities/:id/duplicate', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'manage_activities');
    if (!guard.ok) return guard.response;
    // Configuration is copied; assignments, votes and attendance never are.
    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_activities (class_id, name, type, description, config_json, created_by_profile_id, created_by_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(Number(activity.class_id), `${activity.name} (copy)`, activity.type, activity.description,
      activity.config_json, member.profileId, member.name).run();
    return c.json({ success: true, data: { activityId: Number(result.meta.last_row_id) } });
  });

  app.post('/api/cgm/activities/:id/save-template', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'manage_activities');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const name = clean(body.name, 120) || `${activity.name} template`;
    await c.env.DB.prepare(
      `INSERT INTO cgm_activity_templates (class_id, name, config_json, created_by_profile_id, created_by_label)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(Number(activity.class_id), name, activity.config_json, member.profileId, member.name).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.template.saved', entityType: 'activity', entityId: activityId, classId: Number(activity.class_id),
    });
    return c.json({ success: true });
  });

  app.get('/api/cgm/classes/:id/templates', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_activities');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      'SELECT id, name, config_json, created_by_label, created_at FROM cgm_activity_templates WHERE class_id = ? OR class_id IS NULL ORDER BY id DESC LIMIT 100'
    ).bind(classId));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), name: row.name, createdBy: row.created_by_label, createdAt: row.created_at,
        config: sanitizeActivityConfig(JSON.parse(row.config_json || '{}')),
      })),
    });
  });

  app.delete('/api/cgm/templates/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const templateId = Number(c.req.param('id'));
    const rows = await asRows<{ id: number; class_id: number | null }>(c.env.DB.prepare(
      'SELECT id, class_id FROM cgm_activity_templates WHERE id = ?'
    ).bind(templateId));
    if (!rows[0]) return bad(c, 'Template not found.', 404);
    if (rows[0].class_id !== null) {
      const guard = await requireClassPermission(c, member, Number(rows[0].class_id), 'manage_activities');
      if (!guard.ok) return guard.response;
    } else if (!member.isPhantom) {
      return bad(c, 'Only PHANTOM manages platform templates.', 403);
    }
    await c.env.DB.prepare('DELETE FROM cgm_activity_templates WHERE id = ?').bind(templateId).run();
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Groups: generation, manual moves, late placement, removal, waitlist
  // -------------------------------------------------------------------------
  app.post('/api/cgm/activities/:id/groups', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'generate_groups');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const count = Math.max(1, Math.min(50, Math.floor(Number(body.count || 1))));
    const capacity = body.capacity ? Math.max(1, Math.min(200, Math.floor(Number(body.capacity)))) : null;
    // Names come from the activity's own naming scheme (set in the activity
    // settings): Group 1…, Group A…, or the organizer's custom list — so the
    // Groups page and the activity form can never disagree.
    const groupConfig = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    const existing = await asRows<{ c: number }>(c.env.DB.prepare(
      "SELECT COUNT(*) AS c FROM cgm_groups WHERE activity_id = ? AND status = 'active'"
    ).bind(activityId));
    const startPosition = Number(existing[0]?.c || 0);
    // The plan rules: no creation beyond the planned number of groups — the
    // publish/open sync already staged them, so a repeat call is a no-op
    // instead of doubling the groups behind the organizer's back.
    let toCreate = count;
    if (groupConfig.groupCount) {
      const room = Math.max(0, Number(groupConfig.groupCount) - startPosition);
      if (room === 0) return c.json({ success: true, data: { added: 0, capped: true } });
      toCreate = Math.min(toCreate, room);
    }
    const batch: D1PreparedStatement[] = [];
    for (let i = 0; i < toCreate; i += 1) {
      batch.push(c.env.DB.prepare(
        'INSERT INTO cgm_groups (activity_id, position, name, capacity) VALUES (?, ?, ?, ?)'
      ).bind(activityId, startPosition + i + 1,
        groupLabel(startPosition + i + 1, groupConfig.groupNaming, groupConfig.groupNames), capacity));
    }
    await c.env.DB.batch(batch);
    return c.json({ success: true, data: { added: toCreate, capped: toCreate < count } });
  });

  /**
   * Sync the activity's real groups to its saved plan: the planned number of
   * groups exists (missing ones created with the plan's capacity) and every
   * group carries its plan name (Group 1…, Group A…, or the organizer's
   * custom list, positionally). Runs when a random-planned activity is
   * published/opened — the groups students draw into are ALREADY DEFINED —
   * and whenever an organizer saves a plan change, so the Groups page can
   * never drift from the activity settings.
   */
  const syncGroupsToPlan = async (db: D1Database, activityId: number, planConfig: ReturnType<typeof sanitizeActivityConfig>) => {
    const existing = await asRows<any>(db.prepare(
      `SELECT id, name, position FROM cgm_groups WHERE activity_id = ? AND status = 'active' ORDER BY position`
    ).bind(activityId));
    const planned = planConfig.groupCount ? Number(planConfig.groupCount) : null;
    let created = 0;
    if (planned && existing.length < planned) {
      const capacity = planConfig.capacity ?? null;
      const batch: D1PreparedStatement[] = [];
      for (let position = existing.length + 1; position <= planned; position += 1) {
        batch.push(db.prepare(
          'INSERT INTO cgm_groups (activity_id, position, name, capacity) VALUES (?, ?, ?, ?)'
        ).bind(activityId, position, groupLabel(position, planConfig.groupNaming, planConfig.groupNames), capacity));
      }
      await db.batch(batch);
      created = batch.length;
    }
    let renamed = 0;
    for (const group of existing) {
      const plannedName = groupLabel(Number(group.position), planConfig.groupNaming, planConfig.groupNames);
      if (String(group.name || '') !== plannedName) {
        await db.prepare('UPDATE cgm_groups SET name = ? WHERE id = ?').bind(plannedName, Number(group.id)).run();
        renamed += 1;
      }
    }
    // A smaller plan archives the surplus — but only groups with no members;
    // a populated group is never dropped by a plan change.
    let archived = 0;
    if (planned && existing.length > planned) {
      for (const group of existing.slice(planned)) {
        const sizeRows = await asRows<{ c: number }>(db.prepare(
          `SELECT COUNT(*) AS c FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
        ).bind(Number(group.id)));
        if (Number(sizeRows[0]?.c || 0) === 0) {
          await db.prepare("UPDATE cgm_groups SET status = 'archived' WHERE id = ?").bind(Number(group.id)).run();
          archived += 1;
        }
      }
    }
    return { created, renamed, archived };
  };

  const eligibleStudentsFor = async (db: D1Database, activityId: number, eligibility: string, classId: number) => {
    if (eligibility === 'selected') {
      const rows = await asRows<any>(db.prepare(
        `SELECT s.id, s.full_name, s.gender FROM cgm_activity_eligible e JOIN cgm_students s ON s.id = e.student_id
         WHERE e.activity_id = ? ORDER BY s.full_name`
      ).bind(activityId));
      return rows;
    }
    return asRows<any>(db.prepare(
      `SELECT s.id, s.full_name, s.gender FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id
       WHERE cm.class_id = ? AND cm.status = 'active' ORDER BY s.full_name`
    ).bind(classId));
  };

  /**
   * FORCE GET — place every approved designation whose student is still
   * unplaced. Runs BEFORE the organizer's planner so a designated student is
   * never shuffled into a random group (and never has a random seat claimed
   * that their reservation was holding). Students whose designated seat cannot
   * be taken right now are returned as `pending` and left for their own draw /
   * Re-choose; the designation stays live either way.
   */
  const placeDesignatedStudents = async (
    db: D1Database, activityId: number, activity: any, label: string,
  ) => {
    await ensureForceGetSchema(db);
    const designations = await activeDesignationsFor(db, activityId);
    const pending: number[] = [];
    const blocked: number[] = [];
    let placed = 0;
    if (!designations.size) return { placed, pending, blocked };
    // genderRule = 'separate' also governs the automatic application of an
    // approved designation: the rule is never broken to honour one.
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    const enforcePools = config.genderRule === 'separate';
    const genders = enforcePools
      ? await studentGenders(db, activityId, [...designations.values()].map((d) => d.studentId))
      : new Map<number, string>();
    const assignedRows = await asRows<{ student_id: number }>(db.prepare(
      `SELECT student_id FROM cgm_group_assignments WHERE activity_id = ? AND status = 'active'`
    ).bind(activityId));
    const assigned = new Set(assignedRows.map((row) => Number(row.student_id)));
    for (const designation of designations.values()) {
      if (assigned.has(designation.studentId)) continue;
      const ok = await insertAssignmentRespectingDesignations(db, {
        activityId, groupId: designation.groupId, studentId: designation.studentId,
        via: 'automatic', label,
        enforceGenderPools: enforcePools, studentGender: genders.get(designation.studentId),
      });
      if (!ok) {
        // Distinguish "seat taken" from "gender-separated policy": the latter is
        // reported to the organizer, and the designation stays active (unapplied)
        // so nothing is silently lost or silently violated.
        if (enforcePools && await groupHoldsOtherPool(db, activityId, designation.groupId, genders.get(designation.studentId))) {
          blocked.push(designation.studentId);
          await auditCgm(db, {
            actorType: 'system', actorLabel: 'gender policy',
            action: 'cgm.force_get.apply_blocked', entityType: 'force_get_designation', entityId: designation.id,
            activityId, classId: Number(activity.class_id),
            context: {
              studentId: designation.studentId, groupId: designation.groupId,
              reason: 'gender_rule_separate', studentGender: genders.get(designation.studentId) || 'unknown',
              requestId: designation.requestId, version: designation.version,
            },
          });
          continue;
        }
        pending.push(designation.studentId);
        continue;
      }
      const assignmentId = await activeAssignmentId(db, activityId, designation.studentId);
      const applied = await markDesignationApplied(db, designation.id, assignmentId);
      await db.prepare(
        `INSERT INTO cgm_assignment_events (activity_id, student_id, to_group_id, action, actor_label, reason)
         VALUES (?, ?, ?, 'assigned', ?, 'force get designation')`
      ).bind(activityId, designation.studentId, designation.groupId, label).run();
      await notifyStudent(db, designation.studentId, 'groups', 'Placed in your approved group',
        `Your organizer's approved placement for ${activity.name} has been applied.`);
      await auditCgm(db, {
        actorType: 'organizer', actorLabel: label,
        action: 'cgm.force_get.applied', entityType: 'force_get_designation', entityId: designation.id,
        activityId, classId: Number(activity.class_id),
        context: { studentId: designation.studentId, groupId: designation.groupId, requestId: designation.requestId, version: designation.version, appliedExactlyOnce: applied, via: 'organizer generate' },
      });
      placed += 1;
    }
    return { placed, pending, blocked };
  };

  app.post('/api/cgm/activities/:id/generate', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    if (!throttle(c, 15, 600)) return bad(c, 'Too many generation attempts. Try again shortly.', 429);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'generate_groups');
    if (!guard.ok) return guard.response;
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    if (['completed', 'archived', 'cancelled'].includes(activity.status)) {
      return bad(c, 'This activity no longer accepts assignments.', 409);
    }
    const body = await readBody(c);
    const groupCount = body.groupCount ? Math.max(2, Math.min(50, Math.floor(Number(body.groupCount)))) : config.groupCount;
    const targetSize = body.targetSize ? Math.max(2, Math.min(200, Math.floor(Number(body.targetSize)))) : config.targetGroupSize;
    const capacity = config.capacity ?? (body.capacity ? Math.max(1, Math.min(200, Math.floor(Number(body.capacity)))) : null);

    // Approved Force Get designations are honoured before any planning, so the
    // planner sees their seats as taken and never reshuffles them.
    const designated = await placeDesignatedStudents(c.env.DB, activityId, activity, member.name);
    const awaitingDesignationSeat = new Set(designated.pending);
    // genderRule = 'separate': the planner can only use groups that are empty
    // or already hold the student's own pool (a 'mixed' group accepts nobody).
    const pools = config.genderRule === 'separate' ? await groupGenderPools(c.env.DB, activityId) : new Map<number, string>();

    const existingGroups = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.capacity,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active' ORDER BY g.position`
    ).bind(activityId));
    let groups = existingGroups.map((row) => ({
      groupId: Number(row.id), capacity: row.capacity === null ? null : Number(row.capacity),
      currentSize: Number(row.size), pool: pools.get(Number(row.id)),
    }));

    // Create the groups the organizer asked for (idempotent: only the missing
    // number is added).
    let needed = 0;
    if (groupCount) needed = Math.max(0, groupCount - groups.length);
    else if (targetSize) {
      const unassignedRows = await asRows<{ c: number }>(c.env.DB.prepare(
        `SELECT COUNT(*) AS c FROM (${eligibilitySql(Number(activity.class_id), config.eligibility, activityId)})`
      ).bind(...eligibilityBinds(Number(activity.class_id), config.eligibility, activityId)));
      const unassignedCount = Number(unassignedRows[0]?.c || 0)
        - groups.reduce((sum, group) => sum + group.currentSize, 0);
      needed = Math.max(0, Math.ceil(unassignedCount / targetSize) - groups.length);
    }
    if (needed > 0) {
      const startPosition = groups.length;
      const batch: D1PreparedStatement[] = [];
      for (let i = 0; i < needed; i += 1) {
        batch.push(c.env.DB.prepare(
          'INSERT INTO cgm_groups (activity_id, position, name, capacity) VALUES (?, ?, ?, ?)'
        ).bind(activityId, startPosition + i + 1,
          groupLabel(startPosition + i + 1, config.groupNaming, config.groupNames), capacity));
      }
      await c.env.DB.batch(batch);
      groups = await asRows<any>(c.env.DB.prepare(
        `SELECT g.id, g.capacity,
                (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
         FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active' ORDER BY g.position`
      ).bind(activityId)).then((rows) => rows.map((row) => ({
        groupId: Number(row.id), capacity: row.capacity === null ? null : Number(row.capacity),
        currentSize: Number(row.size), pool: pools.get(Number(row.id)),
      })));
    }
    if (!groups.length) return bad(c, 'Create groups first or specify how many groups you need.');

    // Unassigned, eligible students only. Assigned students are never reshuffled.
    const assignedIds = new Set((await asRows<{ student_id: number }>(c.env.DB.prepare(
      `SELECT student_id FROM cgm_group_assignments WHERE activity_id = ? AND status = 'active'`
    ).bind(activityId))).map((row) => Number(row.student_id)));
    const roster = await eligibleStudentsFor(c.env.DB, activityId, config.eligibility, Number(activity.class_id));
    const students: AssignableStudent[] = roster
      .filter((row: any) => !assignedIds.has(Number(row.id)) && !awaitingDesignationSeat.has(Number(row.id)))
      .map((row: any) => ({ studentId: Number(row.id), gender: row.gender }));

    const previousClassmates = await repeatClassmateMap(c.env.DB, Number(activity.class_id), students.map((s) => s.studentId));
    let plan = planAssignments({
      groups,
      students,
      genderRule: config.genderRule,
      repeatRule: config.repeatRule,
      previousClassmates,
      rng: secureRng(),
    });
    if (config.genderRule === 'balanced') {
      const studentMap = new Map(students.map((s) => [s.studentId, s]));
      plan = rebalanceGenders(plan, studentMap, groups, secureRng());
    }

    const applied = await applyPlan(c.env.DB, activityId, plan, 'automatic', member.name, {
      genderRule: config.genderRule,
      genders: new Map(students.map((student) => [student.studentId, student.gender])),
    });
    const unplaced = students.length - applied;
    const warnings: string[] = [];
    if (awaitingDesignationSeat.size) {
      warnings.push(`${awaitingDesignationSeat.size} student(s) keep their approved Force Get destination — their seat is being held and will be yours to fill once it opens.`);
    }
    if (unplaced > 0) {
      if (config.overflow === 'waitlist') {
        for (const student of students.slice(applied)) {
          await c.env.DB.prepare('INSERT OR IGNORE INTO cgm_activity_waitlist (activity_id, student_id) VALUES (?, ?)')
            .bind(activityId, student.studentId).run();
        }
        warnings.push(`${unplaced} student(s) could not fit and joined the waiting list.`);
      } else {
        warnings.push(`${unplaced} student(s) could not fit into the available capacity.`);
      }
    }
    if (config.genderRule === 'separate') {
      const unknowns = students.filter((s) => s.gender === 'unknown').length;
      if (unknowns) warnings.push(`${unknowns} student(s) have no gender recorded and were grouped together separately.`);
    }
    if (config.repeatRule === 'avoid') {
      warnings.push('Repeat-classmate avoidance is a best-effort rule; small pools may force some repeats.');
    }

    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.assignment.generated', entityType: 'activity', entityId: activityId,
      classId: Number(activity.class_id), activityId,
      context: { placed: applied, unplaced, method: 'automatic' },
    });
    return c.json({ success: true, data: { placed: applied, unplaced, warnings } });
  });

  const eligibilitySql = (classId: number, eligibility: string, activityId: number) =>
    eligibility === 'selected'
      ? `SELECT s.id FROM cgm_activity_eligible e JOIN cgm_students s ON s.id = e.student_id WHERE e.activity_id = ${Number(activityId)}`
      : `SELECT s.id FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id WHERE cm.class_id = ${Number(classId)} AND cm.status = 'active'`;
  const eligibilityBinds = (_classId: number, _eligibility: string, _activityId: number): any[] => [];

  const repeatClassmateMap = async (db: D1Database, classId: number, studentIds: number[]) => {
    const map = new Map<number, Set<number>>();
    if (!studentIds.length) return map;
    const rows = await asRows<any>(db.prepare(
      `SELECT ga1.student_id AS a, ga2.student_id AS b
       FROM cgm_group_assignments ga1
       JOIN cgm_group_assignments ga2 ON ga1.activity_id = ga2.activity_id AND ga1.group_id = ga2.group_id
       JOIN cgm_activities act ON act.id = ga1.activity_id
       WHERE act.class_id = ? AND ga1.status = 'active' AND ga2.status = 'active' AND ga1.student_id <> ga2.student_id`
    ).bind(classId));
    for (const row of rows) {
      const a = Number(row.a); const b = Number(row.b);
      if (!map.has(a)) map.set(a, new Set());
      if (!map.has(b)) map.set(b, new Set());
      map.get(a)!.add(b);
      map.get(b)!.add(a);
    }
    return map;
  };

  const applyPlan = async (
    db: D1Database, activityId: number, plan: { studentId: number; groupId: number }[], via: string, label: string,
    gate?: { genderRule: string; genders: Map<number, string> },
  ) => {
    let applied = 0;
    const enforcePools = gate?.genderRule === 'separate';
    for (const placement of plan) {
      try {
        // Designation-aware guard: seats reserved for approved Force Get
        // designations are never stolen by ordinary placement, and under
        // `separate` a group only accepts one gender pool.
        const wrote = await insertAssignmentRespectingDesignations(db, {
          activityId, groupId: placement.groupId, studentId: placement.studentId, via, label,
          enforceGenderPools: enforcePools, studentGender: gate?.genders.get(placement.studentId),
        });
        if (!wrote) {
          console.warn('[code-rx] assignment skipped (already active or capacity):', placement);
          continue;
        }
        await db.prepare(
          `INSERT INTO cgm_assignment_events (activity_id, student_id, to_group_id, action, actor_label, reason)
           VALUES (?, ?, ?, 'assigned', ?, ?)`
        ).bind(activityId, placement.studentId, placement.groupId, label, via).run();
        applied += 1;
        await notifyStudent(db, placement.studentId, 'groups', 'You have been placed in a group',
          `Your organizer placed you in a group. Open the activity to see your group members.`);
      } catch (error) {
        // The partial UNIQUE index rejects double assignment; one student can
        // never land in two active groups of the same activity.
        console.warn('[code-rx] assignment skipped (already active or capacity):', error);
      }
    }
    return applied;
  };

  app.post('/api/cgm/activities/:id/assign-remaining', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'generate_groups');
    if (!guard.ok) return guard.response;
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    // Approved Force Get designations are placed first (and their seats are
    // then counted as taken, never handed to somebody else).
    const designated = await placeDesignatedStudents(c.env.DB, activityId, activity, member.name);
    const awaitingDesignationSeat = new Set(designated.pending);
    const pools = config.genderRule === 'separate' ? await groupGenderPools(c.env.DB, activityId) : new Map<number, string>();
    const groups = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.capacity,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active' ORDER BY g.position`
    ).bind(activityId));
    const assignedRows = await asRows<{ student_id: number }>(c.env.DB.prepare(
      `SELECT student_id FROM cgm_group_assignments WHERE activity_id = ? AND status = 'active'`
    ).bind(activityId));
    const assignedIds = new Set(assignedRows.map((row) => Number(row.student_id)));
    const roster = await eligibleStudentsFor(c.env.DB, activityId, config.eligibility, Number(activity.class_id));
    const students: AssignableStudent[] = roster.filter((row: any) => !assignedIds.has(Number(row.id)) && !awaitingDesignationSeat.has(Number(row.id)))
      .map((row: any) => ({ studentId: Number(row.id), gender: row.gender }));
    const plan = planAssignments({
      groups: groups.map((row) => ({
        groupId: Number(row.id), capacity: row.capacity === null ? null : Number(row.capacity),
        currentSize: Number(row.size), pool: pools.get(Number(row.id)),
      })),
      students,
      genderRule: config.genderRule,
      repeatRule: config.repeatRule,
      previousClassmates: await repeatClassmateMap(c.env.DB, Number(activity.class_id), students.map((s) => s.studentId)),
      rng: secureRng(),
    });
    const applied = await applyPlan(c.env.DB, activityId, plan, 'automatic', member.name, {
      genderRule: config.genderRule,
      genders: new Map(students.map((student) => [student.studentId, student.gender])),
    });
    // Promote from the waitlist while seats remain.
    const waiting = await asRows<any>(c.env.DB.prepare(
      `SELECT w.id, w.student_id FROM cgm_activity_waitlist w WHERE w.activity_id = ? AND w.status = 'waiting' ORDER BY w.id`
    ).bind(activityId));
    let promoted = 0;
    for (const row of waiting) {
      const waiterId = Number(row.student_id);
      // Candidates are re-read for every waiter: earlier promotions changed
      // sizes, pools and reservations.
      const candidateRows = await asRows<any>(c.env.DB.prepare(
        `SELECT g.id, g.capacity,
                (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
         FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = ? AND ga.status = 'active')
         ORDER BY (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active'), g.position`
      ).bind(activityId, activityId, waiterId));
      const liveReserved = await reservedSeatsFor(c.env.DB, activityId);
      const livePools = config.genderRule === 'separate' ? await groupGenderPools(c.env.DB, activityId) : null;
      const waiterGender = livePools ? (await studentGenders(c.env.DB, activityId, [waiterId])).get(waiterId) : undefined;
      const freeGroup = candidateRows.filter((group) => {
        if (group.capacity !== null
          && Number(group.size) + (liveReserved.get(Number(group.id)) || 0) >= Number(group.capacity)) return false;
        if (!livePools) return true;
        const pool = livePools.get(Number(group.id));
        // A group already holding another pool (or more than one) cannot take
        // this waiter — the seat stays free rather than mixing genders.
        return !pool || (pool !== 'mixed' && pool === String(waiterGender || 'unknown'));
      }).slice(0, 1);
      if (!freeGroup[0]) continue;
      // Same atomic guard as self-assignment: if a concurrent request took
      // the seat, skip this waiter instead of overfilling the group.
      const promotedSeat = await insertAssignmentRespectingDesignations(c.env.DB, {
        activityId, groupId: Number(freeGroup[0].id), studentId: waiterId,
        via: 'waitlist', label: member.name,
        enforceGenderPools: config.genderRule === 'separate', studentGender: waiterGender,
      });
      if (!promotedSeat) continue;
      await c.env.DB.prepare(
        `INSERT INTO cgm_assignment_events (activity_id, student_id, to_group_id, action, actor_label, reason)
         VALUES (?, ?, ?, 'assigned', ?, 'promoted from waiting list')`
      ).bind(activityId, waiterId, Number(freeGroup[0].id), member.name).run();
      await c.env.DB.prepare(
        `UPDATE cgm_activity_waitlist SET status = 'promoted', promoted_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(Number(row.id)).run();
      await notifyStudent(c.env.DB, Number(row.student_id), 'groups', 'A seat opened for you',
        `A seat opened in ${activity.name} and you have been placed in a group.`);
      promoted += 1;
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.assignment.remaining', entityType: 'activity', entityId: activityId,
      classId: Number(activity.class_id), activityId, context: { placed: applied, promoted },
    });
    return c.json({ success: true, data: { placed: applied, promoted, unplaced: students.length - applied } });
  });

  app.post('/api/cgm/activities/:id/assign-student', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'move_students');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const studentId = Number(body.studentId);
    const groupId = Number(body.groupId);
    if (!studentId || !groupId) return bad(c, 'Choose a student and a group.');
    const group = await groupCore(c.env.DB, groupId);
    if (!group || Number(group.activity_id) !== activityId) return bad(c, 'That group is not part of this activity.', 400);

    const current = await asRows<any>(c.env.DB.prepare(
      `SELECT ga.id, ga.group_id FROM cgm_group_assignments ga
       WHERE ga.activity_id = ? AND ga.student_id = ? AND ga.status = 'active'`
    ).bind(activityId, studentId));
    if (current[0] && Number(current[0].group_id) === groupId) return bad(c, 'The student is already in that group.', 409);
    // genderRule = 'separate': a manual move may not mix pools either — judged
    // on the group's COMPLETE composition (members + seats reserved by approved
    // designations + this student), exactly like a Force Get request. The
    // organizer gets the reason instead of a misleading "group is full".
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    let genderGate = false;
    let genderOfStudent = 'unknown';
    if (config.genderRule === 'separate') {
      const genderMap = await studentGenders(c.env.DB, activityId, [studentId]);
      genderOfStudent = genderMap.get(studentId) || 'unknown';
      const activityGroups = await asRows<any>(c.env.DB.prepare(
        `SELECT id, name, position, capacity FROM cgm_groups WHERE activity_id = ? AND status = 'active'`
      ).bind(activityId));
      const composition = await forceGetComposition(c.env.DB, {
        activityId,
        genderRule: 'separate',
        proposal: [{ studentId, groupId }],
        groups: activityGroups.map((row: any) => ({
          id: Number(row.id), name: row.name || `Group ${row.position}`, capacity: row.capacity,
        })),
      });
      const clash = composition.conflicts.find((conflict) => conflict.kind === 'gender' && conflict.groupId === groupId);
      if (clash) {
        return c.json({
          success: false,
          error: `This activity separates gender pools, so ${group.name || 'that group'} cannot take this student. ${clash.message}`,
          data: {
            code: 'force_get_composition_conflict',
            conflicts: [{
              kind: clash.kind, groupId: clash.groupId, groupName: clash.groupName, message: clash.message,
              pools: clash.detail.pools,
              students: [
                ...clash.detail.proposed.map((member) => ({ ...member, role: 'proposed' })),
                ...clash.detail.existing.map((member) => ({ ...member, role: member.source })),
              ],
            }],
          },
        }, 409);
      }
      genderGate = true;
    }
    if (group.capacity !== null) {
      const sizeRows = await asRows<{ c: number }>(c.env.DB.prepare(
        `SELECT COUNT(*) AS c FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
      ).bind(groupId));
      const size = Number(sizeRows[0]?.c || 0);
      const movingWithin = current[0] ? 1 : 0;
      if (size + (current[0] ? 0 : 1) - movingWithin + movingWithin > group.capacity && !current[0] && size >= group.capacity) {
        return bad(c, 'That group is full.', 409);
      }
    }
    // An organizer move to a DIFFERENT group overrides an approved Force Get
    // designation; the designation is cleared (audited), never left to fight
    // the organizer later. A move INTO the designated group consumes it.
    const liveDesignation = (await activeDesignationsFor(c.env.DB, activityId)).get(studentId) || null;
    if (liveDesignation && liveDesignation.groupId !== groupId) {
      await c.env.DB.prepare(
        `UPDATE cgm_force_get_designations SET status = 'cleared', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`
      ).bind(liveDesignation.id).run();
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.force_get.cleared', entityType: 'force_get_designation', entityId: liveDesignation.id,
        classId: Number(activity.class_id), activityId,
        context: { studentId, fromGroupId: liveDesignation.groupId, toGroupId: groupId, reason: 'organizer placement', requestId: liveDesignation.requestId },
      });
    }
    if (current[0]) {
      await c.env.DB.prepare(
        `UPDATE cgm_group_assignments SET status = 'removed', removed_at = CURRENT_TIMESTAMP, removal_reason = 'moved by organizer' WHERE id = ?`
      ).bind(Number(current[0].id)).run();
      const wrote = await insertAssignmentRespectingDesignations(c.env.DB, {
        activityId, groupId, studentId, via: 'organizer', label: member.name,
        enforceGenderPools: genderGate, studentGender: genderOfStudent,
      });
      if (!wrote) {
        // The destination filled up (or changed pool) between the check and the
        // write; put the student back exactly where they were instead of
        // leaving them seatless.
        await restoreAssignment(c.env.DB, Number(current[0].id));
        return bad(c, genderGate
          ? 'That group just changed — the student keeps their current group.'
          : 'That group just filled up — the student keeps their current group.', 409);
      }
      await c.env.DB.prepare(
        `INSERT INTO cgm_assignment_events (activity_id, student_id, from_group_id, to_group_id, action, actor_label, reason)
         VALUES (?, ?, ?, ?, 'moved', ?, 'organizer move')`
      ).bind(activityId, studentId, Number(current[0].group_id), groupId, member.name).run();
    } else {
      const wrote = await insertAssignmentRespectingDesignations(c.env.DB, {
        activityId, groupId, studentId, via: 'organizer', label: member.name,
        enforceGenderPools: genderGate, studentGender: genderOfStudent,
      });
      if (!wrote) return bad(c, genderGate ? 'That group just changed pool or filled up.' : 'That group just filled up.', 409);
      if (liveDesignation && liveDesignation.groupId === groupId) {
        await markDesignationApplied(c.env.DB, liveDesignation.id, await activeAssignmentId(c.env.DB, activityId, studentId));
      }
      await c.env.DB.prepare(
        `INSERT INTO cgm_assignment_events (activity_id, student_id, to_group_id, action, actor_label, reason)
         VALUES (?, ?, ?, 'assigned', ?, 'organizer placement')`
      ).bind(activityId, studentId, groupId, member.name).run();
    }
    await notifyStudent(c.env.DB, studentId, 'groups', 'Your group changed',
      current[0] ? `Your organizer moved you to a different group in ${activity.name}.` : `Your organizer placed you in a group in ${activity.name}.`);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: current[0] ? 'cgm.assignment.moved' : 'cgm.assignment.placed',
      entityType: 'activity', entityId: activityId, classId: Number(activity.class_id), activityId,
      context: { studentId, groupId, from: current[0]?.group_id || null },
    });
    return c.json({ success: true });
  });

  /**
   * Organizer direct swap: exchange two assigned members between their groups
   * in one action. Group sizes never change, so hard capacities are preserved
   * by construction. PHANTOM-regulated: guarded by the same `move_students`
   * permission as every other membership change, PHANTOM overrides it in every
   * class, and each swap writes two assignment-history events plus an audit
   * row (`cgm.assignment.swapped`) the oversight browser can see. A leader who
   * is swapped out of a group ends that leadership appointment, so the
   * activity's succession rule resolves the vacancy exactly as a removal does.
   */
  app.post('/api/cgm/activities/:id/swap-students', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'move_students');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const studentAId = Number(body.studentIdA);
    const studentBId = Number(body.studentIdB);
    if (!studentAId || !studentBId) return bad(c, 'Choose two students to swap.');
    if (studentAId === studentBId) return bad(c, 'Pick two different students.', 400);
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT ga.id, ga.group_id, ga.student_id, g.status AS group_status
       FROM cgm_group_assignments ga JOIN cgm_groups g ON g.id = ga.group_id
       WHERE ga.activity_id = ? AND ga.status = 'active' AND ga.student_id IN (?, ?)`
    ).bind(activityId, studentAId, studentBId));
    const a = rows.find((row: any) => Number(row.student_id) === studentAId);
    const b = rows.find((row: any) => Number(row.student_id) === studentBId);
    if (!a || !b) return bad(c, 'Both students must already be in a group for this activity.', 404);
    if (Number(a.group_id) === Number(b.group_id)) return bad(c, 'Those students are in the same group — there is nothing to swap.', 409);
    if (a.group_status !== 'active' || b.group_status !== 'active') return bad(c, 'One of those groups is no longer active.', 409);

    // Gender-separate activities must stay single-gender after the swap. Every
    // group is single-gender today, so the swap is safe exactly when both
    // students share one gender.
    if (config.genderRule === 'separate') {
      const genders = await asRows<{ student_id: number; gender: string }>(c.env.DB.prepare(
        `SELECT id AS student_id, gender FROM cgm_students WHERE id IN (?, ?)`
      ).bind(studentAId, studentBId));
      const genderOf = (id: number) => String(genders.find((row) => Number(row.student_id) === Number(id))?.gender || 'unknown');
      if (genderOf(studentAId) !== genderOf(studentBId)) {
        return bad(c, 'Gender-separate groups cannot exchange students of different genders.', 409);
      }
    }

    // Two in-place group exchanges, each conditional on the assignment still
    // being active; a lost race on the second write rolls the first back
    // instead of leaving one student in limbo.
    const moveA = await c.env.DB.prepare(
      `UPDATE cgm_group_assignments SET group_id = ? WHERE id = ? AND status = 'active'`
    ).bind(Number(b.group_id), Number(a.id)).run();
    if (!moveA.meta?.changes) return bad(c, 'That assignment just changed — try again.', 409);
    const moveB = await c.env.DB.prepare(
      `UPDATE cgm_group_assignments SET group_id = ? WHERE id = ? AND status = 'active'`
    ).bind(Number(a.group_id), Number(b.id)).run();
    if (!moveB.meta?.changes) {
      await c.env.DB.prepare(
        `UPDATE cgm_group_assignments SET group_id = ? WHERE id = ? AND status = 'active'`
      ).bind(Number(a.group_id), Number(a.id)).run();
      return bad(c, 'That assignment just changed — the swap was rolled back.', 409);
    }

    for (const [row, fromGroup, toGroup] of [[a, a.group_id, b.group_id], [b, b.group_id, a.group_id]] as const) {
      await c.env.DB.prepare(
        `INSERT INTO cgm_assignment_events (activity_id, student_id, from_group_id, to_group_id, action, actor_label, reason)
         VALUES (?, ?, ?, ?, 'moved', ?, 'organizer swap')`
      ).bind(activityId, Number(row.student_id), Number(fromGroup), Number(toGroup), member.name).run();
      const leadership = await asRows<any>(c.env.DB.prepare(
        `SELECT id FROM cgm_leadership_appointments WHERE group_id = ? AND student_id = ? AND status = 'active'`
      ).bind(Number(fromGroup), Number(row.student_id)));
      for (const seat of leadership) {
        await c.env.DB.prepare(
          `UPDATE cgm_leadership_appointments SET status = 'ended', ended_at = CURRENT_TIMESTAMP, end_reason = 'swapped to another group' WHERE id = ?`
        ).bind(Number(seat.id)).run();
      }
    }

    await notifyStudent(c.env.DB, studentAId, 'groups', 'Your group changed',
      `Your organizer swapped you into a different group in ${activity.name}.`);
    await notifyStudent(c.env.DB, studentBId, 'groups', 'Your group changed',
      `Your organizer swapped you into a different group in ${activity.name}.`);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.assignment.swapped', entityType: 'activity', entityId: activityId,
      classId: Number(activity.class_id), activityId,
      context: { studentAId, studentBId, groupA: Number(a.group_id), groupB: Number(b.group_id) },
    });
    return c.json({ success: true, data: {
      studentA: { from: Number(a.group_id), to: Number(b.group_id) },
      studentB: { from: Number(b.group_id), to: Number(a.group_id) },
    } });
  });

  app.post('/api/cgm/assignments/:id/remove', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const assignmentId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT ga.*, a.class_id, a.name AS activity_name FROM cgm_group_assignments ga
       JOIN cgm_activities a ON a.id = ga.activity_id WHERE ga.id = ? AND ga.status = 'active'`
    ).bind(assignmentId));
    const assignment = rows[0];
    if (!assignment) return bad(c, 'Assignment not found.', 404);
    const guard = await requireClassPermission(c, member, Number(assignment.class_id), 'remove_students');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const reason = cleanOrNull(body.reason, 500);
    await c.env.DB.prepare(
      `UPDATE cgm_group_assignments SET status = 'removed', removed_at = CURRENT_TIMESTAMP, removal_reason = ? WHERE id = ?`
    ).bind(reason, assignmentId).run();
    await c.env.DB.prepare(
      `INSERT INTO cgm_assignment_events (activity_id, student_id, from_group_id, action, actor_label, reason)
       VALUES (?, ?, ?, 'removed', ?, ?)`
    ).bind(Number(assignment.activity_id), Number(assignment.student_id), Number(assignment.group_id), member.name, reason).run();

    // Leadership succession: a removed leader leaves a vacancy the activity's
    // configured rule must resolve.
    const leadership = await asRows<any>(c.env.DB.prepare(
      `SELECT id FROM cgm_leadership_appointments WHERE group_id = ? AND student_id = ? AND status = 'active'`
    ).bind(Number(assignment.group_id), Number(assignment.student_id)));
    for (const row of leadership) {
      await c.env.DB.prepare(
        `UPDATE cgm_leadership_appointments SET status = 'ended', ended_at = CURRENT_TIMESTAMP, end_reason = 'member removed from activity' WHERE id = ?`
      ).bind(Number(row.id)).run();
    }

    await notifyStudent(c.env.DB, Number(assignment.student_id), 'groups', 'Removed from group',
      `You were removed from your group in ${assignment.activity_name}. ${reason || ''}`);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.assignment.removed', entityType: 'assignment', entityId: assignmentId,
      classId: Number(assignment.class_id), activityId: Number(assignment.activity_id),
      context: { studentId: Number(assignment.student_id), reason },
    });
    return c.json({ success: true });
  });

  /**
   * RE-CHOOSE — the organizer asks that a member start over and pick a group
   * again, exactly as if they had never chosen. It is deliberately a REQUEST,
   * never an action: nothing is removed here. PHANTOM reviews it and only an
   * approval releases the seat and re-opens the choice.
   */
  app.post('/api/cgm/assignments/:id/rechoose', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const assignmentId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT ga.*, a.class_id, a.name AS activity_name, s.full_name AS student_name
       FROM cgm_group_assignments ga
       JOIN cgm_activities a ON a.id = ga.activity_id
       JOIN cgm_students s ON s.id = ga.student_id
       WHERE ga.id = ? AND ga.status = 'active'`
    ).bind(assignmentId));
    const assignment = rows[0];
    if (!assignment) return bad(c, 'That member is not in an active group assignment.', 404);
    await ensureRechooseSchema(c.env.DB);
    const guard = await requireClassPermission(c, member, Number(assignment.class_id), 'remove_students');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const reason = cleanOrNull(body.reason, 500);
    const existing = await asRows<any>(c.env.DB.prepare(
      `SELECT id FROM cgm_rechoose_requests WHERE activity_id = ? AND student_id = ? AND status = 'pending'`
    ).bind(Number(assignment.activity_id), Number(assignment.student_id)));
    if (existing[0]) {
      return c.json({ success: true, data: { id: Number(existing[0].id), status: 'pending', message: 'This member already has a re-choose request waiting for PHANTOM.' } });
    }
    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_rechoose_requests
         (activity_id, group_id, student_id, assignment_id, from_via, reason, requested_by_profile_id, requester_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(Number(assignment.activity_id), Number(assignment.group_id), Number(assignment.student_id),
      assignmentId, assignment.assigned_via ? String(assignment.assigned_via) : null, reason,
      member.profileId, member.name).run();
    const requestId = Number(result.meta.last_row_id);
    await notifyStudent(c.env.DB, Number(assignment.student_id), 'groups', 'Your organizer asked you to re-choose',
      `Your organizer has asked that you choose your group again in ${assignment.activity_name}. PHANTOM reviews the request first — you will be told when it is approved.`);
    // PHANTOM decides this one, so PHANTOM must be told the moment it arrives —
    // in the Community inbox (channel: Class & Groups) and in notifications.
    await recordPhantomInboxItem(c.env.DB, {
      channel: 'class_groups',
      title: 'Re-choose request awaiting approval',
      summary: `${member.name} asked a member to choose a group again in ${assignment.activity_name} (${assignment.class_name}).`,
      source: 'cgm_rechoose', sourceId: String(requestId),
      actorProfileId: member.profileId, actorLabel: member.name,
      link: '#class-groups/phantom', body: reason || '',
    });
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.rechoose.requested', entityType: 'rechoose_request', entityId: requestId,
      classId: Number(assignment.class_id), activityId: Number(assignment.activity_id),
      context: { studentId: Number(assignment.student_id), assignmentId, reason },
    });
    return c.json({ success: true, data: { id: requestId, status: 'pending', message: 'Re-choose requested — waiting for PHANTOM approval.' } });
  });

  app.get('/api/cgm/activities/:id/rechoose-requests', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'view_roster');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, s.full_name AS student_name, s.index_number,
              COALESCE(g.name, 'Group ' || g.position) AS group_name
       FROM cgm_rechoose_requests r
       JOIN cgm_students s ON s.id = r.student_id
       LEFT JOIN cgm_groups g ON g.id = r.group_id
       WHERE r.activity_id = ? ORDER BY r.created_at DESC LIMIT 200`
    ).bind(activityId));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), studentId: Number(row.student_id), studentName: row.student_name,
        indexNumber: row.index_number, groupId: row.group_id === null ? null : Number(row.group_id),
        groupName: row.group_name, reason: row.reason, status: row.status,
        requesterLabel: row.requester_label, reviewerLabel: row.reviewer_label,
        reviewReason: row.review_reason, createdAt: row.created_at, reviewedAt: row.reviewed_at,
      })),
    });
  });

  app.post('/api/cgm/activities/:id/change-requests/:requestId/:decision', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const requestId = Number(c.req.param('requestId'));
    const decision = String(c.req.param('decision'));
    if (!['approve', 'reject'].includes(decision)) return bad(c, 'Unknown decision.', 404);
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'move_students');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_group_change_requests WHERE id = ? AND activity_id = ? AND status = 'pending'`
    ).bind(requestId, activityId));
    const request = rows[0];
    if (!request) return bad(c, 'Change request not found or already reviewed.', 404);
    const body = await readBody(c);
    const reviewReason = cleanOrNull(body.reviewReason, 500);

    if (decision === 'approve') {
      const destination = await asRows<any>(c.env.DB.prepare(
        `SELECT g.id, g.capacity,
                (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
         FROM cgm_groups g WHERE g.id = ? AND g.activity_id = ?`
      ).bind(Number(request.to_group_id), activityId));
      if (!destination[0]) return bad(c, 'The destination group no longer exists.', 409);
      if (destination[0].capacity !== null && Number(destination[0].size) >= Number(destination[0].capacity)) {
        return bad(c, 'The destination group is full.', 409);
      }
      const current = await asRows<{ id: number; group_id: number }>(c.env.DB.prepare(
        `SELECT id, group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'`
      ).bind(activityId, Number(request.student_id)));
      if (current[0]) {
        await c.env.DB.prepare(
          `UPDATE cgm_group_assignments SET status = 'removed', removed_at = CURRENT_TIMESTAMP, removal_reason = 'move approved' WHERE id = ?`
        ).bind(Number(current[0].id)).run();
      }
      const wrote = await insertAssignmentGuarded(c.env.DB, {
        activityId, groupId: Number(request.to_group_id), studentId: Number(request.student_id),
        via: 'organizer', label: member.name,
      });
      if (!wrote) {
        // Another approved move or self-assignment claimed the seat first;
        // restore the student's original group and refuse this one.
        if (current[0]) await restoreAssignment(c.env.DB, Number(current[0].id));
        return bad(c, 'The destination group just filled up — the student keeps their current group.', 409);
      }
      await c.env.DB.prepare(
        `INSERT INTO cgm_assignment_events (activity_id, student_id, from_group_id, to_group_id, action, actor_label, reason)
         VALUES (?, ?, ?, ?, 'moved', ?, 'approved student request')`
      ).bind(activityId, Number(request.student_id), current[0]?.group_id || null, Number(request.to_group_id), member.name).run();
      await notifyStudent(c.env.DB, Number(request.student_id), 'groups', 'Group change approved',
        `Your move to a new group in ${activity.name} was approved.`);
    } else {
      await notifyStudent(c.env.DB, Number(request.student_id), 'groups', 'Group change declined',
        reviewReason || 'Your group change request was declined.');
    }
    await c.env.DB.prepare(
      `UPDATE cgm_group_change_requests SET status = ?, reviewed_by_profile_id = ?, reviewer_label = ?, review_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(decision === 'approve' ? 'approved' : 'rejected', member.profileId, member.name, reviewReason, requestId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: `cgm.group_move.${decision}d`, entityType: 'activity', entityId: activityId,
      classId: Number(activity.class_id), activityId, context: { requestId },
    });
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Leadership: appointments, assistants, permissions, succession
  // -------------------------------------------------------------------------
  /**
   * Group workspace dossier: EVERYTHING about one group for its dedicated
   * management page — identity + topic, the parent activity's shape, members
   * (with leadership roles), active leadership, this group's elections,
   * announcements aimed at the group plus the activity-wide feed, the
   * WhatsApp link, the group's recent history, and who could still be added.
   */
  app.get('/api/cgm/groups/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const groupId = Number(c.req.param('id'));
    if (!Number.isInteger(groupId) || groupId <= 0) return bad(c, 'Group not found.', 404);
    const group = await groupCore(c.env.DB, groupId);
    if (!group) return bad(c, 'Group not found.', 404);
    const guard = await requireClassPermission(c, member, Number(group.class_id), 'view_roster');
    if (!guard.ok) return guard.response;
    const activity = await activityCore(c.env.DB, Number(group.activity_id));
    const config = activity ? sanitizeActivityConfig(JSON.parse(activity.config_json || '{}')) : null;
    const groupRow = (await asRows<any>(c.env.DB.prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.id = ?`
    ).bind(groupId)))[0];
    // Sensitive contact columns ride only for viewers holding the
    // view-sensitive permission — the same rule the roster and reports use.
    const canSeeSensitive = Boolean(guard.context.permissions?.has('view_sensitive_profiles'));
    // The re-choose columns ride along on this dossier; make sure the table is
    // there before the query references it (a warm DB booted pre-deploy).
    await ensureRechooseSchema(c.env.DB);
    const members = await asRows<any>(c.env.DB.prepare(
      `SELECT s.id, s.full_name, s.index_number${canSeeSensitive ? ', s.phone, s.email, s.gender' : ''}, ga.id AS assignment_id, ga.assigned_via,
              (SELECT GROUP_CONCAT(l.role || ':' || l.id) FROM cgm_leadership_appointments l
               WHERE l.group_id = ? AND l.student_id = s.id AND l.status = 'active') AS roles,
              (SELECT rc.status FROM cgm_rechoose_requests rc
               WHERE rc.activity_id = ga.activity_id AND rc.student_id = s.id
               ORDER BY rc.id DESC LIMIT 1) AS rechoose_status,
              (SELECT rc.id FROM cgm_rechoose_requests rc
               WHERE rc.activity_id = ga.activity_id AND rc.student_id = s.id
               ORDER BY rc.id DESC LIMIT 1) AS rechoose_request_id
       FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id
       WHERE ga.group_id = ? AND ga.status = 'active' ORDER BY s.full_name`
    ).bind(groupId, groupId));
    const leadership = await asRows<any>(c.env.DB.prepare(
      `SELECT l.id, l.role, l.status, l.student_id, s.full_name FROM cgm_leadership_appointments l
       JOIN cgm_students s ON s.id = l.student_id WHERE l.group_id = ? ORDER BY l.status, l.id`
    ).bind(groupId));
    const elections = await asRows<any>(c.env.DB.prepare(
      `SELECT e.id, e.title, e.status, e.role, e.anonymity, e.created_at,
              (SELECT COUNT(*) FROM cgm_candidates ec WHERE ec.election_id = e.id AND ec.status = 'active') AS candidates,
              (SELECT COUNT(*) FROM cgm_election_ballots b WHERE b.election_id = e.id) AS ballots
       FROM cgm_elections e WHERE e.group_id = ? ORDER BY e.id DESC LIMIT 20`
    ).bind(groupId));
    const announcements = await asRows<any>(c.env.DB.prepare(
      `SELECT id, title, body, author_label, pinned, group_id, created_at FROM cgm_announcements
       WHERE status = 'published' AND activity_id = ? AND (group_id = ? OR group_id IS NULL)
       ORDER BY pinned DESC, id DESC LIMIT 20`
    ).bind(Number(group.activity_id), groupId));
    const whatsapp = (await asRows<any>(c.env.DB.prepare(
      `SELECT id, url, status, click_count, created_at FROM cgm_whatsapp_links WHERE group_id = ? ORDER BY id DESC LIMIT 1`
    ).bind(groupId)))[0] || null;
    const events = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, s.full_name FROM cgm_assignment_events e JOIN cgm_students s ON s.id = e.student_id
       WHERE e.activity_id = ? AND (e.to_group_id = ? OR e.from_group_id = ?) ORDER BY e.id DESC LIMIT 40`
    ).bind(Number(group.activity_id), groupId, groupId));
    // Same rule as the activity page: 'all' means the whole class roster is the
    // pool (the eligible table only holds rows for 'selected' activities).
    const unassigned = config?.eligibility === 'selected'
      ? await asRows<any>(c.env.DB.prepare(
        `SELECT s.id, s.full_name FROM cgm_activity_eligible e JOIN cgm_students s ON s.id = e.student_id
         WHERE e.activity_id = ? AND NOT EXISTS
           (SELECT 1 FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = s.id AND ga.status = 'active')
         ORDER BY s.full_name`
      ).bind(Number(group.activity_id), Number(group.activity_id)))
      : await asRows<any>(c.env.DB.prepare(
        `SELECT s.id, s.full_name FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id
         WHERE cm.class_id = ? AND cm.status = 'active' AND NOT EXISTS
           (SELECT 1 FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = s.id AND ga.status = 'active')
         ORDER BY s.full_name`
      ).bind(Number(group.class_id), Number(group.activity_id)));
    // Members whose re-choose PHANTOM already approved: they have left this
    // group and can pick again. Shown so the organizer can see the outcome
    // instead of the row simply vanishing.
    const rechooseApproved = await asRows<any>(c.env.DB.prepare(
      `SELECT r.id AS request_id, s.id, s.full_name, r.reviewed_at, r.reviewer_label
       FROM cgm_rechoose_requests r JOIN cgm_students s ON s.id = r.student_id
       WHERE r.activity_id = ? AND r.group_id = ? AND r.status = 'approved' AND r.consumed_at IS NULL
       ORDER BY s.full_name`
    ).bind(Number(group.activity_id), groupId));
    const otherMembers = await asRows<any>(c.env.DB.prepare(
      `SELECT s.id, s.full_name, ga.group_id, g.name AS group_name
       FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id JOIN cgm_groups g ON g.id = ga.group_id
       WHERE ga.activity_id = ? AND ga.status = 'active' AND ga.group_id != ? ORDER BY s.full_name`
    ).bind(Number(group.activity_id), groupId));
    // FORCE GET badges for this group: who was forced here (applied), who is
    // still sitting here waiting for their own Re-choose (designation approved
    // for another group), and who has a seat reserved here. Shown to organizers
    // only — students never see these rows.
    await ensureForceGetSchema(c.env.DB);
    const designationRows = await asRows<any>(c.env.DB.prepare(
      `SELECT d.id, d.student_id, d.designated_group_id, d.status, d.approved_request_id, d.request_version,
              d.designated_by_label, d.approved_by_label, d.designated_at, d.applied_at, d.applied_assignment_id,
              s.full_name, dg.name AS designated_name, dg.position AS designated_position,
              i.previous_group_id, pg.name AS previous_name, pg.position AS previous_position,
              ga.id AS current_assignment_id, ga.group_id AS current_group_id, cg.name AS current_group_name
       FROM cgm_force_get_designations d
       JOIN cgm_students s ON s.id = d.student_id
       LEFT JOIN cgm_groups dg ON dg.id = d.designated_group_id
       LEFT JOIN cgm_force_get_request_items i ON i.request_id = d.approved_request_id AND i.student_id = d.student_id
       LEFT JOIN cgm_groups pg ON pg.id = i.previous_group_id
       LEFT JOIN cgm_group_assignments ga ON ga.activity_id = d.activity_id AND ga.student_id = d.student_id AND ga.status = 'active'
       LEFT JOIN cgm_groups cg ON cg.id = ga.group_id
       WHERE d.activity_id = ? AND d.status IN ('active','applied')
         AND (d.designated_group_id = ? OR ga.group_id = ?)
       ORDER BY s.full_name`
    ).bind(Number(group.activity_id), groupId, groupId));
    const designations = designationRows.map((row) => {
      const designatedGroupId = Number(row.designated_group_id);
      const currentGroupId = row.current_group_id === null || row.current_group_id === undefined ? null : Number(row.current_group_id);
      const applied = row.status === 'applied' && Number(row.applied_assignment_id || 0) > 0
        && Number(row.current_group_id || 0) === designatedGroupId;
      return {
        id: Number(row.id), studentId: Number(row.student_id), studentName: row.full_name,
        status: row.status,
        designatedGroupId,
        designatedGroupName: row.designated_name || `Group ${row.designated_position}`,
        currentGroupId, currentGroupName: row.current_group_name || null,
        previousGroupId: row.previous_group_id === null || row.previous_group_id === undefined ? null : Number(row.previous_group_id),
        previousGroupName: row.previous_name || null,
        designatedBy: row.designated_by_label || null,
        approvedBy: row.approved_by_label || null,
        designatedAt: row.designated_at || null,
        appliedAt: row.applied_at || null,
        applied,
        arrivesHere: designatedGroupId === groupId && currentGroupId !== groupId,
        awaitingResample: currentGroupId === groupId && designatedGroupId !== groupId,
        requestId: row.approved_request_id === null || row.approved_request_id === undefined ? null : Number(row.approved_request_id),
        version: row.request_version === null || row.request_version === undefined ? null : Number(row.request_version),
      };
    });
    return c.json({
      success: true,
      data: {
        group: {
          id: Number(groupRow.id), name: groupRow.name || `Group ${groupRow.position}`, position: Number(groupRow.position),
          topic: groupRow.topic || '', agenda: groupRow.agenda || '', capacity: groupRow.capacity === null || groupRow.capacity === undefined ? null : Number(groupRow.capacity),
          size: Number(groupRow.size), status: groupRow.status,
        },
        viewer: { canSeeSensitive },
        activity: activity ? {
          id: Number(activity.id), name: activity.name, status: activity.status,
          method: config?.method, className: activity.class_name,
        } : null,
        members: members.map((row) => {
          const designation = designations.find((entry) => entry.studentId === Number(row.id));
          return {
            ...row,
            forced: Boolean(designation?.applied),
            designation: designation || null,
            awaitingResample: Boolean(designation?.awaitingResample),
          };
        }),
        designations,
        forcedCount: designations.filter((entry) => entry.applied).length,
        reservedCount: designations.filter((entry) => entry.arrivesHere && entry.status === 'active').length,
        leadership, elections, announcements, whatsapp, events, unassigned, otherMembers, rechooseApproved,
      },
    });
  });

  /** Group settings: the topic and a per-group capacity that never drops
   * below the members already inside. Names stay owned by the activity plan. */
  app.patch('/api/cgm/groups/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const groupId = Number(c.req.param('id'));
    if (!Number.isInteger(groupId) || groupId <= 0) return bad(c, 'Group not found.', 404);
    const group = await groupCore(c.env.DB, groupId);
    if (!group) return bad(c, 'Group not found.', 404);
    const guard = await requireClassPermission(c, member, Number(group.class_id), 'manage_activities');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const updates: string[] = [];
    const values: any[] = [];
    if (body.topic !== undefined) {
      const topic = cleanOrNull(body.topic, 200);
      updates.push('topic = ?');
      values.push(topic);
    }
    if (body.agenda !== undefined) {
      const agenda = cleanOrNull(body.agenda, 2000);
      updates.push('agenda = ?');
      values.push(agenda);
    }
    if (body.capacity !== undefined) {
      const capacity = body.capacity === null ? null : Math.max(1, Math.min(200, Math.floor(Number(body.capacity))));
      if (capacity === null || Number.isNaN(capacity)) return bad(c, 'Give a capacity between 1 and 200.');
      const sizeRows = await asRows<{ c: number }>(c.env.DB.prepare(
        `SELECT COUNT(*) AS c FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
      ).bind(groupId));
      if (capacity < Number(sizeRows[0]?.c || 0)) return bad(c, `The group already has ${Number(sizeRows[0]?.c || 0)} member(s) — capacity cannot be smaller.`, 409);
      updates.push('capacity = ?');
      values.push(capacity);
    }
    if (!updates.length) return bad(c, 'Nothing to update.');
    await c.env.DB.prepare(`UPDATE cgm_groups SET ${updates.join(', ')} WHERE id = ?`).bind(...values, groupId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.group.updated', entityType: 'group', entityId: groupId,
      classId: Number(group.class_id), activityId: Number(group.activity_id),
      context: { topic: body.topic !== undefined ? cleanOrNull(body.topic, 200) : undefined, capacity: body.capacity !== undefined ? body.capacity : undefined },
    });
    return c.json({ success: true });
  });

  /** Notify every member of this group, right now. */
  app.post('/api/cgm/groups/:id/notify', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const groupId = Number(c.req.param('id'));
    const group = await groupCore(c.env.DB, groupId);
    if (!group) return bad(c, 'Group not found.', 404);
    const guard = await requireClassPermission(c, member, Number(group.class_id), 'manage_announcements');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const title = clean(body.title, 120) || 'A message from your organizer';
    const message = clean(body.message, 600);
    if (!message) return bad(c, 'Write the message to send.');
    const members = await asRows<{ student_id: number }>(c.env.DB.prepare(
      `SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
    ).bind(groupId));
    for (const row of members) {
      await notifyStudent(c.env.DB, Number(row.student_id), 'groups', title, message);
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.group.notified', entityType: 'group', entityId: groupId,
      classId: Number(group.class_id), activityId: Number(group.activity_id),
      context: { recipients: members.length, title },
    });
    return c.json({ success: true, data: { recipients: members.length } });
  });

  app.post('/api/cgm/groups/:id/leaders', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const groupId = Number(c.req.param('id'));
    const group = await groupCore(c.env.DB, groupId);
    if (!group) return bad(c, 'Group not found.', 404);
    const guard = await requireClassPermission(c, member, Number(group.class_id), 'appoint_leaders');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const studentId = Number(body.studentId);
    const role = String(body.role || 'leader');
    if (!['leader', 'assistant'].includes(role)) return bad(c, 'Choose leader or assistant.');
    const config = sanitizeActivityConfig(JSON.parse((await activityCore(c.env.DB, Number(group.activity_id)))?.config_json || '{}'));
    if (role === 'assistant') {
      if (!config.assistantsAllowed) return bad(c, 'Assistants are not allowed in this activity.', 409);
      const countRows = await asRows<{ c: number }>(c.env.DB.prepare(
        `SELECT COUNT(*) AS c FROM cgm_leadership_appointments WHERE group_id = ? AND role = 'assistant' AND status = 'active'`
      ).bind(groupId));
      const count = Number(countRows[0]?.c || 0);
      if (count >= config.maxAssistants) return bad(c, `This activity allows at most ${config.maxAssistants} assistant(s) per group.`, 409);
    } else {
      const existing = await asRows<{ id: number }>(c.env.DB.prepare(
        `SELECT id FROM cgm_leadership_appointments WHERE group_id = ? AND role = 'leader' AND status = 'active'`
      ).bind(groupId));
      if (existing[0]) {
        await c.env.DB.prepare(
          `UPDATE cgm_leadership_appointments SET status = 'ended', ended_at = CURRENT_TIMESTAMP, end_reason = 'replaced by organizer' WHERE id = ?`
        ).bind(Number(existing[0].id)).run();
      }
    }
    // The appointee must be an active member of this very group.
    const inGroup = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_group_assignments WHERE group_id = ? AND student_id = ? AND status = 'active'`
    ).bind(groupId, studentId));
    if (!inGroup[0]) return bad(c, 'Leaders must be active members of their group.', 400);

    const requested = Array.isArray(body.permissions) ? body.permissions : null;
    const permissions = sanitizeLeaderPermissions(requested?.length
      ? requested
      : role === 'assistant' ? config.assistantPermissions : config.leaderPermissions);

    await c.env.DB.prepare(
      `INSERT INTO cgm_leadership_appointments (activity_id, group_id, student_id, role, method, permissions_json, appointed_by_label)
       VALUES (?, ?, ?, ?, 'appointment', ?, ?)`
    ).bind(Number(group.activity_id), groupId, studentId, role, JSON.stringify(permissions), member.name).run();
    await notifyStudent(c.env.DB, studentId, 'leadership', role === 'leader' ? 'You are now the group leader' : 'You are now an assistant leader',
      `Your organizer appointed you as ${role === 'leader' ? 'the leader' : 'an assistant leader'} of your group in ${group.activity_name}.`);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.leadership.appointed', entityType: 'group', entityId: groupId,
      classId: Number(group.class_id), activityId: Number(group.activity_id),
      context: { studentId, role, permissions },
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/leadership/:id/end', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const appointmentId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT l.*, a.class_id FROM cgm_leadership_appointments l JOIN cgm_activities a ON a.id = l.activity_id WHERE l.id = ?`
    ).bind(appointmentId));
    const appointment = rows[0];
    if (!appointment) return bad(c, 'Appointment not found.', 404);
    const guard = await requireClassPermission(c, member, Number(appointment.class_id), 'appoint_leaders');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    await c.env.DB.prepare(
      `UPDATE cgm_leadership_appointments SET status = 'ended', ended_at = CURRENT_TIMESTAMP, end_reason = ? WHERE id = ?`
    ).bind(cleanOrNull(body.reason, 300) || 'ended by organizer', appointmentId).run();
    await notifyStudent(c.env.DB, Number(appointment.student_id), 'leadership', 'Leadership role ended',
      `Your ${appointment.role === 'leader' ? 'leader' : 'assistant'} role ended. ${cleanOrNull(body.reason, 300) || ''}`);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.leadership.ended', entityType: 'leadership', entityId: appointmentId,
      classId: Number(appointment.class_id), activityId: Number(appointment.activity_id),
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/leadership/:id/permissions', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const appointmentId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT l.*, a.class_id FROM cgm_leadership_appointments l JOIN cgm_activities a ON a.id = l.activity_id WHERE l.id = ?`
    ).bind(appointmentId));
    const appointment = rows[0];
    if (!appointment) return bad(c, 'Appointment not found.', 404);
    const guard = await requireClassPermission(c, member, Number(appointment.class_id), 'appoint_leaders');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const permissions = sanitizeLeaderPermissions(body.permissions);
    await c.env.DB.prepare(
      'UPDATE cgm_leadership_appointments SET permissions_json = ? WHERE id = ?'
    ).bind(JSON.stringify(permissions), appointmentId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.leadership.permissions_changed', entityType: 'leadership', entityId: appointmentId,
      classId: Number(appointment.class_id), activityId: Number(appointment.activity_id),
      context: { permissions },
    });
    return c.json({ success: true });
  });

  app.get('/api/cgm/activities/:id/leadership', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'view_roster');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT l.*, s.full_name, g.name AS group_name, g.position AS group_position FROM cgm_leadership_appointments l
       JOIN cgm_students s ON s.id = l.student_id JOIN cgm_groups g ON g.id = l.group_id
       WHERE l.activity_id = ? ORDER BY l.status, g.position, l.role`
    ).bind(activityId));
    const groupsWithoutLeaders = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.name, g.position FROM cgm_groups g
       WHERE g.activity_id = ? AND g.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM cgm_leadership_appointments l WHERE l.group_id = g.id AND l.role = 'leader' AND l.status = 'active')
       ORDER BY g.position`
    ).bind(activityId));
    return c.json({
      success: true,
      data: {
        appointments: rows.map((row) => ({
          id: Number(row.id), groupId: Number(row.group_id), groupName: row.group_name || `Group ${row.group_position}`,
          studentId: Number(row.student_id), fullName: row.full_name, role: row.role, status: row.status,
          method: row.method, permissions: sanitizeLeaderPermissions(JSON.parse(row.permissions_json || '[]')),
          startedAt: row.started_at, endedAt: row.ended_at, endReason: row.end_reason,
        })),
        groupsWithoutLeaders: groupsWithoutLeaders.map((row) => ({
          id: Number(row.id), name: row.name || `Group ${row.position}`,
        })),
      },
    });
  });

  app.post('/api/cgm/groups/:id/succession', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const groupId = Number(c.req.param('id'));
    const group = await groupCore(c.env.DB, groupId);
    if (!group) return bad(c, 'Group not found.', 404);
    const guard = await requireClassPermission(c, member, Number(group.class_id), 'appoint_leaders');
    if (!guard.ok) return guard.response;
    const activityId = Number(group.activity_id);
    const config = sanitizeActivityConfig(JSON.parse((await activityCore(c.env.DB, activityId))?.config_json || '{}'));

    const vacancy = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_leadership_appointments WHERE group_id = ? AND role = 'leader' AND status = 'active'`
    ).bind(groupId));
    if (vacancy[0]) return bad(c, 'This group already has an active leader.', 409);

    const body = await readBody(c);
    const method = String(body.method || 'automatic');
    if (!['automatic', 'appointment', 'election'].includes(method)) return bad(c, 'Choose automatic succession, an appointment, or a fresh election.');

    // Fresh election: create a nominating leader election for this group and
    // let the members decide; the organizer only triggers it.
    if (method === 'election') {
      const activeElection = await asRows<{ id: number }>(c.env.DB.prepare(
        `SELECT id FROM cgm_elections WHERE group_id = ? AND status IN ('nominating','voting')`
      ).bind(groupId));
      if (activeElection[0]) return bad(c, 'This group already has an active election.', 409);
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const salt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      // Try new schema with eligible fields; fall back for older DBs
      let election: any;
      try {
        election = await c.env.DB.prepare(
          `INSERT INTO cgm_elections
           (activity_id, group_id, title, role, anonymity, visibility, allow_vote_change, tie_break_method, salt, eligible_mode, eligible_student_ids, created_by_profile_id)
           VALUES (?, ?, ?, 'leader', 'anonymous', 'group', 0, ?, ?, 'all', NULL, ?)`
        ).bind(activityId, groupId, 'Group leadership election', ['runoff', 'appointment', 'random', 'manual'].includes(String(body.tieBreak)) ? String(body.tieBreak) : 'random',
          salt, member.profileId).run();
      } catch (e: any) {
        if (String(e?.message || '').toLowerCase().includes('eligible')) throw e;
        election = await c.env.DB.prepare(
          `INSERT INTO cgm_elections
           (activity_id, group_id, title, role, anonymity, visibility, allow_vote_change, tie_break_method, salt, created_by_profile_id)
           VALUES (?, ?, ?, 'leader', 'anonymous', 'group', 0, ?, ?, ?)`
        ).bind(activityId, groupId, 'Group leadership election', ['runoff', 'appointment', 'random', 'manual'].includes(String(body.tieBreak)) ? String(body.tieBreak) : 'random',
          salt, member.profileId).run();
      }
      const members = await asRows<{ student_id: number }>(c.env.DB.prepare(
        `SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
      ).bind(groupId));
      for (const row of members) {
        await notifyStudent(c.env.DB, Number(row.student_id), 'election', 'Nominate your group leader',
          `A leadership election was opened for your group in ${group.activity_name}. Contest or get ready to vote.`);
      }
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.leadership.succession_election', entityType: 'group', entityId: groupId,
        classId: Number(group.class_id), activityId,
        context: { electionId: Number(election.meta.last_row_id) },
      });
      return c.json({ success: true, data: { electionId: Number(election.meta.last_row_id) } });
    }

    let successorId: number | null = null;
    let successionMethod = 'automatic';
    if (method === 'appointment') {
      successorId = Number(body.studentId) || null;
      if (!successorId) return bad(c, 'Choose the member to appoint as leader.', 400);
      const membership = await asRows<{ id: number }>(c.env.DB.prepare(
        `SELECT id FROM cgm_group_assignments WHERE group_id = ? AND student_id = ? AND status = 'active'`
      ).bind(groupId, successorId));
      if (!membership[0]) return bad(c, 'That student is not in this group.', 400);
      successionMethod = 'appointment';
    } else {
      // Automatic succession: the most senior active assistant takes over.
      const assistants = await asRows<any>(c.env.DB.prepare(
        `SELECT * FROM cgm_leadership_appointments WHERE group_id = ? AND role = 'assistant' AND status = 'active' ORDER BY started_at LIMIT 1`
      ).bind(groupId));
      if (!assistants[0]) return bad(c, 'No assistant is available for automatic succession — appoint someone or run an election.', 409);
      successorId = Number(assistants[0].student_id);
      if (assistants[0].role === 'assistant') {
        await c.env.DB.prepare(
          `UPDATE cgm_leadership_appointments SET status = 'ended', ended_at = CURRENT_TIMESTAMP, end_reason = 'promoted to leader' WHERE id = ?`
        ).bind(Number(assistants[0].id)).run();
      }
    }
    const successor = successorId;
    // The successor does NOT inherit the previous leader's permissions; they
    // start from the activity's configured leader set.
    await c.env.DB.prepare(
      `INSERT INTO cgm_leadership_appointments (activity_id, group_id, student_id, role, method, permissions_json, appointed_by_label)
       VALUES (?, ?, ?, 'leader', ?, ?, ?)`
    ).bind(activityId, groupId, successor, successionMethod, JSON.stringify(config.leaderPermissions), member.name).run();
    await notifyStudent(c.env.DB, successor, 'leadership', 'You are now the group leader',
      `You were made leader of your group in ${group.activity_name}.`);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.leadership.succession', entityType: 'group', entityId: groupId,
      classId: Number(group.class_id), activityId,
      context: { studentId: successor, method: successionMethod },
    });
    return c.json({ success: true, data: { studentId: successor, method: successionMethod } });
  });

  // -------------------------------------------------------------------------
  // FORCE GET — organizer proposes, PHANTOM approves, the student still samples
  // -------------------------------------------------------------------------

  /**
   * The full roster the Force Get workspace works on: EVERY class member, with
   * their live group, whether they have ever sampled, their latest individual
   * Re-choose state and any approved designation. Students outside the
   * activity's eligibility list are returned flagged `eligible: false` rather
   * than being silently dropped (or worse, silently treated as eligible).
   */
  const forceGetRoster = async (c: any, activityId: number, activity: any, config: any) => {
    await ensureForceGetSchema(c.env.DB);
    const eligibleRows = config.eligibility === 'selected'
      ? await asRows<{ student_id: number }>(c.env.DB.prepare(
        'SELECT student_id FROM cgm_activity_eligible WHERE activity_id = ?'
      ).bind(activityId))
      : null;
    const eligibleSet = eligibleRows ? new Set(eligibleRows.map((row) => Number(row.student_id))) : null;
    const groups = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.name, g.position, g.capacity,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active' ORDER BY g.position`
    ).bind(activityId));
    const reserved = await reservedSeatsFor(c.env.DB, activityId);
    const forced = await forcedMemberCounts(c.env.DB, activityId);
    // Live gender composition of each group (members + the seats already
    // promised to approved designations), read from the SAME evaluator that
    // blocks a submission and an approval — so the organizer's preview can never
    // disagree with what the server will refuse.
    const liveComposition = await forceGetComposition(c.env.DB, {
      activityId,
      genderRule: config.genderRule,
      proposal: [],
      groups: groups.map((row) => ({
        id: Number(row.id), name: row.name || `Group ${row.position}`, capacity: row.capacity,
      })),
    });
    const compositionByGroup = new Map(liveComposition.groups.map((entry) => [entry.groupId, entry]));
    const students = await asRows<any>(c.env.DB.prepare(
      `SELECT s.id, s.full_name, s.index_number, s.gender,
              ga.id AS assignment_id, ga.group_id, ga.assigned_via, ga.assigned_at,
              EXISTS(SELECT 1 FROM cgm_group_assignments x WHERE x.activity_id = ? AND x.student_id = s.id) AS ever_assigned,
              (SELECT rc.status FROM cgm_rechoose_requests rc WHERE rc.activity_id = ? AND rc.student_id = s.id
                ORDER BY rc.id DESC LIMIT 1) AS rechoose_status,
              (SELECT d.id FROM cgm_force_get_designations d WHERE d.activity_id = ? AND d.student_id = s.id
                AND d.status = 'active' LIMIT 1) AS designation_id,
              (SELECT d.designated_group_id FROM cgm_force_get_designations d WHERE d.activity_id = ? AND d.student_id = s.id
                AND d.status = 'active' LIMIT 1) AS designation_group_id,
              (SELECT d.approved_by_label FROM cgm_force_get_designations d WHERE d.activity_id = ? AND d.student_id = s.id
                AND d.status = 'active' LIMIT 1) AS designation_approved_by,
              (SELECT d.designated_at FROM cgm_force_get_designations d WHERE d.activity_id = ? AND d.student_id = s.id
                AND d.status = 'active' LIMIT 1) AS designation_at
       FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id
       LEFT JOIN cgm_group_assignments ga ON ga.activity_id = ? AND ga.student_id = s.id AND ga.status = 'active'
       WHERE cm.class_id = ? AND cm.status = 'active' ORDER BY s.full_name`
    ).bind(activityId, activityId, activityId, activityId, activityId, activityId, activityId, Number(activity.class_id)));
    const groupNames = new Map(groups.map((row) => [Number(row.id), row.name || `Group ${row.position}`]));
    // EVERYBODY ON THE CLASS ROSTER — including the people who have not
    // registered yet. They have no student identity, so the organizer forces
    // them by roster row; the seat is reserved and becomes their own the moment
    // they register.
    const reservations = await rosterReservationsFor(c.env.DB, activityId);
    const unregisteredRows = await asRows<any>(c.env.DB.prepare(
      `SELECT re.id, re.full_name, re.index_number,
              COALESCE(NULLIF(LOWER(TRIM(re.gender)), ''), 'unknown') AS gender
       FROM cgm_roster_entries re
       WHERE re.class_id = ? AND re.status = 'unregistered' AND re.student_id IS NULL
       ORDER BY re.full_name`
    ).bind(Number(activity.class_id)));
    const unregistered = unregisteredRows.map((row) => {
      const reservation = reservations.get(Number(row.id));
      return {
        id: Number(row.id), fullName: row.full_name, indexNumber: row.index_number,
        gender: row.gender || 'unknown',
        // A selected-only activity lists named students; somebody who has not
        // even registered was never selected, so forcing them would invent an
        // eligibility they do not have.
        eligible: config.eligibility !== 'selected',
        reason: config.eligibility === 'selected'
          ? 'This activity only includes selected students — an unregistered roster row was never selected.'
          : null,
        registered: false,
        reservation: reservation ? {
          id: reservation.id, groupId: reservation.groupId,
          groupName: reservation.groupName || groupNames.get(reservation.groupId) || null,
          approvedBy: reservation.approvedBy, approvedAt: reservation.approvedAt,
        } : null,
      };
    });
    const pending = await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_force_get_requests WHERE activity_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
    ).bind(activityId));
    return {
      groups: groups.map((row) => ({
        id: Number(row.id), name: row.name || `Group ${row.position}`, position: Number(row.position),
        capacity: row.capacity === null ? null : Number(row.capacity), size: Number(row.size),
        reserved: reserved.get(Number(row.id)) || 0,
        forced: forced.get(Number(row.id)) || 0,
        genderCounts: compositionByGroup.get(Number(row.id))?.genderCounts || { male: 0, female: 0, unknown: 0 },
        genderPools: compositionByGroup.get(Number(row.id))?.pools || [],
      })),
      unregistered,
      unregisteredCount: unregistered.length,
      canForceUnregistered: config.eligibility !== 'selected',
      students: students.map((row) => ({
        id: Number(row.id), fullName: row.full_name, indexNumber: row.index_number,
        gender: row.gender || 'unknown',
        eligible: eligibleSet ? eligibleSet.has(Number(row.id)) : true,
        groupId: row.group_id === null || row.group_id === undefined ? null : Number(row.group_id),
        groupName: row.group_id ? (groupNames.get(Number(row.group_id)) || null) : null,
        assignmentId: row.assignment_id === null ? null : Number(row.assignment_id),
        assignedVia: row.assigned_via || null,
        everAssigned: Number(row.ever_assigned || 0) === 1,
        rechooseStatus: row.rechoose_status || null,
        designation: row.designation_id
          ? {
            id: Number(row.designation_id),
            groupId: row.designation_group_id === null ? null : Number(row.designation_group_id),
            groupName: row.designation_group_id ? (groupNames.get(Number(row.designation_group_id)) || null) : null,
            approvedBy: row.designation_approved_by || null, approvedAt: row.designation_at || null,
          }
          : null,
      })),
      pendingRequest: pending[0] ? {
        id: Number(pending[0].id), version: Number(pending[0].version), status: pending[0].status,
        requesterLabel: pending[0].requester_label, submittedAt: pending[0].submitted_at,
        explanation: pending[0].explanation, studentCount: Number(pending[0].student_count || 0),
      } : null,
    };
  };

  /**
   * Validate a proposed batch. Returns normalized items plus the conflicts that
   * make it un-approvable. Capacity is projected from live occupancy, ignoring
   * the selected students' current seats and honouring other reserved seats.
   */
  const validateForceGetBatch = async (
    c: any, activityId: number, activity: any, config: any,
    rawItems: any[], rawEntries: any[] = [],
  ) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const entriesInput = Array.isArray(rawEntries) ? rawEntries : [];
    if ((!Array.isArray(rawItems) || !rawItems.length) && !entriesInput.length) {
      return { errors: ['Choose at least one student and a destination group.'], warnings, items: [] as any[], entries: [] as any[] };
    }
    if (rawItems.length + entriesInput.length > 400) {
      return { errors: ['A Force Get request can name at most 400 students.'], warnings, items: [] as any[], entries: [] as any[] };
    }
    const roster = await forceGetRoster(c, activityId, activity, config);
    const byStudent = new Map(roster.students.map((row) => [Number(row.id), row]));
    const byEntry = new Map<number, any>((roster as any).unregistered.map((row: any) => [Number(row.id), row]));
    const groupById = new Map(roster.groups.map((row) => [Number(row.id), row]));
    const items: Array<{ studentId: number; groupId: number; previousGroupId: number | null; sampled: boolean; rechoose: string | null }> = [];
    const entries: Array<{ rosterEntryId: number; groupId: number; fullName: string; indexNumber: string; gender: string }> = [];
    const seen = new Set<number>();
    const seenEntries = new Set<number>();
    for (const raw of rawItems || []) {
      const studentId = Number((raw as any)?.studentId);
      const groupId = Number((raw as any)?.groupId ?? (raw as any)?.destinationGroupId);
      if (!Number.isInteger(studentId) || studentId <= 0) { errors.push('Every row needs a student.'); continue; }
      if (seen.has(studentId)) { errors.push(`Student #${studentId} appears twice in the same request.`); continue; }
      seen.add(studentId);
      const student = byStudent.get(studentId);
      if (!student) { errors.push(`Student #${studentId} is not in this class.`); continue; }
      if (!student.eligible) { errors.push(`${student.fullName} is not eligible for this activity.`); continue; }
      if (!Number.isInteger(groupId) || groupId <= 0) { errors.push(`Choose a destination group for ${student.fullName}.`); continue; }
      const group = groupById.get(groupId);
      if (!group) { errors.push(`The destination group for ${student.fullName} is not part of this activity.`); continue; }
      items.push({
        studentId, groupId, previousGroupId: student.groupId,
        sampled: student.everAssigned, rechoose: student.rechooseStatus,
      });
    }
    // Roster rows that have not registered yet: forced by roster entry id, with
    // the same destination/capacity/gender rules. Their seat is reserved and
    // becomes a designation the moment they register.
    for (const raw of entriesInput) {
      const rosterEntryId = Number((raw as any)?.rosterEntryId ?? (raw as any)?.entryId);
      const groupId = Number((raw as any)?.groupId ?? (raw as any)?.destinationGroupId);
      if (!Number.isInteger(rosterEntryId) || rosterEntryId <= 0) { errors.push('Every unregistered row needs a roster entry.'); continue; }
      if (seenEntries.has(rosterEntryId)) { errors.push(`Roster row #${rosterEntryId} appears twice in the same request.`); continue; }
      seenEntries.add(rosterEntryId);
      const entry = byEntry.get(rosterEntryId);
      if (!entry) {
        errors.push(`Roster row #${rosterEntryId} is not an unregistered row of this class — it may already be registered; choose that student from Members instead.`);
        continue;
      }
      if (!entry.eligible) { errors.push(`${entry.fullName}: ${entry.reason || 'this student is not eligible for this activity.'}`); continue; }
      if (!Number.isInteger(groupId) || groupId <= 0) { errors.push(`Choose a destination group for ${entry.fullName}.`); continue; }
      if (!groupById.has(groupId)) { errors.push(`The destination group for ${entry.fullName} is not part of this activity.`); continue; }
      entries.push({ rosterEntryId, groupId, fullName: entry.fullName, indexNumber: entry.indexNumber, gender: entry.gender });
    }
    // Capacity: projected occupancy = live members staying + incoming.
    const leaving = new Map<number, number>();
    for (const item of items) {
      if (item.previousGroupId && item.previousGroupId !== item.groupId) {
        leaving.set(item.previousGroupId, (leaving.get(item.previousGroupId) || 0) + 1);
      }
    }
    const incoming = new Map<number, number>();
    for (const item of items) {
      if (item.previousGroupId !== item.groupId) incoming.set(item.groupId, (incoming.get(item.groupId) || 0) + 1);
    }
    // An unregistered row has no seat to give up: every one it names is a new
    // arrival that must fit inside the group's capacity.
    for (const entry of entries) incoming.set(entry.groupId, (incoming.get(entry.groupId) || 0) + 1);
    const committed = new Map<number, number>();
    for (const [groupId, count] of incoming) {
      const group = groupById.get(groupId)!;
      if (group.capacity === null) continue;
      const projected = group.size - (leaving.get(groupId) || 0) + count;
      if (projected > group.capacity) {
        const othersReserved = Math.max(0, Number(group.reserved || 0));
        committed.set(groupId, projected - group.capacity);
        errors.push(
          `${group.name} would hold ${projected} students but its capacity is ${group.capacity}` +
          `${othersReserved ? ` (${othersReserved} seat(s) already reserved for other approved designations)` : ''}. ` +
          `Reduce this group's incoming students or raise its capacity.`,
        );
      }
      if (projected === group.capacity) warnings.push(`${group.name} would be exactly full (${projected}/${group.capacity}).`);
    }
    for (const item of items) {
      if (item.rechoose) {
        warnings.push(`A Re-choose request already exists for one student — the designation waits for their own resampling.`);
        break;
      }
    }
    // GENDER — judged on the COMPLETE proposed composition of every destination
    // group (existing members + reserved seats + every student named in this
    // proposal at once), never one student at a time. Under `separate` a clash
    // is a hard error: the request cannot even be filed while it would mix
    // gender pools. 'unknown' is its own pool and is never guessed at.
    const composition = await forceGetComposition(c.env.DB, {
      activityId,
      genderRule: config.genderRule,
      proposal: items.map((item) => ({ studentId: item.studentId, groupId: item.groupId })),
      proposalEntries: entries.map((entry) => ({
        rosterEntryId: entry.rosterEntryId, groupId: entry.groupId,
        fullName: entry.fullName, gender: entry.gender,
      })),
      groups: roster.groups.map((group) => ({ id: group.id, name: group.name, capacity: group.capacity })),
    });
    // Only the groups this proposal actually sends students to can block it: a
    // legacy mixed group somewhere else in the activity is reported, but it is
    // not this organizer's proposal that would create it.
    const targetedGroups = new Set([
      ...items.map((item) => item.groupId),
      ...entries.map((entry) => entry.groupId),
    ]);
    for (const conflict of composition.conflicts) {
      if (!targetedGroups.has(conflict.groupId)) continue;
      if (conflict.kind === 'gender') errors.push(conflict.message);
      else if (conflict.kind === 'capacity' && conflict.blocking && !committed.has(conflict.groupId)) {
        errors.push(conflict.detail.reserved.length
          ? `${conflict.groupName} would hold ${conflict.detail.projected} students including ${conflict.detail.reserved.length} seat(s) already reserved for other approved designations, but its capacity is ${conflict.detail.capacity}.`
          : conflict.message);
      }
    }
    for (const conflict of composition.conflicts) {
      if (targetedGroups.has(conflict.groupId)) continue;
      warnings.push(`${conflict.groupName} already mixes gender pools outside this proposal — fix it before those students are re-placed.`);
    }
    for (const warning of composition.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }

    return { errors, warnings, items, entries };
  };

  app.get('/api/cgm/activities/:id/force-get', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'generate_groups');
    if (!guard.ok) return guard.response;
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    const roster = await forceGetRoster(c, activityId, activity, config);
    const history = await asRows<any>(c.env.DB.prepare(
      `SELECT id, version, status, explanation, student_count, requester_label, submitted_at,
              reviewed_at, reviewer_label, review_reason
       FROM cgm_force_get_requests WHERE activity_id = ? ORDER BY id DESC LIMIT 20`
    ).bind(activityId));
    return c.json({
      success: true,
      data: {
        activity: {
          id: activityId, name: activity.name, status: activity.status,
          className: activity.class_name, classCode: activity.class_code,
          method: config.method, eligibility: config.eligibility, genderRule: config.genderRule,
        },
        canSubmit: true,
        ...roster,
        history: history.map((row) => ({
          id: Number(row.id), version: Number(row.version), status: row.status,
          explanation: row.explanation, studentCount: Number(row.student_count || 0),
          requesterLabel: row.requester_label, submittedAt: row.submitted_at,
          reviewedAt: row.reviewed_at, reviewerLabel: row.reviewer_label, reviewReason: row.review_reason,
        })),
      },
    });
  });

  /** Submit (or revise) a Force Get request. Assignments are NOT touched. */
  const submitForceGet = async (c: any, reviseId: number | null, activityIdOverride?: number) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = activityIdOverride ?? Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'generate_groups');
    if (!guard.ok) return guard.response;
    await ensureForceGetSchema(c.env.DB);
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    const body = await readBody<{ items?: unknown[]; entries?: unknown[]; explanation?: string }>(c);
    const rawItems: any[] = Array.isArray(body.items) ? body.items : [];
    // Unregistered roster rows travel separately: they have no student id.
    const rawEntries: any[] = Array.isArray(body.entries) ? body.entries : [];
    const validation = await validateForceGetBatch(c, activityId, activity, config, rawItems, rawEntries);
    if (validation.errors.length) {
      return c.json({ success: false, error: validation.errors[0], data: { errors: validation.errors, warnings: validation.warnings } }, 400);
    }
    const explanation = cleanOrNull(body.explanation, 1000);

    // A revision (or any new submission) supersedes the pending version — an
    // approval can never be inherited by changed content.
    const pendings = await asRows<any>(c.env.DB.prepare(
      `SELECT id FROM cgm_force_get_requests WHERE activity_id = ? AND status = 'pending'`
    ).bind(activityId));
    if (reviseId && !pendings.some((row) => Number(row.id) === reviseId)) {
      return bad(c, 'Only a pending request can be revised.', 409);
    }
    const versionRows = await asRows<{ v: number }>(c.env.DB.prepare(
      'SELECT COALESCE(MAX(version), 0) AS v FROM cgm_force_get_requests WHERE activity_id = ?'
    ).bind(activityId));
    const version = Number(versionRows[0]?.v || 0) + 1;

    const inserted = await c.env.DB.prepare(
      `INSERT INTO cgm_force_get_requests
         (activity_id, class_id, version, status, explanation, student_count, requested_by_profile_id, requester_label)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`
    ).bind(activityId, Number(activity.class_id), version, explanation,
      validation.items.length + validation.entries.length,
      member.profileId, member.name).run();
    const requestId = Number(inserted.meta.last_row_id);
    for (const item of validation.items) {
      await c.env.DB.prepare(
        `INSERT INTO cgm_force_get_request_items
           (request_id, version, student_id, destination_group_id, previous_group_id, sampled_at_submission, rechoose_state)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(requestId, version, item.studentId, item.groupId, item.previousGroupId,
        item.sampled ? 1 : 0, item.rechoose).run();
    }
    for (const entry of validation.entries) {
      await c.env.DB.prepare(
        `INSERT INTO cgm_force_get_request_entries
           (request_id, version, roster_entry_id, destination_group_id, previous_group_id,
            full_name, index_number, gender_at_submission)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
      ).bind(requestId, version, entry.rosterEntryId, entry.groupId,
        entry.fullName, entry.indexNumber || '', entry.gender).run();
    }
    for (const stale of pendings) {
      await c.env.DB.prepare(
        `UPDATE cgm_force_get_requests SET status = 'superseded', superseded_by_request_id = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(requestId, Number(stale.id)).run();
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.force_get.superseded', entityType: 'force_get_request', entityId: Number(stale.id),
        classId: Number(activity.class_id), activityId, context: { supersededBy: requestId, version },
      });
    }
    await recordPhantomInboxItem(c.env.DB, {
      channel: 'class_groups',
      title: 'Force Get request awaiting approval',
      summary: `${member.name} proposed destinations for ${validation.items.length + validation.entries.length} student(s) in ${activity.name} (${activity.class_name}).`,
      source: 'cgm_force_get', sourceId: String(requestId), actorProfileId: member.profileId,
      actorLabel: member.name, link: '#class-groups/phantom',
      body: explanation || '',
    });
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.force_get.requested', entityType: 'force_get_request', entityId: requestId,
      classId: Number(activity.class_id), activityId,
      context: {
        version, students: validation.items.length + validation.entries.length,
        items: validation.items.map((i) => ({ studentId: i.studentId, groupId: i.groupId })),
        unregisteredEntries: validation.entries.map((e) => ({ rosterEntryId: e.rosterEntryId, groupId: e.groupId })),
      },
    });
    if (reviseId) {
      // A revision is its own audited event: the old version, the new version
      // and every student whose destination changed.
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.force_get.updated', entityType: 'force_get_request', entityId: requestId,
        classId: Number(activity.class_id), activityId,
        context: { revisedRequestId: reviseId, version, students: validation.items.length + validation.entries.length, explanation },
      });
    }
    return c.json({
      success: true,
      data: {
        requestId, version, status: 'pending', warnings: validation.warnings,
        message: `Sent to PHANTOM for approval (version ${version}). Nothing moves until PHANTOM approves.`,
      },
    });
  };

  app.post('/api/cgm/activities/:id/force-get/requests', (c: any) => submitForceGet(c, null));
  app.post('/api/cgm/force-get/requests/:id/revise', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const requestId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM cgm_force_get_requests WHERE id = ?'
    ).bind(requestId));
    const request = rows[0];
    if (!request) return bad(c, 'Force Get request not found.', 404);
    // Route the revision through the activity-scoped submitter so all the
    // permission and validation rules are identical.
    return submitForceGet(c, requestId, Number(request.activity_id));
  });

  app.post('/api/cgm/force-get/requests/:id/cancel', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const requestId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, a.class_id, a.name AS activity_name FROM cgm_force_get_requests r
       JOIN cgm_activities a ON a.id = r.activity_id WHERE r.id = ?`
    ).bind(requestId));
    const request = rows[0];
    if (!request) return bad(c, 'Force Get request not found.', 404);
    const guard = await requireClassPermission(c, member, Number(request.class_id), 'generate_groups');
    if (!guard.ok) return guard.response;
    if (request.status !== 'pending') return bad(c, 'Only a pending Force Get request can be cancelled.', 409);
    await c.env.DB.prepare(
      `UPDATE cgm_force_get_requests SET status = 'cancelled', review_reason = ?, reviewed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind('cancelled by the organizer', requestId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.force_get.cleared', entityType: 'force_get_request', entityId: requestId,
      classId: Number(request.class_id), activityId: Number(request.activity_id), context: { version: Number(request.version) },
    });
    return c.json({ success: true, data: { status: 'cancelled' } });
  });

  const forceGetRequestDetail = async (c: any, requestId: number) => {
    await ensureForceGetSchema(c.env.DB);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, a.name AS activity_name, a.config_json, cl.name AS class_name, cl.code AS class_code
       FROM cgm_force_get_requests r
       JOIN cgm_activities a ON a.id = r.activity_id
       JOIN cgm_classes cl ON cl.id = r.class_id
       WHERE r.id = ?`
    ).bind(requestId));
    const request = rows[0];
    if (!request) return null;
    const items = await asRows<any>(c.env.DB.prepare(
      `SELECT i.*, s.full_name, s.index_number,
              COALESCE(NULLIF(LOWER(TRIM(s.gender)), ''), 'unknown') AS gender,
              dg.name AS destination_name, dg.position AS destination_position,
              pg.name AS previous_name, pg.position AS previous_position,
              ga.group_id AS current_group_id, cg.name AS current_group_name,
              (SELECT rc.status FROM cgm_rechoose_requests rc
                WHERE rc.activity_id = ? AND rc.student_id = i.student_id
                ORDER BY rc.id DESC LIMIT 1) AS rechoose_now
       FROM cgm_force_get_request_items i
       JOIN cgm_students s ON s.id = i.student_id
       JOIN cgm_groups dg ON dg.id = i.destination_group_id
       LEFT JOIN cgm_groups pg ON pg.id = i.previous_group_id
       LEFT JOIN cgm_group_assignments ga ON ga.activity_id = ? AND ga.student_id = i.student_id AND ga.status = 'active'
       LEFT JOIN cgm_groups cg ON cg.id = ga.group_id
       WHERE i.request_id = ? AND i.version = ?
       ORDER BY dg.position, s.full_name`
    ).bind(Number(request.activity_id), Number(request.activity_id), requestId, Number(request.version)));
    // Roster rows that have not registered yet are part of the same review: they
    // hold a seat but no student identity.
    const entries = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, COALESCE(NULLIF(re.full_name, ''), e.full_name) AS full_name,
              COALESCE(NULLIF(re.index_number, ''), e.index_number) AS index_number,
              COALESCE(NULLIF(LOWER(TRIM(re.gender)), ''), e.gender_at_submission, 'unknown') AS gender,
              dg.name AS destination_name, dg.position AS destination_position,
              re.student_id AS registered_student_id
       FROM cgm_force_get_request_entries e
       LEFT JOIN cgm_roster_entries re ON re.id = e.roster_entry_id
       JOIN cgm_groups dg ON dg.id = e.destination_group_id
       WHERE e.request_id = ? AND e.version = ?
       ORDER BY dg.position, full_name`
    ).bind(requestId, Number(request.version)));
    const groups = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.name, g.position, g.capacity,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active' ORDER BY g.position`
    ).bind(Number(request.activity_id)));
    const reserved = await reservedSeatsFor(c.env.DB, Number(request.activity_id));
    const config = sanitizeActivityConfig(JSON.parse(request.config_json || '{}'));
    const eligibleRows = config.eligibility === 'selected'
      ? await asRows<{ student_id: number }>(c.env.DB.prepare(
        'SELECT student_id FROM cgm_activity_eligible WHERE activity_id = ?'
      ).bind(Number(request.activity_id)))
      : null;
    const eligibleSet = eligibleRows ? new Set(eligibleRows.map((row) => Number(row.student_id))) : null;
    const groupById = new Map(groups.map((row) => [Number(row.id), row]));
    const distribution = new Map<number, { groupId: number; groupName: string; capacity: number | null; size: number; reserved: number; projected: number; students: any[] }>();
    let invalid = 0;
    for (const item of items) {
      const destination = groupById.get(Number(item.destination_group_id));
      if (!destination) invalid += 1;
      if (!eligibleSet || eligibleSet.has(Number(item.student_id))) { /* eligible */ } else invalid += 1;
    }
    for (const entry of entries) {
      if (!groupById.has(Number(entry.destination_group_id))) invalid += 1;
      // A row that registered since submission must be reviewed as a student,
      // and a selected-only activity never covers an unregistered row.
      else if (entry.registered_student_id || eligibleSet) invalid += 1;
    }
    for (const item of items) {
      const destination = groupById.get(Number(item.destination_group_id));
      if (!destination) continue;
      const key = Number(destination.id);
      if (!distribution.has(key)) {
        distribution.set(key, {
          groupId: key, groupName: destination.name || `Group ${destination.position}`,
          capacity: destination.capacity === null ? null : Number(destination.capacity),
          size: Number(destination.size), reserved: reserved.get(key) || 0, projected: 0, students: [],
        });
      }
      const bucket = distribution.get(key)!;
      bucket.projected += 1;
      bucket.students.push({
        studentId: Number(item.student_id), fullName: item.full_name, indexNumber: item.index_number,
        currentGroupId: item.current_group_id === null ? null : Number(item.current_group_id),
        currentGroupName: item.current_group_name || null,
        sampled: Number(item.sampled_at_submission || 0) === 1,
        rechooseState: item.rechoose_now || item.rechoose_state || null,
        destinationGroupId: key,
        gender: String(item.gender || 'unknown').toLowerCase(),
      });
    }
    for (const entry of entries) {
      const destination = groupById.get(Number(entry.destination_group_id));
      if (!destination) continue;
      const key = Number(destination.id);
      if (!distribution.has(key)) {
        distribution.set(key, {
          groupId: key, groupName: destination.name || `Group ${destination.position}`,
          capacity: destination.capacity === null ? null : Number(destination.capacity),
          size: Number(destination.size), reserved: reserved.get(key) || 0, projected: 0, students: [],
        });
      }
      const bucket = distribution.get(key)!;
      bucket.projected += 1;
      bucket.students.push({
        studentId: 0, rosterEntryId: Number(entry.roster_entry_id),
        fullName: entry.full_name, indexNumber: entry.index_number,
        currentGroupId: null, currentGroupName: null, sampled: false, rechooseState: null,
        destinationGroupId: key, gender: String(entry.gender || 'unknown').toLowerCase(),
        unregistered: true,
        registeredSinceSubmission: Boolean(entry.registered_student_id),
      });
    }
    // The same evaluator the approval uses, so PHANTOM sees exactly what the
    // approval will refuse: capacity AND the gender-separated composition,
    // naming the group, the students and where the clash comes from.
    const composition = await forceGetComposition(c.env.DB, {
      activityId: Number(request.activity_id),
      genderRule: config.genderRule,
      proposal: items.map((item) => ({ studentId: Number(item.student_id), groupId: Number(item.destination_group_id) })),
      proposalEntries: entries
        .filter((entry) => !entry.registered_student_id)
        .map((entry) => ({
          rosterEntryId: Number(entry.roster_entry_id), groupId: Number(entry.destination_group_id),
          fullName: entry.full_name, gender: entry.gender,
        })),
      groups: groups.map((group) => ({
        id: Number(group.id), name: group.name || `Group ${group.position}`,
        capacity: group.capacity === null || group.capacity === undefined ? null : Number(group.capacity),
      })),
    });
    const compositionByGroup = new Map(composition.groups.map((entry) => [entry.groupId, entry]));
    const buckets = [...distribution.values()].map((bucket) => {
      const evaluated = compositionByGroup.get(bucket.groupId);
      return {
        ...bucket,
        projectedTotal: evaluated ? evaluated.projected : bucket.size + bucket.projected,
        genderPools: evaluated ? evaluated.pools : [],
        genderCounts: evaluated ? evaluated.genderCounts : { male: 0, female: 0, unknown: 0 },
        conflict: bucket.capacity !== null ? bucket.size + bucket.projected > bucket.capacity : false,
        genderConflict: Boolean(evaluated?.mixed),
      };
    });
    return {
      request: {
        id: Number(request.id), version: Number(request.version), status: request.status,
        activityId: Number(request.activity_id), activityName: request.activity_name,
        classId: Number(request.class_id), className: request.class_name, classCode: request.class_code,
        explanation: request.explanation, studentCount: Number(request.student_count || 0),
        unregisteredCount: entries.length,
        requesterLabel: request.requester_label, requestedByProfileId: request.requested_by_profile_id,
        submittedAt: request.submitted_at, reviewerLabel: request.reviewer_label,
        reviewedAt: request.reviewed_at, reviewReason: request.review_reason,
      },
      groups: buckets,
      // Every blocking conflict the approval would raise, with its detail.
      conflicts: composition.conflicts
        .filter((conflict) => conflict.kind === 'gender' || distribution.has(conflict.groupId))
        .map((conflict) => ({
          kind: conflict.kind,
          groupId: conflict.groupId,
          groupName: conflict.groupName,
          message: conflict.message,
          blocking: conflict.blocking,
          pools: conflict.detail.pools,
          students: [
            ...conflict.detail.proposed.map((member) => ({ ...member, role: 'proposed' as string })),
            ...conflict.detail.existing.map((member) => ({ ...member, role: member.source as string })),
          ],
          capacity: conflict.detail.capacity,
          projected: conflict.detail.projected,
          overflow: conflict.detail.overflow,
        })),
      capacityConflicts: buckets.filter((bucket) => bucket.conflict).map((bucket) => ({
        groupId: bucket.groupId, groupName: bucket.groupName,
        message: `${bucket.groupName}: ${bucket.size} member(s) now + ${bucket.projected} proposed = ${bucket.projectedTotal}, capacity ${bucket.capacity}.`,
      })),
      genderRule: config.genderRule,
      canApprove: composition.errors.length === 0 && invalid === 0,
      invalidItems: invalid,
    };
  };

  app.get('/api/cgm/force-get/requests/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const detail = await forceGetRequestDetail(c, Number(c.req.param('id')));
    if (!detail) return bad(c, 'Force Get request not found.', 404);
    const guard = await requireClassPermission(c, member, detail.request.classId, 'generate_groups');
    if (!guard.ok) return guard.response;
    return c.json({ success: true, data: detail });
  });

  // ------------------------------- PHANTOM ---------------------------------

  app.get('/api/cgm/phantom/force-get/requests', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    await ensureForceGetSchema(c.env.DB);
    const status = clean(c.req.query('status') || 'pending', 20);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, a.name AS activity_name, cl.name AS class_name, cl.code AS class_code
       FROM cgm_force_get_requests r
       JOIN cgm_activities a ON a.id = r.activity_id
       JOIN cgm_classes cl ON cl.id = r.class_id
       WHERE r.status = ? ORDER BY r.submitted_at DESC, r.id DESC LIMIT 200`
    ).bind(status));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), version: Number(row.version), status: row.status,
        activityId: Number(row.activity_id), activityName: row.activity_name,
        className: row.class_name, classCode: row.class_code,
        requesterLabel: row.requester_label, submittedAt: row.submitted_at,
        studentCount: Number(row.student_count || 0), explanation: row.explanation,
        reviewerLabel: row.reviewer_label, reviewedAt: row.reviewed_at, reviewReason: row.review_reason,
      })),
    });
  });

  app.get('/api/cgm/phantom/force-get/requests/:id', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const detail = await forceGetRequestDetail(c, Number(c.req.param('id')));
    if (!detail) return bad(c, 'Force Get request not found.', 404);
    return c.json({ success: true, data: detail });
  });

  const decideForceGet = async (c: any, approve: boolean): Promise<Response> => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const member = check.member;
    await ensureForceGetSchema(c.env.DB);
    const requestId = Number(c.req.param('id'));
    const body = await readBody(c);
    const reason = cleanOrNull(body.reason, 600);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, a.name AS activity_name, a.config_json FROM cgm_force_get_requests r
       JOIN cgm_activities a ON a.id = r.activity_id WHERE r.id = ?`
    ).bind(requestId));
    const request = rows[0];
    if (!request) return bad(c, 'Force Get request not found.', 404);
    if (request.status !== 'pending') {
      return bad(c, `This request is ${String(request.status)} — only a pending request can be decided.`, 409);
    }
    // Immutable approval: PHANTOM decides a SPECIFIC version. A stale client
    // (or a request revised after it was opened) can never be approved.
    if (body.version !== undefined && body.version !== null && Number(body.version) !== Number(request.version)) {
      return bad(c, `This request is version ${Number(request.version)}; you reviewed version ${Number(body.version)}. Reload and review it again.`, 409);
    }
    if (!approve) {
      if (!reason) return bad(c, 'Give a reason when rejecting a Force Get request.');
      await c.env.DB.prepare(
        `UPDATE cgm_force_get_requests SET status = 'rejected', reviewed_by_profile_id = ?, reviewer_label = ?,
         review_reason = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(member.profileId, `PHANTOM · ${member.name}`, reason, requestId).run();
      if (request.requested_by_profile_id) {
        await createNotification(c.env.DB, {
          title: 'Force Get rejected',
          message: `PHANTOM rejected your Force Get request for ${request.activity_name}: ${reason}`,
          audience: 'system', audienceLabel: 'Class & Groups',
          recipientProfileIds: [Number(request.requested_by_profile_id)],
        });
      }
      await auditCgm(c.env.DB, {
        actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.force_get.rejected', entityType: 'force_get_request', entityId: requestId,
        classId: Number(request.class_id), activityId: Number(request.activity_id),
        context: { version: Number(request.version), reason },
      });
      return c.json({ success: true, data: { status: 'rejected' } });
    }

    // ---- approval: revalidate everything against LIVE data -----------------
    const items = await asRows<any>(c.env.DB.prepare(
      `SELECT i.*, s.full_name FROM cgm_force_get_request_items i JOIN cgm_students s ON s.id = i.student_id
       WHERE i.request_id = ? AND i.version = ?`
    ).bind(requestId, Number(request.version)));
    // Roster rows that had not registered when the request was filed.
    const entries = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, COALESCE(NULLIF(re.full_name, ''), e.full_name) AS full_name,
              COALESCE(NULLIF(re.index_number, ''), e.index_number) AS index_number,
              re.student_id AS registered_student_id,
              COALESCE(NULLIF(LOWER(TRIM(re.gender)), ''), e.gender_at_submission, 'unknown') AS gender
       FROM cgm_force_get_request_entries e
       LEFT JOIN cgm_roster_entries re ON re.id = e.roster_entry_id
       WHERE e.request_id = ? AND e.version = ?`
    ).bind(requestId, Number(request.version)));
    if (!items.length && !entries.length) return bad(c, 'This request has no students to approve.', 409);
    const config = sanitizeActivityConfig(JSON.parse(request.config_json || '{}'));
    if (config.eligibility === 'selected' && entries.length) {
      return bad(c, 'This request names unregistered roster rows, and this activity only includes selected students. Reject it and ask the organizer to revise.', 409);
    }
    const activity = await activityCore(c.env.DB, Number(request.activity_id));
    if (!activity) return bad(c, 'The activity no longer exists.', 409);
    if (config.eligibility === 'selected') {
      const eligibleRows = await asRows<{ student_id: number }>(c.env.DB.prepare(
        'SELECT student_id FROM cgm_activity_eligible WHERE activity_id = ?'
      ).bind(Number(request.activity_id)));
      const eligibleSet = new Set(eligibleRows.map((row) => Number(row.student_id)));
      const ineligible = items.filter((item) => !eligibleSet.has(Number(item.student_id)));
      if (ineligible.length) {
        return bad(c, `${ineligible.map((item) => item.full_name).join(', ')} no longer eligible for this activity. Reject the request and ask the organizer to revise it.`, 409);
      }
    }
    const groups = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.name, g.position, g.capacity,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active'`
    ).bind(Number(request.activity_id)));
    const groupById = new Map(groups.map((row) => [Number(row.id), row]));
    for (const item of [...items, ...entries]) {
      if (!groupById.has(Number(item.destination_group_id))) {
        return bad(c, `${item.full_name}'s destination group no longer exists in this activity. Reject and ask the organizer to revise.`, 409);
      }
    }
    // Somebody who registered after the request was filed now has their own
    // identity: they are designated as a student, not held as a roster row.
    const stillUnregistered = entries.filter((entry) => !entry.registered_student_id);
    const graduated = entries.filter((entry) => Boolean(entry.registered_student_id));
    // APPROVAL-TIME REVALIDATION — the proposal is judged again against LIVE
    // data (members, reservations, other approved designations, current
    // genders), because any of them may have changed since submission. One
    // evaluator covers BOTH capacity and the gender-separated policy:
    //   final group = active members that stay
    //               + reservations still waiting to be applied
    //               + this proposal's students
    // with every student counted once.
    const composition = await forceGetComposition(c.env.DB, {
      activityId: Number(request.activity_id),
      genderRule: config.genderRule,
      proposal: [
        ...items.map((item) => ({ studentId: Number(item.student_id), groupId: Number(item.destination_group_id) })),
        ...graduated.map((entry) => ({ studentId: Number(entry.registered_student_id), groupId: Number(entry.destination_group_id) })),
      ],
      proposalEntries: stillUnregistered.map((entry) => ({
        rosterEntryId: Number(entry.roster_entry_id), groupId: Number(entry.destination_group_id),
        fullName: entry.full_name, gender: entry.gender,
      })),
      groups: groups.map((group) => ({
        id: Number(group.id), name: group.name || `Group ${group.position}`,
        capacity: group.capacity === null || group.capacity === undefined ? null : Number(group.capacity),
      })),
    });
    const approvalGroups = new Set([...items, ...entries].map((item) => Number(item.destination_group_id)));
    const blockingConflicts = composition.conflicts.filter((conflict) => conflict.blocking && approvalGroups.has(conflict.groupId));
    if (blockingConflicts.length) {
      // PHANTOM sees exactly what is wrong: the group, who clashes, which pool
      // each of them belongs to and whether they are an existing member, a
      // reserved approved seat or part of this proposal.
      return c.json({
        success: false,
        error: `Cannot approve — the proposed composition breaks this activity's rules. ${blockingConflicts.map((conflict) => conflict.message).join(' ')} `
          + `Reject the request and ask the organizer to revise it (or change the activity's gender rule first).`,
        data: {
          code: 'force_get_composition_conflict',
          genderRule: config.genderRule,
          errors: blockingConflicts.map((conflict) => conflict.message),
          warnings: composition.warnings,
          canApprove: false,
          conflicts: blockingConflicts.map((conflict) => ({
            kind: conflict.kind,
            groupId: conflict.groupId,
            groupName: conflict.groupName,
            message: conflict.message,
            blocking: conflict.blocking,
            pools: conflict.detail.pools,
            students: [
              ...conflict.detail.proposed.map((member) => ({ ...member, role: 'proposed' })),
              ...conflict.detail.existing.map((member) => ({ ...member, role: member.source })),
            ],
            capacity: conflict.detail.capacity,
            projected: conflict.detail.projected,
            overflow: conflict.detail.overflow,
          })),
        },
      }, 409);
    }

    const claimed = await c.env.DB.prepare(
      `UPDATE cgm_force_get_requests SET status = 'approved', reviewed_by_profile_id = ?, reviewer_label = ?,
       review_reason = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`
    ).bind(member.profileId, `PHANTOM · ${member.name}`, reason, requestId).run();
    if (!(Number((claimed as any)?.meta?.changes || 0) > 0)) {
      // Two PHANTOM operators raced: the first one owns this decision and the
      // designations must never be created twice.
      return bad(c, 'Another PHANTOM operator already decided this request. Reload the queue.', 409);
    }

    let designated = 0;
    let appliedNow = 0;
    // Designations are created for students who already have an identity — the
    // request's own items plus any roster row that registered since submission.
    const designationTargets = [
      ...items,
      ...graduated.map((entry) => ({
        ...entry,
        student_id: Number(entry.registered_student_id),
        previous_group_id: null,
      })),
    ];
    for (const item of designationTargets) {
      const studentId = Number(item.student_id);
      const groupId = Number(item.destination_group_id);
      const student = await asRows<{ full_name: string }>(c.env.DB.prepare(
        'SELECT full_name FROM cgm_students WHERE id = ?'
      ).bind(studentId));
      const studentName = student[0]?.full_name || item.full_name;
      // Supersede any previous live designation for this student.
      const previous = await asRows<any>(c.env.DB.prepare(
        `SELECT id, designated_group_id FROM cgm_force_get_designations
         WHERE activity_id = ? AND student_id = ? AND status = 'active'`
      ).bind(Number(request.activity_id), studentId));
      for (const row of previous) {
        await c.env.DB.prepare(
          `UPDATE cgm_force_get_designations SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(Number(row.id)).run();
        await auditCgm(c.env.DB, {
          actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
          action: 'cgm.force_get.superseded', entityType: 'force_get_designation', entityId: Number(row.id),
          classId: Number(request.class_id), activityId: Number(request.activity_id),
          context: { studentId, oldGroupId: Number(row.designated_group_id), newGroupId: groupId, version: Number(request.version) },
        });
      }
      const currentAssignment = await activeAssignmentId(c.env.DB, Number(request.activity_id), studentId);
      const currentRows = currentAssignment
        ? await asRows<any>(c.env.DB.prepare('SELECT group_id FROM cgm_group_assignments WHERE id = ?').bind(currentAssignment))
        : [];
      const alreadyThere = currentRows[0] && Number(currentRows[0].group_id) === groupId;
      const result = await c.env.DB.prepare(
        `INSERT INTO cgm_force_get_designations
           (activity_id, class_id, student_id, designated_group_id, approved_request_id, request_version,
            designated_by_profile_id, designated_by_label, approved_by_profile_id, approved_by_label,
            status, applied_assignment_id, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        Number(request.activity_id), Number(request.class_id), studentId, groupId, requestId, Number(request.version),
        request.requested_by_profile_id, request.requester_label, member.profileId, `PHANTOM · ${member.name}`,
        alreadyThere ? 'applied' : 'active', alreadyThere ? currentAssignment : null,
        alreadyThere ? new Date().toISOString() : null,
      ).run();
      designated += 1;
      if (alreadyThere) appliedNow += 1;
      await auditCgm(c.env.DB, {
        actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
        action: alreadyThere ? 'cgm.force_get.applied' : 'cgm.force_get.approved',
        entityType: 'force_get_designation', entityId: Number(result.meta.last_row_id),
        classId: Number(request.class_id), activityId: Number(request.activity_id),
        context: {
          studentId, studentName, groupId, requestId, version: Number(request.version), alreadyThere,
          fromGroupId: item.previous_group_id === null || item.previous_group_id === undefined ? null : Number(item.previous_group_id),
          toGroupId: groupId,
        },
      });
      await notifyStudent(c.env.DB, studentId, 'groups', 'Your organizer designated your group',
        alreadyThere
          ? `Your organizer's placement for you in ${request.activity_name} was approved. You are already in that group.`
          : `PHANTOM approved a destination group for you in ${request.activity_name}. Keep using your normal group selection — you will be placed in the approved group when you do. If you have already been placed, your organizer will ask you to re-choose.`);
    }
    // Seats approved for people who are still only roster rows. Nothing is
    // assigned: the seat is held, and it becomes a designation for them the
    // moment they register.
    let reservedRows = 0;
    for (const entry of stillUnregistered) {
      const groupId = Number(entry.destination_group_id);
      const group = groupById.get(groupId);
      const reservationId = await reserveRosterEntry(c.env.DB, {
        activityId: Number(request.activity_id), classId: Number(request.class_id),
        rosterEntryId: Number(entry.roster_entry_id), fullName: entry.full_name,
        indexNumber: entry.index_number, gender: entry.gender, groupId,
        requestId, version: Number(request.version),
        designatedByProfileId: request.requested_by_profile_id, designatedByLabel: request.requester_label,
        approvedByProfileId: member.profileId, approvedByLabel: `PHANTOM · ${member.name}`,
      });
      reservedRows += 1;
      await auditCgm(c.env.DB, {
        actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.force_get.reserved_roster_row', entityType: 'force_get_reservation',
        entityId: reservationId || Number(entry.roster_entry_id),
        classId: Number(request.class_id), activityId: Number(request.activity_id),
        context: {
          rosterEntryId: Number(entry.roster_entry_id), indexNumber: entry.index_number,
          groupId, groupName: group ? (group.name || `Group ${group.position}`) : null,
          requestId, version: Number(request.version),
        },
      });
    }
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.force_get.approved', entityType: 'force_get_request', entityId: requestId,
      classId: Number(request.class_id), activityId: Number(request.activity_id),
      context: {
        version: Number(request.version), students: designated, appliedImmediately: appliedNow,
        reservedRosterRows: reservedRows, reason,
      },
    });
    if (request.requested_by_profile_id) {
      await createNotification(c.env.DB, {
        title: 'Force Get approved',
        message: `PHANTOM approved your Force Get request for ${request.activity_name} — ${designated} student(s).`,
        audience: 'system', audienceLabel: 'Class & Groups',
        recipientProfileIds: [Number(request.requested_by_profile_id)],
      });
    }
    return c.json({ success: true, data: { status: 'approved', designated, appliedImmediately: appliedNow } });
  };

  app.post('/api/cgm/phantom/force-get/requests/:id/approve', (c: any) => decideForceGet(c, true));
  app.post('/api/cgm/phantom/force-get/requests/:id/reject', (c: any) => decideForceGet(c, false));

  // -------------------------------------------------------------------------
  // Elections (organizer side)
  // -------------------------------------------------------------------------
  app.post('/api/cgm/groups/:id/elections', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const groupId = Number(c.req.param('id'));
    const group = await groupCore(c.env.DB, groupId);
    if (!group) return bad(c, 'Group not found.', 404);
    const guard = await requireClassPermission(c, member, Number(group.class_id), 'manage_elections');
    if (!guard.ok) return guard.response;
    const existing = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_elections WHERE group_id = ? AND status IN ('nominating','voting')`
    ).bind(groupId));
    if (existing[0]) return bad(c, 'This group already has an active election.', 409);
    const body = await readBody(c);
    const role = String(body.role || 'leader');
    if (!['leader', 'assistant'].includes(role)) return bad(c, 'Choose leader or assistant.');
    const eligibleMode = String(body.eligibleMode || body.nominatorMode || 'all') === 'custom' ? 'custom' : 'all';
    let eligibleIdsJson: string | null = null;
    if (eligibleMode === 'custom') {
      const rawIds = Array.isArray(body.eligibleStudentIds) ? body.eligibleStudentIds : (Array.isArray(body.nominatorIds) ? body.nominatorIds : []);
      const ids = rawIds.map((v: any) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0);
      if (!ids.length) return bad(c, 'Choose at least one member when customizing nominators.', 400);
      // Validate they belong to the group
      const groupMembers = await asRows<{ student_id: number }>(c.env.DB.prepare(
        `SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
      ).bind(groupId));
      const memberSet = new Set(groupMembers.map(r => Number(r.student_id)));
      const invalid = ids.filter(id => !memberSet.has(id));
      if (invalid.length) return bad(c, 'Some chosen nominators are not in this group.', 400);
      eligibleIdsJson = JSON.stringify([...new Set(ids)]);
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const salt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    let result: any;
    try {
      result = await c.env.DB.prepare(
        `INSERT INTO cgm_elections
         (activity_id, group_id, title, role, anonymity, visibility, allow_vote_change, tie_break_method,
          nomination_open_at, nomination_close_at, voting_open_at, voting_close_at, salt, eligible_mode, eligible_student_ids, created_by_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(Number(group.activity_id), groupId, clean(body.title, 160) || `Group leadership election`,
        role,
        body.anonymity === 'public' ? 'public' : 'anonymous',
        ['private', 'group', 'class'].includes(String(body.visibility)) ? String(body.visibility) : 'group',
        body.allowVoteChange === true ? 1 : 0,
        ['runoff', 'appointment', 'random', 'manual'].includes(String(body.tieBreak)) ? String(body.tieBreak) : 'random',
        cleanOrNull(body.nominationOpenAt, 30), cleanOrNull(body.nominationCloseAt, 30),
        cleanOrNull(body.votingOpenAt, 30), cleanOrNull(body.votingCloseAt, 30),
        salt, eligibleMode, eligibleIdsJson, member.profileId).run();
    } catch (e: any) {
      // Fallback for DBs without new columns (pre-migration)
      if (String(e?.message || '').toLowerCase().includes('eligible')) throw e;
      result = await c.env.DB.prepare(
        `INSERT INTO cgm_elections
         (activity_id, group_id, title, role, anonymity, visibility, allow_vote_change, tie_break_method,
          nomination_open_at, nomination_close_at, voting_open_at, voting_close_at, salt, created_by_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(Number(group.activity_id), groupId, clean(body.title, 160) || `Group leadership election`,
        role,
        body.anonymity === 'public' ? 'public' : 'anonymous',
        ['private', 'group', 'class'].includes(String(body.visibility)) ? String(body.visibility) : 'group',
        body.allowVoteChange === true ? 1 : 0,
        ['runoff', 'appointment', 'random', 'manual'].includes(String(body.tieBreak)) ? String(body.tieBreak) : 'random',
        cleanOrNull(body.nominationOpenAt, 30), cleanOrNull(body.nominationCloseAt, 30),
        cleanOrNull(body.votingOpenAt, 30), cleanOrNull(body.votingCloseAt, 30),
        salt, member.profileId).run();
    }
    // Tell the group.
    const members = await asRows<{ student_id: number }>(c.env.DB.prepare(
      `SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
    ).bind(groupId));
    for (const row of members) {
      await notifyStudent(c.env.DB, Number(row.student_id), 'election', 'Group election created',
        `An election (${role === 'leader' ? 'leader' : 'assistant'}) was created for your group in ${group.activity_name}.`);
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.election.created', entityType: 'group', entityId: groupId,
      classId: Number(group.class_id), activityId: Number(group.activity_id),
      context: { electionId: Number(result.meta.last_row_id), anonymity: body.anonymity || 'anonymous' },
    });
    return c.json({ success: true, data: { electionId: Number(result.meta.last_row_id) } });
  });

  app.get('/api/cgm/elections/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const electionId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, a.class_id, g.name AS group_name, g.position AS group_position FROM cgm_elections e
       JOIN cgm_activities a ON a.id = e.activity_id JOIN cgm_groups g ON g.id = e.group_id WHERE e.id = ?`
    ).bind(electionId));
    const election = rows[0];
    if (!election) return bad(c, 'Election not found.', 404);
    const guard = await requireClassPermission(c, member, Number(election.class_id), 'manage_elections');
    if (!guard.ok) return guard.response;
    const candidates = await asRows<any>(c.env.DB.prepare(
      `SELECT c.*, s.full_name FROM cgm_candidates c JOIN cgm_students s ON s.id = c.student_id
       WHERE c.election_id = ? ORDER BY c.nominated_at`
    ).bind(electionId));
    const tally = await asRows<any>(c.env.DB.prepare(
      `SELECT candidate_id, COUNT(*) AS votes FROM cgm_election_ballots WHERE election_id = ? GROUP BY candidate_id`
    ).bind(electionId));
    const participationRows = await asRows<{ c: number }>(c.env.DB.prepare(
      'SELECT COUNT(*) AS c FROM cgm_election_participation WHERE election_id = ?'
    ).bind(electionId));
    const participationCount = Number(participationRows[0]?.c || 0);
    const groupSizeRows = await asRows<{ c: number }>(c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
    ).bind(Number(election.group_id)));
    const groupSize = Number(groupSizeRows[0]?.c || 0);
    // Anonymous ballots are never joined back to voters here: the organizer
    // sees counts only. Public elections additionally show voter names.
    const publicBallots = String(election.anonymity) === 'public'
      ? await asRows<any>(c.env.DB.prepare(
        `SELECT b.candidate_id, b.voter_student_id, s.full_name FROM cgm_election_ballots b
         JOIN cgm_students s ON s.id = b.voter_student_id WHERE b.election_id = ?`
      ).bind(electionId))
      : [];
    const tieBreaks = await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_tie_breaks WHERE election_id = ? ORDER BY id DESC LIMIT 10`
    ).bind(electionId));
    const eligibleIds = (() => { try { return election.eligible_student_ids ? JSON.parse(election.eligible_student_ids) : null; } catch { return null; } })();
    return c.json({
      success: true,
      data: {
        election: {
          id: electionId, groupId: Number(election.group_id), activityId: Number(election.activity_id),
          title: election.title, role: election.role, status: election.status,
          anonymity: election.anonymity, visibility: election.visibility,
          allowVoteChange: Number(election.allow_vote_change) === 1, tieBreak: election.tie_break_method,
          nominationOpenAt: election.nomination_open_at, nominationCloseAt: election.nomination_close_at,
          votingOpenAt: election.voting_open_at, votingCloseAt: election.voting_close_at,
          eligibleMode: election.eligible_mode || 'all',
          eligibleStudentIds: Array.isArray(eligibleIds) ? eligibleIds : null,
          results: election.results_json ? JSON.parse(election.results_json) : null,
          cancelledReason: election.cancelled_reason,
          groupName: election.group_name || `Group ${election.group_position}`,
        },
        candidates: candidates.map((row) => ({
          id: Number(row.id), studentId: Number(row.student_id), fullName: row.full_name,
          statement: row.statement, status: row.status, nominatedAt: row.nominated_at,
          votes: Number(tally.find((t) => Number(t.candidate_id) === Number(row.id))?.votes || 0),
        })),
        participation: { voted: participationCount, groupSize, turnout: groupSize ? Math.round((participationCount / groupSize) * 100) : 0 },
        publicBallots,
        tieBreaks: tieBreaks.map((row) => ({
          id: Number(row.id), method: row.method, detail: JSON.parse(row.detail_json || '{}'),
          decidedBy: row.decided_by_label, createdAt: row.created_at,
        })),
      },
    });
  });

  /**
   * Every election in an activity, in ONE round trip. The Elections page needs
   * the whole board at once; fetching each group's dossier and then each
   * election in turn turned one screen into dozens of queries. Six queries
   * total here, whatever the number of groups.
   */
  app.get('/api/cgm/activities/:id/elections', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'manage_elections');
    if (!guard.ok) return guard.response;
    const elections = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, g.name AS group_name, g.position AS group_position,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = e.group_id AND ga.status = 'active') AS group_size
       FROM cgm_elections e JOIN cgm_groups g ON g.id = e.group_id
       WHERE e.activity_id = ? ORDER BY e.id DESC LIMIT 200`
    ).bind(activityId));
    if (!elections.length) return c.json({ success: true, data: [] });
    const [candidates, tally, participation] = await Promise.all([
      asRows<any>(c.env.DB.prepare(
        `SELECT c.*, s.full_name FROM cgm_candidates c JOIN cgm_students s ON s.id = c.student_id
         JOIN cgm_elections e ON e.id = c.election_id
         WHERE e.activity_id = ? ORDER BY c.nominated_at`
      ).bind(activityId)),
      asRows<any>(c.env.DB.prepare(
        `SELECT b.election_id, b.candidate_id, COUNT(*) AS votes FROM cgm_election_ballots b
         JOIN cgm_elections e ON e.id = b.election_id WHERE e.activity_id = ? GROUP BY b.election_id, b.candidate_id`
      ).bind(activityId)),
      asRows<any>(c.env.DB.prepare(
        `SELECT p.election_id, COUNT(*) AS voted FROM cgm_election_participation p
         JOIN cgm_elections e ON e.id = p.election_id WHERE e.activity_id = ? GROUP BY p.election_id`
      ).bind(activityId)),
    ]);
    return c.json({
      success: true,
      data: elections.map((election) => {
        const groupSize = Number(election.group_size || 0);
        const voted = Number(participation.find((row) => Number(row.election_id) === Number(election.id))?.voted || 0);
        const eligibleIds = (() => { try { return election.eligible_student_ids ? JSON.parse(election.eligible_student_ids) : null; } catch { return null; } })();
        return {
          election: {
            id: Number(election.id), groupId: Number(election.group_id), activityId: Number(election.activity_id),
            title: election.title, role: election.role, status: election.status,
            anonymity: election.anonymity, visibility: election.visibility,
            allowVoteChange: Number(election.allow_vote_change) === 1, tieBreak: election.tie_break_method,
            nominationOpenAt: election.nomination_open_at, nominationCloseAt: election.nomination_close_at,
            votingOpenAt: election.voting_open_at, votingCloseAt: election.voting_close_at,
            eligibleMode: election.eligible_mode || 'all',
            eligibleStudentIds: Array.isArray(eligibleIds) ? eligibleIds : null,
            results: election.results_json ? JSON.parse(election.results_json) : null,
            cancelledReason: election.cancelled_reason,
            groupName: election.group_name || `Group ${election.group_position}`,
          },
          candidates: candidates
            .filter((candidate) => Number(candidate.election_id) === Number(election.id))
            .map((candidate) => ({
              id: Number(candidate.id), studentId: Number(candidate.student_id), fullName: candidate.full_name,
              statement: candidate.statement, status: candidate.status, nominatedAt: candidate.nominated_at,
              votes: Number(tally.find((row) => Number(row.candidate_id) === Number(candidate.id))?.votes || 0),
            })),
          participation: { voted, groupSize, turnout: groupSize ? Math.round((voted / groupSize) * 100) : 0 },
        };
      }),
    });
  });

  const electionTransition = async (c: any, action: 'open-voting' | 'close' | 'cancel' | 'restart') => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const electionId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, a.class_id FROM cgm_elections e JOIN cgm_activities a ON a.id = e.activity_id WHERE e.id = ?`
    ).bind(electionId));
    const election = rows[0];
    if (!election) return bad(c, 'Election not found.', 404);
    const guard = await requireClassPermission(c, member, Number(election.class_id), 'manage_elections');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const reason = cleanOrNull(body.reason, 500);

    if (action === 'open-voting') {
      if (election.status !== 'nominating') return bad(c, 'Only a nominating election can open for voting.', 409);
      const candidates = await asRows<{ c: number }>(c.env.DB.prepare(
        `SELECT COUNT(*) AS c FROM cgm_candidates WHERE election_id = ? AND status = 'active'`
      ).bind(electionId));
      if (Number(candidates[0]?.c || 0) === 0) return bad(c, 'No active candidates. Use organizer appointment instead.', 409);
      const votingOpenAt = cleanOrNull(body.votingOpenAt, 30);
      const votingCloseAt = cleanOrNull(body.votingCloseAt, 30);
      if (votingOpenAt || votingCloseAt) {
        await c.env.DB.prepare(
          `UPDATE cgm_elections SET status = 'voting', voting_open_at = COALESCE(?, voting_open_at, CURRENT_TIMESTAMP), voting_close_at = COALESCE(?, voting_close_at) WHERE id = ?`
        ).bind(votingOpenAt, votingCloseAt, electionId).run();
      } else {
        await c.env.DB.prepare(`UPDATE cgm_elections SET status = 'voting', voting_open_at = COALESCE(voting_open_at, CURRENT_TIMESTAMP) WHERE id = ?`).bind(electionId).run();
      }
      const voters = await asRows<{ student_id: number }>(c.env.DB.prepare(
        `SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
      ).bind(Number(election.group_id)));
      for (const row of voters) {
        await notifyStudent(c.env.DB, Number(row.student_id), 'election', 'Voting is open',
          `Voting is open for ${election.title}. One vote each; it closes at ${election.voting_close_at || 'the organizer\'s close'}.`);
      }
    } else if (action === 'close') {
      if (election.status !== 'voting') return bad(c, 'Only an open election can be closed.', 409);
      await closeElection(c.env.DB, election, member.name);
    } else if (action === 'cancel') {
      if (!reason) return bad(c, 'Record a reason when cancelling an election.');
      if (election.status === 'closed') return bad(c, 'A closed election cannot be cancelled.', 409);
      await c.env.DB.prepare(
        `UPDATE cgm_elections SET status = 'cancelled', cancelled_reason = ?, decided_by_label = ? WHERE id = ?`
      ).bind(reason, member.name, electionId).run();
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.election.cancelled', entityType: 'election', entityId: electionId,
        classId: Number(election.class_id), context: { reason },
      });
    } else if (action === 'restart') {
      if (!['cancelled'].includes(election.status)) return bad(c, 'Only a cancelled election can be restarted.', 409);
      await c.env.DB.prepare(
        `UPDATE cgm_elections SET status = 'nominating', cancelled_reason = NULL, results_json = NULL WHERE id = ?`
      ).bind(electionId).run();
      await c.env.DB.prepare('DELETE FROM cgm_election_ballots WHERE election_id = ?').bind(electionId).run();
      await c.env.DB.prepare('DELETE FROM cgm_election_participation WHERE election_id = ?').bind(electionId).run();
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.election.restarted', entityType: 'election', entityId: electionId, classId: Number(election.class_id),
      });
    }
    return c.json({ success: true });
  };
  app.post('/api/cgm/elections/:id/open-voting', async (c: any) => electionTransition(c, 'open-voting'));
  app.post('/api/cgm/elections/:id/close', async (c: any) => electionTransition(c, 'close'));
  app.post('/api/cgm/elections/:id/cancel', async (c: any) => electionTransition(c, 'cancel'));
  app.post('/api/cgm/elections/:id/restart', async (c: any) => electionTransition(c, 'restart'));

  const closeElection = async (db: D1Database, election: any, actorLabel: string) => {
    const electionId = Number(election.id);
    const tally = await asRows<any>(db.prepare(
      `SELECT candidate_id, COUNT(*) AS votes FROM cgm_election_ballots WHERE election_id = ? GROUP BY candidate_id ORDER BY votes DESC`
    ).bind(electionId));
    const top = tally[0] ? Number(tally[0].votes) : 0;
    const tied = tally.filter((row) => Number(row.votes) === top && top > 0);
    let outcome: Record<string, unknown>;
    if (tied.length > 1) {
      const method = String(election.tie_break_method);
      let winner: number | null = null;
      let note = '';
      if (method === 'random') {
        const index = Math.floor(Math.random() * tied.length);
        winner = Number(tied[index].candidate_id);
        note = 'Secure random selection among tied candidates.';
      } else if (method === 'runoff') {
        note = 'Runoff required: a second round must be organised.';
      } else {
        note = method === 'appointment'
          ? 'Organizer appointment decides the tie; record the reason.'
          : 'Manual resolution by an authorized organizer.';
      }
      outcome = { tie: true, tiedCandidateIds: tied.map((row) => Number(row.candidate_id)), method, winner, note };
      await db.prepare(
        `INSERT INTO cgm_tie_breaks (election_id, method, detail_json, decided_by_label) VALUES (?, ?, ?, ?)`
      ).bind(electionId, method, JSON.stringify(outcome), actorLabel).run();
    } else {
      outcome = { tie: false, winner: tally[0] ? Number(tally[0].candidate_id) : null, votes: tally.map((row) => ({ candidateId: Number(row.candidate_id), votes: Number(row.votes) })) };
    }
    await db.prepare(
      `UPDATE cgm_elections SET status = 'closed', results_json = ?, decided_by_label = ? WHERE id = ?`
    ).bind(JSON.stringify({ outcome, tally: tally.map((row) => ({ candidateId: Number(row.candidate_id), votes: Number(row.votes) })), closedAt: new Date().toISOString() }), actorLabel, electionId).run();

    const voters = await asRows<{ student_id: number }>(db.prepare(
      `SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
    ).bind(Number(election.group_id)));
    for (const row of voters) {
      await notifyStudent(db, Number(row.student_id), 'election', 'Election closed',
        `${election.title} has closed. Results are available per the election's visibility setting.`);
    }
    return outcome;
  };

  app.post('/api/cgm/elections/:id/tiebreak', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const electionId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, a.class_id FROM cgm_elections e JOIN cgm_activities a ON a.id = e.activity_id WHERE e.id = ?`
    ).bind(electionId));
    const election = rows[0];
    if (!election) return bad(c, 'Election not found.', 404);
    const guard = await requireClassPermission(c, member, Number(election.class_id), 'manage_elections');
    if (!guard.ok) return guard.response;
    if (election.status !== 'closed') return bad(c, 'Resolve ties after the election closes.', 409);
    const body = await readBody(c);
    const winner = Number(body.winnerCandidateId);
    const reason = cleanOrNull(body.reason, 500);
    const results = election.results_json ? JSON.parse(election.results_json) : {};
    results.outcome = { ...(results.outcome || {}), resolved: true, winner, resolvedBy: member.name, reason };
    await c.env.DB.prepare(
      `UPDATE cgm_elections SET results_json = ? WHERE id = ?`
    ).bind(JSON.stringify(results), electionId).run();
    await c.env.DB.prepare(
      `INSERT INTO cgm_tie_breaks (election_id, method, detail_json, decided_by_label) VALUES (?, 'resolved', ?, ?)`
    ).bind(electionId, JSON.stringify({ winner, reason }), member.name).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.election.tie_resolved', entityType: 'election', entityId: electionId,
      classId: Number(election.class_id), context: { winner, reason },
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/elections/:id/announce', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const electionId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, a.class_id, a.name AS activity_name FROM cgm_elections e JOIN cgm_activities a ON a.id = e.activity_id WHERE e.id = ?`
    ).bind(electionId));
    const election = rows[0];
    if (!election) return bad(c, 'Election not found.', 404);
    const guard = await requireClassPermission(c, member, Number(election.class_id), 'manage_elections');
    if (!guard.ok) return guard.response;
    if (election.status !== 'closed') return bad(c, 'Announce the winner after the election closes.', 409);
    const results = election.results_json ? JSON.parse(election.results_json) : null;
    const winner = results?.outcome?.winner;
    if (!winner) return bad(c, 'There is no resolved winner to announce.', 409);
    const winnerStudent = await asRows<{ student_id: number; full_name: string }>(c.env.DB.prepare(
      `SELECT c.student_id, s.full_name FROM cgm_candidates c JOIN cgm_students s ON s.id = c.student_id WHERE c.id = ?`
    ).bind(winner));
    const appointment = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_leadership_appointments WHERE group_id = ? AND role = ? AND status = 'active'`
    ).bind(Number(election.group_id), String(election.role)));
    if (appointment[0]) {
      await c.env.DB.prepare(
        `UPDATE cgm_leadership_appointments SET status = 'ended', ended_at = CURRENT_TIMESTAMP, end_reason = 'election result' WHERE id = ?`
      ).bind(Number(appointment[0].id)).run();
    }
    const config = sanitizeActivityConfig(JSON.parse((await activityCore(c.env.DB, Number(election.activity_id)))?.config_json || '{}'));
    await c.env.DB.prepare(
      `INSERT INTO cgm_leadership_appointments (activity_id, group_id, student_id, role, method, permissions_json, appointed_by_label)
       VALUES (?, ?, ?, ?, 'election', ?, ?)`
    ).bind(Number(election.activity_id), Number(election.group_id), Number(winnerStudent[0]?.student_id || winner),
      String(election.role),
      JSON.stringify(String(election.role) === 'assistant' ? config.assistantPermissions : config.leaderPermissions),
      member.name).run();
    await notifyStudent(c.env.DB, Number(winnerStudent[0]?.student_id || winner), 'election', 'Congratulations — you won the election',
      `You won ${election.title} and are now the ${String(election.role) === 'leader' ? 'group leader' : 'assistant leader'}.`);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.election.announced', entityType: 'election', entityId: electionId,
      classId: Number(election.class_id), activityId: Number(election.activity_id),
      context: { winner },
    });
    return c.json({ success: true, data: { winnerName: winnerStudent[0]?.full_name || null } });
  });

  // -------------------------------------------------------------------------
  // Announcements (organizer side)
  // -------------------------------------------------------------------------
  app.get('/api/cgm/classes/:id/announcements', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_announcements');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_announcements WHERE class_id = ? AND status IN ('published','pending')
       ORDER BY pinned DESC, created_at DESC LIMIT 200`
    ).bind(classId));
    const reports = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, a.title AS announcement_title FROM cgm_announcement_reports r
       JOIN cgm_announcements a ON a.id = r.announcement_id WHERE a.class_id = ? AND r.status = 'open' ORDER BY r.id DESC LIMIT 50`
    ).bind(classId));
    const readCounts = await asRows<{ announcement_id: number; c: number }>(c.env.DB.prepare(
      `SELECT announcement_id, COUNT(*) AS c FROM cgm_announcement_reads
       WHERE announcement_id IN (${rows.map(() => '?').join(',') || 'NULL'}) GROUP BY announcement_id`
    ).bind(...rows.map((row) => Number(row.id))));
    const readCountFor = (id: number) => Number(readCounts.find((entry) => Number(entry.announcement_id) === id)?.c || 0);
    return c.json({
      success: true,
      data: {
        announcements: rows.map((row) => ({
          id: Number(row.id), title: row.title, body: row.body, status: row.status,
          pinned: Number(row.pinned) === 1, authorType: row.author_type, authorLabel: row.author_label,
          groupId: row.group_id ? Number(row.group_id) : null, activityId: row.activity_id ? Number(row.activity_id) : null,
          createdAt: row.created_at, updatedAt: row.updated_at,
          attachmentName: row.attachment_name || null,
          attachmentUrl: row.attachment_name ? `/api/cgm/announcements/${Number(row.id)}/attachment` : null,
          readCount: readCountFor(Number(row.id)),
        })),
        reports: reports.map((row) => ({
          id: Number(row.id), announcementId: Number(row.announcement_id), title: row.announcement_title,
          reason: row.reason, createdAt: row.created_at,
        })),
      },
    });
  });

  app.post('/api/cgm/classes/:id/announcements', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_announcements');
    if (!guard.ok) return guard.response;
    // JSON bodies and multipart (with an optional R2 attachment) both land here.
    let body: Record<string, unknown>;
    let attachment: File | null = null;
    if (String(c.req.header('content-type') || '').includes('multipart/form-data')) {
      const form = await c.req.parseBody();
      attachment = form.attachment instanceof File && form.attachment.size > 0 ? form.attachment : null;
      body = {
        title: form.title, body: form.body, pinned: form.pinned === 'true' || form.pinned === '1',
        activityId: form.activityId, groupId: form.groupId,
      };
    } else {
      body = await readBody(c);
    }
    const title = clean(body.title, 180);
    const message = clean(body.body, 5000);
    if (!title || !message) return bad(c, 'An announcement needs a title and a message.');
    if (attachment && attachment.size > 5 * 1024 * 1024) return bad(c, 'Keep attachments under 5 MB.', 413);
    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_announcements (class_id, activity_id, group_id, author_type, author_profile_id, author_label, title, body, pinned)
       VALUES (?, ?, ?, 'organizer', ?, ?, ?, ?, ?)`
    ).bind(classId, body.activityId ? Number(body.activityId) : null, body.groupId ? Number(body.groupId) : null,
      member.profileId, member.name, title, message, body.pinned === true ? 1 : 0).run();
    const announcementId = Number(result.meta.last_row_id);
    // The file goes straight into the platform's existing R2 bucket; the row
    // keeps only the key, name, type and size.
    if (attachment && c.env.BUCKET) {
      const key = `cgm/announcements/${classId}/${announcementId}-${Date.now()}-${attachment.name.replace(/[^\w.-]+/g, '_').slice(0, 80)}`;
      await c.env.BUCKET.put(key, await attachment.arrayBuffer(), { httpMetadata: { contentType: attachment.type || 'application/octet-stream' } });
      await c.env.DB.prepare(
        `UPDATE cgm_announcements SET attachment_r2_key = ?, attachment_name = ?, attachment_type = ?, attachment_size = ? WHERE id = ?`
      ).bind(key, attachment.name.slice(0, 200), (attachment.type || 'application/octet-stream').slice(0, 120), attachment.size, announcementId).run();
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.announcement.created', entityType: 'announcement', entityId: announcementId, classId,
      context: { attachment: attachment ? attachment.name.slice(0, 120) : null },
    });
    return c.json({ success: true, data: { id: announcementId } });
  });

  // -------------------------------------------------------------------------
  // §12 — Announcement attachments (stored in the platform R2 bucket)
  // -------------------------------------------------------------------------

  app.get('/api/cgm/announcements/:id/attachment', async (c: any) => {
    const announcementId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      'SELECT id, class_id, attachment_r2_key, attachment_name, attachment_type FROM cgm_announcements WHERE id = ?'
    ).bind(announcementId));
    const announcement = rows[0];
    if (!announcement || !announcement.attachment_r2_key) return bad(c, 'This announcement has no attachment.', 404);
    // Class members (students) and the class team both may download.
    const student = await studentFromRequest(c);
    let allowed = false;
    if (student) {
      const membership = await asRows<{ id: number }>(c.env.DB.prepare(
        "SELECT id FROM cgm_class_members WHERE class_id = ? AND student_id = ? AND status = 'active'"
      ).bind(Number(announcement.class_id), student.id));
      allowed = Boolean(membership[0]);
    }
    if (!allowed) {
      const member = await memberFromRequest(c);
      if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
      const context = await organizerContextFor(c.env.DB, member, Number(announcement.class_id));
      allowed = Boolean(member.isPhantom || context.role);
    }
    if (!allowed) return bad(c, 'Only this class can download the attachment.', 403);
    const object = await c.env.BUCKET.get(String(announcement.attachment_r2_key));
    if (!object) return bad(c, 'The attachment file is missing.', 404);
    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': String(announcement.attachment_type || 'application/octet-stream'),
        'Content-Disposition': `attachment; filename="${String(announcement.attachment_name || 'attachment').replace(/[^\w.-]+/g, '_')}"`,
      },
    });
  });

  // §12 — Read tracking: the organizer sees who has read an announcement.
  app.get('/api/cgm/announcements/:id/reads', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const announcementId = Number(c.req.param('id'));
    const rows = await asRows<{ id: number; class_id: number }>(c.env.DB.prepare(
      'SELECT id, class_id FROM cgm_announcements WHERE id = ?'
    ).bind(announcementId));
    if (!rows[0]) return bad(c, 'Announcement not found.', 404);
    const guard = await requireClassPermission(c, member, Number(rows[0].class_id), 'manage_announcements');
    if (!guard.ok) return guard.response;
    const reads = await asRows<{ full_name: string; read_at: string }>(c.env.DB.prepare(
      `SELECT s.full_name, r.read_at FROM cgm_announcement_reads r JOIN cgm_students s ON s.id = r.student_id
       WHERE r.announcement_id = ? ORDER BY r.read_at DESC LIMIT 500`
    ).bind(announcementId));
    return c.json({
      success: true,
      data: {
        count: reads.length,
        readers: reads.map((row) => ({ fullName: row.full_name, readAt: row.read_at })),
      },
    });
  });

  // -------------------------------------------------------------------------
  // §31 — Deadline reminders (organizer-triggered, de-duplicated per student)
  // -------------------------------------------------------------------------

  app.post('/api/cgm/activities/:id/reminders', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'manage_activities');
    if (!guard.ok) return guard.response;
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    const deadline = config.selfDeadline ? new Date(String(config.selfDeadline)) : null;
    if (!deadline || Number.isNaN(deadline.getTime())) return bad(c, 'This activity has no self-assignment deadline to remind about.', 409);
    const dayKey = deadline.toISOString().slice(0, 10);
    const students = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT s.id FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id
       WHERE cm.class_id = ? AND cm.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = s.id AND ga.status = 'active')`
    ).bind(Number(activity.class_id), activityId));
    let sent = 0; let skipped = 0;
    for (const student of students) {
      const before = await asRows<{ c: number }>(c.env.DB.prepare(
        'SELECT COUNT(*) AS c FROM cgm_student_notifications WHERE student_id = ? AND dedupe_key = ?'
      ).bind(student.id, `activity-deadline:${activityId}:${dayKey}`));
      if (Number(before[0]?.c || 0) > 0) { skipped += 1; continue; }
      await notifyStudent(c.env.DB, student.id, 'activity', 'Deadline coming up',
        `${activity.name}: choose your group before ${dayKey}. After the deadline your organizer places you.`, null,
        `activity-deadline:${activityId}:${dayKey}`);
      sent += 1;
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.activity.reminders', entityType: 'activity', entityId: activityId,
      classId: Number(activity.class_id), context: { sent, skipped, dayKey },
    });
    return c.json({ success: true, data: { sent, skipped, eligible: students.length } });
  });

  app.patch('/api/cgm/announcements/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const announcementId = Number(c.req.param('id'));
    const rows = await asRows<{ id: number; class_id: number; title: string; body: string; edit_history_json: string }>(c.env.DB.prepare(
      'SELECT id, class_id, title, body, edit_history_json FROM cgm_announcements WHERE id = ?'
    ).bind(announcementId));
    const announcement = rows[0];
    if (!announcement) return bad(c, 'Announcement not found.', 404);
    const guard = await requireClassPermission(c, member, Number(announcement.class_id), 'manage_announcements');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const title = clean(body.title, 180);
    const message = clean(body.body, 5000);
    if (!title || !message) return bad(c, 'An announcement needs a title and a message.');
    let history: any[] = [];
    try { history = JSON.parse(announcement.edit_history_json || '[]'); } catch { history = []; }
    history.push({ title: announcement.title, body: announcement.body, editedBy: member.name, editedAt: new Date().toISOString() });
    await c.env.DB.prepare(
      `UPDATE cgm_announcements SET title = ?, body = ?, edit_history_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(title, message, JSON.stringify(history.slice(-10)), announcementId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.announcement.edited', entityType: 'announcement', entityId: announcementId, classId: Number(announcement.class_id),
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/announcements/:id/pin', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const announcementId = Number(c.req.param('id'));
    const rows = await asRows<{ id: number; class_id: number; pinned: number }>(c.env.DB.prepare(
      'SELECT id, class_id, pinned FROM cgm_announcements WHERE id = ?'
    ).bind(announcementId));
    const announcement = rows[0];
    if (!announcement) return bad(c, 'Announcement not found.', 404);
    const guard = await requireClassPermission(c, member, Number(announcement.class_id), 'manage_announcements');
    if (!guard.ok) return guard.response;
    await c.env.DB.prepare('UPDATE cgm_announcements SET pinned = ? WHERE id = ?')
      .bind(Number(announcement.pinned) === 1 ? 0 : 1, announcementId).run();
    return c.json({ success: true });
  });

  app.delete('/api/cgm/announcements/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const announcementId = Number(c.req.param('id'));
    const rows = await asRows<{ id: number; class_id: number }>(c.env.DB.prepare(
      'SELECT id, class_id FROM cgm_announcements WHERE id = ?'
    ).bind(announcementId));
    const announcement = rows[0];
    if (!announcement) return bad(c, 'Announcement not found.', 404);
    const guard = await requireClassPermission(c, member, Number(announcement.class_id), 'manage_announcements');
    if (!guard.ok) return guard.response;
    await c.env.DB.prepare(`UPDATE cgm_announcements SET status = 'removed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(announcementId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.announcement.removed', entityType: 'announcement', entityId: announcementId, classId: Number(announcement.class_id),
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/announcements/:id/moderate', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const announcementId = Number(c.req.param('id'));
    const rows = await asRows<{ id: number; class_id: number; status: string }>(c.env.DB.prepare(
      'SELECT id, class_id, status FROM cgm_announcements WHERE id = ?'
    ).bind(announcementId));
    const announcement = rows[0];
    if (!announcement) return bad(c, 'Announcement not found.', 404);
    const guard = await requireClassPermission(c, member, Number(announcement.class_id), 'manage_announcements');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const decision = String(body.decision || '');
    if (!['approve', 'reject', 'resolve-report'].includes(decision)) return bad(c, 'Unknown moderation decision.', 400);
    if (decision === 'approve') {
      await c.env.DB.prepare(`UPDATE cgm_announcements SET status = 'published', review_note = ? WHERE id = ?`)
        .bind(cleanOrNull(body.note, 300), announcementId).run();
    } else if (decision === 'reject') {
      await c.env.DB.prepare(`UPDATE cgm_announcements SET status = 'removed', review_note = ? WHERE id = ?`)
        .bind(cleanOrNull(body.note, 300), announcementId).run();
    } else {
      await c.env.DB.prepare(`UPDATE cgm_announcement_reports SET status = 'resolved' WHERE announcement_id = ?`).bind(announcementId).run();
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: `cgm.announcement.${decision}`, entityType: 'announcement', entityId: announcementId, classId: Number(announcement.class_id),
    });
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // WhatsApp links
  // -------------------------------------------------------------------------
  app.post('/api/cgm/groups/:id/whatsapp', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const groupId = Number(c.req.param('id'));
    const group = await groupCore(c.env.DB, groupId);
    if (!group) return bad(c, 'Group not found.', 404);
    const guard = await requireClassPermission(c, member, Number(group.class_id), 'manage_whatsapp');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const url = clean(body.url, 500);
    if (!/^https:\/\/chat\.whatsapp\.com\/[\w-]+(\?.*)?$/.test(url)) {
      return bad(c, 'Paste a valid WhatsApp group invite link (https://chat.whatsapp.com/…).');
    }
    const existing = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_whatsapp_links WHERE group_id = ? AND status = 'active'`
    ).bind(groupId));
    if (existing[0]) {
      await c.env.DB.prepare(
        `UPDATE cgm_whatsapp_links SET status = 'revoked', replaced_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(Number(existing[0].id)).run();
    }
    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_whatsapp_links (activity_id, group_id, url, created_by_label) VALUES (?, ?, ?, ?)`
    ).bind(Number(group.activity_id), groupId, url, member.name).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: existing[0] ? 'cgm.whatsapp.replaced' : 'cgm.whatsapp.set', entityType: 'group', entityId: groupId,
      classId: Number(group.class_id), activityId: Number(group.activity_id),
    });
    return c.json({ success: true, data: { id: Number(result.meta.last_row_id) } });
  });

  app.post('/api/cgm/groups/:id/whatsapp/:action', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const groupId = Number(c.req.param('id'));
    const action = String(c.req.param('action'));
    const group = await groupCore(c.env.DB, groupId);
    if (!group) return bad(c, 'Group not found.', 404);
    const guard = await requireClassPermission(c, member, Number(group.class_id), 'manage_whatsapp');
    if (!guard.ok) return guard.response;
    if (!['disable', 'enable', 'revoke'].includes(action)) return bad(c, 'Unknown action.', 404);
    await c.env.DB.prepare(
      `UPDATE cgm_whatsapp_links SET status = ? WHERE group_id = ? AND status IN ('active','disabled')`
    ).bind(action === 'disable' ? 'disabled' : action === 'enable' ? 'active' : 'revoked', groupId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: `cgm.whatsapp.${action}d`, entityType: 'group', entityId: groupId,
      classId: Number(group.class_id), activityId: Number(group.activity_id),
    });
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Attendance
  // -------------------------------------------------------------------------
  app.post('/api/cgm/activities/:id/attendance-sessions', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'manage_attendance');
    if (!guard.ok) return guard.response;
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    if (!config.attendanceEnabled) return bad(c, 'Attendance is disabled for this activity.', 409);
    const body = await readBody(c);
    const title = clean(body.title, 160);
    const sessionDate = clean(body.sessionDate, 10);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return bad(c, 'Give the session a title and a date (YYYY-MM-DD).');
    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_attendance_sessions (activity_id, group_id, title, session_date, created_by_label)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(activityId, body.groupId ? Number(body.groupId) : null, title, sessionDate, member.name).run();
    return c.json({ success: true, data: { sessionId: Number(result.meta.last_row_id) } });
  });

  app.get('/api/cgm/attendance-sessions/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const sessionId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT sess.*, a.class_id, a.name AS activity_name FROM cgm_attendance_sessions sess
       JOIN cgm_activities a ON a.id = sess.activity_id WHERE sess.id = ?`
    ).bind(sessionId));
    const session = rows[0];
    if (!session) return bad(c, 'Session not found.', 404);
    const guard = await requireClassPermission(c, member, Number(session.class_id), 'manage_attendance');
    if (!guard.ok) return guard.response;
    const eligible = session.group_id
      ? await asRows<any>(c.env.DB.prepare(
        `SELECT s.id, s.full_name FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id
         WHERE ga.group_id = ? AND ga.status = 'active' ORDER BY s.full_name`
      ).bind(Number(session.group_id)))
      : await asRows<any>(c.env.DB.prepare(
        `SELECT s.id, s.full_name FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id
         WHERE ga.activity_id = ? AND ga.status = 'active' ORDER BY s.full_name`
      ).bind(Number(session.activity_id)));
    const records = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM cgm_attendance_records WHERE session_id = ?'
    ).bind(sessionId));
    return c.json({
      success: true,
      data: {
        session: {
          id: sessionId, title: session.title, sessionDate: session.session_date, status: session.status,
          groupId: session.group_id ? Number(session.group_id) : null, activityName: session.activity_name,
          createdAt: session.created_at,
        },
        students: eligible.map((row: any) => {
          const record = records.find((r: any) => Number(r.student_id) === Number(row.id));
          return {
            studentId: Number(row.id), fullName: row.full_name,
            status: record?.status || null, note: record?.note || null,
            corrected: Boolean(record?.corrected_at), originalStatus: record?.original_status || null,
          };
        }),
      },
    });
  });

  app.post('/api/cgm/attendance-sessions/:id/records', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const sessionId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT sess.*, a.class_id FROM cgm_attendance_sessions sess JOIN cgm_activities a ON a.id = sess.activity_id WHERE sess.id = ?`
    ).bind(sessionId));
    const session = rows[0];
    if (!session) return bad(c, 'Session not found.', 404);
    const guard = await requireClassPermission(c, member, Number(session.class_id), 'manage_attendance');
    if (!guard.ok) return guard.response;
    if (session.status !== 'open') return bad(c, 'This session is closed; correct individual records instead.', 409);
    const body = await readBody(c);
    const records = Array.isArray(body.records) ? body.records.slice(0, 500) : [];
    let saved = 0;
    for (const record of records) {
      const status = String(record.status || '');
      if (!(ATTENDANCE_STATUSES as readonly string[]).includes(status)) continue;
      const studentId = Number(record.studentId);
      if (!studentId) continue;
      await c.env.DB.prepare(
        `INSERT INTO cgm_attendance_records (session_id, student_id, status, note, recorded_by_label)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id, student_id) DO UPDATE SET status = excluded.status, note = excluded.note,
           recorded_by_label = excluded.recorded_by_label, recorded_at = CURRENT_TIMESTAMP`
      ).bind(sessionId, studentId, status, cleanOrNull(record.note, 300), member.name).run();
      saved += 1;
      await notifyStudent(c.env.DB, studentId, 'attendance', 'Attendance recorded',
        `You were marked ${status} for "${session.title}".`);
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.attendance.recorded', entityType: 'attendance_session', entityId: sessionId,
      classId: Number(session.class_id), activityId: Number(session.activity_id), context: { saved },
    });
    return c.json({ success: true, data: { saved } });
  });

  app.post('/api/cgm/attendance-sessions/:id/close', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const sessionId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT sess.*, a.class_id FROM cgm_attendance_sessions sess JOIN cgm_activities a ON a.id = sess.activity_id WHERE sess.id = ?`
    ).bind(sessionId));
    const session = rows[0];
    if (!session) return bad(c, 'Session not found.', 404);
    const guard = await requireClassPermission(c, member, Number(session.class_id), 'manage_attendance');
    if (!guard.ok) return guard.response;
    await c.env.DB.prepare(
      `UPDATE cgm_attendance_sessions SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(sessionId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.attendance.session_closed', entityType: 'attendance_session', entityId: sessionId,
      classId: Number(session.class_id), activityId: Number(session.activity_id),
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/attendance/records/:id/correct', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const recordId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, a.class_id FROM cgm_attendance_records r
       JOIN cgm_attendance_sessions sess ON sess.id = r.session_id
       JOIN cgm_activities a ON a.id = sess.activity_id WHERE r.id = ?`
    ).bind(recordId));
    const record = rows[0];
    if (!record) return bad(c, 'Record not found.', 404);
    const guard = await requireClassPermission(c, member, Number(record.class_id), 'manage_attendance');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const status = String(body.status || '');
    const reason = cleanOrNull(body.reason, 500);
    if (!(ATTENDANCE_STATUSES as readonly string[]).includes(status)) return bad(c, 'Choose a valid attendance status.');
    if (!reason) return bad(c, 'Record the reason for the correction.');
    await c.env.DB.prepare(
      `UPDATE cgm_attendance_records SET original_status = COALESCE(original_status, status), status = ?,
       corrected_by_label = ?, corrected_at = CURRENT_TIMESTAMP, correction_reason = ? WHERE id = ?`
    ).bind(status as AttendanceStatus, member.name, reason, recordId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.attendance.corrected', entityType: 'attendance_record', entityId: recordId,
      classId: Number(record.class_id), context: { from: record.status, to: status, reason },
    });
    await notifyStudent(c.env.DB, Number(record.student_id), 'attendance', 'Attendance corrected',
      `Your attendance for a session was corrected to ${status}. Reason: ${reason}`);
    return c.json({ success: true });
  });

  app.get('/api/cgm/activities/:id/attendance-summary', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const activityId = Number(c.req.param('id'));
    const activity = await activityCore(c.env.DB, activityId);
    if (!activity) return bad(c, 'Activity not found.', 404);
    const guard = await requireClassPermission(c, member, Number(activity.class_id), 'manage_attendance');
    if (!guard.ok) return guard.response;
    const sessions = await asRows<any>(c.env.DB.prepare(
      'SELECT id, title, session_date, status FROM cgm_attendance_sessions WHERE activity_id = ? ORDER BY session_date DESC LIMIT 100'
    ).bind(activityId));
    const summary = await asRows<any>(c.env.DB.prepare(
      `SELECT r.student_id, s.full_name, r.status, COUNT(*) AS c FROM cgm_attendance_records r
       JOIN cgm_students s ON s.id = r.student_id
       WHERE r.session_id IN (SELECT id FROM cgm_attendance_sessions WHERE activity_id = ?)
       GROUP BY r.student_id, r.status ORDER BY s.full_name`
    ).bind(activityId));
    return c.json({
      success: true,
      data: {
        sessions: sessions.map((row) => ({ id: Number(row.id), title: row.title, date: row.session_date, status: row.status })),
        summary,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Reports (CSV export; the UI offers Excel/PDF on top)
  // -------------------------------------------------------------------------
  const REPORTS: Record<string, { permission: ClassPermission; sql: (classId: number) => string; header: string[] }> = {
    roster: {
      permission: 'view_roster',
      header: ['Full name', 'Index number', 'University ID', 'Phone', 'Gender', 'Email', 'Status'],
      sql: (classId) => `SELECT s.full_name, s.index_number, s.phone, s.gender, s.email, s.status
        FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id
        WHERE cm.class_id = ${classId} AND cm.status = 'active' ORDER BY s.full_name`,
    },
    assignments: {
      permission: 'generate_groups',
      header: ['Activity', 'Group', 'Student', 'Index number', 'Assigned via', 'Assigned at'],
      sql: (classId) => `SELECT a.name, COALESCE(g.name, 'Group ' || g.position), s.full_name, s.index_number, ga.assigned_via, ga.assigned_at
        FROM cgm_group_assignments ga
        JOIN cgm_activities a ON a.id = ga.activity_id
        JOIN cgm_groups g ON g.id = ga.group_id
        JOIN cgm_students s ON s.id = ga.student_id
        WHERE a.class_id = ${classId} AND ga.status = 'active' ORDER BY a.name, g.position, s.full_name`,
    },
    movements: {
      permission: 'generate_groups',
      header: ['Activity', 'Student', 'Action', 'From group', 'To group', 'Actor', 'Reason', 'When'],
      sql: (classId) => `SELECT a.name, s.full_name, e.action,
          (SELECT COALESCE(g1.name, 'Group ' || g1.position) FROM cgm_groups g1 WHERE g1.id = e.from_group_id),
          (SELECT COALESCE(g2.name, 'Group ' || g2.position) FROM cgm_groups g2 WHERE g2.id = e.to_group_id),
          e.actor_label, e.reason, e.created_at
        FROM cgm_assignment_events e
        JOIN cgm_activities a ON a.id = e.activity_id JOIN cgm_students s ON s.id = e.student_id
        WHERE a.class_id = ${classId} ORDER BY e.id DESC`,
    },
    leadership: {
      permission: 'appoint_leaders',
      header: ['Activity', 'Group', 'Student', 'Role', 'Method', 'Status', 'Started', 'Ended'],
      sql: (classId) => `SELECT a.name, COALESCE(g.name, 'Group ' || g.position), s.full_name, l.role, l.method, l.status, l.started_at, l.ended_at
        FROM cgm_leadership_appointments l
        JOIN cgm_activities a ON a.id = l.activity_id JOIN cgm_groups g ON g.id = l.group_id
        JOIN cgm_students s ON s.id = l.student_id
        WHERE a.class_id = ${classId} ORDER BY a.name, g.position`,
    },
    elections: {
      permission: 'manage_elections',
      header: ['Election', 'Group', 'Role', 'Status', 'Anonymity', 'Closed at'],
      sql: (classId) => `SELECT e.title, COALESCE(g.name, 'Group ' || g.position), e.role, e.status, e.anonymity, e.voting_close_at
        FROM cgm_elections e JOIN cgm_groups g ON g.id = e.group_id
        JOIN cgm_activities a ON a.id = e.activity_id
        WHERE a.class_id = ${classId} ORDER BY e.id DESC`,
    },
    activities: {
      permission: 'view_roster',
      header: ['Activity', 'Status', 'Groups', 'Assigned', 'Waiting', 'Active leaders'],
      sql: (classId) => `SELECT a.name, a.status,
        (SELECT COUNT(*) FROM cgm_groups g WHERE g.activity_id = a.id AND g.status = 'active'),
        (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.activity_id = a.id AND ga.status = 'active'),
        (SELECT COUNT(*) FROM cgm_activity_waitlist w WHERE w.activity_id = a.id AND w.status = 'waiting'),
        (SELECT COUNT(*) FROM cgm_leadership_appointments l WHERE l.activity_id = a.id AND l.status = 'active')
        FROM cgm_activities a WHERE a.class_id = ${classId} ORDER BY a.id`,
    },
    turnout: {
      permission: 'manage_elections',
      header: ['Election', 'Group', 'Eligible voters', 'Votes cast'],
      sql: (classId) => `SELECT e.title, COALESCE(g.name, 'Group ' || g.position),
          (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = e.group_id AND ga.status = 'active'),
          (SELECT COUNT(*) FROM cgm_election_participation p WHERE p.election_id = e.id)
        FROM cgm_elections e JOIN cgm_groups g ON g.id = e.group_id
        JOIN cgm_activities a ON a.id = e.activity_id
        WHERE a.class_id = ${classId} ORDER BY e.id DESC`,
    },
    attendance: {
      permission: 'manage_attendance',
      header: ['Session', 'Date', 'Activity', 'Student', 'Index number', 'Status', 'Corrected', 'Reason'],
      sql: (classId) => `SELECT sess.title, sess.session_date, a.name, s.full_name, s.index_number, r.status,
          CASE WHEN r.corrected_at IS NULL THEN 'no' ELSE 'yes' END, r.correction_reason
        FROM cgm_attendance_records r
        JOIN cgm_attendance_sessions sess ON sess.id = r.session_id
        JOIN cgm_activities a ON a.id = sess.activity_id
        JOIN cgm_students s ON s.id = r.student_id
        WHERE a.class_id = ${classId} ORDER BY sess.session_date DESC, s.full_name`,
    },
    pending: {
      permission: 'approve_memberships',
      header: ['Type', 'Who', 'Class', 'Submitted'],
      sql: (classId) => `SELECT 'Registration' AS type, re.full_name, cl.name, r.created_at
        FROM cgm_registration_requests r JOIN cgm_roster_entries re ON re.id = r.roster_entry_id JOIN cgm_classes cl ON cl.id = r.class_id
        WHERE r.class_id = ${classId} AND r.status = 'pending'
        UNION ALL
        SELECT 'Membership' AS type, s.full_name, cl.name, r.created_at
        FROM cgm_membership_requests r JOIN cgm_students s ON s.id = r.student_id JOIN cgm_classes cl ON cl.id = r.class_id
        WHERE r.class_id = ${classId} AND r.status = 'pending'`,
    },
    'organizer-actions': {
      permission: 'generate_reports',
      header: ['When', 'Actor', 'Action', 'Entity'],
      sql: (classId) => `SELECT created_at, actor_label, action, entity_type || '#' || COALESCE(entity_id, '')
        FROM cgm_audit WHERE class_id = ${classId} ORDER BY id DESC`,
    },
  };

  app.get('/api/cgm/classes/:id/reports/:kind', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const kind = String(c.req.param('kind'));
    const report = REPORTS[kind];
    if (!report) return bad(c, 'Unknown report.', 404);
    const guard = await requireClassPermission(c, member, classId, report.permission);
    if (!guard.ok) return guard.response;
    const sensitiveFields = kind === 'roster';
    const sensitive = member.isPhantom || guard.context.permissions.has('view_sensitive_profiles' as ClassPermission);
    let rows: any[];
    let sqlText = report.sql(classId);
    if (sensitiveFields && !sensitive) {
      sqlText = sqlText.replace('s.phone,', 'NULL,').replace('s.email,', 'NULL,');
    }
    rows = await asRows<any>(c.env.DB.prepare(sqlText));
    await auditCgm(c.env.DB, {
      actorType: member.isPhantom ? 'phantom' : 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.report.exported', entityType: 'class', entityId: classId, classId,
      context: { kind, format: String(c.req.query('format') || 'csv') },
    });
    const disposition = (extension: string) => `attachment; filename="code-rx-${kind}-${classId}.${extension}"`;
    const tableRows = rows.map((row) => Object.values(row));

    if (String(c.req.query('format')) === 'pdf') {
      const pdf = buildReportPdf(`${kind.charAt(0).toUpperCase()}${kind.slice(1)} report`,
        report.header, tableRows as string[][], `class #${classId} · ${member.name}`);
      return new Response(pdf as unknown as BodyInit, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition('pdf') },
      });
    }
    if (String(c.req.query('format')) === 'xlsx') {
      // The same ESM build the roster import uses; write() with type 'array'
      // stays inside the Workers runtime.
      // @ts-ignore -- xlsx/xlsx.mjs has no bundled declaration file.
      const XLSXLib = (await import('xlsx/xlsx.mjs')) as unknown as typeof import('xlsx');
      const sheet = XLSXLib.utils.aoa_to_sheet([report.header, ...tableRows]);
      const book = XLSXLib.utils.book_new();
      XLSXLib.utils.book_append_sheet(book, sheet, 'Report');
      const buffer = XLSXLib.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': disposition('xlsx'),
        },
      });
    }
    const csvEscape = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [report.header.join(','), ...tableRows.map((row) => (row as unknown[]).map(csvEscape).join(','))].join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': disposition('csv'),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Archives
  // -------------------------------------------------------------------------
  app.get('/api/cgm/classes/:id/archives', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'view_roster');
    if (!guard.ok) return guard.response;
    const activities = await asRows<any>(c.env.DB.prepare(
      `SELECT a.id, a.name, a.type, a.status, a.completed_at, a.archived_at, a.cancelled_reason,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.activity_id = a.id AND ga.status = 'active') AS assigned
       FROM cgm_activities a WHERE a.class_id = ? AND a.status IN ('completed','archived','cancelled')
       ORDER BY COALESCE(a.archived_at, a.completed_at) DESC LIMIT 100`
    ).bind(classId));
    const snapshots = await asRows<any>(c.env.DB.prepare(
      `SELECT sn.* FROM cgm_activity_snapshots sn JOIN cgm_activities a ON a.id = sn.activity_id
       WHERE a.class_id = ? ORDER BY sn.id DESC LIMIT 100`
    ).bind(classId));
    return c.json({
      success: true,
      data: {
        activities: activities.map((row) => ({
          id: Number(row.id), name: row.name, type: row.type, status: row.status,
          completedAt: row.completed_at, archivedAt: row.archived_at, cancelledReason: row.cancelled_reason,
          assignedCount: Number(row.assigned),
        })),
        snapshots: snapshots.map((row) => ({
          id: Number(row.id), activityId: Number(row.activity_id), kind: row.kind,
          createdAt: row.created_at, createdBy: row.created_by_label,
          payload: JSON.parse(row.payload_json || '{}'),
        })),
      },
    });
  });

  // -------------------------------------------------------------------------
  // PHANTOM oversight
  // -------------------------------------------------------------------------

  app.get('/api/cgm/phantom/overview', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const counts = await asRows<any>(c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM cgm_organizer_applications WHERE status IN ('pending','email_verified')) AS organizer_apps,
        (SELECT COUNT(*) FROM cgm_classes WHERE status = 'pending') AS classes_pending,
        (SELECT COUNT(*) FROM cgm_classes WHERE status = 'active') AS classes_active,
        (SELECT COUNT(*) FROM cgm_classes WHERE status IN ('suspended','rejected')) AS classes_blocked,
        (SELECT COUNT(*) FROM cgm_students WHERE status = 'active') AS students_active,
        (SELECT COUNT(*) FROM cgm_activities WHERE status IN ('open','published','active')) AS activities_live,
        (SELECT COUNT(*) FROM cgm_audit WHERE created_at > datetime('now', '-7 days')) AS audit_week`,
    ));
    const queues = await asRows<any>(c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM cgm_organizer_applications WHERE status IN ('pending','email_verified')) AS applications,
        (SELECT COUNT(*) FROM cgm_classes WHERE status = 'pending') AS classes,
        (SELECT COUNT(*) FROM cgm_profile_change_requests pcr JOIN cgm_students s ON s.id = pcr.student_id
           WHERE pcr.status = 'pending' AND pcr.field IN ('gender','index_number','phone')) AS sensitiveChanges,
        (SELECT COUNT(*) FROM cgm_announcement_reports WHERE status = 'open') AS disputes,
        (SELECT COUNT(*) FROM cgm_rechoose_requests WHERE status = 'pending') AS rechoose`
    ));
    const flag = await asRows<{ setting_value: string }>(c.env.DB.prepare(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'class_groups_enabled'"
    ));
    return c.json({
      success: true,
      data: {
        counters: counts[0] || {},
        queues: queues[0] || {},
        moduleEnabled: String(flag[0]?.setting_value ?? '1') === '1',
        email: emailConfigStatus(c.env),
      },
    });
  });

  /**
   * PHANTOM's attention board: what is waiting on a decision, per oversight
   * section, plus how much of it arrived since this operator last opened that
   * section (the tab badges). `pending` never clears by looking; `unseen` does.
   */
  app.get('/api/cgm/phantom/attention', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const board = await phantomAttentionBoard(c.env.DB, Number(check.member.profileId || 0));
    return c.json({ success: true, data: board });
  });

  app.post('/api/cgm/phantom/attention/:tab/seen', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const tab = clean(c.req.param('tab'), 40);
    const marked = await markPhantomTabSeen(c.env.DB, Number(check.member.profileId || 0), tab);
    if (!marked) return bad(c, 'Unknown oversight section.', 400);
    const board = await phantomAttentionBoard(c.env.DB, Number(check.member.profileId || 0));
    return c.json({ success: true, data: { ...marked, board } });
  });

  app.get('/api/cgm/phantom/organizer-applications', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const status = clean(c.req.query('status') || '', 20);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT a.*, u.name AS member_name, u.email FROM cgm_organizer_applications a
       LEFT JOIN member_profiles mp ON mp.id = a.member_profile_id
       LEFT JOIN users u ON u.id = a.user_id
       ${status ? 'WHERE a.status = ?' : ''} ORDER BY a.created_at DESC LIMIT 200`
    ).bind(...(status ? [status] : [])));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), name: row.member_name || row.name, email: row.email,
        institution: row.institution, motivation: row.motivation, status: row.status,
        emailVerified: Boolean(row.email_verified_at), reviewReason: row.review_reason,
        createdAt: row.created_at,
      })),
    });
  });

  const organizerApplicationAction = async (c: any, applicationId: number, action: string, reason: string | null) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const member = check.member;
    const rows = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM cgm_organizer_applications WHERE id = ?'
    ).bind(applicationId));
    const application = rows[0];
    if (!application) return bad(c, 'Application not found.', 404);
    const statusMap: Record<string, string> = {
      approve: 'approved', reject: 'rejected', correction: 'correction', suspend: 'suspended', reinstate: 'approved', revoke: 'revoked',
    };
    const status = statusMap[action];
    if (!status) return bad(c, 'Unknown action.', 400);
    if (['reject', 'correction'].includes(action) && !reason) return bad(c, 'Give the applicant a reason.');
    if (['suspend', 'revoke'].includes(action) && !reason) return bad(c, 'Record a reason for this decision.');
    await c.env.DB.prepare(
      `UPDATE cgm_organizer_applications SET status = ?, reviewed_by_profile_id = ?, reviewer_label = ?,
       review_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(status, member.profileId, member.name, reason, applicationId).run();

    // Suspension and revocation remove organizer powers everywhere, because
    // every class route re-reads the application status.
    if (['suspended', 'revoked', 'rejected'].includes(status) && application.member_profile_id) {
      await c.env.DB.prepare(
        `UPDATE cgm_class_organizers SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoked_by_label = ?
         WHERE member_profile_id = ? AND status = 'active'`
      ).bind(`PHANTOM (${member.name})`, Number(application.member_profile_id)).run();
    }
    // Reinstating restores every team seat the suspension revoked — otherwise
    // the organizer would be "approved" on paper with no class access at all.
    if (action === 'reinstate' && application.member_profile_id) {
      await c.env.DB.prepare(
        `UPDATE cgm_class_organizers SET status = 'active', revoked_at = NULL, revoked_by_label = NULL
         WHERE member_profile_id = ? AND status = 'revoked' AND revoked_by_label LIKE 'PHANTOM%'`
      ).bind(Number(application.member_profile_id)).run();
    }
    if (member.profileId) {
      await createNotification(c.env.DB, {
        title: `Organizer application ${status}`,
        message: `Your organizer application was ${status}${reason ? `: ${reason}` : '.'}`,
        audience: 'system', audienceLabel: 'Class & Groups',
        recipientProfileIds: [Number(application.member_profile_id || 0)].filter(Boolean),
      });
    }
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
      action: `cgm.organizer.${action}`, entityType: 'organizer_application', entityId: applicationId,
      context: { userId: Number(application.user_id), reason },
    });
    return c.json({ success: true });
  };

  app.post('/api/cgm/phantom/organizer-applications/:id/approve', async (c: any) => {
    const body = await readBody(c);
    return organizerApplicationAction(c, Number(c.req.param('id')), 'approve', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/organizer-applications/:id/reject', async (c: any) => {
    const body = await readBody(c);
    return organizerApplicationAction(c, Number(c.req.param('id')), 'reject', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/organizer-applications/:id/correction', async (c: any) => {
    const body = await readBody(c);
    return organizerApplicationAction(c, Number(c.req.param('id')), 'correction', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/organizer-applications/:id/suspend', async (c: any) => {
    const body = await readBody(c);
    return organizerApplicationAction(c, Number(c.req.param('id')), 'suspend', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/organizer-applications/:id/reinstate', async (c: any) => {
    const body = await readBody(c);
    return organizerApplicationAction(c, Number(c.req.param('id')), 'reinstate', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/organizer-applications/:id/revoke', async (c: any) => {
    const body = await readBody(c);
    return organizerApplicationAction(c, Number(c.req.param('id')), 'revoke', cleanOrNull(body.reason, 500));
  });

  app.get('/api/cgm/phantom/classes', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const status = clean(c.req.query('status') || '', 20);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT cl.*,
              (SELECT COUNT(*) FROM cgm_class_members m WHERE m.class_id = cl.id AND m.status = 'active') AS member_count,
              (SELECT COUNT(*) FROM cgm_activities a WHERE a.class_id = cl.id) AS activity_count
       FROM cgm_classes cl ${status ? 'WHERE cl.status = ?' : ''}
       ORDER BY cl.created_at DESC LIMIT 200`
    ).bind(...(status ? [status] : [])));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), code: row.code, name: row.name, institution: row.institution,
        status: row.status, createdAt: row.created_at, submittedAt: row.submitted_at,
        reviewReason: row.review_reason, memberCount: Number(row.member_count),
        activityCount: Number(row.activity_count), createdBy: row.created_by_label,
      })),
    });
  });

  const phantomClassAction = async (c: any, classId: number, action: string, reason: string | null) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const member = check.member;
    const rows = await asRows<any>(c.env.DB.prepare('SELECT * FROM cgm_classes WHERE id = ?').bind(classId));
    const klass = rows[0];
    if (!klass) return bad(c, 'Class not found.', 404);
    const statusMap: Record<string, string> = {
      approve: 'active', reject: 'rejected', correction: 'draft', suspend: 'suspended', reinstate: 'active', archive: 'archived',
    };
    const status = statusMap[action];
    if (!status) return bad(c, 'Unknown action.', 400);
    if (['reject', 'suspend'].includes(action) && !reason) return bad(c, 'Record a reason for this decision.');
    await c.env.DB.prepare(
      `UPDATE cgm_classes SET status = ?, reviewed_by_profile_id = ?, reviewer_label = ?, review_reason = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(status, member.profileId, member.name, reason, classId).run();
    const historyAction: Record<string, string> = {
      approve: 'approved', reject: 'rejected', correction: 'correction_requested',
      suspend: 'suspended', reinstate: 'reinstated', archive: 'archived',
    };
    await c.env.DB.prepare(
      `INSERT INTO cgm_class_approvals (class_id, action, actor_type, actor_label, reason) VALUES (?, ?, 'phantom', ?, ?)`
    ).bind(classId, historyAction[action] || action, member.name, reason).run();
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
      action: `cgm.class.${action}`, entityType: 'class', entityId: classId, classId, context: { reason },
    });
    return c.json({ success: true });
  };

  app.post('/api/cgm/phantom/classes/:id/approve', async (c: any) => {
    const body = await readBody(c);
    return phantomClassAction(c, Number(c.req.param('id')), 'approve', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/classes/:id/reject', async (c: any) => {
    const body = await readBody(c);
    return phantomClassAction(c, Number(c.req.param('id')), 'reject', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/classes/:id/correction', async (c: any) => {
    const body = await readBody(c);
    return phantomClassAction(c, Number(c.req.param('id')), 'correction', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/classes/:id/suspend', async (c: any) => {
    const body = await readBody(c);
    return phantomClassAction(c, Number(c.req.param('id')), 'suspend', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/classes/:id/reinstate', async (c: any) => {
    const body = await readBody(c);
    return phantomClassAction(c, Number(c.req.param('id')), 'reinstate', cleanOrNull(body.reason, 500));
  });
  app.post('/api/cgm/phantom/classes/:id/archive', async (c: any) => {
    const body = await readBody(c);
    return phantomClassAction(c, Number(c.req.param('id')), 'archive', cleanOrNull(body.reason, 500));
  });

  app.get('/api/cgm/phantom/classes/:id', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const classId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare('SELECT * FROM cgm_classes WHERE id = ?').bind(classId));
    const klass = rows[0];
    if (!klass) return bad(c, 'Class not found.', 404);
    const team = await asRows<any>(c.env.DB.prepare(
      `SELECT o.id, o.role, o.status, COALESCE(u.name, mu.name, 'Member') AS name FROM cgm_class_organizers o
       LEFT JOIN member_profiles mp ON mp.id = o.member_profile_id
       LEFT JOIN users u ON u.id = mp.user_id
       LEFT JOIN members mu ON mu.id = mp.member_record_id
       WHERE o.class_id = ? ORDER BY CASE o.role WHEN 'primary' THEN 0 ELSE 1 END`
    ).bind(classId));
    const approvals = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM cgm_class_approvals WHERE class_id = ? ORDER BY id DESC LIMIT 50'
    ).bind(classId));
    const counts = await asRows<any>(c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM cgm_class_members WHERE class_id = ? AND status = 'active') AS members,
        (SELECT COUNT(*) FROM cgm_activities WHERE class_id = ?) AS activities,
        (SELECT COUNT(*) FROM cgm_students s JOIN cgm_class_members m ON m.student_id = s.id WHERE m.class_id = ? AND s.status = 'active') AS students`
    ).bind(classId, classId, classId));
    return c.json({
      success: true,
      data: {
        class: {
          id: classId, code: klass.code, name: klass.name, institution: klass.institution,
          department: klass.department, academicYear: klass.academic_year, level: klass.level,
          description: klass.description, status: klass.status, createdAt: klass.created_at,
          reviewReason: klass.review_reason, createdBy: klass.created_by_label,
          settings: (() => { try { return JSON.parse(klass.settings_json || '{}'); } catch { return {}; } })(),
        },
        team: team.map((row) => ({ id: Number(row.id), role: row.role, status: row.status, name: row.name || 'Member' })),
        approvals: approvals.map((row) => ({
          id: Number(row.id), action: row.action, actor: row.actor_label, reason: row.reason, createdAt: row.created_at,
        })),
        counts: {
          members: Number(counts[0]?.members || 0), activities: Number(counts[0]?.activities || 0),
          students: Number(counts[0]?.students || 0),
        },
      },
    });
  });

  app.get('/api/cgm/phantom/audit', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const classId = c.req.query('classId') ? Number(c.req.query('classId')) : null;
    const action = clean(c.req.query('action'), 80);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_audit WHERE 1=1 ${classId ? 'AND class_id = ?' : ''} ${action ? 'AND action LIKE ?' : ''}
       ORDER BY id DESC LIMIT 200`
    ).bind(...(classId && action ? [classId, `%${action}%`] : classId ? [classId] : action ? [`%${action}%`] : [])));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), actorType: row.actor_type, actor: row.actor_label, action: row.action,
        entityType: row.entity_type, entityId: row.entity_id, classId: row.class_id, activityId: row.activity_id,
        context: (() => { try { return JSON.parse(row.context_json || '{}'); } catch { return {}; } })(),
        createdAt: row.created_at,
      })),
    });
  });

  app.post('/api/cgm/phantom/module', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const body = await readBody(c);
    const enabled = body.enabled === true;
    await c.env.DB.prepare(
      `INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ('class_groups_enabled', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`
    ).bind(enabled ? '1' : '0').run();
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: check.member.name, actorProfileId: check.member.profileId,
      action: enabled ? 'cgm.module.enabled' : 'cgm.module.paused', entityType: 'module', entityId: 'class_groups',
    });
    return c.json({ success: true, data: { enabled } });
  });

  app.post('/api/cgm/phantom/classes/:id/transfer', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const member = check.member;
    const classId = Number(c.req.param('id'));
    const body = await readBody(c);
    const targetProfileId = Number(body.toProfileId);
    if (!targetProfileId) return bad(c, 'Choose the new primary organizer.');
    const target = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_class_organizers WHERE class_id = ? AND member_profile_id = ? AND status = 'active'`
    ).bind(classId, targetProfileId));
    if (!target[0]) return bad(c, 'The new primary organizer must already be on the class team.', 400);
    const currentPrimary = await asRows<{ id: number; member_profile_id: number }>(c.env.DB.prepare(
      `SELECT id, member_profile_id FROM cgm_class_organizers WHERE class_id = ? AND role = 'primary' AND status = 'active'`
    ).bind(classId));
    if (currentPrimary[0]) {
      await c.env.DB.prepare(
        `UPDATE cgm_class_organizers SET role = 'co_organizer', permissions_json = ? WHERE id = ?`
      ).bind(JSON.stringify([]), Number(currentPrimary[0].id)).run();
    }
    await c.env.DB.prepare(
      `UPDATE cgm_class_organizers SET role = 'primary', permissions_json = '[]' WHERE id = ?`
    ).bind(Number(target[0].id)).run();
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.class.transfer_forced', entityType: 'class', entityId: classId, classId,
      context: { toProfileId: targetProfileId, fromProfileId: currentPrimary[0]?.member_profile_id || null },
    });
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // §30 — Re-choose requests (PHANTOM queue)
  // -------------------------------------------------------------------------

  app.get('/api/cgm/phantom/rechoose-requests', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    await ensureRechooseSchema(c.env.DB);
    const status = clean(c.req.query('status') || 'pending', 20);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, s.full_name AS student_name, s.index_number,
              COALESCE(g.name, 'Group ' || g.position) AS group_name,
              a.name AS activity_name, cl.name AS class_name, cl.code AS class_code
       FROM cgm_rechoose_requests r
       JOIN cgm_students s ON s.id = r.student_id
       JOIN cgm_activities a ON a.id = r.activity_id
       JOIN cgm_classes cl ON cl.id = a.class_id
       LEFT JOIN cgm_groups g ON g.id = r.group_id
       WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200`
    ).bind(status));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), studentName: row.student_name, indexNumber: row.index_number,
        groupName: row.group_name, activityName: row.activity_name,
        className: row.class_name, classCode: row.class_code,
        requestedVia: row.from_via, reason: row.reason, status: row.status,
        requesterLabel: row.requester_label, reviewerLabel: row.reviewer_label,
        reviewReason: row.review_reason, createdAt: row.created_at, reviewedAt: row.reviewed_at,
      })),
    });
  });

  const decideRechoose = async (c: any, approve: boolean): Promise<Response> => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const member = check.member;
    const id = Number(c.req.param('id'));
    await ensureRechooseSchema(c.env.DB);
    const body = await readBody(c);
    const reason = cleanOrNull(body.reason, 400);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, s.full_name AS student_name, a.name AS activity_name, a.class_id
       FROM cgm_rechoose_requests r
       JOIN cgm_students s ON s.id = r.student_id
       JOIN cgm_activities a ON a.id = r.activity_id
       WHERE r.id = ? AND r.status = 'pending'`
    ).bind(id));
    const request = rows[0];
    if (!request) return bad(c, 'Re-choose request not found or already reviewed.', 404);
    if (!approve) {
      await c.env.DB.prepare(
        `UPDATE cgm_rechoose_requests SET status = 'rejected', reviewed_by_profile_id = ?, reviewer_label = ?,
         review_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(member.profileId, `PHANTOM · ${member.name}`, reason, id).run();
      await notifyStudent(c.env.DB, Number(request.student_id), 'groups',
        'Re-choose not approved',
        reason || `Your organizer's request for you to choose your group again in ${request.activity_name} was not approved. You stay in your current group.`);
      await auditCgm(c.env.DB, {
        actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.rechoose.phantom_rejected', entityType: 'rechoose_request', entityId: id,
        classId: Number(request.class_id), activityId: Number(request.activity_id),
        context: { studentId: Number(request.student_id), reason },
      });
      return c.json({ success: true });
    }
    // Approval releases the seat and leaves the student free to choose again.
    // The assignment is retired (never deleted) so history stays intact.
    const activeAssignments = await asRows<any>(c.env.DB.prepare(
      `SELECT id, group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'`
    ).bind(Number(request.activity_id), Number(request.student_id)));
    for (const assignment of activeAssignments) {
      await c.env.DB.prepare(
        `UPDATE cgm_group_assignments SET status = 'removed', removed_at = CURRENT_TIMESTAMP,
         removal_reason = 're-choose approved by PHANTOM' WHERE id = ?`
      ).bind(Number(assignment.id)).run();
      await c.env.DB.prepare(
        `INSERT INTO cgm_assignment_events (activity_id, student_id, from_group_id, action, actor_label, reason)
         VALUES (?, ?, ?, 'removed', ?, 're-choose approved by PHANTOM')`
      ).bind(Number(request.activity_id), Number(request.student_id), Number(assignment.group_id),
        `PHANTOM · ${member.name}`).run();
      // A leader without a group cannot keep the seat.
      const leadership = await asRows<any>(c.env.DB.prepare(
        `SELECT id FROM cgm_leadership_appointments WHERE group_id = ? AND student_id = ? AND status = 'active'`
      ).bind(Number(assignment.group_id), Number(request.student_id)));
      for (const row of leadership) {
        await c.env.DB.prepare(
          `UPDATE cgm_leadership_appointments SET status = 'ended', ended_at = CURRENT_TIMESTAMP,
           end_reason = 'member re-choosing their group' WHERE id = ?`
        ).bind(Number(row.id)).run();
      }
    }
    await c.env.DB.prepare(
      `UPDATE cgm_rechoose_requests SET status = 'approved', reviewed_by_profile_id = ?, reviewer_label = ?,
       review_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(member.profileId, `PHANTOM · ${member.name}`, reason, id).run();
    await notifyStudent(c.env.DB, Number(request.student_id), 'groups',
      'You can choose your group again',
      `PHANTOM approved a fresh choice for you in ${request.activity_name}. Open the activity and pick your group again.`);
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.rechoose.phantom_approved', entityType: 'rechoose_request', entityId: id,
      classId: Number(request.class_id), activityId: Number(request.activity_id),
      context: { studentId: Number(request.student_id), released: activeAssignments.length, reason },
    });
    return c.json({ success: true });
  };

  app.post('/api/cgm/phantom/rechoose-requests/:id/approve', (c: any) => decideRechoose(c, true));

  app.post('/api/cgm/phantom/rechoose-requests/:id/reject', (c: any) => decideRechoose(c, false));

  // -------------------------------------------------------------------------
  // §30 — Sensitive profile changes (PHANTOM queue)
  // -------------------------------------------------------------------------

  app.get('/api/cgm/phantom/sensitive-changes', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const status = clean(c.req.query('status') || 'pending', 20);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT pcr.*, s.full_name AS student_name, s.index_number
       FROM cgm_profile_change_requests pcr JOIN cgm_students s ON s.id = pcr.student_id
       WHERE pcr.status = ? AND pcr.field IN ('gender','index_number','phone')
       ORDER BY pcr.created_at DESC LIMIT 200`
    ).bind(status));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), studentName: row.student_name, indexNumber: row.index_number,
        field: row.field, oldValue: row.old_value, newValue: row.new_value, reason: row.reason,
        status: row.status, createdAt: row.created_at, reviewedAt: row.reviewed_at,
        reviewerLabel: row.reviewer_label, reviewReason: row.review_reason,
      })),
    });
  });

  const decideSensitiveChange = async (c: any, approve: boolean): Promise<Response> => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const member = check.member;
    const id = Number(c.req.param('id'));
    const body = await readBody(c);
    const reason = cleanOrNull(body.reason, 400);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT pcr.*, s.full_name AS student_name FROM cgm_profile_change_requests pcr
       JOIN cgm_students s ON s.id = pcr.student_id
       WHERE pcr.id = ? AND pcr.status = 'pending'
         AND pcr.field IN ('gender','index_number','phone')`
    ).bind(id));
    const request = rows[0];
    if (!request) return bad(c, 'Sensitive change request not found or already reviewed.', 404);
    if (!approve) {
      await c.env.DB.prepare(
        `UPDATE cgm_profile_change_requests SET status = 'rejected', reviewed_by_profile_id = ?, reviewer_label = ?,
         review_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(member.profileId, `PHANTOM · ${member.name}`, reason, id).run();
      await notifyStudent(c.env.DB, Number(request.student_id), 'profile',
        'Profile change not approved', reason || `Your ${String(request.field).replace(/_/g, ' ')} change was not approved.`);
      await auditCgm(c.env.DB, {
        actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.profile_change.phantom_rejected', entityType: 'profile_change', entityId: id,
        context: { field: request.field },
      });
      return c.json({ success: true });
    }
    // Apply the reviewed value to the permanent identity.
    const field = String(request.field);
    const newValue = String(request.new_value ?? '');
    if (field === 'gender') {
      await c.env.DB.prepare('UPDATE cgm_students SET gender = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(['male', 'female', 'unknown'].includes(newValue) ? newValue : 'unknown', Number(request.student_id)).run();
    } else if (field === 'index_number') {
      await c.env.DB.prepare(
        'UPDATE cgm_students SET index_number = ?, index_number_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(newValue, lookupKey(newValue), Number(request.student_id)).run();
    } else if (field === 'phone') {
      await c.env.DB.prepare(
        'UPDATE cgm_students SET phone = ?, phone_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(newValue, phoneKey(newValue), Number(request.student_id)).run();
    }
    await c.env.DB.prepare(
      `UPDATE cgm_profile_change_requests SET status = 'approved', reviewed_by_profile_id = ?, reviewer_label = ?,
       review_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(member.profileId, `PHANTOM · ${member.name}`, reason, id).run();
    await notifyStudent(c.env.DB, Number(request.student_id), 'profile', 'Profile updated',
      `Your ${field.replace(/_/g, ' ')} change was approved and applied.`);
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.profile_change.phantom_approved', entityType: 'profile_change', entityId: id,
      context: { field, studentId: Number(request.student_id) },
    });
    return c.json({ success: true });
  };

  app.post('/api/cgm/phantom/sensitive-changes/:id/approve', (c: any) => decideSensitiveChange(c, true));

  app.post('/api/cgm/phantom/sensitive-changes/:id/reject', (c: any) => decideSensitiveChange(c, false));

  // -------------------------------------------------------------------------
  // §30 — Registration approval delegation
  // -------------------------------------------------------------------------

  app.get('/api/cgm/phantom/delegations', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT d.*, COALESCE(u.name, mu.name, 'Member') AS member_name, cl.name AS class_name, cl.code AS class_code
       FROM cgm_approval_delegations d
       LEFT JOIN member_profiles mp ON mp.id = d.member_profile_id
       LEFT JOIN users u ON u.id = mp.user_id
       LEFT JOIN members mu ON mu.id = mp.member_record_id
       LEFT JOIN cgm_classes cl ON cl.id = d.class_id
       ORDER BY d.created_at DESC LIMIT 200`
    ));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), memberId: Number(row.member_profile_id), memberName: row.member_name,
        classId: Number(row.class_id), className: row.class_name, classCode: row.class_code,
        maxBatch: row.max_batch === null ? null : Number(row.max_batch),
        approvalsUsed: Number(row.approvals_used || 0), status: row.status,
        grantedBy: row.granted_by_label, createdAt: row.created_at, revokedAt: row.revoked_at,
      })),
    });
  });

  app.post('/api/cgm/phantom/delegations', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const member = check.member;
    const body = await readBody(c);
    const memberId = Number(body.memberId);
    const classId = Number(body.classId);
    const maxBatch = body.maxBatch === undefined || body.maxBatch === null || body.maxBatch === '' ? null : Number(body.maxBatch);
    if (!memberId) return bad(c, 'Choose the member who may approve registrations.', 400);
    if (!classId) return bad(c, 'Choose the class.', 400);
    if (maxBatch !== null && (!Number.isFinite(maxBatch) || maxBatch < 1)) return bad(c, 'The approval cap must be at least 1.', 400);
    const target = await asRows<{ id: number }>(c.env.DB.prepare('SELECT id FROM member_profiles WHERE id = ?').bind(memberId));
    if (!target[0]) return bad(c, 'That member does not exist.', 404);
    const klass = await asRows<{ id: number }>(c.env.DB.prepare('SELECT id FROM cgm_classes WHERE id = ?').bind(classId));
    if (!klass[0]) return bad(c, 'That class does not exist.', 404);
    const existing = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_approval_delegations WHERE member_profile_id = ? AND class_id = ? AND status = 'active'`
    ).bind(memberId, classId));
    if (existing[0]) return bad(c, 'This member already holds an active delegation for the class.', 409);
    const inserted = await c.env.DB.prepare(
      `INSERT INTO cgm_approval_delegations (member_profile_id, class_id, granted_by_profile_id, granted_by_label, max_batch)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(memberId, classId, member.profileId, member.name, maxBatch).run();
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.delegation.granted', entityType: 'delegation',
      entityId: Number(inserted.meta.last_row_id), classId,
      context: { memberId, maxBatch },
    });
    return c.json({ success: true, data: { id: Number(inserted.meta.last_row_id) } });
  });

  app.post('/api/cgm/phantom/delegations/:id/revoke', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const member = check.member;
    const id = Number(c.req.param('id'));
    const row = await asRows<{ id: number; status: string }>(c.env.DB.prepare(
      'SELECT id, status FROM cgm_approval_delegations WHERE id = ?'
    ).bind(id));
    if (!row[0]) return bad(c, 'Delegation not found.', 404);
    if (row[0].status !== 'active') return bad(c, 'This delegation is already revoked.', 409);
    await c.env.DB.prepare(
      `UPDATE cgm_approval_delegations SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoked_by_label = ? WHERE id = ?`
    ).bind(member.name, id).run();
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.delegation.revoked', entityType: 'delegation', entityId: id,
    });
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // §30 — Organizer activity overview
  // -------------------------------------------------------------------------

  app.get('/api/cgm/phantom/organizer-activity', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT mp.id, COALESCE(u.name, '') AS name, u.email,
        (SELECT COUNT(DISTINCT co.class_id) FROM cgm_class_organizers co WHERE co.member_profile_id = mp.id AND co.status = 'active') AS classes_organized,
        (SELECT COUNT(*) FROM cgm_class_members cm JOIN cgm_class_organizers co2 ON co2.class_id = cm.class_id
           WHERE co2.member_profile_id = mp.id AND co2.status = 'active' AND cm.status = 'active') AS students_managed,
        (SELECT MAX(a.created_at) FROM cgm_audit a WHERE a.actor_profile_id = mp.id) AS last_action_at
       FROM member_profiles mp JOIN users u ON u.id = mp.user_id
       WHERE EXISTS (SELECT 1 FROM cgm_class_organizers co3 WHERE co3.member_profile_id = mp.id)
          OR EXISTS (SELECT 1 FROM cgm_organizer_applications oa WHERE oa.member_profile_id = mp.id AND oa.status = 'approved')
       ORDER BY last_action_at DESC NULLS LAST LIMIT 200`
    ));
    const statusRows = await asRows<{ member_profile_id: number; status: string }>(c.env.DB.prepare(
      `SELECT member_profile_id, status FROM cgm_organizer_applications
       WHERE status IN ('approved','suspended','revoked','correction') ORDER BY created_at DESC`
    ));
    const statuses = new Map<number, string>();
    for (const row of statusRows) if (!statuses.has(Number(row.member_profile_id))) statuses.set(Number(row.member_profile_id), row.status);
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), name: row.name, email: row.email,
        classesOrganized: Number(row.classes_organized || 0),
        studentsManaged: Number(row.students_managed || 0),
        lastActionAt: row.last_action_at,
        status: statuses.get(Number(row.id)) || 'active',
      })),
    });
  });

  // -------------------------------------------------------------------------
  // §30 — Disputes (reported announcements)
  // -------------------------------------------------------------------------

  app.get('/api/cgm/phantom/disputes', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, a.title, a.body, a.class_id, cl.name AS class_name
       FROM cgm_announcement_reports r JOIN cgm_announcements a ON a.id = r.announcement_id
       JOIN cgm_classes cl ON cl.id = a.class_id
       ORDER BY r.created_at DESC LIMIT 200`
    ));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), announcementId: Number(row.announcement_id), title: row.title,
        excerpt: String(row.body || '').slice(0, 160), className: row.class_name,
        reason: row.reason, status: row.status, createdAt: row.created_at,
      })),
    });
  });

  app.post('/api/cgm/phantom/disputes/:id/resolve', async (c: any) => {
    const check = await requireCgmPhantom(c);
    if (check.error) return check.error;
    const member = check.member;
    const id = Number(c.req.param('id'));
    const body = await readBody(c);
    const action = String(body.action || 'dismiss');
    const rows = await asRows<{ id: number; announcement_id: number; status: string }>(c.env.DB.prepare(
      'SELECT id, announcement_id, status FROM cgm_announcement_reports WHERE id = ?'
    ).bind(id));
    const report = rows[0];
    if (!report) return bad(c, 'Report not found.', 404);
    if (report.status !== 'open') return bad(c, 'This report is already resolved.', 409);
    if (action === 'remove') {
      await c.env.DB.prepare(`UPDATE cgm_announcements SET status = 'removed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(Number(report.announcement_id)).run();
    }
    await c.env.DB.prepare(`UPDATE cgm_announcement_reports SET status = 'resolved' WHERE id = ?`).bind(id).run();
    await auditCgm(c.env.DB, {
      actorType: 'phantom', actorLabel: member.name, actorProfileId: member.profileId,
      action: action === 'remove' ? 'cgm.dispute.resolved_removed' : 'cgm.dispute.resolved',
      entityType: 'announcement_report', entityId: id,
      classId: null,
      context: { announcementId: Number(report.announcement_id) },
    });
    return c.json({ success: true });
  });
};
