
/* ============================ settings ============================ */
// Every value is saved through manager_set_setting (checks the key and the value in the database).
const ST = { rows: null, all: {}, log: null };
const DAYS = [[6, 'شەممە'], [0, 'یەکشەممە'], [1, 'دووشەممە'], [2, 'سێشەممە'], [3, 'چوارشەممە'], [4, 'پێنجشەممە'], [5, 'هەینی']];
const SET_SECTIONS = [
  {
    id: 'hours', title: 'کاتی کار و گواستنەوەی نامە', icon: 'clock',
    sub: 'نامە تەنها لە کاتی کاردا دەگوازرێتەوە بۆ کارمەندی دواتر.',
    fields: [
      { key: 'business_open_hour', label: 'دەستپێکی کار', type: 'num', unit: 'کاتژمێر (0–24)', min: 0, max: 24 },
      { key: 'business_close_hour', label: 'کۆتایی کار', type: 'num', unit: 'کاتژمێر (0–24)', min: 0, max: 24 },
      { key: 'business_closed_days', label: 'ڕۆژانی پشوو', type: 'days' },
      { key: 'answer_timeout_hours', label: 'کاتی وەڵامدانەوە پێش گواستنەوە', type: 'num', unit: 'کاتژمێری کار', min: 0.25, max: 168, step: 0.25,
        help: 'ئەگەر کارمەند لەم ماوەیەدا وەرینەگرت، نامەکە دەچێت بۆ کەسی دواتری گرووپەکە.' },
    ],
  },
  {
    id: 'ai', title: 'یاریدەدەری زیرەک (AI)', icon: 'bot',
    sub: 'بۆ ئەو نامانەی سیستەم نازانێت دەربارەی کام پۆستن.',
    fields: [
      { key: 'ai_debounce_seconds', label: 'چاوەڕێکردن پێش وەڵامدانەوە', type: 'num', unit: 'چرکە', min: 0, max: 120,
        help: 'ئەگەر کڕیار چەند نامەیەک بە دوای یەکدا بنێرێت، AI چاوەڕێ دەکات تا هەمووی بخوێنێتەوە.' },
      { key: 'ai_max_attempts', label: 'زۆرترین پرسیار', type: 'num', unit: 'جار', min: 1, max: 20,
        help: 'دوای ئەمە نامەکە دەدرێت بە گرووپی گشتی.' },
      { key: 'general_group', label: 'گرووپی گشتی', type: 'group', help: 'ئەو نامانەی پۆستەکەیان نەدۆزرایەوە دەچن بۆ ئەم گرووپە.' },
      { key: 'grouping_max_hours', label: 'کۆکردنەوەی نامەکانی یەک کڕیار', type: 'num', unit: 'کاتژمێر', min: 0, max: 168,
        help: 'نامەی نوێی هەمان کڕیار لەم ماوەیەدا دەچێتە سەر هەمان نامە، نەک نامەیەکی نوێ.' },
      { key: 'ai_candidate_grace_days', label: 'پۆستی کۆن بۆ AI', type: 'num', unit: 'ڕۆژ', min: 0, max: 365,
        help: 'پۆستێک کە ڕیکلامەکەی تەواو بووە تا ئەم ماوەیە هێشتا لەلای AI دەناسرێتەوە.' },
      { key: 'ignored_prefills', label: 'نامە گشتییەکانی فەیسبووک', type: 'lines',
        help: 'هەر دێڕێک یەک نامە. ئەم نامانە بۆ ناسینەوەی پۆست بەکارناهێنرێن (وەک «Hello! Can I get more info on this?»).' },
    ],
  },
  {
    id: 'wa', title: 'ئاگادارکردنەوەی کارمەندان لە واتسئاپ', icon: 'bell',
    sub: 'نامەی واتسئاپ بۆ ژمارەی تایبەتی کارمەند — لە ژمارەی bsg-test.',
    fields: [
      { key: 'wa_notify_enabled', label: 'کلیلی سەرەکی', type: 'bool', help: 'ئەگەر کوژاوە بێت، هیچ نامەیەک نانێردرێت — نە خۆکار نە بە دەست.', master: true },
      { key: 'wa_reminder_enabled', label: 'بیرخستنەوەی نامەی وەڵامنەدراوە', type: 'bool' },
      { key: 'wa_reminder_hours', label: 'بیرخستنەوە دوای', type: 'num', unit: 'کاتژمێر، دووبارە هەر ئەوەندە جار', min: 1, max: 72 },
      { key: 'wa_passed_enabled', label: 'کاتێک نامەیەک دەگوازرێتەوە بۆی', type: 'bool' },
      { key: 'wa_newpost_enabled', label: 'کاتێک پۆستێکی نوێی بۆ دادەنرێت', type: 'bool' },
      { key: 'wa_newlead_enabled', label: 'بۆ هەموو نامەیەکی نوێ', type: 'bool', help: 'زۆرجار پێویست نییە — ئەپەکە پێشتر ئاگاداری دەکاتەوە.' },
      { key: 'wa_notify_only_no_app', label: 'تەنها ئەوانەی ئەپیان نییە', type: 'bool', help: 'بیرخستنەوە هەمیشە بۆ هەمووان دەچێت.' },
      { key: 'wa_notify_max_per_day', label: 'زۆرترین نامە بۆ یەک کارمەند لە ڕۆژێکدا', type: 'num', unit: 'نامە', min: 1, max: 100 },
    ],
  },
  {
    id: 'app', title: 'ئەپی کارمەندان', icon: 'bell',
    sub: 'ئاگادارکردنەوەی ناو ئەپ و نوێکردنەوەی ئەندرۆید.',
    fields: [
      { key: 'push_enabled', label: 'ئاگادارکردنەوەی ناو ئەپ (Push)', type: 'bool' },
      { key: 'android_min_build', label: 'کەمترین وەشانی ئەندرۆید', type: 'num', unit: 'build', min: 0, max: 100000,
        help: 'تەنها دوای ئەوەی وەشانی نوێ لە Play Store بڵاوکرایەوە بەرزی بکەرەوە.' },
      { key: 'android_force_update', label: 'ناچارکردنی نوێکردنەوە', type: 'bool' },
      { key: 'android_update_url', label: 'لینکی نوێکردنەوە', type: 'str', ltr: true },
    ],
  },
  {
    id: 'meta', title: 'فەیسبووک و بووست', icon: 'megaphone',
    sub: 'بڕی پێشوەختەی بووست. شارەکان وەک خۆیان دەمێننەوە. Boost ی پەیوەندی (بۆ کارمەندی بێ ئەپ): دوگمەی «Call now»، تەنها هەولێر.',
    fields: [
      { key: 'meta_boost_defaults', sub: 'per_day', label: 'پارەی ڕۆژانە (پێشوەخت)', type: 'jnum', unit: '$', min: 1, max: 100 },
      { key: 'meta_boost_defaults', sub: 'days', label: 'چەند ڕۆژ (پێشوەخت)', type: 'jnum', unit: 'ڕۆژ', min: 1, max: 60 },
      { key: 'meta_boost_defaults', sub: 'max_per_day', label: 'زۆرترین پارەی ڕۆژانە', type: 'jnum', unit: '$', min: 1, max: 500 },
      { key: 'meta_boost_defaults', sub: 'max_days', label: 'زۆرترین ڕۆژ', type: 'jnum', unit: 'ڕۆژ', min: 1, max: 90 },
      { key: 'meta_boost_defaults', sub: 'greeting', label: 'سڵاوی ناو واتسئاپی ڕیکلام', type: 'jstr' },
      { key: 'meta_boost_defaults', sub: 'call.per_day', label: 'Boost ی پەیوەندی — پارەی ڕۆژانە', type: 'jnum', unit: '$', min: 1, max: 100 },
      { key: 'meta_boost_defaults', sub: 'call.days', label: 'Boost ی پەیوەندی — چەند ڕۆژ', type: 'jnum', unit: 'ڕۆژ', min: 1, max: 60 },
    ],
  },
  {
    id: 'tpl-cust', tab: 'tpl', title: 'بۆ کڕیار', icon: 'chat',
    sub: 'ئەو نامانەی کڕیار لە واتسئاپی کۆڵ سەنتەرەوە وەریان دەگرێت.',
    fields: [
      { key: 'auto_reply_template', label: 'وەڵامی یەکەم (خۆکار)', type: 'text', rows: 10, tokens: ['{realtor_name}', '{realtor_number}', '{post_headline}'] },
      { key: 'ai_giveup_reply', label: 'کاتێک AI نەیتوانی پۆستەکە بدۆزێتەوە', type: 'text', rows: 6, tokens: ['{realtor}', '{realtor_number}'] },
    ],
  },
  {
    id: 'tpl-wa', tab: 'tpl', title: 'بۆ کارمەند — خۆکار لە واتسئاپ', icon: 'bell',
    sub: 'ئەگەر دێڕێک نیشانەیەکی تێدابێت و بەتاڵ بێت (بۆ نموونە پۆستی بێ لینک)، ئەو دێڕە خۆی لادەبرێت.',
    fields: [
      { key: 'tpl_wa_reminder', label: 'بیرخستنەوەی نامەی وەڵامنەدراوە', type: 'text', rows: 6, tokens: ['{name}', '{waiting}', '{oldest_hours}'] },
      { key: 'tpl_wa_passed', label: 'نامەیەک گوازرایەوە بۆی', type: 'text', rows: 4, tokens: ['{name}', '{headline}'] },
      { key: 'tpl_wa_newlead', label: 'نامەیەکی نوێی بۆ هات', type: 'text', rows: 4, tokens: ['{name}', '{headline}'] },
      { key: 'tpl_wa_newpost', label: 'پۆستێکی نوێی بۆ دانرا', type: 'text', rows: 7, tokens: ['{name}', '{headline}', '{code}', '{url}'] },
    ],
  },
  {
    id: 'tpl-man', tab: 'tpl', title: 'بۆ کارمەند — لە داشبۆردەوە', icon: 'send',
    sub: 'ئەو دەقانەی پێش ناردن لە داشبۆرد دەردەکەون و دەتوانیت دەستکارییان بکەیت.',
    fields: [
      { key: 'tpl_manual_notify', label: 'دوگمەی «ئاگادارکردنەوە»', type: 'text', rows: 3, tokens: ['{name}', '{pending}'] },
      { key: 'tpl_onboard', label: 'ڕێنمایی ئەپ بۆ کارمەندی نوێ', type: 'text', rows: 16, tokens: ['{name}', '{email}', '{password}', '{android_link}', '{iphone_link}'] },
    ],
  },
];


const jget = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function jset(o, path, v) { const ks = path.split('.'); let a = o; ks.slice(0, -1).forEach((k) => { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; a = a[k]; }); a[ks[ks.length - 1]] = v; }
async function loadAllSettings() {
  const rows = await get('system_settings?select=key,value,updated_at&order=key.asc');
  ST.rows = rows || [];
  ST.all = Object.fromEntries(ST.rows.map((r) => [r.key, r.value]));
  ST.at = Object.fromEntries(ST.rows.map((r) => [r.key, r.updated_at]));
}
function setVal(f) {
  if (f.type === 'jnum' || f.type === 'jstr') {
    let o = {}; try { o = JSON.parse(ST.all.meta_boost_defaults || '{}'); } catch (e) { /* bad json */ }
    const v = jget(o, f.sub);
    return v == null ? '' : String(v);
  }
  return ST.all[f.key] == null ? '' : String(ST.all[f.key]);
}
function fieldId(f) { return 'st-' + f.key + (f.sub ? '-' + f.sub.replace(/\./g, '_') : ''); }
function fieldHtml(f) {
  const v = setVal(f), id = fieldId(f);
  const help = f.help ? `<div class="hint">${esc(f.help)}</div>` : '';
  if (f.type === 'bool') {
    const on = v === 'true';
    return `<div class="st-row ${f.master ? 'master' : ''}"><div class="st-t"><b>${esc(f.label)}</b>${help}</div>
      <button type="button" class="switch" role="switch" aria-checked="${on}" data-bool="${esc(f.key)}" aria-label="${esc(f.label)}"></button></div>`;
  }
  if (f.type === 'days') {
    const set = new Set(v.split(',').map((x) => x.trim()).filter(Boolean));
    return `<div class="field"><span class="label">${esc(f.label)}</span><div class="st-days" id="${id}" data-field="${esc(f.key)}">${DAYS.map(([n, l]) => `<button type="button" data-day="${n}" aria-pressed="${set.has(String(n))}">${esc(l)}</button>`).join('')}</div>${help}</div>`;
  }
  if (f.type === 'group') {
    const names = [...new Set((S.groups || []).map((g) => g.name))].sort((a, b) => a.localeCompare(b));
    return `<div class="field"><label class="label" for="${id}">${esc(f.label)}</label><select class="select" id="${id}" data-field="${esc(f.key)}">${names.map((n) => `<option ${n === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${help}</div>`;
  }
  if (f.type === 'text' || f.type === 'lines') {
    const val = f.type === 'lines' ? v.split('|').join('\n') : v.replace(/\r\n/g, '\n');
    return `<div class="field"><label class="label" for="${id}">${esc(f.label)}</label>
      ${f.tokens ? `<div class="st-tokens">${f.tokens.map((t) => `<button type="button" class="chip accent" data-token="${esc(t)}" data-target="${id}">${esc(t)}</button>`).join('')}<span class="hint">کلیک بکە بۆ دانانی</span></div>` : ''}
      <textarea class="textarea" id="${id}" data-field="${esc(f.key)}" rows="${f.rows || 4}" ${f.type === 'lines' ? 'dir="auto"' : ''}>${esc(val)}</textarea>${help}</div>`;
  }
  const isNum = f.type === 'num' || f.type === 'jnum';
  return `<div class="field"><label class="label" for="${id}"><span>${esc(f.label)}</span>${f.unit ? `<span class="aux">${esc(f.unit)}</span>` : ''}</label>
    <input class="input ${isNum || f.ltr ? 'mono' : ''}" id="${id}" data-field="${esc(f.key)}" ${f.sub ? `data-sub="${esc(f.sub)}"` : ''} ${isNum ? `inputmode="decimal" dir="ltr"` : (f.ltr ? 'dir="ltr"' : 'dir="auto"')} value="${esc(v)}">${help}</div>`;
}
function readField(root, f) {
  const el = $('#' + fieldId(f), root); if (!el) return null;
  if (f.type === 'days') return $$('button[aria-pressed="true"]', el).map((b) => b.dataset.day).sort().join(',');
  if (f.type === 'lines') return el.value.split('\n').map((s) => s.trim()).filter(Boolean).join('|');
  return el.value;
}

const ST_TABS = [['main', 'ڕێکخستنەکان', 'sliders'], ['tpl', 'دەقی نامەکان', 'chat'], ['blocked', 'بلۆککراوەکان', 'ban']];
function mountSettings(root, arg) {
  ST.tab = ST_TABS.some((t) => t[0] === arg) ? arg : (ST.tab || 'main');
  root.innerHTML = `<div class="page" style="max-width:980px">
    <div class="page-head"><div><h1 class="page-title">ڕێکخستنەکان</h1><div class="page-sub">هەموو ڕێکخستن و دەقی نامەکانی سیستەم لە یەک شوێن.</div></div></div>
    <div class="seg st-tabs" role="tablist">${ST_TABS.map(([k, l, i]) => `<button type="button" role="tab" data-sttab="${k}" aria-pressed="${ST.tab === k}">${ic(i, 14)} ${esc(l)}</button>`).join('')}</div>
    <div id="st-body" class="st-tabbody"><div class="card"><div class="loading-row"><span class="spin"></span> بارکردن…</div></div></div>
  </div>`;
  $$('[data-sttab]', root).forEach((b) => b.addEventListener('click', () => {
    ST.tab = b.dataset.sttab; history.replaceState(null, '', '#/settings/' + ST.tab);
    $$('[data-sttab]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    showSettingsTab();
  }));
  $('#st-body').addEventListener('click', onSettingsClick);
  showSettingsTab();
}
function showSettingsTab() {
  const body = $('#st-body'); if (!body) return;
  if (ST.tab === 'blocked') { mountBlocked(body); return; }
  if (ST.rows) { paintSettings(); return; }
  Promise.all([loadAllSettings(), loadNotifyLog().catch(() => {})]).then(() => paintSettings()).catch((e) => { toastErr(e); body.innerHTML = `<div class="card"><div class="empty">${ic('alert', 30)}<div>ڕێکخستنەکان نەهێنران</div></div></div>`; });
}
function paintSettings() {
  const body = $('#st-body'); if (!body || ST.tab === 'blocked') return;
  const tab = ST.tab === 'tpl' ? 'tpl' : 'main';
  body.innerHTML = (tab === 'tpl' ? `<div class="card st-note">${ic('note', 16)}<span>نیشانەکان وەک <span class="mono">{name}</span> لە کاتی ناردندا بە زانیاری ڕاستەقینە پڕ دەکرێنەوە. کلیک لە نیشانەیەک بکە بۆ دانانی لە شوێنی نووسین.</span></div>` : '')
    + SET_SECTIONS.filter((s) => (s.tab || 'main') === tab).map((s) => `
    <section class="card st-sec" data-sec="${s.id}">
      <div class="st-head">${ic(s.icon, 18)}<div><h2>${esc(s.title)}</h2><div class="page-sub">${esc(s.sub)}</div></div></div>
      <div class="st-grid">${s.fields.map(fieldHtml).join('')}</div>
      ${s.id === 'wa' ? waExtraHtml() : ''}
      ${s.id === 'meta' ? metaExtraHtml() : ''}
      ${s.fields.some((f) => f.type !== 'bool') ? `<div class="st-foot"><button type="button" class="btn primary" data-save="${s.id}">${ic('check', 15)} پاشەکەوتکردنی ئەم بەشە</button></div>` : ''}
    </section>`).join('');
}
function waExtraHtml() {
  const url = ST.all.wa_notify_url || '';
  const log = ST.log;
  const stTxt = { sent: 'نێردرا', skipped: 'نەنێردرا', failed: 'سەرنەکەوت', queued: 'لە ڕێگادا' };
  const kindTxt = { reminder: 'بیرخستنەوە', passed: 'گواستنەوە', new_post: 'پۆستی نوێ', new_lead: 'نامەی نوێ', manual: 'بە دەست' };
  return `<div class="st-extra">
    <div class="hint">${ic('link', 13)}<span>n8n: <span class="mono">${esc(url || '—')}</span></span></div>
    <div class="st-test">
      <b>ناردنی نامەی تاقیکردنەوە</b>
      <div class="hint">پێویستە کلیلی سەرەکی داگیرسابێت. ئەم نامەیە سنووری ڕۆژانە و «تەنها بێ ئەپ» نایگرێتەوە.</div>
      <div class="st-test-row">
        <select class="select" id="st-test-r">${(S.realtors || []).filter((r) => r.active !== false && r.whatsapp_number).map((r) => `<option value="${esc(r.id)}">${esc(r.name)} · ${esc(r.whatsapp_number)}</option>`).join('')}</select>
        <input class="input" id="st-test-t" value="تاقیکردنەوەی ئاگادارکردنەوەی کۆڵ سەنتەر ✅">
        <button type="button" class="btn" data-act="wa-test">${ic('send', 14, 'flip')} ناردن</button>
      </div>
    </div>
    <div class="st-log"><b>دوایین نامەکان</b>${!log ? '<div class="hint">…</div>' : !log.length ? '<div class="hint">هێشتا هیچ نامەیەک نەنێردراوە.</div>'
      : `<table class="t st-logt"><tbody>${log.map((n) => `<tr><td>${esc(fmtDT(n.created_at))}</td><td>${esc((S.realtorById.get(n.realtor_id) || {}).name || '—')}</td><td>${esc(kindTxt[n.kind] || n.kind)}</td><td><span class="chip ${n.status === 'sent' ? 'ok' : n.status === 'failed' ? 'bad' : ''}">${esc(stTxt[n.status] || n.status)}</span>${n.detail ? ' <span class="hint">' + esc(n.detail) + '</span>' : ''}</td></tr>`).join('')}</tbody></table>`}</div>
  </div>`;
}
async function loadNotifyLog() {
  try { ST.log = await get('realtor_notifications?select=id,realtor_id,kind,status,detail,created_at&order=created_at.desc&limit=15'); }
  catch (e) { ST.log = []; }
}
function metaExtraHtml() {
  const a = ST.all;
  const left = a.meta_token_data_access_at ? Math.ceil((Date.parse(a.meta_token_data_access_at + 'T12:00:00Z') - Date.now()) / 864e5) : null;
  return `<div class="st-extra">
    <div class="st-kv">
      <div><span>پەیج</span><b class="mono">${esc(a.meta_page_id || '—')}</b></div>
      <div><span>ئەکاونتی ڕیکلام</span><b class="mono">${esc(a.meta_ad_account || '—')}</b></div>
      <div><span>تۆکن</span><b>${a.meta_token_expires_at === 'never' ? 'هەرگیز بەسەرناچێت' : esc(a.meta_token_expires_at || '—')}</b></div>
      <div><span>دەستگەیشتن بە داتا تا</span><b class="${left != null && left <= 20 ? 'bad' : ''}">${esc(a.meta_token_data_access_at || '—')}${left != null ? ' · ' + left + ' ڕۆژ' : ''}</b></div>
      <div><span>دوایین پشکنین</span><b>${a.meta_token_checked_at ? esc(ago(a.meta_token_checked_at, true)) : '—'}</b></div>
    </div>
    <div class="st-foot" style="justify-content:flex-start"><button type="button" class="btn" data-act="token-check">${ic('refresh', 14)} پشکنینی تۆکن ئێستا</button></div>
  </div>`;
}

async function saveKey(key, value) { return rpc('manager_set_setting', { p_key: key, p_value: String(value) }); }
async function onSettingsClick(e) {
  const t = e.target;
  const day = t.closest('[data-day]'); if (day) { day.setAttribute('aria-pressed', String(day.getAttribute('aria-pressed') !== 'true')); return; }
  const tok = t.closest('[data-token]');
  if (tok) {
    const ta = $('#' + tok.dataset.target); if (!ta) return;
    const s = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? s;
    ta.value = ta.value.slice(0, s) + tok.dataset.token + ta.value.slice(en);
    ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.dataset.token.length;
    return;
  }
  const sw = t.closest('[data-bool]');
  if (sw) {
    const key = sw.dataset.bool, next = sw.getAttribute('aria-checked') !== 'true';
    const run = async () => {
      sw.disabled = true;
      try { await saveKey(key, next); ST.all[key] = String(next); sw.setAttribute('aria-checked', String(next)); toast('پاشەکەوت کرا'); if (key === 'wa_notify_enabled') { S.settings.wa_notify_enabled = String(next); } }
      catch (err) { toastErr(err); }
      finally { sw.disabled = false; }
    };
    if (key === 'wa_notify_enabled' && next) {
      modal({ title: 'داگیرساندنی ئاگادارکردنەوەی واتسئاپ؟', body: 'ئەوانەی خوارەوە کە داگیرساون دەست دەکەن بە ناردنی نامە بۆ ژمارەی تایبەتی کارمەندان. پێشنیار: سەرەتا بە نامەی تاقیکردنەوە دەست پێبکە.', confirmText: 'داگیرساندن', onConfirm: run });
    } else run();
    return;
  }
  const sv = t.closest('[data-save]');
  if (sv) {
    const sec = SET_SECTIONS.find((s) => s.id === sv.dataset.save); const root = sv.closest('.st-sec');
    const changes = [];
    let jsonObj = null;
    for (const f of sec.fields) {
      if (f.type === 'bool') continue;
      const v = readField(root, f); if (v == null) continue;
      if (f.type === 'jnum' || f.type === 'jstr') {
        if (!jsonObj) { try { jsonObj = JSON.parse(ST.all.meta_boost_defaults || '{}'); } catch (x) { jsonObj = {}; } }
        const nv = f.type === 'jnum' ? Number(toLatin(v)) : v;
        if (f.type === 'jnum' && (!isFinite(nv) || nv < f.min || nv > f.max)) { toast(`${f.label}: دەبێت لە نێوان ${f.min} و ${f.max} بێت`, 'err'); return; }
        jset(jsonObj, f.sub, nv);
        continue;
      }
      const val = f.type === 'num' ? toLatin(v).trim() : v;
      if (f.type === 'num' && (val === '' || isNaN(Number(val)) || Number(val) < f.min || Number(val) > f.max)) { toast(`${f.label}: دەبێت لە نێوان ${f.min} و ${f.max} بێت`, 'err'); return; }
      if (val !== setVal(f).replace(/\r\n/g, '\n') && !(f.type === 'text' && val === setVal(f))) changes.push([f.key, val]);
    }
    if (jsonObj) { const js = JSON.stringify(jsonObj); if (js !== ST.all.meta_boost_defaults) changes.push(['meta_boost_defaults', js]); }
    if (sec.id === 'hours') {
      const o = Number(toLatin(readField(root, sec.fields[0]))), c = Number(toLatin(readField(root, sec.fields[1])));
      if (o >= c) { toast('کاتی کۆتایی دەبێت دوای دەستپێک بێت', 'err'); return; }
    }
    if (!changes.length) { toast('هیچ شتێک نەگۆڕاوە'); return; }
    busy(sv, true);
    try {
      for (const [k, v] of changes) { const r = await saveKey(k, v); ST.all[k] = r && r.value != null ? r.value : v; }
      toast(changes.length === 1 ? 'پاشەکەوت کرا' : fmtN(changes.length) + ' گۆڕانکاری پاشەکەوت کرا');
      changes.forEach(([k, v]) => { if (k in (S.settings || {}) || /^tpl_/.test(k)) S.settings[k] = v; });
      loadSettings().then(() => paintTokenWarn()).catch(() => {});
    } catch (err) { toastErr(err); }
    finally { busy(sv, false); }
    return;
  }
  const act = t.closest('[data-act]');
  if (act && act.dataset.act === 'wa-test') {
    const rid = $('#st-test-r').value, text = $('#st-test-t').value.trim();
    if (!rid || !text) return;
    busy(act, true);
    try {
      const r = await rpc('manager_notify_realtor', { p_realtor_id: rid, p_body: text });
      if (r && r.ok === false) toast(r.reason === 'wa_notify_off' ? 'کلیلی سەرەکی کوژاوەیە — سەرەتا دایبگیرسێنە.' : 'نەنێردرا: ' + (r.reason || ''), 'err');
      else toast(r && r.duplicate ? 'ئەم نامەیە پێشتر نێردراوە' : 'نێردرا — چەند چرکەیەکی تر دەگات');
      await loadNotifyLog(); paintSettings();
    } catch (err) { toastErr(err); }
    finally { busy(act, false); }
    return;
  }
  if (act && act.dataset.act === 'token-check') {
    busy(act, true);
    try {
      const r = await metaCall({ action: 'token_check' });
      toast(r.data_access_expires_at ? 'دەستگەیشتن بە داتا تا ' + r.data_access_expires_at : 'پشکنرا');
      await loadAllSettings(); await loadSettings().catch(() => {}); paintTokenWarn(); loadHealth(); paintSettings();
    } catch (err) { toastErr(err); }
    finally { busy(act, false); }
  }
}
