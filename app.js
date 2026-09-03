/**
 * Notion Student Motivation Dashboard Widget
 * Features:
 * 1. Convenience Store 100 KRW Voucher Gauge (Weekly 7-day chart removed for clean focus)
 * 2. Dual Homework Completion Stats (Today's Tasks vs Cumulative Completion)
 * 3. Interactive In-Widget Checklist with 100% Confetti Celebration & Teacher Inspection Flow
 * 4. Attendance & Progression Rings
 * 5. Notion /embed URL Generator
 */

// Global State
const state = {
  name: "김철수",
  streak: 7,
  reward: 3400,
  targetReward: 5000,
  tasks: [
    { id: 1, text: "쎈수학 50~55p B단계 홀수번", done: true },
    { id: 2, text: "영어 단어 Day 3 (30개 암기)", done: true },
    { id: 3, text: "2단원 틀린 문제 오답노트 정리", done: true },
    { id: 4, text: "서술형 대비 기출 3문항 풀이", done: false }
  ],
  cumulativeRate: 94,
  cumulativeDone: 17,
  cumulativeTotal: 18,
  attendance: 95,
  attDone: 19,
  attTotal: 20,
  progress: 72,
  progChapter: "Chapter 8",
  theme: "auto"
};

// CIRCLE CIRCUMFERENCE (2 * Math.PI * 30 ≈ 188.5)
const CIRCLE_CIRCUMFERENCE = 188.5;

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // 2. Parse URL Params
  parseUrlParams();

  // 3. Initialize Theme
  initTheme();

  // 4. Render All UI Components
  renderDashboard();

  // 5. Setup Event Listeners
  setupEvents();

  // 6. Check if target reward reached for initial celebration
  if (state.reward >= state.targetReward) {
    setTimeout(() => {
      triggerConfetti();
    }, 600);
  }
});

/**
 * 1. Parse URL Parameters
 */
function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);

  if (params.has("name")) state.name = params.get("name");
  if (params.has("streak")) state.streak = parseInt(params.get("streak"), 10) || 0;
  if (params.has("reward")) state.reward = parseInt(params.get("reward"), 10) || 0;
  if (params.has("target")) state.targetReward = parseInt(params.get("target"), 10) || 5000;
  
  if (params.has("cRate")) state.cumulativeRate = parseInt(params.get("cRate"), 10) || 94;
  if (params.has("cDone")) state.cumulativeDone = parseInt(params.get("cDone"), 10) || 17;
  if (params.has("cTotal")) state.cumulativeTotal = parseInt(params.get("cTotal"), 10) || 18;

  if (params.has("att")) state.attendance = parseInt(params.get("att"), 10) || 0;
  if (params.has("prog")) state.progress = parseInt(params.get("prog"), 10) || 0;
  if (params.has("chapter")) state.progChapter = params.get("chapter");
  if (params.has("theme")) state.theme = params.get("theme");

  // Parse tasks list (e.g. ?tasks=쎈수학 50~55p,영어단어 Day3,오답노트)
  if (params.has("tasks")) {
    const rawTasks = params.get("tasks").split(",").map(t => t.trim()).filter(t => t.length > 0);
    if (rawTasks.length > 0) {
      // If hwDone param specified, mark that many as done
      const hwDoneCount = params.has("hwDone") ? parseInt(params.get("hwDone"), 10) : 0;
      state.tasks = rawTasks.map((txt, idx) => ({
        id: idx + 1,
        text: txt,
        done: idx < hwDoneCount
      }));
    }
  } else if (params.has("hwDone") && params.has("hwTotal")) {
    const total = parseInt(params.get("hwTotal"), 10) || 3;
    const done = parseInt(params.get("hwDone"), 10) || 0;
    state.tasks = [];
    for (let i = 1; i <= total; i++) {
      state.tasks.push({
        id: i,
        text: `오늘 과제 ${i}`,
        done: i <= done
      });
    }
  }
}

/**
 * 2. Render Main Dashboard UI
 */
function renderDashboard() {
  // Header Info
  document.getElementById("studentName").textContent = state.name;
  document.getElementById("streakCount").textContent = state.streak;

  // Render Checklist (which also updates today's homework stats and quotes)
  renderChecklist();

  // Gift Card & Rewards
  renderRewardSection();

  // Stats
  renderHomeworkStat();
  renderAttendanceStat();
  renderProgressStat();

  // Sync Settings Form Values
  syncSettingsForm();
}

/**
 * 3. Render In-Widget Interactive Checklist
 */
function renderChecklist() {
  const container = document.getElementById("checklistItems");
  if (!container) return;

  container.innerHTML = "";

  state.tasks.forEach(task => {
    const itemEl = document.createElement("div");
    itemEl.className = `task-item ${task.done ? "checked" : ""}`;
    itemEl.onclick = () => toggleTask(task.id);

    const checkbox = document.createElement("div");
    checkbox.className = "task-checkbox-custom";

    const textEl = document.createElement("span");
    textEl.className = "task-text";
    textEl.textContent = task.text;

    itemEl.appendChild(checkbox);
    itemEl.appendChild(textEl);
    container.appendChild(itemEl);
  });

  updateChecklistStatus();
}

/**
 * Toggle Task Completion
 */
function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  task.done = !task.done;
  renderChecklist();
  renderHomeworkStat();

  const doneCount = state.tasks.filter(t => t.done).length;
  const totalCount = state.tasks.length;

  if (doneCount === totalCount && totalCount > 0) {
    // 🎉 100% Self Completed! Trigger Confetti!
    triggerConfetti();
  }
}

/**
 * Update Checklist Status and Inspection Banner
 */
function updateChecklistStatus() {
  const doneCount = state.tasks.filter(t => t.done).length;
  const totalCount = state.tasks.length;
  const allDone = doneCount === totalCount && totalCount > 0;

  const badgeEl = document.getElementById("checklistStatusBadge");
  const bannerEl = document.getElementById("inspectionBanner");
  const quoteEl = document.getElementById("motivationQuote");

  if (allDone) {
    badgeEl.textContent = "자가완료 100% 🎉";
    badgeEl.className = "checklist-status-badge all-done";
    bannerEl.classList.remove("hidden");
    quoteEl.textContent = "🎉 오늘 과제 100% 자가완료! 선생님께 검사받고 100원을 챙기세요!";
  } else {
    badgeEl.textContent = `${doneCount} / ${totalCount}개 완료 (${Math.round((doneCount / (totalCount || 1)) * 100)}%)`;
    badgeEl.className = "checklist-status-badge";
    bannerEl.classList.add("hidden");
    const remain = totalCount - doneCount;
    quoteEl.textContent = `오늘 과제 ${remain}개 남음! 올클리어 후 검사받으면 100원 적립 🔥`;
  }
}

/**
 * Render Convenience Store Reward Gift Card
 */
function renderRewardSection() {
  animateCountUp("currentReward", state.reward);
  document.getElementById("targetReward").textContent = state.targetReward.toLocaleString();

  const percent = Math.min(100, Math.round((state.reward / state.targetReward) * 100));
  const fillEl = document.getElementById("rewardProgressFill");
  fillEl.style.width = `${percent}%`;

  document.getElementById("rewardPercentText").textContent = `${percent}% 달성`;

  const remain = Math.max(0, state.targetReward - state.reward);
  const remainDays = Math.ceil(remain / 100);
  const remainTextEl = document.getElementById("rewardRemainingText");

  if (remain === 0) {
    remainTextEl.textContent = "🎁 목표 금액 달성! 기프티콘 교환 가능";
    remainTextEl.style.color = "#34d399";
  } else {
    remainTextEl.textContent = `목표까지 ${remain.toLocaleString()}원 (앞으로 ${remainDays}회!)`;
    remainTextEl.style.color = "#cbd5e1";
  }
}

/**
 * Render Homework Stat (Dual: Today's Rate + Cumulative Consistency)
 */
function renderHomeworkStat() {
  const doneCount = state.tasks.filter(t => t.done).length;
  const totalCount = state.tasks.length;
  const percent = totalCount > 0 ? Math.min(100, Math.round((doneCount / totalCount) * 100)) : 0;
  
  // Percent number
  animateCountUp("hwPercent", percent);

  // Circle stroke offset
  const offset = CIRCLE_CIRCUMFERENCE - (CIRCLE_CIRCUMFERENCE * percent) / 100;
  document.getElementById("hwCircle").style.strokeDashoffset = offset;

  // Details
  document.getElementById("hwCountText").innerHTML = `<strong>${doneCount}</strong> / ${totalCount}개 완료`;
  
  // Dual Stats (Cumulative)
  document.getElementById("cumulativeHwRateText").textContent = `${state.cumulativeRate}%`;
  document.getElementById("cumulativeHwCountText").textContent = `(${state.cumulativeDone}/${state.cumulativeTotal}회)`;

  const badgeEl = document.getElementById("hwBadge");
  if (percent === 100) {
    badgeEl.textContent = "검사대기";
    badgeEl.style.background = "rgba(245, 158, 11, 0.15)";
    badgeEl.style.color = "#f59e0b";
  } else {
    badgeEl.textContent = "오늘 과제";
    badgeEl.style.background = "rgba(59, 130, 246, 0.12)";
    badgeEl.style.color = "var(--accent-primary)";
  }
}

/**
 * Render Attendance Stat
 */
function renderAttendanceStat() {
  const percent = Math.min(100, Math.max(0, state.attendance));
  animateCountUp("attPercent", percent);

  const offset = CIRCLE_CIRCUMFERENCE - (CIRCLE_CIRCUMFERENCE * percent) / 100;
  document.getElementById("attCircle").style.strokeDashoffset = offset;

  const badgeEl = document.getElementById("attBadge");
  if (percent >= 90) {
    badgeEl.textContent = "최우수";
  } else if (percent >= 80) {
    badgeEl.textContent = "우수";
  } else {
    badgeEl.textContent = "노력필요";
  }
}

/**
 * Render Goal Progress Stat
 */
function renderProgressStat() {
  const percent = Math.min(100, Math.max(0, state.progress));
  animateCountUp("progPercent", percent);

  const offset = CIRCLE_CIRCUMFERENCE - (CIRCLE_CIRCUMFERENCE * percent) / 100;
  document.getElementById("progCircle").style.strokeDashoffset = offset;

  document.getElementById("progChapterText").innerHTML = `<strong>${state.progChapter}</strong> 진행중`;
}

/**
 * Setup UI Event Listeners
 */
function setupEvents() {
  // Theme Toggle Button
  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    toggleTheme();
  });

  // Open Settings Modal
  document.getElementById("openSettingsBtn").addEventListener("click", () => {
    openSettings();
  });

  // Close Settings Modal
  document.getElementById("closeSettingsBtn").addEventListener("click", () => {
    closeSettings();
  });

  // Close Modal on Backdrop Click
  document.getElementById("settingsModal").addEventListener("click", (e) => {
    if (e.target.id === "settingsModal") {
      closeSettings();
    }
  });

  // Live Settings Input Bindings
  const inputIds = [
    "inputName", "inputStreak", "inputReward", "inputTargetReward",
    "inputCumulativeRate", "inputCumulativeDone", "inputCumulativeTotal",
    "inputAtt", "inputProgress", "inputProgChapter", "inputTasks"
  ];

  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", handleSettingsChange);
    }
  });

  // Copy Generated URL Button
  document.getElementById("copyUrlBtn").addEventListener("click", () => {
    copyGeneratedUrl();
  });

  // Test Celebration Confetti Button
  document.getElementById("testCelebrateBtn").addEventListener("click", () => {
    triggerConfetti();
  });
}

/**
 * Handle Settings Modal Input Changes
 */
function handleSettingsChange() {
  state.name = document.getElementById("inputName").value || "김철수";
  state.streak = parseInt(document.getElementById("inputStreak").value, 10) || 0;
  state.reward = parseInt(document.getElementById("inputReward").value, 10) || 0;
  state.targetReward = parseInt(document.getElementById("inputTargetReward").value, 10) || 5000;
  
  state.cumulativeRate = parseInt(document.getElementById("inputCumulativeRate").value, 10) || 0;
  state.cumulativeDone = parseInt(document.getElementById("inputCumulativeDone").value, 10) || 0;
  state.cumulativeTotal = parseInt(document.getElementById("inputCumulativeTotal").value, 10) || 1;

  state.attendance = parseInt(document.getElementById("inputAtt").value, 10) || 0;
  state.progress = parseInt(document.getElementById("inputProgress").value, 10) || 0;
  state.progChapter = document.getElementById("inputProgChapter").value || "Chapter 1";

  // Parse tasks from textarea
  const tasksText = document.getElementById("inputTasks").value.trim();
  if (tasksText) {
    const lines = tasksText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    state.tasks = lines.map((line, idx) => ({
      id: idx + 1,
      text: line,
      done: state.tasks[idx] ? state.tasks[idx].done : false
    }));
  }

  // Re-render UI Live
  renderDashboard();
  generateNotionUrl();
}

/**
 * Sync Current State to Settings Form
 */
function syncSettingsForm() {
  document.getElementById("inputName").value = state.name;
  document.getElementById("inputStreak").value = state.streak;
  document.getElementById("inputReward").value = state.reward;
  document.getElementById("inputTargetReward").value = state.targetReward;
  
  document.getElementById("inputCumulativeRate").value = state.cumulativeRate;
  document.getElementById("inputCumulativeDone").value = state.cumulativeDone;
  document.getElementById("inputCumulativeTotal").value = state.cumulativeTotal;

  document.getElementById("inputAtt").value = state.attendance;
  document.getElementById("inputProgress").value = state.progress;
  document.getElementById("inputProgChapter").value = state.progChapter;

  document.getElementById("inputTasks").value = state.tasks.map(t => t.text).join("\n");

  generateNotionUrl();
}

/**
 * Open Settings Modal
 */
function openSettings() {
  document.getElementById("settingsModal").classList.add("active");
  syncSettingsForm();
}

/**
 * Close Settings Modal
 */
function closeSettings() {
  document.getElementById("settingsModal").classList.remove("active");
}

/**
 * Generate Notion Embed URL with Parameters
 */
function generateNotionUrl() {
  const base = window.location.origin + window.location.pathname;
  const params = new URLSearchParams();

  params.set("name", state.name);
  params.set("streak", state.streak);
  params.set("reward", state.reward);
  params.set("target", state.targetReward);
  
  params.set("cRate", state.cumulativeRate);
  params.set("cDone", state.cumulativeDone);
  params.set("cTotal", state.cumulativeTotal);

  params.set("att", state.attendance);
  params.set("prog", state.progress);
  params.set("chapter", state.progChapter);

  // Encode task items as comma-separated
  const taskTexts = state.tasks.map(t => t.text).join(",");
  params.set("tasks", taskTexts);

  const doneCount = state.tasks.filter(t => t.done).length;
  params.set("hwDone", doneCount);

  const generatedUrl = `${base}?${params.toString()}`;
  document.getElementById("generatedUrlInput").value = generatedUrl;
}

/**
 * Copy Generated URL to Clipboard
 */
function copyGeneratedUrl() {
  const inputEl = document.getElementById("generatedUrlInput");
  inputEl.select();
  navigator.clipboard.writeText(inputEl.value).then(() => {
    const feedback = document.getElementById("copyFeedback");
    feedback.textContent = "✅ 복사되었습니다! 노션 페이지에 /embed로 붙여넣으세요.";
    setTimeout(() => {
      feedback.textContent = "";
    }, 3000);
  });
}

/**
 * Smooth Count-Up Animation
 */
function animateCountUp(elementId, targetValue, duration = 800) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const startValue = parseInt(el.textContent.replace(/,/g, ""), 10) || 0;
  if (startValue === targetValue) {
    el.textContent = targetValue.toLocaleString();
    return;
  }

  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOutQuad = 1 - (1 - progress) * (1 - progress);
    const current = Math.round(startValue + (targetValue - startValue) * easeOutQuad);

    el.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = targetValue.toLocaleString();
    }
  }

  requestAnimationFrame(update);
}

/**
 * Trigger Confetti Celebration
 */
function triggerConfetti() {
  if (typeof confetti === "function") {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"]
    });
  }
}

/**
 * Theme Support (Light / Dark / Auto)
 */
function initTheme() {
  const savedTheme = localStorage.getItem("notion_widget_theme") || state.theme;
  setTheme(savedTheme);
}

function setTheme(theme) {
  document.body.classList.remove("theme-light", "theme-dark", "theme-auto");
  const icon = document.getElementById("themeIcon");

  if (theme === "light") {
    document.body.classList.add("theme-light");
    if (icon) icon.setAttribute("data-lucide", "sun");
  } else if (theme === "dark") {
    document.body.classList.add("theme-dark");
    if (icon) icon.setAttribute("data-lucide", "moon");
  } else {
    document.body.classList.add("theme-auto");
    if (icon) icon.setAttribute("data-lucide", "monitor");
  }

  localStorage.setItem("notion_widget_theme", theme);
  if (window.lucide) window.lucide.createIcons();
}

function toggleTheme() {
  if (document.body.classList.contains("theme-dark")) {
    setTheme("light");
  } else if (document.body.classList.contains("theme-light")) {
    setTheme("auto");
  } else {
    setTheme("dark");
  }
}
