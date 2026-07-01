# Packing Room Cleaning Log

A clean, single-page dashboard for logging the daily cleaning of the packing room.
Static HTML/CSS/JS — no build step, no dependencies. Open `index.html` in a browser
or host it on GitHub Pages.

## Features

- **Live Arizona clock** (America/Phoenix) and date.
- **Morning / Evening tabs** so staff only see the checklist for the cleaning period they are submitting.
- **Daily checklist** with workstation checks:
  - **Morning**: Workstations 1-4.
  - **Evening**: Workstations 1-4 plus the end-of-day room cleaning tasks.
  - **Expired Medication Check** on Thursday evenings.
  - **Weekly Deep Clean** on Friday evenings.
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
| `apps-script/Code.gs` | Google Apps Script template for Morning Cleaning / Evening Cleaning Sheet tabs, Slack, weekend closed rows, and reminders |

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

## Deploy on GitHub Pages

1. Push these files to the repo root.
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch**, pick your branch and `/ (root)`.
3. Open the published URL.
