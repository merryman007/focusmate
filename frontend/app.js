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
      // Uplifting 3-tone harmonic progression (C5 -> E5 -> G5)
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + i * 0.08);

        gain.gain.setValueAtTime(0.001, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.08 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.65);
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

// --- DOM Elements ---
const el = {
  currentMonthYear: document.getElementById('currentMonthYear'),
  weekStrip: document.getElementById('weekStrip'),
  
  // Bento Stats
  circularProgressFill: document.getElementById('circularProgressFill'),
  circularPercentText: document.getElementById('circularPercentText'),
  completedCountText: document.getElementById('completedCountText'),
  pendingRemainingText: document.getElementById('pendingRemainingText'),
  plannedMinutesText: document.getElementById('plannedMinutesText'),
  nextTaskPreviewTitle: document.getElementById('nextTaskPreviewTitle'),

  themeToggleBtn: document.getElementById('themeToggleBtn'),
  focusArena: document.getElementById('focusArena'),
  emptyState: document.getElementById('emptyState'),
  taskTitle: document.getElementById('taskTitle'),
  taskDesc: document.getElementById('taskDesc'),
  taskEnergyText: document.getElementById('taskEnergyText'),
  taskTimeText: document.getElementById('taskTimeText'),
  taskPosition: document.getElementById('taskPosition'),
  subtasksContainer: document.getElementById('subtasksContainer'),
  subtasksList: document.getElementById('subtasksList'),
  markDoneBtn: document.getElementById('markDoneBtn'),
  startSprintBtn: document.getElementById('startSprintBtn'),
  sprintDurationLabel: document.getElementById('sprintDurationLabel'),
  stuckBtn: document.getElementById('stuckBtn'),
  skipTaskBtn: document.getElementById('skipTaskBtn'),
  winsCount: document.getElementById('winsCount'),
  peekCount: document.getElementById('peekCount'),
  peekToggleBtn: document.getElementById('peekToggleBtn'),
  
  // Drawer
  peekDrawer: document.getElementById('peekDrawer'),
  closeDrawerBtn: document.getElementById('closeDrawerBtn'),
  tabPending: document.getElementById('tabPending'),
  tabCompleted: document.getElementById('tabCompleted'),
  panePending: document.getElementById('panePending'),
  paneCompleted: document.getElementById('paneCompleted'),
  pendingTabCount: document.getElementById('pendingTabCount'),
  completedTabCount: document.getElementById('completedTabCount'),
  queueList: document.getElementById('queueList'),
  winsList: document.getElementById('winsList'),
  shuffleTasksBtn: document.getElementById('shuffleTasksBtn'),

  // Braindump Modal & Loading States
  braindumpModal: document.getElementById('braindumpModal'),
  braindumpInputState: document.getElementById('braindumpInputState'),
  aiLoadingState: document.getElementById('aiLoadingState'),
  loadingStepTitle: document.getElementById('loadingStepTitle'),
  loadingStepSub: document.getElementById('loadingStepSub'),
  progressBarFill: document.getElementById('progressBarFill'),
  openBraindumpBtn: document.getElementById('openBraindumpBtn'),
  emptyBraindumpBtn: document.getElementById('emptyBraindumpBtn'),
  closeBraindumpBtn: document.getElementById('closeBraindumpBtn'),
  braindumpInput: document.getElementById('braindumpInput'),
  submitBraindumpBtn: document.getElementById('submitBraindumpBtn'),
  aiStatusText: document.getElementById('aiStatusText'),

  // Review & Confirmation Modal
  reviewModal: document.getElementById('reviewModal'),
  closeReviewBtn: document.getElementById('closeReviewBtn'),
  cancelReviewBtn: document.getElementById('cancelReviewBtn'),
  confirmTasksBtn: document.getElementById('confirmTasksBtn'),
  previewTasksList: document.getElementById('previewTasksList'),
  selectedCountLabel: document.getElementById('selectedCountLabel'),
  clarificationBox: document.getElementById('clarificationBox'),
  clarificationQuestionText: document.getElementById('clarificationQuestionText'),
  clarificationOptions: document.getElementById('clarificationOptions'),

  // Settings
  settingsModal: document.getElementById('settingsModal'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  geminiApiKey: document.getElementById('geminiApiKey'),
  geminiModelSelect: document.getElementById('geminiModelSelect'),
  testApiKeyBtn: document.getElementById('testApiKeyBtn'),
  testFeedback: document.getElementById('testFeedback'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  clearAllTasksBtn: document.getElementById('clearAllTasksBtn'),

  // Sprint Modal
  sprintModal: document.getElementById('sprintModal'),
  sprintTaskTitle: document.getElementById('sprintTaskTitle'),
  timerTimeText: document.getElementById('timerTimeText'),
  timerProgressRing: document.getElementById('timerProgressRing'),
  pauseSprintBtn: document.getElementById('pauseSprintBtn'),
  extendSprintBtn: document.getElementById('extendSprintBtn'),
  finishSprintDoneBtn: document.getElementById('finishSprintDoneBtn'),
  exitSprintBtn: document.getElementById('exitSprintBtn'),
  sprintTip: document.getElementById('sprintTip'),

  // Onboarding Modal
  onboardingModal: document.getElementById('onboardingModal'),
  onboardingApiKey: document.getElementById('onboardingApiKey'),
  finishOnboardingBtn: document.getElementById('finishOnboardingBtn'),
};

// --- Refresh Icons ---
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// --- Prompt Starter Chip Appender ---
window.addPromptChip = function(text) {
  if (!el.braindumpInput) return;
  const current = el.braindumpInput.value.trim();
  el.braindumpInput.value = current ? `${current}, ${text}` : text;
  el.braindumpInput.focus();
};

// --- Weekly Calendar Strip (Bento Style) ---
function renderWeekStrip() {
  const now = new Date();
  const options = { month: 'long', year: 'numeric' };
  if (el.currentMonthYear) {
    el.currentMonthYear.textContent = now.toLocaleDateString(undefined, options);
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

  if (el.weekStrip) {
    el.weekStrip.innerHTML = daysHtml.join('');
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
    el.geminiModelSelect.value = state.settings.gemini_model || 'gemini-3.6-flash';
    if (state.settings.masked_api_key) {
      el.geminiApiKey.placeholder = state.settings.masked_api_key;
    }
    el.aiStatusText.textContent = state.settings.has_api_key ? 'Gemini AI Active' : 'Smart Offline Mode';
    
    if (!state.settings.onboarded) {
      el.onboardingModal.style.display = 'flex';
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

  el.winsCount.textContent = completed;
  el.peekCount.textContent = pending;
  el.pendingTabCount.textContent = pending;
  el.completedTabCount.textContent = completed;

  // 1. Bento Circular Progress Ring
  const percent = total > 0 ? Math.round((completed / total) * 100) : (completed > 0 ? 100 : 0);
  el.circularPercentText.textContent = `${percent}%`;
  el.completedCountText.textContent = `${completed} Done`;
  el.pendingRemainingText.textContent = `${pending} remaining today`;

  const circumference = 2 * Math.PI * 42; // r=42 -> ~263.89
  const ringOffset = circumference * (1 - percent / 100);
  el.circularProgressFill.style.strokeDashoffset = ringOffset;

  // 2. Bento Planned Focus Time
  const totalPlannedMinutes = state.pendingTasks.reduce((acc, t) => acc + (t.time_estimate_minutes || 15), 0);
  el.plannedMinutesText.textContent = `${totalPlannedMinutes}m`;

  // 3. Bento Next Task Preview
  if (state.pendingTasks.length > 1) {
    el.nextTaskPreviewTitle.textContent = state.pendingTasks[1].title;
  } else if (state.pendingTasks.length === 1) {
    el.nextTaskPreviewTitle.textContent = 'Current is last task';
  } else {
    el.nextTaskPreviewTitle.textContent = 'Queue clear';
  }

  renderWeekStrip();

  if (!state.currentTask) {
    el.focusArena.style.display = 'none';
    el.emptyState.style.display = 'flex';
    refreshIcons();
    return;
  }

  el.emptyState.style.display = 'none';
  el.focusArena.style.display = 'flex';

  const t = state.currentTask;
  el.taskTitle.textContent = t.title;
  el.taskDesc.textContent = t.description || '';
  el.taskEnergyText.textContent = t.suggested_time_of_day || 'Morning Focus';
  
  const estMins = t.time_estimate_minutes || 15;
  el.taskTimeText.textContent = `${estMins} mins`;
  el.sprintDurationLabel.textContent = `${estMins}m`;
  
  el.taskPosition.textContent = `1 of ${pending}`;

  // Subtasks list
  const subtasks = t.subtasks || [];
  if (subtasks.length > 0) {
    el.subtasksContainer.style.display = 'flex';
    el.subtasksList.innerHTML = subtasks.map((st, idx) => `
      <li class="micro-step-item">
        <input type="checkbox" id="st_${idx}">
        <label for="st_${idx}"><span>${escapeHtml(st)}</span></label>
      </li>
    `).join('');

    el.subtasksList.querySelectorAll('input[type="checkbox"]').forEach(chk => {
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
    el.subtasksContainer.style.display = 'none';
    el.subtasksList.innerHTML = '';
  }

  renderQueueList();
  refreshIcons();
}

function renderQueueList() {
  if (state.pendingTasks.length === 0) {
    el.queueList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">No upcoming tasks.</p>';
  } else {
    el.queueList.innerHTML = state.pendingTasks.map((t, idx) => `
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

  if (state.completedTasks.length === 0) {
    el.winsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">No wins completed yet today.</p>';
  } else {
    el.winsList.innerHTML = state.completedTasks.map(t => `
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

  const origBtnContent = el.stuckBtn.innerHTML;
  el.stuckBtn.innerHTML = '<span>⏳ Breaking into 2-min steps...</span>';
  el.stuckBtn.disabled = true;

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
    el.stuckBtn.innerHTML = origBtnContent;
    el.stuckBtn.disabled = false;
    refreshIcons();
  }
}

// --- Braindump Handlers ---

async function handleBrainDumpSubmit() {
  const text = el.braindumpInput.value.trim();
  if (!text) return;

  el.braindumpInputState.style.display = 'none';
  el.aiLoadingState.style.display = 'flex';
  el.loadingStepTitle.textContent = "Reading your brain dump...";
  el.loadingStepSub.textContent = "Extracting thoughts and filtering visual noise...";
  el.progressBarFill.style.width = "30%";

  const progressTimer1 = setTimeout(() => {
    el.loadingStepTitle.textContent = "De-chunking into atomic steps...";
    el.loadingStepSub.textContent = "Structuring low-friction 2-minute starter actions...";
    el.progressBarFill.style.width = "65%";
  }, 900);

  const progressTimer2 = setTimeout(() => {
    el.loadingStepTitle.textContent = "Pacing energy & durations...";
    el.loadingStepSub.textContent = "Assigning calm timeboxes to prevent time blindness...";
    el.progressBarFill.style.width = "90%";
  }, 1800);

  try {
    const res = await fetch('/api/braindump/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    
    clearTimeout(progressTimer1);
    clearTimeout(progressTimer2);
    el.progressBarFill.style.width = "100%";

    setTimeout(() => {
      resetBraindumpModal();
      openReviewModal(data);
    }, 400);

  } catch (e) {
    clearTimeout(progressTimer1);
    clearTimeout(progressTimer2);
    console.error('Error previewing braindump', e);
    alert('Failed to parse brain dump. Please try again.');
    resetBraindumpModal();
  }
}

function resetBraindumpModal() {
  el.braindumpModal.style.display = 'none';
  el.aiLoadingState.style.display = 'none';
  el.braindumpInputState.style.display = 'block';
  el.progressBarFill.style.width = '0%';
}

function openReviewModal(data) {
  state.proposedTasks = (data.tasks || []).map(t => ({ ...t, selected: true }));
  state.selectedClarificationOption = '';

  if (data.has_clarification && data.clarification_question && (data.clarification_options || []).length > 0) {
    el.clarificationBox.style.display = 'flex';
    el.clarificationQuestionText.textContent = data.clarification_question;
    el.clarificationOptions.innerHTML = data.clarification_options.map((opt, i) => `
      <button class="mcq-chip" data-opt="${escapeHtml(opt)}">${escapeHtml(opt)}</button>
    `).join('');

    el.clarificationOptions.querySelectorAll('.mcq-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        el.clarificationOptions.querySelectorAll('.mcq-chip').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.selectedClarificationOption = btn.getAttribute('data-opt');
      });
    });
  } else {
    el.clarificationBox.style.display = 'none';
    el.clarificationOptions.innerHTML = '';
  }

  renderPreviewTasks();
  el.reviewModal.style.display = 'flex';
  refreshIcons();
}

function renderPreviewTasks() {
  el.previewTasksList.innerHTML = state.proposedTasks.map((t, idx) => `
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
  el.selectedCountLabel.textContent = selectedCount;
  el.confirmTasksBtn.disabled = selectedCount === 0;
}

async function handleConfirmTasks() {
  const selected = state.proposedTasks.filter(t => t.selected);
  if (selected.length === 0) return;

  el.confirmTasksBtn.disabled = true;
  el.confirmTasksBtn.innerHTML = '<span>⏳ Adding...</span>';

  try {
    await fetch('/api/braindump/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasks: selected,
        clarification_answer: state.selectedClarificationOption
      })
    });

    el.reviewModal.style.display = 'none';
    el.braindumpInput.value = '';
    chime.playSuccess();
    triggerConfetti();
    await loadTasks();
  } catch (e) {
    console.error('Error confirming tasks', e);
    alert('Failed to save selected tasks. Please try again.');
  } finally {
    el.confirmTasksBtn.disabled = false;
  }
}

// --- Soft Focus Sprint Timer ---

function startSprintModal() {
  if (!state.currentTask) return;

  const estMinutes = state.currentTask.time_estimate_minutes || 15;
  state.sprint.totalSeconds = estMinutes * 60;
  state.sprint.secondsLeft = state.sprint.totalSeconds;
  state.sprint.isPaused = false;

  el.sprintTaskTitle.textContent = state.currentTask.title;
  el.sprintTip.textContent = "Take a slow breath. Just do the very first 2-minute starter step.";
  el.pauseSprintBtn.innerHTML = '<i data-lucide="pause"></i><span>Pause</span>';
  el.sprintModal.style.display = 'flex';

  updateTimerUI();
  clearInterval(state.sprint.timerInterval);
  refreshIcons();

  state.sprint.timerInterval = setInterval(() => {
    if (!state.sprint.isPaused) {
      state.sprint.secondsLeft--;
      updateTimerUI();

      if (state.sprint.secondsLeft <= 0) {
        clearInterval(state.sprint.timerInterval);
        el.sprintTip.textContent = "Sprint time is up! Did you finish, or need a gentle 5-minute extension?";
        el.timerTimeText.textContent = "00:00";
        chime.playSuccess();
      }
    }
  }, 1000);
}

function updateTimerUI() {
  const mins = Math.max(0, Math.floor(state.sprint.secondsLeft / 60));
  const secs = Math.max(0, state.sprint.secondsLeft % 60);
  el.timerTimeText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const circumference = 2 * Math.PI * 88;
  const progressRatio = state.sprint.totalSeconds > 0 ? (state.sprint.secondsLeft / state.sprint.totalSeconds) : 0;
  const offset = circumference * (1 - progressRatio);
  el.timerProgressRing.style.strokeDashoffset = offset;
}

function togglePauseSprint() {
  state.sprint.isPaused = !state.sprint.isPaused;
  el.pauseSprintBtn.innerHTML = state.sprint.isPaused ? '<i data-lucide="play"></i><span>Resume</span>' : '<i data-lucide="pause"></i><span>Pause</span>';
  refreshIcons();
}

function extendSprint() {
  state.sprint.secondsLeft += 300;
  state.sprint.totalSeconds += 300;
  updateTimerUI();
}

function closeSprintModal() {
  clearInterval(state.sprint.timerInterval);
  el.sprintModal.style.display = 'none';
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
  el.themeToggleBtn.addEventListener('click', toggleTheme);
  el.markDoneBtn.addEventListener('click', handleCompleteCurrentTask);
  el.startSprintBtn.addEventListener('click', startSprintModal);
  el.stuckBtn.addEventListener('click', handleStuckDechunker);
  el.skipTaskBtn.addEventListener('click', handleSkipTask);

  el.peekToggleBtn.addEventListener('click', () => {
    el.peekDrawer.classList.add('open');
    refreshIcons();
  });
  el.closeDrawerBtn.addEventListener('click', () => el.peekDrawer.classList.remove('open'));
  el.shuffleTasksBtn.addEventListener('click', shufflePendingTasks);
  
  el.tabPending.addEventListener('click', () => {
    el.tabPending.classList.add('active');
    el.tabCompleted.classList.remove('active');
    el.panePending.classList.add('active');
    el.paneCompleted.classList.remove('active');
  });

  el.tabCompleted.addEventListener('click', () => {
    el.tabCompleted.classList.add('active');
    el.tabPending.classList.remove('active');
    el.paneCompleted.classList.add('active');
    el.panePending.classList.remove('active');
  });

  const openBraindump = () => { 
    resetBraindumpModal();
    el.braindumpModal.style.display = 'flex'; 
    el.braindumpInput.focus();
    refreshIcons();
  };
  el.openBraindumpBtn.addEventListener('click', openBraindump);
  el.emptyBraindumpBtn.addEventListener('click', openBraindump);
  el.closeBraindumpBtn.addEventListener('click', resetBraindumpModal);
  el.submitBraindumpBtn.addEventListener('click', handleBrainDumpSubmit);

  // Global Keyboard Shortcut: Cmd+K / Ctrl+K for Brain Dump
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openBraindump();
    }
  });

  el.closeReviewBtn.addEventListener('click', () => el.reviewModal.style.display = 'none');
  el.cancelReviewBtn.addEventListener('click', () => {
    el.reviewModal.style.display = 'none';
    el.braindumpModal.style.display = 'flex';
  });
  el.confirmTasksBtn.addEventListener('click', handleConfirmTasks);

  el.pauseSprintBtn.addEventListener('click', togglePauseSprint);
  el.extendSprintBtn.addEventListener('click', extendSprint);
  el.finishSprintDoneBtn.addEventListener('click', async () => {
    closeSprintModal();
    await handleCompleteCurrentTask();
  });
  el.exitSprintBtn.addEventListener('click', closeSprintModal);

  el.openSettingsBtn.addEventListener('click', () => {
    el.settingsModal.style.display = 'flex';
    el.testFeedback.textContent = '';
    refreshIcons();
  });
  el.closeSettingsBtn.addEventListener('click', () => el.settingsModal.style.display = 'none');

  el.testApiKeyBtn.addEventListener('click', async () => {
    const key = el.geminiApiKey.value.trim();
    if (!key) {
      el.testFeedback.className = 'test-feedback error';
      el.testFeedback.textContent = 'Please enter an API key to test.';
      return;
    }
    el.testApiKeyBtn.disabled = true;
    el.testFeedback.className = 'test-feedback';
    el.testFeedback.textContent = 'Testing connection with Gemini...';

    try {
      const res = await fetch('/api/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, model: el.geminiModelSelect.value })
      });
      const data = await res.json();
      if (data.success) {
        el.testFeedback.className = 'test-feedback success';
        el.testFeedback.textContent = '✨ Connection successful!';
      } else {
        el.testFeedback.className = 'test-feedback error';
        el.testFeedback.textContent = `❌ ${data.error || 'Connection failed'}`;
      }
    } catch (e) {
      el.testFeedback.className = 'test-feedback error';
      el.testFeedback.textContent = 'Failed to reach backend test endpoint.';
    } finally {
      el.testApiKeyBtn.disabled = false;
    }
  });

  el.saveSettingsBtn.addEventListener('click', async () => {
    const payload = {
      gemini_model: el.geminiModelSelect.value,
      onboarded: 'true'
    };
    if (el.geminiApiKey.value.trim()) {
      payload.gemini_api_key = el.geminiApiKey.value.trim();
    }
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    el.settingsModal.style.display = 'none';
    await fetchSettings();
  });

  el.clearAllTasksBtn.addEventListener('click', async () => {
    if (confirm('Clear all pending and completed tasks? This cannot be undone.')) {
      await fetch('/api/tasks', { method: 'DELETE' });
      el.settingsModal.style.display = 'none';
      await loadTasks();
    }
  });

  el.finishOnboardingBtn.addEventListener('click', async () => {
    const key = el.onboardingApiKey.value.trim();
    const payload = { onboarded: 'true' };
    if (key) payload.gemini_api_key = key;

    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    el.onboardingModal.style.display = 'none';
    await fetchSettings();
  });
}

// Initial Boot
window.addEventListener('DOMContentLoaded', async () => {
  setupListeners();
  await fetchSettings();
  await loadTasks();
  refreshIcons();
});
