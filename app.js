/* Amber Flow — Tasks, Tracker & Reminders
 * Supabase-backed, GitHub Pages hosted.
 */
(async () => {
  'use strict';

  // --- Auth guard -----------------------------
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

    // Ensure profile row exists (handles cases where DB trigger failed at signup)
    // Also fetch telegram_chat_id to restore it if localStorage was cleared (new device / private window)
    _supabase.from('profiles').upsert({
      id:   currentUser.id,
      name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || '',
    }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {});

    // Restore + verify Telegram chat ID on every login
    _supabase.from('profiles')
      .select('telegram_chat_id, name')
      .eq('id', currentUser.id)
      .single()
      .then(async ({ data: prof }) => {
        if (!prof?.telegram_chat_id) return;
        const stored = (() => { try { return JSON.parse(localStorage.getItem('amber.telegram.v1') || '{}'); } catch { return {}; } })();
        // Restore from DB if localStorage is empty (cleared / different device)
        if (!stored.chatId) {
          localStorage.setItem('amber.telegram.v1', JSON.stringify({ chatId: prof.telegram_chat_id, name: prof.name || '' }));
        }
        // Ping bot only on first connection (not every login)
        const _tgPingKey = `amber.tg.pinged.${prof.telegram_chat_id}`;
        if (!localStorage.getItem(_tgPingKey)) {
          try {
            const res = await fetch(`${WORKER_URL}/send-tg`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId: prof.telegram_chat_id, text: 'Amber Flow connected. Notifications active.' }),
            });
            const json = await res.json().catch(() => ({}));
            window._tgVerified = json.ok === true;
            if (window._tgVerified) localStorage.setItem(_tgPingKey, '1');
          } catch {
            window._tgVerified = false;
          }
        } else {
          window._tgVerified = true;
        }
        updateTGIndicator();
      });
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

  // --- State ----------------------------------
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

  // --- DOM refs -------------------------------
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

  // --- Persistence ----------------------------
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

  // Sync a single task to Supabase (fire-and-forget)
  function syncTaskToSupabase(task) {
    if (_isDemo || !currentUser) return;
    _supabase.from('tasks').upsert({
      id:               task.id,
      user_id:          currentUser.id,
      title:            task.title,
      description:      task.description || null,
      date:             task.date,
      time:             task.time,
      reminder_minutes: task.reminderMinutes ?? 60,
      completed:        task.completed ?? false,
      lead_status:      task.leadStatus ?? null,
      timezone:         task.timezone || null,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'id' }).then(() => {});
  }

  // Delete a task from Supabase (fire-and-forget)
  function deleteTaskFromSupabase(id) {
    if (_isDemo || !currentUser) return;
    _supabase.from('tasks').delete().eq('id', id).eq('user_id', currentUser.id).then(() => {});
  }

  // --- Helpers --------------------------------
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

  // --- Icons ----------------------------------
  const ICONS = {
    check:    `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    edit:     `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    trash:    `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    bell:     `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    x:        `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    plus:     `<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  };

  // --- Render ---------------------------------
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
              ${t.timezone ? `<span class="appt-tz-badge">${t.timezone.split('/').pop().replace(/_/g,' ')}</span>` : ''}
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

  // --- Task CRUD ------------------------------
  function openModal(task = null) {
    editingId = task ? task.id : null;
    modalTitle.textContent = task ? 'Edit Task' : 'New Task';
    _populateTaskTZSelect();
    const tz = task?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    _setActiveTzBlock(tz);
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
      const defReminder = loadSettings().defaultReminderMins;
      reminderInput.value = String(defReminder !== undefined ? defReminder : 60);
    }
    modalOverlay.classList.remove('hidden');
    setTimeout(() => titleInput.focus(), 50);
  }
  function closeModal() {
    modalOverlay.classList.add('hidden');
    editingId = null;
  }

  // ── TZ block helpers ──────────────────────────────────────────────────────
  const QUICK_TZS = {
    'ET': 'America/New_York',
    'CT': 'America/Chicago',
    'MT': 'America/Denver',
    'PT': 'America/Los_Angeles',
  };

  function _populateTaskTZSelect() {
    const sel = $('taskTimezone');
    if (!sel || sel.options.length > 0) return;
    const tzs = (typeof Intl.supportedValuesOf === 'function')
      ? Intl.supportedValuesOf('timeZone')
      : Object.values(QUICK_TZS).concat([
          'Europe/London','Europe/Paris','Asia/Dubai','Asia/Karachi',
          'Asia/Dhaka','Asia/Singapore','Asia/Tokyo','Australia/Sydney',
        ]);
    tzs.forEach(tz => {
      const opt = document.createElement('option');
      opt.value = tz;
      opt.textContent = tz.replace(/_/g, ' ');
      sel.appendChild(opt);
    });
  }

  function _setActiveTzBlock(tz) {
    const sel = $('taskTimezone');
    // Mark the matching quick block active
    document.querySelectorAll('#taskTzBlocks .tz-block[data-tz]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tz === tz);
    });
    // Set the hidden select value
    if (sel) sel.value = tz;
    // If none of the quick blocks match, show the custom select
    const isQuick = Object.values(QUICK_TZS).includes(tz);
    const customSel = $('taskTimezone');
    if (customSel) customSel.classList.toggle('hidden', isQuick);
    const moreBtn = $('taskTzMoreBtn');
    if (moreBtn) moreBtn.classList.toggle('active', !isQuick);
  }

  // Quick-block click handlers
  document.querySelectorAll('#taskTzBlocks .tz-block[data-tz]').forEach(btn => {
    btn.addEventListener('click', () => {
      _setActiveTzBlock(btn.dataset.tz);
      // Hide the full select when a quick block is picked
      const sel = $('taskTimezone');
      if (sel) sel.classList.add('hidden');
      $('taskTzMoreBtn').classList.remove('active');
    });
  });

  // "+" button — toggle the full select
  $('taskTzMoreBtn').addEventListener('click', () => {
    const sel = $('taskTimezone');
    const isHidden = sel.classList.toggle('hidden');
    $('taskTzMoreBtn').classList.toggle('active', !isHidden);
    if (!isHidden) sel.focus();
  });

  // When custom select changes, deactivate quick blocks
  $('taskTimezone').addEventListener('change', () => {
    const tz = $('taskTimezone').value;
    document.querySelectorAll('#taskTzBlocks .tz-block[data-tz]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tz === tz);
    });
  });

  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      title: titleInput.value.trim(),
      description: descInput.value.trim(),
      date: dateInput.value,
      time: timeInput.value,
      reminderMinutes: Number(reminderInput.value),
      timezone: ($('taskTimezone') && $('taskTimezone').value) || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    if (!data.title || !data.date || !data.time) return;

    if (editingId) {
      const idx = tasks.findIndex(t => t.id === editingId);
      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...data };
        // Reset alarm-fired flags so updated time can re-trigger
        firedReminders.delete(editingId);
        firedDue.delete(editingId);
        save();
        syncTaskToSupabase(tasks[idx]);
      }
    } else {
      const newTask = {
        id: uid(),
        ...data,
        completed: false,
        createdAt: Date.now(),
      };
      tasks.push(newTask);
      save();
      syncTaskToSupabase(newTask);
    }
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
      save(); syncTaskToSupabase(task); render();
    } else if (btn.dataset.action === 'leadstatus') {
      const cycle = { null: 'S', 'S': 'NS', 'NS': 'C', 'C': null };
      task.leadStatus = cycle[task.leadStatus || 'null'] ?? null;
      save(); syncTaskToSupabase(task); render();
    } else if (btn.dataset.action === 'delete') {
      if (confirm(`Delete task "${task.title}"?`)) {
        tasks = tasks.filter(t => t.id !== id);
        firedReminders.delete(id);
        firedDue.delete(id);
        save(); deleteTaskFromSupabase(id); render();
      }
    }
  });

  // --- Filters --------------------------------
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


  // --- Modal wiring ---------------------------
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

  // --- Notifications (auto-request on load) --
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

  // --- Alarm (loud sound + full-screen) -------
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

  function beep(toneOverride, volOverride) {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const s = loadSettings();
    const tone = toneOverride || s.alarmTone || 'default';
    const vol = (volOverride !== undefined ? volOverride : (s.alarmVolume ?? 80)) / 100;
    const now = ctx.currentTime;

    if (tone === 'gentle') {
      // Soft sine chime: single warm tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 528;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol * 0.6, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.9);
    } else if (tone === 'urgent') {
      // Fast triple pulse
      [0, 0.18, 0.36].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 960;
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(vol * 0.5, now + offset + 0.01);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.14);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset); osc.stop(now + offset + 0.15);
      });
    } else {
      // Default: two-tone siren beep
      [880, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.25);
        gain.gain.linearRampToValueAtTime(vol * 0.35, now + i * 0.25 + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + i * 0.25 + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.25); osc.stop(now + i * 0.25 + 0.25);
      });
    }
  }

  // Custom audio element for MP3/file-based tone
  let _customAudioEl = null;
  let _customAudioUrl = null;

  function playCustomTone(vol) {
    if (!_customAudioUrl) return false;
    if (!_customAudioEl) _customAudioEl = new Audio();
    _customAudioEl.src = _customAudioUrl;
    _customAudioEl.volume = Math.min(1, Math.max(0, (vol ?? 80) / 100));
    _customAudioEl.currentTime = 0;
    _customAudioEl.play().catch(() => {});
    return true;
  }
  function stopCustomTone() {
    if (_customAudioEl) { _customAudioEl.pause(); _customAudioEl.currentTime = 0; }
  }
  function startAlarmSound() {
    if (loadSettings().soundEnabled === false) return;
    stopAlarmSound();
    const s = loadSettings();
    if (s.alarmTone === 'custom') {
      if (!playCustomTone(s.alarmVolume)) beep(); // fallback if no file
      else {
        // Loop custom file
        if (_customAudioEl) {
          _customAudioEl.loop = true;
          _customAudioEl.play().catch(() => {});
        }
      }
    } else {
      beep();
      alarmInterval = setInterval(beep, 600);
    }
  }
  function stopAlarmSound() {
    if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
    stopCustomTone();
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

  // --- Scheduler tick -------------------------
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

  // --- Scrolling Time Picker ------------------
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

  // --- World Clocks ----------------------------
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

  // --- Abbreviation alias map ------------------
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

  // Build a reverse map: IANA → [abbr, abbr, ...]
  const TZ_ABBR_FOR = {};
  Object.entries(TZ_ALIASES).forEach(([abbr, iana]) => {
    if (!TZ_ABBR_FOR[iana]) TZ_ABBR_FOR[iana] = [];
    // Only store clean abbreviations (no + in them for display)
    if (!abbr.includes('+')) TZ_ABBR_FOR[iana].push(abbr);
  });

  // --- Timezone picker modal -------------------
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

  // --- Helpers ---------------------------------
  const _uuid = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  // --- Telegram Integration --------------------
  const TG_KEY = 'amber.telegram.v1';
  const WORKER_URL = 'https://amber-worker.amberflow.workers.dev';

  async function registerBotUser(chatId, name, role) {
    if (!chatId || !WORKER_URL) return;
    try {
      await fetch(`${WORKER_URL}/register-bot-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, name, role }),
      });
    } catch { /* noop — non-critical */ }
  }

  let tgSettings = (() => {
    try {
      const raw = localStorage.getItem(TG_KEY);
      return raw ? JSON.parse(raw) : { chatId: '', name: '' };
    } catch { return { chatId: '', name: '' }; }
  })();

  function saveTGSettings(s) {
    tgSettings = s;
    localStorage.setItem(TG_KEY, JSON.stringify(s));
    // Reset verification state — will be re-checked on next login ping
    window._tgVerified = undefined;
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
      if (dot) { dot.style.background = '#4ade80'; dot.style.boxShadow = '0 0 6px rgba(74,222,128,.6)'; }
      btn.title = 'Telegram: Integration on!';
    } else {
      btn.classList.remove('connected');
      if (dot) { dot.style.background = ''; dot.style.boxShadow = ''; }
      btn.title = 'Set up Telegram notifications';
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
    const label = kind === 'reminder' ? 'Reminder' : 'Task Due';
    const timeStr = fmtDateTime(taskDateTime(task));
    const statusMap = { S: 'Spoke', NS: 'Not Spoke', C: 'Cancelled' };
    const statusLine = task.leadStatus ? `Status: ${statusMap[task.leadStatus] || task.leadStatus}\n` : '';
    let msg = `[Amber] ${label}: "${task.title}"\n${statusLine}Scheduled: ${timeStr}`;
    if (task.description) msg += `\n${task.description}`;
    sendTelegramMessage(msg);
  }

  // --- Telegram Settings Modal -----------------
  const tgOverlay = $('tgOverlay');
  const tgStatusBar = $('tgStatusBar');

  function openTGSettings() {
    $('tgName').value = tgSettings.name;
    $('tgChatId').value = tgSettings.chatId;
    if (isTGConnected()) {
      showTGStatus('\u2705 Integration on! Telegram notifications are active.', 'success');
    } else {
      tgStatusBar.className = 'tg-status-bar hidden';
    }
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
    // Persist chat ID to profiles so cron can send direct agent reminders
    if (!_isDemo && currentUser?.id) {
      _supabase.from('profiles').update({ telegram_chat_id: s.chatId, name: s.name || undefined })
        .eq('id', currentUser.id).then(() => {});
    }
    // Register in bot registry (role: team_leader for admin/manager, agent otherwise)
    const botRole = (currentUserRole === 'admin' || currentUserRole === 'manager') ? 'team_leader' : 'agent';
    registerBotUser(s.chatId, s.name || s.chatId, botRole);
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
    showTGStatus('Sending test message...', 'info');
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

  // --- Settings Modal -------------------------
  const SETTINGS_KEY = 'amber.settings.v1';

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
  }
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  let _settings = loadSettings();

  function openSettings() {
    const s = loadSettings();
    // Display name: prefer profile name, fallback to stored setting
    $('settingsName').value = s.displayName || _afName || '';
    // Default reminder
    const dr = $('settingsDefaultReminder');
    if (dr) dr.value = String(s.defaultReminderMins ?? 60);
    // Sound toggle
    const soundEl = $('settingsSoundEnabled');
    if (soundEl) soundEl.checked = s.soundEnabled !== false; // default on
    // Browser notif toggle — reflect actual permission
    const bnEl = $('settingsBrowserNotif');
    if (bnEl) bnEl.checked = Notification.permission === 'granted' && s.browserNotif !== false;
    // Alarm tone
    const toneEl = $('settingsAlarmTone');
    if (toneEl) { toneEl.value = s.alarmTone || 'default'; _toggleCustomToneRow(toneEl.value); }
    // Custom file name display
    if (s.customToneName) $('customToneName').textContent = s.customToneName;
    // Volume
    const volEl = $('settingsVolume');
    if (volEl) { volEl.value = s.alarmVolume ?? 80; $('volumeLabel').textContent = `${volEl.value}%`; }
    $('settingsOverlay').classList.remove('hidden');
  }

  function _toggleCustomToneRow(tone) {
    $('customToneRow').classList.toggle('hidden', tone !== 'custom');
  }

  function closeSettings() {
    $('settingsOverlay').classList.add('hidden');
  }

  $('settingsBtn').addEventListener('click', openSettings);
  $('closeSettingsBtn').addEventListener('click', closeSettings);

  // Refresh My List button — re-fetches tasks & appointments from DB and re-renders
  $('refreshDataBtn').addEventListener('click', async () => {
    const btn = $('refreshDataBtn');
    const svg = btn.querySelector('svg');
    btn.disabled = true;
    svg.style.transition = 'transform 0.6s';
    svg.style.transform = 'rotate(360deg)';
    try {
      if (!_isDemo && currentUser) {
        // Re-fetch tasks
        const { data: dbTasks } = await _supabase
          .from('tasks').select('*')
          .eq('user_id', currentUser.id)
          .order('date', { ascending: true }).limit(2000);
        if (dbTasks && dbTasks.length > 0) {
          tasks = dbTasks.map(r => ({
            id: r.id, title: r.title, description: r.description || '',
            date: r.date, time: r.time,
            reminderMinutes: r.reminder_minutes ?? 60,
            completed: r.completed ?? false,
            leadStatus: r.lead_status ?? null,
            timezone: r.timezone || null,
          }));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        } else if (tasks.length > 0) {
          tasks.forEach(t => syncTaskToSupabase(t));
        }
        // Re-fetch appointments
        const { data: dbAppts } = await _supabase
          .from('appointments').select('*')
          .eq('user_id', currentUser.id)
          .order('scheduled_time', { ascending: false }).limit(1000);
        if (dbAppts && dbAppts.length > 0) {
          const mapped = dbAppts.map(r => ({
            id: r.id, projectName: r.project_name, title: r.title,
            description: r.description, scheduledTime: r.scheduled_time,
            reminderMinutes: r.reminder_minutes, status: r.status,
            createdAt: r.created_at,
          }));
          localStorage.setItem(APPT_KEY, JSON.stringify(mapped));
        }
      }
    } catch { /* silent */ }
    render();
    renderAppointments();
    setTimeout(() => {
      svg.style.transition = '';
      svg.style.transform = '';
      btn.disabled = false;
    }, 700);
  });
  $('settingsOverlay').addEventListener('click', e => { if (e.target === $('settingsOverlay')) closeSettings(); });

  $('settingsSaveBtn').addEventListener('click', async () => {
    const name = $('settingsName').value.trim();
    const defaultReminderMins = Number($('settingsDefaultReminder').value);
    const soundEnabled = $('settingsSoundEnabled').checked;
    const wantBrowserNotif = $('settingsBrowserNotif').checked;
    const alarmTone = $('settingsAlarmTone').value;
    const alarmVolume = Number($('settingsVolume').value);

    // Request browser notification permission if toggling on
    if (wantBrowserNotif && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    const browserNotif = wantBrowserNotif && Notification.permission === 'granted';

    const prev = loadSettings();
    const s = {
      ...prev,
      displayName: name,
      defaultReminderMins,
      soundEnabled,
      browserNotif,
      alarmTone,
      alarmVolume,
    };
    saveSettings(s);
    _settings = s;

    // Update display name in Supabase profile + avatar
    if (name && !_isDemo && currentUser?.id) {
      _supabase.from('profiles').update({ name }).eq('id', currentUser.id).then(() => {});
    }
    if (name && _afAvatarEl) {
      _afAvatarEl.textContent = name.charAt(0).toUpperCase();
      _afAvatarEl.title = `Signed in as ${name}`;
    }

    // Also sync name into TG settings if TG is connected
    if (name && tgSettings.chatId) {
      saveTGSettings({ ...tgSettings, name });
      $('tgName').value = name;
    }

    closeSettings();
  });

  // Tone picker: show/hide custom file row + instant preview
  $('settingsAlarmTone').addEventListener('change', function() {
    _toggleCustomToneRow(this.value);
    const vol = Number($('settingsVolume').value);
    ensureAudioCtx();
    if (this.value === 'custom') { playCustomTone(vol); }
    else { beep(this.value, vol); }
  });

  // Volume label live update + debounced auto-preview
  let _volPreviewTimer = null;
  $('settingsVolume').addEventListener('input', function() {
    $('volumeLabel').textContent = `${this.value}%`;
    clearTimeout(_volPreviewTimer);
    _volPreviewTimer = setTimeout(() => {
      const tone = $('settingsAlarmTone').value;
      const vol = Number(this.value);
      ensureAudioCtx();
      if (tone === 'custom') { if (_customAudioUrl) playCustomTone(vol); }
      else { beep(tone, vol); }
    }, 350);
  });

  // Custom file picker
  $('settingsAlarmFile').addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    _customAudioUrl = url;
    $('customToneName').textContent = file.name;
    // Persist name for display; can't persist blob URL across sessions — just flag it
    const s = loadSettings();
    saveSettings({ ...s, alarmTone: 'custom', customToneName: file.name });
  });

  // Preview button
  $('alarmPreviewBtn').addEventListener('click', () => {
    const tone = $('settingsAlarmTone').value;
    const vol = Number($('settingsVolume').value);
    ensureAudioCtx();
    if (tone === 'custom') {
      playCustomTone(vol);
    } else {
      beep(tone, vol);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('settingsOverlay').classList.contains('hidden')) closeSettings();
  });

  // Expose _settings so alarm code can check soundEnabled
  function isSoundEnabled() { return loadSettings().soundEnabled !== false; }

  // --- Time Tracker ---------------------------
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
    if (!_isDemo) _syncSessionsToDB(sessions);
  }

  // --- Supabase session sync -------------------
  async function _syncSessionsToDB(sessions) {
    if (!sessions.length) return;
    const completed = sessions.filter(s => s.end);
    if (!completed.length) return;
    try {
      await _supabase.from('time_sessions').upsert(
        completed.map(s => ({
          id: s.id,
          user_id: currentUser.id,
          project_name: s.project || 'General',
          start_time: s.start ? new Date(s.start).toISOString() : new Date().toISOString(),
          end_time: s.end ? new Date(s.end).toISOString() : null,
          duration_seconds: s.duration ? Math.round(s.duration / 1000) : null,
          status: 'completed',
        })),
        { onConflict: 'id' }
      );
    } catch { /* offline — localStorage is source of truth */ }
  }

  async function _deleteSessionFromDB(sessionId) {
    try {
      await _supabase.from('time_sessions')
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
    sessions.push({ id: _uuid(), project: trackerProject, date: dateKey, start, end: Date.now(), duration: ms });
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
    saveTrackerLiveState();
  }

  function stopTracker() {
    if (!trackerRunning) return;
    clearInterval(trackerInterval);
    trackerInterval = null;
    trackerElapsed += Date.now() - trackerStartTs;
    trackerRunning = false;
    setTrackerButtons('stopped');
    updateTrackerDisplay();
    saveTrackerLiveState();
  }

  function resumeTracker() {
    trackerStartTs = Date.now();
    trackerRunning = true;
    trackerInterval = setInterval(updateTrackerDisplay, 1000);
    setTrackerButtons('running');
    updateTrackerDisplay();
    saveTrackerLiveState();
  }

  function newTrackerSession() {
    if (trackerRunning) {
      trackerElapsed += Date.now() - trackerStartTs;
      clearInterval(trackerInterval);
      trackerRunning = false;
    }
    saveCurrentTrackerSession();
    localStorage.removeItem(TRACKER_LIVE_KEY);
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
    saveTrackerLiveState();
  });

  // --- Secret Manual Entry (triple-click tracker icon) ----------------
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

  // -- Combobox helpers ------------------------------------------
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

  // -- Open panel ----------------------------------------------
  let manualCurrentMode = false; // true = editing the live running/paused session

  function openManualPanel(existingSession) {
    manualEditId      = existingSession ? existingSession.id : null;
    manualCurrentMode = false;
    const pad = n => String(n).padStart(2, '0');

    // -- Show current-session banner if a timer exists --
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
      // -- Edit a saved history session --
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
      // -- Add a new manual session --
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

  // -- Sync duration preview ---------------------------------
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
        const sid = btn.dataset.sid;
        const sess = loadSessions().find(x => String(x.id) === sid);
        if (sess) openManualPanel(sess);
      });
    });
    container.querySelectorAll('.manual-sl-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sid;
        const sess = loadSessions();
        const idx = sess.findIndex(x => String(x.id) === sid);
        if (idx !== -1) {
          const deletedId = sess[idx].id;
          sess.splice(idx, 1);
          saveSessions(sess);
          _deleteSessionFromDB(deletedId);
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
      // -- Update the live running/paused timer --
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
      // -- Edit a saved history session in-place --
      const idx = sessions.findIndex(x => x.id === manualEditId);
      if (idx !== -1) {
        sessions[idx] = { ...sessions[idx], project, date: dateStr, start: sessionStart, end: sessionEnd, duration };
      }
      saveSessions(sessions);
    } else {
      // -- Add a brand-new manual session --
      sessions.push({ id: _uuid(), project, date: dateStr, start: sessionStart, end: sessionEnd, duration });
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

  // --- Init -----------------------------------
  // Load sessions from Supabase first, then initialize
  await (async () => {
    try {
      const { data } = await _supabase
        .from('time_sessions')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('start_time', { ascending: false })
        .limit(200);
      if (data && data.length > 0) {
        // DB has sessions — use DB data (cross-device sync)
        const mapped = data.map(r => {
          const startMs = r.start_time ? new Date(r.start_time).getTime() : Date.now();
          const endMs   = r.end_time   ? new Date(r.end_time).getTime()   : null;
          const startDt = new Date(startMs);
          const dateKey = `${startDt.getFullYear()}-${String(startDt.getMonth()+1).padStart(2,'0')}-${String(startDt.getDate()).padStart(2,'0')}`;
          return {
            id: r.id,
            project: r.project_name || 'General',
            date: dateKey,
            start: startMs,
            end: endMs,
            duration: r.duration_seconds ? r.duration_seconds * 1000 : (endMs ? endMs - startMs : 0),
          };
        });
        localStorage.setItem(TRACKER_KEY, JSON.stringify(mapped));
      }
      // If DB is empty, keep existing localStorage sessions (don't wipe them)
    } catch { /* use existing localStorage */ }
  })();

  // Persist running tracker state to localStorage so it survives refresh
  const TRACKER_LIVE_KEY = 'amber.tracker.live.v1';

  function saveTrackerLiveState() {
    if (trackerRunning || trackerElapsed) {
      localStorage.setItem(TRACKER_LIVE_KEY, JSON.stringify({
        project: trackerProject,
        sessionStart: trackerSessionStart,
        elapsed: trackerElapsed + (trackerRunning ? Date.now() - trackerStartTs : 0),
        paused: !trackerRunning,
      }));
    } else {
      localStorage.removeItem(TRACKER_LIVE_KEY);
    }
  }

  function restoreTrackerLiveState() {
    try {
      const raw = localStorage.getItem(TRACKER_LIVE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!state.project || !state.elapsed) return;
      trackerProject       = state.project;
      trackerSessionStart  = state.sessionStart || Date.now();
      trackerElapsed       = state.elapsed;
      $('trackerProject').value = trackerProject;
      if (state.paused) {
        setTrackerButtons('stopped');
      } else {
        // Was running — resume from where it left off
        trackerStartTs  = Date.now();
        trackerRunning  = true;
        trackerInterval = setInterval(updateTrackerDisplay, 1000);
        setTrackerButtons('running');
      }
      updateTrackerDisplay();
    } catch { /* corrupt state — ignore */ }
  }

  $('trackerGoalInput').value = loadGoal();
  restoreTrackerLiveState();  // recover any in-progress session
  updateGoalProgress();
  updateTGIndicator();

  // Load fresh data from DB before first render
  // DB wins when it has data; if DB is empty but local has tasks, sync local → DB
  if (!_isDemo) {
    try {
      const { data: dbTasks } = await _supabase
        .from('tasks')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('date', { ascending: true })
        .limit(2000);
      if (dbTasks && dbTasks.length > 0) {
        // DB has data — use it (cross-device sync)
        tasks = dbTasks.map(r => ({
          id: r.id, title: r.title, description: r.description || '',
          date: r.date, time: r.time,
          reminderMinutes: r.reminder_minutes ?? 60,
          completed: r.completed ?? false,
          leadStatus: r.lead_status ?? null,
          timezone: r.timezone || null,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      } else if (tasks.length > 0) {
        // DB empty but local has tasks — push them up so cross-device works next time
        tasks.forEach(t => syncTaskToSupabase(t));
      }
    } catch { /* use existing localStorage */ }
  }

  render();
  tick();

  // --- Onboarding ------------------------------
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
    sb.textContent = 'Sending test message...';
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
    // Use actual role if already determined, otherwise default to agent
    const onboardRole = (currentUserRole === 'admin' || currentUserRole === 'manager') ? 'team_leader' : 'agent';
    registerBotUser(chatId, name || chatId, onboardRole);
    closeOnboarding();
  });

  // Show onboarding only on first visit (not connected yet)
  if (!localStorage.getItem(ONBOARD_KEY) && !isTGConnected()) {
    setTimeout(openOnboarding, 400);
  }

  // --- Activity Logger --------------------------------------------------
  // Sends structured event to worker (Telegram) and writes to Supabase.
  async function logActivity(action, data = {}) {
    if (_isDemo) return; // never log from demo mode
    const agentName   = tgSettings.name || currentUser.email?.split('@')[0] || 'Agent';
    const agentChatId = tgSettings.chatId || '';

    // Write to Supabase activity_logs (powers admin dashboard feed)
    _supabase.from('activity_logs').insert({
      user_id: currentUser.id,
      action_type: action,
      metadata: { agentName, ...data },
    }).then(() => {}).catch(() => {});

    // Notify team leaders via Cloudflare Worker
    try {
      await fetch(`${WORKER_URL}/log-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, agentName, agentChatId, ...data }),
      });
    } catch { /* noop — never block the UI */ }
  }

  // Patch tracker buttons to log activity with full timestamps
  $('trackerStartBtn').addEventListener('click', () => {
    // Runs after startTracker() sets trackerSessionStart (both in bubbling phase)
    if (trackerRunning && trackerProject) {
      logActivity('START_TRACKER', {
        projectName: trackerProject,
        startTime: new Date(trackerSessionStart).toISOString(),
      });
    }
  });
  $('trackerStopBtn').addEventListener('click', () => {
    // Capture phase — runs BEFORE stopTracker() clears trackerRunning
    const project = trackerProject;
    const startTs = trackerSessionStart;
    const ms = currentTrackerMs();
    if (project && ms > 0) {
      logActivity('STOP_TRACKER', {
        projectName: project,
        startTime: startTs ? new Date(startTs).toISOString() : null,
        endTime: new Date().toISOString(),
        duration: formatMsHM(ms),
      });
    }
  }, true);
  $('trackerResumeBtn').addEventListener('click', () => {
    // Runs after resumeTracker() sets trackerStartTs
    if (trackerProject) {
      logActivity('START_TRACKER', {
        projectName: trackerProject,
        startTime: new Date(trackerStartTs).toISOString(),
      });
    }
  });

  // --- Appointments ------------------------------------------------------
  const APPT_KEY = 'amber.appointments.v1';
  let currentApptFilter = 'pending';
  let editingApptId = null;

  function loadAppointments() {
    try {
      const raw = localStorage.getItem(APPT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveAppointments(appts) {
    localStorage.setItem(APPT_KEY, JSON.stringify(appts));
    if (!_isDemo) _syncApptsToDB(appts);
  }

  async function _syncApptsToDB(appts) {
    try {
      const rows = appts.map(a => ({
        id: a.id,
        user_id: currentUser.id,
        project_name: a.projectName,
        title: a.title,
        description: a.description || '',
        scheduled_time: a.scheduledTime,
        reminder_minutes: a.reminderMinutes,
        status: a.status,
        timezone: a.timezone || null,
      }));
      if (rows.length) {
        await _supabase.from('appointments').upsert(rows, { onConflict: 'id' });
      }
    } catch { /* offline — localStorage is source of truth */ }
  }

  function apptStatusLabel(status) {
    return { pending: 'Upcoming', completed: 'âœ… Done', missed: 'âŒ Missed' }[status] || status;
  }

  function renderAppointments() {
    const all = loadAppointments();
    const list = $('apptList');
    const empty = $('apptEmpty');
    if (!all.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    // Sort: pending soonest first, then completed/missed most recent first
    const pending   = all.filter(a => a.status === 'pending').sort((a,b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
    const rest      = all.filter(a => a.status !== 'pending').sort((a,b) => new Date(b.scheduledTime) - new Date(a.scheduledTime));
    const appts = [...pending, ...rest];
    list.innerHTML = appts.map(a => {
      const tz = a.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const dt = new Date(a.scheduledTime);
      const dtStr = dt.toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
      const tzShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(dt).find(p => p.type === 'timeZoneName')?.value || '';
      return `<div class="appt-card" data-id="${a.id}">
        <div class="appt-card-top">
          <span class="appt-project">${escapeHtml(a.projectName)}</span>
          <div class="appt-actions">
            
            <button class="icon-btn appt-edit-btn" data-id="${a.id}" title="Edit"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          </div>
        </div>
        <h3 class="appt-title">${escapeHtml(a.title)}</h3>
        ${a.description ? `<p class="appt-desc">${escapeHtml(a.description)}</p>` : ''}
        <div class="appt-meta">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${dtStr}${tzShort ? `<span class="appt-tz-badge">${tzShort}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.appt-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openApptModal(btn.dataset.id));
    });

  }

  function completeAppt(id) {
    const appts = loadAppointments();
    const a = appts.find(x => x.id === id);
    if (!a) return;
    a.status = 'completed';
    saveAppointments(appts);
    _supabase.from('appointments').update({ status: 'completed' }).eq('id', id).eq('user_id', currentUser.id).then(() => {});
    logActivity('COMPLETE_APPOINTMENT', { projectName: a.projectName, title: a.title });
    renderAppointments();
  }

  function missAppt(id) {
    const appts = loadAppointments();
    const a = appts.find(x => x.id === id);
    if (!a) return;
    a.status = 'missed';
    saveAppointments(appts);
    _supabase.from('appointments').update({ status: 'missed' }).eq('id', id).eq('user_id', currentUser.id).then(() => {});
    logActivity('MISS_APPOINTMENT', { projectName: a.projectName, title: a.title });
    renderAppointments();
  }

  function deleteAppt(id) {
    const appts = loadAppointments().filter(x => x.id !== id);
    saveAppointments(appts);
    // Delete from Supabase
    _supabase.from('appointments').delete().eq('id', id).eq('user_id', currentUser.id).then(() => {});
    renderAppointments();
  }

  // -- Appointment Modal ------------------------------------------------
  const apptOverlay = $('apptModalOverlay');
  let _apptTimeEditVisible = false;

  // Populate timezone <select> with all IANA timezones (browser default selected)
  function _populateTZSelect() {
    const sel = $('apptTimezone');
    if (sel.options.length > 0) return; // already built
    const tzs = (typeof Intl.supportedValuesOf === 'function')
      ? Intl.supportedValuesOf('timeZone')
      : [
          'Pacific/Honolulu','America/Anchorage','America/Los_Angeles','America/Denver',
          'America/Chicago','America/New_York','America/Halifax','America/Sao_Paulo',
          'Atlantic/Azores','Europe/London','Europe/Paris','Europe/Helsinki',
          'Europe/Moscow','Asia/Dubai','Asia/Karachi','Asia/Dhaka','Asia/Bangkok',
          'Asia/Singapore','Asia/Tokyo','Australia/Sydney','Pacific/Auckland',
        ];
    const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
    tzs.forEach(tz => {
      const opt = document.createElement('option');
      opt.value = tz;
      opt.textContent = tz.replace(/_/g, ' ');
      if (tz === browserTZ) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // Convert "YYYY-MM-DDTHH:MM" (wall-clock in tz) → UTC ISO string
  function _tzLocalToUTC(localStr, tz) {
    const [datePart, timePart] = localStr.split('T');
    const [yr, mo, dy] = datePart.split('-').map(Number);
    const [hr, mn] = timePart.split(':').map(Number);
    const utcGuess = Date.UTC(yr, mo - 1, dy, hr, mn, 0);
    const parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    }).formatToParts(new Date(utcGuess)).forEach(({ type, value }) => parts[type] = value);
    const h = parseInt(parts.hour) === 24 ? 0 : parseInt(parts.hour);
    const tzAsUTC = Date.UTC(parseInt(parts.year), parseInt(parts.month) - 1, parseInt(parts.day), h, parseInt(parts.minute), parseInt(parts.second));
    return new Date(utcGuess + (utcGuess - tzAsUTC)).toISOString();
  }

  // Convert UTC ISO → "YYYY-MM-DDTHH:MM" in a given timezone (for datetime-local input)
  function _utcToTZLocal(isoStr, tz) {
    const parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(isoStr)).forEach(({ type, value }) => parts[type] = value);
    const h = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}`;
  }

  function _apptFmtLocal(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function _apptUpdateTimeBadge() {
    const val = $('apptDateTime').value;
    const tz  = ($('apptTimezone') && $('apptTimezone').value) || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const el  = $('apptTimeNowDisplay');
    if (!el) return;
    if (val) {
      const utcIso = _tzLocalToUTC(val, tz);
      el.textContent = new Date(utcIso).toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
    } else {
      el.textContent = 'Now';
    }
  }

  function openApptModal(editId) {
    editingApptId = editId || null;
    $('apptForm').reset();
    _populateTZSelect();
    $('apptDateTime').classList.remove('appt-datetime-visible');
    const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (editId) {
      const a = loadAppointments().find(x => x.id === editId);
      if (a) {
        $('apptProject').value = a.projectName;
        $('apptTitle').value = a.title;
        $('apptDesc').value = a.description || '';
        const tz = a.timezone || browserTZ;
        $('apptTimezone').value = tz;
        $('apptDateTime').value = _utcToTZLocal(a.scheduledTime, tz);
        $('apptModalTitle').textContent = 'Edit Appointment';
      }
    } else {
      $('apptModalTitle').textContent = 'New Appointment';
      $('apptTimezone').value = browserTZ;
      $('apptDateTime').value = _apptFmtLocal(new Date());
    }
    _apptUpdateTimeBadge();
    apptOverlay.classList.remove('hidden');
  }

  function closeApptModal() {
    apptOverlay.classList.add('hidden');
    editingApptId = null;
  }

  $('addApptBtn').addEventListener('click', () => openApptModal(null));
  $('closeApptModalBtn').addEventListener('click', closeApptModal);
  $('cancelApptBtn').addEventListener('click', closeApptModal);
  apptOverlay.addEventListener('click', e => { if (e.target === apptOverlay) closeApptModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !apptOverlay.classList.contains('hidden')) closeApptModal();
  });


  $('apptDateTime').addEventListener('change', _apptUpdateTimeBadge);
  $('apptTimezone').addEventListener('change', _apptUpdateTimeBadge);

  $('apptForm').addEventListener('submit', e => {
    e.preventDefault();
    const projectName = $('apptProject').value.trim();
    const title = $('apptTitle').value.trim();
    const description = $('apptDesc').value.trim();
    const dtVal = $('apptDateTime').value;
    const timezone = $('apptTimezone').value || Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!projectName || !title || !dtVal) return;

    const scheduledTime = _tzLocalToUTC(dtVal, timezone);
    const appts = loadAppointments();

    if (editingApptId) {
      const idx = appts.findIndex(a => a.id === editingApptId);
      if (idx !== -1) {
        appts[idx] = { ...appts[idx], projectName, title, description, scheduledTime, timezone };
        logActivity('UPDATE_APPOINTMENT', { projectName, title, scheduledTime });
      }
    } else {
      const newAppt = {
        id: _uuid(),
        projectName, title, description, scheduledTime, timezone,
        reminderMinutes: 0,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      appts.push(newAppt);
      logActivity('CREATE_APPOINTMENT', { projectName, title, scheduledTime });
    }
    saveAppointments(appts);
    renderAppointments();
    closeApptModal();
  });

  // -- Appointment filter chips (removed — all statuses shown together) --

  // -- Load appointments from Supabase on init --------------------------
  (async () => {
    try {
      const { data } = await _supabase
        .from('appointments')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('scheduled_time', { ascending: false })
        .limit(1000);
      if (data && data.length > 0) {
        // DB has appointments — use DB data
        const mapped = data.map(r => ({
          id: r.id,
          projectName: r.project_name,
          title: r.title,
          description: r.description,
          scheduledTime: r.scheduled_time,
          reminderMinutes: r.reminder_minutes,
          status: r.status,
          createdAt: r.created_at,
          timezone: r.timezone || null,
        }));
        localStorage.setItem(APPT_KEY, JSON.stringify(mapped));
      } else {
        // DB empty — sync local appointments to DB so cross-device works next time
        const localAppts = loadAppointments();
        if (localAppts.length > 0) _syncApptsToDB(localAppts);
      }
    } catch { /* use localStorage */ }
    renderAppointments();
  })();

  // -- Auto-mark missed appointments + fire reminders --------------------
  function _checkApptTimers() {
    const appts = loadAppointments();
    let changed = false;
    let missedCount = 0;
    const now = new Date();
    appts.forEach(a => {
      if (a.status !== 'pending') return;
      const schedTime = new Date(a.scheduledTime);

      // Auto-mark missed (cap at 5 notifications per check to avoid Telegram spam)
      if (schedTime < now) {
        a.status = 'missed';
        changed = true;
        if (missedCount < 5) {
          missedCount++;
          logActivity('MISS_APPOINTMENT', { projectName: a.projectName, title: a.title });
        }
      } else {
        // Trigger reminder when within reminderMinutes of scheduled time (once only)
        const msBefore = (a.reminderMinutes || 0) * 60000;
        if (msBefore > 0 && !a.reminderSent && (schedTime - now) <= msBefore) {
          a.reminderSent = true;
          changed = true;
          logActivity('REMINDER_APPOINTMENT', {
            projectName: a.projectName,
            title: a.title,
            scheduledTime: a.scheduledTime,
            reminderMinutes: a.reminderMinutes,
          });
          // Browser notification for reminder
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              const n = new Notification(`⏰ Reminder: ${a.title}`, {
                body: `Scheduled ${a.reminderMinutes}m from now — ${a.projectName}`,
                tag: `appt-remind-${a.id}`,
                requireInteraction: true,
              });
              n.onclick = () => { window.focus(); n.close(); };
            } catch { /* noop */ }
          }
        }
      }
    });
    if (changed) {
      saveAppointments(appts);
      renderAppointments();
    }
  }

  // Run immediately on load, then every minute
  _checkApptTimers();
  setInterval(_checkApptTimers, 60000);

  // --- Role-Based Admin Button ------------------------------------------
  const _ROLE_KEY = 'amber.user.role.v1';
  let currentUserRole = 'agent';

  // Show admin button immediately if we cached a privileged role last session
  const _cachedRole = localStorage.getItem(_ROLE_KEY);
  if (_cachedRole === 'admin' || _cachedRole === 'manager') {
    currentUserRole = _cachedRole;
    const goBtn = $('goAdminBtn');
    if (goBtn) goBtn.classList.remove('hidden');
  }

  (async () => {
    try {
      const { data } = await _supabase
        .from('profiles')
        .select('role, name')
        .eq('id', currentUser.id)
        .single();

      if (data) {
        if (data.name && !tgSettings.name) tgSettings.name = data.name;
        currentUserRole = data.role || 'agent';
        localStorage.setItem(_ROLE_KEY, currentUserRole);
        if (data.role === 'admin' || data.role === 'manager') {
          const goBtn = $('goAdminBtn');
          if (goBtn) goBtn.classList.remove('hidden');
        } else {
          const goBtn = $('goAdminBtn');
          if (goBtn) goBtn.classList.add('hidden');
        }
      }
    } catch { /* profiles table not set up yet */ }
  })();

  // --- Real-time subscriptions ─────────────────────────────────────────
  if (!_isDemo) {
    const _rtUid = currentUser.id;

    function _rtShowLive() {
      const dot = document.getElementById('rtLiveDot');
      if (dot) dot.classList.remove('hidden');
    }

    // Tasks — per-user filter
    _supabase.channel('rt-tasks-' + _rtUid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks',
        filter: `user_id=eq.${_rtUid}`,
      }, ({ eventType, new: row, old }) => {
        if (eventType === 'DELETE') {
          const idx = tasks.findIndex(t => t.id === old?.id);
          if (idx !== -1) { tasks.splice(idx, 1); save(); render(); }
        } else {
          const updated = {
            id: row.id, title: row.title, description: row.description,
            date: row.date, time: row.time,
            reminderMinutes: row.reminder_minutes ?? 60,
            completed: row.completed ?? false,
            leadStatus: row.lead_status ?? null,
          };
          const idx = tasks.findIndex(t => t.id === row.id);
          if (idx !== -1) tasks[idx] = updated; else tasks.push(updated);
          save(); render();
        }
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') _rtShowLive(); });

    // Appointments — per-user filter
    _supabase.channel('rt-appts-' + _rtUid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'appointments',
        filter: `user_id=eq.${_rtUid}`,
      }, ({ eventType, new: row, old }) => {
        const appts = loadAppointments();
        if (eventType === 'DELETE') {
          const idx = appts.findIndex(a => a.id === old?.id);
          if (idx !== -1) {
            appts.splice(idx, 1);
            localStorage.setItem(APPT_KEY, JSON.stringify(appts));
            renderAppointments();
          }
        } else {
          const mapped = {
            id: row.id, projectName: row.project_name, title: row.title,
            description: row.description, scheduledTime: row.scheduled_time,
            reminderMinutes: row.reminder_minutes, status: row.status, createdAt: row.created_at,
          };
          const idx = appts.findIndex(a => a.id === row.id);
          if (idx !== -1) appts[idx] = mapped; else appts.unshift(mapped);
          localStorage.setItem(APPT_KEY, JSON.stringify(appts));
          renderAppointments();
        }
      })
      .subscribe();

    // Time sessions — re-fetch & re-render on change (debounced)
    let _sessRtTimer = null;
    _supabase.channel('rt-sessions-' + _rtUid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'time_sessions',
        filter: `user_id=eq.${_rtUid}`,
      }, () => {
        clearTimeout(_sessRtTimer);
        _sessRtTimer = setTimeout(async () => {
          try {
            const { data } = await _supabase
              .from('time_sessions')
              .select('*')
              .eq('user_id', _rtUid)
              .order('start_time', { ascending: false })
              .limit(200);
            if (data) {
              const mapped = data.map(r => {
                const startMs = r.start_time ? new Date(r.start_time).getTime() : Date.now();
                const endMs   = r.end_time   ? new Date(r.end_time).getTime()   : null;
                const startDt = new Date(startMs);
                const dk = `${startDt.getFullYear()}-${String(startDt.getMonth()+1).padStart(2,'0')}-${String(startDt.getDate()).padStart(2,'0')}`;
                return { id: r.id, project: r.project_name || 'General', date: dk, start: startMs, end: endMs,
                  duration: r.duration_seconds ? r.duration_seconds * 1000 : (endMs ? endMs - startMs : 0) };
              });
              localStorage.setItem(TRACKER_KEY, JSON.stringify(mapped));
              renderSessionHistory();
              renderPanelSessionList();
              updateGoalProgress();
            }
          } catch {}
        }, 600);
      })
      .subscribe();
  }

})();
