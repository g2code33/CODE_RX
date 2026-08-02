import { ArrowUpRight } from 'lucide-react';
import { WHAT_WE_DO } from '../data/mockData';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';

export const WhatWeDo = ({ tracks }: { tracks: typeof WHAT_WE_DO }) => {
  return (
    <section id="what-we-do" className="brand-section brand-section--alt py-28 sm:py-36">
      <PharmacyBackground layout="hero" />
      <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
        <div className="mb-14 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="brand-eyebrow mb-5">What we do</div>
            <h2 className="brand-title text-4xl sm:text-5xl lg:text-6xl">Six ways to move<br /><span className="brand-gradient-text">healthcare forward.</span></h2>
            <p className="brand-copy mt-6 max-w-2xl text-base">Choose a track, bring a problem, and leave with something that works. Every discipline connects back to pharmacy.</p>
          </div>
          <SectionLink id="what-we-do" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tracks.map((item, index) => (
            <article key={index} className="brand-card brand-card-hover group relative overflow-hidden p-7 sm:p-8">
              <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#b8ff3d]/5 blur-3xl transition-all duration-500 group-hover:bg-[#b8ff3d]/12" />
              <div className="relative z-10 flex items-start justify-between">
                <div className="brand-icon"><item.icon className="h-6 w-6" /></div>
                <span className="brand-number">0{index + 1}</span>
              </div>
              <div className="relative z-10 mt-9 flex items-center justify-between gap-4">
                <h3 className="text-2xl font-black tracking-tight text-[#f2f8ed]">{item.title}</h3>
                <ArrowUpRight className="h-5 w-5 text-[#94a992] transition-colors group-hover:text-[#b8ff3d]" />
              </div>
              <ul className="relative z-10 mt-6 space-y-3 border-t border-[#b8ff3d]/12 pt-5">
                {item.items.map((sub, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-[#a9bda3]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#b8ff3d] shadow-[0_0_8px_#b8ff3d]" />
                    {sub}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
