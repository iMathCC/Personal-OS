import type { ReactNode, SVGProps } from 'react';
import type { NavigationKey } from '@/lib/navigation';

export type IconName = NavigationKey | 'menu' | 'close' | 'arrow' | 'refresh' | 'shield' | 'clock';

const paths: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  goals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  projects: (
    <>
      <path d="M4 6h6l2 2h8v11H4z" />
      <path d="M4 10h16" />
    </>
  ),
  tasks: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  execution: (
    <>
      <path d="M4 19V5M4 19h16" />
      <path d="m7 15 4-5 3 3 5-6" />
    </>
  ),
  intelligence: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 9 9h-9z" />
      <path d="M12 12 5 18" />
    </>
  ),
  review: (
    <>
      <path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M8 3v4M16 3v4M3 9h18M8 13h3M8 17h6" />
    </>
  ),
  dailyReview: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  observations: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  studies: (
    <>
      <path d="M3 8.5 12 4l9 4.5-9 4.5z" />
      <path d="M7 11v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11" />
    </>
  ),
  career: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M9 7V5h6v2M3 12h18" />
    </>
  ),
  finance: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  health: (
    <>
      <path d="M12 20s-7-4.4-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.6 12 20 12 20Z" />
      <path d="M9.5 12h1.5l1-2 1.5 4 1-2h1" />
    </>
  ),
  training: (
    <>
      <path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10" />
    </>
  ),
  knowledge: (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M8 20a3 3 0 0 1 3-3h8" />
    </>
  ),
  time: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  imports: (
    <>
      <path d="M12 3v11M8 10l4 4 4-4" />
      <path d="M4 17v3h16v-3" />
    </>
  ),
  integration: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  strategy: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a5 5 0 0 0 0 18M12 8a4 4 0 1 0 0 8" />
      <path d="M12 3v6M12 15v6" />
    </>
  ),
  planning: (
    <>
      <path d="M4 5h16v15H4z" />
      <path d="M8 3v4M16 3v4M4 10h16M8 14h8M8 17h5" />
    </>
  ),
  cycles: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4h-4" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  capacity: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M7 7V5h10v2M7 12h4M7 16h7" />
    </>
  ),
  scenarios: (
    <>
      <path d="m5 19 5-10 4 5 5-9" />
      <path d="M5 4h14v15H5z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  performance: (
    <>
      <path d="M4 19V5M4 19h16" />
      <path d="m7 15 4-4 3 2 5-6" />
      <circle cx="19" cy="7" r="1.4" />
    </>
  ),
  performanceDomains: (
    <>
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="6" rx="1.5" />
      <rect x="14" y="14" width="7" height="6" rx="1.5" />
    </>
  ),
  performanceExecution: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m8 12 2.5 2.5L16 9" />
      <path d="M8 17h8" />
    </>
  ),
  performancePatterns: (
    <>
      <path d="M4 6c3 0 3 4 6 4s3-4 6-4 3 4 4 4" />
      <path d="M4 14c3 0 3 4 6 4s3-4 6-4 3 4 4 4" />
    </>
  ),
  performanceReviews: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 3v4M16 3v4M3 9h18M8 13h8M8 17h5" />
    </>
  ),
  adaptation: (
    <>
      <path d="M4 7h4M12 7h8M4 17h8M16 17h4" />
      <circle cx="10" cy="7" r="2" />
      <circle cx="14" cy="17" r="2" />
      <path d="M12 12v-1M12 13v1M8 12h8" />
    </>
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
