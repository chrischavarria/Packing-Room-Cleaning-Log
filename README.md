# Packing Room Cleaning Log

A clean, single-page dashboard for logging the daily cleaning of the packing room.
Static HTML/CSS/JS — no build step, no dependencies. Open `index.html` in a browser
or host it on GitHub Pages.

## Features

- **Live Arizona clock** (America/Phoenix) and date.
- **Morning / Evening tabs** so staff only see the checklist for the cleaning period they are submitting.
- **Daily checklist** with workstation checks:
  - **Morning**: Workstations 1-4.
  - **Evening**: Workstations 1-4, packing machines, repeater pump machine, plus the end-of-day room cleaning tasks.
  - **Expired Medication Check** on Thursday evenings.
  - **Weekly Deep Clean** on Friday evenings.
  - **Monthly Cleaning** on the last Friday evening of each month.
- **Cleaning product guide** shown directly in the form.
- **Submission status** — shows whether today's cleaning is done, not yet done, or past due.
- **Validation** — name, initials, and every visible checklist item are required.
- **Local history** — the last submissions are saved in the browser (localStorage).
- **Optional integrations** — POST submissions to a Google Apps Script endpoint or a Slack webhook (see `config.js`).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `styles.css` | All styling |
| `app.js` | Clock, checklist, validation, history, submission logic |
| `config.js` | Optional Apps Script / Slack settings + due time |
| `apps-script/Code.gs` | Google Apps Script template for Morning Cleaning / Evening Cleaning Sheet tabs, Slack, weekend closed rows, reminders, and monthly archives |

## Configuration

Everything works offline with no setup. To change the due time or wire up an
integration, edit `config.js`:

```js
window.PACKING_ROOM_CONFIG = {
  appScriptUrl: "",      // Google Apps Script web-app URL (optional)
  slackWebhookUrl: "",   // Slack incoming webhook (optional, used if appScriptUrl is empty)
  reminderCutoff: "17:35" // evening due time, 24h Arizona time
};
```

Keep the Slack webhook inside Apps Script only. Paste it into `SLACK_WEBHOOK_URL`
in `apps-script/Code.gs`, then deploy Apps Script as a web app and put that web
app URL in `config.js`.

The Apps Script also includes monthly archiving. Run `createMonthlyArchiveTrigger`
once in Apps Script to archive the previous month on the 1st of each month. The
archive creates a new spreadsheet named `Packing Room Cleaning Log - YYYY-MM`,
copies the previous month's Morning and Evening rows into it, then clears those
rows from the live tabs while keeping the headers.

If you want archive files saved into a specific Google Drive folder, paste that
folder ID into `ARCHIVE_FOLDER_ID` in `apps-script/Code.gs`.

For a one-time cleanup of older rows already in the original `Packing Room Cleaning`
tab, run `archiveAllCompletedMonths` once. It creates one archive spreadsheet per
completed month it finds, including legacy rows, then clears those archived rows
from the live workbook.

## Deploy on GitHub Pages

1. Push these files to the repo root.
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch**, pick your branch and `/ (root)`.
3. Open the published URL.
