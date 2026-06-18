# Packing Room Cleaning Log

A clean, single-page dashboard for logging the daily cleaning of the packing room.
Static HTML/CSS/JS — no build step, no dependencies. Open `index.html` in a browser
or host it on GitHub Pages.

## Features

- **Live Arizona clock** (America/Phoenix) and date.
- **Daily checklist** plus automatic extra sections:
  - **Expired Medication Check** on Thursdays.
  - **Weekly Deep Clean** on Fridays.
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

## Configuration

Everything works offline with no setup. To change the due time or wire up an
integration, edit `config.js`:

```js
window.PACKING_ROOM_CONFIG = {
  appScriptUrl: "",      // Google Apps Script web-app URL (optional)
  slackWebhookUrl: "",   // Slack incoming webhook (optional, used if appScriptUrl is empty)
  reminderCutoff: "17:35" // daily due time, 24h Arizona time
};
```

## Deploy on GitHub Pages

1. Push these files to the repo root.
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch**, pick your branch and `/ (root)`.
3. Open the published URL.
