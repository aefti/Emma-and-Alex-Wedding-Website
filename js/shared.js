/* Emma & Alex Wedding — Shared JavaScript */

var GOOGLE_SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbw6uOEq_XkBwU9IdQdvY7l8V5OnZNamyOgPD6MDd1TnhWo-YJOKNgh_VP77UDuwtZJedw/exec';
var SESSION_TOKEN = null;
var SESSION_TIMESTAMP = 0;
var RSVP_STORAGE_PREFIX = 'ea_rsvp_';

var PAGE_CONFIG = window.PAGE_CONFIG || {};

function initSession() {
  return new Promise(function(resolve, reject) {
    var callbackName = '__eaSession_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    var script = document.createElement('script');
    var timeoutId = setTimeout(function() {
      cleanup();
      reject(new Error('Session init timed out.'));
    }, 10000);

    function cleanup() {
      clearTimeout(timeoutId);
      if (script.parentNode) { script.parentNode.removeChild(script); }
      try { delete window[callbackName]; } catch (err) { window[callbackName] = undefined; }
    }

    window[callbackName] = function(data) {
      cleanup();
      if (data && data.ok && data.sessionToken) {
        SESSION_TOKEN = data.sessionToken;
        SESSION_TIMESTAMP = Date.now();
        resolve(SESSION_TOKEN);
      } else {
        reject(new Error('Invalid session response.'));
      }
    };

    script.onerror = function() {
      cleanup();
      reject(new Error('Could not reach session service.'));
    };

    script.src = GOOGLE_SHEETS_WEBHOOK
      + '?action=session'
      + '&callback=' + encodeURIComponent(callbackName)
      + '&t=' + Date.now();
    document.head.appendChild(script);
  });
}

function ensureSession() {
  if (SESSION_TOKEN && (Date.now() - SESSION_TIMESTAMP) < 480000) {
    return Promise.resolve(SESSION_TOKEN);
  }
  SESSION_TOKEN = null;
  return initSession().catch(function(err) {
    return new Promise(function(resolve) {
      setTimeout(function() { resolve(initSession()); }, 2000);
    });
  });
}

function showSessionError(message) {
  var existing = document.getElementById('sessionErrorBanner');
  if (existing) { return; }
  var banner = document.createElement('div');
  banner.id = 'sessionErrorBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#a83220;color:#fff;font-family:Arial,sans-serif;font-size:0.9rem;padding:1rem;text-align:center;z-index:99999;';
  banner.textContent = message || 'Could not connect. Please refresh the page.';
  document.body.appendChild(banner);
}

function postToGoogleSheets(payload) {
  if (!GOOGLE_SHEETS_WEBHOOK) { return Promise.resolve({ skipped: true }); }
  return ensureSession().then(function(token) {
    var securedPayload = Object.assign({}, payload, { token: token });
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

  document.querySelectorAll('.faq-a.open').forEach(function(a) {
    a.style.maxHeight = a.scrollHeight + 'px';
    void a.offsetHeight;
    a.classList.remove('open');
    a.style.maxHeight = '0';
  });
  document.querySelectorAll('.faq-chevron.open').forEach(function(c) {
    c.classList.remove('open');
  });

  if (!isOpen) {
    answer.classList.add('open');
    answer.style.maxHeight = answer.scrollHeight + 'px';
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

/* Photo manifest */
var PHOTO_MANIFEST_PATH = 'backend/photos/manifest.json';
var DEFAULT_PHOTO_MANIFEST = {
  mainPhoto: { url: 'images/photos/main.jpg', subtext: '' },
  galleryPhotos: [
    { url: 'images/photos/small-1.jpg', subtext: '' },
    { url: 'images/photos/small-2.jpg', subtext: '' },
    { url: 'images/photos/small-3.jpg', subtext: '' },
    { url: 'images/photos/small-4.jpg', subtext: '' },
    { url: 'images/photos/small-5.jpg', subtext: '' },
    { url: 'images/photos/small-6.jpg', subtext: '' }
  ]
};

function normalizePhotoEntry(entry, fallback) {
  if (!entry) { return fallback; }
  if (typeof entry === 'string') { return { url: entry, subtext: '' }; }
  return { url: entry.url || fallback.url, subtext: entry.subtext || '' };
}

function normalizePhotoManifest(data) {
  if (!data || typeof data !== 'object') { return DEFAULT_PHOTO_MANIFEST; }
  var rawGallery = Array.isArray(data.galleryPhotos) ? data.galleryPhotos : DEFAULT_PHOTO_MANIFEST.galleryPhotos;
  var galleryPhotos = rawGallery.slice(0, 6).map(function(entry, i) {
    return normalizePhotoEntry(entry, DEFAULT_PHOTO_MANIFEST.galleryPhotos[i]);
  });
  return {
    mainPhoto: normalizePhotoEntry(data.mainPhoto, DEFAULT_PHOTO_MANIFEST.mainPhoto),
    galleryPhotos: galleryPhotos
  };
}

function applyPhotoManifest(manifest) {
  var normalized = normalizePhotoManifest(manifest);
  var mainPhoto = document.getElementById('storyMainPhoto');
  if (mainPhoto) {
    mainPhoto.src = normalized.mainPhoto.url;
  }
  var galleryImages = document.querySelectorAll('#galleryGrid .gallery-photo');
  var galleryTexts = document.querySelectorAll('#galleryGrid .gallery-flip-text');
  galleryImages.forEach(function(photo, index) {
    var entry = normalized.galleryPhotos[index] || DEFAULT_PHOTO_MANIFEST.galleryPhotos[index];
    photo.src = entry.url;
    if (galleryTexts[index]) {
      galleryTexts[index].textContent = entry.subtext || '';
    }
  });
}

function loadPhotoManifest() {
  return fetch(PHOTO_MANIFEST_PATH, { cache: 'no-store' })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('Photo manifest not found.');
      }
      return response.json();
    })
    .then(function(data) {
      applyPhotoManifest(data);
    })
    .catch(function() {
      applyPhotoManifest(DEFAULT_PHOTO_MANIFEST);
    });
}

/* Hero parallax */
function setupHeroParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
  var hero = document.querySelector('.hero');
  var heroImg = document.querySelector('.hero-img');
  var leafBg = document.querySelector('.leaf-bg');
  if (!hero || !heroImg) { return; }
  heroImg.style.willChange = 'transform';
  if (leafBg) { leafBg.style.willChange = 'transform'; }
  window.addEventListener('scroll', function() {
    var scrolled = window.scrollY;
    if (scrolled > window.innerHeight) { return; }
    heroImg.style.transform = 'translate3d(0,' + (scrolled * -0.25) + 'px,0)';
    if (leafBg) { leafBg.style.transform = 'translate3d(0,' + (scrolled * -0.12) + 'px,0)'; }
  }, { passive: true });
}

/* Countdown with transition */
function flipDigit(el, newVal) {
  if (!el) { return; }
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var oldVal = el.textContent;
  if (oldVal === newVal) { return; }
  el.textContent = newVal;
  if (reducedMotion || oldVal === '–') { return; }
  el.classList.add('cd-tick');
  setTimeout(function() { el.classList.remove('cd-tick'); }, 300);
}

function updateCountdown() {
  var target = new Date('2027-11-06T14:00:00');
  var now = new Date();
  var diff = target - now;
  if (diff <= 0) {
    ['cd-days','cd-hours','cd-mins','cd-secs'].forEach(function(id) { flipDigit(document.getElementById(id), '0'); });
    return;
  }
  flipDigit(document.getElementById('cd-days'), String(Math.floor(diff / 86400000)));
  flipDigit(document.getElementById('cd-hours'), String(Math.floor((diff % 86400000) / 3600000)));
  flipDigit(document.getElementById('cd-mins'), String(Math.floor((diff % 3600000) / 60000)));
  flipDigit(document.getElementById('cd-secs'), String(Math.floor((diff % 60000) / 1000)));
}

/* Active nav highlighting */
function setupActiveNav() {
  var sections = document.querySelectorAll('section[id]');
  if (!sections.length || !('IntersectionObserver' in window)) { return; }
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) { return; }
      var id = entry.target.id;
      document.querySelectorAll('nav .nav-links a, nav .mobile-menu a').forEach(function(link) {
        var isActive = link.getAttribute('href') === '#' + id;
        link.classList.toggle('nav-active', isActive);
      });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(function(s) { observer.observe(s); });
}

/* Scroll reveal */
function setupScrollReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
  var targets = document.querySelectorAll('.section-inner');
  if (!targets.length || !('IntersectionObserver' in window)) { return; }
  targets.forEach(function(el) { el.classList.add('reveal-hidden'); });
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-visible');
        entry.target.classList.remove('reveal-hidden');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  targets.forEach(function(el) { observer.observe(el); });
}

/* Shared section builders */

function renderHeroCredit() {
  var heroImg = document.querySelector('.hero-img');
  if (!heroImg) { return; }
  var parent = heroImg.parentElement;
  if (!parent) { return; }
  var credit = document.createElement('p');
  credit.className = 'hero-credit';
  credit.innerHTML = 'Illustration by <a href="https://www.instagram.com/alice_krieits/" target="_blank">@alice_krieits</a>';
  parent.insertBefore(credit, heroImg.nextSibling);
}

function renderStorySection() {
  var container = document.getElementById('storyContainer');
  if (!container) { return; }
  container.innerHTML =
    '<section id="story">' +
      '<div class="section-inner">' +
        '<span class="section-label">The beginning</span>' +
        '<h2 class="section-title">Our Story</h2>' +
        '<div class="divider"></div>' +
        '<div class="story-grid">' +
          '<div class="story-photo-wrap">' +
            '<img id="storyMainPhoto" class="story-main-photo" src="images/photos/main.jpg" alt="Emma and Alex main photo" loading="lazy">' +
          '</div>' +
          '<div>' +
            '<p class="section-body" style="margin-bottom: 2rem;">Every great love story has a first chapter. Ours began somewhere unexpected, grew through laughter and late nights, and led us here — ready to begin the best chapter yet.</p>' +
            '<div class="story-milestones">' +
              '<div class="milestone">' +
                '<div class="milestone-dot"></div>' +
                '<div><span class="milestone-year">Add your year</span><p class="milestone-text">Where it all began — how did you meet?</p></div>' +
              '</div>' +
              '<div class="milestone">' +
                '<div class="milestone-dot" style="background:var(--rust)"></div>' +
                '<div><span class="milestone-year" style="color:var(--rust)">Add your year</span><p class="milestone-text">A milestone along the way — first trip, moving in together, etc.</p></div>' +
              '</div>' +
              '<div class="milestone">' +
                '<div class="milestone-dot" style="background:var(--forest)"></div>' +
                '<div><span class="milestone-year" style="color:var(--forest-mid)">Add your year</span><p class="milestone-text">The proposal — where, when, and how it happened</p></div>' +
              '</div>' +
              '<div class="milestone">' +
                '<div class="milestone-dot" style="background:var(--gold)"></div>' +
                '<div><span class="milestone-year" style="color:var(--gold)">6 Nov 2027</span><p class="milestone-text">We say "I do" surrounded by the people we love most</p></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
}

function renderGallerySection() {
  var container = document.getElementById('galleryContainer');
  if (!container) { return; }
  var photos = DEFAULT_PHOTO_MANIFEST.galleryPhotos;
  var cells = '';
  for (var i = 0; i < photos.length; i++) {
    cells +=
      '<div class="gallery-cell">' +
        '<div class="gallery-flip-inner">' +
          '<div class="gallery-flip-front">' +
            '<img class="gallery-photo" src="' + photos[i].url + '" alt="Emma and Alex gallery photo ' + (i + 1) + '" loading="lazy">' +
          '</div>' +
          '<div class="gallery-flip-back">' +
            '<p class="gallery-flip-text">' + escapeHtml(photos[i].subtext || '') + '</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  container.innerHTML =
    '<section id="gallery">' +
      '<div class="section-inner">' +
        '<span class="section-label">Us</span>' +
        '<h2 class="section-title">Photo Gallery</h2>' +
        '<div class="divider"></div>' +
        '<p class="section-body">A few of our favourite moments together — more to come as the big day approaches!</p>' +
        '<div class="gallery-grid" id="galleryGrid">' +
          cells +
        '</div>' +
        '<p class="gallery-note">Drop your files in <strong>images/photos</strong> and they will auto-load from <strong>backend/photos/manifest.json</strong>.</p>' +
      '</div>' +
    '</section>';
  container.addEventListener('click', function(e) {
    var cell = e.target.closest('.gallery-cell');
    if (!cell) { return; }
    var allCells = container.querySelectorAll('.gallery-cell');
    var index = Array.prototype.indexOf.call(allCells, cell);
    openLightbox(index);
  });
}

/* Gallery lightbox */
var lightboxIndex = 0;

function openLightbox(index) {
  var overlay = document.getElementById('lightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lightbox';
    overlay.className = 'lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Photo viewer');
    overlay.innerHTML =
      '<button class="lightbox-close" aria-label="Close">&times;</button>' +
      '<button class="lightbox-prev" aria-label="Previous photo">&#8249;</button>' +
      '<button class="lightbox-next" aria-label="Next photo">&#8250;</button>' +
      '<div class="lightbox-content">' +
        '<img class="lightbox-img" src="" alt="">' +
        '<p class="lightbox-caption"></p>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    overlay.querySelector('.lightbox-prev').addEventListener('click', function() { lightboxNav(-1); });
    overlay.querySelector('.lightbox-next').addEventListener('click', function() { lightboxNav(1); });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) { closeLightbox(); }
    });
    var touchStartX = 0;
    overlay.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    overlay.addEventListener('touchend', function(e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) { lightboxNav(dx > 0 ? -1 : 1); }
    }, { passive: true });
  }
  lightboxIndex = index;
  updateLightboxContent();
  overlay.classList.add('open');
  document.addEventListener('keydown', lightboxKeyHandler);
}

function closeLightbox() {
  var overlay = document.getElementById('lightbox');
  if (overlay) { overlay.classList.remove('open'); }
  document.removeEventListener('keydown', lightboxKeyHandler);
}

function lightboxNav(dir) {
  var cells = document.querySelectorAll('#galleryGrid .gallery-cell');
  lightboxIndex = (lightboxIndex + dir + cells.length) % cells.length;
  updateLightboxContent();
}

function lightboxKeyHandler(e) {
  if (e.key === 'Escape') { closeLightbox(); }
  else if (e.key === 'ArrowLeft') { lightboxNav(-1); }
  else if (e.key === 'ArrowRight') { lightboxNav(1); }
}

function updateLightboxContent() {
  var cells = document.querySelectorAll('#galleryGrid .gallery-cell');
  var cell = cells[lightboxIndex];
  if (!cell) { return; }
  var img = cell.querySelector('.gallery-photo');
  var text = cell.querySelector('.gallery-flip-text');
  var overlay = document.getElementById('lightbox');
  var lbImg = overlay.querySelector('.lightbox-img');
  lbImg.src = img ? img.src : '';
  lbImg.alt = img ? img.alt : '';
  overlay.querySelector('.lightbox-caption').textContent = text ? text.textContent : '';
}
