import express from 'express';
import {createServer as createViteServer} from 'vite';
import {GoogleGenAI} from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
  const app = express();
  const port = process.env.PORT || 3000;

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
          1. Only answer questions related to FC Arena VS, its features, tournament mechanics, and app navigation.
          2. Refuse to answer any questions outside this scope (e.g., general knowledge, personal advice, other games). Be polite but firm.
          3. If you are unable to provide an answer, or the user is asking for something out of scope, politely tell them and include the tag [SHOW_CONTACT_BUTTON] at the very end of your response.
          4. Do not reveal internal technical secrets or sensitive system logic.
          5. Maintain a professional, welcoming, and helpful tone.
          6. Always communicate in English. Even if the user speaks in another language, politely respond in English only.
          
          APP FEATURES TO EXPLAIN:
          - Tournament Discovery: Users can find and join active Cups in the ARENA.
          - Automatic Brackets: The system advances winners automatically from group stages to knockout finals.
          - Digital Hub: Direct contact links for Messenger and WhatsApp are provided in match cards for easy coordination with opponents.
          - Match Results: Players report their match scores for verification by the tournament hosts.
          - Multi-role System: Players join cups, Publishers (Hosts) create and manage cups, and Admins oversee the platform.
          
          HOW TOURNAMENTS WORK:
          1. Enlistment: Hosts create a cup, and players apply to join.
          2. Battle: Once a tournament starts, matches are scheduled. Players coordinate with their opponents via the provided digital channel links (Messenger/WhatsApp).
          3. Victory: Match results are reported and confirmed. Winners advance through the brackets until a champion is determined.
          
          If a user exceeds their 10-message daily limit, they are instructed to contact support on Telegram at t.me/fcarenavs. (Note: The client handles the limit logic, but you should know it exists).`
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
