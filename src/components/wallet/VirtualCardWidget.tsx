import React from 'react';
import { CreditCard, MoreHorizontal, ShieldCheck, Plus, Sparkles, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';

interface VirtualCardWidgetProps {
  profile: UserProfile | null;
  onManageCard: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

export const VirtualCardWidget: React.FC<VirtualCardWidgetProps> = ({
  profile,
  onManageCard,
  onDeposit,
  onWithdraw
}) => {
  const card = profile?.virtualCard;
  const currentWallet = Number(profile?.wallet || 0);

  if (!card) {
    return (
      <div 
        onClick={onManageCard}
        className="relative overflow-hidden rounded-[2.2rem] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 text-white shadow-xl border-2 border-slate-700/60 cursor-pointer active:scale-[0.98] transition-all hover:border-slate-500 group"
      >
        <div className="absolute top-0 right-0 w-44 h-44 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 group-hover:scale-105 transition-transform">
              <CreditCard size={24} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black uppercase italic text-white">Create Virtual Card</h4>
                {profile?.role === 'publisher' && !profile?.bonusClaimed && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                    <Sparkles size={10} /> +৳10 Bonus
                  </span>
                )}
              </div>
              <p className="text-[10px] font-semibold text-slate-300 mt-0.5">
                Set up 1-click deposit & password-protected withdrawal
              </p>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/20 group-hover:bg-white/20 transition-colors">
            <Plus size={18} />
          </div>
        </div>
      </div>
    );
  }

  // Brand badge based on account type
  const isBitcoin = card.accountType === 'bitcoin';
  const isBkash = card.accountType === 'bkash';
  const isNagad = card.accountType === 'nagad';

  return (
    <div className="space-y-4">
      {/* Physical / Realistic Virtual Card (Reference from uploaded design) */}
      <div 
        onClick={onManageCard}
        className="relative overflow-hidden rounded-[2.2rem] bg-gradient-to-br from-[#111622] via-[#1a2333] to-[#0d121c] p-6 text-white shadow-2xl border border-slate-700/70 select-none cursor-pointer group active:scale-[0.98] transition-all"
      >
        {/* Decorative Circular Waves like the design */}
        <div className="absolute top-[-20%] right-[-15%] w-56 h-56 rounded-full border-[18px] border-white/[0.04] pointer-events-none" />
        <div className="absolute top-[10%] right-[-5%] w-40 h-40 rounded-full border-[12px] border-white/[0.03] pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[-10%] w-40 h-40 bg-gradient-to-tr from-amber-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-between min-h-[175px]">
          {/* Top Bar: Balance & More Options */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-amber-400">
                  {card.currency === 'BDT' ? '৳' : '$'}
                </span>
                <span className="text-3xl sm:text-4xl font-black tracking-tight italic font-mono">
                  {currentWallet.toFixed(2)}
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Balance ({card.currency})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-slate-300 text-[8px] font-black uppercase tracking-wider border border-white/15">
                {card.accountType.toUpperCase()}
              </span>
              <button 
                title="Card settings"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 transition-colors"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          </div>

          {/* Middle Design: Stylish Gradient Indicator line (from reference picture) */}
          <div className="my-3">
            <div className="w-full h-1.5 bg-slate-800/80 rounded-full overflow-hidden flex">
              <div className="w-1/3 h-full bg-gradient-to-r from-rose-500 via-amber-500 to-amber-400 rounded-full" />
            </div>
          </div>

          {/* Bottom Bar: Masked Card Number, Holder Name, and Logo */}
          <div className="flex items-end justify-between pt-1">
            <div className="space-y-1">
              <div className="text-xs sm:text-sm font-mono font-black tracking-[0.2em] text-slate-200">
                {card.cardNumber}
              </div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {card.cardHolderName}
              </div>
            </div>

            {/* Brand Logo (Mastercard style overlapping circles or Bitcoin glyph) */}
            <div className="flex items-center">
              {isBitcoin ? (
                <div className="w-9 h-9 rounded-xl bg-[#F7931A] text-white font-black flex items-center justify-center text-sm shadow-md">
                  ₿
                </div>
              ) : isBkash ? (
                <div className="w-9 h-9 rounded-xl bg-[#E2136E] text-white font-black flex items-center justify-center text-xs shadow-md">
                  bK
                </div>
              ) : isNagad ? (
                <div className="w-9 h-9 rounded-xl bg-[#F7931E] text-white font-black flex items-center justify-center text-xs shadow-md">
                  NG
                </div>
              ) : (
                <div className="flex items-center -space-x-2">
                  <div className="w-6 h-6 rounded-full bg-rose-500/90 shadow-sm" />
                  <div className="w-6 h-6 rounded-full bg-amber-500/90 shadow-sm" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {onDeposit && (
          <button
            onClick={onDeposit}
            className="py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
          >
            <ArrowDownLeft size={16} strokeWidth={3} />
            <span>Add Money</span>
          </button>
        )}
        {onWithdraw && (
          <button
            onClick={onWithdraw}
            className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
          >
            <ArrowUpRight size={16} strokeWidth={3} />
            <span>Withdraw</span>
          </button>
        )}
      </div>
    </div>
  );
};
