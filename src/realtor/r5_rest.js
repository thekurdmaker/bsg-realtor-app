
/* ============================ my numbers ============================ */
function periodStart(key) {
  if (key === 'month') return new Date(YMD.format(new Date()).slice(0, 8) + '01T00:00:00+03:00');
  return new Date(Date.now() - 7 * 864e5);
}
let statsInflight = null;
function loadStats(force) {
  const key = S.statsPeriod;
  if (!force && S.stats && S.statsKey === key && Date.now() - (S.stats.at || 0) < 60000) return Promise.resolve();
  if (statsInflight) return statsInflight;
  S.statsError = null;
  statsInflight = fetchStats(key).catch((e) => { S.statsError = e; throw e; }).finally(() => { statsInflight = null; });
  return statsInflight;
}
async function fetchStats(key) {
  const since = periodStart(key).toISOString();
  const rows = (await get(`leads?select=id,status,assigned_at,first_response_at&realtor_id=eq.${S.me.realtor_id}&assigned_at=gte.${encodeURIComponent(since)}&order=assigned_at.desc&limit=5000`)) || [];
  const answered = rows.filter((r) => r.status === 'answered');
  const resp = answered.map((r) => {
    const a = toDate(r.assigned_at), f = toDate(r.first_response_at);
    return a && f ? Math.max(0, (f - a) / 60000) : null;
  }).filter((x) => x != null).sort((a, b) => a - b);
  const median = resp.length ? (resp.length % 2 ? resp[(resp.length - 1) / 2] : (resp[resp.length / 2 - 1] + resp[resp.length / 2]) / 2) : null;
  S.stats = {
    at: Date.now(), received: rows.length, answered: answered.length,
    waiting: rows.filter((r) => r.status === 'pending').length,
    other: rows.filter((r) => r.status !== 'pending' && r.status !== 'answered').length,
    median, fast: resp.filter((m) => m <= 60).length, respN: resp.length,
  };
  S.statsKey = key;
}
function renderStats(main) {
  const st = S.statsKey === S.statsPeriod ? S.stats : null;
  const rate = st && st.received ? Math.round((st.answered * 100) / st.received) : null;
  const periodTxt = S.statsPeriod === 'month' ? 'ئەم مانگە' : '7 ڕۆژی ڕابردوو';
  const tile = (icon, label, value, sub, tone) => `<div class="r-tile"><div class="h">${ic(icon, 16)} ${esc(label)}</div><div class="v" ${tone ? `style="color:var(--${tone})"` : ''}>${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  let body;
  if (!st && S.statsError) body = `<div class="r-empty">${ic(S.statsError.code === 'network' ? 'wifiOff' : 'alert', 44)}<b>ژمارەکان نەهێنران</b><p>${esc(humanError(S.statsError))}</p><button type="button" class="r-btn primary" data-act="statsretry">${ic('refresh', 18)} دووبارە هەوڵ بدەرەوە</button></div>`;
  else if (!st) body = `<div class="r-tiles">${[0, 1, 2, 3].map(() => '<div class="r-skel"><i style="width:50%"></i><i style="height:26px;width:40%"></i></div>').join('')}</div>`;
  else if (!st.received) body = `<div class="r-empty">${ic('chart', 44)}<b>لەم ماوەیەدا هیچ نامەیەک نەهاتووە</b><p>کاتێک کڕیار دێت، ژمارەکانت لێرە دەردەکەون.</p></div>`;
  else {
    const tips = [];
    if (st.waiting) tips.push(`<b>${fmtN(st.waiting)}</b> نامەت هێشتا چاوەڕێیە. هەرچەندە زووتر وەڵام بدەیتەوە، کڕیار زیاتر دەمێنێتەوە.`);
    if (st.median != null && st.median > 60) tips.push('هەوڵ بدە لە ماوەی یەک کاتژمێردا وەڵام بدەیتەوە — کڕیارێک کە زوو وەڵام وەردەگرێت، زیاتر دەمێنێتەوە و زووتر بڕیار دەدات.');
    if (rate != null && rate >= 90 && !st.waiting) tips.push('دەستت خۆش بێت! نزیکەی هەموو کڕیارەکانت وەرگرتووە.');
    if (st.median != null && st.median <= 30) tips.push('وەڵامدانەوەت زۆر خێرایە — ئەمە باشترین ڕێگەیە بۆ فرۆشتن.');
    body = `
      <div class="r-tiles">
        ${tile('inbox', 'هاتووە بۆت', `<span class="num">${fmtN(st.received)}</span>`, 'کڕیاری نوێ')}
        ${tile('checkCircle', 'وەرگیراو', `<span class="num">${fmtN(st.answered)}</span>`, rate != null ? `${bidi(fmtN(rate) + '%')}ی هەمووی` : '')}
        ${tile('clock', 'چاوەڕێ', `<span class="num">${fmtN(st.waiting)}</span>`, st.waiting ? 'هێشتا وەڵام نەدراوەتەوە' : 'هیچ نامەیەک چاوەڕێ نییە', st.waiting ? 'warn' : '')}
        ${tile('send', 'خێرایی وەڵام', st.median == null ? '—' : (() => { const d = durParts(st.median); return `<span class="num">${esc(d[0])}</span><small>${esc(d[1])}</small>`; })(), st.respN ? `بە زۆری لەم ماوەیەدا` : '')}
      </div>
      <div class="r-card" style="margin-top:10px">
        <div class="r-row" style="justify-content:space-between"><b style="font-size:14.5px">ڕێژەی وەرگرتن</b><b class="num" style="font-size:18px">${rate == null ? '—' : bidi(fmtN(rate) + '%')}</b></div>
        <div class="r-meter" role="img" aria-label="ڕێژەی وەرگرتن ${rate == null ? '' : rate + '٪'}"><i style="width:${Math.min(100, rate || 0)}%"></i></div>
        <div class="muted" style="font-size:13px;margin-top:8px">${fmtN(st.answered)} لە ${fmtN(st.received)} کڕیار وەرگیراون · ${fmtN(st.fast)} یان لە ماوەی یەک کاتژمێردا</div>
      </div>
      ${tips.length ? `<div class="r-card" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">${tips.map((t) => `<div class="r-tip">${ic('sparkle', 16)}<span>${t}</span></div>`).join('')}</div>` : ''}`;
  }
  main.innerHTML = `
    <div class="r-seg" role="group" aria-label="ماوە">
      <button type="button" data-per="7d" aria-pressed="${S.statsPeriod === '7d'}">7 ڕۆژی ڕابردوو</button>
      <button type="button" data-per="month" aria-pressed="${S.statsPeriod === 'month'}">ئەم مانگە</button>
    </div>
    <div class="r-listhead"><span>${esc(periodTxt)}</span>${st ? `<span>${esc(ago(new Date(st.at).toISOString(), true))}</span>` : ''}</div>
    ${body}`;
  if (!st && !S.statsError) loadStats(false).then(() => { if (tab === 'stats') App.render(); }).catch((e) => { if (e && e.code === 'session') toastErr(e); else if (tab === 'stats') App.render(); });
}

/* ============================ profile ============================ */
async function ensureGroups(force) {
  if (S.groups.length && !force) return;
  try { S.groups = (await rpc('get_realtor_groups', { p_realtor_id: S.me.realtor_id })) || []; lsSet('groups', S.groups); }
  catch (e) { if (!S.groups.length) S.groups = lsGet('groups', []); }
}
function themeNow() { const v = lsGet('theme', 'auto'); return v === 'dark' || v === 'light' ? v : 'auto'; }
function applyTheme(v) {
  const t = v || themeNow();
  if (t === 'auto') document.documentElement.removeAttribute('data-bsgr-theme');
  else document.documentElement.setAttribute('data-bsgr-theme', t);
}
function renderMe(main) {
  const me = S.me || {};
  const th = themeNow();
  main.innerHTML = `
    <div class="r-card"><div class="r-me"><div class="r-avatar">${esc(initials(me.name))}</div>
      <div style="min-width:0"><b>${esc(me.name || '')}</b><small>${esc(me.branch ? 'لقی ' + me.branch : '')}</small><br><small class="ltr">${esc(me.email || '')}</small></div></div>
      ${S.groups.length ? `<div style="margin-top:14px"><div class="r-label" style="margin-bottom:8px">گرووپەکانم</div><div class="r-group-list">${S.groups.map((g) => `<span class="r-chip ${g.group_kind === 'branch' ? '' : 'accent'}">${ic(g.group_kind === 'branch' ? 'home' : 'users', 12)} ${esc(g.group_name)}</span>`).join('')}</div></div>` : ''}
    </div>

    ${App.pushSettingsHtml()}

    <h2 class="r-sec-h">یاریدەدەری زیرەک</h2>
    <div class="r-card"><div class="r-set">
      <div class="r-set-row">
        <span class="r-set-ic">${ic('sparkle', 20)}</span>
        <div class="t"><b>با یاریدەدەری زیرەک وەڵام بداتەوە <span class="r-soon">بەم زووانە</span></b>
          <small>کاتێک سەرقاڵیت، یاریدەدەرەکە قسە لەگەڵ کڕیار دەکات تا پرسیارەکە جددی دەبێت، پاشان بە کورتەیەکەوە ئاگادارت دەکاتەوە.</small></div>
        <button type="button" class="r-switch" role="switch" aria-checked="false" disabled aria-label="یاریدەدەری زیرەک — بەم زووانە"></button>
      </div>
    </div></div>

    <h2 class="r-sec-h">ڕووکار</h2>
    <div class="r-card"><div class="r-theme" role="group" aria-label="ڕووکار">
      <button type="button" data-theme="auto" aria-pressed="${th === 'auto'}">${ic('auto', 17)} خۆکار</button>
      <button type="button" data-theme="light" aria-pressed="${th === 'light'}">${ic('sun', 17)} ڕووناک</button>
      <button type="button" data-theme="dark" aria-pressed="${th === 'dark'}">${ic('moon', 17)} تاریک</button>
    </div></div>

    <h2 class="r-sec-h">زیاتر</h2>
    <div class="r-card"><div class="r-set">
      ${isStandalone() ? '' : `<div class="r-set-row"><span class="r-set-ic">${ic('plusSq', 20)}</span><div class="t"><b>دانان لەسەر شاشەی مۆبایل</b><small>بۆ ئەوەی وەک ئەپێکی ڕاستەقینە بکرێتەوە</small></div><button type="button" class="r-btn sm" data-act="install">چۆن؟</button></div>`}
      <div class="r-set-row"><span class="r-set-ic">${ic('refresh', 20)}</span><div class="t"><b>نوێکردنەوەی ئەپ</b><small>وەشان ${esc(CFG.version)}</small></div><button type="button" class="r-btn sm" data-act="hardreload">نوێکردنەوە</button></div>
      <div class="r-set-row"><span class="r-set-ic">${ic('logout', 20)}</span><div class="t"><b>چوونەدەرەوە</b><small>لەم مۆبایلە</small></div><button type="button" class="r-btn sm danger" data-act="logout">دەرچوون</button></div>
    </div></div>
    <p class="muted" style="text-align:center;font-size:12.5px;margin:18px 0 0">عەقارات باغی شەقڵاوە · کۆڵ سەنتەر</p>`;
}

/* ============================ install (add to home screen) ============================ */
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => isNativeApp() || window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (App.render) App.render(); });
App.installCardHtml = function () {
  if (isStandalone() || lsGet('install_hide', false)) return '';
  if (!deferredInstall && !isIOS()) return '';
  return `<div class="r-install">${ic('plusSq', 22)}
    <div class="t">ئەپەکە لەسەر شاشەکەت دابنێ<small>بۆ ئەوەی بە یەک کرتە بکرێتەوە</small></div>
    <button type="button" class="r-btn sm primary" data-act="${deferredInstall ? 'doinstall' : 'install'}">${deferredInstall ? 'دامەزراندن' : 'چۆن؟'}</button>
    <button type="button" class="r-btn icon ghost" data-act="hideinstall" aria-label="پیشانی مەدەرەوە" style="width:36px;min-height:36px;color:inherit">${ic('x', 18)}</button>
  </div>`;
};
function iosSteps() {
  return `<div class="r-install-steps"><ol>
    <li>لە <b>Safari</b> دوگمەی هاوبەشکردن <span class="ico">${ic('share', 14)}</span> دابگرە (خوارەوەی شاشە).</li>
    <li><b>Add to Home Screen</b> <span class="ico">${ic('plusSq', 14)}</span> هەڵبژێرە.</li>
    <li><b>Add</b> دابگرە. ئێستا ئەپەکە لەسەر شاشەکەتە.</li></ol></div>`;
}
function installHelp() {
  if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.finally(() => { deferredInstall = null; App.render(); }); return; }
  sheet({ title: 'دانان لەسەر شاشەی مۆبایل', html: isIOS() ? iosSteps() : `<ol style="padding-inline-start:20px;line-height:1.9"><li>لە <b>Chrome</b> سێ خاڵەکە ⋮ دابگرە (سەرەوەی شاشە).</li><li><b>Install app</b> یان <b>Add to Home screen</b> هەڵبژێرە.</li><li><b>Install</b> دابگرە.</li></ol>` });
}

/* ============================ shell, tabs, router ============================ */
const TABS = [
  ['inbox', 'نامەکان', 'inbox'],
  ['posts', 'پۆستەکانم', 'megaphone'],
  ['stats', 'ئامارەکەم', 'chart'],
  ['me', 'هەژمار', 'user'],
];
const TITLES = { inbox: 'نامەکانم', posts: 'پۆستەکانم', stats: 'ئامارەکەم', me: 'هەژمارەکەم' };
let tab = 'inbox';

App.renderShell = function () {
  ROOT.innerHTML = `<div class="r-app">
    <header class="r-top"><div class="r-top-in">
      <div class="r-logo" aria-hidden="true">BSG</div>
      <div class="r-top-title"><b id="r-title"></b><small id="r-sub"></small></div>
      <span class="r-count" id="r-count" hidden></span>
      <button type="button" class="r-btn icon ghost" id="r-refresh" aria-label="نوێکردنەوە">${ic('refresh', 21)}</button>
    </div></header>
    <div class="r-ptr" id="r-ptr" aria-hidden="true"><div class="r-ptr-in">${ic('down', 16)} <span>بەرەو خوارەوە ڕایبکێشە بۆ نوێکردنەوە</span></div></div>
    <main class="r-main" id="r-main"></main>
    <nav class="r-tabs" aria-label="بەشەکان"><div class="r-tabs-in">${TABS.map(([k, l, i]) => `<button type="button" class="r-tab" data-tab="${k}">${ic(i, 24)}<span>${esc(l)}</span>${k === 'inbox' ? '<span class="r-badge" id="r-tabbadge" hidden></span>' : ''}</button>`).join('')}</div></nav>
    <button type="button" class="r-pill" id="r-pill" hidden></button>
  </div>`;
  $('#r-refresh').addEventListener('click', (e) => manualRefresh(e.currentTarget));
  $('.r-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
  $('#r-pill').addEventListener('click', () => {
    S.newCount = 0; S.seg = 'pending'; S.q = ''; S.remote = [];
    go('inbox');
    requestAnimationFrame(() => {
      const card = $('.r-lead.is-new');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' }); else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  $('#r-main').addEventListener('click', onMainClick);
  $('#r-main').addEventListener('input', onMainInput);
  setupPullToRefresh();
};
App.render = function () {
  const main = $('#r-main'); if (!main) return;
  const active = document.activeElement;
  const keepQ = active && active.id === 'r-q' ? [active.selectionStart, active.selectionEnd] : null;
  $('#r-title').textContent = TITLES[tab];
  $('#r-sub').textContent = tab === 'inbox' && S.me ? 'سڵاو ' + (S.me.name || '').split(' ')[0] + ' 👋' : (S.me && S.me.branch ? 'لقی ' + S.me.branch : '');
  $$('.r-tab').forEach((b) => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (tab === 'inbox') renderInbox(main);
  else if (tab === 'posts') renderPosts(main);
  else if (tab === 'stats') renderStats(main);
  else renderMe(main);
  if (keepQ) { const q = $('#r-q'); if (q) { q.focus(); try { q.setSelectionRange(keepQ[0], keepQ[1]); } catch (e) { /* ignore */ } } }
  const pill = $('#r-pill');
  if (pill) {
    const show = S.newCount > 0 && S.pillFor !== S.newCount + ':seen';
    pill.hidden = !show;
    if (show) {
      pill.innerHTML = `${ic('bell', 18)} ${fmtN(S.newCount)} نامەی نوێ هات — بیبینە`;
      if (S.pillFor !== String(S.newCount)) {
        S.pillFor = String(S.newCount);
        clearTimeout(S.pillTimer);
        S.pillTimer = setTimeout(() => { S.pillFor = S.newCount + ':seen'; const p = $('#r-pill'); if (p) p.hidden = true; }, 12000);
      }
    }
  }
};
App.updateBadge = function () {
  const n = S.pending.length;
  const c = $('#r-count'), tb = $('#r-tabbadge');
  if (c) { c.hidden = !S.loaded; c.textContent = fmtN(n); c.classList.toggle('zero', !n); c.title = n ? n + ' نامەی چاوەڕێ' : 'هیچ نامەیەک چاوەڕێ نییە'; }
  if (tb) { tb.hidden = !n; tb.textContent = n > 99 ? '99+' : String(n); }
  document.title = (n ? '(' + n + ') ' : '') + 'کۆڵ سەنتەر';
  try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) { /* not supported */ }
};
App.setOnline = function (on) {
  if (S.online === on) return;
  S.online = on;
  App.render();
};
function go(t, fromHash) {
  if (!TITLES[t]) t = 'inbox';
  tab = t;
  if (!fromHash && location.hash !== '#/' + t) history.replaceState(null, '', '#/' + t);
  window.scrollTo(0, 0);
  if (t === 'me') ensureGroups().then(() => { if (tab === 'me') App.render(); });
  App.render();
}
function route() {
  const h = location.hash || '';
  const m = h.match(/^#\/lead\/([\w-]+)/);
  if (m) { if (S.detailId !== m[1]) openLead(m[1], false); return; }
  if (S.detailId) closeLead(true);
  const t = h.replace(/^#\//, '').split('/')[0];
  if (TITLES[t] && t !== tab) go(t, true); else if (!TITLES[t]) go(tab || 'inbox', false);
}
window.addEventListener('popstate', () => { closeTopSheet(); const lb = $('.r-lb'); if (lb) lb.remove(); route(); });

async function manualRefresh(btn) {
  busy(btn, true);
  S.newCount = 0;
  try {
    await loadAll(false);
    if (tab === 'stats') { S.statsError = null; await loadStats(true).catch(() => {}); App.render(); }
    if (S.online) toast('نوێ کرایەوە');
  } finally { busy(btn, false); }
}

/* ============================ clicks & typing ============================ */
function onMainClick(e) {
  const t = e.target;
  const seg = t.closest('[data-seg]');
  if (seg) { S.seg = seg.dataset.seg; lsSet('seg', S.seg); App.render(); if (S.seg !== 'pending' && !S.answered.length && !S.ansDone) loadAnswered(true).then(App.render).catch(toastErr); return; }
  if (t.closest('#r-sort')) { S.sortOldest = !S.sortOldest; lsSet('sort_oldest', S.sortOldest); App.render(); return; }
  if (t.closest('#r-q-x')) { S.q = ''; S.remote = []; App.render(); const q = $('#r-q'); if (q) q.focus(); return; }
  if (t.closest('#r-more')) { const b = t.closest('#r-more'); busy(b, true); loadAnswered(false).then(() => { saveCache(); App.render(); }).catch(toastErr); return; }
  const a = t.closest('[data-answer]'); if (a) { answerLead(a.dataset.answer, a); return; }
  const w = t.closest('[data-wa]'); if (w) { markOpened(w.dataset.wa); return; }
  if (t.closest('[data-call]')) return;
  const o = t.closest('[data-open]'); if (o) { openLead(o.dataset.open); return; }
  const per = t.closest('[data-per]'); if (per) { S.statsPeriod = per.dataset.per; lsSet('stats_period', S.statsPeriod); App.render(); return; }
  const th = t.closest('[data-theme]'); if (th) { lsSet('theme', th.dataset.theme); applyTheme(th.dataset.theme); App.render(); return; }
  const act = t.closest('[data-act]');
  if (act) {
    const k = act.dataset.act;
    if (k === 'reload') { manualRefresh($('#r-refresh')); return; }
    if (k === 'statsretry') { S.statsError = null; App.render(); return; }
    if (k === 'install' || k === 'doinstall') { installHelp(); return; }
    if (k === 'hideinstall') { lsSet('install_hide', true); App.render(); return; }
    if (k === 'hardreload') { location.reload(); return; }
    if (k === 'pushon') { Push.enable(false); return; }
    if (k === 'pushtest') { Push.test(act); return; }
    if (k === 'logout') {
      sheet({ title: 'دڵنیایت دەتەوێت بچیتە دەرەوە؟', html: '<p>بۆ گەڕانەوە پێویستت بە ئیمەیڵ و وشەی نهێنییەکەت دەبێت.</p>', actions: [{ label: 'بەڵێ، دەرچوون', cls: 'danger', icon: 'logout', onClick: async () => { await Push.logout(); await auth.signOut(); lsDel('cache_v1'); lsDel('me'); lsDel('groups'); location.hash = ''; App.showLogin(); } }], cancel: 'نەخێر' });
      return;
    }
  }
  if (tab === 'posts') onPostsClick(e);
}
function onMainInput(e) {
  if (e.target.id === 'r-q') {
    S.q = e.target.value;
    const x = $('#r-q-x'); if (x) x.hidden = !S.q;
    renderInboxSoon();
    remoteSearch();
  }
}
const renderInboxSoon = debounce(() => { if (tab === 'inbox') App.render(); }, 120);

/* ============================ pull to refresh ============================ */
function setupPullToRefresh() {
  const ptr = $('#r-ptr'); const txt = $('#r-ptr span');
  let y0 = null, dy = 0, pulling = false;
  window.addEventListener('touchstart', (e) => {
    if (S.detailId || sheets.length || window.scrollY > 0 || !e.target.closest('.r-main')) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0; pulling = false;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 8 && window.scrollY <= 0) {
      pulling = true; ptr.classList.add('pulling');
      ptr.style.height = Math.min(70, dy * 0.45) + 'px';
      txt.textContent = dy * 0.45 > 52 ? 'بەرەڵای بکە بۆ نوێکردنەوە' : 'بەرەو خوارەوە ڕایبکێشە بۆ نوێکردنەوە';
    }
  }, { passive: true });
  window.addEventListener('touchend', async () => {
    if (y0 == null) return;
    const go2 = pulling && dy * 0.45 > 52;
    y0 = null; ptr.classList.remove('pulling');
    if (!go2) { ptr.style.height = '0px'; return; }
    ptr.style.height = '46px'; txt.textContent = 'نوێ دەکرێتەوە…';
    try { await manualRefresh($('#r-refresh')); } finally { ptr.style.height = '0px'; }
  });
}

/* ============================ polling ============================ */
let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible' && S.me) loadAll(true); }, CFG.pollMs);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me && auth.s) loadAll(true); });
window.addEventListener('online', () => { if (S.me && auth.s) loadAll(true); });
window.addEventListener('offline', () => App.setOnline(false));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('.r-lb')) { $('.r-lb').remove(); return; }
  if (closeTopSheet()) return;
  if (S.detailId) closeLead();
});

/* ============================ login ============================ */
App.showLogin = function (msg) {
  clearInterval(pollTimer);
  S.me = null; S.detailId = null; document.documentElement.style.overflow = '';
  const lastEmail = lsGet('last_email', '');
  ROOT.innerHTML = `<div class="r-login"><form class="r-login-card" id="r-login" novalidate>
    <div class="r-login-head"><div class="r-logo">BSG</div><h1>بەخێربێیت</h1><p>کۆڵ سەنتەری عەقارات باغی شەقڵاوە</p></div>
    <div class="r-err" id="r-lerr" ${msg ? '' : 'hidden'}>${ic('alert', 18)}<span>${esc(msg || '')}</span></div>
    <div class="r-field"><label class="r-label" for="r-email">ئیمەیڵ</label>
      <input class="r-input ltr" id="r-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required value="${esc(lastEmail)}" placeholder="name@baghyshaqlawa.net"></div>
    <div class="r-field"><label class="r-label" for="r-pw">وشەی نهێنی</label>
      <div class="r-pass"><input class="r-input ltr" id="r-pw" type="password" autocomplete="current-password" autocapitalize="off" required>
      <button type="button" class="r-btn icon ghost" id="r-eye" aria-label="پیشاندانی وشەی نهێنی">${ic('eye', 20)}</button></div></div>
    <button type="submit" class="r-btn primary big" id="r-go">${ic('lock', 20)} چوونەژوورەوە</button>
    <div class="r-login-help">وشەی نهێنیت لەبیرچووە؟ پەیوەندی بە بەڕێوەبەرەوە بکە — وشەیەکی نوێت بۆ دەنێرێت.</div>
  </form></div>`;
  const form = $('#r-login');
  $('#r-eye').addEventListener('click', (e) => {
    const pw = $('#r-pw'); const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = ic(show ? 'eyeOff' : 'eye', 20);
    e.currentTarget.setAttribute('aria-label', show ? 'شاردنەوەی وشەی نهێنی' : 'پیشاندانی وشەی نهێنی');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#r-email').value.trim().toLowerCase(), pw = $('#r-pw').value;
    const err = $('#r-lerr');
    const fail = (t) => { $('span', err).textContent = t; err.hidden = false; };
    if (!email || !pw) { fail('ئیمەیڵ و وشەی نهێنی بنووسە.'); return; }
    err.hidden = true;
    const b = $('#r-go'); busy(b, true);
    try {
      await auth.signIn(email, pw);
      lsSet('last_email', email);
      await loadProfile();
      if (!S.me.realtor_id) {
        await auth.signOut(); S.me = null;
        fail('ئەم ئەپە تەنها بۆ کارمەندانە. بەڕێوەبەر داشبۆردی خۆی هەیە.');
        return;
      }
      startApp();
    } catch (ex) { fail(humanError(ex)); }
    finally { if (b.isConnected) busy(b, false); }
  });
  setTimeout(() => { const f = lastEmail ? $('#r-pw') : $('#r-email'); if (f) f.focus(); }, 50);
};
async function loadProfile() {
  const rows = await rpc('get_my_profile');
  const p = Array.isArray(rows) ? rows[0] : rows;
  if (!p) throw new ApiError('no profile', 'noprofile', 403);
  S.me = { app_user_id: p.app_user_id, role: p.role, realtor_id: p.realtor_id, name: p.name || '', email: p.email || '', branch: p.branch || '' };
  lsSet('me', S.me);
}

/* ============================ boot ============================ */
function startApp() {
  App.renderShell();
  const h = location.hash.replace(/^#\//, '').split('/')[0];
  tab = TITLES[h] ? h : 'inbox';
  if (loadCache()) S.loaded = true;
  App.render(); App.updateBadge();
  ensureGroups().then(() => loadAll(false)).then(() => { if (/^#\/lead\//.test(location.hash)) route(); });
  startPolling();
  Push.start();
}
async function boot() {
  applyTheme();
  window.BSGR = Object.freeze({ version: CFG.version, refresh: () => loadAll(false), open: (id) => openLead(id) });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !isNativeApp()) {
    navigator.serviceWorker.register('OneSignalSDKWorker.js', { scope: '/' }).catch(() => { /* sw.js not uploaded — the app still works */ });
  }
  if (!auth.s) { App.showLogin(); return; }
  S.me = lsGet('me', null);
  try {
    await loadProfile();
  } catch (e) {
    if (e && e.code === 'network' && S.me && S.me.realtor_id) { S.online = false; startApp(); return; }
    auth.clear();
    App.showLogin(e && e.code === 'session' ? humanError(e) : '');
    return;
  }
  if (!S.me.realtor_id) { await auth.signOut(); App.showLogin('ئەم ئەپە تەنها بۆ کارمەندانە.'); return; }
  startApp();
}
boot();
})();
