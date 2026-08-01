import { motion } from 'framer-motion';
import { Activity, ArrowDown, ArrowRight, Code2, ShieldCheck, Sparkles, UserPlus, Zap } from 'lucide-react';
import { SiteContent } from '../data/siteState';
import { PharmacyBackground } from './PharmacyBackground';

export const Hero = ({
  content,
  onJoin
}: {
  content: SiteContent['home'];
  onJoin?: () => void;
}) => {
  const explore = () => {
    document.getElementById('values')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="home" className="brand-section brand-grid min-h-[720px] pt-[4.5rem] lg:min-h-screen">
      <PharmacyBackground layout="hero" />
      <div className="brand-grid-fade absolute inset-0 opacity-70" />
      <div className="brand-scanlines absolute inset-0" />
      <div className="brand-glow -left-40 top-20" />
      <div className="brand-glow right-[-12rem] top-[18rem] opacity-60" />

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-[1440px] items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[1.03fr_0.97fr] lg:gap-10 lg:px-10 lg:py-20">
        <motion.div
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="max-w-3xl"
        >
          <div className="brand-eyebrow mb-7">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{content.heroTagline}</span>
          </div>

          <h1 className="brand-title text-[clamp(4rem,10vw,8.8rem)]">
            {content.heroTitle}
            <span className="mt-2 block brand-gradient-text text-[0.7em]">{content.heroSubtitle}</span>
          </h1>

          <div className="mt-8 max-w-2xl border-l border-[#b8ff3d]/50 pl-5 sm:pl-6">
            <p className="brand-copy text-base sm:text-lg">{content.heroDescription}</p>
          </div>

          <div className="mt-9 flex flex-wrap gap-3">
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onJoin}
              className="brand-button"
            >
              <UserPlus className="h-4 w-4" />
              Join the Society
              <ArrowRight className="h-4 w-4" />
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={explore}
              className="brand-button brand-button--ghost"
            >
              Explore the network
              <ArrowDown className="h-4 w-4" />
            </motion.button>
          </div>

          <div className="mt-12 grid max-w-xl grid-cols-3 divide-x divide-[#b8ff3d]/15 border-y border-[#b8ff3d]/15 py-5">
            <div className="pr-4">
              <p className="brand-number">{String(content.communityCount).padStart(3, '0')}+</p>
              <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#8da18e]">Members</p>
            </div>
            <div className="px-4">
              <p className="brand-number">06</p>
              <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#8da18e]">Tracks</p>
            </div>
            <div className="pl-4">
              <p className="brand-number">24/7</p>
              <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#8da18e]">Curiosity</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.12, ease: 'easeOut' }}
          className="relative mx-auto w-full max-w-[580px] lg:justify-self-end"
        >
          <div className="brand-card relative aspect-square overflow-hidden rounded-[2rem] border-[#b8ff3d]/25 bg-[#06100a]/80 p-5 shadow-[0_0_100px_rgba(91,255,32,0.09)] sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(184,255,61,0.22),transparent_38%)]" />
            <div className="brand-grid-fine absolute inset-0 opacity-30" />
            <div className="absolute inset-5 rounded-[1.35rem] border border-[#b8ff3d]/20 sm:inset-8" />
            <div className="absolute left-8 top-8 flex items-center gap-2 text-[0.58rem] font-black uppercase tracking-[0.2em] text-[#8da18e] sm:left-12 sm:top-12">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#b8ff3d] shadow-[0_0_10px_#b8ff3d]" />
              Live / brand_system
            </div>
            <div className="absolute right-8 top-8 text-right sm:right-12 sm:top-12">
              <p className="brand-number">CRX / 001</p>
              <p className="mt-1 text-[0.55rem] uppercase tracking-[0.17em] text-[#718675]">Est. Ghana</p>
            </div>

            <div className="relative flex h-full items-center justify-center">
              <div className="absolute h-[68%] w-[68%] rounded-full border border-[#b8ff3d]/25 shadow-[0_0_60px_rgba(184,255,61,0.13),inset_0_0_45px_rgba(184,255,61,0.08)]" />
              <div className="absolute h-[76%] w-[76%] rounded-full border border-dashed border-[#b8ff3d]/20" />
              <img
                src="/logo.png"
                alt="CODE Rx Society — Coding the Future of Pharmacy"
                className="brand-logo-glow relative z-10 h-[74%] w-[74%] object-contain animate-brand-pulse"
              />
            </div>

            <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between sm:bottom-12 sm:left-12 sm:right-12">
              <div>
                <p className="text-[0.58rem] font-black uppercase tracking-[0.2em] text-[#718675]">Signal</p>
                <div className="mt-2 flex items-end gap-1">
                  {[18, 28, 22, 35, 30, 46, 38, 54, 44].map((height, index) => (
                    <span key={index} className="w-1 rounded-full bg-[#b8ff3d]/70" style={{ height: `${height}px` }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8ff3d]/20 bg-[#b8ff3d]/5 text-[#b8ff3d]"><Code2 className="h-3.5 w-3.5" /></span>
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b8ff3d]/20 bg-[#b8ff3d]/5 text-[#b8ff3d]"><Activity className="h-3.5 w-3.5" /></span>
              </div>
            </div>
          </div>

          <motion.div
            animate={{ y: [-7, 7, -7] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            className="brand-card absolute -bottom-7 -left-2 hidden w-52 p-4 sm:block sm:-left-8"
          >
            <div className="flex items-center gap-2 text-[0.58rem] font-black uppercase tracking-[0.18em] text-[#b8ff3d]">
              <Zap className="h-3.5 w-3.5" />
              Build signal
            </div>
            <p className="mt-3 text-sm font-bold text-[#f2f8ed]">Pharmacy problems → digital solutions</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#b8ff3d]/10"><div className="h-full w-[72%] rounded-full bg-[#b8ff3d] shadow-[0_0_12px_#b8ff3d]" /></div>
          </motion.div>

          <div className="brand-card absolute -right-2 -top-6 hidden w-44 p-4 sm:block sm:-right-7">
            <div className="flex items-center gap-2 text-[0.58rem] font-black uppercase tracking-[0.18em] text-[#8da18e]"><ShieldCheck className="h-3.5 w-3.5 text-[#b8ff3d]" /> Safe by design</div>
            <p className="mt-2 text-xs leading-relaxed text-[#8da18e]">Responsible tech for better care.</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
