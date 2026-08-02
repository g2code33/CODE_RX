import { UsersRound } from 'lucide-react';
import { getCopy, getMedia, MediaAsset } from '../data/editorSchema';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';
import { EditableImage, EditableRegion, EditableText } from './VisualEditorContext';

export const Leadership = ({ team, copy, media }: { team: Array<{ name: string; role: string; image: string }>; copy?: Record<string, string>; media?: Record<string, MediaAsset> }) => {
  return (
    <EditableRegion elementKey="leadership.section" label="Leadership section" collection="team">
      <section id="leadership" className="brand-section brand-section--alt py-28 sm:py-36">
        <PharmacyBackground layout="clinic" />
        <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
          <div className="mb-14 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="brand-eyebrow mb-5"><UsersRound className="h-3.5 w-3.5" /><EditableText elementKey="leadership.eyebrow" copyKey="leadership.eyebrow" label="Leadership eyebrow">{getCopy(copy, 'leadership.eyebrow', 'The people behind the signal')}</EditableText></div><h2 className="brand-title text-4xl sm:text-5xl lg:text-6xl"><EditableText elementKey="leadership.title" copyKey="leadership.title" label="Leadership heading">{getCopy(copy, 'leadership.title', 'Clinical minds.')}</EditableText><br /><span className="brand-gradient-text"><EditableText elementKey="leadership.title-accent" copyKey="leadership.titleAccent" label="Leadership heading accent">{getCopy(copy, 'leadership.titleAccent', 'Technical hands.')}</EditableText></span></h2><p className="brand-copy mt-6 max-w-2xl text-base"><EditableText elementKey="leadership.description" copyKey="leadership.description" label="Leadership description">{getCopy(copy, 'leadership.description', '')}</EditableText></p></div><SectionLink id="leadership" /></div>
          <EditableRegion elementKey="leadership.grid" label="Leadership team grid" collection="team" className="grid grid-cols-2 gap-4 lg:grid-cols-4">{team.map((leader, index) => { const image = getMedia(media, `about.team.${index}.image`, { src: leader.image, alt: leader.name }); return <EditableRegion key={`${leader.name}-${index}`} elementKey={`leadership.member.${index}`} label={`${leader.name} team member`} collection="team" className="group"><div className="brand-card relative aspect-square overflow-hidden rounded-2xl p-2 transition-colors duration-300 group-hover:border-[#b8ff3d]/50"><div className="absolute inset-2 z-10 rounded-xl border border-[#16a34a]/20" /><EditableImage elementKey={`leadership.member.${index}.image`} mediaKey={`about.team.${index}.image`} label={`${leader.name} photo`} src={image.src} alt={image.alt || leader.name} className="h-full w-full rounded-xl object-cover grayscale transition-all duration-500 group-hover:scale-105 group-hover:grayscale-0" /><div className="absolute inset-x-2 bottom-2 z-20 bg-gradient-to-t from-[#020604] to-transparent px-4 pb-4 pt-12"><span className="brand-number">0{index + 1} / TEAM</span></div></div><h3 className="mt-5 text-base font-black text-[#0f172a] sm:text-lg"><EditableText elementKey={`leadership.member.${index}.name`} copyKey={`about.team.${index}.name`} label={`${leader.name} name`}>{leader.name}</EditableText></h3><p className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#15803d]"><EditableText elementKey={`leadership.member.${index}.role`} copyKey={`about.team.${index}.role`} label={`${leader.name} role`}>{leader.role}</EditableText></p></EditableRegion>; })}</EditableRegion>
        </div>
      </section>
    </EditableRegion>
  );
};
