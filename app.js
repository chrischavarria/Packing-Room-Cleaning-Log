const STORAGE_KEY = "packing-room-cleaning-submissions";
const TIME_ZONE = "America/Phoenix";

const dailyTasks = [
  "Wipe down all table tops",
  "Clean all shelves",
  "Check under tables for caps, pumps, etc.",
  "Ensure walls are free of dust and cream",
  "Mop the floor"
];

const expiredTasks = [
  "Expired medication check completed"
];

const weeklyTasks = [
  "Full room inspection (corners, behind shelves, hard-to-reach spots).",
  "Tables are clean, buckets are filled with supplies",
  "Clean any visible buildup or residue",
  "Replace any cloths, glove boxes, mop heads, or cleaning tools",
  "Clean passthrough and cart (top and sides)",
  "Computers, keyboards, wires, mouse, etc. free of residue"
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
    dailyTasks: document.querySelector("#daily-tasks"),
    expiredTasks: document.querySelector("#expired-tasks"),
    weeklyTasks: document.querySelector("#weekly-tasks"),
    expiredSection: document.querySelector("#expired-section"),
    weeklySection: document.querySelector("#weekly-section"),
    visibleSectionCount: document.querySelector("#visible-section-count"),
    completedCount: document.querySelector("#completed-count"),
    reminderLabel: document.querySelector("#reminder-label"),
    submissionTitle: document.querySelector("#submission-title"),
    submissionDetail: document.querySelector("#submission-detail"),
    formMessage: document.querySelector("#form-message"),
    historyList: document.querySelector("#history-list"),
    clearHistory: document.querySelector("#clear-local-history"),
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
}

function renderTasks() {
  els.dailyTasks.innerHTML = taskMarkup("daily", dailyTasks);
  els.expiredTasks.innerHTML = taskMarkup("expired", expiredTasks);
  els.weeklyTasks.innerHTML = taskMarkup("weekly", weeklyTasks);
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
  els.submissionTime.value = `${formatDate(now)} ${formatTime(now)}`;
  els.reminderLabel.textContent = cutoffDisplay();
  updateSubmissionStatus();
}

function renderDaySections() {
  const day = Number(formatParts(new Date()).weekdayNumber);
  const isThursday = day === 4;
  const isFriday = day === 5;
  els.expiredSection.hidden = !isThursday;
  els.weeklySection.hidden = !isFriday;

  els.expiredSection.querySelectorAll("input").forEach((input) => {
    input.required = isThursday;
    input.disabled = !isThursday;
  });
  els.weeklySection.querySelectorAll("input").forEach((input) => {
    input.required = isFriday;
    input.disabled = !isFriday;
  });

  const labels = ["Daily"];
  if (isThursday) labels.push("Expired check");
  if (isFriday) labels.push("Deep clean");
  els.dayChip.textContent = labels.join(" + ");
  updateCompletionSummary();
}

async function handleSubmit(event) {
  event.preventDefault();
  clearMessage();

  if (!els.form.checkValidity()) {
    els.form.reportValidity();
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
  await postJson(url, {
    text: `Packing Room Cleaning submitted by ${payload.name} (${payload.initials}) at ${payload.submittedAtLocal}\n${lines.join("\n")}`
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
}

function updateSubmissionStatus() {
  const todayRecord = submissions().find((item) => item.dateKey === localDateKey(new Date()));
  if (todayRecord) {
    els.submissionTitle.textContent = "Submitted today";
    els.submissionDetail.textContent = `${todayRecord.name} submitted at ${todayRecord.submittedAtLocal}.`;
    return;
  }

  const now = new Date();
  const cutoff = cutoffDate(now);
  const isPastDue = now > cutoff;
  els.submissionTitle.textContent = isPastDue ? "Past due today" : "Not submitted today";
  els.submissionDetail.textContent = isPastDue
    ? "Slack reminder should fire from Apps Script if the sheet has no submission."
    : `Daily cleaning is due by ${cutoffDisplay()} Arizona time.`;
}

function renderHistory() {
  const items = submissions().slice(0, 8);
  if (!items.length) {
    els.historyList.innerHTML = `<div class="empty-state">No local submissions yet.</div>`;
    return;
  }

  els.historyList.innerHTML = items
    .map((item) => {
      const sectionNames = item.sections.map((section) => section.title).join(", ");
      return `
        <article class="history-item">
          <div>
            <strong>${escapeHtml(item.name)} (${escapeHtml(item.initials)})</strong>
            <span>${escapeHtml(item.submittedAtLocal)} · ${escapeHtml(sectionNames)}</span>
          </div>
          <span>${escapeHtml(item.dateKey)}</span>
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
  const initials = els.employeeName.value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
  els.employeeInitials.value = initials;
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
    els.integrationDetail.textContent = "Add Apps Script URL to log to Sheets.";
  }
}

function cutoffDate(date) {
  const [hour, minute] = (window.PACKING_ROOM_CONFIG?.reminderCutoff || "17:15").split(":").map(Number);
  const cutoff = new Date(date);
  cutoff.setHours(hour, minute, 0, 0);
  return cutoff;
}

function cutoffDisplay() {
  return cutoffDate(new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
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
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== "literal") values[part.type] = part.value;
  });
  const weekdayNumber = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[values.weekday];
  return { ...values, weekdayNumber };
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
