// Cloudflare Pages Functions - CODE Rx SOCIETY API
// Complete backend: D1 database, R2 storage, real auth (PBKDF2 + JWT),
// protected admin routes, validation, and rate limiting.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { ensureSchema } from './lib/schema';
import { bearerToken, hashPassword, verifyPassword, verifyToken, signToken, requireAuth, JwtPayload } from './lib/auth';
import {
  actorFromContext, allocateDocumentCode, allocateMemberCode, audit, getActor, hasVaultPermission,
  FOUNDING_CODENAMES, normalizeCodename, randomToken, requirePhantom,
  requireWebsitePermission, sha256Hex, VAULT_ACTIONS, VAULT_SECTION_SEEDS, VaultAction,
} from './lib/vault';
import { cleanStr, cleanEmail, cleanOptionalStr } from './lib/validate';
import { checkRateLimit } from './lib/rate-limit';
import { sendEmail } from './lib/email';
import { attachmentIdsFromBlocks, normalizeDocumentContent, normalizeTags, parseStoredDocumentContent, recordVaultActivity, syncDocumentTags } from './lib/vault-document';
import { adjustMemberScore, awardScoreRule, calcitoninLevel, type ScoreAdjustmentAction, type ScoreRuleKey } from './lib/score';
import { activeNotificationRecipients, canSendNotifications, createNotification, notifyMember } from './lib/notifications';
import { decryptVaultShareToken, encryptVaultShareToken } from './lib/share-token';

type AppEnv = { Bindings: Env; Variables: { user: JwtPayload; actor: Awaited<ReturnType<typeof getActor>> } };

const app = new Hono<AppEnv>();

const tokenRole = (value: unknown): JwtPayload['role'] =>
  value === 'phantom' || value === 'admin' ? value : 'member';

/** The frontend may use these flags for navigation only. Every write/read is
 * still authorized again by the Worker, never by this response. */
const publicActor = (actor: NonNullable<Awaited<ReturnType<typeof getActor>>>) => ({
  id: actor.userId,
  email: actor.email,
  name: actor.name,
  role: tokenRole(actor.userRole),
  isPhantom: actor.isPhantom,
  isWebsiteAdmin: actor.isWebsiteAdmin,
  memberCode: actor.memberCode,
  memberStatus: actor.memberStatus,
  codenamePath: actor.codenamePath,
  codename: actor.codename,
});

const dbRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

// Never derive security links from an incoming Host header. A configured
// SITE_URL is preferred; the known Pages URL is the safe fallback.
const publicSiteUrl = (env: Env) => {
  const configured = String(env.SITE_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(configured)
    ? configured
    : 'https://coderxsociety.pages.dev';
};

const publicVaultShareUrl = (env: Env, token: string) => `${publicSiteUrl(env)}/#vault-share?token=${encodeURIComponent(token)}`;

/**
 * Share tokens are hashed for public lookup. New links also retain an
 * encrypted copy so an authorized document owner can copy the exact link from
 * the Existing links list. Old rows created before this upgrade are one-way
 * hashes only and deliberately require an explicit replacement link.
 */
const recoverVaultShareUrl = async (env: Env, share: { id: number; token_hash: string; token_ciphertext?: string | null }) => {
  if (!share.token_ciphertext) return null;
  try {
    const token = await decryptVaultShareToken(share.token_ciphertext, env.JWT_SECRET);
    if (!/^[a-f0-9]{64}$/i.test(token) || await sha256Hex(token) !== share.token_hash) {
      console.warn('[code-rx] Vault share token recovery integrity check failed for share', share.id);
      return null;
    }
    return publicVaultShareUrl(env, token);
  } catch (error) {
    // Do not expose a cryptographic/key-rotation detail to clients. The owner
    // can intentionally replace the link, which invalidates the old token.
    console.warn('[code-rx] Vault share token recovery failed for share', share.id, error);
    return null;
  }
};

type FounderActor = NonNullable<Awaited<ReturnType<typeof getActor>>>;

const moveToRecycleBin = async (db: D1Database, actor: FounderActor | null, resourceType: string, resourceId: string | number, title: string, payload: unknown) => {
  const serialized = JSON.stringify(payload).slice(0, 250_000);
  const result = await db.prepare(
    'INSERT INTO recycle_bin_items (resource_type, resource_id, title, payload_json, deleted_by_user_id, deleted_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
  ).bind(resourceType.slice(0, 80), String(resourceId).slice(0, 120), title.slice(0, 240), serialized, actor?.userId ?? null).run();
  return Number(result.meta.last_row_id);
};

type CodenamePath = 'member' | 'custom_founding' | 'direct_founding';

// A normalized phone key makes +233..., 00233..., and a local 0XXXXXXXXX
// Ghanaian form resolve to the same existing account. It is a lookup only;
// the password and primary user email remain unchanged.
const phoneLoginKey = (value: unknown) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = `233${digits.slice(1)}`;
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
};

const codenamePathFrom = (value: unknown, roleCode: string): CodenamePath => {
  // A named direct assignment made by PHANTOM always wins. This is especially
  // important for Custom members: selecting GHOST/NEXUS/FALCON/QUANTUM/MATRIX
  // is a completed identity assignment, never a second founding ballot.
  if (value === 'direct_founding') return 'direct_founding';
  // Without an explicit direct assignment, Custom members use the protected
  // canonical founding-identity ballot only.
  if (roleCode === 'custom') return 'custom_founding';
  return 'member';
};

const poolForPath = (path: CodenamePath) => path === 'custom_founding' || path === 'direct_founding' ? 'founding' : 'member';

const ACTIVATION_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type MemberActivationInvite = {
  activationId: number;
  activationUrl: string;
  expiresAt: string;
  emailSent: boolean;
  deliveryStatus: 'sent' | 'manual_required';
};

/**
 * Creates a one-time password-setup invitation. The usable token deliberately
 * exists only in this request and the outgoing email; D1 keeps its SHA-256
 * hash. Reissuing an invitation revokes every earlier unused link first.
 */
const issueMemberActivationInvite = async ({
  env,
  actor,
  profileId,
  email,
  name,
  memberCode,
  roleName,
  event = 'member.activation_issued',
}: {
  env: Env;
  actor: FounderActor;
  profileId: number;
  email: string;
  name: string;
  memberCode: string;
  roleName: string;
  event?: 'member.activation_issued' | 'member.activation_regenerated';
}): Promise<MemberActivationInvite> => {
  const db = env.DB;
  await db.prepare(
    `UPDATE member_activations
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE member_profile_id = ? AND used_at IS NULL AND revoked_at IS NULL`
  ).bind(profileId).run();

  const rawToken = randomToken();
  const expiresAt = new Date(Date.now() + ACTIVATION_LINK_TTL_MS).toISOString();
  const created = await db.prepare(
    `INSERT INTO member_activations (member_profile_id, email, token_hash, expires_at, created_by_user_id, delivery_status)
     VALUES (?, ?, ?, ?, ?, 'not_sent')`
  ).bind(profileId, email, await sha256Hex(rawToken), expiresAt, actor.userId).run();
  const activationId = Number(created.meta.last_row_id);
  const activationUrl = `${publicSiteUrl(env)}/#activate?token=${rawToken}&email=${encodeURIComponent(email)}`;

  let emailSent = false;
  try {
    emailSent = await sendEmail(env, env.EMAILJS_TEMPLATE_ID_ACTIVATION || '', {
      to_email: email,
      member_name: name,
      member_code: memberCode,
      activation_link: activationUrl,
      role_name: roleName,
    });
  } catch (error) {
    // Mail delivery is optional. The PHANTOM response still receives a
    // one-time link to send securely, and no account setup is rolled back.
    console.error('[code-rx] activation invitation email error:', error);
  }

  const deliveryStatus: MemberActivationInvite['deliveryStatus'] = emailSent ? 'sent' : 'manual_required';
  try {
    await db.prepare(
      `UPDATE member_activations
       SET delivery_status = ?, sent_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = ?`
    ).bind(deliveryStatus, emailSent ? 1 : 0, activationId).run();
  } catch (error) {
    // The link remains valid even if non-critical delivery telemetry cannot be
    // updated. Do not ever discard the approved member because mail metadata
    // failed to save.
    console.error('[code-rx] activation delivery status update failed:', error);
  }

  await audit(db, actor, event, 'member_activation', activationId, {
    memberProfileId: profileId,
    memberCode,
    expiresAt,
    deliveryStatus,
  });
  return { activationId, activationUrl, expiresAt, emailSent, deliveryStatus };
};

const createMemberAccount = async ({
  env,
  actor,
  name,
  email,
  phone,
  roleCode,
  codenamePath,
  foundingCodenameId,
  applicationId,
  applicationReviewNote,
}: {
  env: Env;
  actor: FounderActor;
  name: string;
  email: string;
  phone: string | null;
  roleCode: string;
  codenamePath?: CodenamePath;
  foundingCodenameId?: number | null;
  applicationId?: number;
  applicationReviewNote?: string | null;
}) => {
  const db = env.DB;
  if (roleCode === 'phantom') throw new Error('PHANTOM identity cannot be assigned through member creation.');
  const roleRows = await dbRows<{ id: number; code: string; name: string }>(db.prepare('SELECT id, code, name FROM roles WHERE code = ?').bind(roleCode));
  const role = roleRows[0];
  if (!role) throw new Error('Choose a valid initial responsibility role.');
  if (codenamePath === 'custom_founding' && role.code !== 'custom') {
    throw new Error('Custom Founding Ballot is available only for the Custom responsibility profile.');
  }
  const effectiveCodenamePath = codenamePathFrom(codenamePath, role.code);
  if (effectiveCodenamePath === 'direct_founding' && (!Number.isInteger(foundingCodenameId) || Number(foundingCodenameId) < 1)) {
    throw new Error('Select one available founding codename for direct assignment.');
  }

  const existingUsers = await dbRows<{ id: number }>(db.prepare('SELECT id FROM users WHERE email = ?').bind(email));
  if (existingUsers[0]) throw new Error('An account already exists for this email. Review the member record instead.');
  const existingProfiles = await dbRows<{ id: number }>(db.prepare(
    `SELECT mp.id FROM member_profiles mp JOIN members m ON m.id = mp.member_record_id WHERE m.email = ?`
  ).bind(email));
  if (existingProfiles[0]) throw new Error('A member profile already exists for this email.');
  const existingMemberRows = await dbRows<{ id: number }>(db.prepare('SELECT id FROM members WHERE email = ?').bind(email));
  const normalizedPhone = phoneLoginKey(phone);
  if (phone && !normalizedPhone) throw new Error('Use a valid phone number for phone-number sign-in.');
  if (normalizedPhone) {
    const phoneOwners = await dbRows<{ id: number }>(db.prepare('SELECT id FROM members WHERE phone_login_key = ?').bind(normalizedPhone));
    if (phoneOwners[0] && Number(phoneOwners[0].id) !== Number(existingMemberRows[0]?.id || 0)) {
      throw new Error('Another member already uses this phone number for sign-in. Use a different phone number or correct that member record first.');
    }
  }

  // A sequence number is intentionally consumed even if a later validation or
  // storage failure occurs: Member IDs are permanent and are never reused.
  const memberCode = await allocateMemberCode(db);
  let userId: number | null = null;
  let memberRecordId: number | null = null;
  let createdMemberRecord = false;
  let profileId: number | null = null;
  let directClaimedCodenameId: number | null = null;
  let applicationLinked = false;
  try {
    const temporaryHash = await hashPassword(randomToken());
    const today = new Date().toISOString().slice(0, 10);
    const userResult = await db.prepare(
      "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'member')"
    ).bind(email, name, temporaryHash).run();
    userId = Number(userResult.meta.last_row_id);

    if (existingMemberRows[0]) {
      memberRecordId = Number(existingMemberRows[0].id);
      await db.prepare('UPDATE members SET name = ?, phone = ?, phone_login_key = ?, role = ?, level = ?, is_active = 0 WHERE id = ?')
        .bind(name, phone, normalizedPhone, role.code, calcitoninLevel(0).label, memberRecordId).run();
    } else {
      const memberResult = await db.prepare(
        'INSERT INTO members (name, email, phone, phone_login_key, role, joined_date, points, level, is_active) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)'
      ).bind(name, email, phone, normalizedPhone, role.code, today, calcitoninLevel(0).label).run();
      memberRecordId = Number(memberResult.meta.last_row_id);
      createdMemberRecord = true;
    }

    const profileResult = await db.prepare(
      `INSERT INTO member_profiles (user_id, member_record_id, member_code, status, primary_role_id, codename_path, created_by_user_id)
       VALUES (?, ?, ?, 'pending_activation', ?, ?, ?)`
    ).bind(userId, memberRecordId, memberCode, role.id, effectiveCodenamePath, actor.userId).run();
    profileId = Number(profileResult.meta.last_row_id);

    if (effectiveCodenamePath === 'direct_founding') {
      const assignment = await db.prepare(
        `UPDATE codenames
         SET status = 'claimed', claimed_by_member_profile_id = ?, claimed_at = CURRENT_TIMESTAMP, reserved_note = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND pool = 'founding' AND status = 'available' AND claimed_by_member_profile_id IS NULL`
      ).bind(profileId, foundingCodenameId).run();
      if (Number(assignment.meta.changes || 0) !== 1) throw new Error('That founding codename is no longer available. Choose another one.');
      directClaimedCodenameId = foundingCodenameId || null;
      const codeRows = await dbRows<any>(db.prepare('SELECT display_name FROM codenames WHERE id = ?').bind(foundingCodenameId));
      await db.batch([
        db.prepare(
          `INSERT INTO codename_selection_sessions (member_profile_id, status, pool, assignment_source, passes_used, claimed_codename_id, current_codename_id, ballot_slots_json, revealed_codenames_json, review_target_count, completed_at)
           VALUES (?, 'completed', 'founding', 'phantom_direct', 0, ?, NULL, '[]', '[]', 0, CURRENT_TIMESTAMP)`
        ).bind(profileId, foundingCodenameId),
        db.prepare("INSERT INTO codename_history (codename_id, member_profile_id, event_type, acted_by_user_id, note) VALUES (?, ?, 'claimed', ?, ?)")
          .bind(foundingCodenameId, profileId, actor.userId, 'Direct founding codename assignment by PHANTOM'),
      ]);
      await audit(db, actor, 'codename.phantom_assigned', 'codename', foundingCodenameId || null, { memberCode, codename: codeRows[0]?.display_name || null });
    }

    if (applicationId) {
      const linked = await db.prepare(
        `UPDATE applications
         SET status = 'approved', member_profile_id = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP,
             review_note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND member_profile_id IS NULL AND status != 'rejected'`
      ).bind(profileId, actor.userId, cleanOptionalStr(applicationReviewNote, 2000), applicationId).run();
      if (Number(linked.meta.changes || 0) !== 1) throw new Error('This application was already linked to another member or can no longer be approved.');
      applicationLinked = true;
      await audit(db, actor, 'application.approved_invited', 'application', applicationId, { memberProfileId: profileId, memberCode, role: role.code });
    }

    await audit(db, actor, 'member.created', 'member_profile', profileId, {
      memberCode,
      email,
      role: role.code,
      codenamePath: effectiveCodenamePath,
      directFoundingCodenameId: effectiveCodenamePath === 'direct_founding' ? foundingCodenameId : null,
      applicationId: applicationId || null,
      status: 'pending_activation',
    });
    const activation = await issueMemberActivationInvite({
      env,
      actor,
      profileId,
      email,
      name,
      memberCode,
      roleName: role.name,
    });

    return {
      profileId,
      userId,
      memberRecordId,
      memberCode,
      activationUrl: activation.activationUrl,
      activationExpiresAt: activation.expiresAt,
      activationEmailSent: activation.emailSent,
      activationDeliveryStatus: activation.deliveryStatus,
      role: role.code,
      codenamePath: effectiveCodenamePath,
    };
  } catch (error) {
    // Compensate incomplete account rows. The sequence remains consumed by
    // design, preserving the no-reuse member-ID rule.
    try {
      if (applicationId && applicationLinked && profileId) {
        await db.prepare(
          "UPDATE applications SET status = 'pending', member_profile_id = NULL, reviewed_by_user_id = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_profile_id = ?"
        ).bind(applicationId, profileId).run();
      }
      if (profileId) await db.prepare('DELETE FROM member_activations WHERE member_profile_id = ?').bind(profileId).run();
      if (profileId && directClaimedCodenameId) {
        await db.prepare("UPDATE codenames SET status = 'available', claimed_by_member_profile_id = NULL, claimed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND claimed_by_member_profile_id = ?")
          .bind(directClaimedCodenameId, profileId).run();
        await db.prepare('DELETE FROM codename_selection_sessions WHERE member_profile_id = ?').bind(profileId).run();
        await db.prepare('DELETE FROM codename_history WHERE codename_id = ? AND member_profile_id = ? AND note = ?').bind(directClaimedCodenameId, profileId, 'Direct founding codename assignment by PHANTOM').run();
      }
      if (profileId) await db.prepare('DELETE FROM member_profiles WHERE id = ?').bind(profileId).run();
      if (memberRecordId && createdMemberRecord) await db.prepare('DELETE FROM members WHERE id = ?').bind(memberRecordId).run();
      if (userId) await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    } catch (cleanupError) {
      console.error('[code-rx] member creation cleanup error:', cleanupError);
    }
    throw error;
  }
};

const memberCreationErrorStatus = (message: string) => {
  if (/already exists|profile already exists|already linked|no longer be approved|rejected applications|already uses this phone/i.test(message)) return 409;
  if (/valid|choose|select|custom founding|cannot be assigned/i.test(message)) return 400;
  return 500;
};

const ballotPoolFor = (actor: FounderActor) => actor.codenamePath === 'custom_founding' ? 'founding' : 'member';
const ballotModeFor = (actor: FounderActor) => actor.codenamePath === 'custom_founding' ? 'custom_founding' : 'member';
const ballotLabelFor = (pool: 'member' | 'founding') => pool === 'founding' ? 'Founding Name Ballot' : 'Member Code Name Ballot';

const getCodenameSession = async (db: D1Database, profileId: number, pool: 'member' | 'founding') => {
  let rows = await dbRows<any>(db.prepare('SELECT * FROM codename_selection_sessions WHERE member_profile_id = ?').bind(profileId));
  if (!rows[0]) {
    await db.prepare("INSERT INTO codename_selection_sessions (member_profile_id, status, pool, assignment_source, passes_used) VALUES (?, 'open', ?, 'ballot', 0)").bind(profileId, pool).run();
    rows = await dbRows<any>(db.prepare('SELECT * FROM codename_selection_sessions WHERE member_profile_id = ?').bind(profileId));
  } else if (rows[0].status === 'open' && (rows[0].pool !== pool || rows[0].assignment_source !== 'ballot')) {
    // A PHANTOM role change can legitimately move an unclaimed member between
    // the member and founding ballots. Resetting only an open session keeps
    // completed identities permanent while preventing mixed-pool attempts.
    await db.prepare(
      "UPDATE codename_selection_sessions SET pool = ?, assignment_source = 'ballot', passes_used = 0, claimed_codename_id = NULL, current_codename_id = NULL, ballot_slots_json = '[]', revealed_codenames_json = '[]', review_target_count = 3, started_at = CURRENT_TIMESTAMP, completed_at = NULL WHERE id = ?"
    ).bind(pool, rows[0].id).run();
    rows = await dbRows<any>(db.prepare('SELECT * FROM codename_selection_sessions WHERE member_profile_id = ?').bind(profileId));
  }
  return rows[0] || null;
};

const parseSessionCodenameIds = (value: unknown): number[] => {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
  } catch { return []; }
};

const parseBallotSlots = (value: unknown): Array<number | null> => {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const id = Number(item);
      return Number.isInteger(id) && id > 0 ? id : null;
    });
  } catch { return []; }
};

// Custom members are deliberately restricted to the six canonical founding
// identities. PHANTOM is permanently claimed, so it naturally never appears
// in an available ballot; a claimed GHOST/NEXUS/etc. is likewise excluded.
const CANONICAL_FOUNDING_NORMALIZED = FOUNDING_CODENAMES.map((name) => normalizeCodename(name));

const eligibleBallotCodenames = async (db: D1Database, pool: 'member' | 'founding') => {
  if (pool === 'founding') {
    return dbRows<any>(db.prepare(
      `SELECT c.id, c.display_name, c.pool, c.status
       FROM codenames c
       WHERE c.pool = ? AND c.status = 'available'
         AND c.normalized_name IN (${CANONICAL_FOUNDING_NORMALIZED.map(() => '?').join(',')})
       ORDER BY RANDOM()`
    ).bind(pool, ...CANONICAL_FOUNDING_NORMALIZED));
  }
  return dbRows<any>(db.prepare(
    `SELECT c.id, c.display_name, c.pool, c.status
     FROM codenames c
     WHERE c.pool = ? AND c.status = 'available'
     ORDER BY RANDOM()`
  ).bind(pool));
};

/**
 * Creates stable, covered card positions for an open ballot. The browser is
 * given only position numbers; the codename IDs stay in D1 until a card is
 * deliberately opened. Existing old one-at-a-time sessions migrate naturally:
 * their current selection becomes the first revealed comparison choice.
 */
const ensureWideBallotSession = async (db: D1Database, session: any, pool: 'member' | 'founding') => {
  let slots = parseBallotSlots(session.ballot_slots_json);
  let revealed = parseSessionCodenameIds(session.revealed_codenames_json);
  const legacyCurrent = Number(session.current_codename_id || 0);
  if (legacyCurrent > 0 && !revealed.includes(legacyCurrent)) revealed = [legacyCurrent, ...revealed];

  // A Custom/founding ballot must never retain a legacy or administrator-added
  // founding name outside the canonical six. It also removes names claimed by
  // another member before the browser can see them.
  const foundingCandidates = pool === 'founding' ? await eligibleBallotCodenames(db, pool) : null;
  if (pool === 'founding') {
    const allowedIds = new Set((foundingCandidates || []).map((candidate) => Number(candidate.id)));
    slots = slots.filter((id): id is number => Boolean(id) && allowedIds.has(Number(id)));
    revealed = revealed.filter((id) => allowedIds.has(id));
  }

  if (!slots.length) {
    const candidates = foundingCandidates || await eligibleBallotCodenames(db, pool);
    slots = candidates.map((candidate) => Number(candidate.id));
    if (legacyCurrent > 0 && pool !== 'founding' && !slots.includes(legacyCurrent)) slots.unshift(legacyCurrent);
  }
  const slotSet = new Set(slots.filter((id): id is number => Boolean(id)));
  revealed = revealed.filter((id) => slotSet.has(id));
  const target = Math.min(3, slots.filter((id): id is number => Boolean(id)).length);
  const changed = String(session.ballot_slots_json || '[]') !== JSON.stringify(slots)
    || String(session.revealed_codenames_json || '[]') !== JSON.stringify(revealed)
    || Number(session.review_target_count || 3) !== target
    || legacyCurrent > 0;
  if (changed) {
    await db.prepare(
      "UPDATE codename_selection_sessions SET ballot_slots_json = ?, revealed_codenames_json = ?, review_target_count = ?, current_codename_id = NULL WHERE id = ?"
    ).bind(JSON.stringify(slots), JSON.stringify(revealed), target, session.id).run();
  }
  return { ...session, ballot_slots_json: JSON.stringify(slots), revealed_codenames_json: JSON.stringify(revealed), review_target_count: target, current_codename_id: null };
};

const wideBallotPresentation = async (db: D1Database, session: any, pool: 'member' | 'founding') => {
  const prepared = await ensureWideBallotSession(db, session, pool);
  const slots = parseBallotSlots(prepared.ballot_slots_json);
  let revealedIds = parseSessionCodenameIds(prepared.revealed_codenames_json);
  const ids = [...new Set(slots.filter((id): id is number => Boolean(id)))];
  const rows = ids.length ? await dbRows<any>(db.prepare(
    `SELECT id, display_name, pool, status FROM codenames WHERE id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids)) : [];
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  // A concurrently claimed codename cannot stay in a member's comparison
  // group. Its card becomes covered/unavailable so another visible card can be
  // reviewed before the final choice.
  const activeRevealed = revealedIds.filter((id) => {
    const row = byId.get(id);
    return row?.pool === pool && row?.status === 'available';
  });
  if (activeRevealed.length !== revealedIds.length) {
    revealedIds = activeRevealed;
    await db.prepare('UPDATE codename_selection_sessions SET revealed_codenames_json = ? WHERE id = ?')
      .bind(JSON.stringify(revealedIds), prepared.id).run();
  }
  const availableSlots = slots.filter((id) => {
    const row = id ? byId.get(id) : null;
    return Boolean(row && row.pool === pool && row.status === 'available');
  }).length;
  const reviewTarget = Math.min(Number(prepared.review_target_count || 0), availableSlots);
  const slotsView = slots.map((id, index) => {
    const row = id ? byId.get(id) : null;
    const available = Boolean(row && row.pool === pool && row.status === 'available');
    if (!available) return { slot: index + 1, state: 'unavailable' as const };
    if (revealedIds.includes(id!)) return { slot: index + 1, state: 'revealed' as const, codename: { id: row.id, display_name: row.display_name } };
    return { slot: index + 1, state: 'covered' as const };
  });
  const revealedChoices = slotsView.filter((slot) => slot.state === 'revealed').map((slot: any) => slot.codename);
  const exhausted = reviewTarget === 0;
  return {
    session: { ...prepared, revealed_codenames_json: JSON.stringify(revealedIds), review_target_count: reviewTarget },
    slots: slotsView,
    revealedChoices,
    reviewTarget,
    exhausted,
    readyToChoose: reviewTarget > 0 && revealedChoices.length >= reviewTarget,
  };
};

const vaultSection = async (db: D1Database, slug: string) => {
  const rows = await dbRows<any>(db.prepare('SELECT * FROM vault_sections WHERE slug = ? AND is_archived = 0').bind(slug));
  return rows[0] || null;
};

const requireActiveActor = async (c: any) => {
  const actor = await actorFromContext(c);
  if (!actor || !actor.profileId) return { actor: null, response: c.json({ success: false, error: 'Member profile not found' }, 404) };
  if (!actor.isPhantom && actor.memberStatus !== 'active') {
    return { actor: null, response: c.json({ success: false, error: 'An active member account is required' }, 403) };
  }
  return { actor, response: null };
};

/**
 * Legacy Admin Core endpoints predate delegated Website Admin permissions.
 * Keep their established admin-only behavior, but always resolve the current
 * profile so a locked or archived legacy admin cannot continue using a JWT
 * issued before PHANTOM changed the account status.
 */
const requireActiveLegacyAdmin = async (c: any, next: () => Promise<void>) => {
  const actor = await actorFromContext(c);
  if (!actor || !actor.profileId) return c.json({ success: false, error: 'Account not found' }, 404);
  if (actor.memberStatus !== 'active') return c.json({ success: false, error: 'This administrator account is not active' }, 403);
  if (!actor.isPhantom && actor.userRole !== 'admin') return c.json({ success: false, error: 'Admin access required' }, 403);
  await next();
};

type CommunityPublicIdentity =
  | { kind: 'guest'; id: number; actorKey: string; handle: string; status: string }
  | { kind: 'member'; id: number; actorKey: string; handle: string; actor: FounderActor };

const COMMUNITY_GUEST_HEADER = 'X-Code-Rx-Community-Guest';
const COMMUNITY_ROLE_RANK: Record<string, number> = { member: 0, moderator: 1, admin: 2, owner: 3 };
const COMMUNITY_MEDIA_TYPES = new Set(['image', 'video', 'document', 'pdf', 'audio', 'other']);

const communityPublicIdentity = async (c: any): Promise<CommunityPublicIdentity | null> => {
  const memberToken = bearerToken(c);
  if (memberToken) {
    const payload = await verifyToken(memberToken, c.env.JWT_SECRET);
    if (payload) {
      const actor = await getActor(c.env.DB, Number(payload.sub));
      if (actor?.profileId && (actor.isPhantom || actor.memberStatus === 'active')) {
        return { kind: 'member', id: actor.profileId, actorKey: `member:${actor.profileId}`, handle: actor.codename || actor.memberCode || 'Code Rx Member', actor };
      }
    }
  }
  const token = cleanStr(c.req.header(COMMUNITY_GUEST_HEADER), 32, 160);
  if (!token) return null;
  const rows = await dbRows<any>(c.env.DB.prepare(
    "SELECT id, public_handle, status FROM community_guest_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP"
  ).bind(await sha256Hex(token)));
  const guest = rows[0];
  if (!guest || guest.status !== 'active') return null;
  await c.env.DB.prepare('UPDATE community_guest_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').bind(guest.id).run();
  return { kind: 'guest', id: Number(guest.id), actorKey: `guest:${guest.id}`, handle: guest.public_handle, status: guest.status };
};

const communityConversationMember = async (db: D1Database, conversationId: number, profileId: number) => {
  const rows = await dbRows<any>(db.prepare(
    `SELECT cm.*, c.type, c.status AS conversation_status, c.owner_member_profile_id, c.join_mode, c.pinned_message_id, c.telegram_sync_enabled
     FROM community_conversation_members cm
     JOIN community_conversations c ON c.id = cm.conversation_id
     WHERE cm.conversation_id = ? AND cm.member_profile_id = ? AND cm.membership_status = 'active'`
  ).bind(conversationId, profileId));
  return rows[0] || null;
};

const communityCanManage = (member: any, actor: FounderActor, minimum: 'moderator' | 'admin' | 'owner' = 'moderator') => actor.isPhantom || Number(COMMUNITY_ROLE_RANK[member?.role || 'member'] || 0) >= COMMUNITY_ROLE_RANK[minimum];

const communityConversationSummary = async (db: D1Database, conversationId: number, actor: FounderActor) => {
  const member = await communityConversationMember(db, conversationId, actor.profileId!);
  if (!member) return null;
  const rows = await dbRows<any>(db.prepare(
    `SELECT c.id, c.type, c.title, c.description, c.image_key, c.join_mode, c.status, c.owner_member_profile_id, c.pinned_message_id, c.telegram_sync_enabled,
       cm.role, cm.muted_until, cm.last_read_message_id, cm.last_read_at,
       (SELECT body FROM community_messages m WHERE m.conversation_id = c.id AND m.status = 'active' ORDER BY m.id DESC LIMIT 1) AS latest_body,
       (SELECT created_at FROM community_messages m WHERE m.conversation_id = c.id AND m.status = 'active' ORDER BY m.id DESC LIMIT 1) AS latest_at,
       (SELECT COUNT(*) FROM community_messages unread WHERE unread.conversation_id = c.id AND unread.status = 'active' AND unread.id > COALESCE(cm.last_read_message_id, 0) AND unread.sender_member_profile_id != ?) AS unread_count,
       (SELECT COUNT(*) FROM community_conversation_members gm WHERE gm.conversation_id = c.id AND gm.membership_status = 'active') AS member_count
     FROM community_conversations c JOIN community_conversation_members cm ON cm.conversation_id = c.id
     WHERE c.id = ? AND cm.member_profile_id = ?`
  ).bind(actor.profileId, conversationId, actor.profileId));
  const summary = rows[0];
  if (!summary) return null;
  if (summary.type === 'dm') {
    const peerRows = await dbRows<any>(db.prepare(
      `SELECT mp.id, mp.member_code, c.display_name AS codename
       FROM community_conversation_members cm JOIN member_profiles mp ON mp.id = cm.member_profile_id
       LEFT JOIN codenames c ON c.claimed_by_member_profile_id = mp.id AND c.status = 'claimed'
       WHERE cm.conversation_id = ? AND cm.member_profile_id != ? AND cm.membership_status = 'active'`
    ).bind(conversationId, actor.profileId));
    const peer = peerRows[0];
    summary.title = peer?.codename || peer?.member_code || 'Direct message';
    summary.peer_profile_id = peer?.id || null;
  }
  return { ...summary, member_count: Number(summary.member_count || 0), unread_count: Number(summary.unread_count || 0) };
};

const communityMentionHandles = (body: string) => [...new Set(Array.from(body.matchAll(/@([A-Za-z0-9._-]{2,50})/g), (match) => match[1].toLowerCase()))];

const communityMediaPolicy = async (db: D1Database, area: 'private' | 'public_forum' | 'public_chat', mediaType: string, groupId?: number | null) => {
  const keys = ['global', area, ...(groupId ? [`group:${groupId}`] : [])];
  const rows = await dbRows<any>(db.prepare(
    `SELECT * FROM community_media_settings WHERE scope_key IN (${keys.map(() => '?').join(',')}) AND media_type IN ('all', ?)`
  ).bind(...keys, mediaType));
  const ordered = [
    ['global', 'all'], ['global', mediaType], [area, 'all'], [area, mediaType],
    ...(groupId ? [[`group:${groupId}`, 'all'], [`group:${groupId}`, mediaType]] : []),
  ];
  const globalMaster = rows.find((item) => item.scope_key === 'global' && item.media_type === 'all');
  // The global all-media switch is a true safety master switch. Area and group
  // overrides can narrow or permit categories only after PHANTOM enables it.
  if (globalMaster && Number(globalMaster.enabled) !== 1) return { enabled: false, maxBytes: Number(globalMaster.max_bytes || 0), allowedMimes: [], storageLimitBytes: Number(globalMaster.storage_limit_bytes || 0) };
  let enabled = false;
  let maxBytes = 0;
  let allowedMimes: string[] = [];
  let storageLimitBytes = 0;
  for (const [scopeKey, type] of ordered) {
    const row = rows.find((item) => item.scope_key === scopeKey && item.media_type === type);
    if (!row) continue;
    enabled = Number(row.enabled) === 1;
    if (Number(row.max_bytes || 0) > 0) maxBytes = Number(row.max_bytes);
    if (Number(row.storage_limit_bytes || 0) > 0) storageLimitBytes = Number(row.storage_limit_bytes);
    try { const parsed = JSON.parse(row.allowed_mimes_json || '[]'); if (Array.isArray(parsed) && parsed.length) allowedMimes = parsed.map(String); } catch { /* ignore invalid legacy setting */ }
  }
  return { enabled, maxBytes, allowedMimes, storageLimitBytes };
};

const communityMediaTypeFor = (name: string, mime: string) => {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  if (mime.startsWith('image/') && ['jpg','jpeg','png','webp','gif'].includes(extension)) return 'image';
  if (mime.startsWith('video/') && ['mp4','webm','mov'].includes(extension)) return 'video';
  if (mime.startsWith('audio/') && ['mp3','wav','ogg','m4a'].includes(extension)) return 'audio';
  if (mime === 'application/pdf' && extension === 'pdf') return 'pdf';
  if (['txt','doc','docx','csv','md'].includes(extension) && ['text/plain','text/csv','text/markdown','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mime)) return 'document';
  return null;
};

const TELEGRAM_MEDIA_SYNC_MAX_BYTES = 20 * 1024 * 1024;

type CommunityTelegramDeliveryPlan = {
  enabled: boolean;
  targets: string[];
};

type CommunityAttachmentSyncResult = {
  synced: boolean;
  deleted: boolean;
  attempted: boolean;
  error?: string;
};

const telegramApi = async (env: Env, method: string, payload: Record<string, unknown>) => {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    return await response.json() as any;
  } catch { return null; }
};

/** Sends a private R2 object to Telegram without making its R2 key or a public
 * download URL visible to Telegram, the browser, or D1. The deliberately
 * conservative cap keeps Pages Functions memory use and Telegram file limits
 * within a Free-plan-safe range. */
const telegramDocumentApi = async (env: Env, chatId: string, caption: string, name: string, mimeType: string, bytes: ArrayBuffer) => {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return null;
  try {
    const form = new FormData();
    form.set('chat_id', chatId);
    if (caption) form.set('caption', caption.slice(0, 1024));
    form.set('document', new Blob([bytes], { type: mimeType || 'application/octet-stream' }), name);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form });
    if (!response.ok) return null;
    const payload = await response.json() as any;
    return payload?.ok && payload?.result?.message_id !== undefined ? payload : null;
  } catch { return null; }
};

const communityTelegramDeliveryPlan = async (db: D1Database, conversationId: number, senderProfileId: number): Promise<CommunityTelegramDeliveryPlan> => {
  const conversationRows = await dbRows<any>(db.prepare('SELECT type, telegram_sync_enabled, telegram_chat_id FROM community_conversations WHERE id = ?').bind(conversationId));
  const conversation = conversationRows[0];
  if (!conversation || Number(conversation.telegram_sync_enabled) !== 1) return { enabled: false, targets: [] };
  const targets: string[] = [];
  if (conversation.type === 'group' && conversation.telegram_chat_id) targets.push(String(conversation.telegram_chat_id));
  if (conversation.type === 'dm') {
    const rows = await dbRows<any>(db.prepare(
      `SELECT tl.telegram_chat_id FROM community_conversation_members cm
       JOIN community_telegram_links tl ON tl.member_profile_id = cm.member_profile_id AND tl.disconnected_at IS NULL
       WHERE cm.conversation_id = ? AND cm.membership_status = 'active' AND cm.member_profile_id != ?`
    ).bind(conversationId, senderProfileId));
    targets.push(...rows.map((row) => String(row.telegram_chat_id)));
  }
  return { enabled: true, targets: [...new Set(targets.filter(Boolean))] };
};

const communityTelegramAutoDeleteAfterSyncEnabled = async (db: D1Database) => {
  const rows = await dbRows<any>(db.prepare(
    "SELECT telegram_auto_delete_after_sync FROM community_media_settings WHERE scope_type = 'global' AND scope_key = 'global' AND media_type = 'all' LIMIT 1"
  ));
  return Number(rows[0]?.telegram_auto_delete_after_sync || 0) === 1;
};

const recordTelegramMessageLink = async (db: D1Database, messageId: number, chatId: string, telegramMessageId: string) => {
  await db.prepare(
    "INSERT OR IGNORE INTO community_telegram_message_links (message_id, telegram_chat_id, telegram_message_id, direction) VALUES (?, ?, ?, 'website_to_telegram')"
  ).bind(messageId, chatId, telegramMessageId).run();
};

const syncCommunityMessageToTelegram = async (env: Env, db: D1Database, messageId: number, conversationId: number, senderProfileId: number, text: string) => {
  if (!String(env.TELEGRAM_BOT_TOKEN || '').trim()) return { synced: 0, targets: 0 };
  const plan = await communityTelegramDeliveryPlan(db, conversationId, senderProfileId);
  if (!plan.enabled || !plan.targets.length) return { synced: 0, targets: 0 };
  let synced = 0;
  for (const chatId of plan.targets) {
    const sent = await telegramApi(env, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
    const telegramMessageId = sent?.result?.message_id;
    if (telegramMessageId !== undefined) {
      await recordTelegramMessageLink(db, messageId, chatId, String(telegramMessageId));
      synced += 1;
    }
  }
  return { synced, targets: plan.targets.length };
};

const setCommunityAttachmentSyncState = async (db: D1Database, attachmentId: number, status: string, error: string | null = null) => {
  await db.prepare(
    `UPDATE community_message_attachments
     SET telegram_sync_status = ?, telegram_sync_error = ?,
         telegram_synced_at = CASE WHEN ? = 'synced' THEN CURRENT_TIMESTAMP ELSE telegram_synced_at END
     WHERE id = ? AND status = 'active'`
  ).bind(status, error ? error.slice(0, 500) : null, status, attachmentId).run();
};

const removeTelegramSyncedAttachment = async (env: Env, db: D1Database, attachment: any, actor: FounderActor | null) => {
  try {
    await env.BUCKET.delete(String(attachment.r2_key));
    await db.prepare(
      "UPDATE community_message_attachments SET status = 'deleted', telegram_sync_status = 'synced', telegram_synced_at = COALESCE(telegram_synced_at, CURRENT_TIMESTAMP), telegram_sync_error = NULL WHERE id = ? AND status = 'active'"
    ).bind(attachment.id).run();
    await audit(db, actor, 'community.attachment.telegram_synced_deleted', 'community_attachment', attachment.id, { messageId: attachment.message_id, conversationId: attachment.conversation_id, sizeBytes: Number(attachment.size_bytes || 0) });
    return true;
  } catch (error) {
    await setCommunityAttachmentSyncState(db, Number(attachment.id), 'synced_pending_delete', 'Telegram confirmed delivery but local R2 cleanup needs a retry.');
    console.warn('[code-rx] Telegram-synced Community attachment cleanup failed:', error);
    return false;
  }
};

/**
 * Mirrors a website-originated attachment only to the explicitly configured
 * Telegram target(s). When PHANTOM enables auto-delete, the R2 object is
 * removed only after every target has returned a Telegram message ID.
 */
const syncCommunityAttachmentToTelegram = async (
  env: Env,
  db: D1Database,
  attachment: any,
  message: any,
  senderName: string,
  actor: FounderActor | null,
  deleteAfterSync: boolean,
): Promise<CommunityAttachmentSyncResult> => {
  const attachmentId = Number(attachment.id);
  if (!attachmentId || attachment.status !== 'active') return { synced: false, deleted: false, attempted: false, error: 'This attachment is no longer available.' };

  if (attachment.telegram_sync_status === 'synced_pending_delete') {
    const deleted = deleteAfterSync ? await removeTelegramSyncedAttachment(env, db, attachment, actor) : false;
    return { synced: true, deleted, attempted: false, error: deleted || !deleteAfterSync ? undefined : 'Telegram confirmed delivery, but local cleanup needs a retry.' };
  }

  if (!String(env.TELEGRAM_BOT_TOKEN || '').trim()) {
    if (deleteAfterSync) await setCommunityAttachmentSyncState(db, attachmentId, 'failed', 'Telegram bot configuration is unavailable.');
    return { synced: false, deleted: false, attempted: false, error: 'Telegram media sync is not configured.' };
  }
  const plan = await communityTelegramDeliveryPlan(db, Number(message.conversation_id), Number(message.sender_member_profile_id));
  if (!plan.enabled || !plan.targets.length) {
    if (deleteAfterSync) await setCommunityAttachmentSyncState(db, attachmentId, 'failed', 'This conversation does not have an active Telegram target.');
    return { synced: false, deleted: false, attempted: false, error: 'This chat does not have an active Telegram sync target.' };
  }
  if (Number(attachment.size_bytes || 0) > TELEGRAM_MEDIA_SYNC_MAX_BYTES) {
    await setCommunityAttachmentSyncState(db, attachmentId, 'failed', 'The attachment exceeds the safe Telegram sync limit.');
    return { synced: false, deleted: false, attempted: false, error: `This file exceeds the ${Math.round(TELEGRAM_MEDIA_SYNC_MAX_BYTES / 1024 / 1024)} MB Telegram sync limit.` };
  }

  const deliveredRows = await dbRows<any>(db.prepare(
    "SELECT telegram_chat_id FROM community_telegram_message_links WHERE message_id = ? AND direction = 'website_to_telegram'"
  ).bind(Number(message.id)));
  const delivered = new Set(deliveredRows.map((row) => String(row.telegram_chat_id)));
  const remainingTargets = plan.targets.filter((chatId) => !delivered.has(chatId));

  if (remainingTargets.length) {
    const object = await env.BUCKET.get(String(attachment.r2_key));
    if (!object) {
      await setCommunityAttachmentSyncState(db, attachmentId, 'failed', 'The local attachment object could not be read for Telegram sync.');
      return { synced: false, deleted: false, attempted: true, error: 'The local attachment object is unavailable for Telegram sync.' };
    }
    const bytes = await object.arrayBuffer();
    const captionText = String(message.body || '').trim();
    const caption = `${senderName}: ${captionText || `Sent a ${String(attachment.media_type || 'media')} file.`}`.slice(0, 1024);
    await setCommunityAttachmentSyncState(db, attachmentId, 'pending');
    let failed = false;
    for (const chatId of remainingTargets) {
      const sent = await telegramDocumentApi(env, chatId, caption, String(attachment.original_name || 'code-rx-media'), String(attachment.mime_type || 'application/octet-stream'), bytes);
      const telegramMessageId = sent?.result?.message_id;
      if (telegramMessageId === undefined) {
        failed = true;
        continue;
      }
      await recordTelegramMessageLink(db, Number(message.id), chatId, String(telegramMessageId));
    }
    if (failed) {
      await setCommunityAttachmentSyncState(db, attachmentId, 'failed', 'Telegram did not confirm delivery to every configured target.');
      await audit(db, actor, 'community.attachment.telegram_sync_failed', 'community_attachment', attachmentId, { messageId: message.id, conversationId: message.conversation_id });
      return { synced: false, deleted: false, attempted: true, error: 'Telegram did not confirm this media delivery. The local file was retained safely.' };
    }
  }

  await setCommunityAttachmentSyncState(db, attachmentId, 'synced');
  await audit(db, actor, 'community.attachment.telegram_synced', 'community_attachment', attachmentId, { messageId: message.id, conversationId: message.conversation_id, autoDeleted: deleteAfterSync });
  if (!deleteAfterSync) return { synced: true, deleted: false, attempted: true };
  const deleted = await removeTelegramSyncedAttachment(env, db, attachment, actor);
  return { synced: true, deleted, attempted: true, error: deleted ? undefined : 'Telegram confirmed delivery, but local cleanup needs a retry.' };
};

const communityFileSignatureValid = async (file: File, mediaType: string) => {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (mediaType === 'image') {
    if (file.type === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47);
    if (file.type === 'image/jpeg') return starts(0xff, 0xd8, 0xff);
    if (file.type === 'image/gif') return starts(0x47, 0x49, 0x46, 0x38);
    if (file.type === 'image/webp') return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (mediaType === 'pdf') return starts(0x25, 0x50, 0x44, 0x46);
  // Office/text/audio/video formats vary; their MIME + extension are still
  // checked server-side and executable extensions are never admitted.
  return mediaType === 'document' || mediaType === 'audio' || mediaType === 'video';
};

const vaultAccess = async (c: any, slug: string, action: VaultAction) => {
  const access = await requireActiveActor(c);
  if (access.response) return { actor: null, section: null, response: access.response };
  const section = await vaultSection(c.env.DB, slug);
  if (!section) return { actor: null, section: null, response: c.json({ success: false, error: 'Vault section not found' }, 404) };
  if (!await hasVaultPermission(c.env.DB, access.actor, slug, action)) {
    return { actor: null, section: null, response: c.json({ success: false, error: 'You are not authorized for this Vault action' }, 403) };
  }
  return { actor: access.actor, section, response: null };
};

const DOCUMENT_STATUSES = new Set(['draft', 'in_review', 'approved', 'active', 'archived']);
const ACTIVE_DOCUMENT_STATUSES = new Set(['draft', 'in_review', 'approved', 'active']);
const SHARE_EXPIRY_DAYS = new Set([1, 7, 30, 90]);
const documentStatus = (value: unknown, fallback = 'draft') => {
  const status = cleanOptionalStr(value, 30)?.toLowerCase().replace(/\s+/g, '_');
  return status && DOCUMENT_STATUSES.has(status) ? status : fallback;
};
const requestedDocumentStatus = (value: unknown) => cleanOptionalStr(value, 30)?.toLowerCase().replace(/\s+/g, '_') || null;
const documentProjectId = (value: unknown) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

/** A document, task, or meeting may only link to an active Project the actor can view. */
const validateActiveProjectReference = async (db: D1Database, actor: FounderActor, projectId: number | null) => {
  if (!projectId) return null;
  if (!await hasVaultPermission(db, actor, 'projects', 'view')) {
    return { status: 403, error: 'Projects view permission is required before linking a project.' };
  }
  const rows = await dbRows<{ id: number; is_archived: number }>(
    db.prepare('SELECT id, is_archived FROM vault_projects WHERE id = ?').bind(projectId)
  );
  if (!rows[0]) return { status: 404, error: 'Linked Vault project was not found.' };
  if (Number(rows[0].is_archived) === 1) return { status: 409, error: 'Restore the linked Vault project before using it.' };
  return null;
};

const documentTags = async (db: D1Database, documentId: number) => {
  const tags = await dbRows<any>(db.prepare(
    `SELECT t.id, t.normalized_name, t.display_name FROM vault_tags t
     JOIN vault_document_tags dt ON dt.tag_id = t.id WHERE dt.document_id = ? ORDER BY t.display_name`
  ).bind(documentId));
  return tags.map((tag) => tag.display_name);
};
const documentAttachments = async (db: D1Database, documentId: number) => dbRows<any>(db.prepare(
  'SELECT id, name, file_key, mime_type, size_bytes, created_at FROM vault_attachments WHERE document_id = ? ORDER BY created_at DESC'
).bind(documentId));

const settingValue = async (db: D1Database, key: string, fallback = '') => {
  const rows = await dbRows<{ setting_value: string }>(db.prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?').bind(key));
  return rows[0]?.setting_value ?? fallback;
};

const sharingCapability = async (db: D1Database, actor: FounderActor) => {
  const [sharingSetting, downloadSetting] = await Promise.all([
    settingValue(db, 'vault_sharing_enabled', '0'),
    settingValue(db, 'vault_downloads_enabled', '0'),
  ]);
  const globalEnabled = sharingSetting === '1';
  const downloadsGloballyEnabled = downloadSetting === '1';
  if (actor.isPhantom) return {
    globalEnabled,
    memberEnabled: true,
    canShare: globalEnabled,
    downloadsGloballyEnabled,
    memberDownloadEnabled: true,
    canDownload: downloadsGloballyEnabled,
    canManageGlobalDownloads: true,
  };
  if (!actor.profileId || actor.memberStatus !== 'active') return {
    globalEnabled,
    memberEnabled: false,
    canShare: false,
    downloadsGloballyEnabled,
    memberDownloadEnabled: false,
    canDownload: false,
    canManageGlobalDownloads: false,
  };
  const rows = await dbRows<{ can_share: number; can_download: number }>(db.prepare(
    'SELECT can_share, can_download FROM member_share_permissions WHERE member_profile_id = ?'
  ).bind(actor.profileId));
  const memberEnabled = Number(rows[0]?.can_share || 0) === 1;
  const memberDownloadEnabled = Number(rows[0]?.can_download || 0) === 1;
  return {
    globalEnabled,
    memberEnabled,
    canShare: globalEnabled && memberEnabled,
    downloadsGloballyEnabled,
    memberDownloadEnabled,
    canDownload: downloadsGloballyEnabled && memberDownloadEnabled,
    canManageGlobalDownloads: false,
  };
};

type ShareDownloadStatus = 'available' | 'link_disabled' | 'global_paused' | 'creator_permission_disabled';

const shareDownloadStatus = (share: { allow_download?: number | boolean | null; creator_role_code?: string | null; creator_status?: string | null; can_download?: number | boolean | null }, downloadsGloballyEnabled: boolean): ShareDownloadStatus => {
  if (Number(share.allow_download || 0) !== 1) return 'link_disabled';
  if (!downloadsGloballyEnabled) return 'global_paused';
  const creatorCanDownload = share.creator_role_code === 'phantom'
    || (share.creator_status === 'active' && Number(share.can_download || 0) === 1);
  return creatorCanDownload ? 'available' : 'creator_permission_disabled';
};

const sharedDownloadMessage = (status: ShareDownloadStatus) => {
  if (status === 'link_disabled') return 'This document was shared for reading only. Download and print were not enabled for this link.';
  if (status === 'global_paused') return 'Download and print are temporarily unavailable. Ask the document owner to enable them.';
  if (status === 'creator_permission_disabled') return 'Download and print are temporarily unavailable for this shared document.';
  return '';
};

const awardAutomaticScore = async ({
  db,
  memberProfileId,
  ruleKey,
  referenceType,
  referenceId,
  actor,
  reason,
  metadata,
}: {
  db: D1Database;
  memberProfileId: number | null | undefined;
  ruleKey: ScoreRuleKey;
  referenceType: string;
  referenceId: string | number;
  actor: FounderActor | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}) => {
  try {
    const result = await awardScoreRule(db, { memberProfileId, ruleKey, referenceType, referenceId, actor, reason, metadata });
    if (!result) return null;
    await notifyMember(
      db,
      result.memberProfileId,
      'Calcitonins earned',
      `You earned ${result.delta} CAL for ${result.label}. Your Calcitonin balance is now ${result.balance} CAL (${result.level.label}).`,
      actor,
    );
    await audit(db, actor, 'member.score.automatic_award', 'member_profile', result.memberProfileId, {
      ruleKey,
      referenceType,
      referenceId,
      delta: result.delta,
      balance: result.balance,
    });
    return result;
  } catch (error) {
    // Scoring and its notification enrich an already-completed action. Never
    // turn a successful activation, document, or project operation into a false error.
    console.error('[code-rx] automatic score award error:', error);
    return null;
  }
};

const escapeExportHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const printableDocumentHtml = (document: any, sectionTitle = 'Code Rx Vault') => {
  const parsed = parseStoredDocumentContent(document.content_json, document.content || '');
  const blocks = parsed.blocks.map((block: any) => {
    const rich = block.content || '';
    if (block.type === 'heading') {
      const level = [1, 2, 3].includes(Number(block.level)) ? Number(block.level) : 2;
      return `<h${level}>${rich}</h${level}>`;
    }
    if (block.type === 'paragraph') return `<p>${rich}</p>`;
    if (block.type === 'quote') return `<blockquote>${rich}</blockquote>`;
    if (block.type === 'callout') return `<aside class="callout">${rich}</aside>`;
    if (block.type === 'bulletList' || block.type === 'numberedList' || block.type === 'checklist') {
      const tag = block.type === 'numberedList' ? 'ol' : 'ul';
      const items = (block.items || []).map((item: any) => `<li${item.checked ? ' class="checked"' : ''}>${item.text || ''}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    if (block.type === 'code') return `<pre><code>${escapeExportHtml(block.content || '')}</code></pre>`;
    if (block.type === 'table') return `<table>${(block.rows || []).map((row: string[]) => `<tr>${row.map((cell) => `<td>${cell || ''}</td>`).join('')}</tr>`).join('')}</table>`;
    if (block.type === 'divider') return '<hr />';
    if (block.type === 'formula') return `<pre class="formula">${escapeExportHtml(block.content || '')}</pre>`;
    if (block.type === 'embed') return rich ? `<p>${rich}</p>` : '';
    // Attachments are intentionally excluded from document exports. They stay
    // behind their own Vault authorization flow.
    return '';
  }).join('\n');
  const created = document.created_at ? new Date(document.created_at).toLocaleString() : '—';
  const updated = document.updated_at ? new Date(document.updated_at).toLocaleString() : '—';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeExportHtml(document.document_code || document.title || 'Code Rx Vault document')}</title><style>
    :root{color-scheme:light} body{margin:0;background:#f6faf7;color:#173128;font:16px/1.7 Inter,Arial,sans-serif} main{max-width:900px;margin:0 auto;background:#fff;padding:54px 64px;box-shadow:0 8px 32px rgba(15,50,35,.08)} .kicker{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#16834e;font-weight:800}.meta{color:#62756b;font-size:13px;border-bottom:1px solid #dcebe1;padding-bottom:20px;margin-bottom:32px} h1{font-size:34px;line-height:1.2;margin:10px 0 18px;color:#173128} h2{margin-top:34px;color:#173128} h3{margin-top:26px;color:#235c40} p{margin:14px 0} blockquote{margin:22px 0;border-left:4px solid #48ae76;background:#edf9f1;padding:14px 18px;color:#24523d}.callout{margin:22px 0;border:1px solid #bfe7cd;background:#f4fcf6;padding:16px 18px;border-radius:10px} pre{overflow:auto;background:#f1f6f3;border:1px solid #d9e9df;padding:16px;border-radius:10px;color:#173128}.formula{background:#f7f4ff;border-color:#e6ddff} table{width:100%;border-collapse:collapse;margin:22px 0} td{border:1px solid #d9e9df;padding:10px;vertical-align:top} li.checked{text-decoration:line-through;color:#7d8d84}@media print{body{background:#fff}main{box-shadow:none;max-width:none;padding:28px} }
  </style></head><body><main><p class="kicker">Code Rx Vault · ${escapeExportHtml(sectionTitle)}</p><h1>${escapeExportHtml(document.title || 'Untitled document')}</h1><p class="meta">${escapeExportHtml(document.document_code || 'Vault document')} · Created ${escapeExportHtml(created)} · Updated ${escapeExportHtml(updated)}</p>${blocks}</main></body></html>`;
};

const downloadFilename = (document: any) => {
  const base = String(document.document_code || document.title || 'code-rx-vault-document').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'code-rx-vault-document';
  return `${base}.html`;
};

const documentDownloadResponse = (document: any, sectionTitle?: string) => new Response(printableDocumentHtml(document, sectionTitle), {
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Disposition': `attachment; filename="${downloadFilename(document)}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});


// ---------- CORS (same-origin is the norm; allow local dev + pages.dev) ----------
app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    try {
      const host = new URL(origin).hostname;
      if (host === 'localhost' || host.endsWith('.pages.dev') || host === '127.0.0.1') return origin;
    } catch { /* ignore */ }
    return '';
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Ensure schema (once per isolate) before any API request
app.use('/api/*', async (c, next) => {
  try {
    await ensureSchema(c.env);
  } catch (e) {
    const d1BindingPresent = Boolean(c.env.DB && typeof c.env.DB.prepare === 'function');
    console.error('[code-rx] ensureSchema failed:', { d1BindingPresent, error: e });
    return c.json({
      success: false,
      // Keep operational detail in the server log. Members receive a clear
      // next step rather than database or deployment terminology.
      error: d1BindingPresent
        ? 'Code Rx is temporarily preparing your secure workspace. Please try again in a moment.'
        : 'Code Rx is temporarily unavailable. Please try again shortly.',
    }, 500);
  }
  await next();
});

// ---------- Health ----------
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'code-rx-api' });
});

// ============================================
// 🔐 AUTH
// ============================================

// Login (rate limited: 10/min per IP)
app.post('/api/auth/login', async (c) => {
  if (!checkRateLimit(c, 10, 60)) {
    return c.json({ success: false, error: 'Too many login attempts. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    // `email` remains accepted for older clients. New clients use `identifier`
    // so a member may sign in with their email, saved phone number, or claimed
    // Code Name while still using the same single password/account.
    const identifier = cleanStr(body.identifier ?? body.email, 2, 254);
    const password = cleanStr(body.password, 1, 128);
    if (!identifier || !password) {
      return c.json({ success: false, error: 'Email, phone number, or Code Name and password are required.' }, 400);
    }
    const email = cleanEmail(identifier);
    const phoneKey = phoneLoginKey(identifier);
    const codename = normalizeCodename(identifier);
    const users = await dbRows<any>(c.env.DB.prepare(
      `SELECT DISTINCT u.*
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       LEFT JOIN members m ON m.id = mp.member_record_id
       LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
       WHERE u.email = ? OR m.phone_login_key = ? OR code.normalized_name = ?
       LIMIT 3`
    ).bind(email || '__no_email_match__', phoneKey || '__no_phone_match__', codename));
    // A legacy duplicated phone number must not become an account-selection
    // side channel. PHANTOM can correct duplicate phone data; login stays
    // safely generic until then.
    if (users.length !== 1) {
      return c.json({ success: false, error: 'Invalid email, phone number, Code Name, or password.' }, 401);
    }
    const user = users[0];

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return c.json({ success: false, error: 'Invalid email, phone number, Code Name, or password.' }, 401);
    }

    const actor = await getActor(c.env.DB, Number(user.id));
    if (!actor) return c.json({ success: false, error: 'Account profile could not be loaded' }, 403);
    if (actor.memberStatus === 'locked') {
      return c.json({ success: false, error: 'This member account is locked. Please contact PHANTOM.' }, 403);
    }
    if (actor.memberStatus === 'archived') {
      return c.json({ success: false, error: 'This member account is archived.' }, 403);
    }
    if (actor.memberStatus === 'pending_activation') {
      return c.json({ success: false, error: 'Complete your account activation before signing in.' }, 403);
    }

    // Pages dashboard variables are separate from local wrangler variables.
    // Fail clearly when the production JWT secret was not configured instead
    // of returning the unhelpful generic login 500.
    const jwtSecret = String(c.env.JWT_SECRET || '').trim();
    if (!jwtSecret) {
      console.error('[code-rx] login configuration error: JWT_SECRET is missing');
      return c.json({ success: false, error: 'Authentication is not configured. Please contact the administrator.' }, 503);
    }

    const token = await signToken({ sub: String(user.id), email: user.email, role: tokenRole(user.role) }, jwtSecret);
    return c.json({
      success: true,
      token,
      user: publicActor(actor),
    });
  } catch (e) {
    console.error('[code-rx] login error:', e);
    return c.json({ success: false, error: 'Login failed. Please try again.' }, 500);
  }
});

// Self-registration is intentionally disabled. Existing accounts keep working;
// new accounts are created only by PHANTOM after a Join application review.
app.post('/api/auth/register', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many attempts. Please wait a minute.' }, 429);
  }
  return c.json({
    success: false,
    error: 'Public account creation is disabled. Please use JOIN CODE Rx and wait for membership approval.',
  }, 403);
});

// Current user (valid token required)
app.get('/api/auth/me', requireAuth, async (c) => {
  const actor = await getActor(c.env.DB, Number(c.get('user').sub));
  if (!actor) return c.json({ success: false, error: 'User not found' }, 404);
  if (actor.memberStatus === 'locked' || actor.memberStatus === 'archived') {
    return c.json({ success: false, error: 'This member account is not active' }, 403);
  }
  return c.json({ success: true, user: publicActor(actor) });
});

// Account activation is the only way a newly approved member sets their
// first password. PHANTOM never receives or stores that permanent password.
app.post('/api/auth/activate', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many activation attempts. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const token = cleanStr(body.token, 32, 128);
    const password = cleanStr(body.password, 8, 128);
    if (!email || !token || !password) {
      return c.json({ success: false, error: 'Email, activation token, and a password of at least 8 characters are required.' }, 400);
    }
    const tokenHash = await sha256Hex(token);
    const rows = await dbRows<any>(c.env.DB.prepare(
      `SELECT a.*, mp.user_id, mp.id AS profile_id, mp.status, u.id AS user_id_check
       FROM member_activations a
       JOIN member_profiles mp ON mp.id = a.member_profile_id
       JOIN users u ON u.id = mp.user_id
       WHERE a.email = ? AND a.token_hash = ? AND a.revoked_at IS NULL`
    ).bind(email, tokenHash));
    const activation = rows[0];
    if (!activation || activation.used_at) {
      return c.json({ success: false, error: 'This invitation link is invalid, already used, or has been replaced. Ask PHANTOM to send a new one.' }, 400);
    }
    if (new Date(activation.expires_at).getTime() < Date.now()) {
      return c.json({ success: false, error: 'This activation link has expired. Ask PHANTOM for a new activation link.' }, 400);
    }
    if (activation.status !== 'pending_activation') {
      return c.json({ success: false, error: 'This account is not awaiting activation.' }, 400);
    }

    const passwordHash = await hashPassword(password);
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, activation.user_id),
      c.env.DB.prepare("UPDATE member_profiles SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(activation.profile_id),
      c.env.DB.prepare('UPDATE members SET is_active = 1 WHERE id = (SELECT member_record_id FROM member_profiles WHERE id = ?)').bind(activation.profile_id),
      c.env.DB.prepare('UPDATE member_activations SET revoked_at = CURRENT_TIMESTAMP WHERE member_profile_id = ? AND id != ? AND used_at IS NULL AND revoked_at IS NULL').bind(activation.profile_id, activation.id),
      c.env.DB.prepare('UPDATE member_activations SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(activation.id),
    ]);
    const actor = await getActor(c.env.DB, Number(activation.user_id));
    if (!actor) return c.json({ success: false, error: 'Activation completed but the account profile could not be loaded.' }, 500);
    await audit(c.env.DB, actor, 'member.activated', 'member_profile', activation.profile_id, { email });
    await awardAutomaticScore({
      db: c.env.DB,
      memberProfileId: actor.profileId,
      ruleKey: 'member.activated',
      referenceType: 'member_activation',
      referenceId: activation.id,
      actor,
      metadata: { email },
    });
    const jwtSecret = String(c.env.JWT_SECRET || '').trim();
    if (!jwtSecret) return c.json({ success: false, error: 'Authentication is not configured. Please contact PHANTOM.' }, 503);
    const jwt = await signToken({ sub: String(actor.userId), email: actor.email, role: tokenRole(actor.userRole) }, jwtSecret);
    return c.json({ success: true, token: jwt, user: publicActor(actor), message: 'Account activated. Choose your Code Rx codename next.' });
  } catch (error) {
    console.error('[code-rx] activation error:', error);
    return c.json({ success: false, error: 'Account activation failed. Please try again.' }, 500);
  }
});

// Forgot password — creates a one-time reset token and emails a reset link
app.post('/api/auth/forgot-password', async (c) => {
  if (!checkRateLimit(c, 3, 60)) {
    return c.json({ success: false, error: 'Too many requests. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    if (!email) return c.json({ success: false, error: 'A valid email address is required' }, 400);

    const { results } = await c.env.DB
      .prepare('SELECT id, name FROM users WHERE email = ?')
      .bind(email)
      .all<any>();
    const user = results[0];

    // Always return the same message (prevents account enumeration)
    if (!user) {
      return c.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await c.env.DB
      .prepare('INSERT INTO password_resets (email, token, expires_at, used) VALUES (?, ?, ?, 0)')
      .bind(email, await sha256Hex(token), expiresAt)
      .run();

    const base = publicSiteUrl(c.env);
    const resetLink = `${base}/#reset?token=${token}&email=${encodeURIComponent(email)}`;

    const sent = await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_RESET || '', {
      to_email: email,
      name: user.name || 'there',
      reset_link: resetLink,
    });

    // Never return a reset token to a browser. If mail is not configured, keep
    // the same non-enumerating response and let PHANTOM configure mail safely.
    if (!sent) console.warn('[code-rx] password reset email was not sent; mail service is not configured');
    return c.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (e) {
    console.error('[code-rx] forgot password error:', e);
    return c.json({ success: false, error: 'Something went wrong. Please try again.' }, 500);
  }
});

// Reset password — validates the one-time token, then updates the password
app.post('/api/auth/reset-password', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const token = cleanStr(body.token, 32, 128);
    const newPassword = cleanStr(body.newPassword, 8, 128);

    if (!email || !token || !newPassword) {
      return c.json({ success: false, error: 'Email, token, and a new password (min 8 characters) are required' }, 400);
    }

    const tokenHash = await sha256Hex(token);
    // Accept a short-lived legacy plaintext token once during the migration;
    // all newly issued reset tokens are stored as hashes.
    const { results } = await c.env.DB
      .prepare('SELECT * FROM password_resets WHERE email = ? AND (token = ? OR token = ?)')
      .bind(email, tokenHash, token)
      .all<any>();
    const reset = results[0];

    if (!reset || reset.used === 1) {
      return c.json({ success: false, error: 'This reset link is invalid or has already been used.' }, 400);
    }
    if (new Date(reset.expires_at).getTime() < Date.now()) {
      return c.json({ success: false, error: 'This reset link has expired. Please request a new one.' }, 400);
    }

    const password_hash = await hashPassword(newPassword);
    await c.env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      .bind(password_hash, email)
      .run();
    await c.env.DB
      .prepare('UPDATE password_resets SET used = 1 WHERE id = ?')
      .bind(reset.id)
      .run();

    return c.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (e) {
    console.error('[code-rx] reset password error:', e);
    return c.json({ success: false, error: 'Failed to reset password. Please try again.' }, 500);
  }
});

// Change password (any authenticated user; verifies the current password)
app.post('/api/auth/change-password', requireAuth, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const current = cleanStr(body.currentPassword, 1, 128);
    const next = cleanStr(body.newPassword, 8, 128);
    if (!current || !next) {
      return c.json({ success: false, error: 'Current and new password (min 8 characters) are required' }, 400);
    }

    const { results } = await c.env.DB
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(c.get('user').sub)
      .all<any>();
    const user = results[0];
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);

    const ok = await verifyPassword(current, user.password_hash);
    if (!ok) return c.json({ success: false, error: 'Current password is incorrect' }, 401);

    const password_hash = await hashPassword(next);
    await c.env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(password_hash, c.get('user').sub)
      .run();

    return c.json({ success: true, message: 'Password updated successfully' });
  } catch (e) {
    console.error('[code-rx] change password error:', e);
    return c.json({ success: false, error: 'Failed to change password' }, 500);
  }
});

// ============================================
// 📋 APPLICATIONS (join requests)
// ============================================

app.get('/api/applications', requireAuth, requirePhantom, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, mp.member_code, mp.status AS member_status,
       activation.expires_at AS activation_expires_at, activation.delivery_status AS activation_delivery_status
     FROM applications a
     LEFT JOIN member_profiles mp ON mp.id = a.member_profile_id
     LEFT JOIN member_activations activation ON activation.id = (
       SELECT ma.id FROM member_activations ma WHERE ma.member_profile_id = mp.id ORDER BY ma.id DESC LIMIT 1
     )
     ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, a.created_at DESC, a.id DESC`
  ).all();
  return c.json({ success: true, data: results });
});

app.post('/api/applications', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many submissions. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    const phone = cleanStr(body.phone, 5, 30);

    if (!name || !email || !phone) {
      return c.json({ success: false, error: 'Please provide your full name, phone number, and a valid email address' }, 400);
    }
    const [existingAccount, existingApplication] = await Promise.all([
      dbRows<any>(c.env.DB.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').bind(email)),
      dbRows<any>(c.env.DB.prepare("SELECT id FROM applications WHERE email = ? AND status IN ('pending', 'approved') LIMIT 1").bind(email)),
    ]);
    if (existingAccount[0] || existingApplication[0]) {
      return c.json({ success: false, error: 'An account, secure invitation, or pending application already exists for this email. Sign in, use your invitation link, or contact PHANTOM for help.' }, 409);
    }

    const applicationResult = await c.env.DB
      .prepare('INSERT INTO applications (name, email, phone, date, status) VALUES (?, ?, ?, ?, ?)')
      .bind(name, email, phone, new Date().toISOString().split('T')[0], 'pending')
      .run();
    await audit(c.env.DB, null, 'application.submitted', 'application', Number(applicationResult.meta.last_row_id), { email });

    // Also capture as a newsletter subscriber (idempotent)
    await c.env.DB
      .prepare('INSERT OR IGNORE INTO subscribers (email, name, phone, date, source) VALUES (?, ?, ?, ?, ?)')
      .bind(email, name, phone, new Date().toISOString().split('T')[0], 'application')
      .run();

    // Notify the admin (non-blocking; skipped when EmailJS is not configured)
    await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_JOIN || '', {
      to_email: c.env.ADMIN_EMAIL,
      applicant_name: name,
      applicant_email: email,
      applicant_phone: phone || '—',
      date: new Date().toISOString().split('T')[0],
    });

    return c.json({ success: true, message: 'Application submitted successfully' });
  } catch (e) {
    console.error('[code-rx] create application error:', e);
    return c.json({ success: false, error: 'Failed to submit application. Please try again.' }, 500);
  }
});

app.delete('/api/applications/:id', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid application id.' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(id));
  const application = rows[0];
  if (!application) return c.json({ success: false, error: 'Application not found.' }, 404);
  if (application.member_profile_id) {
    return c.json({ success: false, error: 'This application is connected to a member record and is kept as part of that member history.' }, 409);
  }
  const actor = await actorFromContext(c);
  const recycleId = await moveToRecycleBin(c.env.DB, actor, 'application', id, `Application · ${application.name}`, application);
  await c.env.DB.prepare('DELETE FROM applications WHERE id = ?').bind(id).run();
  await audit(c.env.DB, actor, 'application.recycled', 'application', id, { email: application.email, recycleId });
  return c.json({ success: true, message: 'Application moved to the Recycle Bin.' });
});

app.patch('/api/applications/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid application id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    if (body.status !== 'approved' && body.status !== 'rejected' && body.status !== 'pending') {
      return c.json({ success: false, error: 'Status must be pending or rejected. Approval is completed through the secure invitation flow.' }, 400);
    }
    const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(id));
    const application = rows[0];
    if (!application) return c.json({ success: false, error: 'Application not found' }, 404);
    if (application.member_profile_id) {
      return c.json({ success: false, error: 'This application already has a member invitation. Manage the awaiting-activation member instead.' }, 409);
    }
    if (body.status === 'approved') {
      return c.json({ success: false, error: 'Use Approve & Create Secure Invitation so approval, member creation, and password setup stay together.' }, 409);
    }
    const actor = await actorFromContext(c);
    const note = cleanOptionalStr(body.note, 2000);
    await c.env.DB.prepare(
      'UPDATE applications SET status = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(body.status, actor?.userId ?? null, note, id).run();
    await audit(c.env.DB, actor, `application.${body.status}`, 'application', id, { email: application.email, note });
    if (body.status === 'rejected') {
      await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_APPROVAL || '', {
        to_email: application.email,
        member_name: application.name,
        status: 'rejected',
        date: new Date().toISOString().slice(0, 10),
      });
    }
    return c.json({ success: true, message: body.status === 'pending' ? 'Application returned to pending review.' : 'Application rejected.' });
  } catch (error) {
    console.error('[code-rx] update application error:', error);
    return c.json({ success: false, error: 'Failed to update application' }, 500);
  }
});

// ============================================
// 📧 SUBSCRIBERS
// ============================================

app.get('/api/subscribers', requireAuth, requireActiveLegacyAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM subscribers ORDER BY date DESC, id DESC').all();
  return c.json({ success: true, data: results });
});

app.delete('/api/subscribers/:id', requireAuth, requireActiveLegacyAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid subscriber id.' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM subscribers WHERE id = ?').bind(id));
  const subscriber = rows[0];
  if (!subscriber) return c.json({ success: false, error: 'Subscriber not found.' }, 404);
  const actor = await actorFromContext(c);
  const recycleId = await moveToRecycleBin(c.env.DB, actor, 'subscriber', id, `Subscriber · ${subscriber.email}`, subscriber);
  await c.env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(id).run();
  await audit(c.env.DB, actor, 'subscriber.recycled', 'subscriber', id, { recycleId });
  return c.json({ success: true, message: 'Subscriber moved to the Recycle Bin.' });
});

app.post('/api/subscribers', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many attempts. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const name = cleanOptionalStr(body.name, 100);
    const phone = cleanOptionalStr(body.phone, 30);
    if (!email) return c.json({ success: false, error: 'A valid email address is required' }, 400);

    const result = await c.env.DB
      .prepare('INSERT OR IGNORE INTO subscribers (email, name, phone, date, source) VALUES (?, ?, ?, ?, ?)')
      .bind(email, name, phone ?? null, new Date().toISOString().split('T')[0], 'website')
      .run();

    const message = (result.meta.changes ?? 0) > 0 ? 'Subscribed successfully' : 'You are already subscribed';
    return c.json({ success: true, message });
  } catch (e) {
    console.error('[code-rx] subscribe error:', e);
    return c.json({ success: false, error: 'Failed to subscribe. Please try again.' }, 500);
  }
});

// ============================================
// ✉️ CONTACT MESSAGES
// ============================================

app.get('/api/contacts', requireAuth, requireActiveLegacyAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM contacts ORDER BY date DESC, id DESC').all();
  return c.json({ success: true, data: results });
});

app.post('/api/contacts', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many messages. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    const subject = cleanStr(body.subject, 2, 200);
    const message = cleanStr(body.message, 5, 5000);

    if (!name || !email || !subject || !message) {
      return c.json({ success: false, error: 'Please fill in all fields with valid values' }, 400);
    }

    await c.env.DB
      .prepare('INSERT INTO contacts (name, email, subject, message, date, status) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(name, email, subject, message, new Date().toISOString(), 'unread')
      .run();

    // Notify the admin (non-blocking; skipped when EmailJS is not configured)
    await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_CONTACT || '', {
      to_email: c.env.ADMIN_EMAIL,
      sender_name: name,
      sender_email: email,
      subject,
      message,
      date: new Date().toISOString(),
    });

    return c.json({ success: true, message: 'Message sent successfully. We will get back to you soon.' });
  } catch (e) {
    console.error('[code-rx] contact error:', e);
    return c.json({ success: false, error: 'Failed to send message. Please try again.' }, 500);
  }
});

app.patch('/api/contacts/:id', requireAuth, requireActiveLegacyAdmin, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    if (body.status !== 'read' && body.status !== 'archived') {
      return c.json({ success: false, error: 'Status must be "read" or "archived"' }, 400);
    }
    await c.env.DB.prepare('UPDATE contacts SET status = ? WHERE id = ?').bind(body.status, id).run();
    return c.json({ success: true, message: 'Contact updated' });
  } catch (e) {
    console.error('[code-rx] update contact error:', e);
    return c.json({ success: false, error: 'Failed to update contact' }, 500);
  }
});

app.delete('/api/contacts/:id', requireAuth, requireActiveLegacyAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid contact id.' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id));
  const contact = rows[0];
  if (!contact) return c.json({ success: false, error: 'Contact message not found.' }, 404);
  const actor = await actorFromContext(c);
  const recycleId = await moveToRecycleBin(c.env.DB, actor, 'contact', id, `Contact · ${contact.name} · ${contact.subject}`, contact);
  await c.env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(id).run();
  await audit(c.env.DB, actor, 'contact.recycled', 'contact', id, { recycleId });
  return c.json({ success: true, message: 'Contact message moved to the Recycle Bin.' });
});

// ============================================
// 🖥️ SITE CONTENT (CMS)
// ============================================

app.get('/api/site-content', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT data FROM site_content WHERE id = 1').all<any>();
    if (results.length === 0 || !results[0]?.data) {
      return c.json({ success: true, data: null });
    }
    return c.json({ success: true, data: JSON.parse(results[0].data) });
  } catch (e) {
    console.error('[code-rx] get site content error:', e);
    return c.json({ success: false, error: 'Failed to fetch site content' }, 500);
  }
});

app.put('/api/site-content', requireAuth, requireWebsitePermission('content.manage'), async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ success: false, error: 'Invalid content payload' }, 400);
    }
    const raw = JSON.stringify(body);
    if (raw.length > 500_000) return c.json({ success: false, error: 'Content too large' }, 413);

    await c.env.DB
      .prepare('INSERT OR REPLACE INTO site_content (id, data, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)')
      .bind(raw)
      .run();

    return c.json({ success: true, message: 'Site content saved' });
  } catch (e) {
    console.error('[code-rx] save site content error:', e);
    return c.json({ success: false, error: 'Failed to save site content' }, 500);
  }
});

// ============================================
// 👥 MEMBERS
// ============================================

app.get('/api/members', requireAuth, requirePhantom, async (c) => {
  const members = await dbRows<any>(c.env.DB.prepare(
    `SELECT m.*, mp.id AS member_profile_id, mp.status AS member_status,
       r.code AS role_code, r.name AS role_name, code.display_name AS codename
     FROM members m
     LEFT JOIN member_profiles mp ON mp.member_record_id = m.id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
     ORDER BY m.created_at DESC, m.id DESC`
  ));
  return c.json({ success: true, data: members.map((member) => {
    const points = Number(member.points || 0);
    const level = calcitoninLevel(points);
    return {
      ...member,
      points,
      // `members.level` is legacy display data. The public/admin level is now
      // earned from CAL only and cannot be manually overridden.
      level: level.label,
      calculated_level: level,
      role: member.role_name || member.role || 'Member Responsibility',
      responsibility: member.role_name || member.role || 'Member Responsibility',
    };
  }) });
});

// Backwards-compatible endpoint used by the existing Admin panel. It now
// follows the same activation workflow as PHANTOM Control Center rather than
// creating a password-bearing account immediately.
app.post('/api/members', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    if (!name || !email) return c.json({ success: false, error: 'Name and valid email are required' }, 400);
    const actor = await actorFromContext(c);
    if (!actor) return c.json({ success: false, error: 'PHANTOM identity not found' }, 403);
    const created = await createMemberAccount({
      env: c.env,
      actor,
      name,
      email,
      phone: cleanOptionalStr(body.phone, 30),
      roleCode: cleanStr(body.role, 2, 50) || 'member',
      codenamePath: body.codenamePath as CodenamePath | undefined,
      foundingCodenameId: Number.isInteger(Number(body.foundingCodenameId)) ? Number(body.foundingCodenameId) : null,
    });
    return c.json({ success: true, message: 'Member created and awaiting activation', id: created.memberRecordId, data: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create member';
    return c.json({ success: false, error: message }, memberCreationErrorStatus(message));
  }
});

app.patch('/api/members/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid id' }, 400);
    const body = await c.req.json().catch(() => ({}));

    const fields: string[] = [];
    const values: any[] = [];
    const hasScoreUpdate = body.points !== undefined;
    const requestedScore = Number(body.points);
    if (hasScoreUpdate && (!Number.isInteger(requestedScore) || requestedScore < 0 || requestedScore > 1_000_000)) {
      return c.json({ success: false, error: 'Calcitonins must be a whole number from 0 to 1,000,000 CAL.' }, 400);
    }
    if (body.level !== undefined) {
      return c.json({ success: false, error: 'Code Rx levels are earned automatically from Calcitonins and cannot be edited manually.' }, 409);
    }
    if (body.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
    }
    if (fields.length === 0 && !hasScoreUpdate) return c.json({ success: false, error: 'Nothing to update' }, 400);
    if (body.is_active !== undefined) {
      const protectedProfileRows = await dbRows<any>(c.env.DB.prepare(
        `SELECT mp.id, r.code AS role_code FROM member_profiles mp
         LEFT JOIN roles r ON r.id = mp.primary_role_id WHERE mp.member_record_id = ?`
      ).bind(id));
      if (protectedProfileRows[0]?.role_code === 'phantom') {
        return c.json({ success: false, error: 'The PHANTOM founder profile cannot be locked through the legacy member action.' }, 403);
      }
    }

    if (fields.length) {
      values.push(id);
      await c.env.DB.prepare(`UPDATE members SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    if (hasScoreUpdate) {
      const profileRows = await dbRows<any>(c.env.DB.prepare('SELECT id FROM member_profiles WHERE member_record_id = ?').bind(id));
      const actor = await actorFromContext(c);
      if (profileRows[0]) {
        const reason = cleanOptionalStr(body.scoreReason, 500) || 'Calcitonin balance updated from Admin Core';
        const result = await adjustMemberScore(c.env.DB, { memberProfileId: profileRows[0].id, action: 'set', points: requestedScore, reason, actor });
        if (result) {
          await notifyMember(c.env.DB, profileRows[0].id, 'Calcitonins updated', `Your Calcitonin balance is now ${result.balance} CAL (${result.level.label}).`, actor);
          await audit(c.env.DB, actor, 'member.score.legacy_set', 'member_profile', profileRows[0].id, { balance: result.balance, reason });
        }
      } else {
        // Preserve an older member record that has not yet received a profile.
        await c.env.DB.prepare('UPDATE members SET points = ? WHERE id = ?').bind(requestedScore, id).run();
      }
    }
    if (body.is_active !== undefined) {
      const profileRows = await dbRows<any>(c.env.DB.prepare('SELECT id, member_code, status FROM member_profiles WHERE member_record_id = ?').bind(id));
      const profile = profileRows[0];
      if (profile) {
        await c.env.DB.prepare(
          `UPDATE member_profiles SET status = CASE
             WHEN ? = 0 THEN 'locked'
             WHEN status = 'locked' THEN 'active'
             ELSE status END,
           locked_at = CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(body.is_active ? 1 : 0, body.is_active ? 1 : 0, profile.id).run();
        await audit(c.env.DB, await actorFromContext(c), body.is_active ? 'member.unlocked' : 'member.locked', 'member_profile', profile.id, { memberCode: profile.member_code, source: 'legacy_member_endpoint' });
      }
    }
    return c.json({ success: true, message: 'Member updated' });
  } catch (e) {
    console.error('[code-rx] update member error:', e);
    return c.json({ success: false, error: 'Failed to update member' }, 500);
  }
});

// Historical member records are never deleted. The legacy endpoint now
// archives the record so older Admin UI actions remain safe.
app.delete('/api/members/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const memberRecordId = Number(c.req.param('id'));
    if (!Number.isInteger(memberRecordId) || memberRecordId < 1) return c.json({ success: false, error: 'Invalid member id' }, 400);
    const actor = await actorFromContext(c);
    const profileRows = await dbRows<any>(c.env.DB.prepare(
      `SELECT mp.id, mp.member_code, r.code AS role_code FROM member_profiles mp
       LEFT JOIN roles r ON r.id = mp.primary_role_id WHERE mp.member_record_id = ?`
    ).bind(memberRecordId));
    if (profileRows[0]?.role_code === 'phantom') {
      return c.json({ success: false, error: 'The PHANTOM founder profile cannot be archived through the legacy member action.' }, 403);
    }
    await c.env.DB.prepare('UPDATE members SET is_active = 0 WHERE id = ?').bind(memberRecordId).run();
    if (profileRows[0]) {
      await c.env.DB.prepare("UPDATE member_profiles SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(profileRows[0].id).run();
      await audit(c.env.DB, actor, 'member.archived', 'member_profile', profileRows[0].id, { memberCode: profileRows[0].member_code, source: 'legacy_member_endpoint' });
    } else {
      await audit(c.env.DB, actor, 'member.archived', 'member_record', memberRecordId, { source: 'legacy_member_endpoint' });
    }
    return c.json({ success: true, message: 'Member archived. Historical records were preserved.' });
  } catch (error) {
    console.error('[code-rx] archive member error:', error);
    return c.json({ success: false, error: 'Failed to archive member' }, 500);
  }
});

// ============================================
// 📊 STATS (admin)
// ============================================

app.get('/api/stats', requireAuth, requirePhantom, async (c) => {
  try {
    const [applications, pendingApplications, members, subscribers, contacts, unreadContacts] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM applications').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM applications WHERE status = ?').bind('pending').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM members WHERE is_active = 1').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM subscribers').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM contacts').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM contacts WHERE status = ?').bind('unread').all<any>(),
    ]);

    return c.json({
      success: true,
      data: {
        applications: applications.results[0]?.count ?? 0,
        pendingApplications: pendingApplications.results[0]?.count ?? 0,
        members: members.results[0]?.count ?? 0,
        subscribers: subscribers.results[0]?.count ?? 0,
        contacts: contacts.results[0]?.count ?? 0,
        unreadContacts: unreadContacts.results[0]?.count ?? 0,
      },
    });
  } catch (e) {
    console.error('[code-rx] stats error:', e);
    return c.json({ success: false, error: 'Failed to fetch stats' }, 500);
  }
});

// ============================================
// 🪪 MEMBER IDENTITY + CODENAME BALLOT
// ============================================

app.get('/api/member/me', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const pool = ballotPoolFor(actor);
  const session = actor.codename || actor.codenamePath === 'direct_founding'
    ? await dbRows<any>(c.env.DB.prepare('SELECT * FROM codename_selection_sessions WHERE member_profile_id = ?').bind(actor.profileId!)).then((rows) => rows[0] || null)
    : await getCodenameSession(c.env.DB, actor.profileId!, pool);
  const roleRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT r.id, r.code, r.name, r.description FROM roles r JOIN member_profiles mp ON mp.primary_role_id = r.id WHERE mp.id = ?`
  ).bind(actor.profileId));
  const permissions = await dbRows<any>(c.env.DB.prepare(
    `SELECT section_slug, can_view, can_create, can_edit, can_delete, can_manage
     FROM role_permissions WHERE role_id = ? ORDER BY section_slug`
  ).bind(actor.primaryRoleId || 0));
  const [memberRows, canSend] = await Promise.all([
    dbRows<{ points: number }>(c.env.DB.prepare(
      `SELECT m.points FROM members m
       JOIN member_profiles mp ON mp.member_record_id = m.id WHERE mp.id = ?`
    ).bind(actor.profileId)),
    canSendNotifications(c.env.DB, actor),
  ]);
  return c.json({
    success: true,
    data: {
      ...publicActor(actor),
      memberProfileId: actor.profileId,
      role: roleRows[0] || null,
      permissions,
      points: Number(memberRows[0]?.points || 0),
      level: calcitoninLevel(Number(memberRows[0]?.points || 0)).label,
      calculatedLevel: calcitoninLevel(Number(memberRows[0]?.points || 0)),
      canSendNotifications: canSend,
      codenameSession: session ? {
        status: session.status,
        pool: session.pool || pool,
        assignmentSource: session.assignment_source || 'ballot',
        passesUsed: Number(session.passes_used || 0),
        revealedCount: parseSessionCodenameIds(session.revealed_codenames_json).length,
        reviewTarget: Number(session.review_target_count || 3),
        attemptsRemaining: session.status === 'completed' ? 0 : Math.max(0, Number(session.review_target_count || 3) - parseSessionCodenameIds(session.revealed_codenames_json).length),
        claimedCodenameId: session.claimed_codename_id || null,
      } : null,
    },
  });
});

app.get('/api/members/leaderboard', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const limit = Math.min(25, Math.max(3, Number(c.req.query('limit') || 10)));
  const members = await dbRows<any>(c.env.DB.prepare(
    `SELECT mp.id AS member_profile_id, mp.member_code, m.points,
       COALESCE(c.display_name, u.name, mp.member_code) AS display_name
     FROM member_profiles mp
     JOIN members m ON m.id = mp.member_record_id
     LEFT JOIN users u ON u.id = mp.user_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     LEFT JOIN codenames c ON c.claimed_by_member_profile_id = mp.id AND c.status = 'claimed'
     WHERE mp.status = 'active' AND COALESCE(r.code, '') != 'phantom'
     ORDER BY m.points DESC, mp.created_at ASC, mp.id ASC LIMIT ?`
  ).bind(limit));
  return c.json({ success: true, data: members.map((member, index) => ({
    ...member,
    rank: index + 1,
    points: Number(member.points || 0),
    level: calcitoninLevel(Number(member.points || 0)).label,
    calculatedLevel: calcitoninLevel(Number(member.points || 0)),
  })) });
});

// ============================================
// 🔔 IN-APP NOTIFICATIONS
// ============================================

app.get('/api/notifications', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 40)));
  const [items, unreadRows, canSend] = await Promise.all([
    dbRows<any>(c.env.DB.prepare(
      `SELECT n.id, n.title, n.message, n.audience_type, n.audience_label, n.sent_at, n.created_at,
       nr.status, nr.delivered_at, nr.read_at, sender.name AS sender_name, sender_profile.member_code AS sender_member_code
       FROM notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
       LEFT JOIN member_profiles sender_profile ON sender_profile.id = n.created_by_member_profile_id
       LEFT JOIN users sender ON sender.id = sender_profile.user_id
       WHERE nr.member_profile_id = ? AND n.status = 'active'
       ORDER BY nr.delivered_at DESC, n.id DESC LIMIT ?`
    ).bind(actor.profileId, limit)),
    dbRows<{ count: number }>(c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notification_recipients WHERE member_profile_id = ? AND status = 'unread'"
    ).bind(actor.profileId)),
    canSendNotifications(c.env.DB, actor),
  ]);
  return c.json({ success: true, data: {
    items,
    unreadCount: Number(unreadRows[0]?.count || 0),
    canSend,
  } });
});

app.get('/api/notifications/audience', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  if (!await canSendNotifications(c.env.DB, access.actor!)) {
    return c.json({ success: false, error: 'Notification sender access is required.' }, 403);
  }
  const [members, roles] = await Promise.all([
    dbRows<any>(c.env.DB.prepare(
      `SELECT mp.id, mp.member_code, u.name, r.code AS role_code, r.name AS role_name
       FROM member_profiles mp JOIN users u ON u.id = mp.user_id
       LEFT JOIN roles r ON r.id = mp.primary_role_id
       WHERE mp.status = 'active' ORDER BY u.name COLLATE NOCASE`
    )),
    dbRows<any>(c.env.DB.prepare("SELECT code, name FROM roles WHERE code != 'phantom' ORDER BY name")),
  ]);
  return c.json({ success: true, data: { members, roles } });
});

// Sent-notice management is available to PHANTOM and to a delegated sender for
// notices they created. Editing updates the delivered notice for every current
// recipient; deleting withdraws it from inboxes while retaining an audit trail.
app.get('/api/notifications/sent', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  if (!await canSendNotifications(c.env.DB, actor)) return c.json({ success: false, error: 'Notification sender access is required.' }, 403);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 40)));
  const records = await dbRows<any>(c.env.DB.prepare(
    `SELECT n.id, n.title, n.message, n.audience_type, n.audience_label, n.status, n.sent_at, n.created_at,
       sender.name AS sender_name, sender_profile.member_code AS sender_member_code,
       COUNT(nr.member_profile_id) AS recipient_count,
       SUM(CASE WHEN nr.status = 'read' THEN 1 ELSE 0 END) AS read_count
     FROM notifications n
     LEFT JOIN notification_recipients nr ON nr.notification_id = n.id
     LEFT JOIN member_profiles sender_profile ON sender_profile.id = n.created_by_member_profile_id
     LEFT JOIN users sender ON sender.id = sender_profile.user_id
     WHERE n.status = 'active' ${actor.isPhantom ? '' : 'AND n.created_by_member_profile_id = ?'}
     GROUP BY n.id
     ORDER BY n.sent_at DESC, n.id DESC LIMIT ?`
  ).bind(...(actor.isPhantom ? [limit] : [actor.profileId, limit])));
  return c.json({ success: true, data: records.map((record) => ({
    ...record,
    recipient_count: Number(record.recipient_count || 0),
    read_count: Number(record.read_count || 0),
  })) });
});

const editableSentNotification = async (c: any, id: number) => {
  const access = await requireActiveActor(c);
  if (access.response) return { access, notification: null };
  const actor = access.actor!;
  if (!await canSendNotifications(c.env.DB, actor)) return { access, notification: null, forbidden: true };
  const notifications = await dbRows<any>(c.env.DB.prepare(
    "SELECT id, title, message, created_by_member_profile_id FROM notifications WHERE id = ? AND status = 'active'"
  ).bind(id));
  const notification = notifications[0];
  if (!notification) return { access, notification: null };
  if (!actor.isPhantom && Number(notification.created_by_member_profile_id || 0) !== Number(actor.profileId || 0)) {
    return { access, notification: null, forbidden: true };
  }
  return { access, notification, forbidden: false };
};

app.patch('/api/notifications/sent/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid notification id.' }, 400);
  const editable = await editableSentNotification(c, id);
  if (editable.access.response) return editable.access.response;
  if (editable.forbidden) return c.json({ success: false, error: 'You can edit only notifications you are authorized to manage.' }, 403);
  if (!editable.notification) return c.json({ success: false, error: 'Active notification not found.' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const hasTitle = body.title !== undefined;
  const hasMessage = body.message !== undefined;
  if (!hasTitle && !hasMessage) return c.json({ success: false, error: 'Change the title or message before saving.' }, 400);
  const title = hasTitle ? cleanStr(body.title, 2, 180) : editable.notification.title;
  const message = hasMessage ? cleanStr(body.message, 2, 5000) : editable.notification.message;
  if (!title || !message) return c.json({ success: false, error: 'Use a title and message with at least two characters each.' }, 400);
  await c.env.DB.prepare('UPDATE notifications SET title = ?, message = ? WHERE id = ?').bind(title, message, id).run();
  await audit(c.env.DB, editable.access.actor, 'notification.edited', 'notification', id, { titleChanged: hasTitle, messageChanged: hasMessage });
  return c.json({ success: true, data: { id, title, message }, message: 'Sent notification updated for its recipients.' });
});

app.delete('/api/notifications/sent/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid notification id.' }, 400);
  const editable = await editableSentNotification(c, id);
  if (editable.access.response) return editable.access.response;
  if (editable.forbidden) return c.json({ success: false, error: 'You can delete only notifications you are authorized to manage.' }, 403);
  if (!editable.notification) return c.json({ success: false, error: 'Active notification not found.' }, 404);
  const [notificationRows, recipients] = await Promise.all([
    dbRows<any>(c.env.DB.prepare('SELECT * FROM notifications WHERE id = ?').bind(id)),
    dbRows<any>(c.env.DB.prepare('SELECT * FROM notification_recipients WHERE notification_id = ?').bind(id)),
  ]);
  const recycleId = await moveToRecycleBin(c.env.DB, editable.access.actor, 'sent_notification', id, `Notification · ${editable.notification.title}`, { notification: notificationRows[0], recipients });
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE notifications SET status = 'deleted' WHERE id = ?").bind(id),
    c.env.DB.prepare('DELETE FROM notification_recipients WHERE notification_id = ?').bind(id),
  ]);
  await audit(c.env.DB, editable.access.actor, 'notification.recycled', 'notification', id, { withdrawnFromInboxes: true, recycleId });
  return c.json({ success: true, message: 'Notification moved to the Recycle Bin and withdrawn from inboxes.' });
});

app.post('/api/notifications/:id/read', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid notification id.' }, 400);
  const result = await c.env.DB.prepare(
    "UPDATE notification_recipients SET status = 'read', read_at = CURRENT_TIMESTAMP WHERE notification_id = ? AND member_profile_id = ?"
  ).bind(id, access.actor!.profileId).run();
  if (Number(result.meta.changes || 0) !== 1) return c.json({ success: false, error: 'Notification not found.' }, 404);
  return c.json({ success: true, message: 'Notification marked as read.' });
});

// A member may clear an item from their own inbox. The broadcast and its
// organization audit trail remain intact for PHANTOM; only this recipient's
// personal inbox row is removed.
app.delete('/api/notifications/:id', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid notification id.' }, 400);
  const recipientRows = await dbRows<any>(c.env.DB.prepare(
    'SELECT * FROM notification_recipients WHERE notification_id = ? AND member_profile_id = ?'
  ).bind(id, access.actor!.profileId));
  const recipient = recipientRows[0];
  if (!recipient) return c.json({ success: false, error: 'Notification not found.' }, 404);
  const noticeRows = await dbRows<any>(c.env.DB.prepare('SELECT id, title, status FROM notifications WHERE id = ?').bind(id));
  const notice = noticeRows[0];
  const recycleId = await moveToRecycleBin(c.env.DB, access.actor, 'notification_recipient', `${id}:${access.actor!.profileId}`, `Inbox notice · ${notice?.title || 'Notification'}`, { recipient, notificationId: id });
  await c.env.DB.prepare('DELETE FROM notification_recipients WHERE notification_id = ? AND member_profile_id = ?')
    .bind(id, access.actor!.profileId).run();
  await audit(c.env.DB, access.actor, 'notification.inbox_recycled', 'notification', id, { recycleId });
  return c.json({ success: true, message: 'Notification moved to the Recycle Bin.' });
});

app.post('/api/notifications/send', requireAuth, async (c) => {
  if (!checkRateLimit(c, 10, 60)) return c.json({ success: false, error: 'Too many notification broadcasts. Please wait a minute.' }, 429);
  try {
    const access = await requireActiveActor(c);
    if (access.response) return access.response;
    const actor = access.actor!;
    if (!await canSendNotifications(c.env.DB, actor)) {
      return c.json({ success: false, error: 'PHANTOM has not assigned notification sending permission to this account.' }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const title = cleanStr(body.title, 2, 180);
    const message = cleanStr(body.message, 2, 5000);
    const audience = body.audience === 'all' || body.audience === 'selected' || body.audience === 'role' ? body.audience : null;
    if (!title || !message || !audience) {
      return c.json({ success: false, error: 'Title, message, and audience are required.' }, 400);
    }
    const selectedProfileIds = Array.isArray(body.memberProfileIds)
      ? body.memberProfileIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
      : [];
    const roleCode = audience === 'role' ? cleanStr(body.roleCode, 2, 50)?.toLowerCase() : undefined;
    if (audience === 'selected' && !selectedProfileIds.length) return c.json({ success: false, error: 'Choose at least one active member.' }, 400);
    if (audience === 'role' && !roleCode) return c.json({ success: false, error: 'Choose a responsibility profile.' }, 400);
    const recipients = await activeNotificationRecipients(c.env.DB, audience, { selectedProfileIds, roleCode });
    if (!recipients.length) return c.json({ success: false, error: 'No active recipients matched this notification audience.' }, 409);
    let audienceLabel = audience === 'all' ? 'All active members' : audience === 'selected' ? `${recipients.length} selected member${recipients.length === 1 ? '' : 's'}` : roleCode || '';
    if (audience === 'role') {
      const roleRows = await dbRows<{ name: string }>(c.env.DB.prepare('SELECT name FROM roles WHERE code = ?').bind(roleCode));
      audienceLabel = roleRows[0]?.name || roleCode || '';
    }
    const sent = await createNotification(c.env.DB, {
      title,
      message,
      audience,
      audienceLabel,
      recipientProfileIds: recipients,
      actor,
    });
    await audit(c.env.DB, actor, 'notification.sent', 'notification', sent.id, { audience, audienceLabel, recipientCount: sent.recipientCount });
    return c.json({ success: true, data: sent, message: `Notification broadcast to ${sent.recipientCount} active recipient${sent.recipientCount === 1 ? '' : 's'}.` }, 201);
  } catch (error) {
    console.error('[code-rx] notification send error:', error);
    return c.json({ success: false, error: 'Could not send this notification.' }, 500);
  }
});

app.get('/api/phantom/notification-delegates', requireAuth, requirePhantom, async (c) => {
  const delegates = await dbRows<any>(c.env.DB.prepare(
    `SELECT nd.*, mp.member_code, mp.status AS member_status, u.name, u.email, r.code AS role_code, r.name AS role_name
     FROM notification_delegates nd
     JOIN member_profiles mp ON mp.id = nd.member_profile_id
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     ORDER BY nd.can_send DESC, u.name COLLATE NOCASE`
  ));
  return c.json({ success: true, data: delegates });
});

app.put('/api/phantom/notification-delegates/:id', requireAuth, requirePhantom, async (c) => {
  const profileId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(profileId) || profileId < 1 || typeof body.canSend !== 'boolean') {
    return c.json({ success: false, error: 'Choose a member and a true/false notification permission.' }, 400);
  }
  const target = await dbRows<any>(c.env.DB.prepare('SELECT id, status FROM member_profiles WHERE id = ?').bind(profileId));
  if (!target[0]) return c.json({ success: false, error: 'Member profile not found.' }, 404);
  if (target[0].status !== 'active') return c.json({ success: false, error: 'Only active members can receive notification-sender access.' }, 409);
  const actor = await actorFromContext(c);
  await c.env.DB.prepare(
    `INSERT INTO notification_delegates (member_profile_id, can_send, assigned_by_user_id, assigned_at, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(member_profile_id) DO UPDATE SET can_send = excluded.can_send, assigned_by_user_id = excluded.assigned_by_user_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(profileId, body.canSend ? 1 : 0, actor?.userId ?? null).run();
  await audit(c.env.DB, actor, body.canSend ? 'notification.delegate.enabled' : 'notification.delegate.disabled', 'member_profile', profileId);
  return c.json({ success: true, message: body.canSend ? 'Notification sending enabled for this member.' : 'Notification sending disabled for this member.' });
});

// ============================================
// 🌍 COMMUNITY: PUBLIC FORUM + PUBLIC CHAT
// ============================================

app.post('/api/community/public/enter', async (c) => {
  if (!checkRateLimit(c, 8, 60)) return c.json({ success: false, error: 'Please wait a moment before trying again.' }, 429);
  const body = await c.req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  if (!email) return c.json({ success: false, error: 'Enter a valid email address to join the public community.' }, 400);
  const rawToken = randomToken();
  const emailHash = await sha256Hex(email);
  const handle = `Guest-${rawToken.slice(0, 4).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const result = await c.env.DB.prepare(
    `INSERT INTO community_guest_sessions (email, email_hash, public_handle, token_hash, status, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)`
  ).bind(email, emailHash, handle, await sha256Hex(rawToken), expiresAt).run();
  return c.json({ success: true, data: { token: rawToken, handle, expiresAt, guestId: Number(result.meta.last_row_id) }, message: 'Welcome to the General Community.' }, 201);
});

app.get('/api/community/public/threads', async (c) => {
  const limit = Math.min(40, Math.max(1, Number(c.req.query('limit') || 20)));
  const query = cleanOptionalStr(c.req.query('q'), 100);
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT t.id, t.title, t.body, t.status, t.is_pinned, t.created_at, t.updated_at,
       COALESCE(g.public_handle, code.display_name, mp.member_code, 'Community participant') AS author_handle,
       COUNT(p.id) AS reply_count
     FROM public_forum_threads t
     LEFT JOIN community_guest_sessions g ON g.id = t.created_by_guest_id
     LEFT JOIN member_profiles mp ON mp.id = t.created_by_member_profile_id
     LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
     LEFT JOIN public_forum_posts p ON p.thread_id = t.id AND p.status = 'active'
     WHERE t.status IN ('open','locked') ${query ? "AND (t.title LIKE ? OR t.body LIKE ?)" : ''}
     GROUP BY t.id
     ORDER BY t.is_pinned DESC, t.updated_at DESC, t.id DESC LIMIT ?`
  ).bind(...(query ? [`%${query}%`, `%${query}%`, limit] : [limit])));
  return c.json({ success: true, data: rows.map((row) => ({ ...row, is_pinned: Number(row.is_pinned) === 1, reply_count: Number(row.reply_count || 0) })) });
});

app.post('/api/community/public/threads', async (c) => {
  if (!checkRateLimit(c, 6, 60)) return c.json({ success: false, error: 'You are posting too quickly. Please wait a moment.' }, 429);
  const identity = await communityPublicIdentity(c);
  if (!identity) return c.json({ success: false, error: 'Enter the public community with your email before posting.' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const title = cleanStr(body.title, 3, 180);
  const message = cleanStr(body.body, 3, 10_000);
  if (!title || !message) return c.json({ success: false, error: 'Use a discussion title and message.' }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO public_forum_threads (title, body, created_by_guest_id, created_by_member_profile_id, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(title, message, identity.kind === 'guest' ? identity.id : null, identity.kind === 'member' ? identity.id : null).run();
  return c.json({ success: true, data: { id: Number(result.meta.last_row_id) }, message: 'Discussion created.' }, 201);
});

app.get('/api/community/public/threads/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid discussion.' }, 400);
  const threadRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT t.*, COALESCE(g.public_handle, code.display_name, mp.member_code, 'Community participant') AS author_handle
     FROM public_forum_threads t
     LEFT JOIN community_guest_sessions g ON g.id = t.created_by_guest_id
     LEFT JOIN member_profiles mp ON mp.id = t.created_by_member_profile_id
     LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
     WHERE t.id = ? AND t.status IN ('open','locked')`
  ).bind(id));
  const thread = threadRows[0];
  if (!thread) return c.json({ success: false, error: 'Discussion not found.' }, 404);
  const posts = await dbRows<any>(c.env.DB.prepare(
    `SELECT p.*, COALESCE(g.public_handle, code.display_name, mp.member_code, 'Community participant') AS author_handle
     FROM public_forum_posts p
     LEFT JOIN community_guest_sessions g ON g.id = p.created_by_guest_id
     LEFT JOIN member_profiles mp ON mp.id = p.created_by_member_profile_id
     LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
     WHERE p.thread_id = ? AND p.status = 'active' ORDER BY p.created_at ASC, p.id ASC LIMIT 100`
  ).bind(id));
  const reactionRows = posts.length ? await dbRows<any>(c.env.DB.prepare(
    `SELECT post_id, emoji, COUNT(*) AS count FROM public_forum_reactions WHERE post_id IN (${posts.map(() => '?').join(',')}) GROUP BY post_id, emoji`
  ).bind(...posts.map((post) => post.id))) : [];
  const reactions = new Map<number, Array<{ emoji: string; count: number }>>();
  reactionRows.forEach((row) => reactions.set(Number(row.post_id), [...(reactions.get(Number(row.post_id)) || []), { emoji: row.emoji, count: Number(row.count || 0) }]));
  return c.json({ success: true, data: { thread: { ...thread, is_pinned: Number(thread.is_pinned) === 1 }, posts: posts.map((post) => ({ ...post, reactions: reactions.get(Number(post.id)) || [] })) } });
});

app.post('/api/community/public/threads/:id/posts', async (c) => {
  if (!checkRateLimit(c, 12, 60)) return c.json({ success: false, error: 'You are replying too quickly. Please wait a moment.' }, 429);
  const identity = await communityPublicIdentity(c);
  if (!identity) return c.json({ success: false, error: 'Enter the public community with your email before replying.' }, 401);
  const threadId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const message = cleanStr(body.body, 1, 10_000);
  const parentId = Number.isInteger(Number(body.parentPostId)) ? Number(body.parentPostId) : null;
  if (!Number.isInteger(threadId) || threadId < 1 || !message) return c.json({ success: false, error: 'Use a valid discussion and reply.' }, 400);
  const threadRows = await dbRows<any>(c.env.DB.prepare("SELECT status FROM public_forum_threads WHERE id = ?").bind(threadId));
  if (!threadRows[0] || threadRows[0].status !== 'open') return c.json({ success: false, error: 'This discussion is locked or unavailable.' }, 409);
  const result = await c.env.DB.prepare(
    `INSERT INTO public_forum_posts (thread_id, body, parent_post_id, created_by_guest_id, created_by_member_profile_id)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(threadId, message, parentId, identity.kind === 'guest' ? identity.id : null, identity.kind === 'member' ? identity.id : null).run();
  await c.env.DB.prepare('UPDATE public_forum_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(threadId).run();
  return c.json({ success: true, data: { id: Number(result.meta.last_row_id) }, message: 'Reply posted.' }, 201);
});

app.patch('/api/community/public/threads/:id', async (c) => {
  const identity = await communityPublicIdentity(c);
  if (!identity) return c.json({ success: false, error: 'Enter the public community before editing.' }, 401);
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM public_forum_threads WHERE id = ? AND status IN (\'open\',\'locked\')').bind(id));
  const thread = rows[0];
  if (!thread) return c.json({ success: false, error: 'Discussion not found.' }, 404);
  const owner = identity.kind === 'guest' ? Number(thread.created_by_guest_id) === identity.id : Number(thread.created_by_member_profile_id) === identity.id;
  if (!owner && !(identity.kind === 'member' && identity.actor.isPhantom)) return c.json({ success: false, error: 'You cannot edit this discussion.' }, 403);
  const title = body.title === undefined ? thread.title : cleanStr(body.title, 3, 180);
  const text = body.body === undefined ? thread.body : cleanStr(body.body, 3, 10_000);
  if (!title || !text) return c.json({ success: false, error: 'Use a valid discussion title and message.' }, 400);
  await c.env.DB.prepare('UPDATE public_forum_threads SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(title, text, id).run();
  return c.json({ success: true, message: 'Discussion updated.' });
});

app.delete('/api/community/public/threads/:id', async (c) => {
  const identity = await communityPublicIdentity(c);
  if (!identity) return c.json({ success: false, error: 'Enter the public community before deleting.' }, 401);
  const id = Number(c.req.param('id'));
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM public_forum_threads WHERE id = ? AND status IN (\'open\',\'locked\')').bind(id));
  const thread = rows[0];
  if (!thread) return c.json({ success: false, error: 'Discussion not found.' }, 404);
  const owner = identity.kind === 'guest' ? Number(thread.created_by_guest_id) === identity.id : Number(thread.created_by_member_profile_id) === identity.id;
  if (!owner && !(identity.kind === 'member' && identity.actor.isPhantom)) return c.json({ success: false, error: 'You cannot delete this discussion.' }, 403);
  await c.env.DB.prepare("UPDATE public_forum_threads SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  return c.json({ success: true, message: 'Discussion deleted.' });
});

app.patch('/api/community/public/posts/:id', async (c) => {
  const identity = await communityPublicIdentity(c);
  if (!identity) return c.json({ success: false, error: 'Enter the public community before editing.' }, 401);
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const text = cleanStr(body.body, 1, 10_000);
  const rows = await dbRows<any>(c.env.DB.prepare("SELECT * FROM public_forum_posts WHERE id = ? AND status = 'active'").bind(id));
  const post = rows[0];
  if (!post || !text) return c.json({ success: false, error: 'Valid post content is required.' }, 400);
  const owner = identity.kind === 'guest' ? Number(post.created_by_guest_id) === identity.id : Number(post.created_by_member_profile_id) === identity.id;
  if (!owner && !(identity.kind === 'member' && identity.actor.isPhantom)) return c.json({ success: false, error: 'You cannot edit this post.' }, 403);
  await c.env.DB.prepare('UPDATE public_forum_posts SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(text, id).run();
  return c.json({ success: true, message: 'Post updated.' });
});

app.delete('/api/community/public/posts/:id', async (c) => {
  const identity = await communityPublicIdentity(c);
  if (!identity) return c.json({ success: false, error: 'Enter the public community before deleting.' }, 401);
  const id = Number(c.req.param('id'));
  const rows = await dbRows<any>(c.env.DB.prepare("SELECT * FROM public_forum_posts WHERE id = ? AND status = 'active'").bind(id));
  const post = rows[0];
  if (!post) return c.json({ success: false, error: 'Post not found.' }, 404);
  const owner = identity.kind === 'guest' ? Number(post.created_by_guest_id) === identity.id : Number(post.created_by_member_profile_id) === identity.id;
  if (!owner && !(identity.kind === 'member' && identity.actor.isPhantom)) return c.json({ success: false, error: 'You cannot delete this post.' }, 403);
  await c.env.DB.prepare("UPDATE public_forum_posts SET status = 'deleted', body = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  return c.json({ success: true, message: 'Post deleted.' });
});

app.put('/api/community/public/posts/:id/reactions', async (c) => {
  const identity = await communityPublicIdentity(c);
  if (!identity) return c.json({ success: false, error: 'Enter the public community before reacting.' }, 401);
  const postId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const emoji = cleanStr(body.emoji, 1, 16);
  if (!Number.isInteger(postId) || postId < 1 || !emoji) return c.json({ success: false, error: 'Choose a valid reaction.' }, 400);
  const existing = await dbRows<any>(c.env.DB.prepare('SELECT id FROM public_forum_reactions WHERE post_id = ? AND actor_key = ? AND emoji = ?').bind(postId, identity.actorKey, emoji));
  if (existing[0]) await c.env.DB.prepare('DELETE FROM public_forum_reactions WHERE id = ?').bind(existing[0].id).run();
  else await c.env.DB.prepare('INSERT INTO public_forum_reactions (post_id, actor_key, emoji) VALUES (?, ?, ?)').bind(postId, identity.actorKey, emoji).run();
  return c.json({ success: true, data: { active: !existing[0] } });
});

app.post('/api/community/public/reports', async (c) => {
  if (!checkRateLimit(c, 4, 60)) return c.json({ success: false, error: 'Please wait before sending another report.' }, 429);
  const identity = await communityPublicIdentity(c);
  if (!identity) return c.json({ success: false, error: 'Enter the public community before reporting content.' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const reason = cleanStr(body.reason, 3, 1000);
  const threadId = Number.isInteger(Number(body.threadId)) ? Number(body.threadId) : null;
  const postId = Number.isInteger(Number(body.postId)) ? Number(body.postId) : null;
  if (!reason || (!threadId && !postId)) return c.json({ success: false, error: 'Choose content and provide a report reason.' }, 400);
  await c.env.DB.prepare('INSERT INTO public_forum_reports (thread_id, post_id, reporter_key, reason) VALUES (?, ?, ?, ?)').bind(threadId, postId, identity.actorKey, reason).run();
  return c.json({ success: true, message: 'Report received for PHANTOM review.' }, 201);
});

app.get('/api/community/public/chat', async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 50)));
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT m.*, COALESCE(g.public_handle, code.display_name, mp.member_code, 'Community participant') AS author_handle,
       CASE WHEN m.created_by_member_profile_id IS NULL THEN 0 ELSE 1 END AS is_member
     FROM public_chat_messages m
     LEFT JOIN community_guest_sessions g ON g.id = m.created_by_guest_id
     LEFT JOIN member_profiles mp ON mp.id = m.created_by_member_profile_id
     LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
     WHERE m.status = 'active' ORDER BY m.id DESC LIMIT ?`
  ).bind(limit));
  return c.json({ success: true, data: rows.reverse().map((row) => ({ ...row, is_member: Number(row.is_member) === 1 })) });
});

app.post('/api/community/public/chat', async (c) => {
  if (!checkRateLimit(c, 10, 60)) return c.json({ success: false, error: 'You are chatting too quickly. Please wait a moment.' }, 429);
  const identity = await communityPublicIdentity(c);
  if (!identity) return c.json({ success: false, error: 'Enter the public community with your email before chatting.' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const message = cleanStr(body.body, 1, 2_000);
  if (!message) return c.json({ success: false, error: 'Write a message before sending.' }, 400);
  const result = await c.env.DB.prepare(
    'INSERT INTO public_chat_messages (body, created_by_guest_id, created_by_member_profile_id) VALUES (?, ?, ?)'
  ).bind(message, identity.kind === 'guest' ? identity.id : null, identity.kind === 'member' ? identity.id : null).run();
  return c.json({ success: true, data: { id: Number(result.meta.last_row_id) }, message: 'Message sent.' }, 201);
});

app.get('/api/phantom/community/public/reports', requireAuth, requirePhantom, async (c) => {
  const reports = await dbRows<any>(c.env.DB.prepare("SELECT * FROM public_forum_reports WHERE status IN ('open','reviewed') ORDER BY created_at ASC LIMIT 200"));
  return c.json({ success: true, data: reports });
});

app.patch('/api/phantom/community/public/reports/:id', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(id) || !['reviewed','resolved','dismissed'].includes(body.status)) return c.json({ success: false, error: 'Choose a valid report status.' }, 400);
  const actor = await actorFromContext(c);
  await c.env.DB.prepare('UPDATE public_forum_reports SET status = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.status, actor?.userId ?? null, id).run();
  return c.json({ success: true, message: 'Public report updated.' });
});

app.patch('/api/phantom/community/public/threads/:id', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.pinned !== undefined) { fields.push('is_pinned = ?'); values.push(body.pinned ? 1 : 0); }
  if (body.status !== undefined && ['open','locked','archived','deleted'].includes(body.status)) { fields.push('status = ?'); values.push(body.status); }
  if (!Number.isInteger(id) || !fields.length) return c.json({ success: false, error: 'Choose a valid public discussion moderation action.' }, 400);
  fields.push('updated_at = CURRENT_TIMESTAMP'); values.push(id);
  await c.env.DB.prepare(`UPDATE public_forum_threads SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  await audit(c.env.DB, await actorFromContext(c), 'community.public_thread.moderated', 'public_forum_thread', id, { fields: fields.slice(0, -1) });
  return c.json({ success: true, message: 'Public discussion moderated.' });
});

app.patch('/api/phantom/community/public/posts/:id', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(id) || !['active','hidden','deleted'].includes(body.status)) return c.json({ success: false, error: 'Choose a valid public post moderation action.' }, 400);
  await c.env.DB.prepare("UPDATE public_forum_posts SET status = ?, body = CASE WHEN ? = 'deleted' THEN '' ELSE body END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, body.status, id).run();
  await audit(c.env.DB, await actorFromContext(c), 'community.public_post.moderated', 'public_forum_post', id, { status: body.status });
  return c.json({ success: true, message: 'Public post moderated.' });
});

// ============================================
// 🪪 MEMBER IDENTITY + CODENAME BALLOT
// ============================================

app.get('/api/codenames/ballot', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  if (actor.codename) return c.json({ success: true, data: { completed: true, codename: actor.codename, choices: [], slots: [], pool: actor.codenamePath === 'direct_founding' ? 'founding' : ballotPoolFor(actor) } });
  if (actor.codenamePath === 'direct_founding') return c.json({ success: false, error: 'This account is awaiting a direct PHANTOM founding-codename assignment.' }, 409);
  const pool = ballotPoolFor(actor);
  const session = await getCodenameSession(c.env.DB, actor.profileId!, pool);
  if (!session || session.status !== 'open') return c.json({ success: false, error: 'Codename selection is no longer open for this account.' }, 409);
  const presentation = await wideBallotPresentation(c.env.DB, session, pool);
  const exhaustedPrompt = presentation.exhausted
    ? pool === 'founding'
      ? 'No founding codenames are currently available. PHANTOM can add or release one before this ballot can continue.'
      : 'No member codenames are currently available. PHANTOM needs to add more Member Pool codenames before this ballot can continue.'
    : null;
  return c.json({ success: true, data: {
    completed: false,
    covered: true,
    pool,
    ballotTitle: ballotLabelFor(pool),
    slots: presentation.slots,
    revealedChoices: presentation.revealedChoices,
    revealCount: presentation.revealedChoices.length,
    reviewTarget: presentation.reviewTarget,
    maxAttempts: presentation.reviewTarget,
    readyToChoose: presentation.readyToChoose,
    hasRevealedSelection: presentation.revealedChoices.length > 0,
    choices: [],
    exhausted: presentation.exhausted,
    exhaustedPrompt,
  } });
});

// The client receives only card positions for covered choices. Opening a card
// reveals a server-mapped codename, and a member must reveal their complete
// three-choice comparison group before any claim action is accepted.
app.post('/api/codenames/reveal', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  if (actor.codename || actor.codenamePath === 'direct_founding') return c.json({ success: false, error: 'This account cannot open another codename ballot.' }, 409);
  const pool = ballotPoolFor(actor);
  const session = await getCodenameSession(c.env.DB, actor.profileId!, pool);
  if (!session || session.status !== 'open') return c.json({ success: false, error: 'Codename selection is closed.' }, 409);
  const before = await wideBallotPresentation(c.env.DB, session, pool);
  if (before.exhausted) return c.json({ success: true, data: { covered: true, exhausted: true, pool, slots: before.slots, revealedChoices: [], revealCount: 0, reviewTarget: 0, readyToChoose: false, exhaustedPrompt: pool === 'founding' ? 'No founding codenames remain for review.' : 'No member codenames remain for review.' } });
  if (before.readyToChoose) return c.json({ success: true, data: { covered: false, pool, slots: before.slots, revealedChoices: before.revealedChoices, revealCount: before.revealedChoices.length, reviewTarget: before.reviewTarget, readyToChoose: true, message: 'All comparison choices are revealed. Choose one codename to continue.' } });

  const body = await c.req.json().catch(() => ({}));
  const requestedSlot = Number(body.slot);
  const coveredSlots = before.slots.filter((slot: any) => slot.state === 'covered');
  const targetSlot = Number.isInteger(requestedSlot) && coveredSlots.some((slot: any) => slot.slot === requestedSlot)
    ? requestedSlot
    : coveredSlots[0]?.slot;
  if (!targetSlot) return c.json({ success: false, error: 'No covered codename remains to reveal. Refresh the ballot and choose from the revealed choices.' }, 409);
  const slots = parseBallotSlots(before.session.ballot_slots_json);
  const codenameId = Number(slots[targetSlot - 1]);
  const rows = await dbRows<any>(c.env.DB.prepare(
    "SELECT id, display_name, pool, status FROM codenames WHERE id = ? AND pool = ?"
  ).bind(codenameId, pool));
  const codename = rows[0];
  if (!codename || codename.status !== 'available') {
    return c.json({ success: false, error: 'That covered choice is no longer available. Choose another covered card.' }, 409);
  }
  const revealedIds = [...new Set([...parseSessionCodenameIds(before.session.revealed_codenames_json), codenameId])];
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE codename_selection_sessions SET revealed_codenames_json = ?, current_codename_id = NULL WHERE id = ?')
      .bind(JSON.stringify(revealedIds), session.id),
    c.env.DB.prepare("INSERT INTO codename_selection_events (session_id, codename_id, action) VALUES (?, ?, 'available_check')")
      .bind(session.id, codenameId),
  ]);
  const refreshed = await getCodenameSession(c.env.DB, actor.profileId!, pool);
  const after = await wideBallotPresentation(c.env.DB, refreshed!, pool);
  return c.json({ success: true, data: {
    covered: false,
    pool,
    slots: after.slots,
    revealedChoices: after.revealedChoices,
    revealCount: after.revealedChoices.length,
    reviewTarget: after.reviewTarget,
    readyToChoose: after.readyToChoose,
    message: after.readyToChoose
      ? 'All comparison choices are revealed. Compare them and choose one codename.'
      : `Choice ${after.revealedChoices.length} of ${after.reviewTarget} revealed. Open another covered card to complete your comparison group.`,
  } });
});

// Compatibility route: an ID can be checked only after it was revealed as one
// of this member's comparison choices.
app.post('/api/codenames/check', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  if (actor.codename || actor.codenamePath === 'direct_founding') return c.json({ success: false, error: 'This account cannot open another codename ballot.' }, 409);
  const pool = ballotPoolFor(actor);
  const body = await c.req.json().catch(() => ({}));
  const codenameId = Number(body.codenameId);
  if (!Number.isInteger(codenameId) || codenameId < 1) return c.json({ success: false, error: 'Reveal your comparison choices before checking a codename.' }, 400);
  const session = await getCodenameSession(c.env.DB, actor.profileId!, pool);
  if (!session || session.status !== 'open') return c.json({ success: false, error: 'Codename selection is closed.' }, 409);
  const presentation = await wideBallotPresentation(c.env.DB, session, pool);
  if (!presentation.revealedChoices.some((choice: any) => Number(choice.id) === codenameId)) return c.json({ success: false, error: 'This codename is not part of your revealed comparison group.' }, 409);
  const codeRows = await dbRows<any>(c.env.DB.prepare('SELECT id, display_name, pool, status FROM codenames WHERE id = ?').bind(codenameId));
  const codename = codeRows[0];
  const available = Boolean(codename && codename.pool === pool && codename.status === 'available');
  return c.json({ success: true, data: { available, codename: codename?.display_name || 'Codename', pool, reviewTarget: presentation.reviewTarget, revealCount: presentation.revealedChoices.length, readyToChoose: presentation.readyToChoose, message: available ? 'AVAILABLE' : 'This revealed codename is no longer available. Open another covered card to complete your choices.' } });
});

// The earlier one-at-a-time pass flow is intentionally retired. A member now
// reveals the comparison group first, then claims exactly one choice.
app.post('/api/codenames/pass', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  return c.json({ success: false, error: 'This ballot now reveals all comparison choices first. Open the remaining covered cards, then choose one revealed codename.' }, 409);
});

app.post('/api/codenames/claim', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  if (actor.codename || actor.codenamePath === 'direct_founding') return c.json({ success: false, error: 'This account cannot claim another codename.' }, 409);
  const pool = ballotPoolFor(actor);
  const body = await c.req.json().catch(() => ({}));
  const codenameId = Number(body.codenameId);
  if (!Number.isInteger(codenameId) || codenameId < 1) return c.json({ success: false, error: 'Reveal your comparison choices before claiming a codename.' }, 400);
  const session = await getCodenameSession(c.env.DB, actor.profileId!, pool);
  if (!session || session.status !== 'open') return c.json({ success: false, error: 'Codename selection is closed.' }, 409);
  const presentation = await wideBallotPresentation(c.env.DB, session, pool);
  if (!presentation.readyToChoose) return c.json({ success: false, error: `Reveal all ${presentation.reviewTarget} comparison choices before choosing one.` }, 409);
  if (!presentation.revealedChoices.some((choice: any) => Number(choice.id) === codenameId)) return c.json({ success: false, error: 'Choose one of your revealed comparison codenames.' }, 409);
  const result = await c.env.DB.prepare(
    `UPDATE codenames
     SET status = 'claimed', claimed_by_member_profile_id = ?, claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND pool = ? AND status = 'available' AND claimed_by_member_profile_id IS NULL`
  ).bind(actor.profileId, codenameId, pool).run();
  if (Number(result.meta.changes || 0) !== 1) return c.json({ success: false, error: 'That codename was just claimed by another member. Open another covered choice and compare again.' }, 409);
  const codeRows = await dbRows<any>(c.env.DB.prepare('SELECT display_name FROM codenames WHERE id = ?').bind(codenameId));
  const codename = codeRows[0]?.display_name || 'Codename';
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE codename_selection_sessions SET status = 'completed', claimed_codename_id = ?, current_codename_id = NULL, completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(codenameId, session.id),
    c.env.DB.prepare("INSERT INTO codename_selection_events (session_id, codename_id, action) VALUES (?, ?, 'claimed')").bind(session.id, codenameId),
    c.env.DB.prepare("INSERT INTO codename_history (codename_id, member_profile_id, event_type, acted_by_user_id, note) VALUES (?, ?, 'claimed', ?, ?)")
      .bind(codenameId, actor.profileId, actor.userId, `Claimed from ${pool} three-choice comparison ballot`),
  ]);
  await audit(c.env.DB, actor, 'codename.claimed', 'codename', codenameId, { codename, pool, revealedCount: presentation.revealedChoices.length, reviewTarget: presentation.reviewTarget });
  await awardAutomaticScore({
    db: c.env.DB,
    memberProfileId: actor.profileId,
    ruleKey: 'member.codename_claimed',
    referenceType: 'codename',
    referenceId: codenameId,
    actor,
    metadata: { codename, pool },
  });
  return c.json({ success: true, data: { codename, pool, revealCount: presentation.revealedChoices.length, reviewTarget: presentation.reviewTarget, message: `${codename} is now your permanent Code Rx identity.` } });
});

// ============================================
// 🗄️ CODE Rx VAULT
// ============================================

app.get('/api/vault/sections', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const sections = await dbRows<any>(c.env.DB.prepare(
    'SELECT id, slug, title, description, is_sensitive, sort_order FROM vault_sections WHERE is_archived = 0 ORDER BY sort_order, title'
  ));
  const visible = [] as any[];
  for (const section of sections) {
    if (await hasVaultPermission(c.env.DB, actor, section.slug, 'view')) {
      visible.push({ ...section, permissions: {
        view: true,
        create: await hasVaultPermission(c.env.DB, actor, section.slug, 'create'),
        edit: await hasVaultPermission(c.env.DB, actor, section.slug, 'edit'),
        delete: await hasVaultPermission(c.env.DB, actor, section.slug, 'delete'),
        manage: await hasVaultPermission(c.env.DB, actor, section.slug, 'manage'),
      } });
    }
  }
  return c.json({ success: true, data: visible });
});

app.get('/api/vault/home', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const allSections = await dbRows<any>(c.env.DB.prepare(
    'SELECT id, slug, title, description, is_sensitive, sort_order FROM vault_sections WHERE is_archived = 0 ORDER BY sort_order, title'
  ));
  const sections: any[] = [];
  for (const section of allSections) {
    if (!await hasVaultPermission(c.env.DB, actor, section.slug, 'view')) continue;
    const countRows = await dbRows<any>(c.env.DB.prepare('SELECT COUNT(*) AS count FROM vault_documents WHERE section_id = ? AND is_archived = 0').bind(section.id));
    sections.push({ ...section, documentCount: Number(countRows[0]?.count || 0), permissions: {
      view: true,
      create: await hasVaultPermission(c.env.DB, actor, section.slug, 'create'),
      edit: await hasVaultPermission(c.env.DB, actor, section.slug, 'edit'),
      delete: await hasVaultPermission(c.env.DB, actor, section.slug, 'delete'),
      manage: await hasVaultPermission(c.env.DB, actor, section.slug, 'manage'),
    } });
  }
  const visibleIds = new Set(sections.map((section) => section.id));
  const latestRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.id, d.document_code, d.section_id, d.title, d.status, d.tags_json, d.word_count, d.updated_at, d.created_at,
            d.created_by_member_profile_id, d.updated_by_member_profile_id,
            s.slug AS section_slug, s.title AS section_title, u.name AS updated_by_name
     FROM vault_documents d
     JOIN vault_sections s ON s.id = d.section_id
     LEFT JOIN member_profiles mp ON mp.id = d.updated_by_member_profile_id
     LEFT JOIN users u ON u.id = mp.user_id
     WHERE d.is_archived = 0 ORDER BY d.updated_at DESC, d.id DESC LIMIT 80`
  ));
  const recentDocuments = latestRows.filter((document) => visibleIds.has(document.section_id)).slice(0, 10);
  const myDocuments = latestRows.filter((document) => visibleIds.has(document.section_id) && (document.created_by_member_profile_id === actor.profileId || document.updated_by_member_profile_id === actor.profileId)).slice(0, 10);
  const activityRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT va.*, s.slug AS section_slug, s.title AS section_title, d.title AS document_title, u.name AS actor_name
     FROM vault_activity va
     LEFT JOIN vault_sections s ON s.id = va.section_id
     LEFT JOIN vault_documents d ON d.id = va.document_id
     LEFT JOIN member_profiles mp ON mp.id = va.actor_member_profile_id
     LEFT JOIN users u ON u.id = mp.user_id
     ORDER BY va.created_at DESC, va.id DESC LIMIT 80`
  ));
  const recentActivity = activityRows.filter((activity) => !activity.section_id || visibleIds.has(activity.section_id)).slice(0, 15);
  return c.json({ success: true, data: { sections, recentDocuments, myDocuments, recentActivity } });
});

app.get('/api/vault/activity', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 30)));
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT va.*, s.slug AS section_slug, s.title AS section_title, d.title AS document_title, u.name AS actor_name
     FROM vault_activity va
     LEFT JOIN vault_sections s ON s.id = va.section_id
     LEFT JOIN vault_documents d ON d.id = va.document_id
     LEFT JOIN member_profiles mp ON mp.id = va.actor_member_profile_id
     LEFT JOIN users u ON u.id = mp.user_id
     ORDER BY va.created_at DESC, va.id DESC LIMIT ?`
  ).bind(limit));
  const visible: any[] = [];
  for (const row of rows) {
    if (!row.section_slug || await hasVaultPermission(c.env.DB, actor, row.section_slug, 'view')) visible.push(row);
  }
  return c.json({ success: true, data: visible });
});

app.get('/api/vault/search', requireAuth, async (c) => {
  const query = cleanStr(c.req.query('q'), 1, 120);
  if (!query) return c.json({ success: false, error: 'Enter a search term.' }, 400);
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const wildcard = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const canViewProjects = await hasVaultPermission(c.env.DB, actor, 'projects', 'view');
  const projectSearchClause = canViewProjects ? " OR p.title LIKE ? ESCAPE '\\' COLLATE NOCASE" : '';
  const searchValues = canViewProjects
    ? [wildcard, wildcard, wildcard, wildcard, wildcard, wildcard, wildcard]
    : [wildcard, wildcard, wildcard, wildcard, wildcard, wildcard];
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT DISTINCT d.id, d.document_code, d.section_id, d.title, d.content, d.tags_json, d.status, d.updated_at,
       s.slug AS section_slug, s.title AS section_title, u.name AS author_name,
       ${canViewProjects ? 'p.title' : 'NULL'} AS project_title
     FROM vault_documents d
     JOIN vault_sections s ON s.id = d.section_id
     LEFT JOIN member_profiles author_profile ON author_profile.id = d.created_by_member_profile_id
     LEFT JOIN users u ON u.id = author_profile.user_id
     LEFT JOIN vault_projects p ON p.id = d.related_project_id
     WHERE d.is_archived = 0 AND (
       d.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR d.document_code LIKE ? ESCAPE '\\' COLLATE NOCASE OR
       d.content LIKE ? ESCAPE '\\' COLLATE NOCASE OR d.tags_json LIKE ? ESCAPE '\\' COLLATE NOCASE OR u.name LIKE ? ESCAPE '\\' COLLATE NOCASE${projectSearchClause}
       OR s.title LIKE ? ESCAPE '\\' COLLATE NOCASE
     ) ORDER BY d.updated_at DESC LIMIT 80`
  ).bind(...searchValues));
  const results: any[] = [];
  for (const row of rows) {
    if (await hasVaultPermission(c.env.DB, actor, row.section_slug, 'view')) results.push(row);
  }
  return c.json({ success: true, data: results });
});

app.get('/api/vault/tags', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  // Tags can expose sensitive document topics, so only aggregate tags from
  // sections that this actor can actually open. Orphaned/archived tags are
  // deliberately excluded from the member-facing index as well.
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT t.id, t.normalized_name, t.display_name, s.slug AS section_slug,
            COUNT(DISTINCT d.id) AS document_count
     FROM vault_tags t
     JOIN vault_document_tags dt ON dt.tag_id = t.id
     JOIN vault_documents d ON d.id = dt.document_id AND d.is_archived = 0
     JOIN vault_sections s ON s.id = d.section_id AND s.is_archived = 0
     GROUP BY t.id, s.slug ORDER BY t.display_name`
  ));
  const visible = new Map<number, { id: number; normalized_name: string; display_name: string; document_count: number }>();
  for (const row of rows) {
    if (!await hasVaultPermission(c.env.DB, actor, row.section_slug, 'view')) continue;
    const current = visible.get(Number(row.id));
    if (current) current.document_count += Number(row.document_count || 0);
    else visible.set(Number(row.id), {
      id: Number(row.id),
      normalized_name: row.normalized_name,
      display_name: row.display_name,
      document_count: Number(row.document_count || 0),
    });
  }
  const tags = [...visible.values()].sort((a, b) => b.document_count - a.document_count || a.display_name.localeCompare(b.display_name));
  return c.json({ success: true, data: tags });
});

app.get('/api/vault/documents', requireAuth, async (c) => {
  const slug = cleanStr(c.req.query('section'), 1, 60);
  const archived = c.req.query('archived') === '1';
  if (!slug) return c.json({ success: false, error: 'Vault section is required' }, 400);
  const access = await vaultAccess(c, slug, archived ? 'manage' : 'view');
  if (access.response) return access.response;
  const canViewProjects = await hasVaultPermission(c.env.DB, access.actor!, 'projects', 'view');
  const documents = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.id, d.document_code, d.title, d.status, d.visibility, d.file_key, d.tags_json, d.related_project_id, d.word_count, d.archived_from_status, d.archived_at, d.created_at, d.updated_at,
            creator.member_code AS created_by_member_id, creator_user.name AS created_by_name,
            updater.member_code AS updated_by_member_id, updater_user.name AS updated_by_name,
            p.title AS related_project_title
     FROM vault_documents d
     LEFT JOIN member_profiles creator ON creator.id = d.created_by_member_profile_id
     LEFT JOIN users creator_user ON creator_user.id = creator.user_id
     LEFT JOIN member_profiles updater ON updater.id = d.updated_by_member_profile_id
     LEFT JOIN users updater_user ON updater_user.id = updater.user_id
     LEFT JOIN vault_projects p ON p.id = d.related_project_id
     WHERE d.section_id = ? AND d.is_archived = ? ORDER BY d.updated_at DESC, d.id DESC`
  ).bind(access.section.id, archived ? 1 : 0));
  const visibleDocuments = canViewProjects ? documents : documents.map((document) => ({
    ...document,
    related_project_id: null,
    related_project_title: null,
  }));
  return c.json({ success: true, data: visibleDocuments, archived });
});

app.get('/api/vault/documents/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.*, s.slug AS section_slug, s.title AS section_title,
       creator_user.name AS created_by_name, updater_user.name AS updated_by_name,
       p.title AS related_project_title
     FROM vault_documents d
     JOIN vault_sections s ON s.id = d.section_id
     LEFT JOIN member_profiles creator ON creator.id = d.created_by_member_profile_id
     LEFT JOIN users creator_user ON creator_user.id = creator.user_id
     LEFT JOIN member_profiles updater ON updater.id = d.updated_by_member_profile_id
     LEFT JOIN users updater_user ON updater_user.id = updater.user_id
     LEFT JOIN vault_projects p ON p.id = d.related_project_id
     WHERE d.id = ?`
  ).bind(id));
  const document = rows[0];
  if (!document || document.is_archived) return c.json({ success: false, error: 'Document not found' }, 404);
  const access = await vaultAccess(c, document.section_slug, 'view');
  if (access.response) return access.response;
  const canViewProjects = await hasVaultPermission(c.env.DB, access.actor!, 'projects', 'view');
  const parsed = parseStoredDocumentContent(document.content_json, document.content || '');
  return c.json({ success: true, data: {
    ...document,
    ...(canViewProjects ? {} : { related_project_id: null, related_project_title: null }),
    contentJson: { version: 1, blocks: parsed.blocks },
    tags: await documentTags(c.env.DB, id),
    attachments: await documentAttachments(c.env.DB, id),
  } });
});

app.get('/api/vault/documents/:id/download', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id.' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.*, s.slug AS section_slug, s.title AS section_title
     FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
  ).bind(id));
  const document = rows[0];
  if (!document || document.is_archived) return c.json({ success: false, error: 'Document not found.' }, 404);
  const access = await vaultAccess(c, document.section_slug, 'view');
  if (access.response) return access.response;
  const capability = await sharingCapability(c.env.DB, access.actor!);
  if (!capability.canDownload) {
    return c.json({ success: false, error: 'PHANTOM has not enabled document downloads for this account.' }, 403);
  }
  return documentDownloadResponse(document, document.section_title);
});

app.post('/api/vault/documents', requireAuth, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const slug = cleanStr(body.section, 1, 60);
    const title = cleanStr(body.title, 2, 180);
    const fileKey = cleanOptionalStr(body.fileKey, 500);
    const visibility = body.visibility === 'members' || body.visibility === 'restricted' ? body.visibility : 'section';
    if (!slug || !title) return c.json({ success: false, error: 'Section and document title are required' }, 400);
    const access = await vaultAccess(c, slug, 'create');
    if (access.response) return access.response;
    const actor = access.actor!;
    const content = normalizeDocumentContent(body.contentJson ?? body.content, cleanOptionalStr(body.content, 100_000) || '');
    const tags = normalizeTags(body.tags);
    const suppliedStatus = body.status === undefined ? null : requestedDocumentStatus(body.status);
    if (body.status !== undefined && (!suppliedStatus || !DOCUMENT_STATUSES.has(suppliedStatus))) {
      return c.json({ success: false, error: 'Choose a valid document status.' }, 400);
    }
    const status = documentStatus(body.status, 'draft');
    if (status === 'archived') {
      return c.json({ success: false, error: 'Use the archive action to archive a document so it can be restored safely.' }, 400);
    }
    if (status !== 'draft' && status !== 'in_review' && !await hasVaultPermission(c.env.DB, actor, slug, 'manage')) {
      return c.json({ success: false, error: 'Only a section manager can create an approved or active document.' }, 403);
    }
    const relatedProjectId = documentProjectId(body.relatedProjectId);
    if (body.relatedProjectId !== undefined && body.relatedProjectId !== null && !relatedProjectId) {
      return c.json({ success: false, error: 'Choose a valid related Vault project.' }, 400);
    }
    const projectIssue = await validateActiveProjectReference(c.env.DB, actor, relatedProjectId);
    if (projectIssue) return c.json({ success: false, error: projectIssue.error }, projectIssue.status);
    const documentCode = await allocateDocumentCode(c.env.DB);
    const created = await c.env.DB.prepare(
      `INSERT INTO vault_documents (document_code, section_id, title, content, content_json, content_format, status, tags_json, related_project_id, word_count, last_saved_at, visibility, file_key, created_by_member_profile_id, updated_by_member_profile_id)
       VALUES (?, ?, ?, ?, ?, 'blocks', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`
    ).bind(documentCode, access.section.id, title, content.plainText, content.contentJson, status, JSON.stringify(tags), relatedProjectId, content.wordCount, visibility, fileKey, actor.profileId, actor.profileId).run();
    const documentId = Number(created.meta.last_row_id);
    for (const attachmentId of attachmentIdsFromBlocks(content.blocks)) {
      await c.env.DB.prepare('UPDATE vault_attachments SET document_id = ? WHERE id = ? AND section_id = ?').bind(documentId, attachmentId, access.section.id).run();
    }
    await syncDocumentTags(c.env.DB, documentId, tags);
    await c.env.DB.prepare(
      `INSERT INTO document_versions (document_id, version_number, title, content, content_json, status, tags_json, related_project_id, word_count, file_key, changed_by_member_profile_id, change_note)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(documentId, title, content.plainText, content.contentJson, status, JSON.stringify(tags), relatedProjectId, content.wordCount, fileKey, actor.profileId, 'Initial version').run();
    await recordVaultActivity(c.env.DB, actor, 'document.created', access.section.id, documentId, { section: slug, title, documentCode, status, tags });
    if (content.wordCount >= 25) {
      await awardAutomaticScore({
        db: c.env.DB,
        memberProfileId: actor.profileId,
        ruleKey: 'vault.document_created',
        referenceType: 'vault_document',
        referenceId: documentId,
        actor,
        metadata: { documentCode, wordCount: content.wordCount, section: slug },
      });
    }
    return c.json({ success: true, data: { id: documentId, documentCode, version: 1 }, message: 'Vault document created' });
  } catch (error) {
    console.error('[code-rx] create vault document error:', error);
    return c.json({ success: false, error: 'Could not create the Vault document' }, 500);
  }
});

app.patch('/api/vault/documents/:id', requireAuth, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id' }, 400);
    const rows = await dbRows<any>(c.env.DB.prepare(
      `SELECT d.*, s.slug AS section_slug FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
    ).bind(id));
    const document = rows[0];
    if (!document || document.is_archived) return c.json({ success: false, error: 'Document not found' }, 404);
    const access = await vaultAccess(c, document.section_slug, 'edit');
    if (access.response) return access.response;
    const actor = access.actor!;
    const body = await c.req.json().catch(() => ({}));
    const title = body.title === undefined ? document.title : cleanStr(body.title, 2, 180);
    if (!title) return c.json({ success: false, error: 'A valid title is required' }, 400);
    const currentContent = parseStoredDocumentContent(document.content_json, document.content || '');
    const changedContent = body.contentJson !== undefined || body.content !== undefined;
    const content = changedContent ? normalizeDocumentContent(body.contentJson ?? body.content, cleanOptionalStr(body.content, 100_000) || '') : currentContent;
    const tags = body.tags === undefined ? normalizeTags(document.tags_json) : normalizeTags(body.tags);
    const suppliedStatus = body.status === undefined ? null : requestedDocumentStatus(body.status);
    if (body.status !== undefined && (!suppliedStatus || !DOCUMENT_STATUSES.has(suppliedStatus))) {
      return c.json({ success: false, error: 'Choose a valid document status.' }, 400);
    }
    const status = body.status === undefined ? document.status : documentStatus(body.status, document.status || 'draft');
    if (status === 'archived') {
      return c.json({ success: false, error: 'Use the archive action to archive a document so it can be restored safely.' }, 400);
    }
    if (status !== document.status && ['approved', 'active'].includes(status) && !await hasVaultPermission(c.env.DB, actor, document.section_slug, 'manage')) {
      return c.json({ success: false, error: 'Only a section manager can change this document to approved or active.' }, 403);
    }
    const visibility = body.visibility === undefined ? document.visibility : (body.visibility === 'members' || body.visibility === 'restricted' ? body.visibility : 'section');
    const relatedProjectId = body.relatedProjectId === undefined ? document.related_project_id : documentProjectId(body.relatedProjectId);
    if (body.relatedProjectId !== undefined && body.relatedProjectId !== null && !relatedProjectId) {
      return c.json({ success: false, error: 'Choose a valid related Vault project.' }, 400);
    }
    if (body.relatedProjectId !== undefined) {
      const projectIssue = await validateActiveProjectReference(c.env.DB, actor, relatedProjectId);
      if (projectIssue) return c.json({ success: false, error: projectIssue.error }, projectIssue.status);
    }
    const fileKey = body.fileKey === undefined ? document.file_key : cleanOptionalStr(body.fileKey, 500);
    const note = cleanOptionalStr(body.changeNote, 1000) || (body.autosave ? 'Autosaved document update' : 'Updated document');
    const versionRows = await dbRows<any>(c.env.DB.prepare('SELECT MAX(version_number) AS version FROM document_versions WHERE document_id = ?').bind(id));
    const version = Number(versionRows[0]?.version || 0) + 1;
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE vault_documents SET title = ?, content = ?, content_json = ?, content_format = 'blocks', status = ?, visibility = ?, tags_json = ?, related_project_id = ?, word_count = ?, file_key = ?, updated_by_member_profile_id = ?, last_saved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(title, content.plainText, content.contentJson, status, visibility, JSON.stringify(tags), relatedProjectId, content.wordCount, fileKey, actor.profileId, id),
      c.env.DB.prepare(
        `INSERT INTO document_versions (document_id, version_number, title, content, content_json, status, tags_json, related_project_id, word_count, file_key, changed_by_member_profile_id, change_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, version, title, content.plainText, content.contentJson, status, JSON.stringify(tags), relatedProjectId, content.wordCount, fileKey, actor.profileId, note),
    ]);
    for (const attachmentId of attachmentIdsFromBlocks(content.blocks)) {
      await c.env.DB.prepare('UPDATE vault_attachments SET document_id = ? WHERE id = ? AND section_id = ?').bind(id, attachmentId, access.section.id).run();
    }
    await syncDocumentTags(c.env.DB, id, tags);
    await recordVaultActivity(c.env.DB, actor, body.autosave ? 'document.autosaved' : 'document.edited', access.section.id, id, { section: document.section_slug, version, note, status, tags });
    if (status !== document.status && (status === 'approved' || status === 'active')) {
      await awardAutomaticScore({
        db: c.env.DB,
        memberProfileId: document.created_by_member_profile_id || actor.profileId,
        ruleKey: 'vault.document_approved',
        referenceType: 'vault_document',
        referenceId: id,
        actor,
        metadata: { status, version, section: document.section_slug },
      });
    }
    return c.json({ success: true, message: body.autosave ? 'Autosaved' : 'Vault document updated', data: { version, wordCount: content.wordCount } });
  } catch (error) {
    console.error('[code-rx] update vault document error:', error);
    return c.json({ success: false, error: 'Could not update the Vault document' }, 500);
  }
});

app.delete('/api/vault/documents/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.id, d.section_id, d.is_archived, d.status, d.archived_from_status, s.slug AS section_slug
     FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
  ).bind(id));
  const document = rows[0];
  if (!document || document.is_archived) return c.json({ success: false, error: 'Active document not found' }, 404);
  const access = await vaultAccess(c, document.section_slug, 'delete');
  if (access.response) return access.response;
  await c.env.DB.prepare(
    `UPDATE vault_documents
     SET is_archived = 1,
         archived_from_status = CASE
           WHEN status IN ('draft', 'in_review', 'approved', 'active') THEN status
           WHEN archived_from_status IN ('draft', 'in_review', 'approved', 'active') THEN archived_from_status
           ELSE 'draft'
         END,
         archived_at = CURRENT_TIMESTAMP, status = 'archived', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(id).run();
  await recordVaultActivity(c.env.DB, access.actor, 'document.archived', document.section_id, id, { section: document.section_slug });
  return c.json({ success: true, message: 'Document archived. Its history remains preserved.' });
});

app.post('/api/vault/documents/:id/unarchive', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.id, d.section_id, d.is_archived, d.archived_from_status, s.slug AS section_slug FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
  ).bind(id));
  const document = rows[0];
  if (!document || !document.is_archived) return c.json({ success: false, error: 'Archived document not found' }, 404);
  const access = await vaultAccess(c, document.section_slug, 'manage');
  if (access.response) return access.response;
  const restoredStatus = document.archived_from_status && document.archived_from_status !== 'archived' ? document.archived_from_status : 'draft';
  await c.env.DB.prepare("UPDATE vault_documents SET is_archived = 0, status = ?, archived_from_status = NULL, archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(restoredStatus, id).run();
  await recordVaultActivity(c.env.DB, access.actor, 'document.unarchived', document.section_id, id, { section: document.section_slug, restoredStatus });
  return c.json({ success: true, message: 'Document restored from archive.', data: { status: restoredStatus } });
});

app.get('/api/vault/documents/:id/versions', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.id, s.slug AS section_slug FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
  ).bind(id));
  const document = rows[0];
  if (!document) return c.json({ success: false, error: 'Document not found' }, 404);
  const access = await vaultAccess(c, document.section_slug, 'view');
  if (access.response) return access.response;
  const versions = await dbRows<any>(c.env.DB.prepare(
    `SELECT version_number, title, status, tags_json, related_project_id, word_count, change_note, created_at, changed_by_member_profile_id
     FROM document_versions WHERE document_id = ? ORDER BY version_number DESC`
  ).bind(id));
  return c.json({ success: true, data: versions });
});

app.get('/api/vault/documents/:id/versions/:version', requireAuth, async (c) => {
  const id = Number(c.req.param('id')); const version = Number(c.req.param('version'));
  if (!Number.isInteger(id) || !Number.isInteger(version)) return c.json({ success: false, error: 'Invalid document version.' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT v.*, d.section_id, s.slug AS section_slug FROM document_versions v
     JOIN vault_documents d ON d.id = v.document_id JOIN vault_sections s ON s.id = d.section_id
     WHERE v.document_id = ? AND v.version_number = ?`
  ).bind(id, version));
  const snapshot = rows[0];
  if (!snapshot) return c.json({ success: false, error: 'Version not found.' }, 404);
  const access = await vaultAccess(c, snapshot.section_slug, 'view');
  if (access.response) return access.response;
  const parsed = parseStoredDocumentContent(snapshot.content_json, snapshot.content || '');
  return c.json({ success: true, data: { ...snapshot, contentJson: { version: 1, blocks: parsed.blocks }, tags: normalizeTags(snapshot.tags_json) } });
});

app.post('/api/vault/documents/:id/restore/:version', requireAuth, async (c) => {
  const id = Number(c.req.param('id')); const version = Number(c.req.param('version'));
  if (!Number.isInteger(id) || !Number.isInteger(version)) return c.json({ success: false, error: 'Invalid document version.' }, 400);
  const currentRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.*, s.slug AS section_slug FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
  ).bind(id));
  const current = currentRows[0];
  if (!current) return c.json({ success: false, error: 'Document not found.' }, 404);
  if (current.is_archived) return c.json({ success: false, error: 'Unarchive this document before restoring a version.' }, 409);
  const access = await vaultAccess(c, current.section_slug, 'manage');
  if (access.response) return access.response;
  const snapshotRows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM document_versions WHERE document_id = ? AND version_number = ?').bind(id, version));
  const snapshot = snapshotRows[0];
  if (!snapshot) return c.json({ success: false, error: 'Version not found.' }, 404);
  const actor = access.actor!;
  const content = parseStoredDocumentContent(snapshot.content_json, snapshot.content || '');
  const tags = normalizeTags(snapshot.tags_json);
  const restoredStatus = ACTIVE_DOCUMENT_STATUSES.has(snapshot.status) ? snapshot.status : 'draft';
  const versionRows = await dbRows<any>(c.env.DB.prepare('SELECT MAX(version_number) AS version FROM document_versions WHERE document_id = ?').bind(id));
  const restoredVersion = Number(versionRows[0]?.version || 0) + 1;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE vault_documents SET title = ?, content = ?, content_json = ?, content_format = 'blocks', status = ?, tags_json = ?, related_project_id = ?, word_count = ?, file_key = ?, updated_by_member_profile_id = ?, last_saved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(snapshot.title, content.plainText, content.contentJson, restoredStatus, JSON.stringify(tags), snapshot.related_project_id ?? null, Number(snapshot.word_count || content.wordCount), snapshot.file_key ?? null, actor.profileId, id),
    c.env.DB.prepare(
      `INSERT INTO document_versions (document_id, version_number, title, content, content_json, status, tags_json, related_project_id, word_count, file_key, changed_by_member_profile_id, change_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, restoredVersion, snapshot.title, content.plainText, content.contentJson, restoredStatus, JSON.stringify(tags), snapshot.related_project_id ?? null, Number(snapshot.word_count || content.wordCount), snapshot.file_key ?? null, actor.profileId, `Restored from version ${version}`),
  ]);
  await syncDocumentTags(c.env.DB, id, tags);
  await recordVaultActivity(c.env.DB, actor, 'document.restored', current.section_id, id, { fromVersion: version, restoredVersion });
  return c.json({ success: true, data: { version: restoredVersion }, message: `Restored version ${version} as version ${restoredVersion}.` });
});

// ============================================
// 🔗 VAULT DOCUMENT SHARING
// ============================================

app.get('/api/vault/sharing/status', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  return c.json({ success: true, data: await sharingCapability(c.env.DB, access.actor!) });
});

app.get('/api/phantom/sharing', requireAuth, requirePhantom, async (c) => {
  const globalEnabled = (await settingValue(c.env.DB, 'vault_sharing_enabled', '0')) === '1';
  const downloadsGloballyEnabled = (await settingValue(c.env.DB, 'vault_downloads_enabled', '0')) === '1';
  const permissions = await dbRows<any>(c.env.DB.prepare(
    `SELECT msp.member_profile_id, msp.can_share, msp.can_download, msp.updated_at, mp.member_code, mp.status AS member_status,
       u.name, u.email, r.code AS role_code, r.name AS role_name
     FROM member_share_permissions msp
     JOIN member_profiles mp ON mp.id = msp.member_profile_id
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     ORDER BY u.name COLLATE NOCASE`
  ));
  return c.json({ success: true, data: { globalEnabled, downloadsGloballyEnabled, permissions } });
});

app.put('/api/phantom/sharing/global', requireAuth, requirePhantom, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.enabled !== 'boolean') return c.json({ success: false, error: 'Sharing enabled must be true or false.' }, 400);
  const actor = await actorFromContext(c);
  await c.env.DB.prepare(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by_user_id, updated_at)
     VALUES ('vault_sharing_enabled', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(body.enabled ? '1' : '0', actor?.userId ?? null).run();
  await audit(c.env.DB, actor, body.enabled ? 'vault.sharing.global_enabled' : 'vault.sharing.global_disabled', 'system_setting', 'vault_sharing_enabled');
  return c.json({ success: true, message: body.enabled ? 'Vault sharing is enabled globally.' : 'Vault sharing is disabled globally. Existing public links are paused.' });
});

app.put('/api/phantom/downloads/global', requireAuth, requirePhantom, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.enabled !== 'boolean') return c.json({ success: false, error: 'Downloads enabled must be true or false.' }, 400);
  const actor = await actorFromContext(c);
  await c.env.DB.prepare(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by_user_id, updated_at)
     VALUES ('vault_downloads_enabled', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(body.enabled ? '1' : '0', actor?.userId ?? null).run();
  await audit(c.env.DB, actor, body.enabled ? 'vault.downloads.global_enabled' : 'vault.downloads.global_disabled', 'system_setting', 'vault_downloads_enabled');
  return c.json({ success: true, message: body.enabled ? 'Vault downloads are enabled globally.' : 'Vault downloads are disabled globally. Existing share links remain view-only.' });
});

app.put('/api/phantom/members/:id/sharing', requireAuth, requirePhantom, async (c) => {
  const profileId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(profileId) || profileId < 1 || typeof body.canShare !== 'boolean') {
    return c.json({ success: false, error: 'Choose a member and a true/false share permission.' }, 400);
  }
  const target = await dbRows<any>(c.env.DB.prepare(
    `SELECT mp.id, mp.status, r.code AS role_code FROM member_profiles mp
     LEFT JOIN roles r ON r.id = mp.primary_role_id WHERE mp.id = ?`
  ).bind(profileId));
  if (!target[0]) return c.json({ success: false, error: 'Member profile not found.' }, 404);
  if (target[0].role_code === 'phantom') return c.json({ success: false, error: 'PHANTOM sharing is controlled by the global master switch.' }, 403);
  if (target[0].status !== 'active') return c.json({ success: false, error: 'Only active members can receive document-sharing access.' }, 409);
  const actor = await actorFromContext(c);
  await c.env.DB.prepare(
    `INSERT INTO member_share_permissions (member_profile_id, can_share, updated_by_user_id, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(member_profile_id) DO UPDATE SET can_share = excluded.can_share, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(profileId, body.canShare ? 1 : 0, actor?.userId ?? null).run();
  await audit(c.env.DB, actor, body.canShare ? 'vault.sharing.member_enabled' : 'vault.sharing.member_disabled', 'member_profile', profileId);
  return c.json({ success: true, message: body.canShare ? 'Document sharing enabled for this member.' : 'Document sharing disabled for this member. Their existing links are paused.' });
});

app.put('/api/phantom/members/:id/downloads', requireAuth, requirePhantom, async (c) => {
  const profileId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(profileId) || profileId < 1 || typeof body.canDownload !== 'boolean') {
    return c.json({ success: false, error: 'Choose a member and a true/false download permission.' }, 400);
  }
  const target = await dbRows<any>(c.env.DB.prepare(
    `SELECT mp.id, mp.status, r.code AS role_code FROM member_profiles mp
     LEFT JOIN roles r ON r.id = mp.primary_role_id WHERE mp.id = ?`
  ).bind(profileId));
  if (!target[0]) return c.json({ success: false, error: 'Member profile not found.' }, 404);
  if (target[0].role_code === 'phantom') return c.json({ success: false, error: 'PHANTOM downloads are controlled by the global master switch.' }, 403);
  if (target[0].status !== 'active') return c.json({ success: false, error: 'Only active members can receive document-download access.' }, 409);
  const actor = await actorFromContext(c);
  await c.env.DB.prepare(
    `INSERT INTO member_share_permissions (member_profile_id, can_share, can_download, updated_by_user_id, updated_at)
     VALUES (?, 0, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(member_profile_id) DO UPDATE SET can_download = excluded.can_download, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(profileId, body.canDownload ? 1 : 0, actor?.userId ?? null).run();
  await audit(c.env.DB, actor, body.canDownload ? 'vault.downloads.member_enabled' : 'vault.downloads.member_disabled', 'member_profile', profileId);
  return c.json({ success: true, message: body.canDownload ? 'Document downloads enabled for this member.' : 'Document downloads disabled for this member.' });
});

const shareableDocumentAccess = async (c: any, documentId: number) => {
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.*, s.slug AS section_slug, s.is_sensitive, s.is_archived AS section_archived, s.title AS section_title
     FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
  ).bind(documentId));
  const document = rows[0];
  if (!document || document.is_archived || document.section_archived) return { document: null, actor: null, response: c.json({ success: false, error: 'Active document not found.' }, 404) };
  const access = await vaultAccess(c, document.section_slug, 'edit');
  if (access.response) return { document: null, actor: null, response: access.response };
  return { document, actor: access.actor!, response: null };
};

app.get('/api/vault/documents/:id/shares', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id.' }, 400);
  const access = await shareableDocumentAccess(c, id);
  if (access.response) return access.response;
  const capability = await sharingCapability(c.env.DB, access.actor!);
  const rawShares = await dbRows<any>(c.env.DB.prepare(
    `SELECT vs.id, vs.status, vs.allow_download, vs.expires_at, vs.last_accessed_at, vs.created_at,
       vs.created_by_member_profile_id, vs.token_hash, vs.token_ciphertext,
       creator.status AS creator_status, creator_role.code AS creator_role_code, msp.can_download
     FROM vault_shares vs
     LEFT JOIN member_profiles creator ON creator.id = vs.created_by_member_profile_id
     LEFT JOIN roles creator_role ON creator_role.id = creator.primary_role_id
     LEFT JOIN member_share_permissions msp ON msp.member_profile_id = creator.id
     WHERE vs.document_id = ? ${access.actor!.isPhantom ? '' : 'AND vs.created_by_member_profile_id = ?'}
     ORDER BY vs.created_at DESC`
  ).bind(...(access.actor!.isPhantom ? [id] : [id, access.actor!.profileId])));
  const shares = await Promise.all(rawShares.map(async (share) => {
    const shareUrl = share.status === 'active' ? await recoverVaultShareUrl(c.env, share) : null;
    const downloadStatus = share.status === 'active'
      ? shareDownloadStatus(share, capability.downloadsGloballyEnabled)
      : 'link_disabled' as ShareDownloadStatus;
    return {
      id: share.id,
      status: share.status,
      allow_download: Number(share.allow_download || 0),
      expires_at: share.expires_at || null,
      last_accessed_at: share.last_accessed_at || null,
      created_at: share.created_at,
      created_by_member_profile_id: share.created_by_member_profile_id,
      downloadStatus,
      shareUrl,
      copyAvailable: Boolean(shareUrl),
      replacementRequired: share.status === 'active' && !shareUrl,
    };
  }));
  return c.json({ success: true, data: { capability, shares } });
});

app.post('/api/vault/documents/:id/shares', requireAuth, async (c) => {
  if (!checkRateLimit(c, 20, 60)) return c.json({ success: false, error: 'Too many share-link requests. Please wait a minute.' }, 429);
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id.' }, 400);
    const access = await shareableDocumentAccess(c, id);
    if (access.response) return access.response;
    const capability = await sharingCapability(c.env.DB, access.actor!);
    if (!capability.canShare) return c.json({ success: false, error: 'PHANTOM has not enabled Vault sharing for this account.' }, 403);
    if (access.document!.is_sensitive || access.document!.visibility === 'restricted') {
      return c.json({ success: false, error: 'Sensitive or restricted Vault documents cannot be shared publicly.' }, 409);
    }
    const body = await c.req.json().catch(() => ({}));
    const allowDownload = body.allowDownload === true;
    const requestedExpiry = body.expiresInDays;
    const noExpiry = requestedExpiry === undefined || requestedExpiry === null || requestedExpiry === ''
      || requestedExpiry === 0 || requestedExpiry === '0' || requestedExpiry === 'never';
    let expiresAt: string | null = null;
    if (!noExpiry) {
      const expiresInDays = Number(requestedExpiry);
      if (!Number.isInteger(expiresInDays) || !SHARE_EXPIRY_DAYS.has(expiresInDays)) {
        return c.json({ success: false, error: 'Choose No expiry, 1 day, 7 days, 30 days, or 90 days.' }, 400);
      }
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    }

    // A PHANTOM choosing "Allow download and print" expects that choice to
    // work immediately. Turn on the master switch for that deliberate action;
    // PHANTOM can still pause every public download later from Document Sharing.
    if (allowDownload && !capability.canDownload) {
      if (!access.actor!.isPhantom) {
        return c.json({ success: false, error: 'Download and print have not been enabled for this account. Ask PHANTOM to enable download access first.' }, 403);
      }
      await c.env.DB.prepare(
        `INSERT INTO system_settings (setting_key, setting_value, updated_by_user_id, updated_at)
         VALUES ('vault_downloads_enabled', '1', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
      ).bind(access.actor!.userId).run();
      await audit(c.env.DB, access.actor, 'vault.downloads.global_enabled', 'system_setting', 'vault_downloads_enabled', { source: 'share_link_download_enabled' });
    }

    const token = randomToken();
    const tokenCiphertext = await encryptVaultShareToken(token, c.env.JWT_SECRET);
    const created = await c.env.DB.prepare(
      `INSERT INTO vault_shares (document_id, token_hash, token_ciphertext, created_by_member_profile_id, status, allow_download, expires_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    ).bind(id, await sha256Hex(token), tokenCiphertext, access.actor!.profileId, allowDownload ? 1 : 0, expiresAt).run();
    const shareId = Number(created.meta.last_row_id);
    const shareUrl = publicVaultShareUrl(c.env, token);
    await audit(c.env.DB, access.actor, 'vault.document.shared', 'vault_document', id, {
      shareId,
      documentCode: access.document!.document_code || null,
      allowDownload,
      expiresAt,
    });
    return c.json({ success: true, data: { id: shareId, shareUrl, allowDownload, expiresAt }, message: 'Read-only share link created. You can revoke it whenever access should end.' }, 201);
  } catch (error) {
    console.error('[code-rx] create Vault share error:', error);
    return c.json({ success: false, error: 'Could not create this share link.' }, 500);
  }
});

// Links created before encrypted token recovery existed contain only a one-way
// hash. An owner can explicitly replace one of those legacy links, preserving
// its download and expiry policy while immediately invalidating the old URL.
app.post('/api/vault/documents/:id/shares/:shareId/replace', requireAuth, async (c) => {
  if (!checkRateLimit(c, 10, 60)) return c.json({ success: false, error: 'Too many link replacement requests. Please wait a minute.' }, 429);
  try {
    const id = Number(c.req.param('id'));
    const shareId = Number(c.req.param('shareId'));
    if (!Number.isInteger(id) || !Number.isInteger(shareId) || id < 1 || shareId < 1) {
      return c.json({ success: false, error: 'Invalid document or share id.' }, 400);
    }
    const access = await shareableDocumentAccess(c, id);
    if (access.response) return access.response;
    const shares = await dbRows<{ id: number; allow_download: number; expires_at: string | null }>(c.env.DB.prepare(
      `SELECT id, allow_download, expires_at FROM vault_shares
       WHERE id = ? AND document_id = ? AND status = 'active' ${access.actor!.isPhantom ? '' : 'AND created_by_member_profile_id = ?'}`
    ).bind(...(access.actor!.isPhantom ? [shareId, id] : [shareId, id, access.actor!.profileId])));
    const share = shares[0];
    if (!share) return c.json({ success: false, error: 'Active share link not found.' }, 404);

    const token = randomToken();
    const tokenCiphertext = await encryptVaultShareToken(token, c.env.JWT_SECRET);
    const result = await c.env.DB.prepare(
      `UPDATE vault_shares SET token_hash = ?, token_ciphertext = ?, last_accessed_at = NULL
       WHERE id = ? AND document_id = ? AND status = 'active' ${access.actor!.isPhantom ? '' : 'AND created_by_member_profile_id = ?'}`
    ).bind(...(access.actor!.isPhantom
      ? [await sha256Hex(token), tokenCiphertext, shareId, id]
      : [await sha256Hex(token), tokenCiphertext, shareId, id, access.actor!.profileId]
    )).run();
    if (Number(result.meta.changes || 0) !== 1) return c.json({ success: false, error: 'The share link changed before it could be replaced. Refresh and try again.' }, 409);

    await audit(c.env.DB, access.actor, 'vault.document.share_replaced', 'vault_document', id, {
      shareId,
      documentCode: access.document!.document_code || null,
      allowDownload: Number(share.allow_download || 0) === 1,
      expiresAt: share.expires_at || null,
    });
    return c.json({
      success: true,
      data: { id: shareId, shareUrl: publicVaultShareUrl(c.env, token), allowDownload: Number(share.allow_download || 0) === 1 },
      message: 'A new copyable link is ready. The previous URL no longer works.',
    });
  } catch (error) {
    console.error('[code-rx] replace Vault share error:', error);
    return c.json({ success: false, error: 'Could not replace this share link.' }, 500);
  }
});

app.post('/api/vault/documents/:id/shares/:shareId/revoke', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const shareId = Number(c.req.param('shareId'));
  if (!Number.isInteger(id) || !Number.isInteger(shareId) || id < 1 || shareId < 1) {
    return c.json({ success: false, error: 'Invalid document or share id.' }, 400);
  }
  const access = await shareableDocumentAccess(c, id);
  if (access.response) return access.response;
  const result = await c.env.DB.prepare(
    `UPDATE vault_shares SET status = 'revoked'
     WHERE id = ? AND document_id = ? ${access.actor!.isPhantom ? '' : 'AND created_by_member_profile_id = ?'} AND status = 'active'`
  ).bind(...(access.actor!.isPhantom ? [shareId, id] : [shareId, id, access.actor!.profileId])).run();
  if (Number(result.meta.changes || 0) !== 1) return c.json({ success: false, error: 'Active share link not found.' }, 404);
  await audit(c.env.DB, access.actor, 'vault.document.share_revoked', 'vault_document', id, { shareId });
  return c.json({ success: true, message: 'Share link revoked.' });
});

// Public, read-only share endpoint. It returns no attachment keys, protected
// file URLs, private member details, or sensitive/restricted documents.
app.get('/api/vault/shares/:token', async (c) => {
  if (!checkRateLimit(c, 60, 60)) return c.json({ success: false, error: 'Too many share-link requests. Please wait a minute.' }, 429);
  const token = cleanStr(c.req.param('token'), 32, 128);
  if (!token) return c.json({ success: false, error: 'Share link is invalid.' }, 404);
  if ((await settingValue(c.env.DB, 'vault_sharing_enabled', '0')) !== '1') {
    return c.json({ success: false, error: 'Vault sharing is currently paused.' }, 404);
  }
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT vs.id AS share_id, vs.status AS share_status, vs.allow_download, vs.expires_at, vs.created_by_member_profile_id,
       d.id AS document_id, d.document_code, d.title, d.content, d.content_json, d.created_at, d.updated_at,
       d.is_archived, d.visibility, s.title AS section_title, s.is_sensitive, s.is_archived AS section_archived,
       creator.status AS creator_status, creator_role.code AS creator_role_code, msp.can_share, msp.can_download
     FROM vault_shares vs
     JOIN vault_documents d ON d.id = vs.document_id
     JOIN vault_sections s ON s.id = d.section_id
     JOIN member_profiles creator ON creator.id = vs.created_by_member_profile_id
     LEFT JOIN roles creator_role ON creator_role.id = creator.primary_role_id
     LEFT JOIN member_share_permissions msp ON msp.member_profile_id = creator.id
     WHERE vs.token_hash = ? AND vs.status = 'active'`
  ).bind(await sha256Hex(token)));
  const share = rows[0];
  if (!share || share.is_archived || share.section_archived || share.is_sensitive || share.visibility === 'restricted') {
    return c.json({ success: false, error: 'Shared document is unavailable.' }, 404);
  }
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
    return c.json({ success: false, error: 'This share link has expired.' }, 410);
  }
  const creatorCanShare = share.creator_role_code === 'phantom' || (share.creator_status === 'active' && Number(share.can_share || 0) === 1);
  if (!creatorCanShare) return c.json({ success: false, error: 'Shared document is unavailable.' }, 404);
  const downloadsGloballyEnabled = (await settingValue(c.env.DB, 'vault_downloads_enabled', '0')) === '1';
  const downloadStatus = shareDownloadStatus(share, downloadsGloballyEnabled);
  const canDownload = downloadStatus === 'available';
  const parsed = parseStoredDocumentContent(share.content_json, share.content || '');
  const blocks = parsed.blocks
    .filter((block) => block.type !== 'image' && block.type !== 'file')
    .map((block) => block.type === 'embed' && block.url?.startsWith('/api/vault-files/') ? { ...block, url: '' } : block);
  await c.env.DB.prepare('UPDATE vault_shares SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(share.share_id).run();
  return c.json({ success: true, data: {
    documentCode: share.document_code || null,
    title: share.title,
    sectionTitle: share.section_title,
    createdAt: share.created_at,
    updatedAt: share.updated_at,
    canDownload,
    downloadStatus,
    downloadMessage: sharedDownloadMessage(downloadStatus),
    contentJson: { version: 1, blocks },
  } }, 200, { 'Cache-Control': 'private, no-store' });
});

app.get('/api/vault/shares/:token/download', async (c) => {
  if (!checkRateLimit(c, 30, 60)) return c.json({ success: false, error: 'Too many download requests. Please wait a minute.' }, 429);
  const token = cleanStr(c.req.param('token'), 32, 128);
  if (!token) return c.json({ success: false, error: 'Shared document is unavailable.' }, 404);
  const [sharingEnabled, downloadsEnabled] = await Promise.all([
    settingValue(c.env.DB, 'vault_sharing_enabled', '0'),
    settingValue(c.env.DB, 'vault_downloads_enabled', '0'),
  ]);
  if (sharingEnabled !== '1' || downloadsEnabled !== '1') return c.json({ success: false, error: 'Shared document downloads are unavailable.' }, 404);
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT vs.id AS share_id, vs.status AS share_status, vs.allow_download, vs.expires_at,
       d.id AS document_id, d.document_code, d.title, d.content, d.content_json, d.created_at, d.updated_at,
       d.is_archived, d.visibility, s.title AS section_title, s.is_sensitive, s.is_archived AS section_archived,
       creator.status AS creator_status, creator_role.code AS creator_role_code, msp.can_share, msp.can_download
     FROM vault_shares vs
     JOIN vault_documents d ON d.id = vs.document_id
     JOIN vault_sections s ON s.id = d.section_id
     JOIN member_profiles creator ON creator.id = vs.created_by_member_profile_id
     LEFT JOIN roles creator_role ON creator_role.id = creator.primary_role_id
     LEFT JOIN member_share_permissions msp ON msp.member_profile_id = creator.id
     WHERE vs.token_hash = ? AND vs.status = 'active'`
  ).bind(await sha256Hex(token)));
  const share = rows[0];
  if (!share || !Number(share.allow_download || 0) || share.is_archived || share.section_archived || share.is_sensitive || share.visibility === 'restricted') {
    return c.json({ success: false, error: 'Shared document download is unavailable.' }, 404);
  }
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
    return c.json({ success: false, error: 'This share link has expired.' }, 410);
  }
  const creatorCanShare = share.creator_role_code === 'phantom' || (share.creator_status === 'active' && Number(share.can_share || 0) === 1);
  const creatorCanDownload = share.creator_role_code === 'phantom' || (share.creator_status === 'active' && Number(share.can_download || 0) === 1);
  if (!creatorCanShare || !creatorCanDownload) return c.json({ success: false, error: 'Shared document download is unavailable.' }, 404);
  return documentDownloadResponse(share, share.section_title);
});

app.get('/api/vault/projects', requireAuth, async (c) => {
  const archived = c.req.query('archived') === '1';
  const access = await vaultAccess(c, 'projects', archived ? 'manage' : 'view');
  if (access.response) return access.response;
  const projects = await dbRows<any>(c.env.DB.prepare(
    `SELECT p.*, mp.member_code AS lead_member_id, u.name AS lead_name
     FROM vault_projects p
     LEFT JOIN member_profiles mp ON mp.id = p.lead_member_profile_id
     LEFT JOIN users u ON u.id = mp.user_id
     WHERE p.is_archived = ? ORDER BY p.updated_at DESC`
  ).bind(archived ? 1 : 0));
  return c.json({ success: true, data: projects, archived });
});

app.post('/api/vault/projects', requireAuth, async (c) => {
  const access = await vaultAccess(c, 'projects', 'create');
  if (access.response) return access.response;
  const actor = access.actor!;
  const body = await c.req.json().catch(() => ({}));
  const title = cleanStr(body.title, 2, 180);
  if (!title) return c.json({ success: false, error: 'Project title is required' }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO vault_projects (title, status, description, lead_member_profile_id, github_url, documentation_url, timeline, created_by_member_profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    title,
    cleanOptionalStr(body.status, 60) || 'planning',
    cleanOptionalStr(body.description, 10_000) || '',
    Number.isInteger(Number(body.leadMemberProfileId)) ? Number(body.leadMemberProfileId) : actor.profileId,
    cleanOptionalStr(body.githubUrl, 500),
    cleanOptionalStr(body.documentationUrl, 500),
    cleanOptionalStr(body.timeline, 10_000) || '',
    actor.profileId,
  ).run();
  const id = Number(result.meta.last_row_id);
  await audit(c.env.DB, actor, 'vault.project.created', 'vault_project', id, { title });
  await awardAutomaticScore({
    db: c.env.DB,
    memberProfileId: actor.profileId,
    ruleKey: 'vault.project_created',
    referenceType: 'vault_project',
    referenceId: id,
    actor,
    metadata: { title },
  });
  return c.json({ success: true, data: { id }, message: 'Vault project created' });
});

app.patch('/api/vault/projects/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid project id' }, 400);
  const access = await vaultAccess(c, 'projects', 'edit');
  if (access.response) return access.response;
  const actor = access.actor!;
  const body = await c.req.json().catch(() => ({}));
  const currentRows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM vault_projects WHERE id = ?').bind(id));
  const current = currentRows[0];
  if (!current) return c.json({ success: false, error: 'Project not found' }, 404);
  if (body.archive !== undefined) {
    if (typeof body.archive !== 'boolean') return c.json({ success: false, error: 'Project archive must be true or false.' }, 400);
    if (!await hasVaultPermission(c.env.DB, actor, 'projects', 'manage')) return c.json({ success: false, error: 'Only a Projects manager can archive or unarchive projects.' }, 403);
    await c.env.DB.prepare('UPDATE vault_projects SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.archive ? 1 : 0, id).run();
    await audit(c.env.DB, actor, body.archive ? 'vault.project.archived' : 'vault.project.unarchived', 'vault_project', id, { title: current.title });
    return c.json({ success: true, message: body.archive ? 'Project archived.' : 'Project restored from archive.' });
  }
  if (current.is_archived) return c.json({ success: false, error: 'Restore this project before editing it.' }, 409);
  const title = body.title === undefined ? current.title : cleanStr(body.title, 2, 180);
  if (!title) return c.json({ success: false, error: 'A valid project title is required' }, 400);
  await c.env.DB.prepare(
    `UPDATE vault_projects SET title = ?, status = ?, description = ?, github_url = ?, documentation_url = ?, timeline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(
    title,
    body.status === undefined ? current.status : (cleanOptionalStr(body.status, 60) || current.status),
    body.description === undefined ? current.description : (cleanOptionalStr(body.description, 10_000) || ''),
    body.githubUrl === undefined ? current.github_url : cleanOptionalStr(body.githubUrl, 500),
    body.documentationUrl === undefined ? current.documentation_url : cleanOptionalStr(body.documentationUrl, 500),
    body.timeline === undefined ? current.timeline : (cleanOptionalStr(body.timeline, 10_000) || ''),
    id,
  ).run();
  await audit(c.env.DB, actor, 'vault.project.edited', 'vault_project', id, { title });
  return c.json({ success: true, message: 'Vault project updated' });
});

app.get('/api/vault/projects/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid project id' }, 400);
  const access = await vaultAccess(c, 'projects', 'view');
  if (access.response) return access.response;
  const projectRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT p.*, mp.member_code AS lead_member_id, u.name AS lead_name
     FROM vault_projects p LEFT JOIN member_profiles mp ON mp.id = p.lead_member_profile_id
     LEFT JOIN users u ON u.id = mp.user_id WHERE p.id = ? AND p.is_archived = 0`
  ).bind(id));
  const project = projectRows[0];
  if (!project) return c.json({ success: false, error: 'Project not found' }, 404);
  const [members, tasks, meetings, files] = await Promise.all([
    dbRows<any>(c.env.DB.prepare(
      `SELECT pm.*, mp.member_code, u.name FROM vault_project_members pm
       JOIN member_profiles mp ON mp.id = pm.member_profile_id JOIN users u ON u.id = mp.user_id WHERE pm.project_id = ?`
    ).bind(id)),
    dbRows<any>(c.env.DB.prepare('SELECT * FROM vault_tasks WHERE project_id = ? ORDER BY status, due_at, id').bind(id)),
    dbRows<any>(c.env.DB.prepare('SELECT id, title, held_at, agenda, notes FROM meetings WHERE project_id = ? AND is_archived = 0 ORDER BY held_at DESC').bind(id)),
    dbRows<any>(c.env.DB.prepare('SELECT id, name, file_key, created_at FROM vault_project_files WHERE project_id = ? ORDER BY created_at DESC').bind(id)),
  ]);
  return c.json({ success: true, data: { project, members, tasks, meetings, files } });
});

app.post('/api/vault/projects/:id/tasks', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid project id' }, 400);
  const access = await vaultAccess(c, 'projects', 'create');
  if (access.response) return access.response;
  const projectRows = await dbRows<any>(c.env.DB.prepare('SELECT id, is_archived FROM vault_projects WHERE id = ?').bind(id));
  if (!projectRows[0]) return c.json({ success: false, error: 'Project not found' }, 404);
  if (projectRows[0].is_archived) return c.json({ success: false, error: 'Restore this project before adding tasks.' }, 409);
  const body = await c.req.json().catch(() => ({}));
  const title = cleanStr(body.title, 2, 180);
  if (!title) return c.json({ success: false, error: 'Task title is required' }, 400);
  const result = await c.env.DB.prepare(
    'INSERT INTO vault_tasks (project_id, title, description, status, assigned_member_profile_id, due_at, created_by_member_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, title, cleanOptionalStr(body.description, 10_000) || '', cleanOptionalStr(body.status, 50) || 'todo',
    Number.isInteger(Number(body.assignedMemberProfileId)) ? Number(body.assignedMemberProfileId) : null,
    cleanOptionalStr(body.dueAt, 80), access.actor!.profileId).run();
  const taskId = Number(result.meta.last_row_id);
  await audit(c.env.DB, access.actor, 'vault.project.task.created', 'vault_task', taskId, { projectId: id, title });
  return c.json({ success: true, data: { id: taskId } }, 201);
});

app.get('/api/vault/meetings', requireAuth, async (c) => {
  const access = await vaultAccess(c, 'meetings', 'view');
  if (access.response) return access.response;
  const meetings = await dbRows<any>(c.env.DB.prepare(
    'SELECT id, project_id, title, held_at, agenda, notes, visibility, created_at FROM meetings WHERE is_archived = 0 ORDER BY held_at DESC'
  ));
  return c.json({ success: true, data: meetings });
});

app.post('/api/vault/meetings', requireAuth, async (c) => {
  const access = await vaultAccess(c, 'meetings', 'create');
  if (access.response) return access.response;
  const body = await c.req.json().catch(() => ({}));
  const title = cleanStr(body.title, 2, 180);
  const heldAt = cleanStr(body.heldAt, 8, 80);
  if (!title || !heldAt) return c.json({ success: false, error: 'Meeting title and date are required' }, 400);
  const projectId = documentProjectId(body.projectId);
  if (body.projectId !== undefined && body.projectId !== null && !projectId) {
    return c.json({ success: false, error: 'Choose a valid linked Vault project.' }, 400);
  }
  const projectIssue = await validateActiveProjectReference(c.env.DB, access.actor!, projectId);
  if (projectIssue) return c.json({ success: false, error: projectIssue.error }, projectIssue.status);
  const sectionRows = await dbRows<any>(c.env.DB.prepare("SELECT id FROM vault_sections WHERE slug = 'meetings'"));
  const result = await c.env.DB.prepare(
    'INSERT INTO meetings (section_id, project_id, title, held_at, agenda, notes, visibility, created_by_member_profile_id, updated_by_member_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(sectionRows[0]?.id || null, projectId, title, heldAt,
    cleanOptionalStr(body.agenda, 10_000) || '', cleanOptionalStr(body.notes, 50_000) || '', body.visibility === 'restricted' ? 'restricted' : 'members', access.actor!.profileId, access.actor!.profileId).run();
  const meetingId = Number(result.meta.last_row_id);
  await audit(c.env.DB, access.actor, 'vault.meeting.created', 'meeting', meetingId, { title, projectId: body.projectId || null });
  return c.json({ success: true, data: { id: meetingId } }, 201);
});

// ============================================
// 👁️ PHANTOM CONTROL CENTER
// ============================================

// ============================================
// 🔐 COMMUNITY: PRIVATE CODE RX MESSAGING
// ============================================

app.get('/api/community/members', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const query = cleanOptionalStr(c.req.query('q'), 80)?.toLowerCase();
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT mp.id, mp.member_code, c.display_name AS codename,
       CASE WHEN mp.id = ? THEN 1 ELSE 0 END AS is_self
     FROM member_profiles mp
     LEFT JOIN codenames c ON c.claimed_by_member_profile_id = mp.id AND c.status = 'claimed'
     WHERE mp.status = 'active' AND mp.id != ? ${query ? "AND (LOWER(COALESCE(c.display_name, mp.member_code)) LIKE ?)" : ''}
     ORDER BY CASE WHEN c.display_name IS NULL THEN 1 ELSE 0 END, c.display_name COLLATE NOCASE, mp.member_code LIMIT 100`
  ).bind(...(query ? [access.actor!.profileId, access.actor!.profileId, `%${query}%`] : [access.actor!.profileId, access.actor!.profileId])));
  return c.json({ success: true, data: rows.map((row) => ({ id: Number(row.id), codename: row.codename || row.member_code, memberCode: row.member_code, isSelf: Number(row.is_self) === 1 })) });
});

app.get('/api/community/conversations', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const rows = await dbRows<{ conversation_id: number }>(c.env.DB.prepare(
    `SELECT conversation_id FROM community_conversation_members
     WHERE member_profile_id = ? AND membership_status = 'active' ORDER BY joined_at DESC LIMIT 100`
  ).bind(access.actor!.profileId));
  const conversations = (await Promise.all(rows.map((row) => communityConversationSummary(c.env.DB, row.conversation_id, access.actor!)))).filter(Boolean);
  return c.json({ success: true, data: conversations.sort((left: any, right: any) => String(right.latest_at || '').localeCompare(String(left.latest_at || ''))) });
});

app.post('/api/community/dms/:profileId', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const targetId = Number(c.req.param('profileId'));
  if (!Number.isInteger(targetId) || targetId < 1 || targetId === access.actor!.profileId) return c.json({ success: false, error: 'Choose another active Code Rx member to message.' }, 400);
  const targetRows = await dbRows<any>(c.env.DB.prepare("SELECT id FROM member_profiles WHERE id = ? AND status = 'active'").bind(targetId));
  if (!targetRows[0]) return c.json({ success: false, error: 'That Code Rx member is unavailable for messaging.' }, 404);
  const directKey = [Number(access.actor!.profileId), targetId].sort((a, b) => a - b).join(':');
  let rows = await dbRows<any>(c.env.DB.prepare("SELECT id FROM community_conversations WHERE type = 'dm' AND direct_key = ?").bind(directKey));
  let conversationId = Number(rows[0]?.id || 0);
  if (!conversationId) {
    const created = await c.env.DB.prepare(
      "INSERT INTO community_conversations (type, direct_key, join_mode, status, owner_member_profile_id, telegram_sync_enabled, updated_at) VALUES ('dm', ?, 'invite', 'active', ?, 1, CURRENT_TIMESTAMP)"
    ).bind(directKey, access.actor!.profileId).run();
    conversationId = Number(created.meta.last_row_id);
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO community_conversation_members (conversation_id, member_profile_id, role, membership_status) VALUES (?, ?, 'member', 'active')").bind(conversationId, access.actor!.profileId),
      c.env.DB.prepare("INSERT INTO community_conversation_members (conversation_id, member_profile_id, role, membership_status) VALUES (?, ?, 'member', 'active')").bind(conversationId, targetId),
    ]);
  }
  const conversation = await communityConversationSummary(c.env.DB, conversationId, access.actor!);
  return c.json({ success: true, data: conversation }, 201);
});

app.get('/api/community/groups', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT c.id, c.title, c.description, c.image_key, c.join_mode, c.status, c.owner_member_profile_id, c.telegram_sync_enabled, c.telegram_chat_id,
       (SELECT COUNT(*) FROM community_conversation_members cm WHERE cm.conversation_id = c.id AND cm.membership_status = 'active') AS member_count,
       EXISTS(SELECT 1 FROM community_conversation_members mine WHERE mine.conversation_id = c.id AND mine.member_profile_id = ? AND mine.membership_status = 'active') AS is_member,
       (SELECT status FROM community_group_join_requests r WHERE r.conversation_id = c.id AND r.member_profile_id = ?) AS request_status
     FROM community_conversations c
     WHERE c.type = 'group' AND c.status IN ('active','locked')
       AND (? = 1 OR c.join_mode != 'invite' OR EXISTS(SELECT 1 FROM community_conversation_members mine WHERE mine.conversation_id = c.id AND mine.member_profile_id = ? AND mine.membership_status = 'active'))
     ORDER BY c.updated_at DESC, c.id DESC LIMIT 100`
  ).bind(access.actor!.profileId, access.actor!.profileId, access.actor!.isPhantom ? 1 : 0, access.actor!.profileId));
  return c.json({ success: true, data: rows.map((row) => ({ ...row, member_count: Number(row.member_count || 0), is_member: Number(row.is_member) === 1, telegram_sync_enabled: Number(row.telegram_sync_enabled) === 1 })) });
});

app.post('/api/community/groups', requireAuth, requirePhantom, async (c) => {
  const actor = await actorFromContext(c);
  const body = await c.req.json().catch(() => ({}));
  const title = cleanStr(body.title, 3, 120);
  const description = cleanOptionalStr(body.description, 2_000) || '';
  const joinMode = body.joinMode === 'open' || body.joinMode === 'approval' || body.joinMode === 'assigned' ? body.joinMode : 'invite';
  if (!title || !actor?.profileId) return c.json({ success: false, error: 'Use a group name with at least three characters.' }, 400);
  const created = await c.env.DB.prepare(
    "INSERT INTO community_conversations (type, title, description, join_mode, status, owner_member_profile_id, telegram_sync_enabled, updated_at) VALUES ('group', ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)"
  ).bind(title, description, joinMode, actor.profileId, body.telegramSyncEnabled ? 1 : 0).run();
  const conversationId = Number(created.meta.last_row_id);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO community_conversation_members (conversation_id, member_profile_id, role, membership_status) VALUES (?, ?, 'owner', 'active')").bind(conversationId, actor.profileId),
    c.env.DB.prepare("INSERT INTO community_messages (conversation_id, message_type, body, source) VALUES (?, 'system', ?, 'system')").bind(conversationId, 'PHANTOM created this official Code Rx group.'),
  ]);
  const assigned = Array.isArray(body.memberProfileIds) ? [...new Set(body.memberProfileIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0 && value !== actor.profileId))] : [];
  if (assigned.length) await c.env.DB.batch(assigned.map((profileId) => c.env.DB.prepare(
    "INSERT OR IGNORE INTO community_conversation_members (conversation_id, member_profile_id, role, membership_status) VALUES (?, ?, 'member', 'active')"
  ).bind(conversationId, profileId)));
  await audit(c.env.DB, actor, 'community.group.created', 'community_conversation', conversationId, { title, joinMode, assignedCount: assigned.length });
  const summary = await communityConversationSummary(c.env.DB, conversationId, actor);
  return c.json({ success: true, data: summary }, 201);
});

app.get('/api/community/groups/:id', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid group.' }, 400);
  const groupRows = await dbRows<any>(c.env.DB.prepare("SELECT * FROM community_conversations WHERE id = ? AND type = 'group' AND status IN ('active','locked')").bind(id));
  const group = groupRows[0];
  if (!group) return c.json({ success: false, error: 'Group not found.' }, 404);
  const member = await communityConversationMember(c.env.DB, id, access.actor!.profileId!);
  if (!member && !access.actor!.isPhantom && group.join_mode === 'invite') return c.json({ success: false, error: 'This is an invite-only group.' }, 403);
  const memberRows = (member || access.actor!.isPhantom) ? await dbRows<any>(c.env.DB.prepare(
    `SELECT cm.member_profile_id, cm.role, cm.membership_status, cm.joined_at, mp.member_code, code.display_name AS codename
     FROM community_conversation_members cm JOIN member_profiles mp ON mp.id = cm.member_profile_id
     LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
     WHERE cm.conversation_id = ? AND cm.membership_status = 'active'
     ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, code.display_name`
  ).bind(id)) : [];
  return c.json({ success: true, data: { ...group, is_member: Boolean(member), my_role: member?.role || null, members: memberRows.map((row) => ({ id: row.member_profile_id, codename: row.codename || row.member_code, role: row.role, joined_at: row.joined_at })) } });
});

app.post('/api/community/groups/:id/join', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const groupRows = await dbRows<any>(c.env.DB.prepare("SELECT * FROM community_conversations WHERE id = ? AND type = 'group' AND status = 'active'").bind(id));
  const group = groupRows[0];
  if (!group) return c.json({ success: false, error: 'Active group not found.' }, 404);
  const existing = await communityConversationMember(c.env.DB, id, access.actor!.profileId!);
  if (existing) return c.json({ success: true, data: { status: 'joined' }, message: 'You are already in this group.' });
  if (group.join_mode === 'open') {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO community_conversation_members (conversation_id, member_profile_id, role, membership_status) VALUES (?, ?, 'member', 'active')").bind(id, access.actor!.profileId),
      c.env.DB.prepare("INSERT INTO community_messages (conversation_id, message_type, body, source) VALUES (?, 'system', ?, 'system')").bind(id, `${access.actor!.codename || access.actor!.memberCode || 'A member'} joined the group.`),
    ]);
    return c.json({ success: true, data: { status: 'joined' }, message: 'You joined the group.' });
  }
  if (group.join_mode === 'approval') {
    await c.env.DB.prepare(
      `INSERT INTO community_group_join_requests (conversation_id, member_profile_id, message, status, created_at)
       VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT(conversation_id, member_profile_id) DO UPDATE SET message = excluded.message, status = 'pending', created_at = CURRENT_TIMESTAMP, reviewed_by_member_profile_id = NULL, reviewed_at = NULL`
    ).bind(id, access.actor!.profileId, cleanOptionalStr(body.message, 1000)).run();
    return c.json({ success: true, data: { status: 'pending' }, message: 'Join request sent.' });
  }
  return c.json({ success: false, error: group.join_mode === 'assigned' ? 'PHANTOM assigns members to this group.' : 'This group is invite-only.' }, 403);
});

app.get('/api/community/groups/:id/requests', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const member = await communityConversationMember(c.env.DB, id, access.actor!.profileId!);
  if ((!member && !access.actor!.isPhantom) || !communityCanManage(member, access.actor!, 'admin')) return c.json({ success: false, error: 'Group admin access is required.' }, 403);
  const requests = await dbRows<any>(c.env.DB.prepare(
    `SELECT r.*, mp.member_code, code.display_name AS codename
     FROM community_group_join_requests r JOIN member_profiles mp ON mp.id = r.member_profile_id
     LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
     WHERE r.conversation_id = ? AND r.status = 'pending' ORDER BY r.created_at ASC`
  ).bind(id));
  return c.json({ success: true, data: requests.map((row) => ({ ...row, codename: row.codename || row.member_code })) });
});

app.post('/api/community/groups/:id/requests/:requestId', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const conversationId = Number(c.req.param('id'));
  const requestId = Number(c.req.param('requestId'));
  const body = await c.req.json().catch(() => ({}));
  const action = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : null;
  if (!Number.isInteger(conversationId) || !Number.isInteger(requestId) || !action) return c.json({ success: false, error: 'Choose a valid join request action.' }, 400);
  const manager = await communityConversationMember(c.env.DB, conversationId, access.actor!.profileId!);
  if ((!manager && !access.actor!.isPhantom) || !communityCanManage(manager, access.actor!, 'admin')) return c.json({ success: false, error: 'Group admin access is required.' }, 403);
  const requestRows = await dbRows<any>(c.env.DB.prepare("SELECT * FROM community_group_join_requests WHERE id = ? AND conversation_id = ? AND status = 'pending'").bind(requestId, conversationId));
  const request = requestRows[0];
  if (!request) return c.json({ success: false, error: 'Pending join request not found.' }, 404);
  await c.env.DB.prepare('UPDATE community_group_join_requests SET status = ?, reviewed_by_member_profile_id = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(action === 'approve' ? 'approved' : 'rejected', access.actor!.profileId, requestId).run();
  if (action === 'approve') await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO community_conversation_members (conversation_id, member_profile_id, role, membership_status) VALUES (?, ?, 'member', 'active') ON CONFLICT(conversation_id, member_profile_id) DO UPDATE SET membership_status = 'active', role = 'member', joined_at = CURRENT_TIMESTAMP").bind(conversationId, request.member_profile_id),
    c.env.DB.prepare("INSERT INTO community_messages (conversation_id, message_type, body, source) VALUES (?, 'system', ?, 'system')").bind(conversationId, 'A join request was approved.'),
  ]);
  return c.json({ success: true, message: action === 'approve' ? 'Member added to the group.' : 'Join request rejected.' });
});

app.patch('/api/community/groups/:id', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const member = await communityConversationMember(c.env.DB, id, access.actor!.profileId!);
  if ((!member && !access.actor!.isPhantom) || !communityCanManage(member, access.actor!, 'admin')) return c.json({ success: false, error: 'Group admin access is required.' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.title !== undefined) { const title = cleanStr(body.title, 3, 120); if (!title) return c.json({ success: false, error: 'Use a valid group name.' }, 400); fields.push('title = ?'); values.push(title); }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(cleanOptionalStr(body.description, 2000) || ''); }
  if (body.joinMode !== undefined) { if (!['invite','open','approval','assigned'].includes(body.joinMode)) return c.json({ success: false, error: 'Choose a valid join method.' }, 400); fields.push('join_mode = ?'); values.push(body.joinMode); }
  if (body.status !== undefined) { if (!['active','locked','archived'].includes(body.status)) return c.json({ success: false, error: 'Choose a valid group status.' }, 400); fields.push('status = ?'); values.push(body.status); }
  if (access.actor!.isPhantom && body.telegramSyncEnabled !== undefined) { fields.push('telegram_sync_enabled = ?'); values.push(body.telegramSyncEnabled ? 1 : 0); }
  if (access.actor!.isPhantom && body.telegramChatId !== undefined) { const chatId = cleanOptionalStr(body.telegramChatId, 80); fields.push('telegram_chat_id = ?'); values.push(chatId); }
  if (!fields.length) return c.json({ success: false, error: 'No group changes supplied.' }, 400);
  fields.push('updated_at = CURRENT_TIMESTAMP'); values.push(id);
  await c.env.DB.prepare(`UPDATE community_conversations SET ${fields.join(', ')} WHERE id = ? AND type = 'group'`).bind(...values).run();
  await audit(c.env.DB, access.actor, 'community.group.updated', 'community_conversation', id, { fields: fields.slice(0, -1) });
  return c.json({ success: true, message: 'Group updated.' });
});

app.put('/api/community/groups/:id/members/:profileId', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const conversationId = Number(c.req.param('id'));
  const profileId = Number(c.req.param('profileId'));
  const body = await c.req.json().catch(() => ({}));
  const manager = await communityConversationMember(c.env.DB, conversationId, access.actor!.profileId!);
  if ((!manager && !access.actor!.isPhantom) || !communityCanManage(manager, access.actor!, 'admin')) return c.json({ success: false, error: 'Group admin access is required.' }, 403);
  const ownerRows = await dbRows<any>(c.env.DB.prepare("SELECT owner_member_profile_id FROM community_conversations WHERE id = ? AND type = 'group'").bind(conversationId));
  if (!Number.isInteger(profileId) || profileId < 1 || profileId === Number(ownerRows[0]?.owner_member_profile_id || 0)) return c.json({ success: false, error: 'This group owner cannot be changed here.' }, 400);
  if (body.action === 'assign') {
    const targetRows = await dbRows<any>(c.env.DB.prepare("SELECT id FROM member_profiles WHERE id = ? AND status = 'active'").bind(profileId));
    if (!targetRows[0]) return c.json({ success: false, error: 'Choose an active Code Rx member.' }, 404);
    await c.env.DB.prepare("INSERT INTO community_conversation_members (conversation_id, member_profile_id, role, membership_status) VALUES (?, ?, 'member', 'active') ON CONFLICT(conversation_id, member_profile_id) DO UPDATE SET membership_status = 'active', role = 'member', joined_at = CURRENT_TIMESTAMP").bind(conversationId, profileId).run();
    return c.json({ success: true, message: 'Member assigned to the group.' });
  }
  if (body.action === 'remove') {
    await c.env.DB.prepare("UPDATE community_conversation_members SET membership_status = 'removed' WHERE conversation_id = ? AND member_profile_id = ?").bind(conversationId, profileId).run();
    return c.json({ success: true, message: 'Member removed from the group.' });
  }
  if (!['admin','moderator','member'].includes(body.role)) return c.json({ success: false, error: 'Choose a valid group role.' }, 400);
  await c.env.DB.prepare("UPDATE community_conversation_members SET role = ? WHERE conversation_id = ? AND member_profile_id = ? AND membership_status = 'active'").bind(body.role, conversationId, profileId).run();
  return c.json({ success: true, message: 'Group role updated.' });
});

app.get('/api/community/conversations/:id/messages', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const conversationId = Number(c.req.param('id'));
  const limit = Math.min(80, Math.max(1, Number(c.req.query('limit') || 40)));
  const before = Number.isInteger(Number(c.req.query('before'))) ? Number(c.req.query('before')) : Number.MAX_SAFE_INTEGER;
  const member = await communityConversationMember(c.env.DB, conversationId, access.actor!.profileId!);
  if (!member && !access.actor!.isPhantom) return c.json({ success: false, error: 'You are not authorized to view this conversation.' }, 403);
  const messages = await dbRows<any>(c.env.DB.prepare(
    `SELECT m.*, COALESCE(sender_code.display_name, sender.member_code, 'Code Rx') AS sender_codename,
       reply.body AS reply_body, COALESCE(reply_code.display_name, reply_sender.member_code) AS reply_sender_codename,
       (SELECT COUNT(*) FROM community_message_attachments removed WHERE removed.message_id = m.id AND removed.status = 'deleted' AND removed.telegram_sync_status = 'synced') AS telegram_removed_attachment_count
     FROM community_messages m
     LEFT JOIN member_profiles sender ON sender.id = m.sender_member_profile_id
     LEFT JOIN codenames sender_code ON sender_code.claimed_by_member_profile_id = sender.id AND sender_code.status = 'claimed'
     LEFT JOIN community_messages reply ON reply.id = m.reply_to_message_id
     LEFT JOIN member_profiles reply_sender ON reply_sender.id = reply.sender_member_profile_id
     LEFT JOIN codenames reply_code ON reply_code.claimed_by_member_profile_id = reply_sender.id AND reply_code.status = 'claimed'
     WHERE m.conversation_id = ? AND m.id < ? AND m.status = 'active'
     ORDER BY m.id DESC LIMIT ?`
  ).bind(conversationId, before, limit));
  const ordered = messages.reverse();
  const ids = ordered.map((message) => Number(message.id));
  const reactionRows = ids.length ? await dbRows<any>(c.env.DB.prepare(
    `SELECT message_id, emoji, COUNT(*) AS count, SUM(CASE WHEN member_profile_id = ? THEN 1 ELSE 0 END) AS mine
     FROM community_message_reactions WHERE message_id IN (${ids.map(() => '?').join(',')}) GROUP BY message_id, emoji`
  ).bind(access.actor!.profileId, ...ids)) : [];
  const attachmentRows = ids.length ? await dbRows<any>(c.env.DB.prepare(
    `SELECT id, message_id, original_name, media_type, mime_type, size_bytes, telegram_sync_status FROM community_message_attachments
     WHERE message_id IN (${ids.map(() => '?').join(',')}) AND status = 'active'`
  ).bind(...ids)) : [];
  const reactions = new Map<number, any[]>();
  reactionRows.forEach((row) => reactions.set(Number(row.message_id), [...(reactions.get(Number(row.message_id)) || []), { emoji: row.emoji, count: Number(row.count || 0), mine: Number(row.mine || 0) > 0 }]));
  const attachments = new Map<number, any[]>();
  attachmentRows.forEach((row) => attachments.set(Number(row.message_id), [...(attachments.get(Number(row.message_id)) || []), row]));
  return c.json({ success: true, data: { messages: ordered.map((message) => ({ ...message, reactions: reactions.get(Number(message.id)) || [], attachments: attachments.get(Number(message.id)) || [] })), hasMore: messages.length === limit } });
});

app.post('/api/community/conversations/:id/messages', requireAuth, async (c) => {
  if (!checkRateLimit(c, 30, 60)) return c.json({ success: false, error: 'You are sending messages too quickly. Please wait a moment.' }, 429);
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const conversationId = Number(c.req.param('id'));
  const member = await communityConversationMember(c.env.DB, conversationId, access.actor!.profileId!);
  if (!member) return c.json({ success: false, error: 'You are not authorized to send to this conversation.' }, 403);
  if (member.conversation_status !== 'active' && !communityCanManage(member, access.actor!)) return c.json({ success: false, error: 'This conversation is locked.' }, 409);
  const body = await c.req.json().catch(() => ({}));
  const text = cleanStr(body.body, 1, 10_000);
  const requestedType = body.messageType === 'announcement' ? 'announcement' : 'text';
  if (!text) return c.json({ success: false, error: 'Write a message before sending.' }, 400);
  if (requestedType === 'announcement' && (!member.type || member.type !== 'group' || !communityCanManage(member, access.actor!, 'admin'))) return c.json({ success: false, error: 'Only a group admin can send an announcement.' }, 403);
  const replyId = Number.isInteger(Number(body.replyToMessageId)) ? Number(body.replyToMessageId) : null;
  if (replyId) {
    const reply = await dbRows<any>(c.env.DB.prepare('SELECT id FROM community_messages WHERE id = ? AND conversation_id = ? AND status = \'active\'').bind(replyId, conversationId));
    if (!reply[0]) return c.json({ success: false, error: 'The reply target is unavailable in this conversation.' }, 409);
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO community_messages (conversation_id, sender_member_profile_id, message_type, body, reply_to_message_id, source)
     VALUES (?, ?, ?, ?, ?, 'website')`
  ).bind(conversationId, access.actor!.profileId, requestedType, text, replyId).run();
  const messageId = Number(result.meta.last_row_id);
  await c.env.DB.prepare('UPDATE community_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(conversationId).run();
  const participantRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT cm.member_profile_id, code.display_name AS codename, mp.member_code
     FROM community_conversation_members cm JOIN member_profiles mp ON mp.id = cm.member_profile_id
     LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
     WHERE cm.conversation_id = ? AND cm.membership_status = 'active' AND cm.member_profile_id != ?`
  ).bind(conversationId, access.actor!.profileId));
  const mentionHandles = communityMentionHandles(text);
  const senderName = access.actor!.codename || access.actor!.memberCode || 'A Code Rx member';
  for (const participant of participantRows) {
    const handle = normalizeCodename(participant.codename || participant.member_code || '');
    const isMentioned = mentionHandles.includes(handle);
    const isDm = member.type === 'dm';
    if (isMentioned || isDm || requestedType === 'announcement') {
      await notifyMember(c.env.DB, participant.member_profile_id, isMentioned ? `${senderName} mentioned you` : requestedType === 'announcement' ? 'Group announcement' : `New message from ${senderName}`, text.slice(0, 500), access.actor);
    }
  }
  // Telegram sync is best-effort and never blocks the Code Rx message itself.
  try { await syncCommunityMessageToTelegram(c.env, c.env.DB, messageId, conversationId, access.actor!.profileId!, `${senderName}: ${text}`); }
  catch (error) { console.warn('[code-rx] community Telegram sync skipped:', error); }
  return c.json({ success: true, data: { id: messageId, createdAt: new Date().toISOString() }, message: 'Message sent.' }, 201);
});

app.patch('/api/community/messages/:id', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const text = cleanStr(body.body, 1, 10_000);
  if (!Number.isInteger(id) || id < 1 || !text) return c.json({ success: false, error: 'Use a valid message.' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM community_messages WHERE id = ? AND status = \'active\'').bind(id));
  const message = rows[0];
  if (!message) return c.json({ success: false, error: 'Message not found.' }, 404);
  const member = await communityConversationMember(c.env.DB, Number(message.conversation_id), access.actor!.profileId!);
  if (!member || (Number(message.sender_member_profile_id || 0) !== Number(access.actor!.profileId) && !communityCanManage(member, access.actor!))) return c.json({ success: false, error: 'You cannot edit this message.' }, 403);
  await c.env.DB.prepare('UPDATE community_messages SET body = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?').bind(text, id).run();
  return c.json({ success: true, message: 'Message edited.' });
});

app.delete('/api/community/messages/:id', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM community_messages WHERE id = ? AND status = \'active\'').bind(id));
  const message = rows[0];
  if (!message) return c.json({ success: false, error: 'Message not found.' }, 404);
  const member = await communityConversationMember(c.env.DB, Number(message.conversation_id), access.actor!.profileId!);
  if (!member || (Number(message.sender_member_profile_id || 0) !== Number(access.actor!.profileId) && !communityCanManage(member, access.actor!))) return c.json({ success: false, error: 'You cannot delete this message.' }, 403);
  const attachments = await dbRows<any>(c.env.DB.prepare("SELECT id, r2_key FROM community_message_attachments WHERE message_id = ? AND status = 'active'").bind(id));
  for (const attachment of attachments) await c.env.BUCKET.delete(attachment.r2_key);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE community_messages SET status = 'deleted', body = '', edited_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id),
    c.env.DB.prepare("UPDATE community_message_attachments SET status = 'deleted' WHERE message_id = ?").bind(id),
  ]);
  await audit(c.env.DB, access.actor, 'community.message.deleted', 'community_message', id, { conversationId: message.conversation_id, attachmentCount: attachments.length });
  return c.json({ success: true, message: 'Message and attached media deleted.' });
});

app.put('/api/community/messages/:id/reactions', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const emoji = cleanStr(body.emoji, 1, 16);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT conversation_id FROM community_messages WHERE id = ? AND status = \'active\'').bind(id));
  const message = rows[0];
  if (!message || !emoji) return c.json({ success: false, error: 'Choose a valid message reaction.' }, 400);
  const member = await communityConversationMember(c.env.DB, Number(message.conversation_id), access.actor!.profileId!);
  if (!member) return c.json({ success: false, error: 'You are not authorized to react here.' }, 403);
  const existing = await dbRows<any>(c.env.DB.prepare('SELECT id FROM community_message_reactions WHERE message_id = ? AND member_profile_id = ? AND emoji = ?').bind(id, access.actor!.profileId, emoji));
  if (existing[0]) await c.env.DB.prepare('DELETE FROM community_message_reactions WHERE id = ?').bind(existing[0].id).run();
  else await c.env.DB.prepare('INSERT INTO community_message_reactions (message_id, member_profile_id, emoji) VALUES (?, ?, ?)').bind(id, access.actor!.profileId, emoji).run();
  return c.json({ success: true, data: { active: !existing[0] } });
});

app.post('/api/community/conversations/:id/read', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const conversationId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const messageId = Number(body.messageId);
  const member = await communityConversationMember(c.env.DB, conversationId, access.actor!.profileId!);
  if (!member || !Number.isInteger(messageId)) return c.json({ success: false, error: 'Conversation read state is unavailable.' }, 403);
  await c.env.DB.prepare('UPDATE community_conversation_members SET last_read_message_id = ?, last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND member_profile_id = ?').bind(messageId, conversationId, access.actor!.profileId).run();
  return c.json({ success: true });
});

app.post('/api/community/messages/:id/pin', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT conversation_id FROM community_messages WHERE id = ? AND status = \'active\'').bind(id));
  const message = rows[0];
  if (!message) return c.json({ success: false, error: 'Message not found.' }, 404);
  const member = await communityConversationMember(c.env.DB, Number(message.conversation_id), access.actor!.profileId!);
  if (!member || member.type !== 'group' || !communityCanManage(member, access.actor!, 'moderator')) return c.json({ success: false, error: 'Group moderator access is required to pin messages.' }, 403);
  await c.env.DB.prepare('UPDATE community_conversations SET pinned_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id, message.conversation_id).run();
  return c.json({ success: true, message: 'Message pinned.' });
});

app.post('/api/community/messages/:id/reports', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const reason = cleanStr(body.reason, 3, 1000);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT conversation_id FROM community_messages WHERE id = ? AND status = \'active\'').bind(id));
  const message = rows[0];
  if (!message || !reason) return c.json({ success: false, error: 'Use a valid message and report reason.' }, 400);
  const member = await communityConversationMember(c.env.DB, Number(message.conversation_id), access.actor!.profileId!);
  if (!member) return c.json({ success: false, error: 'You are not authorized to report this message.' }, 403);
  await c.env.DB.prepare('INSERT INTO community_message_reports (message_id, reporter_member_profile_id, reason) VALUES (?, ?, ?)').bind(id, access.actor!.profileId, reason).run();
  return c.json({ success: true, message: 'Report sent for moderation.' }, 201);
});

app.get('/api/community/search', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const query = cleanStr(c.req.query('q'), 2, 100);
  if (!query) return c.json({ success: false, error: 'Enter at least two characters to search.' }, 400);
  const conversationRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT c.id, c.type, c.title, c.description
     FROM community_conversations c JOIN community_conversation_members cm ON cm.conversation_id = c.id
     WHERE cm.member_profile_id = ? AND cm.membership_status = 'active' AND c.status IN ('active','locked')
       AND (COALESCE(c.title, '') LIKE ? OR c.description LIKE ?) LIMIT 30`
  ).bind(access.actor!.profileId, `%${query}%`, `%${query}%`));
  const messageRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT m.id, m.conversation_id, m.body, m.created_at
     FROM community_messages m JOIN community_conversation_members cm ON cm.conversation_id = m.conversation_id
     WHERE cm.member_profile_id = ? AND cm.membership_status = 'active' AND m.status = 'active' AND m.body LIKE ?
     ORDER BY m.id DESC LIMIT 50`
  ).bind(access.actor!.profileId, `%${query}%`));
  return c.json({ success: true, data: { conversations: conversationRows, messages: messageRows } });
});

app.get('/api/phantom/community/media-settings', requireAuth, requirePhantom, async (c) => {
  const settings = await dbRows<any>(c.env.DB.prepare('SELECT * FROM community_media_settings ORDER BY scope_type, scope_key, media_type'));
  const stats = await dbRows<any>(c.env.DB.prepare(
    `SELECT COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS storage_bytes,
       media_type, COUNT(*) AS type_count, COALESCE(SUM(size_bytes), 0) AS type_bytes
     FROM community_message_attachments WHERE status = 'active' GROUP BY media_type`
  ));
  const totals = stats.reduce((acc: any, row: any) => ({ fileCount: acc.fileCount + Number(row.type_count || 0), storageBytes: acc.storageBytes + Number(row.type_bytes || 0) }), { fileCount: 0, storageBytes: 0 });
  const byGroup = await dbRows<any>(c.env.DB.prepare(
    `SELECT c.id AS group_id, c.title AS group_title, COUNT(a.id) AS file_count, COALESCE(SUM(a.size_bytes), 0) AS storage_bytes
     FROM community_message_attachments a
     JOIN community_messages m ON m.id = a.message_id
     JOIN community_conversations c ON c.id = m.conversation_id
     WHERE a.status = 'active' AND c.type = 'group'
     GROUP BY c.id ORDER BY storage_bytes DESC LIMIT 50`
  ));
  const retryRows = await dbRows<any>(c.env.DB.prepare(
    "SELECT telegram_sync_status, COUNT(*) AS file_count FROM community_message_attachments WHERE status = 'active' AND telegram_sync_status IN ('failed','synced_pending_delete') GROUP BY telegram_sync_status"
  ));
  const retryItems = await dbRows<any>(c.env.DB.prepare(
    `SELECT a.id, a.original_name, a.media_type, a.size_bytes, a.telegram_sync_status, c.id AS conversation_id, c.type AS conversation_type, c.title AS conversation_title
     FROM community_message_attachments a
     JOIN community_messages m ON m.id = a.message_id
     JOIN community_conversations c ON c.id = m.conversation_id
     WHERE a.status = 'active' AND a.telegram_sync_status IN ('failed','synced_pending_delete')
     ORDER BY a.created_at ASC LIMIT 50`
  ));
  const globalMaster = settings.find((setting) => setting.scope_type === 'global' && setting.scope_key === 'global' && setting.media_type === 'all');
  return c.json({ success: true, data: {
    settings,
    totals,
    telegramRetention: {
      autoDeleteAfterSync: Number(globalMaster?.telegram_auto_delete_after_sync || 0) === 1,
      maxSyncBytes: TELEGRAM_MEDIA_SYNC_MAX_BYTES,
      retryRequiredCount: retryRows.reduce((total, row) => total + Number(row.file_count || 0), 0),
    },
    retryItems: retryItems.map((item) => ({ id: Number(item.id), originalName: item.original_name, mediaType: item.media_type, sizeBytes: Number(item.size_bytes || 0), syncStatus: item.telegram_sync_status, conversationId: Number(item.conversation_id), conversationType: item.conversation_type, conversationTitle: item.conversation_title || (item.conversation_type === 'dm' ? 'Direct message' : 'Private group') })),
    byType: stats.map((row) => ({ mediaType: row.media_type, fileCount: Number(row.type_count || 0), storageBytes: Number(row.type_bytes || 0) })),
    byGroup: byGroup.map((row) => ({ groupId: row.group_id, groupTitle: row.group_title, fileCount: Number(row.file_count || 0), storageBytes: Number(row.storage_bytes || 0) })),
  } });
});

app.put('/api/phantom/community/media-settings', requireAuth, requirePhantom, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const scopeType = body.scopeType === 'group' ? 'group' : body.scopeType === 'area' ? 'area' : 'global';
  const scopeKey = cleanStr(body.scopeKey, 1, 120) || (scopeType === 'global' ? 'global' : '');
  const mediaType = body.mediaType === 'all' || COMMUNITY_MEDIA_TYPES.has(body.mediaType) ? body.mediaType : null;
  if (!scopeKey || !mediaType || typeof body.enabled !== 'boolean') return c.json({ success: false, error: 'Choose a valid media scope, type, and enabled state.' }, 400);
  const maxBytes = body.maxBytes === undefined ? 0 : Number(body.maxBytes);
  const storageLimitBytes = body.storageLimitBytes === undefined ? 0 : Number(body.storageLimitBytes);
  if (!Number.isInteger(maxBytes) || maxBytes < 0 || maxBytes > 100 * 1024 * 1024 || !Number.isInteger(storageLimitBytes) || storageLimitBytes < 0) return c.json({ success: false, error: 'Use valid media size limits.' }, 400);
  const allowedMimes = Array.isArray(body.allowedMimes) ? body.allowedMimes.filter((mime: unknown) => typeof mime === 'string' && mime.length <= 120).slice(0, 30) : [];
  const isGlobalMaster = scopeType === 'global' && scopeKey === 'global' && mediaType === 'all';
  if (body.telegramAutoDeleteAfterSync !== undefined && (!isGlobalMaster || typeof body.telegramAutoDeleteAfterSync !== 'boolean')) {
    return c.json({ success: false, error: 'Telegram auto-delete can only be changed on the Global all-media setting.' }, 400);
  }
  if (body.telegramAutoDeleteAfterSync === true && !String(c.env.TELEGRAM_BOT_TOKEN || '').trim()) {
    return c.json({ success: false, error: 'Configure the Telegram bot secret before enabling automatic Telegram media cleanup.' }, 503);
  }
  const existingRows = await dbRows<any>(c.env.DB.prepare(
    'SELECT telegram_auto_delete_after_sync FROM community_media_settings WHERE scope_type = ? AND scope_key = ? AND media_type = ? LIMIT 1'
  ).bind(scopeType, scopeKey, mediaType));
  const autoDeleteAfterSync = body.telegramAutoDeleteAfterSync === undefined
    ? Number(existingRows[0]?.telegram_auto_delete_after_sync || 0) === 1
    : body.telegramAutoDeleteAfterSync;
  const actor = await actorFromContext(c);
  await c.env.DB.prepare(
    `INSERT INTO community_media_settings (scope_type, scope_key, media_type, enabled, max_bytes, allowed_mimes_json, storage_limit_bytes, telegram_auto_delete_after_sync, updated_by_user_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(scope_type, scope_key, media_type) DO UPDATE SET enabled = excluded.enabled, max_bytes = excluded.max_bytes, allowed_mimes_json = excluded.allowed_mimes_json, storage_limit_bytes = excluded.storage_limit_bytes, telegram_auto_delete_after_sync = excluded.telegram_auto_delete_after_sync, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(scopeType, scopeKey, mediaType, body.enabled ? 1 : 0, maxBytes, JSON.stringify(allowedMimes), storageLimitBytes, autoDeleteAfterSync ? 1 : 0, actor?.userId ?? null).run();
  await audit(c.env.DB, actor, 'community.media_setting.updated', 'community_media_setting', `${scopeKey}:${mediaType}`, { scopeType, enabled: body.enabled, maxBytes, storageLimitBytes, telegramAutoDeleteAfterSync: autoDeleteAfterSync && isGlobalMaster });
  return c.json({ success: true, message: 'Community media setting saved.' });
});

app.get('/api/community/conversations/:id/media-policy', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const conversationId = Number(c.req.param('id'));
  const member = await communityConversationMember(c.env.DB, conversationId, access.actor!.profileId!);
  if (!member) return c.json({ success: false, error: 'You are not authorized to view these media controls.' }, 403);
  const types = ['image','video','document','pdf','audio','other'];
  const policies = await Promise.all(types.map(async (mediaType) => ({ mediaType, ...(await communityMediaPolicy(c.env.DB, 'private', mediaType, member.type === 'group' ? conversationId : null)) })));
  return c.json({ success: true, data: policies });
});

app.post('/api/community/conversations/:id/attachments', requireAuth, async (c) => {
  if (!checkRateLimit(c, 12, 60)) return c.json({ success: false, error: 'You are uploading media too quickly. Please wait a moment.' }, 429);
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const conversationId = Number(c.req.param('id'));
  const member = await communityConversationMember(c.env.DB, conversationId, access.actor!.profileId!);
  if (!member) return c.json({ success: false, error: 'You are not authorized to upload to this conversation.' }, 403);
  if (member.conversation_status !== 'active' && !communityCanManage(member, access.actor!)) return c.json({ success: false, error: 'This conversation is locked.' }, 409);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return c.json({ success: false, error: 'Choose a file to upload.' }, 400);
  const groupId = member.type === 'group' ? conversationId : null;
  const mediaType = communityMediaTypeFor(file.name || '', file.type || '');
  if (!mediaType) return c.json({ success: false, error: 'This file type is not permitted. Executables and unsafe files are blocked.' }, 415);
  const policy = await communityMediaPolicy(c.env.DB, 'private', mediaType, groupId);
  if (!policy.enabled) return c.json({ success: false, error: 'PHANTOM has disabled this media type for this conversation area.' }, 403);
  if (!await communityFileSignatureValid(file, mediaType)) return c.json({ success: false, error: 'The file content does not match its declared media type.' }, 415);
  if (policy.maxBytes > 0 && file.size > policy.maxBytes) return c.json({ success: false, error: 'This file exceeds the configured media size limit.' }, 413);
  if (policy.allowedMimes.length && !policy.allowedMimes.includes(file.type)) return c.json({ success: false, error: 'This MIME type is not permitted by PHANTOM media controls.' }, 415);
  const autoDeleteAfterTelegramSync = await communityTelegramAutoDeleteAfterSyncEnabled(c.env.DB);
  if (autoDeleteAfterTelegramSync) {
    if (file.size > TELEGRAM_MEDIA_SYNC_MAX_BYTES) return c.json({ success: false, error: `Telegram storage protection is enabled. Use a file of ${Math.round(TELEGRAM_MEDIA_SYNC_MAX_BYTES / 1024 / 1024)} MB or less, or ask PHANTOM to turn that protection off.` }, 413);
    if (!String(c.env.TELEGRAM_BOT_TOKEN || '').trim()) return c.json({ success: false, error: 'Telegram storage protection is enabled, but the Telegram bot is not configured.' }, 503);
    const plan = await communityTelegramDeliveryPlan(c.env.DB, conversationId, access.actor!.profileId!);
    if (!plan.enabled || !plan.targets.length) return c.json({ success: false, error: 'Telegram storage protection is enabled. This chat needs an active Telegram sync target before media can be uploaded.' }, 409);
  }
  if (policy.storageLimitBytes > 0) {
    const usage = groupId
      ? await dbRows<{ bytes: number }>(c.env.DB.prepare(
        `SELECT COALESCE(SUM(a.size_bytes), 0) AS bytes FROM community_message_attachments a
         JOIN community_messages m ON m.id = a.message_id WHERE a.status = 'active' AND m.conversation_id = ?`
      ).bind(groupId))
      : await dbRows<{ bytes: number }>(c.env.DB.prepare("SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM community_message_attachments WHERE status = 'active'").bind());
    if (Number(usage[0]?.bytes || 0) + file.size > policy.storageLimitBytes) return c.json({ success: false, error: 'The configured Community media storage limit has been reached. Text chat remains available.' }, 409);
  }
  const safeName = (file.name || 'attachment').replace(/[^A-Za-z0-9._-]/g, '_').slice(-100);
  const key = `community/${conversationId}/${Date.now()}-${randomToken().slice(0, 12)}-${safeName}`;
  await c.env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const caption = cleanOptionalStr(form?.get('caption'), 1000) || '';
  const messageResult = await c.env.DB.prepare(
    `INSERT INTO community_messages (conversation_id, sender_member_profile_id, message_type, body, source)
     VALUES (?, ?, ?, ?, 'website')`
  ).bind(conversationId, access.actor!.profileId, mediaType === 'image' ? 'image' : mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'voice' : 'file', caption).run();
  const messageId = Number(messageResult.meta.last_row_id);
  const attachmentResult = await c.env.DB.prepare(
    `INSERT INTO community_message_attachments (message_id, r2_key, original_name, media_type, mime_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(messageId, key, safeName, mediaType, file.type, file.size).run();
  const attachmentId = Number(attachmentResult.meta.last_row_id);
  await c.env.DB.prepare('UPDATE community_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(conversationId).run();

  const senderName = access.actor!.codename || access.actor!.memberCode || 'A Code Rx member';
  const attachment = { id: attachmentId, message_id: messageId, conversation_id: conversationId, r2_key: key, original_name: safeName, media_type: mediaType, mime_type: file.type, size_bytes: file.size, status: 'active', telegram_sync_status: 'not_requested' };
  const message = { id: messageId, conversation_id: conversationId, sender_member_profile_id: access.actor!.profileId, body: caption };
  let telegram: CommunityAttachmentSyncResult | null = null;
  try {
    telegram = await syncCommunityAttachmentToTelegram(c.env, c.env.DB, attachment, message, senderName, access.actor, autoDeleteAfterTelegramSync);
  } catch (error) {
    if (autoDeleteAfterTelegramSync) await setCommunityAttachmentSyncState(c.env.DB, attachmentId, 'failed', 'Telegram media sync could not complete.');
    console.warn('[code-rx] community Telegram media sync skipped:', error);
    telegram = { synced: false, deleted: false, attempted: true, error: 'Telegram media sync could not complete. The local file was retained safely.' };
  }
  await audit(c.env.DB, access.actor, 'community.attachment.uploaded', 'community_attachment', attachmentId, { conversationId, mediaType, sizeBytes: file.size, telegramSynced: Boolean(telegram?.synced), autoDeletedFromR2: Boolean(telegram?.deleted) });
  const messageText = telegram?.deleted
    ? 'Attachment synced to Telegram and removed from Code Rx storage.'
    : telegram?.synced
      ? 'Attachment uploaded and synced to Telegram.'
      : telegram?.error || 'Attachment uploaded.';
  return c.json({ success: true, data: { id: attachmentId, messageId, name: safeName, mediaType, sizeBytes: file.size, telegramSynced: Boolean(telegram?.synced), deletedFromR2: Boolean(telegram?.deleted) }, message: messageText }, 201);
});

app.post('/api/community/attachments/:id/telegram-sync', requireAuth, async (c) => {
  if (!checkRateLimit(c, 5, 60)) return c.json({ success: false, error: 'Please wait before retrying Telegram media sync.' }, 429);
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT a.*, m.conversation_id, m.sender_member_profile_id, m.body, m.status AS message_status,
       COALESCE(sender_code.display_name, sender.member_code, 'Code Rx member') AS sender_codename
     FROM community_message_attachments a
     JOIN community_messages m ON m.id = a.message_id
     LEFT JOIN member_profiles sender ON sender.id = m.sender_member_profile_id
     LEFT JOIN codenames sender_code ON sender_code.claimed_by_member_profile_id = sender.id AND sender_code.status = 'claimed'
     WHERE a.id = ? AND a.status = 'active'`
  ).bind(id));
  const attachment = rows[0];
  if (!attachment || attachment.message_status !== 'active') return c.json({ success: false, error: 'Attachment not found.' }, 404);
  const member = await communityConversationMember(c.env.DB, Number(attachment.conversation_id), access.actor!.profileId!);
  if (!member && !access.actor!.isPhantom) return c.json({ success: false, error: 'You are not authorized to retry this attachment.' }, 403);
  if (Number(attachment.sender_member_profile_id) !== Number(access.actor!.profileId) && !communityCanManage(member, access.actor!)) return c.json({ success: false, error: 'Only the sender, a group moderator, or PHANTOM can retry this attachment.' }, 403);
  const autoDeleteAfterTelegramSync = await communityTelegramAutoDeleteAfterSyncEnabled(c.env.DB);
  const result = await syncCommunityAttachmentToTelegram(c.env, c.env.DB, attachment, attachment, String(attachment.sender_codename || 'Code Rx member'), access.actor, autoDeleteAfterTelegramSync);
  if (!result.synced) return c.json({ success: false, error: result.error || 'Telegram did not confirm this media delivery. The local file remains protected.' }, 409);
  return c.json({ success: true, data: { deletedFromR2: result.deleted }, message: result.deleted ? 'Telegram confirmed delivery and the local R2 media was removed.' : result.error || 'Telegram media sync completed.' });
});

app.get('/api/community/attachments/:id', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT a.*, m.conversation_id FROM community_message_attachments a
     JOIN community_messages m ON m.id = a.message_id WHERE a.id = ? AND a.status = 'active'`
  ).bind(id));
  const attachment = rows[0];
  if (!attachment) return c.json({ success: false, error: 'Attachment not found.' }, 404);
  const member = await communityConversationMember(c.env.DB, Number(attachment.conversation_id), access.actor!.profileId!);
  if (!member) return c.json({ success: false, error: 'You are not authorized to access this attachment.' }, 403);
  const object = await c.env.BUCKET.get(attachment.r2_key);
  if (!object) return c.json({ success: false, error: 'Attachment storage object not found.' }, 404);
  return new Response(object.body, { headers: { 'Content-Type': attachment.mime_type || 'application/octet-stream', 'Content-Disposition': `inline; filename="${String(attachment.original_name).replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});

app.delete('/api/community/attachments/:id', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const id = Number(c.req.param('id'));
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT a.*, m.conversation_id, m.sender_member_profile_id FROM community_message_attachments a
     JOIN community_messages m ON m.id = a.message_id WHERE a.id = ? AND a.status = 'active'`
  ).bind(id));
  const attachment = rows[0];
  if (!attachment) return c.json({ success: false, error: 'Attachment not found.' }, 404);
  const member = await communityConversationMember(c.env.DB, Number(attachment.conversation_id), access.actor!.profileId!);
  if (!member || (Number(attachment.sender_member_profile_id) !== Number(access.actor!.profileId) && !communityCanManage(member, access.actor!))) return c.json({ success: false, error: 'You cannot remove this attachment.' }, 403);
  await c.env.BUCKET.delete(attachment.r2_key);
  await c.env.DB.prepare("UPDATE community_message_attachments SET status = 'deleted' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, access.actor, 'community.attachment.deleted', 'community_attachment', id, { conversationId: attachment.conversation_id });
  return c.json({ success: true, message: 'Attachment deleted.' });
});

app.post('/api/community/telegram/link', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const username = String(c.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  if (!String(c.env.TELEGRAM_BOT_TOKEN || '').trim() || !username) return c.json({ success: false, error: 'Telegram linking is not configured yet.' }, 503);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO community_telegram_link_tokens (member_profile_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).bind(access.actor!.profileId, await sha256Hex(token), expiresAt).run();
  return c.json({ success: true, data: { deepLink: `https://t.me/${username}?start=crx_${token}`, expiresAt }, message: 'Open Telegram to complete the secure link.' });
});

app.get('/api/community/telegram/status', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const rows = await dbRows<any>(c.env.DB.prepare(
    'SELECT telegram_chat_id, telegram_user_id, linked_at FROM community_telegram_links WHERE member_profile_id = ? AND disconnected_at IS NULL'
  ).bind(access.actor!.profileId));
  return c.json({ success: true, data: { connected: Boolean(rows[0]), linkedAt: rows[0]?.linked_at || null } });
});

app.delete('/api/community/telegram/link', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  await c.env.DB.prepare('UPDATE community_telegram_links SET disconnected_at = CURRENT_TIMESTAMP WHERE member_profile_id = ? AND disconnected_at IS NULL').bind(access.actor!.profileId).run();
  return c.json({ success: true, message: 'Telegram disconnected.' });
});

app.post('/api/telegram/webhook', async (c) => {
  const secret = String(c.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!secret || c.req.header('X-Telegram-Bot-Api-Secret-Token') !== secret) return c.json({ success: false, error: 'Unauthorized webhook.' }, 401);
  const update = await c.req.json().catch(() => null) as any;
  const updateId = update?.update_id;
  if (updateId === undefined || updateId === null) return c.json({ success: true });
  const recorded = await c.env.DB.prepare('INSERT OR IGNORE INTO community_telegram_updates (telegram_update_id, payload_json) VALUES (?, ?)').bind(String(updateId), JSON.stringify(update).slice(0, 50_000)).run();
  if (Number(recorded.meta.changes || 0) !== 1) return c.json({ success: true });
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  if (!chatId) return c.json({ success: true });
  if (text.startsWith('/start crx_')) {
    const rawToken = text.slice('/start crx_'.length).trim();
    const rows = await dbRows<any>(c.env.DB.prepare(
      'SELECT * FROM community_telegram_link_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP'
    ).bind(await sha256Hex(rawToken)));
    const token = rows[0];
    if (!token) { await telegramApi(c.env, 'sendMessage', { chat_id: chatId, text: 'This Code Rx linking token is invalid or expired.' }); return c.json({ success: true }); }
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE community_telegram_link_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(token.id),
      c.env.DB.prepare(
        `INSERT INTO community_telegram_links (member_profile_id, telegram_chat_id, telegram_user_id, linked_at, disconnected_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT(member_profile_id) DO UPDATE SET telegram_chat_id = excluded.telegram_chat_id, telegram_user_id = excluded.telegram_user_id, linked_at = CURRENT_TIMESTAMP, disconnected_at = NULL`
      ).bind(token.member_profile_id, String(chatId), message?.from?.id ? String(message.from.id) : null),
    ]);
    await telegramApi(c.env, 'sendMessage', { chat_id: chatId, text: 'Code Rx Telegram connected. Website messages can now sync where PHANTOM has enabled it.' });
    return c.json({ success: true });
  }
  const linkedRows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM community_telegram_links WHERE telegram_chat_id = ? AND disconnected_at IS NULL').bind(String(chatId)));
  const link = linkedRows[0];
  if (link && text.toLowerCase().startsWith('/dm ')) {
    const [, targetToken, ...messageParts] = text.split(/\s+/);
    const directText = messageParts.join(' ').trim();
    const normalizedTarget = normalizeCodename(targetToken || '');
    const targetRows = await dbRows<any>(c.env.DB.prepare(
      `SELECT mp.id FROM member_profiles mp
       LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
       WHERE mp.status = 'active' AND (code.normalized_name = ? OR LOWER(mp.member_code) = ?) LIMIT 1`
    ).bind(normalizedTarget, normalizedTarget));
    const target = targetRows[0];
    if (!target || !directText) {
      await telegramApi(c.env, 'sendMessage', { chat_id: chatId, text: 'Use /dm CODENAME your message. The Code Name must be an active Code Rx member.' });
      return c.json({ success: true });
    }
    const directKey = [Number(link.member_profile_id), Number(target.id)].sort((a, b) => a - b).join(':');
    let conversationRows = await dbRows<any>(c.env.DB.prepare("SELECT id FROM community_conversations WHERE type = 'dm' AND direct_key = ?").bind(directKey));
    let directConversationId = Number(conversationRows[0]?.id || 0);
    if (!directConversationId) {
      const created = await c.env.DB.prepare("INSERT INTO community_conversations (type, direct_key, join_mode, status, owner_member_profile_id, telegram_sync_enabled, updated_at) VALUES ('dm', ?, 'invite', 'active', ?, 1, CURRENT_TIMESTAMP)").bind(directKey, link.member_profile_id).run();
      directConversationId = Number(created.meta.last_row_id);
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO community_conversation_members (conversation_id, member_profile_id, role, membership_status) VALUES (?, ?, 'member', 'active')").bind(directConversationId, link.member_profile_id),
        c.env.DB.prepare("INSERT INTO community_conversation_members (conversation_id, member_profile_id, role, membership_status) VALUES (?, ?, 'member', 'active')").bind(directConversationId, target.id),
      ]);
    }
    const created = await c.env.DB.prepare("INSERT INTO community_messages (conversation_id, sender_member_profile_id, message_type, body, source, telegram_message_id) VALUES (?, ?, 'text', ?, 'telegram', ?)").bind(directConversationId, link.member_profile_id, directText.slice(0, 10_000), String(message.message_id)).run();
    await c.env.DB.prepare("INSERT OR IGNORE INTO community_telegram_message_links (message_id, telegram_chat_id, telegram_message_id, direction) VALUES (?, ?, ?, 'telegram_to_website')").bind(Number(created.meta.last_row_id), String(chatId), String(message.message_id)).run();
    await c.env.DB.prepare('UPDATE community_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(directConversationId).run();
    return c.json({ success: true });
  }
  const groupRows = await dbRows<any>(c.env.DB.prepare("SELECT id FROM community_conversations WHERE telegram_chat_id = ? AND telegram_sync_enabled = 1 AND type = 'group' AND status = 'active'").bind(String(chatId)));
  const conversationId = Number(groupRows[0]?.id || 0);
  if (conversationId && link && text) {
    const member = await communityConversationMember(c.env.DB, conversationId, Number(link.member_profile_id));
    if (member) {
      const created = await c.env.DB.prepare(
        `INSERT INTO community_messages (conversation_id, sender_member_profile_id, message_type, body, source, telegram_message_id)
         VALUES (?, ?, 'text', ?, 'telegram', ?)`
      ).bind(conversationId, link.member_profile_id, text.slice(0, 10_000), String(message.message_id)).run();
      await c.env.DB.prepare("INSERT OR IGNORE INTO community_telegram_message_links (message_id, telegram_chat_id, telegram_message_id, direction) VALUES (?, ?, ?, 'telegram_to_website')").bind(Number(created.meta.last_row_id), String(chatId), String(message.message_id)).run();
      await c.env.DB.prepare('UPDATE community_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(conversationId).run();
    }
  }
  return c.json({ success: true });
});

const restoreRecycleBinItem = async (db: D1Database, item: any) => {
  let payload: any;
  try { payload = JSON.parse(item.payload_json); } catch { throw new Error('This recycle-bin snapshot is unreadable.'); }
  if (item.resource_type === 'application') {
    const existing = await dbRows<any>(db.prepare('SELECT id FROM applications WHERE id = ?').bind(payload.id));
    if (existing[0]) throw new Error('An application with this record already exists.');
    await db.prepare(
      `INSERT INTO applications (id, name, email, phone, date, status, created_at, reviewed_by_user_id, reviewed_at, review_note, member_profile_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(payload.id, payload.name, payload.email, payload.phone ?? null, payload.date, payload.status || 'pending', payload.created_at ?? null, payload.reviewed_by_user_id ?? null, payload.reviewed_at ?? null, payload.review_note ?? null, payload.member_profile_id ?? null, payload.updated_at ?? null).run();
    return;
  }
  if (item.resource_type === 'subscriber') {
    const existing = await dbRows<any>(db.prepare('SELECT id FROM subscribers WHERE id = ? OR email = ?').bind(payload.id, payload.email));
    if (existing[0]) throw new Error('A subscriber with this record or email already exists.');
    await db.prepare('INSERT INTO subscribers (id, email, name, phone, date, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(payload.id, payload.email, payload.name ?? null, payload.phone ?? null, payload.date, payload.source ?? 'website', payload.created_at ?? null).run();
    return;
  }
  if (item.resource_type === 'contact') {
    const existing = await dbRows<any>(db.prepare('SELECT id FROM contacts WHERE id = ?').bind(payload.id));
    if (existing[0]) throw new Error('A contact message with this record already exists.');
    await db.prepare('INSERT INTO contacts (id, name, email, subject, message, date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(payload.id, payload.name, payload.email, payload.subject, payload.message, payload.date, payload.status || 'unread', payload.created_at ?? null).run();
    return;
  }
  if (item.resource_type === 'sent_notification') {
    const notification = payload?.notification;
    if (!notification?.id) throw new Error('The sent notification snapshot is incomplete.');
    await db.prepare(
      `INSERT INTO notifications (id, title, message, audience_type, audience_label, status, created_by_member_profile_id, created_by_user_id, sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, message = excluded.message, audience_type = excluded.audience_type, audience_label = excluded.audience_label, status = 'active', created_by_member_profile_id = excluded.created_by_member_profile_id, created_by_user_id = excluded.created_by_user_id, sent_at = excluded.sent_at, created_at = excluded.created_at`
    ).bind(notification.id, notification.title, notification.message, notification.audience_type, notification.audience_label ?? null, notification.created_by_member_profile_id ?? null, notification.created_by_user_id ?? null, notification.sent_at ?? null, notification.created_at ?? null).run();
    const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
    if (recipients.length) await db.batch(recipients.map((recipient: any) => db.prepare(
      `INSERT OR IGNORE INTO notification_recipients (notification_id, member_profile_id, status, delivered_at, read_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(notification.id, recipient.member_profile_id, recipient.status || 'unread', recipient.delivered_at ?? null, recipient.read_at ?? null)));
    return;
  }
  if (item.resource_type === 'notification_recipient') {
    const recipient = payload?.recipient;
    if (!recipient?.notification_id || !recipient?.member_profile_id) throw new Error('The inbox notification snapshot is incomplete.');
    const notice = await dbRows<any>(db.prepare("SELECT id FROM notifications WHERE id = ? AND status = 'active'").bind(recipient.notification_id));
    if (!notice[0]) throw new Error('The original notification is no longer active, so this inbox item cannot be restored.');
    await db.prepare(
      `INSERT OR IGNORE INTO notification_recipients (notification_id, member_profile_id, status, delivered_at, read_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(recipient.notification_id, recipient.member_profile_id, recipient.status || 'unread', recipient.delivered_at ?? null, recipient.read_at ?? null).run();
    return;
  }
  throw new Error('This recycle-bin item type is not restorable.');
};

app.get('/api/phantom/recycle-bin', requireAuth, requirePhantom, async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 100)));
  const items = await dbRows<any>(c.env.DB.prepare(
    `SELECT r.id, r.resource_type, r.resource_id, r.title, r.deleted_at, u.name AS deleted_by_name
     FROM recycle_bin_items r LEFT JOIN users u ON u.id = r.deleted_by_user_id
     ORDER BY r.deleted_at DESC, r.id DESC LIMIT ?`
  ).bind(limit));
  return c.json({ success: true, data: items });
});

app.post('/api/phantom/recycle-bin/:id/restore', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid recycle-bin item.' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM recycle_bin_items WHERE id = ?').bind(id));
  const item = rows[0];
  if (!item) return c.json({ success: false, error: 'Recycle-bin item not found.' }, 404);
  try {
    await restoreRecycleBinItem(c.env.DB, item);
    await c.env.DB.prepare('DELETE FROM recycle_bin_items WHERE id = ?').bind(id).run();
    await audit(c.env.DB, await actorFromContext(c), 'recycle_bin.restored', item.resource_type, item.resource_id, { recycleId: id, title: item.title });
    return c.json({ success: true, message: `${item.title} restored.` });
  } catch (error: any) {
    return c.json({ success: false, error: error?.message || 'Could not restore this item.' }, 409);
  }
});

app.delete('/api/phantom/recycle-bin/:id', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid recycle-bin item.' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM recycle_bin_items WHERE id = ?').bind(id));
  const item = rows[0];
  if (!item) return c.json({ success: false, error: 'Recycle-bin item not found.' }, 404);
  await c.env.DB.prepare('DELETE FROM recycle_bin_items WHERE id = ?').bind(id).run();
  await audit(c.env.DB, await actorFromContext(c), 'recycle_bin.permanently_deleted', item.resource_type, item.resource_id, { recycleId: id, title: item.title });
  return c.json({ success: true, message: 'Recycle-bin item permanently deleted.' });
});

app.get('/api/phantom/overview', requireAuth, requirePhantom, async (c) => {
  const actor = await actorFromContext(c);
  const queries = await Promise.all([
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM member_profiles WHERE status = 'active'")),
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM applications WHERE status = 'pending'")),
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM member_profiles WHERE status = 'archived'")),
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM website_admins WHERE status = 'active'")),
    dbRows<any>(c.env.DB.prepare('SELECT COUNT(*) AS count FROM vault_documents WHERE is_archived = 0')),
    dbRows<any>(c.env.DB.prepare('SELECT COUNT(*) AS count FROM vault_projects WHERE is_archived = 0')),
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM vault_documents WHERE is_archived = 0 AND status = 'draft'")),
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM vault_documents WHERE is_archived = 0 AND status = 'in_review'")),
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM vault_documents WHERE is_archived = 1 OR status = 'archived'")),
    dbRows<any>(c.env.DB.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM vault_attachments')),
    dbRows<any>(c.env.DB.prepare(`SELECT a.*, u.name AS actor_name, mp.member_code AS actor_member_id
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id LEFT JOIN member_profiles mp ON mp.id = a.actor_member_profile_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT 10`)),
  ]);
  return c.json({ success: true, data: {
    activeMembers: Number(queries[0][0]?.count || 0),
    pendingApplications: Number(queries[1][0]?.count || 0),
    archivedMembers: Number(queries[2][0]?.count || 0),
    websiteAdmins: Number(queries[3][0]?.count || 0),
    vaultDocuments: Number(queries[4][0]?.count || 0),
    projects: Number(queries[5][0]?.count || 0),
    draftDocuments: Number(queries[6][0]?.count || 0),
    reviewDocuments: Number(queries[7][0]?.count || 0),
    archivedDocuments: Number(queries[8][0]?.count || 0),
    vaultStorageBytes: Number(queries[9][0]?.bytes || 0),
    recentActivity: queries[10],
    actor: actor ? publicActor(actor) : null,
  } });
});

app.get('/api/phantom/applications', requireAuth, requirePhantom, async (c) => {
  const applications = await dbRows<any>(c.env.DB.prepare(
    `SELECT a.*, mp.member_code, mp.status AS member_status,
       activation.expires_at AS activation_expires_at, activation.used_at AS activation_used_at,
       activation.revoked_at AS activation_revoked_at, activation.sent_at AS activation_sent_at,
       activation.delivery_status AS activation_delivery_status
     FROM applications a
     LEFT JOIN member_profiles mp ON mp.id = a.member_profile_id
     LEFT JOIN member_activations activation ON activation.id = (
       SELECT ma.id FROM member_activations ma WHERE ma.member_profile_id = mp.id ORDER BY ma.id DESC LIMIT 1
     )
     ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, a.created_at DESC, a.id DESC`
  ));
  return c.json({ success: true, data: applications });
});

const approveApplicationAndCreateInvitation = async (c: any) => {
  try {
    const applicationId = Number(c.req.param('id'));
    if (!Number.isInteger(applicationId) || applicationId < 1) return c.json({ success: false, error: 'Invalid application id' }, 400);
    const applicationRows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(applicationId));
    const application = applicationRows[0];
    if (!application) return c.json({ success: false, error: 'Application not found' }, 404);
    if (application.member_profile_id) return c.json({ success: false, error: 'This application already has a secure member invitation. Use the member invitation controls to regenerate the link if needed.' }, 409);
    if (application.status === 'rejected') return c.json({ success: false, error: 'Return this rejected application to pending review before approving it.' }, 409);
    const body = await c.req.json().catch(() => ({}));
    const actor = await actorFromContext(c);
    if (!actor) return c.json({ success: false, error: 'PHANTOM identity not found' }, 403);
    const member = await createMemberAccount({
      env: c.env,
      actor,
      name: cleanStr(body.name, 2, 100) || application.name,
      email: cleanEmail(body.email) || application.email,
      phone: cleanOptionalStr(body.phone, 30) || application.phone || null,
      roleCode: cleanStr(body.roleCode, 2, 50) || 'member',
      codenamePath: body.codenamePath as CodenamePath | undefined,
      foundingCodenameId: Number.isInteger(Number(body.foundingCodenameId)) ? Number(body.foundingCodenameId) : null,
      applicationId,
      applicationReviewNote: cleanOptionalStr(body.reviewNote, 2000),
    });
    return c.json({
      success: true,
      data: member,
      message: member.activationEmailSent
        ? 'Application approved. The secure password-setup invitation was emailed and is ready to copy.'
        : 'Application approved. Copy the secure password-setup link and send it to the applicant manually.',
    }, 201);
  } catch (error) {
    console.error('[code-rx] approve application and create invitation error:', error);
    const message = error instanceof Error ? error.message : 'Could not approve this application';
    return c.json({ success: false, error: message }, memberCreationErrorStatus(message));
  }
};

// The approval action is deliberately one operation: an applicant is only
// approved once a pending-activation member and one-time password setup link
// have been created. Keep the old route as a compatibility alias.
app.post('/api/phantom/applications/:id/approve-and-invite', requireAuth, requirePhantom, approveApplicationAndCreateInvitation);
app.post('/api/phantom/applications/:id/create-member', requireAuth, requirePhantom, approveApplicationAndCreateInvitation);

app.post('/api/phantom/members', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    if (!name || !email) return c.json({ success: false, error: 'Name and valid email are required' }, 400);
    const actor = await actorFromContext(c);
    if (!actor) return c.json({ success: false, error: 'PHANTOM identity not found' }, 403);
    const member = await createMemberAccount({
      env: c.env, actor, name, email,
      phone: cleanOptionalStr(body.phone, 30),
      roleCode: cleanStr(body.roleCode, 2, 50) || 'member',
      codenamePath: body.codenamePath as CodenamePath | undefined,
      foundingCodenameId: Number.isInteger(Number(body.foundingCodenameId)) ? Number(body.foundingCodenameId) : null,
    });
    return c.json({ success: true, data: member, message: 'Member created. Activation is required before the account becomes active.' }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create member';
    return c.json({ success: false, error: message }, memberCreationErrorStatus(message));
  }
});

app.post('/api/phantom/members/:id/activation-link', requireAuth, requirePhantom, async (c) => {
  if (!checkRateLimit(c, 20, 60)) return c.json({ success: false, error: 'Please wait before generating another invitation link.' }, 429);
  try {
    const profileId = Number(c.req.param('id'));
    if (!Number.isInteger(profileId) || profileId < 1) return c.json({ success: false, error: 'Invalid member profile id' }, 400);
    const rows = await dbRows<any>(c.env.DB.prepare(
      `SELECT mp.id, mp.member_code, mp.status, u.name, u.email, r.name AS role_name
       FROM member_profiles mp
       JOIN users u ON u.id = mp.user_id
       LEFT JOIN roles r ON r.id = mp.primary_role_id
       WHERE mp.id = ?`
    ).bind(profileId));
    const profile = rows[0];
    if (!profile) return c.json({ success: false, error: 'Member profile not found.' }, 404);
    if (profile.status !== 'pending_activation') {
      return c.json({ success: false, error: 'Only an awaiting-activation member can receive a new password-setup invitation.' }, 409);
    }
    const actor = await actorFromContext(c);
    if (!actor) return c.json({ success: false, error: 'PHANTOM identity not found' }, 403);
    const invitation = await issueMemberActivationInvite({
      env: c.env,
      actor,
      profileId,
      email: profile.email,
      name: profile.name,
      memberCode: profile.member_code,
      roleName: profile.role_name || 'Code Rx Member',
      event: 'member.activation_regenerated',
    });
    return c.json({
      success: true,
      data: {
        profileId,
        memberCode: profile.member_code,
        activationUrl: invitation.activationUrl,
        activationExpiresAt: invitation.expiresAt,
        activationEmailSent: invitation.emailSent,
        activationDeliveryStatus: invitation.deliveryStatus,
      },
      message: invitation.emailSent
        ? 'A replacement password-setup invitation was emailed. The earlier unused link is no longer valid.'
        : 'A replacement password-setup link is ready. Copy it and send it to the member securely; the earlier unused link is no longer valid.',
    });
  } catch (error) {
    console.error('[code-rx] regenerate activation invitation error:', error);
    return c.json({ success: false, error: 'Could not generate a replacement password-setup invitation.' }, 500);
  }
});

app.get('/api/phantom/members', requireAuth, requirePhantom, async (c) => {
  const status = c.req.query('status');
  const values: unknown[] = [];
  let where = '';
  if (status && ['pending_activation', 'active', 'locked', 'archived'].includes(status)) {
    where = 'WHERE mp.status = ?';
    values.push(status);
  }
  const members = await dbRows<any>(c.env.DB.prepare(
    `SELECT mp.*, u.name, u.email, m.phone, m.points, r.code AS role_code, r.name AS role_name, c.display_name AS codename,
       activation.expires_at AS activation_expires_at, activation.used_at AS activation_used_at,
       activation.revoked_at AS activation_revoked_at, activation.sent_at AS activation_sent_at,
       activation.delivery_status AS activation_delivery_status
     FROM member_profiles mp
     LEFT JOIN users u ON u.id = mp.user_id
     LEFT JOIN members m ON m.id = mp.member_record_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     LEFT JOIN codenames c ON c.claimed_by_member_profile_id = mp.id AND c.status = 'claimed'
     LEFT JOIN member_activations activation ON activation.id = (
       SELECT ma.id FROM member_activations ma WHERE ma.member_profile_id = mp.id ORDER BY ma.id DESC LIMIT 1
     )
     ${where}
     ORDER BY CASE mp.status WHEN 'pending_activation' THEN 0 WHEN 'active' THEN 1 WHEN 'locked' THEN 2 ELSE 3 END, mp.created_at DESC`
  ).bind(...values));
  return c.json({ success: true, data: members.map((member) => {
    const points = Number(member.points || 0);
    return { ...member, points, level: calcitoninLevel(points).label, calculated_level: calcitoninLevel(points) };
  }) });
});

app.patch('/api/phantom/members/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const profileId = Number(c.req.param('id'));
    if (!Number.isInteger(profileId) || profileId < 1) return c.json({ success: false, error: 'Invalid member profile id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const actor = await actorFromContext(c);
    const profileRows = await dbRows<any>(c.env.DB.prepare(
      `SELECT mp.*, r.code AS role_code, r.name AS role_name
       FROM member_profiles mp LEFT JOIN roles r ON r.id = mp.primary_role_id WHERE mp.id = ?`
    ).bind(profileId));
    const profile = profileRows[0];
    if (!profile) return c.json({ success: false, error: 'Member profile not found' }, 404);
    if (profile.role_code === 'phantom') {
      return c.json({ success: false, error: 'The PHANTOM founder profile cannot be changed from this action.' }, 403);
    }
    const action = body.action;
    if (action === 'lock' || action === 'unlock' || action === 'archive' || action === 'restore') {
      const completedActivation = await dbRows<any>(c.env.DB.prepare(
        'SELECT id FROM member_activations WHERE member_profile_id = ? AND used_at IS NOT NULL LIMIT 1'
      ).bind(profileId));
      const hasCompletedActivation = Boolean(completedActivation[0]);
      // Never allow a PHANTOM management action to skip the applicant's own
      // password setup. A restored/unlocked unactivated invitation returns to
      // pending_activation rather than becoming an active account.
      const status = action === 'lock' ? 'locked' : action === 'archive' ? 'archived' : hasCompletedActivation ? 'active' : 'pending_activation';
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE member_profiles SET status = ?, locked_reason = ?, locked_at = CASE WHEN ? = 'locked' THEN CURRENT_TIMESTAMP ELSE NULL END, archived_at = CASE WHEN ? = 'archived' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(status, action === 'lock' ? cleanOptionalStr(body.reason, 1000) : null, status, status, profileId),
        c.env.DB.prepare('UPDATE members SET is_active = ? WHERE id = ?').bind(status === 'active' ? 1 : 0, profile.member_record_id),
      ]);
      await audit(c.env.DB, actor, `member.${action}`, 'member_profile', profileId, { memberCode: profile.member_code, reason: cleanOptionalStr(body.reason, 1000), resultingStatus: status });
      return c.json({ success: true, message: status === 'pending_activation' ? 'Member remains awaiting their private password setup invitation.' : `Member ${action}ed`.replace('unlocked', 'unlocked').replace('archiveed', 'archived') });
    }
    if (body.phone !== undefined) {
      const phone = cleanOptionalStr(body.phone, 30);
      const normalizedPhone = phoneLoginKey(phone);
      if (phone && !normalizedPhone) return c.json({ success: false, error: 'Use a valid phone number for phone-number sign-in.' }, 400);
      if (normalizedPhone) {
        const existing = await dbRows<any>(c.env.DB.prepare('SELECT id FROM members WHERE phone_login_key = ? AND id != ? LIMIT 1').bind(normalizedPhone, profile.member_record_id));
        if (existing[0]) return c.json({ success: false, error: 'Another member already uses that phone number for sign-in.' }, 409);
      }
      await c.env.DB.prepare('UPDATE members SET phone = ?, phone_login_key = ? WHERE id = ?')
        .bind(phone, normalizedPhone, profile.member_record_id).run();
      await audit(c.env.DB, actor, 'member.phone_login.updated', 'member_profile', profileId, { memberCode: profile.member_code, phoneLoginEnabled: Boolean(normalizedPhone) });
      return c.json({ success: true, message: normalizedPhone ? 'Phone-number sign-in updated.' : 'Phone-number sign-in removed.' });
    }
    if (body.roleCode !== undefined) {
      const roleCode = cleanStr(body.roleCode, 2, 50);
      const roleRows = roleCode ? await dbRows<any>(c.env.DB.prepare('SELECT id, code, name FROM roles WHERE code = ?').bind(roleCode)) : [];
      const role = roleRows[0];
      if (!role || role.code === 'phantom') return c.json({ success: false, error: 'Choose a valid non-PHANTOM role.' }, 400);
      const claimedRows = await dbRows<any>(c.env.DB.prepare(
        "SELECT id FROM codenames WHERE claimed_by_member_profile_id = ? AND status = 'claimed'"
      ).bind(profileId));
      const hasPermanentCodename = Boolean(claimedRows[0]);
      // Keep an already-earned identity path immutable. Before a codename is
      // claimed, switching to/from Custom must also switch its ballot pool.
      const nextCodenamePath: CodenamePath = hasPermanentCodename || profile.codename_path === 'direct_founding'
        ? (profile.codename_path || 'member')
        : role.code === 'custom' ? 'custom_founding' : 'member';
      const resetBallot = !hasPermanentCodename && profile.codename_path !== 'direct_founding' && nextCodenamePath !== profile.codename_path;
      const statements: D1PreparedStatement[] = [
        c.env.DB.prepare('UPDATE member_profiles SET primary_role_id = ?, codename_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(role.id, nextCodenamePath, profileId),
        c.env.DB.prepare('UPDATE members SET role = ? WHERE id = ?')
          .bind(role.code, profile.member_record_id),
        c.env.DB.prepare('INSERT INTO member_role_history (member_profile_id, previous_role_id, new_role_id, changed_by_user_id, reason) VALUES (?, ?, ?, ?, ?)')
          .bind(profileId, profile.primary_role_id, role.id, actor?.userId ?? null, cleanOptionalStr(body.reason, 1000)),
      ];
      if (resetBallot) {
        statements.push(c.env.DB.prepare(
          `INSERT INTO codename_selection_sessions (member_profile_id, status, pool, assignment_source, passes_used, claimed_codename_id, current_codename_id, started_at, completed_at)
           VALUES (?, 'open', ?, 'ballot', 0, NULL, NULL, CURRENT_TIMESTAMP, NULL)
           ON CONFLICT(member_profile_id) DO UPDATE SET status = 'open', pool = excluded.pool, assignment_source = 'ballot',
             passes_used = 0, claimed_codename_id = NULL, current_codename_id = NULL, started_at = CURRENT_TIMESTAMP, completed_at = NULL`
        ).bind(profileId, poolForPath(nextCodenamePath)));
      }
      await c.env.DB.batch(statements);
      await audit(c.env.DB, actor, 'member.role.reassigned', 'member_profile', profileId, {
        from: profile.role_code,
        to: role.code,
        codenamePath: nextCodenamePath,
        ballotReset: resetBallot,
      });
      return c.json({ success: true, message: 'Role reassigned and history preserved.' });
    }
    return c.json({ success: false, error: 'Choose a member action or role reassignment.' }, 400);
  } catch (error) {
    console.error('[code-rx] phantom member update error:', error);
    return c.json({ success: false, error: 'Could not update this member' }, 500);
  }
});

app.get('/api/phantom/members/:id/history', requireAuth, requirePhantom, async (c) => {
  const profileId = Number(c.req.param('id'));
  if (!Number.isInteger(profileId) || profileId < 1) return c.json({ success: false, error: 'Invalid member profile id' }, 400);
  const [roles, codenames, activity] = await Promise.all([
    dbRows<any>(c.env.DB.prepare(
      `SELECT h.*, old_role.name AS previous_role, new_role.name AS new_role, u.name AS changed_by
       FROM member_role_history h LEFT JOIN roles old_role ON old_role.id = h.previous_role_id
       LEFT JOIN roles new_role ON new_role.id = h.new_role_id LEFT JOIN users u ON u.id = h.changed_by_user_id
       WHERE h.member_profile_id = ? ORDER BY h.changed_at DESC`
    ).bind(profileId)),
    dbRows<any>(c.env.DB.prepare('SELECT * FROM codename_history WHERE member_profile_id = ? ORDER BY created_at DESC').bind(profileId)),
    dbRows<any>(c.env.DB.prepare('SELECT * FROM audit_logs WHERE actor_member_profile_id = ? OR (subject_type = ? AND subject_id = ?) ORDER BY created_at DESC LIMIT 100')
      .bind(profileId, 'member_profile', String(profileId))),
  ]);
  return c.json({ success: true, data: { roles, codenames, activity } });
});

app.get('/api/phantom/members/:id/score-history', requireAuth, requirePhantom, async (c) => {
  const profileId = Number(c.req.param('id'));
  if (!Number.isInteger(profileId) || profileId < 1) return c.json({ success: false, error: 'Invalid member profile id.' }, 400);
  const events = await dbRows<any>(c.env.DB.prepare(
    `SELECT e.*, u.name AS changed_by_name
     FROM member_score_events e
     LEFT JOIN users u ON u.id = e.created_by_user_id
     WHERE e.member_profile_id = ? ORDER BY e.created_at DESC, e.id DESC LIMIT 200`
  ).bind(profileId));
  return c.json({ success: true, data: events.map((event) => ({
    ...event,
    points_delta: Number(event.points_delta || 0),
    balance_after: Number(event.balance_after || 0),
  })) });
});

app.post('/api/phantom/members/:id/score', requireAuth, requirePhantom, async (c) => {
  try {
    const profileId = Number(c.req.param('id'));
    if (!Number.isInteger(profileId) || profileId < 1) return c.json({ success: false, error: 'Invalid member profile id.' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const action = body.action as ScoreAdjustmentAction;
    const points = Number(body.points);
    const reason = cleanStr(body.reason, 2, 500);
    if (!['add', 'deduct', 'set'].includes(action) || !Number.isInteger(points) || points < 0 || points > 1_000_000 || !reason) {
      return c.json({ success: false, error: 'Choose add, deduct, or set; provide a whole Calcitonin value and a clear reason.' }, 400);
    }
    if ((action === 'add' || action === 'deduct') && points < 1) {
      return c.json({ success: false, error: 'Add and deduct actions require at least one CAL.' }, 400);
    }
    const target = await dbRows<any>(c.env.DB.prepare(
      `SELECT mp.id, mp.status, r.code AS role_code FROM member_profiles mp
       LEFT JOIN roles r ON r.id = mp.primary_role_id WHERE mp.id = ?`
    ).bind(profileId));
    if (!target[0]) return c.json({ success: false, error: 'Member profile not found.' }, 404);
    if (target[0].role_code === 'phantom') return c.json({ success: false, error: 'PHANTOM’s own Calcitonin balance is protected.' }, 403);
    if (target[0].status === 'archived') return c.json({ success: false, error: 'Restore this member before changing their Calcitonins.' }, 409);
    const actor = await actorFromContext(c);
    const result = await adjustMemberScore(c.env.DB, { memberProfileId: profileId, action, points, reason, actor });
    if (!result) return c.json({ success: false, error: 'Member Calcitonins could not be updated.' }, 404);
    await notifyMember(
      c.env.DB,
      profileId,
      'Calcitonins updated',
      `${result.delta >= 0 ? '+' : ''}${result.delta} CAL: ${reason}. Your Calcitonin balance is now ${result.balance} CAL (${result.level.label}).`,
      actor,
    );
    await audit(c.env.DB, actor, 'member.score.manual_adjustment', 'member_profile', profileId, {
      action,
      requestedPoints: points,
      delta: result.delta,
      balance: result.balance,
      reason,
    });
    return c.json({ success: true, data: { balance: result.balance, delta: result.delta, eventId: result.eventId }, message: 'Member Calcitonins updated.' });
  } catch (error) {
    console.error('[code-rx] manual Calcitonin adjustment error:', error);
    return c.json({ success: false, error: 'Could not update this member’s Calcitonins.' }, 500);
  }
});

app.get('/api/phantom/score-rules', requireAuth, requirePhantom, async (c) => {
  const rules = await dbRows<any>(c.env.DB.prepare('SELECT * FROM score_rules ORDER BY rule_key'));
  return c.json({ success: true, data: rules.map((rule) => ({ ...rule, points: Number(rule.points || 0), enabled: Number(rule.enabled || 0) === 1 })) });
});

app.put('/api/phantom/score-rules/:key', requireAuth, requirePhantom, async (c) => {
  const key = cleanStr(c.req.param('key'), 2, 100);
  const body = await c.req.json().catch(() => ({}));
  if (!key) return c.json({ success: false, error: 'Invalid Calcitonin rule.' }, 400);
  const current = await dbRows<any>(c.env.DB.prepare('SELECT * FROM score_rules WHERE rule_key = ?').bind(key));
  if (!current[0]) return c.json({ success: false, error: 'Calcitonin rule not found.' }, 404);
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return c.json({ success: false, error: 'Rule enabled must be true or false.' }, 400);
    fields.push('enabled = ?'); values.push(body.enabled ? 1 : 0);
  }
  if (body.points !== undefined) {
    const points = Number(body.points);
    if (!Number.isInteger(points) || points < 0 || points > 10_000) return c.json({ success: false, error: 'Automatic rule Calcitonins must be a whole number from 0 to 10,000 CAL.' }, 400);
    fields.push('points = ?'); values.push(points);
  }
  if (!fields.length) return c.json({ success: false, error: 'No Calcitonin-rule change supplied.' }, 400);
  fields.push('updated_at = CURRENT_TIMESTAMP');
  const actor = await actorFromContext(c);
  values.push(actor?.userId ?? null, key);
  await c.env.DB.prepare(`UPDATE score_rules SET ${fields.join(', ')}, updated_by_user_id = ? WHERE rule_key = ?`).bind(...values).run();
  await audit(c.env.DB, actor, 'score.rule.updated', 'score_rule', key, { fields: fields.slice(0, -1) });
  return c.json({ success: true, message: 'Automatic Calcitonin rule updated.' });
});

app.get('/api/phantom/roles', requireAuth, requirePhantom, async (c) => {
  const roles = await dbRows<any>(c.env.DB.prepare(`SELECT * FROM roles ORDER BY CASE code WHEN 'phantom' THEN 0 ELSE 1 END, name`));
  const permissions = await dbRows<any>(c.env.DB.prepare('SELECT * FROM role_permissions ORDER BY role_id, section_slug'));
  const sections = await dbRows<any>(c.env.DB.prepare('SELECT slug, title, description, is_sensitive, sort_order FROM vault_sections WHERE is_archived = 0 ORDER BY sort_order, title'));
  return c.json({ success: true, data: { roles, permissions, actions: VAULT_ACTIONS, sections } });
});

app.post('/api/phantom/roles', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const code = cleanStr(body.code, 2, 50)?.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const name = cleanStr(body.name, 2, 100);
    const description = cleanOptionalStr(body.description, 1000) || '';
    if (!code || !name || code === 'phantom') return c.json({ success: false, error: 'A valid custom role code and name are required.' }, 400);
    const result = await c.env.DB.prepare('INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, 0)').bind(code, name, description).run();
    const roleId = Number(result.meta.last_row_id);
    // Include PHANTOM-created sections too, not only the original seed list.
    const sections = await dbRows<{ slug: string }>(c.env.DB.prepare('SELECT slug FROM vault_sections WHERE is_archived = 0'));
    if (sections.length) await c.env.DB.batch(sections.map((section) =>
      c.env.DB.prepare('INSERT INTO role_permissions (role_id, section_slug) VALUES (?, ?)').bind(roleId, section.slug)
    ));
    await audit(c.env.DB, await actorFromContext(c), 'role.created', 'role', roleId, { code, name });
    return c.json({ success: true, data: { id: roleId, code, name } }, 201);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) return c.json({ success: false, error: 'That role code already exists.' }, 409);
    return c.json({ success: false, error: 'Could not create role' }, 500);
  }
});

// The role code is a stable internal permission key. PHANTOM may change the
// visible responsibility name and description without turning a Founding Name
// into a role again or breaking historical memberships.
app.patch('/api/phantom/roles/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const roleId = Number(c.req.param('id'));
    if (!Number.isInteger(roleId) || roleId < 1) return c.json({ success: false, error: 'Invalid responsibility id.' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const currentRows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM roles WHERE id = ?').bind(roleId));
    const role = currentRows[0];
    if (!role) return c.json({ success: false, error: 'Responsibility profile not found.' }, 404);
    const name = body.name === undefined ? role.name : cleanStr(body.name, 2, 100);
    const description = body.description === undefined ? role.description : cleanOptionalStr(body.description, 1000) || '';
    if (!name) return c.json({ success: false, error: 'Use a responsibility name of 2–100 characters.' }, 400);
    const actor = await actorFromContext(c);
    await c.env.DB.prepare('UPDATE roles SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(name, description, roleId).run();
    await audit(c.env.DB, actor, 'responsibility.label.updated', 'role', roleId, { code: role.code, name, description });
    return c.json({ success: true, data: { id: roleId, code: role.code, name, description }, message: 'Responsibility label updated.' });
  } catch (error) {
    console.error('[code-rx] responsibility label update error:', error);
    return c.json({ success: false, error: 'Could not update this responsibility label.' }, 500);
  }
});

app.put('/api/phantom/roles/:id/permissions', requireAuth, requirePhantom, async (c) => {
  try {
    const roleId = Number(c.req.param('id'));
    if (!Number.isInteger(roleId) || roleId < 1) return c.json({ success: false, error: 'Invalid role id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    if (!Array.isArray(body.permissions)) return c.json({ success: false, error: 'A permission matrix is required.' }, 400);
    const targetRoleRows = await dbRows<{ id: number }>(c.env.DB.prepare('SELECT id FROM roles WHERE id = ?').bind(roleId));
    if (!targetRoleRows[0]) return c.json({ success: false, error: 'Role not found.' }, 404);
    const validSections = new Set((await dbRows<any>(c.env.DB.prepare('SELECT slug FROM vault_sections WHERE is_archived = 0'))).map((section) => section.slug));
    for (const row of body.permissions) {
      const slug = cleanStr(row.sectionSlug, 1, 60);
      if (!slug || !validSections.has(slug)) return c.json({ success: false, error: `Invalid Vault section: ${row.sectionSlug || ''}` }, 400);
      await c.env.DB.prepare(
        `INSERT INTO role_permissions (role_id, section_slug, can_view, can_create, can_edit, can_delete, can_manage, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(role_id, section_slug) DO UPDATE SET
           can_view = excluded.can_view, can_create = excluded.can_create, can_edit = excluded.can_edit,
           can_delete = excluded.can_delete, can_manage = excluded.can_manage, updated_at = CURRENT_TIMESTAMP`
      ).bind(roleId, slug, row.canView ? 1 : 0, row.canCreate ? 1 : 0, row.canEdit ? 1 : 0, row.canDelete ? 1 : 0, row.canManage ? 1 : 0).run();
    }
    await audit(c.env.DB, await actorFromContext(c), 'role.permissions.changed', 'role', roleId, { permissionRows: body.permissions.length });
    return c.json({ success: true, message: 'Role permissions updated.' });
  } catch (error) {
    console.error('[code-rx] role permissions error:', error);
    return c.json({ success: false, error: 'Could not update role permissions' }, 500);
  }
});

app.put('/api/phantom/members/:id/permissions', requireAuth, requirePhantom, async (c) => {
  try {
    const profileId = Number(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));
    if (!Number.isInteger(profileId) || profileId < 1 || !Array.isArray(body.permissions)) {
      return c.json({ success: false, error: 'A member and permission matrix are required.' }, 400);
    }
    const targetProfileRows = await dbRows<any>(c.env.DB.prepare(
      `SELECT mp.id, r.code AS role_code FROM member_profiles mp
       LEFT JOIN roles r ON r.id = mp.primary_role_id WHERE mp.id = ?`
    ).bind(profileId));
    if (!targetProfileRows[0]) return c.json({ success: false, error: 'Member profile not found.' }, 404);
    if (targetProfileRows[0].role_code === 'phantom') {
      return c.json({ success: false, error: 'PHANTOM permissions are fixed at the server level.' }, 403);
    }
    const validSections = new Set((await dbRows<any>(c.env.DB.prepare('SELECT slug FROM vault_sections WHERE is_archived = 0'))).map((section) => section.slug));
    for (const row of body.permissions) {
      const slug = cleanStr(row.sectionSlug, 1, 60);
      if (!slug || !validSections.has(slug)) return c.json({ success: false, error: 'Invalid Vault section.' }, 400);
      await c.env.DB.prepare(
        `INSERT INTO member_permission_overrides (member_profile_id, section_slug, can_view, can_create, can_edit, can_delete, can_manage, updated_by_user_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(member_profile_id, section_slug) DO UPDATE SET
           can_view = excluded.can_view, can_create = excluded.can_create, can_edit = excluded.can_edit,
           can_delete = excluded.can_delete, can_manage = excluded.can_manage,
           updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
      ).bind(profileId, slug,
        row.canView === null ? null : row.canView ? 1 : 0,
        row.canCreate === null ? null : row.canCreate ? 1 : 0,
        row.canEdit === null ? null : row.canEdit ? 1 : 0,
        row.canDelete === null ? null : row.canDelete ? 1 : 0,
        row.canManage === null ? null : row.canManage ? 1 : 0,
        (await actorFromContext(c))?.userId ?? null,
      ).run();
    }
    await audit(c.env.DB, await actorFromContext(c), 'member.permissions.changed', 'member_profile', profileId, { permissionRows: body.permissions.length });
    return c.json({ success: true, message: 'Member permission overrides updated.' });
  } catch (error) {
    console.error('[code-rx] member permissions error:', error);
    return c.json({ success: false, error: 'Could not update member permissions' }, 500);
  }
});

const WEBSITE_PERMISSION_KEYS = [
  'pages.edit', 'announcements.manage', 'events.manage', 'projects.manage',
  'media.upload', 'resources.manage', 'content.manage',
] as const;

app.get('/api/phantom/website-admins', requireAuth, requirePhantom, async (c) => {
  const admins = await dbRows<any>(c.env.DB.prepare(
    `SELECT wa.*, mp.member_code, u.name, u.email, r.code AS role_code
     FROM website_admins wa
     JOIN member_profiles mp ON mp.id = wa.member_profile_id
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     ORDER BY wa.status, wa.assigned_at DESC`
  ));
  const permissions = await dbRows<any>(c.env.DB.prepare('SELECT * FROM website_admin_permissions ORDER BY website_admin_id, permission_key'));
  return c.json({ success: true, data: { admins, permissions, availablePermissions: WEBSITE_PERMISSION_KEYS } });
});

app.post('/api/phantom/website-admins', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const profileId = Number(body.memberProfileId);
    const permissionKeys = Array.isArray(body.permissions) ? body.permissions.filter((key: unknown) => typeof key === 'string' && (WEBSITE_PERMISSION_KEYS as readonly string[]).includes(key)) : [];
    if (!Number.isInteger(profileId) || profileId < 1) return c.json({ success: false, error: 'Choose an active member.' }, 400);
    const profileRows = await dbRows<any>(c.env.DB.prepare("SELECT id, status FROM member_profiles WHERE id = ?").bind(profileId));
    if (!profileRows[0] || profileRows[0].status !== 'active') return c.json({ success: false, error: 'Website Admin must be an active member.' }, 409);
    const actor = await actorFromContext(c);
    await c.env.DB.prepare(
      `INSERT INTO website_admins (member_profile_id, status, assigned_by_user_id, assigned_at, suspended_at)
       VALUES (?, 'active', ?, CURRENT_TIMESTAMP, NULL)
       ON CONFLICT(member_profile_id) DO UPDATE SET status = 'active', assigned_by_user_id = excluded.assigned_by_user_id, assigned_at = CURRENT_TIMESTAMP, suspended_at = NULL`
    ).bind(profileId, actor?.userId ?? null).run();
    const row = await dbRows<any>(c.env.DB.prepare('SELECT id FROM website_admins WHERE member_profile_id = ?').bind(profileId));
    const websiteAdminId = row[0]?.id;
    await c.env.DB.prepare('DELETE FROM website_admin_permissions WHERE website_admin_id = ?').bind(websiteAdminId).run();
    for (const permission of permissionKeys) {
      await c.env.DB.prepare('INSERT INTO website_admin_permissions (website_admin_id, permission_key, allowed) VALUES (?, ?, 1)').bind(websiteAdminId, permission).run();
    }
    await audit(c.env.DB, actor, 'website_admin.assigned', 'member_profile', profileId, { permissions: permissionKeys });
    return c.json({ success: true, message: 'Website Admin assigned.' });
  } catch (error) {
    console.error('[code-rx] assign website admin error:', error);
    return c.json({ success: false, error: 'Could not assign Website Admin' }, 500);
  }
});

app.patch('/api/phantom/website-admins/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid Website Admin id' }, 400);
    const status = body.status;
    if (status && !['active', 'suspended', 'removed'].includes(status)) return c.json({ success: false, error: 'Invalid Website Admin status' }, 400);
    const actor = await actorFromContext(c);
    if (status) {
      await c.env.DB.prepare("UPDATE website_admins SET status = ?, suspended_at = CASE WHEN ? = 'suspended' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?")
        .bind(status, status, id).run();
    }
    if (Array.isArray(body.permissions)) {
      const permissionKeys = body.permissions.filter((key: unknown) => typeof key === 'string' && (WEBSITE_PERMISSION_KEYS as readonly string[]).includes(key));
      await c.env.DB.prepare('DELETE FROM website_admin_permissions WHERE website_admin_id = ?').bind(id).run();
      for (const permission of permissionKeys) await c.env.DB.prepare('INSERT INTO website_admin_permissions (website_admin_id, permission_key, allowed) VALUES (?, ?, 1)').bind(id, permission).run();
    }
    await audit(c.env.DB, actor, `website_admin.${status || 'permissions_updated'}`, 'website_admin', id, { permissions: body.permissions || null });
    return c.json({ success: true, message: 'Website Admin updated.' });
  } catch (error) {
    console.error('[code-rx] update website admin error:', error);
    return c.json({ success: false, error: 'Could not update Website Admin' }, 500);
  }
});

app.get('/api/phantom/vault-sections', requireAuth, requirePhantom, async (c) => {
  const sections = await dbRows<any>(c.env.DB.prepare('SELECT * FROM vault_sections ORDER BY is_archived, sort_order, title'));
  return c.json({ success: true, data: sections });
});

app.post('/api/phantom/vault-sections', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const slug = cleanStr(body.slug, 2, 60)?.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const title = cleanStr(body.title, 2, 100);
    if (!slug || !title) return c.json({ success: false, error: 'A valid section slug and title are required.' }, 400);
    const result = await c.env.DB.prepare(
      'INSERT INTO vault_sections (slug, title, description, is_sensitive, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).bind(slug, title, cleanOptionalStr(body.description, 1000) || '', body.isSensitive ? 1 : 0, Number(body.sortOrder) || 100).run();
    const sectionId = Number(result.meta.last_row_id);
    const roles = await dbRows<any>(c.env.DB.prepare('SELECT id, code FROM roles'));
    for (const role of roles) {
      const all = role.code === 'phantom' ? [1, 1, 1, 1, 1] : [0, 0, 0, 0, 0];
      await c.env.DB.prepare('INSERT INTO role_permissions (role_id, section_slug, can_view, can_create, can_edit, can_delete, can_manage) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(role.id, slug, ...all).run();
    }
    await audit(c.env.DB, await actorFromContext(c), 'vault.section.created', 'vault_section', sectionId, { slug, title });
    return c.json({ success: true, data: { id: sectionId, slug, title } }, 201);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) return c.json({ success: false, error: 'That Vault section already exists.' }, 409);
    return c.json({ success: false, error: 'Could not create Vault section.' }, 500);
  }
});

app.patch('/api/phantom/vault-sections/:id', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid Vault section id.' }, 400);
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.title !== undefined) { const title = cleanStr(body.title, 2, 100); if (!title) return c.json({ success: false, error: 'Invalid title.' }, 400); fields.push('title = ?'); values.push(title); }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(cleanOptionalStr(body.description, 1000) || ''); }
  if (body.isSensitive !== undefined) { fields.push('is_sensitive = ?'); values.push(body.isSensitive ? 1 : 0); }
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) { fields.push('sort_order = ?'); values.push(Number(body.sortOrder)); }
  if (body.archive !== undefined) {
    if (typeof body.archive !== 'boolean') return c.json({ success: false, error: 'Vault section archive must be true or false.' }, 400);
    fields.push('is_archived = ?'); values.push(body.archive ? 1 : 0);
  }
  if (!fields.length) return c.json({ success: false, error: 'No Vault section changes supplied.' }, 400);
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  await c.env.DB.prepare(`UPDATE vault_sections SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  await audit(c.env.DB, await actorFromContext(c), 'vault.section.updated', 'vault_section', id, { fields: fields.slice(0, -1) });
  return c.json({ success: true, message: 'Vault section updated.' });
});

app.get('/api/phantom/codenames', requireAuth, requirePhantom, async (c) => {
  const codenames = await dbRows<any>(c.env.DB.prepare(
    `SELECT c.*, mp.member_code, u.name AS owner_name
     FROM codenames c
     LEFT JOIN member_profiles mp ON mp.id = c.claimed_by_member_profile_id
     LEFT JOIN users u ON u.id = mp.user_id
     ORDER BY CASE c.status WHEN 'available' THEN 0 WHEN 'reserved' THEN 1 WHEN 'claimed' THEN 2 ELSE 3 END, c.display_name COLLATE NOCASE`
  ));
  const history = await dbRows<any>(c.env.DB.prepare('SELECT * FROM codename_history ORDER BY created_at DESC, id DESC LIMIT 100'));
  return c.json({ success: true, data: { codenames, history } });
});

app.post('/api/phantom/codenames', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const displayName = cleanStr(body.name, 2, 50)?.replace(/\s+/g, ' ');
    if (!displayName || !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(displayName)) {
      return c.json({ success: false, error: 'Use a 2–50 character codename with letters, numbers, spaces, dots, hyphens, or underscores.' }, 400);
    }
    const normalized = normalizeCodename(displayName);
    const pool = body.pool === 'founding' ? 'founding' : 'member';
    const actor = await actorFromContext(c);
    const result = await c.env.DB.prepare(
      'INSERT INTO codenames (normalized_name, display_name, pool, status, created_by_user_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(normalized, displayName, pool, body.reserve ? 'reserved' : 'available', actor?.userId ?? null).run();
    const id = Number(result.meta.last_row_id);
    await c.env.DB.prepare('INSERT INTO codename_history (codename_id, event_type, acted_by_user_id, note) VALUES (?, ?, ?, ?)')
      .bind(id, body.reserve ? 'reserved' : 'added', actor?.userId ?? null, cleanOptionalStr(body.note, 1000)).run();
    await audit(c.env.DB, actor, `codename.${body.reserve ? 'reserved' : 'added'}`, 'codename', id, { name: displayName, pool });
    return c.json({ success: true, data: { id, displayName } }, 201);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) return c.json({ success: false, error: 'That codename already exists.' }, 409);
    return c.json({ success: false, error: 'Could not add codename' }, 500);
  }
});

// Bulk import accepts simple comma/newline text, a JSON string array, or JSON
// objects such as { name, pool, reserve, note }. It validates the full batch
// before writing so a typo never leaves PHANTOM with a partial pool.
app.post('/api/phantom/codenames/batch', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const defaultPool = body.pool === 'founding' ? 'founding' : 'member';
    const defaultReserve = body.reserve === true;
    const source = body.codenames ?? body.input;
    let rawEntries: any[] = [];
    if (Array.isArray(source)) rawEntries = source;
    else if (typeof source === 'string') {
      const raw = source.trim();
      if (!raw) return c.json({ success: false, error: 'Paste at least one codename.' }, 400);
      if (raw.startsWith('[') || raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw);
          rawEntries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.codenames) ? parsed.codenames : parsed && typeof parsed === 'object' ? [parsed] : [];
        } catch {
          return c.json({ success: false, error: 'That JSON could not be read. Use a JSON array or a comma-separated list.' }, 400);
        }
      } else rawEntries = raw.split(/[\n,;]+/).map((name) => name.trim()).filter(Boolean);
    }
    if (!rawEntries.length) return c.json({ success: false, error: 'Add one or more codenames before importing.' }, 400);
    if (rawEntries.length > 75) return c.json({ success: false, error: 'Add up to 75 codenames at one time.' }, 400);

    const drafts: Array<{ displayName: string; normalized: string; pool: 'member' | 'founding'; reserve: boolean; note: string | null }> = [];
    const seen = new Set<string>();
    for (const entry of rawEntries) {
      const object = typeof entry === 'object' && entry !== null ? entry : { name: entry };
      const displayName = cleanStr(object.name ?? object.codename, 2, 50)?.replace(/\s+/g, ' ');
      if (!displayName || !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(displayName)) {
        return c.json({ success: false, error: `“${String(object.name ?? object.codename ?? 'codename').slice(0, 50)}” is not a valid codename. Use 2–50 letters, numbers, spaces, dots, hyphens, or underscores.` }, 400);
      }
      const normalized = normalizeCodename(displayName);
      if (seen.has(normalized)) return c.json({ success: false, error: `“${displayName}” appears more than once in this batch.` }, 409);
      seen.add(normalized);
      drafts.push({
        displayName,
        normalized,
        pool: object.pool === undefined ? defaultPool : object.pool === 'founding' ? 'founding' : object.pool === 'member' ? 'member' : defaultPool,
        reserve: object.reserve === undefined ? defaultReserve : object.reserve === true,
        note: cleanOptionalStr(object.note, 1000),
      });
    }
    const existing = await dbRows<{ normalized_name: string }>(c.env.DB.prepare(
      `SELECT normalized_name FROM codenames WHERE normalized_name IN (${drafts.map(() => '?').join(',')})`
    ).bind(...drafts.map((draft) => draft.normalized)));
    if (existing.length) {
      const existingNames = new Set(existing.map((row) => row.normalized_name));
      const duplicate = drafts.find((draft) => existingNames.has(draft.normalized));
      return c.json({ success: false, error: `“${duplicate?.displayName || 'A codename'}” already exists. No codenames were added.` }, 409);
    }
    const actor = await actorFromContext(c);
    const statements: D1PreparedStatement[] = [];
    for (const draft of drafts) {
      statements.push(c.env.DB.prepare(
        'INSERT INTO codenames (normalized_name, display_name, pool, status, created_by_user_id) VALUES (?, ?, ?, ?, ?)'
      ).bind(draft.normalized, draft.displayName, draft.pool, draft.reserve ? 'reserved' : 'available', actor?.userId ?? null));
    }
    const created = await c.env.DB.batch(statements);
    const ids = created.map((result) => Number(result.meta.last_row_id));
    await c.env.DB.batch(drafts.map((draft, index) => c.env.DB.prepare(
      'INSERT INTO codename_history (codename_id, event_type, acted_by_user_id, note) VALUES (?, ?, ?, ?)'
    ).bind(ids[index], draft.reserve ? 'reserved' : 'added', actor?.userId ?? null, draft.note)));
    await audit(c.env.DB, actor, 'codename.batch_added', 'codename_batch', null, { count: drafts.length, pools: [...new Set(drafts.map((draft) => draft.pool))], reserved: drafts.filter((draft) => draft.reserve).length });
    return c.json({ success: true, data: { count: drafts.length, codenames: drafts.map((draft, index) => ({ id: ids[index], displayName: draft.displayName, pool: draft.pool, reserved: draft.reserve })) }, message: `${drafts.length} codename${drafts.length === 1 ? '' : 's'} added.` }, 201);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) return c.json({ success: false, error: 'One of these codenames already exists. No codenames were added.' }, 409);
    console.error('[code-rx] bulk codename import error:', error);
    return c.json({ success: false, error: 'Could not add this codename batch.' }, 500);
  }
});

app.post('/api/phantom/codenames/:id/assign', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const profileId = Number(body.memberProfileId);
  if (!Number.isInteger(id) || !Number.isInteger(profileId) || id < 1 || profileId < 1) {
    return c.json({ success: false, error: 'Choose a codename and member profile.' }, 400);
  }
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM codenames WHERE id = ?').bind(id));
  const codename = rows[0];
  if (!codename || codename.pool !== 'founding' || codename.status !== 'available') return c.json({ success: false, error: 'Only an available founding codename can be assigned directly.' }, 409);
  const profileRows = await dbRows<any>(c.env.DB.prepare("SELECT id, member_code, status FROM member_profiles WHERE id = ?").bind(profileId));
  if (!profileRows[0] || !['active', 'pending_activation'].includes(profileRows[0].status)) return c.json({ success: false, error: 'Choose an active or awaiting-activation member.' }, 409);
  const existingClaim = await dbRows<any>(c.env.DB.prepare("SELECT id FROM codenames WHERE claimed_by_member_profile_id = ? AND status = 'claimed'").bind(profileId));
  if (existingClaim[0]) return c.json({ success: false, error: 'This member already has a permanent codename.' }, 409);
  const actor = await actorFromContext(c);
  const claim = await c.env.DB.prepare(
    `UPDATE codenames SET status = 'claimed', claimed_by_member_profile_id = ?, claimed_at = CURRENT_TIMESTAMP, reserved_note = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND pool = 'founding' AND status = 'available' AND claimed_by_member_profile_id IS NULL`
  ).bind(profileId, id).run();
  if (Number(claim.meta.changes || 0) !== 1) return c.json({ success: false, error: 'This codename was just claimed or assigned elsewhere.' }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE member_profiles SET codename_path = 'direct_founding', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(profileId),
    c.env.DB.prepare(
      `INSERT INTO codename_selection_sessions (member_profile_id, status, pool, assignment_source, passes_used, claimed_codename_id, current_codename_id, ballot_slots_json, revealed_codenames_json, review_target_count, completed_at)
       VALUES (?, 'completed', 'founding', 'phantom_direct', 0, ?, NULL, '[]', '[]', 0, CURRENT_TIMESTAMP)
       ON CONFLICT(member_profile_id) DO UPDATE SET status = 'completed', pool = 'founding', assignment_source = 'phantom_direct', claimed_codename_id = excluded.claimed_codename_id, current_codename_id = NULL, ballot_slots_json = '[]', revealed_codenames_json = '[]', review_target_count = 0, completed_at = CURRENT_TIMESTAMP`
    ).bind(profileId, id),
    c.env.DB.prepare("INSERT INTO codename_history (codename_id, member_profile_id, event_type, acted_by_user_id, note) VALUES (?, ?, 'claimed', ?, ?)")
      .bind(id, profileId, actor?.userId ?? null, 'Assigned by PHANTOM as a founding or reserved identity'),
  ]);
  await audit(c.env.DB, actor, 'codename.assigned', 'codename', id, { codename: codename.display_name, memberProfileId: profileId, memberCode: profileRows[0].member_code });
  return c.json({ success: true, message: `${codename.display_name} assigned to ${profileRows[0].member_code}.` });
});

app.patch('/api/phantom/codenames/:id', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid codename id' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM codenames WHERE id = ?').bind(id));
  const codename = rows[0];
  if (!codename) return c.json({ success: false, error: 'Codename not found' }, 404);
  const action = body.action;
  if (!['reserve', 'unreserve', 'retire'].includes(action)) return c.json({ success: false, error: 'Choose reserve, unreserve, or retire.' }, 400);
  if (codename.status === 'claimed') return c.json({ success: false, error: 'Claimed codenames are historical records and cannot be removed or reserved.' }, 409);
  const nextStatus = action === 'reserve' ? 'reserved' : action === 'unreserve' ? 'available' : 'retired';
  const actor = await actorFromContext(c);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE codenames SET status = ?, reserved_note = ?, reserved_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(nextStatus, action === 'reserve' ? cleanOptionalStr(body.note, 1000) : null, action === 'reserve' ? actor?.userId ?? null : null, id),
    c.env.DB.prepare('INSERT INTO codename_history (codename_id, event_type, acted_by_user_id, note) VALUES (?, ?, ?, ?)')
      .bind(id, action === 'retire' ? 'retired' : action === 'reserve' ? 'reserved' : 'unreserved', actor?.userId ?? null, cleanOptionalStr(body.note, 1000)),
  ]);
  await audit(c.env.DB, actor, `codename.${action}`, 'codename', id, { name: codename.display_name });
  return c.json({ success: true, message: `Codename ${action}d`.replace('retired', 'retired') });
});

app.post('/api/phantom/codenames/:id/release', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(id) || id < 1 || body.confirm !== true) return c.json({ success: false, error: 'Explicit release confirmation is required.' }, 400);
  const mode = body.mode === 'available' ? 'available' : 'retired';
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM codenames WHERE id = ?').bind(id));
  const codename = rows[0];
  if (!codename || codename.status !== 'claimed') return c.json({ success: false, error: 'Only a claimed codename can be explicitly released.' }, 409);
  const ownerRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT mp.id, mp.codename_path, r.code AS role_code
     FROM member_profiles mp LEFT JOIN roles r ON r.id = mp.primary_role_id
     WHERE mp.id = ?`
  ).bind(codename.claimed_by_member_profile_id));
  const owner = ownerRows[0];
  if (codename.normalized_name === 'phantom' || owner?.role_code === 'phantom') {
    return c.json({ success: false, error: 'The PHANTOM founder identity cannot be released.' }, 403);
  }
  const actor = await actorFromContext(c);
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('UPDATE codenames SET status = ?, claimed_by_member_profile_id = NULL, claimed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(mode, id),
    c.env.DB.prepare("INSERT INTO codename_history (codename_id, member_profile_id, event_type, acted_by_user_id, note) VALUES (?, ?, 'released', ?, ?)")
      .bind(id, codename.claimed_by_member_profile_id, actor?.userId ?? null, mode === 'available' ? 'Explicitly released back to ballot by PHANTOM' : 'Explicitly released and retired by PHANTOM'),
  ];
  if (owner?.codename_path === 'member' || owner?.codename_path === 'custom_founding') {
    // The release removes a permanent identity only after the session is made
    // usable again, so an active member is never stranded without a ballot.
    statements.push(c.env.DB.prepare(
      `INSERT INTO codename_selection_sessions (member_profile_id, status, pool, assignment_source, passes_used, claimed_codename_id, current_codename_id, started_at, completed_at)
       VALUES (?, 'open', ?, 'ballot', 0, NULL, NULL, CURRENT_TIMESTAMP, NULL)
       ON CONFLICT(member_profile_id) DO UPDATE SET status = 'open', pool = excluded.pool, assignment_source = 'ballot',
         passes_used = 0, claimed_codename_id = NULL, current_codename_id = NULL, started_at = CURRENT_TIMESTAMP, completed_at = NULL`
    ).bind(owner.id, owner.codename_path === 'custom_founding' ? 'founding' : 'member'));
  } else if (owner?.codename_path === 'direct_founding') {
    // Direct-assignment members must wait for PHANTOM to choose their next
    // founding identity; they must not silently gain access to a ballot.
    statements.push(c.env.DB.prepare(
      "UPDATE codename_selection_sessions SET status = 'expired', claimed_codename_id = NULL, current_codename_id = NULL, completed_at = NULL WHERE member_profile_id = ?"
    ).bind(owner.id));
  }
  await c.env.DB.batch(statements);
  await audit(c.env.DB, actor, 'codename.released', 'codename', id, {
    mode,
    name: codename.display_name,
    memberProfileId: owner?.id || null,
    replacementBallotOpened: owner?.codename_path === 'member' || owner?.codename_path === 'custom_founding',
  });
  return c.json({ success: true, message: mode === 'available' ? 'Codename explicitly returned to the ballot.' : 'Codename released and retired.' });
});

app.get('/api/phantom/audit-logs', requireAuth, requirePhantom, async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 100)));
  const logs = await dbRows<any>(c.env.DB.prepare(
    `SELECT a.*, u.name AS actor_name, mp.member_code AS actor_member_code
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     LEFT JOIN member_profiles mp ON mp.id = a.actor_member_profile_id
     ORDER BY a.created_at DESC, a.id DESC LIMIT ?`
  ).bind(limit));
  return c.json({ success: true, data: logs });
});

app.get('/api/phantom/settings', requireAuth, requirePhantom, async (c) => {
  const settings = await dbRows<any>(c.env.DB.prepare('SELECT setting_key, setting_value, updated_at FROM system_settings ORDER BY setting_key'));
  // Defensive masking for any values inserted before secret-key validation was introduced.
  const safeSettings = settings.map((setting) => ({
    ...setting,
    setting_value: /(secret|password|token|api[_-]?key|credential)/i.test(setting.setting_key) ? '••••••••' : setting.setting_value,
  }));
  return c.json({ success: true, data: safeSettings });
});

app.put('/api/phantom/settings/:key', requireAuth, requirePhantom, async (c) => {
  const key = cleanStr(c.req.param('key'), 2, 100);
  const body = await c.req.json().catch(() => ({}));
  const value = cleanStr(body.value, 1, 10_000);
  if (!key || !value) return c.json({ success: false, error: 'Setting key and value are required.' }, 400);
  if (/(secret|password|token|api[_-]?key|credential)/i.test(key)) {
    return c.json({ success: false, error: 'Secrets must be stored as encrypted Cloudflare secrets, never in Vault system settings.' }, 400);
  }
  const actor = await actorFromContext(c);
  await c.env.DB.prepare(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by_user_id, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(key, value, actor?.userId ?? null).run();
  await audit(c.env.DB, actor, 'system.setting.changed', 'setting', key, { valueChanged: true });
  return c.json({ success: true, message: 'System setting saved.' });
});

// ============================================
// 📦 R2 STORAGE
// ============================================

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const SAFE_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'application/pdf', 'application/zip', 'application/json',
  'text/plain', 'text/csv', 'text/markdown',
]);
const isSafeUploadMime = (mime: string) => SAFE_UPLOAD_MIME_TYPES.has(mime.toLowerCase());

const publicUploadFolder = (value: unknown) => {
  const raw = cleanOptionalStr(value, 100) || 'uploads';
  const folder = raw.trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)*$/.test(folder)) return null;
  if (folder.toLowerCase() === 'vault' || folder.toLowerCase().startsWith('vault/')) return null;
  return folder;
};

app.post('/api/vault/upload', requireAuth, async (c) => {
  try {
    const formData = await c.req.formData();
    const section = cleanStr(formData.get('section') || '', 1, 60);
    const documentId = Number(formData.get('documentId') || 0);
    if (!section) return c.json({ success: false, error: 'Vault section is required.' }, 400);
    const access = await vaultAccess(c, section, documentId ? 'edit' : 'create');
    if (access.response) return access.response;
    if (documentId) {
      const documentRows = await dbRows<any>(c.env.DB.prepare(
        `SELECT d.id, s.slug AS section_slug FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ? AND d.is_archived = 0`
      ).bind(documentId));
      if (!documentRows[0] || documentRows[0].section_slug !== section) return c.json({ success: false, error: 'Document attachment target is invalid.' }, 400);
    }
    const file = formData.get('file');
    if (!(file instanceof File)) return c.json({ success: false, error: 'No file provided.' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ success: false, error: 'File too large (max 10 MB).' }, 413);
    const mime = file.type || 'application/octet-stream';
    if (!isSafeUploadMime(mime)) return c.json({ success: false, error: `File type "${mime}" is not allowed.` }, 415);
    const safeName = (file.name || 'vault-file').replace(/[^\w.\-() ]/g, '_').slice(-100);
    const key = `vault/${section}/${access.actor!.profileId}/${Date.now()}-${safeName}`;
    await c.env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
    const attachment = await c.env.DB.prepare(
      `INSERT INTO vault_attachments (document_id, section_id, name, file_key, mime_type, size_bytes, uploaded_by_member_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(documentId || null, access.section.id, safeName, key, mime, file.size, access.actor!.profileId).run();
    const attachmentId = Number(attachment.meta.last_row_id);
    await recordVaultActivity(c.env.DB, access.actor, 'attachment.uploaded', access.section.id, documentId || null, { attachmentId, name: safeName, mime, size: file.size });
    return c.json({ success: true, attachment: { id: attachmentId, name: safeName, fileKey: key, mimeType: mime, sizeBytes: file.size }, fileKey: key, url: `/api/vault-files/${encodeURIComponent(key).replace(/%2F/g, '/')}` });
  } catch (error) {
    console.error('[code-rx] vault upload error:', error);
    return c.json({ success: false, error: 'Vault upload failed.' }, 500);
  }
});

app.get('/api/vault-files/*', requireAuth, async (c) => {
  try {
    const url = new URL(c.req.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/api\/vault-files\//, ''));
    const match = key.match(/^vault\/([^/]+)\//);
    if (!match) return c.json({ success: false, error: 'Invalid Vault file path.' }, 400);
    const access = await vaultAccess(c, match[1], 'view');
    if (access.response) return access.response;
    const object = await c.env.BUCKET.get(key);
    if (!object) return c.json({ success: false, error: 'File not found.' }, 404);
    return new Response(object.body, { headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('[code-rx] vault file read error:', error);
    return c.json({ success: false, error: 'Could not read Vault file.' }, 500);
  }
});

app.post('/api/upload', requireAuth, requireWebsitePermission('media.upload'), async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return c.json({ success: false, error: 'No file provided' }, 400);

    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ success: false, error: 'File too large (max 10 MB)' }, 413);
    }
    const mime = file.type || 'application/octet-stream';
    if (!isSafeUploadMime(mime)) {
      return c.json({ success: false, error: `File type "${mime}" is not allowed` }, 415);
    }

    const folder = publicUploadFolder(formData.get('folder') || '');
    if (!folder) return c.json({ success: false, error: 'Use a safe public media folder name.' }, 400);
    const safeName = (file.name || 'file').replace(/[^\w.\-() ]/g, '_').slice(-100);
    const key = `${folder}/${Date.now()}-${safeName}`;

    // Buffer the file (max 10 MB) — miniflare's local R2 emulator cannot
    // persist raw streams; an ArrayBuffer has a known length and works
    // identically in production.
    const buffer = await file.arrayBuffer();
    await c.env.BUCKET.put(key, buffer, { httpMetadata: { contentType: mime } });
    return c.json({ success: true, filename: key, url: `/api/files/${encodeURIComponent(key).replace(/%2F/g, '/')}` });
  } catch (e) {
    console.error('[code-rx] upload error:', e);
    return c.json({ success: false, error: 'Upload failed. Check the R2 binding "BUCKET".' }, 500);
  }
});

// Public read of stored files
// NOTE: Hono v4.12 does not expose the '*' wildcard param, so the key is
// parsed from the URL path directly.
app.get('/api/files/*', async (c) => {
  try {
    const url = new URL(c.req.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/api\/files\//, ''));
    if (!key) return c.json({ success: false, error: 'File not found' }, 404);
    if (key.startsWith('vault/')) return c.json({ success: false, error: 'Vault files require an authorized Vault session.' }, 403);
    const object = await c.env.BUCKET.get(key);
    if (!object) return c.json({ success: false, error: 'File not found' }, 404);
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[code-rx] get file error:', e);
    return c.json({ success: false, error: 'Failed to get file' }, 500);
  }
});


// ---------- JSON 404 & error handler ----------
app.notFound((c) => c.json({ success: false, error: `Not found: ${c.req.path}` }, 404));

app.onError((err, c) => {
  console.error('[code-rx] unhandled error:', err);
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

// ============================================
// Pages entrypoint: /api/* -> Hono app.
// Everything else -> static assets (with SPA fallback to index.html).
// ============================================
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith('/api/')) {
    return app.fetch(context.request, context.env, context);
  }

  const res = await context.next();

  // SPA fallback: unknown HTML navigation -> index.html
  if (res.status === 404 && (context.request.headers.get('accept') || '').includes('text/html')) {
    try {
      const index = await context.env.ASSETS?.fetch(new URL('/', url));
      if (index && index.ok) {
        return new Response(index.body, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    } catch { /* fall through to the 404 */ }
  }

  return res;
};

export default app;
