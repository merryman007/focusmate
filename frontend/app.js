// ==========================================================================
// FocusMate • Emil Kowalski Design Engineered Interactive Controller
// ==========================================================================

// --- Audio Synthesis for Dopamine Feedback ---
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
}

const chime = new DopamineChime();

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
  },
  theme: localStorage.getItem('focusmate_theme') || 'dark'
};

// Apply saved theme
document.documentElement.setAttribute('data-theme', state.theme);

// --- DOM Elements Reference ---
const $ = (id) => document.getElementById(id);

// Modal Helpers (Emil Kowalski Transitions: scale 0.95 -> 1 with ease-out)
function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add('open');
  modalEl.style.display = 'flex';
  refreshIcons();
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('open');
  setTimeout(() => {
    if (!modalEl.classList.contains('open')) {
      modalEl.style.display = 'none';
    }
  }, 180);
}

// Refresh Lucide Icons
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Prompt Starter Chips
window.addPromptChip = function(text) {
  const input = $('braindumpInput');
  if (!input) return;
  const current = input.value.trim();
  input.value = current ? `${current}, ${text}` : text;
  input.focus();
};

// --- Weekly Calendar Strip (Bento Style) ---
function renderWeekStrip() {
  const now = new Date();
  const options = { month: 'long', year: 'numeric' };
  const monthTitle = $('currentMonthYear');
  if (monthTitle) {
    monthTitle.textContent = now.toLocaleDateString(undefined, options);
  }

  const currentDayIndex = now.getDay();
  const mondayOffset = (currentDayIndex + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);

  const daysHtml = [];
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);

    const isToday = d.toDateString() === now.toDateString();
    const hasCompletedWins = isToday && state.completedTasks.length > 0;

    daysHtml.push(`
      <div class="day-bento-pill ${isToday ? 'today' : ''}" title="${d.toLocaleDateString()}">
        <span class="day-letter">${dayLabels[i]}</span>
        <span class="day-number">${d.getDate()}</span>
        ${hasCompletedWins ? '<div class="day-win-dot"></div>' : ''}
      </div>
    `);
  }

  const strip = $('weekStrip');
  if (strip) {
    strip.innerHTML = daysHtml.join('');
  }
}

// --- Theme Switcher (Dark / Light) ---
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('focusmate_theme', state.theme);
  refreshIcons();
}

// --- API Functions ---

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    state.settings = await res.json();
    const modelSelect = $('geminiModelSelect');
    if (modelSelect) {
      modelSelect.value = state.settings.gemini_model || 'gemini-3.6-flash';
    }
    const apiKeyInput = $('geminiApiKey');
    if (apiKeyInput && state.settings.masked_api_key) {
      apiKeyInput.placeholder = state.settings.masked_api_key;
    }
    const aiStatus = $('aiStatusText');
    if (aiStatus) {
      aiStatus.textContent = state.settings.has_api_key ? 'Gemini AI Active' : 'Smart Offline Mode';
    }

    if (!state.settings.onboarded) {
      openModal($('onboardingModal'));
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
  const total = completed + pending;

  // Header & drawer badges
  if ($('winsCount')) $('winsCount').textContent = completed;
  if ($('peekCount')) $('peekCount').textContent = pending;
  if ($('pendingTabCount')) $('pendingTabCount').textContent = pending;
  if ($('completedTabCount')) $('completedTabCount').textContent = completed;

  // 1. Bento Circular Progress Ring
  const percent = total > 0 ? Math.round((completed / total) * 100) : (completed > 0 ? 100 : 0);
  if ($('circularPercentText')) $('circularPercentText').textContent = `${percent}%`;
  if ($('completedCountText')) $('completedCountText').textContent = `${completed} Done`;
  if ($('pendingRemainingText')) $('pendingRemainingText').textContent = `${pending} remaining today`;

  const circumference = 2 * Math.PI * 42; // r=42 -> ~263.89
  const ringOffset = circumference * (1 - percent / 100);
  if ($('circularProgressFill')) {
    $('circularProgressFill').style.strokeDashoffset = ringOffset;
  }

  // 2. Bento Planned Focus Time
  const totalPlannedMinutes = state.pendingTasks.reduce((acc, t) => acc + (t.time_estimate_minutes || 15), 0);
  if ($('plannedMinutesText')) {
    $('plannedMinutesText').textContent = `${totalPlannedMinutes}m`;
  }

  // 3. Bento Next Task Preview
  const nextPreview = $('nextTaskPreviewTitle');
  if (nextPreview) {
    if (state.pendingTasks.length > 1) {
      nextPreview.textContent = state.pendingTasks[1].title;
    } else if (state.pendingTasks.length === 1) {
      nextPreview.textContent = 'Current is last task';
    } else {
      nextPreview.textContent = 'Queue clear';
    }
  }

  renderWeekStrip();

  // Arena display state
  const arena = $('focusArena');
  const empty = $('emptyState');

  if (!state.currentTask) {
    if (arena) arena.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    refreshIcons();
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

  // Subtasks list
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
  refreshIcons();
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
            ${idx > 0 ? `<button class="btn-icon-sm btn-move-up" title="Move Up" onclick="moveTask(${idx}, -1)">▲</button>` : ''}
            ${idx < state.pendingTasks.length - 1 ? `<button class="btn-icon-sm btn-move-down" title="Move Down" onclick="moveTask(${idx}, 1)">▼</button>` : ''}
            <button class="btn-icon-sm btn-icon-danger" title="Delete Task" onclick="deleteTaskItem(${t.id})">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
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
          <button class="btn-icon-sm btn-icon-danger" title="Delete" onclick="deleteTaskItem(${t.id})">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
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
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
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
  const origBtnContent = btn ? btn.innerHTML : '';
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
      btn.innerHTML = origBtnContent;
      btn.disabled = false;
    }
    refreshIcons();
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
  closeModal($('braindumpModal'));
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
  const clarQuestion = $('clarificationQuestionText');
  const clarOptions = $('clarificationOptions');

  if (data.has_clarification && data.clarification_question && (data.clarification_options || []).length > 0) {
    if (clarBox) clarBox.style.display = 'flex';
    if (clarQuestion) clarQuestion.textContent = data.clarification_question;
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
  openModal($('reviewModal'));
  refreshIcons();
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

    closeModal($('reviewModal'));
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

// --- Soft Focus Sprint Timer ---

function startSprintModal() {
  if (!state.currentTask) return;

  const estMinutes = state.currentTask.time_estimate_minutes || 15;
  state.sprint.totalSeconds = estMinutes * 60;
  state.sprint.secondsLeft = state.sprint.totalSeconds;
  state.sprint.isPaused = false;

  if ($('sprintTaskTitle')) $('sprintTaskTitle').textContent = state.currentTask.title;
  if ($('sprintTip')) $('sprintTip').textContent = "Take a slow breath. Just do the very first 2-minute starter step.";
  if ($('pauseSprintBtn')) $('pauseSprintBtn').innerHTML = '<i data-lucide="pause"></i><span>Pause</span>';
  
  openModal($('sprintModal'));
  updateTimerUI();
  clearInterval(state.sprint.timerInterval);
  refreshIcons();

  state.sprint.timerInterval = setInterval(() => {
    if (!state.sprint.isPaused) {
      state.sprint.secondsLeft--;
      updateTimerUI();

      if (state.sprint.secondsLeft <= 0) {
        clearInterval(state.sprint.timerInterval);
        if ($('sprintTip')) $('sprintTip').textContent = "Sprint time is up! Did you finish, or need a gentle 5-minute extension?";
        if ($('timerTimeText')) $('timerTimeText').textContent = "00:00";
        chime.playSuccess();
      }
    }
  }, 1000);
}

function updateTimerUI() {
  const mins = Math.max(0, Math.floor(state.sprint.secondsLeft / 60));
  const secs = Math.max(0, state.sprint.secondsLeft % 60);
  if ($('timerTimeText')) {
    $('timerTimeText').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  const circumference = 2 * Math.PI * 88;
  const progressRatio = state.sprint.totalSeconds > 0 ? (state.sprint.secondsLeft / state.sprint.totalSeconds) : 0;
  const offset = circumference * (1 - progressRatio);
  if ($('timerProgressRing')) {
    $('timerProgressRing').style.strokeDashoffset = offset;
  }
}

function togglePauseSprint() {
  state.sprint.isPaused = !state.sprint.isPaused;
  if ($('pauseSprintBtn')) {
    $('pauseSprintBtn').innerHTML = state.sprint.isPaused 
      ? '<i data-lucide="play"></i><span>Resume</span>' 
      : '<i data-lucide="pause"></i><span>Pause</span>';
  }
  refreshIcons();
}

function extendSprint() {
  state.sprint.secondsLeft += 300;
  state.sprint.totalSeconds += 300;
  updateTimerUI();
}

function closeSprintModal() {
  clearInterval(state.sprint.timerInterval);
  closeModal($('sprintModal'));
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 55,
      spread: 65,
      origin: { y: 0.75 },
      colors: ['#ffffff', '#a855f7', '#10b981', '#38bdf8', '#fb7185', '#f59e0b']
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
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
      refreshIcons();
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
      refreshIcons();
    });

    tabCompleted.addEventListener('click', () => {
      tabCompleted.classList.add('active');
      tabPending.classList.remove('active');
      paneCompleted.classList.add('active');
      panePending.classList.remove('active');
      refreshIcons();
    });
  }

  // Braindump Modal
  const openBraindump = () => {
    resetBraindumpModal();
    openModal($('braindumpModal'));
    const input = $('braindumpInput');
    if (input) input.focus();
    refreshIcons();
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
      closeModal($('braindumpModal'));
      closeModal($('reviewModal'));
      closeModal($('settingsModal'));
      closeModal($('sprintModal'));
      if (drawer) drawer.classList.remove('open');
    }
  });

  // Modal Backdrop Click to Dismiss
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal(backdrop);
      }
    });
  });

  // Review Modal Controls
  const closeReview = $('closeReviewBtn');
  if (closeReview) closeReview.addEventListener('click', () => closeModal($('reviewModal')));

  const cancelReview = $('cancelReviewBtn');
  if (cancelReview) {
    cancelReview.addEventListener('click', () => {
      closeModal($('reviewModal'));
      openModal($('braindumpModal'));
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
      openModal($('settingsModal'));
      if ($('testFeedback')) $('testFeedback').textContent = '';
      refreshIcons();
    });
  }

  const closeSettings = $('closeSettingsBtn');
  if (closeSettings) closeSettings.addEventListener('click', () => closeModal($('settingsModal')));

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
      closeModal($('settingsModal'));
      await fetchSettings();
    });
  }

  const clearAll = $('clearAllTasksBtn');
  if (clearAll) {
    clearAll.addEventListener('click', async () => {
      if (confirm('Clear all pending and completed tasks? This cannot be undone.')) {
        await fetch('/api/tasks', { method: 'DELETE' });
        closeModal($('settingsModal'));
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

      closeModal($('onboardingModal'));
      await fetchSettings();
    });
  }
}

// Initial Boot
window.addEventListener('DOMContentLoaded', async () => {
  setupListeners();
  await fetchSettings();
  await loadTasks();
  refreshIcons();
});
