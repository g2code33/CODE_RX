import { createContext, Fragment, useContext, type ReactNode } from 'react';
import type { MediaAsset } from '../data/editorSchema';
import { siteEmojiReplacement, splitEmojiRuns } from '../data/siteEmojis';

/**
 * Emoji rendering for the website.
 *
 * `<SiteEmojiProvider media={siteContent.media}>` is mounted once, at the top of
 * the app, so every screen reads the same published media map. Inside it:
 *
 *   • `<SiteEmoji character="🚧" />` draws the uploaded image if PHANTOM has
 *     replaced that emoji, and the emoji itself otherwise.
 *   • `<SiteEmojiText text={project.status} />` does the same for emojis that
 *     are inside a longer string.
 *
 * With no provider and no replacement, both render exactly the text they were
 * given — the site behaves as it did before this existed.
 */
type MediaMap = Record<string, MediaAsset> | undefined;

const SiteEmojiContext = createContext<MediaMap>(undefined);

export const SiteEmojiProvider = ({ media, children }: { media?: MediaMap; children: ReactNode }) => (
  <SiteEmojiContext.Provider value={media}>{children}</SiteEmojiContext.Provider>
);

export const useSiteEmojiMedia = (): MediaMap => useContext(SiteEmojiContext);

/** The uploaded image for one emoji, or null when the emoji itself is shown. */
export const useSiteEmojiReplacement = (character: string) => {
  const media = useSiteEmojiMedia();
  return siteEmojiReplacement(media, character);
};

/** Inline sizing that keeps an uploaded image sitting on the text baseline. */
export const SITE_EMOJI_IMAGE_CLASS = 'inline-block h-[1.05em] w-[1.05em] shrink-0 align-[-0.18em] object-contain';

export const SiteEmoji = ({ character, className = SITE_EMOJI_IMAGE_CLASS }: { character: string; className?: string }) => {
  const replacement = useSiteEmojiReplacement(character);
  if (!replacement) return <>{character}</>;
  return (
    <img
      src={replacement.src}
      alt={replacement.alt}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
};

/** A whole string, with every known emoji replaced where an operator replaced it. */
export const SiteEmojiText = ({ text, className }: { text: string | null | undefined; className?: string }) => (
  <>
    {splitEmojiRuns(text).map((run, index) =>
      run.type === 'emoji' ? (
        <SiteEmoji key={`emoji-${index}-${run.value}`} character={run.value} className={className || SITE_EMOJI_IMAGE_CLASS} />
      ) : (
        <Fragment key={`text-${index}`}>{run.value}</Fragment>
      ),
    )}
  </>
);
