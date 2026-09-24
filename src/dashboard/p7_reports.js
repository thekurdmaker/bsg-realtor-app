
/* ============================ reports (realtors + branches) ============================ */
const RP = { preset: lsGet('bsg_rep_range', 'month'), tab: 'realtors', rows: null, hours: null, loading: false, seq: 0, loadedAt: 0, q: '', branch: '', onlyActive: true, sort: 'received', dir: -1, bsort: 'spend', bdir: -1, allTips: false };
const REP_RANGES = [['month', 'ئەم مانگە'], ['lastmonth', 'مانگی ڕابردوو'], ['7d', '7 ڕۆژ'], ['30d', '30 ڕۆژ'], ['90d', '90 ڕۆژ']];
const DOW_ORDER = [6, 0, 1, 2, 3, 4, 5];
const DOW_NAME = { 0: 'یەکشەممە', 1: 'دووشەممە', 2: 'سێشەممە', 3: 'چوارشەممە', 4: 'پێنجشەممە', 5: 'هەینی', 6: 'شەممە' };
const UNLINKED_NAME = { PHONE_CALL: 'پەیوەندی تەلەفۆنی', ON_POST: 'لایک و کۆمێنت', ON_VIDEO: 'بینینی ڤیدیۆ', WHATSAPP: 'واتسئاپ — پۆستەکەی لە سیستەم نییە', UNKNOWN: 'نەزانراو', MESSENGER: 'مەسنجەر' };
const isTestRealtor = (r) => /تێست|test/i.test(String(r.branch || '') + ' ' + String(r.name || ''));

function repDates() {
  const t = todayYMD();
  switch (RP.preset) {
    case 'lastmonth': { const first = t.slice(0, 8) + '01'; const end = addDays(first, -1); return [end.slice(0, 8) + '01', end]; }
    case '7d': return [addDays(t, -6), t];
    case '30d': return [addDays(t, -29), t];
    case '90d': return [addDays(t, -89), t];
    default: return [t.slice(0, 8) + '01', t];
  }
}

async function loadReport(opts = {}) {
  const seq = ++RP.seq;
  RP.loading = true; if (!opts.silent) renderReport();
  try {
    const [a, b] = repDates();
    const [rows, hours] = await Promise.all([
      rpc('manager_realtor_report', { p_start: a, p_end: b }),
      rpc('manager_leads_by_hour', { p_start: a, p_end: b }),
    ]);
    if (seq !== RP.seq) return;
    RP.rows = (rows || []).map((x) => Object.assign(x, {
      spend: Number(x.spend) || 0,
      cpl: Number(x.post_leads) ? (Number(x.spend) || 0) / Number(x.post_leads) : null,
      ansRate: Number(x.received) ? Number(x.answered) / Number(x.received) : null,
      unopenRate: Number(x.answered) ? Number(x.unopened) / Number(x.answered) : null,
      med: x.median_response_min == null ? null : Number(x.median_response_min),
    }));
    RP.hours = hours || [];
    RP.loadedAt = Date.now();
  } catch (e) { if (seq === RP.seq) { toastErr(e); if (!RP.rows) { RP.rows = []; RP.hours = []; } } }
  finally { if (seq === RP.seq) { RP.loading = false; renderReport(); } }
}

/* ---------- page ---------- */
function mountReports(root) {
  root.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div><h1 class="page-title">ڕاپۆرت</h1><div class="page-sub">خەرجی، کڕیار و کارکردنی هەر کارمەندێک و هەر لقێک</div></div>
      <div class="toolbar"><button type="button" class="btn" id="rp-csv">${ic('file', 15)} داگرتنی Excel (CSV)</button></div>
    </div>
    <div class="toolbar"><div class="seg" id="rp-range" role="group" aria-label="ماوە">${REP_RANGES.map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="${RP.preset === k}">${l}</button>`).join('')}</div><span class="muted" id="rp-dates" style="font-size:12.5px"></span></div>
    <div class="kpis" id="rp-kpis"></div>
    <section class="card recs-card" id="rp-tips" aria-label="خاڵە گرنگەکان"></section>
    <div class="rp-charts" id="rp-charts"></div>
    <div class="toolbar">
      <div class="seg" id="rp-tab" role="group" aria-label="بەش">${[['realtors', 'کارمەندەکان'], ['branches', 'لقەکان'], ['idle', 'بێ پۆست / بێ Boost'], ['spend', 'خەرجی ناناسراو']].map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${RP.tab === k}">${l}<span class="seg-n" data-n="${k}"></span></button>`).join('')}</div>
      <div class="search" id="rp-search-wrap">${ic('search')}<input class="input" id="rp-q" type="search" placeholder="گەڕان بە ناو یان لق…" aria-label="گەڕان"></div>
      <button type="button" class="mini" id="rp-active" aria-pressed="${RP.onlyActive}">تەنها چالاکەکان</button>
      <span class="chip accent" id="rp-branch-chip" hidden></span>
    </div>
    <div id="rp-body"></div>
  </div>`;
  $('#rp-range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]'); if (!b) return;
    RP.preset = b.dataset.range; lsSet('bsg_rep_range', RP.preset);
    $$('#rp-range button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    loadReport();
  });
  $('#rp-tab').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setRepTab(b.dataset.tab); });
  const q = $('#rp-q'); q.value = RP.q; q.addEventListener('input', debounce(() => { RP.q = q.value; renderRepBody(); }, 200));
  $('#rp-active').addEventListener('click', (e) => { RP.onlyActive = !RP.onlyActive; e.currentTarget.setAttribute('aria-pressed', String(RP.onlyActive)); renderRepBody(); });
  $('#rp-csv').addEventListener('click', repCsv);
  root.addEventListener('click', onRepClick);
  root.addEventListener('mouseover', onRepHover);
  root.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]')) hideRepTip(); });
  root.addEventListener('focusin', onRepHover);
  root.addEventListener('focusout', hideRepTip);
  renderReport();
  if (!RP.rows || Date.now() - RP.loadedAt > 120000) loadReport();
}
function setRepTab(t) {
  RP.tab = t;
  if (t !== 'realtors') RP.branch = '';   // the branch filter only belongs to the realtors table
  $$('#rp-tab button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tab === t)));
  renderRepBody();
}
function renderReport() {
  const d = $('#rp-dates'); if (d) { const [a, b] = repDates(); d.textContent = fmtD(a + 'T12:00:00') + ' ← ' + fmtD(b + 'T12:00:00'); }
  renderRepKpis(); renderRepTips(); renderRepCharts(); renderRepBody();
}

/* ---------- derived sets ---------- */
const repRealtors = () => (RP.rows || []).filter((x) => x.kind === 'realtor');
const repGroups = () => (RP.rows || []).filter((x) => x.kind === 'group');
const repUnlinked = () => (RP.rows || []).filter((x) => x.kind === 'unlinked' && x.spend > 0).sort((a, b) => b.spend - a.spend);
const rsum = (arr, f) => arr.reduce((s, x) => s + (Number(typeof f === 'function' ? f(x) : x[f]) || 0), 0);
function repTotals() {
  const R = repRealtors(), G = repGroups(), U = repUnlinked();
  const hrs = (RP.hours || []).filter((h) => h.hour != null);
  const linkedSpend = rsum(R, 'spend') + rsum(G, 'spend');
  const unlinked = rsum(U, 'spend');
  const postLeads = rsum(R, 'post_leads') + rsum(G, 'post_leads');
  return {
    spend: linkedSpend + unlinked, linkedSpend, unlinked, postLeads,
    leads: rsum(hrs, 'leads'), answered: rsum(hrs, 'answered'),
    missed: rsum(R, 'missed'), passed: rsum(R, 'passed'), unopened: rsum(R, 'unopened'), answeredByRealtors: rsum(R, 'answered'),
    pendingNow: rsum(R, 'pending_now'), boosts: rsum(R, 'boosts') + rsum(G, 'boosts'), postsNew: rsum(R, 'posts_new') + rsum(G, 'posts_new'),
  };
}
function idleLists() {
  const act = repRealtors().filter((x) => x.active && !isTestRealtor(x));
  return {
    noPost: act.filter((x) => !Number(x.posts_new)).sort((a, b) => String(a.last_post_at || '').localeCompare(String(b.last_post_at || ''))),
    noBoost: act.filter((x) => !Number(x.boosts)).sort((a, b) => String(a.last_boost_at || '').localeCompare(String(b.last_boost_at || ''))),
    act,
  };
}

/* ---------- tiles ---------- */
function renderRepKpis() {
  const box = $('#rp-kpis'); if (!box) return;
  if (!RP.rows) { box.innerHTML = Array.from({ length: 5 }, () => `<div class="kpi static"><span class="kl">&nbsp;</span><span class="kn"><span class="spin"></span></span><span class="ks">&nbsp;</span></div>`).join(''); return; }
  const T = repTotals(); const I = idleLists();
  const k = (label, tone, n, sub, tab, attn) => {
    const inner = `<span class="kl"><span class="dot"></span>${label}</span><span class="kn num">${n}</span><span class="ks">${sub}</span>`;
    return tab ? `<button type="button" class="kpi ${attn ? 'attn' : ''}" style="--tone:var(${tone})" data-kpi-tab="${tab}">${inner}</button>` : `<div class="kpi static" style="--tone:var(${tone})">${inner}</div>`;
  };
  box.innerHTML =
    k('خەرجی ڕیکلام', '--c-ad', usd(T.spend), `بۆ پۆستەکان ${usd(T.linkedSpend)} · ناناسراو ${usd(T.unlinked)}`, T.unlinked > 0 ? 'spend' : null) +
    k('کڕیار', '--accent', fmtN(T.leads), `${pct(T.answered, T.leads) ?? '—'}% وەرگیراوە · ${fmtN(T.postsNew)} پۆستی نوێ`) +
    k('تێچووی هەر کڕیارێک', '--warn', T.postLeads ? usd(T.linkedSpend / T.postLeads) : '—', `${fmtN(T.postLeads)} کڕیار لە ${fmtN(T.boosts)} Boost`) +
    k('لەدەستچوو', '--bad', fmtN(T.missed), `کات بەسەرچوو · ${fmtN(T.passed)} پاسکراو · ${fmtN(T.pendingNow)} چاوەڕێ ئێستا`, 'realtors', T.missed > 0) +
    k('بێ پۆست ئەم ماوەیە', '--mute', fmtN(I.noPost.length), `لە ${fmtN(I.act.length)} کارمەندی چالاک · ${fmtN(I.noBoost.length)} بێ Boost`, 'idle', I.noPost.length > 0);
}

/* ---------- key points ---------- */
function repTips() {
  const out = [];
  const add = (lv, text, act) => out.push({ lv, text, act });
  const R = repRealtors().filter((x) => !isTestRealtor(x));
  const T = repTotals(); const I = idleLists(); const U = repUnlinked();
  if (T.spend > 0 && T.unlinked / T.spend >= 0.15) {
    const top = U.slice(0, 3).map((u) => `${UNLINKED_NAME[u.name] || u.name} ${usd(u.spend)}`).join('، ');
    add('bad', `${usd(T.unlinked)} (${pct(T.unlinked, T.spend)}%) ی خەرجی چووە بۆ ڕیکلامێک کە نازانرێت چەند کڕیاری هێناوە: ${top}. ئەگەر ئامانج کڕیارە، بە Boost ی واتسئاپ بیکە.`, { tab: 'spend', label: 'بینین' });
  }
  const waUn = U.find((u) => u.name === 'WHATSAPP');
  if (waUn) add('warn', `${usd(waUn.spend)} لە ڕیکلامی واتسئاپ خەرج کرا بۆ پۆستێک کە لە سیستەم نییە — کڕیارەکانی بە AI دابەش دەکرێن. پۆستەکە زیاد بکە.`, { go: '#/ads', label: 'ڕیکلامەکان' });
  const pend = R.filter((x) => Number(x.pending_now) >= 5).sort((a, b) => b.pending_now - a.pending_now);
  pend.forEach((x) => add('bad', `${x.name} ئێستا ${fmtN(x.pending_now)} کڕیاری وەڵام نەدراوەی هەیە${hasApp(x.id) ? '' : ' — هێشتا ئەپەکەی نەکردووەتەوە'}.`, { wa: x.id, label: 'واتسئاپ' }));
  const missers = R.filter((x) => Number(x.missed) >= 5 && Number(x.received) > 0 && Number(x.missed) / Number(x.received) >= 0.25).sort((a, b) => b.missed - a.missed).slice(0, 3);
  missers.forEach((x) => add('warn', `${x.name}: ${fmtN(x.missed)} لە ${fmtN(x.received)} کڕیار کاتیان بەسەرچوو و ڕۆیشتن بۆ کەسی تر (${pct(x.missed, x.received)}%).`, { realtor: x.id, label: 'بینین' }));
  const unop = R.filter((x) => Number(x.answered) >= 10 && x.unopenRate >= 0.3).sort((a, b) => b.unopened - a.unopened).slice(0, 3);
  unop.forEach((x) => add('warn', `${x.name} ${fmtN(x.unopened)} کڕیاری وەرگرتووە بەڵام واتسئاپی بۆیان نەکردووەتەوە (${pct(x.unopened, x.answered)}%) — ڕەنگە پەیوەندی پێوە نەکردبن.`, { realtor: x.id, label: 'بینین' }));
  const slow = R.filter((x) => Number(x.answered) >= 8 && x.med != null && x.med >= 240).sort((a, b) => b.med - a.med).slice(0, 3);
  if (slow.length) add('warn', `هێواشترین وەڵامدانەوە (ناوەند): ${slow.map((x) => `${x.name} ${durShort(x.med)}`).join('، ')}.`);
  if (I.noPost.length) add('warn', `${fmtN(I.noPost.length)} کارمەندی چالاک لەم ماوەیەدا هیچ پۆستێکیان نییە: ${I.noPost.slice(0, 6).map((x) => x.name).join('، ')}${I.noPost.length > 6 ? ' و …' : ''}.`, { tab: 'idle', label: 'لیستەکە' });
  const best = R.filter((x) => Number(x.post_leads) >= 10 && x.cpl != null).sort((a, b) => a.cpl - b.cpl).slice(0, 3);
  if (best.length) add('good', `هەرزانترین کڕیار: ${best.map((x) => `${x.name} ${usd(x.cpl)}`).join('، ')} بۆ هەر کڕیارێک.`);
  const fast = R.filter((x) => Number(x.answered) >= 10 && x.med != null).sort((a, b) => a.med - b.med).slice(0, 3);
  if (fast.length) add('good', `خێراترین وەڵامدانەوە: ${fast.map((x) => `${x.name} ${durShort(x.med)}`).join('، ')}.`);
  const H = (RP.hours || []).filter((h) => h.hour != null);
  if (H.length) {
    const peak = [...H].sort((a, b) => b.leads - a.leads)[0];
    const off = rsum(H.filter((h) => h.hour < 9 || h.hour >= 21), 'leads');
    add('info', `زۆرترین کڕیار کاتژمێر ${peak.hour}:00–${peak.hour + 1}:00 دێت (${fmtN(peak.leads)}). ${fmtN(off)} کڕیار (${pct(off, rsum(H, 'leads'))}%) لە دەرەوەی کاتی کار (9–21) هاتوون.`);
  }
  return out;
}
function renderRepTips() {
  const box = $('#rp-tips'); if (!box) return;
  if (!RP.rows) { box.innerHTML = `<div class="loading-row"><span class="spin"></span> ئامادەکردنی ڕاپۆرت…</div>`; return; }
  const tips = repTips();
  const shown = RP.allTips ? tips : tips.slice(0, 6);
  box.innerHTML = `<div class="recs-head"><h2>${ic('target', 17)} خاڵە گرنگەکان</h2></div>` +
    (tips.length ? `<div class="recs">${shown.map((t, i) => `<div class="rec ${t.lv}"><span class="rec-ic">${ic(t.lv === 'bad' ? 'xCircle' : t.lv === 'warn' ? 'alert' : t.lv === 'good' ? 'checkCircle' : 'clock', 16)}</span><div class="rec-t">${esc(t.text)}</div><div class="rec-acts">${t.act ? `<button type="button" class="btn sm" data-tip-act="${i}">${esc(t.act.label)}</button>` : ''}</div></div>`).join('')}</div>` : `<div class="empty" style="padding:18px">${ic('checkCircle', 28)}<div>هیچ کێشەیەکی گرنگ نییە.</div></div>`) +
    (tips.length > 6 ? `<div class="list-more" style="padding:6px"><button type="button" class="btn sm ghost" data-tips-toggle>${RP.allTips ? 'کەمتر' : 'بینینی هەمووی (' + fmtN(tips.length) + ')'}</button></div>` : '');
  RP._tips = tips;
}

/* ---------- charts: by hour + by weekday ---------- */
function renderRepCharts() {
  const box = $('#rp-charts'); if (!box) return;
  if (!RP.hours) { box.innerHTML = ''; return; }
  const H = Array.from({ length: 24 }, (_, h) => RP.hours.find((x) => x.hour === h) || { hour: h, leads: 0, answered: 0, missed: 0, median_response_min: null });
  const D = DOW_ORDER.map((d) => RP.hours.find((x) => x.hour == null && x.dow === d) || { dow: d, leads: 0, answered: 0, missed: 0, median_response_min: null });
  const maxH = Math.max(1, ...H.map((x) => x.leads)), maxD = Math.max(1, ...D.map((x) => x.leads));
  const tipH = (x) => `${String(x.hour).padStart(2, '0')}:00–${String((x.hour + 1) % 24).padStart(2, '0')}:00|${fmtN(x.leads)} کڕیار|${fmtN(x.missed)} لەدەستچوو یان پاسکراو|وەڵام بە ناوەند: ${x.median_response_min == null ? '—' : durShort(x.median_response_min)}`;
  const tipD = (x) => `${DOW_NAME[x.dow]}|${fmtN(x.leads)} کڕیار|${fmtN(x.missed)} لەدەستچوو یان پاسکراو|وەڵام بە ناوەند: ${x.median_response_min == null ? '—' : durShort(x.median_response_min)}`;
  box.innerHTML = `
    <section class="card chart-card">
      <div class="chart-h"><h3>کڕیار بەپێی کاتژمێر</h3><span class="chart-key"><i class="k-in"></i>کاتی کار (9–21)<i class="k-out"></i>دەرەوەی کاتی کار</span></div>
      <div class="hbars" dir="ltr" role="img" aria-label="ژمارەی کڕیار بۆ هەر کاتژمێرێک">
        ${H.map((x) => `<button type="button" class="hbar ${x.hour < 9 || x.hour >= 21 ? 'off' : ''}" data-tip="${esc(tipH(x))}" aria-label="${esc(tipH(x).replace(/\|/g, ' · '))}"><i style="height:${Math.max(x.leads ? 2 : 0, (x.leads * 100) / maxH).toFixed(1)}%"></i></button>`).join('')}
      </div>
      <div class="hbar-axis" dir="ltr">${H.map((x) => `<span>${x.hour % 3 === 0 ? x.hour : ''}</span>`).join('')}</div>
    </section>
    <section class="card chart-card">
      <div class="chart-h"><h3>کڕیار بەپێی ڕۆژ</h3><span class="muted" style="font-size:12px">وەڵام بە ناوەند</span></div>
      <div class="dbars">
        ${D.map((x) => `<button type="button" class="dbar" data-tip="${esc(tipD(x))}"><span class="dl">${DOW_NAME[x.dow]}</span><span class="dt"><i style="width:${Math.max(x.leads ? 1.5 : 0, (x.leads * 100) / maxD).toFixed(1)}%"></i></span><span class="dv num">${fmtN(x.leads)}</span><span class="dm ${x.median_response_min >= 480 ? 'bad' : ''}">${x.median_response_min == null ? '—' : esc(durShort(x.median_response_min))}</span></button>`).join('')}
      </div>
    </section>`;
}
function onRepHover(e) {
  const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) return;
  let tip = $('#rp-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'rp-tip'; tip.className = 'rp-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  const [h, ...lines] = t.dataset.tip.split('|');
  tip.innerHTML = `<b>${esc(h)}</b>${lines.map((l) => `<span>${esc(l)}</span>`).join('')}`;
  tip.hidden = false;
  const r = t.getBoundingClientRect(); const w = tip.offsetWidth, hh = tip.offsetHeight;
  let x = r.left + r.width / 2 - w / 2; x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
  let y = r.top - hh - 8; if (y < 8) y = r.bottom + 8;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideRepTip() { const t = $('#rp-tip'); if (t) t.hidden = true; }

/* ---------- tables ---------- */
function repMatch(x) {
  if (RP.branch && (x.branch || '') !== RP.branch) return false;
  const q = normTxt(RP.q.trim());
  if (q && !normTxt([x.name, x.branch, x.whatsapp_number].join(' ')).includes(q)) return false;
  return true;
}
function sortRows(list, key, dir) {
  return list.sort((a, b) => {
    let va = a[key], vb = b[key];
    if (key === 'name' || key === 'branch') return dir * String(va || '').localeCompare(String(vb || ''));
    va = va == null ? -Infinity : Number(va); vb = vb == null ? -Infinity : Number(vb);
    if (va === vb) return (Number(b.received) || 0) - (Number(a.received) || 0);
    return dir * (va - vb);
  });
}
const repTh = (key, label, cur, dir, attr = 'data-sort') => `<th class="sortable ${key === 'name' || key === 'branch' ? '' : 'c'}" ${attr}="${key}" aria-sort="${cur === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}<span class="arr">${cur === key ? (dir > 0 ? '▲' : '▼') : ''}</span></th>`;

function renderRepBody() {
  const box = $('#rp-body'); if (!box) return;
  const chip = $('#rp-branch-chip');
  if (chip) { chip.hidden = !RP.branch; chip.innerHTML = RP.branch ? `${ic('layers', 12)} ${esc(RP.branch)} <button type="button" class="btn xs ghost icon" data-clear-branch aria-label="لابردنی لق">${ic('x', 12)}</button>` : ''; }
  const sw = $('#rp-search-wrap'), ac = $('#rp-active');
  if (sw) sw.hidden = RP.tab === 'spend'; if (ac) ac.hidden = RP.tab !== 'realtors';
  if (!RP.rows) { box.innerHTML = `<div class="loading-row"><span class="spin"></span> بارکردن…</div>`; return; }
  const I = idleLists();
  const nEl = (k, n) => { const el = $(`#rp-tab [data-n="${k}"]`); if (el) el.textContent = n; };
  nEl('idle', fmtN(I.noPost.length)); nEl('spend', repUnlinked().length ? usd(rsum(repUnlinked(), 'spend')) : '');
  if (RP.tab === 'branches') box.innerHTML = branchTable();
  else if (RP.tab === 'idle') box.innerHTML = idleView(I);
  else if (RP.tab === 'spend') box.innerHTML = spendView();
  else box.innerHTML = realtorTable();
}

function realtorTable() {
  let list = repRealtors().filter((x) => (!RP.onlyActive || x.active || Number(x.received) > 0 || x.spend > 0) && repMatch(x));
  list = sortRows(list, RP.sort, RP.dir);
  if (!list.length) return `<div class="card empty">${ic('users', 32)}<div>هیچ کارمەندێک نەدۆزرایەوە</div></div>`;
  const s = RP.sort, d = RP.dir;
  const T = { spend: rsum(list, 'spend'), post_leads: rsum(list, 'post_leads'), received: rsum(list, 'received'), answered: rsum(list, 'answered'), missed: rsum(list, 'missed'), passed: rsum(list, 'passed'), unopened: rsum(list, 'unopened'), pending_now: rsum(list, 'pending_now'), posts_new: rsum(list, 'posts_new'), boosts: rsum(list, 'boosts') };
  return `<div class="table-wrap"><table class="t rp-t">
    <thead><tr>${repTh('name', 'کارمەند', s, d)}${repTh('posts_new', 'پۆستی نوێ', s, d)}${repTh('boosts', 'Boost', s, d)}${repTh('spend', 'خەرجی', s, d)}${repTh('post_leads', 'کڕیار لە پۆستەکانی', s, d)}${repTh('cpl', 'تێچووی کڕیار', s, d)}${repTh('received', 'پێیگەیشتووە', s, d)}${repTh('ansRate', 'وەرگیراو', s, d)}${repTh('missed', 'لەدەستچوو', s, d)}${repTh('passed', 'پاسکراو', s, d)}${repTh('unopenRate', 'واتسئاپی نەکردەوە', s, d)}${repTh('pending_now', 'چاوەڕێ ئێستا', s, d)}${repTh('med', 'کاتی وەرگرتن', s, d)}</tr></thead>
    <tbody>${list.map(realtorRow).join('')}</tbody>
    <tfoot><tr><td><b>کۆی گشتی</b> <span class="muted">(${fmtN(list.length)})</span></td><td class="c">${fmtN(T.posts_new)}</td><td class="c">${fmtN(T.boosts)}</td><td class="c">${usd(T.spend)}</td><td class="c">${fmtN(T.post_leads)}</td><td class="c">${T.post_leads ? usd(T.spend / T.post_leads) : '—'}</td><td class="c">${fmtN(T.received)}</td><td class="c">${pct(T.answered, T.received) ?? '—'}%</td><td class="c">${fmtN(T.missed)}</td><td class="c">${fmtN(T.passed)}</td><td class="c">${fmtN(T.unopened)}</td><td class="c">${fmtN(T.pending_now)}</td><td class="c">—</td></tr></tfoot>
  </table></div>
  <div class="hint" style="margin-top:8px">${ic('alert', 13)}<span><b>پێیگەیشتووە</b> = هەموو ئەو کڕیارانەی گەیشتنە ئەم کارمەندە (بە پاسکراویشەوە). <b>لەدەستچوو</b> = کاتی 3 کاتژمێری بەسەرچوو و بۆ کەسی تر یان بەڕێوەبەر چوو. <b>کاتی وەرگرتن</b> = ناوەندی کاتی نێوان هاتنی کڕیار و وەرگرتنی، شەویش دەژمێرێت.</span></div>`;
}
function realtorRow(x) {
  const app = hasApp(x.id);
  const cell = (v, cls = '') => `<td class="c ${cls}">${v}</td>`;
  const zero = (n) => (Number(n) ? fmtN(n) : '<span class="muted">0</span>');
  return `<tr class="${x.active ? '' : 'inactive'}">
    <td class="who"><b>${esc(x.name)}${!x.active ? ' <span class="tag">ناچالاک</span>' : !app ? ' <span class="tag warn-tag" title="هێشتا نەچووەتە ناو ئەپەکە">بێ ئەپ</span>' : ''}</b><small>${esc(x.branch || '—')}${x.last_post_at ? ' · دوایین پۆست ' + esc(ago(x.last_post_at, true)) : ''}</small></td>
    ${cell(zero(x.posts_new))}${cell(zero(x.boosts))}${cell(x.spend ? usd(x.spend) : '<span class="muted">—</span>')}${cell(zero(x.post_leads))}
    ${cell(x.cpl == null ? '<span class="muted">—</span>' : usd(x.cpl))}
    ${cell(zero(x.received))}
    ${cell(x.ansRate == null ? '<span class="muted">—</span>' : `<span class="bar" title="${fmtN(x.answered)} لە ${fmtN(x.received)}"><i style="width:${Math.round(x.ansRate * 100)}%"></i></span> ${Math.round(x.ansRate * 100)}%`, x.ansRate != null && x.ansRate < 0.7 ? 'bad' : '')}
    ${cell(zero(x.missed), Number(x.missed) >= 5 ? 'bad' : '')}${cell(zero(x.passed), Number(x.passed) >= 5 ? 'hot' : '')}
    ${cell(Number(x.unopened) ? `${fmtN(x.unopened)} <small class="muted">${pct(x.unopened, x.answered)}%</small>` : '<span class="muted">0</span>', x.unopenRate >= 0.3 && Number(x.answered) >= 5 ? 'hot' : '')}
    ${cell(zero(x.pending_now), Number(x.pending_now) >= 5 ? 'bad' : Number(x.pending_now) ? 'hot' : '')}
    ${cell(x.med == null ? '<span class="muted">—</span>' : esc(durShort(x.med)), x.med >= 240 ? 'hot' : '')}
  </tr>`;
}

function branchRows() {
  const map = new Map();
  const get = (name, custom) => { const k = (custom ? '◆ ' : '') + (name || 'بێ لق'); if (!map.has(k)) map.set(k, { key: k, branch: custom ? null : (name || ''), name: k, custom: !!custom, realtors: 0, activeRealtors: 0, posts_new: 0, boosts: 0, spend: 0, post_leads: 0, received: 0, answered: 0, missed: 0, pending_now: 0, idle: 0, meds: [] }); return map.get(k); };
  repRealtors().filter((x) => !isTestRealtor(x)).forEach((x) => {
    if (!x.active && !Number(x.received) && !x.spend) return;
    const b = get(x.branch);
    b.realtors++; if (x.active) b.activeRealtors++;
    ['posts_new', 'boosts', 'spend', 'post_leads', 'received', 'answered', 'missed', 'pending_now'].forEach((k) => { b[k] += Number(x[k]) || 0; });
    if (x.active && !Number(x.posts_new)) b.idle++;
    if (x.med != null && Number(x.answered)) b.meds.push({ m: x.med, w: Number(x.answered) });
  });
  repGroups().forEach((g) => {
    const b = g.branch ? get(g.branch) : get(g.name, true);
    ['posts_new', 'boosts', 'spend', 'post_leads'].forEach((k) => { b[k] += Number(g[k]) || 0; });
  });
  return [...map.values()].map((b) => {
    // weighted middle of the realtors' medians (by answered leads)
    const ms = b.meds.sort((p, q) => p.m - q.m); const tot = ms.reduce((s, x) => s + x.w, 0); let acc = 0, med = null;
    for (const x of ms) { acc += x.w; if (acc >= tot / 2) { med = x.m; break; } }
    return Object.assign(b, { cpl: b.post_leads ? b.spend / b.post_leads : null, ansRate: b.received ? b.answered / b.received : null, med });
  });
}
function branchTable() {
  let list = branchRows().filter((b) => !RP.q.trim() || normTxt(b.name).includes(normTxt(RP.q.trim())));
  list = sortRows(list, RP.bsort, RP.bdir);
  if (!list.length) return `<div class="card empty">${ic('layers', 32)}<div>هیچ لقێک نەدۆزرایەوە</div></div>`;
  const s = RP.bsort, d = RP.bdir;
  return `<div class="table-wrap"><table class="t rp-t">
    <thead><tr>${repTh('name', 'لق', s, d, 'data-bsort')}${repTh('activeRealtors', 'کارمەندی چالاک', s, d, 'data-bsort')}${repTh('idle', 'بێ پۆست', s, d, 'data-bsort')}${repTh('posts_new', 'پۆستی نوێ', s, d, 'data-bsort')}${repTh('boosts', 'Boost', s, d, 'data-bsort')}${repTh('spend', 'خەرجی', s, d, 'data-bsort')}${repTh('post_leads', 'کڕیار لە پۆستەکان', s, d, 'data-bsort')}${repTh('cpl', 'تێچووی کڕیار', s, d, 'data-bsort')}${repTh('received', 'پێیگەیشتووە', s, d, 'data-bsort')}${repTh('ansRate', 'وەرگیراو', s, d, 'data-bsort')}${repTh('missed', 'لەدەستچوو', s, d, 'data-bsort')}${repTh('pending_now', 'چاوەڕێ ئێستا', s, d, 'data-bsort')}${repTh('med', 'کاتی وەرگرتن', s, d, 'data-bsort')}</tr></thead>
    <tbody>${list.map((b) => `<tr class="${b.custom ? '' : 'clickable'}" ${b.custom ? '' : `data-branch="${esc(b.branch)}" tabindex="0" title="بینینی کارمەندەکانی ئەم لقە"`}>
      <td class="who"><b>${esc(b.custom ? b.name.replace('◆ ', '') : b.name)}</b><small>${b.custom ? 'گرووپی تایبەت — پۆستی هاوبەش' : fmtN(b.realtors) + ' کارمەند'}</small></td>
      <td class="c">${fmtN(b.activeRealtors)}</td><td class="c ${b.idle && b.idle === b.activeRealtors ? 'bad' : b.idle ? 'hot' : ''}">${b.custom ? '—' : fmtN(b.idle)}</td>
      <td class="c">${fmtN(b.posts_new)}</td><td class="c">${fmtN(b.boosts)}</td><td class="c">${b.spend ? usd(b.spend) : '<span class="muted">—</span>'}</td><td class="c">${fmtN(b.post_leads)}</td>
      <td class="c">${b.cpl == null ? '<span class="muted">—</span>' : usd(b.cpl)}</td><td class="c">${b.custom ? '—' : fmtN(b.received)}</td>
      <td class="c ${b.ansRate != null && b.ansRate < 0.7 ? 'bad' : ''}">${b.ansRate == null ? '<span class="muted">—</span>' : Math.round(b.ansRate * 100) + '%'}</td>
      <td class="c ${b.missed >= 5 ? 'bad' : ''}">${b.custom ? '—' : fmtN(b.missed)}</td><td class="c ${b.pending_now >= 5 ? 'bad' : b.pending_now ? 'hot' : ''}">${b.custom ? '—' : fmtN(b.pending_now)}</td>
      <td class="c ${b.med >= 240 ? 'hot' : ''}">${b.med == null ? '<span class="muted">—</span>' : esc(durShort(b.med))}</td>
    </tr>`).join('')}</tbody></table></div>
    <div class="hint" style="margin-top:8px">${ic('alert', 13)}<span>خەرجی لق = پۆستی کارمەندەکانی + پۆستی هاوبەشی گرووپی لقەکە. کلیک لە لقێک بکە بۆ بینینی کارمەندەکانی.</span></div>`;
}

function remindText(x, kind) {
  const who = String(x.name || '').trim();
  return kind === 'boost'
    ? `سڵاو کاک ${who} 👋\nئەم مانگە هیچ ڕیکلامێکت (Boost) نەبووە. ئەگەر خانوو یان شوقەیەکی باشت هەیە، زانیاری و وێنەکانی بۆ بنێرە تاکو بڵاوی بکەینەوە و کڕیارت بۆ بێت.`
    : `سڵاو کاک ${who} 👋\nئەم مانگە هیچ پۆستێکت نەبووە. تکایە زانیاری و وێنەی خانوو یان شوقەیەکی نوێ بنێرە تاکو پۆستی بۆ بکەین و کڕیارت بۆ بێت.`;
}
function idleView(I) {
  const q = normTxt(RP.q.trim());
  const f = (arr) => arr.filter((x) => repMatch(x) && (!q || normTxt(x.name).includes(q)));
  const item = (x, kind) => {
    const last = kind === 'boost' ? x.last_boost_at : x.last_post_at;
    return `<div class="idle-row">
      <div class="idle-who"><b>${esc(x.name)}</b>${hasApp(x.id) ? '' : ' <span class="tag warn-tag">بێ ئەپ</span>'}<small>${esc(x.branch || '—')} · ${last ? (kind === 'boost' ? 'دوایین Boost ' : 'دوایین پۆست ') + esc(ago(last, true)) : (kind === 'boost' ? 'هەرگیز Boost ی نەبووە' : 'هەرگیز پۆستی نەبووە')}${Number(x.received) ? ' · ' + fmtN(x.received) + ' کڕیاری گرووپ پێیگەیشتووە' : ''}</small></div>
      ${x.whatsapp_number ? `<a class="btn sm wa" href="${esc(waLink(x.whatsapp_number, remindText(x, kind)))}" target="_blank" rel="noopener">${ic('chat', 14)} بیرخستنەوە</a>` : ''}
    </div>`;
  };
  const a = f(I.noPost), b = f(I.noBoost);
  return `<div class="idle-grid">
    <section class="card idle-card"><div class="idle-h"><h3>${ic('megaphone', 16)} بێ پۆستی نوێ</h3><span class="chip warn">${fmtN(a.length)}</span></div>
      ${a.length ? a.map((x) => item(x, 'post')).join('') : `<div class="empty" style="padding:18px">هەموو کارمەندە چالاکەکان پۆستیان هەیە</div>`}</section>
    <section class="card idle-card"><div class="idle-h"><h3>${ic('dollar', 16)} بێ Boost</h3><span class="chip warn">${fmtN(b.length)}</span></div>
      ${b.length ? b.map((x) => item(x, 'boost')).join('') : `<div class="empty" style="padding:18px">هەموو کارمەندە چالاکەکان Boost یان هەبووە</div>`}</section>
  </div>
  <div class="hint" style="margin-top:8px">${ic('chat', 13)}<span>«بیرخستنەوە» واتسئاپ دەکاتەوە بە نامەیەکی ئامادە — دەتوانیت پێش ناردن دەستکاری بکەیت.</span></div>`;
}
function spendView() {
  const U = repUnlinked(); const T = repTotals();
  if (!U.length) return `<div class="card empty">${ic('checkCircle', 32)}<div>هەموو خەرجییەکان بە پۆستێکەوە بەستراون</div></div>`;
  const max = Math.max(...U.map((u) => u.spend));
  return `<section class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px">
    <p style="margin:0;color:var(--ink-2);line-height:1.8">ئەم پارەیە چووە بۆ ڕیکلامێک کە بە هیچ پۆستێکی ناو سیستەمەوە نەبەستراوە. ڕیکلامی «پەیوەندی تەلەفۆنی»، «لایک و کۆمێنت» و «ڤیدیۆ» کڕیارەکانیان ناگەنە سیستەم، بۆیە نازانرێت چەند کڕیاریان هێناوە و بۆ هیچ کارمەندێک ناژمێردرێن.</p>
    <div class="dbars">${U.map((u) => `<div class="dbar static"><span class="dl" style="width:auto;min-width:170px">${esc(UNLINKED_NAME[u.name] || u.name)}</span><span class="dt"><i style="width:${((u.spend * 100) / max).toFixed(1)}%;background:var(--c-ad)"></i></span><span class="dv num">${usd(u.spend)}</span><span class="dm">${fmtN(u.boosts)} ڕیکلام · ${pct(u.spend, T.spend)}%</span></div>`).join('')}</div>
    <div><a class="btn sm" href="#/ads">${ic('chart', 14)} بینینیان لە پەڕەی ڕیکلامەکان</a></div>
  </section>`;
}

/* ---------- clicks ---------- */
function onRepClick(e) {
  if (e.target.closest('[data-tips-toggle]')) { RP.allTips = !RP.allTips; renderRepTips(); return; }
  if (e.target.closest('[data-clear-branch]')) { RP.branch = ''; renderRepBody(); return; }
  const k = e.target.closest('[data-kpi-tab]'); if (k) { setRepTab(k.dataset.kpiTab); $('#rp-body').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const ta = e.target.closest('[data-tip-act]');
  if (ta) {
    const t = (RP._tips || [])[Number(ta.dataset.tipAct)]; if (!t || !t.act) return;
    if (t.act.tab) { setRepTab(t.act.tab); $('#rp-body').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (t.act.go) location.hash = t.act.go;
    else if (t.act.realtor) { const r = repRealtors().find((x) => x.id === t.act.realtor); RP.q = r ? r.name.trim() : ''; const q = $('#rp-q'); if (q) q.value = RP.q; RP.branch = ''; setRepTab('realtors'); $('#rp-body').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (t.act.wa) { const r = repRealtors().find((x) => x.id === t.act.wa); if (r && r.whatsapp_number) window.open(waLink(r.whatsapp_number, `سڵاو کاک ${r.name.trim()} 👋\nئێستا ${r.pending_now} کڕیارت چاوەڕێی وەڵامن لە ئەپی کۆڵ سەنتەر. تکایە زوو وەڵامیان بدەرەوە 🙏`), '_blank', 'noopener'); }
    return;
  }
  const s = e.target.closest('[data-sort]');
  if (s) { const key = s.dataset.sort; RP.dir = RP.sort === key ? -RP.dir : (key === 'name' ? 1 : -1); RP.sort = key; renderRepBody(); return; }
  const bs = e.target.closest('[data-bsort]');
  if (bs) { const key = bs.dataset.bsort; RP.bdir = RP.bsort === key ? -RP.bdir : (key === 'name' ? 1 : -1); RP.bsort = key; renderRepBody(); return; }
  const br = e.target.closest('tr[data-branch]');
  if (br) { RP.branch = br.dataset.branch; RP.q = ''; const q = $('#rp-q'); if (q) q.value = ''; RP.onlyActive = false; const a = $('#rp-active'); if (a) a.setAttribute('aria-pressed', 'false'); setRepTab('realtors'); }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.matches && e.target.matches('tr[data-branch]')) e.target.click(); });

/* ---------- CSV export (opens in Excel) ---------- */
function repCsv() {
  if (!RP.rows) return;
  const [a, b] = repDates();
  const cols = [['name', 'کارمەند'], ['branch', 'لق'], ['active', 'چالاک'], ['posts_new', 'پۆستی نوێ'], ['posts_total', 'کۆی پۆست'], ['boosts', 'Boost'], ['spend', 'خەرجی $'], ['post_leads', 'کڕیار لە پۆستەکانی'], ['cpl', 'تێچووی کڕیار $'], ['received', 'پێیگەیشتووە'], ['answered', 'وەرگیراو'], ['missed', 'لەدەستچوو'], ['passed', 'پاسکراو'], ['unopened', 'واتسئاپی نەکردەوە'], ['pending_now', 'چاوەڕێ ئێستا'], ['med', 'کاتی وەرگرتن (خولەک)'], ['last_post_at', 'دوایین پۆست'], ['last_boost_at', 'دوایین Boost']];
  const cell = (v) => { if (v == null) return ''; if (typeof v === 'number') return String(Math.round(v * 100) / 100); const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = repRealtors().filter((x) => x.active || Number(x.received) || x.spend).map((x) => cols.map(([k]) => cell(k === 'active' ? (x.active ? 'بەڵێ' : 'نەخێر') : /_at$/.test(k) ? (x[k] ? ymdOf(x[k]) : '') : x[k])).join(','));
  const csv = '﻿' + cols.map((c) => c[1]).join(',') + '\n' + rows.join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const el = document.createElement('a'); el.href = url; el.download = `bsg-realtors-${a}_${b}.csv`; document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
