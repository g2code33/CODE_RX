/**
 * Every emoji the website can show, in one place.
 *
 * The registry is the contract between the site and the PHANTOM control centre:
 * each entry has a stable key, the emoji that ships by default, and where a
 * visitor actually sees it. PHANTOM can replace any of these with an uploaded
 * PNG/JPEG/WEBP image from *Site emojis*; the replacement lives in the published
 * site content under `media["emoji.<key>"]`, the same store every other image
 * uses, so there is no second asset system and no new database shape.
 *
 * Rendering rules (see `components/SiteEmoji.tsx`): with no replacement the
 * emoji stays exactly as it was — nothing changes for a site that never uses
 * this. With a replacement, the image is drawn inline at the size of the text
 * it sits in, and the emoji character is kept as the alt text.
 */

export interface SiteEmojiEntry {
  /** Stable key. Also the media key, as `emoji.<key>`. */
  key: string;
  /** The emoji shipped in the code today. */
  emoji: string;
  /** Plain-language name shown in the admin list. */
  label: string;
  /** Where a visitor sees it. */
  where: string;
}

export const SITE_EMOJI_MEDIA_PREFIX = 'emoji.';

/** The media key that holds a replacement for one entry. */
export const siteEmojiMediaKey = (key: string): string => `${SITE_EMOJI_MEDIA_PREFIX}${key}`;

export const SITE_EMOJIS: SiteEmojiEntry[] = [
  { key: 'status.active', emoji: '🟢', label: 'Active marker', where: 'Projects — project status' },
  { key: 'status.development', emoji: '🚧', label: 'In progress marker', where: 'Projects — project status' },
  { key: 'status.research', emoji: '🧪', label: 'Research marker', where: 'Projects — project status' },
  { key: 'status.completed', emoji: '✅', label: 'Completed marker', where: 'Projects status and community reactions' },
  { key: 'reaction.like', emoji: '👍', label: 'Like reaction', where: 'Community — reactions' },
  { key: 'reaction.love', emoji: '❤️', label: 'Love reaction', where: 'Community — reactions' },
  { key: 'reaction.fire', emoji: '🔥', label: 'Fire reaction', where: 'Community — reactions' },
  { key: 'chat.attachment', emoji: '📎', label: 'Attachment marker', where: 'Community — chat files' },
  { key: 'welcome.wave', emoji: '👋', label: 'Welcome wave', where: 'Member dashboard heading' },
  { key: 'rank.trophy', emoji: '🏆', label: 'First place', where: 'Member leaderboard' },
  { key: 'rank.silver', emoji: '🥈', label: 'Second place', where: 'Member leaderboard' },
  { key: 'rank.bronze', emoji: '🥉', label: 'Third place', where: 'Member leaderboard' },
  { key: 'copy.pill', emoji: '💊', label: 'Pill', where: 'Terms page copy' },
  { key: 'copy.laptop', emoji: '💻', label: 'Laptop', where: 'Terms page copy' },
  { key: 'copy.rocket', emoji: '🚀', label: 'Rocket', where: 'Terms page copy' },
];

const escapeForPattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One entry per emoji character, longest emoji first so a sequence such as ❤️
 * is never matched as a bare ❤. A character that appears in two places (✅ in a
 * project status and in the community reactions) is one entry, because "change
 * this emoji" should mean every place a visitor sees it.
 *
 * Only emojis the public site really prints are listed: an emoji that lives in
 * an editor's sample data, or in the admin screens themselves, is not a place a
 * visitor sees and is deliberately left out.
 */
export const SITE_EMOJI_BY_CHARACTER: Record<string, SiteEmojiEntry> = SITE_EMOJIS.reduce(
  (map, entry) => {
    if (!map[entry.emoji]) map[entry.emoji] = entry;
    return map;
  },
  {} as Record<string, SiteEmojiEntry>,
);

const EMOJI_PATTERN = new RegExp(
  `(${Object.keys(SITE_EMOJI_BY_CHARACTER).sort((a, b) => b.length - a.length).map(escapeForPattern).join('|')})`,
  'g',
);

export const siteEmojiEntry = (character: string | null | undefined): SiteEmojiEntry | null =>
  character ? SITE_EMOJI_BY_CHARACTER[character] || null : null;

/** True when this character is one PHANTOM is allowed to replace. */
export const isSiteEmoji = (character: string | null | undefined): boolean => Boolean(siteEmojiEntry(character));

export interface EmojiRun {
  type: 'text' | 'emoji';
  value: string;
}

/** Splits a string into plain text and the emojis the site knows about. */
export const splitEmojiRuns = (text: string | null | undefined): EmojiRun[] => {
  const source = String(text ?? '');
  if (!source) return [];
  return source
    .split(EMOJI_PATTERN)
    .filter((part) => part !== '')
    .map((value) => ({ type: siteEmojiEntry(value) ? 'emoji' : 'text', value } as EmojiRun));
};

/**
 * The replacement an operator uploaded for this emoji, or null to keep the
 * emoji itself. Kept pure so the admin list and the tests can call it directly.
 */
export const siteEmojiReplacement = (
  media: Record<string, { src: string; alt?: string }> | null | undefined,
  character: string,
): { src: string; alt: string } | null => {
  const entry = siteEmojiEntry(character);
  if (!entry || !media) return null;
  const asset = media[siteEmojiMediaKey(entry.key)];
  if (!asset || !asset.src) return null;
  return { src: asset.src, alt: asset.alt || entry.label };
};
