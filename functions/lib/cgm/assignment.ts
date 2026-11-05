/**
 * CODE Rx SOCIETY — the group assignment engine.
 *
 * Pure functions only: the routes hand in eligible students, live groups and
 * capacities, and receive a placement plan they persist inside their own
 * authorization and audit rules. Keeping the engine pure makes the fairness
 * rules directly testable.
 *
 * Guarantees:
 *   - hard capacity enforcement (a plan never exceeds any group capacity);
 *   - balanced sizes: with N groups and no capacity pressure, sizes differ by
 *     at most one;
 *   - gender rules: 'balanced' keeps each group's gender mix close to the
 *     pool's, 'separate' never mixes gender pools in one group;
 *   - repeat-classmate avoidance ('avoid'): a greedy pass that prefers groups
 *     where the student has the fewest previous classmates, using the
 *     assignment history the caller supplies;
 *   - randomized tie-breaking through the injected rng (securely random in
 *     production, fixed seeds in tests).
 */

import type { GenderRule, RepeatRule } from './core';

export interface AssignableStudent {
  studentId: number;
  gender: 'male' | 'female' | 'unknown';
}

export interface AssignableGroup {
  groupId: number;
  capacity: number | null;
  currentSize: number;
  /**
   * The gender pool the group already holds, when the caller knows it:
   * 'male' | 'female' | 'unknown' for a clean pool, 'mixed' for a group that
   * already contains more than one. Under `genderRule = 'separate'` a student
   * may only join an EMPTY group or a group of their own pool; an omitted pool
   * means "unknown state" and stays unconstrained (the SQL guard still applies).
   */
  pool?: string;
}

export interface PlacementPlan {
  studentId: number;
  groupId: number;
}

export type Rng = () => number;

/** xorshift-lite seeded generator: deterministic for tests, unused in prod. */
export const seededRng = (seed: number): Rng => {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
};

export const secureRng = (): Rng => {
  const buffer = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buffer);
    return buffer[0] / 0x100000000;
  };
};

const shuffled = <T>(list: T[], rng: Rng): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const freeSeats = (group: AssignableGroup) =>
  group.capacity === null ? Number.MAX_SAFE_INTEGER : Math.max(0, group.capacity - group.currentSize);

const groupSizes = (plan: PlacementPlan[], groups: AssignableGroup[]) => {
  const sizes = new Map<number, number>();
  for (const group of groups) sizes.set(group.groupId, group.currentSize);
  for (const placement of plan) sizes.set(placement.groupId, (sizes.get(placement.groupId) || 0) + 1);
  return sizes;
};

/**
 * Even-fill ordering: repeatedly take the group with the most free capacity
 * (fewest members on ties), so round-robin filling keeps sizes balanced.
 */
const balancedTargetOrder = (
  plan: PlacementPlan[], groups: AssignableGroup[], rng: Rng,
  pool?: string,
) => {
  const sizes = groupSizes(plan, groups);
  return shuffled(groups, rng)
    // LIVE seat check: the plan grows as students are placed, so a group is a
    // candidate only while its RUNNING size (initial + placed so far) is below
    // its hard capacity — never the stale pre-plan count.
    .filter((group) => group.capacity === null || (sizes.get(group.groupId) || group.currentSize) < group.capacity)
    // GENDER POOL (only passed for `separate`): a group is a candidate only
    // while it is empty or already holds exactly this student's pool.
    .filter((group) => !pool || poolFits(group, pool))
    .sort((a, b) => {
      const sizeDelta = (sizes.get(a.groupId) || 0) - (sizes.get(b.groupId) || 0);
      if (sizeDelta !== 0) return sizeDelta - 0; // smaller first
      return freeSeats(b) - freeSeats(a);
    });
};

const firstFreeGroup = (plan: PlacementPlan[], groups: AssignableGroup[], rng: Rng, pool?: string) =>
  balancedTargetOrder(plan, groups, rng, pool)[0] || null;

/**
 * Picks the group for one student under the repeat-avoidance rule: the group
 * with the fewest of this student's previous classmates, among the groups
 * that still have seats and are currently smallest (balance first, history
 * second, randomness last).
 */
const avoidRepeatTarget = (
  plan: PlacementPlan[],
  groups: AssignableGroup[],
  studentId: number,
  historyClassmates: Set<number>,
  rng: Rng,
  pool?: string,
) => {
  const candidates = balancedTargetOrder(plan, groups, rng, pool);
  if (!candidates.length) return null;
  const sizes = groupSizes(plan, groups);
  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const group of candidates) {
    const size = sizes.get(group.groupId) || 0;
    let classmates = 0;
    for (const placement of plan) {
      if (placement.groupId === group.groupId && historyClassmates.has(placement.studentId)) classmates += 1;
    }
    const score = classmates * 100 + size + rng();
    if (score < bestScore) { bestScore = score; best = group; }
  }
  return best;
};

export interface PlanOptions {
  groups: AssignableGroup[];
  students: AssignableStudent[];
  genderRule: GenderRule;
  repeatRule: RepeatRule;
  /** studentId -> partner studentIds from previous activities (repeat avoidance). */
  previousClassmates?: Map<number, Set<number>>;
  rng?: Rng;
}

const genderPoolOf = (student: AssignableStudent, genderRule: GenderRule): string =>
  genderRule === 'separate' ? student.gender : 'all';

/** 'Male'/' male '/'unknown'/'mixed' all normalise to a comparable pool key. */
const normalisePool = (value: unknown): string => {
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'male' || text === 'female' ? text : text === 'mixed' ? 'mixed' : 'unknown';
};

/**
 * May this student join this group under `genderRule = 'separate'`?
 * An unspecified pool ("caller did not tell me", e.g. a group created seconds
 * ago) stays permissive — the SQL guard is the authority. A group that already
 * holds more than one pool ('mixed') accepts nobody new.
 */
const poolFits = (group: AssignableGroup, studentPool: string): boolean => {
  if (group.pool === undefined || group.pool === null || group.pool === '') return true;
  if (normalisePool(group.pool) === 'mixed') return false;
  return normalisePool(group.pool) === normalisePool(studentPool);
};

/**
 * Builds a placement plan for unassigned students. Never mutates inputs and
 * never exceeds capacity: if everyone cannot fit, the leftover students are
 * simply absent from the plan (the caller applies its overflow rule).
 */
export const planAssignments = (options: PlanOptions): PlacementPlan[] => {
  const rng = options.rng || secureRng();
  // Working copies: the pool each group ends up holding is tracked here, so
  // 'separate' never mixes pools mid-plan without touching caller objects.
  const groups: AssignableGroup[] = options.groups
    .filter((group) => group.capacity === null || group.capacity > 0)
    .map((group) => ({ ...group }));
  const separated = options.genderRule === 'separate';
  const plan: PlacementPlan[] = [];
  const totalFree = groups.reduce((sum, group) => sum + Math.min(freeSeats(group), Number.MAX_SAFE_INTEGER), 0);
  if (!groups.length || totalFree === 0 || !options.students.length) return [];

  const previous = options.previousClassmates || new Map<number, Set<number>>();
  const pools = new Map<string, AssignableStudent[]>();
  for (const student of options.students) {
    const pool = genderPoolOf(student, options.genderRule);
    if (!pools.has(pool)) pools.set(pool, []);
    pools.get(pool)!.push(student);
  }

  // Largest pool first so separate-gender groups partition cleanly.
  const poolOrder = [...pools.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [, pool] of poolOrder) {
    for (const student of shuffled(pool, rng)) {
      const poolKey = separated ? student.gender : undefined;
      const target = options.repeatRule === 'avoid' && previous.size
        ? avoidRepeatTarget(plan, groups, student.studentId, previous.get(student.studentId) || new Set<number>(), rng, poolKey)
        : firstFreeGroup(plan, groups, rng, poolKey);
      if (!target) continue; // every group full (or pool-blocked) for this student
      plan.push({ studentId: student.studentId, groupId: target.groupId });
      // An empty group adopts the pool of the first student placed in it.
      if (separated) target.pool = normalisePool(student.gender);
    }
  }
  return plan;
};

/**
 * Gender-balance refinement for the 'balanced' rule: after a random fill,
 * swap same-gender pairs between groups while it reduces the mix deviation.
 * Deterministic given the rng; bounded passes keep it cheap.
 */
export const rebalanceGenders = (
  plan: PlacementPlan[],
  students: Map<number, AssignableStudent>,
  groups: AssignableGroup[],
  rng: Rng,
  passes = 12,
) => {
  if (!plan.length) return plan;
  const overall = { male: 0, female: 0, unknown: 0 };
  for (const placement of plan) {
    const gender = students.get(placement.studentId)?.gender || 'unknown';
    overall[gender] += 1;
  }
  const total = plan.length || 1;
  const targetShare = { male: overall.male / total, female: overall.female / total, unknown: overall.unknown / total };
  const members = new Map<number, PlacementPlan[]>();
  for (const placement of plan) {
    if (!members.has(placement.groupId)) members.set(placement.groupId, []);
    members.get(placement.groupId)!.push(placement);
  }
  const deviation = () => {
    let score = 0;
    for (const [, list] of members) {
      const size = list.length || 1;
      const counts = { male: 0, female: 0, unknown: 0 };
      for (const placement of list) counts[students.get(placement.studentId)?.gender || 'unknown'] += 1;
      score += Math.abs(counts.male / size - targetShare.male)
        + Math.abs(counts.female / size - targetShare.female)
        + Math.abs(counts.unknown / size - targetShare.unknown);
    }
    return score;
  };

  const groupIds = groups.map((group) => group.groupId);
  for (let pass = 0; pass < passes; pass += 1) {
    const before = deviation();
    let improved = false;
    for (let i = 0; i < groupIds.length; i += 1) {
      for (let j = i + 1; j < groupIds.length; j += 1) {
        const listA = members.get(groupIds[i]) || [];
        const listB = members.get(groupIds[j]) || [];
        for (let a = 0; a < listA.length && !improved; a += 1) {
          for (let b = 0; b < listB.length && !improved; b += 1) {
            const genderA = students.get(listA[a].studentId)?.gender || 'unknown';
            const genderB = students.get(listB[b].studentId)?.gender || 'unknown';
            if (genderA === genderB) continue;
            [listA[a], listB[b]] = [listB[b], listA[a]];
            if (deviation() < before - 1e-9) {
              improved = true;
            } else {
              [listA[a], listB[b]] = [listB[b], listA[a]];
            }
          }
        }
      }
    }
    if (!improved) break;
    void rng;
  }
  return [...members.values()].flat();
};
