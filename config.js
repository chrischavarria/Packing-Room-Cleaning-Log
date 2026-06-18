// Packing Room Cleaning Log — optional integration config.
// The dashboard works fully offline without any of this (submissions save to the
// browser's local storage). Fill these in only if you want submissions sent
// somewhere. Then commit this file.

window.PACKING_ROOM_CONFIG = {
  // Google Apps Script web-app URL. When set, each submission is POSTed here
  // (e.g. to append a row to a Google Sheet and/or fire a Slack message).
  appScriptUrl: "",

  // Slack incoming-webhook URL. Used only when appScriptUrl is empty, to post
  // the submission summary directly to a Slack channel.
  slackWebhookUrl: "",

  // Daily cleaning due time, 24-hour "HH:MM" Arizona time. Drives the
  // "Due by" metric and the past-due status. Defaults to 17:35 if omitted.
  reminderCutoff: "17:35"
};
