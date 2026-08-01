import { Lock, Timer, Trophy, Users } from 'lucide-react';
import { SiteContent } from '../data/siteState';
import { SectionLink } from './SectionLink';

export const Competitions = ({ active }: { active: SiteContent['challenges']['active'] }) => {
  return (
    <section id="challenges" className="brand-section brand-section--alt brand-grid-fine relative overflow-hidden py-28 sm:py-36">
      <div className="brand-glow left-[-15rem] top-20 opacity-50" />
      <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
        <div className="mb-14 flex flex-col items-center text-center">
          <div className="brand-eyebrow mb-6"><Trophy className="h-3.5 w-3.5" /> Decoder challenge</div>
          <h2 className="brand-title max-w-4xl text-4xl sm:text-5xl lg:text-6xl">Can you decode<br /><span className="brand-gradient-text">what others can't see?</span></h2>
          <p className="brand-copy mt-6 max-w-2xl text-base">Push your limits in pharmacy-themed coding, cryptography, and problem-solving challenges.</p>
          <div className="mt-6"><SectionLink id="challenges" /></div>
        </div>

        <div className="brand-card relative mx-auto max-w-5xl overflow-hidden p-7 sm:p-10 lg:p-14">
          <Lock className="absolute -right-8 -top-8 h-64 w-64 text-[#b8ff3d]/5" />
          <div className="relative z-10">
            <div className="flex flex-col justify-between gap-7 border-b border-[#b8ff3d]/15 pb-8 sm:flex-row sm:items-start">
              <div>
                <p className="brand-number mb-3">ACTIVE / CRX-DECODER</p>
                <h3 className="text-3xl font-black tracking-tight text-[#f2f8ed] sm:text-4xl">{active.id}</h3>
                <div className="mt-4 flex flex-wrap items-center gap-4 text-[0.62rem] font-black uppercase tracking-[0.15em] text-[#8da18e]"><span className="rounded-full border border-[#b8ff3d]/25 bg-[#b8ff3d]/8 px-3 py-1.5 text-[#b8ff3d]">{active.difficulty}</span><span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-[#b8ff3d]" /> {active.participants} participants</span></div>
              </div>
              <div className="rounded-xl border border-[#b8ff3d]/20 bg-[#b8ff3d]/5 p-4 sm:min-w-[170px]"><div className="flex items-center gap-2 text-[#b8ff3d]"><Timer className="h-4 w-4" /><span className="brand-mono text-xl font-black">{active.timeRemaining}</span></div><p className="mt-2 text-[0.58rem] font-black uppercase tracking-[0.15em] text-[#718675]">Time remaining</p></div>
            </div>

            <div className="grid gap-10 pt-9 lg:grid-cols-[1fr_260px] lg:items-center">
              <div><p className="text-sm leading-7 text-[#a9bf9f]">{active.problem}</p><div className="mt-8 flex flex-wrap gap-8"><div><p className="brand-number">PRIZE</p><p className="mt-2 text-2xl font-black text-[#b8ff3d]">{active.prize}</p></div><div className="h-12 w-px bg-[#b8ff3d]/15" /><div><p className="brand-number">REWARD</p><p className="mt-2 text-2xl font-black text-[#f2f8ed]">{active.reward}</p></div></div></div>
              <button type="button" className="brand-button w-full !rounded-xl !py-6">Enter challenge <span>→</span></button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
