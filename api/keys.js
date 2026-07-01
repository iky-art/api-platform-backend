// api/keys.js — Generate, list, delete API keys

import { supabase, cors } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAILS = ['gtau22609@gmail.com','kimlana269@gmail.com','kumenomikuroo@gmail.com'];

function corsHeaders(res) { cors(res); }

// Generate random API key
function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const rand = (n) => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  return `apollo-sk-${rand(8)}-${rand(8)}-${rand(8)}`;
}

// Verify user token via Supabase Auth
async function verifyUserToken(token) {
  const { data, error } = await createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  ).auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token required.' });

  const user = await verifyUserToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token.' });

  const isAdmin = ADMIN_EMAILS.includes(user.email);

  // ── GET — list semua key milik user ──
  if (req.method === 'GET') {
    let query = supabase.from('api_keys').select('id,key,name,tier,is_active,usage_count,last_used_at,expires_at,created_at').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('user_id', user.id);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ keys: data });
  }

  // ── POST — generate key baru ──
  if (req.method === 'POST') {
    const { name, tier, expires_days } = req.body || {};

    // Hitung jumlah key yang sudah ada
    const { data: existing } = await supabase.from('api_keys')
      .select('id').eq('user_id', user.id).eq('is_active', true);

    // Limit: Free max 1 key, Pro max 5 key, Admin unlimited
    const { data: userData } = await supabase.from('users').select('plan').eq('id', user.id).single();
    const userPlan = userData?.plan || 'free';
    const keyLimit = isAdmin ? 999 : userPlan === 'pro' ? 5 : 1;

    if ((existing?.length || 0) >= keyLimit) {
      return res.status(400).json({ error: `Batas API key tercapai (max ${keyLimit} key). Upgrade ke Pro untuk lebih banyak.` });
    }

    // Tentukan tier berdasarkan plan (user tidak bisa pilih sendiri kecuali admin)
    let assignedTier = 'free';
    if (isAdmin) {
      assignedTier = tier || 'developer';
    } else if (userPlan === 'pro') {
      assignedTier = 'pro';
    }

    const newKey = generateKey();
    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 86400000).toISOString() : null;

    const { data, error } = await supabase.from('api_keys').insert({
      user_id    : user.id,
      key        : newKey,
      name       : name || 'My Apollo Key',
      tier       : assignedTier,
      is_active  : true,
      usage_count: 0,
      expires_at : expiresAt,
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ key: data, message: 'API key berhasil dibuat!' });
  }

  // ── DELETE — hapus key ──
  if (req.method === 'DELETE') {
    const { key_id } = req.body || {};
    if (!key_id) return res.status(400).json({ error: 'key_id required.' });

    let query = supabase.from('api_keys').update({ is_active: false }).eq('id', key_id);
    if (!isAdmin) query = query.eq('user_id', user.id);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ message: 'API key dinonaktifkan.' });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
  }
