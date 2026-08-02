import { motion } from 'framer-motion';
import { Activity, ArrowDown, ArrowRight, Code2, ShieldCheck, Sparkles, UserPlus, Zap } from 'lucide-react';
import { SiteContent } from '../data/siteState';
import { getCopy, getMedia, MediaAsset } from '../data/editorSchema';
import { PharmacyBackground } from './PharmacyBackground';
import { EditableImage, EditableRegion, EditableText } from './VisualEditorContext';

export const Hero = ({
  content,
  copy,
  media,
  onJoin,
}: {
  content: SiteContent['home'];
  copy?: Record<string, string>;
  media?: Record<string, MediaAsset>;
  onJoin?: () => void;
}) => {
  const explore = () => {
    document.getElementById('values')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const heroLogo = getMedia(media, 'hero.logo', { src: '/logo.png', alt: 'CODE Rx Society — Coding the Future of Pharmacy' });

  return (
    <EditableRegion elementKey="hero.section" label="Hero section">
      <section id="home" className="brand-section brand-grid min-h-[720px] pt-[4.5rem] lg:min-h-screen">
        <PharmacyBackground layout="hero" />
        <div className="brand-grid-fade absolute inset-0 opacity-70" />
        <div className="brand-scanlines absolute inset-0" />
        <div className="brand-glow -left-40 top-20" />
        <div className="brand-glow right-[-12rem] top-[18rem] opacity-60" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-[1440px] items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[1.03fr_0.97fr] lg:gap-10 lg:px-10 lg:py-20">
          <motion.div initial={{ opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} className="max-w-3xl">
            <div className="brand-eyebrow mb-7"><Sparkles className="h-3.5 w-3.5" /><EditableText elementKey="hero.tagline" copyKey="home.heroTagline" label="Hero tagline">{content.heroTagline}</EditableText></div>

            <h1 className="brand-title text-[clamp(4rem,10vw,8.8rem)]">
              <EditableText elementKey="hero.title" copyKey="home.heroTitle" label="Hero title">{content.heroTitle}</EditableText>
              <span className="mt-2 block brand-gradient-text text-[0.7em]"><EditableText elementKey="hero.subtitle" copyKey="home.heroSubtitle" label="Hero subtitle">{content.heroSubtitle}</EditableText></span>
            </h1>

            <div className="mt-8 max-w-2xl border-l border-[#b8ff3d]/50 pl-5 sm:pl-6"><p className="brand-copy text-base sm:text-lg"><EditableText elementKey="hero.description" copyKey="home.heroDescription" label="Hero description">{content.heroDescription}</EditableText></p></div>

            <div className="mt-9 flex flex-wrap gap-3">
              <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={onJoin} className="brand-button"><UserPlus className="h-4 w-4" /><EditableText elementKey="hero.primary-cta" copyKey="hero.primaryCta" label="Hero primary button">{getCopy(copy, 'hero.primaryCta', 'Join the Society')}</EditableText><ArrowRight className="h-4 w-4" /></motion.button>
              <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={explore} className="brand-button brand-button--ghost"><EditableText elementKey="hero.secondary-cta" copyKey="hero.secondaryCta" label="Hero secondary button">{getCopy(copy, 'hero.secondaryCta', 'Explore the network')}</EditableText><ArrowDown className="h-4 w-4" /></motion.button>
            </div>

            <EditableRegion elementKey="hero.stats" label="Hero statistics" className="mt-12 grid max-w-xl grid-cols-3 divide-x divide-[#b8ff3d]/15 border-y border-[#16a34a]/20 py-5">
              <div className="pr-4"><p className="brand-number"><EditableText elementKey="hero.member-count" copyKey="home.communityCount" label="Community member count">{String(content.communityCount).padStart(3, '0')}+</EditableText></p><p className="mt-1 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#475569]"><EditableText elementKey="hero.members-label" copyKey="hero.membersLabel" label="Member statistic label">{getCopy(copy, 'hero.membersLabel', 'Members')}</EditableText></p></div>
              <div className="px-4"><p className="brand-number"><EditableText elementKey="hero.tracks-value" copyKey="hero.tracksValue" label="Tracks statistic value">{getCopy(copy, 'hero.tracksValue', '06')}</EditableText></p><p className="mt-1 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#475569]"><EditableText elementKey="hero.tracks-label" copyKey="hero.tracksLabel" label="Tracks statistic label">{getCopy(copy, 'hero.tracksLabel', 'Tracks')}</EditableText></p></div>
              <div className="pl-4"><p className="brand-number"><EditableText elementKey="hero.curiosity-value" copyKey="hero.curiosityValue" label="Curiosity statistic value">{getCopy(copy, 'hero.curiosityValue', '24/7')}</EditableText></p><p className="mt-1 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#475569]"><EditableText elementKey="hero.curiosity-label" copyKey="hero.curiosityLabel" label="Curiosity statistic label">{getCopy(copy, 'hero.curiosityLabel', 'Curiosity')}</EditableText></p></div>
            </EditableRegion>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.88, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.12, ease: 'easeOut' }} className="relative mx-auto w-full max-w-[580px] lg:justify-self-end">
            <EditableRegion elementKey="hero.brand-card" label="Hero brand card" className="brand-card relative aspect-square overflow-hidden rounded-[2rem] border-[#16a34a]/20 bg-[#06100a]/80 p-5 shadow-[0_0_100px_rgba(91,255,32,0.09)] sm:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(184,255,61,0.22),transparent_38%)]" />
              <div className="brand-grid-fine absolute inset-0 opacity-30" />
              <div className="absolute inset-5 rounded-[1.35rem] border border-[#16a34a]/20 sm:inset-8" />
              <div className="absolute left-8 top-8 flex items-center gap-2 text-[0.64rem] font-black uppercase tracking-[0.2em] text-[#475569] sm:left-12 sm:top-12"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#b8ff3d] shadow-[0_0_10px_#b8ff3d]" /><EditableText elementKey="hero.system-live" copyKey="hero.systemLive" label="Hero system status">{getCopy(copy, 'hero.systemLive', 'Live / brand_system')}</EditableText></div>
              <div className="absolute right-8 top-8 text-right sm:right-12 sm:top-12"><p className="brand-number"><EditableText elementKey="hero.system-code" copyKey="hero.systemCode" label="Hero system code">{getCopy(copy, 'hero.systemCode', 'CRX / 001')}</EditableText></p><p className="mt-1 text-[0.66rem] uppercase tracking-[0.17em] text-[#64748b]"><EditableText elementKey="hero.system-established" copyKey="hero.systemEstablished" label="Hero established label">{getCopy(copy, 'hero.systemEstablished', 'Est. Ghana')}</EditableText></p></div>
              <div className="relative flex h-full items-center justify-center"><div className="absolute h-[68%] w-[68%] rounded-full border border-[#16a34a]/20 shadow-[0_0_60px_rgba(184,255,61,0.13),inset_0_0_45px_rgba(184,255,61,0.08)]" /><div className="absolute h-[76%] w-[76%] rounded-full border border-dashed border-[#16a34a]/20" /><EditableImage elementKey="hero.logo" mediaKey="hero.logo" label="Hero logo" src={heroLogo.src} alt={heroLogo.alt} className="brand-logo-glow relative z-10 h-[74%] w-[74%] object-contain animate-brand-pulse" /></div>
              <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between sm:bottom-12 sm:left-12 sm:right-12"><div><p className="text-[0.64rem] font-black uppercase tracking-[0.2em] text-[#64748b]"><EditableText elementKey="hero.signal-label" copyKey="hero.systemSignal" label="Hero signal label">{getCopy(copy, 'hero.systemSignal', 'Signal')}</EditableText></p><div className="mt-2 flex items-end gap-1">{[18, 28, 22, 35, 30, 46, 38, 54, 44].map((height, index) => <span key={index} className="w-1 rounded-full bg-[#b8ff3d]/70" style={{ height: `${height}px` }} />)}</div></div><div className="flex gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#16a34a]/20 bg-[#b8ff3d]/5 text-[#15803d]"><Code2 className="h-3.5 w-3.5" /></span><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#16a34a]/20 bg-[#b8ff3d]/5 text-[#15803d]"><Activity className="h-3.5 w-3.5" /></span></div></div>
            </EditableRegion>
            <motion.div animate={{ y: [-7, 7, -7] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }} className="brand-card absolute -bottom-7 -left-2 hidden w-52 p-4 sm:block sm:-left-8"><div className="flex items-center gap-2 text-[0.64rem] font-black uppercase tracking-[0.18em] text-[#15803d]"><Zap className="h-3.5 w-3.5" /><EditableText elementKey="hero.build-label" copyKey="hero.buildLabel" label="Hero signal card label">{getCopy(copy, 'hero.buildLabel', 'Build signal')}</EditableText></div><p className="mt-3 text-sm font-bold text-[#0f172a]"><EditableText elementKey="hero.build-copy" copyKey="hero.buildCopy" label="Hero signal card text">{getCopy(copy, 'hero.buildCopy', 'Pharmacy problems → digital solutions')}</EditableText></p><div className="mt-3 h-1 overflow-hidden rounded-full bg-[#b8ff3d]/10"><div className="h-full w-[72%] rounded-full bg-[#b8ff3d] shadow-[0_0_12px_#b8ff3d]" /></div></motion.div>
            <div className="brand-card absolute -right-2 -top-6 hidden w-44 p-4 sm:block sm:-right-7"><div className="flex items-center gap-2 text-[0.64rem] font-black uppercase tracking-[0.18em] text-[#475569]"><ShieldCheck className="h-3.5 w-3.5 text-[#15803d]" /><EditableText elementKey="hero.safe-title" copyKey="hero.safeTitle" label="Hero safety card title">{getCopy(copy, 'hero.safeTitle', 'Safe by design')}</EditableText></div><p className="mt-2 text-xs leading-relaxed text-[#475569]"><EditableText elementKey="hero.safe-copy" copyKey="hero.safeCopy" label="Hero safety card text">{getCopy(copy, 'hero.safeCopy', 'Responsible tech for better care.')}</EditableText></p></div>
          </motion.div>
        </div>
      </section>
    </EditableRegion>
  );
};
