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

  const ballotRows = [...rows]
    .sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0) || String(a.fullName).localeCompare(String(b.fullName)))
    .map((row, index) => [
      String(index + 1),
      clean(row.fullName, 'Candidate'),
      titleCase(row.status || 'nominated'),
      String(Number(row.votes || 0)),
      share(Number(row.votes || 0)),
    ]);

  const sections: PrintSection[] = [
    {
      kind: 'keyvalues',
      heading: 'The ballot',
      rows: [
        ['Group', clean(election?.groupName)],
        ['Role', titleCase(election?.role)],
        ['Ballot type', anonymity === 'public' ? 'Public roll (votes are visible)' : 'Anonymous ballot (counts only)'],
        ['Who may vote', election?.eligibleMode === 'custom'
          ? `${(election?.eligibleStudentIds || []).length} hand-picked member(s)`
          : 'Every member of this group'],
        ['Nominations', windowLabel(election?.nominationOpenAt, election?.nominationCloseAt, 'immediately', 'no deadline set')],
        ['Voting', windowLabel(election?.votingOpenAt, election?.votingCloseAt, 'as soon as it opens', 'closed by the organizer')],
        ['Tie-break', titleCase(election?.tieBreak || 'random')],
        ['Vote changes', election?.allowVoteChange ? 'Allowed until voting closes' : 'Locked once a vote is cast'],
        ['Results visible to', titleCase(election?.visibility || 'organizers')],
      ],
    },
    {
      kind: 'table',
      heading: `Ballot — ${rows.length} candidate${rows.length === 1 ? '' : 's'}`,
      columns: ['#', 'Candidate', 'Status', 'Votes', 'Share'],
      rows: ballotRows.length ? ballotRows : [['—', 'No candidates stood in this election', '—', '0', '0%']],
      align: ['right', 'left', 'left', 'right', 'right'],
      note: `Votes counted: ${cast}. ${anonymity === 'public' ? 'This is a public roll — every vote is attributable.' : 'This is an anonymous ballot — no vote is linked back to a voter.'}`,
    },
    {
      kind: 'keyvalues',
      heading: 'Turnout — voted and not voted',
      rows: [
        ['Voted', `${voted} of ${eligible || '—'} member(s)`],
        ['Not voted', `${notVoted} member(s)`],
        ['Turnout', `${turnout}%`],
        ['Ballots on the paper', `${cast} vote(s) counted across ${rows.length} candidate(s)`],
      ],
    },
    {
      kind: 'keyvalues',
      heading: 'Result',
      rows: [
        ['Outcome', status === 'closed'
          ? (election?.results?.outcome?.tie && !election?.results?.outcome?.resolved
            ? `Tie between ${tied.length} candidate(s) — not yet resolved`
            : winner ? `${clean(winner.fullName)} won` : 'Closed with no winner recorded')
          : status === 'cancelled' ? 'Election cancelled' : `Not decided yet (${status})`],
        ['Winner', winner ? `${clean(winner.fullName)} — ${Number(winner.votes || 0)} vote(s)` : '—'],
        ['Announced', election?.results?.outcome?.announced ? 'Yes, announced to the group' : 'Not announced'],
        ...(election?.cancelledReason ? [['Cancellation reason', clean(election.cancelledReason)] as [string, string]] : []),
      ],
    },
    {
      kind: 'lines',
      heading: 'How this election was run',
      lines: [
        'Every voter signed in with their own system-generated passkey — no one can cast another member’s vote.',
        `The ballot is ${anonymity === 'public' ? 'public: each vote is recorded against the voter' : 'anonymous: the count is kept, the voter is not'}.`,
        `Ties are settled by ${titleCase(election?.tieBreak || 'random')}, and the tie-break is recorded on the election.`,
        'This sheet was printed from the organizer’s own record — the numbers here are the numbers on screen.',
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
      anonymity === 'public' ? 'Public roll' : 'Anonymous ballot',
      election?.tieBreak ? `tie → ${election.tieBreak}` : null,
    ].filter(Boolean).join(' · '),
    badges: [status, election?.eligibleMode === 'custom' ? 'Hand-picked voters' : 'All members', election?.results?.outcome?.announced ? 'Announced' : null]
      .filter(Boolean) as string[],
    ...contextHeader(input),
    stats: [
      { label: 'Eligible', value: String(eligible || '—'), hint: 'group members' },
      { label: 'Voted', value: String(voted), hint: `of ${eligible || '—'}` },
      { label: 'Not voted', value: String(notVoted), hint: 'members' },
      { label: 'Turnout', value: `${turnout}%`, hint: 'voted ÷ eligible' },
      { label: 'Votes cast', value: String(cast), hint: 'on the paper' },
      { label: 'Candidates', value: String(rows.length), hint: 'on the ballot' },
    ],
    sections,
    links,
    notes: [
      `Issued ${printDate(input.issuedAt || new Date())} from the Class & Group Management record. The server record is the record of truth; this sheet is a print of it.`,
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
