// ─────────────────────────────────────────────
//  SiteVault v2 — Popup Logic
// ─────────────────────────────────────────────

async function sha256(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert ${type}`;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function cleanHostname(raw) {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '')
    .split('/')[0].split('?')[0].split('#')[0];
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function timeUntil(ts) {
  const diff = Math.floor((ts - Date.now()) / 1000);
  if (diff <= 0) return 'expired';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function sendMsg(type, data = {}) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, ...data }, resolve));
}

// ── Init ─────────────────────────────────────

async function init() {
  const { masterHash } = await chrome.storage.sync.get('masterHash');
  if (!masterHash) {
    showView('view-setup');
    initSetup();
  } else {
    showView('view-main');
    initNav();
    loadSitesPanel();
  }
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

// ── Setup ─────────────────────────────────────

function initSetup() {
  document.getElementById('setup-btn').addEventListener('click', async () => {
    const pass = document.getElementById('setup-pass').value;
    const confirm = document.getElementById('setup-confirm').value;
    hideAlert('setup-error');
    if (pass.length < 6) return showAlert('setup-error', 'Password must be at least 6 characters.');
    if (pass !== confirm) return showAlert('setup-error', 'Passwords do not match.');
    const hash = await sha256(pass);
    await chrome.storage.sync.set({ masterHash: hash, lockedSites: [] });
    showView('view-main');
    initNav();
    loadSitesPanel();
  });
  document.getElementById('setup-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('setup-confirm').focus();
  });
  document.getElementById('setup-confirm').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('setup-btn').click();
  });
}

// ── Navigation ────────────────────────────────

function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panelEl = document.getElementById('panel-' + panel);
      if (panelEl) panelEl.classList.add('active');
      if (panel === 'sites') loadSitesPanel();
      if (panel === 'logs') loadLogsPanel();
      if (panel === 'otp') loadOtpPanel();
      if (panel === 'links') loadLinksPanel();
      if (panel === 'settings') initSettings();
    });
  });
}

// ── Sites Panel ───────────────────────────────

async function loadSitesPanel() {
  const { lockedSites = [] } = await chrome.storage.sync.get('lockedSites');
  const list = document.getElementById('site-list');
  list.innerHTML = '';

  if (lockedSites.length === 0) {
    list.innerHTML = '<div class="empty-state">🔓<br>No sites locked yet.<br>Add a site above to get started.</div>';
  } else {
    lockedSites.forEach(site => {
      const li = document.createElement('li');
      li.className = 'site-item';
      li.innerHTML = `
        <div class="site-favicon"><img src="https://www.google.com/s2/favicons?sz=32&domain=${site}" onerror="this.parentElement.textContent='🌐'" /></div>
        <span class="site-name">${site}</span>
        <button class="site-remove" data-site="${site}">×</button>
      `;
      list.appendChild(li);
    });
    list.querySelectorAll('.site-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        let { lockedSites = [] } = await chrome.storage.sync.get('lockedSites');
        lockedSites = lockedSites.filter(s => s !== btn.dataset.site);
        await chrome.storage.sync.set({ lockedSites });
        loadSitesPanel();
      });
    });
  }

  // Re-attach add buttons every time panel loads
  const addCurrentBtn = document.getElementById('add-current-btn');
  const manualAddBtn = document.getElementById('manual-add-btn');
  const manualInput = document.getElementById('manual-site-input');

  // Clone to remove old listeners
  const newAddCurrent = addCurrentBtn.cloneNode(true);
  const newManualAdd = manualAddBtn.cloneNode(true);
  addCurrentBtn.parentNode.replaceChild(newAddCurrent, addCurrentBtn);
  manualAddBtn.parentNode.replaceChild(newManualAdd, manualAddBtn);

  newAddCurrent.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('http')) {
      return showAlert('sites-error', 'Cannot lock this type of page.');
    }
    await addSite(cleanHostname(new URL(tab.url).hostname));
  });

  newManualAdd.addEventListener('click', async () => {
    await addSite(cleanHostname(manualInput.value));
    manualInput.value = '';
  });

  manualInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') newManualAdd.click();
  });
}

async function addSite(hostname) {
  hideAlert('sites-error');
  if (!hostname || hostname.length < 3 || !hostname.includes('.')) {
    return showAlert('sites-error', 'Please enter a valid domain like example.com');
  }
  let { lockedSites = [] } = await chrome.storage.sync.get('lockedSites');
  if (lockedSites.includes(hostname)) return showAlert('sites-error', `${hostname} is already protected.`);
  lockedSites.push(hostname);
  await chrome.storage.sync.set({ lockedSites });
  showAlert('sites-success', `${hostname} is now locked 🔒`, 'success');
  loadSitesPanel();
}

// ── Logs Panel ────────────────────────────────

async function loadLogsPanel() {
  const res = await sendMsg('GET_LOGS');
  const logs = res?.logs || [];
  const el = document.getElementById('logs-list');

  if (logs.length === 0) {
    el.innerHTML = '<div class="empty-state">📋<br>No access attempts yet.<br>Unlock attempts will appear here.</div>';
  } else {
    el.innerHTML = logs.slice(0, 100).map(log => `
      <div class="log-item">
        <div class="log-dot ${log.success ? 'success' : 'fail'}"></div>
        <div class="log-info">
          <div class="log-site">${log.site}</div>
          <div class="log-meta">${log.success ? 'Unlocked' : 'Failed'} · ${timeAgo(log.timestamp)}</div>
        </div>
        <span class="log-badge ${log.method}">${log.method === 'temp_link' ? '🔗 link' : log.method === 'otp' ? '📱 otp' : '🔑 pass'}</span>
      </div>
    `).join('');
  }

  const clearBtn = document.getElementById('clear-logs-btn');
  const newClearBtn = clearBtn.cloneNode(true);
  clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
  newClearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all access logs?')) return;
    await sendMsg('CLEAR_LOGS');
    loadLogsPanel();
  });
}

// ── OTP Panel ─────────────────────────────────

async function loadOtpPanel() {
  const { otpSecret } = await chrome.storage.sync.get('otpSecret');
  const panel = document.getElementById('panel-otp');

  if (otpSecret) {
    // OTP already enabled
    panel.innerHTML = `
      <div class="otp-status">
        <span class="otp-status-icon">✅</span>
        <div class="otp-status-text">
          <div class="otp-status-title">OTP is enabled</div>
          <div class="otp-status-sub">Google Authenticator compatible</div>
        </div>
      </div>
      <div class="alert info" style="display:block;margin-bottom:14px;">
        Use a 6-digit code from your authenticator app to unlock any protected site.
      </div>
      <button class="btn danger full" id="disable-otp-btn">Disable OTP</button>
    `;
    document.getElementById('disable-otp-btn').addEventListener('click', async () => {
      if (!confirm('Disable OTP? You can re-enable it anytime.')) return;
      await sendMsg('REMOVE_OTP');
      loadOtpPanel();
    });

  } else {
    // OTP not set up — show setup flow
    panel.innerHTML = `
      <div class="otp-status">
        <span class="otp-status-icon">📱</span>
        <div class="otp-status-text">
          <div class="otp-status-title">OTP not enabled</div>
          <div class="otp-status-sub">Add a 2nd unlock method</div>
        </div>
      </div>
      <p style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:14px;line-height:1.6;">
        Use Google Authenticator or Authy to unlock sites with a 6-digit code instead of your password.
      </p>
      <button class="btn primary full" id="setup-otp-btn">Set up OTP</button>
      <div id="otp-qr-area" style="display:none;margin-top:16px;"></div>
    `;

    document.getElementById('setup-otp-btn').addEventListener('click', async () => {
      const btn = document.getElementById('setup-otp-btn');
      btn.textContent = 'Generating...';
      btn.disabled = true;

      // Generate secret and IMMEDIATELY save it to storage as pending
      // This ensures verify always uses the exact same secret that was shown
      const result = await sendMsg('GENERATE_OTP_SECRET');
      const { secret, otpAuthUrl } = result;

      // Secret is already saved as pendingOtpSecret in background.js
      // No need to save again here — prevents double-save race condition

      const qrArea = document.getElementById('otp-qr-area');
      qrArea.style.display = 'block';
      btn.style.display = 'none';

      qrArea.innerHTML = `
        <div class="qr-container">
          <img id="otp-qr-img"
            src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(otpAuthUrl)}&bgcolor=1a1a1f&color=ffffff&qzone=1"
            width="150" height="150" style="border-radius:8px;display:block;margin:0 auto 10px;"
          />
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:10px;">Scan with Google Authenticator or Authy</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:6px;">Or enter this key manually:</div>
          <div id="otp-secret-box" class="secret-box">${secret}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.25);margin-bottom:14px;">Tap key to copy</div>
        </div>
        <div class="alert info" style="display:block;margin-bottom:12px;">
          After scanning, enter the 6-digit code to verify and activate OTP.
        </div>
        <input type="text" id="otp-verify-input" placeholder="Enter 6-digit code"
          maxlength="6" inputmode="numeric"
          style="width:100%;padding:10px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:22px;letter-spacing:10px;text-align:center;outline:none;font-family:inherit;box-sizing:border-box;margin-bottom:10px;"
        />
        <div class="alert error" id="otp-verify-error" style="display:none;"></div>
        <button class="btn primary full" id="otp-verify-btn">Verify & Enable OTP</button>
        <button class="btn secondary full" id="otp-start-over-btn" style="margin-top:8px;">Start Over (get new QR)</button>
      `;

      document.getElementById('otp-secret-box').addEventListener('click', () => {
        navigator.clipboard.writeText(secret).catch(() => {});
        document.getElementById('otp-secret-box').textContent = '✓ Copied!';
        setTimeout(() => { document.getElementById('otp-secret-box').textContent = secret; }, 1500);
      });

      document.getElementById('otp-verify-btn').addEventListener('click', async () => {
        const token = document.getElementById('otp-verify-input').value.trim();
        hideAlert('otp-verify-error');
        if (token.length !== 6 || isNaN(token)) {
          return showAlert('otp-verify-error', 'Please enter the 6-digit code from your app.');
        }
        const verifyBtn = document.getElementById('otp-verify-btn');
        verifyBtn.textContent = 'Verifying...';
        verifyBtn.disabled = true;

        // First save pending secret as confirmed, then verify
        await sendMsg('SAVE_OTP_SECRET', { secret });
        const res = await sendMsg('CHECK_UNLOCK', { otpToken: token, hostname: 'setup-verification' });

        if (res && res.success) {
          loadOtpPanel();
        } else {
          // Verification failed — remove confirmed secret, keep pending so QR stays same
          await sendMsg('REMOVE_OTP');
          verifyBtn.textContent = 'Verify & Enable OTP';
          verifyBtn.disabled = false;
          showAlert('otp-verify-error', 'Code incorrect. Wait for a new code and try again, or tap Start Over to rescan.');
        }
      });

      document.getElementById('otp-verify-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('otp-verify-btn').click();
      });

      document.getElementById('otp-start-over-btn').addEventListener('click', async () => {
        // Clear pending secret so a brand new one is generated
        await sendMsg('CLEAR_PENDING_OTP');
        await sendMsg('REMOVE_OTP');
        loadOtpPanel();
      });
    });
  }
}

// ── Temp Links Panel ──────────────────────────

async function loadLinksPanel() {
  await renderTokenList();

  const genBtn = document.getElementById('generate-link-btn');
  const newGenBtn = genBtn.cloneNode(true);
  genBtn.parentNode.replaceChild(newGenBtn, genBtn);

  newGenBtn.addEventListener('click', async () => {
    const hostname = cleanHostname(document.getElementById('link-site-input').value);
    const duration = parseInt(document.getElementById('link-duration').value);
    hideAlert('links-error');
    hideAlert('links-success');

    if (!hostname || hostname.length < 3 || !hostname.includes('.')) {
      return showAlert('links-error', 'Please enter a valid domain.');
    }
    const { lockedSites = [] } = await chrome.storage.sync.get('lockedSites');
    if (!lockedSites.some(s => s.replace(/^www\./, '') === hostname)) {
      return showAlert('links-error', `${hostname} is not in your locked sites list. Add it first.`);
    }
    const res = await sendMsg('GENERATE_TEMP_TOKEN', { hostname, durationMinutes: duration });
    const link = `https://${hostname}/#sitevault-token=${res.token}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    const label = duration < 60 ? `${duration} min` : `${duration / 60} hr`;
    showAlert('links-success', `✓ Link copied! Valid for ${label}.`, 'success');
    document.getElementById('link-site-input').value = '';
    await renderTokenList();
  });
}

async function renderTokenList() {
  const res = await sendMsg('GET_TEMP_TOKENS');
  const tempTokens = res?.tempTokens || {};
  const el = document.getElementById('tokens-list');
  const entries = Object.entries(tempTokens);

  if (entries.length === 0) {
    el.innerHTML = '<div class="empty-state">🔗<br>No active links.<br>Generate one above.</div>';
    return;
  }

  el.innerHTML = entries.map(([token, data]) => {
    const link = `https://${data.hostname}/#sitevault-token=${token}`;
    return `
      <div class="token-item">
        <div class="token-header">
          <span class="token-site">${data.hostname}</span>
          <span class="token-expires">⏱ ${timeUntil(data.expiresAt)}</span>
        </div>
        <div class="token-url" data-link="${link}">${link}</div>
        <div class="token-actions">
          <button class="btn sm secondary copy-token-btn" data-link="${link}">Copy</button>
          <button class="btn sm danger revoke-btn" data-token="${token}">Revoke</button>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.copy-token-btn, .token-url').forEach(item => {
    item.addEventListener('click', async () => {
      await navigator.clipboard.writeText(item.dataset.link).catch(() => {});
      const orig = item.textContent;
      item.textContent = '✓ Copied!';
      setTimeout(() => { item.textContent = orig; }, 1500);
    });
  });

  el.querySelectorAll('.revoke-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sendMsg('REVOKE_TEMP_TOKEN', { token: btn.dataset.token });
      await renderTokenList();
    });
  });
}

// ── Settings Panel ────────────────────────────

function initSettings() {
  const changeBtn = document.getElementById('change-pass-btn');
  const form = document.getElementById('change-pass-form');
  const cancelBtn = document.getElementById('cp-cancel-btn');
  const saveBtn = document.getElementById('cp-save-btn');

  changeBtn.onclick = () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };
  cancelBtn.onclick = () => { form.style.display = 'none'; };

  saveBtn.onclick = async () => {
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirm = document.getElementById('cp-confirm').value;
    hideAlert('cp-error'); hideAlert('cp-success');
    const { masterHash } = await chrome.storage.sync.get('masterHash');
    if (await sha256(current) !== masterHash) return showAlert('cp-error', 'Current password is incorrect.');
    if (newPass.length < 6) return showAlert('cp-error', 'New password must be at least 6 characters.');
    if (newPass !== confirm) return showAlert('cp-error', 'New passwords do not match.');
    await chrome.storage.sync.set({ masterHash: await sha256(newPass) });
    showAlert('cp-success', 'Password updated!', 'success');
    ['cp-current', 'cp-new', 'cp-confirm'].forEach(id => { document.getElementById(id).value = ''; });
  };

  document.getElementById('reset-btn').onclick = async () => {
    if (!confirm('This will delete your password, all locked sites, logs, and OTP setup. Are you sure?')) return;
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    window.location.reload();
  };
}

// ── Boot ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
