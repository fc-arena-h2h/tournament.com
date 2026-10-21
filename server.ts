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
          1. You are a helpful, expert assistant for "FC Arena VS". Your goal is to solve user problems and explain platform features.
          2. Only answer questions related to FC Arena VS, its features, tournament mechanics, and app navigation.
          3. If the user asks something outside this scope (e.g., about other games or general topics), politely explain that you are specialized for FC Arena VS and try to pivot back to how the platform can help them.
          4. Only include the tag [SHOW_CONTACT_BUTTON] at the very end of your response if you have genuinely tried to answer but the user's issue requires human intervention (like technical account issues, payment proofs, or host disputes).
          5. Never reveal internal technical secrets or sensitive system logic.
          6. Maintain a professional, welcoming, and helpful tone.
          7. Always communicate in English. Even if the user speaks in another language, politely respond in English only.
          
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
