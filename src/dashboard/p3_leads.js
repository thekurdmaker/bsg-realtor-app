
/* ============================ shared state ============================ */
const S = {
  me: null, settings: {},
  realtors: [], realtorById: new Map(),
  groups: [], groupById: new Map(),
  posts: [], postById: new Map(),
  reassign: null, view: null,
};
async function loadRealtors() {
  S.realtors = await get('realtors?select=id,name,branch,whatsapp_number,active&order=name.asc&limit=2000');
  S.realtorById = new Map(S.realtors.map((r) => [r.id, r]));
}
async function loadGroups() {
  const [g, raw] = await Promise.all([rpc('get_groups'), get('groups?select=id,branch,kind&limit=2000')]);
  const br = new Map((raw || []).map((x) => [x.id, x]));
  S.groups = (g || []).map((x) => ({ id: x.group_id, name: x.group_name, kind: x.group_kind, members: Number(x.member_count) || 0, active: x.active !== false, branch: (br.get(x.group_id) || {}).branch || null }))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'branch' ? 1 : -1));
  S.groupById = new Map(S.groups.map((x) => [x.id, x]));
}
async function loadPostsLite() {
  S.posts = await get('posts?select=facebook_post_id,post_code,headline,realtor_id,group_id,active,created_at,facebook_post_url,auto_message_tag,source_ids,image_url&order=created_at.desc&limit=2000');
  S.postById = new Map(S.posts.map((p) => [p.facebook_post_id, p]));
}
async function loadSettings() {
  const rows = await get('system_settings?select=key,value&key=in.(auto_reply_template,tpl_onboard,tpl_manual_notify,wa_notify_enabled,answer_timeout_hours,meta_token_saved_at,meta_token_expires_at,meta_token_data_access_at,meta_boost_defaults)');
  S.settings = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
}
/* ---------- realtor app status + onboarding ---------- */
S.appStatus = new Map();
async function loadAppStatus() {
  const rows = await rpc('manager_realtor_app_status');
  S.appStatus = new Map((rows || []).map((x) => [x.realtor_id, x]));
}
const hasApp = (rid) => { const a = S.appStatus.get(rid); return !!(a && a.last_sign_in_at); };
const appInfo = (rid) => S.appStatus.get(rid) || {};
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.mycompany.callcenter';
// same rule as the database tpl_fill(): {token} is replaced; a line whose token is empty is dropped
function tplFill(tpl, vars) {
  return String(tpl || '').replace(/\r\n/g, '\n').split('\n').filter((line) => {
    let keep = true;
    line.replace(/\{(\w+)\}/g, (m, k) => { if (k in vars && !String(vars[k] ?? '').trim()) keep = false; return m; });
    return keep;
  }).map((line) => line.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m))).join('\n').trim();
}
function onboardText(r, login) {
  const t = S.settings && S.settings.tpl_onboard;
  if (t && t.trim()) return tplFill(t, { name: r.name, email: login.email, password: login.password, android_link: PLAY_URL, iphone_link: CFG.realtorApp });
  return `سڵاو کاک ${r.name} 👋
ئەپی کۆڵ سەنتەری باغی شەقڵاوە بۆ تۆ ئامادەیە. لەم ئەپەوە نامەی ئەو کڕیارانەی لە پۆستەکانتەوە دێن ڕاستەوخۆ پێت دەگات.

📲 دابەزاندن:
• ئەندرۆید: ${PLAY_URL}
• ئایفۆن: لە Safari بچۆ بۆ ${CFG.realtorApp} ← دوگمەی Share ← Add to Home Screen

🔑 چوونەژوورەوە:
ئیمەیڵ: ${login.email}
وشەی نهێنی: ${login.password}

🔔 دوای چوونەژوورەوە ڕێگە بە ئاگادارکردنەوە (Notifications) بدە، تاکو هەر نامەیەکی نوێ هات ئاگادار بیت.

📌 چۆن کار دەکات:
1. نامەی نوێ لە بەشی «نوێ» دەردەکەوێت.
2. «وەرگرتن» دابگرە، پاشان «وەڵام» تاکو ڕاستەوخۆ لە واتسئاپ بۆ کڕیار بنووسیت.
3. ئەگەر نەتتوانی وەڵام بدەیتەوە، «پاسکردن» دابگرە تاکو بدرێت بە هاوکارێکت.
⏱ تکایە زوو وەڵام بدەرەوە، ئەگەر نا نامەکە بۆ کەسێکی تر دەچێت.`;
}
function onboardRealtor(rid, opts = {}) {
  const r = S.realtorById.get(rid); if (!r) return;
  if (!r.whatsapp_number) { toast('ئەم کارمەندە ژمارەی واتسئاپی نییە', 'err'); return; }
  let login = null;
  modal({
    title: 'ناردنی ڕێنمایی ئەپ بۆ ' + r.name, wide: true,
    html: `<div class="loading-row" id="ob-load"><span class="spin"></span> وەرگرتنی ئیمەیڵ و وشەی نهێنی…</div>
      <div id="ob-body" hidden>
        <div class="field"><label class="label" for="ob-text">نامە <span class="aux">دەتوانیت دەستکاری بکەیت</span></label><textarea class="textarea" id="ob-text" rows="14"></textarea></div>
        ${r.active === false ? `<label class="p-line" style="gap:8px;cursor:pointer"><input type="checkbox" id="ob-activate" checked style="accent-color:var(--accent);width:16px;height:16px"> <span>هەروەها <b>${esc(r.name)}</b> چالاک بکە (ئێستا ناچالاکە و نامەی بۆ ناچێت)</span></label>` : ''}
        ${hasApp(rid) ? `<div class="hint warn">${ic('alert', 13)}<span>ئەم کارمەندە پێشتر چووەتە ژوورەوە (${esc(fmtD(appInfo(rid).last_sign_in_at))}). ئەگەر خۆی وشەی نهێنی گۆڕیبێت، ئەمەی خوارەوە کار ناکات.</span></div>` : ''}
        <div class="hint">${ic('chat', 13)}<span>واتسئاپ دەکرێتەوە بۆ <span class="mono">${esc(r.whatsapp_number)}</span> — تەنها «ناردن» دابگرە.</span></div>
      </div>`,
    confirmText: 'کردنەوە لە واتسئاپ',
    onOpen: async (m) => {
      const ok = $('[data-ok]', m.root); if (ok) ok.disabled = true;
      try {
        const rows = await rpc('manager_get_realtor_login', { p_realtor_id: rid });
        login = rows && rows[0];
        if (!login) { $('#ob-load', m.root).innerHTML = `<div class="hint bad">${ic('xCircle', 13)}<span>ئیمەیڵ و وشەی نهێنی ئەم کارمەندە تۆمار نەکراوە.</span></div>`; return; }
        $('#ob-text', m.root).value = onboardText(r, login);
        $('#ob-load', m.root).hidden = true; $('#ob-body', m.root).hidden = false;
        if (ok) ok.disabled = false;
      } catch (e) { $('#ob-load', m.root).innerHTML = `<div class="hint bad">${ic('xCircle', 13)}<span>${esc(humanError(e))}</span></div>`; }
    },
    onConfirm: async (m) => {
      const text = $('#ob-text', m.root).value.trim();
      window.open(waLink(r.whatsapp_number, text), '_blank', 'noopener');   // open first, while the click still counts
      const act = $('#ob-activate', m.root);
      if (act && act.checked) {
        await rpc('manager_toggle_realtor', { p_realtor_id: rid, p_active: true });
        r.active = true; S.reassign = null;
        toast(r.name + ' چالاک کرا');
      }
      if (opts.onDone) opts.onDone();
    },
  });
}

const botReady = () => String(S.settings.wa_notify_enabled || '').toLowerCase() === 'true';
const groupKindLabel = (k) => (k === 'branch' ? 'لق' : 'تایبەت');
const postLabel = (p) => (p.post_code ? p.post_code + ' · ' : '') + (p.headline ? cleanSpaces(p.headline) : 'بێ ناونیشان');

/* ============================ date range ============================ */
const RANGE_PRESETS = [['all', 'هەموو'], ['today', 'ئەمڕۆ'], ['yesterday', 'دوێنێ'], ['7d', '7 ڕۆژ'], ['30d', '30 ڕۆژ'], ['month', 'ئەم مانگە'], ['custom', 'دیاریکراو']];
const R = Object.assign({ preset: 'all', from: '', to: '' }, lsGet('bsg_range', {}));
function rangeDates() {
  const t = todayYMD();
  switch (R.preset) {
    case 'today': return [t, t];
    case 'yesterday': { const y = addDays(t, -1); return [y, y]; }
    case '7d': return [addDays(t, -6), t];
    case '30d': return [addDays(t, -29), t];
    case 'month': return [t.slice(0, 8) + '01', t];
    case 'custom': return [R.from || '', R.to || ''];
    default: return ['', ''];
  }
}
function rangeLabel() {
  if (R.preset === 'custom') { const [a, b] = rangeDates(); return (a || '…') + ' ← ' + (b || '…'); }
  const f = RANGE_PRESETS.find((x) => x[0] === R.preset);
  return R.preset === 'all' ? 'هەموو کات' : (f ? f[1] : '');
}
const rangeIsLive = () => { const b = rangeDates()[1]; return !b || b >= todayYMD(); };
function rangeHtml() {
  return `<div class="seg" role="group" aria-label="ماوە">${RANGE_PRESETS.map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="${R.preset === k}">${esc(l)}</button>`).join('')}</div>
    <div class="date-custom" ${R.preset === 'custom' ? '' : 'hidden'}>
      <input type="date" class="input" id="rf-from" data-rf="from" value="${esc(R.from)}" aria-label="لە ڕێکەوتی">
      <span class="muted">تا</span>
      <input type="date" class="input" id="rf-to" data-rf="to" value="${esc(R.to)}" aria-label="تا ڕێکەوتی">
    </div>`;
}
function bindRange(host, onChange) {
  const paint = () => { host.innerHTML = `<div class="toolbar">${rangeHtml()}</div>`; };
  paint();
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]'); if (!b) return;
    R.preset = b.dataset.range;
    if (R.preset === 'custom' && !R.from) { R.to = todayYMD(); R.from = addDays(R.to, -6); }
    lsSet('bsg_range', R); paint(); onChange();
  });
  host.addEventListener('change', (e) => {
    const f = e.target.dataset && e.target.dataset.rf; if (!f) return;
    R[f] = e.target.value; lsSet('bsg_range', R); onChange();
  });
}

/* ============================ leads ============================ */
const LEAD_COLS = 'id,customer_number,customer_name_resolved,customer_message,facebook_post_id,post_headline,realtor_id,realtor_name,realtor_whatsapp_number,group_id,group_name,status,matched_by,lead_source,message_count,last_message_at,last_inbound_at,within_whatsapp_window,created_at,assigned_at,answer_deadline_at,acknowledged_at,response_seconds,escalated_at,forward_count,locked_to_realtor,internal_note,whatsapp_opened,whatsapp_opened_at';
const STATUS = {
  pending: { label: 'چاوەڕێ', tone: 'var(--warn)' },
  answered: { label: 'وەرگیراو', tone: 'var(--ok)' },
  escalated: { label: 'تەسلیمکراو', tone: 'var(--bad)' },
  awaiting_ai: { label: 'لای AI', tone: 'var(--ai)' },
  closed: { label: 'داخراو', tone: 'var(--mute)' },
};
const MATCH = { post_code: 'کۆد', id_post: 'ئایدی پۆست', id_ad: 'ڕیکلام', prefill: 'نامەی ئامادە', ai_post: 'AI · پۆست', ai_general: 'AI · گشتی' };
const KPI_MAIN = [
  { key: 'all', label: 'هەموو', val: (k) => k.total, sub: () => rangeLabel() },
  { key: 'waiting', label: 'چاوەڕێ', tone: 'var(--warn)', attn: true, val: (k) => k.pending, sub: () => 'لای کارمەند، هێشتا وەرنەگیراوە' },
  { key: 'escalated', label: 'تەسلیمکراو', tone: 'var(--bad)', attn: true, val: (k) => k.escalated, sub: () => 'کەس وەڵامی نەدایەوە، گەیشتە لای تۆ' },
  { key: 'answered', label: 'وەرگیراو', tone: 'var(--ok)', val: (k) => k.taken, sub: (k) => { const p = pct(k.taken_opened, k.taken); return p == null ? '—' : p + '% واتسئاپیان کردەوە'; } },
  { key: 'awaiting_ai', label: 'لای AI', tone: 'var(--ai)', val: (k) => k.awaiting_ai, sub: () => 'AI قسە لەگەڵ کڕیار دەکات' },
];
const KPI_MINI = [
  { key: 'taken_opened', label: 'کراوەتەوە', val: (k) => k.taken_opened },
  { key: 'taken_unopened', label: 'نەکراوەتەوە', val: (k) => k.taken_unopened },
  { key: 'no_realtor', label: 'بێ کارمەند', val: (k) => k.no_realtor },
  { key: 'no_post', label: 'بێ پۆست', val: (k) => k.no_post },
  { key: 'closed', label: 'داخراو', val: (k) => Math.max(0, k.total - k.taken - k.pending - k.escalated - k.awaiting_ai) },
];
const FILTER_LABEL = Object.fromEntries([...KPI_MAIN, ...KPI_MINI].map((d) => [d.key, d.label]));

const L = {
  filter: 'all', realtorId: null, postId: null, q: '',
  items: [], total: null, loading: false, seq: 0, loadedAt: 0,
  kpis: null, newCount: 0,
  selId: null, sel: null, msgs: null, tl: null, tab: 'thread', file: null,
  combos: null,
};

function leadFilterPairs() {
  const p = [];
  switch (L.filter) {
    case 'waiting': p.push(['status', 'eq.pending']); break;
    case 'answered': p.push(['status', 'eq.answered']); break;
    case 'taken_opened': p.push(['status', 'eq.answered'], ['whatsapp_opened_at', 'not.is.null']); break;
    case 'taken_unopened': p.push(['status', 'eq.answered'], ['whatsapp_opened_at', 'is.null']); break;
    case 'escalated': p.push(['status', 'eq.escalated']); break;
    case 'awaiting_ai': p.push(['status', 'eq.awaiting_ai']); break;
    case 'closed': p.push(['status', 'eq.closed']); break;
    case 'no_realtor': p.push(['realtor_id', 'is.null'], ['status', 'neq.awaiting_ai']); break;
    case 'no_post': p.push(['facebook_post_id', 'is.null'], ['status', 'neq.awaiting_ai']); break;
    default: break;
  }
  // Same day boundaries as get_lead_kpis, so the list and the tiles always agree.
  const [a, b] = rangeDates();
  if (a) p.push(['created_at', 'gte.' + a + 'T00:00:00+03:00']);   // a day starts at midnight in Erbil, not UTC
  if (b) p.push(['created_at', 'lt.' + addDays(b, 1) + 'T00:00:00+03:00']);
  if (L.realtorId) p.push(['realtor_id', 'eq.' + L.realtorId]);
  if (L.postId) p.push(['facebook_post_id', 'eq.' + L.postId]);
  const q = cleanSpaces(String(L.q || '').replace(/[(),.:"\\*%]/g, ' '));
  if (q) {
    const ors = [
      'customer_name_resolved.ilike.*' + q + '*',
      'realtor_name.ilike.*' + q + '*',
      'post_headline.ilike.*' + q + '*',
    ];
    const d = digits(q).replace(/^0+/, '');
    if (d.length >= 3) ors.push('customer_number.ilike.*' + d + '*');
    p.push(['or', '(' + ors.join(',') + ')']);
  }
  return p;
}

async function loadLeads(reset = true) {
  const seq = ++L.seq;
  L.loading = true;
  if (reset) { L.items = []; L.total = null; }
  renderList();
  const offset = reset ? 0 : L.items.length;
  try {
    const path = 'v_leads_full?' + qs([['select', LEAD_COLS], ...leadFilterPairs(), ['order', 'created_at.desc,id.desc'], ['limit', CFG.pageSize], ['offset', offset]]);
    const r = await api('/rest/v1/' + path, { prefer: 'count=exact' });
    if (seq !== L.seq) return;
    L.items = reset ? (r.data || []) : L.items.concat(r.data || []);
    const c = countFrom(r.headers);
    L.total = c == null ? L.items.length : c;
    L.loadedAt = Date.now();
  } catch (e) { if (seq === L.seq) toastErr(e); }
  finally { if (seq === L.seq) { L.loading = false; renderList(); } }
}

async function loadKpis(opts = {}) {
  try {
    const [a, b] = rangeDates();
    const rows = await rpc('get_lead_kpis', { p_start_date: a, p_end_date: b });
    const k = rows && rows[0]; if (!k) return;
    Object.keys(k).forEach((f) => { k[f] = Number(k[f]) || 0; });
    if (opts.detectNew && L.kpis && k.total > L.kpis.total && rangeIsLive()) L.newCount += k.total - L.kpis.total;
    L.kpis = k;
    renderKpis(); renderNewPill();
  } catch (e) { if (!opts.silent) toastErr(e); }
}

async function loadAttention() {
  try {
    const rows = await rpc('get_lead_kpis', { p_start_date: '', p_end_date: '' });
    const k = rows && rows[0];
    const n = k ? Number(k.escalated) || 0 : 0;
    const b = $('#nav-badge-leads');
    if (b) { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n; b.title = n + ' نامەی تەسلیمکراو چاوەڕێی تۆن'; }
  } catch (e) { /* silent */ }
}

function mountLeads(root, arg) {
  root.innerHTML = `
  <div class="page fill">
    <div class="page-head">
      <div><h1 class="page-title">نامەکان</h1><div class="page-sub">هەموو نامەکانی کڕیاران لە واتسئاپەوە — کلیک لە ژمارەکان بکە بۆ فلتەرکردن</div></div>
      <div class="toolbar"><div id="l-range"></div><button class="btn icon" id="l-refresh" type="button" title="نوێکردنەوە" aria-label="نوێکردنەوە">${ic('refresh')}</button></div>
    </div>
    <div class="kpis" id="l-kpis"></div>
    <div class="filters">
      <div class="kpis-mini" id="l-mini"></div>
      <span style="flex:1 1 0"></span>
      <div class="search">${ic('search')}<input class="input" id="l-q" type="search" placeholder="گەڕان: ناو یان ژمارەی کڕیار، کارمەند، پۆست…" aria-label="گەڕان"></div>
      <div id="l-realtor"></div>
      <div id="l-post"></div>
      <button class="btn ghost sm" id="l-clear" type="button" hidden>${ic('x', 14)} لابردنی فلتەر</button>
    </div>
    <div class="inbox" id="l-inbox">
      <section class="list-pane" aria-label="لیستی نامەکان">
        <div class="list-head"><span id="l-count"></span><span id="l-active"></span></div>
        <div id="l-newpill"></div>
        <div class="list" id="l-list"></div>
      </section>
      <section class="detail" id="l-detail" aria-label="وردەکاری نامە"></section>
    </div>
  </div>`;

  const reload = () => { L.newCount = 0; loadKpis(); loadLeads(true); };
  bindRange($('#l-range'), reload);
  $('#l-refresh').addEventListener('click', () => { reload(); loadAttention(); if (L.selId) { refreshSel(); loadMsgs(L.selId, true); } });
  root.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { const k = f.dataset.filter; L.filter = (L.filter === k && k !== 'all') ? 'all' : k; renderKpis(); loadLeads(true); updateClear(); }
  });
  const q = $('#l-q'); q.value = L.q;
  q.addEventListener('input', debounce(() => { L.q = q.value; loadLeads(true); updateClear(); }, 350));
  L.combos = {
    realtor: Combo($('#l-realtor'), { id: 'l-realtor-in', items: S.realtors, value: L.realtorId, label: (r) => r.name, sub: (r) => r.branch || '', placeholder: 'هەموو کارمەندەکان', onChange: (v) => { L.realtorId = v; loadLeads(true); updateClear(); } }),
    post: Combo($('#l-post'), { id: 'l-post-in', items: S.posts, key: (p) => p.facebook_post_id, value: L.postId, label: postLabel, placeholder: 'هەموو پۆستەکان', onChange: (v) => { L.postId = v; loadLeads(true); updateClear(); } }),
  };
  $('#l-clear').addEventListener('click', () => {
    L.q = ''; q.value = ''; L.realtorId = null; L.postId = null; L.filter = 'all';
    L.combos.realtor.set(null); L.combos.post.set(null);
    renderKpis(); loadLeads(true); updateClear();
  });
  $('#l-list').addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { loadLeads(false); return; }
    const b = e.target.closest('.lead'); if (b) openLead(b.dataset.id);
  });
  $('#l-newpill').addEventListener('click', () => { L.newCount = 0; renderNewPill(); loadLeads(true); loadKpis(); });
  const det = $('#l-detail');
  det.addEventListener('click', onDetailClick);
  det.addEventListener('change', (e) => { if (e.target.id === 'c-input') { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > CFG.maxUpload) { toast('فایلەکە لە 16MB گەورەترە.', 'err'); return; } L.file = f; renderFileChip(); } });
  det.addEventListener('input', (e) => { if (e.target.id === 'c-text') autoGrow(e.target); });
  det.addEventListener('keydown', (e) => { if (e.target.id === 'c-text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const b = $('[data-act="send"]', det); if (b && !b.disabled) sendReply(b); } });

  renderKpis(); renderList(); updateClear();
  if (arg) openLead(arg); else renderDetail();
  if (!L.items.length || Date.now() - L.loadedAt > 60000) loadLeads(true);
  loadKpis();
}

function updateClear() {
  const b = $('#l-clear'); if (!b) return;
  b.hidden = !(L.q || L.realtorId || L.postId || L.filter !== 'all');
}

function renderKpis() {
  const box = $('#l-kpis'), mini = $('#l-mini'); if (!box) return;
  const k = L.kpis;
  box.innerHTML = KPI_MAIN.map((d) => {
    const v = k ? d.val(k) : null;
    return `<button type="button" class="kpi ${d.attn && v > 0 ? 'attn' : ''}" data-filter="${d.key}" aria-pressed="${L.filter === d.key}" style="--tone:${d.tone || 'var(--ink-3)'}">
      <span class="kl"><span class="dot"></span>${esc(d.label)}</span>
      <span class="kn">${k ? fmtN(v) : '…'}</span>
      <span class="ks">${k ? esc(d.sub(k)) : '&nbsp;'}</span></button>`;
  }).join('');
  mini.innerHTML = KPI_MINI.map((d) => `<button type="button" class="mini" data-filter="${d.key}" aria-pressed="${L.filter === d.key}">${esc(d.label)} <b>${k ? fmtN(d.val(k)) : '…'}</b></button>`).join('');
}

function renderNewPill() {
  const box = $('#l-newpill'); if (!box) return;
  box.innerHTML = L.newCount > 0 ? `<button type="button" class="btn primary sm new-pill">${ic('refresh', 14)} ${fmtN(L.newCount)} نامەی نوێ — پیشانی بدە</button>` : '';
}

function leadName(x) { return x.customer_name_resolved || (isPhone(x.customer_number) ? x.customer_number : 'کڕیار'); }
function leadRow(x) {
  const st = STATUS[x.status] || { label: x.status, tone: 'var(--line-2)' };
  const unopened = x.status === 'answered' && !x.whatsapp_opened_at;
  return `<button type="button" class="lead" data-id="${esc(x.id)}" aria-current="${x.id === L.selId}" style="--tone:${st.tone}">
    <span class="stripe"></span>
    <span style="min-width:0;display:block">
      <span class="lead-top"><span class="lead-name">${esc(leadName(x))}</span><span class="lead-time" title="${esc(fmtDT(x.created_at))}">${esc(ago(x.created_at))}</span></span>
      <span class="lead-post ${x.post_headline ? '' : 'none'}" style="display:block">${x.post_headline ? esc(cleanSpaces(x.post_headline)) : 'بێ پۆست'}</span>
      <span class="lead-meta">
        <span class="chip ${esc(x.status)}">${esc(st.label)}</span>
        <span class="who">${x.realtor_name ? esc(x.realtor_name) : 'بێ کارمەند'}</span>
        ${x.matched_by ? `<span class="tag">${esc(MATCH[x.matched_by] || x.matched_by)}</span>` : ''}
        ${unopened ? '<span class="tag">نەکراوەتەوە</span>' : ''}
        ${x.forward_count > 0 ? `<span class="tag" title="چەند جار گوازراوەتەوە">${ic('swap', 11)} ${x.forward_count}</span>` : ''}
        <span title="ژمارەی پەیامەکان">${ic('chat', 12)} ${fmtN(x.message_count)}</span>
      </span>
    </span>
  </button>`;
}

function renderList() {
  const list = $('#l-list'); if (!list) return;
  const cnt = $('#l-count'), act = $('#l-active');
  if (cnt) cnt.textContent = L.total == null ? (L.loading ? 'بارکردن…' : '') : `${fmtN(L.items.length)} لە ${fmtN(L.total)} نامە`;
  if (act) act.innerHTML = L.filter !== 'all' ? `<span class="chip accent">${esc(FILTER_LABEL[L.filter] || L.filter)}</span>` : '';
  if (!L.items.length) {
    list.innerHTML = L.loading ? `<div class="loading-row"><span class="spin"></span> بارکردن…</div>` : `<div class="empty">${ic('inbox', 36)}<div>هیچ نامەیەک بەم فلتەرە نییە</div></div>`;
    return;
  }
  const more = L.total != null && L.items.length < L.total;
  list.innerHTML = L.items.map(leadRow).join('') +
    (more ? `<div class="list-more"><button type="button" class="btn sm" data-more ${L.loading ? 'disabled' : ''}>${L.loading ? '<span class="spin"></span>' : ''} ${fmtN(Math.min(CFG.pageSize, L.total - L.items.length))} نامەی تر</button></div>` : '') +
    (!more && L.loading ? `<div class="loading-row"><span class="spin"></span></div>` : '');
}

function openLead(id) {
  if (!id) return;
  L.selId = id; L.sel = L.items.find((x) => x.id === id) || null;
  L.msgs = null; L.tl = null; L.tab = 'thread'; L.file = null;
  $$('#l-list .lead').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  try { history.replaceState(null, '', '#/leads/' + id); } catch (e) { /* file:// quirks */ }
  renderDetail();
  if (!L.sel) refreshSel();
  loadMsgs(id);
}
function closeLead() {
  L.selId = null; L.sel = null; L.msgs = null; L.tl = null; L.file = null;
  try { history.replaceState(null, '', '#/leads'); } catch (e) { /* ignore */ }
  $$('#l-list .lead').forEach((b) => b.setAttribute('aria-current', 'false'));
  renderDetail();
}
function moveSel(d) {
  if (!L.items.length) return;
  let i = L.items.findIndex((x) => x.id === L.selId);
  i = i < 0 ? 0 : Math.max(0, Math.min(L.items.length - 1, i + d));
  openLead(L.items[i].id);
  const el = $(`#l-list .lead[data-id="${L.items[i].id}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
}

async function refreshSel() {
  const id = L.selId; if (!id) return;
  try {
    const rows = await get('v_leads_full?' + qs([['select', LEAD_COLS], ['id', 'eq.' + id]]));
    if (L.selId !== id) return;
    if (!rows || !rows[0]) { toast('ئەم نامەیە نەدۆزرایەوە.', 'err'); closeLead(); return; }
    L.sel = rows[0]; L.tl = null;
    const i = L.items.findIndex((x) => x.id === id);
    if (i >= 0) { L.items[i] = rows[0]; const el = $(`#l-list .lead[data-id="${id}"]`); if (el) el.outerHTML = leadRow(rows[0]); }
    renderDetail(true);
  } catch (e) { toastErr(e); }
}

async function loadMsgs(id, force) {
  try {
    const rows = await get('lead_messages?' + qs([['select', 'id,direction,sent_by,message_text,media_url,media_type,media_caption,created_at'], ['lead_id', 'eq.' + id], ['order', 'created_at.asc,id.asc'], ['limit', 1000]]));
    if (L.selId !== id) return;
    const changed = force || !L.msgs || L.msgs.length !== rows.length;
    L.msgs = rows || [];
    if (changed && L.tab === 'thread') renderBody(force ? 'bottom' : 'keep');
  } catch (e) { if (L.selId === id) { L.msgs = L.msgs || []; renderBody(); } toastErr(e); }
}
async function loadTimeline() {
  const id = L.selId;
  try {
    const rows = await get('v_lead_timeline?' + qs([['select', 'id,event_type,event_label_ku,event_actor_ku,source,created_at'], ['lead_id', 'eq.' + id], ['order', 'created_at.asc']]));
    if (L.selId !== id) return;
    L.tl = rows || [];
  } catch (e) { L.tl = []; toastErr(e); }
  if (L.tab === 'timeline') renderBody();
}

function nudgeText(x) {
  return `سڵاو کاک ${x.realtor_name || ''} 👋\nکڕیارێک (${leadName(x)}) دەربارەی «${cleanSpaces(x.post_headline || 'داواکارییەک')}» چاوەڕێی وەڵامی تۆیە.\nتکایە لە ئەپی کۆڵ سەنتەر وەری بگرە و وەڵامی بدەرەوە: ${CFG.realtorApp}`;
}

function renderDetail(keepBody) {
  const box = $('#l-detail'); if (!box) return;
  const inbox = $('#l-inbox'); if (inbox) inbox.classList.toggle('has-sel', !!L.selId);
  if (!L.selId) {
    box.innerHTML = `<div class="d-empty">${ic('inbox', 44)}<div>نامەیەک لە لیستەکە هەڵبژێرە بۆ بینینی گفتوگۆ و کارەکان</div><div class="hint">کورتە: <kbd>↑</kbd> <kbd>↓</kbd> بۆ جووڵان لە نێوان نامەکان · <kbd>/</kbd> بۆ گەڕان</div></div>`;
    return;
  }
  const x = L.sel;
  if (!x) { box.innerHTML = `<div class="loading-row" style="margin:auto"><span class="spin"></span> بارکردن…</div>`; return; }
  const st = STATUS[x.status] || { label: x.status };
  const post = x.facebook_post_id ? S.postById.get(x.facebook_post_id) : null;
  const locked = x.status === 'answered' || x.status === 'closed';
  const dl = x.status === 'pending' ? minsUntil(x.answer_deadline_at) : null;
  const phoneOk = isPhone(x.customer_number);
  const oldBody = $('#d-body');
  const prev = oldBody ? { top: oldBody.scrollTop, atBottom: oldBody.scrollHeight - oldBody.scrollTop - oldBody.clientHeight < 60 } : null;
  box.innerHTML = `
  <div class="d-head">
    <div class="d-top">
      <button type="button" class="btn ghost icon d-back" data-act="back" aria-label="گەڕانەوە بۆ لیست">${ic('back')}</button>
      <div class="d-parties">
        <div class="party">
          <span class="pl">کڕیار</span>
          <span class="pn" title="${esc(leadName(x))}">${esc(leadName(x))}</span>
          <span class="pnum"><span class="mono">${esc(x.customer_number || '')}</span>
            ${phoneOk
              ? `<button type="button" class="btn ghost xs icon" data-act="copy-cust" title="کۆپیکردنی ژمارە" aria-label="کۆپیکردنی ژمارە">${ic('copy', 13)}</button><a class="btn ghost xs wa" href="${esc(waLink(x.customer_number))}" target="_blank" rel="noopener">${ic('chat', 13)} واتسئاپ</a>`
              : `<span class="tag" title="ئەم کڕیارە بە ناوی بەکارهێنەری واتسئاپ هاتووە، ژمارەی تەلەفۆنی دیار نییە">بێ ژمارە</span>`}
          </span>
        </div>
        <span class="arrow">${ic('arrowL', 18)}</span>
        <div class="party">
          <span class="pl">کارمەند</span>
          <span class="pn">${x.realtor_name ? esc(x.realtor_name) : '<span class="muted">بێ کارمەند</span>'}</span>
          ${x.realtor_whatsapp_number ? `<span class="pnum"><span class="mono">${esc(x.realtor_whatsapp_number)}</span><a class="btn ghost xs wa" href="${esc(waLink(x.realtor_whatsapp_number, nudgeText(x)))}" target="_blank" rel="noopener" title="نامەیەکی ئامادە بۆ کارمەند دەربارەی ئەم کڕیارە">${ic('bell', 13)} ئاگادارکردنەوە</a></span>` : ''}
        </div>
      </div>
    </div>
    <div class="d-facts">
      <span class="chip ${esc(x.status)}"><span class="dot"></span>${esc(st.label)}</span>
      ${x.facebook_post_id || x.post_headline
        ? `<a class="post-link" ${post && post.facebook_post_url ? `href="${esc(safeUrl(post.facebook_post_url))}" target="_blank" rel="noopener"` : ''} title="${esc(cleanSpaces(x.post_headline || ''))}">${post && post.post_code ? `<span class="code">${esc(post.post_code)}</span>` : ''}<span class="t">${esc(cleanSpaces(x.post_headline || 'پۆست'))}</span></a>`
        : '<span class="tag">بێ پۆست</span>'}
      ${x.matched_by ? `<span class="fact muted" title="چۆن پۆستەکە دۆزرایەوە">${ic('target', 13)} ${esc(MATCH[x.matched_by] || x.matched_by)}</span>` : ''}
      <span class="fact muted" title="کاتی هاتن">${ic('clock', 13)} ${esc(fmtDT(x.created_at))}</span>
      ${x.response_seconds != null ? `<span class="fact muted">${ic('check', 13)} وەرگیرا لە ${esc(dur(x.response_seconds / 60))}</span>` : ''}
      ${x.forward_count > 0 ? `<span class="fact muted">${ic('swap', 13)} ${x.forward_count} جار گوازراوەتەوە</span>` : ''}
      ${dl != null ? (dl < 0 ? `<span class="fact" style="color:var(--bad)">${ic('alert', 13)} کاتی وەڵام تێپەڕیوە</span>` : `<span class="fact muted">${ic('clock', 13)} کاتی وەڵام: ${esc(dur(dl))} ماوە</span>`) : ''}
      ${x.whatsapp_opened_at ? `<span class="fact muted">${ic('eye', 13)} واتسئاپی کردەوە</span>` : ''}
      ${x.locked_to_realtor && !locked ? `<span class="fact muted" title="ئەگەر وەڵام نەداتەوە ڕاستەوخۆ دێتە لای تۆ">${ic('lock', 13)} تەنها بۆ ئەم کارمەندە</span>` : ''}
    </div>
    ${x.internal_note ? `<div class="note-inline">${ic('note', 14)}<span>${esc(x.internal_note)}</span></div>` : ''}
  </div>
  <div class="d-actions">
    ${!locked ? `<button type="button" class="btn sm" data-act="answered">${ic('checkCircle', 15)} وەڵامدراوە</button>` : ''}
    <button type="button" class="btn sm" data-act="reassign" ${locked ? 'disabled title="نامەی وەرگیراو یان داخراو ناگوازرێتەوە"' : ''}>${ic('swap', 15)} گواستنەوە</button>
    <button type="button" class="btn sm" data-act="attach" ${locked ? 'disabled title="نامەی وەرگیراو یان داخراو ناگۆڕدرێت"' : ''}>${ic('link', 15)} ${x.facebook_post_id ? 'گۆڕینی پۆست' : 'بەستنەوە بە پۆست'}</button>
    ${x.status !== 'closed' ? `<button type="button" class="btn sm" data-act="close">${ic('xCircle', 15)} داخستن</button>` : ''}
    <span class="spacer"></span>
    <button type="button" class="btn sm ghost icon" data-act="more" data-menu aria-label="کاری زیاتر" title="کاری زیاتر">${ic('more')}</button>
  </div>
  <div class="d-tabs" role="tablist">
    <button type="button" role="tab" data-tab="thread" aria-selected="${L.tab === 'thread'}">${ic('chat', 14)} گفتوگۆ ${L.msgs ? `<span class="muted">${fmtN(L.msgs.length)}</span>` : ''}</button>
    <button type="button" role="tab" data-tab="timeline" aria-selected="${L.tab === 'timeline'}">${ic('history', 14)} مێژوو</button>
    <button type="button" role="tab" data-tab="note" aria-selected="${L.tab === 'note'}">${ic('note', 14)} تێبینی</button>
  </div>
  <div class="d-body" id="d-body"></div>
  ${L.tab === 'thread' ? composerHtml(x) : ''}`;
  renderBody(keepBody && prev && !prev.atBottom ? { top: prev.top } : 'bottom');
  renderFileChip();
}

function composerHtml(x) {
  const open = x.within_whatsapp_window === true;
  const left = x.last_inbound_at ? 24 * 60 - (Date.now() - new Date(x.last_inbound_at).getTime()) / 60000 : null;
  return `<div class="composer">
    <div class="c-note ${open ? '' : 'locked'}">${open
      ? `${ic('clock', 13)} پەنجەرەی واتسئاپ کراوەیە — ${esc(dur(left))} ماوە بۆ ناردنی نامەی ئازاد`
      : `${ic('lock', 13)} پەنجەرەی ٢٤ کاتژمێر داخراوە — تەنها دوای ئەوەی کڕیار نامەیەکی نوێ بنێرێت دەتوانیت وەڵام بدەیتەوە`}</div>
    <div id="c-file" hidden></div>
    <div class="c-row">
      <button type="button" class="btn icon" data-act="attach-file" title="هاوپێچکردنی وێنە، ڤیدیۆ یان PDF" aria-label="هاوپێچکردنی فایل" ${open ? '' : 'disabled'}>${ic('clip')}</button>
      <textarea class="textarea" id="c-text" rows="1" placeholder="${open ? 'وەڵامێک بنووسە بۆ کڕیار… (Ctrl+Enter بۆ ناردن)' : 'ناتوانیت ئێستا نامە بنێریت'}" aria-label="نامە بۆ کڕیار" ${open ? '' : 'disabled'}></textarea>
      <button type="button" class="btn primary" data-act="send" ${open ? '' : 'disabled'}>${ic('send', 15, 'flip')} ناردن</button>
    </div>
    <input type="file" id="c-input" hidden accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf,audio/mpeg,audio/ogg,audio/mp4">
  </div>`;
}
function renderFileChip() {
  const box = $('#c-file'); if (!box) return;
  if (!L.file) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const kb = Math.round(L.file.size / 1024);
  box.innerHTML = `<span class="file-chip">${ic(L.file.type.startsWith('image') ? 'image' : L.file.type.startsWith('video') ? 'video' : 'file', 14)}<span>${esc(L.file.name)}</span><span class="muted">${kb > 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB'}</span><button type="button" class="btn ghost xs icon" data-act="remove-file" aria-label="لابردنی فایل">${ic('x', 12)}</button></span>`;
}
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(170, ta.scrollHeight + 2) + 'px'; }

function renderBody(mode = 'bottom') {
  const b = $('#d-body'); if (!b) return;
  const atBottom = b.scrollHeight - b.scrollTop - b.clientHeight < 60;
  const prevTop = b.scrollTop;
  if (L.tab === 'thread') {
    if (!L.msgs) { b.innerHTML = `<div class="loading-row"><span class="spin"></span> بارکردنی گفتوگۆ…</div>`; return; }
    b.innerHTML = threadHtml(L.msgs);
    const tab = $('[data-tab="thread"]', $('#l-detail'));
    if (tab) { let c = $('.muted', tab); if (!c) { c = document.createElement('span'); c.className = 'muted'; tab.appendChild(c); } c.textContent = fmtN(L.msgs.length); }
    if (mode === 'keep') b.scrollTop = atBottom ? b.scrollHeight : prevTop;
    else if (mode && typeof mode === 'object') b.scrollTop = mode.top;
    else b.scrollTop = b.scrollHeight;
  } else if (L.tab === 'timeline') {
    if (!L.tl) { b.innerHTML = `<div class="loading-row"><span class="spin"></span> بارکردن…</div>`; loadTimeline(); return; }
    b.innerHTML = L.tl.length
      ? `<ol class="timeline">${L.tl.map((r) => `<li class="tl ${r.source === 'dashboard' ? 'dash' : ''}"><span class="tl-dot"></span><div><div class="tl-label">${esc(r.event_label_ku || r.event_type)}</div><div class="tl-meta">${esc(r.event_actor_ku || '')} · ${esc(fmtDT(r.created_at))}</div></div></li>`).join('')}</ol>`
      : `<div class="empty">${ic('history', 32)}<div>هیچ ڕووداوێک تۆمار نەکراوە</div></div>`;
  } else {
    const x = L.sel;
    b.innerHTML = `<div class="note-pane">
      <label class="label" for="note-text">تێبینی ناوخۆیی <span class="aux">بۆ بەدواداچوونی خۆت</span></label>
      <textarea class="textarea" id="note-text" rows="6" placeholder="بۆ نموونە: کڕیار داوای نرخی کۆتایی کرد، دووبارە پەیوەندی پێوە بکرێتەوە…">${esc(x.internal_note || '')}</textarea>
      <div><button type="button" class="btn primary sm" data-act="save-note">${ic('check', 14)} پاشەکەوتکردنی تێبینی</button></div>
    </div>`;
  }
}

const validUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
function senderOf(m) {
  if (m.direction === 'inbound') return { cls: 'in', who: 'کڕیار' };
  const s = String(m.sent_by || '').toLowerCase();
  if (s === 'ai') return { cls: 'out ai', who: 'AI' };
  if (s === 'system' || !s) return { cls: 'out', who: 'سیستەم' };
  return { cls: 'out mgr', who: 'بەڕێوەبەر' };
}
function mediaHtml(m) {
  if (!validUrl(m.media_url)) return '';
  const u = esc(m.media_url);
  switch (m.media_type) {
    case 'image': return `<img class="m-img" src="${u}" alt="وێنەی نێردراو" loading="lazy" data-zoom>`;
    case 'video': return `<video src="${u}" controls preload="metadata"></video>`;
    case 'audio': return `<audio src="${u}" controls preload="none"></audio><div class="hint">${ic('mic', 12)}<span>نامەی دەنگی — ئەگەر لێنەدرا <a href="${u}" target="_blank" rel="noopener">دایبەزێنە</a></span></div>`;
    default: return `<a class="doc" href="${u}" target="_blank" rel="noopener">${ic('file', 15)} کردنەوەی فایل</a>`;
  }
}
function bubble(m, inner) {
  const s = senderOf(m);
  const t = m.message_text || '';
  const clamp = m.direction !== 'inbound' && (t.split('\n').length > 7 || t.length > 420);
  return `<div class="mw ${s.cls}"><div class="msg${clamp ? ' clamp' : ''}">${inner}</div>${clamp ? '<button type="button" class="msg-more" data-act="more-text">زیاتر ببینە</button>' : ''}<div class="msg-meta"><span>${esc(s.who)}</span><span>·</span><span>${esc(fmtT(m.created_at))}</span></div></div>`;
}
function textPart(m, withMedia) {
  const t = m.message_text || '';
  const cap = m.media_caption && m.media_caption !== t ? m.media_caption : '';
  const parts = [t, cap].filter(Boolean);
  if (!parts.length) return withMedia ? '' : '<span class="muted">(بێ دەق)</span>';
  return `<div${withMedia ? ' class="cap"' : ''}>${esc(parts.join('\n'))}</div>`;
}
function threadHtml(msgs) {
  if (!msgs.length) return `<div class="empty">${ic('chat', 32)}<div>هیچ پەیامێک تۆمار نەکراوە</div></div>`;
  const out = []; let lastDay = '';
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const day = ymdOf(m.created_at);
    if (day !== lastDay) { out.push(`<div class="day-sep">${esc(fmtD(m.created_at))}</div>`); lastDay = day; }
    if (m.media_type === 'image' && validUrl(m.media_url)) {
      const grp = [m]; let j = i + 1;
      while (j < msgs.length && msgs[j].media_type === 'image' && validUrl(msgs[j].media_url) && msgs[j].direction === m.direction && ymdOf(msgs[j].created_at) === day) { grp.push(msgs[j]); j++; }
      if (grp.length > 1) {
        const caps = grp.map((g) => g.message_text || g.media_caption).filter(Boolean);
        out.push(bubble(m, `<div class="gallery">${grp.map((g) => `<img src="${esc(g.media_url)}" alt="وێنەی نێردراو" loading="lazy" data-zoom>`).join('')}</div>${caps.length ? `<div class="cap">${esc(caps.join('\n'))}</div>` : ''}`));
        i = j - 1; continue;
      }
    }
    const media = mediaHtml(m);
    out.push(bubble(m, media + textPart(m, !!media)));
  }
  return `<div class="thread">${out.join('')}</div>`;
}

/* ----- lead actions ----- */
async function afterLeadChange() { await Promise.all([refreshSel(), loadKpis({ silent: true }), loadAttention()]); }

function onDetailClick(e) {
  const z = e.target.closest('[data-zoom]'); if (z) { openLightbox(z.getAttribute('src')); return; }
  const tb = e.target.closest('[data-tab]');
  if (tb) { L.tab = tb.dataset.tab; renderDetail(); return; }
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const x = L.sel;
  switch (t.dataset.act) {
    case 'back': closeLead(); break;
    case 'copy-cust': copyText(x.customer_number, 'ژمارەی کڕیار کۆپی کرا'); break;
    case 'answered': statusDialog('answered'); break;
    case 'close': statusDialog('closed'); break;
    case 'reassign': reassignDialog(); break;
    case 'attach': attachDialog(); break;
    case 'more':
      menu(t, [
        { icon: 'ban', label: 'بلۆککردنی ئەم کڕیارە', onClick: blockDialog },
        { icon: 'copy', label: 'کۆپیکردنی ژمارەی کڕیار', onClick: () => copyText(x.customer_number, 'ژمارەی کڕیار کۆپی کرا') },
        { icon: 'trash', label: 'سڕینەوەی نامە', danger: true, disabled: x.status === 'answered', title: x.status === 'answered' ? 'نامەی وەرگیراو ناسڕدرێتەوە' : '', onClick: deleteDialog },
      ]);
      break;
    case 'more-text': {
      const msg = t.previousElementSibling; if (!msg) break;
      msg.classList.toggle('clamp');
      t.textContent = msg.classList.contains('clamp') ? 'زیاتر ببینە' : 'کەمتر ببینە';
      break;
    }
    case 'attach-file': { const inp = $('#c-input'); if (inp) inp.click(); break; }
    case 'remove-file': L.file = null; renderFileChip(); break;
    case 'send': sendReply(t); break;
    case 'save-note': saveNote(t); break;
    default: break;
  }
}

function statusDialog(status) {
  const x = L.sel;
  const cfg = status === 'answered'
    ? { title: 'وەک وەرگیراو دیاری بکرێت؟', body: `نامەکەی «${leadName(x)}» دەچێتە لیستی وەرگیراو و کاتی وەڵامدانەوە تۆمار دەکرێت.`, confirmText: 'بەڵێ، وەرگیراو' }
    : { title: 'داخستنی ئەم نامەیە؟', body: 'نامەکە لە کارمەند دەسەندرێتەوە و وەک داخراو دادەنرێت. دوای داخستن ناگوازرێتەوە.', confirmText: 'داخستن', danger: true };
  modal(Object.assign(cfg, {
    onConfirm: async () => {
      await rpc('manager_set_lead_status', { p_lead_id: x.id, p_status: status });
      toast(status === 'answered' ? 'وەک وەرگیراو دیاری کرا' : 'نامەکە داخرا');
      await afterLeadChange();
    },
  }));
}

async function reassignDialog() {
  const x = L.sel;
  let list = S.reassign;
  if (!list) {
    try { list = S.reassign = await get('v_realtors_for_reassign?select=id,name,branch,active,pending_count&active=eq.true&order=name.asc&limit=2000'); }
    catch (e) { list = S.realtors.filter((r) => r.active); }
  }
  let chosen = null;
  modal({
    title: 'گواستنەوە بۆ کارمەندێکی تر',
    html: `<div class="field"><label class="label" for="ra-in">کارمەندی نوێ</label><div id="ra-host"></div></div>
      <div class="hint">${ic('alert', 13)}<span>کارمەندە نوێیەکە ئاگادار دەکرێتەوە. ئەگەر لە کاتی خۆیدا وەڵامی نەداتەوە، نامەکە ڕاستەوخۆ دێتەوە لای تۆ و بۆ کەسی تر نانێردرێت.</span></div>`,
    confirmText: 'گواستنەوە',
    onOpen: (m) => {
      Combo($('#ra-host', m.root), {
        id: 'ra-in', items: list.filter((r) => r.id !== x.realtor_id), label: (r) => r.name,
        sub: (r) => [r.branch, r.pending_count != null ? fmtN(r.pending_count) + ' چاوەڕێ' : ''].filter(Boolean).join(' · '),
        placeholder: 'ناوی کارمەند بنووسە…', onChange: (v) => { chosen = v; },
      });
    },
    onConfirm: async (m) => {
      if (!chosen) { m.error('کارمەندێک هەڵبژێرە.'); return false; }
      await rpc('manager_reassign_lead', { p_lead_id: x.id, p_new_realtor_id: chosen });
      S.reassign = null;
      toast('نامەکە گوازرایەوە');
      await afterLeadChange();
    },
  });
}

function attachDialog() {
  const x = L.sel;
  let chosen = null;
  modal({
    title: x.facebook_post_id ? 'گۆڕینی پۆستی ئەم نامەیە' : 'بەستنەوە بە پۆست',
    html: `<div class="field"><label class="label" for="at-in">پۆست</label><div id="at-host"></div></div>
      <div class="hint">${ic('alert', 13)}<span>${x.realtor_id ? 'کارمەندەکەی ئێستا دەمێنێتەوە، تەنها پۆستەکە دەگۆڕدرێت.' : 'نامەکە کارمەندی نییە، بۆیە دەدرێتە خاوەنی ئەم پۆستە.'}</span></div>`,
    confirmText: 'بەستنەوە',
    onOpen: (m) => {
      Combo($('#at-host', m.root), {
        id: 'at-in', items: S.posts.filter((p) => p.facebook_post_id !== x.facebook_post_id), key: (p) => p.facebook_post_id,
        label: postLabel, sub: (p) => fmtD(p.created_at), placeholder: 'کۆد یان ناونیشانی پۆست بنووسە…', onChange: (v) => { chosen = v; },
      });
    },
    onConfirm: async (m) => {
      if (!chosen) { m.error('پۆستێک هەڵبژێرە.'); return false; }
      await rpc('manager_attach_lead_to_post', { p_lead_id: x.id, p_facebook_post_id: chosen });
      toast('نامەکە بە پۆستەکەوە بەسترایەوە');
      await afterLeadChange();
    },
  });
}

function blockDialog() {
  const x = L.sel;
  modal({
    title: 'بلۆککردنی ئەم کڕیارە؟',
    html: `<p>لەمەودوا هیچ نامەیەکی <span class="mono">${esc(x.customer_number)}</span> وەرناگیرێت و وەڵامی خۆکاری بۆ ناچێت. دەتوانیت لە بەشی «بلۆککراوەکان» لای ببەیت.</p>
      <div class="field"><label class="label" for="blk-reason">هۆکار <span class="aux">ئارەزوومەندانە</span></label><input class="input" id="blk-reason" placeholder="بۆ نموونە: نامەی بێزارکەر"></div>`,
    confirmText: 'بلۆککردن', danger: true,
    onConfirm: async (m) => {
      await rpc('manager_block_customer', { p_number: x.customer_number, p_reason: $('#blk-reason', m.root).value });
      B.loaded = false;
      toast('کڕیارەکە بلۆک کرا');
    },
  });
}

function deleteDialog() {
  const x = L.sel;
  modal({
    title: 'سڕینەوەی ئەم نامەیە؟',
    body: `نامەکەی «${leadName(x)}» و هەموو پەیامەکانی و مێژووەکەی بە یەکجاری دەسڕدرێنەوە. ئەم کارە ناگەڕێتەوە.`,
    confirmText: 'سڕینەوە بە یەکجاری', danger: true,
    onConfirm: async () => {
      await rpc('manager_delete_lead', { p_lead_id: x.id });
      L.items = L.items.filter((i) => i.id !== x.id);
      if (L.total != null) L.total = Math.max(0, L.total - 1);
      closeLead(); renderList();
      toast('نامەکە سڕایەوە');
      loadKpis({ silent: true }); loadAttention();
    },
  });
}

async function saveNote(btn) {
  const x = L.sel; const ta = $('#note-text'); if (!ta) return;
  busy(btn, true);
  try {
    await rpc('manager_set_lead_note', { p_lead_id: x.id, p_note: ta.value.trim() });
    toast('تێبینییەکە پاشەکەوت کرا');
    await refreshSel();
  } catch (e) { toastErr(e); }
  finally { busy(btn, false); }
}

async function uploadMedia(file, leadId) {
  if (file.size > CFG.maxUpload) throw new ApiError('payload too large');
  const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const path = `manager/${leadId}_${Date.now()}.${ext}`;
  await api(`/storage/v1/object/${CFG.bucket}/${path}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' } });
  return `${CFG.url}/storage/v1/object/public/${CFG.bucket}/${path}`;
}
async function sendReply(btn) {
  const x = L.sel; const ta = $('#c-text'); if (!x || !ta) return;
  const text = ta.value.trim(); const file = L.file;
  if (!text && !file) { ta.focus(); return; }
  busy(btn, true);
  try {
    const media_url = file ? await uploadMedia(file, x.id) : null;
    const res = (await api('/functions/v1/manager-send-whatsapp', { method: 'POST', body: { lead_id: x.id, text: text || null, media_url } })).data;
    if (!res || res.ok === false) throw new ApiError((res && (res.reason + (res.detail ? ': ' + res.detail : ''))) || 'send failed', res && res.reason);
    ta.value = ''; autoGrow(ta); L.file = null; renderFileChip();
    toast('نامەکە نێردرا بۆ کڕیار');
    await loadMsgs(x.id, true);
  } catch (e) { toastErr(e); }
  finally { if (btn.isConnected) busy(btn, false); }
}
