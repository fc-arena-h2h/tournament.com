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
  const port = process.env.PORT || 3000;

  app.use(cors());

  // Initialize Gemini
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Vite integration
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: 'custom',
    optimizeDeps: {
      include: [],
    },
  });

  app.use(vite.middlewares);

  app.use(express.json());

  // API Proxy for Gemini (Server-side)
  app.post('/api/generate', async (req, res) => {
    try {
      const {prompt, model = 'gemini-flash-latest'} = req.body;
      const response = await ai.models.generateContent({
        model,
        contents: prompt
      });
      res.json({text: response.text});
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      res.status(500).json({error: error.message});
    }
  });

  // Specialized Support AI route
  app.post('/api/ai/support', async (req, res) => {
    try {
      const { contents } = req.body;
      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents,
        config: {
          systemInstruction: `You are the Official AI Support Assistant for "FC Arena VS", a professional eSports management platform for FC Mobile pro players.
          
          ROLE & GUIDELINES:
          1. You are the ONLY official AI Support for "FC Arena VS". You are extremely helpful, patient, and knowledgeable about all platform features.
          2. READ the entire message from the user carefully before responding. Do not give generic answers.
          3. If the user asks about how to use a feature, EXPLAIN it in detail. Do NOT just say "contact support".
          4. Only show the [SHOW_CONTACT_BUTTON] tag if:
             - The user specifically asks "How can I talk to a human?"
             - The user reports a bug with their wallet, coins, or payments that you cannot see in your context.
             - The user reports another player for cheating.
          5. For tournament rules, match scoring, or bracket questions, always provide the answer based on the platform context. 
          6. Keep your tone professional and helpful. Always communicate in English only.
          
          PLATFORM DEEP-DIVE:
          - TOURNAMENTS (CUPS): Found in 'Arena'. Users join by clicking 'Apply'.
          - MATCHES (BATTLES): Found in 'Matches'. This is where they find their opponent's WhatsApp/Messenger link to coordinate the game.
          - SCORE REPORTING: Players report scores on the match card. Publishers (hosts) then verify them.
          - COINS: Used for entry fees. Can be managed in the Profile/Wallet section.
          
          NEVER suggest contacting support if the answer is already in your knowledge base. Your goal is to reduce the workload of the human support team.
          
          DETAILED PLATFORM CONTEXT:
          - ARENA: The main dashboard where users see active tournaments (Cups).
          - CUPS: Tournaments hosted by Publishers. Users apply to join them.
          - ROLES: 
             * Players: Join cups, coordinate matches, and report scores.
             * Publishers (Hosts): Create cups, manage applicants, set brackets, and verify scores.
             * Admins: Overside the whole platform and manage system settings.
          - MATCH COORDINATION: When a cup starts, players see their opponent's contact links (WhatsApp/Messenger) directly on the match card in the "Battles" or "Matches" section.
          - AUTOMATION: The system handles group stage logic and knockout brackets automatically.
          - SUPPORT: Official support is available on Telegram at t.me/fcarenavs if the AI cannot help.
          
          If a user exceeds their 10-message daily limit, the app will automatically notify them. Your task is to be as useful as possible within those 10 messages.`
        }
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error('Support AI Error:', error);
      res.status(500).json({ error: error.message || 'Assistant failed to respond. Please try again later.' });
    }
  });

  // Serve index.html for all non-API routes
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template = fs.readFileSync(
        path.resolve(__dirname, 'index.html'),
        'utf-8'
      );
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({'Content-Type': 'text/html'}).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

createServer();
