const SHEET_NAMES = {
  morning: "Morning Cleaning",
  evening: "Evening Cleaning"
};
const TIME_ZONE = "America/Phoenix";
const SLACK_WEBHOOK_URL = "PASTE_SLACK_WEBHOOK_URL_HERE";

const MORNING_TASK_COLUMNS = [
  { header: "Daily - WS1 Morning", task: "Workstation 1 morning cleaning completed" },
  { header: "Daily - WS2 Morning", task: "Workstation 2 morning cleaning completed" },
  { header: "Daily - WS3 Morning", task: "Workstation 3 morning cleaning completed" },
  { header: "Daily - WS4 Morning", task: "Workstation 4 morning cleaning completed" }
];

const EVENING_TASK_COLUMNS = [
  { header: "Daily - WS1 Evening", task: "Workstation 1 evening cleaning completed" },
  { header: "Daily - WS2 Evening", task: "Workstation 2 evening cleaning completed" },
  { header: "Daily - WS3 Evening", task: "Workstation 3 evening cleaning completed" },
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

const BASE_HEADER_COLUMNS = [
  "Date",
  "Submitted Local Time",
  "Submitted ISO",
  "Name",
  "Initials",
  "Sections Completed"
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
  const period = normalizePeriod(payload.cleaningPeriod);
  const taskColumns = taskColumnsForPeriod(period);
  const headerColumns = headerColumnsForPeriod(period);
  const sheet = getSheet(sheetNameForPeriod(period));
  ensureHeader(sheet, headerColumns);

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
    sectionSummary,
    ...taskColumns.map((column) => taskLookup[normalizeTask(column.task)] ? "Yes" : ""),
    payload.notes || ""
  ]);
}

function appendClosedWeekendEntries(payload) {
  if (normalizePeriod(payload.cleaningPeriod) !== "evening") return;
  if (!isFridayDateKey(payload.dateKey)) return;

  const headerColumns = headerColumnsForPeriod("evening");
  const sheet = getSheet(SHEET_NAMES.evening);
  ensureHeader(sheet, headerColumns);
  const existingDates = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();

  [1, 2].map((days) => addDaysToDateKey(payload.dateKey, days)).forEach((dateKey) => {
    if (existingDates.some((value) => matchesDateKey(value, dateKey))) return;

    sheet.appendRow([
      dateKey,
      "Closed",
      "",
      "Closed",
      "--",
      "Closed - Weekend",
      ...EVENING_TASK_COLUMNS.map(() => ""),
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

  const sheet = getSheet(SHEET_NAMES.evening);
  ensureHeader(sheet, headerColumnsForPeriod("evening"));
  const values = sheet.getDataRange().getValues();
  const submittedToday = values.slice(1).some((row) => matchesDateKey(row[0], today));

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

function getSheet(sheetName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function ensureHeader(sheet, headerColumns) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headerColumns);
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), headerColumns.length);
  const currentValues = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const currentHeader = currentValues[0];
  const headerNeedsUpdate =
    currentHeader.length !== headerColumns.length ||
    headerColumns.some((header, index) => currentHeader[index] !== header);

  if (headerNeedsUpdate) {
    const columnIndexByHeader = currentHeader.reduce((lookup, header, index) => {
      if (header) lookup[header] = index;
      return lookup;
    }, {});
    const migratedRows = currentValues.slice(1).map((row) =>
      headerColumns.map((header) => {
        const previousIndex = columnIndexByHeader[header];
        return previousIndex === undefined ? "" : row[previousIndex];
      })
    );

    sheet.clearContents();
    sheet.getRange(1, 1, 1, headerColumns.length).setValues([headerColumns]);
    if (migratedRows.length) {
      sheet.getRange(2, 1, migratedRows.length, headerColumns.length).setValues(migratedRows);
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
  return normalizePeriod(period) === "evening" ? "Evening" : "Morning";
}

function normalizePeriod(period) {
  return normalizeTask(period) === "evening" ? "evening" : "morning";
}

function sheetNameForPeriod(period) {
  return normalizePeriod(period) === "evening" ? SHEET_NAMES.evening : SHEET_NAMES.morning;
}

function taskColumnsForPeriod(period) {
  return normalizePeriod(period) === "evening" ? EVENING_TASK_COLUMNS : MORNING_TASK_COLUMNS;
}

function headerColumnsForPeriod(period) {
  return [
    ...BASE_HEADER_COLUMNS,
    ...taskColumnsForPeriod(period).map((column) => column.header),
    "Notes"
  ];
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
