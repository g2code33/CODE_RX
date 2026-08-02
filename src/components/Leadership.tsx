import { UsersRound } from 'lucide-react';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';

export const Leadership = ({ team }: { team: Array<{ name: string; role: string; image: string }> }) => {
  return (
    <section id="leadership" className="brand-section brand-section--alt py-28 sm:py-36">
      <PharmacyBackground layout="clinic" />
      <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
        <div className="mb-14 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="brand-eyebrow mb-5"><UsersRound className="h-3.5 w-3.5" /> The people behind the signal</div>
            <h2 className="brand-title text-4xl sm:text-5xl lg:text-6xl">Clinical minds.<br /><span className="brand-gradient-text">Technical hands.</span></h2>
            <p className="brand-copy mt-6 max-w-2xl text-base">The people building a more useful, human, and responsible future for pharmacy.</p>
          </div>
          <SectionLink id="leadership" />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {team.map((leader, index) => (
            <article key={index} className="group">
              <div className="brand-card relative aspect-square overflow-hidden rounded-2xl p-2 transition-colors duration-300 group-hover:border-[#b8ff3d]/50">
                <div className="absolute inset-2 z-10 rounded-xl border border-[#b8ff3d]/20" />
                <img src={leader.image} alt={leader.name} className="h-full w-full rounded-xl object-cover grayscale transition-all duration-500 group-hover:scale-105 group-hover:grayscale-0" />
                <div className="absolute inset-x-2 bottom-2 z-20 bg-gradient-to-t from-[#020604] to-transparent px-4 pb-4 pt-12"><span className="brand-number">0{index + 1} / TEAM</span></div>
              </div>
              <h3 className="mt-5 text-base font-black text-[#f2f8ed] sm:text-lg">{leader.name}</h3>
              <p className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#b8ff3d]">{leader.role}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
