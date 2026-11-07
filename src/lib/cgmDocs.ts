/**
 * CODE Rx — the printable documents of Class & Group Management.
 *
 * Each builder turns a record the API already returned into a `PrintDoc`
 * (see `cgmPrint.ts`), so Print, PDF and PNG always carry the same facts:
 * the letterhead, the organizer, PHANTOM, the group link, the date and every
 * number the record holds. Builders are pure — no fetching, no prompting — so
 * a printed document can never disagree with the screen it came from.
 */

import { printDate, type PrintDoc, type PrintSection } from './cgmPrint';

const clean = (value: unknown, fallback = '—'): string => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const titleCase = (value: unknown): string => {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** "5 Nov 2026, 09:00 → no deadline set" — a window never prints a bare dash. */
const windowLabel = (from: unknown, to: unknown, fallbackFrom: string, fallbackTo: string): string => {
  const start = from ? printDate(from as string) : fallbackFrom;
  const end = to ? printDate(to as string) : fallbackTo;
  return `${start} -> ${end}`;
};

const slug = (value: unknown): string => String(value ?? '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'record';

export interface DocContext {
  /** The class the record belongs to (letterhead right block). */
  className: string;
  classCode?: string | null;
  institution?: string | null;
  /** Who is producing the document — printed in the footer beside PHANTOM. */
  organizer: string;
  /** Absolute site origin, used to build the links the paper must carry. */
  origin?: string;
  issuedAt?: Date;
}

const contextHeader = (context: DocContext) => ({
  className: clean(context.className, 'Class'),
  classCode: context.classCode ? String(context.classCode) : undefined,
  institution: context.institution ? String(context.institution) : undefined,
  organizer: clean(context.organizer, 'the class organizer'),
  issuedAt: context.issuedAt || new Date(),
  societyLine: 'Class & Group Management',
});

const absolute = (origin: string | undefined, hash: string): string => {
  const base = String(origin || '').replace(/\/$/, '');
  return base ? `${base}/${hash}` : hash;
};

// ---------------------------------------------------------------------------
// Election record
// ---------------------------------------------------------------------------

export interface ElectionRecordInput extends DocContext {
  election: any;
  candidates?: any[];
  participation?: any;
  /**
   * Leave candidates who received no vote off the printed ballot. The count of
   * who was left out is always printed, so the paper never looks like the
   * ballot was smaller than it was.
   */
  onlyVotedCandidates?: boolean;
}

/**
 * ONE election, as paper.
 *
 * Headline numbers always include VOTED and NOT VOTED (we never print a turnout
 * without the two halves that make it up), the ballot carries every candidate
 * with their votes and share, and the links block carries the voting link and
 * the leader sign-up link that the organizer shares with the group.
 */
export const buildElectionRecordDoc = (input: ElectionRecordInput): PrintDoc => {
  const { election } = input;
  const rows: any[] = Array.isArray(input.candidates) ? input.candidates : [];
  const voted = Math.max(0, Number(input.participation?.voted ?? 0));
  const eligible = Math.max(0, Number(input.participation?.groupSize ?? 0));
  const notVoted = Math.max(0, eligible - voted);
  const turnout = input.participation?.turnout !== undefined
    ? Math.round(Number(input.participation.turnout))
    : (eligible ? Math.round((voted / eligible) * 100) : 0);
  const cast = rows.reduce((sum, row) => sum + Number(row.votes || 0), 0);
  const winner = rows.find((row) => Number(row.id) === Number(election?.results?.outcome?.winner));
  const tied: number[] = election?.results?.outcome?.tiedCandidateIds || [];
  const status = String(election?.status || 'unknown');
  const anonymity = String(election?.anonymity || 'anonymous');

  const share = (votes: number) => (cast > 0 ? `${Math.round((votes / cast) * 100)}%` : '0%');

  // The ballot is ranked by votes, then by name. `onlyVotedCandidates` prints
  // just the candidates who actually received a vote — and says how many were
  // left out, because a printed ballot must never silently shrink.
  const ranked = [...rows].sort((a, b) =>
    Number(b.votes || 0) - Number(a.votes || 0) || String(a.fullName).localeCompare(String(b.fullName)));
  const withVotes = ranked.filter((row) => Number(row.votes || 0) > 0);
  const onlyVoted = Boolean(input.onlyVotedCandidates);
  const printed = onlyVoted ? withVotes : ranked;
  const leftOut = rows.length - printed.length;
  const ballotNote = [
    `Votes counted: ${cast}. ${anonymity === 'public' ? 'This is a public roll — every vote is attributable.' : 'Anonymous ballot — no vote is linked back to a voter.'}`,
    onlyVoted
      ? (rows.length === printed.length
        ? 'Every candidate on this ballot received at least one vote, so none were left out.'
        : `${leftOut} candidate${leftOut === 1 ? '' : 's'} with no vote ${leftOut === 1 ? 'is' : 'are'} not printed here. The full ballot has ${rows.length}.`)
      : null,
  ].filter(Boolean).join(' ');

  // ---- The result, said plainly -------------------------------------------
  // This is why anyone opens the sheet, so it is the first block after the
  // numbers and it names one thing: who won, or what is happening instead.
  const announced = Boolean(election?.results?.outcome?.announced);
  const outcomeTie = Boolean(election?.results?.outcome?.tie) && !election?.results?.outcome?.resolved;
  const resultBlock = (() => {
    if (status === 'cancelled') {
      return { label: 'Election cancelled', value: 'No result', detail: election?.cancelledReason ? clean(election.cancelledReason) : 'Cancelled by the organizer.', tone: 'warn' as const };
    }
    if (outcomeTie) {
      const names = ranked.filter((row) => tied.includes(Number(row.id))).map((row) => clean(row.fullName));
      return {
        label: 'Tie — not yet resolved',
        value: names.length ? names.join(' · ') : `${tied.length} candidates tied`,
        detail: `Settled by ${titleCase(election?.tieBreak || 'random')} — the tie-break is recorded on the election.`,
        tone: 'warn' as const,
      };
    }
    if (status === 'closed' && winner) {
      const votes = Number(winner.votes || 0);
      return {
        label: announced ? 'Winner — announced' : 'Winner',
        value: clean(winner.fullName),
        detail: `${votes} of ${cast} vote${cast === 1 ? '' : 's'} · ${share(votes)} of the votes cast`,
        tone: 'good' as const,
      };
    }
    if (status === 'closed') {
      return { label: 'Closed', value: 'No winner recorded', detail: `${cast} vote(s) were counted.`, tone: 'warn' as const };
    }
    const leader = ranked[0];
    if (leader && Number(leader.votes || 0) > 0) {
      return {
        label: `${titleCase(status)} — counted so far`,
        value: clean(leader.fullName),
        detail: `Leading with ${Number(leader.votes || 0)} of ${cast} vote${cast === 1 ? '' : 's'} · ${share(Number(leader.votes || 0))}`,
        tone: 'plain' as const,
      };
    }
    return { label: titleCase(status), value: 'No votes counted yet', detail: 'The result appears here as soon as the first vote is cast.', tone: 'plain' as const };
  })();

  // A candidate's status is only worth printing when it is unusual — "Active"
  // under every name is noise on a phone.
  const statusNote = (row: any): string | undefined => {
    const text = String(row.status || '').trim().toLowerCase();
    if (!text || ['active', 'nominated', 'standing', 'approved'].includes(text)) return undefined;
    return titleCase(text);
  };
  const ballotBars = printed.map((row) => {
    const votes = Number(row.votes || 0);
    return {
      label: clean(row.fullName, 'Candidate'),
      value: `${votes} vote${votes === 1 ? '' : 's'}`,
      share: share(votes),
      ratio: cast > 0 ? votes / cast : 0,
      note: statusNote(row),
    };
  });

  const sections: PrintSection[] = [
    {
      kind: 'hero',
      label: resultBlock.label,
      value: resultBlock.value,
      detail: resultBlock.detail,
      tone: resultBlock.tone,
    },
    {
      kind: 'bars',
      heading: onlyVoted ? `Ballot — ${printed.length} of ${rows.length} with a vote` : `Ballot — ${rows.length} candidate${rows.length === 1 ? '' : 's'}`,
      rows: ballotBars.length ? ballotBars : [{ label: 'No candidates stood', value: '0 votes', share: '', ratio: 0 }],
      note: ballotNote,
    },
    {
      kind: 'keyvalues',
      heading: 'How it was run',
      rows: [
        ['Group', clean(election?.groupName)],
        ['Ballot', `${anonymity === 'public' ? 'Public roll (votes are visible)' : 'Anonymous (counts only)'} · ${election?.eligibleMode === 'custom' ? `${(election?.eligibleStudentIds || []).length} hand-picked voters` : 'every member may vote'}`],
        ['Voting', windowLabel(election?.votingOpenAt, election?.votingCloseAt, 'as soon as it opens', 'closed by the organizer')],
        ['Tie-break', `${titleCase(election?.tieBreak || 'random')} · ${election?.allowVoteChange ? 'votes may be changed' : 'votes lock on cast'}`],
        ...(election?.cancelledReason ? [['Cancellation reason', clean(election.cancelledReason)] as [string, string]] : []),
      ],
    },
  ];

  const links = [
    { label: 'Voting link (this group only)', url: absolute(input.origin, `#student-vote/${election?.id}`), hint: 'Sign in with a passkey' },
  ];
  if (['nominating'].includes(status)) {
    links.push({ label: 'Leader sign-up link', url: absolute(input.origin, `#leader-apply/${election?.id}`), hint: 'While nominations are open' });
  }

  return {
    kind: 'Election record',
    title: clean(election?.title, 'Class election'),
    subtitle: [
      clean(election?.groupName, 'Group'),
      election?.activityName ? String(election.activityName) : null,
      titleCase(election?.role),
    ].filter(Boolean).join(' · '),
    badges: [status, anonymity === 'public' ? 'Public roll' : 'Anonymous ballot'],

    ...contextHeader(input),
    // Three numbers only: on a phone, six boxes are a wall. Eligible rides
    // along as the hint of Voted, and the ballot heading carries the candidate
    // count, so nothing is lost.
    stats: [
      { label: 'Voted', value: String(voted), hint: `of ${eligible || '—'} members` },
      { label: 'Not voted', value: String(notVoted), hint: 'members' },
      { label: 'Turnout', value: `${turnout}%`, hint: `${cast} vote${cast === 1 ? '' : 's'} counted` },
    ],
    sections,
    links,
    linksTitle: 'Group links',
    notes: [
      'The server record is the record of truth; this sheet is a print of it.',
    ],
    fileName: `election-${election?.id || 'record'}-${slug(election?.title || 'election')}`,
  };
};

// ---------------------------------------------------------------------------
// Group member sheet (the organizer's and the student's sheet)
// ---------------------------------------------------------------------------

export interface GroupSheetInput extends DocContext {
  groupName: string;
  activityName?: string;
  topic?: string;
  aob?: string;
  columns: string[];
  rows: string[][];
  groupLink?: string | null;
  memberCount?: number;
}

export const buildGroupSheetDoc = (input: GroupSheetInput): PrintDoc => {
  const rows = input.rows || [];
  const sections: PrintSection[] = [];
  if (input.topic) sections.push({ kind: 'callout', heading: 'Group topic', body: input.topic });
  sections.push({
    kind: 'table',
    heading: `Members — ${input.memberCount ?? rows.length}`,
    columns: input.columns,
    rows: rows.length ? rows : [input.columns.map(() => '')],
  });
  if (input.aob) sections.push({ kind: 'callout', heading: 'AOB / other business', body: input.aob });
  if (input.groupLink) {
    sections.push({
      kind: 'lines',
      heading: 'Group link',
      lines: [`Join and check this group here: ${input.groupLink}`],
    });
  }

  return {
    kind: 'Group member sheet',
    title: clean(input.groupName, 'Group'),
    subtitle: [clean(input.activityName, 'Activity'), `${input.memberCount ?? rows.length} member(s)`].join(' · '),
    badges: ['Group sheet', input.activityName ? 'Activity' : null].filter(Boolean) as string[],
    ...contextHeader(input),
    stats: [
      { label: 'Members', value: String(input.memberCount ?? rows.length) },
      ...(input.columns.length ? [{ label: 'Columns', value: String(input.columns.length) }] : []),
    ],
    sections,
    links: input.groupLink ? [{ label: 'Group link', url: input.groupLink, hint: 'Share with the group' }] : [],
    notes: [
      `Issued ${printDate(input.issuedAt || new Date())} from the Class & Group Management record.`,
    ],
    fileName: `group-${slug(input.groupName)}-members`,
  };
};
