import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, X, Bot, User, MessageCircle, ExternalLink, Trash2 } from 'lucide-react';
import Fuse from 'fuse.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/src/lib/utils';

interface Message {
  role: 'user' | 'model';
  parts: [{ text: string }];
  timestamp: number;
  isError?: boolean;
  confidenceTier?: number;
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

const TELEGRAM_LINK = 'https://t.me/fcarenavs';

const detectLanguage = (text: string): 'bn' | 'en' => {
  const lowerText = text.toLowerCase();
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';

  const banglishKeywords = [
    'kivabe', 'kivaby', 'korbo', 'hoy', 'ase', 'gesi', 'bolbo', 'khulbo', 'toiri', 'kory', 'pabo',
    'desi', 'basi', 'bhule', 'amr', 'amar', 'dhukbo', 'dhukte', 'kothay', 'kothai', 'niyom', 'dekhte',
    'kore', 'koro', 'kori', 'parbo', 'parchi', 'hocche', 'bhai', 'bro', 'khelbo', 'jabo', 'dibo',
    'keno', 'sathe', 'protipokkho', 'taka', 'namabo', 'khujbo'
  ];
  const words = lowerText.split(/\s+/);
  if (words.some(word => banglishKeywords.includes(word))) return 'bn';

  return 'en';
};

// Stop-words that frame a question but do NOT define the core topic
const STOP_WORDS = new Set([
  // Bengali stop words
  'কিভাবে', 'করব', 'করে', 'কি', 'হয়', 'হয়', 'হবে', 'যায়', 'যায়', 'বলব', 'দেব', 'পাব',
  'কোথায়', 'কোথায়', 'কখন', 'কেন', 'সাথে', 'এর', 'তে', 'এ', 'থেকে', 'জন্য', 'আমার', 'আমি',
  'কে', 'কাকে', 'কোন', 'কোনো', 'একটি', 'একটা', 'টা', 'টি', 'গুলো', 'গুলা', 'দিয়ে', 'দিয়ে',
  'হলে', 'করলে', 'গেলে', 'না', 'নিয়ম', 'নিয়ম', 'উপায়', 'উপায়', 'চাই', 'পারি', 'পারব',
  // Banglish stop words
  'kivabe', 'korbo', 'kore', 'ki', 'hoy', 'hobe', 'bolbo', 'dibo', 'pabo', 'kothay', 'keno',
  'sathe', 'er', 'amar', 'ami', 'diye', 'hole', 'korle', 'gele', 'na', 'niyom', 'chai', 'parbo',
  'kory', 'jabe', 'jay', 'ache', 'ase', 'theke', 'jonno',
  // English stop words
  'how', 'to', 'what', 'is', 'are', 'can', 'i', 'do', 'in', 'the', 'my', 'a', 'an', 'for',
  'with', 'from', 'where', 'when', 'why', 'does', 'will', 'should', 'of', 'on', 'at', 'by', 'or', 'and'
]);

// Normalize text and unify common Bengali/Banglish spelling variants
const normalizeText = (raw: string): string => {
  let s = raw
    .toLowerCase()
    .replace(/[?।!,.()\-/'"`:;[\]{}]/g, ' ')
    // Unify yo-phola / nukta variations
    .replace(/য়/g, 'য়')
    .replace(/ড়/g, 'ড়')
    .replace(/ঢ়/g, 'ঢ়')
    // Common Bengali spelling normalization
    .replace(/কীভাবে/g, 'কিভাবে')
    .replace(/কী/g, 'কি')
    .replace(/রিজাল্ট/g, 'রেজাল্ট')
    .replace(/এডমিন/g, 'অ্যাডমিন')
    .replace(/একাউন্ট|একউন্ট/g, 'অ্যাকাউন্ট')
    .replace(/জয়েন/g, 'জয়েন')
    .replace(/পয়েন্ট/g, 'পয়েন্ট')
    .replace(/কয়েন/g, 'কয়েন')
    .replace(/প্লেয়ার/g, 'প্লেয়ার')
    .replace(/এড/g, 'অ্যাড')
    .replace(/লিংক/g, 'লিঙ্ক')
    .replace(/ডিপ্লয়/g, 'ডিপ্লয়')
    .replace(/ইনভাইটেশন/g, 'ইনভিটেশন')
    .replace(/অপোনেন্ট/g, 'প্রতিপক্ষ')
    .replace(/protipokkho|protipokkher/g, 'opponent')
    .replace(/করবো/g, 'করব')
    .replace(/বলবো/g, 'বলব')
    .replace(/দেবো/g, 'দেব')
    .replace(/পাবো/g, 'পাব')
    .replace(/নিব|নেবো/g, 'নেব')
    .replace(/খুজব|খুঁজবো/g, 'খুঁজব')
    .replace(/kivaby|kebabe|ki vabe/g, 'kivabe')
    .replace(/passward/g, 'password')
    .replace(/\s+/g, ' ')
    .trim();

  return s;
};

// Strip common Bengali/English inflectional suffixes to get the root stem for token matching
const stemToken = (token: string): string => {
  if (token.length <= 3) return token;
  return token
    .replace(/(গুলোর|গুলো|দেরকে|দের|গুলোকে|টির|টাকে|টিতে|াতে|েতে|য়ের|য়ের|ের|তে|কে|রা|য়ে|য়ে)$/u, '')
    .replace(/(ing|ed|es|s)$/i, '') || token;
};

// Extract core (non-stopword) tokens and all tokens
const tokenize = (normalized: string) => {
  const allTokens = normalized.split(' ').filter(Boolean);
  const coreTokens = allTokens.filter(t => !STOP_WORDS.has(t));
  const stemmedCore = coreTokens.map(stemToken);
  return { allTokens, coreTokens, stemmedCore };
};

// Character bigram Dice similarity (0 to 1)
const getBigramSimilarity = (a: string, b: string): number => {
  const s1 = a.replace(/\s+/g, '');
  const s2 = b.replace(/\s+/g, '');
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams1.get(bg) || 0;
    if (count > 0) {
      bigrams1.set(bg, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (s1.length - 1 + (s2.length - 1));
};

// Check if two stemmed tokens match (exact or strong root prefix/inclusion)
const tokensMatch = (t1: string, t2: string): boolean => {
  if (t1 === t2) return true;
  const r1 = stemToken(t1);
  const r2 = stemToken(t2);
  if (r1 === r2 && r1.length >= 2) return true;
  if (r1.length >= 4 && r2.length >= 4) {
    if (r1.includes(r2) || r2.includes(r1)) return true;
  }
  return false;
};

// Compute token overlap score (0 to 100) between query tokens and target tokens
const computeTokenMatchPercentage = (queryTokens: string[], targetTokens: string[]): number => {
  if (queryTokens.length === 0 || targetTokens.length === 0) return 0;

  let matchedQueryCount = 0;
  for (const qt of queryTokens) {
    if (targetTokens.some(tt => tokensMatch(qt, tt))) {
      matchedQueryCount++;
    }
  }

  let matchedTargetCount = 0;
  for (const tt of targetTokens) {
    if (queryTokens.some(qt => tokensMatch(qt, tt))) {
      matchedTargetCount++;
    }
  }

  const queryRecall = matchedQueryCount / queryTokens.length;
  const targetPrecision = matchedTargetCount / targetTokens.length;

  // Weight query coverage higher so all words typed by user must be satisfied
  return (queryRecall * 0.72 + targetPrecision * 0.28) * 100;
};

// Subject conflict penalty to prevent false positives on similar sentence structures
const getSubjectConflictPenalty = (normalizedQuery: string, faqId: string): number => {
  const hasOpponent = /(প্রতিপক্ষ|opponent|অপোনেন্ট|লবি|lobby)/.test(normalizedQuery);
  const hasAdmin = /(অ্যাডমিন|admin|টেলিগ্রাম|telegram|সাপোর্ট|support)/.test(normalizedQuery);
  const hasAccount = /(অ্যাকাউন্ট|account|রেজিস্ট্রেশন|sign up|id khulbo|আইডি খুলব)/.test(normalizedQuery);
  const hasTournament = /(টুর্নামেন্ট|tournament|কাপ|cup|হোস্ট|host)/.test(normalizedQuery);
  const hasCoin = /(কয়েন|coin|টপ আপ|top up|রিচার্জ|recharge)/.test(normalizedQuery);
  const hasPrize = /(পুরস্কার|প্রাইজ|prize|জিতলে টাকা|উইথড্র)/.test(normalizedQuery);

  // Never confuse talking to opponent with talking to admin support
  if (hasOpponent && !hasAdmin && faqId === 'telegram_support') return 55;
  if (hasAdmin && !hasOpponent && (faqId === 'match_chat' || faqId === 'opponent_not_responding')) return 55;

  // Never confuse creating an account with creating a tournament
  if (hasAccount && !hasTournament && faqId === 'create_tournament') return 45;
  if (hasTournament && !hasAccount && faqId === 'create_account') return 45;

  // Never confuse joining a tournament with joining the moderator team
  if (hasTournament && faqId === 'moderator') return 45;

  // Never confuse adding coins with adding players or prize money
  if (hasCoin && !hasPrize && (faqId === 'add_players' || faqId === 'prize_money')) return 40;

  return 0;
};

// Compute final similarity percentage (0 - 100) for a single FAQ entry
const evaluateFaqConfidence = (
  normalizedQuery: string,
  queryData: ReturnType<typeof tokenize>,
  faq: FAQ,
  fuseScoreMap: Map<string, number>
): number => {
  const penalty = getSubjectConflictPenalty(normalizedQuery, faq.id);
  let maxScore = 0;

  // 1. Check against all FAQ questions
  for (const q of faq.questions) {
    const normQ = normalizeText(q);

    // 100% Exact Normalized Question Match
    if (normQ === normalizedQuery) {
      return Math.max(0, 100 - penalty);
    }

    const qData = tokenize(normQ);

    // Core token match (ignoring filler stop-words like কিভাবে/করব)
    const coreScore =
      queryData.coreTokens.length > 0 && qData.coreTokens.length > 0
        ? computeTokenMatchPercentage(queryData.coreTokens, qData.coreTokens)
        : computeTokenMatchPercentage(queryData.allTokens, qData.allTokens);

    // Full token match (including question framing words)
    const allTokenScore = computeTokenMatchPercentage(queryData.allTokens, qData.allTokens);

    // Character bigram similarity
    const bigramScore = getBigramSimilarity(normalizedQuery, normQ) * 100;

    // If all core subject tokens match 100% and both have at least 1 core token
    let combinedQuestionScore = 0;
    if (coreScore >= 99 && queryData.coreTokens.length >= 1) {
      combinedQuestionScore = Math.min(100, 92 + allTokenScore * 0.08);
    } else {
      combinedQuestionScore = coreScore * 0.65 + allTokenScore * 0.2 + bigramScore * 0.15;
    }

    if (combinedQuestionScore > maxScore) {
      maxScore = combinedQuestionScore;
    }
  }

  // 2. Check against FAQ keywords
  let matchedKeywordsCount = 0;
  let bestSingleKeywordScore = 0;

  for (const kw of faq.keywords) {
    const normKw = normalizeText(kw);
    if (!normKw) continue;

    // Exact match with a keyword
    if (normKw === normalizedQuery) {
      return Math.max(0, 100 - penalty);
    }

    const kwData = tokenize(normKw);

    // Direct phrase inclusion inside user query
    if (normKw.length >= 3 && normalizedQuery.includes(normKw)) {
      matchedKeywordsCount++;
      const phraseScore = kwData.coreTokens.length >= 2 ? 94 : 84;
      if (phraseScore > bestSingleKeywordScore) {
        bestSingleKeywordScore = phraseScore;
      }
    } else if (queryData.coreTokens.length > 0 && kwData.coreTokens.length > 0) {
      const kwCoreMatch = computeTokenMatchPercentage(queryData.coreTokens, kwData.coreTokens);
      if (kwCoreMatch >= 95 && kwData.coreTokens.length >= 2) {
        bestSingleKeywordScore = Math.max(bestSingleKeywordScore, 92);
      } else if (kwCoreMatch >= 80) {
        bestSingleKeywordScore = Math.max(bestSingleKeywordScore, kwCoreMatch * 0.9);
      }
    }
  }

  // Multi-keyword boost when user's query hits multiple domain keywords of the same FAQ
  if (matchedKeywordsCount >= 2) {
    bestSingleKeywordScore = Math.min(98, bestSingleKeywordScore + (matchedKeywordsCount - 1) * 5);
  }

  maxScore = Math.max(maxScore, bestSingleKeywordScore);

  // 3. Blend with Fuse.js fuzzy score for minor typos
  const fuseRawScore = fuseScoreMap.get(faq.id);
  if (fuseRawScore !== undefined) {
    // Fuse score is 0 (perfect) to 1 (mismatch)
    const fuseConfidence = Math.max(0, (1 - fuseRawScore) * 100);
    if (maxScore >= 65) {
      maxScore = Math.max(maxScore, maxScore * 0.85 + fuseConfidence * 0.15);
    } else {
      maxScore = Math.max(maxScore, fuseConfidence * 0.85);
    }
  }

  return Math.max(0, Math.min(100, Math.round(maxScore - penalty)));
};

// Cascading Tiered Matcher: 100% -> 90% -> 80% -> 70% -> Fallback (<70%)
const findBestFaqByTier = (
  userInput: string,
  faqs: FAQ[]
): { matchedFaq: FAQ | null; confidence: number; matchedTier: 100 | 90 | 80 | 70 | 0 } => {
  const normalizedQuery = normalizeText(userInput);
  if (!normalizedQuery) {
    return { matchedFaq: null, confidence: 0, matchedTier: 0 };
  }

  const queryData = tokenize(normalizedQuery);

  const fuse = new Fuse<FAQ>(faqs, {
    keys: [
      { name: 'questions', weight: 0.55 },
      { name: 'keywords', weight: 0.45 }
    ],
    threshold: 0.35,
    distance: 100,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2
  });

  const fuseResults = fuse.search(normalizedQuery);
  const fuseScoreMap = new Map<string, number>();
  for (const r of fuseResults) {
    if (r.score !== undefined) {
      fuseScoreMap.set(r.item.id, r.score);
    }
  }

  const scoredFaqs = faqs
    .map(faq => ({
      faq,
      confidence: evaluateFaqConfidence(normalizedQuery, queryData, faq, fuseScoreMap)
    }))
    .sort((a, b) => b.confidence - a.confidence);

  // Cascading Tier Check: 100% -> 90% -> 80% -> 70%
  const tiers: Array<{ threshold: number; label: 100 | 90 | 80 | 70 }> = [
    { threshold: 98, label: 100 }, // 100% Tier (Exact / near-exact intent match)
    { threshold: 90, label: 90 },  // 90% Tier
    { threshold: 80, label: 80 },  // 80% Tier
    { threshold: 70, label: 70 }   // 70% Tier
  ];

  for (const tier of tiers) {
    const candidate = scoredFaqs.find(item => item.confidence >= tier.threshold);
    if (candidate) {
      return {
        matchedFaq: candidate.faq,
        confidence: tier.label === 100 ? 100 : candidate.confidence,
        matchedTier: tier.label
      };
    }
  }

  // Below 70% -> Do NOT return any uncertain answer; direct user to Telegram Support
  return {
    matchedFaq: null,
    confidence: scoredFaqs[0]?.confidence || 0,
    matchedTier: 0
  };
};

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
      const baseUrl = import.meta.env.BASE_URL || '/';
      const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const faqResponse = await fetch(`${cleanBase}faqs.json?v=${Date.now()}`);
      if (!faqResponse.ok) throw new Error('Could not load knowledge base');
      const faqs: FAQ[] = await faqResponse.json();

      await new Promise(resolve => setTimeout(resolve, 450));

      const { matchedFaq, matchedTier } = findBestFaqByTier(userInput, faqs);

      let responseText = '';
      let showContact = false;
      let recommendations: string[] = [];

      if (matchedFaq && matchedTier >= 70) {
        responseText = lang === 'bn' ? matchedFaq.answer_bn : matchedFaq.answer_en;
        recommendations = (lang === 'bn' ? matchedFaq.related_bn : matchedFaq.related_en) || [];
      } else {
        // Below 70% confidence -> Instruct user to contact Telegram Support
        responseText =
          lang === 'bn'
            ? "🤖 **আপনার প্রশ্নটির সাথে আমাদের ডাটাবেসের ৭০% বা তার বেশি মিল পাওয়া যায়নি।**\n\nভুল তথ্য এড়াতে আমি অনুমানের ভিত্তিতে কোনো উত্তর দিচ্ছি না। আপনার এই বিষয়টির সঠিক ও দ্রুত সমাধানের জন্য অনুগ্রহ করে সরাসরি আমাদের অফিসিয়াল **টেলিগ্রাম সাপোর্ট সিস্টেমে** যোগাযোগ করুন।\n\n🔗 **টেলিগ্রাম সাপোর্ট:** [https://t.me/fcarenavs](https://t.me/fcarenavs)\n\n💡 **অথবা নিচের জনপ্রিয় প্রশ্নগুলো থেকে আপনার কাঙ্ক্ষিত বিষয়টি বেছে নিতে পারেন:**"
            : "🤖 **Your query did not reach our 70% confidence threshold.**\n\nTo avoid giving you an inaccurate answer, please contact our official **Telegram Support System** directly for human assistance.\n\n🔗 **Telegram Support:** [https://t.me/fcarenavs](https://t.me/fcarenavs)\n\n💡 **Or select one of the popular topics below:**";
        showContact = true;
        recommendations =
          lang === 'bn'
            ? [
                'টুর্নামেন্টে জয়েন করব কীভাবে?',
                'প্রতিপক্ষের সাথে কীভাবে কথা বলব?',
                'ম্যাচ রিজাল্ট কীভাবে দেব?'
              ]
            : [
                'How to join a tournament?',
                'How to talk to opponent?',
                'How to upload match result?'
              ];
      }

      const modelMessage: Message = {
        role: 'model',
        parts: [{ text: responseText }],
        timestamp: Date.now(),
        isError: showContact,
        confidenceTier: matchedTier,
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
        parts: [
          {
            text:
              lang === 'bn'
                ? '🚨 **সিস্টেম এরর**\n\nসাপোর্ট সিস্টেম লোড করতে সমস্যা হচ্ছে। অনুগ্রহ করে আপনার ইন্টারনেট কানেকশন চেক করুন অথবা সরাসরি আমাদের টেলিগ্রাম সাপোর্টে যোগাযোগ করুন।'
                : '🚨 **System Error**\n\nFailed to load the support knowledge base. Please check your internet connection or contact us directly on Telegram.'
          }
        ],
        timestamp: Date.now(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(`fc_arena_chat_history_${userId}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[20001] bg-slate-950/60 backdrop-blur-md flex flex-col items-center animate-in fade-in duration-300">
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="w-full h-full sm:h-[85vh] sm:max-w-lg sm:mt-[7.5vh] bg-[#f0f1f5] flex flex-col shadow-2xl relative overflow-hidden sm:rounded-[3rem] border-t sm:border border-white/50"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-white/20 flex items-center justify-between shrink-0 bg-white/30">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl nm-inset bg-[#e6e6e9] flex items-center justify-center text-indigo-600">
              <Bot size={28} className="animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] block">
                Arena Assistant
              </span>
              <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">
                Support <span className="text-indigo-600">AI</span>
              </h2>
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
            <div className="h-full flex flex-col items-center justify-center text-center space-y-5">
              <div className="w-20 h-20 rounded-[2.5rem] nm-inset flex items-center justify-center opacity-50">
                <MessageCircle size={36} className="text-slate-400" />
              </div>
              <div className="space-y-1 opacity-60">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 italic">
                  How can I help you today?
                </p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest px-10">
                  Ask me about tournaments, results, opponents, or rules
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 px-4 pt-2">
                {[
                  'টুর্নামেন্টে জয়েন করব কীভাবে?',
                  'প্রতিপক্ষের সাথে কীভাবে কথা বলব?',
                  'ম্যাচ রিজাল্ট কীভাবে দেব?',
                  'ইনভিটেশন কোড কীভাবে দেব?'
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="px-3.5 py-2 rounded-xl nm-flat bg-white text-indigo-600 text-[10px] font-bold border border-indigo-50 hover:bg-indigo-50 transition-all active:scale-95"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-300',
                  m.role === 'user' ? 'items-end pl-12' : 'items-start pr-12'
                )}
              >
                <div
                  className={cn(
                    'flex items-center gap-2 mb-1',
                    m.role === 'user' ? 'flex-row-reverse' : ''
                  )}
                >
                  <div
                    className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center border',
                      m.role === 'user'
                        ? 'bg-slate-100 text-slate-400'
                        : 'bg-indigo-50 text-indigo-500 border-indigo-100'
                    )}
                  >
                    {m.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                  </div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                    {m.role === 'user' ? 'YOU' : 'ARENA AI'}
                  </span>
                </div>

                <div
                  className={cn(
                    'px-5 py-4 rounded-[1.8rem] text-xs font-bold leading-relaxed shadow-sm border',
                    m.role === 'user'
                      ? 'nm-flat bg-white border-white text-slate-700'
                      : 'nm-inset bg-white border-white text-slate-800'
                  )}
                >
                  <div className="prose prose-slate prose-xs max-w-none prose-p:my-1 prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-indigo-600 prose-strong:text-slate-900 prose-ul:my-1 prose-li:my-0.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.parts[0].text}</ReactMarkdown>
                  </div>

                  {m.role === 'model' && m.recommendations && m.recommendations.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {m.recommendations.map((rec, rIdx) => (
                        <button
                          key={rIdx}
                          onClick={() => sendMessage(rec)}
                          className="px-4 py-2 rounded-xl nm-flat bg-white text-indigo-600 text-[10px] font-bold border border-indigo-50 hover:bg-indigo-100 transition-all active:scale-95 text-left"
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
                        <ExternalLink size={12} /> Contact Telegram Support
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
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                  THINKING...
                </span>
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
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
              disabled={loading}
              className="flex-1 h-16 px-6 nm-inset bg-white rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-xl shrink-0 active:scale-95',
                !input.trim() || loading
                  ? 'nm-flat bg-indigo-50/80 text-indigo-600 border border-indigo-100/80 cursor-not-allowed'
                  : 'nm-flat bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30 active:nm-pressed'
              )}
              title="Send Message"
            >
              <Send
                size={24}
                className={cn(
                  'transition-colors',
                  !input.trim() || loading ? 'text-indigo-600' : 'text-white',
                  loading ? 'animate-pulse' : ''
                )}
              />
            </button>
          </div>
          <div className="h-6 sm:hidden" />
        </div>
      </motion.div>
    </div>
  );
};
