import express from 'express';
import {createServer as createViteServer} from 'vite';
import {GoogleGenAI} from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import cors from 'cors';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
  const app = express();
  const port = 3000;
  const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.resolve(__dirname, 'dist'));

  app.use(cors());
  app.use(express.json());

  // Initialize Gemini
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    console.warn('WARNING: GEMINI_API_KEY is not set. AI features will fail.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Proxy for Gemini (Server-side)
  app.post('/api/generate', async (req, res) => {
    try {
      if (!apiKey) throw new Error('AI API Key missing on server');
      const {prompt, history = [], model = 'gemini-3.8-flash'} = req.body;
      
      const systemInstruction = `You are the "Arena AI", the official support assistant for the FC Arena VS app. 
      Your goal is to help users with tournament participation, account issues, and app features.
      
      CRITICAL RULES:
      1. ALWAYS respond in Bengali (বাংলা) unless specifically asked for another language.
      2. Use a structured, visually appealing format as follows:
         - Start with a relevant emoji and a bold title (e.g., 🏆 **টুর্নামেন্টে জয়েন করার নিয়ম**).
         - Provide a brief introductory sentence.
         - Use bold headings for sections like **ধাপসমূহ:** or **নিয়মাবলী:**.
         - Use numbered lists for steps (1. 2. 3.).
         - Use a 💡 **দ্রষ্টব্য:** or ⚠️ **সতর্কতা:** section at the end for important notes or tips.
      3. Keep the tone professional, helpful, and encouraging.
      4. If you don't know something specifically about this app, advise the user to contact the official Telegram support at https://t.me/fcarenavs.
      5. Do not mention that you are an AI model or mention Google/Gemini. You are "Arena AI".
      
      Context: FC Arena VS is an app for organizing and playing FC Mobile tournaments. Features include profile creation, tournament joining, match result reporting, and global leaderboards.`;

      const response = await ai.models.generateContent({
        model,
        contents: [
          { role: 'user', parts: [{ text: systemInstruction }] },
          { role: 'model', parts: [{ text: "বুঝেছি। আমি এখন থেকে এরিনা এআই হিসেবে সব উত্তর সুন্দরভাবে সাজিয়ে এবং বাংলা ভাষায় দেব।" }] },
          ...history,
          { role: 'user', parts: [{ text: prompt }] }
        ]
      });
      res.json({text: response.text});
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      res.status(500).json({error: error.message || 'Internal Server Error'});
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: {
        node_env: process.env.NODE_ENV,
        has_api_key: !!apiKey,
        port: port
      }
    });
  });

  // Specialized Support AI route has been migrated to client-side (Fuse.js + faqs.json) for offline support.
  // The server-side Gemini proxy below remains for other potential AI features.

  if (!isProd) {
    // Vite integration for development
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({'Content-Type': 'text/html'}).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Production serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port} in ${isProd ? 'production' : 'development'} mode`);
  });
}

createServer();
