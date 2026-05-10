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
