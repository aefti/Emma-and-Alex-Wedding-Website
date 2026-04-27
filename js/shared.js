/* Emma & Alex Wedding — Shared JavaScript */

var GOOGLE_SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbw6uOEq_XkBwU9IdQdvY7l8V5OnZNamyOgPD6MDd1TnhWo-YJOKNgh_VP77UDuwtZJedw/exec';
var SITE_TOKEN = 'ea-2027-8mKxNpQvTz';
var RSVP_STORAGE_PREFIX = 'ea_rsvp_';

var PAGE_CONFIG = window.PAGE_CONFIG || {};

function postToGoogleSheets(payload) {
  if (!GOOGLE_SHEETS_WEBHOOK) { return Promise.resolve({ skipped: true }); }
  var securedPayload = Object.assign({}, payload, { token: SITE_TOKEN });
  var body = JSON.stringify(securedPayload);

  if (navigator.sendBeacon) {
    var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
    var sent = navigator.sendBeacon(GOOGLE_SHEETS_WEBHOOK, blob);
    return sent ? Promise.resolve({ beacon: true }) : Promise.reject(new Error('sendBeacon failed'));
  }

  return fetch(GOOGLE_SHEETS_WEBHOOK, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: body
  });
}

function getSavedParty() {
  var raw = localStorage.getItem('ea_ack_party');
  if (!raw) { return null; }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function currentPartyMembers() {
  var party = getSavedParty() || pendingGuestMatch;
  var members = [];
  if (party && party.matchedName) { members.push(party.matchedName); }
  if (party && party.guestName) { members.push(party.guestName); }
  if (party && party.children && party.children.length) {
    party.children.forEach(function(child) { members.push(child); });
  }
  if (!members.length) {
    var typedName = document.getElementById('rsvp-name').value.trim();
    members.push(typedName || 'Guest 1');
  }
  return members;
}

function renderIndividualRsvpChoices() {
  var container = document.getElementById('individualRsvpList');
  if (!container) { return; }
  var members = currentPartyMembers();
  container.innerHTML = '';
  members.forEach(function(member, index) {
    var item = document.createElement('div');
    item.className = 'rsvp-person';
    item.innerHTML =
      '<p class="rsvp-person-name">' + escapeHtml(member) + '</p>' +
      '<div class="rsvp-radio-group">' +
        '<label class="rsvp-radio-label"><input type="radio" name="person_' + index + '" value="yes"> 🎉 Attending</label>' +
        '<label class="rsvp-radio-label"><input type="radio" name="person_' + index + '" value="no"> 😢 Not attending</label>' +
      '</div>';
    item.querySelectorAll('input[type="radio"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var labelNodes = item.querySelectorAll('.rsvp-radio-label');
        labelNodes.forEach(function(label) {
          var input = label.querySelector('input');
          label.classList.toggle('selected', input.checked);
        });
      });
    });
    container.appendChild(item);
  });
}

function collectIndividualRsvp() {
  var members = currentPartyMembers();
  var decisions = [];
  for (var i = 0; i < members.length; i += 1) {
    var selected = document.querySelector('input[name="person_' + i + '"]:checked');
    if (!selected) { return null; }
    decisions.push({ name: members[i], attending: selected.value === 'yes' });
  }
  return decisions;
}

function getRsvpStorageKey() {
  var party = getSavedParty() || pendingGuestMatch;
  return RSVP_STORAGE_PREFIX + (party && party.partyId ? party.partyId : (PAGE_CONFIG.storageKeyFallback || 'anonymous'));
}

function setRsvpLockedState(isLocked) {
  var form = document.getElementById('rsvpForm');
  var notice = document.getElementById('rsvpLockedNotice');
  if (!form || !notice) { return; }
  form.classList.toggle('rsvp-disabled', isLocked);
  notice.classList.toggle('open', isLocked);
}

function resetRsvpSubmitButton() {
  var btn = document.getElementById('rsvpSubmitBtn');
  if (!btn) { return; }
  btn.disabled = false;
  btn.textContent = 'Send my RSVP';
}

function enableRsvpResubmission() {
  localStorage.removeItem(getRsvpStorageKey());
  setRsvpLockedState(false);
  document.getElementById('rsvpSuccess').style.display = 'none';
  document.getElementById('rsvpForm').style.display = 'block';
  resetRsvpSubmitButton();
}

function toggleFaq(btn) {
  var answer = btn.nextElementSibling;
  var chevron = btn.querySelector('.faq-chevron');
  var isOpen = answer.classList.contains('open');
  document.querySelectorAll('.faq-a').forEach(function(a) { a.classList.remove('open'); });
  document.querySelectorAll('.faq-chevron').forEach(function(c) { c.classList.remove('open'); });
  if (!isOpen) {
    answer.classList.add('open');
    if (chevron) { chevron.classList.add('open'); }
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function submitRsvp() {
  var name = document.getElementById('rsvp-name').value.trim();
  var email = document.getElementById('rsvp-email').value.trim();
  var partyResponses = collectIndividualRsvp();
  var party = getSavedParty() || pendingGuestMatch || {};
  var notes = document.getElementById('rsvp-notes').value;
  if (!name || !email) {
    alert('Please fill in your name and email.');
    return;
  }
  if (!partyResponses) {
    document.getElementById('individualRsvpError').classList.add('open');
    alert('Please make an attendance choice for every person in your party.');
    return;
  }
  document.getElementById('individualRsvpError').classList.remove('open');
  var btn = document.getElementById('rsvpSubmitBtn');
  btn.textContent = 'Sending...';
  btn.disabled = true;

  var payload = {
    eventType: 'rsvp',
    name: name,
    _replyto: email,
    partyId: party.partyId || '',
    matchedName: party.matchedName || '',
    submittedAtIso: new Date().toISOString(),
    details: {
      partyResponses: partyResponses,
      attendingCount: partyResponses.filter(function(p) { return p.attending; }).length,
      declineCount: partyResponses.filter(function(p) { return !p.attending; }).length,
      notes: notes,
      source: PAGE_CONFIG.source || 'wedding-site'
    }
  };
  if (PAGE_CONFIG.eventAudience) { payload.eventAudience = PAGE_CONFIG.eventAudience; }

  postToGoogleSheets(payload).then(function() {
    localStorage.setItem(getRsvpStorageKey(), '1');
    setRsvpLockedState(true);
    document.getElementById('rsvpForm').style.display = 'none';
    document.getElementById('rsvpSuccess').style.display = 'block';
  }).catch(function() {
    alert('Could not send — please check your connection and try again.');
    btn.textContent = 'Send my RSVP';
    btn.disabled = false;
  });
}
