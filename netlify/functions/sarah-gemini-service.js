import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

export const SARAH_GEMINI_MODEL = 'gemini-2.5-flash';
export const MAX_CONCURRENT_REQUESTS = Math.max(
  1,
  Number(process.env.SARAH_MAX_CONCURRENT_REQUESTS) || 4
);
export const DEFAULT_TIMEOUT_MS = 24000;
export const DEFAULT_MAX_RETRIES = 1;

const CACHE_TTL_MS = 1000 * 60 * 15; // 15 menit cache respons server
const MAX_CACHE_ENTRIES = 120;
const MAX_QUEUE_WAIT_MS = 18000;

let activeRequestsCount = 0;
const pendingQueue = [];
const responseCache = new Map();
const inFlightCachePromises = new Map();

let cachedAiClient = null;
let cachedAiClientKey = '';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGeminiClient(explicitApiKey) {
  const apiKey = String(explicitApiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY belum dikonfigurasi pada environment server. Hubungi administrator sistem.'
    );
    err.statusCode = 500;
    throw err;
  }

  if (cachedAiClient && cachedAiClientKey === apiKey) {
    return cachedAiClient;
  }

  cachedAiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  cachedAiClientKey = apiKey;
  return cachedAiClient;
}

export function parseGeminiErrorDetails(error) {
  const rawMessage = typeof error?.message === 'string' ? error.message.trim() : '';
  let statusCode = Number(error?.statusCode || error?.status) || 500;
  let cleanMessage = rawMessage || 'Terjadi kesalahan saat menghubungi layanan SARAH AI.';

  if (rawMessage.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage);
      if (parsed?.error) {
        if (Number(parsed.error.code)) {
          statusCode = Number(parsed.error.code);
        }
        if (typeof parsed.error.message === 'string' && parsed.error.message.trim()) {
          cleanMessage = parsed.error.message.trim();
        }
      }
    } catch {
      // Abaikan bila bukan JSON valid
    }
  }

  return { statusCode, cleanMessage };
}

export function isTransientGeminiError(error) {
  if (error?.isTimeout) return true;
  const { statusCode, cleanMessage } = parseGeminiErrorDetails(error);
  const lower = cleanMessage.toLowerCase();
  if ([408, 429, 500, 502, 503, 504].includes(statusCode)) return true;
  return (
    lower.includes('high demand') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('try again later') ||
    lower.includes('resource_exhausted') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed')
  );
}

export function formatGeminiError(error) {
  const { statusCode: initialCode, cleanMessage: initialMsg } = parseGeminiErrorDetails(error);
  let statusCode = initialCode;
  let cleanMessage = initialMsg;
  const lower = cleanMessage.toLowerCase();

  if (error?.isTimeout || statusCode === 504) {
    statusCode = 504;
    cleanMessage =
      'Layanan SARAH AI sedang padat sehingga waktu tunggu habis. Silakan klik kirim ulang ya.';
  } else if (statusCode === 400 || statusCode === 403) {
    cleanMessage = `Konfigurasi API Key Gemini bermasalah (${cleanMessage}). Periksa GEMINI_API_KEY di Settings > Secrets atau Environment Variables Netlify.`;
  } else if (statusCode === 503 || lower.includes('high demand') || lower.includes('overloaded')) {
    statusCode = 503;
    cleanMessage =
      'Server AI Gemini sedang mengalami lonjakan antrean permintaan sementara. Silakan klik tombol kirim ulang beberapa detik lagi.';
  } else if (statusCode === 429 || lower.includes('resource_exhausted')) {
    statusCode = 429;
    cleanMessage =
      'Batas penggunaan (kuota) API Gemini sedang penuh sementara. Silakan tunggu beberapa detik lalu coba kirim ulang.';
  }

  const normalized = new Error(cleanMessage);
  normalized.statusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
  return normalized;
}

function readResponseCache(cacheKey) {
  if (!cacheKey) return null;
  const entry = responseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    responseCache.delete(cacheKey);
    return null;
  }
  // Refresh urutan LRU
  responseCache.delete(cacheKey);
  responseCache.set(cacheKey, entry);
  return entry.value;
}

function writeResponseCache(cacheKey, value) {
  if (!cacheKey || !value || !value.text) return;
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) {
      responseCache.delete(oldestKey);
    }
  }
  responseCache.set(cacheKey, {
    value,
    cachedAt: Date.now(),
  });
}

/**
 * Menghasilkan hash SHA-256 deterministik dari pasangan (id_ujian, nisn)
 * untuk Result Caching hasil analisis SARAH.
 */
export function computeResultCacheHash(idUjian = '', nisn = '', scope = '') {
  const normExam = String(idUjian || '').trim().toLowerCase();
  const normNisn = String(nisn || '').trim().toLowerCase();
  const normScope = String(scope || '').trim().toLowerCase();
  const raw = `${normExam}::${normNisn}${normScope ? `::${normScope}` : ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function buildDeterministicCacheKey({
  model,
  contents,
  systemInstruction,
  responseMimeType,
  responseSchema,
  cacheScope,
  explicitKey,
}) {
  if (explicitKey) {
    return `${model}:${cacheScope || 'default'}:${explicitKey}`;
  }
  const raw = JSON.stringify({
    model,
    cacheScope: cacheScope || 'default',
    systemInstruction: systemInstruction || '',
    contents,
    responseMimeType: responseMimeType || '',
    responseSchema: responseSchema || null,
  });
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function createAbortError(message = 'Permintaan analisis SARAH dibatalkan.') {
  const err = new Error(message);
  err.name = 'AbortError';
  err.statusCode = 499;
  return err;
}

async function acquireQueueSlot(maxWaitMs = MAX_QUEUE_WAIT_MS, signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
  if (activeRequestsCount < MAX_CONCURRENT_REQUESTS) {
    activeRequestsCount += 1;
    return;
  }

  await new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(waitTimer);
      if (signal) signal.removeEventListener('abort', onAbort);
    };

    const waiter = () => {
      if (settled) return;
      settled = true;
      cleanup();
      activeRequestsCount += 1;
      resolve();
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const idx = pendingQueue.indexOf(waiter);
      if (idx >= 0) pendingQueue.splice(idx, 1);
      reject(createAbortError('Permintaan dibatalkan saat berada dalam antrean SARAH.'));
    };

    const waitTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      const idx = pendingQueue.indexOf(waiter);
      if (idx >= 0) pendingQueue.splice(idx, 1);
      const err = new Error('Antrean permintaan SARAH sedang penuh. Silakan coba beberapa detik lagi.');
      err.statusCode = 503;
      err.isTimeout = true;
      reject(err);
    }, maxWaitMs);

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    pendingQueue.push(waiter);
  });
}

function releaseQueueSlot() {
  activeRequestsCount = Math.max(0, activeRequestsCount - 1);
  const nextWaiter = pendingQueue.shift();
  if (nextWaiter) {
    nextWaiter();
  }
}

async function runAttemptWithAbortAndTimeout({
  ai,
  model,
  contents,
  config,
  timeoutMs,
  externalSignal,
}) {
  if (externalSignal?.aborted) {
    throw createAbortError();
  }

  const attemptController = new AbortController();
  let timedOut = false;
  let externallyAborted = false;

  const onExternalAbort = () => {
    externallyAborted = true;
    attemptController.abort();
  };

  if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    attemptController.abort();
  }, Math.max(5000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

  try {
    const abortPromise = new Promise((_, reject) => {
      attemptController.signal.addEventListener(
        'abort',
        () => {
          if (externallyAborted || externalSignal?.aborted) {
            reject(createAbortError());
          } else if (timedOut) {
            const err = new Error(`Permintaan ke ${model} melebihi batas waktu (${timeoutMs} ms).`);
            err.statusCode = 504;
            err.isTimeout = true;
            reject(err);
          } else {
            reject(createAbortError());
          }
        },
        { once: true }
      );
    });

    const sdkPromise = ai.models.generateContent({
      model,
      contents,
      config: {
        ...config,
        abortSignal: attemptController.signal,
      },
    });

    return await Promise.race([sdkPromise, abortPromise]);
  } finally {
    clearTimeout(timeoutTimer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Layanan terpusat SARAH Gemini (`gemini-2.5-flash`) dengan:
 * - Sistem Antrean terkontrol (`MAX_CONCURRENT_REQUESTS`) berbasis `AbortController`
 * - Pembatalan instan & `timeoutMs` per permintaan
 * - Retry ringan untuk gangguan sementara (429/503/504/timeout)
 * - Result Caching (`responseCache`) berbasis hash SHA-256 & deduplikasi permintaan identik
 */
export async function askSarahGemini({
  contents,
  systemInstruction = '',
  config = {},
  model = SARAH_GEMINI_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_MAX_RETRIES,
  useCache = true,
  cacheKey = '',
  cacheScope = 'default',
  signal,
  apiKey,
}) {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const ai = getGeminiClient(apiKey);
  const effectiveModel = model || SARAH_GEMINI_MODEL;

  const finalConfig = { ...config };
  if (systemInstruction && !finalConfig.systemInstruction) {
    finalConfig.systemInstruction = systemInstruction;
  }

  const effectiveCacheKey = useCache
    ? buildDeterministicCacheKey({
        model: effectiveModel,
        contents,
        systemInstruction: finalConfig.systemInstruction,
        responseMimeType: finalConfig.responseMimeType,
        responseSchema: finalConfig.responseSchema,
        cacheScope,
        explicitKey: cacheKey,
      })
    : '';

  if (effectiveCacheKey) {
    const cached = readResponseCache(effectiveCacheKey);
    if (cached) {
      return {
        ...cached,
        fromCache: true,
        cacheKeyHash: effectiveCacheKey,
      };
    }

    const activePromise = inFlightCachePromises.get(effectiveCacheKey);
    if (activePromise) {
      return await activePromise;
    }
  }

  const executeQueuedRequest = async () => {
    await acquireQueueSlot(MAX_QUEUE_WAIT_MS, signal);
    try {
      const totalAttempts = Math.max(1, 1 + Math.max(0, Number(retries) || 0));
      let lastError = null;

      for (let attempt = 0; attempt < totalAttempts; attempt++) {
        if (signal?.aborted) {
          throw createAbortError();
        }
        if (attempt > 0) {
          const jitterMs = 350 + Math.floor(Math.random() * 250);
          await sleep(jitterMs);
          if (signal?.aborted) {
            throw createAbortError();
          }
        }

        try {
          const rawResponse = await runAttemptWithAbortAndTimeout({
            ai,
            model: effectiveModel,
            contents,
            config: finalConfig,
            timeoutMs,
            externalSignal: signal,
          });

          const text = typeof rawResponse?.text === 'string' ? rawResponse.text : '';
          const result = {
            text,
            rawResponse,
            fromCache: false,
            cacheKeyHash: effectiveCacheKey || '',
            model: effectiveModel,
          };

          if (effectiveCacheKey && text.trim()) {
            writeResponseCache(effectiveCacheKey, result);
          }

          return result;
        } catch (err) {
          if (err?.name === 'AbortError' || signal?.aborted) {
            throw err;
          }
          lastError = err;
          if (!isTransientGeminiError(err) || attempt === totalAttempts - 1) {
            throw err;
          }
          console.warn(
            `[sarah-gemini-service] Retry ringan (${attempt + 1}/${totalAttempts - 1}) pada ${effectiveModel}:`,
            parseGeminiErrorDetails(err).cleanMessage
          );
        }
      }

      throw lastError;
    } finally {
      releaseQueueSlot();
    }
  };

  if (effectiveCacheKey) {
    const sharedPromise = executeQueuedRequest().finally(() => {
      inFlightCachePromises.delete(effectiveCacheKey);
    });
    inFlightCachePromises.set(effectiveCacheKey, sharedPromise);
    return await sharedPromise;
  }

  return await executeQueuedRequest();
}

export function getSarahGeminiMetrics() {
  return {
    model: SARAH_GEMINI_MODEL,
    maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
    activeRequestsCount,
    queuedRequestsCount: pendingQueue.length,
    cacheEntriesCount: responseCache.size,
  };
}
