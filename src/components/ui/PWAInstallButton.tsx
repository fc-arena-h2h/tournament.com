import React, { useState } from 'react';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as standalone app, don't show
  if (isInstalled) {
    return null;
  }

  // Android / Chromium / Desktop install button
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[11px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all"
        title="অ্যাপটি ফোনে ইনস্টল করুন"
      >
        <Download size={13} />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl nm-flat text-slate-700 text-[11px] font-black uppercase tracking-wider active:scale-95 transition-all"
        >
          <Smartphone size={13} />
          <span>Install iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-[#f5f5f7] border border-white/60 p-6 shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-black text-slate-900 uppercase">iPhone / iPad এ ইনস্টল করুন</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="w-8 h-8 rounded-full nm-flat flex items-center justify-center text-slate-500 hover:text-slate-900"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-600 font-medium leading-relaxed mb-4">
                ১. Safari ব্রাউজারের নিচে থাকা <strong>Share (শেয়ার)</strong> বাটনে ট্যাপ করুন।<br />
                ২. নিচে স্ক্রোল করে <strong>"Add to Home Screen" (হোম স্ক্রিনে যোগ করুন)</strong> নির্বাচন করুন।<br />
                ৩. উপরে <strong>Add</strong> চাপলেই অ্যাপটি ইনস্টল হয়ে যাবে।
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-wider shadow-md"
              >
                ঠিক আছে
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
