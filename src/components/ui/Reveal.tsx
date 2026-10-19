import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/src/lib/utils';

interface RevealProps {
  children: React.ReactNode;
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
  className?: string;
}

export const Reveal: React.FC<RevealProps> = ({ children, direction = 'up', delay = 0, className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Safety timeout: if observer fails or doesn't trigger, show content anyway after 1s
    const fallback = setTimeout(() => setIsVisible(true), 1000);

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
          clearTimeout(fallback);
        }
      });
    }, { threshold: 0.1 });

    if (domRef.current) {
      observer.observe(domRef.current);
    }

    return () => {
      if (domRef.current) {
        observer.unobserve(domRef.current);
      }
      clearTimeout(fallback);
    };
  }, []);

  const getAnimationClass = () => {
    if (!isVisible) return 'opacity-0';
    switch (direction) {
      case 'left': return 'animate-slide-left';
      case 'right': return 'animate-slide-right';
      case 'down': return 'animate-slide-down';
      default: return 'animate-slide-up';
    }
  };

  return (
    <div 
      ref={domRef}
      className={cn('w-full', getAnimationClass(), className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};
