# Specification: Tuquet Storage Home UI & Dual i18n Modernization

## 1. Objective
Transform `storage.tuquet.com` from the upstream Chinese-centric default into an internationalized, polished **Tuquet Storage** web interface:
1. **Default Language**: Change default runtime language from Chinese (`zh-CN`) to English (`en`).
2. **Remove Chinese**: Completely deactivate and remove Chinese (`zh-CN`) from the user-facing switcher and runtime bundle.
3. **Vietnamese as Second Language**: Introduce full Vietnamese (`vi`) localization with natural, accurate technical terminology (e.g., *Tải lên tệp*, *Dán liên kết*, *Lịch sử tải lên*, *Quản lý hệ thống*), ensuring exactly **two supported languages**: English (default) and Vietnamese.
4. **Typography**: Load and enforce Google Font **Roboto** across the entire UI (body, inputs, buttons, headings, modals) with proper Vietnamese diacritics support.
5. **UI Polish & Modernization**: Refine visual styling with cleaner border radiuses, modern translucent glassmorphism (`backdrop-filter: blur`), subtle shadows, and streamlined header/upload card aesthetics.
6. **Tuquet Branding & Telegram Link**: Update the footer to display `© 2024-2026 Tuquet Storage • Powered by Tuquet` and link the paper-plane icon directly to the user's Telegram channel or profile.

---

## 2. Tech Stack & Environment
- **Runtime Environment**: Cloudflare Pages + Cloudflare Workers (Fullstack SPA + D1 SQLite + R2 Storage + KV Cache).
- **Frontend Framework**: Vue 3 + Vue I18n + Element Plus (pre-compiled production Webpack bundle in `storage/frontend-dist/`).
- **Typography Engine**: Google Fonts CDN (`Roboto:wght@300;400;500;700`).
- **Deployment Pipeline**: Git push via `git spush` (proxied to port 1080) to GitHub `main` triggering Cloudflare Pages automated CI/CD build.

---

## 3. Commands
Full executable commands for development, validation, and deployment:

```powershell
# 1. Inspect & test i18n bundle integrity
node scratch/check_i18n.js

# 2. Local preview server (verify UI changes locally)
pnpm dlx serve storage/frontend-dist -l 3000

# 3. Synchronize bundle gzip archives (prevent Cloudflare from serving stale pre-compressed .gz)
node scripts/sync_dist_gz.js

# 4. Check git status and diff before committing
git status
git diff --stat

# 5. Commit and push through authenticated bridge proxy
git add storage/frontend-dist/ storage/SPEC-home-ui-i18n.md
git commit -m "feat(storage): localize to EN/VI, apply Roboto font and Tuquet branding"
git spush origin main
```

---

## 4. Project Structure
```
storage/
├── frontend-dist/                  # Pre-compiled static assets deployed to Cloudflare Pages
│   ├── index.html                  # HTML entry point (font preloads, meta, inline style overrides)
│   ├── css/
│   │   ├── app.8cc342f4.css        # Core application styles (Roboto font-family binding)
│   │   └── chunk-vendors.*.css     # Vendor styles (Element Plus)
│   ├── js/
│   │   ├── app.aabb17e3.js         # Core app logic & i18n dictionaries (en + vi dictionaries)
│   │   ├── 26.f3f9500c.js          # Home page route & Footer component (Tuquet branding & Telegram)
│   │   ├── 166.85a3acb9.js         # Navbar language switcher component
│   │   └── 660.3e056ef5.js         # Admin / System status locale binding
│   └── static/media/               # Logos and icons
├── functions/                      # Cloudflare Pages Functions API backend
├── SPEC-home-ui-i18n.md            # In-repo persistent specification
└── wrangler.toml                   # Cloudflare Pages configuration
```

---

## 5. Code Style & Bundle Architecture
Bundle patching must be surgical, byte-safe, and UTF-8 encoded with no broken AST closures.

### A. i18n Runtime Replacement (`storage/frontend-dist/js/app.aabb17e3.js`)
- Replace locale initialization:
```javascript
// Before
const l="app-locale",r="zh-CN",s=new Set(["zh-CN","en"]);
const u=(0,o.hU)({legacy:!0,locale:c()||r,fallbackLocale:r,messages:{"zh-CN":n,en:i}});
function p(e){u.global.locale=e,document.documentElement.lang="zh-CN"===e?"zh-CN":"en"}

// After
const l="app-locale",r="en",s=new Set(["en","vi"]);
const u=(0,o.hU)({legacy:!0,locale:c()||r,fallbackLocale:r,messages:{en:i,vi:v}});
function p(e){u.global.locale=e,document.documentElement.lang="vi"===e?"vi":"en"}
```
- Provide `v` containing 37 translated Vietnamese keys mirroring the English schema `i` verbatim (`login`, `upload`, `uploadForm`, `uploadSettings`, `uploadHistory`, `settings`, `dashboard`, `dashboardTabs`, `fileDetail`, `filter`, `moveFile`, `batchTag`, `tagManagement`, `mobileAction`, `mobileDirectory`, `sysConfig`, `sysConfigTabs`, `dateRangeCalendar`, `sysStatus`, `sysUpload`, `sysSecurity`, `sysPage`, `sysOthers`, `customerConfig`, `publicBrowse`, `transformMedia`, `directoryTree`, `floatingSave`, `theme`, `common`, `validation`, `language`, `whitelist`, `sysAI`, `aiTags`, `adminAuthWarning`, `aiErrors`).

### B. Language Switcher Buttons (`26.f3f9500c.js`, `166.85a3acb9.js`, `380.a5313342.js`)
- Switch options: Toggle between `en` and `vi`.
- Display label:
```javascript
// In 26.f3f9500c.js dropdown:
"en"===e.$i18n.locale ? "Tiếng Việt" : "English"
```

### C. Footer Component (`26.f3f9500c.js`)
```javascript
// Render Tuquet branding & dynamic/configured Telegram link:
[(0,a.eW)("© 2024-"+(0,l.v_)(d.thisYear)+" "), (0,a.Lk)("a",{class:"footer-name",href:"https://tuquet.com",target:"_blank"},"Tuquet Storage",-1), (0,a.eW)(" • Powered by Tuquet | ",-1), (0,a.Lk)("a",{href:d.footerTelegramLink,target:"_blank",title:"Telegram"},[(0,a.bF)(c,{icon:"paper-plane",class:"footer-link-icon"})],8,s)]
```

### D. Typography & CSS Polish (`index.html` & `app.8cc342f4.css`)
- Embed Google Fonts Roboto in `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap" rel="stylesheet">
```
- Apply global font override and modernized aesthetic rules:
```css
body, #app, button, input, select, textarea, .el-dialog, .el-dropdown-menu {
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
}
.upload-card {
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}
```

---

## 6. Testing Strategy
1. **Node Syntax & JSON Validation**:
   - Run verification script to load patched JS bundles into a sandboxed V8 context to verify syntax and ensure `JSON.parse` does not throw syntax or escaping errors.
2. **Pre-compression Asset Synchronization**:
   - Either regenerate or remove matching `.gz` files in `storage/frontend-dist/` so Cloudflare Pages never serves stale Chinese gzipped bundles.
3. **Local Dev HTTP Verification**:
   - Serve `storage/frontend-dist` locally via HTTP server.
   - Verify:
     - Root page loads with `lang="en"` by default.
     - Toggle switches cleanly to Vietnamese (`vi`) and back to English (`en`).
     - No Chinese characters appear in standard UI paths.
     - Font is rendered in Roboto.
     - Footer shows Tuquet branding and opens Telegram.
4. **Production Verification on Cloudflare Pages**:
   - Push commit to GitHub `main` via `git spush`.
   - Run curl probes against `https://storage.tuquet.com` to verify HTTP 200, updated `<title>`, updated footer strings, and proper locale headers.

---

## 7. Boundaries
- **Always do**:
  - Always keep a complete backup of any patched bundle files before editing.
  - Always validate JavaScript and JSON syntax before committing.
  - Always clean or regenerate `.gz` pre-compressed companion files when modifying `.js`/`.css`/`.html`.
  - Always use `git spush` (routing through `127.0.0.1:1080`) to push commits.
- **Ask first**:
  - Changing upstream API backend endpoints or database schemas.
  - Adding external npm packages to the bundle.
- **Never do**:
  - Never retain hardcoded Chinese strings in the default user interface.
  - Never push commits without running local bundle syntax verification.
  - Never commit credentials, private API keys, or raw tokens into git.

---

## 8. Success Criteria
- [ ] Default language when opening `https://storage.tuquet.com` in an incognito/new window is English (`en`).
- [ ] Language toggle offers only two choices: English (`English`) and Vietnamese (`Tiếng Việt`). Chinese is completely gone.
- [ ] Switching between English and Vietnamese updates the entire home page UI instantly.
- [ ] Font family across the page is **Roboto**.
- [ ] Home UI looks refined, modern, and clean.
- [ ] Footer displays Tuquet copyright and user's Telegram link.
- [ ] Live deployment on `https://storage.tuquet.com` verified healthy.

---

## 9. Assumptions Made
1. **Telegram Link**: Unless specified otherwise, we will link the Telegram paper-plane icon to `https://t.me/tuquet` or the user's specific Telegram handle.
2. **Pre-compressed `.gz` files**: We assume deleting stale `.gz` files in `frontend-dist` allows Cloudflare Pages to serve the updated uncompressed assets with on-the-fly brotli/gzip compression, ensuring immediate cache freshness.
3. **No Upstream Source Recompilation Required**: We assume direct bundle patching is preferable to setting up the upstream Vue CLI/Webpack toolchain from scratch, following our Ponytail Standard (fastest, cleanest, zero-dependency).
