chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading' || !tab.url) return;

  const url = tab.url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  const { lockedSites = [], masterHash = null } = await chrome.storage.local.get(['lockedSites', 'masterHash']);
  if (!masterHash || lockedSites.length === 0) return;

  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const isLocked = lockedSites.some(site => {
    const cleanSite = site.replace(/^www\./, '');
    return hostname === cleanSite || hostname.endsWith('.' + cleanSite);
  });

  if (!isLocked) return;

  const sessionKey = `unlocked_${tabId}`;
  const sessionData = await chrome.storage.session.get(sessionKey);
  if (sessionData[sessionKey]) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    func: injectLockScreen,
    args: [hostname]
  });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const sessionKey = `unlocked_${tabId}`;
  await chrome.storage.session.remove(sessionKey);
});

function injectLockScreen(hostname) {
  if (document.getElementById('sitevault-overlay')) return;

  document.documentElement.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.id = 'sitevault-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    width: 100vw; height: 100vh;
    background: #0f0f11;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      background: #1a1a1f;
      border: 0.5px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 40px;
      width: 360px;
      text-align: center;
      box-sizing: border-box;
    ">
      <div style="
        width: 56px; height: 56px;
        background: rgba(99,87,255,0.15);
        border-radius: 16px;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 20px;
        font-size: 26px;
      ">🔒</div>

      <h2 style="
        color: #fff;
        font-size: 18px;
        font-weight: 500;
        margin: 0 0 6px;
        letter-spacing: -0.3px;
      ">This site is locked</h2>

      <p style="
        color: rgba(255,255,255,0.45);
        font-size: 13px;
        margin: 0 0 28px;
      ">${hostname}</p>

      <input
        id="sv-password-input"
        type="password"
        placeholder="Enter master password"
        autocomplete="current-password"
        style="
          width: 100%;
          padding: 11px 14px;
          background: rgba(255,255,255,0.06);
          border: 0.5px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          margin-bottom: 12px;
          font-family: inherit;
          letter-spacing: 0.5px;
        "
      />

      <div id="sv-error" style="
        color: #ff6b6b;
        font-size: 12px;
        margin-bottom: 12px;
        min-height: 16px;
        display: none;
      ">Incorrect password. Try again.</div>

      <button id="sv-unlock-btn" style="
        width: 100%;
        padding: 11px;
        background: #6357ff;
        border: none;
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        letter-spacing: -0.2px;
        transition: opacity 0.15s;
      ">Unlock</button>

      <p style="
        color: rgba(255,255,255,0.2);
        font-size: 11px;
        margin: 16px 0 0;
      ">Protected by SiteVault</p>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  const input = document.getElementById('sv-password-input');
  const btn = document.getElementById('sv-unlock-btn');
  const errorEl = document.getElementById('sv-error');

  input.focus();

  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function tryUnlock() {
    const val = input.value.trim();
    if (!val) return;

    btn.textContent = '...';
    btn.style.opacity = '0.7';

    const hash = await sha256(val);
    chrome.runtime.sendMessage({ type: 'CHECK_PASSWORD', hash }, (res) => {
      if (res && res.success) {
        overlay.style.transition = 'opacity 0.25s';
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          document.documentElement.style.overflow = '';
        }, 250);
      } else {
        errorEl.style.display = 'block';
        input.value = '';
        input.focus();
        input.style.borderColor = 'rgba(255,107,107,0.5)';
        btn.textContent = 'Unlock';
        btn.style.opacity = '1';
        setTimeout(() => {
          input.style.borderColor = 'rgba(255,255,255,0.12)';
        }, 1500);
      }
    });
  }

  btn.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  input.addEventListener('input', () => { errorEl.style.display = 'none'; });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHECK_PASSWORD') {
    chrome.storage.local.get('masterHash', async ({ masterHash }) => {
      if (msg.hash === masterHash) {
        const sessionKey = `unlocked_${sender.tab.id}`;
        await chrome.storage.session.set({ [sessionKey]: true });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
    });
    return true;
  }
});
