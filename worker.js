/**
 * Amber Flow — Cloudflare Worker
 *
 * Stores task data in KV and sends daily Telegram summaries at 9:00 AM UTC
 * via the Telegram Bot API.
 *
 * Setup:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler kv:namespace create "AMBER_KV"   ← copy the id into wrangler.toml
 *   4. wrangler secret put TELEGRAM_BOT_TOKEN     ← paste your BotFather token
 *   5. wrangler deploy
 */

const TG_API = 'https://api.telegram.org';

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

    if (request.method === 'POST' && url.pathname === '/send-tg') {
      return handleSendTg(request, env);
    }

    // Telegram webhook — bot replies with Chat ID when user messages it
    if (request.method === 'POST' && url.pathname === '/webhook') {
      return handleWebhook(request, env);
    }

    return new Response('Amber Worker OK', { status: 200, headers: CORS_HEADERS });
  },

  // ── Cron trigger — daily at 9:00 AM UTC ──────────────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailySummary(env));
  },
};

// ── /webhook — handles incoming Telegram messages, replies with Chat ID ───
async function handleWebhook(request, env) {
  try {
    const update = await request.json();
    const msg = update.message || update.edited_message;
    if (!msg) return new Response('ok');

    const chatId = String(msg.chat.id);
    const text   = (msg.text || '').trim();

    // Any message → tell them their Chat ID
    const reply =
      `👋 Welcome to Amber Flow!\n\n` +
      `Your Telegram Chat ID is:\n\n` +
      `<code>${chatId}</code>\n\n` +
      `Copy this number and paste it into the Amber Flow app to register or log in.`;

    await sendTelegramMsg(env, chatId, reply, 'HTML');
    return new Response('ok');
  } catch {
    return new Response('ok'); // always return 200 to Telegram
  }
}

// ── /sync — receives task data from the app ───────────────────────────────
async function handleSync(request, env) {
  try {
    const body = await request.json();
    const { chatId, tasks, name } = body;

    if (!chatId || !Array.isArray(tasks)) {
      return jsonRes({ ok: false, error: 'Missing required fields' }, 400);
    }

    await env.AMBER_KV.put(
      'data',
      JSON.stringify({ chatId, tasks, name: name || '' })
    );

    return jsonRes({ ok: true });
  } catch {
    return jsonRes({ ok: false, error: 'Bad request' }, 400);
  }
}

// ── /send-otp — generates & sends OTP via Telegram Bot API ────────────────
async function handleSendOtp(request, env) {
  try {
    const { chatId } = await request.json();
    if (!chatId) return jsonRes({ ok: false, error: 'chatId required' }, 400);

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await env.AMBER_KV.put(`otp:${chatId}`, otp, { expirationTtl: 300 });

    const message = `Your Amber Flow verification code is: *${otp}*\n\nThis code expires in 5 minutes\\. Do not share it with anyone\\.`;
    const tgRes = await sendTelegramMsg(env, chatId, message, 'MarkdownV2');

    if (!tgRes.ok) {
      const errBody = await tgRes.json().catch(() => ({}));
      return jsonRes({ ok: false, error: errBody.description || 'Failed to send Telegram message' }, 502);
    }

    return jsonRes({ ok: true });
  } catch {
    return jsonRes({ ok: false, error: 'Bad request' }, 400);
  }
}

// ── /verify-otp — validates OTP (account creation handled client-side) ────
async function handleVerifyOtp(request, env) {
  try {
    const { chatId, otp } = await request.json();
    if (!chatId || !otp) return jsonRes({ ok: false, error: 'chatId and OTP required' }, 400);

    const stored = await env.AMBER_KV.get(`otp:${chatId}`);
    if (!stored)                return jsonRes({ ok: false, error: 'Code expired. Please request a new one.' }, 400);
    if (stored !== String(otp)) return jsonRes({ ok: false, error: 'Incorrect code. Please try again.' }, 400);

    // Delete OTP after successful verify (one-time use)
    await env.AMBER_KV.delete(`otp:${chatId}`);

    return jsonRes({ ok: true });
  } catch {
    return jsonRes({ ok: false, error: 'Bad request' }, 400);
  }
}

// ── /send-tg — proxies a Telegram message (keeps bot token server-side) ───
async function handleSendTg(request, env) {
  try {
    const { chatId, text } = await request.json();
    if (!chatId || !text) return jsonRes({ ok: false, error: 'chatId and text required' }, 400);

    const tgRes = await sendTelegramMsg(env, chatId, text);
    if (!tgRes.ok) {
      const errBody = await tgRes.json().catch(() => ({}));
      return jsonRes({ ok: false, error: errBody.description || 'Failed to send message' }, 502);
    }

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

  const { chatId, tasks, name } = data;
  if (!chatId || !Array.isArray(tasks)) return;

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
  msg += `\n— Amber Flow`;

  await sendTelegramMsg(env, chatId, msg);
}

// ── Shared Telegram sender ────────────────────────────────────────────────
function sendTelegramMsg(env, chatId, text, parseMode) {
  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  return fetch(`${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
