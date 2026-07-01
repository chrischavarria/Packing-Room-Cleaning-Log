const SHEET_NAMES = {
  morning: "Morning Cleaning",
  evening: "Evening Cleaning"
};
const LEGACY_SHEET_NAME = "Packing Room Cleaning";
const TIME_ZONE = "America/Phoenix";
const SLACK_WEBHOOK_URL = "PASTE_SLACK_WEBHOOK_URL_HERE";
const ARCHIVE_FOLDER_ID = "";

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
  { header: "Daily - Emulsion Machine #1", task: "Emulsion packing machine #1 is clean" },
  { header: "Daily - Emulsion Machine #2", task: "Emulsion packing machine #2 is clean" },
  { header: "Daily - Repeater Pump", task: "Repeater Pump Machine is clean" },
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
  { header: "Fri - Computers", task: "Computers, keyboards, wires, mouse, etc. free of residue" },
  { header: "Monthly - Windows", task: "Windows cleaned" },
  { header: "Monthly - Empty Totes", task: "Empty totes cleaned" },
  { header: "Monthly - Adhesive/Stickers", task: "Adhesive/stickers are removed from floors or surfaces" }
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

function archivePreviousMonthCleaningLogs() {
  const archiveWindow = previousMonthWindow(new Date());
  const archiveName = `Packing Room Cleaning Log - ${archiveWindow.label}`;
  const archiveSpreadsheet = SpreadsheetApp.create(archiveName);
  const archiveSummary = [
    archiveSheetRows(SHEET_NAMES.morning, "morning", archiveSpreadsheet, archiveWindow),
    archiveSheetRows(SHEET_NAMES.evening, "evening", archiveSpreadsheet, archiveWindow),
    archiveLegacySheetRows(archiveSpreadsheet, archiveWindow)
  ];

  removeDefaultArchiveSheet(archiveSpreadsheet);
  const folderMoveResult = moveArchiveToFolder(archiveSpreadsheet);

  const archivedRows = archiveSummary.reduce((total, item) => total + item.count, 0);
  if (archivedRows === 0) {
    DriveApp.getFileById(archiveSpreadsheet.getId()).setTrashed(true);
    postToSlack(`Packing Room Cleaning monthly archive ran for ${archiveWindow.label}. No rows were found to archive.`);
    return;
  }

  postToSlack(`Packing Room Cleaning monthly archive created for ${archiveWindow.label}: ${archiveSpreadsheet.getUrl()}${folderMoveResult.message}`);
}

function createMonthlyArchiveTrigger() {
  ScriptApp.newTrigger("archivePreviousMonthCleaningLogs")
    .timeBased()
    .onMonthDay(1)
    .atHour(1)
    .nearMinute(10)
    .inTimezone(TIME_ZONE)
    .create();
}

function archiveAllCompletedMonths() {
  const monthWindows = completedMonthWindows(new Date());
  const summary = monthWindows.map((archiveWindow) => {
    const archiveName = `Packing Room Cleaning Log - ${archiveWindow.label}`;
    const archiveSpreadsheet = SpreadsheetApp.create(archiveName);
    const archiveSummary = [
      archiveSheetRows(SHEET_NAMES.morning, "morning", archiveSpreadsheet, archiveWindow),
      archiveSheetRows(SHEET_NAMES.evening, "evening", archiveSpreadsheet, archiveWindow),
      archiveLegacySheetRows(archiveSpreadsheet, archiveWindow)
    ];
    const archivedRows = archiveSummary.reduce((total, item) => total + item.count, 0);

    removeDefaultArchiveSheet(archiveSpreadsheet);
    const folderMoveResult = moveArchiveToFolder(archiveSpreadsheet);

    if (archivedRows === 0) {
      DriveApp.getFileById(archiveSpreadsheet.getId()).setTrashed(true);
      return `${archiveWindow.label}: 0 rows`;
    }

    return `${archiveWindow.label}: ${archivedRows} rows - ${archiveSpreadsheet.getUrl()}${folderMoveResult.message}`;
  });

  postToSlack(`Packing Room Cleaning completed-month archive finished:\n${summary.join("\n")}`);
}

function archiveSheetRows(sheetName, period, archiveSpreadsheet, archiveWindow) {
  const headerColumns = headerColumnsForPeriod(period);
  const sourceSheet = getSheet(sheetName);
  ensureHeader(sourceSheet, headerColumns);

  const values = sourceSheet.getDataRange().getValues();
  const rows = values.slice(1);
  const rowsToArchive = [];
  const rowsToKeep = [];

  rows.forEach((row) => {
    const rowDateKey = toDateKey(row[0]);
    if (rowDateKey && rowDateKey >= archiveWindow.startKey && rowDateKey <= archiveWindow.endKey) {
      rowsToArchive.push(row);
    } else {
      rowsToKeep.push(row);
    }
  });

  const archiveSheet = archiveSpreadsheet.insertSheet(sheetName);
  archiveSheet.getRange(1, 1, 1, headerColumns.length).setValues([headerColumns]);
  if (rowsToArchive.length) {
    archiveSheet.getRange(2, 1, rowsToArchive.length, headerColumns.length).setValues(rowsToArchive.map((row) => fitRowToHeader(row, headerColumns)));
  }
  archiveSheet.setFrozenRows(1);
  archiveSheet.autoResizeColumns(1, headerColumns.length);

  sourceSheet.clearContents();
  sourceSheet.getRange(1, 1, 1, headerColumns.length).setValues([headerColumns]);
  if (rowsToKeep.length) {
    sourceSheet.getRange(2, 1, rowsToKeep.length, headerColumns.length).setValues(rowsToKeep.map((row) => fitRowToHeader(row, headerColumns)));
  }

  return { sheetName, count: rowsToArchive.length };
}

function archiveLegacySheetRows(archiveSpreadsheet, archiveWindow) {
  const sourceSheet = findSheet(LEGACY_SHEET_NAME);
  if (!sourceSheet) return { sheetName: LEGACY_SHEET_NAME, count: 0 };

  const values = sourceSheet.getDataRange().getValues();
  if (values.length < 2) return { sheetName: LEGACY_SHEET_NAME, count: 0 };

  const headerColumns = values[0].filter((header) => header !== "");
  const columnCount = headerColumns.length || sourceSheet.getLastColumn();
  const rows = values.slice(1);
  const rowsToArchive = [];
  const rowsToKeep = [];

  rows.forEach((row) => {
    const rowDateKey = toDateKey(row[0]);
    if (rowDateKey && rowDateKey >= archiveWindow.startKey && rowDateKey <= archiveWindow.endKey) {
      rowsToArchive.push(row);
    } else {
      rowsToKeep.push(row);
    }
  });

  if (rowsToArchive.length) {
    const archiveSheet = archiveSpreadsheet.insertSheet(LEGACY_SHEET_NAME);
    archiveSheet.getRange(1, 1, 1, columnCount).setValues([fitRowToLength(headerColumns, columnCount)]);
    archiveSheet.getRange(2, 1, rowsToArchive.length, columnCount).setValues(rowsToArchive.map((row) => fitRowToLength(row, columnCount)));
    archiveSheet.setFrozenRows(1);
    archiveSheet.autoResizeColumns(1, columnCount);
  }

  sourceSheet.clearContents();
  sourceSheet.getRange(1, 1, 1, columnCount).setValues([fitRowToLength(headerColumns, columnCount)]);
  if (rowsToKeep.length) {
    sourceSheet.getRange(2, 1, rowsToKeep.length, columnCount).setValues(rowsToKeep.map((row) => fitRowToLength(row, columnCount)));
  }

  return { sheetName: LEGACY_SHEET_NAME, count: rowsToArchive.length };
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

function findSheet(sheetName) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
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

function fitRowToHeader(row, headerColumns) {
  return fitRowToLength(row, headerColumns.length);
}

function fitRowToLength(row, length) {
  return Array.from({ length }, (_, index) => row[index] || "");
}

function previousMonthWindow(referenceDate) {
  const year = Number(Utilities.formatDate(referenceDate, TIME_ZONE, "yyyy"));
  const month = Number(Utilities.formatDate(referenceDate, TIME_ZONE, "M"));
  const start = new Date(Date.UTC(year, month - 2, 1, 12));
  const end = new Date(Date.UTC(year, month - 1, 0, 12));

  return {
    startKey: start.toISOString().slice(0, 10),
    endKey: end.toISOString().slice(0, 10),
    label: Utilities.formatDate(start, TIME_ZONE, "yyyy-MM")
  };
}

function completedMonthWindows(referenceDate) {
  const monthKeys = {};
  [findSheet(SHEET_NAMES.morning), findSheet(SHEET_NAMES.evening), findSheet(LEGACY_SHEET_NAME)]
    .filter(Boolean)
    .forEach((sheet) => {
      const values = sheet.getDataRange().getValues();
      values.slice(1).forEach((row) => {
        const dateKey = toDateKey(row[0]);
        if (!dateKey) return;
        const monthKey = dateKey.slice(0, 7);
        if (monthKey < Utilities.formatDate(referenceDate, TIME_ZONE, "yyyy-MM")) {
          monthKeys[monthKey] = true;
        }
      });
    });

  return Object.keys(monthKeys).sort().map((monthKey) => monthWindowFromKey(monthKey));
}

function monthWindowFromKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 12));
  const end = new Date(Date.UTC(year, month, 0, 12));

  return {
    startKey: start.toISOString().slice(0, 10),
    endKey: end.toISOString().slice(0, 10),
    label: monthKey
  };
}

function toDateKey(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, TIME_ZONE, "yyyy-MM-dd");
  }

  const text = String(value || "").trim();
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function removeDefaultArchiveSheet(spreadsheet) {
  const defaultSheet = spreadsheet.getSheetByName("Sheet1");
  if (defaultSheet && spreadsheet.getSheets().length > 1) {
    spreadsheet.deleteSheet(defaultSheet);
  }
}

function moveArchiveToFolder(spreadsheet) {
  const folderId = String(ARCHIVE_FOLDER_ID || "").trim();
  if (!folderId) return { moved: false, message: "" };

  try {
    const file = DriveApp.getFileById(spreadsheet.getId());
    const folder = DriveApp.getFolderById(folderId);
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    return { moved: true, message: "" };
  } catch (error) {
    return {
      moved: false,
      message: `\nFolder move failed. Check ARCHIVE_FOLDER_ID and folder access. Error: ${error.message}`
    };
  }
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
