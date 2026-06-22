# SiteVault 🔐

A Chrome browser extension that lets you password-protect any website with a single master password. Only you can unlock protected sites.

## Features

✨ **Master Password Protection** - Set up a single master password that protects all your locked sites

🔒 **One-Click Site Locking** - Lock the current tab's website instantly or add sites manually

🎯 **Easy Management** - Add, remove, and manage protected sites from a clean, intuitive popup interface

🔑 **Secure Password Hashing** - Uses SHA-256 hashing for password security (stored locally in Chrome storage)

⚡ **Lightweight** - Minimal resource usage; works seamlessly in the background

🌐 **Cross-Domain Support** - Automatically detects and locks subdomains of protected sites

## How It Works

1. **First Setup**: When you first install the extension, create a master password (minimum 6 characters). This password will protect all your locked sites and cannot be recovered if forgotten.

2. **Locking Sites**: 
   - Click the **"Lock current tab's website"** button to quickly lock the website you're currently viewing
   - Or manually enter a domain in the text field and click **Add**

3. **Unlocking**: 
   - When you try to visit a locked site, a password prompt appears
   - Enter your master password to unlock the site for the current tab session
   - The tab remains unlocked until you close it

4. **Managing Sites**: 
   - View all locked sites in the popup interface
   - Remove sites by clicking the × button next to any site
   - Change your master password anytime from the main interface

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked** and select this repository folder
5. The SiteVault extension will now appear in your Chrome toolbar

## Usage

### Setting Up
- Click the SiteVault extension icon in your Chrome toolbar
- Enter a strong master password and confirm it
- Click **Create Password & Get Started**

### Locking Websites
- Navigate to the website you want to protect
- Click the SiteVault icon and choose **"Lock current tab's website"**
- Or manually type a domain and click **Add**

### Unlocking Websites
- Try to visit a locked site
- A popup will appear asking for your master password
- Enter the correct password to unlock the site for the current session

### Changing Your Password
- Click the SiteVault icon
- Click **Change password**
- Enter your current password, then your new password
- Click **Update Password**

### Removing a Site
- Click the SiteVault icon
- Click the × button next to the site you want to remove
- The site will no longer be protected

### Reset Everything
- Click the SiteVault icon
- Click **Reset all** 
- Confirm the action
- All sites and your master password will be deleted

## File Structure

```
sitevault-extension/
├── manifest.json          # Extension configuration
├── popup.html             # Popup UI interface
├── popup.js               # Popup interaction logic
├── background.js          # Background service worker (lock/unlock logic)
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This file
```

## Key Files Explained

### `manifest.json`
- Defines the extension as a Manifest V3 Chrome extension
- Declares permissions for storage, tabs, and scripting
- Registers the background service worker and popup interface

### `popup.js`
- Manages the extension popup UI and user interactions
- Handles site list rendering, adding/removing sites
- Manages password setup and changing
- Uses SHA-256 hashing for password storage

### `background.js`
- Monitors tab updates and detects navigation to locked sites
- Injects the lock screen overlay when a locked site is visited
- Handles password verification via message passing
- Manages session-based unlock state

## Security Notes

⚠️ **Important**: 
- Your master password is hashed using SHA-256 and stored locally in Chrome's storage
- Only the hash is stored, never the actual password
- If you forget your master password, **it cannot be recovered**
- Sites are locked only when you visit them; the extension doesn't prevent direct access via URL bar

## Browser Compatibility

- ✅ Chrome (Manifest V3)
- ✅ Edge (Manifest V3)
- ⚠️ Other Chromium-based browsers (may work, not officially tested)

## Privacy

- All data is stored **locally** on your computer in Chrome's local storage
- No data is sent to external servers or services
- No analytics or tracking
- Your locked sites list and password hash never leave your device

## Development

This extension is built with:
- **JavaScript** - Core logic and functionality
- **HTML** - Popup interface
- **CSS** - Styling and UI design
- **Chrome Extension APIs** - Storage, tabs, scripting

## Troubleshooting

### Password prompt doesn't appear when visiting a locked site
- Ensure you've added the site correctly (check for typos)
- Try refreshing the page
- Make sure the extension has permission to run on the site

### I forgot my master password
- Unfortunately, master passwords cannot be recovered
- You'll need to reset all settings and create a new password

### A site isn't getting locked even though I added it
- The site must be accessed via `http://` or `https://`
- Some pages (like new tab page, extensions page) cannot be locked

## License

This project is open source and available for personal and educational use.

## Support

For issues, questions, or suggestions, please open an issue in the repository.

---

**Made with ❤️ by [ankitkashikar](https://github.com/ankitkashikar)**
