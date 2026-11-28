import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

export const SARAH_GEMINI_MODEL = 'gemini-2.5-flash-lite';
export const SARAH_GEMINI_FALLBACK_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen',
];
export const MAX_CONCURRENT_REQUESTS = Math.max(
  1,
  Number(process.env.SARAH_MAX_CONCURRENT_REQUESTS) || 4
);
export const DEFAULT_TIMEOUT_MS = 18000;
export const FAST_CHAT_TIMEOUT_MS = 8000;
export const DEFAULT_MAX_RETRIES = 2;
const SILENT_RETRY_DELAYS_MS = [1500, 3000];
const FALLBACK_SWITCH_DELAY_MS = 1200;

export function resolveSpeedPresetModels(speedMode = 'auto') {
  const clean = String(speedMode || 'auto').trim().toLowerCase();
  if (clean === 'fast' || clean === 'lite') {
    return [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-4-hydrogen',
    ];
  }
  if (clean === 'standard' || clean === 'mendalam') {
    return [
      'gemini-2.5-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-4-hydrogen',
      'gemini-2.5-flash-lite',
      'gemini-3.1-flash-lite',
    ];
  }
  return [...SARAH_GEMINI_FALLBACK_MODELS];
}

const CACHE_TTL_MS = 1000 * 60 * 15; // 15 menit cache respons server
const MAX_CACHE_ENTRIES = 120;
const MAX_QUEUE_WAIT_MS = 14000;
const MODEL_UNAVAILABLE_COOLDOWN_MS = 1000 * 60 * 30; // 30 menit untuk model 404/deprecated
const MODEL_TRANSIENT_COOLDOWN_MS = 1000 * 60; // 60 detik untuk model 429/503/timeout

// Lacak kesehatan tiap model agar pesan berikutnya tidak mengulang tunggu timeout/404
const modelCooldownMap = new Map();

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
  const apiKey = String(
    explicitApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY ||
      process.env.GOOGLE_API_KEY ||
      ''
  ).trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY belum dikonfigurasi pada environment server. Pastikan API key telah dipilih pada panel Settings > Secrets.'
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

export function buildModelCandidateList(
  primaryModel = SARAH_GEMINI_MODEL,
  fallbackModels = SARAH_GEMINI_FALLBACK_MODELS
) {
  const ordered = [
    String(primaryModel || '').trim(),
    ...(Array.isArray(fallbackModels) ? fallbackModels : SARAH_GEMINI_FALLBACK_MODELS).map((m) =>
      String(m || '').trim()
    ),
  ].filter(Boolean);
  return [...new Set(ordered)];
}

function recordModelCooldown(modelName, type) {
  if (!modelName) return;
  const duration =
    type === 'unavailable' ? MODEL_UNAVAILABLE_COOLDOWN_MS : MODEL_TRANSIENT_COOLDOWN_MS;
  modelCooldownMap.set(modelName, {
    until: Date.now() + duration,
    type,
  });
}

function clearModelCooldown(modelName) {
  if (!modelName) return;
  modelCooldownMap.delete(modelName);
}

function orderModelsByHealth(candidateModels) {
  const now = Date.now();
  const healthy = [];
  const transientCooldown = [];
  const unavailableCooldown = [];

  for (const m of candidateModels) {
    const entry = modelCooldownMap.get(m);
    if (!entry || entry.until <= now) {
      if (entry && entry.until <= now) modelCooldownMap.delete(m);
      healthy.push(m);
    } else if (entry.type === 'unavailable') {
      unavailableCooldown.push(m);
    } else {
      transientCooldown.push(m);
    }
  }

  // Prioritaskan model sehat; bila semua sedang cooldown sementara, tetap coba yang paling cepat pulih
  if (healthy.length > 0) {
    return [...healthy, ...transientCooldown];
  }
  if (transientCooldown.length > 0) {
    return transientCooldown;
  }
  return [...candidateModels];
}

function buildConfigForModel(
  baseConfig = {},
  modelName = '',
  fastChat = false,
  speedMode = 'auto'
) {
  const nextConfig = { ...baseConfig };
  const isGemini4 = /^gemini-4/i.test(modelName);
  const isGemini3Or4 = /^gemini-[34]/i.test(modelName);

  // Aturan SDK @google/genai: jangan kirim sampling parameter pada model Gemini 4
  if (isGemini4) {
    delete nextConfig.temperature;
    delete nextConfig.topP;
    delete nextConfig.topK;
    delete nextConfig.candidateCount;
    delete nextConfig.thinkingBudget;
  }

  if (nextConfig.responseMimeType === 'application/json' || nextConfig.responseSchema) {
    delete nextConfig.tools;
  }

  if (!isGemini3Or4) {
    delete nextConfig.thinkingConfig;
    return nextConfig;
  }

  const normalizedSpeed = String(speedMode || 'auto').trim().toLowerCase();
  const preferLowThinking =
    normalizedSpeed === 'fast' || normalizedSpeed === 'lite' || (fastChat && normalizedSpeed !== 'standard');

  if (preferLowThinking) {
    // Gunakan ThinkingLevel.LOW agar latensi percakapan interaktif tetap rendah,
    // tanpa membatasi maxOutputTokens terlalu sempit karena thinking token ikut dihitung.
    nextConfig.thinkingConfig = { thinkingLevel: 'LOW' };
    if (typeof nextConfig.maxOutputTokens === 'number' && nextConfig.maxOutputTokens < 4096) {
      delete nextConfig.maxOutputTokens;
    }
  }

  return nextConfig;
}

export function isInvalidApiKeyError(error) {
  if (error?.isAppError) return false;
  const { statusCode, cleanMessage } = parseGeminiErrorDetails(error);
  const lower = cleanMessage.toLowerCase();
  if (statusCode === 401 || statusCode === 403) {
    return true;
  }
  return (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('api key expired') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated') ||
    lower.includes('gemini_api_key belum dikonfigurasi')
  );
}

export function isModelUnavailableError(error) {
  if (error?.isAppError) return false;
  const { statusCode, cleanMessage } = parseGeminiErrorDetails(error);
  const lower = cleanMessage.toLowerCase();
  if (statusCode === 404) return true;
  if (
    lower.includes('no longer available') ||
    lower.includes('not available to new users') ||
    lower.includes('update your code to use') ||
    lower.includes('is not found') ||
    lower.includes('model not found') ||
    lower.includes('does not exist') ||
    lower.includes('not supported for generatecontent') ||
    lower.includes('unsupported model') ||
    lower.includes('deprecated') ||
    (statusCode === 400 && lower.includes('models/'))
  ) {
    return true;
  }
  return false;
}

export function isTransientGeminiError(error) {
  if (error?.isTimeout) return true;
  if (isModelUnavailableError(error) || isInvalidApiKeyError(error)) return false;
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
    lower.includes('enotfound') ||
    lower.includes('fetch failed')
  );
}

function isCleanIndonesianAppMessage(msg = '') {
  const s = String(msg || '').trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (
    lower.includes('models/') ||
    lower.includes('gemini-') ||
    lower.includes('no longer available') ||
    lower.includes('please update your code') ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('resource_exhausted') ||
    lower.includes('exception') ||
    s.startsWith('{') ||
    s.includes('http://') ||
    s.includes('https://')
  ) {
    return false;
  }
  return (
    lower.includes('sarah') ||
    lower.includes('ujian') ||
    lower.includes('akses ditolak') ||
    lower.includes('lampiran') ||
    lower.includes('tidak boleh kosong') ||
    lower.includes('dibatalkan')
  );
}

export function formatGeminiError(error) {
  const { statusCode: initialCode, cleanMessage: initialMsg } = parseGeminiErrorDetails(error);
  let statusCode = initialCode;
  let cleanMessage = initialMsg;
  const lower = cleanMessage.toLowerCase();

  if (error?.name === 'AbortError' || statusCode === 499) {
    const abortErr = new Error('Permintaan analisis SARAH dibatalkan.');
    abortErr.name = 'AbortError';
    abortErr.statusCode = 499;
    return abortErr;
  }

  if (error?.isAppError || isCleanIndonesianAppMessage(cleanMessage)) {
    const appErr = new Error(cleanMessage);
    appErr.statusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 400;
    appErr.isAppError = true;
    return appErr;
  }

  if (error?.isTimeout || statusCode === 504 || lower.includes('timeout') || lower.includes('timed out')) {
    statusCode = 504;
    cleanMessage =
      'Koneksi ke layanan SARAH AI sedang padat sehingga waktu tunggu habis. Silakan coba kirim ulang sebentar lagi.';
  } else if (isInvalidApiKeyError(error)) {
    statusCode = statusCode === 401 || statusCode === 403 ? statusCode : 500;
    cleanMessage =
      'Konfigurasi layanan SARAH AI di server sedang perlu diperiksa oleh administrator. Silakan coba beberapa saat lagi.';
  } else if (isModelUnavailableError(error)) {
    statusCode = 503;
    cleanMessage =
      'Layanan model SARAH AI sedang diperbarui atau belum tersedia sementara. Silakan coba kirim ulang beberapa saat lagi.';
  } else if (statusCode === 503 || lower.includes('high demand') || lower.includes('overloaded')) {
    statusCode = 503;
    cleanMessage =
      'Server layanan SARAH AI sedang mengalami antrean padat sementara. Silakan coba kirim ulang beberapa detik lagi.';
  } else if (statusCode === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
    statusCode = 429;
    cleanMessage =
      'Batas antrean penggunaan layanan SARAH AI sedang penuh sementara. Silakan tunggu sejenak lalu coba kirim ulang.';
  } else if (
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    lower.includes('network')
  ) {
    statusCode = 502;
    cleanMessage =
      'Koneksi jaringan ke server SARAH AI terputus sementara. Silakan coba kirim ulang beberapa saat lagi.';
  } else if (statusCode === 400) {
    cleanMessage =
      'Permintaan belum dapat diproses oleh layanan SARAH AI saat ini. Silakan periksa kembali pesan atau lampiran lalu coba kirim ulang.';
  } else {
    cleanMessage =
      'Layanan SARAH AI sedang mengalami kendala koneksi sementara. Silakan coba kirim ulang beberapa saat lagi.';
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
  tools,
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
    tools: tools || null,
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

async function runStreamAttemptWithAbortAndTimeout({
  ai,
  model,
  contents,
  config,
  timeoutMs,
  externalSignal,
  onChunk,
}) {
  if (externalSignal?.aborted) {
    throw createAbortError();
  }

  const attemptController = new AbortController();
  let timedOut = false;
  let externallyAborted = false;
  let receivedAnyChunk = false;

  const onExternalAbort = () => {
    externallyAborted = true;
    attemptController.abort();
  };

  if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const effectiveTimeoutMs = Math.max(5000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
  let timeoutTimer = setTimeout(() => {
    timedOut = true;
    attemptController.abort();
  }, effectiveTimeoutMs);

  const resetIdleTimer = (nextMs) => {
    clearTimeout(timeoutTimer);
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      attemptController.abort();
    }, nextMs);
  };

  try {
    let fullText = '';
    const abortRace = new Promise((_, reject) => {
      attemptController.signal.addEventListener(
        'abort',
        () => {
          if (externallyAborted || externalSignal?.aborted) {
            reject(createAbortError());
          } else if (timedOut) {
            const err = new Error(`Streaming ${model} melebihi batas waktu (${effectiveTimeoutMs} ms).`);
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

    const consumeStream = (async () => {
      const streamResp = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          ...config,
          abortSignal: attemptController.signal,
        },
      });

      for await (const chunk of streamResp) {
        if (attemptController.signal.aborted) {
          throw createAbortError();
        }
        // Setelah chunk pertama masuk, beri waktu lebih longgar antar chunk
        resetIdleTimer(14000);
        const piece = typeof chunk?.text === 'string' ? chunk.text : '';
        if (piece) {
          receivedAnyChunk = true;
          fullText += piece;
          if (typeof onChunk === 'function') {
            onChunk(piece, fullText);
          }
        }
      }
      return fullText;
    })();

    const text = await Promise.race([consumeStream, abortRace]);
    return { text, receivedAnyChunk };
  } catch (err) {
    err.receivedAnyChunk = receivedAnyChunk;
    throw err;
  } finally {
    clearTimeout(timeoutTimer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Layanan terpusat SARAH Gemini dengan:
 * - Sistem Antrean terkontrol (`MAX_CONCURRENT_REQUESTS`) berbasis `AbortController`
 * - Pilihan kecepatan model (`auto`, `fast`, `standard`) & fallback berurutan
 * - Jeda 1,2 detik sebelum pindah fallback model saat 429/503/timeout
 * - Result Caching (`responseCache`) berbasis hash SHA-256 & deduplikasi permintaan identik
 */
export async function askSarahGemini({
  contents,
  systemInstruction = '',
  config = {},
  model,
  fallbackModels,
  speedMode = 'auto',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_MAX_RETRIES,
  fastChat = false,
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
  const presetModels = resolveSpeedPresetModels(speedMode);
  const effectiveModel = model || presetModels[0] || SARAH_GEMINI_MODEL;
  const effectiveFallbacks = Array.isArray(fallbackModels) ? fallbackModels : presetModels;
  const rawCandidates = buildModelCandidateList(effectiveModel, effectiveFallbacks);
  const candidateModels = orderModelsByHealth(rawCandidates);

  const finalConfig = { ...config };
  if (systemInstruction && !finalConfig.systemInstruction) {
    finalConfig.systemInstruction = systemInstruction;
  }

  const effectiveCacheKey = useCache
    ? buildDeterministicCacheKey({
        model: `${effectiveModel}:${speedMode}`,
        contents,
        systemInstruction: finalConfig.systemInstruction,
        responseMimeType: finalConfig.responseMimeType,
        responseSchema: finalConfig.responseSchema,
        tools: finalConfig.tools,
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
      let bestError = null;
      const maxSilentRetries = Math.min(2, Math.max(0, Number(retries) || 0));
      let silentRetriesUsed = 0;

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const candidateModel = candidateModels[mIdx];
        const hasNextFallback = mIdx < candidateModels.length - 1;
        const modelConfig = buildConfigForModel(finalConfig, candidateModel, fastChat, speedMode);
        const hasTools = Array.isArray(modelConfig.tools) && modelConfig.tools.length > 0;
        const fastCapMs = hasTools ? Math.max(FAST_CHAT_TIMEOUT_MS, 14000) : FAST_CHAT_TIMEOUT_MS;
        const perAttemptTimeoutMs = fastChat
          ? Math.min(Number(timeoutMs) || fastCapMs, fastCapMs)
          : Number(timeoutMs) || DEFAULT_TIMEOUT_MS;
        const maxAttemptsThisModel = mIdx === 0 ? 1 + maxSilentRetries : 1;

        for (let attempt = 0; attempt < maxAttemptsThisModel; attempt++) {
          if (signal?.aborted) {
            throw createAbortError();
          }
          if (attempt > 0) {
            const delayMs = SILENT_RETRY_DELAYS_MS[Math.min(attempt - 1, SILENT_RETRY_DELAYS_MS.length - 1)] || 1500;
            await sleep(delayMs);
            if (signal?.aborted) {
              throw createAbortError();
            }
          }

          try {
            let rawResponse;
            try {
              rawResponse = await runAttemptWithAbortAndTimeout({
                ai,
                model: candidateModel,
                contents,
                config: modelConfig,
                timeoutMs: perAttemptTimeoutMs,
                externalSignal: signal,
              });
            } catch (toolErr) {
              const td = parseGeminiErrorDetails(toolErr);
              const tLower = td.cleanMessage.toLowerCase();
              const isToolUnsupported =
                hasTools &&
                td.statusCode === 400 &&
                (tLower.includes('search') ||
                  tLower.includes('tool') ||
                  tLower.includes('grounding') ||
                  tLower.includes('not supported'));
              if (!isToolUnsupported) {
                throw toolErr;
              }
              const configWithoutTools = { ...modelConfig };
              delete configWithoutTools.tools;
              rawResponse = await runAttemptWithAbortAndTimeout({
                ai,
                model: candidateModel,
                contents,
                config: configWithoutTools,
                timeoutMs: perAttemptTimeoutMs,
                externalSignal: signal,
              });
            }

            clearModelCooldown(candidateModel);
            const text = typeof rawResponse?.text === 'string' ? rawResponse.text : '';
            const result = {
              text,
              rawResponse,
              fromCache: false,
              cacheKeyHash: effectiveCacheKey || '',
              model: candidateModel,
            };

            if (effectiveCacheKey && text.trim()) {
              writeResponseCache(effectiveCacheKey, result);
            }

            return result;
          } catch (err) {
            if (err?.name === 'AbortError' || signal?.aborted) {
              throw err;
            }

            if (isInvalidApiKeyError(err)) {
              throw err;
            }

            const details = parseGeminiErrorDetails(err);

            if (isModelUnavailableError(err)) {
              recordModelCooldown(candidateModel, 'unavailable');
              if (!bestError) bestError = err;
              console.warn(
                `[sarah-gemini-service] Model ${candidateModel} tidak tersedia (status ${details.statusCode}: ${details.cleanMessage})${
                  hasNextFallback ? `, beralih ke ${candidateModels[mIdx + 1]}.` : '.'
                }`
              );
              break;
            }

            bestError = err;

            if (isTransientGeminiError(err)) {
              recordModelCooldown(candidateModel, 'transient');
              // Bila masih punya model fallback, pindah cepat ke gemini-2.5-flash-lite / model cadangan
              // atau lakukan silent retry berjeda 1.5s / 3s saat di model utama atau terakhir
              if (attempt < maxAttemptsThisModel - 1 && !hasNextFallback) {
                silentRetriesUsed += 1;
                console.warn(
                  `[sarah-gemini-service] Silent auto-retry #${silentRetriesUsed} pada ${candidateModel} (status ${details.statusCode}):`,
                  details.cleanMessage
                );
                continue;
              }
              if (hasNextFallback) {
                const switchDelay =
                  silentRetriesUsed === 0
                    ? FALLBACK_SWITCH_DELAY_MS
                    : SILENT_RETRY_DELAYS_MS[Math.min(silentRetriesUsed - 1, SILENT_RETRY_DELAYS_MS.length - 1)] || FALLBACK_SWITCH_DELAY_MS;
                silentRetriesUsed += 1;
                console.warn(
                  `[sarah-gemini-service] ${candidateModel} lambat/padat (status ${details.statusCode}: ${details.cleanMessage}), jeda ${switchDelay}ms lalu beralih ke ${candidateModels[mIdx + 1]}.`
                );
                await sleep(switchDelay);
                if (signal?.aborted) {
                  throw createAbortError();
                }
                break;
              }
              if (attempt < maxAttemptsThisModel - 1) {
                silentRetriesUsed += 1;
                continue;
              }
            }

            throw err;
          }
        }
      }

      throw bestError;
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

export async function askSarahGeminiStream({
  contents,
  systemInstruction = '',
  config = {},
  model,
  fallbackModels,
  speedMode = 'auto',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fastChat = true,
  signal,
  apiKey,
  onChunk,
}) {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const ai = getGeminiClient(apiKey);
  const presetModels = resolveSpeedPresetModels(speedMode);
  const effectiveModel = model || presetModels[0] || SARAH_GEMINI_MODEL;
  const effectiveFallbacks = Array.isArray(fallbackModels) ? fallbackModels : presetModels;
  const rawCandidates = buildModelCandidateList(effectiveModel, effectiveFallbacks);
  const candidateModels = orderModelsByHealth(rawCandidates);

  const finalConfig = { ...config };
  if (systemInstruction && !finalConfig.systemInstruction) {
    finalConfig.systemInstruction = systemInstruction;
  }

  await acquireQueueSlot(MAX_QUEUE_WAIT_MS, signal);
  try {
    let bestError = null;
    let streamRetriesUsed = 0;

    for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
      const candidateModel = candidateModels[mIdx];
      const hasNextFallback = mIdx < candidateModels.length - 1;
      const modelConfig = buildConfigForModel(finalConfig, candidateModel, fastChat, speedMode);
      const hasTools = Array.isArray(modelConfig.tools) && modelConfig.tools.length > 0;
      const fastCapMs = hasTools ? Math.max(FAST_CHAT_TIMEOUT_MS, 14000) : FAST_CHAT_TIMEOUT_MS;
      const perAttemptTimeoutMs = fastChat
        ? Math.min(Number(timeoutMs) || fastCapMs, fastCapMs)
        : Number(timeoutMs) || DEFAULT_TIMEOUT_MS;

      if (signal?.aborted) {
        throw createAbortError();
      }

      try {
        let streamed;
        try {
          streamed = await runStreamAttemptWithAbortAndTimeout({
            ai,
            model: candidateModel,
            contents,
            config: modelConfig,
            timeoutMs: perAttemptTimeoutMs,
            externalSignal: signal,
            onChunk,
          });
        } catch (toolErr) {
          const td = parseGeminiErrorDetails(toolErr);
          const tLower = td.cleanMessage.toLowerCase();
          const isToolUnsupported =
            hasTools &&
            !toolErr?.receivedAnyChunk &&
            td.statusCode === 400 &&
            (tLower.includes('search') ||
              tLower.includes('tool') ||
              tLower.includes('grounding') ||
              tLower.includes('not supported'));
          if (!isToolUnsupported) {
            throw toolErr;
          }
          const configWithoutTools = { ...modelConfig };
          delete configWithoutTools.tools;
          streamed = await runStreamAttemptWithAbortAndTimeout({
            ai,
            model: candidateModel,
            contents,
            config: configWithoutTools,
            timeoutMs: perAttemptTimeoutMs,
            externalSignal: signal,
            onChunk,
          });
        }

        clearModelCooldown(candidateModel);
        return {
          text: streamed.text,
          fromCache: false,
          model: candidateModel,
        };
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) {
          throw err;
        }

        if (isInvalidApiKeyError(err) || err?.receivedAnyChunk) {
          throw err;
        }

        const details = parseGeminiErrorDetails(err);

        if (isModelUnavailableError(err)) {
          recordModelCooldown(candidateModel, 'unavailable');
          if (!bestError) bestError = err;
          console.warn(
            `[sarah-gemini-service] Stream ${candidateModel} tidak tersedia (status ${details.statusCode}: ${details.cleanMessage})${
              hasNextFallback ? `, beralih ke ${candidateModels[mIdx + 1]}.` : '.'
            }`
          );
          continue;
        }

        bestError = err;

        if (isTransientGeminiError(err) && hasNextFallback) {
          recordModelCooldown(candidateModel, 'transient');
          const delayMs =
            streamRetriesUsed === 0
              ? FALLBACK_SWITCH_DELAY_MS
              : SILENT_RETRY_DELAYS_MS[Math.min(streamRetriesUsed - 1, SILENT_RETRY_DELAYS_MS.length - 1)] || FALLBACK_SWITCH_DELAY_MS;
          streamRetriesUsed += 1;
          console.warn(
            `[sarah-gemini-service] Stream ${candidateModel} lambat/padat (status ${details.statusCode}: ${details.cleanMessage}), jeda ${delayMs}ms lalu beralih ke ${candidateModels[mIdx + 1]}.`
          );
          await sleep(delayMs);
          if (signal?.aborted) {
            throw createAbortError();
          }
          continue;
        }

        throw err;
      }
    }

    throw bestError;
  } finally {
    releaseQueueSlot();
  }
}

export function getSarahGeminiMetrics() {
  return {
    model: SARAH_GEMINI_MODEL,
    fallbackModels: SARAH_GEMINI_FALLBACK_MODELS,
    maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
    activeRequestsCount,
    queuedRequestsCount: pendingQueue.length,
    cacheEntriesCount: responseCache.size,
  };
}
