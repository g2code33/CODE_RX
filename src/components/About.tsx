import { Binary, Eye, Quote, Target } from 'lucide-react';
import { CORE_VALUES } from '../data/mockData';
import { SectionLink } from './SectionLink';

export const ValueCards = () => {
  return (
    <section id="values" className="brand-section brand-section--alt py-24 sm:py-28">
      <div className="brand-glow right-[-15rem] top-[-12rem] opacity-40" />
      <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
        <div className="mb-12 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="brand-eyebrow mb-5">The operating system</div>
            <h2 className="brand-title max-w-2xl text-4xl sm:text-5xl lg:text-6xl">One society.<br /><span className="brand-gradient-text">Four signals.</span></h2>
          </div>
          <SectionLink id="values" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CORE_VALUES.map((value, index) => (
            <article key={index} className="brand-card brand-card-hover group p-6 sm:p-7">
              <div className="flex items-start justify-between">
                <div className="brand-icon"><value.icon className="h-6 w-6" /></div>
                <span className="brand-number">0{index + 1}</span>
              </div>
              <h3 className="mt-9 text-xl font-black tracking-tight text-[#f2f8ed]">{value.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#8da18e]">{value.description}</p>
              <div className="mt-7 h-px w-12 bg-[#b8ff3d]/60 transition-all duration-300 group-hover:w-20 group-hover:bg-[#b8ff3d]" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export const About = ({ mission, vision, motto }: { mission: string; vision: string; motto: string }) => {
  return (
    <section id="about" className="brand-section brand-grid brand-grid-fine py-28 sm:py-36">
      <div className="brand-glow -left-56 top-40 opacity-50" />
      <div className="relative z-10 mx-auto grid max-w-[1440px] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
        <div className="relative mx-auto w-full max-w-[520px]">
          <div className="brand-card relative overflow-hidden p-5 sm:p-8">
            <div className="brand-grid-fine absolute inset-0 opacity-40" />
            <div className="relative flex aspect-square items-center justify-center rounded-2xl border border-[#b8ff3d]/20 bg-[#020604]/50">
              <div className="absolute inset-5 rounded-xl border border-dashed border-[#b8ff3d]/15" />
              <img src="/logo.png" alt="Code Rx Society emblem" className="brand-logo-glow relative h-[78%] w-[78%] object-contain" />
              <span className="absolute left-4 top-4 brand-number">RX / MISSION</span>
              <span className="absolute bottom-4 right-4 brand-number">GHA / 2026</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#b8ff3d]/15 bg-[#b8ff3d]/5 p-4">
                <Binary className="h-4 w-4 text-[#b8ff3d]" />
                <p className="mt-3 text-[0.62rem] font-black uppercase tracking-[0.15em] text-[#8da18e]">Technology</p>
              </div>
              <div className="rounded-xl border border-[#b8ff3d]/15 bg-[#b8ff3d]/5 p-4">
                <Eye className="h-4 w-4 text-[#b8ff3d]" />
                <p className="mt-3 text-[0.62rem] font-black uppercase tracking-[0.15em] text-[#8da18e]">Care first</p>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-6 -right-4 hidden rounded-xl border border-[#b8ff3d]/25 bg-[#0b1c10] px-5 py-4 shadow-2xl sm:block">
            <p className="brand-number">STATUS</p>
            <p className="mt-1 text-sm font-bold text-[#b8ff3d]">Bridging two worlds</p>
          </div>
        </div>

        <div>
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="brand-eyebrow">Who we are</div>
            <SectionLink id="about" />
          </div>
          <h2 className="brand-title text-4xl sm:text-5xl lg:text-6xl">Pharmacy thinking.<br /><span className="brand-gradient-text">Builder energy.</span></h2>
          <p className="brand-copy mt-7 max-w-2xl text-base sm:text-lg">
            Code Rx Society is a Doctor of Pharmacy-focused technology and innovation society. We give current and future pharmacy professionals the confidence to understand technology, build with it, and use it responsibly.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="brand-card p-6">
              <div className="mb-5 flex items-center gap-3 text-[#b8ff3d]"><Target className="h-5 w-5" /><span className="brand-number">01 / MISSION</span></div>
              <p className="text-sm leading-7 text-[#8da18e]">{mission}</p>
            </div>
            <div className="brand-card p-6">
              <div className="mb-5 flex items-center gap-3 text-[#b8ff3d]"><Eye className="h-5 w-5" /><span className="brand-number">02 / VISION</span></div>
              <p className="text-sm leading-7 text-[#8da18e]">{vision}</p>
            </div>
          </div>

          <div className="mt-8 flex items-start gap-4 border-l-2 border-[#b8ff3d] pl-5">
            <Quote className="mt-1 h-5 w-5 shrink-0 text-[#b8ff3d]" />
            <div>
              <p className="text-[0.62rem] font-black uppercase tracking-[0.2em] text-[#718675]">Our motto</p>
              <p className="mt-2 text-lg font-black uppercase tracking-[0.04em] text-[#f2f8ed]">{motto}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
