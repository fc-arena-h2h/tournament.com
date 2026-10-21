import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, ArrowRight, Download, Zap } from 'lucide-react';
import { DEFAULT_UPDATE_URL, APP_VERSION } from '@/src/lib/constants';

interface UpdateOverlayProps {
  serverVersion: string;
  isMandatory: boolean;
  updateUrl: string;
}

export const UpdateOverlay: React.FC<UpdateOverlayProps> = ({ serverVersion, isMandatory, updateUrl }) => {
  const handleUpdate = (e: React.MouseEvent) => {
    e.preventDefault();
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      // Use location.href for more reliable redirect on some mobile systems
      window.location.href = updateUrl;
    } else {
      window.open(updateUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fc-green/10 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl border-4 border-white/20 text-center space-y-8 relative"
      >
        {/* Visual Header */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 bg-indigo-500/20 rounded-3xl blur-xl animate-pulse" />
          <div className="relative w-full h-full rounded-[2rem] bg-slate-900 flex items-center justify-center border border-white/20 shadow-inner">
            <Download size={48} className="text-indigo-400 animate-bounce" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-fc-green border-4 border-white flex items-center justify-center shadow-lg">
            <Zap size={14} className="text-white fill-white" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
              Critical App Update
            </span>
          </div>
          
          <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
            New Version <br /> <span className="text-indigo-600">Available</span>
          </h2>
          
          <div className="flex flex-col gap-1 py-4 px-6 rounded-2xl bg-slate-50 border border-slate-100">
             <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Your Version</span>
                <span>Latest</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-sm font-black text-slate-400 italic">v{APP_VERSION}</span>
                <div className="flex-1 border-t-2 border-dashed border-slate-200 mx-4" />
                <span className="text-sm font-black text-fc-green italic">v{serverVersion}</span>
             </div>
          </div>

          <p className="text-[11px] font-bold text-slate-500 leading-relaxed uppercase tracking-tight px-2">
            You are currently using an outdated version of the app. To continue accessing the Arena and matches, please update to the latest version.
          </p>
        </div>

        <div className="space-y-4">
          <a 
            href={updateUrl}
            onClick={handleUpdate}
            target="_system"
            rel="noopener noreferrer"
            className="w-full h-18 rounded-[1.5rem] bg-slate-900 text-white font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-transform group"
          >
            Update & Continue <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </a>
          
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">
            FC Arena Protocol Integration
          </p>
        </div>
      </motion.div>
    </div>
  );
};
