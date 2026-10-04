import React from 'react';
import { cn } from '@/src/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'nm-flat text-slate-800 active:nm-pressed font-black uppercase tracking-widest',
      secondary: 'nm-inset text-slate-600 active:nm-pressed font-bold',
      outline: 'nm-flat border border-white/50 text-slate-600 active:nm-pressed',
      ghost: 'bg-transparent text-slate-500 hover:nm-flat active:nm-pressed',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-[10px]',
      md: 'px-6 py-3 text-xs',
      lg: 'px-8 py-4 text-sm',
      icon: 'p-2 w-12 h-12 flex items-center justify-center',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'rounded-2xl transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 border-2 border-transparent',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <input
          ref={ref}
          className={cn(
            'w-full h-14 px-6 nm-inset rounded-[1.5rem] text-slate-700 placeholder:text-slate-400 focus:outline-none transition-all',
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

export const Card = ({ className, children, onClick }: { className?: string; children: React.ReactNode; onClick?: () => void }) => {
  return (
    <div 
      onClick={onClick}
      className={cn(
        'nm-flat rounded-[2.5rem] p-8 border border-white/40',
        onClick && 'active:nm-pressed cursor-pointer active:scale-[0.99] transition-all',
        className
      )}
    >
      {children}
    </div>
  );
};
