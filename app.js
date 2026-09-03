/**
 * Notion Student Motivation Dashboard Widget
 * Connected to Live Notion Cloudflare Worker Backend
 */

const WORKER_API_BASE = "https://notion-worker.q936677.workers.dev/api/student-dashboard";
const CIRCUMFERENCE = 175.93; // 2 * PI * 28

// State definition
const state = {
  name: "조재환",
  streak: 7,
  reward: 3400,
  targetReward: 5000,
  tasks: [
    { id: "mock-1", text: "수학 익힘책 p.45-47 풀기", done: true },
    { id: "mock-2", text: "영어 단어 50개 암기", done: true },
    { id: "mock-3", text: "과학 보고서 초안 작성", done: true },
    { id: "mock-4", text: "국어 문제집 p.32 풀기", done: false }
  ],
  cumulativeRate: 94,
  cumulativeDone: 17,
  cumulativeTotal: 18,
  attendance: 95,
  attDone: 19,
  attTotal: 20,
  progress: 72,
  progChapter: "Chapter 8",
  isLiveSync: false,
  isLoading: false
};

document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // 1. Initial local render
  parseUrlParams();
  renderDashboard();
  setupEvents();

  // 2. If student 'name' is in URL, fetch live data from Notion DB via Cloudflare Worker!
  const params = new URLSearchParams(window.location.search);
  const targetName = params.get("name") ? params.get("name").trim() : "";

  if (targetName) {
    await fetchLiveNotionData(targetName, params);
  } else {
    // If no name specified in URL, try fetching the first student '조재환' so it works out of the box!
    console.log("No ?name specified in URL, loading default student '조재환' from Notion DB...");
    await fetchLiveNotionData("조재환", params);
  }
});

/**
 * 1. Fetch live student data from Notion Cloudflare Worker
 */
async function fetchLiveNotionData(studentName, urlParams) {
  try {
    setLoadingState(true);
    const res = await fetch(`${WORKER_API_BASE}?name=${encodeURIComponent(studentName)}&_t=${Date.now()}`, { cache: "no-store" });
    const json = await res.json();

    if (json.success && json.data) {
      const live = json.data;
      state.name = live.name;
      state.streak = live.streak;
      state.attendance = live.attendance;
      state.attDone = live.attDone;
      state.attTotal = live.attTotal;
      state.progress = live.progress;
      state.progChapter = live.progChapter;
      state.cumulativeRate = live.cumulativeRate;
      state.cumulativeDone = live.cumulativeDone;
      state.cumulativeTotal = live.cumulativeTotal;
      state.targetReward = live.targetReward;
      state.reward = live.reward;
      state.isLiveSync = true;

      if (Array.isArray(live.tasks) && live.tasks.length > 0) {
        state.tasks = live.tasks;
      }

      // Allow URL overrides if explicitly provided
      if (urlParams.has("reward")) state.reward = parseInt(urlParams.get("reward"), 10) || state.reward;
      if (urlParams.has("target")) state.targetReward = parseInt(urlParams.get("target"), 10) || state.targetReward;
      if (urlParams.has("streak")) state.streak = parseInt(urlParams.get("streak"), 10) || state.streak;
      if (urlParams.has("att")) state.attendance = parseInt(urlParams.get("att"), 10) || state.attendance;
      if (urlParams.has("prog")) state.progress = parseInt(urlParams.get("prog"), 10) || state.progress;
      if (urlParams.has("chapter")) state.progChapter = urlParams.get("chapter");

      renderDashboard();
    } else {
      console.warn("Notion data notice:", json.error);
      state.isLiveSync = false;
      renderDashboard();
    }
  } catch (err) {
    console.error("Failed to connect to Notion backend:", err);
    state.isLiveSync = false;
    renderDashboard();
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(loading) {
  state.isLoading = loading;
  const gearBtn = document.getElementById("openSettingsBtn");
  if (gearBtn) {
    if (loading) {
      gearBtn.style.opacity = "0.5";
      gearBtn.style.animation = "spin 1s linear infinite";
    } else {
      gearBtn.style.opacity = "1";
      gearBtn.style.animation = "none";
    }
  }
}

/**
 * 2. Parse URL Parameters
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
      return { id: `param-${idx + 1}`, text: parts[0].trim(), done: isDone };
    });
  }
}

/**
 * 3. Render Full Dashboard UI
 */
function renderDashboard() {
  // Update Student Name Tag & Live Sync Badge
  const studentTag = document.getElementById("studentNameTag");
  if (studentTag) {
    studentTag.textContent = `🧑‍🎓 ${state.name}`;
  }

  const syncBadge = document.getElementById("syncStatusBadge");
  if (syncBadge) {
    if (state.isLiveSync) {
      syncBadge.textContent = "🟢 Notion DB 실시간 연동";
      syncBadge.className = "badge-pill pill-sync";
    } else {
      syncBadge.textContent = "⚡ 데모 모드";
      syncBadge.className = "badge-pill";
    }
  }

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
 * 4. Render Checklist with Numbered Items & 완료/미완료 tags
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
 * 5. Toggle Task State & Sync with Notion DB!
 */
async function toggleTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  // 1. Optimistic local update
  task.done = !task.done;
  renderChecklist();

  // Check celebration
  const allDone = state.tasks.length > 0 && state.tasks.every(t => t.done);
  if (allDone) {
    triggerConfetti();
  }

  // 2. Real-time Notion DB Update via Cloudflare Worker
  if (taskId && !String(taskId).startsWith("mock-") && !String(taskId).startsWith("param-")) {
    try {
      await fetch(`${WORKER_API_BASE}/toggle-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, done: task.done })
      });
      console.log(`Synced task ${taskId} with Notion DB: done = ${task.done}`);
    } catch (err) {
      console.warn("Failed to sync toggle with Notion DB:", err);
    }
  }
}

/**
 * 6. Update Banner Text & Style based on Completion
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
 * 7. Render Circular Ring Gauges
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
 * 8. Confetti Explosion
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
 * 9. Setup Events & Teacher Settings Modal
 */
function setupEvents() {
  const modal = document.getElementById("settingsModal");
  const openBtn = document.getElementById("openSettingsBtn");
  const closeBtn = document.getElementById("closeSettingsBtn");
  const copyBtn = document.getElementById("copyUrlBtn");
  const nameInput = document.getElementById("cfgName");

  openBtn.addEventListener("click", () => {
    nameInput.value = state.name;
    generateEmbedUrl();
    modal.classList.add("show");
  });

  closeBtn.addEventListener("click", () => {
    modal.classList.remove("show");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("show");
  });

  nameInput.addEventListener("input", () => {
    generateEmbedUrl();
  });

  // Student chips click handler
  const chipButtons = document.querySelectorAll(".chip-btn");
  chipButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      chipButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const student = btn.getAttribute("data-student");
      nameInput.value = student;
      generateEmbedUrl();
    });
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

function generateEmbedUrl() {
  const name = document.getElementById("cfgName").value.trim();
  const baseUrl = "https://turtle-6677.github.io/notion-widget-student/";
  const finalUrl = `${baseUrl}?name=${encodeURIComponent(name)}`;
  document.getElementById("embedUrlOutput").value = finalUrl;
}
