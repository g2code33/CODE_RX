import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Code2, ExternalLink, Globe, Layers3, Users, Trophy } from 'lucide-react';
import { Project } from '../data/mockData';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';

const ProjectMark = ({ category, large = false }: { category: Project['category']; large?: boolean }) => {
  const Icon = category === 'AI Lab' ? Code2 : category === 'Competitions' ? Trophy : category === 'Software Engineering' ? Layers3 : Globe;
  return <Icon className={large ? 'h-24 w-24 text-[#15803d]/25' : 'h-5 w-5 text-[#15803d]'} />;
};

export const Projects = ({ projects }: { projects: Project[] }) => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  return (
    <section id="projects" className="brand-section brand-grid-fine min-h-screen py-28 sm:py-36">
      <PharmacyBackground layout="lab" />
      <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
        <AnimatePresence mode="wait">
          {!selectedProject ? (
            <motion.div key="list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div className="mb-14 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
                <div>
                  <div className="brand-eyebrow mb-5">Project lab</div>
                  <h2 className="brand-title text-4xl sm:text-5xl lg:text-6xl">Ideas into<br /><span className="brand-gradient-text">working systems.</span></h2>
                  <p className="brand-copy mt-6 max-w-2xl text-base">The central home for Code Rx initiatives — from pharmacy management to adaptive learning and AI.</p>
                </div>
                <SectionLink id="projects" />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project, index) => (
                  <motion.button
                    key={project.id}
                    type="button"
                    whileHover={{ y: -6 }}
                    onClick={() => setSelectedProject(project)}
                    className="brand-card brand-card-hover group flex flex-col overflow-hidden text-left"
                  >
                    <div className="relative flex h-44 items-center justify-center overflow-hidden border-b border-[#16a34a]/20 bg-[#f8fafc]">
                      <div className="brand-grid-fine absolute inset-0 opacity-60" />
                      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(184,255,61,0.12),transparent_55%)]" />
                      <ProjectMark category={project.category} large />
                      <span className="absolute left-5 top-5 rounded-full border border-[#16a34a]/20 bg-[#b8ff3d]/8 px-3 py-1.5 text-[0.64rem] font-black uppercase tracking-[0.13em] text-[#15803d]">{project.category}</span>
                      <span className="absolute bottom-5 right-5 brand-number">0{index + 1}</span>
                    </div>
                    <div className="flex flex-grow flex-col p-6 sm:p-7">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-xl font-black tracking-tight text-[#0f172a]">{project.title}</h3>
                        <ArrowRight className="h-5 w-5 shrink-0 text-[#64748b] transition-all group-hover:translate-x-1 group-hover:text-[#15803d]" />
                      </div>
                      <p className="mt-3 flex-grow text-sm leading-7 text-[#475569]">{project.description}</p>
                      <div className="mt-6 flex flex-wrap gap-2">
                        {project.technology.slice(0, 3).map((tech, i) => <span key={i} className="rounded-md border border-[#16a34a]/20 bg-[#b8ff3d]/5 px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-wide text-[#475569]">{tech}</span>)}
                      </div>
                      <div className="mt-6 flex items-center justify-between border-t border-[#16a34a]/20 pt-4">
                        <span className="text-[0.64rem] font-black uppercase tracking-[0.16em] text-[#64748b]">{project.status}</span>
                        <span className="text-[0.65rem] font-black uppercase tracking-[0.15em] text-[#15803d]">Open case →</span>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="mx-auto max-w-6xl">
              <button type="button" onClick={() => setSelectedProject(null)} className="mb-10 flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#475569] transition-colors hover:text-[#15803d]"><ArrowLeft className="h-4 w-4" /> Back to lab</button>
              <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
                <div>
                  <div className="brand-eyebrow mb-5"><ProjectMark category={selectedProject.category} /> {selectedProject.category}</div>
                  <h1 className="brand-title text-5xl sm:text-6xl">{selectedProject.title}</h1>
                  <div className="mt-6 flex flex-wrap items-center gap-4 text-[0.68rem] font-bold uppercase tracking-[0.13em] text-[#475569]">
                    <span className="text-[#15803d]">{selectedProject.status}</span><span className="h-1 w-1 rounded-full bg-[#94a992]" /><span className="brand-mono">Progress: {selectedProject.progress}%</span>
                  </div>
                  <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[#b8ff3d]/10"><motion.div initial={{ width: 0 }} animate={{ width: `${selectedProject.progress}%` }} className="h-full rounded-full bg-[#b8ff3d] shadow-[0_0_14px_#b8ff3d]" /></div>

                  <div className="brand-card mt-12 p-7 sm:p-10">
                    <div className="brand-eyebrow mb-7">The mission</div>
                    <div className="grid gap-8 sm:grid-cols-2">
                      <div><p className="brand-number mb-2">01 / PROBLEM</p><p className="text-sm leading-7 text-[#475569]">{selectedProject.problem}</p></div>
                      <div><p className="brand-number mb-2">02 / SOLUTION</p><p className="text-sm leading-7 text-[#475569]">{selectedProject.solution}</p></div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="brand-card p-7"><h4 className="flex items-center gap-2 text-lg font-black text-[#0f172a]"><Code2 className="h-5 w-5 text-[#15803d]" /> Technology</h4><div className="mt-5 flex flex-wrap gap-2">{selectedProject.technology.map((tech, i) => <span key={i} className="rounded-lg border border-[#16a34a]/20 bg-[#b8ff3d]/5 px-3 py-1.5 text-xs font-bold text-[#475569]">{tech}</span>)}</div></div>
                    <div className="brand-card p-7"><h4 className="flex items-center gap-2 text-lg font-black text-[#0f172a]"><Users className="h-5 w-5 text-[#15803d]" /> Team</h4><div className="mt-5 flex flex-wrap gap-2">{selectedProject.team.map((member, i) => <span key={i} className="rounded-lg border border-[#16a34a]/20 bg-[#b8ff3d]/5 px-3 py-1.5 text-xs font-bold text-[#475569]">{member}</span>)}</div></div>
                  </div>
                </div>

                <aside className="brand-card h-fit p-6 sm:p-7">
                  <div className="mb-7 flex items-center justify-between"><span className="brand-number">PROJECT / LINKS</span><ExternalLink className="h-4 w-4 text-[#15803d]" /></div>
                  <div className="space-y-3">
                    <button type="button" className="flex w-full items-center justify-between rounded-xl border border-[#16a34a]/20 bg-[#b8ff3d]/5 p-4 text-sm font-bold text-[#334155] transition-colors hover:border-[#b8ff3d]/40 hover:text-[#15803d]"><span className="flex items-center gap-3"><Code2 className="h-4 w-4 text-[#15803d]" />Repository</span><ExternalLink className="h-4 w-4" /></button>
                    <button type="button" className="flex w-full items-center justify-between rounded-xl border border-[#16a34a]/20 bg-[#b8ff3d]/5 p-4 text-sm font-bold text-[#334155] transition-colors hover:border-[#b8ff3d]/40 hover:text-[#15803d]"><span className="flex items-center gap-3"><Globe className="h-4 w-4 text-[#15803d]" />Live demo</span><ExternalLink className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-10 border-t border-[#16a34a]/20 pt-7"><p className="text-xs leading-6 text-[#475569]">Want to help move this project forward? Join the society and contribute your perspective.</p><button type="button" className="brand-button mt-5 w-full">Join this project</button></div>
                </aside>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
