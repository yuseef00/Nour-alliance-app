import React, { useState } from 'react';
import { getReciterInitials, getReciterPortraitUrl } from '../services/reciterPortraits';

interface ReciterAvatarProps {
  name: string;
  reciterId?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  active?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<ReciterAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-9 h-9 text-[11px]',
  md: 'w-11 h-11 text-xs',
  lg: 'w-14 h-14 text-sm',
  xl: 'w-20 h-20 text-base',
};

export const ReciterAvatar: React.FC<ReciterAvatarProps> = ({
  name,
  reciterId,
  size = 'md',
  active = false,
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const src = getReciterPortraitUrl(name, reciterId);
  const initials = getReciterInitials(name);

  return (
    <span
      className={`relative rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center bg-[#0f6b4f]/15 text-[#0f6b4f] dark:text-[#c9a44c] font-bold border transition-all ${
        active
          ? 'border-[#c9a44c] ring-2 ring-[#c9a44c]/55'
          : 'border-[#c9a44c]/45 dark:border-[#c9a44c]/35'
      } ${SIZE_CLASSES[size]} ${className}`}
    >
      {!imgFailed ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover object-top"
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
};
