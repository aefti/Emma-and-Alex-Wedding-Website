/**
 * Emma & Alex Wedding Website - Unified Google Apps Script Web App
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
var EMAIL_LOG_SHEET_NAME = 'EmailLog';

// Shared token — must match SITE_TOKEN in index.html and evening.html.
// Deters casual API abuse; visible in page source so not a cryptographic secret.
var SITE_TOKEN = 'ea-2027-8mKxNpQvTz';

// Email address to receive RSVP and check-in notifications.
// Set this to the address you want to be notified at, then redeploy.
var NOTIFICATION_EMAIL = 'alex.edwards.1491@gmail.com';

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    var callback = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : '';
    var token = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';

    if (action === 'lookup') {
      if (!validateToken_(token)) {
        var denied = { ok: false, error: 'Unauthorised' };
        return callback ? jsonpResponse(denied, callback) : jsonResponse(denied);
      }
      var name = (e && e.parameter && e.parameter.name) ? String(e.parameter.name) : '';
      var result = lookupGuest_(name);
      return callback ? jsonpResponse(result, callback) : jsonResponse(result);
    }

    var defaultPayload = { ok: true, message: 'Wedding API' };
    return callback ? jsonpResponse(defaultPayload, callback) : jsonResponse(defaultPayload);
  } catch (err) {
    var fallbackCallback = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : '';
    var errorPayload = { ok: false, error: 'Internal error' };
    return fallbackCallback ? jsonpResponse(errorPayload, fallbackCallback) : jsonResponse(errorPayload);
  }
}

function doPost(e) {
  try {
    var payload = parseBody_(e);
    var token = String((payload && payload.token) || '');
    if (!validateToken_(token)) {
      return jsonResponse({ ok: false, error: 'Unauthorised' });
    }
    var eventType = String((payload && payload.eventType) || '').toLowerCase();

    if (eventType === 'acknowledgement') {
      appendAcknowledgementRow_(payload);
      sendAcknowledgementEmail_(payload);
      return jsonResponse({ ok: true, eventType: 'acknowledgement' });
    }

    if (eventType === 'rsvp') {
      appendResponseRow_(payload);
      sendRsvpEmail_(payload);
      return jsonResponse({ ok: true, eventType: 'rsvp' });
    }

    return jsonResponse({ ok: false, error: 'Unknown event type' });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Internal error' });
  }
}

function sendRsvpEmail_(payload) {
  if (!NOTIFICATION_EMAIL) { return; }
  var emailSubject = '';
  try {
    var details = payload.details || {};
    var partyResponses = Array.isArray(details.partyResponses) ? details.partyResponses : [];
    var attendingCount = Number(details.attendingCount) || 0;
    var declineCount = Number(details.declineCount) || 0;
    var audience = toStringSafe_(payload.eventAudience || 'day');
    var guestName = toStringSafe_(payload.name);
    var guestEmail = toStringSafe_(payload._replyto);

    var subject = '[Wedding RSVP] ' + guestName
      + ' — ' + attendingCount + ' attending, ' + declineCount + ' not attending'
      + ' (' + audience + ')';
    emailSubject = subject;

    var attendanceLines = partyResponses.length
      ? partyResponses.map(function(p) {
          return '  ' + (p.attending ? '✓' : '✗') + ' ' + toStringSafe_(p.name)
            + ' — ' + (p.attending ? 'Attending' : 'Not attending');
        }).join('\n')
      : '  (no individual responses recorded)';

    var body = [
      'A new RSVP has been received for the Emma & Alex wedding.',
      '',
      'NAME:      ' + guestName,
      'EMAIL:     ' + (guestEmail || '(not provided)'),
      'PARTY ID:  ' + toStringSafe_(payload.partyId),
      'AUDIENCE:  ' + audience,
      '',
      'ATTENDANCE:',
      attendanceLines,
      '',
      'Attending:     ' + attendingCount,
      'Not attending: ' + declineCount,
      '',
      'DIETARY / NOTES:',
      toStringSafe_(details.notes) || '(none)',
      '',
      '———',
      'Submitted:  ' + toStringSafe_(payload.submittedAtIso),
      'Timezone:   ' + toStringSafe_(payload.tz),
      'Page:       ' + toStringSafe_(payload.page),
      'User agent: ' + toStringSafe_(payload.userAgent)
    ].join('\n');

    var options = { name: 'Emma & Alex Wedding Site' };
    if (guestEmail) { options.replyTo = guestEmail; }
    MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body, options);
    logEmailAttempt_('rsvp', 'success', subject, payload, '');
  } catch (err) {
    logEmailAttempt_('rsvp', 'failure', emailSubject, payload, err);
  }
}

function sendAcknowledgementEmail_(payload) {
  if (!NOTIFICATION_EMAIL) { return; }
  var emailSubject = '';
  try {
    var matchedName = toStringSafe_(payload.name || payload.matchedName);
    var dayEvening = toStringSafe_(payload.dayEvening);
    var childrenStr = Array.isArray(payload.children)
      ? payload.children.join(', ')
      : toStringSafe_(payload.children);

    var subject = '[Wedding Check-in] ' + matchedName + ' (' + dayEvening + ')';
    emailSubject = subject;

    var body = [
      'A guest has just checked in to the Emma & Alex wedding website.',
      '',
      'NAME:       ' + matchedName,
      'PLUS-ONE:   ' + (toStringSafe_(payload.guestName) || '(none)'),
      'CHILDREN:   ' + (childrenStr || '(none)'),
      'DAY/EVE:    ' + dayEvening,
      'PARTY ID:   ' + toStringSafe_(payload.partyId),
      'RSVP FILED: ' + (payload.hasRsvped ? 'Yes' : 'No'),
      '',
      'MATCH DETAILS:',
      '  Typed:      "' + toStringSafe_(payload.typedName) + '"',
      '  Matched as: ' + matchedName,
      '  Match type: ' + toStringSafe_(payload.matchType),
      '  Matched by: ' + toStringSafe_(payload.matchedBy),
      '',
      '———',
      'Submitted:  ' + toStringSafe_(payload.submittedAtIso),
      'Timezone:   ' + toStringSafe_(payload.tz),
      'Page:       ' + toStringSafe_(payload.page),
      'User agent: ' + toStringSafe_(payload.userAgent)
    ].join('\n');

    MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body, { name: 'Emma & Alex Wedding Site' });
    logEmailAttempt_('acknowledgement', 'success', subject, payload, '');
  } catch (err) {
    logEmailAttempt_('acknowledgement', 'failure', emailSubject, payload, err);
  }
}

function logEmailAttempt_(eventType, status, subject, payload, err) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) { return; }
    var sheet = ss.getSheetByName(EMAIL_LOG_SHEET_NAME) || ss.insertSheet(EMAIL_LOG_SHEET_NAME);

    var headers = [
      'timestamp',
      'eventType',
      'status',
      'to',
      'subject',
      'partyId',
      'name',
      'errorMessage',
      'payloadJson'
    ];
    ensureHeaderRow_(sheet, headers);

    var errorMessage = err && err.message ? String(err.message) : toStringSafe_(err);
    var row = [
      new Date(),
      toStringSafe_(eventType),
      toStringSafe_(status),
      toStringSafe_(NOTIFICATION_EMAIL),
      toStringSafe_(subject),
      toStringSafe_(payload && payload.partyId),
      toStringSafe_(payload && (payload.name || payload.matchedName || payload.typedName)),
      errorMessage,
      JSON.stringify(payload || {})
    ];
    sheet.appendRow(row);
  } catch (loggingErr) {
    // Intentionally ignore logging errors to avoid breaking form submissions.
  }
}

function validateToken_(token) {
  return String(token || '') === SITE_TOKEN;
}

function lookupGuest_(typedName) {
  var normalizedQuery = normalizeNameServer_(typedName);
  if (!normalizedQuery) {
    return { ok: false, error: 'Name is required.' };
  }

  var payload = buildPeoplePayload_();
  if (!payload.ok || !Array.isArray(payload.people) || !payload.people.length) {
    return { ok: false, error: 'Guest list unavailable.' };
  }

  var index = [];
  payload.people.forEach(function(row) {
    var leadName = normalizeWhitespace_(row.leadFullName || '');
    var guestName = normalizeWhitespace_(row.guestFullName || '');
    if (leadName) {
      index.push({
        partyId: row.partyId,
        dayEvening: row.dayEvening,
        hasRsvped: row.hasRsvped,
        matchedName: leadName,
        matchedBy: 'Column E',
        guestName: guestName,
        children: row.children || '',
        normalized: normalizeNameServer_(leadName)
      });
    }
    if (guestName) {
      index.push({
        partyId: row.partyId,
        dayEvening: row.dayEvening,
        hasRsvped: row.hasRsvped,
        matchedName: guestName,
        matchedBy: 'Column M',
        guestName: leadName,
        children: row.children || '',
        normalized: normalizeNameServer_(guestName)
      });
    }
  });

  var exact = null;
  for (var i = 0; i < index.length; i++) {
    if (index[i].normalized === normalizedQuery) {
      exact = index[i];
      break;
    }
  }

  var best = exact;
  var matchType = 'exact';

  if (!best) {
    var bestDistance = Infinity;
    for (var j = 0; j < index.length; j++) {
      var dist = levenshteinServer_(normalizedQuery, index[j].normalized);
      if (dist < bestDistance) {
        bestDistance = dist;
        best = index[j];
      }
    }
    matchType = 'fuzzy';
  }

  if (!best) {
    return { ok: false, error: 'No match found.' };
  }

  var childrenArr = best.children
    ? best.children.split(';').map(function(c) { return c.trim(); }).filter(Boolean)
    : [];

  return {
    ok: true,
    match: {
      partyId: best.partyId,
      dayEvening: best.dayEvening,
      hasRsvped: best.hasRsvped,
      matchedName: best.matchedName,
      matchedBy: best.matchedBy,
      guestName: best.guestName,
      children: childrenArr,
      matchType: matchType
    }
  };
}

function normalizeNameServer_(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function levenshteinServer_(a, b) {
  var m = a.length;
  var n = b.length;
  var dp = [];
  for (var i = 0; i <= m; i++) {
    dp[i] = [];
    dp[i][0] = i;
  }
  for (var j = 0; j <= n; j++) {
    dp[0][j] = j;
  }
  for (var r = 1; r <= m; r++) {
    for (var c = 1; c <= n; c++) {
      var cost = a[r - 1] === b[c - 1] ? 0 : 1;
      dp[r][c] = Math.min(dp[r - 1][c] + 1, dp[r][c - 1] + 1, dp[r - 1][c - 1] + cost);
    }
  }
  return dp[m][n];
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
  if (raw.length > 65536) {
    throw new Error('Payload too large');
  }
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
