# Emma & Alex Wedding Website

> Wedding website for Emma Muers & Alex Edwards — 6th November 2027, Gaynes Park, Epping.
> Static HTML + vanilla JS/CSS. No build tools, no frameworks, no npm.

## Project Instructions

- Always communicate in English
- Use concise explanations
- Before changing files, explain the intended change
- Prefer small, reviewable commits
- Do not commit or push unless explicitly asked
- Do not add comments to code unless asked
- When modifying source files, update the relevant sections below to keep this file accurate

## File Index

| File | Purpose | Key Contents |
|------|---------|-------------|
| `index.html` | RSVP-only day guest page (613 lines) | Acknowledgement gate, guest lookup, RSVP form, fun mode, countdown, hero watermark, floating leaves |
| `index-full.html` | Full day guest page (820 lines) | Full acknowledgement gate with evening redirect, nav+hamburger, day schedule, venue grid, registry, full FAQ, fun mode, all sections |
| `evening.html` | Evening guest page (206 lines) | Redirect guard, guest banner, evening schedule, evening FAQ, RSVP |
| `registry.html` | Gift registry page | Registry item grid with category filters, reservation modal, honeymoon experiences section |
| `css/shared.css` | Common styles | CSS reset, variables, nav, sections, venue, FAQ, RSVP, story, gallery, registry, honeymoon, footer, lightbox, responsive |
| `js/shared.js` | Shared JS | Session, networking, party/RSVP logic, registry fetch/render/reserve, honeymoon experiences, section builders, photo manifest, visual effects, lightbox |
| `google-apps-script/Code.gs` | GAS backend | `doGet` (session+lookup+registry+honeymoon), `doPost` (acknowledgement+rsvp+registry-reserve+honeymoon-experience), email sending, Levenshtein matching, sheet I/O |
| `google-apps-script/Initialise.gs` | Deprecated stub | Merged into Code.gs |
| `google-apps-script/acknowledgements.gs` | Deprecated stub | Merged into Code.gs |
| `google-apps-script/url_lookup.md` | Deployment URL reference | Active Code.gs URL + deprecated file references |
| `backend/photos/manifest.json` | Gallery manifest (32 lines) | `mainPhoto` + `galleryPhotos[]` with `url` and `subtext` |
| `backend/photos/registry-manifest.json` | Registry image manifest | `items[]` with `itemId`, `image`, `alt` — maps registry items to product images |
| `images/registry/*.jpg` | Registry product images | `REG-001.jpg` through `REG-NNN.jpg`, square crop, 400–600px |
| `images/emi_alex_autumn_transparent.png` | Hero illustration | By Alice Krieits (@alice_krieits) |
| `images/alex_head.png` | Fun mode head | Flying head image |
| `images/emma_head.png` | Fun mode head | Flying head image |
| `images/photos/*.jpg` | Gallery photos | `main.jpg` + `small-1.jpg` through `small-6.jpg` |

## Semantic Map

### Check-in / Acknowledgement Flow
- Ack modal HTML: `index.html:183–198`, `index-full.html:383–398`
- Guest lookup (JSONP): `index.html:238–275`, `index-full.html:448–485`
- `checkNameMatch()`: `index.html:328–393`, `index-full.html:540–604`
- `submitAcknowledgement()`: `index.html:286–326`, `index-full.html:494–538`
- `renderMatchResult()`: `index.html:395–418`, `index-full.html:607–630`
- `unlockPage()`: `index.html:420–433`, `index-full.html:632–636`
- Evening redirect: `index-full.html:527–529` (in `submitAcknowledgement`)

### RSVP Flow
- RSVP form HTML: `index.html:146–181`, `index-full.html:346–381`, `evening.html:113–145`
- `submitRsvp()`: `js/shared.js:214–261`
- `renderIndividualRsvpChoices()`: `js/shared.js:117–142`
- `collectIndividualRsvp()`: `js/shared.js:144–153`
- `enableRsvpResubmission()`: `js/shared.js:175–181`

### Session / Networking
- `GOOGLE_SHEETS_WEBHOOK`: `js/shared.js:3`
- `initSession()`: `js/shared.js:10–47`
- `ensureSession()`: `js/shared.js:49–59`
- `postToGoogleSheets()`: `js/shared.js:71–90`

### Backend Endpoints
- `doGet()`: `Code.gs:24–71`
- `doPost()`: `Code.gs:73–102`
- Guest lookup: `Code.gs:217–302`
- RSVP email: `Code.gs:76–131`
- Acknowledgement email: `Code.gs:133–174`
- Registry items GET: `Code.gs` (`getRegistryItems_`)
- Registry reserve POST: `Code.gs` (`reserveRegistryItem_`, `sendRegistryReserveEmail_`)
- Honeymoon experiences GET: `Code.gs` (`getHoneymoonExperiences_`)
- Honeymoon experience POST: `Code.gs` (`appendHoneymoonRow_`, `sendHoneymoonEmail_`)

### Registry Images
- Registry manifest loading: `js/shared.js` (`loadRegistryManifest`)
- `registry-manifest.json`: `backend/photos/registry-manifest.json`
- Image map used by `renderRegistryItems()`: `REGISTRY_IMAGE_MAP`
- Fallback placeholder with category icons: `CATEGORY_ICONS`

### Section Builders
- `renderHeroCredit()`: `js/shared.js:408–417`
- `renderStorySection()`: `js/shared.js:419–456`
- `renderGallerySection()`: `js/shared.js:458–496`

### Photo Gallery
- Manifest loading: `js/shared.js:312–326`
- `manifest.json`: `backend/photos/manifest.json`
- Lightbox: `js/shared.js:498–568`

### Visual Effects
- Hero parallax: `js/shared.js:329–343`
- Countdown: `js/shared.js:346–369`
- Scroll reveal: `js/shared.js:389–404`
- Active nav: `js/shared.js:372–386`
- Floating leaves: `index.html:533–550`, `index-full.html:748–765`
- Hero watermark: `index.html:552–563`, `index-full.html:656–667`
- Fun mode (flying heads): `index.html:454–531`, `index-full.html:669–746`

### Evening Redirect Logic
- `index-full.html` acknowledges → checks `dayEvening === 'Evening'` → redirects to `evening.html` (`index-full.html:527–529`)
- `evening.html` DOMContentLoaded → validates party in localStorage → redirects to `index.html` if invalid (`evening.html:162–176`)

## Cross-Reference Index

### Authentication / Token
- Frontend token: `js/shared.js:3` (webhook URL), `js/shared.js:49–59` (session)
- Backend token: `Code.gs:18` (`SITE_TOKEN`), `Code.gs:213–215` (`validateToken_`)

### Email Notifications
- RSVP email: `Code.gs:76–131` (`sendRsvpEmail_`)
- Check-in email: `Code.gs:133–174` (`sendAcknowledgementEmail_`)
- Email log: `Code.gs:176–211` (`logEmailAttempt_`)

### Google Sheets
- Sheet names: `Code.gs:11–14`
- People sheet reading: `Code.gs` (`buildPeoplePayload_`)
- RSVP status lookup: `Code.gs` (`getRsvpStatusByPartyId_`)
- Response row append: `Code.gs` (`appendResponseRow_`)
- Acknowledgement row append: `Code.gs` (`appendAcknowledgementRow_`)
- Registry sheet reading: `Code.gs` (`getRegistryItems_`)
- Registry reserve: `Code.gs` (`reserveRegistryItem_`)
- Honeymoon sheet reading: `Code.gs` (`getHoneymoonExperiences_`)
- Honeymoon row append: `Code.gs` (`appendHoneymoonRow_`)

### localStorage
- Key definitions: See `.claude/context/architecture.md` → localStorage Keys section
- Read: `js/shared.js:92–100` (`getSavedParty`)
- Write: `index.html:316–318`, `index-full.html:523–526` (ack), `js/shared.js:252` (rsvp)

### CSS Variables
- All variables: `css/shared.css:5–21`
- Colour palette: `css/shared.css:6–21`

## Skills

| Skill | When to Use |
|-------|-------------|
| `add-page-section` | Adding a new section (HTML + CSS + nav link + mobile menu) |
| `deploy-gas` | Deploying Code.gs changes to Google Apps Script |
| `security-check` | Scanning for hardcoded secrets, CSP issues, XSS vectors |
| `sync-shared-code` | Verifying shared.js/css load correctly in both pages |
| `update-content` | Editing FAQ items, timeline events, venue details, registry links |
| `update-gallery` | Adding/removing/reordering gallery photos |

## Context Docs

Deep reference files in `.claude/context/` — read on demand for detailed questions:

| File | When to Read |
|------|-------------|
| `architecture.md` | Page lifecycle, data flow diagrams, session management, localStorage keys, PAGE_CONFIG per page |
| `api-reference.md` | Code.gs GET/POST endpoint specs, request/response schemas, error handling |
| `frontend-reference.md` | Complete shared.js function signatures, global variables, CSS architecture |
| `sheet-schemas.md` | Google Sheets column layouts for People, Responses, Acknowledgements, EmailLog, Registry, HoneymoonExperiences |
| `deployment.md` | Step-by-step deployment for frontend and backend |
