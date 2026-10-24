import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Bot, User, MessageCircle, AlertTriangle, ExternalLink, Trash2, Clock } from 'lucide-react';
import Fuse from 'fuse.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/src/lib/utils';
import { Card } from '@/src/components/ui/Primitives';

interface Message {
  role: 'user' | 'model';
  parts: [{ text: string }];
  timestamp: number;
  isError?: boolean;
  recommendations?: string[];
}

interface FAQ {
  id: string;
  keywords: string[];
  questions: string[];
  answer_en: string;
  answer_bn: string;
  related_en?: string[];
  related_bn?: string[];
}

interface SupportAIProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const detectLanguage = (text: string): 'bn' | 'en' => {
  const lowerText = text.toLowerCase();
  // Check for Bangla characters (Unicode range)
  const containsBangla = /[\u0980-\u09FF]/.test(text);
  if (containsBangla) return 'bn';
  
  // Heuristic for Banglish - common phonetic words and connectors
  const banglishKeywords = [
    'kivabe', 'kivaby', 'korbo', 'hoy', 'ase', 'gesi', 'bolbo', 'khulbo', 'toiri', 'kory', 'pabo', 
    'desi', 'basi', 'bhule', 'amr', 'amar', 'id', 'dhukbo', 'dhukte', 'kothay', 'kothai', 'niyom', 'dekhte',
    'kore', 'koro', 'kori', 'parbo', 'parchi', 'hocche', 'bhai', 'bro'
  ];
  const words = lowerText.split(/\s+/);
  if (words.some(word => banglishKeywords.includes(word))) return 'bn';

  return 'en';
};

const TELEGRAM_LINK = 'https://t.me/fcarenavs';

export const SupportAI: React.FC<SupportAIProps> = ({ isOpen, onClose, userId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load chat history from localStorage
  useEffect(() => {
    if (!userId) return;

    const chatKey = `fc_arena_chat_history_${userId}`;

    try {
      const savedHistory = localStorage.getItem(chatKey);
      if (savedHistory) {
        setMessages(JSON.parse(savedHistory));
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

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userInput = text.trim();
    const lang = detectLanguage(userInput);
    
    const userMessage: Message = {
      role: 'user',
      parts: [{ text: userInput }],
      timestamp: Date.now()
    };

    setMessages(prev => {
      const updated = [...prev, userMessage];
      try {
        localStorage.setItem(`fc_arena_chat_history_${userId}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }
      return updated;
    });
    
    setInput('');
    setLoading(true);

    try {
      // Load local FAQs with cache busting
      const faqResponse = await fetch(`/faqs.json?v=${Date.now()}`);
      if (!faqResponse.ok) throw new Error('Could not load knowledge base');
      const faqs: FAQ[] = await faqResponse.json();

      // Simple normalization for better matching
      const normalizedInput = userInput.replace(/[?।!()]/g, ' ').toLowerCase().trim();

      // Configure Fuse with weighting - more lenient threshold for Indic script variations
      const fuse = new Fuse<FAQ>(faqs, {
        keys: [
          { name: 'keywords', weight: 0.6 },
          { name: 'questions', weight: 0.3 },
          { name: 'id', weight: 0.1 }
        ],
        threshold: 0.4, // Slightly stricter to avoid irrelevant matches
        distance: 100,  // Lower distance to prioritize local word matches
        ignoreLocation: true,
        includeScore: true,
        shouldSort: true,
        minMatchCharLength: 2
      });

      // Simulate AI thinking for a more natural feel
      await new Promise(resolve => setTimeout(resolve, 800));

      let results = fuse.search(normalizedInput);
      
      // EXPLICIT KEYWORD BOOST: If query contains "admin" or "অ্যাডমিন", prioritize telegram_support
      if (normalizedInput.includes('admin') || normalizedInput.includes('অ্যাডমিন')) {
        const adminFaq = faqs.find(f => f.id === 'telegram_support');
        if (adminFaq) {
          // If already in results, move to top. If not, add to top.
          const adminResult = results.find(r => r.item.id === 'telegram_support');
          if (adminResult) {
            results = [adminResult, ...results.filter(r => r.item.id !== 'telegram_support')];
          } else {
            // @ts-ignore - Construct a fake result for the boost
            results = [{ item: adminFaq, score: 0 }, ...results];
          }
        }
      }

      let responseText = "";
      let showContact = false;
      let recommendations: string[] = [];

      if (results.length > 0) {
        // Find best match from local FAQ
        const bestMatch = results[0].item;
        responseText = lang === 'bn' ? bestMatch.answer_bn : bestMatch.answer_en;
        recommendations = (lang === 'bn' ? bestMatch.related_bn : bestMatch.related_en) || [];
      } else {
        // Fallback for no match - No Gemini AI as requested
        responseText = lang === 'bn' 
          ? "🤖 **আমি আপনার প্রশ্নটি ঠিক বুঝতে পারিনি**\n\nদুঃখিত, আমাদের নলেজ বেসে এই মুহূর্তে এই প্রশ্নের কোনো সরাসরি উত্তর নেই।\n\n**আপনি নিচের বিষয়গুলো চেষ্টা করতে পারেন:**\n*   প্রশ্নটি ছোট করে লিখুন (যেমন: 'কয়েন' বা 'লগইন')।\n*   সঠিক বানান ব্যবহার করুন।\n*   নিচের সাজেশনগুলো চেক করুন।\n\nযদি আপনার জরুরি সাহায্যের প্রয়োজন হয়, তবে সরাসরি আমাদের সাপোর্টে কথা বলতে পারেন।"
          : "🤖 **I couldn't find a match for your query**\n\nI'm sorry, I don't have a specific answer for that in my knowledge base.\n\n**You might want to:**\n*   Try shorter keywords (e.g., 'coins' or 'login').\n*   Check your spelling.\n*   Look at the suggestions below.\n\nFor urgent help, please contact our human support team.";
        showContact = true;
        
        // Suggest general popular topics if no match
        recommendations = lang === 'bn' 
          ? ["টুর্নামেন্টে জয়েন করব কীভাবে?", "অ্যাকাউন্ট খুলব কীভাবে?", "অ্যাডমিনের সাথে কথা বলব কীভাবে?"]
          : ["How to join?", "Account issues", "Contact Admin"];
      }

      const modelMessage: Message = {
        role: 'model',
        parts: [{ text: responseText }],
        timestamp: Date.now(),
        isError: showContact,
        recommendations: recommendations.slice(0, 3)
      };

      setMessages(prev => {
        const updated = [...prev, modelMessage];
        try {
          localStorage.setItem(`fc_arena_chat_history_${userId}`, JSON.stringify(updated));
        } catch (e) {
          console.warn('LocalStorage error:', e);
        }
        return updated;
      });

    } catch (err: any) {
      console.error('Local Chat Error:', err);
      const errorMessage: Message = {
        role: 'model',
        parts: [{ text: lang === 'bn' ? "🚨 **সিস্টেম এরর**\n\nসাপোর্ট সিস্টেম লোড করতে সমস্যা হচ্ছে। অনুগ্রহ করে আপনার ইন্টারনেট কানেকশন চেক করুন অথবা অ্যাপটি রিলোড দিন। সমস্যা সমাধান না হলে টেলিগ্রামে যোগাযোগ করুন।" : "🚨 **System Error**\n\nFailed to load the support knowledge base. Please check your internet connection or reload the app. If the problem persists, contact us on Telegram." }],
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
    <div className="fixed inset-0 z-[20001] bg-slate-950/60 backdrop-blur-md flex flex-col items-center animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="w-full h-full sm:h-[85vh] sm:max-w-lg sm:mt-[7.5vh] bg-[#f0f1f5] flex flex-col shadow-2xl relative overflow-hidden sm:rounded-[3rem] border-t sm:border border-white/50"
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
                    : "nm-inset bg-white border-white text-slate-800"
                )}>
                  <div className="prose prose-slate prose-xs max-w-none prose-p:my-1 prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-indigo-600 prose-strong:text-slate-900 prose-ul:my-1 prose-li:my-0.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.parts[0].text}
                    </ReactMarkdown>
                  </div>
                  
                  {m.role === 'model' && m.recommendations && m.recommendations.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {m.recommendations.map((rec, rIdx) => (
                        <button
                          key={rIdx}
                          onClick={() => sendMessage(rec)}
                          className="px-4 py-2 rounded-xl nm-flat bg-white text-indigo-600 text-[10px] font-bold border border-indigo-50 hover:bg-indigo-100 transition-all active:scale-95"
                        >
                          {rec}
                        </button>
                      ))}
                    </div>
                  )}
                  
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
        </div>

        {/* Input Area */}
        <div className="p-6 sm:p-8 border-t border-white/20 bg-white/50 shrink-0">
          <div className="relative flex items-center gap-3">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
              disabled={loading}
              className="flex-1 h-16 px-6 nm-inset bg-white rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-xl shrink-0 active:scale-95",
                !input.trim() || loading
                  ? "nm-flat bg-indigo-50/80 text-indigo-600 border border-indigo-100/80 cursor-not-allowed"
                  : "nm-flat bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30 active:nm-pressed"
              )}
              title="Send Message"
            >
              <Send 
                size={24} 
                className={cn(
                  "transition-colors",
                  !input.trim() || loading ? "text-indigo-600" : "text-white",
                  loading ? "animate-pulse" : ""
                )} 
              />
            </button>
          </div>
          {/* Safe area padding for mobile browsers */}
          <div className="h-6 sm:hidden" /> 
        </div>
      </motion.div>
    </div>
  );
};
