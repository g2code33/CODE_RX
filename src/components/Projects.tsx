import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Code2, ArrowLeft, Globe, Users, Trophy, ArrowRight } from 'lucide-react';
import { Project } from '../data/mockData';

export const Projects = ({ projects }: { projects: Project[] }) => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  return (
    <section id="projects" className="py-32 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {!selectedProject ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="text-center mb-16">
                <h2 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">Project Lab</h2>
                <p className="text-slate-500 max-w-2xl mx-auto font-medium text-lg">
                  The central home for all Code Rx initiatives. From pharmacy management to advanced agentic AI.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projects.map((project) => (
                  <motion.div 
                    key={project.id} 
                    whileHover={{ y: -10 }}
                    onClick={() => setSelectedProject(project)}
                    className="flex flex-col bg-white border border-emerald-100 rounded-3xl overflow-hidden hover:shadow-2xl hover:shadow-emerald-100 transition-all group cursor-pointer"
                  >
                    <div className="h-56 bg-gradient-to-br from-emerald-500 to-teal-600 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-20 group-hover:scale-110 transition-transform duration-500">
                         {project.category === 'AI Lab' && <Code2 className="w-32 h-32 text-white" />}
                         {project.category === 'Competitions' && <Trophy className="w-32 h-32 text-white" />}
                         {project.category === 'Pharmacy Tech' && <Globe className="w-32 h-32 text-white" />}
                      </div>
                      <div className="absolute top-6 left-6">
                        <span className="px-4 py-1.5 bg-white/90 backdrop-blur-sm text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg">
                          {project.category}
                        </span>
                      </div>
                      <div className="absolute bottom-6 left-6">
                        <span className="px-3 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-bold text-slate-800 shadow-sm">
                          {project.status}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-8 flex flex-col flex-grow">
                      <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">{project.title}</h3>
                      <p className="text-slate-500 mb-6 text-sm flex-grow leading-relaxed font-medium">{project.description}</p>
                      
                      <div className="flex flex-wrap gap-2 mb-8">
                        {project.technology.slice(0, 3).map((tech, i) => (
                          <span key={i} className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-bold uppercase">
                            {tech}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-6 border-t border-emerald-50">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">View Details</span>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <button 
                onClick={() => setSelectedProject(null)}
                className="flex items-center gap-2 text-slate-500 hover:text-emerald-600 font-bold mb-12 transition-colors uppercase text-sm tracking-wide"
              >
                <ArrowLeft className="w-5 h-5" /> Back to Lab
              </button>

              <div className="grid lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-12">
                  <header>
                    <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-widest mb-6 inline-block">
                      {selectedProject.category}
                    </span>
                    <h1 className="text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">{selectedProject.title}</h1>
                    <div className="flex items-center gap-4">
                       <span className="font-bold text-emerald-600">{selectedProject.status}</span>
                       <div className="w-1 h-1 rounded-full bg-slate-300" />
                       <span className="text-slate-400 font-mono">Progress: {selectedProject.progress}%</span>
                    </div>
                    <div className="mt-4 w-full h-3 bg-emerald-100 rounded-full overflow-hidden">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${selectedProject.progress}%` }}
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg" 
                       />
                    </div>
                  </header>

                  <section className="bg-emerald-50 p-10 rounded-3xl border border-emerald-100">
                    <h3 className="text-2xl font-black text-slate-900 mb-6 tracking-tight">The Mission</h3>
                    <div className="space-y-8">
                       <div>
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">Problem</p>
                          <p className="text-slate-600 font-medium leading-relaxed">{selectedProject.problem}</p>
                       </div>
                       <div>
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">Solution</p>
                          <p className="text-slate-600 font-medium leading-relaxed">{selectedProject.solution}</p>
                       </div>
                    </div>
                  </section>

                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="p-8 bg-white border border-emerald-100 rounded-2xl shadow-sm">
                       <h4 className="text-lg font-black text-slate-900 mb-4 tracking-tight flex items-center gap-2">
                          <Code2 className="w-5 h-5 text-emerald-500" /> Technology
                       </h4>
                       <div className="flex flex-wrap gap-2">
                          {selectedProject.technology.map((tech, i) => (
                            <span key={i} className="px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold">{tech}</span>
                          ))}
                       </div>
                    </div>
                    <div className="p-8 bg-white border border-emerald-100 rounded-2xl shadow-sm">
                       <h4 className="text-lg font-black text-slate-900 mb-4 tracking-tight flex items-center gap-2">
                          <Users className="w-5 h-5 text-emerald-500" /> Team
                       </h4>
                       <div className="flex flex-wrap gap-2">
                          {selectedProject.team.map((member, i) => (
                            <span key={i} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">{member}</span>
                          ))}
                       </div>
                    </div>
                  </div>
                </div>

                <aside className="space-y-6">
                   <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 rounded-3xl text-white shadow-xl shadow-emerald-200">
                      <h4 className="text-xl font-black mb-6 tracking-tight">Project Resources</h4>
                      <div className="space-y-4">
                         <button 
                          className="flex items-center justify-between w-full p-4 bg-white/20 rounded-xl transition-all hover:bg-white/30"
                         >
                            <span className="font-bold flex items-center gap-3">
                               <Code2 className="w-5 h-5" /> Repository
                            </span>
                            <ExternalLink className="w-4 h-4" />
                         </button>
                         <button 
                          className="flex items-center justify-between w-full p-4 bg-white text-emerald-600 rounded-xl transition-all hover:bg-emerald-50"
                         >
                            <span className="font-bold flex items-center gap-3">
                               <Globe className="w-5 h-5" /> Live Demo
                            </span>
                            <ExternalLink className="w-4 h-4" />
                         </button>
                      </div>
                      
                      <div className="mt-12 text-center">
                         <p className="text-xs font-bold text-emerald-100 uppercase tracking-widest mb-4">Want to contribute?</p>
                         <button className="w-full py-4 border-2 border-white rounded-xl font-bold hover:bg-white hover:text-emerald-600 transition-all uppercase tracking-wide text-xs">
                            JOIN THIS PROJECT
                         </button>
                      </div>
                   </div>
                </aside>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
