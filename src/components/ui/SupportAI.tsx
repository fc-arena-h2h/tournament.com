import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Bot, User, MessageCircle, AlertTriangle, ExternalLink, Trash2, Clock } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Card } from '@/src/components/ui/Primitives';

interface Message {
  role: 'user' | 'model';
  parts: [{ text: string }];
  timestamp: number;
  isError?: boolean;
}

interface SupportAIProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const MAX_DAILY_MESSAGES = 10;
const TELEGRAM_LINK = 'https://t.me/fcarenavs';

export const SupportAI: React.FC<SupportAIProps> = ({ isOpen, onClose, userId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load chat history and daily limit from localStorage
  useEffect(() => {
    if (!userId) return;

    const chatKey = `fc_arena_chat_history_${userId}`;
    const limitKey = `fc_arena_chat_limit_${userId}`;

    try {
      const savedHistory = localStorage.getItem(chatKey);
      if (savedHistory) {
        setMessages(JSON.parse(savedHistory));
      }
  
      const savedLimit = localStorage.getItem(limitKey);
      if (savedLimit) {
        const { count, date } = JSON.parse(savedLimit);
        const today = new Date().toDateString();
        
        if (date === today) {
          setDailyCount(count);
        } else {
          // Reset limit for new day
          setDailyCount(0);
          localStorage.setItem(limitKey, JSON.stringify({ count: 0, date: today }));
        }
      }
    } catch (e) {
      console.warn('LocalStorage load error:', e);
    }
  }, [userId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading || dailyCount >= MAX_DAILY_MESSAGES) return;

    const userMessage: Message = {
      role: 'user',
      parts: [{ text: input.trim() }],
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // Update daily limit
    const newCount = dailyCount + 1;
    setDailyCount(newCount);
    localStorage.setItem(`fc_arena_chat_limit_${userId}`, JSON.stringify({
      count: newCount,
      date: new Date().toDateString()
    }));

    // Save history
    try {
      localStorage.setItem(`fc_arena_chat_history_${userId}`, JSON.stringify(newMessages));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }

    try {
      const response = await fetch('/api/ai/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: newMessages.map(m => ({ role: m.role, parts: m.parts })) 
        })
      });

      const data = await response.json();
      
      if (data.text) {
        let text = data.text;
        let showButton = false;
        
        if (text.includes('[SHOW_CONTACT_BUTTON]')) {
          text = text.replace('[SHOW_CONTACT_BUTTON]', '').trim();
          showButton = true;
        }

        const modelMessage: Message = {
          role: 'model',
          parts: [{ text }],
          timestamp: Date.now(),
          isError: showButton
        };
        const updatedHistory = [...newMessages, modelMessage];
        setMessages(updatedHistory);
        localStorage.setItem(`fc_arena_chat_history_${userId}`, JSON.stringify(updatedHistory));
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch (err) {
      console.error('Chat Error:', err);
      // Fallback message if AI fails
      const errorMessage: Message = {
        role: 'model',
        parts: [{ text: "I'm having trouble connecting to the Arena Assistant right now. If you need immediate help, please contact our team via Telegram." }],
        timestamp: Date.now(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    if (confirm('Clear entire chat history?')) {
      setMessages([]);
      localStorage.removeItem(`fc_arena_chat_history_${userId}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-950/40 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full sm:max-w-lg bg-[#f0f1f5] rounded-t-[3rem] sm:rounded-[3rem] h-[92vh] sm:h-[85vh] flex flex-col shadow-2xl border-t-2 border-white/50 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-white/20 flex items-center justify-between shrink-0 bg-white/30">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl nm-inset bg-[#e6e6e9] flex items-center justify-center text-indigo-600">
              <Bot size={28} className="animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] block">Arena Assistant</span>
              <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">Support <span className="text-indigo-600">AI</span></h2>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button 
                onClick={clearHistory}
                className="w-11 h-11 rounded-2xl nm-flat bg-white flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors"
                title="Clear history"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button 
              onClick={onClose} 
              className="w-11 h-11 rounded-2xl nm-flat bg-white flex items-center justify-center text-slate-400 active:nm-pressed"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Usage Info */}
        <div className="px-8 py-3 bg-indigo-50/50 border-b border-indigo-100/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
              Daily Limit: {dailyCount} / {MAX_DAILY_MESSAGES}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <Clock size={10} />
            Resets at midnight
          </div>
        </div>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar custom-scrollbar"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40 space-y-4">
              <div className="w-20 h-20 rounded-[2.5rem] nm-inset flex items-center justify-center">
                <MessageCircle size={36} className="text-slate-400" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 italic">How can I help you today?</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest px-10">Ask me about tournaments, results, or features</p>
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-300",
                  m.role === 'user' ? "items-end pl-12" : "items-start pr-12"
                )}
              >
                <div className={cn(
                  "flex items-center gap-2 mb-1",
                  m.role === 'user' ? "flex-row-reverse" : ""
                )}>
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center border",
                    m.role === 'user' ? "bg-slate-100 text-slate-400" : "bg-indigo-50 text-indigo-500 border-indigo-100"
                  )}>
                    {m.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                  </div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                    {m.role === 'user' ? 'YOU' : 'ARENA AI'}
                  </span>
                </div>
                
                <div className={cn(
                  "px-5 py-4 rounded-[1.8rem] text-xs font-bold leading-relaxed shadow-sm border",
                  m.role === 'user' 
                    ? "nm-flat bg-white border-white text-slate-700" 
                    : "nm-inset bg-indigo-50/30 border-white/50 text-slate-800 italic"
                )}>
                  {m.parts[0].text}
                  
                  {m.isError && (
                    <div className="mt-4">
                      <a 
                        href={TELEGRAM_LINK}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
                      >
                        <ExternalLink size={12} /> Contact Our Team
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          
          {loading && (
            <div className="flex flex-col items-start pr-12 animate-in fade-in">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center border border-indigo-100">
                  <Bot size={12} />
                </div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">THINKING...</span>
              </div>
              <div className="px-6 py-4 rounded-[1.8rem] nm-inset bg-white border-white/50 flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              </div>
            </div>
          )}

          {dailyCount >= MAX_DAILY_MESSAGES && (
            <div className="p-6 rounded-[2rem] nm-flat bg-rose-50 border border-rose-100 space-y-4 animate-in zoom-in-95">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-lg">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">LIMIT EXCEEDED</span>
                  <p className="text-xs font-black text-slate-800 uppercase italic">Daily capacity reached</p>
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase tracking-tight">
                You have reached your limit of {MAX_DAILY_MESSAGES} messages for today. Please return tomorrow or contact our official support on Telegram for immediate assistance.
              </p>
              <a 
                href={TELEGRAM_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-xl bg-sky-500 text-white flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-500/20 active:scale-95 transition-transform"
              >
                <ExternalLink size={14} /> Contact via Telegram
              </a>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 sm:p-8 border-t border-white/20 bg-white/30 shrink-0">
          <div className="relative flex items-center gap-3">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={dailyCount >= MAX_DAILY_MESSAGES ? "Limit reached..." : "Type your message..."}
              disabled={loading || dailyCount >= MAX_DAILY_MESSAGES}
              className="w-full h-16 px-6 nm-inset bg-white rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || loading || dailyCount >= MAX_DAILY_MESSAGES}
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-xl",
                !input.trim() || loading || dailyCount >= MAX_DAILY_MESSAGES
                  ? "nm-flat bg-slate-100 text-slate-300 cursor-not-allowed"
                  : "nm-flat bg-indigo-600 text-white active:nm-pressed"
              )}
            >
              <Send size={24} className={loading ? 'animate-pulse' : ''} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
