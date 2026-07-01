const STORAGE_KEY = "packing-room-cleaning-submissions";
const TIME_ZONE = "America/Phoenix";
const DEFAULT_CUTOFF = "17:35";
let activePeriod = "morning";

const morningTasks = [
  "Workstation 1 morning cleaning completed",
  "Workstation 2 morning cleaning completed",
  "Workstation 3 morning cleaning completed",
  "Workstation 4 morning cleaning completed"
];

const eveningTasks = [
  "Workstation 1 evening cleaning completed",
  "Workstation 2 evening cleaning completed",
  "Workstation 3 evening cleaning completed",
  "Workstation 4 evening cleaning completed",
  "Emulsion packing machine #1 is clean",
  "Emulsion packing machine #2 is clean",
  "Repeater Pump Machine is clean",
  "Wipe down all table tops",
  "Clean all shelves",
  "Check under tables for caps, pumps, etc.",
  "Ensure walls are free of dust and cream",
  "Mop the floor"
];

const expiredTasks = ["Expired medication check completed"];

const weeklyTasks = [
  "Full room inspection (corners, behind shelves, hard-to-reach spots).",
  "Tables are clean, buckets are filled with supplies",
  "Clean any visible buildup or residue",
  "Replace any cloths, glove boxes, mop heads, or cleaning tools",
  "Clean passthrough and cart (top and sides)",
  "Computers, keyboards, wires, mouse, etc. free of residue"
];

const monthlyTasks = [
  "Windows cleaned",
  "Empty totes cleaned",
  "Adhesive/stickers are removed from floors or surfaces"
];

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  renderTasks();
  wireEvents();
  updateIntegrationStatus();
  updateTime();
  renderDaySections();
  renderHistory();
  updateCompletionSummary();
  window.setInterval(updateTime, 1000);
}

function cacheElements() {
  Object.assign(els, {
    form: document.querySelector("#cleaning-log-form"),
    employeeName: document.querySelector("#employee-name"),
    employeeInitials: document.querySelector("#employee-initials"),
    submissionTime: document.querySelector("#submission-time"),
    notes: document.querySelector("#notes"),
    todayLabel: document.querySelector("#today-label"),
    clockLabel: document.querySelector("#clock-label"),
    dayChip: document.querySelector("#day-chip"),
    dailySection: document.querySelector("[data-section='Daily Cleaning']"),
    dailySectionTitle: document.querySelector("#daily-section-title"),
    dailyTasks: document.querySelector("#daily-tasks"),
    expiredTasks: document.querySelector("#expired-tasks"),
    weeklyTasks: document.querySelector("#weekly-tasks"),
    monthlyTasks: document.querySelector("#monthly-tasks"),
    expiredSection: document.querySelector("#expired-section"),
    weeklySection: document.querySelector("#weekly-section"),
    monthlySection: document.querySelector("#monthly-section"),
    dailyCount: document.querySelector("#daily-count"),
    expiredCount: document.querySelector("#expired-count"),
    weeklyCount: document.querySelector("#weekly-count"),
    monthlyCount: document.querySelector("#monthly-count"),
    visibleSectionCount: document.querySelector("#visible-section-count"),
    completedCount: document.querySelector("#completed-count"),
    reminderLabel: document.querySelector("#reminder-label"),
    submissionTitle: document.querySelector("#submission-title"),
    submissionDetail: document.querySelector("#submission-detail"),
    statusDot: document.querySelector("#status-dot"),
    formMessage: document.querySelector("#form-message"),
    historyList: document.querySelector("#history-list"),
    clearHistory: document.querySelector("#clear-local-history"),
    periodTabs: document.querySelectorAll(".period-tab"),
    submitButton: document.querySelector("#submit-button"),
    integrationDot: document.querySelector("#integration-dot"),
    integrationTitle: document.querySelector("#integration-title"),
    integrationDetail: document.querySelector("#integration-detail")
  });
}

function wireEvents() {
  els.form.addEventListener("submit", handleSubmit);
  els.form.addEventListener("change", updateCompletionSummary);
  els.employeeName.addEventListener("input", suggestInitials);
  els.clearHistory.addEventListener("click", clearLocalHistory);
  els.periodTabs.forEach((tab) => tab.addEventListener("click", handlePeriodTabClick));
}

function renderTasks() {
  const tasks = activePeriod === "morning" ? morningTasks : eveningTasks;
  els.dailyTasks.innerHTML = taskMarkup(activePeriod, tasks);
  els.expiredTasks.innerHTML = taskMarkup("expired", expiredTasks);
  els.weeklyTasks.innerHTML = taskMarkup("weekly", weeklyTasks);
  els.monthlyTasks.innerHTML = taskMarkup("monthly", monthlyTasks);
}

function taskMarkup(prefix, tasks) {
  return tasks
    .map((task, index) => {
      const id = `${prefix}-task-${index}`;
      return `
        <label class="task-item" for="${id}">
          <input id="${id}" type="checkbox" data-task="${escapeHtml(task)}" required />
          <span>${escapeHtml(task)}</span>
        </label>
      `;
    })
    .join("");
}

function updateTime() {
  const now = new Date();
  els.todayLabel.textContent = formatDate(now);
  els.clockLabel.textContent = formatTime(now);
  els.submissionTime.textContent = `${formatDate(now)} ${formatTime(now)}`;
  els.reminderLabel.textContent = cutoffDisplay();
  updateSubmissionStatus();
}

function renderDaySections() {
  const day = Number(formatParts(new Date()).weekdayNumber);
  const isThursday = day === 4;
  const isFriday = day === 5;
  const isMonthlyFriday = isLastFriday(new Date());
  const isEvening = activePeriod === "evening";
  els.dailySection.dataset.section = isEvening ? "Evening Cleaning" : "Morning Cleaning";
  els.dailySectionTitle.textContent = isEvening ? "Evening Cleaning" : "Morning Cleaning";
  els.submitButton.textContent = `Submit ${activePeriod} cleaning log`;
  els.expiredSection.hidden = !isEvening || !isThursday;
  els.weeklySection.hidden = !isEvening || !isFriday;
  els.monthlySection.hidden = !isEvening || !isMonthlyFriday;

  els.expiredSection.querySelectorAll("input").forEach((input) => {
    input.required = isEvening && isThursday;
    input.disabled = !isEvening || !isThursday;
  });
  els.weeklySection.querySelectorAll("input").forEach((input) => {
    input.required = isEvening && isFriday;
    input.disabled = !isEvening || !isFriday;
  });
  els.monthlySection.querySelectorAll("input").forEach((input) => {
    input.required = isEvening && isMonthlyFriday;
    input.disabled = !isEvening || !isMonthlyFriday;
  });

  const labels = [isEvening ? "Evening" : "Morning"];
  if (isEvening && isThursday) labels.push("Expired check");
  if (isEvening && isFriday) labels.push("Deep clean");
  if (isEvening && isMonthlyFriday) labels.push("Monthly");
  els.dayChip.textContent = labels.join(" + ");
  updateCompletionSummary();
}

function handlePeriodTabClick(event) {
  activePeriod = event.currentTarget.dataset.period;
  els.periodTabs.forEach((tab) => {
    const selected = tab.dataset.period === activePeriod;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  renderTasks();
  renderDaySections();
  clearMessage();
}

async function handleSubmit(event) {
  event.preventDefault();
  clearMessage();

  if (!els.form.checkValidity()) {
    els.form.reportValidity();
    showMessage("Check every item before submitting.", "error");
    return;
  }

  const payload = buildPayload();
  const config = window.PACKING_ROOM_CONFIG || {};

  try {
    if (config.appScriptUrl) {
      await postJson(config.appScriptUrl, payload);
    }

    if (!config.appScriptUrl && config.slackWebhookUrl) {
      await postSlackWebhook(config.slackWebhookUrl, payload);
    }

    saveSubmission(payload);
    showMessage("Cleaning log submitted.", "success");
    els.form.reset();
    updateTime();
    renderDaySections();
    renderHistory();
    updateCompletionSummary();
  } catch (error) {
    showMessage(`Submission failed: ${error.message}`, "error");
  }
}

function buildPayload() {
  const now = new Date();
  const sections = visibleSections().map((section) => {
    const title = section.dataset.section;
    const tasks = Array.from(section.querySelectorAll("[data-task]")).map((input) => ({
      task: input.dataset.task,
      completed: input.checked
    }));
    return { title, tasks };
  });

  return {
    type: "cleaning_submission",
    name: els.employeeName.value.trim(),
    initials: els.employeeInitials.value.trim().toUpperCase(),
    cleaningPeriod: activePeriod,
    submittedAt: now.toISOString(),
    submittedAtLocal: `${formatDate(now)} ${formatTime(now)}`,
    dateKey: localDateKey(now),
    timezone: TIME_ZONE,
    sections,
    notes: els.notes.value.trim()
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  return response;
}

async function postSlackWebhook(url, payload) {
  const lines = payload.sections.flatMap((section) => [
    `*${section.title}*`,
    ...section.tasks.map((task) => `• ${task.completed ? "Done" : "Missing"} - ${task.task}`)
  ]);
  const periodLabel = payload.cleaningPeriod === "evening" ? "Evening" : "Morning";
  await postJson(url, {
    text: `Packing Room ${periodLabel} Cleaning submitted by ${payload.name} (${payload.initials}) at ${payload.submittedAtLocal}\n${lines.join("\n")}`
  });
}

function visibleSections() {
  return Array.from(document.querySelectorAll(".task-section")).filter((section) => !section.hidden);
}

function updateCompletionSummary() {
  const visible = visibleSections();
  const boxes = visible.flatMap((section) => Array.from(section.querySelectorAll("[data-task]")));
  const checked = boxes.filter((box) => box.checked).length;
  els.visibleSectionCount.textContent = String(visible.length);
  els.completedCount.textContent = `${checked}/${boxes.length}`;
  updateSectionCount(els.dailyTasks, els.dailyCount);
  updateSectionCount(els.expiredTasks, els.expiredCount);
  updateSectionCount(els.weeklyTasks, els.weeklyCount);
  updateSectionCount(els.monthlyTasks, els.monthlyCount);
}

function updateSectionCount(listEl, countEl) {
  if (!listEl || !countEl) return;
  const boxes = Array.from(listEl.querySelectorAll("[data-task]"));
  const checked = boxes.filter((box) => box.checked).length;
  countEl.textContent = `${checked}/${boxes.length}`;
}

function updateSubmissionStatus() {
  const todayRecords = submissions().filter((item) => item.dateKey === localDateKey(new Date()));
  const eveningRecord = todayRecords.find((item) => item.cleaningPeriod === "evening");
  const morningRecord = todayRecords.find((item) => item.cleaningPeriod === "morning");

  if (eveningRecord) {
    els.submissionTitle.textContent = "Evening submitted today";
    els.submissionDetail.textContent = `${eveningRecord.name} submitted at ${eveningRecord.submittedAtLocal}.`;
    els.statusDot.style.background = "#157054";
    return;
  }

  if (morningRecord) {
    els.submissionTitle.textContent = "Morning submitted today";
    els.submissionDetail.textContent = `Evening cleaning is still due by ${cutoffDisplay()} Arizona time.`;
    els.statusDot.style.background = "#c2871f";
    return;
  }

  const now = new Date();
  const cutoff = cutoffDate(now);
  const isPastDue = now > cutoff;
  els.submissionTitle.textContent = isPastDue ? "Past due" : "Not submitted yet";
  els.submissionDetail.textContent = isPastDue
    ? `Daily cleaning was due by ${cutoffDisplay()} Arizona time.`
    : `Daily cleaning is due by ${cutoffDisplay()} Arizona time.`;
  els.statusDot.style.background = isPastDue ? "#b42318" : "#c2871f";
}

function renderHistory() {
  const items = submissions().slice(0, 8);
  if (!items.length) {
    els.historyList.innerHTML = `<div class="empty-state">No local submissions yet.</div>`;
    return;
  }

  els.historyList.innerHTML = items
    .map((item) => {
      const sectionNames = item.sections.map((section) => section.title || section).join(", ");
      return `
        <article class="history-item">
          <div>
            <strong>${escapeHtml(item.name)} (${escapeHtml(item.initials)})</strong>
            <span class="meta">${escapeHtml(item.submittedAtLocal)} · ${escapeHtml(sectionNames)}</span>
          </div>
          <span class="date">${escapeHtml(item.dateKey)}</span>
        </article>
      `;
    })
    .join("");
}

function saveSubmission(payload) {
  const next = [payload, ...submissions()].slice(0, 40);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function submissions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function clearLocalHistory() {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
  updateSubmissionStatus();
}

function suggestInitials() {
  if (els.employeeInitials.value.trim()) return;
  els.employeeInitials.value = els.employeeName.value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function updateIntegrationStatus() {
  const config = window.PACKING_ROOM_CONFIG || {};
  if (config.appScriptUrl) {
    els.integrationDot.classList.add("live");
    els.integrationTitle.textContent = "Apps Script connected";
    els.integrationDetail.textContent = "Submissions post to Google Sheets and Slack.";
  } else if (config.slackWebhookUrl) {
    els.integrationDot.classList.add("live");
    els.integrationTitle.textContent = "Slack direct mode";
    els.integrationDetail.textContent = "Add an Apps Script URL to log to Sheets.";
  }
}

function cutoffDate(date) {
  const [hour, minute] = (window.PACKING_ROOM_CONFIG?.reminderCutoff || DEFAULT_CUTOFF).split(":").map(Number);
  const cutoff = new Date(date);
  cutoff.setHours(hour, minute, 0, 0);
  return cutoff;
}

function cutoffDisplay() {
  return cutoffDate(new Date()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function localDateKey(date) {
  const parts = formatParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatParts(date) {
  const values = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  })
    .formatToParts(date)
    .forEach((part) => {
      if (part.type !== "literal") values[part.type] = part.value;
    });
  values.weekdayNumber = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[values.weekday];
  return values;
}

function isLastFriday(date) {
  const parts = formatParts(date);
  if (parts.weekdayNumber !== 5) return false;

  const nextWeek = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  return formatParts(nextWeek).month !== parts.month;
}

function showMessage(message, type) {
  els.formMessage.textContent = message;
  els.formMessage.className = type;
}

function clearMessage() {
  els.formMessage.textContent = "";
  els.formMessage.className = "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
