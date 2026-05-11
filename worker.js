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

    // Activity logger — logs event and notifies all team leaders via Telegram
    if (request.method === 'POST' && url.pathname === '/log-activity') {
      return handleLogActivity(request, env);
    }

    // Register a user (agent or team_leader) in the bot's KV registry
    if (request.method === 'POST' && url.pathname === '/register-bot-user') {
      return handleRegisterBotUser(request, env);
    }

    // Verify admin invite code and upgrade role in Supabase (server-side only)
    if (request.method === 'POST' && url.pathname === '/verify-invite-code') {
      return handleVerifyInviteCode(request, env);
    }

    return new Response('Amber Worker OK', { status: 200, headers: CORS_HEADERS });
  },

  // ── Cron triggers ─────────────────────────────────────────────────────────
  async scheduled(event, env, ctx) {
    // Route by cron expression to avoid double-firing
    const cron = event.cron;
    if (cron === '0 23 * * *') {
      // 11:00 PM UTC = 5:00 AM Dhaka (UTC+6): daily summary
      ctx.waitUntil(sendDailySummary(env));
    } else {
      // Every-minute cron: reminders + auto-miss
      ctx.waitUntil(runMinuteCron(env));
    }
  },
};

// ── /webhook — full bot flow: role selection → agent or team leader ────────
async function handleWebhook(request, env) {
  try {
    const update = await request.json();

    // Inline keyboard button press (role selection)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, env);
      return new Response('ok');
    }

    const msg = update.message || update.edited_message;
    if (!msg) return new Response('ok');

    const chatId = String(msg.chat.id);
    const text   = (msg.text || '').trim();

    if (text === '/start' || text.startsWith('/start ')) {
      await handleStart(chatId, env);
      return new Response('ok');
    }

    // Multi-step conversation state
    const state = await env.AMBER_KV.get(`bot:state:${chatId}`);
    if (state === 'AWAIT_AGENT_NAME')  { await handleAgentName(chatId, text, env);  return new Response('ok'); }
    if (state === 'AWAIT_LEADER_CODE') { await handleLeaderCode(chatId, text, env); return new Response('ok'); }

    // Returning user — show status
    const user = await getUser(env, chatId);
    if (user) {
      const roleLabel = user.role === 'team_leader' ? '👔 Team Leader' : '👨\u200d💻 Agent';
      await sendTelegramMsg(env, chatId,
        `👋 Welcome back, <b>${escapeHtml(user.name)}</b>!\n\nRole: ${roleLabel}\n\nSend /start to re-register or change your role.`,
        'HTML');
    } else {
      await handleStart(chatId, env);
    }
    return new Response('ok');
  } catch {
    return new Response('ok');
  }
}

async function handleStart(chatId, env) {
  await fetch(`${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `👋 Welcome to <b>Amber Flow</b>!\n\nThis bot keeps your team connected and accountable.\n\n📱 Please select your role:`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '👨\u200d💻 Login as Agent',       callback_data: 'role_agent' },
          { text: '👔 Login as Team Leader', callback_data: 'role_leader' },
        ]],
      },
    }),
  });
}

async function handleCallbackQuery(cb, env) {
  const chatId = String(cb.from.id);
  // Always acknowledge immediately
  await fetch(`${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: cb.id }),
  });
  if (cb.data === 'role_agent') {
    await env.AMBER_KV.put(`bot:state:${chatId}`, 'AWAIT_AGENT_NAME', { expirationTtl: 600 });
    await sendTelegramMsg(env, chatId,
      `👨\u200d💻 <b>Agent Setup</b>\n\nPlease type your <b>name or agent ID</b>:`, 'HTML');
  } else if (cb.data === 'role_leader') {
    await env.AMBER_KV.put(`bot:state:${chatId}`, 'AWAIT_LEADER_CODE', { expirationTtl: 600 });
    await sendTelegramMsg(env, chatId,
      `👔 <b>Team Leader Setup</b>\n\nPlease type your <b>name or team leader code</b>:`, 'HTML');
  }
}

async function handleAgentName(chatId, name, env) {
  if (!name || name.length < 2) {
    await sendTelegramMsg(env, chatId, '❌ Please enter a valid name (at least 2 characters).');
    return;
  }
  const user = { chatId, role: 'agent', name, registeredAt: Date.now() };
  await setUser(env, chatId, user);
  await env.AMBER_KV.delete(`bot:state:${chatId}`);
  await addToList(env, 'bot:agents', { chatId, name });
  await removeFromList(env, 'bot:leaders', chatId);
  await sendTelegramMsg(env, chatId,
    `✅ <b>Registered as Agent!</b>\n\n👤 Name: <b>${escapeHtml(name)}</b>\n\nYour activity will be automatically reported to your Team Leader.\n\n📱 Open Amber Flow and save this Chat ID in Telegram settings:\n<code>${chatId}</code>`,
    'HTML');
}

async function handleLeaderCode(chatId, nameOrCode, env) {
  if (!nameOrCode || nameOrCode.length < 2) {
    await sendTelegramMsg(env, chatId, '❌ Please enter a valid name or code (at least 2 characters).');
    return;
  }
  const user = { chatId, role: 'team_leader', name: nameOrCode, registeredAt: Date.now() };
  await setUser(env, chatId, user);
  await env.AMBER_KV.delete(`bot:state:${chatId}`);
  await addToList(env, 'bot:leaders', { chatId, name: nameOrCode });
  await removeFromList(env, 'bot:agents', chatId);
  const agents = await getList(env, 'bot:agents');
  await sendTelegramMsg(env, chatId,
    `<b>Registered as Team Leader</b>\n\nName: <b>${escapeHtml(nameOrCode)}</b>\nAgents monitored: <b>${agents.length}</b>\n\nYou will be notified when agents start/stop sessions, schedule appointments and miss follow-ups.\nDaily summaries are sent at 9 AM UTC.`,
    'HTML');
}

// ── /log-activity — real-time structured notifications to all team leaders ─
async function handleLogActivity(request, env) {
  try {
    const body = await request.json();
    const {
      action, agentName, agentChatId, projectName,
      startTime, endTime, duration,
      title, scheduledTime, reminderMinutes,
    } = body;
    if (!action || !agentName) return jsonRes({ ok: false, error: 'action and agentName required' }, 400);

    const nowStr  = formatTgTime(new Date().toISOString());
    const dateStr = new Date().toISOString().slice(0, 10);
    const agent   = escapeHtml(agentName);
    const project = escapeHtml(projectName || 'General');
    const task    = escapeHtml(title || '');

    let msg = '';
    switch (action) {
      case 'START_TRACKER':
        msg = `<b>Session Started</b>\n` +
              `Agent: <b>${agent}</b>\n` +
              `Project: <b>${project}</b>\n` +
              `Time: ${startTime ? formatTgTime(startTime) : nowStr}`;
        break;

      case 'STOP_TRACKER':
        msg = `<b>Session Ended</b>\n` +
              `Agent: <b>${agent}</b>\n` +
              `Project: <b>${project}</b>\n` +
              `Duration: <b>${duration || '—'}</b>\n` +
              `${startTime ? formatTgTime(startTime) : '—'} → ${endTime ? formatTgTime(endTime) : nowStr}`;
        break;

      case 'PAUSE_TRACKER':
        msg = `<b>Session Paused</b>\n` +
              `Agent: <b>${agent}</b>\n` +
              `Project: <b>${project}</b>\n` +
              `Worked: <b>${duration || '—'}</b>`;
        break;

      case 'CREATE_APPOINTMENT': {
        const schedStr = scheduledTime ? formatTgTime(scheduledTime) : '—';
        msg = `<b>Appointment Scheduled</b>\n` +
              `Agent: <b>${agent}</b>\n` +
              `Project: <b>${project}</b>\n` +
              `Title: <b>${task}</b>\n` +
              `Time: ${schedStr}`;
        break;
      }

      case 'REMINDER_APPOINTMENT':
        msg = `<b>Upcoming Appointment</b>\n` +
              `Agent: <b>${agent}</b>\n` +
              `Project: <b>${project}</b>\n` +
              `Title: <b>${task}</b>\n` +
              `Scheduled: ${scheduledTime ? formatTgTime(scheduledTime) : '—'}\n` +
              `Due in ${reminderMinutes || 5} minutes`;
        break;

      case 'COMPLETE_APPOINTMENT':
        msg = `<b>Appointment Done</b>\n` +
              `Agent: <b>${agent}</b>\n` +
              `Project: <b>${project}</b>\n` +
              `Title: <b>${task}</b>`;
        break;

      case 'MISS_APPOINTMENT':
        msg = `<b>Appointment Missed</b>\n` +
              `Agent: <b>${agent}</b>\n` +
              `Project: <b>${project}</b>\n` +
              `Title: <b>${task}</b>`;
        break;

      case 'UPDATE_APPOINTMENT': {
        const updSchedStr = scheduledTime ? formatTgTime(scheduledTime) : '—';
        msg = `<b>Appointment Updated</b>\n` +
              `Agent: <b>${agent}</b>\n` +
              `Project: <b>${project}</b>\n` +
              `Title: <b>${task}</b>\n` +
              `New time: ${updSchedStr}`;
        break;
      }

      default:
        msg = `<b>${agent}</b>: ${escapeHtml(action)}\n${project}`;
    }

    // Send to all registered team leaders
    const leaders = await getList(env, 'bot:leaders');
    await Promise.all(leaders.map(l => sendTelegramMsg(env, l.chatId, msg, 'HTML')));

    // Backward-compat: also notify ADMIN_CHAT_ID if not already a team leader
    if (env.ADMIN_CHAT_ID && !leaders.find(l => l.chatId === String(env.ADMIN_CHAT_ID))) {
      await sendTelegramMsg(env, env.ADMIN_CHAT_ID, msg, 'HTML');
    }

    // Persist to daily log for per-agent summary
    if (agentChatId) {
      await updateDailyLog(env, agentChatId, agentName, dateStr,
        { action, projectName, title, startTime, endTime, duration });
    }

    return jsonRes({ ok: true, notified: leaders.length });
  } catch {
    return jsonRes({ ok: false, error: 'Bad request' }, 400);
  }
}

// ── /register-bot-user — web app registers user as agent or team leader ───
async function handleRegisterBotUser(request, env) {
  try {
    const { chatId, name, role } = await request.json();
    if (!chatId || !name) return jsonRes({ ok: false, error: 'chatId and name required' }, 400);
    const userRole = role === 'team_leader' ? 'team_leader' : 'agent';
    await setUser(env, chatId, { chatId, role: userRole, name, registeredAt: Date.now() });
    const listKey  = userRole === 'team_leader' ? 'bot:leaders' : 'bot:agents';
    const otherKey = userRole === 'team_leader' ? 'bot:agents'  : 'bot:leaders';
    await addToList(env, listKey, { chatId, name });
    await removeFromList(env, otherKey, chatId);
    return jsonRes({ ok: true, role: userRole });
  } catch {
    return jsonRes({ ok: false, error: 'Bad request' }, 400);
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── /verify-invite-code — server-side admin code check, never exposes secret
async function handleVerifyInviteCode(request, env) {
  try {
    const { code, userId } = await request.json();
    if (!code || !userId) return jsonRes({ ok: false, error: 'code and userId required' }, 400);

    // Constant-time comparison to prevent timing attacks
    const expected = env.ADMIN_SECRET_CODE || '';
    if (!expected) return jsonRes({ ok: false, error: 'Invite codes not configured' }, 503);

    // Compare every character (prevents early-exit timing side-channel)
    let match = code.length === expected.length;
    for (let i = 0; i < Math.max(code.length, expected.length); i++) {
      if ((code[i] || '\0') !== (expected[i] || '\0')) match = false;
    }

    if (!match) {
      // Silently return ok:false — no hint whether code is close or wrong
      return jsonRes({ ok: false });
    }

    // Code is correct — upgrade the user's role to 'admin' in Supabase
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return jsonRes({ ok: false, error: 'Supabase not configured on worker' }, 503);
    }

    const res = await supabaseFetch(env,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'admin' }),
      }
    );

    if (!res.ok) return jsonRes({ ok: false, error: 'Failed to update role' }, 502);
    return jsonRes({ ok: true, role: 'admin' });
  } catch {
    return jsonRes({ ok: false, error: 'Bad request' }, 400);
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

// ── Minute cron: reminders + auto-miss overdue appointments ──────────────
async function runMinuteCron(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;

  const now    = new Date();
  const nowISO = now.toISOString();

  // 1. Send reminders: fetch all pending appointments due within the next 24h+1min
  //    Then filter server-side to those whose reminder window opens THIS minute.
  const reminderFrom = new Date(now.getTime() + 60_000).toISOString();
  const reminderTo   = new Date(now.getTime() + 24 * 60 * 60_000 + 60_000).toISOString(); // up to 24h+1min ahead

  const remRes = await supabaseFetch(env,
    `/rest/v1/appointments?select=id,title,project_name,scheduled_time,reminder_minutes,user_id,status` +
    `&status=eq.pending` +
    `&scheduled_time=gte.${reminderFrom}` +
    `&scheduled_time=lte.${reminderTo}`
  );
  const remAppts = await remRes.json().catch(() => []);

  for (const appt of (Array.isArray(remAppts) ? remAppts : [])) {
    const remMins = appt.reminder_minutes; // 0 = no reminder — skip entirely
    if (!remMins) continue;
    const minsUntil = Math.round((new Date(appt.scheduled_time) - now) / 60_000);
    // Fire when the time-until-appointment matches the reminder window (±1 min tolerance)
    if (Math.abs(minsUntil - remMins) > 1) continue;

    // Already sent? Use KV as dedupe guard (TTL = 2 min)
    const dupeKey = `reminder_sent:${appt.id}`;
    const already = await env.AMBER_KV.get(dupeKey);
    if (already) continue;
    await env.AMBER_KV.put(dupeKey, '1', { expirationTtl: 120 });

    // Get agent profile for name + chat id
    const profRes = await supabaseFetch(env,
      `/rest/v1/profiles?select=name,telegram_chat_id&id=eq.${appt.user_id}`
    );
    const [profile] = await profRes.json().catch(() => []);
    if (!profile) continue;

    const msg =
      `<b>Appointment Reminder</b>\n\n` +
      `<b>${escapeHtml(appt.title)}</b>\n` +
      `${escapeHtml(appt.project_name || 'General')}\n` +
      `In ${minsUntil} minute${minsUntil !== 1 ? 's' : ''}`;

    // Notify the agent directly
    if (profile.telegram_chat_id) {
      await sendTelegramMsg(env, profile.telegram_chat_id, msg, 'HTML');
    }

    // Notify all team leaders too
    const leaders = await getList(env, 'bot:leaders');
    await Promise.all(leaders.map(l =>
      sendTelegramMsg(env, l.chatId,
        `<b>Reminder — ${escapeHtml(profile.name)}</b>\n` + msg, 'HTML')
    ));
  }

  // 2. Auto-miss: flip pending → missed for appointments past their time
  const missRes = await supabaseFetch(env,
    `/rest/v1/appointments?select=id,title,project_name,user_id` +
    `&status=eq.pending` +
    `&scheduled_time=lt.${nowISO}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'missed' }) }
  );

  // Notify team leaders about any newly missed appointments
  if (missRes.ok) {
    const missed = await missRes.json().catch(() => []);
    if (Array.isArray(missed) && missed.length) {
      const leaders = await getList(env, 'bot:leaders');
      for (const appt of missed) {
        const profRes = await supabaseFetch(env,
          `/rest/v1/profiles?select=name&id=eq.${appt.user_id}`
        );
        const [profile] = await profRes.json().catch(() => []);
        const agentName = profile?.name || 'Unknown Agent';
        const msg =
          `<b>Appointment Missed</b>\n\n` +
          `Agent: ${escapeHtml(agentName)}\n` +
          `${escapeHtml(appt.title)}\n` +
          `${escapeHtml(appt.project_name || 'General')}`;
        await Promise.all(leaders.map(l => sendTelegramMsg(env, l.chatId, msg, 'HTML')));
      }
    }
  }
}

// Supabase REST helper using service_role key
function supabaseFetch(env, path, options = {}) {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.method === 'PATCH' ? 'return=representation' : '',
    },
    body: options.body,
  });
}

// ── Daily summary — per-agent report sent to all team leaders ─────────────
async function sendDailySummary(env) {
  const leaders = await getList(env, 'bot:leaders');
  const agents  = await getList(env, 'bot:agents');

  // Build recipient list (leaders + backward-compat ADMIN_CHAT_ID)
  const targets = [...leaders];
  if (env.ADMIN_CHAT_ID && !leaders.find(l => l.chatId === String(env.ADMIN_CHAT_ID))) {
    targets.push({ chatId: env.ADMIN_CHAT_ID, name: 'Admin' });
  }
  if (!targets.length) return;

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr   = yesterday.toISOString().slice(0, 10);
  const dateLabel = yesterday.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  let fullMsg = `<b>Daily Summary</b> — ${escapeHtml(dateLabel)}\n\n`;
  let anyData = false;

  for (const agent of agents) {
    const raw = await env.AMBER_KV.get(`daily:${agent.chatId}:${dateStr}`);
    if (!raw) continue;
    let log;
    try { log = JSON.parse(raw); } catch { continue; }
    anyData = true;

    const totalH = Math.floor((log.totalMs || 0) / 3600000);
    const totalM = Math.floor(((log.totalMs || 0) % 3600000) / 60000);

    // Project time breakdown
    const projMap = {};
    (log.sessions || []).forEach(s => {
      const p = s.project || 'General';
      projMap[p] = (projMap[p] || 0) + (s.durationMs || 0);
    });
    const projLines = Object.entries(projMap)
      .sort(([, a], [, b]) => b - a)
      .map(([p, ms]) => `  • ${escapeHtml(p)}: ${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`)
      .join('\n');

    const appts     = log.appointments || [];
    const doneCount = appts.filter(a => a.status === 'done' || a.status === 'completed').length;
    const pendCount = appts.filter(a => a.status === 'pending').length;

    const timeline = (log.sessions || [])
      .filter(s => s.start)
      .map(s => {
        const t1  = formatTgTime(s.start);
        const t2  = s.end ? formatTgTime(s.end) : 'ongoing';
        const dur = s.durationStr ||
          (s.durationMs ? `${Math.floor(s.durationMs / 3600000)}h ${Math.floor((s.durationMs % 3600000) / 60000)}m` : '—');
        return `  • ${t1} → ${t2} (${dur})`;
      }).join('\n');

    fullMsg += `<b>${escapeHtml(log.agentName || agent.name)}</b>\n`;
    fullMsg += `Time: <b>${totalH}h ${totalM}m</b>\n`;
    if (projLines) fullMsg += `Projects:\n${projLines}\n`;
    fullMsg += `Appointments: ${appts.length} total, ${doneCount} done, ${pendCount} pending\n`;
    if (timeline) fullMsg += `Sessions:\n${timeline}\n`;
    fullMsg += '\n';
  }

  if (!anyData) fullMsg += `<i>No activity recorded yesterday.</i>`;

  await Promise.all(targets.map(t => sendTelegramMsg(env, t.chatId, fullMsg, 'HTML')));
}

// ── KV user registry helpers ──────────────────────────────────────────────
async function getUser(env, chatId) {
  const raw = await env.AMBER_KV.get(`bot:user:${chatId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function setUser(env, chatId, user) {
  await env.AMBER_KV.put(`bot:user:${chatId}`, JSON.stringify(user), {
    expirationTtl: 60 * 60 * 24 * 365, // 1 year
  });
}

async function getList(env, key) {
  const raw = await env.AMBER_KV.get(key);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function addToList(env, key, item) {
  const list = await getList(env, key);
  const idx = list.findIndex(x => x.chatId === item.chatId);
  if (idx !== -1) list[idx] = item; else list.push(item);
  await env.AMBER_KV.put(key, JSON.stringify(list));
}

async function removeFromList(env, key, chatId) {
  const list = await getList(env, key);
  const filtered = list.filter(x => x.chatId !== chatId);
  await env.AMBER_KV.put(key, JSON.stringify(filtered));
}

function formatTgTime(isoOrMs) {
  try {
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
    if (isNaN(d.getTime())) return String(isoOrMs);
    return d.toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return String(isoOrMs); }
}

async function updateDailyLog(env, agentChatId, agentName, dateStr, event) {
  const key = `daily:${agentChatId}:${dateStr}`;
  let log = { agentChatId, agentName, date: dateStr, sessions: [], appointments: [], totalMs: 0 };
  try {
    const raw = await env.AMBER_KV.get(key);
    if (raw) log = { ...log, ...JSON.parse(raw) };
  } catch { /* use default */ }
  log.agentName = agentName;

  if (event.action === 'START_TRACKER') {
    log.sessions.push({
      project: event.projectName || 'General',
      start: event.startTime || new Date().toISOString(),
      end: null, durationMs: 0, durationStr: '',
    });
  } else if (event.action === 'STOP_TRACKER') {
    const last = [...log.sessions].reverse().find(s => !s.end);
    if (last) {
      last.end = event.endTime || new Date().toISOString();
      last.durationStr = event.duration || '';
      try {
        const ms = new Date(last.end) - new Date(last.start);
        if (ms > 0) { last.durationMs = ms; log.totalMs = (log.totalMs || 0) + ms; }
      } catch { /* noop */ }
    }
  } else if (event.action === 'CREATE_APPOINTMENT') {
    log.appointments.push({ project: event.projectName, title: event.title, status: 'pending' });
  } else if (event.action === 'COMPLETE_APPOINTMENT') {
    const a = (log.appointments || []).find(x => x.title === event.title);
    if (a) a.status = 'completed';
  } else if (event.action === 'MISS_APPOINTMENT') {
    const a = (log.appointments || []).find(x => x.title === event.title);
    if (a) a.status = 'missed';
  }

  await env.AMBER_KV.put(key, JSON.stringify(log), { expirationTtl: 60 * 60 * 24 * 7 });
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
