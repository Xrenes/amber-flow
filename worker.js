/**
 * Amber Flow — Cloudflare Worker
 *
 * Stores task data in KV and sends daily WhatsApp summaries at 9:00 AM UTC
 * via CallMeBot (https://www.callmebot.com/blog/free-api-whatsapp-messages/).
 *
 * Setup:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler kv:namespace create "AMBER_KV"   ← copy the id into wrangler.toml
 *   4. wrangler deploy
 */

const CALLMEBOT = 'https://api.callmebot.com/whatsapp.php';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  // ── HTTP handler ──────────────────────────────────────────────────────────
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/sync') {
      return handleSync(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/send-otp') {
      return handleSendOtp(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/verify-otp') {
      return handleVerifyOtp(request, env);
    }

    return new Response('Amber Worker OK', { status: 200, headers: CORS_HEADERS });
  },

  // ── Cron trigger — daily at 9:00 AM UTC ──────────────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailySummary(env));
  },
};

// ── /sync — receives task data from the app ───────────────────────────────
async function handleSync(request, env) {
  try {
    const body = await request.json();
    const { phone, apikey, tasks, name } = body;

    if (!phone || !apikey || !Array.isArray(tasks)) {
      return jsonRes({ ok: false, error: 'Missing required fields' }, 400);
    }

    await env.AMBER_KV.put(
      'data',
      JSON.stringify({ phone, apikey, tasks, name: name || '' })
    );

    return jsonRes({ ok: true });
  } catch {
    return jsonRes({ ok: false, error: 'Bad request' }, 400);
  }
}

// ── /send-otp — generates & sends OTP via Green API ────────────────────────
async function handleSendOtp(request, env) {
  try {
    const { phone } = await request.json();
    if (!phone) return jsonRes({ ok: false, error: 'Phone required' }, 400);

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await env.AMBER_KV.put(`otp:${phone}`, otp, { expirationTtl: 300 });

    // Green API: https://green-api.com/docs/api/sending/SendMessage/
    const chatId  = `${phone}@c.us`;
    const message = `Your Amber Flow verification code is: *${otp}*\n\nThis code expires in 5 minutes. Do not share it with anyone.`;
    const gaUrl   = `https://api.green-api.com/waInstance${env.GREEN_API_INSTANCE_ID}/sendMessage/${env.GREEN_API_TOKEN}`;

    const gaRes = await fetch(gaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    });

    if (!gaRes.ok) {
      return jsonRes({ ok: false, error: 'Failed to send WhatsApp message' }, 502);
    }

    return jsonRes({ ok: true });
  } catch {
    return jsonRes({ ok: false, error: 'Bad request' }, 400);
  }
}

// ── /verify-otp — validates OTP (account creation handled client-side) ────────
async function handleVerifyOtp(request, env) {
  try {
    const { phone, otp } = await request.json();
    if (!phone || !otp) return jsonRes({ ok: false, error: 'Phone and OTP required' }, 400);

    const stored = await env.AMBER_KV.get(`otp:${phone}`);
    if (!stored)              return jsonRes({ ok: false, error: 'Code expired. Please request a new one.' }, 400);
    if (stored !== String(otp)) return jsonRes({ ok: false, error: 'Incorrect code. Please try again.' }, 400);

    // Delete OTP after successful verify (one-time use)
    await env.AMBER_KV.delete(`otp:${phone}`);

    return jsonRes({ ok: true });
  } catch {
    return jsonRes({ ok: false, error: 'Bad request' }, 400);
  }
}

// ── Daily summary message ─────────────────────────────────────────────────
async function sendDailySummary(env) {
  const raw = await env.AMBER_KV.get('data');
  if (!raw) return;

  let data;
  try { data = JSON.parse(raw); } catch { return; }

  const { phone, apikey, tasks, name } = data;
  if (!phone || !apikey || !Array.isArray(tasks)) return;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  const pending = total - done;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const overdueTasks = tasks.filter(t => {
    if (t.completed) return false;
    try { return new Date(`${t.date}T${t.time}`) < now; } catch { return false; }
  });

  const upcomingTasks = tasks
    .filter(t => {
      if (t.completed) return false;
      try { return new Date(`${t.date}T${t.time}`) >= now; } catch { return false; }
    })
    .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
    .slice(0, 3);

  const greeting = name ? `Good morning, ${name}!` : 'Good morning!';

  let msg = `${greeting} Your Amber summary for ${dateStr}:\n\n`;
  msg += `Tasks: ${total} total\n`;
  msg += `Completed: ${done} (${pct}%)\n`;
  msg += `Pending: ${pending}\n`;
  if (overdueTasks.length > 0) {
    msg += `Overdue: ${overdueTasks.length}\n`;
  }
  if (upcomingTasks.length > 0) {
    msg += `\nNext up:\n`;
    for (const t of upcomingTasks) {
      const dt = new Date(`${t.date}T${t.time}`);
      const timeStr = dt.toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
      msg += `- ${t.title} (${timeStr})\n`;
    }
  }
  msg += `\n- Amber Flow`;

  const endpoint = `${CALLMEBOT}?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(apikey)}`;
  await fetch(endpoint);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
