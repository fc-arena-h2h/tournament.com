import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Download, Zap, Send, Globe } from 'lucide-react';
import { DEFAULT_TELEGRAM_UPDATE_URL, DEFAULT_CHROME_UPDATE_URL, APP_VERSION } from '@/src/lib/constants';

interface UpdateOverlayProps {
  serverVersion: string;
  isMandatory: boolean;
  updateUrl: string;
  telegramUpdateUrl?: string;
  chromeUpdateUrl?: string;
}

export const UpdateOverlay: React.FC<UpdateOverlayProps> = ({
  serverVersion,
  updateUrl,
  telegramUpdateUrl,
  chromeUpdateUrl
}) => {
  const finalTelegramUrl = (telegramUpdateUrl || updateUrl || DEFAULT_TELEGRAM_UPDATE_URL).trim();
  const finalChromeUrl = (chromeUpdateUrl || updateUrl || DEFAULT_CHROME_UPDATE_URL).trim();

  const openExternalUpdateUrl = (e: React.MouseEvent, targetUrl: string) => {
    e.preventDefault();
    if (!targetUrl) return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = targetUrl;
    } else {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/92 backdrop-blur-xl flex items-center justify-center p-5 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fc-green/10 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-md w-full solid-modal-surface bg-white rounded-[2.75rem] p-7 sm:p-9 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.7)] border border-slate-200 dark:border-white/15 text-center space-y-7 relative my-auto"
      >
        {/* Visual Header */}
        <div className="relative mx-auto w-22 h-22">
          <div className="absolute inset-0 bg-indigo-500/20 rounded-3xl blur-xl animate-pulse" />
          <div className="relative w-full h-full rounded-[1.85rem] bg-slate-900 dark:bg-[#131629] flex items-center justify-center border border-white/15 shadow-inner">
            <Download size={42} className="text-indigo-400 animate-bounce" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-fc-green border-4 border-white dark:border-[#1c1f35] flex items-center justify-center shadow-lg">
            <Zap size={14} className="text-white fill-white" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
              Critical App Update
            </span>
          </div>
          
          <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase italic tracking-tighter leading-none">
            New Version <br /> <span className="text-indigo-600 dark:text-indigo-400">Available</span>
          </h2>
          
          <div className="flex flex-col gap-1 py-3.5 px-5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex justify-between items-center text-[9.5px] font-black uppercase tracking-widest text-slate-400">
              <span>Your Version</span>
              <span>Latest</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-black text-slate-400 italic">v{APP_VERSION}</span>
              <div className="flex-1 border-t-2 border-dashed border-slate-200 dark:border-white/15 mx-4" />
              <span className="text-sm font-black text-fc-green italic">v{serverVersion}</span>
            </div>
          </div>

          <p className="text-[10.5px] font-bold text-slate-500 dark:text-slate-300 leading-relaxed uppercase tracking-tight px-1">
            You are currently using an outdated version of the app. Choose your preferred platform below to download and install the latest update.
          </p>
        </div>

        {/* Dual Update Action Buttons */}
        <div className="space-y-3">
          <a 
            href={finalTelegramUrl}
            onClick={(e) => openExternalUpdateUrl(e, finalTelegramUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#0088cc] to-[#229ED9] hover:from-[#0077b5] hover:to-[#1d8ec4] text-white font-black text-[10.5px] sm:text-[11px] uppercase tracking-widest shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2.5 active:scale-95 transition-all group px-4"
          >
            <Send size={16} className="shrink-0" />
            <span>Continue Update in Telegram</span>
            <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform shrink-0" />
          </a>

          <a 
            href={finalChromeUrl}
            onClick={(e) => openExternalUpdateUrl(e, finalChromeUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-14 rounded-2xl bg-slate-900 dark:bg-gradient-to-r dark:from-indigo-600 dark:to-purple-600 hover:bg-slate-800 text-white font-black text-[10.5px] sm:text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2.5 active:scale-95 transition-all group px-4 border border-white/10"
          >
            <Globe size={16} className="text-emerald-400 dark:text-amber-300 shrink-0" />
            <span>Continue Update in Google Chrome</span>
            <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform shrink-0" />
          </a>
          
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] pt-2">
            FC Arena Protocol Integration
          </p>
        </div>
      </motion.div>
    </div>
  );
};
