import { Trophy, Timer, Users, Lock } from 'lucide-react';
import { SiteContent } from '../data/siteState';
import { SectionLink } from './SectionLink';

export const Competitions = ({ active }: { active: SiteContent['challenges']['active'] }) => {
  return (
    <section id="challenges" className="py-32 bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-50" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold uppercase tracking-widest mb-8 backdrop-blur-sm">
            <Trophy className="w-4 h-4" />
            <span>Decoder Challenge</span>
          </div>
          <h2 className="text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">Can you decode <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-emerald-400">what others can't see?</span></h2>
          <p className="text-emerald-100 max-w-2xl mx-auto font-medium text-lg">Push your limits in our pharmacy-themed coding and cryptography challenges.</p>
          <div className="mt-6 flex justify-center"><SectionLink id="challenges" light /></div>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-white/10 border border-white/20 rounded-[3rem] p-10 lg:p-16 shadow-2xl relative overflow-hidden group backdrop-blur-md">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
              <Lock className="w-64 h-64 text-emerald-300" />
            </div>

            <div className="relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-10 mb-16">
                <div>
                  <h3 className="text-4xl font-black text-white mb-4 tracking-tight">{active.id}</h3>
                  <div className="flex items-center gap-6">
                    <span className="px-4 py-1 bg-red-500/20 text-red-300 border border-red-400/30 rounded-full text-[10px] font-bold uppercase tracking-widest">{active.difficulty}</span>
                    <div className="flex items-center gap-2 text-emerald-200 text-[10px] font-bold uppercase tracking-widest">
                      <Users className="w-4 h-4" />
                      <span>{active.participants} Participants</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/10 border border-white/20 p-6 rounded-2xl shadow-xl backdrop-blur-sm">
                  <div className="flex items-center gap-3 text-yellow-400 mb-1">
                    <Timer className="w-6 h-6" />
                    <span className="font-black text-3xl font-mono tracking-tight">{active.timeRemaining}</span>
                  </div>
                  <p className="text-[10px] text-emerald-200 text-center font-bold uppercase tracking-widest mt-2">Time Remaining</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-16 items-center">
                <div className="space-y-8">
                  <p className="text-emerald-100 leading-relaxed font-medium">
                    {active.problem}
                  </p>
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-widest mb-2">Prize</p>
                      <p className="text-3xl font-black text-yellow-400 tracking-tight">{active.prize}</p>
                    </div>
                    <div className="w-px h-12 bg-white/20" />
                    <div>
                      <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-widest mb-2">Reward</p>
                      <p className="text-3xl font-black text-emerald-300 tracking-tight">{active.reward}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center">
                  <button className="w-full py-8 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-xl rounded-2xl shadow-xl shadow-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all uppercase tracking-tight">
                    ENTER <br/> CHALLENGE
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
