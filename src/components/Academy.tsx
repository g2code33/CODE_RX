import { BookOpen, CheckCircle2 } from 'lucide-react';
import { SectionLink } from './SectionLink';

export const Academy = ({ steps }: { steps: string[] }) => {
  return (
    <section id="learn" className="py-32 bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          <div>
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-bold uppercase tracking-widest mb-8">
              <BookOpen className="w-4 h-4" />
              <span>Code Rx Academy</span>
              <SectionLink id="learn" />
            </div>
            <h2 className="text-5xl font-black text-slate-900 mb-8 leading-none tracking-tight">Your Path to <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">Pharmacy Tech</span></h2>
            <p className="text-slate-600 text-lg mb-10 font-medium leading-relaxed">
              A structured curriculum designed specifically for pharmacists who want to transition into technology and building healthcare solutions.
            </p>
            
            <div className="space-y-5">
              {[
                'Earn Industry-Recognized Certificates', 
                'Work on Real-World Pharmacy Projects', 
                'Join Elite Mentorship Programs'
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  <span className="font-bold text-slate-700">{item}</span>
                </div>
              ))}
            </div>

            <button className="mt-12 px-10 py-5 bg-emerald-500 text-white font-bold rounded-full hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-200 uppercase tracking-wide text-sm">
              START LEARNING
            </button>
          </div>

          <div className="relative">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-emerald-200/30 blur-[120px] rounded-full" />
             <div className="relative z-10 flex flex-col gap-4">
                {steps.map((step, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-5 bg-white border border-emerald-100 p-5 rounded-2xl hover:shadow-xl hover:shadow-emerald-100 transition-all group cursor-default"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-lg shadow-emerald-200">
                      {(index + 1).toString().padStart(2, '0')}
                    </div>
                    <span className="text-lg font-bold text-slate-700 group-hover:text-emerald-600 transition-colors">{step}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </section>
  );
};
