import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  processSarahRequest,
  processSarahStreamRequest,
} from './netlify/functions/sarah-ai.js';

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

  const isAllowedGoogleDownloadUrl = (rawUrl: string): boolean => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'drive.google.com' ||
        host === 'docs.google.com' ||
        host === 'drive.usercontent.google.com' ||
        host.endsWith('.usercontent.google.com') ||
        host.endsWith('.googleusercontent.com') ||
        host.endsWith('.googledrive.com')
      );
    } catch {
      return false;
    }
  };

  const extractHtmlInputValue = (html: string, fieldName: string): string | null => {
    const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameFirst = new RegExp(
      `<input[^>]*\\bname=["']${escaped}["'][^>]*\\bvalue=["']([^"']*)["'][^>]*>`,
      'i'
    );
    const valueFirst = new RegExp(
      `<input[^>]*\\bvalue=["']([^"']*)["'][^>]*\\bname=["']${escaped}["'][^>]*>`,
      'i'
    );
    const match = html.match(nameFirst) || html.match(valueFirst);
    return match ? match[1] : null;
  };

  const fetchGoogleMediaBuffer = async (
    initialUrl: string,
    signal: AbortSignal
  ): Promise<{ buffer: Buffer; contentType: string } | null> => {
    const MAX_BYTES = 45 * 1024 * 1024;
    let currentUrl = initialUrl;

    for (let hop = 0; hop < 7; hop += 1) {
      if (!isAllowedGoogleDownloadUrl(currentUrl)) {
        return null;
      }

      const resp = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept:
            'application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/octet-stream,*/*',
        },
      });

      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location');
        if (!location) return null;
        const resolved = new URL(location, currentUrl).toString();
        if (!isAllowedGoogleDownloadUrl(resolved)) {
          return null;
        }
        currentUrl = resolved;
        continue;
      }

      if (!resp.ok) {
        return null;
      }

      const contentLength = Number(resp.headers.get('content-length') || 0);
      if (contentLength > MAX_BYTES) {
        throw new Error('Ukuran file media terlalu besar (maksimal 45 MB).');
      }

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      const arrayBuf = await resp.arrayBuffer();
      if (arrayBuf.byteLength > MAX_BYTES) {
        throw new Error('Ukuran file media terlalu besar (maksimal 45 MB).');
      }
      const buffer = Buffer.from(arrayBuf);

      // Deteksi halaman konfirmasi unduhan Google Drive untuk file berukuran besar
      if (contentType.includes('text/html') || buffer.subarray(0, 15).toString('utf8').toLowerCase().includes('<!doctype html')) {
        const htmlSnippet = buffer.toString('utf8', 0, Math.min(buffer.length, 24576));
        const formActionMatch = htmlSnippet.match(/<form[^>]*\baction=["'](https:\/\/[^"']+)["']/i);
        const confirmVal = extractHtmlInputValue(htmlSnippet, 'confirm');
        const uuidVal = extractHtmlInputValue(htmlSnippet, 'uuid');
        const idVal = extractHtmlInputValue(htmlSnippet, 'id');
        if (formActionMatch && idVal && isAllowedGoogleDownloadUrl(formActionMatch[1])) {
          const nextUrl = new URL(formActionMatch[1]);
          nextUrl.searchParams.set('id', idVal);
          nextUrl.searchParams.set('export', 'download');
          nextUrl.searchParams.set('confirm', confirmVal || 't');
          if (uuidVal) nextUrl.searchParams.set('uuid', uuidVal);
          currentUrl = nextUrl.toString();
          continue;
        }
        return null;
      }

      return { buffer, contentType };
    }

    return null;
  };

  app.get('/api/media-proxy', async (req, res) => {
    const rawFileId = String(req.query.fileId || '').trim();
    const rawKind = String(req.query.kind || 'file').trim().toLowerCase();

    if (!/^[a-zA-Z0-9_-]{8,150}$/.test(rawFileId)) {
      res.status(400).json({ error: 'ID file Google Drive tidak valid.' });
      return;
    }

    if (rawKind !== 'slides' && rawKind !== 'file') {
      res.status(400).json({ error: 'Parameter jenis media tidak valid.' });
      return;
    }

    const abortController = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abortController.abort();
    };
    res.on('close', onClose);

    try {
      const pdfExportUrl = `https://docs.google.com/presentation/d/${rawFileId}/export/pdf`;
      const driveCandidates = [
        `https://drive.usercontent.google.com/download?id=${rawFileId}&export=download&confirm=t`,
        `https://drive.google.com/uc?export=download&confirm=t&id=${rawFileId}`,
      ];

      const isPdfBuffer = (buf: Buffer) => buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === '%PDF';
      const isZipBuffer = (buf: Buffer) =>
        buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

      const sendBinary = (buf: Buffer, mime: string) => {
        res.status(200);
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(buf);
      };

      if (rawKind === 'slides') {
        const pdfExport = await fetchGoogleMediaBuffer(pdfExportUrl, abortController.signal);
        if (pdfExport && isPdfBuffer(pdfExport.buffer)) {
          sendBinary(pdfExport.buffer, 'application/pdf');
          return;
        }
      }

      let zipFallbackBuffer: Buffer | null = null;
      for (const candidate of driveCandidates) {
        const fetched = await fetchGoogleMediaBuffer(candidate, abortController.signal);
        if (fetched && fetched.buffer.length > 0) {
          if (isPdfBuffer(fetched.buffer)) {
            sendBinary(fetched.buffer, 'application/pdf');
            return;
          }
          if (isZipBuffer(fetched.buffer) && !zipFallbackBuffer) {
            zipFallbackBuffer = fetched.buffer;
            break;
          }
        }
      }

      // Untuk file PPTX di Google Drive, coba konversi PDF via Google Presentation Export agar layout/gambar tetap presisi
      const convertedPdf = await fetchGoogleMediaBuffer(pdfExportUrl, abortController.signal);
      if (convertedPdf && isPdfBuffer(convertedPdf.buffer)) {
        sendBinary(convertedPdf.buffer, 'application/pdf');
        return;
      }

      if (zipFallbackBuffer) {
        sendBinary(
          zipFallbackBuffer,
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        );
        return;
      }

      if (!res.writableEnded) {
        res.status(422).json({
          error: 'File tidak dapat diekspor langsung sebagai slide PDF/PPTX. Pastikan izin berbagi Drive publik (Viewer).',
        });
      }
    } catch (error: any) {
      if (abortController.signal.aborted || error?.name === 'AbortError') return;
      if (!res.writableEnded) {
        res.status(502).json({
          error: error?.message || 'Gagal mengambil dokumen media ajar dari Google Drive.',
        });
      }
    } finally {
      res.off('close', onClose);
    }
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

  const handleSarahStreamRoute = async (req: express.Request, res: express.Response) => {
    const abortController = new AbortController();
    const onClientAbort = () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    };
    res.on('close', onClientAbort);

    let headersSent = false;
    const ensureStreamHeaders = () => {
      if (headersSent || res.writableEnded) return;
      headersSent = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }
    };

    try {
      const result = (await processSarahStreamRequest(req.body || {}, {
        signal: abortController.signal,
        onChunk: (delta: string) => {
          if (!delta || res.writableEnded || abortController.signal.aborted) return;
          ensureStreamHeaders();
          res.write(`${JSON.stringify({ type: 'chunk', text: delta })}\n`);
        },
      })) as Record<string, any>;

      if (!res.writableEnded) {
        ensureStreamHeaders();
        res.write(
          `${JSON.stringify({
            type: 'done',
            mode: result?.mode || 'general_chat',
            text: result?.text || result?.ringkasan || '',
            model: result?.model || '',
            fromCache: Boolean(result?.fromCache),
          })}\n`
        );
        res.end();
      }
    } catch (error: any) {
      if (abortController.signal.aborted || error?.name === 'AbortError') {
        if (!res.writableEnded) {
          if (headersSent) {
            res.write(`${JSON.stringify({ type: 'error', error: 'Permintaan analisis SARAH dibatalkan.' })}\n`);
            res.end();
          } else {
            res.status(499).json({ error: 'Permintaan analisis SARAH dibatalkan.' });
          }
        }
        return;
      }

      const statusCode = Number(error?.statusCode) || 500;
      const errMsg = error?.message || 'Terjadi kesalahan pada server SARAH AI.';
      console.error('[sarah-ai-stream Express route error]:', errMsg);
      if (!res.writableEnded) {
        if (headersSent) {
          res.write(`${JSON.stringify({ type: 'error', error: errMsg, statusCode })}\n`);
          res.end();
        } else {
          res.status(statusCode).json({ error: errMsg });
        }
      }
    } finally {
      res.off('close', onClientAbort);
    }
  };

  app.post('/.netlify/functions/sarah-ai', handleSarahRoute);
  app.post('/api/sarah-ai', handleSarahRoute);
  app.post('/api/sarah-ai-stream', handleSarahStreamRoute);
  app.post('/.netlify/functions/sarah-ai-stream', handleSarahStreamRoute);

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
