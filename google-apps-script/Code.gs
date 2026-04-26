function doPost(e) {
  const SHEET_NAME = 'Responses';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.appendRow([
      'submittedAtIso',
      'eventType',
      'name',
      'email',
      'attending',
      'guests',
      'notes',
      'page',
      'userAgent',
      'tz',
      'rawJson'
    ]);
  }

  let data = {};
  try {
    data = JSON.parse((e.postData && e.postData.contents) || '{}');
  } catch (err) {
    data = {
      parseError: String(err),
      rawBody: e.postData && e.postData.contents ? e.postData.contents : ''
    };
  }

  const details = data.details || {};

  sh.appendRow([
    data.submittedAtIso || new Date().toISOString(),
    data.eventType || '',
    data.name || '',
    data._replyto || '',
    details.attending || '',
    details.guests || '',
    details.notes || '',
    data.page || '',
    data.userAgent || '',
    data.tz || '',
    JSON.stringify(data)
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
