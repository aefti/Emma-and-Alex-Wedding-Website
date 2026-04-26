/**
 * Emma & Alex Wedding Website - Unified Google Apps Script Web App
 *
 * This file combines functionality previously split across:
 * - Code.gs (generic response capture)
 * - Initialise.gs (guest directory + RSVP capture)
 * - acknowledgements.gs (acknowledgement capture)
 *
 * Required tabs:
 * 1) People
 *    PARTY_ID | DAY_EVENING | ... | LEAD_PERSON_FULL_NAME (col E) | ... | PERSON_2_FULL_NAME (col M) | CHILDREN (col N)
 * 2) Responses
 * 3) Acknowledgements
 */

var PEOPLE_SHEET_NAME = 'People';
var RESPONSES_SHEET_NAME = 'Responses';
var ACKNOWLEDGEMENTS_SHEET_NAME = 'Acknowledgements';

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    var callback = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : '';

    if (action === 'people') {
      var payload = buildPeoplePayload_();
      return callback ? jsonpResponse(payload, callback) : jsonResponse(payload);
    }

    var defaultPayload = {
      ok: true,
      actions: ['people'],
      message: 'Use ?action=people to fetch guest directory with RSVP status.'
    };
    return callback ? jsonpResponse(defaultPayload, callback) : jsonResponse(defaultPayload);
  } catch (err) {
    var errorPayload = { ok: false, error: err.message, stack: err.stack };
    var fallbackCallback = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : '';
    return fallbackCallback ? jsonpResponse(errorPayload, fallbackCallback) : jsonResponse(errorPayload);
  }
}

function doPost(e) {
  try {
    var payload = parseBody_(e);
    var eventType = String((payload && payload.eventType) || '').toLowerCase();

    if (eventType === 'acknowledgement') {
      appendAcknowledgementRow_(payload);
      return jsonResponse({ ok: true, eventType: 'acknowledgement' });
    }

    appendResponseRow_(payload);
    return jsonResponse({ ok: true, eventType: eventType || 'unknown' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message, stack: err.stack });
  }
}

function buildPeoplePayload_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No active spreadsheet found. If this is a standalone Web App, use SpreadsheetApp.openById(...) instead.');
  }
  var peopleSheet = ss.getSheetByName(PEOPLE_SHEET_NAME);
  if (!peopleSheet) {
    throw new Error('Missing People sheet: ' + PEOPLE_SHEET_NAME);
  }

  var lastRow = peopleSheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, people: [] };
  }

  var lastColumn = peopleSheet.getLastColumn();
  var values = peopleSheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values[0].map(normalizeHeaderKey_);
  var dataRows = values.slice(1);

  var partyIdIx = indexOfHeader_(headers, ['PARTY_ID']);
  var dayEveningIx = indexOfHeader_(headers, ['DAY_EVENING']);
  var leadFullNameIx = indexOfHeader_(headers, ['LEAD_PERSON_FULL_NAME']);
  var guestFullNameIx = indexOfHeader_(headers, ['PERSON_2_FULL_NAME']);
  var childrenIx = indexOfHeader_(headers, ['CHILDREN']);

  if (partyIdIx === -1 || leadFullNameIx === -1) {
    throw new Error('People sheet is missing required headers. Expected at least PARTY_ID and LEAD_PERSON_FULL_NAME.');
  }

  var rsvpStatusByPartyId = getRsvpStatusByPartyId_();

  var people = dataRows
    .filter(function(row) {
      return row[partyIdIx] || row[leadFullNameIx] || (guestFullNameIx > -1 ? row[guestFullNameIx] : '');
    })
    .map(function(row) {
      var partyId = toStringSafe_(row[partyIdIx]);
      var dayEveningRaw = dayEveningIx > -1 ? normalizeWhitespace_(row[dayEveningIx]) : '';
      return {
        partyId: partyId,
        dayEvening: mapDayEvening_(dayEveningRaw),
        leadFullName: normalizeWhitespace_(row[leadFullNameIx]),
        guestFullName: guestFullNameIx > -1 ? normalizeWhitespace_(row[guestFullNameIx]) : '',
        children: childrenIx > -1 ? normalizeWhitespace_(row[childrenIx]) : '',
        hasRsvped: Boolean(rsvpStatusByPartyId[partyId])
      };
    });

  return { ok: true, people: people };
}

function getRsvpStatusByPartyId_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var responsesSheet = ss.getSheetByName(RESPONSES_SHEET_NAME);
  if (!responsesSheet || responsesSheet.getLastRow() < 2) {
    return {};
  }

  var range = responsesSheet.getDataRange().getValues();
  var headers = range[0].map(function(h) { return String(h).trim(); });
  var partyIdIx = headers.indexOf('partyId');
  var eventTypeIx = headers.indexOf('eventType');

  if (partyIdIx === -1 || eventTypeIx === -1) {
    return {};
  }

  var out = {};
  for (var i = 1; i < range.length; i += 1) {
    var row = range[i];
    var eventType = String(row[eventTypeIx] || '').toLowerCase();
    if (eventType !== 'rsvp') { continue; }
    var pid = toStringSafe_(row[partyIdIx]);
    if (pid) {
      out[pid] = true;
    }
  }
  return out;
}

function appendResponseRow_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RESPONSES_SHEET_NAME) || ss.insertSheet(RESPONSES_SHEET_NAME);
  var details = payload && payload.details ? payload.details : {};
  var partyResponses = Array.isArray(details.partyResponses) ? details.partyResponses : [];

  var headers = [
    'timestamp',
    'submittedAtIso',
    'eventType',
    'eventAudience',
    'partyId',
    'matchedName',
    'name',
    'email',
    'attendingCount',
    'declineCount',
    'guests',
    'notes',
    'page',
    'userAgent',
    'tz',
    'payloadJson'
  ];

  ensureHeaderRow_(sheet, headers);

  var row = [
    new Date(),
    toStringSafe_(payload.submittedAtIso),
    toStringSafe_(payload.eventType),
    toStringSafe_(payload.eventAudience),
    toStringSafe_(payload.partyId),
    toStringSafe_(payload.matchedName),
    toStringSafe_(payload.name || payload.typedName),
    toStringSafe_(payload._replyto),
    toStringSafe_(details.attendingCount),
    toStringSafe_(details.declineCount),
    partyResponses.length ? JSON.stringify(partyResponses) : toStringSafe_(details.guests),
    toStringSafe_(details.notes),
    toStringSafe_(payload.page),
    toStringSafe_(payload.userAgent),
    toStringSafe_(payload.tz),
    JSON.stringify(payload)
  ];

  sheet.appendRow(row);
}

function appendAcknowledgementRow_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ACKNOWLEDGEMENTS_SHEET_NAME) || ss.insertSheet(ACKNOWLEDGEMENTS_SHEET_NAME);

  var headers = [
    'timestamp',
    'submittedAtIso',
    'name',
    'typedName',
    'eventType',
    'partyId',
    'matchedBy',
    'matchType',
    'dayEvening',
    'hasRsvped',
    'guestName',
    'children',
    'page',
    'userAgent',
    'tz',
    'payloadJson'
  ];

  ensureHeaderRow_(sheet, headers);

  var row = [
    new Date(),
    toStringSafe_(payload.submittedAtIso),
    toStringSafe_(payload.name || payload.matchedName),
    toStringSafe_(payload.typedName),
    toStringSafe_(payload.eventType),
    toStringSafe_(payload.partyId),
    toStringSafe_(payload.matchedBy),
    toStringSafe_(payload.matchType),
    toStringSafe_(payload.dayEvening),
    String(Boolean(payload.hasRsvped)),
    toStringSafe_(payload.guestName),
    Array.isArray(payload.children) ? payload.children.join('; ') : toStringSafe_(payload.children),
    toStringSafe_(payload.page),
    toStringSafe_(payload.userAgent),
    toStringSafe_(payload.tz),
    JSON.stringify(payload)
  ];

  sheet.appendRow(row);
}

function ensureHeaderRow_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }

  var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var normalizedExisting = existing.map(function(v) { return String(v || '').trim(); });
  var mismatch = headers.some(function(header, idx) {
    return normalizedExisting[idx] !== header;
  });

  if (mismatch) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function parseBody_(e) {
  var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
  var payload = JSON.parse(raw);
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Invalid JSON payload');
  }
  return payload;
}

function mapDayEvening_(value) {
  var v = String(value || '').trim().toLowerCase();
  if (v === 'evening') { return 'Evening'; }
  if (v === 'day') { return 'Day'; }
  if (v === 'yes' || v === 'true' || v === '1') { return 'Day'; }
  if (v === 'no' || v === 'false' || v === '0') { return 'Evening'; }
  return 'Day';
}

function normalizeHeaderKey_(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
}

function indexOfHeader_(normalizedHeaders, candidateKeys) {
  for (var i = 0; i < candidateKeys.length; i += 1) {
    var key = normalizeHeaderKey_(candidateKeys[i]);
    var idx = normalizedHeaders.indexOf(key);
    if (idx !== -1) { return idx; }
  }
  return -1;
}

function normalizeWhitespace_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toStringSafe_(value) {
  if (value === null || value === undefined) { return ''; }
  return String(value).trim();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse(obj, callbackName) {
  var safeCallback = String(callbackName || '').replace(/[^A-Za-z0-9_$.]/g, '');
  if (!safeCallback) {
    return jsonResponse(obj);
  }
  return ContentService
    .createTextOutput(safeCallback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
