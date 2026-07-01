// api/v1/chat/completions.js — OpenAI-compatible chat endpoint

import { supabase, getApiKey, verifyApiKey, cors } from '../../../lib/supabase.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Rate limit in-memory per key
const rlMap = new Map();

// Tier limits (req per hari)
const TIER_LIMITS = {
  free      : { daily: 100,   rpm: 5,   models: ['llama-3.1-8b-instant','llama-3.3-70b-versatile'] },
  pro       : { daily: 1000,  rpm: 20,  models: ['*'] },
  developer : { daily: 10000, rpm: 60,  models: ['*'] },
};

// Apollo model alias → Groq model
const MODEL_ALIAS = {
  'apollo-nano'          : 'llama-3.1-8b-instant',
  'apollo-core'          : 'llama-3.3-70b-versatile',
  'apollo-scout'         : 'meta-llama/llama-4-scout-17b-16e-instruct',
  'apollo-qwen'          : 'qwen/qwen3-32b',
  'apollo-code'          : 'openai/gpt-oss-20b',
  'apollo-max'           : 'openai/gpt-oss-120b',
  'apollo-guard'         : 'openai/gpt-oss-safeguard-20b',
  'apollo-compound'      : 'groq/compound',
  'apollo-compound-mini' : 'groq/compound-mini',
  'apollo-vision'        : 'llama-3.2-90b-vision-preview',
  'apollo-vision-mini'   : 'llama-3.2-11b-vision-preview',
};

function checkRateLimit(keyId, tier) {
  const now = Date.now();
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  const dayMs = 86_400_000;
  const minMs = 60_000;

  const entry = rlMap.get(keyId) || { dayCount: 0, dayStart: now, minCount: 0, minStart: now };

  // Reset harian
  if (now - entry.dayStart > dayMs) {
    entry.dayCount = 0; entry.dayStart = now;
  }
  // Reset per menit
  if (now - entry.minStart > minMs) {
    entry.minCount = 0; entry.minStart = now;
  }

  if (entry.dayCount >= limits.daily) return { ok: false, reason: `Daily limit reached (${limits.daily}/day). Upgrade to higher tier.` };
  if (entry.minCount >= limits.rpm) return { ok: false, reason: `Rate limit reached (${limits.rpm} req/min).` };

  entry.dayCount++;
  entry.minCount++;
  rlMap.set(keyId, entry);
  return { ok: true, remaining: limits.daily - entry.dayCount };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed', type: 'invalid_request_error' } });

  // Auth
  const apiKey = getApiKey(req);
  if (!apiKey) return res.status(401).json({ error: { message: 'Missing API key. Include Authorization: Bearer apollo-sk-...', type: 'auth_error' } });

  const keyData = await verifyApiKey(apiKey);
  if (!keyData) return res.status(401).json({ error: { message: 'Invalid or expired API key.', type: 'auth_error' } });

  // Rate limit
  const tier = keyData.tier || 'free';
  const rl = checkRateLimit(keyData.id, tier);
  if (!rl.ok) return res.status(429).json({ error: { message: rl.reason, type: 'rate_limit_error' } });

  // Validasi request body
  const { model, messages, max_tokens, temperature, stream } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: { message: '`messages` is required', type: 'invalid_request_error' } });
  }
  if (stream) {
    return res.status(400).json({ error: { message: 'Streaming not supported yet.', type: 'invalid_request_error' } });
  }

  // Resolve model
  const requestedModel = model || 'apollo-core';
  const groqModel = MODEL_ALIAS[requestedModel] || requestedModel;

  // Cek akses model berdasarkan tier
  const limits = TIER_LIMITS[tier];
  if (limits.models[0] !== '*' && !limits.models.includes(groqModel)) {
    return res.status(403).json({
      error: {
        message: `Model '${requestedModel}' requires Pro or Developer tier. Your current tier: ${tier}.`,
        type: 'permission_error'
      }
    });
  }

  // Kirim ke Groq
  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: groqModel,
        messages,
        max_tokens: max_tokens || 2048,
        temperature: temperature ?? 0.7,
        stream: false,
      }),
    });

    const data = await groqRes.json();
    if (!groqRes.ok) throw new Error(data?.error?.message || 'Groq error');

    // Log usage ke Supabase
    await supabase.from('api_usage').insert({
      key_id     : keyData.id,
      user_id    : keyData.user_id,
      model      : groqModel,
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    }).catch(() => {});

    // Update last_used_at
    await supabase.from('api_keys')
      .update({ last_used_at: new Date().toISOString(), usage_count: (keyData.usage_count || 0) + 1 })
      .eq('id', keyData.id).catch(() => {});

    return res.status(200).json({
      ...data,
      model: requestedModel,
      _apollo: { tier, remaining_today: rl.remaining }
    });

  } catch (e) {
    return res.status(500).json({ error: { message: e.message, type: 'server_error' } });
  }
}
  
