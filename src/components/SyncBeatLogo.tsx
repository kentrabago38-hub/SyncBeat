import React from 'react';

interface SyncBeatLogoProps {
  className?: string;
  variant?: 'mark' | 'icon';
}

const BRAND_LOGO_SRC = '/src/assets/images/syncbeat_brand_logo_1795790873281.jpg';
const APP_ICON_SRC = '/src/assets/images/syncbeat_app_icon_1795790871705.jpg';

export const SyncBeatLogo: React.FC<SyncBeatLogoProps> = ({
  className = 'w-8 h-8',
  variant = 'mark',
}) => {
  const src = variant === 'icon' ? APP_ICON_SRC : BRAND_LOGO_SRC;
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-xl border border-amber-500/25 bg-[#0A0B0E] shadow-[0_0_16px_rgba(245,158,11,0.16)] ${className}`}
    >
      <img
        src={src}
        alt="SyncBeat"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover select-none"
      />
    </span>
  );
};
