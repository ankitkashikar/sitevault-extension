// ─────────────────────────────────────────────
//  SiteVault v2 — Background Service Worker
//  Features: Cloud Sync, Access Logs, OTP, Temp Unlock Links
// ─────────────────────────────────────────────

// ── Helpers ──────────────────────────────────

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getConfig() {
  // lockedSites & otpSecret use sync (cloud); logs & tempTokens use local
  const syncData = await chrome.storage.sync.get(['lockedSites', 'masterHash', 'otpSecret']);
  const localData = await chrome.storage.local.get(['accessLogs', 'tempTokens']);
  return { ...syncData, ...localData };
}

// ── Access Logging ────────────────────────────

async function addLog(entry) {
  const { accessLogs = [] } = await chrome.storage.local.get('accessLogs');
  accessLogs.unshift({ ...entry, timestamp: Date.now() });
  // Keep last 200 entries
  if (accessLogs.length > 200) accessLogs.splice(200);
  await chrome.storage.local.set({ accessLogs });
}

// ── TOTP (RFC 6238) ───────────────────────────

function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const output = [];
  for (const char of base32.toUpperCase().replace(/=+$/, '')) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function generateTOTP(secret, timeStep = 30) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(4, counter, false);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmac = new Uint8Array(signature);
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

async function verifyTOTP(secret, token) {
  // Check ±4 windows (covers ±2 minutes) — handles Apple Passwords & clock drift
  const tokenStr = token.toString().trim();
  const key = base32Decode(secret);
  const timeStep = 30;

  for (const drift of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
    const counter = Math.floor(Date.now() / 1000 / timeStep) + drift;
    const counterBuffer = new ArrayBuffer(8);
    new DataView(counterBuffer).setUint32(4, counter, false);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
    const hmac = new Uint8Array(signature);
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % 1000000;
    if (code.toString().padStart(6, '0') === tokenStr) return true;
  }
  return false;
}

// ── Temp Unlock Tokens ────────────────────────

async function generateTempToken(hostname, durationMinutes) {
  const tokenBytes = new Uint8Array(16);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = Date.now() + durationMinutes * 60 * 1000;

  const { tempTokens = {} } = await chrome.storage.local.get('tempTokens');
  tempTokens[token] = { hostname, expiresAt, createdAt: Date.now() };
  await chrome.storage.local.set({ tempTokens });

  return token;
}

async function verifyTempToken(token, hostname) {
  const { tempTokens = {} } = await chrome.storage.local.get('tempTokens');
  const entry = tempTokens[token];
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    // Clean up expired token
    delete tempTokens[token];
    await chrome.storage.local.set({ tempTokens });
    return false;
  }
  const cleanHostname = hostname.replace(/^www\./, '');
  const cleanEntry = entry.hostname.replace(/^www\./, '');
  return cleanHostname === cleanEntry || cleanHostname.endsWith('.' + cleanEntry);
}

// ── Tab Interception ──────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading' || !tab.url) return;
  const url = tab.url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  // Check for temp token in URL hash: #sitevault-token=XXXX
  const hashMatch = url.match(/#sitevault-token=([a-f0-9]+)/i);
  if (hashMatch) {
    const token = hashMatch[1];
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const valid = await verifyTempToken(token, hostname);
    if (valid) {
      const sessionKey = `unlocked_${tabId}`;
      await chrome.storage.session.set({ [sessionKey]: true });
      await addLog({ site: hostname, method: 'temp_link', success: true });
      return;
    }
  }

  const { lockedSites = [], masterHash = null } = await getConfig();
  if (!masterHash || lockedSites.length === 0) return;

  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const isLocked = lockedSites.some(site => {
    const clean = site.replace(/^www\./, '');
    return hostname === clean || hostname.endsWith('.' + clean);
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
  await chrome.storage.session.remove(`unlocked_${tabId}`);
});

// ── Lock Screen Injection ─────────────────────

function injectLockScreen(hostname) {
  if (document.getElementById('sitevault-overlay')) return;
  document.documentElement.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.id = 'sitevault-overlay';
  overlay.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    width:100vw;height:100vh;
    background:#0f0f11;
    z-index:2147483647;
    display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  `;

  overlay.innerHTML = `
    <div style="background:#1a1a1f;border:0.5px solid rgba(255,255,255,0.1);border-radius:16px;padding:36px;width:360px;text-align:center;box-sizing:border-box;">
      <div style="width:52px;height:52px;background:rgba(99,87,255,0.15);border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:24px;">🔒</div>
      <h2 style="color:#fff;font-size:17px;font-weight:500;margin:0 0 5px;letter-spacing:-0.3px;">This site is locked</h2>
      <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0 0 24px;">${hostname}</p>

      <!-- Tab switcher -->
      <div id="sv-tabs" style="display:flex;background:rgba(255,255,255,0.05);border-radius:8px;padding:3px;margin-bottom:20px;gap:3px;">
        <button id="sv-tab-pass" style="flex:1;padding:7px;border:none;border-radius:6px;background:#6357ff;color:#fff;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;">Password</button>
        <button id="sv-tab-otp" style="flex:1;padding:7px;border:none;border-radius:6px;background:transparent;color:rgba(255,255,255,0.4);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;">OTP Code</button>
      </div>

      <!-- Password panel -->
      <div id="sv-panel-password">
        <input id="sv-pass-input" type="password" placeholder="Enter master password" autocomplete="current-password"
          style="width:100%;padding:10px 13px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box;margin-bottom:10px;font-family:inherit;" />
      </div>

      <!-- OTP panel -->
      <div id="sv-panel-otp" style="display:none;">
        <input id="sv-otp-input" type="text" placeholder="Enter 6-digit OTP code" maxlength="6" inputmode="numeric"
          style="width:100%;padding:10px 13px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:20px;letter-spacing:8px;text-align:center;outline:none;box-sizing:border-box;margin-bottom:10px;font-family:inherit;" />
      </div>

      <div id="sv-error" style="color:#ff6b6b;font-size:12px;margin-bottom:10px;min-height:16px;display:none;">Incorrect. Try again.</div>
      <button id="sv-unlock-btn" style="width:100%;padding:10px;background:#6357ff;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;">Unlock</button>
      <p style="color:rgba(255,255,255,0.18);font-size:11px;margin:14px 0 0;">Protected by SiteVault</p>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  // Tab switcher logic — using addEventListener (onclick attributes blocked by page CSP)
  function svSwitchTab(tab) {
    const isPass = tab === 'password';
    document.getElementById('sv-panel-password').style.display = isPass ? 'block' : 'none';
    document.getElementById('sv-panel-otp').style.display = isPass ? 'none' : 'block';
    document.getElementById('sv-tab-pass').style.background = isPass ? '#6357ff' : 'transparent';
    document.getElementById('sv-tab-pass').style.color = isPass ? '#fff' : 'rgba(255,255,255,0.4)';
    document.getElementById('sv-tab-otp').style.background = isPass ? 'transparent' : '#6357ff';
    document.getElementById('sv-tab-otp').style.color = isPass ? 'rgba(255,255,255,0.4)' : '#fff';
    document.getElementById('sv-error').style.display = 'none';
    setTimeout(() => {
      const input = isPass ? document.getElementById('sv-pass-input') : document.getElementById('sv-otp-input');
      if (input) input.focus();
    }, 50);
  }

  document.getElementById('sv-tab-pass').addEventListener('click', () => svSwitchTab('password'));
  document.getElementById('sv-tab-otp').addEventListener('click', () => svSwitchTab('otp'));

  const passInput = document.getElementById('sv-pass-input');
  const otpInput = document.getElementById('sv-otp-input');
  const btn = document.getElementById('sv-unlock-btn');
  const errorEl = document.getElementById('sv-error');

  passInput.focus();

  async function tryUnlock() {
    const isOtpTab = document.getElementById('sv-panel-otp').style.display !== 'none';
    const val = isOtpTab ? otpInput.value.trim() : passInput.value.trim();
    if (!val) return;

    btn.textContent = '...';
    btn.style.opacity = '0.7';

    let hash = null;
    if (!isOtpTab) {
      hash = await (async (msg) => {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
      })(val);
    }

    chrome.runtime.sendMessage({ type: 'CHECK_UNLOCK', hash, otpToken: isOtpTab ? val : null, hostname }, (res) => {
      if (res && res.success) {
        overlay.style.transition = 'opacity 0.25s';
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.remove(); document.documentElement.style.overflow = ''; }, 250);
      } else {
        errorEl.style.display = 'block';
        errorEl.textContent = res?.reason || 'Incorrect. Try again.';
        passInput.value = ''; otpInput.value = '';
        const activeInput = isOtpTab ? otpInput : passInput;
        activeInput.style.borderColor = 'rgba(255,107,107,0.5)';
        activeInput.focus();
        btn.textContent = 'Unlock'; btn.style.opacity = '1';
        setTimeout(() => { activeInput.style.borderColor = 'rgba(255,255,255,0.12)'; }, 1500);
      }
    });
  }

  btn.addEventListener('click', tryUnlock);
  passInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  otpInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  [passInput, otpInput].forEach(i => i.addEventListener('input', () => { errorEl.style.display = 'none'; }));
}

// ── Message Handler ───────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Verify password or OTP unlock
  if (msg.type === 'CHECK_UNLOCK') {
    (async () => {
      const { masterHash, otpSecret } = await getConfig();
      const hostname = msg.hostname || 'unknown';

      // Password check
      if (msg.hash) {
        if (msg.hash === masterHash) {
          await chrome.storage.session.set({ [`unlocked_${sender.tab.id}`]: true });
          await addLog({ site: hostname, method: 'password', success: true });
          sendResponse({ success: true });
        } else {
          await addLog({ site: hostname, method: 'password', success: false });
          sendResponse({ success: false, reason: 'Incorrect password.' });
        }
        return;
      }

      // OTP check
      if (msg.otpToken) {
        if (!otpSecret) {
          sendResponse({ success: false, reason: 'OTP not set up. Use password instead.' });
          return;
        }
        const valid = await verifyTOTP(otpSecret, msg.otpToken);
        if (valid) {
          await chrome.storage.session.set({ [`unlocked_${sender.tab.id}`]: true });
          await addLog({ site: hostname, method: 'otp', success: true });
          sendResponse({ success: true });
        } else {
          await addLog({ site: hostname, method: 'otp', success: false });
          sendResponse({ success: false, reason: 'Invalid OTP code.' });
        }
        return;
      }

      sendResponse({ success: false });
    })();
    return true;
  }

  // Generate temp token
  if (msg.type === 'GENERATE_TEMP_TOKEN') {
    (async () => {
      const token = await generateTempToken(msg.hostname, msg.durationMinutes || 60);
      sendResponse({ token });
    })();
    return true;
  }

  // Get access logs
  if (msg.type === 'GET_LOGS') {
    (async () => {
      const { accessLogs = [] } = await chrome.storage.local.get('accessLogs');
      sendResponse({ logs: accessLogs });
    })();
    return true;
  }

  // Clear logs
  if (msg.type === 'CLEAR_LOGS') {
    chrome.storage.local.set({ accessLogs: [] }, () => sendResponse({ success: true }));
    return true;
  }

  // Generate OTP secret + QR data
  if (msg.type === 'GENERATE_OTP_SECRET') {
    (async () => {
      // Reuse existing pending secret — prevents new QR on every re-render
      const existing = await chrome.storage.local.get('pendingOtpSecret');
      let secret = existing.pendingOtpSecret;
      if (!secret) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        secret = '';
        const arr = new Uint8Array(20);
        crypto.getRandomValues(arr);
        arr.forEach(b => { secret += chars[b % 32]; });
        await chrome.storage.local.set({ pendingOtpSecret: secret });
      }
      const otpAuthUrl = `otpauth://totp/SiteVault:vault@sitevault.app?secret=${secret}&issuer=SiteVault&algorithm=SHA1&digits=6&period=30`;
      sendResponse({ secret, otpAuthUrl });
    })();
    return true;
  }

  // Save OTP secret (moves from pending to confirmed)
  if (msg.type === 'SAVE_OTP_SECRET') {
    (async () => {
      await chrome.storage.sync.set({ otpSecret: msg.secret });
      await chrome.storage.local.remove('pendingOtpSecret');
      sendResponse({ success: true });
    })();
    return true;
  }

  // Remove OTP
  if (msg.type === 'REMOVE_OTP') {
    (async () => {
      await chrome.storage.sync.remove('otpSecret');
      await chrome.storage.local.remove('pendingOtpSecret');
      sendResponse({ success: true });
    })();
    return true;
  }

  // Clear pending OTP (user cancelled setup)
  if (msg.type === 'CLEAR_PENDING_OTP') {
    chrome.storage.local.remove('pendingOtpSecret', () => sendResponse({ success: true }));
    return true;
  }

  // Get temp tokens
  if (msg.type === 'GET_TEMP_TOKENS') {
    (async () => {
      const { tempTokens = {} } = await chrome.storage.local.get('tempTokens');
      // Clean expired ones before returning
      const now = Date.now();
      let changed = false;
      for (const [k, v] of Object.entries(tempTokens)) {
        if (now > v.expiresAt) { delete tempTokens[k]; changed = true; }
      }
      if (changed) await chrome.storage.local.set({ tempTokens });
      sendResponse({ tempTokens });
    })();
    return true;
  }

  // Revoke temp token
  if (msg.type === 'REVOKE_TEMP_TOKEN') {
    (async () => {
      const { tempTokens = {} } = await chrome.storage.local.get('tempTokens');
      delete tempTokens[msg.token];
      await chrome.storage.local.set({ tempTokens });
      sendResponse({ success: true });
    })();
    return true;
  }
});
