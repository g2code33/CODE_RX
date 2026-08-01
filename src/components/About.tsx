import { CORE_VALUES } from '../data/mockData';
import { SectionLink } from './SectionLink';

export const ValueCards = () => {
  return (
    <section id="values" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-end mb-10">
          <SectionLink id="values" />
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {CORE_VALUES.map((value, index) => (
            <div 
              key={index}
              className="p-8 rounded-3xl border border-emerald-100 bg-white hover:shadow-2xl hover:shadow-emerald-100 hover:-translate-y-2 transition-all duration-300"
            >
              <div className={`${value.bg} ${value.color} w-16 h-16 rounded-2xl flex items-center justify-center mb-6`}>
                <value.icon className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">{value.title}</h3>
              <p className="text-slate-600 leading-relaxed">{value.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const About = ({ mission, vision, motto }: { mission: string, vision: string, motto: string }) => {
  return (
    <section id="about" className="py-32 bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-16 items-center">
          <div className="lg:w-1/2 relative">
            <div className="absolute -top-10 -left-10 w-64 h-64 bg-emerald-200/50 blur-3xl rounded-full" />
            <div className="relative z-10 grid grid-cols-2 gap-4">
              <img 
                src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&h=800&fit=crop" 
                alt="Pharmacy" 
                className="rounded-3xl shadow-xl mt-8"
              />
              <img 
                src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&h=800&fit=crop" 
                alt="Coding" 
                className="rounded-3xl shadow-xl"
              />
            </div>
          </div>
          
          <div className="lg:w-1/2">
            <div className="mb-12">
              <span className="text-emerald-600 font-bold tracking-[0.2em] uppercase text-xs">Who We Are</span>
              <div className="flex items-center gap-4 mt-2 mb-6">
                <h2 className="text-5xl font-black text-slate-900 tracking-tight">Bridging Pharmacy & IT</h2>
                <SectionLink id="about" />
              </div>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed font-medium">
                Code Rx Society is a Doctor of Pharmacy-focused technology and innovation society. We empower current and future pharmacy professionals with the skills to create technology-driven solutions.
              </p>
            </div>

            <div className="space-y-8">
              <div className="flex gap-6">
                <div className="flex-shrink-0 w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-200">
                  <span className="font-black text-xl">M</span>
                </div>
                <div>
                  <h4 className="font-black text-xl text-slate-900 tracking-tight">Our Mission</h4>
                  <p className="text-slate-600 mt-1 font-medium">{mission}</p>
                </div>
              </div>
              <div className="flex gap-6">
                <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-400 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-200">
                  <span className="font-black text-xl">V</span>
                </div>
                <div>
                  <h4 className="font-black text-xl text-slate-900 tracking-tight">Our Vision</h4>
                  <p className="text-slate-600 mt-1 font-medium">{vision}</p>
                </div>
              </div>
            </div>

            <div className="mt-16 p-8 bg-white rounded-3xl border border-emerald-100 shadow-lg inline-block">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Our Motto</p>
              <p className="text-3xl font-black text-emerald-600 tracking-tight">"{motto}"</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
