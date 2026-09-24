
/* ============================ ads (Facebook) ============================ */
const A = { preset: lsGet('bsg_ads_range', '7d'), tab: 'now', kind: 'all', q: '', sort: 'spend', rows: null, loading: false, seq: 0, loadedAt: 0, sync: null, syncing: false, allRecs: false, med: 1 };
const ADS_RANGES = [['today', 'ئەمڕۆ'], ['yesterday', 'دوێنێ'], ['3d', '3 ڕۆژ'], ['7d', '7 ڕۆژ'], ['14d', '14 ڕۆژ'], ['30d', '30 ڕۆژ']];
const ADS_TABS = [['now', 'ئێستا کار دەکەن'], ['action', 'پێویستی بە کار هەیە'], ['ended', 'تەواوبوو / ڕاگیراو'], ['all', 'هەموو']];
const ADS_SORTS = [['spend', 'زۆرترین خەرجی'], ['leads', 'زۆرترین کڕیار'], ['cpl', 'گرانترین کڕیار'], ['new', 'نوێترین']];
const DEST = { WHATSAPP: 'واتسئاپ', ON_POST: 'لایک و کۆمێنت', ON_VIDEO: 'بینینی ڤیدیۆ', PHONE_CALL: 'پەیوەندی تەلەفۆنی', MESSENGER: 'مەسنجەر', ON_PAGE: 'لایکی پەیج', WEBSITE: 'ماڵپەڕ', INSTAGRAM_DIRECT: 'ئینستاگرام' };
const destLabel = (d) => DEST[d] || (d ? d : 'نەزانراو');
const LV = { bad: 3, warn: 2, good: 1, info: 0 };
/* money that stays "$12" (not "12$") inside Kurdish sentences */
const usd = (n) => { const m = money(n); return m === '—' ? m : '\u2066' + m + '\u2069'; };

function adsDates() {
  const t = todayYMD();
  switch (A.preset) {
    case 'today': return [t, t];
    case 'yesterday': { const y = addDays(t, -1); return [y, y]; }
    case '3d': return [addDays(t, -2), t];
    case '14d': return [addDays(t, -13), t];
    case '30d': return [addDays(t, -29), t];
    default: return [addDays(t, -6), t];
  }
}
const adTitle = (r) => cleanSpaces(r.headline || String(r.name || '').replace(/^Post:\s*/i, '').replace(/[\u200e\u200f"]/g, '')) || 'ڕیکلام';
const adLabel = (r) => (r.post_code ? 'Code:' + r.post_code : '«' + adTitle(r).slice(0, 40) + '»');
const daysTxt = (d) => (d < 1 ? Math.max(1, Math.round(d * 24)) + ' کاتژمێر' : Math.round(d) + ' ڕۆژ');
const ratio = (a, b) => (b ? a / b : 0);

/* ---------- enrich every row + build recommendations ---------- */
function enrichAds(rows) {
  const now = Date.now();
  const list = (rows || []).map((r) => {
    const end = r.adset_end_time ? Date.parse(r.adset_end_time) : null;
    const st = r.effective_status || '';
    const x = Object.assign({}, r);
    x.isWA = r.destination_type === 'WHATSAPP';
    x.ended = !!(end && end < now);
    x.running = st === 'ACTIVE' && !x.ended;
    x.review = ['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED'].includes(st) && !x.ended;
    x.paused = ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(st);
    x.broken = ['WITH_ISSUES', 'DISAPPROVED'].includes(st) && !x.ended;
    x.spendN = Number(r.spend) || 0; x.leadsN = Number(r.leads) || 0;
    x.cpl = x.leadsN ? x.spendN / x.leadsN : null;
    x.perDay = r.daily_budget_cents ? r.daily_budget_cents / 100 : null;
    x.end = end; x.daysLeft = end ? (end - now) / 864e5 : null;
    x.freq = r.lifetime_frequency != null ? Number(r.lifetime_frequency) : null;
    x.ctr = r.impressions ? (Number(r.clicks) * 100) / Number(r.impressions) : null;
    x.post = r.facebook_post_id ? S.postById.get(r.facebook_post_id) : null;
    x.img = x.post && x.post.image_url && x.post.image_url !== 'none' ? x.post.image_url : null;
    const iss = Array.isArray(r.issues) ? r.issues[0] : null;
    x.issue = iss ? (iss.error_code === 2446214 ? 'deleted' : (iss.error_summary || iss.error_message || 'کێشە')) : null;
    x.ageH = r.created_time ? (now - Date.parse(r.created_time)) / 36e5 : 999;
    x.owner = r.realtor_name || (r.group_name ? 'گرووپی ' + r.group_name : '');
    return x;
  });
  // benchmark: median cost per customer of WhatsApp ads with enough data in this range
  const cpls = list.filter((x) => x.isWA && x.leadsN >= 3 && x.spendN >= 1).map((x) => x.cpl).sort((a, b) => a - b);
  A.med = cpls.length >= 3 ? (cpls.length % 2 ? cpls[(cpls.length - 1) / 2] : (cpls[cpls.length / 2 - 1] + cpls[cpls.length / 2]) / 2) : 1;
  // posts that already have a live ad (or were offered once) should not get a "run it again" tip
  const busyPosts = new Set(list.filter((x) => (x.running || x.review) && x.facebook_post_id).map((x) => x.facebook_post_id));
  [...list].sort((a, b) => (b.end || 0) - (a.end || 0)).forEach((x) => { x.recs = adRecs(x, A.med, busyPosts); x.verdict = adVerdict(x, A.med); x.top = x.recs.reduce((m, r) => Math.max(m, LV[r.lv]), -1); });
  return list;
}

function adVerdict(x, med) {
  if (x.broken) return { cls: 'bad', t: 'کێشەی هەیە' };
  if (x.destination_type === 'PHONE_CALL') return { cls: '', t: 'پەیوەندی', tip: 'ڕیکلامی «Call now» — کڕیار ڕاستەوخۆ پەیوەندی بە کارمەندەوە دەکات و ناگاتە سیستەم' };
  if (!x.isWA) return { cls: '', t: 'ئەنجام نازانرێت', tip: 'ئەم ڕیکلامە بۆ ' + destLabel(x.destination_type) + ' ـە، کڕیارەکانی ناژمێردرێن' };
  const noLead = Math.max(3, 2.5 * med);
  if (x.leadsN > 0) {
    if (x.cpl <= 1.2 * med) return { cls: 'ok', t: 'باشە' };
    if (x.cpl <= 2 * med) return { cls: 'warn', t: 'مامناوەند' };
    return { cls: 'bad', t: 'گرانە' };
  }
  if (x.spendN >= noLead) return { cls: 'bad', t: 'بێ کڕیار' };
  if (x.running || x.review) return { cls: '', t: 'زووە' };
  return null;
}

function adRecs(x, med, runningPosts) {
  const out = [];
  const add = (lv, text, acts = []) => out.push({ lv, text, acts });
  const D = metaDefaults();
  const noLead = Math.max(3, 2.5 * med);
  const who = x.owner ? '«' + x.owner + '»' : 'کارمەندەکە';
  if (x.broken) {
    if (x.issue === 'deleted') add('bad', 'پۆستی ئەم ڕیکلامە لە فەیسبووک سڕاوەتەوە، بۆیە ناڕوات. ئەگەر خانووەکە هێشتا بەردەستە، پۆستەکە دووبارە دابنێ و Boost ی بکە.', x.post ? ['reboost', 'fb'] : ['fb']);
    else add('bad', 'فەیسبووک ئەم ڕیکلامەی ڕاگرتووە: ' + x.issue + '. لە Ads Manager چاوی لێ بکە.', ['fb']);
    return out;
  }
  if (x.review) { add('info', 'فەیسبووک پێداچوونەوەی بۆ دەکات — زۆربەی کات چەند خولەکێک دەخایەنێت.'); return out; }
  if (x.running) {
    if (x.destination_type === 'PHONE_CALL') {
      add('info', `ڕیکلامی پەیوەندییە (بۆ کارمەندی بێ ئەپ) — کڕیار ڕاستەوخۆ پەیوەندی دەکات، بۆیە کڕیارەکانی لێرە ناژمێردرێن. تا ئێستا ${usd(x.spendN)} خەرجی کردووە.`, ['fb']);
      return out;
    }
    if (!x.isWA) {
      add(x.spendN >= 10 ? 'bad' : 'warn', `ئەم ڕیکلامە بۆ «${destLabel(x.destination_type)}» ـە نەک واتسئاپ — کڕیارەکانی ناگەنە سیستەم و نازانرێت چەند کڕیاری هێناوە. لەم ماوەیەدا ${usd(x.spendN)} خەرجی کردووە.${x.spendN >= 10 ? ' ئەگەر ئامانجت کڕیارە، ڕایبگرە و پۆستەکە بە Boost ی واتسئاپ بڵاو بکەرەوە.' : ''}`, ['pause', 'fb']);
      return out;
    }
    if (!x.post_code) add('warn', 'پۆستی ئەم ڕیکلامە لە سیستەم نییە — کڕیارەکان بە AI دابەش دەکرێن و ڕەنگە بۆ کەسی هەڵە بچن. پۆستەکە زیاد بکە.', ['newPost']);
    if (x.leadsN === 0 && x.spendN >= noLead) {
      add('bad', `${usd(x.spendN)} خەرج کرا و هیچ کڕیارێک نەهات. ڕایبگرە — وێنە یان نووسینی پۆستەکە سەرنجڕاکێش نییە، یان نرخەکە گونجاو نییە.`, ['pause']);
    } else if (x.leadsN > 0 && x.spendN >= 3 && x.cpl > 2 * med) {
      add('bad', `هەر کڕیارێک ${usd(x.cpl)} تێدەچێت — ${(x.cpl / med).toFixed(1)} هێندەی ناوەندی ڕیکلامەکانتە (${usd(med)}). بودجە کەم بکەرەوە یان ڕایبگرە.`, x.perDay && x.perDay > 1 ? ['budgetDown', 'pause'] : ['pause']);
    } else if (x.leadsN > 0 && x.spendN >= 2 && x.cpl > 1.4 * med) {
      add('warn', `کەمێک گرانە: ${usd(x.cpl)} بۆ هەر کڕیارێک (ناوەند ${usd(med)}). چاودێری بکە، ئەگەر باشتر نەبوو ڕایبگرە.`);
    }
    if (x.freq != null && x.freq >= 3) add('warn', `هەمان خەڵک بە تێکڕا ${x.freq.toFixed(1)} جار ئەم ڕیکلامەیان بینیوە — خەریکە بێزار دەبن و نرخ بەرز دەبێتەوە. وێنە یان پۆستێکی نوێ باشترە.`);
    const open = Number(x.open_leads) || 0, escd = Number(x.escalated) || 0;
    if (open >= 3 && ratio(open, x.leadsN) >= 0.3) add('warn', `${fmtN(open)} کڕیار هێشتا وەڵام نەدراونەتەوە — کێشەکە لە ڕیکلامەکە نییە، لە وەڵامدانەوەی ${who}ـە. پەیوەندی پێوە بکە.`, ['leads']);
    else if (escd >= 3 && ratio(escd, x.leadsN) >= 0.3) add('warn', `${fmtN(escd)} کڕیار کەس وەرینەگرتن و تەسلیم کران — ${who} بە کات وەڵامی نەداونەتەوە.`, ['leads']);
    const good = x.leadsN >= 5 && x.cpl <= 1.2 * med;
    if (good && x.daysLeft != null && x.daysLeft < 1.5) add('good', `ئەنجامی باشە (${usd(x.cpl)} بۆ هەر کڕیارێک) و تەنها ${daysTxt(x.daysLeft)} ماوە — درێژی بکەرەوە.`, ['extend']);
    if (x.leadsN >= 5 && x.cpl <= 0.6 * med && x.perDay && x.perDay < D.max_per_day && (x.freq == null || x.freq < 2.5)) add('good', `زۆر باشە — هەر کڕیارێک تەنها ${usd(x.cpl)}. بودجە زیاد بکە بۆ کڕیاری زیاتر.`, ['budgetUp']);
    if (x.leadsN === 0 && x.spendN < noLead) add('info', x.ageH < 24 ? 'تازە دەستی پێکردووە — با یەک ڕۆژ کار بکات ئینجا بڕیار بدە.' : `زووە بۆ بڕیاردان — تا ئێستا ${usd(x.spendN)} خەرج کراوە.`);
    return out;
  }
  // finished ads that did well -> offer to run them again
  if (x.ended && x.isWA && x.post && !x.issue && x.leadsN >= 5 && x.cpl <= 1.2 * med && (Date.now() - x.end) < 4 * 864e5 && !runningPosts.has(x.facebook_post_id)) {
    runningPosts.add(x.facebook_post_id);
    add('good', `ئەم ڕیکلامە باش بوو (${fmtN(x.leadsN)} کڕیار، ${usd(x.cpl)} بۆ هەر یەک) و ${ago(x.adset_end_time, true)} تەواو بوو. ئەگەر خانووەکە هێشتا بەردەستە، درێژی بکەرەوە.`, ['extend']);
  }
  return out;
}

/* ---------- load ---------- */
async function loadAds(opts = {}) {
  const seq = ++A.seq;
  A.loading = true; if (!opts.silent) renderAds();
  try {
    const [a, b] = adsDates();
    const [rows, sync] = await Promise.all([
      rpc('manager_ads_report', { p_start: a, p_end: b }),
      get('meta_sync_log?select=id,source,ok,error,started_at,finished_at&order=id.desc&limit=1').catch(() => null),
    ]);
    if (seq !== A.seq) return;
    A.rows = enrichAds(rows);
    A.sync = sync && sync[0] ? sync[0] : null;
    A.loadedAt = Date.now();
  } catch (e) { if (seq === A.seq) { toastErr(e); if (!A.rows) A.rows = []; } }
  finally { if (seq === A.seq) { A.loading = false; renderAds(); } }
}
async function syncAdsNow(btn) {
  if (A.syncing) return;
  A.syncing = true; busy(btn, true);
  try {
    const r = await metaCall({ action: 'sync', days: 3 });
    toast(`نوێکرایەوە — ${fmtN(r.ads)} ڕیکلام`);
    await loadAds({ silent: true });
  } catch (e) { toastErr(e); }
  finally { A.syncing = false; const b = $('#ad-sync'); if (b) busy(b, false); }
}

/* ---------- page ---------- */
function mountAds(root) {
  root.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div><h1 class="page-title">ڕیکلامەکان</h1><div class="page-sub">ئەنجامی ڕیکلامەکانی فەیسبووک و ئەوەی پێویستە بیکەیت — هەر کاتژمێرێک خۆکارانە نوێ دەکرێتەوە</div></div>
      <div class="toolbar"><span class="muted" id="ad-synced" style="font-size:12.5px"></span><button type="button" class="btn" id="ad-sync">${ic('refresh', 15)} نوێکردنەوە ئێستا</button></div>
    </div>
    <div class="toolbar"><div class="seg" id="ad-range" role="group" aria-label="ماوە">${ADS_RANGES.map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="${A.preset === k}">${l}</button>`).join('')}</div></div>
    <div class="kpis" id="ad-kpis"></div>
    <section class="card recs-card" id="ad-recs" aria-label="پێشنیارەکان"></section>
    <div class="toolbar">
      <div class="seg" id="ad-tab" role="group" aria-label="پاڵاوتن">${ADS_TABS.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${A.tab === k}">${l}<span class="seg-n" data-n="${k}"></span></button>`).join('')}</div>
      <div class="seg" id="ad-kind" role="group" aria-label="جۆری ڕیکلام">${[['all', 'هەموو جۆرێک'], ['wa', 'واتسئاپ'], ['other', 'جۆری تر']].map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${A.kind === k}">${l}</button>`).join('')}</div>
      <div class="search">${ic('search')}<input class="input" id="ad-q" type="search" placeholder="گەڕان بە کۆد، ناونیشان یان کارمەند…" aria-label="گەڕانی ڕیکلام"></div>
      <label class="sr" for="ad-sort">ڕیزکردن</label>
      <select class="select" id="ad-sort" style="width:auto;height:36px">${ADS_SORTS.map(([k, l]) => `<option value="${k}" ${A.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="ads" id="ad-list"></div>
  </div>`;
  $('#ad-sync').addEventListener('click', (e) => syncAdsNow(e.currentTarget));
  $('#ad-range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]'); if (!b) return;
    A.preset = b.dataset.range; lsSet('bsg_ads_range', A.preset);
    $$('#ad-range button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    loadAds();
  });
  $('#ad-tab').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; A.tab = b.dataset.tab; $$('#ad-tab button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderAdList(); });
  $('#ad-kind').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; A.kind = b.dataset.kind; $$('#ad-kind button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderAdList(); });
  const q = $('#ad-q'); q.value = A.q; q.addEventListener('input', debounce(() => { A.q = q.value; renderAdList(); }, 200));
  $('#ad-sort').addEventListener('change', (e) => { A.sort = e.target.value; renderAdList(); });
  $('#ad-kpis').addEventListener('click', (e) => { const k = e.target.closest('[data-kpi-tab]'); if (!k) return; A.tab = k.dataset.kpiTab; $$('#ad-tab button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tab === A.tab))); renderAdList(); $('#ad-list').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  root.addEventListener('click', onAdsClick);
  renderAds();
  if (!A.rows || Date.now() - A.loadedAt > 60000) loadAds();
}

function renderAds() { renderAdKpis(); renderAdRecs(); renderAdList(); paintSynced(); }
function paintSynced() {
  const el = $('#ad-synced'); if (!el) return;
  const s = A.sync;
  if (!s) { el.textContent = ''; return; }
  el.innerHTML = s.ok === false ? `<span style="color:var(--bad)">${ic('alert', 13)} دوایین نوێکردنەوە سەرنەکەوت</span>` : `نوێکرایەوە ${esc(ago(s.finished_at || s.started_at, true))}`;
  if (s.ok === false && s.error) el.title = s.error;
}

function renderAdKpis() {
  const box = $('#ad-kpis'); if (!box) return;
  if (!A.rows) { box.innerHTML = Array.from({ length: 5 }, () => `<div class="kpi" style="cursor:default"><span class="kl">&nbsp;</span><span class="kn"><span class="spin"></span></span><span class="ks">&nbsp;</span></div>`).join(''); return; }
  const rows = A.rows;
  const wa = rows.filter((x) => x.isWA), other = rows.filter((x) => !x.isWA);
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const waSpend = sum(wa, (x) => x.spendN), otherSpend = sum(other, (x) => x.spendN);
  const leads = sum(wa, (x) => x.leadsN), conv = sum(wa, (x) => x.conversations);
  const live = rows.filter((x) => x.running);
  const perDay = sum(live, (x) => x.perDay);
  const need = rows.filter((x) => x.top >= LV.warn).length;
  const k = (label, tone, n, sub, tab, attn) => {
    const inner = `<span class="kl"><span class="dot"></span>${label}</span><span class="kn num">${n}</span><span class="ks">${sub}</span>`;
    return tab ? `<button type="button" class="kpi ${attn ? 'attn' : ''}" style="--tone:var(${tone})" data-kpi-tab="${tab}">${inner}</button>` : `<div class="kpi static" style="--tone:var(${tone})">${inner}</div>`;
  };
  box.innerHTML =
    k('خەرجی', '--c-ad', usd(waSpend + otherSpend), `واتسئاپ ${usd(waSpend)} · جۆری تر ${usd(otherSpend)}`) +
    k('کڕیار لە ڕیکلامەوە', '--accent', fmtN(leads), `${fmtN(conv)} گفتوگۆ بەپێی فەیسبووک`) +
    k('تێچووی هەر کڕیارێک', '--warn', leads ? usd(waSpend / leads) : '—', `ناوەندی ڕیکلامەکان ${usd(A.med)}`) +
    k('ڕیکلامی چالاک', '--ok', fmtN(live.length), `${usd(perDay)} لە ڕۆژێکدا`, 'now') +
    k('پێویستی بە کار هەیە', '--bad', fmtN(need), need ? 'ڕیکلامی خراپ یان کێشەدار' : 'هەموو شتێک باشە', 'action', need > 0);
}

function recItem(x, rec) {
  return `<div class="rec ${rec.lv}" data-ad="${esc(x.ad_id)}">
    <span class="rec-ic">${ic(rec.lv === 'bad' ? 'xCircle' : rec.lv === 'warn' ? 'alert' : rec.lv === 'good' ? 'checkCircle' : 'clock', 16)}</span>
    <div class="rec-b">
      <div class="rec-h">${x.img ? `<img class="rec-thumb" src="${esc(x.img)}" alt="" loading="lazy">` : ''}<b>${esc(adLabel(x))}</b><span class="muted">${esc(adTitle(x))}</span></div>
      <div class="rec-t">${esc(rec.text)}</div>
    </div>
    <div class="rec-acts">${rec.acts.map((a) => actBtn(x, a, 'sm')).join('')}</div>
  </div>`;
}
function renderAdRecs() {
  const box = $('#ad-recs'); if (!box) return;
  if (!A.rows) { box.innerHTML = `<div class="loading-row"><span class="spin"></span> ئامادەکردنی پێشنیارەکان…</div>`; return; }
  const items = [];
  A.rows.forEach((x) => x.recs.forEach((r) => { if (r.lv !== 'info') items.push({ x, r }); }));
  items.sort((a, b) => (LV[b.r.lv] - LV[a.r.lv]) || (b.x.spendN - a.x.spendN));
  const bad = items.filter((i) => i.r.lv === 'bad').length, warn = items.filter((i) => i.r.lv === 'warn').length, good = items.filter((i) => i.r.lv === 'good').length;
  const head = `<div class="recs-head"><h2>${ic('target', 17)} ئەوەی پێویستە بیکەیت</h2>
    <div class="recs-sum">${bad ? `<span class="chip bad">${fmtN(bad)} خراپ</span>` : ''}${warn ? `<span class="chip warn">${fmtN(warn)} ئاگاداری</span>` : ''}${good ? `<span class="chip ok">${fmtN(good)} دەرفەت</span>` : ''}</div>
    <span class="muted recs-bench" title="ناوەندی تێچووی هەر کڕیارێک لە ڕیکلامە واتسئاپییەکانی ئەم ماوەیەدا — پێوەری باش و خراپ">پێوەر: ${usd(A.med)} بۆ هەر کڕیارێک</span></div>`;
  if (!items.length) { box.innerHTML = head + `<div class="empty" style="padding:22px">${ic('checkCircle', 30)}<div>هیچ کارێکی پێویست نییە — ڕیکلامە چالاکەکان باش دەڕۆن.</div></div>`; return; }
  const shown = A.allRecs ? items : items.slice(0, 6);
  box.innerHTML = head + `<div class="recs">${shown.map((i) => recItem(i.x, i.r)).join('')}</div>` +
    (items.length > 6 ? `<div class="list-more" style="padding:8px"><button type="button" class="btn sm ghost" data-recs-toggle>${A.allRecs ? 'کەمتر' : 'بینینی هەمووی (' + fmtN(items.length) + ')'}</button></div>` : '');
}

function adMatches(x) {
  if (A.kind === 'wa' && !x.isWA) return false;
  if (A.kind === 'other' && x.isWA) return false;
  const q = normTxt(A.q.trim());
  if (q && !normTxt([x.post_code, x.headline, x.name, x.realtor_name, x.group_name, x.ad_id].join(' ')).includes(q)) return false;
  return true;
}
function inTab(x, t) {
  if (t === 'now') return x.running || x.review || x.broken;
  if (t === 'action') return x.top >= LV.good;
  if (t === 'ended') return !(x.running || x.review || x.broken);
  return true;
}
function renderAdList() {
  const box = $('#ad-list'); if (!box) return;
  if (!A.rows) { box.innerHTML = `<div class="loading-row"><span class="spin"></span> بارکردن…</div>`; return; }
  const base = A.rows.filter(adMatches);
  ADS_TABS.forEach(([k]) => { const el = $(`[data-n="${k}"]`); if (el) el.textContent = fmtN(base.filter((x) => inTab(x, k)).length); });
  let list = base.filter((x) => inTab(x, A.tab));
  const by = { spend: (a, b) => b.spendN - a.spendN, leads: (a, b) => b.leadsN - a.leadsN, cpl: (a, b) => (b.cpl ?? (b.spendN ? 1e9 : -1)) - (a.cpl ?? (a.spendN ? 1e9 : -1)), new: (a, b) => String(b.created_time).localeCompare(String(a.created_time)) };
  list = list.sort(by[A.sort] || by.spend);
  if (!list.length) {
    box.innerHTML = `<div class="card empty">${ic('megaphone', 34)}<div>${A.tab === 'now' ? 'ئێستا هیچ ڕیکلامێک کار ناکات' : 'هیچ ڕیکلامێک نییە لەم بەشەدا'}</div>${A.tab === 'now' ? `<button type="button" class="btn primary sm" data-act-new>${ic('plus', 14)} پۆستی نوێ + Boost</button>` : ''}</div>`;
    return;
  }
  box.innerHTML = list.map(adCard).join('');
}

function stateChip(x) {
  if (x.broken) return `<span class="chip bad"><span class="dot"></span>${x.issue === 'deleted' ? 'پۆستەکە سڕاوەتەوە' : 'کێشەی هەیە'}</span>`;
  if (x.review) return `<span class="chip ai"><span class="dot"></span>لە پێداچوونەوەدایە</span>`;
  if (x.running) return `<span class="chip ok"><span class="dot"></span>چالاکە</span>`;
  if (x.paused && !x.ended) return `<span class="chip"><span class="dot"></span>ڕاگیراوە</span>`;
  if (x.ended) return `<span class="chip"><span class="dot"></span>تەواو بووە</span>`;
  return `<span class="chip">${esc(x.effective_status || '—')}</span>`;
}
function endLine(x) {
  const bits = [];
  const bit = (icon, html) => `<span class="pl-bit">${icon ? ic(icon, 13) : ''}<span>${html}</span></span>`;
  if (x.perDay) bits.push(bit('dollar', `<span class="num">${usd(x.perDay)} لە ڕۆژێکدا</span>`));
  if (x.end) bits.push(bit('calendar', `<span class="num">${x.ended ? 'تەواو بوو ' + esc(fmtD(x.adset_end_time)) : 'تا ' + esc(fmtD(x.adset_end_time)) + ' · ' + daysTxt(x.daysLeft) + ' ماوە'}</span>`));
  else if (x.running) bits.push(bit('calendar', 'بێ کۆتایی'));
  if (Number(x.lifetime_spend)) bits.push(bit('', `<span class="muted">کۆی گشتی ${usd(x.lifetime_spend)}</span>`));
  return bits.join('');
}
function actBtn(x, a, size = 'sm') {
  const D = metaDefaults();
  switch (a) {
    case 'pause': return x.running || x.review ? `<button type="button" class="btn ${size} danger" data-ad-act="pause" data-ad="${esc(x.ad_id)}">${ic('pause', 14)} ڕاگرتن</button>` : '';
    case 'resume': return `<button type="button" class="btn ${size}" data-ad-act="resume" data-ad="${esc(x.ad_id)}">${ic('play', 14)} دەستپێکردنەوە</button>`;
    case 'extend': return x.ended || x.running || x.review || x.paused ? `<button type="button" class="btn ${size} ${x.recs && x.recs.some((r) => r.acts.includes('extend')) ? 'primary' : ''}" data-ad-act="extend" data-ad="${esc(x.ad_id)}">${ic('calendar', 14)} ${x.ended ? 'درێژکردنەوە' : 'ماوە'}</button>` : '';
    case 'budget': return x.budget_level ? `<button type="button" class="btn ${size}" data-ad-act="budget" data-ad="${esc(x.ad_id)}">${ic('dollar', 14)} بودجە</button>` : '';
    case 'budgetDown': return x.budget_level ? `<button type="button" class="btn ${size} primary" data-ad-act="budget" data-dir="down" data-ad="${esc(x.ad_id)}">${ic('trendDown', 14)} کەمکردنەوەی بودجە</button>` : '';
    case 'budgetUp': return x.budget_level && x.perDay < D.max_per_day ? `<button type="button" class="btn ${size} primary" data-ad-act="budget" data-dir="up" data-ad="${esc(x.ad_id)}">${ic('trendUp', 14)} زیادکردنی بودجە</button>` : '';
    case 'leads': return x.facebook_post_id ? `<button type="button" class="btn ${size}" data-ad-act="leads" data-ad="${esc(x.ad_id)}">${ic('inbox', 14)} نامەکان</button>` : '';
    case 'reboost': return x.post && x.post.auto_message_tag ? `<button type="button" class="btn ${size} primary" data-ad-act="reboost" data-ad="${esc(x.ad_id)}">${ic('megaphone', 14)} Boost ی نوێ</button>` : '';
    case 'newPost': return `<button type="button" class="btn ${size} primary" data-ad-act="newPost" data-ad="${esc(x.ad_id)}">${ic('plus', 14)} زیادکردنی پۆست</button>`;
    case 'fb': return `<a class="btn ${size}" href="${esc(adsManagerUrl(x.ad_id))}" target="_blank" rel="noopener">${ic('external', 14)} Ads Manager</a>`;
    default: return '';
  }
}
const adsManagerUrl = (id) => `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${String(S.settings.meta_ad_account || 'act_1242879841311980').replace('act_', '')}&selected_ad_ids=${id}`;

function adCard(x) {
  const v = x.verdict;
  const ans = Number(x.answered) || 0, open = Number(x.open_leads) || 0, escd = Number(x.escalated) || 0;
  const recs = x.recs.filter((r) => r.lv !== 'info' || x.running || x.review);
  const cplCls = x.cpl == null ? '' : x.cpl > 2 * A.med ? 'bad' : x.cpl > 1.4 * A.med ? 'warn' : x.cpl <= A.med ? 'good' : '';
  const acts = [];
  if (x.running || x.review) acts.push(actBtn(x, 'pause'));
  if (x.paused && !x.ended) acts.push(actBtn(x, 'resume'));
  if (x.running || x.review || x.ended || x.paused) acts.push(actBtn(x, 'extend'));
  if ((x.running || x.review || x.paused) && !x.ended) acts.push(actBtn(x, 'budget'));
  if (x.leadsN && x.facebook_post_id) acts.push(actBtn(x, 'leads'));
  acts.push(actBtn(x, 'fb'));
  return `<article class="ad ${x.running || x.review ? '' : 'off'}" data-ad="${esc(x.ad_id)}">
    <div class="ad-img">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" data-zoom="${esc(x.img)}">` : `<span class="ad-noimg">${ic('image', 22)}</span>`}</div>
    <div class="p-main">
      <div class="p-top">
        ${v ? `<span class="chip ${v.cls}" ${v.tip ? `title="${esc(v.tip)}"` : ''}>${esc(v.t)}</span>` : ''}
        ${stateChip(x)}
        ${x.post_code ? `<span class="code">Code:${esc(x.post_code)}</span>` : x.isWA ? '<span class="tag">پۆستی لە سیستەم نییە</span>' : ''}
        ${x.isWA ? '' : `<span class="tag">${esc(destLabel(x.destination_type))}</span>`}
      </div>
      <div class="post-title">${esc(adTitle(x))}</div>
      ${x.owner ? `<div class="p-line">${ic(x.realtor_name ? 'user' : 'layers', 14)}<span>${esc(x.owner)}</span>${x.avg_response_min != null ? `<span class="muted">· وەڵامدانەوە بە ناوەند ${esc(durShort(x.avg_response_min))}</span>` : ''}</div>` : ''}
      <div class="p-line">${endLine(x)}</div>
    </div>
    <div class="p-stats">
      <div class="metrics">
        <div class="metric"><span class="mv">${usd(x.spendN)}</span><span class="ml">خەرجی</span></div>
        <div class="metric"><span class="mv">${x.isWA ? fmtN(x.leadsN) : '—'}${x.isWA && Number(x.conversations) && Number(x.conversations) !== x.leadsN ? `<small title="ژمارەی گفتوگۆ بەپێی فەیسبووک">فەیسبووک ${fmtN(x.conversations)}</small>` : ''}</span><span class="ml">کڕیار</span></div>
        <div class="metric ${cplCls}"><span class="mv">${x.isWA ? usd(x.cpl) : '—'}</span><span class="ml">تێچووی هەر کڕیارێک</span></div>
        <div class="metric"><span class="mv">${x.ctr != null ? x.ctr.toFixed(1) + '%' : '—'}<small>${fmtN(x.clicks)}</small></span><span class="ml">کلیک</span></div>
        <div class="metric ${x.freq >= 3 ? 'warn' : ''}"><span class="mv">${x.freq != null ? x.freq.toFixed(1) : '—'}</span><span class="ml">دووبارە بینین</span></div>
        <div class="metric ${open >= 3 ? 'warn' : ''}"><span class="mv">${x.leadsN ? fmtN(ans) + '<small>/' + fmtN(x.leadsN) + '</small>' : '—'}</span><span class="ml">وەڵامدراوە${open ? ' · ' + fmtN(open) + ' چاوەڕێ' : escd ? ' · ' + fmtN(escd) + ' تەسلیمکراو' : ''}</span></div>
      </div>
    </div>
    <div class="post-actions">${acts.join('')}</div>
    ${recs.length ? `<div class="ad-recs">${recs.map((r) => `<div class="rec ${r.lv} slim"><span class="rec-ic">${ic(r.lv === 'bad' ? 'xCircle' : r.lv === 'warn' ? 'alert' : r.lv === 'good' ? 'checkCircle' : 'clock', 15)}</span><div class="rec-t">${esc(r.text)}</div><div class="rec-acts">${r.acts.filter((a) => !['pause', 'extend', 'fb', 'leads'].includes(a)).map((a) => actBtn(x, a, 'xs')).join('')}</div></div>`).join('')}</div>` : ''}
  </article>`;
}

/* ---------- actions ---------- */
function onAdsClick(e) {
  const z = e.target.closest('[data-zoom]'); if (z) { openLightbox(z.dataset.zoom); return; }
  if (e.target.closest('[data-recs-toggle]')) { A.allRecs = !A.allRecs; renderAdRecs(); return; }
  if (e.target.closest('[data-act-new]')) { Editor.open(); return; }
  const b = e.target.closest('[data-ad-act]'); if (!b || b.disabled) return;
  const x = (A.rows || []).find((r) => r.ad_id === b.dataset.ad); if (!x) return;
  const act = b.dataset.adAct;
  if (act === 'pause') pauseAd(x);
  else if (act === 'resume') resumeAd(x);
  else if (act === 'extend') extendAd(x);
  else if (act === 'budget') budgetAd(x, b.dataset.dir);
  else if (act === 'leads') openAdLeads(x);
  else if (act === 'reboost') { if (x.post) boostDialog(x.post).then((r) => { if (r) loadAds({ silent: true }); }).catch(toastErr); }
  else if (act === 'newPost') Editor.open();
}
async function doAdAction(x, body, okMsg) {
  const res = await metaCall(Object.assign({ action: 'ad_action', ad_id: x.ad_id }, body));
  toast(okMsg);
  const row = A.rows.find((r) => r.ad_id === x.ad_id);
  if (row) {
    const raw = Object.assign({}, row, { effective_status: res.effective_status || row.effective_status, adset_end_time: res.end_time || row.adset_end_time, daily_budget_cents: res.daily_budget ? Math.round(res.daily_budget * 100) : row.daily_budget_cents });
    A.rows = enrichAds(A.rows.map((r) => (r.ad_id === x.ad_id ? raw : r)));
    renderAds();
  }
  setTimeout(() => loadAds({ silent: true }), 1500);
}
function pauseAd(x) {
  modal({
    title: 'ڕاگرتنی ڕیکلامی ' + adLabel(x) + '؟',
    body: 'لە ئێستاوە هیچ پارەیەکی تر خەرج ناکات. هەر کاتێک بتەوێت دەتوانیت لێرەوە دەستی پێبکەیتەوە.',
    confirmText: 'ڕاگرتن', danger: true,
    onConfirm: () => doAdAction(x, { op: 'pause' }, 'ڕیکلامی ' + adLabel(x) + ' ڕاگیرا'),
  });
}
function resumeAd(x) {
  if (x.ended) { extendAd(x); return; }
  modal({
    title: 'دەستپێکردنەوەی ڕیکلامی ' + adLabel(x) + '؟',
    html: `<p>دووبارە دەست بە خەرجکردن دەکاتەوە${x.perDay ? ' بە <b class="mono">' + usd(x.perDay) + '</b> لە ڕۆژێکدا' : ''}${x.end ? ' تا <b>' + esc(fmtD(x.adset_end_time)) + '</b>' : ''}.</p>`,
    confirmText: 'دەستپێکردنەوە',
    onConfirm: () => doAdAction(x, { op: 'resume' }, 'ڕیکلامی ' + adLabel(x) + ' دەستی پێکردەوە'),
  });
}
function extendAd(x) {
  const D = metaDefaults();
  let mode = 'add', days = 3;
  const base = Math.max(Date.now(), x.end || 0);
  const left = x.end && x.end > Date.now() ? (x.end - Date.now()) / 864e5 : null;
  modal({
    title: 'ماوەی ڕیکلامی ' + adLabel(x),
    html: `${left != null ? `<div class="hint">${ic('clock', 13)}<span>ئێستا کۆتایی دێت: <b>${esc(fmtD(new Date(x.end).toISOString()))}</b> (${esc(daysTxt(left))} ماوە)</span></div>` : ''}
      ${x.ended ? '' : `<div class="seg" id="ex-mode" role="group" style="margin:6px 0 10px"><button type="button" data-mode="add" aria-pressed="true">زیادکردنی ڕۆژ</button><button type="button" data-mode="set" aria-pressed="false">گۆڕینی کۆتایی (کەمکردنەوەش)</button></div>`}
      <div class="field"><label class="label" for="ex-days" id="ex-lbl">چەند ڕۆژی تر؟</label><input class="input mono" id="ex-days" dir="ltr" inputmode="numeric" value="${days}"></div>
      <div class="quick">${[1, 2, 3, 5, 7].map((d) => `<button type="button" data-ex="${d}" style="height:28px;padding:0 12px;font-size:13px">${d} ڕۆژ</button>`).join('')}</div>
      ${x.ended ? `<div class="hint">${ic('refresh', 13)}<span>ئەم ڕیکلامە تەواو ببوو — دوای درێژکردنەوە هەمان ڕیکلام دووبارە دەست پێدەکاتەوە (فەیسبووک ئەوەی فێربووە لەدەستی نادات).</span></div>` : ''}
      ${x.paused ? `<div class="hint warn">${ic('alert', 13)}<span>ئەم ڕیکلامە ڕاگیراوە — دوای گۆڕین «دەستپێکردنەوە» دابگرە.</span></div>` : ''}
      <div class="note-inline" id="ex-total" style="font-size:14px"></div>`,
    confirmText: 'پاشەکەوت',
    onOpen: (m) => {
      const paint = () => {
        days = parseInt(digits($('#ex-days', m.root).value), 10);
        const ok = days >= 1 && days <= D.max_days;
        $('#ex-lbl', m.root).textContent = mode === 'add' ? 'چەند ڕۆژی تر؟' : 'کۆتایی دوای چەند ڕۆژ لە ئێستاوە؟';
        $$('#ex-mode button', m.root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
        const newEnd = mode === 'add' ? base + (ok ? days : 0) * 864e5 : Date.now() + (ok ? days : 0) * 864e5;
        const diff = left != null ? (newEnd - x.end) / 864e5 : null;
        const money = x.perDay && diff != null ? (diff >= 0 ? `زیاترین تێچووی زیادە: <b class="mono">${usd(x.perDay * diff)}</b>` : `نزیکەی <b class="mono">${usd(x.perDay * -diff)}</b> کەمتر خەرج دەکات`) : (x.perDay && mode === 'add' ? `زیاترین تێچووی زیادە: <b class="mono">${usd(x.perDay * days)}</b>` : '');
        $('#ex-total', m.root).innerHTML = ok ? `${ic('calendar', 15)}<span>کۆتایی نوێ: <b>${esc(fmtD(new Date(newEnd).toISOString()))}</b>${money ? ' · ' + money : ''}</span>` : `${ic('alert', 15)}<span>ماوە دەبێت 1–${D.max_days} ڕۆژ بێت.</span>`;
        const b = $('[data-ok]', m.root); if (b) b.disabled = !ok;
      };
      m.root.addEventListener('input', paint);
      m.root.addEventListener('click', (e) => {
        const md = e.target.closest('[data-mode]'); if (md) { mode = md.dataset.mode; if (mode === 'set' && left != null) $('#ex-days', m.root).value = Math.max(1, Math.round(left)); paint(); return; }
        const q = e.target.closest('[data-ex]'); if (!q) return; $('#ex-days', m.root).value = q.dataset.ex; paint();
      });
      paint();
    },
    onConfirm: () => mode === 'add'
      ? doAdAction(x, { op: 'extend', days }, `ڕیکلامی ${adLabel(x)} ${days} ڕۆژ درێژکرایەوە`)
      : doAdAction(x, { op: 'end_in', days }, `ڕیکلامی ${adLabel(x)} دوای ${days} ڕۆژ کۆتایی دێت`),
  });
}
function budgetAd(x, dir) {
  const D = metaDefaults();
  const cur = x.perDay || D.per_day;
  let v = dir === 'down' ? Math.max(1, Math.floor(cur / 2)) : dir === 'up' ? Math.min(D.max_per_day, Math.ceil(cur * 1.5)) : cur;
  const left = x.daysLeft != null && x.daysLeft > 0 ? Math.ceil(x.daysLeft) : null;
  modal({
    title: 'بودجەی ڕیکلامی ' + adLabel(x),
    html: `<div class="field"><label class="label" for="bu-v">پارە لە ڕۆژێکدا ($) <span class="aux">ئێستا ${usd(cur)}</span></label><input class="input mono" id="bu-v" dir="ltr" inputmode="decimal" value="${esc(v)}"></div>
      <div class="quick">${[1, 2, 3, 5, 8, 10].filter((n) => n <= D.max_per_day).map((n) => `<button type="button" data-bu="${n}" style="height:28px;padding:0 12px;font-size:13px">$${n}</button>`).join('')}</div>
      <div class="hint">${ic('clock', 13)}<span>فەیسبووک هەندێک جار یەک-دوو ڕۆژی پێدەچێت تا لەگەڵ بودجەی نوێ ڕابێت — زۆر بە زووی دووبارە مەیگۆڕە.</span></div>
      <div class="note-inline" id="bu-total" style="font-size:14px"></div>`,
    confirmText: 'گۆڕین',
    onOpen: (m) => {
      const paint = () => {
        v = Number(toLatin($('#bu-v', m.root).value));
        const ok = v >= 1 && v <= D.max_per_day;
        $('#bu-total', m.root).innerHTML = ok ? `${ic('dollar', 15)}<span><b class="mono">${usd(cur)}</b> ← <b class="mono">${usd(v)}</b> لە ڕۆژێکدا${left ? ` · تا کۆتایی (${left} ڕۆژ) نزیکەی <b class="mono">${usd(v * left)}</b>` : ''}</span>` : `${ic('alert', 15)}<span>بڕ دەبێت $1–$${D.max_per_day} بێت لە ڕۆژێکدا.</span>`;
        const b = $('[data-ok]', m.root); if (b) { b.disabled = !ok || v === cur; b.textContent = ok ? `گۆڕین بۆ ${usd(v)} لە ڕۆژێکدا` : 'گۆڕین'; }
      };
      m.root.addEventListener('input', paint);
      m.root.addEventListener('click', (e) => { const q = e.target.closest('[data-bu]'); if (!q) return; $('#bu-v', m.root).value = q.dataset.bu; paint(); });
      paint();
    },
    onConfirm: () => doAdAction(x, { op: 'budget', per_day: v }, `بودجەی ${adLabel(x)} بوو بە ${usd(v)} لە ڕۆژێکدا`),
  });
}
function openAdLeads(x) {
  Object.assign(L, { postId: x.facebook_post_id, filter: 'all', realtorId: null, q: '', items: [], loadedAt: 0, selId: null, sel: null });
  const [a, b] = adsDates();
  const map = { today: 'today', yesterday: 'yesterday', '7d': '7d', '30d': '30d' };
  if (map[A.preset]) { R.preset = map[A.preset]; } else { R.preset = 'custom'; R.from = a; R.to = b; }
  lsSet('bsg_range', R);
  location.hash = '#/leads';
}
