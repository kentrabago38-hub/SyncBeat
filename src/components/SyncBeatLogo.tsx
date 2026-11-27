import React from 'react';

interface SyncBeatLogoProps {
  className?: string;
}

export const SyncBeatLogo: React.FC<SyncBeatLogoProps> = ({ className = 'w-7 h-7' }) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="12" fill="#181B23" />
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="11.25" stroke="white" strokeOpacity="0.1" strokeWidth="1.5" />
      {/* Wireless sync arcs */}
      <path d="M15 13.5C20 9.5 28 9.5 33 13.5" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M18.5 17C21.8 14.5 26.2 14.5 29.5 17" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.85" />
      {/* Metronome body */}
      <path d="M16 37L21.5 20.5H26.5L32 37H16Z" stroke="#F4F5F7" strokeWidth="2.2" strokeLinejoin="round" />
      {/* Pendulum arm & weight */}
      <line x1="24" y1="34" x2="30.5" y2="21.5" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="30.5" cy="21.5" r="2.6" fill="#F59E0B" />
    </svg>
  );
};
