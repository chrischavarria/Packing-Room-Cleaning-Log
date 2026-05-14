# Packing Room Cleaning Dashboard

Static dashboard for packing room cleaning signoff. It auto-populates the current Arizona date/time, requires name and initials, shows the daily cleaning checklist every day, shows the expired medication check on Thursdays, and shows the weekly deep clean on Fridays.

## Configure

1. Deploy `apps-script/Code.gs` as a Google Apps Script web app connected to your Sheet.
2. Paste your Slack webhook into `SLACK_WEBHOOK_URL` inside Apps Script.
3. Run `createReminderTrigger()` once from Apps Script to create the 5:15 PM Arizona reminder.
4. Paste the deployed Apps Script web app URL into `config.js`:

```js
window.PACKING_ROOM_CONFIG = {
  appScriptUrl: "YOUR_DEPLOYED_APPS_SCRIPT_WEB_APP_URL",
  slackWebhookUrl: "",
  reminderCutoff: "17:15",
  timezoneLabel: "America/Phoenix"
};
```

The dashboard keeps a small local submission history in the browser so the room can see whether today's log has already been submitted. Google Sheets remains the source of truth for reporting and reminders.

## Open Locally

Open `index.html` in a browser, or serve the folder with any static web server.
