/**
 * CODE Rx SOCIETY — proposed group composition.
 *
 * One pure evaluator for "what will this group look like once everything lands".
 * It exists because capacity and gender have to be judged on the FINAL state of
 * a group, never on one student at a time:
 *
 *   • a group's final members = active members that stay
 *                            + approved designations still waiting to be applied
 *                            + the students this proposal would designate
 *   • every student is counted at most once (a student who is already an active
 *     member and also holds a designation for that group is ONE person)
 *   • a student this proposal moves away from a group is not counted there
 *   • under `genderRule = 'separate'` a group may hold exactly ONE gender pool,
 *     where 'unknown' is a pool of its own — the same rule the assignment
 *     planner uses (`genderPoolOf` in ./assignment.ts). Unknown is never folded
 *     into male or female.
 *
 * The evaluator is deliberately free of database access so the API, the tests
 * and any future caller share identical semantics.
 */

export type Gender = 'male' | 'female' | 'unknown';
export type CompositionSource = 'active' | 'reserved' | 'proposed';

export interface CompositionMember {
  /**
   * The permanent student identity. 0 for a student who is on the class roster
   * but has not registered yet — those are keyed by `rosterEntryId` instead, so
   * the same person is still only ever counted once.
   */
  studentId: number;
  rosterEntryId?: number;
  fullName?: string;
  gender: Gender;
  source: CompositionSource;
}

export interface CompositionGroupInput {
  groupId: number;
  groupName: string;
  capacity: number | null;
  /** Every entry known for this group; duplicates by studentId are collapsed. */
  members: CompositionMember[];
}

export interface CompositionConflict {
  kind: 'gender' | 'capacity';
  groupId: number;
  groupName: string;
  blocking: boolean;
  message: string;
  detail: {
    pools: Gender[];
    /** Members already in the group (members or reserved seats) that clash. */
    existing: CompositionMember[];
    /** Students in this proposal that are part of the clash. */
    proposed: CompositionMember[];
    reserved: CompositionMember[];
    capacity: number | null;
    projected: number;
    overflow: number;
  };
}

export interface GroupEvaluation {
  groupId: number;
  groupName: string;
  capacity: number | null;
  projected: number;
  overflow: number;
  /** Distinct gender pools in the final composition (never empty once members exist). */
  pools: Gender[];
  /** True when the final composition would mix gender pools. */
  mixed: boolean;
  members: CompositionMember[];
  genderCounts: { male: number; female: number; unknown: number };
  conflicts: CompositionConflict[];
}

export interface CompositionReport {
  groups: GroupEvaluation[];
  conflicts: CompositionConflict[];
  errors: string[];
  warnings: string[];
}

export const asGender = (value: unknown): Gender => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'male' || text === 'm') return 'male';
  if (text === 'female' || text === 'f') return 'female';
  return 'unknown';
};

const labelOf = (member: CompositionMember) =>
  member.fullName
  || (member.studentId > 0 ? `student #${member.studentId}` : `roster row #${member.rosterEntryId ?? '?'}`);

/** One key per PERSON: a registered student by id, an unregistered row by entry. */
const memberKey = (member: CompositionMember) =>
  member.studentId > 0
    ? `s:${member.studentId}`
    : (Number.isInteger(member.rosterEntryId) && Number(member.rosterEntryId) > 0 ? `r:${member.rosterEntryId}` : null);

const sourceWords = (source: CompositionSource) =>
  source === 'active' ? 'an existing member'
    : source === 'reserved' ? 'a reserved APPROVED designation'
      : 'this proposal';

const dedupe = (members: CompositionMember[]) => {
  // Later sources win for display purposes but the student is counted once:
  // proposed > reserved > active for the *entry*, while "active" is what keeps
  // them from being an addition at all.
  const byId = new Map<string, CompositionMember>();
  for (const member of members) {
    const key = memberKey(member);
    if (!key) continue;
    const current = byId.get(key);
    if (!current) { byId.set(key, { ...member }); continue; }
    const rank = (source: CompositionSource) => (source === 'proposed' ? 3 : source === 'reserved' ? 2 : 1);
    if (rank(member.source) > rank(current.source)) byId.set(key, { ...member, source: member.source });
  }
  return [...byId.values()];
};

/**
 * Evaluate every group's final composition under one gender rule.
 * 'separate' is blocking; every other rule keeps the class policy untouched
 * (no gender conflict is invented for 'balanced' / 'none').
 */
export const evaluateComposition = (
  groups: CompositionGroupInput[],
  genderRule: string,
): CompositionReport => {
  const separated = genderRule === 'separate';
  const evaluations: GroupEvaluation[] = [];
  const conflicts: CompositionConflict[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const group of groups) {
    const members = dedupe(group.members);
    const genderCounts = { male: 0, female: 0, unknown: 0 };
    for (const member of members) genderCounts[member.gender] += 1;
    const pools = (Object.keys(genderCounts) as Gender[]).filter((gender) => genderCounts[gender] > 0);
    const projected = members.length;
    const overflow = group.capacity !== null && projected > group.capacity ? projected - group.capacity : 0;
    const mixed = separated && pools.length > 1;
    const groupConflicts: CompositionConflict[] = [];

    if (mixed) {
      const proposed = members.filter((member) => member.source === 'proposed');
      const existing = members.filter((member) => member.source !== 'proposed');
      const reserved = members.filter((member) => member.source === 'reserved');
      const unknownOnly = pools.length === 2 && pools.includes('unknown')
        ? members.filter((member) => member.gender === 'unknown')
        : [];
      const named = members.map((member) => `${labelOf(member)} (${member.gender}, ${sourceWords(member.source)})`).join(', ');
      const message = unknownOnly.length
        ? `${group.groupName} separates gender pools, and the gender of ${unknownOnly.map(labelOf).join(', ')} is not recorded — a gender-separated group cannot be verified until it is set.`
        : `${group.groupName} separates gender pools but would contain ${pools.join(' and ')}: ${named}.`;
      const conflict: CompositionConflict = {
        kind: 'gender', groupId: group.groupId, groupName: group.groupName,
        blocking: true, message,
        detail: {
          pools, existing, proposed, reserved,
          capacity: group.capacity, projected, overflow,
        },
      };
      groupConflicts.push(conflict);
      // Unknown gender is never guessed at: it is reported as a blocking
      // conflict (the pool cannot be verified) and named separately.
      errors.push(message);
    }

    if (overflow > 0) {
      const conflict: CompositionConflict = {
        kind: 'capacity', groupId: group.groupId, groupName: group.groupName,
        blocking: true,
        message: `${group.groupName} would hold ${projected} students but its capacity is ${group.capacity}.`,
        detail: {
          pools, existing: members.filter((member) => member.source !== 'proposed'),
          proposed: members.filter((member) => member.source === 'proposed'),
          reserved: members.filter((member) => member.source === 'reserved'),
          capacity: group.capacity, projected, overflow,
        },
      };
      groupConflicts.push(conflict);
      errors.push(conflict.message);
    }

    conflicts.push(...groupConflicts);
    evaluations.push({
      groupId: group.groupId, groupName: group.groupName, capacity: group.capacity,
      projected, overflow, pools, mixed, members, genderCounts, conflicts: groupConflicts,
    });
  }

  if (separated) {
    for (const evaluation of evaluations) {
      if (evaluation.genderCounts.unknown > 0 && !evaluation.mixed) {
        warnings.push(`${evaluation.groupName}: ${evaluation.genderCounts.unknown} member(s) have no gender recorded — the gender-separated rule cannot be verified for them until it is set.`);
      }
    }
  }

  return { groups: evaluations, conflicts, errors, warnings };
};

/** Would this one student be allowed into the group as it stands? */
export const poolAllows = (rule: string, memberGenders: Gender[], studentGender: Gender) => {
  if (rule !== 'separate') return true;
  return memberGenders.every((gender) => gender === studentGender);
};
