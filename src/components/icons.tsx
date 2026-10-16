import React from "react";

export type IconProps = {
  size?: number;
  className?: string;
};

type IconNode = React.ReactNode;

function Icon({ size = 20, className, children }: IconProps & { children: IconNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Activity(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </Icon>
  );
}

export function AlertTriangle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 9v5" />
      <path d="M12 18h.01" />
    </Icon>
  );
}

export function BarChart3(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20V9" />
      <path d="M12 20V4" />
      <path d="M20 20v-7" />
    </Icon>
  );
}

export function BookOpen(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A3 3 0 0 1 7 4h5v16H7a3 3 0 0 0-3 1.5Z" />
      <path d="M20 5.5A3 3 0 0 0 17 4h-5v16h5a3 3 0 0 1 3 1.5Z" />
    </Icon>
  );
}

export function CalendarDays(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </Icon>
  );
}

export function CheckCircle2(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16.5 9" />
    </Icon>
  );
}

export function Circle(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
    </Icon>
  );
}

export function Dumbbell(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9v6" />
      <path d="M7 7v10" />
      <path d="M17 7v10" />
      <path d="M20 9v6" />
      <path d="M7 12h10" />
    </Icon>
  );
}

export function Flame(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 22c4 0 7-3 7-7 0-3-2-5-4-7 .3 2-1 3-2 3-2 0-1-4-5-7 .5 5-3 6-3 11 0 4 3 7 7 7Z" fill="currentColor" fillOpacity="0.22" />
    </Icon>
  );
}

export function History(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v6h6" />
      <path d="M12 7v6l4 2" />
    </Icon>
  );
}

export function Home(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </Icon>
  );
}

export function LineChart(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 4-4 3 3 5-7" />
    </Icon>
  );
}

export function MoreHorizontal(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function Play(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5v14l11-7Z" fill="currentColor" fillOpacity="0.25" />
    </Icon>
  );
}

export function Plus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

export function Save(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3h12l2 2v16H5Z" />
      <path d="M8 3v6h8V3" />
      <path d="M8 21v-7h8v7" />
    </Icon>
  );
}

export function Search(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function Settings(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </Icon>
  );
}

export function Timer(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v5l3 2" />
      <path d="M9 2h6" />
    </Icon>
  );
}

export function Trash2(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 15h10l1-15" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icon>
  );
}

export function Weight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 7h10l2 14H5Z" fill="currentColor" fillOpacity="0.16" />
      <path d="M9 7a3 3 0 0 1 6 0" />
      <path d="M12 12v3" />
    </Icon>
  );
}

export function ChevronLeft(props: IconProps) {
  return <Icon {...props}><path d="m15 18-6-6 6-6" /></Icon>;
}

export function ChevronRight(props: IconProps) {
  return <Icon {...props}><path d="m9 18 6-6-6-6" /></Icon>;
}

export function ChevronDown(props: IconProps) {
  return <Icon {...props}><path d="m6 9 6 6 6-6" /></Icon>;
}

export function Check(props: IconProps) {
  return <Icon {...props}><path d="M20 6 9 17l-5-5" /></Icon>;
}

export function X(props: IconProps) {
  return <Icon {...props}><path d="M18 6 6 18M6 6l12 12" /></Icon>;
}

export function Info(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></Icon>;
}

export function Trophy(props: IconProps) {
  return <Icon {...props}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></Icon>;
}

export function Ruler(props: IconProps) {
  return <Icon {...props}><path d="M3 17 17 3l4 4L7 21l-4-4Z" /><path d="m7 13 2 2M10 10l2 2M13 7l2 2" /></Icon>;
}

export function Target(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Icon>;
}

export function Zap(props: IconProps) {
  return <Icon {...props}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></Icon>;
}

export function Clock(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
}

export function Minus(props: IconProps) {
  return <Icon {...props}><path d="M5 12h14" /></Icon>;
}

export function Shuffle(props: IconProps) {
  return <Icon {...props}><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></Icon>;
}

export function Footprints(props: IconProps) {
  return <Icon {...props}><path d="M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0Z" /><path d="M20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6C14.6 6 14 7.8 14 9.5c0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0Z" /></Icon>;
}

export function Sparkles(props: IconProps) {
  return <Icon {...props}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" /></Icon>;
}

export function Lock(props: IconProps) {
  return <Icon {...props}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>;
}
