/* Ember — Tasks & Reminders
 * Pure-JS, localStorage-based. Static and GitHub Pages friendly.
 */
(() => {
  'use strict';

  // ─── State ──────────────────────────────────
  const STORAGE_KEY = 'ember.tasks.v1';
  /** @type {Array<Task>} */
  let tasks = load();
  let currentFilter = 'all';
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
  const enableNotifBtn = $('enableNotifBtn');
  const notifDot = enableNotifBtn.querySelector('.dot');
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
        const div = document.createElement('div');
        div.className = `task ${t.completed ? 'done' : ''} ${overdue ? 'overdue' : ''} ${soon ? 'soon' : ''}`;
        div.innerHTML = `
          <button class="check" data-action="toggle" data-id="${t.id}" title="Toggle complete">${ICONS.check}</button>
          <div class="task-body">
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
            <button class="icon-btn" data-action="edit" data-id="${t.id}" title="Edit">${ICONS.edit}</button>
            <button class="icon-btn danger" data-action="delete" data-id="${t.id}" title="Delete">${ICONS.trash}</button>
          </div>
        `;
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
    } else if (btn.dataset.action === 'edit') {
      openModal(task);
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
      document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
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

  // ─── Notifications ──────────────────────────
  function updateNotifIndicator() {
    if (!('Notification' in window)) {
      enableNotifBtn.style.display = 'none';
      return;
    }
    if (Notification.permission === 'granted') {
      notifDot.classList.add('on');
      enableNotifBtn.querySelector('span:not(.dot)') ?? null;
      enableNotifBtn.lastChild.textContent = ' Notifications on';
    } else {
      notifDot.classList.remove('on');
      enableNotifBtn.lastChild.textContent = ' Enable notifications';
    }
  }
  enableNotifBtn.addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    updateNotifIndicator();
  });
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
        const m = now.toLocaleTimeString('en-US', { timeZone: tz, minute: '2-digit', hour12: true }).slice(0, 2);
        const ss = String(now.getSeconds()).padStart(2, '0');
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

  // ─── Init ───────────────────────────────────
  updateNotifIndicator();
  render();
  tick();
})();
