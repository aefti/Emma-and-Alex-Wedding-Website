function doPost(e) {
  const SHEET_NAME = 'Acknowledgements';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.appendRow([
      'submittedAtIso',
      'name',
      'eventType',
      'page',
      'userAgent',
      'tz',
      'rawJson'
    ]);
  }

  let data = {};
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {}

  sh.appendRow([
    data.submittedAtIso || new Date().toISOString(),
    data.name || '',
    data.eventType || '',
    data.page || '',
    data.userAgent || '',
    data.tz || '',
    JSON.stringify(data)
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
