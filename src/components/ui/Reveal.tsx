import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/src/lib/utils';

interface RevealProps {
  children: React.ReactNode;
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
  className?: string;
}

export const Reveal: React.FC<RevealProps> = ({ children, direction = 'left', delay = 0, className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const getAnimationClass = () => {
    if (!isVisible) return '';
    switch (direction) {
      case 'left': return 'animate-slide-left';
      case 'right': return 'animate-slide-right';
      case 'up': return 'animate-slide-up';
      case 'down': return 'animate-slide-down';
      default: return 'animate-slide-left';
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'opacity-0',
        getAnimationClass(),
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};
