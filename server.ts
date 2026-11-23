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
    const abortController = new AbortController();
    const onClientAbort = () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    };
    res.on('close', onClientAbort);

    try {
      const result = await processSarahRequest(req.body || {}, {
        signal: abortController.signal,
      });
      if (!res.writableEnded) {
        res.status(200).json(result);
      }
    } catch (error: any) {
      if (abortController.signal.aborted || error?.name === 'AbortError') {
        if (!res.writableEnded) {
          res.status(499).json({ error: 'Permintaan analisis SARAH dibatalkan.' });
        }
        return;
      }
      const statusCode = Number(error?.statusCode) || 500;
      console.error('[sarah-ai Express route error]:', error?.message || error);
      if (!res.writableEnded) {
        res.status(statusCode).json({
          error: error?.message || 'Terjadi kesalahan pada server SARAH AI.',
        });
      }
    } finally {
      res.off('close', onClientAbort);
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
