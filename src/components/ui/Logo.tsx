import React from 'react';
import { cn } from '@/src/lib/utils';

interface LogoProps {
  className?: string;
  size?: number;
  variant?: 'light' | 'dark' | 'color';
}

export const Logo: React.FC<LogoProps> = ({ className, size = 64, variant = 'color' }) => {
  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-2xl"
      >
        <defs>
          <linearGradient id="shield_grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="accent_grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <filter id="glow_filter">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Professional Shield Shape */}
        <path
          d="M50 5L12 22V48C12 68 28 86 50 95C72 86 88 68 88 48V22L50 5Z"
          fill="url(#shield_grad)"
          stroke="#334155"
          strokeWidth="1"
        />
        
        {/* Neon Accent Border */}
        <path
          d="M50 10L18 25V48C18 64 32 80 50 88C68 80 82 64 82 48V25L50 10Z"
          stroke={variant === 'color' ? 'url(#accent_grad)' : 'currentColor'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
          filter="url(#glow_filter)"
        />

        {/* Professional Monogram 'FC' */}
        <g transform="translate(28, 30) scale(0.45)">
          {/* Stylized F */}
          <path
            d="M10 10H85V28H32V48H75V66H32V95H10V10Z"
            fill="white"
            opacity="0.95"
          />
          {/* Stylized C with open gap */}
          <path
            d="M95 10H145V28H117V77H145V95H95V10Z"
            fill={variant === 'color' ? "#fbbf24" : "white"}
          />
          {/* Bottom highlight bar */}
          <rect x="10" y="105" width="135" height="12" rx="4" fill="url(#accent_grad)" />
        </g>

        {/* Dynamic Highlight */}
        <path
          d="M20 28L50 15L80 28"
          stroke="white"
          strokeWidth="0.5"
          opacity="0.2"
        />
      </svg>
    </div>
  );
};

export const ArenaIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <Logo size={size} className={className} variant="color" />
);
