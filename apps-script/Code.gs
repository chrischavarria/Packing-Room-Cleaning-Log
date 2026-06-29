const SHEET_NAME = "Packing Room Cleaning";
const TIME_ZONE = "America/Phoenix";
const SLACK_WEBHOOK_URL = "PASTE_SLACK_WEBHOOK_URL_HERE";

const TASK_COLUMNS = [
  { header: "Daily - WS1 Morning", task: "Workstation 1 morning cleaning completed" },
  { header: "Daily - WS1 Evening", task: "Workstation 1 evening cleaning completed" },
  { header: "Daily - WS2 Morning", task: "Workstation 2 morning cleaning completed" },
  { header: "Daily - WS2 Evening", task: "Workstation 2 evening cleaning completed" },
  { header: "Daily - WS3 Morning", task: "Workstation 3 morning cleaning completed" },
  { header: "Daily - WS3 Evening", task: "Workstation 3 evening cleaning completed" },
  { header: "Daily - WS4 Morning", task: "Workstation 4 morning cleaning completed" },
  { header: "Daily - WS4 Evening", task: "Workstation 4 evening cleaning completed" },
  { header: "Daily - Tables", task: "Wipe down all table tops" },
  { header: "Daily - Shelves", task: "Clean all shelves" },
  { header: "Daily - Under Tables", task: "Check under tables for caps, pumps, etc." },
  { header: "Daily - Walls", task: "Ensure walls are free of dust and cream" },
  { header: "Daily - Mop Floor", task: "Mop the floor" },
  { header: "Thu - Expired Med Check", task: "Expired medication check completed" },
  { header: "Fri - Room Inspection", task: "Full room inspection (corners, behind shelves, hard-to-reach spots)." },
  { header: "Fri - Tables/Supplies", task: "Tables are clean, buckets are filled with supplies" },
  { header: "Fri - Buildup/Residue", task: "Clean any visible buildup or residue" },
  { header: "Fri - Replace Supplies", task: "Replace any cloths, glove boxes, mop heads, or cleaning tools" },
  { header: "Fri - Passthrough/Cart", task: "Clean passthrough and cart (top and sides)" },
  { header: "Fri - Computers", task: "Computers, keyboards, wires, mouse, etc. free of residue" }
];

const HEADER_COLUMNS = [
  "Date",
  "Submitted Local Time",
  "Submitted ISO",
  "Name",
  "Initials",
  "Cleaning Period",
  "Sections Completed",
  ...TASK_COLUMNS.map((column) => column.header),
  "Notes"
];

function doPost(event) {
  const payload = JSON.parse(event.postData.contents);

  if (payload.type !== "cleaning_submission") {
    return jsonResponse({ ok: false, error: "Unknown payload type" });
  }

  appendCleaningSubmission(payload);
  appendClosedWeekendEntries(payload);
  sendSlackSubmission(payload);

  return jsonResponse({ ok: true });
}

function appendCleaningSubmission(payload) {
  const sheet = getSheet();
  ensureHeader(sheet);

  const sectionSummary = payload.sections
    .map((section) => `${section.title}: ${section.tasks.filter((task) => task.completed).length}/${section.tasks.length}`)
    .join(" | ");
  const taskLookup = payload.sections
    .flatMap((section) => section.tasks)
    .reduce((lookup, task) => {
      lookup[normalizeTask(task.task)] = task.completed;
      return lookup;
    }, {});

  sheet.appendRow([
    payload.dateKey,
    payload.submittedAtLocal,
    payload.submittedAt,
    payload.name,
    payload.initials,
    cleanPeriodLabel(payload.cleaningPeriod),
    sectionSummary,
    ...TASK_COLUMNS.map((column) => taskLookup[normalizeTask(column.task)] ? "Yes" : ""),
    payload.notes || ""
  ]);
}

function appendClosedWeekendEntries(payload) {
  if (payload.cleaningPeriod !== "evening") return;
  if (!isFridayDateKey(payload.dateKey)) return;

  const sheet = getSheet();
  ensureHeader(sheet);
  const existingDates = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();

  [1, 2].map((days) => addDaysToDateKey(payload.dateKey, days)).forEach((dateKey) => {
    if (existingDates.some((value) => matchesDateKey(value, dateKey))) return;

    sheet.appendRow([
      dateKey,
      "Closed",
      "",
      "Closed",
      "--",
      "Closed",
      "Closed - Weekend",
      ...TASK_COLUMNS.map(() => ""),
      `Automatically logged from ${payload.dateKey} Friday cleaning submission.`
    ]);
  });
}

function sendSlackSubmission(payload) {
  const periodLabel = cleanPeriodLabel(payload.cleaningPeriod);
  const sectionLines = payload.sections
    .flatMap((section) => [
      `*${section.title}*`,
      ...section.tasks.map((task) => `• ${task.completed ? "Done" : "Missing"} - ${task.task}`)
    ])
    .join("\n");

  const text = [
    `Packing Room ${periodLabel} Cleaning submitted by *${payload.name}* (${payload.initials})`,
    `Submitted: ${payload.submittedAtLocal}`,
    sectionLines,
    payload.notes ? `Notes: ${payload.notes}` : ""
  ].filter(Boolean).join("\n");

  postToSlack(text);
}

function sendPackingRoomReminder() {
  const today = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");
  if (isWeekendDateKey(today)) return;

  const sheet = getSheet();
  ensureHeader(sheet);
  const values = sheet.getDataRange().getValues();
  const submittedToday = values.slice(1).some((row) =>
    matchesDateKey(row[0], today) && normalizeTask(row[5]) === "evening"
  );

  if (!submittedToday) {
    postToSlack(`Packing Room Evening Cleaning has not been submitted for ${today}. Please complete the cleaning log.`);
  }
}

function createReminderTrigger() {
  ScriptApp.newTrigger("sendPackingRoomReminder")
    .timeBased()
    .everyDays(1)
    .atHour(17)
    .nearMinute(35)
    .inTimezone(TIME_ZONE)
    .create();
}

function postToSlack(text) {
  UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ text }),
    muteHttpExceptions: true
  });
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER_COLUMNS);
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), HEADER_COLUMNS.length);
  const currentValues = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const currentHeader = currentValues[0];
  const headerNeedsUpdate =
    currentHeader.length !== HEADER_COLUMNS.length ||
    HEADER_COLUMNS.some((header, index) => currentHeader[index] !== header);

  if (headerNeedsUpdate) {
    const columnIndexByHeader = currentHeader.reduce((lookup, header, index) => {
      if (header) lookup[header] = index;
      return lookup;
    }, {});
    const migratedRows = currentValues.slice(1).map((row) =>
      HEADER_COLUMNS.map((header) => {
        const previousIndex = columnIndexByHeader[header];
        return previousIndex === undefined ? "" : row[previousIndex];
      })
    );

    sheet.clearContents();
    sheet.getRange(1, 1, 1, HEADER_COLUMNS.length).setValues([HEADER_COLUMNS]);
    if (migratedRows.length) {
      sheet.getRange(2, 1, migratedRows.length, HEADER_COLUMNS.length).setValues(migratedRows);
    }
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeTask(task) {
  return String(task).trim().toLowerCase();
}

function cleanPeriodLabel(period) {
  return normalizeTask(period) === "evening" ? "Evening" : "Morning";
}

function isFridayDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay() === 5;
}

function isWeekendDateKey(dateKey) {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function addDaysToDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function matchesDateKey(value, dateKey) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, TIME_ZONE, "yyyy-MM-dd") === dateKey;
  }
  return String(value).trim() === dateKey;
}
