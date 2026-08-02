import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { CustomBlock, SiteContent, normalizeSiteContent } from '../data/siteState';
import { getCopy, getMedia, MediaAsset } from '../data/editorSchema';
import { Hero } from './Hero';
import { ValueCards, About } from './About';
import { WhatWeDo } from './WhatWeDo';
import { Academy } from './Academy';
import { Projects } from './Projects';
import { Competitions } from './Competitions';
import { Leadership } from './Leadership';
import { Extras } from './Extras';
import { Terms } from './Terms';
import { Footer } from './Footer';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';
import { EditableImage, EditableRegion, EditableText } from './VisualEditorContext';

interface SiteFlowProps {
  siteContent: SiteContent;
  activeTab: string;
  onJoin?: () => void;
  includeFooter?: boolean;
  includeJoinCta?: boolean;
}

const CustomBlocks = ({
  blocks,
  media,
}: {
  blocks: Array<{ block: CustomBlock; index: number }>;
  media: Record<string, MediaAsset>;
}) => <>{blocks.map(({ block, index }) => {
  const image = getMedia(media, `customBlocks.${block.id}.image`, { src: block.image || '', alt: block.title });
  return <EditableRegion key={block.id} elementKey={`customBlocks.${block.id}.section`} label={`${block.title} custom section`} collection="customBlocks"><section className="brand-section brand-section--alt py-24 sm:py-28"><div className="relative z-10 mx-auto grid max-w-[1120px] items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.15fr_.85fr]"><div><div className="brand-eyebrow"><EditableText elementKey={`customBlocks.${block.id}.eyebrow`} copyKey={`customBlocks.${index}.eyebrow`} label="Custom section eyebrow">{block.eyebrow}</EditableText></div><h2 className="brand-title mt-5 text-4xl sm:text-5xl"><EditableText elementKey={`customBlocks.${block.id}.title`} copyKey={`customBlocks.${index}.title`} label="Custom section title">{block.title}</EditableText></h2><p className="brand-copy mt-6 max-w-2xl"><EditableText elementKey={`customBlocks.${block.id}.description`} copyKey={`customBlocks.${index}.description`} label="Custom section description">{block.description}</EditableText></p><EditableRegion elementKey={`customBlocks.${block.id}.link`} copyKey={`customBlocks.${index}.buttonLink`} label="Custom section button link" className="mt-8 inline-block"><a href={block.buttonLink || '#'} className="brand-button"><EditableText elementKey={`customBlocks.${block.id}.button`} copyKey={`customBlocks.${index}.buttonLabel`} label="Custom section button label">{block.buttonLabel}</EditableText><ArrowRight className="h-4 w-4" /></a></EditableRegion></div><EditableRegion elementKey={`customBlocks.${block.id}.image-panel`} label="Custom section image panel" className="brand-card relative min-h-64 overflow-hidden p-3">{image.src ? <EditableImage elementKey={`customBlocks.${block.id}.image`} mediaKey={`customBlocks.${block.id}.image`} label="Custom section image" src={image.src} alt={image.alt || block.title} className="h-full min-h-60 w-full rounded-xl object-cover" /> : <div className="grid min-h-60 place-items-center rounded-xl border border-dashed border-[#16a34a]/30 bg-[#b8ff3d]/5"><EditableImage elementKey={`customBlocks.${block.id}.image`} mediaKey={`customBlocks.${block.id}.image`} label="Upload custom section image" src="" alt={block.title} className="absolute inset-0" /><ImagePlaceholder /></div>}</EditableRegion></div></section></EditableRegion>;
})}</>;

const ImagePlaceholder = () => <span className="brand-number">NEW VISUAL SECTION</span>;

/**
 * The single public website renderer. The visitor app and the admin live
 * builder both use this component, so the canvas is never a lookalike preview.
 */
export const SiteFlow = ({
  siteContent,
  activeTab,
  onJoin,
  includeFooter = true,
  includeJoinCta = true,
}: SiteFlowProps) => {
  const content = normalizeSiteContent(siteContent);
  const copy = content.copy;

  const page = (() => {
    switch (activeTab) {
      case 'home':
        return <><Hero content={content.home} copy={copy} media={content.media} onJoin={onJoin} /><ValueCards values={content.home.coreValues} copy={copy} /><EditableRegion elementKey="news.section" label="Latest news section" collection="news"><section id="news" className="brand-section brand-section--panel border-y border-[#16a34a]/20 py-24 sm:py-28"><PharmacyBackground layout="lab" /><div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10"><div className="mb-12 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="brand-eyebrow mb-5"><EditableText elementKey="news.eyebrow" copyKey="news.eyebrow" label="News eyebrow">{getCopy(copy, 'news.eyebrow', 'Latest signal')}</EditableText></div><h2 className="brand-title text-4xl sm:text-5xl"><EditableText elementKey="news.title" copyKey="news.title" label="News heading">{getCopy(copy, 'news.title', 'What’s moving')}</EditableText><br /><span className="brand-gradient-text"><EditableText elementKey="news.title-accent" copyKey="news.titleAccent" label="News heading accent">{getCopy(copy, 'news.titleAccent', 'the network.')}</EditableText></span></h2></div><SectionLink id="news" /></div><EditableRegion elementKey="news.grid" label="News card grid" collection="news" className="grid gap-4 md:grid-cols-3">{content.home.latestNews.map((news, index) => <EditableRegion key={news.id} elementKey={`news.card.${news.id}`} label={`${news.title} news card`} collection="news" className="brand-card brand-card-hover p-6 sm:p-7"><div className="flex items-center justify-between"><span className="brand-number">0{index + 1} / <EditableText elementKey={`news.card.${news.id}.category`} copyKey={`home.latestNews.${index}.category`} label={`${news.title} category`}>{news.category}</EditableText></span><span className="h-1.5 w-1.5 rounded-full bg-[#b8ff3d] shadow-[0_0_10px_#b8ff3d]" /></div><h3 className="mt-8 text-xl font-black leading-tight tracking-tight text-[#0f172a]"><EditableText elementKey={`news.card.${news.id}.title`} copyKey={`home.latestNews.${index}.title`} label={`${news.title} title`}>{news.title}</EditableText></h3><p className="mt-4 text-sm leading-7 text-[#475569]"><EditableText elementKey={`news.card.${news.id}.text`} copyKey={`home.latestNews.${index}.text`} label={`${news.title} text`}>{news.text}</EditableText></p><div className="mt-7 h-px w-12 bg-[#b8ff3d]/60" /></EditableRegion>)}</EditableRegion></div></section></EditableRegion></>;
      case 'about':
        return <><About content={content.about} copy={copy} media={content.media} /><WhatWeDo tracks={content.about.tracks} copy={copy} /><Leadership team={content.about.team} copy={copy} media={content.media} /><Extras content={content.extras} copy={copy} /></>;
      case 'learn':
        return <Academy content={content.learn} copy={copy} />;
      case 'projects':
        return <Projects projects={content.projects} copy={copy} media={content.media} />;
      case 'challenges':
        return <Competitions active={content.challenges.active} copy={copy} />;
      case 'community':
        return <EditableRegion elementKey="community.section" label="Community section"><section id="community" className="brand-section brand-grid min-h-[70vh] py-28 sm:py-36"><PharmacyBackground layout="clinic" /><div className="brand-glow right-[-12rem] top-20 opacity-50" /><div className="relative z-10 mx-auto flex min-h-[55vh] max-w-[1440px] items-center px-5 sm:px-8 lg:px-10"><div className="max-w-3xl"><div className="mb-6 flex items-center gap-5"><div className="brand-eyebrow"><EditableText elementKey="community.eyebrow" copyKey="community.eyebrow" label="Community eyebrow">{getCopy(copy, 'community.eyebrow', 'Community hub')}</EditableText></div><SectionLink id="community" /></div><h2 className="brand-title text-5xl sm:text-6xl lg:text-8xl"><EditableText elementKey="community.title" copyKey="community.hubTitle" label="Community title">{content.community.hubTitle}</EditableText><span className="brand-gradient-text block text-[0.7em]"><EditableText elementKey="community.title-accent" copyKey="community.titleAccent" label="Community title accent">{getCopy(copy, 'community.titleAccent', 'Find your people.')}</EditableText></span></h2><p className="brand-copy mt-7 max-w-2xl text-base sm:text-lg"><EditableText elementKey="community.description" copyKey="community.description" label="Community description">{content.community.description}</EditableText></p><EditableRegion elementKey="community.telegram-link" copyKey="community.telegramLink" label="Community Telegram link" className="mt-9 inline-block"><a href={content.community.telegramLink} target="_blank" rel="noopener noreferrer" className="brand-button"><EditableText elementKey="community.cta" copyKey="community.cta" label="Community button">{getCopy(copy, 'community.cta', 'Join Telegram channel')}</EditableText><ArrowRight className="h-4 w-4" /></a></EditableRegion></div></div></section></EditableRegion>;
      case 'resources':
        return <EditableRegion elementKey="resources.section" label="Resources section" collection="resources"><section id="resources" className="brand-section brand-section--alt min-h-[70vh] py-28 sm:py-36"><PharmacyBackground layout="lab" /><div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10"><div className="mb-14 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="brand-eyebrow mb-5"><EditableText elementKey="resources.eyebrow" copyKey="resources.eyebrow" label="Resources eyebrow">{getCopy(copy, 'resources.eyebrow', 'The library')}</EditableText></div><h2 className="brand-title text-4xl sm:text-5xl"><EditableText elementKey="resources.title" copyKey="resources.title" label="Resources heading">{getCopy(copy, 'resources.title', 'Tools for the')}</EditableText><br /><span className="brand-gradient-text"><EditableText elementKey="resources.title-accent" copyKey="resources.titleAccent" label="Resources heading accent">{getCopy(copy, 'resources.titleAccent', 'next prescription.')}</EditableText></span></h2></div><SectionLink id="resources" /></div><EditableRegion elementKey="resources.grid" label="Resource category grid" collection="resources" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{content.resources.categories.map((category, categoryIndex) => <EditableRegion key={`${category.name}-${categoryIndex}`} elementKey={`resources.category.${categoryIndex}`} label={`${category.name} resource category`} collection="resources" className="brand-card brand-card-hover p-6 sm:p-7"><span className="brand-number">0{categoryIndex + 1} / LIBRARY</span><h3 className="mt-8 text-xl font-black text-[#0f172a]"><EditableText elementKey={`resources.category.${categoryIndex}.name`} copyKey={`resources.categories.${categoryIndex}.name`} label={`${category.name} category name`}>{category.name}</EditableText></h3><ul className="mt-6 space-y-3 border-t border-[#16a34a]/20 pt-5 text-sm text-[#475569]">{category.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`} className="flex items-center gap-3"><span className="h-1.5 w-1.5 rounded-full bg-[#b8ff3d]" /><EditableText elementKey={`resources.category.${categoryIndex}.item.${itemIndex}`} copyKey={`resources.categories.${categoryIndex}.items.${itemIndex}`} label={`${category.name} resource ${itemIndex + 1}`}>{item}</EditableText></li>)}</ul></EditableRegion>)}</EditableRegion></div></section></EditableRegion>;
      case 'terms':
        return <Terms content={content.terms} copy={copy} />;
      default:
        return <Hero content={content.home} copy={copy} media={content.media} onJoin={onJoin} />;
    }
  })();

  const customBlocks = content.customBlocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.page === activeTab);

  return <>{page}<CustomBlocks blocks={customBlocks} media={content.media} />{includeJoinCta && <EditableRegion elementKey="join.section" label="Join call to action"><section id="join" className="brand-section brand-grid relative overflow-hidden border-y border-[#16a34a]/20 py-28 sm:py-36"><PharmacyBackground layout="hero" /><div className="brand-glow left-1/2 top-[-16rem] -translate-x-1/2 opacity-50" /><div className="brand-scanlines absolute inset-0" /><div className="relative z-10 mx-auto max-w-4xl px-5 text-center sm:px-8"><div className="mb-6 flex items-center justify-center gap-4"><div className="brand-eyebrow"><EditableText elementKey="join.eyebrow" copyKey="join.eyebrow" label="Join eyebrow">{getCopy(copy, 'join.eyebrow', 'Your next build starts here')}</EditableText></div><SectionLink id="join" /></div><h2 className="brand-title text-5xl sm:text-6xl lg:text-8xl"><EditableText elementKey="join.title" copyKey="join.title" label="Join heading">{getCopy(copy, 'join.title', 'Ready to code')}</EditableText><br /><span className="brand-gradient-text"><EditableText elementKey="join.title-accent" copyKey="join.titleAccent" label="Join heading accent">{getCopy(copy, 'join.titleAccent', 'the future?')}</EditableText></span></h2><p className="brand-copy mx-auto mt-7 max-w-2xl text-base sm:text-lg"><EditableText elementKey="join.description" copyKey="join.description" label="Join description">{getCopy(copy, 'join.description', '')}</EditableText></p><div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={onJoin} className="brand-button"><EditableText elementKey="join.primary-cta" copyKey="join.primaryCta" label="Join primary button">{getCopy(copy, 'join.primaryCta', 'Join the society')}</EditableText><ArrowRight className="h-4 w-4" /></motion.button><motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="brand-button brand-button--ghost"><EditableText elementKey="join.secondary-cta" copyKey="join.secondaryCta" label="Join secondary button">{getCopy(copy, 'join.secondaryCta', 'Back to top')}</EditableText><ArrowRight className="h-4 w-4 -rotate-45" /></motion.button></div></div></section></EditableRegion>}{includeFooter && <Footer copy={content.copy} links={content.links} media={content.media} />}</>;
};
