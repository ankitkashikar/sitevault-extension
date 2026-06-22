async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showAlert(el, msg, type = 'error') {
  el.textContent = msg;
  el.className = `alert ${type}`;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => el.style.display = 'none', 2500);
}

function hideAlert(el) {
  el.style.display = 'none';
}

async function getStorage() {
  return chrome.storage.local.get(['masterHash', 'lockedSites']);
}

function cleanHostname(raw) {
  raw = raw.trim().toLowerCase();
  raw = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  return raw;
}

async function renderSiteList() {
  const { lockedSites = [] } = await getStorage();
  const list = document.getElementById('site-list');
  list.innerHTML = '';

  if (lockedSites.length === 0) {
    list.innerHTML = `<div class="empty-state">No sites locked yet.<br>Add a site above to get started.</div>`;
    return;
  }

  lockedSites.forEach(site => {
    const li = document.createElement('li');
    li.className = 'site-item';

    const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${site}`;
    li.innerHTML = `
      <div class="site-favicon"><img src="${faviconUrl}" onerror="this.parentElement.textContent='🌐'" /></div>
      <span class="site-name">${site}</span>
      <button class="site-remove" data-site="${site}" title="Remove">×</button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.site-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      let { lockedSites = [] } = await getStorage();
      lockedSites = lockedSites.filter(s => s !== btn.dataset.site);
      await chrome.storage.local.set({ lockedSites });
      renderSiteList();
    });
  });
}

async function addSite(hostname) {
  const errorEl = document.getElementById('main-error');
  const successEl = document.getElementById('main-success');
  hideAlert(errorEl);

  if (!hostname || hostname.length < 3 || !hostname.includes('.')) {
    showAlert(errorEl, 'Please enter a valid domain like example.com');
    return;
  }

  let { lockedSites = [] } = await getStorage();
  if (lockedSites.includes(hostname)) {
    showAlert(errorEl, `${hostname} is already in your list.`);
    return;
  }

  lockedSites.push(hostname);
  await chrome.storage.local.set({ lockedSites });
  showAlert(successEl, `${hostname} is now protected! 🔒`, 'success');
  renderSiteList();
}

async function init() {
  const { masterHash } = await getStorage();

  if (!masterHash) {
    showView('view-setup');
    setupSetupView();
  } else {
    showView('view-main');
    setupMainView();
  }
}

function setupSetupView() {
  const btn = document.getElementById('setup-btn');
  const errEl = document.getElementById('setup-error');

  btn.addEventListener('click', async () => {
    const pass = document.getElementById('setup-pass').value;
    const confirm = document.getElementById('setup-confirm').value;

    hideAlert(errEl);
    if (pass.length < 6) return showAlert(errEl, 'Password must be at least 6 characters.');
    if (pass !== confirm) return showAlert(errEl, 'Passwords do not match.');

    const hash = await sha256(pass);
    await chrome.storage.local.set({ masterHash: hash, lockedSites: [] });

    showView('view-main');
    setupMainView();
  });

  document.getElementById('setup-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('setup-confirm').focus();
  });
  document.getElementById('setup-confirm').addEventListener('keydown', e => {
    if (e.key === 'Enter') btn.click();
  });
}

function setupMainView() {
  document.getElementById('header-sub').textContent = 'Manage protected sites';
  renderSiteList();

  document.getElementById('add-current-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('http')) {
      showAlert(document.getElementById('main-error'), 'Cannot lock this type of page (must be http/https).');
      return;
    }
    const hostname = cleanHostname(new URL(tab.url).hostname);
    document.getElementById('manual-site-input').value = hostname;
    await addSite(hostname);
    document.getElementById('manual-site-input').value = '';
  });

  document.getElementById('manual-add-btn').addEventListener('click', async () => {
    const raw = document.getElementById('manual-site-input').value;
    const hostname = cleanHostname(raw);
    await addSite(hostname);
    document.getElementById('manual-site-input').value = '';
  });

  document.getElementById('manual-site-input').addEventListener('keydown', async e => {
    if (e.key === 'Enter') document.getElementById('manual-add-btn').click();
  });

  document.getElementById('change-pass-btn').addEventListener('click', () => {
    showView('view-change-pass');
    setupChangePassView();
  });

  document.getElementById('reset-btn').addEventListener('click', async () => {
    const confirmed = confirm('This will delete your master password and all locked sites. Are you sure?');
    if (!confirmed) return;
    await chrome.storage.local.clear();
    showView('view-setup');
    setupSetupView();
  });
}

function setupChangePassView() {
  document.getElementById('back-btn').addEventListener('click', () => {
    showView('view-main');
  });

  document.getElementById('cp-save-btn').addEventListener('click', async () => {
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirm = document.getElementById('cp-confirm').value;
    const errEl = document.getElementById('cp-error');
    const sucEl = document.getElementById('cp-success');

    hideAlert(errEl);
    hideAlert(sucEl);

    const { masterHash } = await getStorage();
    const currentHash = await sha256(current);
    if (currentHash !== masterHash) return showAlert(errEl, 'Current password is incorrect.');
    if (newPass.length < 6) return showAlert(errEl, 'New password must be at least 6 characters.');
    if (newPass !== confirm) return showAlert(errEl, 'New passwords do not match.');

    const newHash = await sha256(newPass);
    await chrome.storage.local.set({ masterHash: newHash });
    showAlert(sucEl, 'Password updated successfully!', 'success');
    document.getElementById('cp-current').value = '';
    document.getElementById('cp-new').value = '';
    document.getElementById('cp-confirm').value = '';
  });
}

init();
