/**
 * Notion Student Motivation Dashboard Widget
 * Connected to Live Notion Cloudflare Worker Backend
 */

const WORKER_API_BASE = "https://notion-worker.q936677.workers.dev/api/student-dashboard";
const CIRCUMFERENCE = 175.93; // 2 * PI * 28

// State definition (starts clean with no mock tasks!)
const state = {
  name: "조재환",
  streak: 0,
  reward: 0,
  targetReward: 5000,
  tasks: [], // 빈 배열로 시작하여 깜빡임/가짜숙제 노출 원천 차단!
  cumulativeRate: 0,
  cumulativeDone: 0,
  cumulativeTotal: 0,
  attendance: 100,
  attDone: 0,
  attTotal: 0,
  progress: 0,
  progChapter: "수업 진도",
  isLoading: true
};

document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // 1. Initial local render
  parseUrlParams();
  renderDashboard();
  setupEvents();

  // 2. Fetch live data from Notion DB via Cloudflare Worker
  const params = new URLSearchParams(window.location.search);
  const targetName = params.get("name") ? params.get("name").trim() : "조재환";

  await fetchLiveNotionData(targetName, params);
});

/**
 * 1. Fetch live student data from Notion Cloudflare Worker
 */
async function fetchLiveNotionData(studentName, urlParams) {
  try {
    setLoadingState(true);
    // 캐시 방지 파라미터 & no-store 헤더로 실시간 데이터 보장
    const res = await fetch(`${WORKER_API_BASE}?name=${encodeURIComponent(studentName)}&_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
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

      // 최근 수업에 연결된 실제 집숙제 목록
      state.tasks = Array.isArray(live.tasks) ? live.tasks : [];

      // URL 파라미터로 명시적 오버라이드한 값이 있으면 반영
      if (urlParams.has("reward")) state.reward = parseInt(urlParams.get("reward"), 10) || state.reward;
      if (urlParams.has("target")) state.targetReward = parseInt(urlParams.get("target"), 10) || state.targetReward;
      if (urlParams.has("streak")) state.streak = parseInt(urlParams.get("streak"), 10) || state.streak;
      if (urlParams.has("att")) state.attendance = parseInt(urlParams.get("att"), 10) || state.attendance;
      if (urlParams.has("prog")) state.progress = parseInt(urlParams.get("prog"), 10) || state.progress;
      if (urlParams.has("chapter")) state.progChapter = urlParams.get("chapter");
    } else {
      console.warn("Notion data notice:", json.error);
    }
  } catch (err) {
    console.error("Failed to connect to Notion backend:", err);
  } finally {
    setLoadingState(false);
    renderDashboard();
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
}

/**
 * 3. Render Full Dashboard UI
 */
function renderDashboard() {
  // Line 1: Student Name Tag & Streak
  const studentTag = document.getElementById("studentNameTag");
  if (studentTag) {
    studentTag.textContent = `🧑‍🎓 ${state.name}`;
  }

  const pillStreak = document.getElementById("pillStreak");
  if (pillStreak) {
    pillStreak.textContent = `🔥 ${state.streak}회 연속 완수`;
  }

  // Line 2: Amounts
  const curFormatted = `₩${state.reward.toLocaleString()}`;
  const targetFormatted = `₩${state.targetReward.toLocaleString()}`;

  document.getElementById("rewardCurrentText").textContent = curFormatted;
  document.getElementById("rewardTargetText").textContent = targetFormatted;

  const rewardPct = state.targetReward > 0 
    ? Math.min(100, Math.round((state.reward / state.targetReward) * 100)) 
    : 0;
  document.getElementById("voucherBarFill").style.width = `${rewardPct}%`;
  document.getElementById("voucherPercentText").textContent = `${rewardPct}%`;

  // Row 2: Checklist & Inspection Banner
  renderChecklist();

  // Row 3: Circular Ring Gauges (숙제, 출석률, 진도)
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

  // 로딩 중이고 아직 숙제가 안 들어왔을 때
  if (state.isLoading && state.tasks.length === 0) {
    container.innerHTML = '<div class="task-loading-placeholder">오늘의 숙제를 불러오는 중입니다... ⏳</div>';
    return;
  }

  // 로딩 끝났는데 숙제가 없을 때
  if (!state.isLoading && state.tasks.length === 0) {
    container.innerHTML = '<div class="task-loading-placeholder">최근 수업에 부여된 집숙제가 없습니다 🎉</div>';
    updateInspectionBanner();
    updateHomeworkGauge();
    return;
  }

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

    // 학생 체크 클릭 이벤트 (로컬 화면에서만 토글되고 노션 DB는 건드리지 않음!)
    itemEl.addEventListener("click", () => {
      toggleTask(task.id);
    });

    container.appendChild(itemEl);
  });

  updateInspectionBanner();
  updateHomeworkGauge();
}

/**
 * 5. Toggle Task State (로컬 전용 토글 - 노션 실시간 연동 제거)
 */
function toggleTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  // 로컬 체크 상태 토글
  task.done = !task.done;
  renderChecklist();

  // 모든 과제 완료 시 축하 폭죽 효과
  const allDone = state.tasks.length > 0 && state.tasks.every(t => t.done);
  if (allDone) {
    triggerConfetti();
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
    title.textContent = "오늘 과제 100% 완료!";
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
 * 7. Render Circular Ring Gauges (숙제, 출석률, 진도)
 */
function renderGauges() {
  updateHomeworkGauge();

  // 출석률 (Attendance)
  const attOffset = CIRCUMFERENCE - (state.attendance / 100) * CIRCUMFERENCE;
  document.getElementById("ringAttFill").style.strokeDashoffset = attOffset;
  document.getElementById("attRateText").innerHTML = `${state.attendance}% (<span class="flame-badge">🔥${state.streak}회 연속</span>)`;
  document.getElementById("attDetailText").textContent = `출석 ${state.attDone}회 / 총 ${state.attTotal}회`;

  // 진도 (Progress)
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
