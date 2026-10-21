import React from 'react';
import { cn } from '@/src/lib/utils';

interface LogoProps {
  className?: string;
  size?: number;
  variant?: 'light' | 'dark' | 'color';
}

export const Logo: React.FC<LogoProps> = ({ className, size = 64 }) => {
  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <img 
        src="/assets/aistudio/20261021_140921_56efc859.png" 
        alt="FC Arena VS" 
        className="w-full h-full object-contain drop-shadow-xl animate-in fade-in zoom-in duration-500"
      />
    </div>
  );
};

export const ArenaIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <Logo size={size} className={className} variant="color" />
);
