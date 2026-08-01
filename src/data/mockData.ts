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

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'pharmatrack',
    category: 'Pharmacy Tech',
    title: 'PharmaTRACK',
    description: 'Pharmacy Learning & Progress Tracking for students.',
    problem: 'Students struggle to monitor academic performance and identify specific revision gaps.',
    solution: 'A comprehensive system to track subjects studied, monitor academic growth, and identify strengths and weaknesses.',
    technology: ['React', 'PostgreSQL', 'Chart.js'],
    team: ['Education Technology Group'],
    status: '🚧 Development',
    progress: 55,
  },
  {
    id: 'pharmaquiz',
    category: 'Pharmacy Tech',
    title: 'PharmaQUIZ',
    description: 'Live Pharmacy Quiz & Competition Platform.',
    problem: 'Classroom assessments lack engagement and real-time competitive dynamics.',
    solution: 'Live class quizzes with scoring, ranking, and admin-led verification for pharmaceutical sciences.',
    technology: ['Socket.io', 'Node.js', 'React'],
    team: ['Gamification Team'],
    status: '🚧 Development',
    progress: 70,
  },
  {
    id: 'curelink',
    category: 'Pharmacy Tech',
    title: 'Cure Link',
    description: 'Healthcare / Pharmacy Connection Platform.',
    problem: 'Inefficient communication channels between patients, healthcare providers, and pharmacies.',
    solution: 'A digital bridge connecting the healthcare ecosystem for seamless pharmaceutical care and information exchange.',
    technology: ['Mobile App', 'APIs', 'Health Informatics'],
    team: ['HealthTech Research Group'],
    status: '🧪 Research',
    progress: 25,
  },
  {
    id: 'tawomo',
    category: 'Software Engineering',
    title: 'TAWOMO',
    description: 'Community-driven digital technology initiative.',
    problem: 'Local communities lack tailored digital platforms for collaboration and local economic integration.',
    solution: 'A scalable community technology initiative focused on local digital transformation.',
    technology: ['Full Stack', 'Cloud Architecture'],
    team: ['Software Engineering Group'],
    status: '🚧 Development',
    progress: 40,
  },
  {
    id: 'pharmagame-ai',
    category: 'AI Lab',
    title: 'PharmaGAME AI',
    description: 'AI-powered gamified pharmacy learning experience.',
    problem: 'Traditional learning tools are static and do not adapt to individual student knowledge levels.',
    solution: 'Adaptive learning platform using AI for question generation, challenges, and knowledge analysis.',
    technology: ['Python', 'Machine Learning', 'GPT-4', 'React'],
    team: ['AI Lab', 'Education Experts'],
    status: '🧪 Research',
    progress: 35,
  },
  {
    id: 'pms',
    category: 'Pharmacy Tech',
    title: 'Pharmacy Management System',
    description: 'Modern pharmacy management platform with Ghana-focused integrations.',
    problem: 'Traditional pharmacy systems are often outdated, lacks local payment integration, and have poor user experiences.',
    solution: 'A cloud-based dashboard with drug inventory, stock management, barcode scanning, sales tracking, and Ghana-focused payment integration.',
    technology: ['React', 'Node.js', 'PostgreSQL', 'Paystack'],
    team: ['Code Rx Core Team'],
    status: '🚧 Development',
    progress: 45,
    github: 'https://github.com/coderx/pms',
  },
  {
    id: 'kick-live',
    category: 'Software Engineering',
    title: 'KICK LIVE / Rx Live',
    description: 'High-performance football live-score technology platform.',
    problem: 'Existing sports platforms are often cluttered and lack real-time synchronization optimized for low bandwidth.',
    solution: 'A streamlined live-score platform featuring automatic league tables, match events, and admin control for custom tournaments.',
    technology: ['PostgreSQL', 'Cloudflare D1', 'GraphQL', 'WebSockets'],
    team: ['Software Engineering Group'],
    status: '🚧 Development',
    progress: 75,
  },
  {
    id: 'ai-automaton',
    category: 'AI Lab',
    title: 'AI Automaton',
    description: 'Agentic AI system for automated healthcare workflows.',
    problem: 'Healthcare administrative tasks are manual, error-prone, and time-consuming.',
    solution: 'Building an intelligent agentic system capable of using AI, loop engineering, and graph engineering to automate clinical workflows.',
    technology: ['Python', 'OpenAI API', 'LangGraph', 'Docker'],
    team: ['Code Rx AI Lab'],
    status: '🧪 Research',
    progress: 30,
  },
  {
    id: 'decoder',
    category: 'Competitions',
    title: 'CODE Rx DECODER',
    description: 'The ultimate logical and cryptographic challenge for pharmacists.',
    problem: 'Pharmacists need to develop high-level logical and cryptographic thinking for secure healthcare data.',
    solution: 'A 4-stage competition: Decode encoded Society documents, Verify completeness, Review content, and Suggest Improvements.',
    technology: ['Cryptography', 'Logic', 'Web Security'],
    team: ['Security Experts', 'Legal Team'],
    status: '🟢 Active',
    progress: 100,
  }
];

export const PROJECTS = INITIAL_PROJECTS;

export const LEADERBOARD = [
  { rank: 1, member: 'Calcitonin', points: 980, avatar: '💊', level: 'Pharmacy Technologist' },
  { rank: 2, member: 'Oxytocin', points: 870, avatar: '🧪', level: 'Senior Developer' },
  { rank: 3, member: 'Dopamine', points: 820, avatar: '🧠', level: 'AI Specialist' },
  { rank: 4, member: 'Serotonin', points: 750, avatar: '✨', level: 'Innovator' },
  { rank: 5, member: 'Insulin', points: 690, avatar: '💉', level: 'Contributor' },
];

export const EVENTS = [
  {
    date: 'AUG 10',
    title: 'Python for Pharmacists',
    location: 'ONLINE',
    type: 'Workshop'
  },
  {
    date: 'AUG 17',
    title: 'AI in Pharmacy',
    location: 'UCC Hall',
    type: 'Seminar'
  },
  {
    date: 'AUG 25',
    title: 'CODE Rx DECODER',
    location: 'CHALLENGE PORTAL',
    type: 'Competition'
  }
];

export const LEADERSHIP = [
  { name: 'Dr. Tech Pharm', role: 'President', image: 'https://images.unsplash.com/photo-1559839734-2b71f1e3c77e?w=400&h=400&fit=crop' },
  { name: 'Sarah Script', role: 'Vice President', image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400&h=400&fit=crop' },
  { name: 'Alex Code', role: 'Technology Director', image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=400&fit=crop' },
  { name: 'Elena AI', role: 'AI & Data Lead', image: 'https://images.unsplash.com/photo-1527613426441-4da17471b66d?w=400&h=400&fit=crop' }
];
