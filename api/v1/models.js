// api/v1/models.js — List available models

import { cors, getApiKey, verifyApiKey } from '../../lib/supabase.js';

const MODELS = [
  { id:'apollo-nano',           name:'Apollo Nano',           tier:'free',      context:128000, description:'Llama 3.1 8B — ultra fast' },
  { id:'apollo-core',           name:'Apollo Core',           tier:'free',      context:128000, description:'Llama 3.3 70B — best free model (default)' },
  { id:'apollo-scout',          name:'Apollo Scout',          tier:'free',      context:10000,  description:'Llama 4 Scout — latest generation' },
  { id:'apollo-qwen',           name:'Apollo Qwen',           tier:'free',      context:32000,  description:'Qwen3 32B — multilingual powerhouse' },
  { id:'apollo-code',           name:'Apollo Code',           tier:'free',      context:8192,   description:'GPT-OSS 20B — coding specialist' },
  { id:'apollo-max',            name:'Apollo Max',            tier:'pro',       context:8192,   description:'GPT-OSS 120B — most powerful' },
  { id:'apollo-guard',          name:'Apollo Guard',          tier:'pro',       context:8192,   description:'GPT-OSS Safeguard — safety & moderation' },
  { id:'apollo-compound',       name:'Apollo Compound',       tier:'pro',       context:128000, description:'Groq Compound — agentic with web tools' },
  { id:'apollo-compound-mini',  name:'Apollo Compound Mini',  tier:'pro',       context:128000, description:'Groq Compound Mini — lightweight agentic' },
  { id:'apollo-vision',         name:'Apollo Vision',         tier:'pro',       context:8192,   description:'Llama 3.2 90B Vision — image analysis' },
  { id:'apollo-vision-mini',    name:'Apollo Vision Mini',    tier:'pro',       context:8192,   description:'Llama 3.2 11B Vision — fast image analysis' },
];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = getApiKey(req);
  const keyData = apiKey ? await verifyApiKey(apiKey) : null;
  const tier = keyData?.tier || 'free';

  // Filter models berdasarkan tier
  const available = tier === 'free'
    ? MODELS.filter(m => m.tier === 'free')
    : MODELS;

  return res.status(200).json({
    object: 'list',
    data: available.map(m => ({
      id: m.id,
      object: 'model',
      created: 1700000000,
      owned_by: 'apollo-ai',
      description: m.description,
      context_window: m.context,
      tier: m.tier,
    }))
  });
}

