import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { processSarahRequest } from './netlify/functions/sarah-ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'serbu21-sarah-ai' });
  });

  const handleSarahRoute = async (req: express.Request, res: express.Response) => {
    try {
      const result = await processSarahRequest(req.body || {});
      res.status(200).json(result);
    } catch (error: any) {
      const statusCode = Number(error?.statusCode) || 500;
      console.error('[sarah-ai Express route error]:', error?.message || error);
      res.status(statusCode).json({
        error: error?.message || 'Terjadi kesalahan pada server SARAH AI.',
      });
    }
  };

  app.post('/.netlify/functions/sarah-ai', handleSarahRoute);
  app.post('/api/sarah-ai', handleSarahRoute);

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERBU 21 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SERBU 21 server:', err);
  process.exit(1);
});
