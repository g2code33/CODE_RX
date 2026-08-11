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
    await db.prepare('UPDATE member_score_events SET balance_after = ? WHERE id = ?').bind(balance, eventId).run();
    return {
      memberProfileId: member.profile_id,
      memberRecordId: member.member_record_id,
      delta,
      balance,
      eventId,
      label: rule.label,
      automatic: true,
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
  const amount = boundedPoints(input.points);
  const previous = boundedPoints(Number(member.points || 0));
  let balance = previous;
  if (input.action === 'add') balance = boundedPoints(previous + amount);
  if (input.action === 'deduct') balance = boundedPoints(previous - amount);
  if (input.action === 'set') balance = amount;
  const delta = balance - previous;

  await db.prepare('UPDATE members SET points = ? WHERE id = ?').bind(balance, member.member_record_id).run();
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
  };
};
