import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase env vars are not set for analytics drain');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

async function verifySignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.VERCEL_ANALYTICS_DRAIN_SECRET;
  if (!secret) return true; // allow if not configured
  const provided = (req.headers.get('x-vercel-signature') || '').trim();
  if (!provided) return false;

  const candidates: string[] = [];
  // HMAC-SHA256
  candidates.push(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  candidates.push(crypto.createHmac('sha256', secret).update(rawBody).digest('base64'));
  // HMAC-SHA1 (fallback just in case)
  candidates.push(crypto.createHmac('sha1', secret).update(rawBody).digest('hex'));
  candidates.push(crypto.createHmac('sha1', secret).update(rawBody).digest('base64'));

  for (const exp of candidates) {
    try {
      if (exp.length === provided.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(exp))) {
        return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

export async function POST(req: NextRequest) {
  // Read raw body for signature verification
  const raw = await req.text();
  const ok = await verifySignature(req, raw);
  if (!ok) {
    return new Response('invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const events = Array.isArray(payload) ? payload as unknown[] : [payload];
  if (!events.length) return new Response('ok', { status: 200 });

  try {
    const supabase = getSupabaseAdmin();
    const rows = events.map((e) => ({ event: e }));
    const { error } = await supabase.from('web_analytics_events').insert(rows);
    if (error) {
      console.error('Analytics drain insert error:', error);
      return new Response('db error', { status: 500 });
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('Analytics drain fatal error:', e);
    return new Response('server error', { status: 500 });
  }
}


