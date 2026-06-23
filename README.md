<div align="center">

<img src="icons/icon128.png" alt="SiteVault Logo" width="80" />

# 🔐 SiteVault

**Password-protect any website in Chrome. Only you can unlock it.**

[![Version](https://img.shields.io/badge/version-1.0.0-6357ff?style=flat-square)](https://github.com/ankitkashikar/sitevault-extension/releases)
[![Manifest](https://img.shields.io/badge/Manifest-V3-green?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/ankitkashikar/sitevault-extension/pulls)

[Installation](#installation) · [Features](#features) · [How It Works](#how-it-works) · [Roadmap](#roadmap) · [Contributing](#contributing)

</div>

---

## What is SiteVault?

SiteVault is a Chrome Extension that lets you put a **master password lock** in front of any website. When you (or anyone else) visits a locked site, a full-screen password overlay blocks access until the correct password is entered.

Perfect for protecting:
- Personal dashboards with private data
- Financial or business analytics pages
- Admin panels and internal tools
- Any site you don't want others casually opening

---

## Features

| Feature | Status |
|---|---|
| 🔒 Master password protection for any site | ✅ v1 |
| ⚡ Lock current tab with one click | ✅ v1 |
| 🎨 Clean, dark-themed lock screen overlay | ✅ v1 |
| 🔑 SHA-256 password hashing (never stored in plain text) | ✅ v1 |
| 🌐 Subdomain-aware locking | ✅ v1 |
| 🔄 Session-scoped unlock (locked again when tab closes) | ✅ v1 |
| ☁️ Cloud sync across browsers via Chrome Sync | 🔜 v2 |
| 📱 OTP / TOTP unlock (Google Authenticator compatible) | 🔜 v2 |
| 📋 Local access logs (who tried, when, which site) | 🔜 v2 |
| 🔗 Temporary unlock links | 🔜 v2 |
| 👥 Team vaults & enterprise dashboard | 🔜 v3 |

---

## Why SiteVault?

Every existing tool is missing something critical:

| Product | Password Lock | Cloud Sync | OTP | Access Logs | Temp Links | Teams | Price |
|---|---|---|---|---|---|---|---|
| Any Site Lock | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Free |
| Website Protector | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Free |
| BlockSite | Partial | ✅ | ❌ | ❌ | ❌ | ❌ | $9/mo |
| Freedom | Partial | ✅ | ❌ | ❌ | ❌ | ✅ | $8/mo |
| Cold Turkey | Partial | ❌ | ❌ | ❌ | ❌ | ❌ | One-time |
| **🔐 SiteVault** | **✅** | **✅ v2** | **✅ v2** | **✅ v2** | **✅ v2** | **✅ v3** | **Free → Pro** |

**SiteVault is the only tool that will offer the complete package.**

---

## Installation

### Load unpacked (Developer mode)

1. Clone the repo:
   ```bash
   git clone https://github.com/ankitkashikar/sitevault-extension.git
   ```

2. Open Chrome and navigate to:
   ```
   chrome://extensions/
   ```

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the cloned `sitevault-extension` folder

5. The 🔐 SiteVault icon will appear in your Chrome toolbar

> Chrome Web Store release coming soon!

---

## How It Works

### First setup
Click the SiteVault icon → create your master password (min 6 chars) → you're done. The password is hashed with SHA-256 and stored locally. It's never recoverable, so choose something memorable.

### Locking a site
- Click **"Lock current tab's website"** to instantly lock whatever you're viewing
- Or type any domain (e.g. `analytics.myapp.com`) and click **Add**

### Visiting a locked site
A full-screen dark overlay blocks the page. Enter your master password to unlock — the site stays accessible until you close that tab.

### Managing your vault
From the popup you can:
- View all locked sites with favicons
- Remove any site with ×
- Change your master password
- Reset everything

---

## File Structure

```
sitevault-extension/
├── manifest.json        # Extension config (Manifest V3)
├── background.js        # Service worker — intercepts tabs, verifies passwords
├── content.js           # Content script placeholder
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic — site management, password flows
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Security

- Passwords are hashed with **SHA-256** via the Web Crypto API — only the hash is ever stored
- Unlock state is scoped to the **tab session** using `chrome.storage.session` — closes when the tab closes
- All data lives **locally on your device** — nothing is sent to any server (v1)
- Cloud sync in v2 will use **Chrome's built-in encrypted sync** — no third-party backend

> ⚠️ If you forget your master password, it cannot be recovered. Use **Reset all** to start fresh.

---

## Roadmap

### v2 — Coming next
- [ ] `chrome.storage.sync` — encrypted site list synced across all your Chrome browsers
- [ ] TOTP unlock — scan a QR code in Google Authenticator / Authy as a second unlock method
- [ ] Access logs — timestamped log of every unlock attempt, stored locally
- [ ] Temporary unlock links — generate a time-limited token to let someone else view a locked site

### v3 — Later
- [ ] Team vaults — shared site lists for small teams
- [ ] Enterprise dashboard — admin controls, member management
- [ ] Chrome Web Store release

---

## Browser Compatibility

| Browser | Support |
|---|---|
| Chrome | ✅ Full support |
| Edge (Chromium) | ✅ Works |
| Brave | ✅ Works |
| Firefox | ❌ Not supported (Manifest V3 differences) |

---

## Contributing

Pull requests are welcome! For major changes, open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/ankitkashikar/sitevault-extension.git
cd sitevault-extension

# make your changes, then:
git checkout -b feat/your-feature-name
git commit -m "feat: describe your change"
git push origin feat/your-feature-name
```

Then open a PR against `main`.

---

## License

MIT — free for personal and commercial use.

---

<div align="center">

Made with ❤️ by [ankitkashikar](https://github.com/ankitkashikar)

⭐ Star this repo if you find it useful!

</div>
