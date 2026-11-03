import React from 'react';
import { cn } from '@/src/lib/utils';
import { motion, HTMLMotionProps } from 'framer-motion';

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'success' | 'danger' | 'premium';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-slate-900 dark:bg-gradient-to-r dark:from-[#ff7a45] dark:to-[#a855f7] text-white font-black uppercase tracking-[0.15em] hover:bg-slate-800 shadow-lg shadow-slate-900/10 dark:shadow-[#a855f7]/25 active:scale-95',
      secondary: 'bg-slate-100 dark:bg-[#232642]/80 text-slate-600 dark:text-slate-200 font-bold hover:bg-slate-200 dark:hover:bg-[#2c3052] active:scale-95',
      outline: 'bg-white/40 dark:bg-white/5 backdrop-blur-md border-2 border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 font-black uppercase tracking-wider hover:border-slate-900 dark:hover:border-white/30 transition-all active:scale-95',
      ghost: 'bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white',
      success: 'bg-emerald-500 text-white font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95',
      danger: 'bg-rose-500 text-white font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:bg-rose-600 active:scale-95',
      premium: 'bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] text-white font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/30 dark:shadow-[#ec4899]/25 hover:shadow-indigo-500/50 active:scale-95',
    };

    const sizes = {
      sm: 'px-5 py-2.5 text-[9px]',
      md: 'px-7 py-4 text-[11px]',
      lg: 'px-10 py-5 text-sm',
      icon: 'p-3.5 w-12 h-12 flex items-center justify-center',
    };

    return (
      <motion.button
        ref={ref as any}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'rounded-2xl transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 border-2 border-transparent relative overflow-hidden',
          variants[variant],
          sizes[size],
          className
        )}
        {...(props as any)}
      />
    );
  }
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div className="relative w-full group">
        <input
          ref={ref}
          className={cn(
            'w-full h-15 px-6 bg-white/60 dark:bg-[#141627]/85 backdrop-blur-md rounded-2xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:focus:ring-[#a855f7]/20 transition-all border-2 border-slate-100 dark:border-white/12 group-focus-within:border-indigo-500/30 dark:group-focus-within:border-[#ff7a45]/50',
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

export const Card = ({ 
  className, 
  children, 
  onClick, 
  delay = 0,
  hover = true
}: { 
  className?: string; 
  children: React.ReactNode; 
  onClick?: () => void; 
  delay?: number;
  hover?: boolean;
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={hover ? { y: -4 } : {}}
      onClick={onClick}
      className={cn(
        'bg-white/80 dark:bg-[#232642]/72 backdrop-blur-2xl rounded-[2rem] p-8 border border-white dark:border-white/14 shadow-sm dark:shadow-[0_20px_45px_-12px_rgba(6,7,16,0.8),inset_0_1px_1px_rgba(255,255,255,0.16)] relative overflow-hidden',
        onClick && 'cursor-pointer active:scale-[0.99] transition-all',
        className
      )}
    >
      {children}
    </motion.div>
  );
};
