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
      const {prompt, model = 'gemini-3.8-flash'} = req.body;
      const response = await ai.models.generateContent({
        model,
        contents: prompt
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

  // Specialized Support AI route
  app.post('/api/ai/support', async (req, res) => {
    try {
      if (!apiKey) {
        console.error('Support AI API Key missing on server');
        return res.status(500).json({ error: 'AI Assistant is not configured on the server. Please check GEMINI_API_KEY secret.' });
      }
      
      const { contents } = req.body;
      if (!contents || !Array.isArray(contents)) {
        return res.status(400).json({ error: 'Invalid contents format' });
      }

      // Filter and map contents to match the SDK expectation
      // The SDK expects contents as an array of Content objects
      const formattedContents = contents.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: m.parts.map((p: any) => ({ text: p.text }))
      }));

      // Load AI context files dynamically
      let aiContext = '';
      try {
        const aiDir = path.resolve(__dirname, 'ai');
        if (fs.existsSync(aiDir)) {
          const files = fs.readdirSync(aiDir);
          for (const file of files) {
            if (file.endsWith('.md')) {
              const content = fs.readFileSync(path.join(aiDir, file), 'utf-8');
              aiContext += `\n--- DOCUMENT: ${file} ---\n${content}\n`;
            }
          }
        }
      } catch (err) {
        console.error('Error reading AI context:', err);
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: formattedContents,
        config: {
          systemInstruction: `You are the Official AI Support Assistant for "FC Arena VS".
          
          CORE KNOWLEDGE BASE:
          ${aiContext}
          
          ADDITIONAL ROLE & GUIDELINES:
          1. You are the ONLY official AI Support for "FC Arena VS". You are extremely helpful, patient, and knowledgeable.
          2. READ the entire message from the user carefully before responding. Do not give generic answers.
          3. If the user asks about how to use a feature, EXPLAIN it in detail.
          4. Only show the [SHOW_CONTACT_BUTTON] tag if:
             - The user specifically asks "How can I talk to a human?"
             - The user reports a bug with their wallet, coins, or payments.
             - The user reports another player for cheating.
          5. Keep your tone professional and helpful. Always communicate in English only.`
        }
      });
      
      const text = response.text;
      if (!text) {
        throw new Error('Model returned an empty response');
      }

      res.json({ text });
    } catch (error: any) {
      console.error('Support AI Error:', error);
      res.status(500).json({ 
        error: error.message || 'Assistant failed to respond. Please try again later.',
        details: isProd ? undefined : error.stack
      });
    }
  });

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
