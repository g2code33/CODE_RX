import { ArrowUpRight, Cpu, Database, Lightbulb, ShieldCheck, Stethoscope, Terminal } from 'lucide-react';
import { TrackContent, getCopy } from '../data/editorSchema';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';
import { EditableRegion, EditableText } from './VisualEditorContext';

const TRACK_ICONS: Record<string, typeof Terminal> = {
  terminal: Terminal,
  stethoscope: Stethoscope,
  cpu: Cpu,
  database: Database,
  shield: ShieldCheck,
  lightbulb: Lightbulb,
};

export const WhatWeDo = ({ tracks, copy }: { tracks: TrackContent[]; copy?: Record<string, string> }) => {
  return (
    <EditableRegion elementKey="tracks.section" label="What we do section" collection="tracks">
      <section id="what-we-do" className="brand-section brand-section--alt py-28 sm:py-36">
        <PharmacyBackground layout="hero" />
        <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
          <div className="mb-14 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div className="max-w-3xl"><div className="brand-eyebrow mb-5"><EditableText elementKey="tracks.eyebrow" copyKey="tracks.eyebrow" label="Tracks eyebrow">{getCopy(copy, 'tracks.eyebrow', 'What we do')}</EditableText></div><h2 className="brand-title text-4xl sm:text-5xl lg:text-6xl"><EditableText elementKey="tracks.title" copyKey="tracks.title" label="Tracks heading">{getCopy(copy, 'tracks.title', 'Six ways to move')}</EditableText><br /><span className="brand-gradient-text"><EditableText elementKey="tracks.title-accent" copyKey="tracks.titleAccent" label="Tracks heading accent">{getCopy(copy, 'tracks.titleAccent', 'healthcare forward.')}</EditableText></span></h2><p className="brand-copy mt-6 max-w-2xl text-base"><EditableText elementKey="tracks.description" copyKey="tracks.description" label="Tracks description">{getCopy(copy, 'tracks.description', '')}</EditableText></p></div><SectionLink id="what-we-do" /></div>
          <EditableRegion elementKey="tracks.grid" label="Track card grid" collection="tracks" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tracks.map((item, index) => {
              const Icon = TRACK_ICONS[item.icon] || Terminal;
              return <EditableRegion key={item.id || index} elementKey={`tracks.card.${item.id || index}`} label={`${item.title} track card`} collection="tracks" className="brand-card brand-card-hover group relative overflow-hidden p-7 sm:p-8"><div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#b8ff3d]/5 blur-3xl transition-all duration-500 group-hover:bg-[#b8ff3d]/12" /><div className="relative z-10 flex items-start justify-between"><div className="brand-icon"><Icon className="h-6 w-6" /></div><span className="brand-number">0{index + 1}</span></div><div className="relative z-10 mt-9 flex items-center justify-between gap-4"><h3 className="text-2xl font-black tracking-tight text-[#0f172a]"><EditableText elementKey={`tracks.card.${item.id || index}.title`} copyKey={`about.tracks.${index}.title`} label={`${item.title} title`}>{item.title}</EditableText></h3><ArrowUpRight className="h-5 w-5 text-[#64748b] transition-colors group-hover:text-[#15803d]" /></div><ul className="relative z-10 mt-6 space-y-3 border-t border-[#16a34a]/20 pt-5">{item.items.map((sub, subIndex) => <li key={`${item.id}-${subIndex}`} className="flex items-center gap-3 text-sm text-[#475569]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#b8ff3d] shadow-[0_0_8px_#b8ff3d]" /><EditableText elementKey={`tracks.card.${item.id || index}.item.${subIndex}`} copyKey={`about.tracks.${index}.items.${subIndex}`} label={`${item.title} item ${subIndex + 1}`}>{sub}</EditableText></li>)}</ul></EditableRegion>;
            })}
          </EditableRegion>
        </div>
      </section>
    </EditableRegion>
  );
};
