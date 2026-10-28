import React from 'react';
import { cn } from '@/src/lib/utils';

interface LogoProps {
  className?: string;
  size?: number;
  variant?: 'light' | 'dark' | 'color';
}

export const Logo: React.FC<LogoProps> = ({ className, size = 64 }) => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const iconSrc = `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}pwa-1024x1024.png?v=2`;

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-2xl", className)} style={{ width: size, height: size }}>
      <img 
        src={iconSrc} 
        alt="FC Arena VS" 
        className="w-full h-full object-cover drop-shadow-xl animate-in fade-in zoom-in duration-500"
      />
    </div>
  );
};

export const ArenaIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <Logo size={size} className={className} variant="color" />
);
