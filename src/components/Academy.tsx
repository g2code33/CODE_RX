import { ArrowRight, BookOpen, CheckCircle2, Terminal } from 'lucide-react';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';

export const Academy = ({ steps }: { steps: string[] }) => {
  return (
    <section id="learn" className="brand-section brand-grid py-28 sm:py-36">
      <PharmacyBackground layout="lab" />
      <div className="brand-glow right-[-14rem] top-20 opacity-50" />
      <div className="relative z-10 mx-auto grid max-w-[1440px] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
        <div>
          <div className="mb-6 flex items-center justify-between gap-4 sm:justify-start sm:gap-8">
            <div className="brand-eyebrow"><BookOpen className="h-3.5 w-3.5" /> Code Rx Academy</div>
            <SectionLink id="learn" />
          </div>
          <h1 className="brand-title text-5xl sm:text-6xl lg:text-7xl">Learn the stack.<br /><span className="brand-gradient-text">Build the bridge.</span></h1>
          <p className="brand-copy mt-7 max-w-xl text-base sm:text-lg">A structured path for pharmacy professionals who want to move from curiosity to shipping useful healthcare technology.</p>

          <div className="mt-9 space-y-4">
            {['Earn practical, portfolio-ready skills', 'Work on real pharmacy problems', 'Learn with a community that gets both sides'].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm font-bold text-[#334155]"><CheckCircle2 className="h-5 w-5 text-[#15803d]" />{item}</div>
            ))}
          </div>

          <a href="#projects" className="brand-button mt-10">
            See the project lab <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="brand-card relative overflow-hidden p-5 sm:p-8">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[#b8ff3d]/8 blur-3xl" />
          <div className="relative mb-7 flex items-center justify-between border-b border-[#16a34a]/20 pb-5">
            <div className="flex items-center gap-3"><Terminal className="h-4 w-4 text-[#15803d]" /><span className="brand-number">LEARNING_PATH / 08 MODULES</span></div>
            <span className="h-2 w-2 rounded-full bg-[#b8ff3d] shadow-[0_0_12px_#b8ff3d]" />
          </div>
          <div className="relative space-y-2">
            {steps.map((step, index) => (
              <div key={index} className="group flex items-center gap-4 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-[#16a34a]/20 hover:bg-[#b8ff3d]/5 sm:px-4 sm:py-3.5">
                <span className="brand-number w-8 shrink-0">{String(index + 1).padStart(2, '0')}</span>
                <span className="h-px w-5 bg-[#b8ff3d]/25 transition-all group-hover:w-8 group-hover:bg-[#b8ff3d]" />
                <span className="text-sm font-bold text-[#334155] transition-colors group-hover:text-[#15803d]">{step}</span>
              </div>
            ))}
          </div>
          <div className="relative mt-7 flex items-center justify-between border-t border-[#16a34a]/20 pt-5 text-[0.65rem] font-black uppercase tracking-[0.17em] text-[#64748b]">
            <span>Start anywhere</span><span className="text-[#15803d]">Keep building →</span>
          </div>
        </div>
      </div>
    </section>
  );
};
