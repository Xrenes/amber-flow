/* Amber Flow — Tasks, Tracker & Reminders
 * Supabase-backed, GitHub Pages hosted.
 */
(async () => {
  'use strict';

  // ─── Auth guard ─────────────────────────────
  const _demoParams = new URLSearchParams(window.location.search);
  const _isDemo    = _demoParams.get('demo') === '1';

  let currentUser = null;
  if (_isDemo) {
    // Demo mode: bypass Supabase auth
    const _demoName = _demoParams.get('name') || 'Demo';
    currentUser = { user_metadata: { name: _demoName }, email: 'demo@amberflow.internal' };
  } else {
    const { data: { session: _afSession } } = await _supabase.auth.getSession();
    if (!_afSession) {
      window.location.href = 'login.html';
      return;
    }
    currentUser = _afSession.user;
  }

  // Show app now that auth is confirmed
  document.body.classList.remove('af-loading');

  // Show user avatar initials
  const _afName = currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'U';
  const _afAvatarEl = document.getElementById('userAvatar');
  if (_afAvatarEl) {
    _afAvatarEl.textContent = _afName.charAt(0).toUpperCase();
    _afAvatarEl.title = `Signed in as ${_afName}`;
  }

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (!_isDemo) await _supabase.auth.signOut();
    window.location.href = 'login.html';
  });

  // ─── State ──────────────────────────────────
  const STORAGE_KEY = 'ember.tasks.v1';
  /** @type {Array<Task>} */
  let tasks = load();
  let currentFilter = 'pending';
  let currentLeadFilter = null; // 'S' | 'NS' | 'C' | null
  let editingId = null;
  /** Set of task IDs whose alarm has already fired this session/state. */
  const firedReminders = new Set();
  const firedDue = new Set();
  let activeAlarmTaskId = null;
  let alarmAudio = null;

  // ─── DOM refs ───────────────────────────────
  const $ = (id) => document.getElementById(id);
  const taskListEl = $('taskList');
  const emptyStateEl = $('emptyState');
  const statTotal = $('statTotal');
  const statDone = $('statDone');
  const statPending = $('statPending');
  const progressFill = $('progressFill');
  const progressPct = $('progressPct');
  const modalOverlay = $('modalOverlay');
  const taskForm = $('taskForm');
  const modalTitle = $('modalTitle');
  const titleInput = $('taskTitleInput');
  const descInput = $('taskDescInput');
  const dateInput = $('taskDateInput');
  const timeInput = $('taskTimeInput');
  const reminderInput = $('taskReminderInput');
  const alarmScreen = $('alarmScreen');
  const alarmTitle = $('alarmTitle');
  const alarmTime = $('alarmTime');
  const alarmDesc = $('alarmDesc');
  const alarmLabel = $('alarmLabel');

  const timeBtn = $('taskTimeBtn');
  const timeDisplay = $('taskTimeDisplay');
  const timePickerOverlay = $('timePickerOverlay');
  const hourWheel = $('hourWheel');
  const minuteWheel = $('minuteWheel');
  const ampmWheel = $('ampmWheel');
  const clockPreview = $('clockPreview');

  // ─── Persistence ────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  // ─── Helpers ────────────────────────────────
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function taskDateTime(t) {
    return new Date(`${t.date}T${t.time}`);
  }
  function reminderDateTime(t) {
    return new Date(taskDateTime(t).getTime() - (Number(t.reminderMinutes) || 0) * 60000);
  }
  function fmtDateTime(d) {
    return d.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }
  function timeUntil(d) {
    const ms = d.getTime() - Date.now();
    if (ms < 0) return 'Overdue';
    const mins = Math.round(ms / 60000);
    if (mins < 1) return 'Now';
    if (mins < 60) return `in ${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 24) return m ? `in ${h}h ${m}m` : `in ${h}h`;
    const days = Math.floor(h / 24);
    return `in ${days}d`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ─── Icons ──────────────────────────────────
  const ICONS = {
    check:    `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    edit:     `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    trash:    `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    bell:     `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    x:        `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    plus:     `<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  };

  // ─── Render ─────────────────────────────────
  function render() {
    // Stats
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const pending = total - done;
    const pct = total ? Math.round((done / total) * 100) : 0;
    statTotal.textContent = total;
    statDone.textContent = done;
    statPending.textContent = pending;
    progressFill.style.width = pct + '%';
    progressPct.textContent = pct + '%';

    // List
    let list = [...tasks];
    if (currentFilter === 'pending') list = list.filter(t => !t.completed);
    else if (currentFilter === 'done') list = list.filter(t => t.completed);
    if (currentLeadFilter) list = list.filter(t => (t.leadStatus || null) === currentLeadFilter);
    list.sort((a, b) => taskDateTime(a) - taskDateTime(b));

    taskListEl.innerHTML = '';
    if (list.length === 0) {
      emptyStateEl.classList.remove('hidden');
    } else {
      emptyStateEl.classList.add('hidden');
      const now = Date.now();
      const frag = document.createDocumentFragment();
      for (const t of list) {
        const dt = taskDateTime(t);
        const overdue = !t.completed && dt.getTime() < now;
        const soon = !t.completed && !overdue && dt.getTime() - now < 60 * 60000;
        const ls = t.leadStatus || null;
        const lsLabel = ls || '·';
        const div = document.createElement('div');
        div.className = `task ${t.completed ? 'done' : ''} ${overdue ? 'overdue' : ''} ${soon ? 'soon' : ''}`;
        div.innerHTML = `
          <button class="lead-tag ls-${ls || 'none'}" data-action="leadstatus" data-id="${t.id}" title="Lead status: ${ls || 'Not set'} — click to change">${lsLabel}</button>
          <button class="check" data-action="toggle" data-id="${t.id}" title="Toggle complete">${ICONS.check}</button>
          <div class="task-body" title="Double-click to edit">
            <div class="task-title">${escapeHtml(t.title)}</div>
            <div class="task-meta">
              <span class="meta-item">${ICONS.calendar} ${fmtDateTime(dt)}</span>
              ${t.completed
                ? `<span class="badge success">Done</span>`
                : overdue
                  ? `<span class="badge danger">Overdue</span>`
                  : `<span class="badge">${timeUntil(dt)}</span>`}
              ${t.reminderMinutes > 0 && !t.completed
                ? `<span class="meta-item">${ICONS.bell} ${formatReminder(t.reminderMinutes)}</span>`
                : ''}
            </div>
            ${t.description ? `<div class="task-desc">${escapeHtml(t.description)}</div>` : ''}
          </div>
          <div class="task-actions">
            <button class="icon-btn danger" data-action="delete" data-id="${t.id}" title="Delete">${ICONS.trash}</button>
          </div>
        `;
        // double-click to edit
        div.querySelector('.task-body').addEventListener('dblclick', () => openModal(t));
        frag.appendChild(div);
      }
      taskListEl.appendChild(frag);
    }
  }

  function formatReminder(mins) {
    if (mins === 0) return 'At time';
    if (mins < 60) return `${mins}m before`;
    if (mins < 1440) return `${mins / 60}h before`;
    return `${mins / 1440}d before`;
  }

  // ─── Task CRUD ──────────────────────────────
  function openModal(task = null) {
    editingId = task ? task.id : null;
    modalTitle.textContent = task ? 'Edit Task' : 'New Task';
    if (task) {
      titleInput.value = task.title;
      descInput.value = task.description || '';
      dateInput.value = task.date;
      setTimeValue(task.time);
      reminderInput.value = String(task.reminderMinutes ?? 60);
    } else {
      taskForm.reset();
      const now = new Date(Date.now() + 60 * 60000); // default: 1h from now
      dateInput.value = now.toISOString().slice(0, 10);
      setTimeValue(now.toTimeString().slice(0, 5));
      reminderInput.value = '60';
    }
    modalOverlay.classList.remove('hidden');
    setTimeout(() => titleInput.focus(), 50);
  }
  function closeModal() {
    modalOverlay.classList.add('hidden');
    editingId = null;
  }

  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      title: titleInput.value.trim(),
      description: descInput.value.trim(),
      date: dateInput.value,
      time: timeInput.value,
      reminderMinutes: Number(reminderInput.value),
    };
    if (!data.title || !data.date || !data.time) return;

    if (editingId) {
      const idx = tasks.findIndex(t => t.id === editingId);
      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...data };
        // Reset alarm-fired flags so updated time can re-trigger
        firedReminders.delete(editingId);
        firedDue.delete(editingId);
      }
    } else {
      tasks.push({
        id: uid(),
        ...data,
        completed: false,
        createdAt: Date.now(),
      });
    }
    save();
    render();
    closeModal();
  });

  taskListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (btn.dataset.action === 'toggle') {
      task.completed = !task.completed;
      save(); render();
    } else if (btn.dataset.action === 'leadstatus') {
      const cycle = { null: 'S', 'S': 'NS', 'NS': 'C', 'C': null };
      task.leadStatus = cycle[task.leadStatus || 'null'] ?? null;
      save(); render();
    } else if (btn.dataset.action === 'delete') {
      if (confirm(`Delete task "${task.title}"?`)) {
        tasks = tasks.filter(t => t.id !== id);
        firedReminders.delete(id);
        firedDue.delete(id);
        save(); render();
      }
    }
  });

  // ─── Filters ────────────────────────────────
  document.querySelectorAll('.chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      const already = chip.classList.contains('active');
      document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.remove('active'));
      if (!already) {
        chip.classList.add('active');
        currentFilter = chip.dataset.filter;
      } else {
        currentFilter = 'all';
      }
      render();
    });
  });


  // ─── Modal wiring ───────────────────────────
  $('addTaskBtn').addEventListener('click', () => openModal());
  $('closeModalBtn').addEventListener('click', closeModal);
  $('cancelBtn').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!alarmScreen.classList.contains('hidden')) return; // alarm requires explicit dismiss
      if (!modalOverlay.classList.contains('hidden')) closeModal();
    }
  });

  // ─── Notifications (auto-request on load) ──
  function updateNotifIndicator() {} // no-op, button removed
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  function showSystemNotification(task, label) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(`${label}: ${task.title}`, {
        body: task.description || `Scheduled for ${fmtDateTime(taskDateTime(task))}`,
        tag: `ember-${task.id}`,
        requireInteraction: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* noop */ }
  }

  // ─── Alarm (loud sound + full-screen) ───────
  let audioCtx = null;
  let alarmInterval = null;
  function ensureAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  // Prime the audio context on first user gesture (browsers require it).
  document.addEventListener('click', ensureAudioCtx, { once: true });

  function beep() {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Two-tone siren-like beep
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.25);
      gain.gain.linearRampToValueAtTime(0.35, now + i * 0.25 + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.25 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.25);
      osc.stop(now + i * 0.25 + 0.25);
    });
  }
  function startAlarmSound() {
    stopAlarmSound();
    beep();
    alarmInterval = setInterval(beep, 600);
  }
  function stopAlarmSound() {
    if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
  }

  function triggerAlarm(task, kind) {
    activeAlarmTaskId = task.id;
    alarmLabel.textContent = kind === 'reminder' ? 'REMINDER' : 'TASK DUE';
    alarmTitle.textContent = task.title;
    alarmTime.textContent = fmtDateTime(taskDateTime(task));
    alarmDesc.textContent = task.description || '';
    alarmDesc.classList.toggle('hidden', !task.description);
    alarmScreen.classList.remove('hidden');
    startAlarmSound();
    showSystemNotification(task, kind === 'reminder' ? 'Reminder' : 'Task due');
    sendTelegramAlarm(task, kind);
    if (document.title.indexOf('⏰') === -1) {
      document.title = '⏰ ' + document.title;
    }
  }
  function dismissAlarm() {
    alarmScreen.classList.add('hidden');
    stopAlarmSound();
    activeAlarmTaskId = null;
    document.title = document.title.replace(/^⏰\s*/, '');
  }
  function snoozeAlarm() {
    if (!activeAlarmTaskId) return dismissAlarm();
    const task = tasks.find(t => t.id === activeAlarmTaskId);
    if (task) {
      // Re-arm so it fires again in 5 minutes
      const snoozeUntil = Date.now() + 5 * 60000;
      // Use ad-hoc snooze map by abusing firedDue/firedReminders
      task._snoozeUntil = snoozeUntil;
      firedReminders.delete(task.id);
      firedDue.delete(task.id);
      save();
    }
    dismissAlarm();
  }
  $('dismissBtn').addEventListener('click', dismissAlarm);
  $('snoozeBtn').addEventListener('click', snoozeAlarm);

  // ─── Scheduler tick ─────────────────────────
  function tick() {
    const now = Date.now();
    let needsRender = false;

    for (const t of tasks) {
      if (t.completed) continue;
      if (t._snoozeUntil && now < t._snoozeUntil) continue;

      const due = taskDateTime(t).getTime();
      const remind = reminderDateTime(t).getTime();

      // Reminder fires once
      if (t.reminderMinutes > 0 && !firedReminders.has(t.id) && now >= remind && now < due) {
        firedReminders.add(t.id);
        if (!activeAlarmTaskId) triggerAlarm(t, 'reminder');
      }
      // Due-time fires once
      if (!firedDue.has(t.id) && now >= due) {
        firedDue.add(t.id);
        if (!activeAlarmTaskId) triggerAlarm(t, 'due');
        needsRender = true;
      }
    }
    // Refresh "in Xm" labels every minute roughly
    if (now - (tick._lastRender || 0) > 30000) {
      needsRender = true;
      tick._lastRender = now;
    }
    if (needsRender) render();
  }

  // Run once and then every second so even inactive tabs catch up on focus.
  setInterval(tick, 1000);

  // ─── Scrolling Time Picker ──────────────────
  const ITEM_H = 44; // matches CSS .wheel-item height
  const PADDING_ITEMS = 2; // empty spacers top/bottom so first/last can center

  function buildWheel(wheelEl, values) {
    wheelEl.innerHTML = '';
    // top spacers
    for (let i = 0; i < PADDING_ITEMS; i++) {
      const sp = document.createElement('div');
      sp.className = 'wheel-item spacer';
      sp.innerHTML = '&nbsp;';
      wheelEl.appendChild(sp);
    }
    values.forEach((v) => {
      const div = document.createElement('div');
      div.className = 'wheel-item';
      div.dataset.value = v;
      div.textContent = v;
      wheelEl.appendChild(div);
    });
    for (let i = 0; i < PADDING_ITEMS; i++) {
      const sp = document.createElement('div');
      sp.className = 'wheel-item spacer';
      sp.innerHTML = '&nbsp;';
      wheelEl.appendChild(sp);
    }
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  const HOURS = Array.from({ length: 12 }, (_, i) => pad2(i === 0 ? 12 : i));
  const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));
  const AMPM = ['AM', 'PM'];

  buildWheel(hourWheel, HOURS);
  buildWheel(minuteWheel, MINUTES);
  buildWheel(ampmWheel, AMPM);

  function getSelected(wheelEl) {
    const idx = Math.round(wheelEl.scrollTop / ITEM_H);
    const items = wheelEl.querySelectorAll('.wheel-item:not(.spacer)');
    items.forEach(el => el.classList.remove('active'));
    const selected = items[idx];
    if (selected) selected.classList.add('active');
    return selected ? selected.dataset.value : null;
  }

  function scrollToValue(wheelEl, value) {
    const items = Array.from(wheelEl.querySelectorAll('.wheel-item:not(.spacer)'));
    const idx = items.findIndex(el => el.dataset.value === value);
    if (idx >= 0) wheelEl.scrollTop = idx * ITEM_H;
    getSelected(wheelEl);
  }

  function updatePreview() {
    const h = getSelected(hourWheel) || '12';
    const m = getSelected(minuteWheel) || '00';
    const a = getSelected(ampmWheel) || 'AM';
    clockPreview.textContent = `${h}:${m} ${a}`;
  }

  // Snap + update on scroll
  let scrollTimers = new WeakMap();
  [hourWheel, minuteWheel, ampmWheel].forEach(w => {
    w.addEventListener('scroll', () => {
      // Live highlight while scrolling
      getSelected(w);
      updatePreview();
      clearTimeout(scrollTimers.get(w));
      scrollTimers.set(w, setTimeout(() => {
        // Snap to nearest
        const idx = Math.round(w.scrollTop / ITEM_H);
        w.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
        updatePreview();
      }, 120));
    });
    // Click an item to select it
    w.addEventListener('click', (e) => {
      const item = e.target.closest('.wheel-item:not(.spacer)');
      if (!item) return;
      const items = Array.from(w.querySelectorAll('.wheel-item:not(.spacer)'));
      const idx = items.indexOf(item);
      if (idx >= 0) w.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
    });
  });

  function setTimeValue(hhmm) {
    // hhmm is 24h "HH:MM"
    if (!hhmm) {
      timeInput.value = '';
      timeDisplay.textContent = '--:--';
      return;
    }
    const [H, M] = hhmm.split(':').map(Number);
    timeInput.value = pad2(H) + ':' + pad2(M);
    const ampm = H >= 12 ? 'PM' : 'AM';
    const h12 = ((H + 11) % 12) + 1;
    timeDisplay.textContent = `${pad2(h12)}:${pad2(M)} ${ampm}`;
  }

  function openTimePicker() {
    timePickerOverlay.classList.remove('hidden');
    // Initialize wheels from current value (or now)
    let hhmm = timeInput.value;
    if (!hhmm) {
      const n = new Date();
      hhmm = pad2(n.getHours()) + ':' + pad2(n.getMinutes());
    }
    const [H, M] = hhmm.split(':').map(Number);
    const ampm = H >= 12 ? 'PM' : 'AM';
    const h12 = ((H + 11) % 12) + 1;
    // Wait for layout, then scroll wheels
    requestAnimationFrame(() => {
      scrollToValue(hourWheel, pad2(h12));
      scrollToValue(minuteWheel, pad2(M));
      scrollToValue(ampmWheel, ampm);
      updatePreview();
    });
  }
  function closeTimePicker() {
    timePickerOverlay.classList.add('hidden');
  }

  timeBtn.addEventListener('click', openTimePicker);
  $('closeTimePickerBtn').addEventListener('click', closeTimePicker);
  $('timePickerCancel').addEventListener('click', closeTimePicker);
  timePickerOverlay.addEventListener('click', (e) => {
    if (e.target === timePickerOverlay) closeTimePicker();
  });
  $('timePickerSet').addEventListener('click', () => {
    const h12 = parseInt(getSelected(hourWheel) || '12', 10);
    const m = parseInt(getSelected(minuteWheel) || '0', 10);
    const a = getSelected(ampmWheel) || 'AM';
    let H = h12 % 12;
    if (a === 'PM') H += 12;
    setTimeValue(pad2(H) + ':' + pad2(m));
    closeTimePicker();
  });

  // ─── World Clocks ────────────────────────────
  const CLOCKS_KEY = 'amber.clocks.v2';
  let clockList = loadClocks();

  function loadClocks() {
    try {
      const raw = localStorage.getItem(CLOCKS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return [
      'America/Los_Angeles',  // PST/PDT
      'America/Denver',       // MST/MDT
      'America/Chicago',      // CST/CDT
      'America/New_York',     // EST/EDT
    ];
  }
  function saveClocks() { localStorage.setItem(CLOCKS_KEY, JSON.stringify(clockList)); }

  const clocksGrid = $('clocksGrid');
  const addClockOverlay = $('addClockOverlay');
  const tzSearch = $('tzSearch');
  const tzListEl = $('tzList');

  const ALL_TZ = (() => {
    try { return Intl.supportedValuesOf('timeZone'); }
    catch { return [
      'Pacific/Honolulu','America/Anchorage','America/Los_Angeles','America/Denver',
      'America/Chicago','America/New_York','America/Sao_Paulo','America/Argentina/Buenos_Aires',
      'Europe/London','Europe/Paris','Europe/Berlin','Europe/Istanbul',
      'Africa/Cairo','Africa/Lagos','Africa/Nairobi','Asia/Riyadh',
      'Asia/Dubai','Asia/Karachi','Asia/Kolkata','Asia/Dhaka',
      'Asia/Bangkok','Asia/Singapore','Asia/Shanghai','Asia/Tokyo',
      'Australia/Sydney','Pacific/Auckland'
    ]; }
  })();

  function tzOffset(tz) {
    try {
      const part = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
        .formatToParts(new Date()).find(p => p.type === 'timeZoneName');
      return part ? part.value : '';
    } catch { return ''; }
  }

  function tzLabel(tz) {
    const parts = tz.split('/');
    const city = (parts[parts.length - 1] || tz).replace(/_/g, ' ');
    const region = parts.length > 1 ? parts.slice(0, -1).join('/').replace(/_/g, ' ') : '';
    return { city, region };
  }

  function currentAbbr(tz) {
    // Returns the live abbreviation (e.g. "PST", "EDT") for the timezone right now
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(new Date()).find(p => p.type === 'timeZoneName');
      return part ? part.value : '';
    } catch { return ''; }
  }

  function renderClocks() {
    clocksGrid.innerHTML = '';
    clockList.forEach((tz, idx) => {
      const { city, region } = tzLabel(tz);
      const abbr = currentAbbr(tz);
      const storedAbbrs = (TZ_ABBR_FOR[tz] || []).join(' · ');
      const div = document.createElement('div');
      div.className = 'clock-card';
      div.dataset.tz = tz;
      div.style.animationDelay = `${idx * 50}ms`;
      div.innerHTML = `
        <button class="clock-remove" data-idx="${idx}" title="Remove clock">${ICONS.x}</button>
        <div class="clock-card-top">
          <div class="clock-abbr" id="ca-${idx}">${escapeHtml(abbr)}</div>
          <div class="clock-offset">${escapeHtml(tzOffset(tz))}</div>
        </div>
        <div class="clock-city">${escapeHtml(city)}</div>
        <div class="clock-region">${escapeHtml(tz)}</div>
        <div class="clock-time-wrap">
          <span class="clock-time" id="ct-${idx}">--:--</span><span class="clock-secs" id="cs-${idx}">:--</span><span class="clock-ampm" id="cap-${idx}"></span>
        </div>
        <div class="clock-date" id="cd-${idx}">---</div>
        ${storedAbbrs ? `<div class="clock-all-abbrs">${escapeHtml(storedAbbrs)}</div>` : ''}
      `;
      div.querySelector('.clock-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        clockList.splice(idx, 1);
        saveClocks();
        renderClocks();
      });
      clocksGrid.appendChild(div);
    });

    // "+" add button always at the end
    const addBtn = document.createElement('button');
    addBtn.className = 'clock-add-btn';
    addBtn.title = 'Add a world clock';
    addBtn.innerHTML = `<span class="clock-add-icon">${ICONS.plus}</span><span class="clock-add-label">Add Clock</span>`;
    addBtn.addEventListener('click', openAddClock);
    clocksGrid.appendChild(addBtn);

    updateClockTimes();
  }

  function updateClockTimes() {
    const now = new Date();
    clockList.forEach((tz, idx) => {
      const timeEl = document.getElementById(`ct-${idx}`);
      const secsEl = document.getElementById(`cs-${idx}`);
      const dateEl = document.getElementById(`cd-${idx}`);
      const abbrEl = document.getElementById(`ca-${idx}`);
      if (!timeEl) return;
      try {
        const h = now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: true });
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
        const m  = parts.find(p => p.type === 'minute').value.padStart(2, '0');
        const ss = parts.find(p => p.type === 'second').value.padStart(2, '0');
        // derive AM/PM
        const ampmStr = h.includes('AM') ? 'AM' : 'PM';
        const h12 = h.replace(/\s?(AM|PM)/i, '').trim();
        const date = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
        timeEl.textContent = `${h12}:${m}`;
        secsEl.textContent = ':' + ss;
        dateEl.textContent = date;
        const ampmEl = document.getElementById(`cap-${idx}`);
        if (ampmEl) ampmEl.textContent = ampmStr;
        if (abbrEl) abbrEl.textContent = currentAbbr(tz);
      } catch {}
    });
  }
  setInterval(updateClockTimes, 1000);

  // ─── Abbreviation alias map ──────────────────
  // Maps common abbreviations (and plain names) → IANA timezone
  const TZ_ALIASES = {
    // US standard / daylight
    'EST':  'America/New_York',
    'EDT':  'America/New_York',
    'ET':   'America/New_York',
    'CST':  'America/Chicago',
    'CDT':  'America/Chicago',
    'CT':   'America/Chicago',
    'MST':  'America/Denver',
    'MDT':  'America/Denver',
    'MT':   'America/Denver',
    'PST':  'America/Los_Angeles',
    'PDT':  'America/Los_Angeles',
    'PT':   'America/Los_Angeles',
    'AKST': 'America/Anchorage',
    'AKDT': 'America/Anchorage',
    'AKT':  'America/Anchorage',
    'HST':  'Pacific/Honolulu',
    'HAST': 'Pacific/Honolulu',
    'AST':  'America/Halifax',
    'ADT':  'America/Halifax',
    'NST':  'America/St_Johns',
    'NDT':  'America/St_Johns',
    // Europe
    'GMT':  'Europe/London',
    'BST':  'Europe/London',
    'WET':  'Europe/Lisbon',
    'CET':  'Europe/Paris',
    'CEST': 'Europe/Paris',
    'EET':  'Europe/Helsinki',
    'EEST': 'Europe/Helsinki',
    'MSK':  'Europe/Moscow',
    // Middle East / Asia
    'IST':  'Asia/Kolkata',
    'PKT':  'Asia/Karachi',
    'GST':  'Asia/Dubai',
    'AST+3':'Asia/Riyadh',
    'BST+6':'Asia/Dhaka',
    'ICT':  'Asia/Bangkok',
    'WIB':  'Asia/Jakarta',
    'SGT':  'Asia/Singapore',
    'MYT':  'Asia/Kuala_Lumpur',
    'CST+8':'Asia/Shanghai',
    'HKT':  'Asia/Hong_Kong',
    'JST':  'Asia/Tokyo',
    'KST':  'Asia/Seoul',
    // Australia / Pacific
    'AEST': 'Australia/Sydney',
    'AEDT': 'Australia/Sydney',
    'ACST': 'Australia/Adelaide',
    'ACDT': 'Australia/Adelaide',
    'AWST': 'Australia/Perth',
    'NZST': 'Pacific/Auckland',
    'NZDT': 'Pacific/Auckland',
    // Africa
    'WAT':  'Africa/Lagos',
    'CAT':  'Africa/Harare',
    'EAT':  'Africa/Nairobi',
    'SAST': 'Africa/Johannesburg',
    // Other
    'UTC':  'UTC',
    'Z':    'UTC',
  };

  // Build a reverse map: IANA → [abbr, abbr, …]
  const TZ_ABBR_FOR = {};
  Object.entries(TZ_ALIASES).forEach(([abbr, iana]) => {
    if (!TZ_ABBR_FOR[iana]) TZ_ABBR_FOR[iana] = [];
    // Only store clean abbreviations (no + in them for display)
    if (!abbr.includes('+')) TZ_ABBR_FOR[iana].push(abbr);
  });

  // ─── Timezone picker modal ───────────────────
  function openAddClock() {
    addClockOverlay.classList.remove('hidden');
    tzSearch.value = '';
    renderTzList('');
    setTimeout(() => tzSearch.focus(), 50);
  }
  function closeAddClock() {
    addClockOverlay.classList.add('hidden');
  }
  function renderTzList(filter) {
    const q = filter.trim().toLowerCase();

    // Find any alias matches first (exact abbreviation match gets priority)
    const aliasHits = new Set();
    if (q) {
      Object.entries(TZ_ALIASES).forEach(([abbr, iana]) => {
        if (abbr.toLowerCase().includes(q)) aliasHits.add(iana);
      });
    }

    let filtered;
    if (!q) {
      filtered = ALL_TZ.map(tz => ({ tz, alias: null }));
    } else {
      const seen = new Set();
      filtered = [];
      // 1. Alias hits first
      aliasHits.forEach(tz => {
        if (!seen.has(tz)) {
          seen.add(tz);
          const matchedAbbrs = (TZ_ABBR_FOR[tz] || [])
            .filter(a => a.toLowerCase().includes(q));
          filtered.push({ tz, alias: matchedAbbrs.join(' / ') });
        }
      });
      // 2. Then IANA name / city matches
      ALL_TZ.forEach(tz => {
        if (!seen.has(tz) && tz.toLowerCase().replace(/_/g, ' ').includes(q)) {
          seen.add(tz);
          filtered.push({ tz, alias: null });
        }
      });
    }

    tzListEl.innerHTML = '';
    if (filtered.length === 0) {
      tzListEl.innerHTML = '<div class="tz-empty">No timezones found</div>';
      return;
    }
    filtered.slice(0, 200).forEach(({ tz, alias }) => {
      const { city, region } = tzLabel(tz);
      const abbrs = TZ_ABBR_FOR[tz];
      const abbrTag = alias
        ? `<span class="tz-abbr-tag">${escapeHtml(alias)}</span>`
        : (abbrs && abbrs.length ? `<span class="tz-abbr-tag dim">${escapeHtml(abbrs.join(' / '))}</span>` : '');
      const div = document.createElement('div');
      div.className = 'tz-item';
      div.innerHTML = `
        <span>
          <strong>${escapeHtml(city)}</strong>
          <em class="tz-region">${escapeHtml(region)}</em>
          ${abbrTag}
        </span>
        <span class="tz-offset-badge">${escapeHtml(tzOffset(tz))}</span>
      `;
      div.addEventListener('click', () => {
        if (!clockList.includes(tz)) {
          clockList.push(tz);
          saveClocks();
          renderClocks();
        }
        closeAddClock();
      });
      tzListEl.appendChild(div);
    });
  }
  tzSearch.addEventListener('input', () => renderTzList(tzSearch.value));
  $('closeAddClockBtn').addEventListener('click', closeAddClock);
  addClockOverlay.addEventListener('click', (e) => {
    if (e.target === addClockOverlay) closeAddClock();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !addClockOverlay.classList.contains('hidden')) closeAddClock();
  });

  renderClocks();

  // ─── Telegram Integration ────────────────────
  const TG_KEY = 'amber.telegram.v1';
  const WORKER_URL = 'https://amber-worker.amberflow.workers.dev';

  let tgSettings = (() => {
    try {
      const raw = localStorage.getItem(TG_KEY);
      return raw ? JSON.parse(raw) : { chatId: '', name: '' };
    } catch { return { chatId: '', name: '' }; }
  })();

  function saveTGSettings(s) {
    tgSettings = s;
    localStorage.setItem(TG_KEY, JSON.stringify(s));
    updateTGIndicator();
  }

  function isTGConnected() {
    return !!tgSettings.chatId;
  }

  function updateTGIndicator() {
    const btn = $('tgSettingsBtn');
    if (!btn) return;
    const dot = btn.querySelector('.tg-dot');
    if (isTGConnected()) {
      btn.classList.add('connected');
      if (dot) dot.style.background = '#229ED9';
    } else {
      btn.classList.remove('connected');
      if (dot) dot.style.background = '';
    }
  }

  async function sendTelegramMessage(text) {
    if (!isTGConnected() || !WORKER_URL || WORKER_URL.includes('YOUR_CLOUDFLARE')) return;
    try {
      await fetch(`${WORKER_URL}/send-tg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: tgSettings.chatId, text }),
      });
    } catch { /* noop */ }
  }

  function sendTelegramAlarm(task, kind) {
    if (!isTGConnected()) return;
    const label = kind === 'reminder' ? 'REMINDER' : 'TASK DUE';
    const timeStr = fmtDateTime(taskDateTime(task));
    const statusMap = { S: 'Spoke', NS: 'Not Spoke', C: 'Cancelled' };
    const statusLine = task.leadStatus ? `Status: ${statusMap[task.leadStatus] || task.leadStatus}\n` : '';
    let msg = `[Amber] ${label}: "${task.title}"\n${statusLine}Scheduled: ${timeStr}`;
    if (task.description) msg += `\n${task.description}`;
    sendTelegramMessage(msg);
  }

  // ─── Telegram Settings Modal ─────────────────
  const tgOverlay = $('tgOverlay');
  const tgStatusBar = $('tgStatusBar');

  function openTGSettings() {
    $('tgName').value = tgSettings.name;
    $('tgChatId').value = tgSettings.chatId;
    tgStatusBar.className = 'tg-status-bar hidden';
    tgOverlay.classList.remove('hidden');
  }
  function closeTGSettings() {
    tgOverlay.classList.add('hidden');
  }
  function showTGStatus(msg, type) {
    tgStatusBar.textContent = msg;
    tgStatusBar.className = `tg-status-bar ${type}`;
  }

  $('tgSettingsBtn').addEventListener('click', openTGSettings);
  $('closeTgBtn').addEventListener('click', closeTGSettings);
  tgOverlay.addEventListener('click', e => { if (e.target === tgOverlay) closeTGSettings(); });

  $('tgSaveBtn').addEventListener('click', () => {
    const s = {
      name: $('tgName').value.trim(),
      chatId: $('tgChatId').value.trim().replace(/\D/g, ''),
    };
    if (!s.chatId) {
      showTGStatus('Telegram Chat ID is required.', 'error');
      return;
    }
    saveTGSettings(s);
    showTGStatus('Settings saved.', 'success');
    setTimeout(closeTGSettings, 800);
  });

  $('tgTestBtn').addEventListener('click', async () => {
    const chatId = $('tgChatId').value.trim().replace(/\D/g, '');
    const name = $('tgName').value.trim();
    if (!chatId) {
      showTGStatus('Enter your Telegram Chat ID first.', 'error');
      return;
    }
    showTGStatus('Sending test message…', 'info');
    const greeting = name ? `Hi ${name}!` : 'Hi!';
    const msg = `${greeting} Amber Flow is connected via Telegram. You will receive task reminders here.`;
    try {
      const res = await fetch(`${WORKER_URL}/send-tg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, text: msg }),
      });
      const data = await res.json();
      if (data.ok) {
        showTGStatus('Test message sent! Check Telegram.', 'success');
      } else {
        showTGStatus(data.error || 'Failed. Check your Chat ID.', 'error');
      }
    } catch {
      showTGStatus('Network error. Check Worker URL.', 'error');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !tgOverlay.classList.contains('hidden')) closeTGSettings();
  });

  // ─── Time Tracker ───────────────────────────
  const TRACKER_KEY = 'amber.tracker.sessions.v1';
  const TRACKER_GOAL_KEY = 'amber.tracker.goal.v1';

  let trackerRunning = false;
  let trackerStartTs = null;     // Date.now() when current run began
  let trackerElapsed = 0;        // ms accumulated before latest start (same session)
  let trackerSessionStart = null;// original session start timestamp
  let trackerProject = '';
  let trackerInterval = null;

  function loadSessions() {
    try {
      const raw = localStorage.getItem(TRACKER_KEY);
      if (!raw) return [];
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }

  function saveSessions(sessions) {
    localStorage.setItem(TRACKER_KEY, JSON.stringify(sessions));
    _syncSessionsToDB(sessions);
  }

  // ─── Supabase session sync ───────────────────
  async function _syncSessionsToDB(sessions) {
    if (!sessions.length) return;
    try {
      await _supabase.from('tracker_sessions').upsert(
        sessions.map(s => ({
          id: s.id,
          user_id: currentUser.id,
          project: s.project,
          session_date: s.date,
          start_ts: s.start,
          end_ts: s.end,
          duration: s.duration
        })),
        { onConflict: 'id' }
      );
    } catch { /* offline — localStorage is source of truth */ }
  }

  async function _deleteSessionFromDB(sessionId) {
    try {
      await _supabase.from('tracker_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', currentUser.id);
    } catch { /* noop */ }
  }

  function loadGoal() {
    const g = parseInt(localStorage.getItem(TRACKER_GOAL_KEY), 10);
    return (g > 0 && g <= 24) ? g : 7;
  }

  function saveGoal(h) {
    localStorage.setItem(TRACKER_GOAL_KEY, String(h));
  }

  function formatMs(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function formatMsHM(ms) {
    const total = Math.floor(ms / 60000);
    return `${Math.floor(total / 60)}h ${total % 60}m`;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function currentTrackerMs() {
    if (!trackerElapsed && !trackerRunning) return 0;
    return trackerElapsed + (trackerRunning ? Date.now() - trackerStartTs : 0);
  }

  function updateTrackerDisplay() {
    $('trackerDisplay').textContent = formatMs(currentTrackerMs());
    updateGoalProgress();
  }

  function updateGoalProgress() {
    const sessions = loadSessions();
    const goal = loadGoal();
    const key = todayKey();
    const savedMs = sessions.filter(s => s.date === key).reduce((a, s) => a + (s.duration || 0), 0);
    const totalMs = savedMs + currentTrackerMs();
    const pct = Math.min(100, (totalMs / (goal * 3600000)) * 100);
    $('trackerProgressBar').style.width = pct.toFixed(1) + '%';
    $('trackerProgressText').textContent = `${formatMsHM(totalMs)} / ${goal}h 0m`;
  }

  function setTrackerButtons(state) {
    $('trackerStartBtn').classList.toggle('hidden', state !== 'idle');
    $('trackerStopBtn').classList.toggle('hidden', state !== 'running');
    $('trackerResumeBtn').classList.toggle('hidden', state !== 'stopped');
    $('trackerNewBtn').classList.toggle('hidden', state !== 'stopped');
    $('trackerProject').disabled = (state === 'running');
  }

  function saveCurrentTrackerSession() {
    const ms = currentTrackerMs();
    if (!ms || !trackerProject) return;
    const start = trackerSessionStart || Date.now();
    const startDate = new Date(start);
    const dateKey = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;
    const sessions = loadSessions();
    sessions.push({ id: start, project: trackerProject, date: dateKey, start, end: Date.now(), duration: ms });
    saveSessions(sessions);
  }

  function startTracker() {
    const project = $('trackerProject').value.trim();
    if (!project) {
      $('trackerProject').focus();
      $('trackerProject').classList.add('tracker-input-error');
      setTimeout(() => $('trackerProject').classList.remove('tracker-input-error'), 1400);
      return;
    }
    trackerProject = project;
    trackerSessionStart = Date.now();
    trackerStartTs = Date.now();
    trackerElapsed = 0;
    trackerRunning = true;
    trackerInterval = setInterval(updateTrackerDisplay, 1000);
    setTrackerButtons('running');
    updateTrackerDisplay();
  }

  function stopTracker() {
    if (!trackerRunning) return;
    clearInterval(trackerInterval);
    trackerInterval = null;
    trackerElapsed += Date.now() - trackerStartTs;
    trackerRunning = false;
    setTrackerButtons('stopped');
    updateTrackerDisplay();
  }

  function resumeTracker() {
    trackerStartTs = Date.now();
    trackerRunning = true;
    trackerInterval = setInterval(updateTrackerDisplay, 1000);
    setTrackerButtons('running');
    updateTrackerDisplay();
  }

  function newTrackerSession() {
    if (trackerRunning) {
      trackerElapsed += Date.now() - trackerStartTs;
      clearInterval(trackerInterval);
      trackerRunning = false;
    }
    saveCurrentTrackerSession();
    trackerElapsed = 0;
    trackerProject = '';
    trackerSessionStart = null;
    trackerStartTs = null;
    $('trackerProject').value = '';
    $('trackerProject').disabled = false;
    $('trackerDisplay').textContent = '00:00:00';
    setTrackerButtons('idle');
    updateGoalProgress();
    renderSessionHistory();
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatDayLabel(dateStr) {
    const today = todayKey();
    if (dateStr === today) return 'Today';
    const d = new Date(dateStr + 'T00:00:00');
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const yKey = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
    if (dateStr === yKey) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function renderSessionHistory() {
    const container = $('trackerHistory');
    if (container.classList.contains('hidden')) return;
    const sessions = loadSessions();
    if (!sessions.length) {
      container.innerHTML = '<p class="tracker-empty">No sessions recorded yet.</p>';
      return;
    }
    // Group by date
    const byDate = {};
    sessions.forEach(s => { (byDate[s.date] = byDate[s.date] || []).push(s); });
    const dates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));
    let html = '';
    dates.forEach(date => {
      const list = byDate[date];
      const dayMs = list.reduce((a,s) => a + (s.duration||0), 0);
      // Group sessions by project (case-insensitive key, original casing kept from first occurrence)
      const projMap = new Map();
      list.forEach(s => {
        const key = (s.project || '').trim().toLowerCase();
        if (!projMap.has(key)) projMap.set(key, { name: s.project, total: 0, sessions: [] });
        const p = projMap.get(key);
        p.total += s.duration || 0;
        p.sessions.push(s);
      });
      // Sort projects by most time first
      const projects = [...projMap.values()].sort((a,b) => b.total - a.total);
      html += `<div class="tracker-day-group">
        <div class="tracker-day-header">
          <span class="tracker-day-duration">${formatMsHM(dayMs)}</span>
          <span class="tracker-day-name">${formatDayLabel(date)}</span>
        </div>`;
      projects.forEach(p => {
        html += `<div class="tracker-project-block">
          <div class="tracker-project-head">
            <span class="tracker-project-dot"></span>
            <span class="tracker-project-name">${escapeHtml(p.name)}</span>
            <span class="tracker-project-time">${formatMsHM(p.total)}</span>
          </div>
          <div class="tracker-project-sessions">`;
        p.sessions.slice().sort((a,b) => b.start - a.start).forEach(s => {
          const t1 = new Date(s.start).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
          const t2 = new Date(s.end).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
          html += `<div class="tracker-session-row" data-sid="${s.id}">
            <span class="tracker-session-duration">${formatMs(s.duration||0)}</span>
            <span class="tracker-session-times">${t1} – ${t2}</span>
          </div>`;
        });
        html += `</div></div>`;
      });
      html += `</div>`;
    });
    container.innerHTML = html;
  }

  $('trackerStartBtn').addEventListener('click', startTracker);
  $('trackerStopBtn').addEventListener('click', stopTracker);
  $('trackerResumeBtn').addEventListener('click', resumeTracker);
  $('trackerNewBtn').addEventListener('click', newTrackerSession);
  $('trackerGoalInput').addEventListener('change', () => {
    const v = parseInt($('trackerGoalInput').value, 10);
    if (v > 0 && v <= 24) { saveGoal(v); updateGoalProgress(); }
  });
  $('trackerHistoryToggle').addEventListener('click', () => {
    const hist = $('trackerHistory');
    const hidden = hist.classList.toggle('hidden');
    $('trackerHistoryToggle').classList.toggle('open', !hidden);
    if (!hidden) renderSessionHistory();
  });
  $('trackerProject').addEventListener('keydown', e => { if (e.key === 'Enter') startTracker(); });
  window.addEventListener('beforeunload', () => {
    if (trackerRunning) { trackerElapsed += Date.now() - trackerStartTs; trackerRunning = false; }
    if (trackerElapsed) saveCurrentTrackerSession();
  });

  // ─── Secret Manual Entry (triple-click tracker icon) ────────────────
  let iconClickCount = 0;
  let iconClickTimer = null;
  let manualEditId = null; // null = add mode, number = edit mode (session id)

  $('trackerIconBtn').addEventListener('click', () => {
    iconClickCount++;
    clearTimeout(iconClickTimer);
    if (iconClickCount >= 3) {
      iconClickCount = 0;
      openManualPanel();
    } else {
      iconClickTimer = setTimeout(() => { iconClickCount = 0; }, 600);
    }
  });

  // ── Combobox helpers ──────────────────────────────────────────
  function getUniqueProjects() {
    const sessions = loadSessions();
    const map = new Map(); // project_lower → { name, totalMs }
    sessions.forEach(s => {
      const key = (s.project || '').trim().toLowerCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, { name: s.project, total: 0 });
      map.get(key).total += s.duration || 0;
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  function buildComboList(filterText) {
    const list = $('mpComboList');
    list.innerHTML = '';
    const projects = getUniqueProjects();
    const ft = (filterText || '').trim().toLowerCase();
    const filtered = ft
      ? projects.filter(p => p.name.toLowerCase().includes(ft))
      : projects;

    if (!filtered.length && !ft) {
      list.innerHTML = '<li class="mp-combo-empty">No previous projects yet</li>';
      return;
    }

    // Existing matches
    filtered.forEach(p => {
      const li = document.createElement('li');
      li.className = 'mp-combo-item';
      li.setAttribute('role', 'option');
      li.innerHTML = `<span class="mp-combo-item-dot"></span>
        <span>${escapeHtml(p.name)}</span>
        <span class="mp-combo-item-time">${formatMsHM(p.total)}</span>`;
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        $('manualProject').value = p.name;
        closeCombo();
      });
      list.appendChild(li);
    });

    // "New project" option when typed text doesn't exactly match existing
    const exactMatch = projects.some(p => p.name.toLowerCase() === ft);
    if (ft && !exactMatch) {
      if (filtered.length) {
        const div = document.createElement('li');
        div.className = 'mp-combo-divider';
        div.setAttribute('role', 'separator');
        list.appendChild(div);
      }
      const li = document.createElement('li');
      li.className = 'mp-combo-item mp-combo-new';
      li.setAttribute('role', 'option');
      li.innerHTML = `<span class="mp-combo-item-dot"></span>New: <strong>${escapeHtml(filterText.trim())}</strong>`;
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        $('manualProject').value = filterText.trim();
        closeCombo();
      });
      list.appendChild(li);
    }
  }

  function openCombo() {
    buildComboList($('manualProject').value);
    $('mpComboList').classList.remove('hidden');
    $('mpComboToggle').classList.add('open');
  }

  function closeCombo() {
    $('mpComboList').classList.add('hidden');
    $('mpComboToggle').classList.remove('open');
  }

  $('manualProject').addEventListener('focus', openCombo);
  $('manualProject').addEventListener('input', () => {
    buildComboList($('manualProject').value);
    $('mpComboList').classList.remove('hidden');
  });
  $('manualProject').addEventListener('blur', () => setTimeout(closeCombo, 150));
  $('mpComboToggle').addEventListener('click', () => {
    if ($('mpComboList').classList.contains('hidden')) {
      $('manualProject').focus();
      openCombo();
    } else {
      closeCombo();
    }
  });

  // ── Open panel ──────────────────────────────────────────────
  let manualCurrentMode = false; // true = editing the live running/paused session

  function openManualPanel(existingSession) {
    manualEditId      = existingSession ? existingSession.id : null;
    manualCurrentMode = false;
    const pad = n => String(n).padStart(2, '0');

    // ── Show current-session banner if a timer exists ──
    const hasActive = trackerRunning || trackerElapsed > 0;
    const banner = $('manualCurrentBanner');
    if (hasActive) {
      $('mcbProject').textContent = trackerProject || 'Unnamed session';
      $('mcbElapsed').textContent  = formatMs(currentTrackerMs()) + ' elapsed';
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }

    if (existingSession) {
      // ── Edit a saved history session ──
      const startDt = new Date(existingSession.start);
      const endDt   = new Date(existingSession.end);
      $('manualDate').value    = existingSession.date;
      $('manualProject').value = existingSession.project || '';
      $('manualStart').value   = `${pad(startDt.getHours())}:${pad(startDt.getMinutes())}:${pad(startDt.getSeconds())}`;
      $('manualEnd').value     = `${pad(endDt.getHours())}:${pad(endDt.getMinutes())}:${pad(endDt.getSeconds())}`;
      setEndFieldVisible(true);
      const diff = Math.floor((existingSession.duration || 0) / 1000);
      $('manualDurH').value = Math.floor(diff / 3600);
      $('manualDurM').value = Math.floor((diff % 3600) / 60);
      $('manualDurS').value = diff % 60;
      $('manualDividerText').textContent = '— or override duration directly —';
      $('manualPanelTitle').textContent  = 'Edit Session';
      $('manualSubmitBtn').textContent   = 'Save Changes';
    } else {
      // ── Add a new manual session ──
      const now = new Date();
      const dateVal = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
      const ago = new Date(now.getTime() - 3600000);
      $('manualDate').value    = dateVal;
      $('manualEnd').value     = `${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
      $('manualStart').value   = `${pad(ago.getHours())}:${pad(ago.getMinutes())}:00`;
      $('manualProject').value = trackerProject || '';
      $('manualDurH').value = ''; $('manualDurM').value = ''; $('manualDurS').value = '';
      setEndFieldVisible(true);
      $('manualDividerText').textContent = '— or set duration directly —';
      $('manualPanelTitle').textContent  = 'Edit Session';
      $('manualSubmitBtn').textContent   = 'Save Session';
    }

    $('manualError').textContent = '';
    $('manualError').classList.add('hidden');
    $('manualDurPreview').classList.add('hidden');
    closeCombo();
    $('manualEntryPanel').classList.remove('hidden');
    $('manualPanelBackdrop').classList.remove('hidden');
    setTimeout(() => $('manualProject').focus(), 80);
    renderPanelSessionList();
    setupSyncDur();
    syncDur();
  }

  function loadCurrentIntoPanel() {
    manualCurrentMode = true;
    manualEditId = null;
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const sessionStartTs = trackerSessionStart || (Date.now() - currentTrackerMs());
    const startDt = new Date(sessionStartTs);
    const dateVal = `${startDt.getFullYear()}-${pad(startDt.getMonth()+1)}-${pad(startDt.getDate())}`;
    $('manualDate').value    = dateVal;
    $('manualProject').value = trackerProject || '';
    $('manualStart').value   = `${pad(startDt.getHours())}:${pad(startDt.getMinutes())}:${pad(startDt.getSeconds())}`;
    // End time: show current time if running
    if (trackerRunning) {
      $('manualEnd').value = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      $('manualEndLabel').textContent = 'End time (⏱ running)';
    } else {
      const endTs = sessionStartTs + trackerElapsed;
      const endDt = new Date(endTs);
      $('manualEnd').value = `${pad(endDt.getHours())}:${pad(endDt.getMinutes())}:${pad(endDt.getSeconds())}`;
      $('manualEndLabel').textContent = 'End time (paused)';
    }
    setEndFieldVisible(true);
    // Duration from current elapsed
    const diff = Math.floor(currentTrackerMs() / 1000);
    $('manualDurH').value = Math.floor(diff / 3600);
    $('manualDurM').value = Math.floor((diff % 3600) / 60);
    $('manualDurS').value = diff % 60;
    $('manualDividerText').textContent = '— or adjust elapsed directly —';
    $('manualPanelTitle').textContent  = 'Edit Session';
    $('manualSubmitBtn').textContent   = 'Update Timer';
    $('manualError').textContent = '';
    $('manualError').classList.add('hidden');
    setupSyncDur();
    syncDur();
  }

  function setEndFieldVisible(visible) {
    $('manualEndLabel').textContent = 'End time';
    $('manualEnd').disabled = !visible;
    $('manualEndWrap').style.opacity = visible ? '1' : '0.45';
  }

  // ── Sync duration preview ─────────────────────────────────
  function syncDur() {
    const s = parseTimeField($('manualDate').value, $('manualStart').value);
    const e = parseTimeField($('manualDate').value, $('manualEnd').value);
    const preview = $('manualDurPreview');

    if (s && e && e > s) {
      const diff = Math.floor((e - s) / 1000);
      $('manualDurH').value = Math.floor(diff / 3600);
      $('manualDurM').value = Math.floor((diff % 3600) / 60);
      $('manualDurS').value = diff % 60;
      $('manualDurPreviewText').textContent =
        `${formatMs(diff * 1000)}  (${fmtTime(s)} → ${fmtTime(e)})`;
      preview.classList.remove('hidden');
    } else if (s && e && e <= s) {
      $('manualError').textContent = 'End time must be after start time.';
      $('manualError').classList.remove('hidden');
      preview.classList.add('hidden');
    } else {
      // Just duration fields — show preview from those
      const dH = parseInt($('manualDurH').value, 10) || 0;
      const dM = parseInt($('manualDurM').value, 10) || 0;
      const dS = parseInt($('manualDurS').value, 10) || 0;
      const durMs = (dH * 3600 + dM * 60 + dS) * 1000;
      if (durMs > 0) {
        $('manualDurPreviewText').textContent = `Duration: ${formatMs(durMs)}`;
        preview.classList.remove('hidden');
      } else {
        preview.classList.add('hidden');
      }
    }
  }

  function fmtTime(dt) {
    return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }

  function setupSyncDur() {
    ['manualStart','manualEnd','manualDate'].forEach(id => {
      document.getElementById(id).oninput = () => { $('manualError').classList.add('hidden'); syncDur(); };
    });
    ['manualDurH','manualDurM','manualDurS'].forEach(id => {
      document.getElementById(id).oninput = () => {
        $('manualError').classList.add('hidden');
        const dH = parseInt($('manualDurH').value, 10) || 0;
        const dM = parseInt($('manualDurM').value, 10) || 0;
        const dS = parseInt($('manualDurS').value, 10) || 0;
        const durMs = (dH * 3600 + dM * 60 + dS) * 1000;
        if (durMs > 0) {
          $('manualDurPreviewText').textContent = `Duration: ${formatMs(durMs)}`;
          $('manualDurPreview').classList.remove('hidden');
        } else {
          $('manualDurPreview').classList.add('hidden');
        }
      };
    });
  }

  $('mcbLoadBtn').addEventListener('click', loadCurrentIntoPanel);

  function renderPanelSessionList() {
    const container = $('manualSessionList');
    const countEl   = $('manualSlCount');
    const sessions  = loadSessions();
    if (!sessions.length) {
      countEl.textContent = '';
      container.innerHTML = '<p class="manual-sl-empty">No sessions logged yet.</p>';
      return;
    }
    const sorted = sessions.slice().sort((a, b) => b.start - a.start);
    countEl.textContent = `(${sorted.length})`;
    const today = todayKey();
    const d = new Date(); d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let html = '';
    sorted.forEach(s => {
      const t1 = new Date(s.start).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12:true});
      const t2 = new Date(s.end).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12:true});
      const dl = s.date === today ? 'Today' : s.date === yesterday ? 'Yesterday' : s.date;
      html += `<div class="manual-sl-item">
        <div class="manual-sl-main">
          <div class="manual-sl-top">
            <span class="manual-sl-proj">${escapeHtml(s.project || '—')}</span>
            <span class="manual-sl-date-tag">${escapeHtml(dl)}</span>
          </div>
          <span class="manual-sl-times">${t1} – ${t2} &nbsp;·&nbsp; ${formatMsHM(s.duration || 0)}</span>
        </div>
        <div class="manual-sl-actions">
          <button class="manual-sl-edit" data-sid="${s.id}" title="Edit session">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="manual-sl-del" data-sid="${s.id}" title="Delete session">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.manual-sl-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = Number(btn.dataset.sid);
        const sess = loadSessions().find(x => x.id === sid);
        if (sess) openManualPanel(sess);
      });
    });
    container.querySelectorAll('.manual-sl-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = Number(btn.dataset.sid);
        const sess = loadSessions();
        const idx = sess.findIndex(x => x.id === sid);
        if (idx !== -1) {
          sess.splice(idx, 1);
          saveSessions(sess);
          _deleteSessionFromDB(sid);
          renderPanelSessionList();
          updateGoalProgress();
          if (!$('trackerHistory').classList.contains('hidden')) renderSessionHistory();
        }
      });
    });
  }

  function closeManualPanel() {
    closeCombo();
    $('manualEntryPanel').classList.add('hidden');
    $('manualPanelBackdrop').classList.add('hidden');
  }

  function parseTimeField(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const dt = new Date(`${dateStr}T${timeStr}`);
    return isNaN(dt.getTime()) ? null : dt;
  }

  $('manualPanelClose').addEventListener('click', closeManualPanel);
  $('manualCancelBtn').addEventListener('click', closeManualPanel);
  $('manualPanelBackdrop').addEventListener('click', closeManualPanel);

  $('manualSubmitBtn').addEventListener('click', () => {
    const project = $('manualProject').value.trim();
    const dateStr = $('manualDate').value;
    const errEl = $('manualError');
    errEl.classList.add('hidden');

    if (!project) {
      errEl.textContent = 'Project name is required.';
      errEl.classList.remove('hidden');
      $('manualProject').focus();
      return;
    }
    if (!dateStr) {
      errEl.textContent = 'Please select a date.';
      errEl.classList.remove('hidden');
      return;
    }

    // Try start/end first; fall back to duration fields
    const startDt = parseTimeField(dateStr, $('manualStart').value);
    const endDt   = parseTimeField(dateStr, $('manualEnd').value);
    const dH = parseInt($('manualDurH').value, 10) || 0;
    const dM = parseInt($('manualDurM').value, 10) || 0;
    const dS = parseInt($('manualDurS').value, 10) || 0;
    const durMs = (dH * 3600 + dM * 60 + dS) * 1000;

    let sessionStart, sessionEnd, duration;
    if (startDt && endDt && endDt > startDt) {
      sessionStart = startDt.getTime();
      sessionEnd   = endDt.getTime();
      duration     = sessionEnd - sessionStart;
    } else if (durMs > 0) {
      sessionEnd   = startDt ? startDt.getTime() + durMs : Date.now();
      sessionStart = sessionEnd - durMs;
      duration     = durMs;
    } else {
      errEl.textContent = 'Enter a valid start + end time, or a duration > 0.';
      errEl.classList.remove('hidden');
      return;
    }

    const sessions = loadSessions();
    if (manualCurrentMode) {
      // ── Update the live running/paused timer ──
      trackerProject = project;
      trackerSessionStart = sessionStart;
      if (trackerRunning) {
        // Keep the current run going; adjust accumulated elapsed so total = sessionStart→now
        trackerElapsed = Math.max(0, trackerStartTs - sessionStart);
      } else {
        // Paused: set elapsed directly from the entered duration
        trackerElapsed = duration;
      }
      updateTrackerDisplay();
    } else if (manualEditId !== null) {
      // ── Edit a saved history session in-place ──
      const idx = sessions.findIndex(x => x.id === manualEditId);
      if (idx !== -1) {
        sessions[idx] = { ...sessions[idx], project, date: dateStr, start: sessionStart, end: sessionEnd, duration };
      }
      saveSessions(sessions);
    } else {
      // ── Add a brand-new manual session ──
      sessions.push({ id: sessionStart, project, date: dateStr, start: sessionStart, end: sessionEnd, duration });
      saveSessions(sessions);
    }
    updateGoalProgress();
    renderPanelSessionList();
    if (!$('trackerHistory').classList.contains('hidden')) renderSessionHistory();
    closeManualPanel();
  });

  // Escape key closes panel
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('manualEntryPanel').classList.contains('hidden')) closeManualPanel();
  });

  // ─── Init ───────────────────────────────────
  // Load sessions from Supabase first, then initialize
  await (async () => {
    try {
      const { data } = await _supabase
        .from('tracker_sessions')
        .select('*')
        .eq('user_id', currentUser.id);
      if (data && data.length) {
        const mapped = data.map(r => ({
          id: r.id,
          project: r.project,
          date: r.session_date,
          start: r.start_ts,
          end: r.end_ts,
          duration: r.duration
        }));
        localStorage.setItem(TRACKER_KEY, JSON.stringify(mapped));
      }
    } catch { /* use existing localStorage */ }
  })();

  $('trackerGoalInput').value = loadGoal();
  updateGoalProgress();
  updateTGIndicator();
  render();
  tick();

  // ─── Onboarding ──────────────────────────────
  const ONBOARD_KEY = 'amber.onboarded.v1';

  function showOnboardStep(n) {
    [1, 2].forEach(i => $(`onboardStep${i}`).classList.toggle('hidden', i !== n));
  }

  function closeOnboarding() {
    $('onboardOverlay').classList.add('hidden');
    localStorage.setItem(ONBOARD_KEY, '1');
  }

  function openOnboarding() {
    showOnboardStep(1);
    $('onboardOverlay').classList.remove('hidden');
  }

  $('onboardNext1').addEventListener('click', () => showOnboardStep(2));
  $('onboardSkip1').addEventListener('click', closeOnboarding);

  $('onboardBack2').addEventListener('click', () => showOnboardStep(1));

  $('onboardTestBtn').addEventListener('click', async () => {
    const chatId = $('onboardChatId').value.trim().replace(/\D/g, '');
    const name = $('onboardName').value.trim();
    const sb = $('onboardStatusBar');
    if (!chatId) {
      sb.textContent = 'Enter your Telegram Chat ID first.';
      sb.className = 'tg-status-bar error';
      return;
    }
    sb.textContent = 'Sending test message…';
    sb.className = 'tg-status-bar info';
    const greeting = name ? `Hi ${name}!` : 'Hi!';
    const msg = `${greeting} Amber Flow is connected. You will receive task reminders here.`;
    try {
      const res = await fetch(`${WORKER_URL}/send-tg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, text: msg }),
      });
      const data = await res.json();
      if (data.ok) {
        sb.textContent = 'Test sent! Check Telegram.';
        sb.className = 'tg-status-bar success';
      } else {
        sb.textContent = data.error || 'Failed. Check your Chat ID.';
        sb.className = 'tg-status-bar error';
      }
    } catch {
      sb.textContent = 'Network error.';
      sb.className = 'tg-status-bar error';
    }
  });

  $('onboardFinish').addEventListener('click', () => {
    const chatId = $('onboardChatId').value.trim().replace(/\D/g, '');
    const name = $('onboardName').value.trim();
    const sb = $('onboardStatusBar');
    if (!chatId) {
      sb.textContent = 'Telegram Chat ID is required.';
      sb.className = 'tg-status-bar error';
      return;
    }
    saveTGSettings({ name, chatId });
    closeOnboarding();
  });

  // Show onboarding only on first visit (not connected yet)
  if (!localStorage.getItem(ONBOARD_KEY) && !isTGConnected()) {
    setTimeout(openOnboarding, 400);
  }
})();
