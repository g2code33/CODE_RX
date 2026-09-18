import { 
  Code2, 
  Stethoscope, 
  Cpu, 
  Database, 
  ShieldCheck, 
  Lightbulb,
  Terminal
} from 'lucide-react';

export const NAV_LINKS = [
  { label: 'Home', id: 'home' },
  { label: 'About', id: 'about' },
  { label: 'Learn', id: 'learn' },
  { label: 'Projects', id: 'projects' },
  { label: 'Challenges', id: 'challenges' },
  { label: 'Community', id: 'community' },
  { label: 'Resources', id: 'resources' },
  { label: 'Terms', id: 'terms' },
];

// Every section on the site has its own direct URL (#section-id) that lands the
// user exactly on that section. `tab` is the parent page that must be rendered
// for the section to exist; if `tab === id` the section IS the page (scroll to
// top), otherwise the page renders first and then smooth-scrolls to the section.
export const SECTION_MAP: Record<string, { id: string; label: string; tab: string }> = {
  home:        { id: 'home',        label: 'Home',                 tab: 'home' },
  values:      { id: 'values',      label: 'Core Values',          tab: 'home' },
  news:        { id: 'news',        label: 'Latest News',          tab: 'home' },
  about:       { id: 'about',       label: 'About',                tab: 'about' },
  'what-we-do':{ id: 'what-we-do',  label: 'What We Do',           tab: 'about' },
  leadership:  { id: 'leadership',  label: 'Leadership',           tab: 'about' },
  extras:      { id: 'extras',      label: 'Partnerships & Opportunities', tab: 'about' },
  learn:       { id: 'learn',       label: 'Academy',              tab: 'learn' },
  projects:    { id: 'projects',    label: 'Projects',             tab: 'projects' },
  challenges:  { id: 'challenges',  label: 'Challenges',           tab: 'challenges' },
  community:   { id: 'community',   label: 'Community',            tab: 'community' },
  resources:   { id: 'resources',   label: 'Resources',            tab: 'resources' },
  terms:       { id: 'terms',       label: 'Terms',                tab: 'terms' },
  join:        { id: 'join',        label: 'Join Us',              tab: 'home' },
};

export const CORE_VALUES = [
  {
    title: 'Pharmacy',
    description: 'Improving pharmaceutical practice through technology.',
    icon: Stethoscope,
    color: 'text-blue-500',
    bg: 'bg-blue-50'
  },
  {
    title: 'Coding',
    description: 'Building programming and software-development skills.',
    icon: Code2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-50'
  },
  {
    title: 'AI & Digital Health',
    description: 'Exploring responsible AI and digital healthcare.',
    icon: Cpu,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100'
  },
  {
    title: 'Innovation',
    description: 'Turning pharmacy problems into technology solutions.',
    icon: Lightbulb,
    color: 'text-emerald-700',
    bg: 'bg-emerald-200'
  }
];

export const WHAT_WE_DO = [
  {
    title: 'Coding',
    items: ['Python', 'JavaScript', 'Web development', 'Mobile development', 'APIs', 'Databases'],
    icon: Terminal
  },
  {
    title: 'Pharmacy Technology',
    items: ['Pharmacy management systems', 'Drug information systems', 'Medication systems', 'Inventory systems', 'Digital pharmacy'],
    icon: Stethoscope
  },
  {
    title: 'AI',
    items: ['AI in pharmacy', 'Machine learning', 'AI-assisted research', 'Responsible AI'],
    icon: Cpu
  },
  {
    title: 'Data',
    items: ['Data analysis', 'Health informatics', 'Healthcare databases', 'Visualization'],
    icon: Database
  },
  {
    title: 'Cybersecurity',
    items: ['Healthcare security', 'Privacy', 'Secure software', 'Responsible cybersecurity'],
    icon: ShieldCheck
  },
  {
    title: 'Innovation',
    items: ['Startups', 'Hackathons', 'Research', 'Healthcare entrepreneurship'],
    icon: Lightbulb
  }
];

export interface Project {
  id: string;
  category: 'Pharmacy Tech' | 'AI Lab' | 'Software Engineering' | 'Competitions';
  title: string;
  description: string;
  problem: string;
  solution: string;
  technology: string[];
  team: string[];
  status: '🟢 Active' | '🚧 Development' | '🧪 Research' | '✅ Completed';
  progress: number;
  github?: string;
  demo?: string;
  image?: string;
}
