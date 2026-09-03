/**
 * Notion Student Motivation Dashboard Widget
 * Connected to Live Notion Cloudflare Worker Backend
 */

const WORKER_API_BASE = "https://notion-worker.q936677.workers.dev/api/student-dashboard";
const CIRCUMFERENCE = 175.93; // 2 * PI * 28

// State definition
const state = {
  name: "조재환",
  streak: 0,
  hwStreak: 0,
  reward: 0,
  targetReward: 5000,
  tasks: [],
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

  
  // 혹시 노션 임베드 캐시로 남아있는 톱니바퀴/모달 DOM 강제 즉시 삭제
  const lingeringGear = document.getElementById("openSettingsBtn");
  if (lingeringGear) lingeringGear.remove();
  const lingeringModal = document.getElementById("settingsModal");
  if (lingeringModal) lingeringModal.remove();

  // 1. Initial local render
  parseUrlParams();
  renderDashboard();

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
    state.isLoading = true;
    // Simple GET request with timestamp _t for zero-cache & guaranteed CORS safety
    const res = await fetch(`${WORKER_API_BASE}?name=${encodeURIComponent(studentName)}&_t=${Date.now()}`);
    const json = await res.json();

    if (json.success && json.data) {
      const live = json.data;
      state.name = live.name;
      state.streak = live.streak;
      state.hwStreak = live.hwStreak || 0;
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

      // URL 파라미터 오버라이드 지원
      if (urlParams.has("reward")) state.reward = parseInt(urlParams.get("reward"), 10) || state.reward;
      if (urlParams.has("target")) state.targetReward = parseInt(urlParams.get("target"), 10) || state.targetReward;
      if (urlParams.has("streak")) state.streak = parseInt(urlParams.get("streak"), 10) || state.streak;
      if (urlParams.has("hwStreak")) state.hwStreak = parseInt(urlParams.get("hwStreak"), 10) || state.hwStreak;
      if (urlParams.has("att")) state.attendance = parseInt(urlParams.get("att"), 10) || state.attendance;
      if (urlParams.has("prog")) state.progress = parseInt(urlParams.get("prog"), 10) || state.progress;
      if (urlParams.has("chapter")) state.progChapter = urlParams.get("chapter");
    } else {
      console.warn("Notion data notice:", json.error);
    }
  } catch (err) {
    console.error("Failed to connect to Notion backend:", err);
  } finally {
    state.isLoading = false;
    renderDashboard();
  }
}

/**
 * 2. Parse URL Parameters
 */
function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);

  if (params.has("name")) state.name = params.get("name");
  if (params.has("streak")) state.streak = parseInt(params.get("streak"), 10) || state.streak;
  if (params.has("hwStreak")) state.hwStreak = parseInt(params.get("hwStreak"), 10) || state.hwStreak;
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
  // Line 1: Student Name Tag & Streaks
  const studentTag = document.getElementById("studentNameTag");
  if (studentTag) {
    studentTag.textContent = `🧑‍🎓 ${state.name}`;
  }

  const pillStreak = document.getElementById("pillStreak");
  if (pillStreak) {
    pillStreak.textContent = `🔥 ${state.streak}회 연속 출석`;
  }

  const pillHwStreak = document.getElementById("pillHwStreak");
  if (pillHwStreak) {
    pillHwStreak.textContent = `📝 ${state.hwStreak}회 연속 완수`;
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

  // Row 3: Circular Ring Gauges (오늘 숙제, 출석률, 진도)
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
    updateInspectionBanner();
    return;
  }

  // 로딩 완료 후 숙제가 0개일 때
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

    // 학생 체크 클릭 이벤트 (로컬 화면에서만 토글)
    itemEl.addEventListener("click", () => {
      toggleTask(task.id);
    });

    container.appendChild(itemEl);
  });

  updateInspectionBanner();
  updateHomeworkGauge();
}

/**
 * 5. Toggle Task State (로컬 전용 토글)
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
  const banner = document.getElementById("inspectionBanner");
  const title = document.getElementById("bannerTitle");
  const sub = document.getElementById("bannerSub");
  const emoji = document.getElementById("bannerEmoji");

  // 로딩 중일 때는 배너를 완전히 숨겨서 가짜 문구 노출 방지
  if (state.isLoading) {
    banner.style.opacity = "0";
    banner.style.pointerEvents = "none";
    return;
  }

  banner.style.opacity = "1";
  banner.style.pointerEvents = "auto";

  // 1. 숙제가 없을 때
  if (state.tasks.length === 0) {
    emoji.textContent = "☕";
    title.textContent = "오늘 숙제 없음";
    title.style.color = "#a7f3d0";
    sub.innerHTML = "최근 수업에 부여된 집숙제가 없습니다.<br>편안하고 즐거운 하루 보내세요! ✨";
    sub.style.color = "#6ee7b7";
    banner.style.borderColor = "rgba(16, 185, 129, 0.4)";
    banner.style.background = "rgba(12, 36, 24, 0.85)";
    banner.style.boxShadow = "0 0 15px rgba(16, 185, 129, 0.15)";
    return;
  }

  // 2. 숙제가 있고 100% 완료했을 때
  const allDone = state.tasks.length > 0 && state.tasks.every(t => t.done);
  if (allDone) {
    emoji.textContent = "🎉";
    title.textContent = "오늘 과제 100% 완료!";
    title.style.color = "#fef08a";
    sub.innerHTML = `선생님께 검사받고 100원을 적립하세요! <span class="badge-waiting">[검사 대기중 ⏳]</span>`;
    sub.style.color = "#fde047";
    banner.style.borderColor = "#eab308";
    banner.style.background = "rgba(36, 28, 12, 0.85)";
    banner.style.boxShadow = "0 0 20px rgba(234, 179, 8, 0.25)";
  } else {
    // 3. 숙제가 있고 아직 진행 중일 때
    emoji.textContent = "📝";
    title.textContent = "오늘 과제 진행 중!";
    title.style.color = "#cbd5e1";
    sub.innerHTML = `과제를 모두 체크하면 축하 폭죽과 함께 <br>선생님 검사 대기 모드로 전환됩니다! 🪙`;
    sub.style.color = "#94a3b8";
    banner.style.borderColor = "rgba(148, 163, 184, 0.25)";
    banner.style.background = "rgba(20, 26, 40, 0.7)";
    banner.style.boxShadow = "none";
  }
}

/**
 * 7. Render Circular Ring Gauges (오늘 숙제, 출석률, 진도)
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
