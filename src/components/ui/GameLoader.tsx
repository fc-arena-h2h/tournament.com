import React, { useState, useEffect } from 'react';
import { cn } from '@/src/lib/utils';

interface GameLoaderProps {
  text?: string;
  className?: string;
  fullScreen?: boolean;
  onComplete?: () => void;
  targetPercent?: number;
}

export const GameLoader: React.FC<GameLoaderProps> = ({ 
  text = "CONNECTING TO MATCH ENGINE", 
  className,
  fullScreen = true,
  onComplete,
  targetPercent = 100
}) => {
  const [progress, setProgress] = useState(0);
  const [currentStatus, setCurrentStatus] = useState("CONNECTING TO MATCH ENGINE");

  useEffect(() => {
    // Dynamic loading messages based on progress percentage
    if (progress < 25) {
      setCurrentStatus("CONNECTING TO MATCH ENGINE");
    } else if (progress < 55) {
      setCurrentStatus("SYNCING FIELD & ARENA OS");
    } else if (progress < 85) {
      setCurrentStatus("AUTHENTICATING USER PROFILE");
    } else {
      setCurrentStatus("PREPARING ARENA MATCH ENGINE");
    }
  }, [progress]);

  useEffect(() => {
    if (!fullScreen) return;

    // Smooth percentage counter animation from 0% to 100%
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= targetPercent) {
          clearInterval(interval);
          if (onComplete) {
            setTimeout(onComplete, 300);
          }
          return targetPercent;
        }
        // Organic randomized loading steps
        const increment = Math.floor(Math.random() * 8) + 3;
        return Math.min(prev + increment, targetPercent);
      });
    }, 80);

    return () => clearInterval(interval);
  }, [fullScreen, targetPercent, onComplete]);

  // Subtle loader for inline/card loading contexts
  if (!fullScreen) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-12 space-y-4", className)}>
        <div className="relative w-12 h-12 flex items-center justify-center">
          <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-full" />
          <div className="absolute inset-0 border-t-2 border-cyan-400 rounded-full animate-spin" />
          <div className="w-4 h-4 bg-emerald-400/80 rounded-full animate-pulse shadow-[0_0_10px_#00ff9d]" />
        </div>
        <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-400 uppercase italic">
          {text}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed inset-0 z-[9999] bg-[#060b11] text-white flex flex-col items-center justify-between p-6 overflow-hidden font-mono select-none animate-in fade-in duration-300",
      className
    )}>
      {/* Dynamic Ambient Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#0a202d_0%,#060b11_70%)] opacity-80" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.3)_51%)] bg-[size:100%_4px] pointer-events-none opacity-40" />

      {/* Top Header Branding */}
      <div className="relative z-10 pt-8 flex items-center justify-center gap-2 text-[11px] font-mono font-bold tracking-[0.2em]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#00ff9d] shadow-[0_0_12px_#00ff9d] animate-pulse" />
        <span className="text-white tracking-[0.2em]">EA SPORTS FC</span>
        <span className="text-slate-600 font-normal">/</span>
        <span className="text-[#00f0ff] tracking-[0.25em] drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">ARENA</span>
      </div>

      {/* Center Animated Rings & Geometric Ball */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center gap-10">
        <div className="relative w-80 h-80 flex items-center justify-center">
          
          {/* Outer Green Orbit Arc */}
          <div className="absolute w-72 h-72 rounded-full border-[3px] border-transparent border-b-[#00ff9d] border-l-[#00ff9d]/30 animate-[spin_12s_linear_infinite]" />
          <div className="absolute w-72 h-72 rounded-full border-[3px] border-transparent animate-[spin_12s_linear_infinite]">
            <div className="absolute bottom-[8%] left-[20%] w-3.5 h-3.5 rounded-full bg-[#00ff9d] shadow-[0_0_14px_#00ff9d]" />
          </div>

          {/* Outer Cyan Orbit Arc with Terminal Dots */}
          <div className="absolute w-64 h-64 rounded-full border-[3px] border-transparent border-t-[#00f0ff] border-r-[#00f0ff] animate-[spin_9s_linear_infinite_reverse]" />
          <div className="absolute w-64 h-64 rounded-full border-[3px] border-transparent animate-[spin_9s_linear_infinite_reverse]">
            <div className="absolute top-[12%] right-[10%] w-3 h-3 rounded-full bg-[#00f0ff] shadow-[0_0_12px_#00f0ff]" />
            <div className="absolute bottom-[20%] left-[6%] w-3 h-3 rounded-full bg-[#00f0ff] shadow-[0_0_12px_#00f0ff]" />
          </div>

          {/* Middle Dashed Orbit Ring */}
          <div className="absolute w-52 h-52 rounded-full border border-dashed border-[#00ff9d]/50 animate-[spin_7s_linear_infinite]" />

          {/* Inner Radar Ring */}
          <div className="absolute w-40 h-40 rounded-full border border-[#00f0ff]/30 flex items-center justify-center">
            <div className="w-full h-full rounded-full border border-t-[#00f0ff] border-b-transparent animate-[spin_4s_linear_infinite]" />
          </div>

          {/* Central Radial Glow */}
          <div className="absolute w-28 h-28 bg-[#00f0ff]/20 rounded-full blur-2xl animate-pulse" />

          {/* Central Geometric Football Icon */}
          <div className="relative z-20 w-24 h-24 flex items-center justify-center">
            <svg 
              viewBox="0 0 100 100" 
              className="w-24 h-24 filter drop-shadow-[0_0_18px_rgba(0,240,255,0.85)] animate-[spin_18s_linear_infinite]"
            >
              {/* Outer Ball Perimeter */}
              <circle cx="50" cy="50" r="44" fill="#0b1720" stroke="#00f0ff" strokeWidth="1.8" strokeOpacity="0.9" />
              
              {/* Center Pentagon Core */}
              <polygon points="50,37 62,45 57,59 43,59 38,45" fill="none" stroke="#00ff9d" strokeWidth="2" />
              <circle cx="50" cy="49" r="2" fill="#00ff9d" className="animate-pulse" />

              {/* Geometric Vertices Radial Lines */}
              <line x1="50" y1="37" x2="50" y2="16" stroke="#00f0ff" strokeWidth="1.5" />
              <line x1="62" y1="45" x2="82" y2="36" stroke="#00f0ff" strokeWidth="1.5" />
              <line x1="57" y1="59" x2="73" y2="78" stroke="#00f0ff" strokeWidth="1.5" />
              <line x1="43" y1="59" x2="27" y2="78" stroke="#00f0ff" strokeWidth="1.5" />
              <line x1="38" y1="45" x2="18" y2="36" stroke="#00f0ff" strokeWidth="1.5" />

              {/* Outer Hexagon Shell Geometry */}
              <path 
                d="M50 16 L72 12 L82 36 L90 56 L73 78 L50 90 L27 78 L10 56 L18 36 L28 12 Z" 
                fill="none" 
                stroke="#00f0ff" 
                strokeWidth="1.2" 
                strokeOpacity="0.7" 
              />
              <path 
                d="M72 12 L82 36 M90 56 L73 78 M50 90 L27 78 M10 56 L18 36 M28 12 L50 16" 
                fill="none" 
                stroke="#00ff9d" 
                strokeWidth="1.2" 
                strokeOpacity="0.6" 
              />
            </svg>
          </div>
        </div>

        {/* Status Text Display */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-mono font-black text-white tracking-[0.25em] drop-shadow-[0_0_12px_rgba(0,240,255,0.6)]">
            LOADING...
          </h1>
          <div className="flex items-center justify-center gap-2 text-[10px] font-mono font-bold tracking-[0.2em] text-[#00ff9d]">
            <span className="w-2 h-2 rounded-full bg-[#00ff9d] shadow-[0_0_8px_#00ff9d] animate-ping" />
            <span className="uppercase">{currentStatus}</span>
          </div>
        </div>
      </div>

      {/* Bottom Progress Bar & Counter */}
      <div className="relative z-10 w-full max-w-sm pb-8 space-y-3">
        <div className="flex items-center justify-between text-[10px] font-mono font-bold tracking-[0.2em]">
          <span className="text-slate-400 uppercase">SYNCING DATA</span>
          <span className="text-[#00f0ff] font-black text-sm tracking-wider drop-shadow-[0_0_8px_#00f0ff]">
            {Math.round(progress)}%
          </span>
        </div>

        {/* Cyber Neon Progress Track */}
        <div className="w-full h-3 bg-[#0a1520] rounded-full border border-[#00f0ff]/30 p-[2px] shadow-[0_0_15px_rgba(0,240,255,0.15)] relative overflow-hidden">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-[#00ff9d] via-[#00f0ff] to-[#00ff9d] shadow-[0_0_12px_#00f0ff] transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
