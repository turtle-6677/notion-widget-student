/**
 * Notion Student Motivation Dashboard Widget
 * Exact Match to User Design Mockup
 */

const CIRCUMFERENCE = 175.93; // 2 * PI * 28

// State definition
const state = {
  name: "김철수",
  streak: 7,
  reward: 3400,
  targetReward: 5000,
  tasks: [
    { id: 1, text: "수학 익힘책 p.45-47 풀기", done: true },
    { id: 2, text: "영어 단어 50개 암기", done: true },
    { id: 3, text: "과학 보고서 초안 작성", done: true },
    { id: 4, text: "국어 문제집 p.32 풀기", done: false }
  ],
  cumulativeRate: 94,
  cumulativeDone: 17,
  cumulativeTotal: 18,
  attendance: 95,
  attDone: 19,
  attTotal: 20,
  progress: 72,
  progChapter: "Chapter 8"
};

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  parseUrlParams();
  renderDashboard();
  setupEvents();
});

/**
 * 1. Parse URL Parameters
 */
function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);

  if (params.has("name")) state.name = params.get("name");
  if (params.has("streak")) state.streak = parseInt(params.get("streak"), 10) || state.streak;
  if (params.has("reward")) state.reward = parseInt(params.get("reward"), 10) || state.reward;
  if (params.has("target")) state.targetReward = parseInt(params.get("target"), 10) || state.targetReward;
  if (params.has("att")) state.attendance = parseInt(params.get("att"), 10) || state.attendance;
  if (params.has("prog")) state.progress = parseInt(params.get("prog"), 10) || state.progress;
  if (params.has("chapter")) state.progChapter = params.get("chapter");
  if (params.has("cRate")) state.cumulativeRate = parseInt(params.get("cRate"), 10) || state.cumulativeRate;

  if (params.has("tasks")) {
    const rawTasks = params.get("tasks").split(",");
    state.tasks = rawTasks.map((t, idx) => {
      const parts = t.trim().split(":");
      const isDone = parts.length > 1 ? parts[1] === "1" || parts[1] === "true" : false;
      return { id: idx + 1, text: parts[0].trim(), done: isDone };
    });
  }
}

/**
 * 2. Render Full Dashboard UI
 */
function renderDashboard() {
  // Row 1: Voucher Amounts & Progress
  const curFormatted = `₩${state.reward.toLocaleString()}`;
  const targetFormatted = `₩${state.targetReward.toLocaleString()}`;

  document.getElementById("rewardCurrentText").textContent = curFormatted;
  document.getElementById("rewardTargetText").textContent = targetFormatted;
  document.getElementById("pillCurrent").textContent = curFormatted;
  document.getElementById("pillTarget").textContent = targetFormatted;
  document.getElementById("pillStreak").textContent = `🔥 ${state.streak}회 연속 완수`;

  const rewardPct = Math.min(100, Math.round((state.reward / state.targetReward) * 100));
  document.getElementById("voucherBarFill").style.width = `${rewardPct}%`;
  document.getElementById("voucherPercentText").textContent = `${rewardPct}%`;

  // Row 2: Checklist & Inspection Banner
  renderChecklist();

  // Row 3: Circular Ring Gauges
  renderGauges();

  // Update Lucide Icons
  if (window.lucide) {
    lucide.createIcons();
  }
}

/**
 * 3. Render Checklist with Numbered Items & 완료/미완료 tags
 */
function renderChecklist() {
  const container = document.getElementById("taskList");
  container.innerHTML = "";

  state.tasks.forEach((task, index) => {
    const itemEl = document.createElement("div");
    itemEl.className = `task-item ${task.done ? "is-done" : ""}`;

    const num = index + 1;
    const statusText = task.done ? "(완료)" : "(미완료)";
    const statusClass = task.done ? "done" : "pending";

    itemEl.innerHTML = `
      <div class="task-checkbox ${task.done ? "checked" : "unchecked"}">
        ${task.done ? '<i data-lucide="check"></i>' : ""}
      </div>
      <span class="task-label">
        ${num}. ${task.text}
        <span class="status-tag ${statusClass}">${statusText}</span>
      </span>
    `;

    itemEl.addEventListener("click", () => {
      toggleTask(task.id);
    });

    container.appendChild(itemEl);
  });

  updateInspectionBanner();
  updateHomeworkGauge();
}

/**
 * 4. Toggle Task State
 */
function toggleTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.done = !task.done;
  renderChecklist();

  // Check if all tasks are done
  const allDone = state.tasks.length > 0 && state.tasks.every(t => t.done);
  if (allDone) {
    triggerConfetti();
  }
}

/**
 * 5. Update Banner Text & Style based on Completion
 */
function updateInspectionBanner() {
  const allDone = state.tasks.length > 0 && state.tasks.every(t => t.done);
  const banner = document.getElementById("inspectionBanner");
  const title = document.getElementById("bannerTitle");
  const sub = document.getElementById("bannerSub");
  const emoji = document.getElementById("bannerEmoji");

  if (allDone) {
    emoji.textContent = "🎉";
    title.textContent = "오늘 과제 100% 자가완료!";
    sub.innerHTML = `선생님께 검사받고 100원을 적립하세요! <span class="badge-waiting">[검사 대기중 ⏳]</span>`;
    banner.style.borderColor = "#eab308";
    banner.style.background = "rgba(36, 28, 12, 0.85)";
  } else {
    emoji.textContent = "📝";
    title.textContent = "오늘 과제 진행 중!";
    sub.innerHTML = `과제를 모두 체크하면 축하 폭죽과 함께 <br>선생님 검사 대기 모드로 전환됩니다! 🪙`;
    banner.style.borderColor = "rgba(234, 179, 8, 0.4)";
    banner.style.background = "rgba(20, 26, 40, 0.7)";
  }
}

/**
 * 6. Render Circular Ring Gauges
 */
function renderGauges() {
  updateHomeworkGauge();

  // Attendance
  const attOffset = CIRCUMFERENCE - (state.attendance / 100) * CIRCUMFERENCE;
  document.getElementById("ringAttFill").style.strokeDashoffset = attOffset;
  document.getElementById("attRateText").innerHTML = `${state.attendance}% (<span class="flame-badge">🔥${state.streak}회 연속</span>)`;
  document.getElementById("attDetailText").textContent = `출석 ${state.attDone}회 / 총 ${state.attTotal}회`;

  // Progress
  const progOffset = CIRCUMFERENCE - (state.progress / 100) * CIRCUMFERENCE;
  document.getElementById("ringProgFill").style.strokeDashoffset = progOffset;
  document.getElementById("progRateText").innerHTML = `${state.progress}% (<span id="progChapterText">${state.progChapter}</span>)`;
}

function updateHomeworkGauge() {
  const doneCount = state.tasks.filter(t => t.done).length;
  const totalCount = state.tasks.length;
  const todayRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const hwOffset = CIRCUMFERENCE - (todayRate / 100) * CIRCUMFERENCE;
  document.getElementById("ringHwFill").style.strokeDashoffset = hwOffset;

  document.getElementById("hwTodayRateText").textContent = `오늘 ${todayRate}% 완료 /`;
  document.getElementById("hwCumulativeText").textContent = `누적 성실도 ${state.cumulativeRate}% (${state.cumulativeDone}/${state.cumulativeTotal}회)`;
}

/**
 * 7. Confetti Explosion
 */
function triggerConfetti() {
  if (typeof confetti === "function") {
    confetti({
      particleCount: 75,
      spread: 70,
      origin: { y: 0.65 },
      colors: ['#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#facc15']
    });
  }
}

/**
 * 8. Setup Events & Teacher Settings Modal
 */
function setupEvents() {
  const modal = document.getElementById("settingsModal");
  const openBtn = document.getElementById("openSettingsBtn");
  const closeBtn = document.getElementById("closeSettingsBtn");
  const copyBtn = document.getElementById("copyUrlBtn");

  openBtn.addEventListener("click", () => {
    populateModal();
    generateEmbedUrl();
    modal.classList.add("show");
  });

  closeBtn.addEventListener("click", () => {
    modal.classList.remove("show");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("show");
  });

  const inputs = modal.querySelectorAll("input");
  inputs.forEach(input => {
    input.addEventListener("input", generateEmbedUrl);
  });

  copyBtn.addEventListener("click", () => {
    const urlInput = document.getElementById("embedUrlOutput");
    urlInput.select();
    navigator.clipboard.writeText(urlInput.value).then(() => {
      copyBtn.innerHTML = '<i data-lucide="check"></i> 복사 완료!';
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        copyBtn.innerHTML = '<i data-lucide="copy"></i> URL 복사';
        if (window.lucide) lucide.createIcons();
      }, 2000);
    });
  });
}

function populateModal() {
  document.getElementById("cfgName").value = state.name;
  document.getElementById("cfgStreak").value = state.streak;
  document.getElementById("cfgReward").value = state.reward;
  document.getElementById("cfgTarget").value = state.targetReward;
  document.getElementById("cfgAtt").value = state.attendance;
  document.getElementById("cfgProg").value = state.progress;
  document.getElementById("cfgChapter").value = state.progChapter;
  document.getElementById("cfgCRate").value = state.cumulativeRate;

  const taskStr = state.tasks.map(t => `${t.text}:${t.done ? 1 : 0}`).join(", ");
  document.getElementById("cfgTasks").value = taskStr;
}

function generateEmbedUrl() {
  const name = document.getElementById("cfgName").value.trim();
  const streak = document.getElementById("cfgStreak").value.trim();
  const reward = document.getElementById("cfgReward").value.trim();
  const target = document.getElementById("cfgTarget").value.trim();
  const att = document.getElementById("cfgAtt").value.trim();
  const prog = document.getElementById("cfgProg").value.trim();
  const chapter = document.getElementById("cfgChapter").value.trim();
  const cRate = document.getElementById("cfgCRate").value.trim();
  const tasks = document.getElementById("cfgTasks").value.trim();

  const baseUrl = window.location.origin + window.location.pathname;
  const params = new URLSearchParams();

  if (name) params.set("name", name);
  if (streak) params.set("streak", streak);
  if (reward) params.set("reward", reward);
  if (target) params.set("target", target);
  if (att) params.set("att", att);
  if (prog) params.set("prog", prog);
  if (chapter) params.set("chapter", chapter);
  if (cRate) params.set("cRate", cRate);
  if (tasks) params.set("tasks", tasks);

  const finalUrl = `${baseUrl}?${params.toString()}`;
  document.getElementById("embedUrlOutput").value = finalUrl;
}
