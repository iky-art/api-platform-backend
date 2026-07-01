// lib/supabase.js — Supabase client untuk Apollo API Platform

import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: false }
});

// Ambil API key dari header Authorization
export function getApiKey(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.headers['x-api-key'] || null;
}

// Verifikasi API key dan return key data + user
export async function verifyApiKey(key) {
  if (!key || !key.startsWith('apollo-sk-')) return null;

  const { data, error } = await supabase
    .from('api_keys')
    .select('*, users(id, email, name, plan, is_banned)')
    .eq('key', key)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  if (data.users?.is_banned) return null;

  // Cek expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  return data;
}

// CORS headers
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
}

