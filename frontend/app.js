// ==========================================================================
// FocusMate • Minimalist Monochrome Interactive Controller
// ==========================================================================

// --- Dopamine Audio Feedback ---
class DopamineChime {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.ctx = new AudioContext();
    }
  }

  playSuccess() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      // Uplifting 3-tone harmonic major triad progression (C5 -> E5 -> G5)
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + i * 0.08);

        gain.gain.setValueAtTime(0.001, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.08 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.55);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.6);
      });
    } catch (e) {
      console.log('Audio feedback not available', e);
    }
  }

  playSprintZenBell() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      // Warm meditative singing bowl harmonic resonance (432Hz fundamental, 864Hz octave, 1296Hz fifth)
      const harmonics = [
        { freq: 432, gain: 0.16, decay: 2.8 },
        { freq: 864, gain: 0.09, decay: 2.2 },
        { freq: 1296, gain: 0.05, decay: 1.6 }
      ];

      harmonics.forEach(({ freq, gain, decay }) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(gain, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decay);

        osc.connect(g);
        g.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + decay + 0.1);
      });
    } catch (e) {
      console.log('Zen bell audio not available', e);
    }
  }
}

const chime = new DopamineChime();

// --- Notifications Helper ---
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendSprintNotification(taskTitle) {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try {
      new Notification('Focus Sprint Goal Reached! ✨', {
        body: `"${taskTitle}" timebox is complete. You are now in Flow Overtime — keep riding the momentum or finish whenever ready!`,
      });
    } catch (e) {
      console.log('Notification trigger error', e);
    }
  }
}

// --- State Variables ---
let state = {
  currentTask: null,
  pendingTasks: [],
  completedTasks: [],
  proposedTasks: [],
  selectedClarificationOption: '',
  settings: {
    has_api_key: false,
    gemini_model: 'gemini-3.6-flash',
    onboarded: false,
  },
  sprint: {
    timerInterval: null,
    totalSeconds: 900,
    secondsLeft: 900,
    isPaused: false,
    isOvertime: false,
    overtimeSeconds: 0,
  },
  theme: localStorage.getItem('focusmate_theme') || 'dark'
};

// Apply saved theme
document.documentElement.setAttribute('data-theme', state.theme);

// Safe DOM Helper
const $ = (id) => document.getElementById(id);

// Safe Modal Helpers
function showModal(id) {
  const el = $(id);
  if (el) el.style.display = 'flex';
}

function hideModal(id) {
  const el = $(id);
  if (el) el.style.display = 'none';
}

// Confetti Celebration
function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.75 },
      colors: ['#ffffff', '#22c55e', '#a1a1aa', '#eab308']
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Date Display
function renderHeaderDate() {
  const dateEl = $('currentDateText');
  if (dateEl) {
    const now = new Date();
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    dateEl.textContent = now.toLocaleDateString(undefined, options);
  }
}

// Theme Switcher
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('focusmate_theme', state.theme);
}

// --- API Calls ---

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    state.settings = await res.json();
    
    if ($('geminiModelSelect')) {
      $('geminiModelSelect').value = state.settings.gemini_model || 'gemini-3.6-flash';
    }
    if ($('geminiApiKey') && state.settings.masked_api_key) {
      $('geminiApiKey').placeholder = state.settings.masked_api_key;
    }
    if ($('aiStatusText')) {
      $('aiStatusText').textContent = state.settings.has_api_key ? 'Gemini AI Active' : 'Smart Offline Mode';
    }

    if (!state.settings.onboarded) {
      showModal('onboardingModal');
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

async function loadTasks() {
  try {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    state.pendingTasks = data.pending || [];
    state.completedTasks = data.completed || [];
    state.currentTask = data.current || null;

    updateUI();
  } catch (e) {
    console.error('Failed to load tasks', e);
  }
}

function updateUI() {
  const completed = state.completedTasks.length;
  const pending = state.pendingTasks.length;

  if ($('winsCount')) $('winsCount').textContent = completed;
  if ($('peekCount')) $('peekCount').textContent = pending;
  if ($('pendingTabCount')) $('pendingTabCount').textContent = pending;
  if ($('completedTabCount')) $('completedTabCount').textContent = completed;

  renderHeaderDate();

  const arena = $('focusArena');
  const empty = $('emptyState');

  if (!state.currentTask) {
    if (arena) arena.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (arena) arena.style.display = 'flex';

  const t = state.currentTask;
  if ($('taskTitle')) $('taskTitle').textContent = t.title;
  if ($('taskDesc')) $('taskDesc').textContent = t.description || '';
  if ($('taskEnergyText')) $('taskEnergyText').textContent = t.suggested_time_of_day || 'Morning Focus';
  
  const estMins = t.time_estimate_minutes || 15;
  if ($('taskTimeText')) $('taskTimeText').textContent = `${estMins} mins`;
  if ($('sprintDurationLabel')) $('sprintDurationLabel').textContent = `${estMins}m`;
  if ($('taskPosition')) $('taskPosition').textContent = `1 of ${pending}`;

  // Subtasks on main card
  const subtasks = t.subtasks || [];
  const subtasksContainer = $('subtasksContainer');
  const subtasksList = $('subtasksList');

  if (subtasks.length > 0 && subtasksList) {
    if (subtasksContainer) subtasksContainer.style.display = 'flex';
    subtasksList.innerHTML = subtasks.map((st, idx) => `
      <li class="micro-step-item">
        <input type="checkbox" id="st_${idx}">
        <label for="st_${idx}"><span>${escapeHtml(st)}</span></label>
      </li>
    `).join('');

    subtasksList.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const item = e.target.closest('.micro-step-item');
        if (e.target.checked) {
          item.classList.add('done');
          chime.playSuccess();
        } else {
          item.classList.remove('done');
        }
      });
    });
  } else {
    if (subtasksContainer) subtasksContainer.style.display = 'none';
    if (subtasksList) subtasksList.innerHTML = '';
  }

  renderQueueList();
}

function renderQueueList() {
  const queueList = $('queueList');
  const winsList = $('winsList');

  if (queueList) {
    if (state.pendingTasks.length === 0) {
      queueList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">No upcoming tasks in queue.</p>';
    } else {
      queueList.innerHTML = state.pendingTasks.map((t, idx) => `
        <div class="queue-item" data-task-id="${t.id}">
          <div class="queue-item-left">
            <div class="queue-item-title">${idx === 0 ? '👉 ' : ''}${escapeHtml(t.title)}</div>
            <div class="queue-item-meta">⏱️ ${t.time_estimate_minutes || 15}m • ${escapeHtml(t.suggested_time_of_day || '')}</div>
          </div>
          <div class="queue-item-actions">
            ${idx > 0 ? `<button class="btn-icon-sm" title="Move Up" onclick="moveTask(${idx}, -1)">▲</button>` : ''}
            ${idx < state.pendingTasks.length - 1 ? `<button class="btn-icon-sm" title="Move Down" onclick="moveTask(${idx}, 1)">▼</button>` : ''}
            <button class="btn-icon-sm btn-icon-danger" title="Delete Task" onclick="deleteTaskItem(${t.id})">✕</button>
          </div>
        </div>
      `).join('');
    }
  }

  if (winsList) {
    if (state.completedTasks.length === 0) {
      winsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">No wins completed yet today.</p>';
    } else {
      winsList.innerHTML = state.completedTasks.map(t => `
        <div class="queue-item" style="border-left: 3px solid var(--accent-green);">
          <div class="queue-item-left">
            <div class="queue-item-title" style="text-decoration: line-through; color: var(--text-secondary);">${escapeHtml(t.title)}</div>
            <div class="queue-item-meta">Conquered ✨</div>
          </div>
          <button class="btn-icon-sm btn-icon-danger" title="Delete" onclick="deleteTaskItem(${t.id})">✕</button>
        </div>
      `).join('');
    }
  }
}

// --- Task Reordering & Management ---

window.moveTask = async function(currentIndex, direction) {
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= state.pendingTasks.length) return;

  const temp = state.pendingTasks[currentIndex];
  state.pendingTasks[currentIndex] = state.pendingTasks[targetIndex];
  state.pendingTasks[targetIndex] = temp;

  const taskIds = state.pendingTasks.map(t => t.id);

  try {
    await fetch('/api/tasks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_ids: taskIds })
    });
    await loadTasks();
  } catch (e) {
    console.error('Failed to reorder tasks', e);
  }
};

window.deleteTaskItem = async function(taskId) {
  try {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    await loadTasks();
  } catch (e) {
    console.error('Failed to delete task', e);
  }
};

async function shufflePendingTasks() {
  if (state.pendingTasks.length <= 1) return;

  const shuffled = [...state.pendingTasks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[j], shuffled[i]] = [shuffled[j], shuffled[i]];
  }

  const taskIds = shuffled.map(t => t.id);
  try {
    await fetch('/api/tasks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_ids: taskIds })
    });
    await loadTasks();
    chime.playSuccess();
  } catch (e) {
    console.error('Failed to shuffle tasks', e);
  }
}

// --- Action Handlers ---

async function handleCompleteCurrentTask() {
  if (!state.currentTask) return;

  chime.playSuccess();
  triggerConfetti();

  const taskId = state.currentTask.id;
  try {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    await loadTasks();
  } catch (e) {
    console.error('Error completing task', e);
  }
}

async function handleSkipTask() {
  if (!state.currentTask || state.pendingTasks.length <= 1) return;

  const taskId = state.currentTask.id;
  const maxIdx = Math.max(...state.pendingTasks.map(t => t.order_index || 0));

  try {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_index: maxIdx + 1 })
    });
    await loadTasks();
  } catch (e) {
    console.error('Error skipping task', e);
  }
}

async function handleStuckDechunker() {
  if (!state.currentTask) return;

  const btn = $('stuckBtn');
  const origText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<span>⏳ Breaking into 2-min steps...</span>';
    btn.disabled = true;
  }

  try {
    const res = await fetch(`/api/tasks/${state.currentTask.id}/breakdown`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.task) {
      state.currentTask = data.task;
      updateUI();
    }
  } catch (e) {
    console.error('Error breaking down task', e);
  } finally {
    if (btn) {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  }
}

// --- Braindump Handlers ---

async function handleBrainDumpSubmit() {
  const input = $('braindumpInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const inputState = $('braindumpInputState');
  const loadingState = $('aiLoadingState');
  const progressFill = $('progressBarFill');
  const stepTitle = $('loadingStepTitle');
  const stepSub = $('loadingStepSub');

  if (inputState) inputState.style.display = 'none';
  if (loadingState) loadingState.style.display = 'flex';
  if (stepTitle) stepTitle.textContent = "Reading your brain dump...";
  if (stepSub) stepSub.textContent = "Extracting thoughts and filtering visual noise...";
  if (progressFill) progressFill.style.width = "30%";

  const progressTimer1 = setTimeout(() => {
    if (stepTitle) stepTitle.textContent = "De-chunking into atomic steps...";
    if (stepSub) stepSub.textContent = "Structuring low-friction 2-minute starter actions...";
    if (progressFill) progressFill.style.width = "65%";
  }, 800);

  const progressTimer2 = setTimeout(() => {
    if (stepTitle) stepTitle.textContent = "Pacing energy & durations...";
    if (stepSub) stepSub.textContent = "Assigning calm timeboxes to prevent time blindness...";
    if (progressFill) progressFill.style.width = "90%";
  }, 1600);

  try {
    const res = await fetch('/api/braindump/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    
    clearTimeout(progressTimer1);
    clearTimeout(progressTimer2);
    if (progressFill) progressFill.style.width = "100%";

    setTimeout(() => {
      resetBraindumpModal();
      openReviewModal(data);
    }, 300);

  } catch (e) {
    clearTimeout(progressTimer1);
    clearTimeout(progressTimer2);
    console.error('Error previewing braindump', e);
    alert('Failed to parse brain dump. Please try again.');
    resetBraindumpModal();
  }
}

function resetBraindumpModal() {
  hideModal('braindumpModal');
  const loadingState = $('aiLoadingState');
  const inputState = $('braindumpInputState');
  const progressFill = $('progressBarFill');

  if (loadingState) loadingState.style.display = 'none';
  if (inputState) inputState.style.display = 'block';
  if (progressFill) progressFill.style.width = '0%';
}

function openReviewModal(data) {
  state.proposedTasks = (data.tasks || []).map(t => ({ ...t, selected: true }));
  state.selectedClarificationOption = '';

  const clarBox = $('clarificationBox');
  const clarOptions = $('clarificationOptions');

  if (data.has_clarification && data.clarification_question && (data.clarification_options || []).length > 0) {
    if (clarBox) clarBox.style.display = 'flex';
    if (clarOptions) {
      clarOptions.innerHTML = data.clarification_options.map((opt) => `
        <button class="mcq-chip" data-opt="${escapeHtml(opt)}">${escapeHtml(opt)}</button>
      `).join('');

      clarOptions.querySelectorAll('.mcq-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          clarOptions.querySelectorAll('.mcq-chip').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          state.selectedClarificationOption = btn.getAttribute('data-opt');
        });
      });
    }
  } else {
    if (clarBox) clarBox.style.display = 'none';
    if (clarOptions) clarOptions.innerHTML = '';
  }

  renderPreviewTasks();
  showModal('reviewModal');
}

function renderPreviewTasks() {
  const previewList = $('previewTasksList');
  if (!previewList) return;

  previewList.innerHTML = state.proposedTasks.map((t, idx) => `
    <div class="preview-task-item" onclick="toggleTaskSelection(${idx})">
      <input type="checkbox" id="prev_chk_${idx}" ${t.selected ? 'checked' : ''} onclick="event.stopPropagation(); toggleTaskSelection(${idx});">
      <div class="preview-task-info">
        <div class="preview-task-title">${escapeHtml(t.title)}</div>
        <div class="preview-task-meta">
          <span>⏱️ ${t.time_estimate_minutes || 15}m</span>
          <span>•</span>
          <span>${escapeHtml(t.suggested_time_of_day || 'Morning Focus')}</span>
        </div>
      </div>
    </div>
  `).join('');

  updateReviewCount();
}

window.toggleTaskSelection = function(index) {
  state.proposedTasks[index].selected = !state.proposedTasks[index].selected;
  renderPreviewTasks();
};

function updateReviewCount() {
  const selectedCount = state.proposedTasks.filter(t => t.selected).length;
  if ($('selectedCountLabel')) $('selectedCountLabel').textContent = selectedCount;
  if ($('confirmTasksBtn')) $('confirmTasksBtn').disabled = selectedCount === 0;
}

async function handleConfirmTasks() {
  const selected = state.proposedTasks.filter(t => t.selected);
  if (selected.length === 0) return;

  const btn = $('confirmTasksBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Adding to Focus Flow...</span>';
  }

  try {
    await fetch('/api/braindump/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasks: selected,
        clarification_answer: state.selectedClarificationOption
      })
    });

    hideModal('reviewModal');
    const input = $('braindumpInput');
    if (input) input.value = '';
    chime.playSuccess();
    triggerConfetti();
    await loadTasks();
  } catch (e) {
    console.error('Error confirming tasks', e);
    alert('Failed to save selected tasks. Please try again.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// --- Soft Focus Sprint Timer with Flow Overtime Mode ---

function startSprintModal() {
  if (!state.currentTask) return;

  requestNotificationPermission();

  const estMinutes = state.currentTask.time_estimate_minutes || 15;
  state.sprint.totalSeconds = estMinutes * 60;
  state.sprint.secondsLeft = state.sprint.totalSeconds;
  state.sprint.isPaused = false;
  state.sprint.isOvertime = false;
  state.sprint.overtimeSeconds = 0;

  if ($('sprintTaskTitle')) $('sprintTaskTitle').textContent = state.currentTask.title;
  if ($('sprintTip')) $('sprintTip').textContent = "Take a slow breath. Just do the very first 2-minute starter step.";
  if ($('pauseSprintBtn')) $('pauseSprintBtn').textContent = '⏸️ Pause';
  
  const sprintTag = document.querySelector('.sprint-card .tag-sprint');
  if (sprintTag) {
    sprintTag.textContent = 'FOCUS SPRINT';
    sprintTag.classList.remove('tag-overtime');
  }

  const timeLabel = $('timerTimeText');
  if (timeLabel) timeLabel.classList.remove('is-overtime');

  const progressRing = $('timerProgressRing');
  if (progressRing) progressRing.classList.remove('is-overtime');

  // Render subtasks if present
  const subtasks = state.currentTask.subtasks || [];
  const sprintSubContainer = $('sprintSubtasksContainer');
  const sprintSubList = $('sprintSubtasksList');

  if (subtasks.length > 0 && sprintSubList) {
    if (sprintSubContainer) sprintSubContainer.style.display = 'flex';
    sprintSubList.innerHTML = subtasks.map((st, idx) => `
      <li class="micro-step-item">
        <input type="checkbox" id="sprint_st_${idx}">
        <label for="sprint_st_${idx}"><span>${escapeHtml(st)}</span></label>
      </li>
    `).join('');

    sprintSubList.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const item = e.target.closest('.micro-step-item');
        if (e.target.checked) {
          item.classList.add('done');
          chime.playSuccess();
        } else {
          item.classList.remove('done');
        }
      });
    });
  } else {
    if (sprintSubContainer) sprintSubContainer.style.display = 'none';
    if (sprintSubList) sprintSubList.innerHTML = '';
  }

  showModal('sprintModal');
  updateTimerUI();
  clearInterval(state.sprint.timerInterval);

  state.sprint.timerInterval = setInterval(() => {
    if (!state.sprint.isPaused) {
      if (!state.sprint.isOvertime) {
        state.sprint.secondsLeft--;
        updateTimerUI();

        if (state.sprint.secondsLeft <= 0) {
          // Timebox reached -> Seamlessly transition to Flow Overtime!
          state.sprint.isOvertime = true;
          state.sprint.overtimeSeconds = 0;
          chime.playSprintZenBell();
          sendSprintNotification(state.currentTask.title);

          if (sprintTag) {
            sprintTag.textContent = '✨ FLOW OVERTIME';
            sprintTag.classList.add('tag-overtime');
          }
          if (timeLabel) timeLabel.classList.add('is-overtime');
          if (progressRing) progressRing.classList.add('is-overtime');
          if ($('sprintTip')) {
            $('sprintTip').textContent = "Sprint goal reached! You're in flow overtime. Keep riding the wave or finish whenever ready.";
          }
        }
      } else {
        // Flow Overtime Ticking UP
        state.sprint.overtimeSeconds++;
        updateTimerUI();
      }
    }
  }, 1000);
}

function updateTimerUI() {
  const timeLabel = $('timerTimeText');
  const progressRing = $('timerProgressRing');

  if (!state.sprint.isOvertime) {
    const mins = Math.max(0, Math.floor(state.sprint.secondsLeft / 60));
    const secs = Math.max(0, state.sprint.secondsLeft % 60);
    if (timeLabel) {
      timeLabel.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    const circumference = 2 * Math.PI * 88;
    const progressRatio = state.sprint.totalSeconds > 0 ? (state.sprint.secondsLeft / state.sprint.totalSeconds) : 0;
    const offset = circumference * (1 - progressRatio);
    if (progressRing) {
      progressRing.style.strokeDashoffset = offset;
    }
  } else {
    // Flow Overtime counter (+MM:SS)
    const mins = Math.floor(state.sprint.overtimeSeconds / 60);
    const secs = state.sprint.overtimeSeconds % 60;
    if (timeLabel) {
      timeLabel.textContent = `+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    if (progressRing) {
      progressRing.style.strokeDashoffset = 0;
    }
  }
}

function togglePauseSprint() {
  state.sprint.isPaused = !state.sprint.isPaused;
  if ($('pauseSprintBtn')) {
    $('pauseSprintBtn').textContent = state.sprint.isPaused ? '▶️ Resume' : '⏸️ Pause';
  }
}

function extendSprint() {
  if (state.sprint.isOvertime) {
    state.sprint.isOvertime = false;
    state.sprint.secondsLeft = 300;
    state.sprint.totalSeconds = 300;

    const sprintTag = document.querySelector('.sprint-card .tag-sprint');
    if (sprintTag) {
      sprintTag.textContent = 'FOCUS SPRINT';
      sprintTag.classList.remove('tag-overtime');
    }
    const timeLabel = $('timerTimeText');
    if (timeLabel) timeLabel.classList.remove('is-overtime');
    const progressRing = $('timerProgressRing');
    if (progressRing) progressRing.classList.remove('is-overtime');
    if ($('sprintTip')) {
      $('sprintTip').textContent = "Added +5 calm minutes to your sprint.";
    }
  } else {
    state.sprint.secondsLeft += 300;
    state.sprint.totalSeconds += 300;
  }
  updateTimerUI();
}

function closeSprintModal() {
  clearInterval(state.sprint.timerInterval);
  hideModal('sprintModal');
}

// --- Setup Event Listeners ---

function setupListeners() {
  // Theme Toggle
  const themeBtn = $('themeToggleBtn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // Main Arena Buttons
  const doneBtn = $('markDoneBtn');
  if (doneBtn) doneBtn.addEventListener('click', handleCompleteCurrentTask);

  const sprintBtn = $('startSprintBtn');
  if (sprintBtn) sprintBtn.addEventListener('click', startSprintModal);

  const stuckBtn = $('stuckBtn');
  if (stuckBtn) stuckBtn.addEventListener('click', handleStuckDechunker);

  const skipBtn = $('skipTaskBtn');
  if (skipBtn) skipBtn.addEventListener('click', handleSkipTask);

  // Peek Drawer Triggers
  const peekBtn = $('peekToggleBtn');
  const drawer = $('peekDrawer');
  const closeDrawer = $('closeDrawerBtn');

  if (peekBtn && drawer) {
    peekBtn.addEventListener('click', () => {
      drawer.classList.add('open');
    });
  }

  if (closeDrawer && drawer) {
    closeDrawer.addEventListener('click', () => {
      drawer.classList.remove('open');
    });
  }

  const shuffleBtn = $('shuffleTasksBtn');
  if (shuffleBtn) shuffleBtn.addEventListener('click', shufflePendingTasks);

  // Drawer Tabs
  const tabPending = $('tabPending');
  const tabCompleted = $('tabCompleted');
  const panePending = $('panePending');
  const paneCompleted = $('paneCompleted');

  if (tabPending && tabCompleted && panePending && paneCompleted) {
    tabPending.addEventListener('click', () => {
      tabPending.classList.add('active');
      tabCompleted.classList.remove('active');
      panePending.classList.add('active');
      paneCompleted.classList.remove('active');
    });

    tabCompleted.addEventListener('click', () => {
      tabCompleted.classList.add('active');
      tabPending.classList.remove('active');
      paneCompleted.classList.add('active');
      panePending.classList.remove('active');
    });
  }

  // Braindump Modal
  const openBraindump = () => {
    resetBraindumpModal();
    showModal('braindumpModal');
    const input = $('braindumpInput');
    if (input) input.focus();
  };

  const braindumpNavBtn = $('openBraindumpBtn');
  if (braindumpNavBtn) braindumpNavBtn.addEventListener('click', openBraindump);

  const emptyBraindump = $('emptyBraindumpBtn');
  if (emptyBraindump) emptyBraindump.addEventListener('click', openBraindump);

  const closeBraindump = $('closeBraindumpBtn');
  if (closeBraindump) closeBraindump.addEventListener('click', resetBraindumpModal);

  const submitBraindump = $('submitBraindumpBtn');
  if (submitBraindump) submitBraindump.addEventListener('click', handleBrainDumpSubmit);

  // Global Keyboard Shortcut: Cmd+K / Ctrl+K for Brain Dump & Escape to dismiss modals
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openBraindump();
    }
    if (e.key === 'Escape') {
      hideModal('braindumpModal');
      hideModal('reviewModal');
      hideModal('settingsModal');
      hideModal('sprintModal');
      if (drawer) drawer.classList.remove('open');
    }
  });

  // Modal Backdrop Click to Dismiss
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.style.display = 'none';
      }
    });
  });

  // Review Modal Controls
  const closeReview = $('closeReviewBtn');
  if (closeReview) closeReview.addEventListener('click', () => hideModal('reviewModal'));

  const cancelReview = $('cancelReviewBtn');
  if (cancelReview) {
    cancelReview.addEventListener('click', () => {
      hideModal('reviewModal');
      showModal('braindumpModal');
    });
  }

  const confirmTasks = $('confirmTasksBtn');
  if (confirmTasks) confirmTasks.addEventListener('click', handleConfirmTasks);

  // Sprint Controls
  const pauseSprint = $('pauseSprintBtn');
  if (pauseSprint) pauseSprint.addEventListener('click', togglePauseSprint);

  const extendSprintBtn = $('extendSprintBtn');
  if (extendSprintBtn) extendSprintBtn.addEventListener('click', extendSprint);

  const finishSprint = $('finishSprintDoneBtn');
  if (finishSprint) {
    finishSprint.addEventListener('click', async () => {
      closeSprintModal();
      await handleCompleteCurrentTask();
    });
  }

  const exitSprint = $('exitSprintBtn');
  if (exitSprint) exitSprint.addEventListener('click', closeSprintModal);

  // Settings Modal
  const openSettings = $('openSettingsBtn');
  if (openSettings) {
    openSettings.addEventListener('click', () => {
      showModal('settingsModal');
      if ($('testFeedback')) $('testFeedback').textContent = '';
    });
  }

  const closeSettings = $('closeSettingsBtn');
  if (closeSettings) closeSettings.addEventListener('click', () => hideModal('settingsModal'));

  const testApiKey = $('testApiKeyBtn');
  if (testApiKey) {
    testApiKey.addEventListener('click', async () => {
      const apiKeyInput = $('geminiApiKey');
      const key = apiKeyInput ? apiKeyInput.value.trim() : '';
      const feedback = $('testFeedback');
      const modelSelect = $('geminiModelSelect');

      if (!key) {
        if (feedback) {
          feedback.className = 'test-feedback error';
          feedback.textContent = 'Please enter an API key to test.';
        }
        return;
      }

      testApiKey.disabled = true;
      if (feedback) {
        feedback.className = 'test-feedback';
        feedback.textContent = 'Testing connection with Gemini...';
      }

      try {
        const res = await fetch('/api/test-gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: key, model: modelSelect ? modelSelect.value : 'gemini-3.6-flash' })
        });
        const data = await res.json();
        if (data.success) {
          if (feedback) {
            feedback.className = 'test-feedback success';
            feedback.textContent = '✨ Connection successful!';
          }
        } else {
          if (feedback) {
            feedback.className = 'test-feedback error';
            feedback.textContent = `❌ ${data.error || 'Connection failed'}`;
          }
        }
      } catch (e) {
        if (feedback) {
          feedback.className = 'test-feedback error';
          feedback.textContent = 'Failed to reach backend test endpoint.';
        }
      } finally {
        testApiKey.disabled = false;
      }
    });
  }

  const saveSettings = $('saveSettingsBtn');
  if (saveSettings) {
    saveSettings.addEventListener('click', async () => {
      const modelSelect = $('geminiModelSelect');
      const apiKeyInput = $('geminiApiKey');
      const payload = {
        gemini_model: modelSelect ? modelSelect.value : 'gemini-3.6-flash',
        onboarded: 'true'
      };
      if (apiKeyInput && apiKeyInput.value.trim()) {
        payload.gemini_api_key = apiKeyInput.value.trim();
      }
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      hideModal('settingsModal');
      await fetchSettings();
    });
  }

  const clearAll = $('clearAllTasksBtn');
  if (clearAll) {
    clearAll.addEventListener('click', async () => {
      if (confirm('Clear all pending and completed tasks? This cannot be undone.')) {
        await fetch('/api/tasks', { method: 'DELETE' });
        hideModal('settingsModal');
        await loadTasks();
      }
    });
  }

  const finishOnboarding = $('finishOnboardingBtn');
  if (finishOnboarding) {
    finishOnboarding.addEventListener('click', async () => {
      const onboardInput = $('onboardingApiKey');
      const key = onboardInput ? onboardInput.value.trim() : '';
      const payload = { onboarded: 'true' };
      if (key) payload.gemini_api_key = key;

      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      hideModal('onboardingModal');
      await fetchSettings();
    });
  }
}

// Initial Boot
window.addEventListener('DOMContentLoaded', async () => {
  setupListeners();
  await fetchSettings();
  await loadTasks();
});
