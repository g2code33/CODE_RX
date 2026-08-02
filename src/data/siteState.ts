import { INITIAL_PROJECTS, WHAT_WE_DO, Project } from './mockData';
import {
  CoreValueContent,
  DEFAULT_MEDIA,
  DEFAULT_SITE_COPY,
  DEFAULT_SITE_DESIGN,
  DEFAULT_SITE_LINKS,
  ExtrasContent,
  MediaAsset,
  SiteDesign,
  TrackContent,
} from './editorSchema';

export interface CustomBlock {
  id: string;
  page: string;
  eyebrow: string;
  title: string;
  description: string;
  buttonLabel: string;
  buttonLink: string;
  image?: string;
}

export interface SiteContent {
  home: {
    heroTitle: string;
    heroSubtitle: string;
    heroTagline: string;
    heroDescription: string;
    communityCount: number;
    communityMembers: Array<{ id: number; image: string; name: string }>;
    latestNews: Array<{
      id: number;
      category: string;
      title: string;
      text: string;
    }>;
    coreValues: CoreValueContent[];
  };
  about: {
    mission: string;
    vision: string;
    motto: string;
    team: Array<{ name: string; role: string; image: string }>;
    tracks: TrackContent[];
  };
  learn: {
    steps: string[];
    benefits: string[];
  };
  projects: Project[];
  challenges: {
    active: {
      id: string;
      title: string;
      difficulty: string;
      participants: number;
      timeRemaining: string;
      prize: string;
      reward: string;
      problem: string;
    }
  };
  community: {
    hubTitle: string;
    description: string;
    telegramLink: string;
  };
  resources: {
    categories: Array<{
      name: string;
      items: string[];
    }>;
  };
  terms: {
    version: string;
    lastUpdated: string;
    sections: Array<{
      id: string;
      title: string;
      content: string;
    }>;
  };
  extras: ExtrasContent;
  /** Reusable visual sections added from the live builder. */
  customBlocks: CustomBlock[];
  /** Public copy which used to be hardcoded inside individual components. */
  copy: Record<string, string>;
  links: Record<string, string>;
  media: Record<string, MediaAsset>;
  design: SiteDesign;
}

const DEFAULT_TRACKS: TrackContent[] = WHAT_WE_DO.map((track, index) => ({
  id: `track-${index + 1}`,
  title: track.title,
  items: [...track.items],
  icon: ['terminal', 'stethoscope', 'cpu', 'database', 'shield', 'lightbulb'][index] || 'terminal',
}));

const DEFAULT_CORE_VALUES: CoreValueContent[] = [
  { id: 'pharmacy', title: 'Pharmacy', description: 'Improving pharmaceutical practice through technology.', icon: 'stethoscope' },
  { id: 'coding', title: 'Coding', description: 'Building programming and software-development skills.', icon: 'code' },
  { id: 'ai', title: 'AI & Digital Health', description: 'Exploring responsible AI and digital healthcare.', icon: 'cpu' },
  { id: 'innovation', title: 'Innovation', description: 'Turning pharmacy problems into technology solutions.', icon: 'lightbulb' },
];

const DEFAULT_EXTRAS: ExtrasContent = {
  partnerships: ['UCC Pharmacy', 'PharmaLink', 'TechHealth', 'MediCode'],
  opportunities: [
    { id: 'clinical-tech-internship', title: 'Clinical Tech Internship', organization: 'PharmaLink AI', icon: 'briefcase' },
    { id: 'innovation-scholarship', title: 'Tech Innovation Scholarship', organization: 'Code Rx Foundation', icon: 'graduation-cap' },
    { id: 'startup-grant', title: 'HealthTech Startup Grant', organization: 'Health Launchpad', icon: 'rocket' },
  ],
};

export const INITIAL_SITE_CONTENT: SiteContent = {
  home: {
    heroTitle: 'CODE Rx',
    heroSubtitle: 'SOCIETY',
    heroTagline: 'Coding the Future of Pharmacy',
    heroDescription: 'Where Pharmacy meets Technology, Innovation & Artificial Intelligence. Join the elite community of healthcare innovators.',
    communityCount: 500,
    communityMembers: [
      { id: 1, image: 'https://i.pravatar.cc/100?img=11', name: 'Member 1' },
      { id: 2, image: 'https://i.pravatar.cc/100?img=5', name: 'Member 2' },
      { id: 3, image: 'https://i.pravatar.cc/100?img=3', name: 'Member 3' },
      { id: 4, image: 'https://i.pravatar.cc/100?img=4', name: 'Member 4' },
    ],
    latestNews: [
      { id: 1, category: 'ANNOUNCEMENT', title: 'New Chapter Opening at UCC', text: 'We are excited to announce the expansion of Code Rx...' },
      { id: 2, category: 'EVENT', title: 'AI in Pharmacy Workshop', text: 'Join us for a deep dive into Large Language Models...' },
      { id: 3, category: 'RESEARCH', title: 'Medication Safety Algorithm Published', text: 'A new research paper by our Informatics team...' },
    ],
    coreValues: DEFAULT_CORE_VALUES,
  },
  about: {
    mission: 'To bridge Pharmacy and IT by equipping professionals with skills to create tech-driven solutions for healthcare.',
    vision: 'A future where pharmacists actively participate in designing and implementing technology that improves healthcare.',
    motto: 'CODING THE FUTURE OF PHARMACY',
    team: [
      { name: 'Dr. Tech Pharm', role: 'President', image: 'https://images.unsplash.com/photo-1559839734-2b71f1e3c77e?w=400&h=400&fit=crop' },
      { name: 'Sarah Script', role: 'Vice President', image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400&h=400&fit=crop' },
      { name: 'Alex Code', role: 'Technology Director', image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=400&fit=crop' },
      { name: 'Elena AI', role: 'AI & Data Lead', image: 'https://images.unsplash.com/photo-1527613426441-4da17471b66d?w=400&h=400&fit=crop' }
    ],
    tracks: DEFAULT_TRACKS
  },
  learn: {
    steps: [
      'Pharmacy Technology',
      'Programming Fundamentals',
      'Web Development',
      'Databases',
      'APIs',
      'AI & Machine Learning',
      'Health Informatics',
      'Pharmacy Projects'
    ],
    benefits: [
      'Earn practical, portfolio-ready skills',
      'Work on real pharmacy problems',
      'Learn with a community that gets both sides',
    ]
  },
  projects: INITIAL_PROJECTS,
  challenges: {
    active: {
      id: 'CRX-DECODER-001',
      title: 'Database Encryption Breach',
      difficulty: 'Advanced',
      participants: 37,
      timeRemaining: '04:21:18',
      prize: '₵ 5,000.00',
      reward: 'Elite Badge',
      problem: 'A critical database of drug formulas has been encrypted by a legacy system. Your task is to reverse-engineer the hashing algorithm and retrieve the salt keys before the system locks down.'
    }
  },
  community: {
    hubTitle: 'COMMUNITY HUB',
    description: 'Connect with over 500+ pharmacists and developers around the world on our official channel.',
    telegramLink: 'https://t.me/+EdRpfR1GTGNjM2Q0'
  },
  resources: {
    categories: [
      { name: 'Pharmacy', items: ['Documentation', 'Best Practices', 'Cheat Sheets', 'Video Tutorials'] },
      { name: 'Coding', items: ['Documentation', 'Best Practices', 'Cheat Sheets', 'Video Tutorials'] },
      { name: 'AI', items: ['Documentation', 'Best Practices', 'Cheat Sheets', 'Video Tutorials'] },
      { name: 'Research', items: ['Documentation', 'Best Practices', 'Cheat Sheets', 'Video Tutorials'] },
    ]
  },
  terms: {
    version: '1.0',
    lastUpdated: '22/03/2026',
    sections: [
      { id: '01', title: 'ABOUT CODE Rx SOCIETY', content: `Code Rx Society ("Code Rx", "the Society", "we", "our", or "us") is a Doctor of Pharmacy-focused technology and innovation society established to promote the integration of coding, information technology, artificial intelligence, digital health, data, and emerging technologies into pharmacy and healthcare.

The Society seeks to equip current and future pharmacy professionals with technological skills that can be applied to improve:

• Pharmacy practice
• Pharmaceutical care
• Patient safety
• Medication management
• Healthcare systems
• Pharmacy education
• Research
• Health information management
• Digital health
• Pharmaceutical innovation
• Healthcare entrepreneurship

Our Motto: "Coding the Future of Pharmacy."

Our vision is to help develop pharmacists who are not only knowledgeable in medicines and patient care, but are also capable of understanding, designing, evaluating, and responsibly using technology to solve healthcare problems.` },
      { id: '02', title: 'PURPOSE OF CODE Rx SOCIETY', content: `The Society exists to bridge the gap between Pharmacy and Information Technology.

Code Rx aims to:

1. Introduce pharmacy students and professionals to programming and software development.
2. Promote the use of technology in pharmacy practice.
3. Develop digital solutions for pharmacy and healthcare problems.
4. Encourage innovation and entrepreneurship among pharmacy students.
5. Promote responsible use of Artificial Intelligence in pharmacy and healthcare.
6. Encourage research involving technology, pharmacy, and healthcare.
7. Develop members' skills in coding, data analysis, databases, cybersecurity, software development, and other relevant technologies.
8. Create opportunities for members to collaborate on technology-based projects.
9. Organize coding sessions, workshops, seminars, hackathons, competitions, and technology-related events.
10. Encourage collaboration between pharmacy professionals, developers, researchers, healthcare professionals, and technology organizations.
11. Promote digital transformation within pharmacy and healthcare.
12. Encourage members to create solutions that address real-world healthcare challenges.` },
      { id: '03', title: 'MEMBERSHIP', content: `Code Rx Society is primarily established for individuals interested in the intersection of Pharmacy, Healthcare, Coding, and Information Technology.

Membership categories may include:

• PharmD students
• Pharmacy graduates
• Pharmacists
• Pharmacy educators and researchers
• Healthcare professionals
• Developers and software engineers
• Technology enthusiasts
• Researchers
• Innovators
• Other individuals approved by the Society

The Society may establish specific membership categories and eligibility requirements.` },
      { id: '04', title: 'MEMBERSHIP APPLICATION', content: `Applicants must provide accurate information when applying for membership.

Members must not:

• Use another person's identity.
• Provide deliberately false information.
• Impersonate another person.
• Create multiple accounts to circumvent Society restrictions.

Code Rx reserves the right to approve, reject, suspend, or terminate membership in accordance with these Terms and applicable Society policies.` },
      { id: '05', title: 'MEMBER RESPONSIBILITIES', content: `Members are expected to:

• Respect other members.
• Support a positive learning environment.
• Participate constructively.
• Respect different levels of technical and pharmacy knowledge.
• Share knowledge responsibly.
• Respect intellectual property.
• Protect confidential information.
• Follow applicable laws and regulations.
• Follow legitimate instructions from Society administrators.
• Use Society resources responsibly.

Code Rx is a learning community. Members are encouraged to ask questions, experiment, make mistakes, learn from one another, and improve continuously.` },
      { id: '06', title: 'CODE OF CONDUCT', content: `Code Rx expects professional and respectful behaviour.

Members must not use Society activities, platforms, or resources to:

• Bully or harass another person.
• Threaten or intimidate members.
• Sexually harass or exploit another person.
• Discriminate against members.
• Impersonate another person.
• Conduct scams or fraudulent activities.
• Deliberately spread harmful misinformation.
• Distribute illegal or malicious material.
• Spam members or Society platforms.
• Deliberately disrupt Society activities.
• Damage Society systems or resources.

Professional disagreement and constructive debate are permitted. Harassment, abuse, discrimination, and malicious conduct are not.` },
      { id: '07', title: 'PHARMACY AND HEALTHCARE RESPONSIBILITY', content: `Because Code Rx operates at the intersection of technology and pharmacy, members must recognize that technology used in healthcare can directly affect patients.

Members must therefore exercise particular caution when developing or discussing:

• Medication-related software
• Clinical decision-support systems
• Drug information systems
• Pharmacy management systems
• Patient management systems
• AI healthcare applications
• Medication calculators
• Diagnostic-support tools
• Patient databases
• Electronic health records
• Health information systems

Technology developed through Code Rx should be designed with patient safety, accuracy, privacy, security, ethics, and professional standards in mind.` },
      { id: '08', title: 'MEDICAL AND PHARMACEUTICAL INFORMATION', content: `Code Rx educational content, software, demonstrations, discussions, and projects must not automatically be treated as professional medical or pharmaceutical advice.

Members must not represent an experimental or educational technology project as an officially validated clinical system unless appropriate validation and authorization have been obtained.

Where a technology project could influence patient care, members should seek appropriate professional, ethical, regulatory, and technical review before real-world deployment.` },
      { id: '09', title: 'CODING AND SOFTWARE DEVELOPMENT', content: `Code Rx encourages members to learn and develop skills in:

• Programming
• Web development
• Mobile application development
• Database management
• Cloud technologies
• APIs
• Data analytics
• Artificial Intelligence
• Machine learning
• Automation
• Cybersecurity
• Health informatics
• Software engineering
• Other relevant technologies

Members are responsible for ensuring that their software is used lawfully and ethically.` },
      { id: '10', title: 'CYBERSECURITY AND RESPONSIBLE TECHNOLOGY USE', content: `Code Rx supports cybersecurity education and responsible security research.

Members must not use knowledge, tools, or code obtained through the Society to conduct unauthorized activities.

Without authorization, members must not:

• Access another person's account.
• Access another person's computer or server.
• Steal passwords or credentials.
• Bypass security controls.
• Deploy malware.
• Conduct phishing attacks.
• Conduct unauthorized penetration testing.
• Conduct denial-of-service attacks.
• Steal or expose private information.
• Destroy, modify, or exfiltrate data.
• Exploit vulnerabilities against systems without permission.

Cybersecurity exercises must be conducted only in authorized environments.` },
      { id: '11', title: 'ARTIFICIAL INTELLIGENCE', content: `Code Rx recognizes Artificial Intelligence as an important component of the future of pharmacy and healthcare.

Members may explore AI for:

• Pharmacy education
• Research
• Drug information
• Data analysis
• Software development
• Healthcare innovation
• Automation
• Digital health
• Pharmaceutical research

However, members must use AI responsibly.

AI must not be used to:

• Facilitate illegal activity.
• Generate malicious software for unauthorized attacks.
• Commit fraud.
• Impersonate individuals.
• Violate privacy.
• Plagiarize work.
• Produce deliberately misleading healthcare information.
• Circumvent academic or competition rules.

Members remain responsible for verifying AI-generated information, particularly where the information relates to medicines, patients, clinical practice, or healthcare.` },
      { id: '12', title: 'PATIENT DATA AND CONFIDENTIAL INFORMATION', content: `Because Code Rx operates within the healthcare environment, members may encounter sensitive information.

Members must not collect, access, disclose, publish, or distribute patient information without appropriate authorization and lawful basis.

Members must not place identifiable patient information into public coding repositories, AI systems, online forums, demonstrations, or other platforms without appropriate authorization and safeguards.

When developing educational or demonstration projects, members should use:

• Synthetic data
• De-identified data
• Test data

Where appropriate.` },
      { id: '13', title: 'PRIVACY AND PERSONAL DATA', content: `Code Rx may collect information necessary to operate the Society, manage membership, organize activities, communicate with members, and operate digital platforms.

Personal information may include:

• Name
• Contact information
• Membership information
• Academic information where necessary
• Account information
• Event participation
• Project participation

Code Rx will seek to handle personal information responsibly and in accordance with applicable Ghanaian data-protection requirements.

A separate Code Rx Privacy Policy may provide additional information regarding collection, use, storage, protection, retention, and rights relating to personal information.` },
      { id: '14', title: 'PROJECTS AND COLLABORATION', content: `Code Rx encourages members to collaborate on projects that improve pharmacy and healthcare.

Examples include:

• Pharmacy management systems
• Drug information platforms
• Medication reminder systems
• Digital health applications
• Pharmacy education tools
• Healthcare data systems
• AI-assisted pharmacy tools
• Inventory and stock-management systems
• Clinical decision-support concepts
• Research tools
• Automation systems

Before beginning a major project, participants should establish clear agreements concerning:

• Ownership
• Contributions
• Responsibilities
• Intellectual property
• Repository access
• Licensing
• Commercialization
• Revenue sharing
• Credits and attribution` },
      { id: '15', title: 'INTELLECTUAL PROPERTY', content: `Members generally retain ownership of original work they independently create unless a separate agreement provides otherwise.

Members must respect the intellectual property rights of:

• Individuals
• Code Rx Society
• Universities
• Employers
• Research institutions
• Companies
• Open-source projects
• Other organizations

Members must not present another person's code, research, design, software, presentation, or other intellectual work as their own.

Open-source software must be used in accordance with its applicable licence.` },
      { id: '16', title: 'CODE Rx PROJECTS', content: `Where a project is officially established, funded, commissioned, or owned by Code Rx Society, ownership and usage rights shall be determined by the relevant project agreement or Society policy.

The Society may establish separate agreements covering:

• Project ownership
• Software licensing
• Commercialization
• Publication
• Research
• Patents
• Revenue
• Sponsorship
• Contributors' rights` },
      { id: '17', title: 'EVENTS, HACKATHONS AND COMPETITIONS', content: `Code Rx may organize:

• Hackathons
• Coding competitions
• Pharmacy technology challenges
• Workshops
• Seminars
• Training sessions
• Research activities
• Project demonstrations
• Innovation challenges

Additional rules may apply to individual events.

Participants may be disqualified for:

• Cheating
• Plagiarism
• Unauthorized collaboration
• Manipulation of results
• Submission of stolen work
• Impersonation
• Violation of event-specific rules` },
      { id: '18', title: 'EDUCATIONAL CONTENT', content: `Code Rx may provide:

• Tutorials
• Coding exercises
• Pharmacy technology resources
• Presentations
• Research resources
• Software examples
• AI resources
• Digital health materials

Educational materials may contain errors or become outdated.

Members should independently verify important technical, pharmaceutical, clinical, legal, and regulatory information before relying on it.` },
      { id: '19', title: 'THIRD-PARTY SERVICES', content: `Code Rx may use or recommend third-party platforms, including:

• GitHub
• Cloud services
• AI platforms
• Communication platforms
• Hosting services
• Database services
• Payment providers
• Learning platforms

Such services are governed by their own terms and policies.

Code Rx is not responsible for changes, outages, security incidents, or policies of third-party services outside its reasonable control.` },
      { id: '20', title: 'COMMUNICATION CHANNELS', content: `Code Rx may communicate with members through:

• Email
• WhatsApp
• Telegram
• Discord
• Websites
• Mobile applications
• Social media
• Other official channels

Members must maintain respectful and professional communication.

Official communication channels may be moderated by authorized administrators.` },
      { id: '21', title: 'MEMBER CONTENT', content: `Members may submit:

• Code
• Software
• Research
• Articles
• Tutorials
• Designs
• Presentations
• Videos
• Ideas
• Projects
• Other educational or technology-related content

Members are responsible for ensuring that submitted content does not unlawfully violate another person's rights.

Submitting content to Code Rx does not automatically transfer ownership of the member's intellectual property to the Society.` },
      { id: '22', title: 'COMMERCIAL ACTIVITIES', content: `Code Rx may support technology entrepreneurship and the development of commercially viable pharmacy and healthcare solutions.

However, members must not use Society platforms for unauthorized:

• Fraud
• Scams
• Spam
• Illegal fundraising
• Unauthorized financial schemes
• Distribution of stolen software or content
• Malicious commercial activities

Legitimate business opportunities, sponsorships, partnerships, and commercialization projects may be permitted subject to Society approval and applicable agreements.` },
      { id: '23', title: 'FEES AND PAYMENTS', content: `Some Code Rx activities may be free while others may require payment.

Where applicable, Code Rx will communicate:

• Applicable fees
• Payment method
• Payment deadline
• What the fee covers
• Refund conditions

Members should not make payments to individuals or accounts that have not been officially authorized by Code Rx.` },
      { id: '24', title: 'DISCIPLINARY ACTION', content: `Where a member violates these Terms, Code Rx may take appropriate action, including:

1. Verbal or informal warning.
2. Written warning.
3. Removal of offending content.
4. Temporary restriction.
5. Suspension.
6. Removal from an event or project.
7. Termination of membership.
8. Permanent removal from the Society.
9. Referral to appropriate authorities where required.

The action taken may depend on the seriousness and circumstances of the violation.` },
      { id: '25', title: 'APPEALS', content: `Members may appeal disciplinary decisions through the Society's designated internal process.

The Society may establish an independent or designated committee to review serious disciplinary matters.` },
      { id: '26', title: 'DISCLAIMER', content: `Code Rx is an educational, professional-development, technology, and innovation society.

Unless expressly stated otherwise, participation in Code Rx does not constitute:

• Medical advice
• Pharmaceutical care
• Legal advice
• Financial advice
• Professional software certification
• A guarantee of employment
• A guarantee of income
• A guarantee of project success

Members remain responsible for verifying information before relying on it.` },
      { id: '27', title: 'LIMITATION OF LIABILITY', content: `To the extent permitted by applicable law, Code Rx Society and its organizers, officers, administrators, volunteers, and authorized representatives shall not be responsible for losses resulting from:

• Misuse of Society resources.
• Member-created software.
• Member actions.
• Third-party platforms.
• Internet failures.
• Loss of member-created work where no backup exists.
• Unauthorized use of member accounts.
• Circumstances outside the Society's reasonable control.

Nothing in these Terms is intended to exclude liability that cannot legally be excluded.` },
      { id: '28', title: 'CHANGES TO THE TERMS', content: `Code Rx may update these Terms when necessary.

Members may be notified of significant changes through official Society channels.

Continued participation after the effective date of revised Terms may constitute acceptance of the updated Terms, subject to applicable law.` },
      { id: '29', title: 'GOVERNING LAW', content: `These Terms shall be interpreted in accordance with the applicable laws of the Republic of Ghana, unless a separate written agreement provides otherwise.

Code Rx will seek to operate consistently with applicable requirements relating to:

• Pharmacy and healthcare
• Data protection
• Cybersecurity
• Electronic transactions
• Intellectual property
• Technology
• Research and ethics
• Other applicable laws and regulations` },
      { id: '30', title: 'SEVERABILITY', content: `If any provision of these Terms is determined to be invalid or unenforceable, the remaining provisions shall continue to apply to the extent permitted by law.` },
      { id: '31', title: 'OFFICIAL CONTACT', content: `CODE Rx SOCIETY
Coding the Future of Pharmacy 💊

Email: [Insert Official Email]
Website: [Insert Website]
Official Community: [Insert Link]
Location: Ghana` },
      { id: '32', title: 'ACCEPTANCE', content: `By registering for Code Rx Society membership, participating in Society activities, accessing an official Code Rx platform, or otherwise participating in the Society, a member acknowledges that they have read, understood, and agreed to these Terms & Conditions.

CODE Rx SOCIETY
Coding the Future of Pharmacy.

We don't just learn pharmacy.
We build the technology that moves it forward. 💊💻🚀

Version: 1.0
Effective Date: 22/03/2026
Last Updated: 22/03/2026` }
    ]
  },
  extras: DEFAULT_EXTRAS,
  customBlocks: [],
  copy: DEFAULT_SITE_COPY,
  links: DEFAULT_SITE_LINKS,
  media: DEFAULT_MEDIA,
  design: DEFAULT_SITE_DESIGN,
};

/**
 * Deep-merge externally loaded content (D1 database / localStorage) onto the
 * default site content.
 *
 * Payloads saved by older builds may be missing entire sections (e.g.
 * `projects`), and the UI dereferences those collections unconditionally
 * (`siteContent.projects.length`, `.map`, spreads). Running every external
 * payload through this normalizer guarantees every section exists and every
 * collection is a real array, so a partial payload can never crash the app.
 * Existing arrays — including intentionally emptied ones — are kept as-is.
 */
export const normalizeSiteContent = (raw: unknown): SiteContent => {
  const d = INITIAL_SITE_CONTENT;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;

  const r = raw as Record<string, unknown>;
  const asObj = (v: unknown): Record<string, any> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
  const asArr = <T>(v: unknown, fallback: T[]): T[] =>
    Array.isArray(v) ? (v as T[]) : fallback;

  const home = asObj(r.home);
  const about = asObj(r.about);
  const learn = asObj(r.learn);
  const challenges = asObj(r.challenges);
  const community = asObj(r.community);
  const resources = asObj(r.resources);
  const terms = asObj(r.terms);
  const extras = asObj(r.extras);
  const design = asObj(r.design);
  const designTheme = asObj(design.theme);
  const designElements = asObj(design.elements);
  const rawTracks = asArr<any>(about.tracks, d.about.tracks);

  return {
    home: {
      ...d.home,
      ...home,
      communityMembers: asArr(home.communityMembers, d.home.communityMembers),
      latestNews: asArr(home.latestNews, d.home.latestNews),
      coreValues: asArr(home.coreValues, d.home.coreValues),
    },
    about: {
      ...d.about,
      ...about,
      team: asArr(about.team, d.about.team),
      // Older payloads included a non-serializable React icon field. Repair it
      // to a stable icon name so a legacy save can never break the live canvas.
      tracks: rawTracks.map((track, index) => ({
        ...d.about.tracks[index % d.about.tracks.length],
        ...asObj(track),
        id: typeof asObj(track).id === 'string' ? asObj(track).id : `track-${index + 1}`,
        icon: typeof asObj(track).icon === 'string'
          ? asObj(track).icon
          : d.about.tracks[index % d.about.tracks.length].icon,
        items: asArr(asObj(track).items, d.about.tracks[index % d.about.tracks.length].items),
      })),
    },
    learn: {
      ...d.learn,
      ...learn,
      steps: asArr(learn.steps, d.learn.steps),
      benefits: asArr(learn.benefits, d.learn.benefits),
    },
    projects: asArr<any>(r.projects, d.projects).map((project) => ({
      ...project,
      github: typeof project?.github === 'string' ? project.github : '',
      demo: typeof project?.demo === 'string' ? project.demo : '',
      image: typeof project?.image === 'string' ? project.image : '',
    })),
    challenges: {
      ...d.challenges,
      ...challenges,
      active: { ...d.challenges.active, ...asObj(challenges.active) },
    },
    community: { ...d.community, ...community },
    resources: {
      ...d.resources,
      ...resources,
      categories: asArr(resources.categories, d.resources.categories),
    },
    terms: {
      ...d.terms,
      ...terms,
      sections: asArr(terms.sections, d.terms.sections),
    },
    extras: {
      ...d.extras,
      ...extras,
      partnerships: asArr(extras.partnerships, d.extras.partnerships),
      opportunities: asArr(extras.opportunities, d.extras.opportunities),
    },
    customBlocks: asArr(r.customBlocks, d.customBlocks),
    copy: { ...d.copy, ...asObj(r.copy) },
    links: { ...d.links, ...asObj(r.links) },
    media: { ...d.media, ...asObj(r.media) },
    design: {
      theme: { ...d.design.theme, ...designTheme },
      elements: { ...d.design.elements, ...designElements },
    },
  };
};
