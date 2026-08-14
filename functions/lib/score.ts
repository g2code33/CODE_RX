import type { Actor } from './vault';

export const SCORE_RULE_SEEDS = [
  {
    key: 'member.activated',
    label: 'Membership activated',
    description: 'Awarded once when an invited member activates their account.',
    points: 10,
    enabled: 1,
  },
  {
    key: 'member.codename_claimed',
    label: 'Codename claimed',
    description: 'Awarded once when a member completes their codename ballot.',
    points: 5,
    enabled: 1,
  },
  {
    key: 'vault.document_created',
    label: 'Substantive Vault document created',
    description: 'Awarded once for a new Vault document with at least 25 words of meaningful written content.',
    points: 5,
    enabled: 1,
  },
  {
    key: 'vault.document_approved',
    label: 'Vault document approved',
    description: 'Awarded once when a document reaches Approved or Active status.',
    points: 10,
    enabled: 1,
  },
  {
    key: 'vault.project_created',
    label: 'Vault project created',
    description: 'Awarded once when a member creates a Project workspace.',
    points: 10,
    enabled: 1,
  },
] as const;

export type ScoreRuleKey = typeof SCORE_RULE_SEEDS[number]['key'];
export type ScoreAdjustmentAction = 'add' | 'deduct' | 'set';

interface ScoreRuleRow {
  rule_key: string;
  label: string;
  description: string;
  points: number;
  enabled: number;
}

interface MemberScoreRow {
  profile_id: number;
  member_record_id: number;
  points: number;
}

const rows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

const memberScore = async (db: D1Database, memberProfileId: number): Promise<MemberScoreRow | null> => {
  const result = await rows<MemberScoreRow>(db.prepare(
    `SELECT mp.id AS profile_id, mp.member_record_id, m.points
     FROM member_profiles mp
     JOIN members m ON m.id = mp.member_record_id
     WHERE mp.id = ?`
  ).bind(memberProfileId));
  return result[0] || null;
};

const boundedPoints = (value: number) => Math.max(0, Math.min(1_000_000, Math.trunc(value)));

/** Code Rx Society progression is derived exclusively from Calcitonins (CAL).
 * Defaults seed a new installation; PHANTOM may manage the stored definitions
 * later without assigning a level directly to an individual member. */
export type CalLevelDefinition = {
  id?: number;
  key: string;
  label: string;
  description: string;
  minPoints: number;
  sortOrder: number;
};

export const DEFAULT_CAL_LEVELS: readonly CalLevelDefinition[] = [
  { key: 'rx_initiate', label: 'Rx Initiate', minPoints: 0, description: 'Beginning the Code Rx Society journey.', sortOrder: 1 },
  { key: 'code_explorer', label: 'Code Explorer', minPoints: 50, description: 'Exploring practical Code Rx learning and contribution.', sortOrder: 2 },
  { key: 'society_builder', label: 'Society Builder', minPoints: 150, description: 'Building useful work for the Society.', sortOrder: 3 },
  { key: 'innovation_specialist', label: 'Innovation Specialist', minPoints: 350, description: 'Demonstrating sustained technical and community impact.', sortOrder: 4 },
  { key: 'systems_catalyst', label: 'Systems Catalyst', minPoints: 700, description: 'Catalysing reliable systems, projects, and knowledge.', sortOrder: 5 },
  { key: 'code_rx_vanguard', label: 'Code Rx Vanguard', minPoints: 1_200, description: 'Leading high-value Society contribution.', sortOrder: 6 },
  { key: 'society_luminary', label: 'Society Luminary', minPoints: 2_000, description: 'Sustained exemplary contribution to Code Rx Society.', sortOrder: 7 },
];

// Backward-compatible export for schema/default callers. Runtime API results
// use the stored PHANTOM-managed definitions through readCalLevels().
export const CAL_LEVELS = DEFAULT_CAL_LEVELS;

export type CalcitoninLevel = {
  key: string;
  label: string;
  description: string;
  minPoints: number;
  nextPoints: number | null;
  progressPercent: number;
};

export const resolveCalcitoninLevel = (definitions: readonly CalLevelDefinition[], value: number | null | undefined): CalcitoninLevel => {
  const levels = [...definitions].sort((left, right) => left.minPoints - right.minPoints || left.sortOrder - right.sortOrder);
  const usable = levels.length ? levels : [...DEFAULT_CAL_LEVELS];
  const points = boundedPoints(Number(value || 0));
  let index = 0;
  for (let candidate = 0; candidate < usable.length; candidate += 1) {
    if (points >= usable[candidate].minPoints) index = candidate;
  }
  const current = usable[index];
  const next = usable[index + 1] || null;
  const span = next ? Math.max(1, next.minPoints - current.minPoints) : 1;
  const progressPercent = next ? Math.max(0, Math.min(100, Math.round(((points - current.minPoints) / span) * 100))) : 100;
  return { key: current.key, label: current.label, description: current.description, minPoints: current.minPoints, nextPoints: next?.minPoints || null, progressPercent };
};

/** Static fallback used only during schema setup or when a legacy database has
 * not seeded its level definitions yet. Application requests use readCalLevels. */
export const calcitoninLevel = (value: number | null | undefined): CalcitoninLevel => resolveCalcitoninLevel(DEFAULT_CAL_LEVELS, value);

export const readCalLevels = async (db: D1Database): Promise<CalLevelDefinition[]> => {
  try {
    const result = await rows<{ id: number; level_key: string; label: string; description: string; min_points: number; sort_order: number }>(db.prepare(
      'SELECT id, level_key, label, description, min_points, sort_order FROM cal_level_definitions ORDER BY min_points, sort_order, id'
    ));
    if (!result.length) return [...DEFAULT_CAL_LEVELS];
    return result.map((level) => ({ id: Number(level.id), key: String(level.level_key), label: String(level.label), description: String(level.description || ''), minPoints: Number(level.min_points || 0), sortOrder: Number(level.sort_order || 0) }));
  } catch {
    return [...DEFAULT_CAL_LEVELS];
  }
};

export interface ScoreAwardInput {
  memberProfileId: number | null | undefined;
  ruleKey: ScoreRuleKey;
  referenceType: string;
  referenceId: string | number;
  actor?: Actor | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ScoreResult {
  memberProfileId: number;
  memberRecordId: number;
  delta: number;
  balance: number;
  eventId: number;
  label: string;
  automatic: boolean;
  level: CalcitoninLevel;
}

/**
 * Awards an automatic rule at most once for a member/reference pair. The event
 * row is reserved before the balance is updated, so retries cannot double-award
 * a document, activation, project, or codename.
 */
export const awardScoreRule = async (db: D1Database, input: ScoreAwardInput): Promise<ScoreResult | null> => {
  if (!input.memberProfileId || !input.referenceType || input.referenceId === null || input.referenceId === undefined) return null;
  const ruleRows = await rows<ScoreRuleRow>(db.prepare(
    'SELECT rule_key, label, description, points, enabled FROM score_rules WHERE rule_key = ?'
  ).bind(input.ruleKey));
  const rule = ruleRows[0];
  const delta = boundedPoints(Number(rule?.points || 0));
  if (!rule || Number(rule.enabled) !== 1 || delta < 1) return null;

  const member = await memberScore(db, input.memberProfileId);
  if (!member) return null;
  const levelDefinitions = await readCalLevels(db);
  const referenceType = input.referenceType.slice(0, 80);
  const referenceId = String(input.referenceId).slice(0, 120);
  const reserved = await db.prepare(
    `INSERT OR IGNORE INTO member_score_events
     (member_profile_id, member_record_id, event_type, rule_key, reference_type, reference_id, points_delta, balance_after, reason, metadata_json, created_by_user_id)
     VALUES (?, ?, 'automatic', ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(
    member.profile_id,
    member.member_record_id,
    rule.rule_key,
    referenceType,
    referenceId,
    delta,
    (input.reason || rule.label).slice(0, 500),
    JSON.stringify(input.metadata || {}).slice(0, 10_000),
    input.actor?.userId ?? null,
  ).run();

  if (Number(reserved.meta.changes || 0) !== 1) return null;
  const eventId = Number(reserved.meta.last_row_id);
  try {
    const updated = await rows<{ points: number }>(db.prepare(
      'UPDATE members SET points = MIN(1000000, MAX(0, points + ?)) WHERE id = ? RETURNING points'
    ).bind(delta, member.member_record_id));
    const balance = boundedPoints(Number(updated[0]?.points || 0));
    const level = resolveCalcitoninLevel(levelDefinitions, balance);
    await db.prepare('UPDATE members SET level = ? WHERE id = ?').bind(level.label, member.member_record_id).run();
    await db.prepare('UPDATE member_score_events SET balance_after = ? WHERE id = ?').bind(balance, eventId).run();
    return {
      memberProfileId: member.profile_id,
      memberRecordId: member.member_record_id,
      delta,
      balance,
      eventId,
      label: rule.label,
      automatic: true,
      level,
    };
  } catch (error) {
    // A failed reservation must not permanently suppress a later retry.
    await db.prepare('DELETE FROM member_score_events WHERE id = ?').bind(eventId).run();
    throw error;
  }
};

export interface ManualScoreInput {
  memberProfileId: number;
  action: ScoreAdjustmentAction;
  points: number;
  reason: string;
  actor?: Actor | null;
}

/** Applies a PHANTOM-authorized manual score adjustment and records its reason. */
export const adjustMemberScore = async (db: D1Database, input: ManualScoreInput): Promise<ScoreResult | null> => {
  const member = await memberScore(db, input.memberProfileId);
  if (!member) return null;
  const levelDefinitions = await readCalLevels(db);
  const amount = boundedPoints(input.points);
  const previous = boundedPoints(Number(member.points || 0));
  let balance = previous;
  if (input.action === 'add') balance = boundedPoints(previous + amount);
  if (input.action === 'deduct') balance = boundedPoints(previous - amount);
  if (input.action === 'set') balance = amount;
  const delta = balance - previous;

  const level = resolveCalcitoninLevel(levelDefinitions, balance);
  await db.prepare('UPDATE members SET points = ?, level = ? WHERE id = ?').bind(balance, level.label, member.member_record_id).run();
  const event = await db.prepare(
    `INSERT INTO member_score_events
     (member_profile_id, member_record_id, event_type, points_delta, balance_after, reason, metadata_json, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, '{}', ?)`
  ).bind(
    member.profile_id,
    member.member_record_id,
    `manual_${input.action}`,
    delta,
    balance,
    input.reason.slice(0, 500),
    input.actor?.userId ?? null,
  ).run();

  return {
    memberProfileId: member.profile_id,
    memberRecordId: member.member_record_id,
    delta,
    balance,
    eventId: Number(event.meta.last_row_id),
    label: `Manual ${input.action}`,
    automatic: false,
    level,
  };
};
