// api/admin.js — Admin panel: stats, manage keys, upgrade tier

import { supabase, cors } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAILS = ['gtau22609@gmail.com','kimlana269@gmail.com','kumenomikuroo@gmail.com'];
const ADMIN_PASSWORD = process.env.ADMIN_API_PASSWORD || 'apollo-admin-2025';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Admin auth via password header
  const adminPass = req.headers['x-admin-password'];
  if (adminPass !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  const { action } = req.query;

  // ── Stats dashboard ──
  if (action === 'stats') {
    const [keys, usage, users] = await Promise.all([
      supabase.from('api_keys').select('tier, is_active, usage_count'),
      supabase.from('api_usage').select('total_tokens, created_at').gte('created_at', new Date(Date.now()-86400000).toISOString()),
      supabase.from('api_keys').select('user_id').eq('is_active', true),
    ]);

    const totalKeys = keys.data?.length || 0;
    const activeKeys = keys.data?.filter(k => k.is_active).length || 0;
    const totalReqs = keys.data?.reduce((s,k) => s + (k.usage_count||0), 0) || 0;
    const todayTokens = usage.data?.reduce((s,u) => s + (u.total_tokens||0), 0) || 0;
    const byTier = { free:0, pro:0, developer:0 };
    keys.data?.forEach(k => { if(k.is_active) byTier[k.tier] = (byTier[k.tier]||0)+1; });

    return res.status(200).json({ totalKeys, activeKeys, totalReqs, todayTokens, byTier });
  }

  // ── List all keys ──
  if (action === 'keys' && req.method === 'GET') {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*, users(email, name, plan)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ keys: data });
  }

  // ── Upgrade/downgrade tier ──
  if (action === 'upgrade' && req.method === 'POST') {
    const { key_id, tier } = req.body || {};
    if (!key_id || !tier) return res.status(400).json({ error: 'key_id dan tier required.' });
    const { error } = await supabase.from('api_keys').update({ tier }).eq('id', key_id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ message: `Key diupgrade ke tier ${tier}.` });
  }

  // ── Revoke key ──
  if (action === 'revoke' && req.method === 'POST') {
    const { key_id } = req.body || {};
    const { error } = await supabase.from('api_keys').update({ is_active: false }).eq('id', key_id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ message: 'Key direvoke.' });
  }

  // ── Usage logs ──
  if (action === 'usage' && req.method === 'GET') {
    const { data, error } = await supabase
      .from('api_usage')
      .select('*, api_keys(key, tier, users(email))')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ usage: data });
  }

  return res.status(400).json({ error: 'Action tidak valid.' });
}

