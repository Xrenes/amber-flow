(async () => {
  'use strict';

  const $ = id => document.getElementById(id);
  const SUPABASE_URL = 'https://usplidmagqifeesxfnov.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_iyXKwVx440bQrRJhWUrrUQ_ZyIaXfRt';

  // ── Init Supabase ──────────────────────────────────────────────────────────
  let _supabase;
  try {
    _supabase = (typeof createAmberSupabaseClient === 'function')
      ? createAmberSupabaseClient()
      : supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  } catch {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }

  // ── Auth check: must be admin or manager ──────────────────────────────────
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) {
    location.href = 'login.html';
    return;
  }

  const { data: profile } = await _supabase
    .from('profiles')
    .select('role, name')
    .eq('id', session.user.id)
    .single();

  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    $('adminAuthGuard').innerHTML = `
      <svg viewBox="0 0 24 24" width="40" height="40" stroke="#ef4444" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <p style="color:#ef4444;font-weight:600">Access denied — admin or manager role required.</p>
      <button onclick="location.href='index.html'" style="margin-top:8px;padding:8px 20px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#f1f1f3;border-radius:10px;cursor:pointer;font-family:inherit;">Back to App</button>`;
    return;
  }

  // ── Show content ──────────────────────────────────────────────────────────
  $('adminAuthGuard').classList.add('hidden');
  $('adminContent').classList.remove('hidden');

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Date range defaults ────────────────────────────────────────────────────
  const today = new Date();
  const from  = new Date(); from.setDate(today.getDate() - 6);
  const fmt   = d => d.toISOString().split('T')[0];
  $('adminDateFrom').value = fmt(from);
  $('adminDateTo').value   = fmt(today);

  // ── Tab switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-admin-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.adminTab;
      ['Overview','Appointments','Timelog','Activity'].forEach(t => {
        const el = $(`adminTab${t}`);
        if (el) el.classList.toggle('hidden', t.toLowerCase() !== tab);
      });
    });
  });

  // ── Appointment filter pills ───────────────────────────────────────────────
  let _statusFilter = 'all';
  document.querySelectorAll('[data-admin-appt-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-admin-appt-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _statusFilter = btn.dataset.adminApptFilter;
      refreshAdminData();
    });
  });

  // ── Refresh triggers ───────────────────────────────────────────────────────
  $('adminRefreshBtn').addEventListener('click', refreshAdminData);
  $('adminDateFrom').addEventListener('change', refreshAdminData);
  $('adminDateTo').addEventListener('change', refreshAdminData);

  // ── Data fetch & render ────────────────────────────────────────────────────
  async function refreshAdminData() {
    const dateFrom = $('adminDateFrom').value;
    const dateTo   = $('adminDateTo').value;
    const fromISO  = dateFrom ? new Date(dateFrom).toISOString() : null;
    const toISO    = dateTo   ? new Date(dateTo + 'T23:59:59').toISOString() : null;

    $('adminAgentCards').innerHTML = '<p class="feed-placeholder">Loading…</p>';
    $('adminApptBody').innerHTML   = '<tr><td colspan="5" class="admin-table-empty">Loading…</td></tr>';
    $('adminTimeBody').innerHTML   = '<tr><td colspan="6" class="admin-table-empty">Loading…</td></tr>';
    $('activityFeed').innerHTML    = '<p class="feed-placeholder">Loading…</p>';

    let apptQ = _supabase.from('appointments').select('*').order('scheduled_time', { ascending: false }).limit(1000);
    let timeQ = _supabase.from('time_sessions').select('*').order('start_time', { ascending: false }).limit(1000);
    let actQ  = _supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(500);

    if (fromISO) { apptQ = apptQ.gte('scheduled_time', fromISO); timeQ = timeQ.gte('start_time', fromISO); actQ = actQ.gte('created_at', fromISO); }
    if (toISO)   { apptQ = apptQ.lte('scheduled_time', toISO);   timeQ = timeQ.lte('start_time', toISO);   actQ = actQ.lte('created_at', toISO); }

    const [profRes, apptRes, timeRes, actRes] = await Promise.allSettled([
      _supabase.from('profiles').select('id, name, role, telegram_chat_id').order('name'),
      apptQ, timeQ, actQ,
    ]);

    const profiles = profRes.value?.data || [];
    const appts    = apptRes.value?.data || [];
    const sessions = timeRes.value?.data || [];
    const logs     = actRes.value?.data  || [];

    const pMap = {};
    profiles.forEach(p => { pMap[p.id] = p; });

    renderOverview(profiles, appts, sessions, pMap);
    renderAppts(appts, pMap);
    renderTimelog(sessions, pMap);
    renderActivity(logs, pMap);
  }

  // ── Overview ──────────────────────────────────────────────────────────────
  function renderOverview(profiles, appts, sessions, pMap) {
    const cards = $('adminAgentCards');
    if (!profiles.length) {
      cards.innerHTML = '<p class="feed-placeholder">No agents found yet.</p>';
      return;
    }

    const stats = {};
    profiles.forEach(p => { stats[p.id] = { totalSec: 0, apptTotal: 0, apptDone: 0, apptMissed: 0 }; });
    sessions.forEach(s => { if (stats[s.user_id]) stats[s.user_id].totalSec += s.duration_seconds || 0; });
    appts.forEach(a => {
      if (!stats[a.user_id]) return;
      stats[a.user_id].apptTotal++;
      if (a.status === 'completed') stats[a.user_id].apptDone++;
      if (a.status === 'missed')    stats[a.user_id].apptMissed++;
    });

    const todayStr      = new Date().toISOString().slice(0, 10);
    const todaySessions = sessions.filter(s => s.start_time?.slice(0,10) === todayStr);
    const todayAppts    = appts.filter(a => a.scheduled_time?.slice(0,10) === todayStr);
    const todayHours    = (todaySessions.reduce((a,s) => a + (s.duration_seconds||0), 0) / 3600).toFixed(1);
    const todayDone     = todayAppts.filter(a => a.status === 'completed').length;
    const tgConnected   = profiles.filter(p => p.telegram_chat_id).length;

    $('kpiAgents').textContent     = profiles.length;
    $('kpiHours').textContent      = `${todayHours}h`;
    $('kpiAppts').textContent      = todayAppts.length;
    $('kpiDone').textContent       = todayDone;
    $('kpiTgConnected').textContent = `${tgConnected}/${profiles.length}`;

    cards.innerHTML = profiles.map(p => {
      const s = stats[p.id];
      const h = Math.floor(s.totalSec / 3600);
      const m = Math.floor((s.totalSec % 3600) / 60);
      const pct = s.apptTotal > 0 ? Math.round((s.apptDone / s.apptTotal) * 100) : null;
      const pctClass = pct === null ? '' : pct === 100 ? 'success' : pct >= 60 ? 'accent' : 'danger';
      const roleOptions = ['agent','manager','admin'].map(r =>
        `<option value="${r}"${r === p.role ? ' selected' : ''}>${r}</option>`).join('');
      const initials = (p.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
      const tgDot = p.telegram_chat_id
        ? `<span class="admin-tg-dot connected" title="Telegram connected (${p.telegram_chat_id})"></span>`
        : `<span class="admin-tg-dot" title="No Telegram"></span>`;
      return `
        <div class="admin-agent-card">
          <div class="admin-agent-card-top">
            <div class="admin-agent-avatar">${escapeHtml(initials)}</div>
            <div class="admin-agent-card-info">
              <div class="admin-agent-card-name">${escapeHtml(p.name||'Unknown')}</div>
              <div class="admin-agent-card-meta">
                <select class="admin-role-select" data-uid="${p.id}">${roleOptions}</select>
                ${tgDot}
              </div>
            </div>
          </div>
          <div class="admin-agent-stats">
            <div class="admin-stat-row">
              <span class="admin-stat-label">Time tracked</span>
              <span class="admin-stat-val accent">${h}h ${m}m</span>
            </div>
            <div class="admin-agent-divider"></div>
            <div class="admin-stat-row">
              <span class="admin-stat-label">Appointments</span>
              <span class="admin-stat-val">${s.apptTotal}</span>
            </div>
            <div class="admin-stat-row">
              <span class="admin-stat-label">Completed</span>
              <span class="admin-stat-val success">${s.apptDone}</span>
            </div>
            ${s.apptMissed > 0 ? `<div class="admin-stat-row">
              <span class="admin-stat-label">Missed</span>
              <span class="admin-stat-val danger">${s.apptMissed}</span>
            </div>` : ''}
            ${pct !== null ? `<div class="admin-stat-row">
              <span class="admin-stat-label">Done rate</span>
              <span class="admin-stat-val ${pctClass}">${pct}%</span>
            </div>` : ''}
          </div>
        </div>`;
    }).join('');

    cards.querySelectorAll('.admin-role-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const uid = sel.dataset.uid;
        const role = sel.value;
        sel.disabled = true;
        const { error } = await _supabase.from('profiles').update({ role }).eq('id', uid);
        sel.disabled = false;
        if (error) { alert('Failed to update role: ' + error.message); sel.value = sel.dataset.prev||sel.value; }
        else sel.dataset.prev = role;
      });
      sel.dataset.prev = sel.value;
    });
  }

  // ── Appointments tab ──────────────────────────────────────────────────────
  function renderAppts(appts, pMap) {
    const tbody = $('adminApptBody');
    const filtered = _statusFilter === 'all' ? appts : appts.filter(a => a.status === _statusFilter);
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="admin-table-empty">No ${_statusFilter === 'all' ? '' : _statusFilter + ' '}appointments in this range.</td></tr>`;
      return;
    }
    const byDate = {};
    filtered.forEach(a => {
      const d = a.scheduled_time ? a.scheduled_time.slice(0,10) : 'Unknown';
      (byDate[d] = byDate[d]||[]).push(a);
    });
    const rows = [];
    Object.keys(byDate).sort((a,b) => b.localeCompare(a)).forEach(d => {
      const label = d === 'Unknown' ? 'Unknown date' :
        new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});
      rows.push(`<tr class="admin-date-group-row"><td colspan="5">${label}</td></tr>`);
      byDate[d].forEach(a => {
        const agent = escapeHtml(pMap[a.user_id]?.name||'Unknown');
        const time  = a.scheduled_time ? new Date(a.scheduled_time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}) : '—';
        const st    = a.status||'pending';
        rows.push(`<tr>
          <td><strong>${agent}</strong></td>
          <td>${escapeHtml(a.project_name||a.projectName||'')}</td>
          <td>${escapeHtml(a.title||'')}</td>
          <td>${time}</td>
          <td><span class="admin-status-badge ${st}">${st}</span></td>
        </tr>`);
      });
    });
    tbody.innerHTML = rows.join('');
  }

  // ── Time log tab ──────────────────────────────────────────────────────────
  function renderTimelog(sessions, pMap) {
    const tbody = $('adminTimeBody');
    if (!sessions.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty">No time sessions in this range.</td></tr>';
      return;
    }
    const byDate = {};
    sessions.forEach(s => {
      const d = s.start_time ? s.start_time.slice(0,10) : 'Unknown';
      (byDate[d] = byDate[d]||[]).push(s);
    });
    const rows = [];
    Object.keys(byDate).sort((a,b) => b.localeCompare(a)).forEach(d => {
      const label = d === 'Unknown' ? 'Unknown date' :
        new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});
      const daySec = byDate[d].reduce((acc,s) => acc+(s.duration_seconds||0), 0);
      const dH = Math.floor(daySec/3600), dM = Math.floor((daySec%3600)/60);
      rows.push(`<tr class="admin-date-group-row"><td colspan="6">${label} — <span style="opacity:.7;font-weight:400">total</span> ${dH}h ${dM}m</td></tr>`);
      byDate[d].forEach(s => {
        const agent  = escapeHtml(pMap[s.user_id]?.name||'Unknown');
        const startT = s.start_time ? new Date(s.start_time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}) : '—';
        const endT   = s.end_time   ? new Date(s.end_time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})   : '—';
        const h = Math.floor((s.duration_seconds||0)/3600);
        const m = Math.floor(((s.duration_seconds||0)%3600)/60);
        const dur = s.duration_seconds ? `${h}h ${m}m` : '—';
        rows.push(`<tr>
          <td><strong>${agent}</strong></td>
          <td>${escapeHtml(s.project_name||'')}</td>
          <td>${d}</td>
          <td>${startT}</td>
          <td>${endT}</td>
          <td><span class="admin-dur">${dur}</span></td>
        </tr>`);
      });
    });
    tbody.innerHTML = rows.join('');
  }

  // ── Activity feed ─────────────────────────────────────────────────────────
  function renderActivity(logs, pMap) {
    const feed = $('activityFeed');
    if (!logs.length) {
      feed.innerHTML = '<p class="feed-placeholder">No activity logged yet.</p>';
      return;
    }
    feed.innerHTML = logs.map(log => {
      const name   = escapeHtml(pMap[log.user_id]?.name||'Unknown');
      const role   = pMap[log.user_id]?.role||'';
      const action = escapeHtml((log.action_type||'').replace(/_/g,' '));
      const meta   = log.metadata;
      const detail = meta?.projectName ? ` · ${escapeHtml(meta.projectName)}` : '';
      const title  = meta?.title ? ` "${escapeHtml(meta.title)}"` : '';
      const ts = new Date(log.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
      return `<div class="feed-item">
        <span class="feed-agent">${name}</span>
        ${role ? `<span class="role-badge ${role}">${role}</span>` : ''}
        <span class="feed-action">${action}${detail}${title}</span>
        <span class="feed-ts">${ts}</span>
      </div>`;
    }).join('');
  }

  // ── Initial load ──────────────────────────────────────────────────────────
  refreshAdminData();
})();
