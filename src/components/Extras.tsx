import { ArrowUpRight, Briefcase, GraduationCap, Handshake, Rocket } from 'lucide-react';
import { ExtrasContent, getCopy } from '../data/editorSchema';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';
import { EditableRegion, EditableText } from './VisualEditorContext';

const OPPORTUNITY_ICONS: Record<string, typeof Briefcase> = {
  briefcase: Briefcase,
  'graduation-cap': GraduationCap,
  rocket: Rocket,
};

export const Extras = ({ content, copy }: { content: ExtrasContent; copy?: Record<string, string> }) => {
  return (
    <EditableRegion elementKey="extras.section" label="Partnerships and opportunities section" collection="extras">
      <section id="extras" className="brand-section brand-grid-fine py-24 sm:py-28">
        <PharmacyBackground layout="lab" />
        <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
          <div className="mb-12 flex items-end justify-between gap-4"><div><div className="brand-eyebrow"><EditableText elementKey="extras.eyebrow" copyKey="extras.eyebrow" label="Extras eyebrow">{getCopy(copy, 'extras.eyebrow', 'Connect & grow')}</EditableText></div><h2 className="brand-title mt-5 text-3xl sm:text-4xl"><EditableText elementKey="extras.title" copyKey="extras.title" label="Extras heading">{getCopy(copy, 'extras.title', 'More ways to')}</EditableText><br /><span className="brand-gradient-text"><EditableText elementKey="extras.title-accent" copyKey="extras.titleAccent" label="Extras heading accent">{getCopy(copy, 'extras.titleAccent', 'plug in.')}</EditableText></span></h2></div><SectionLink id="extras" /></div>
          <div className="grid gap-4 lg:grid-cols-2"><EditableRegion elementKey="extras.partnerships-card" label="Partnerships card" collection="partnerships" className="brand-card p-7 sm:p-9"><div className="flex items-center gap-3 text-[#15803d]"><Handshake className="h-5 w-5" /><span className="brand-number"><EditableText elementKey="extras.partnerships-label" copyKey="extras.partnershipsLabel" label="Partnerships label">{getCopy(copy, 'extras.partnershipsLabel', 'Partnerships')}</EditableText></span></div><p className="mt-6 max-w-xl text-sm leading-7 text-[#475569]"><EditableText elementKey="extras.partnerships-description" copyKey="extras.partnershipsDescription" label="Partnerships description">{getCopy(copy, 'extras.partnershipsDescription', '')}</EditableText></p><div className="mt-7 grid grid-cols-2 gap-2">{content.partnerships.map((partner, index) => <div key={`${partner}-${index}`} className="rounded-lg border border-[#16a34a]/20 bg-[#b8ff3d]/5 px-3 py-4 text-center text-[0.66rem] font-bold uppercase tracking-wide text-[#475569]"><EditableText elementKey={`extras.partner.${index}`} copyKey={`extras.partnerships.${index}`} label={`Partnership ${index + 1}`}>{partner}</EditableText></div>)}</div><button type="button" className="brand-button brand-button--ghost mt-7 w-full"><EditableText elementKey="extras.partnership-cta" copyKey="extras.partnershipCta" label="Partnership button">{getCopy(copy, 'extras.partnershipCta', 'Partner with us')}</EditableText><ArrowUpRight className="h-4 w-4" /></button></EditableRegion>
            <EditableRegion elementKey="extras.opportunities-card" label="Opportunities card" collection="opportunities" className="brand-card p-7 sm:p-9"><div className="flex items-center gap-3 text-[#15803d]"><Briefcase className="h-5 w-5" /><span className="brand-number"><EditableText elementKey="extras.opportunities-label" copyKey="extras.opportunitiesLabel" label="Opportunities label">{getCopy(copy, 'extras.opportunitiesLabel', 'Opportunities')}</EditableText></span></div><div className="mt-6 space-y-3">{content.opportunities.map((opportunity, index) => { const Icon = OPPORTUNITY_ICONS[opportunity.icon] || Briefcase; return <EditableRegion key={opportunity.id || index} elementKey={`extras.opportunity.${opportunity.id || index}`} label={`${opportunity.title} opportunity`} collection="opportunities" className="group flex items-center gap-4 rounded-xl border border-[#16a34a]/20 bg-[#b8ff3d]/5 p-4 transition-colors hover:border-[#b8ff3d]/40"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#16a34a]/20 text-[#15803d]"><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-bold text-[#0f172a]"><EditableText elementKey={`extras.opportunity.${opportunity.id || index}.title`} copyKey={`extras.opportunities.${index}.title`} label={`${opportunity.title} title`}>{opportunity.title}</EditableText></span><span className="mt-1 block text-[0.64rem] font-black uppercase tracking-[0.15em] text-[#64748b]"><EditableText elementKey={`extras.opportunity.${opportunity.id || index}.organization`} copyKey={`extras.opportunities.${index}.organization`} label={`${opportunity.title} organization`}>{opportunity.organization}</EditableText></span></span><ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-[#64748b] transition-colors group-hover:text-[#15803d]" /></EditableRegion>; })}</div></EditableRegion>
          </div>
        </div>
      </section>
    </EditableRegion>
  );
};
