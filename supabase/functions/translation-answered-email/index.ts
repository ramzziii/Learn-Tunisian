// Request a Translation: tells the requester by email that their answer is
// ready in the app.
//
// Called by the admin app (src/data/admin/translationRequests.ts) only after
// admin_answer_translation_request has durably saved the answer. It
// re-checks both of those things itself: the caller must be an admin
// (checked with *their* JWT), and the request must be 'answered'.
//
// Privacy: the email never contains the request text, the answer or any
// account detail — just "your translation is ready" and a link into the app.
//
// Email is optional. With no provider configured this reports
// { email: 'not_configured' } (and records it) instead of pretending to have
// sent anything. To enable it (Resend — https://resend.com):
//   supabase secrets set RESEND_API_KEY=... TRANSLATION_EMAIL_FROM="Learn Tunisian <hello@your-domain>"
//   (optional) supabase secrets set APP_TRANSLATIONS_URL=learntunisian://translation-requests
//   supabase functions deploy translation-answered-email
// The sending domain must be verified in Resend. SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_APP_URL = 'learntunisian://translation-requests';

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return jsonResponse({ email: 'failed', message: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let requestId: unknown;
  try {
    requestId = (await req.json())?.requestId;
  } catch {
    return jsonResponse({ email: 'failed', message: 'Malformed request body' }, 400);
  }
  if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return jsonResponse({ email: 'failed', message: 'requestId is required' }, 400);
  }

  // 1. The caller must be an admin — checked through their own JWT.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: isAdmin, error: adminError } = await caller.rpc('is_admin');
  if (adminError || isAdmin !== true) {
    return jsonResponse({ email: 'failed', message: 'Only admins can send this email.' }, 403);
  }

  // 2. The answer must already be saved. Service role from here on: the
  // requester's email isn't readable by anyone else under RLS.
  const service = createClient(supabaseUrl, serviceKey);
  const { data: request, error: requestError } = await service
    .from('translation_requests')
    .select('id, account_id, status, email_sent_at')
    .eq('id', requestId)
    .maybeSingle();
  if (requestError) return jsonResponse({ email: 'failed', message: requestError.message }, 500);
  if (!request || request.status !== 'answered') {
    return jsonResponse({ email: 'failed', message: 'This request has not been answered.' }, 409);
  }
  if (request.email_sent_at) return jsonResponse({ email: 'already_sent' });

  const record = (email_status: 'sent' | 'failed' | 'not_configured') =>
    service
      .from('translation_requests')
      .update({ email_status, ...(email_status === 'sent' ? { email_sent_at: new Date().toISOString() } : {}) })
      .eq('id', requestId);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('TRANSLATION_EMAIL_FROM');
  if (!apiKey || !from) {
    await record('not_configured');
    return jsonResponse({ email: 'not_configured' });
  }

  // The verified login email from auth.users — not public.accounts.email,
  // which used to be editable by its owner (run-1 security audit).
  const { data: userData, error: userError } = await service.auth.admin.getUserById(request.account_id);
  const recipient = userData?.user?.email;
  if (userError || !recipient) {
    await record('failed');
    return jsonResponse({ email: 'failed', message: 'No email address on the requester’s account.' });
  }

  const appUrl = Deno.env.get('APP_TRANSLATIONS_URL') ?? DEFAULT_APP_URL;
  const text =
    'Good news — your Tunisian translation and its native-speaker recording are ready.\n\n' +
    `Open the Learn Tunisian app to see and hear it: Profile → Request a Translation.\n${appUrl}\n`;
  const html =
    '<p>Good news — your Tunisian translation and its native-speaker recording are ready.</p>' +
    '<p>Open the Learn Tunisian app to see and hear it: <strong>Profile → Request a Translation</strong>.</p>' +
    `<p><a href="${appUrl}">Open in the app</a></p>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [recipient], subject: 'Your Tunisian translation is ready', text, html }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      await record('failed');
      return jsonResponse({ email: 'failed', message: `Email provider returned ${response.status}` });
    }
  } catch (err) {
    await record('failed');
    return jsonResponse({ email: 'failed', message: err instanceof Error ? err.message : 'Email request failed' });
  }

  await record('sent');
  return jsonResponse({ email: 'sent' });
});
