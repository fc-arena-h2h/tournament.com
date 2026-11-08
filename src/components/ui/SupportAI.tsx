import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Send,
  X,
  Bot,
  User,
  MessageCircle,
  ExternalLink,
  Trash2,
  Sparkles,
  Copy,
  Check,
  ChevronRight,
  ShieldCheck,
  Zap,
  HelpCircle
} from 'lucide-react';
import Fuse from 'fuse.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/src/lib/utils';
import { FAQItem, buildExpandedKnowledgeBase } from '@/src/lib/supportKnowledgeEngine';

interface Message {
  id: string;
  role: 'user' | 'model';
  parts: [{ text: string }];
  timestamp: number;
  isError?: boolean;
  confidenceTier?: number;
  badgeText?: string;
  recommendations?: string[];
  isStreaming?: boolean;
}

interface SupportAIProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const TELEGRAM_LINK = 'https://t.me/fcarenavs';

const QUICK_CATEGORY_TABS = [
  {
    id: 'popular',
    label: '🔥 Popular',
    questions: [
      'টুর্নামেন্টে জয়েন করব কীভাবে?',
      'How does screenshot OCR verification work?',
      'প্লেয়ারের নামের ওপর ক্লিক করলে কী দেখা যায়?',
      'How to talk to opponent?',
      'ম্যাচ রিজাল্ট কীভাবে দেব?',
      'How to use invitation key?'
    ]
  },
  {
    id: 'matches',
    label: '⚽ Matches & OCR',
    questions: [
      '১-ম্যাচ এবং ২-ম্যাচ (Home & Away) ডিপ্লয়ের পার্থক্য কী?',
      'How to set match deadline during Auto Match Deploy?',
      'পয়েন্ট টেবিল কীভাবে কাজ করে?',
      'What are the rules for Knockout Draw or Penalty?',
      'প্রতিপক্ষ ভুল স্কোর বা রেজাল্ট দিলে কী করব?',
      'Why can\'t I see the button to upload my match result?'
    ]
  },
  {
    id: 'hosting',
    label: '🏆 Hosting & Prizes',
    questions: [
      'টুর্নামেন্ট তৈরি করব কীভাবে?',
      'Why does Prize Pool show \'Please type your currency type BDT or USDT\'?',
      'টুর্নামেন্ট তৈরির অ্যাক্টিভেশন কী (Activation Key) কোথায় পাব?',
      'When does a tournament show the END status and Champion banner?',
      'পুরস্কারের টাকা কীভাবে পাব?',
      'How do players move to the next round?'
    ]
  },
  {
    id: 'account',
    label: '👤 Account & App',
    questions: [
      'রেজিস্ট্রেশন করার সময় Player এবং Host অপশনের পার্থক্য কী?',
      'Why does the In-Game UID box only accept numbers?',
      'রেজিস্ট্রেশন করার সময় ফেসবুক লিঙ্ক নিচ্ছে না কেন?',
      'How to switch between Light Mode and Dark Glass Mode?',
      'অ্যাপ আপডেট পপআপে Telegram এবং Google Chrome বাটনের কাজ কী?',
      'Where to find FC Mobile UID?'
    ]
  }
];

const detectLanguage = (text: string): 'bn' | 'en' => {
  const lowerText = text.toLowerCase();
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';

  const banglishKeywords = [
    'kivabe', 'kivaby', 'korbo', 'hoy', 'ase', 'gesi', 'bolbo', 'khulbo', 'toiri', 'kory', 'pabo',
    'desi', 'basi', 'bhule', 'amr', 'amar', 'dhukbo', 'dhukte', 'kothay', 'kothai', 'niyom', 'dekhte',
    'kore', 'koro', 'kori', 'parbo', 'parchi', 'hocche', 'bhai', 'bro', 'khelbo', 'jabo', 'dibo',
    'keno', 'sathe', 'protipokkho', 'taka', 'namabo', 'khujbo', 'mane', 'ki', 'kon', 'koto', 'lagbe'
  ];
  const words = lowerText.split(/\s+/);
  if (words.some(word => banglishKeywords.includes(word))) return 'bn';

  return 'en';
};

// Stop-words that frame a question but do NOT define the core topic
const STOP_WORDS = new Set([
  'কিভাবে', 'করব', 'করে', 'কি', 'হয়', 'হয়', 'হবে', 'যায়', 'যায়', 'বলব', 'দেব', 'পাব',
  'কোথায়', 'কোথায়', 'কখন', 'কেন', 'সাথে', 'এর', 'তে', 'এ', 'থেকে', 'জন্য', 'আমার', 'আমি',
  'কে', 'কাকে', 'কোন', 'কোনো', 'একটি', 'একটা', 'টা', 'টি', 'গুলো', 'গুলা', 'দিয়ে', 'দিয়ে',
  'হলে', 'করলে', 'গেলে', 'না', 'নিয়ম', 'নিয়ম', 'উপায়', 'উপায়', 'চাই', 'পারি', 'পারব',
  'একটু', 'বলবেন', 'ভাই', 'প্লিজ', 'জানতে', 'বলুন', 'দেখায়', 'দেখায়', 'উঠছে', 'আসছে',
  'kivabe', 'korbo', 'kore', 'ki', 'hoy', 'hobe', 'bolbo', 'dibo', 'pabo', 'kothay', 'keno',
  'sathe', 'er', 'amar', 'ami', 'diye', 'hole', 'korle', 'gele', 'na', 'niyom', 'chai', 'parbo',
  'kory', 'jabe', 'jay', 'ache', 'ase', 'theke', 'jonno', 'bhai', 'plz', 'please', 'ekto',
  'how', 'to', 'what', 'is', 'are', 'can', 'i', 'do', 'in', 'the', 'my', 'a', 'an', 'for',
  'with', 'from', 'where', 'when', 'why', 'does', 'will', 'should', 'of', 'on', 'at', 'by', 'or', 'and'
]);

// Normalize text and unify common Bengali/Banglish/English synonyms
const normalizeText = (raw: string): string => {
  const s = raw
    .toLowerCase()
    .replace(/[?।!,.()\-/'"`:;[\]{}]/g, ' ')
    .replace(/য়/g, 'য়')
    .replace(/ড়/g, 'ড়')
    .replace(/ঢ়/g, 'ঢ়')
    .replace(/কীভাবে/g, 'কিভাবে')
    .replace(/কী/g, 'কি')
    .replace(/রিজাল্ট|রেজালট/g, 'রেজাল্ট')
    .replace(/এডমিন/g, 'অ্যাডমিন')
    .replace(/একাউন্ট|একউন্ট/g, 'অ্যাকাউন্ট')
    .replace(/জয়েন/g, 'জয়েন')
    .replace(/পয়েন্ট/g, 'পয়েন্ট')
    .replace(/কয়েন/g, 'কয়েন')
    .replace(/প্লেয়ার|পেলেয়ার|পেলেয়ার/g, 'প্লেয়ার')
    .replace(/এড/g, 'অ্যাড')
    .replace(/লিংক/g, 'লিঙ্ক')
    .replace(/ডিপ্লয়|ডিপ্লাই/g, 'ডিপ্লয়')
    .replace(/ইনভাইটেশন/g, 'ইনভিটেশন')
    .replace(/অপোনেন্ট/g, 'প্রতিপক্ষ')
    .replace(/ডেট লাইন|ডেড লাইন/g, 'ডেডলাইন')
    .replace(/আফশানাল/g, 'অপশনাল')
    .replace(/স্কিনশট|স্ক্রিন শট/g, 'স্ক্রিনশট')
    .replace(/protipokkho|protipokkher/g, 'opponent')
    .replace(/করবো/g, 'করব')
    .replace(/বলবো/g, 'বলব')
    .replace(/দেবো|দিবো/g, 'দেব')
    .replace(/পাবো/g, 'পাব')
    .replace(/নিব|নেবো/g, 'নেব')
    .replace(/খুজব|খুঁজবো/g, 'খুঁজব')
    .replace(/দেখবো/g, 'দেখব')
    .replace(/kivaby|kebabe|ki vabe/g, 'kivabe')
    .replace(/passward/g, 'password')
    .replace(/\s+/g, ' ')
    .trim();

  return s;
};

const stemToken = (token: string): string => {
  if (token.length <= 3) return token;
  return (
    token
      .replace(/(গুলোর|গুলো|দেরকে|দের|গুলোকে|টির|টাকে|টিতে|াতে|েতে|য়ের|য়ের|ের|তে|কে|রা|য়ে|য়ে)$/u, '')
      .replace(/(ing|ed|es|s)$/i, '') || token
  );
};

const tokenize = (normalized: string) => {
  const allTokens = normalized.split(' ').filter(Boolean);
  const coreTokens = allTokens.filter(t => !STOP_WORDS.has(t));
  const stemmedCore = coreTokens.map(stemToken);
  return { allTokens, coreTokens, stemmedCore };
};

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

  return (queryRecall * 0.72 + targetPrecision * 0.28) * 100;
};

const getSubjectConflictPenalty = (normalizedQuery: string, faqId: string): number => {
  const hasOpponent = /(প্রতিপক্ষ|opponent|অপোনেন্ট|লবি|lobby)/.test(normalizedQuery);
  const hasAdmin = /(অ্যাডমিন|admin|টেলিগ্রাম|telegram|সাপোর্ট|support)/.test(normalizedQuery);
  const hasAccount = /(অ্যাকাউন্ট|account|রেজিস্ট্রেশন|sign up|id khulbo|আইডি খুলব)/.test(normalizedQuery);
  const hasTournament = /(টুর্নামেন্ট|tournament|কাপ|cup|হোস্ট|host)/.test(normalizedQuery);
  const hasCoin = /(কয়েন|coin|টপ আপ|top up|রিচার্জ|recharge)/.test(normalizedQuery);
  const hasPrize = /(পুরস্কার|প্রাইজ|prize|জিতলে টাকা|উইথড্র|bdt|usdt)/.test(normalizedQuery);

  if (hasOpponent && !hasAdmin && faqId === 'telegram_support') return 55;
  if (hasAdmin && !hasOpponent && (faqId === 'match_chat' || faqId === 'opponent_not_responding')) return 55;
  if (hasAccount && !hasTournament && faqId === 'create_tournament') return 45;
  if (hasTournament && !hasAccount && faqId === 'create_account') return 45;
  if (hasTournament && faqId === 'moderator') return 45;
  if (hasCoin && !hasPrize && (faqId === 'add_players' || faqId === 'prize_money')) return 40;

  return 0;
};

const evaluateFaqConfidence = (
  normalizedQuery: string,
  queryData: ReturnType<typeof tokenize>,
  faq: FAQItem,
  fuseScoreMap: Map<string, number>,
  lastTopicId?: string | null
): number => {
  const penalty = getSubjectConflictPenalty(normalizedQuery, faq.id);
  let maxScore = 0;

  for (const q of faq.questions) {
    const normQ = normalizeText(q);
    if (normQ === normalizedQuery) {
      return Math.max(0, 100 - penalty);
    }

    const qData = tokenize(normQ);
    const coreScore =
      queryData.coreTokens.length > 0 && qData.coreTokens.length > 0
        ? computeTokenMatchPercentage(queryData.coreTokens, qData.coreTokens)
        : computeTokenMatchPercentage(queryData.allTokens, qData.allTokens);

    const allTokenScore = computeTokenMatchPercentage(queryData.allTokens, qData.allTokens);
    const bigramScore = getBigramSimilarity(normalizedQuery, normQ) * 100;

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

  let matchedKeywordsCount = 0;
  let bestSingleKeywordScore = 0;

  for (const kw of faq.keywords) {
    const normKw = normalizeText(kw);
    if (!normKw) continue;

    if (normKw === normalizedQuery) {
      return Math.max(0, 100 - penalty);
    }

    const kwData = tokenize(normKw);
    if (normKw.length >= 3 && normalizedQuery.includes(normKw)) {
      matchedKeywordsCount++;
      const phraseScore = kwData.coreTokens.length >= 2 ? 95 : 86;
      if (phraseScore > bestSingleKeywordScore) {
        bestSingleKeywordScore = phraseScore;
      }
    } else if (queryData.coreTokens.length > 0 && kwData.coreTokens.length > 0) {
      const kwCoreMatch = computeTokenMatchPercentage(queryData.coreTokens, kwData.coreTokens);
      if (kwCoreMatch >= 95 && kwData.coreTokens.length >= 2) {
        bestSingleKeywordScore = Math.max(bestSingleKeywordScore, 93);
      } else if (kwCoreMatch >= 78) {
        bestSingleKeywordScore = Math.max(bestSingleKeywordScore, kwCoreMatch * 0.92);
      }
    }
  }

  if (matchedKeywordsCount >= 2) {
    bestSingleKeywordScore = Math.min(99, bestSingleKeywordScore + (matchedKeywordsCount - 1) * 5);
  }

  maxScore = Math.max(maxScore, bestSingleKeywordScore);

  const fuseRawScore = fuseScoreMap.get(faq.id);
  if (fuseRawScore !== undefined) {
    const fuseConfidence = Math.max(0, (1 - fuseRawScore) * 100);
    if (maxScore >= 60) {
      maxScore = Math.max(maxScore, maxScore * 0.85 + fuseConfidence * 0.15);
    } else {
      maxScore = Math.max(maxScore, fuseConfidence * 0.88);
    }
  }

  // Contextual follow-up boost if related to the previous message topic
  if (lastTopicId && faq.id === lastTopicId && queryData.coreTokens.length <= 3) {
    maxScore = Math.min(100, maxScore + 8);
  }

  return Math.max(0, Math.min(100, Math.round(maxScore - penalty)));
};

const findBestFaqMatches = (
  userInput: string,
  faqs: FAQItem[],
  lastTopicId?: string | null
): {
  primaryFaq: FAQItem | null;
  secondaryFaq: FAQItem | null;
  confidence: number;
  matchedTier: 100 | 90 | 80 | 70 | 0;
  closestSuggestions: FAQItem[];
} => {
  const normalizedQuery = normalizeText(userInput);
  if (!normalizedQuery) {
    return { primaryFaq: null, secondaryFaq: null, confidence: 0, matchedTier: 0, closestSuggestions: [] };
  }

  const queryData = tokenize(normalizedQuery);

  const fuse = new Fuse<FAQItem>(faqs, {
    keys: [
      { name: 'questions', weight: 0.55 },
      { name: 'keywords', weight: 0.45 }
    ],
    threshold: 0.38,
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
      confidence: evaluateFaqConfidence(normalizedQuery, queryData, faq, fuseScoreMap, lastTopicId)
    }))
    .sort((a, b) => b.confidence - a.confidence);

  // Check if user asked a compound/multi-intent question (e.g. "টুর্নামেন্টে জয়েন করব কীভাবে আর রেজাল্ট কীভাবে দেব?")
  const isCompoundQuery = /\b(আর|এবং|ও|and|also)\b/i.test(userInput) && queryData.coreTokens.length >= 3;
  const secondaryCandidate =
    isCompoundQuery &&
    scoredFaqs[1] &&
    scoredFaqs[1].confidence >= 76 &&
    scoredFaqs[1].faq.id !== scoredFaqs[0]?.faq.id
      ? scoredFaqs[1].faq
      : null;

  const tiers: Array<{ threshold: number; label: 100 | 90 | 80 | 70 }> = [
    { threshold: 96, label: 100 },
    { threshold: 88, label: 90 },
    { threshold: 76, label: 80 },
    { threshold: 64, label: 70 }
  ];

  for (const tier of tiers) {
    const candidate = scoredFaqs.find(item => item.confidence >= tier.threshold);
    if (candidate) {
      return {
        primaryFaq: candidate.faq,
        secondaryFaq: secondaryCandidate,
        confidence: tier.label === 100 ? 100 : candidate.confidence,
        matchedTier: tier.label,
        closestSuggestions: scoredFaqs.slice(0, 3).map(s => s.faq)
      };
    }
  }

  return {
    primaryFaq: null,
    secondaryFaq: null,
    confidence: scoredFaqs[0]?.confidence || 0,
    matchedTier: 0,
    closestSuggestions: scoredFaqs.slice(0, 3).map(s => s.faq)
  };
};

export const SupportAI: React.FC<SupportAIProps> = ({ isOpen, onClose, userId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('popular');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [lastTopicId, setLastTopicId] = useState<string | null>(null);
  const [streamingTextMap, setStreamingTextMap] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const knowledgeCacheRef = useRef<FAQItem[] | null>(null);

  // Load chat history from localStorage
  useEffect(() => {
    if (!userId) return;
    const chatKey = `fc_arena_chat_history_${userId}`;
    try {
      const savedHistory = localStorage.getItem(chatKey);
      if (savedHistory) {
        const parsed: Message[] = JSON.parse(savedHistory);
        setMessages(parsed.map(m => ({ ...m, isStreaming: false })));
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
  }, [messages, loading, streamingTextMap]);

  const handleCopyMessage = (msgId: string, rawText: string) => {
    const cleanText = rawText.replace(/[*#`_~]/g, '');
    navigator.clipboard.writeText(cleanText);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const animateStreamingReply = (msgId: string, fullText: string) => {
    const words = fullText.split(' ');
    let currentIndex = 0;
    const chunkSize = Math.max(2, Math.ceil(words.length / 28));

    setStreamingTextMap(prev => ({ ...prev, [msgId]: words.slice(0, chunkSize).join(' ') }));

    const interval = setInterval(() => {
      currentIndex += chunkSize;
      if (currentIndex >= words.length) {
        clearInterval(interval);
        setStreamingTextMap(prev => {
          const next = { ...prev };
          delete next[msgId];
          return next;
        });
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, isStreaming: false } : m))
        );
      } else {
        setStreamingTextMap(prev => ({
          ...prev,
          [msgId]: words.slice(0, currentIndex).join(' ')
        }));
      }
    }, 18);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userInput = text.trim();
    const lang = detectLanguage(userInput);

    const userMessage: Message = {
      id: `user_${Date.now()}`,
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
      if (!knowledgeCacheRef.current) {
        const baseUrl = import.meta.env.BASE_URL || '/';
        const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        const faqResponse = await fetch(`${cleanBase}faqs.json?v=${Date.now()}`);
        if (!faqResponse.ok) throw new Error('Could not load knowledge base');
        const baseFaqs: FAQItem[] = await faqResponse.json();
        knowledgeCacheRef.current = buildExpandedKnowledgeBase(baseFaqs);
      }

      const faqs = knowledgeCacheRef.current;

      await new Promise(resolve => setTimeout(resolve, 320));

      const { primaryFaq, secondaryFaq, matchedTier, closestSuggestions } = findBestFaqMatches(
        userInput,
        faqs,
        lastTopicId
      );

      let responseText = '';
      let showContact = false;
      let recommendations: string[] = [];
      let badgeText = lang === 'bn' ? 'ভেরিফাইড গাইড' : 'VERIFIED GUIDE';

      if (primaryFaq && matchedTier >= 70) {
        setLastTopicId(primaryFaq.id);
        const primaryAnswer = lang === 'bn' ? primaryFaq.answer_bn : primaryFaq.answer_en;
        badgeText =
          (lang === 'bn' ? primaryFaq.badge_bn : primaryFaq.badge_en) ||
          (lang === 'bn' ? 'অ্যারেনা এআই সমাধান' : 'ARENA AI SOLUTION');

        if (secondaryFaq) {
          const secondaryAnswer = lang === 'bn' ? secondaryFaq.answer_bn : secondaryFaq.answer_en;
          responseText = `${primaryAnswer}\n\n---\n\n${secondaryAnswer}`;
        } else {
          responseText = primaryAnswer;
        }

        const bnRecs = (primaryFaq.related_bn || []).slice(0, 2);
        const enRecs = (primaryFaq.related_en || []).slice(0, 2);
        recommendations = lang === 'bn' ? [...bnRecs, ...enRecs] : [...enRecs, ...bnRecs];
      } else {
        const bnSuggestions = closestSuggestions
          .map(f => f.questions.find(q => /[\u0980-\u09FF]/.test(q)))
          .filter(Boolean) as string[];
        const enSuggestions = closestSuggestions
          .map(f => f.questions.find(q => !/[\u0980-\u09FF]/.test(q)))
          .filter(Boolean) as string[];

        responseText =
          lang === 'bn'
            ? "🤖 **আপনার প্রশ্নটি আরও নির্দিষ্ট করতে নিচের সম্পর্কিত বিষয়গুলো দেখুন**\n\nআমি **FC Arena VS**-এর টুর্নামেন্ট, ম্যাচ ডিপ্লয়মেন্ট, ওসিআর (OCR) স্ক্রিনশট ভেরিফিকেশন, প্রোফাইল ও রুলস সংক্রান্ত সব প্রশ্নের উত্তর দিতে পারি।\n\n💡 **আপনি কি নিচের কোনো বিষয় সম্পর্কে জানতে চাচ্ছেন? ট্যাপ করে সাথে সাথে উত্তর দেখুন অথবা সরাসরি আমাদের অফিসিয়াল টেলিগ্রাম সাপোর্টে যোগাযোগ করুন:**\n\n🔗 **টেলিগ্রাম সাপোর্ট:** [https://t.me/fcarenavs](https://t.me/fcarenavs)"
            : "🤖 **Let's Find the Exact Answer You Need**\n\nI am trained on all **FC Arena VS** features including tournaments, OCR screenshot verification, match deadlines, and profile rules.\n\n💡 **Tap one of the related topics below for an instant guide, or contact our official Telegram Support team directly:**\n\n🔗 **Telegram Support:** [https://t.me/fcarenavs](https://t.me/fcarenavs)";
        showContact = true;
        badgeText = lang === 'bn' ? 'সাপোর্ট ডিরেক্টরি' : 'SUPPORT DIRECTORY';
        recommendations = [
          ...(bnSuggestions.length > 0 ? bnSuggestions.slice(0, 2) : ['টুর্নামেন্টে জয়েন করব কীভাবে?', 'স্ক্রিনশট দিয়ে রেজাল্ট চেক কীভাবে কাজ করে?']),
          ...(enSuggestions.length > 0 ? enSuggestions.slice(0, 2) : ['How to join a tournament?', 'How to talk to opponent?'])
        ];
      }

      const msgId = `ai_${Date.now()}`;
      const modelMessage: Message = {
        id: msgId,
        role: 'model',
        parts: [{ text: responseText }],
        timestamp: Date.now(),
        isError: showContact,
        confidenceTier: matchedTier,
        badgeText,
        recommendations: recommendations.slice(0, 4),
        isStreaming: true
      };

      setMessages(prev => {
        const updated = [...prev, modelMessage];
        try {
          localStorage.setItem(
            `fc_arena_chat_history_${userId}`,
            JSON.stringify(updated.map(m => ({ ...m, isStreaming: false })))
          );
        } catch (e) {
          console.warn('LocalStorage error:', e);
        }
        return updated;
      });

      animateStreamingReply(msgId, responseText);
    } catch (err: any) {
      console.error('Local Chat Error:', err);
      const errorMessage: Message = {
        id: `err_${Date.now()}`,
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
    setLastTopicId(null);
    localStorage.removeItem(`fc_arena_chat_history_${userId}`);
  };

  const currentCategoryQuestions = useMemo(() => {
    return QUICK_CATEGORY_TABS.find(c => c.id === activeCategory)?.questions || QUICK_CATEGORY_TABS[0].questions;
  }, [activeCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[20001] bg-slate-950/70 dark:bg-[#070812]/85 backdrop-blur-xl flex flex-col items-center animate-in fade-in duration-300">
      <motion.div
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 80 }}
        className="w-full h-full sm:h-[88vh] sm:max-w-lg sm:mt-[6vh] bg-[#f2f4f8] dark:!bg-gradient-to-b dark:!from-[#222746] dark:!via-[#181c35] dark:!to-[#101223] flex flex-col shadow-2xl dark:shadow-[0_35px_90px_rgba(0,0,0,0.95),0_0_40px_rgba(139,92,246,0.18),inset_0_1.5px_2px_rgba(255,255,255,0.28)] relative overflow-hidden sm:rounded-[2.8rem] border-t sm:border border-white/60 dark:!border-white/22"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Specular Glass Rim Highlight */}
        <div className="hidden dark:block absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none z-20" />

        {/* Ambient Dark Glass Glow Orbs */}
        <div className="hidden dark:block absolute -top-24 -right-16 w-72 h-72 rounded-full bg-gradient-to-br from-[#ff7a45]/24 via-[#ec4899]/18 to-transparent blur-3xl pointer-events-none" />
        <div className="hidden dark:block absolute top-1/3 -left-24 w-72 h-72 rounded-full bg-gradient-to-tr from-[#8b5cf6]/22 via-[#38bdf8]/15 to-transparent blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="px-5 py-4 sm:px-7 sm:py-5 border-b border-slate-200/80 dark:!border-white/15 flex items-center justify-between shrink-0 bg-white/85 dark:!bg-gradient-to-r dark:!from-[#282e54]/95 dark:!via-[#202544]/95 dark:!to-[#191d38]/95 backdrop-blur-2xl relative z-10 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] p-[1.5px] shadow-lg shadow-indigo-500/25 dark:shadow-[#ec4899]/30">
                <div className="w-full h-full rounded-[14px] bg-white dark:bg-[#171b34] flex items-center justify-center text-indigo-600 dark:text-[#ff7a45]">
                  <Bot size={24} />
                </div>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#171b34] shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <Sparkles size={10} className="text-indigo-500 dark:text-[#ff7a45]" />
                <span className="text-[9px] font-black text-indigo-600 dark:!text-indigo-200 uppercase tracking-[0.25em] block">
                  ARENA NEURAL ASSISTANT
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:!text-white uppercase italic tracking-tight leading-tight">
                SUPPORT <span className="text-indigo-600 dark:bg-gradient-to-r dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#a855f7] dark:bg-clip-text dark:text-transparent">AI</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:!bg-[#171b34] border border-slate-200/80 dark:!border-white/20 flex items-center justify-center text-slate-500 dark:!text-slate-200 hover:text-rose-500 dark:hover:!text-rose-400 transition-all active:scale-95"
                title="Clear conversation"
              >
                <Trash2 size={17} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:!bg-[#171b34] border border-slate-200/80 dark:!border-white/20 flex items-center justify-center text-slate-500 dark:!text-slate-100 hover:text-slate-800 dark:hover:!text-white transition-all active:scale-95"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 space-y-5 no-scrollbar custom-scrollbar relative z-10"
        >
          {messages.length === 0 ? (
            <div className="min-h-full flex flex-col items-center justify-center text-center py-4 space-y-5">
              {/* Hero Assistant Emblem */}
              <div className="relative">
                <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-indigo-500/15 via-purple-500/15 to-pink-500/15 dark:from-[#ff7a45]/20 dark:via-[#ec4899]/20 dark:to-[#8b5cf6]/25 border border-indigo-200/60 dark:border-white/20 flex items-center justify-center shadow-xl">
                  <MessageCircle size={34} className="text-indigo-600 dark:!text-[#ff7a45] dark:drop-shadow-[0_0_12px_rgba(255,122,69,0.5)]" />
                </div>
                <div className="absolute -top-1 -right-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-[#ff7a45] dark:to-[#ec4899] text-white text-[8px] font-black uppercase tracking-wider shadow">
                  PRO AI
                </div>
              </div>

              <div className="space-y-1.5 max-w-xs">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-800 dark:!text-white italic">
                  HOW CAN I HELP YOU TODAY?
                </p>
                <p className="text-[9px] font-bold text-slate-500 dark:!text-indigo-200/85 uppercase tracking-wider leading-relaxed">
                  Ask me about tournaments, OCR results, profiles, or rules
                </p>
              </div>

              {/* Category Filter Tabs */}
              <div className="w-full max-w-md flex items-center justify-center gap-1.5 flex-wrap px-2">
                {QUICK_CATEGORY_TABS.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-[9.5px] font-black tracking-wide transition-all border',
                      activeCategory === cat.id
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-[#ff7a45] dark:to-[#ec4899] text-white border-transparent shadow-md'
                        : 'bg-white/90 dark:bg-[#1d2240]/90 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-white/15 hover:border-indigo-300'
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Quick Question Cards */}
              <div className="w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-2 pt-1">
                {currentCategoryQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="group p-3.5 rounded-2xl bg-white dark:!bg-gradient-to-r dark:!from-[#262c50]/95 dark:!to-[#1d213f]/95 text-left border border-slate-200/80 dark:!border-white/18 hover:border-indigo-400 dark:hover:!border-[#ff7a45]/70 shadow-sm hover:shadow-md transition-all active:scale-98 flex items-center justify-between gap-2"
                  >
                    <span className="text-[10.5px] font-extrabold text-slate-700 dark:!text-slate-100 group-hover:text-indigo-600 dark:group-hover:!text-white leading-snug">
                      {q}
                    </span>
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-slate-400 dark:text-indigo-300 group-hover:text-indigo-600 dark:group-hover:text-[#ff7a45] group-hover:translate-x-0.5 transition-transform"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => {
              const displayedText =
                m.role === 'model' && streamingTextMap[m.id] !== undefined
                  ? streamingTextMap[m.id]
                  : m.parts[0].text;
              const isCopied = copiedMsgId === m.id;

              return (
                <div
                  key={m.id || idx}
                  className={cn(
                    'flex flex-col gap-1.5 animate-in slide-in-from-bottom-2 duration-300',
                    m.role === 'user' ? 'items-end pl-8 sm:pl-14' : 'items-start pr-2 sm:pr-6'
                  )}
                >
                  {/* Sender Meta Row */}
                  <div
                    className={cn(
                      'flex items-center gap-2 px-1',
                      m.role === 'user' ? 'flex-row-reverse' : ''
                    )}
                  >
                    <div
                      className={cn(
                        'w-6 h-6 rounded-lg flex items-center justify-center border shadow-xs',
                        m.role === 'user'
                          ? 'bg-indigo-600 text-white border-indigo-500 dark:bg-gradient-to-br dark:from-[#ff7a45] dark:to-[#ec4899] dark:border-white/25'
                          : 'bg-white text-indigo-600 border-indigo-200 dark:bg-[#252b4d] dark:text-[#ff7a45] dark:border-indigo-400/35'
                      )}
                    >
                      {m.role === 'user' ? <User size={12} /> : <Bot size={13} />}
                    </div>
                    <span className="text-[9px] font-black text-slate-500 dark:!text-indigo-200 uppercase tracking-widest">
                      {m.role === 'user' ? 'YOU' : 'ARENA AI'}
                    </span>
                    {m.role === 'model' && m.badgeText && (
                      <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-200/70 dark:bg-[#ff7a45]/15 dark:text-[#ff986b] dark:border-[#ff7a45]/30 flex items-center gap-1">
                        <ShieldCheck size={10} />
                        {m.badgeText}
                      </span>
                    )}
                  </div>

                  {/* Message Card */}
                  {m.role === 'user' ? (
                    <div className="px-4 py-3 rounded-2xl rounded-tr-xs bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] text-white text-xs font-bold leading-relaxed shadow-md border border-indigo-500/30 dark:border-white/25">
                      {m.parts[0].text}
                    </div>
                  ) : (
                    <div className="w-full rounded-[1.75rem] rounded-tl-xs bg-white dark:!bg-gradient-to-b dark:!from-[#262c52]/96 dark:!via-[#1e2342]/98 dark:!to-[#171a33]/98 border border-slate-200/90 dark:!border-white/22 shadow-lg dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85),inset_0_1px_1.5px_rgba(255,255,255,0.22)] overflow-hidden relative">
                      {/* Top Accent Gradient Bar on AI Reply Card */}
                      <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6]" />

                      {/* AI Card Inner Header with Copy Action */}
                      <div className="px-4 pt-3 pb-2 border-b border-slate-100 dark:border-white/10 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-white/[0.03]">
                        <div className="flex items-center gap-1.5">
                          <Zap size={12} className="text-amber-500 dark:text-[#ff7a45]" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-indigo-200/90">
                            OFFICIAL ARENA KNOWLEDGE BASE
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopyMessage(m.id, m.parts[0].text)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#161930] border border-slate-200/80 dark:border-white/15 text-[9px] font-bold text-slate-600 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-[#ff7a45] flex items-center gap-1 transition-all active:scale-95"
                          title="Copy reply"
                        >
                          {isCopied ? (
                            <>
                              <Check size={11} className="text-emerald-500" />
                              <span className="text-emerald-500">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Structured Rich Markdown Body */}
                      <div className="p-4 sm:p-5 text-xs leading-relaxed text-slate-700 dark:text-slate-100">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => {
                              const textContent = React.Children.toArray(children)
                                .map(c => (typeof c === 'string' ? c : ''))
                                .join('');
                              const isTip = textContent.includes('💡') || textContent.includes('টিপস') || textContent.includes('দ্রষ্টব্য');
                              const isWarning = textContent.includes('⚠️') || textContent.includes('সতর্কতা');

                              if (isTip) {
                                return (
                                  <div className="my-3 p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-500/15 border border-indigo-200/80 dark:border-indigo-400/30 text-[11.5px] font-semibold text-indigo-950 dark:text-indigo-100 leading-relaxed shadow-2xs">
                                    {children}
                                  </div>
                                );
                              }
                              if (isWarning) {
                                return (
                                  <div className="my-3 p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-500/15 border border-amber-200/90 dark:border-amber-400/30 text-[11.5px] font-semibold text-amber-950 dark:text-amber-100 leading-relaxed shadow-2xs">
                                    {children}
                                  </div>
                                );
                              }
                              return (
                                <p className="my-2 text-[12px] font-semibold text-slate-700 dark:text-slate-100 leading-relaxed">
                                  {children}
                                </p>
                              );
                            },
                            strong: ({ children }) => (
                              <strong className="font-black text-slate-900 dark:text-amber-300">
                                {children}
                              </strong>
                            ),
                            ol: ({ children }) => (
                              <ol className="my-3 space-y-2 list-decimal list-inside bg-slate-50/90 dark:bg-[#14182e]/85 p-3.5 rounded-2xl border border-slate-200/70 dark:border-white/12">
                                {children}
                              </ol>
                            ),
                            ul: ({ children }) => (
                              <ul className="my-3 space-y-2 list-disc list-inside bg-slate-50/90 dark:bg-[#14182e]/85 p-3.5 rounded-2xl border border-slate-200/70 dark:border-white/12">
                                {children}
                              </ul>
                            ),
                            li: ({ children }) => (
                              <li className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-100 leading-relaxed py-0.5">
                                {children}
                              </li>
                            ),
                            code: ({ children }) => (
                              <code className="px-2 py-0.5 mx-0.5 rounded-md bg-indigo-100/90 dark:bg-[#ff7a45]/20 text-indigo-800 dark:text-[#ff9d76] border border-indigo-200/80 dark:border-[#ff7a45]/35 font-mono text-[10.5px] font-black">
                                {children}
                              </code>
                            ),
                            hr: () => (
                              <hr className="my-4 border-slate-200 dark:border-white/15" />
                            ),
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-indigo-600 dark:text-[#38bdf8] font-black underline underline-offset-2 hover:opacity-80"
                              >
                                {children}
                                <ExternalLink size={11} />
                              </a>
                            )
                          }}
                        >
                          {displayedText}
                        </ReactMarkdown>

                        {/* Follow-up Recommendation Chips */}
                        {!m.isStreaming && m.recommendations && m.recommendations.length > 0 && (
                          <div className="mt-4 pt-3.5 border-t border-slate-200/70 dark:border-white/12 space-y-2">
                            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-indigo-200/80">
                              <HelpCircle size={11} className="text-indigo-500 dark:text-[#ff7a45]" />
                              <span>Related Questions (Tap to Ask):</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {m.recommendations.map((rec, rIdx) => (
                                <button
                                  key={rIdx}
                                  onClick={() => sendMessage(rec)}
                                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-[#151931] dark:hover:bg-[#2a315c] text-indigo-700 dark:text-indigo-100 text-[10px] font-extrabold border border-slate-200/80 dark:border-indigo-400/30 hover:border-indigo-300 dark:hover:border-[#ff7a45]/65 transition-all active:scale-95 text-left flex items-center gap-1.5 shadow-2xs"
                                >
                                  <Sparkles size={10} className="shrink-0 text-indigo-500 dark:text-[#ff7a45]" />
                                  <span>{rec}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.isError && (
                          <div className="mt-4 pt-2">
                            <a
                              href={TELEGRAM_LINK}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-md hover:opacity-95 active:scale-95 transition-all"
                            >
                              <ExternalLink size={12} /> Contact Official Telegram Support
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex flex-col items-start pr-12 animate-in fade-in">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:!bg-indigo-500/25 text-indigo-600 dark:!text-[#ff7a45] flex items-center justify-center border border-indigo-200 dark:!border-indigo-400/35">
                  <Bot size={12} />
                </div>
                <span className="text-[8.5px] font-black text-slate-500 dark:!text-indigo-200 uppercase tracking-widest">
                  ARENA AI IS ANALYZING...
                </span>
              </div>
              <div className="px-5 py-3.5 rounded-2xl bg-white dark:!bg-[#24294c]/95 border border-slate-200 dark:!border-white/22 flex gap-1.5 shadow-md">
                <div className="w-2 h-2 bg-indigo-500 dark:bg-[#ff7a45] rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-purple-500 dark:bg-[#ec4899] rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-pink-500 dark:bg-[#a855f7] rounded-full animate-bounce [animation-delay:-0.3s]" />
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 sm:p-6 border-t border-slate-200/80 dark:!border-white/15 bg-white/90 dark:!bg-gradient-to-t dark:!from-[#14172b]/98 dark:!to-[#1d2240]/92 backdrop-blur-2xl shrink-0 relative z-10">
          <div className="relative flex items-center gap-2.5">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Type your question in English or বাংলা..."
              disabled={loading}
              className="flex-1 h-14 px-5 bg-slate-100/90 dark:!bg-[#101324]/95 rounded-2xl text-xs font-bold text-slate-800 dark:!text-white placeholder:text-slate-400 dark:placeholder:!text-slate-400 border border-slate-200/90 dark:!border-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:focus:ring-[#ff7a45]/35 focus:border-indigo-500 dark:focus:!border-[#ff7a45]/70 transition-all disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg shrink-0 active:scale-95',
                !input.trim() || loading
                  ? 'bg-slate-200/80 dark:!bg-[#252a4d] text-slate-400 dark:!text-slate-400 border border-slate-300/60 dark:!border-white/15 cursor-not-allowed'
                  : 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] text-white shadow-indigo-500/25 dark:shadow-[#ec4899]/40 border border-white/25'
              )}
              title="Send Message"
            >
              <Send
                size={20}
                className={cn(
                  'transition-transform',
                  input.trim() && !loading ? 'translate-x-0.5 -translate-y-0.5' : ''
                )}
              />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
