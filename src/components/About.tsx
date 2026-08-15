import { Binary, Code2, Cpu, Eye, Lightbulb, Quote, Stethoscope, Target } from 'lucide-react';
import { CoreValueContent, getCopy, getMedia, MediaAsset } from '../data/editorSchema';
import { SiteContent } from '../data/siteState';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';
import { EditableImage, EditableRegion, EditableText } from './VisualEditorContext';

const VALUE_ICONS: Record<string, typeof Stethoscope> = {
  stethoscope: Stethoscope,
  code: Code2,
  cpu: Cpu,
  lightbulb: Lightbulb,
};

export const ValueCards = ({ values, copy }: { values: CoreValueContent[]; copy?: Record<string, string> }) => {
  return (
    <EditableRegion elementKey="values.section" label="Core values section" collection="coreValues">
      <section id="values" className="brand-section brand-section--alt py-24 sm:py-28">
        <PharmacyBackground layout="clinic" />
        <div className="brand-glow right-[-15rem] top-[-12rem] opacity-40" />
        <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
          <div className="mb-12 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="brand-eyebrow mb-5"><EditableText elementKey="values.eyebrow" copyKey="values.eyebrow" label="Core values eyebrow">{getCopy(copy, 'values.eyebrow', 'The operating system')}</EditableText></div><h2 className="brand-title max-w-2xl text-4xl sm:text-5xl lg:text-6xl"><EditableText elementKey="values.title" copyKey="values.title" label="Core values heading">{getCopy(copy, 'values.title', 'One society.')}</EditableText><br /><span className="brand-gradient-text"><EditableText elementKey="values.title-accent" copyKey="values.titleAccent" label="Core values heading accent">{getCopy(copy, 'values.titleAccent', 'Four signals.')}</EditableText></span></h2></div><SectionLink id="values" /></div>
          <EditableRegion elementKey="values.grid" label="Core values card grid" collection="coreValues" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value, index) => {
              const Icon = VALUE_ICONS[value.icon] || Lightbulb;
              return <EditableRegion key={value.id || index} elementKey={`values.card.${value.id || index}`} label={`${value.title} value card`} collection="coreValues" className="brand-card brand-card-hover group p-6 sm:p-7"><div className="flex items-start justify-between"><div className="brand-icon"><Icon className="h-6 w-6" /></div><span className="brand-number">0{index + 1}</span></div><h3 className="mt-9 text-xl font-black tracking-tight text-[#0f172a]"><EditableText elementKey={`values.card.${value.id || index}.title`} copyKey={`home.coreValues.${index}.title`} label={`${value.title} title`}>{value.title}</EditableText></h3><p className="mt-3 text-sm leading-7 text-[#475569]"><EditableText elementKey={`values.card.${value.id || index}.description`} copyKey={`home.coreValues.${index}.description`} label={`${value.title} description`}>{value.description}</EditableText></p><div className="mt-7 h-px w-12 bg-[#b8ff3d]/60 transition-all duration-300 group-hover:w-20 group-hover:bg-[#b8ff3d]" /></EditableRegion>;
            })}
          </EditableRegion>
        </div>
      </section>
    </EditableRegion>
  );
};

export const About = ({
  content,
  copy,
  media,
}: {
  content: SiteContent['about'];
  copy?: Record<string, string>;
  media?: Record<string, MediaAsset>;
}) => {
  const aboutLogo = getMedia(media, 'about.logo', { src: '/CODE%20RX11.png', alt: 'Code Rx Society emblem' });
  return (
    <EditableRegion elementKey="about.section" label="About section">
      <section id="about" className="brand-section brand-grid brand-grid-fine py-28 sm:py-36">
        <PharmacyBackground layout="lab" />
        <div className="brand-glow -left-56 top-40 opacity-50" />
        <div className="relative z-10 mx-auto grid max-w-[1440px] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
          <EditableRegion elementKey="about.visual" label="About visual panel" className="relative mx-auto w-full max-w-[520px]">
            <div className="brand-card relative overflow-hidden p-5 sm:p-8"><div className="brand-grid-fine absolute inset-0 opacity-40" /><div className="relative flex aspect-square items-center justify-center rounded-2xl border border-[#16a34a]/20 bg-[#ffffff]/50"><div className="absolute inset-5 rounded-xl border border-dashed border-[#16a34a]/20" /><EditableImage elementKey="about.logo" mediaKey="about.logo" label="About logo" src={aboutLogo.src} alt={aboutLogo.alt} className="brand-logo-glow relative h-[78%] w-[78%] object-contain" /><span className="absolute left-4 top-4 brand-number">RX / MISSION</span><span className="absolute bottom-4 right-4 brand-number">GHA / 2026</span></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-[#16a34a]/20 bg-[#b8ff3d]/5 p-4"><Binary className="h-4 w-4 text-[#15803d]" /><p className="mt-3 text-[0.66rem] font-black uppercase tracking-[0.15em] text-[#475569]"><EditableText elementKey="about.technology-label" copyKey="about.techLabel" label="About technology label">{getCopy(copy, 'about.techLabel', 'Technology')}</EditableText></p></div><div className="rounded-xl border border-[#16a34a]/20 bg-[#b8ff3d]/5 p-4"><Eye className="h-4 w-4 text-[#15803d]" /><p className="mt-3 text-[0.66rem] font-black uppercase tracking-[0.15em] text-[#475569]"><EditableText elementKey="about.care-label" copyKey="about.careLabel" label="About care label">{getCopy(copy, 'about.careLabel', 'Care first')}</EditableText></p></div></div></div>
            <div className="absolute -bottom-6 -right-4 hidden rounded-xl border border-[#16a34a]/20 bg-[#f1f5f9] px-5 py-4 shadow-2xl sm:block"><p className="brand-number"><EditableText elementKey="about.status-label" copyKey="about.statusLabel" label="About status label">{getCopy(copy, 'about.statusLabel', 'Status')}</EditableText></p><p className="mt-1 text-sm font-bold text-[#15803d]"><EditableText elementKey="about.status-value" copyKey="about.statusValue" label="About status text">{getCopy(copy, 'about.statusValue', 'Bridging two worlds')}</EditableText></p></div>
          </EditableRegion>
          <div><div className="mb-5 flex items-center justify-between gap-4"><div className="brand-eyebrow"><EditableText elementKey="about.eyebrow" copyKey="about.eyebrow" label="About eyebrow">{getCopy(copy, 'about.eyebrow', 'Who we are')}</EditableText></div><SectionLink id="about" /></div><h2 className="brand-title text-4xl sm:text-5xl lg:text-6xl"><EditableText elementKey="about.title" copyKey="about.title" label="About heading">{getCopy(copy, 'about.title', 'Pharmacy thinking.')}</EditableText><br /><span className="brand-gradient-text"><EditableText elementKey="about.title-accent" copyKey="about.titleAccent" label="About heading accent">{getCopy(copy, 'about.titleAccent', 'Builder energy.')}</EditableText></span></h2><p className="brand-copy mt-7 max-w-2xl text-base sm:text-lg"><EditableText elementKey="about.intro" copyKey="about.intro" label="About introduction">{getCopy(copy, 'about.intro', '')}</EditableText></p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2"><EditableRegion elementKey="about.mission-card" label="Mission card" className="brand-card p-6"><div className="mb-5 flex items-center gap-3 text-[#15803d]"><Target className="h-5 w-5" /><span className="brand-number"><EditableText elementKey="about.mission-label" copyKey="about.missionLabel" label="Mission label">{getCopy(copy, 'about.missionLabel', '01 / Mission')}</EditableText></span></div><p className="text-sm leading-7 text-[#475569]"><EditableText elementKey="about.mission" copyKey="about.mission" label="Mission">{content.mission}</EditableText></p></EditableRegion><EditableRegion elementKey="about.vision-card" label="Vision card" className="brand-card p-6"><div className="mb-5 flex items-center gap-3 text-[#15803d]"><Eye className="h-5 w-5" /><span className="brand-number"><EditableText elementKey="about.vision-label" copyKey="about.visionLabel" label="Vision label">{getCopy(copy, 'about.visionLabel', '02 / Vision')}</EditableText></span></div><p className="text-sm leading-7 text-[#475569]"><EditableText elementKey="about.vision" copyKey="about.vision" label="Vision">{content.vision}</EditableText></p></EditableRegion></div>
            <div className="mt-8 flex items-start gap-4 border-l-2 border-[#b8ff3d] pl-5"><Quote className="mt-1 h-5 w-5 shrink-0 text-[#15803d]" /><div><p className="text-[0.66rem] font-black uppercase tracking-[0.2em] text-[#64748b]"><EditableText elementKey="about.motto-label" copyKey="about.mottoLabel" label="Motto label">{getCopy(copy, 'about.mottoLabel', 'Our motto')}</EditableText></p><p className="mt-2 text-lg font-black uppercase tracking-[0.04em] text-[#0f172a]"><EditableText elementKey="about.motto" copyKey="about.motto" label="Motto">{content.motto}</EditableText></p></div></div>
          </div>
        </div>
      </section>
    </EditableRegion>
  );
};
