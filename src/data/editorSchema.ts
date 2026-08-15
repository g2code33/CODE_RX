import type { CSSProperties } from 'react';

/**
 * Content and visual settings used by the live website builder.  They are
 * deliberately JSON-only: no React components, Tailwind classes, or arbitrary
 * executable code are saved to D1.
 */
export type EditorBreakpoint = 'desktop' | 'tablet' | 'mobile';

export interface ElementStyle {
  color?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  padding?: string;
  margin?: string;
  gap?: string;
  width?: string;
  maxWidth?: string;
  minHeight?: string;
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: string;
  borderRadius?: string;
  boxShadow?: string;
  opacity?: string;
  display?: string;
  gridTemplateColumns?: string;
  alignItems?: string;
  justifyContent?: string;
  order?: string;
  objectFit?: string;
  objectPosition?: string;
  transform?: string;
  animation?: 'none' | 'float' | 'pulse';
  hidden?: boolean;
  /** Scoped declaration-only CSS for a power user. Selectors and at-rules are rejected. */
  customCss?: string;
}

export interface ElementDesign {
  desktop?: ElementStyle;
  tablet?: ElementStyle;
  mobile?: ElementStyle;
}

export interface SiteDesign {
  theme: {
    ink: string;
    deep: string;
    panel: string;
    panelStrong: string;
    line: string;
    lime: string;
    green: string;
    mint: string;
    text: string;
    textSecondary: string;
    fontFamily: string;
    cardRadius: string;
    buttonRadius: string;
  };
  elements: Record<string, ElementDesign>;
}

export interface MediaAsset {
  src: string;
  alt: string;
}

export interface TrackContent {
  id: string;
  title: string;
  items: string[];
  /** A safe icon identifier, resolved to a Lucide icon at render time. */
  icon: string;
}

export interface CoreValueContent {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface ExtrasContent {
  partnerships: string[];
  opportunities: Array<{
    id: string;
    title: string;
    organization: string;
    link?: string;
    icon: string;
  }>;
}

export const DEFAULT_SITE_COPY: Record<string, string> = {
  'nav.brand.before': 'CODE',
  'nav.brand.accent': 'Rx',
  'nav.brand.subtitle': 'Society',
  'nav.portal.enter': 'Member Portal',
  'nav.portal.exit': 'Exit Portal',
  'nav.home': 'Home',
  'nav.about': 'About',
  'nav.learn': 'Learn',
  'nav.projects': 'Projects',
  'nav.challenges': 'Challenges',
  'nav.community': 'Community',
  'nav.resources': 'Resources',
  'nav.terms': 'Terms',

  'hero.primaryCta': 'Join the Society',
  'hero.secondaryCta': 'Explore the network',
  'hero.membersLabel': 'Members',
  'hero.tracksValue': '06',
  'hero.tracksLabel': 'Tracks',
  'hero.curiosityValue': '24/7',
  'hero.curiosityLabel': 'Curiosity',
  'hero.systemLive': 'Live / brand_system',
  'hero.systemCode': 'CRX / 001',
  'hero.systemEstablished': 'Est. Ghana',
  'hero.systemSignal': 'Signal',
  'hero.buildLabel': 'Build signal',
  'hero.buildCopy': 'Pharmacy problems → digital solutions',
  'hero.safeTitle': 'Safe by design',
  'hero.safeCopy': 'Responsible tech for better care.',

  'values.eyebrow': 'The operating system',
  'values.title': 'One society.',
  'values.titleAccent': 'Four signals.',
  'news.eyebrow': 'Latest signal',
  'news.title': 'What’s moving',
  'news.titleAccent': 'the network.',

  'about.eyebrow': 'Who we are',
  'about.title': 'Pharmacy thinking.',
  'about.titleAccent': 'Builder energy.',
  'about.intro': 'Code Rx Society is a Doctor of Pharmacy-focused technology and innovation society. We give current and future pharmacy professionals the confidence to understand technology, build with it, and use it responsibly.',
  'about.techLabel': 'Technology',
  'about.careLabel': 'Care first',
  'about.statusLabel': 'Status',
  'about.statusValue': 'Bridging two worlds',
  'about.missionLabel': '01 / Mission',
  'about.visionLabel': '02 / Vision',
  'about.mottoLabel': 'Our motto',

  'tracks.eyebrow': 'What we do',
  'tracks.title': 'Six ways to move',
  'tracks.titleAccent': 'healthcare forward.',
  'tracks.description': 'Choose a track, bring a problem, and leave with something that works. Every discipline connects back to pharmacy.',

  'leadership.eyebrow': 'The people behind the signal',
  'leadership.title': 'Clinical minds.',
  'leadership.titleAccent': 'Technical hands.',
  'leadership.description': 'The people building a more useful, human, and responsible future for pharmacy.',

  'extras.eyebrow': 'Connect & grow',
  'extras.title': 'More ways to',
  'extras.titleAccent': 'plug in.',
  'extras.partnershipsLabel': 'Partnerships',
  'extras.partnershipsDescription': 'We collaborate with universities, pharmacy organizations, and technology teams to bridge the gap between care and code.',
  'extras.partnershipCta': 'Partner with us',
  'extras.opportunitiesLabel': 'Opportunities',

  'academy.eyebrow': 'Code Rx Academy',
  'academy.title': 'Learn the stack.',
  'academy.titleAccent': 'Build the bridge.',
  'academy.description': 'A structured path for pharmacy professionals who want to move from curiosity to shipping useful healthcare technology.',
  'academy.projectCta': 'See the project lab',
  'academy.pathLabel': 'Learning_path / 08 modules',
  'academy.startAnywhere': 'Start anywhere',
  'academy.keepBuilding': 'Keep building →',

  'projects.eyebrow': 'Project lab',
  'projects.title': 'Ideas into',
  'projects.titleAccent': 'working systems.',
  'projects.description': 'The central home for Code Rx initiatives — from pharmacy management to adaptive learning and AI.',
  'projects.openCase': 'Open case →',
  'projects.back': 'Back to lab',
  'projects.missionLabel': 'The mission',
  'projects.problemLabel': '01 / Problem',
  'projects.solutionLabel': '02 / Solution',
  'projects.technologyLabel': 'Technology',
  'projects.teamLabel': 'Team',
  'projects.linksLabel': 'Project / Links',
  'projects.repositoryLabel': 'Repository',
  'projects.demoLabel': 'Live demo',
  'projects.contribute': 'Want to help move this project forward? Join the society and contribute your perspective.',
  'projects.joinCta': 'Join this project',

  'challenges.eyebrow': 'Decoder challenge',
  'challenges.title': 'Can you decode',
  'challenges.titleAccent': "what others can't see?",
  'challenges.description': 'Push your limits in pharmacy-themed coding, cryptography, and problem-solving challenges.',
  'challenges.activeLabel': 'Active / CRX-DECODER',
  'challenges.participantsLabel': 'participants',
  'challenges.timeLabel': 'Time remaining',
  'challenges.prizeLabel': 'Prize',
  'challenges.rewardLabel': 'Reward',
  'challenges.cta': 'Enter challenge',

  'community.eyebrow': 'Community hub',
  'community.titleAccent': 'Find your people.',
  'community.cta': 'Join Telegram channel',

  'resources.eyebrow': 'The library',
  'resources.title': 'Tools for the',
  'resources.titleAccent': 'next prescription.',

  'terms.eyebrow': 'Legal / society terms',
  'terms.title': 'Terms',
  'terms.titleAccent': '&',
  'terms.titleAfter': 'Conditions',
  'terms.tagline': 'Coding the future of pharmacy',
  'terms.versionLabel': 'Version',
  'terms.effectiveDateLabel': 'Effective date',
  'terms.lastUpdatedLabel': 'Last updated',
  'terms.effectiveDate': '22/03/2026',
  'terms.acceptanceEyebrow': 'Official acceptance',
  'terms.acceptanceTitle': 'Build with care. Build with purpose.',
  'terms.acceptanceDescription': 'By registering for Code Rx Society membership, you acknowledge that you have read, understood, and agreed to these Terms & Conditions.',
  'terms.acceptanceMotto': "We don't just learn pharmacy. We build what moves it forward.",
  'terms.acceptanceCopyright': 'Code Rx Society © 2026 / Ghana',

  'join.eyebrow': 'Your next build starts here',
  'join.title': 'Ready to code',
  'join.titleAccent': 'the future?',
  'join.description': 'Join the CODE Rx Society and turn your pharmacy perspective into something the world can use.',
  'join.primaryCta': 'Join the society',
  'join.secondaryCta': 'Back to top',

  'footer.brand.location': 'Society / Ghana',
  'footer.description': 'Equipping pharmacists with the technological skills to innovate, build, and lead in the digital healthcare era.',
  'footer.newsletterLabel': 'Signal / Newsletter',
  'footer.newsletterDescription': 'Updates in pharmacy tech, projects, and community events.',
  'footer.emailPlaceholder': 'Your email',
  'footer.newsletterCta': 'Join',
  'footer.exploreLabel': 'Explore',
  'footer.explore.about': 'About us',
  'footer.explore.learn': 'Academy',
  'footer.explore.projects': 'Project lab',
  'footer.explore.challenges': 'Challenges',
  'footer.explore.community': 'Community',
  'footer.resourcesLabel': 'Resources',
  'footer.resources.docs': 'Documentation',
  'footer.resources.research': 'Research papers',
  'footer.resources.opensource': 'Open source',
  'footer.resources.terms': 'Terms & conditions',
  'footer.contactLabel': 'Contact',
  'footer.telegramCta': 'Join Telegram',
  'footer.copyright': '© 2026 Code Rx Society / Ghana',
  'footer.privacy': 'Privacy',
  'footer.codeOfConduct': 'Code of conduct',
  'footer.terms': 'Terms',
  'footer.contactModalTitle': 'Contact Code Rx',
  'footer.sendMessage': 'Send message',
  'footer.privacyTitle': 'Privacy policy',
  'footer.privacyBody1': 'We collect information you provide directly to process membership applications, communicate updates, and respond to enquiries.',
  'footer.privacyBody2': 'We seek to handle personal information responsibly and in accordance with applicable Ghanaian data-protection requirements.',
  'footer.privacyBody3': 'For data-related requests, contact',
  'footer.conductTitle': 'Code of conduct',
  'footer.conductIntro': 'Code Rx is a respectful, inclusive, and professional community focused on advancing pharmacy through technology.',
};

export const DEFAULT_SITE_LINKS: Record<string, string> = {
  'footer.telegram': 'https://t.me/+EdRpfR1GTGNjM2Q0',
  'footer.email': 'coderxsociety@gmail.com',
  'footer.phoneOne': '053 734 5524',
  'footer.phoneTwo': '050 773 0598',
  'footer.country': 'Ghana',
};

export const DEFAULT_MEDIA: Record<string, MediaAsset> = {
  'brand.logo': { src: '/CODE%20RX11.png', alt: 'Code Rx Society' },
  'brand.logoSmall': { src: '/CODE%20RX11.png', alt: 'Code Rx Society' },
  // Preserve logo.png for the Home page Hero exactly as requested.
  'hero.logo': { src: '/logo.png', alt: 'CODE Rx Society — Coding the Future of Pharmacy' },
  'about.logo': { src: '/CODE%20RX11.png', alt: 'Code Rx Society emblem' },
  'footer.logo': { src: '/CODE%20RX11.png', alt: 'Code Rx Society' },
};

export const DEFAULT_SITE_DESIGN: SiteDesign = {
  theme: {
    ink: '#ffffff',
    deep: '#f8fafc',
    panel: '#ffffff',
    panelStrong: '#f1f5f9',
    line: '#e2e8f0',
    lime: '#16a34a',
    green: '#15803d',
    mint: '#4ade80',
    text: '#0f172a',
    textSecondary: '#475569',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    cardRadius: '1.35rem',
    buttonRadius: '999px',
  },
  elements: {},
};

export const getCopy = (copy: Record<string, string> | undefined, key: string, fallback = ''): string =>
  copy?.[key] ?? DEFAULT_SITE_COPY[key] ?? fallback;

export const getLink = (links: Record<string, string> | undefined, key: string, fallback = ''): string =>
  links?.[key] ?? DEFAULT_SITE_LINKS[key] ?? fallback;

export const getMedia = (media: Record<string, MediaAsset> | undefined, key: string, fallback: MediaAsset): MediaAsset =>
  media?.[key] ?? DEFAULT_MEDIA[key] ?? fallback;

export const friendlyEditorLabel = (key: string) =>
  key
    .replace(/^copy\./, '')
    .replace(/^media\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');

/** Converts the safe set of typed editor properties into a React style object. */
export const styleToReact = (style?: ElementStyle): CSSProperties => {
  if (!style) return {};
  const { hidden, animation, customCss: _customCss, ...rest } = style;
  return {
    ...(rest as CSSProperties),
    ...(hidden ? { display: 'none' } : {}),
    ...(animation === 'float' ? { animation: 'brand-float 5s ease-in-out infinite' } : {}),
    ...(animation === 'pulse' ? { animation: 'brand-pulse 4s ease-in-out infinite' } : {}),
  };
};
