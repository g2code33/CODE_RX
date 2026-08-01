// Pharmacy-themed floating background.
// Renders subtle, roaming pharmacy & lab glyphs (pills, syringes, capsules,
// bottles, flasks, droplets, cross) that drift gently behind the content of a
// brand-section. Pure decoration (aria-hidden, pointer-events none).
import type { CSSProperties, ComponentType } from 'react';
import {
  Atom,
  Bandage,
  Beaker,
  BriefcaseMedical,
  CirclePlus,
  Cross,
  Droplet,
  Droplets,
  FlaskConical,
  FlaskRound,
  HeartPulse,
  Microscope,
  Pill,
  PillBottle,
  ShieldPlus,
  Stethoscope,
  Syringe,
  Tablets,
  TestTube,
  TestTubeDiagonal,
  TestTubes,
} from 'lucide-react';

type IconType = ComponentType<{ className?: string; style?: CSSProperties }>;

interface Item {
  Icon: IconType;
  top: string;
  left: string;
  size: number;
  dur: number;
  delay: number;
  opacity: number;
  rotate?: number;
}

const LAYOUTS = {
  // Hero / general-purpose mix — the headline pharmacy "roaming" set.
  hero: [
    { Icon: Syringe, top: '16%', left: '3%', size: 42, dur: 26, delay: -3, opacity: 0.5, rotate: -24 },
    { Icon: PillBottle, top: '68%', left: '7%', size: 48, dur: 32, delay: -11, opacity: 0.42 },
    { Icon: Pill, top: '9%', left: '82%', size: 36, dur: 24, delay: -7, opacity: 0.5, rotate: 28 },
    { Icon: TestTubes, top: '60%', left: '88%', size: 42, dur: 30, delay: -2, opacity: 0.42 },
    { Icon: Cross, top: '37%', left: '93%', size: 28, dur: 22, delay: -14, opacity: 0.52 },
    { Icon: Droplet, top: '25%', left: '71%', size: 30, dur: 20, delay: -9, opacity: 0.55 },
    { Icon: FlaskConical, top: '78%', left: '38%', size: 36, dur: 34, delay: -5, opacity: 0.4, rotate: 12 },
    { Icon: HeartPulse, top: '8%', left: '54%', size: 28, dur: 28, delay: -16, opacity: 0.5 },
    { Icon: Bandage, top: '44%', left: '2%', size: 30, dur: 29, delay: -19, opacity: 0.4, rotate: 18 },
    { Icon: Atom, top: '82%', left: '86%', size: 34, dur: 36, delay: -8, opacity: 0.42 },
  ],
  // Lab / research mix (Academy, Projects, Resources).
  lab: [
    { Icon: TestTube, top: '14%', left: '6%', size: 36, dur: 25, delay: -4, opacity: 0.5, rotate: -20 },
    { Icon: FlaskRound, top: '70%', left: '90%', size: 40, dur: 31, delay: -12, opacity: 0.42 },
    { Icon: Beaker, top: '78%', left: '8%', size: 40, dur: 27, delay: -6, opacity: 0.45 },
    { Icon: TestTubeDiagonal, top: '24%', left: '88%', size: 34, dur: 23, delay: -15, opacity: 0.5, rotate: 24 },
    { Icon: Microscope, top: '52%', left: '92%', size: 36, dur: 33, delay: -3, opacity: 0.4 },
    { Icon: Droplets, top: '10%', left: '64%', size: 28, dur: 21, delay: -9, opacity: 0.55 },
    { Icon: Atom, top: '86%', left: '40%', size: 30, dur: 35, delay: -10, opacity: 0.4 },
    { Icon: Tablets, top: '40%', left: '3%', size: 30, dur: 28, delay: -18, opacity: 0.45 },
  ],
  // Clinic / care mix (Community, Competitions, Terms, Footer).
  clinic: [
    { Icon: Cross, top: '15%', left: '88%', size: 30, dur: 22, delay: -5, opacity: 0.5 },
    { Icon: Stethoscope, top: '74%', left: '7%', size: 44, dur: 30, delay: -10, opacity: 0.42 },
    { Icon: HeartPulse, top: '20%', left: '8%', size: 30, dur: 24, delay: -13, opacity: 0.5 },
    { Icon: ShieldPlus, top: '62%', left: '92%', size: 36, dur: 28, delay: -7, opacity: 0.45 },
    { Icon: CirclePlus, top: '84%', left: '34%', size: 28, dur: 26, delay: -16, opacity: 0.5 },
    { Icon: Pill, top: '42%', left: '4%', size: 32, dur: 25, delay: -9, opacity: 0.48, rotate: 30 },
    { Icon: Bandage, top: '8%', left: '46%', size: 28, dur: 29, delay: -2, opacity: 0.4 },
    { Icon: BriefcaseMedical, top: '80%', left: '72%', size: 34, dur: 31, delay: -12, opacity: 0.42 },
  ],
} satisfies Record<string, Item[]>;

export type PharmacyLayout = keyof typeof LAYOUTS;

export const PharmacyBackground = ({
  layout = 'hero',
  className = '',
}: {
  layout?: PharmacyLayout;
  className?: string;
}) => {
  const items = LAYOUTS[layout] ?? LAYOUTS.hero;
  return (
    <div aria-hidden="true" className={`pharmacy-bg ${className}`}>
      {items.map((item, index) => {
        const style = {
          top: item.top,
          left: item.left,
          width: item.size,
          height: item.size,
          '--bg-op': item.opacity,
          '--bg-dur': `${item.dur}s`,
          '--bg-delay': `${item.delay}s`,
          '--bg-rot': `${item.rotate ?? 0}deg`,
        } as CSSProperties;
        return <item.Icon key={index} className="pharmacy-bg-icon" style={style} />;
      })}
    </div>
  );
};

export default PharmacyBackground;
