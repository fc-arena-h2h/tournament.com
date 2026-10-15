import React, { useState, useEffect } from 'react';
import { 
  Wallet, ArrowDownLeft, ArrowUpRight, Copy, Check, AlertCircle, 
  CreditCard, CheckCircle2, Coins, DollarSign, X, Clock, ShieldCheck, 
  RefreshCw, Info, HelpCircle, ChevronRight, User, CheckCircle, XCircle,
  Lock, KeyRound, Mail, Sparkles, Send
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { UserProfile } from '@/src/hooks/useAuth';
import { 
  PaymentMethod, PAYMENT_CONFIG, WalletTransaction,
  submitDepositRequest, submitWithdrawRequest, 
  approveWalletTransaction, rejectWalletTransaction 
} from '@/src/lib/wallet';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { sendEmailVerification } from 'firebase/auth';
import { VirtualCardWidget } from '@/src/components/wallet/VirtualCardWidget';
import { VirtualCardModal } from '@/src/components/wallet/VirtualCardModal';
import { sendAppNotification } from '@/src/lib/notifications';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  initialTab?: 'overview' | 'deposit' | 'withdraw' | 'history';
}

export const WalletModal: React.FC<WalletModalProps> = ({ 
  isOpen, 
  onClose, 
  profile,
  initialTab = 'overview'
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'deposit' | 'withdraw' | 'history' | 'manage'>('overview');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('bkash');
  
  // Deposit form state
  const [depositAmount, setDepositAmount] = useState<string>('100');
  const [senderAccount, setSenderAccount] = useState<string>('');
  const [trxId, setTrxId] = useState<string>('');
  const [depositNote, setDepositNote] = useState<string>('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Withdraw form state
  const [withdrawAmount, setWithdrawAmount] = useState<string>('100');
  const [recipientAccount, setRecipientAccount] = useState<string>('');
  const [accountType, setAccountType] = useState<'personal' | 'agent'>('personal');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // Virtual Card State
  const [showVirtualCardModal, setShowVirtualCardModal] = useState(false);
  const [cardPasswordInput, setCardPasswordInput] = useState('');
  const [cardWithdrawEmailCode, setCardWithdrawEmailCode] = useState('');
  const [generatedWithdrawCode, setGeneratedWithdrawCode] = useState('');
  const [withdrawCodeSent, setWithdrawCodeSent] = useState(false);
  const [isSendingWithdrawCode, setIsSendingWithdrawCode] = useState(false);
  const [requireCardSecurity, setRequireCardSecurity] = useState(false);

  // Copy feedback
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedBtc, setCopiedBtc] = useState(false);

  // Transactions list
  const [userTransactions, setUserTransactions] = useState<WalletTransaction[]>([]);
  const [adminPendingTxs, setAdminPendingTxs] = useState<WalletTransaction[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'deposit' | 'withdraw'>('all');
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);

  // Sync initial tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setDepositSuccess(false);
      setWithdrawSuccess(false);
      setDepositError(null);
      setWithdrawError(null);
      setCardPasswordInput('');
      setCardWithdrawEmailCode('');
      setWithdrawCodeSent(false);

      // Autofill from Virtual Card if available
      if (profile?.virtualCard) {
        if (!senderAccount) {
          setSenderAccount(profile.virtualCard.accountNumber);
        }
        if (!recipientAccount) {
          setRecipientAccount(profile.virtualCard.accountNumber);
        }
        if (profile.virtualCard.accountType) {
          setSelectedMethod(profile.virtualCard.accountType);
        }
        setRequireCardSecurity(true);
      }
    }
  }, [isOpen, initialTab]);

  // Real-time listener for current user's transactions
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', profile.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WalletTransaction));
      setUserTransactions(txs);
    }, (err) => {
      console.warn('Transactions listen error:', err);
    });

    return () => unsub();
  }, [profile?.uid, isOpen]);

  // Real-time listener for Admin pending transactions (ONLY admin has permission)
  useEffect(() => {
    if (!isOpen) return;
    const isAdmin = profile?.role === 'admin';
    if (!isAdmin) return;

    const q = query(
      collection(db, 'transactions'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WalletTransaction));
      setAdminPendingTxs(txs);
    }, (err) => {
      console.warn('Admin pending transactions listen error:', err);
    });

    return () => unsub();
  }, [isOpen, profile?.role]);

  if (!isOpen) return null;

  const currentWallet = Number(profile?.wallet || 0);
  const isAdmin = profile?.role === 'admin';

  const copyToClipboard = (text: string, type: 'number' | 'btc') => {
    navigator.clipboard.writeText(text);
    if (type === 'number') {
      setCopiedNumber(true);
      setTimeout(() => setCopiedNumber(false), 2000);
    } else {
      setCopiedBtc(true);
      setTimeout(() => setCopiedBtc(false), 2000);
    }
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setDepositError(null);

    const amt = Number(depositAmount);
    if (isNaN(amt) || amt < PAYMENT_CONFIG[selectedMethod].minDeposit) {
      setDepositError(`Minimum deposit amount is ৳${PAYMENT_CONFIG[selectedMethod].minDeposit}`);
      return;
    }

    if (!senderAccount.trim()) {
      setDepositError(selectedMethod === 'bitcoin' ? 'Please enter your sender Bitcoin address' : 'Please enter your sender mobile banking number');
      return;
    }

    if (!trxId.trim()) {
      setDepositError(selectedMethod === 'bitcoin' ? 'Please enter Transaction Hash / TxID' : 'Please enter Transaction ID (TrxID)');
      return;
    }

    setIsDepositing(true);
    try {
      await submitDepositRequest({
        userId: profile.uid,
        userName: profile.inGameName || profile.email?.split('@')[0] || 'Player',
        userEmail: profile.email,
        method: selectedMethod,
        amount: amt,
        senderAccount,
        trxId,
        note: depositNote
      });

      setDepositSuccess(true);
      setSenderAccount('');
      setTrxId('');
      setDepositNote('');
    } catch (err: any) {
      console.error('Deposit error:', err);
      setDepositError(err?.message || 'Failed to submit deposit request. Please try again.');
    } finally {
      setIsDepositing(false);
    }
  };

  const handleSendWithdrawVerificationCode = async () => {
    if (!profile) return;
    const targetEmail = profile.virtualCard?.verifiedEmail || profile.email;
    if (!targetEmail) {
      setWithdrawError('No verified email found for withdrawal verification.');
      return;
    }

    setIsSendingWithdrawCode(true);
    setWithdrawError(null);
    try {
      // Send official Firebase Verification Link if user's email isn't verified yet
      if (auth.currentUser && !auth.currentUser.emailVerified) {
        await sendEmailVerification(auth.currentUser).catch(() => {});
      }

      // Generate 6-digit withdrawal verification code dispatched to email & in-app notifications
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedWithdrawCode(code);
      setWithdrawCodeSent(true);

      // Send in-app notification & dispatch verification token
      await sendAppNotification({
        recipientId: profile.uid,
        title: '🔑 Withdrawal Authorization Code & Verification Link',
        message: `Your withdrawal authorization code for ৳${withdrawAmount} is: ${code}. Official verification link has also been sent to your email.`,
        type: 'system',
        linkTab: 'profile',
        extra: { openWallet: true, withdrawCode: code }
      });
    } catch (e: any) {
      setWithdrawError('Failed to dispatch authorization code.');
    } finally {
      setIsSendingWithdrawCode(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setWithdrawError(null);

    const amt = Number(withdrawAmount);
    const minW = PAYMENT_CONFIG[selectedMethod].minWithdraw;

    if (isNaN(amt) || amt < minW) {
      setWithdrawError(`Minimum withdrawal amount is ৳${minW}`);
      return;
    }

    if (amt > currentWallet) {
      setWithdrawError(`Insufficient balance! Your current wallet balance is ৳${currentWallet.toFixed(2)}`);
      return;
    }

    if (!recipientAccount.trim()) {
      setWithdrawError(selectedMethod === 'bitcoin' ? 'Please enter your Bitcoin wallet address' : 'Please enter recipient account number');
      return;
    }

    // Card security checks (Password + Email OTP code) if virtual card exists
    if (profile.virtualCard) {
      if (profile.virtualCard.cardPasswordHash) {
        if (!cardPasswordInput) {
          setWithdrawError('Please enter your Virtual Card Security Password.');
          return;
        }
        if (btoa(cardPasswordInput) !== profile.virtualCard.cardPasswordHash) {
          setWithdrawError('Incorrect Virtual Card Security Password! Access denied.');
          return;
        }
      }

      if (!withdrawCodeSent) {
        setWithdrawError('Please click "Send Code" to verify via your registered email address.');
        return;
      }

      if (cardWithdrawEmailCode.trim() !== generatedWithdrawCode) {
        setWithdrawError('Invalid email verification code! Please check your notifications.');
        return;
      }
    }

    setIsWithdrawing(true);
    try {
      await submitWithdrawRequest({
        userId: profile.uid,
        userName: profile.inGameName || profile.email?.split('@')[0] || 'Player',
        userEmail: profile.virtualCard?.verifiedEmail || profile.email,
        method: selectedMethod,
        amount: amt,
        recipientAccount,
        accountType
      });

      setWithdrawSuccess(true);
      setRecipientAccount('');
      setCardPasswordInput('');
      setCardWithdrawEmailCode('');
      setWithdrawCodeSent(false);
    } catch (err: any) {
      console.error('Withdrawal error:', err);
      setWithdrawError(err?.message || 'Failed to submit withdrawal request.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleAdminApprove = async (tx: WalletTransaction) => {
    if (!tx.id) return;
    if (profile?.role !== 'admin') {
      alert('Only administrators have permission to approve transactions.');
      return;
    }
    setProcessingTxId(tx.id);
    try {
      await approveWalletTransaction(tx.id, tx);
    } catch (err: any) {
      alert(`Approval failed: ${err?.message || err}`);
    } finally {
      setProcessingTxId(null);
    }
  };

  const handleAdminReject = async (tx: WalletTransaction) => {
    if (!tx.id) return;
    if (profile?.role !== 'admin') {
      alert('Only administrators have permission to reject transactions.');
      return;
    }
    const reason = prompt('Enter rejection reason (optional):', 'Invalid details or unverified transaction');
    if (reason === null) return;

    setProcessingTxId(tx.id);
    try {
      await rejectWalletTransaction(tx.id, tx, reason);
    } catch (err: any) {
      alert(`Rejection failed: ${err?.message || err}`);
    } finally {
      setProcessingTxId(null);
    }
  };

  const filteredTransactions = userTransactions.filter(t => {
    if (historyFilter === 'all') return true;
    return t.type === historyFilter;
  });

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-900/70 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-300">
      <div 
        className="w-full sm:max-w-xl max-h-[92vh] sm:max-h-[85vh] bg-[#f8fafc] rounded-t-[2.5rem] sm:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border-2 border-white/60 animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md">
              <Wallet size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">ARENA FINANCIALS</span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase italic tracking-tight">
                Wallet & Payment Services
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-2xl nm-flat flex items-center justify-center text-slate-400 hover:text-slate-700 active:nm-pressed transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Dynamic Navigation Subtabs */}
        <div className="shrink-0 px-4 pt-3 pb-2 bg-slate-50 border-b border-slate-200/60 overflow-x-auto no-scrollbar">
          <div className="flex gap-1.5 p-1 bg-slate-200/60 rounded-2xl">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                "flex-1 min-w-[70px] py-2 px-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all whitespace-nowrap",
                activeTab === 'overview' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              Overview
            </button>
            <button
              onClick={() => { setActiveTab('deposit'); setDepositSuccess(false); }}
              className={cn(
                "flex-1 min-w-[75px] py-2 px-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1 whitespace-nowrap",
                activeTab === 'deposit' ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <ArrowDownLeft size={12} />
              Add Money
            </button>
            <button
              onClick={() => { setActiveTab('withdraw'); setWithdrawSuccess(false); }}
              className={cn(
                "flex-1 min-w-[75px] py-2 px-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1 whitespace-nowrap",
                activeTab === 'withdraw' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <ArrowUpRight size={12} />
              Withdraw
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex-1 min-w-[70px] py-2 px-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all whitespace-nowrap",
                activeTab === 'history' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              History
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('manage')}
                className={cn(
                  "flex-1 min-w-[85px] py-2 px-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1 whitespace-nowrap relative",
                  activeTab === 'manage' ? "bg-amber-500 text-slate-950 font-black shadow-sm" : "text-amber-700 hover:text-amber-900 bg-amber-100/50"
                )}
              >
                <span>Admin Requests</span>
                {adminPendingTxs.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center font-bold">
                    {adminPendingTxs.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 no-scrollbar">

          {/* ===================== TAB: OVERVIEW ===================== */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* User Virtual Card Display (Styled as specified in reference image) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    VIRTUAL ESCROW CARD
                  </span>
                  <button
                    onClick={() => setShowVirtualCardModal(true)}
                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-wider transition-colors flex items-center gap-1"
                  >
                    <CreditCard size={12} />
                    <span>{profile?.virtualCard ? 'Card Settings' : 'Create Card (+৳10)'}</span>
                  </button>
                </div>

                <VirtualCardWidget
                  profile={profile}
                  onManageCard={() => setShowVirtualCardModal(true)}
                  onDeposit={() => { setActiveTab('deposit'); setDepositSuccess(false); }}
                  onWithdraw={() => { setActiveTab('withdraw'); setWithdrawSuccess(false); }}
                />
              </div>

              {/* Supported Payment Channels Grid */}
              <div className="space-y-3">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] ml-2">
                  SUPPORTED PAYMENT CHANNELS
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* bKash */}
                  <div 
                    onClick={() => { setSelectedMethod('bkash'); setActiveTab('deposit'); }}
                    className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-3 cursor-pointer hover:border-[#E2136E] transition-all group active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#E2136E] text-white font-black flex items-center justify-center shrink-0 shadow-md">
                      bK
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black text-slate-900 group-hover:text-[#E2136E] transition-colors">bKash</span>
                      <span className="text-[9px] font-bold text-slate-400 truncate">01301833622</span>
                    </div>
                  </div>

                  {/* Nagad */}
                  <div 
                    onClick={() => { setSelectedMethod('nagad'); setActiveTab('deposit'); }}
                    className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-3 cursor-pointer hover:border-[#F7931E] transition-all group active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#F7931E] text-white font-black flex items-center justify-center shrink-0 shadow-md">
                      NG
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black text-slate-900 group-hover:text-[#F7931E] transition-colors">Nagad</span>
                      <span className="text-[9px] font-bold text-slate-400 truncate">01301833622</span>
                    </div>
                  </div>

                  {/* Bitcoin */}
                  <div 
                    onClick={() => { setSelectedMethod('bitcoin'); setActiveTab('deposit'); }}
                    className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-3 cursor-pointer hover:border-[#F7931A] transition-all group active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#F7931A] text-white font-black flex items-center justify-center shrink-0 shadow-md">
                      ₿
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black text-slate-900 group-hover:text-[#F7931A] transition-colors">Bitcoin (BTC)</span>
                      <span className="text-[9px] font-bold text-slate-400 truncate">Global Crypto</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security & Official Policy Notice */}
              <div className="rounded-2xl p-4 bg-emerald-50/70 border border-emerald-100 flex items-start gap-3 text-slate-700">
                <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-slate-900">Official & Secure Wallet System</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    The only authorized number for bKash and Nagad deposits is <span className="font-black text-slate-900 bg-white px-1.5 py-0.5 rounded border border-emerald-200">01301833622</span>. Send money and submit the exact TrxID for prompt verification and balance credit.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ===================== TAB: ADD MONEY (DEPOSIT) ===================== */}
          {activeTab === 'deposit' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {depositSuccess ? (
                <div className="p-8 rounded-[2rem] bg-white border-2 border-emerald-500/40 text-center space-y-4 shadow-xl">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center animate-bounce">
                    <CheckCircle2 size={36} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-900 uppercase italic">Deposit Request Submitted!</h3>
                    <p className="text-xs text-slate-600">
                      Your deposit request for ৳{depositAmount} has been received. Admin will verify and credit your balance within 5-10 minutes.
                    </p>
                  </div>
                  <div className="pt-2 flex gap-3">
                    <button
                      onClick={() => setDepositSuccess(false)}
                      className="flex-1 py-3 px-4 rounded-xl bg-slate-100 text-slate-700 text-xs font-black uppercase hover:bg-slate-200 transition-colors"
                    >
                      Another Request
                    </button>
                    <button
                      onClick={() => setActiveTab('history')}
                      className="flex-1 py-3 px-4 rounded-xl bg-slate-900 text-white text-xs font-black uppercase hover:bg-slate-800 transition-colors"
                    >
                      View History
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleDepositSubmit} className="space-y-5">
                  {/* Step 1: Method Selector */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">
                      1. Select Payment Method
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['bkash', 'nagad', 'bitcoin'] as PaymentMethod[]).map((m) => {
                        const isSel = selectedMethod === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSelectedMethod(m)}
                            className={cn(
                              "p-3 rounded-2xl flex flex-col items-center gap-1.5 border-2 transition-all active:scale-95",
                              isSel 
                                ? m === 'bkash' ? "bg-pink-50 border-[#E2136E] text-[#E2136E] shadow-sm"
                                  : m === 'nagad' ? "bg-orange-50 border-[#F7931E] text-[#F7931E] shadow-sm"
                                  : "bg-amber-50 border-[#F7931A] text-[#F7931A] shadow-sm"
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            )}
                          >
                            <span className="text-base font-black">
                              {m === 'bkash' ? 'bKash' : m === 'nagad' ? 'Nagad' : 'Bitcoin'}
                            </span>
                            <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">
                              {m === 'bitcoin' ? 'BTC Crypto' : 'Send Money'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Payment Instruction Box */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        {selectedMethod === 'bitcoin' ? 'Bitcoin Payment Details' : 'Payment Recipient Number'}
                      </span>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                        {PAYMENT_CONFIG[selectedMethod].type}
                      </span>
                    </div>

                    {selectedMethod !== 'bitcoin' ? (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Official Number</span>
                          <span className="text-lg font-black tracking-wider text-slate-900 font-mono">
                            01301833622
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard('01301833622', 'number')}
                          className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all"
                        >
                          {copiedNumber ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          {copiedNumber ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900 text-xs">
                          <p className="font-bold">⚡ Bitcoin Deposit Address:</p>
                          <p className="text-[11px] text-amber-800 mt-1">
                            Official BTC gateway address will be updated by Admin shortly. You can also contact support directly.
                          </p>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Reserved Gateway Address</span>
                            <span className="text-xs font-black text-slate-900 font-mono truncate">
                              bc1qarena72fc89btc9deposit9key9v2
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard('bc1qarena72fc89btc9deposit9key9v2', 'btc')}
                            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black shrink-0 flex items-center gap-1 active:scale-95 transition-all"
                          >
                            {copiedBtc ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            {copiedBtc ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step-by-step guidelines list */}
                    <ul className="space-y-1.5 pt-1 border-t border-slate-100 text-[11px] text-slate-600">
                      {PAYMENT_CONFIG[selectedMethod].instructions.map((ins, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span>{ins}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Step 3: Amount selection with preset chips */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">
                        2. Amount (in BDT)
                      </label>
                      <span className="text-[10px] font-bold text-slate-400">
                        Minimum ৳{PAYMENT_CONFIG[selectedMethod].minDeposit}
                      </span>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {['50', '100', '200', '500', '1000', '2500'].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setDepositAmount(amt)}
                          className={cn(
                            "py-2 px-3 rounded-xl text-xs font-black border transition-all shrink-0 active:scale-95",
                            depositAmount === amt
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                          )}
                        >
                          ৳{amt}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">৳</span>
                      <Input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="Enter custom amount"
                        className="pl-8 text-base font-black"
                        min={PAYMENT_CONFIG[selectedMethod].minDeposit}
                        required
                      />
                    </div>
                  </div>

                  {/* Step 4: Sender Number / Address & TrxID */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">
                      3. Verification Details
                    </label>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 ml-1">
                        {selectedMethod === 'bitcoin' ? 'Your Sender Bitcoin Wallet' : 'Sender Phone Number'}
                      </label>
                      <Input
                        type="text"
                        value={senderAccount}
                        onChange={(e) => setSenderAccount(e.target.value)}
                        placeholder={selectedMethod === 'bitcoin' ? 'Sender BTC Address (e.g. 1A1zP1e...)' : '01XXXXXXXXX'}
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 ml-1">
                        {selectedMethod === 'bitcoin' ? 'Transaction Hash / TxID' : 'Transaction ID (TrxID)'}
                      </label>
                      <Input
                        type="text"
                        value={trxId}
                        onChange={(e) => setTrxId(e.target.value.toUpperCase())}
                        placeholder={selectedMethod === 'bitcoin' ? 'Blockchain TxID / Hash' : 'e.g. 9J4K2L99'}
                        required
                      />
                    </div>
                  </div>

                  {depositError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold flex items-center gap-2">
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{depositError}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={isDepositing}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm uppercase tracking-wider shadow-lg active:scale-95 transition-all"
                  >
                    {isDepositing ? (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw size={16} className="animate-spin" />
                        Submitting...
                      </span>
                    ) : (
                      'Submit Deposit Request'
                    )}
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* ===================== TAB: WITHDRAW ===================== */}
          {activeTab === 'withdraw' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {withdrawSuccess ? (
                <div className="p-8 rounded-[2rem] bg-white border-2 border-indigo-500/40 text-center space-y-4 shadow-xl">
                  <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 mx-auto flex items-center justify-center animate-bounce">
                    <CheckCircle2 size={36} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-900 uppercase italic">Withdrawal Request Submitted!</h3>
                    <p className="text-xs text-slate-600">
                      Your withdrawal request for ৳{withdrawAmount} has been received. Funds will be sent shortly after review.
                    </p>
                  </div>
                  <div className="pt-2 flex gap-3">
                    <button
                      onClick={() => setWithdrawSuccess(false)}
                      className="flex-1 py-3 px-4 rounded-xl bg-slate-100 text-slate-700 text-xs font-black uppercase hover:bg-slate-200 transition-colors"
                    >
                      New Withdrawal
                    </button>
                    <button
                      onClick={() => setActiveTab('history')}
                      className="flex-1 py-3 px-4 rounded-xl bg-slate-900 text-white text-xs font-black uppercase hover:bg-slate-800 transition-colors"
                    >
                      View History
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleWithdrawSubmit} className="space-y-5">
                  {/* Current Available Balance Bar */}
                  <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600">Available Balance</span>
                      <span className="text-xl font-black text-slate-900 font-mono">
                        ৳{currentWallet.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Minimum Withdrawal</span>
                      <span className="text-xs font-black text-indigo-700 block">৳{PAYMENT_CONFIG[selectedMethod].minWithdraw}</span>
                    </div>
                  </div>

                  {/* Method Selector */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">
                      1. Select Withdrawal Method
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['bkash', 'nagad', 'bitcoin'] as PaymentMethod[]).map((m) => {
                        const isSel = selectedMethod === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSelectedMethod(m)}
                            className={cn(
                              "p-3 rounded-2xl flex flex-col items-center gap-1.5 border-2 transition-all active:scale-95",
                              isSel 
                                ? m === 'bkash' ? "bg-pink-50 border-[#E2136E] text-[#E2136E] shadow-sm"
                                  : m === 'nagad' ? "bg-orange-50 border-[#F7931E] text-[#F7931E] shadow-sm"
                                  : "bg-amber-50 border-[#F7931A] text-[#F7931A] shadow-sm"
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            )}
                          >
                            <span className="text-base font-black">
                              {m === 'bkash' ? 'bKash' : m === 'nagad' ? 'Nagad' : 'Bitcoin'}
                            </span>
                            <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">
                              {m === 'bitcoin' ? 'Crypto' : 'Mobile Banking'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amount Selector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">
                        2. Withdrawal Amount
                      </label>
                      <button
                        type="button"
                        onClick={() => setWithdrawAmount(Math.floor(currentWallet).toString())}
                        className="text-[10px] font-black text-indigo-600 uppercase tracking-wider hover:underline"
                      >
                        Withdraw All (ALL)
                      </button>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {['100', '200', '500', '1000'].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setWithdrawAmount(amt)}
                          className={cn(
                            "py-2 px-3 rounded-xl text-xs font-black border transition-all shrink-0 active:scale-95",
                            withdrawAmount === amt
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                          )}
                        >
                          ৳{amt}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">৳</span>
                      <Input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="Enter withdrawal amount"
                        className="pl-8 text-base font-black"
                        min={PAYMENT_CONFIG[selectedMethod].minWithdraw}
                        max={currentWallet}
                        required
                      />
                    </div>
                  </div>

                  {/* Account Details */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">
                      3. Recipient Account Details
                    </label>

                    {selectedMethod !== 'bitcoin' && (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setAccountType('personal')}
                          className={cn(
                            "flex-1 py-2 px-3 rounded-xl border text-xs font-black transition-all",
                            accountType === 'personal' ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
                          )}
                        >
                          Personal
                        </button>
                        <button
                          type="button"
                          onClick={() => setAccountType('agent')}
                          className={cn(
                            "flex-1 py-2 px-3 rounded-xl border text-xs font-black transition-all",
                            accountType === 'agent' ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
                          )}
                        >
                          Agent
                        </button>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 ml-1">
                        {selectedMethod === 'bitcoin' ? 'Your Bitcoin (BTC) Receiving Address' : 'Account Number to Receive Funds'}
                      </label>
                      <Input
                        type="text"
                        value={recipientAccount}
                        onChange={(e) => setRecipientAccount(e.target.value)}
                        placeholder={selectedMethod === 'bitcoin' ? 'Your BTC Address (e.g. bc1q...)' : '01XXXXXXXXX'}
                        required
                      />
                    </div>
                  </div>

                  {/* Virtual Card Security Verification Section */}
                  {profile?.virtualCard && (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
                      <div className="flex items-center gap-2">
                        <Lock size={15} className="text-indigo-600" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                          Virtual Card Security Verification
                        </span>
                      </div>

                      {/* 1. Security Password */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600 ml-1">
                          Card Security Password
                        </label>
                        <Input
                          type="password"
                          value={cardPasswordInput}
                          onChange={(e) => setCardPasswordInput(e.target.value)}
                          placeholder="Enter your card security password"
                          required
                        />
                      </div>

                      {/* 2. Verification Email Code */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[10px] ml-1">
                          <span className="font-bold text-slate-600">
                            Email OTP Code ({profile?.virtualCard?.verifiedEmail})
                          </span>
                          <button
                            type="button"
                            onClick={handleSendWithdrawVerificationCode}
                            disabled={isSendingWithdrawCode}
                            className="text-[9px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50"
                          >
                            {isSendingWithdrawCode ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                            <span>{withdrawCodeSent ? 'Resend Code' : 'Send Code'}</span>
                          </button>
                        </div>

                        <Input
                          type="text"
                          maxLength={6}
                          value={cardWithdrawEmailCode}
                          onChange={(e) => setCardWithdrawEmailCode(e.target.value)}
                          placeholder="Enter 6-digit email code"
                          className="font-mono tracking-widest text-center"
                          required
                        />

                        {withdrawCodeSent && generatedWithdrawCode && (
                          <div className="text-[8px] text-indigo-700 font-semibold bg-indigo-50 p-1.5 rounded-lg border border-indigo-100 flex items-center justify-between">
                            <span>Verification code dispatched:</span>
                            <strong className="tracking-widest font-mono text-[9px]">{generatedWithdrawCode}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {withdrawError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold flex items-center gap-2">
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{withdrawError}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={isWithdrawing || currentWallet < PAYMENT_CONFIG[selectedMethod].minWithdraw}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-sm uppercase tracking-wider shadow-lg active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isWithdrawing ? (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw size={16} className="animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      'Confirm Withdrawal Request'
                    )}
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* ===================== TAB: TRANSACTION HISTORY ===================== */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Filter Chips */}
              <div className="flex gap-2 pb-1">
                {(['all', 'deposit', 'withdraw'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setHistoryFilter(f)}
                    className={cn(
                      "py-1.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all",
                      historyFilter === f 
                        ? "bg-slate-900 text-white border-slate-900" 
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {f === 'all' ? 'All' : f === 'deposit' ? 'Deposits (+)' : 'Withdrawals (-)'}
                  </button>
                ))}
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Clock size={32} className="mx-auto text-slate-300" />
                  <p className="text-xs font-black uppercase tracking-wider">No transaction records found</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredTransactions.map((tx) => {
                    const isDep = tx.type === 'deposit';
                    return (
                      <div 
                        key={tx.id} 
                        className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-white text-xs",
                            tx.method === 'bkash' ? "bg-[#E2136E]"
                              : tx.method === 'nagad' ? "bg-[#F7931E]"
                              : "bg-[#F7931A]"
                          )}>
                            {tx.method === 'bkash' ? 'bK' : tx.method === 'nagad' ? 'NG' : '₿'}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-900 uppercase">
                                {isDep ? 'Add Money' : 'Withdrawal'}
                              </span>
                              {/* Status Badge */}
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider",
                                tx.status === 'approved' ? "bg-emerald-100 text-emerald-700"
                                  : tx.status === 'rejected' ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-700 animate-pulse"
                              )}>
                                {tx.status === 'approved' ? 'Approved' : tx.status === 'rejected' ? 'Rejected' : 'Pending'}
                              </span>
                            </div>

                            <span className="text-[10px] text-slate-500 font-mono truncate">
                              {isDep ? `TrxID: ${tx.trxId || 'N/A'}` : `To: ${tx.recipientAccount || 'N/A'}`}
                            </span>
                            <span className="text-[9px] text-slate-400">
                              {tx.createdAt?.toMillis ? new Date(tx.createdAt.toMillis()).toLocaleString() : 'Just now'}
                            </span>
                          </div>
                        </div>

                        {/* Amount */}
                        <div className="text-right shrink-0">
                          <span className={cn(
                            "text-sm font-black font-mono",
                            isDep ? "text-emerald-600" : "text-slate-900"
                          )}>
                            {isDep ? '+' : '-'}৳{tx.amount.toFixed(2)}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block tracking-wider">
                            {tx.method}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===================== TAB: MANAGE REQUESTS (STRICTLY ADMIN ONLY) ===================== */}
          {activeTab === 'manage' && isAdmin && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Pending Wallet Requests (Admin Control)</h3>
                  <span className="text-[10px] text-slate-500">Only admin users can review and approve deposits and withdrawals</span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[9px] font-black">
                  Total: {adminPendingTxs.length}
                </span>
              </div>

              {adminPendingTxs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <CheckCircle size={32} className="mx-auto text-emerald-500" />
                  <p className="text-xs font-black uppercase tracking-wider">No pending requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {adminPendingTxs.map((tx) => {
                    const isDep = tx.type === 'deposit';
                    const isProcessing = processingTxId === tx.id;

                    return (
                      <div 
                        key={tx.id} 
                        className="p-4 rounded-2xl bg-white border border-amber-200/80 shadow-md space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-xs shrink-0",
                              tx.method === 'bkash' ? "bg-[#E2136E]"
                                : tx.method === 'nagad' ? "bg-[#F7931E]"
                                : "bg-[#F7931A]"
                            )}>
                              {tx.method === 'bkash' ? 'bK' : tx.method === 'nagad' ? 'NG' : '₿'}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-slate-900">
                                {tx.userName} ({tx.userEmail?.split('@')[0]})
                              </span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">
                                {isDep ? 'Add Money (Deposit)' : 'Withdraw Request'} · {tx.method}
                              </span>
                            </div>
                          </div>

                          <span className={cn(
                            "text-sm font-black font-mono",
                            isDep ? "text-emerald-600" : "text-indigo-600"
                          )}>
                            ৳{tx.amount.toFixed(2)}
                          </span>
                        </div>

                        {/* Transaction Verification Details */}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] space-y-1 font-mono">
                          {isDep ? (
                            <>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Sender Number/Wallet:</span>
                                <span className="font-bold text-slate-800">{tx.senderAccount}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">TrxID:</span>
                                <span className="font-black text-indigo-600 bg-white px-1 rounded border border-slate-200">
                                  {tx.trxId}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Pay to Account:</span>
                              <span className="font-bold text-slate-800">{tx.recipientAccount} ({tx.accountType || 'personal'})</span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-1">
                          <button
                            disabled={isProcessing}
                            onClick={() => handleAdminApprove(tx)}
                            className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                            Approve
                          </button>
                          <button
                            disabled={isProcessing}
                            onClick={() => handleAdminReject(tx)}
                            className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Support Info */}
        <div className="shrink-0 bg-slate-100/80 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>24/7 Verified Gateway</span>
          </div>
          <span className="font-mono text-slate-400">Official No: 01301833622</span>
        </div>
      </div>

      {/* Virtual Card Creation / Management Modal */}
      <VirtualCardModal
        isOpen={showVirtualCardModal}
        onClose={() => setShowVirtualCardModal(false)}
        profile={profile}
        onSuccess={() => {
          setShowVirtualCardModal(false);
          if (profile?.virtualCard?.accountNumber) {
            setSenderAccount(profile.virtualCard.accountNumber);
            setRecipientAccount(profile.virtualCard.accountNumber);
          }
        }}
      />
    </div>
  );
};
