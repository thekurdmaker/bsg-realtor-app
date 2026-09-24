
/* ============================ posts list ============================ */
const P = { q: '', active: 'all', sort: '', items: [], loading: false, done: false, seq: 0, loadedAt: 0 };
const SORTS = [['', 'نوێترین'], ['leads', 'زۆرترین نامە'], ['cost', 'گرانترین نامە'], ['answer_rate', 'کەمترین ڕێژەی وەرگرتن']];
const ATTR = [['from_post_code', 'کۆد', '--c-code'], ['from_id_ad', 'ڕیکلام', '--c-ad'], ['from_id_post', 'ئایدی پۆست', '--c-post'], ['from_prefill', 'نامەی ئامادە', '--c-prefill'], ['from_ai', 'AI', '--c-ai'], ['from_other', 'تر', '--c-other']];
const looksAdId = (id) => /^120\d{15}$/.test(String(id || '')); // Meta ad IDs: 18 digits starting with 120
/* ---------- Facebook boost (via the meta-boost server function) ---------- */
const metaDefaults = () => { try { return Object.assign({ per_day: 2, days: 4, cities: [{ name: 'Irbil', radius: 10 }, { name: 'Baghdad', radius: 10 }], age_min: 18, age_max: 65, max_per_day: 20, max_days: 30 }, JSON.parse(S.settings.meta_boost_defaults || '{}')); } catch (e) { return { per_day: 2, days: 4, cities: [], age_min: 18, age_max: 65, max_per_day: 20, max_days: 30 }; } };
const callDefaults = () => { const D = metaDefaults(); return Object.assign({ per_day: 1, days: 5, cities: [{ name: 'Irbil', radius: 10 }], age_min: 18, age_max: 65 }, D.call || {}, { max_per_day: D.max_per_day, max_days: D.max_days }); };
async function metaCall(body) {
  const res = (await api('/functions/v1/meta-boost', { method: 'POST', body })).data;
  if (!res || res.ok === false) {
    const r = (res && res.reason) || 'error';
    const map = { 'already boosted in the last 10 minutes': 'ئەم پۆستە لە 10 خولەکی ڕابردوودا Boost کراوە.', 'meta token missing': 'تۆکنی فەیسبووک لە Vault نییە.', 'post not found': 'پۆستەکە لە سیستەم نەدۆزرایەوە.' };
    throw new ApiError(map[r] || ((res && res.detail) ? 'فەیسبووک: ' + res.detail : r), r);
  }
  return res;
}
function boostDialog(p, opts = {}) {
  const D = metaDefaults();
  let perDay = Number(opts.perDay || D.per_day), days = Number(opts.days || D.days);
  const where = (D.cities || []).map((c) => (c.name || c.key) + ' +' + (c.radius || 10) + 'mi').join(' ، ');
  return new Promise((resolve) => {
    modal({
      title: 'Boost ی پۆستی Code:' + p.post_code, wide: true,
      html: `<div class="grid2">
          <div class="field"><label class="label" for="bd-perday">پارە لە ڕۆژێکدا ($)</label><input class="input mono" id="bd-perday" dir="ltr" inputmode="decimal" value="${esc(perDay)}"></div>
          <div class="field"><label class="label" for="bd-days">چەند ڕۆژ</label><input class="input mono" id="bd-days" dir="ltr" inputmode="numeric" value="${esc(days)}"></div>
        </div>
        <div class="quick">${[[2, 4], [3, 4], [5, 4], [3, 7]].map(([d, n]) => `<button type="button" data-bd="${d}x${n}" style="height:28px;padding:0 12px;font-size:13px">$${d} × ${n}</button>`).join('')}</div>
        <ul class="checks" style="margin-top:4px">
          <li class="check ok"><span class="ci">${ic('check', 11)}</span><div><b>Housing</b> <span>· عێراق</span></div></li>
          <li class="check ok"><span class="ci">${ic('check', 11)}</span><div><b>شوێن:</b> <span class="mono">${esc(where)}</span> <span>· تەمەن ${esc(D.age_min)}–${esc(D.age_max)}</span></div></li>
          <li class="check ok"><span class="ci">${ic('check', 11)}</span><div><b>دوگمەی واتسئاپ + نامەی ئامادە:</b> <span>${esc(cleanSpaces(p.auto_message_tag || ''))}</span></div></li>
        </ul>
        <div class="note-inline" id="bd-total" style="font-size:14px"></div>`,
      confirmText: 'بڵاوکردنەوە',
      onOpen: (m) => {
        const paint = () => {
          perDay = Number(toLatin($('#bd-perday', m.root).value)); days = parseInt(digits($('#bd-days', m.root).value), 10);
          const ok = perDay >= 1 && perDay <= D.max_per_day && days >= 1 && days <= D.max_days;
          $('#bd-total', m.root).innerHTML = ok ? `${ic('dollar', 15)}<span>کۆی گشتی: <b class="mono">$${+(perDay * days).toFixed(2)}</b> ($${perDay} × ${days} ڕۆژ) — لە کارتی هەژمارەکەی ڕیکلامەوە دەبڕدرێت.</span>` : `${ic('alert', 15)}<span>بڕ دەبێت $1–$${D.max_per_day} بێت لە ڕۆژێکدا، ماوە 1–${D.max_days} ڕۆژ.</span>`;
          const b = $('[data-ok]', m.root); if (b) { b.disabled = !ok; b.textContent = ok ? `بڵاوکردنەوە — \u2066$${+(perDay * days).toFixed(2)}\u2069` : 'بڵاوکردنەوە'; }
        };
        m.root.addEventListener('input', paint);
        m.root.addEventListener('click', (e) => { const q = e.target.closest('[data-bd]'); if (!q) return; const [d, n] = q.dataset.bd.split('x'); $('#bd-perday', m.root).value = d; $('#bd-days', m.root).value = n; paint(); });
        paint();
      },
      onConfirm: async () => {
        const res = await metaCall({ action: 'boost', facebook_post_id: p.facebook_post_id, per_day: perDay, days, page_post_id: opts.pagePostId || undefined });
        resolve(res);
        setTimeout(() => boostDone(p, res), 30);
      },
      onCancel: () => resolve(null),
    });
  });
}
function boostDone(p, res) {
  const act = String((S.settings.meta_ad_account || 'act_1242879841311980')).replace('act_', '');
  modal({
    title: 'ڕیکلامی Code:' + p.post_code + ' دروستکرا ✓',
    html: `<p>فەیسبووک ئێستا پێداچوونەوەی بۆ دەکات (زۆربەی کات چەند خولەکێک). ئایدی ڕیکلام و پۆست خۆکارانە لەسەر پۆستەکە تۆمار کران.</p>
      <div class="p-line"><span>ئایدی ڕیکلام:</span><span class="code">${esc(res.ad_id)}</span><span>·</span><span class="mono">$${esc(res.per_day)} × ${esc(res.days)} = $${esc(res.total)}</span></div>
      <div><a class="btn sm" href="https://adsmanager.facebook.com/adsmanager/manage/ads?act=${esc(act)}&selected_ad_ids=${esc(res.ad_id)}" target="_blank" rel="noopener">${ic('external', 14)} بینین لە Ads Manager</a></div>`,
  });
  P.loadedAt = 0; if (S.view === 'posts') loadPosts(true);
  loadPostsLite().then(() => { if (L.combos) L.combos.post.setItems(S.posts); refreshPostImage(p.facebook_post_id); }).catch(() => {});
  if (typeof A !== 'undefined') A.loadedAt = 0;
}

/* ---------- "Call now" boost: any page post, phone = first realtor in the caption ---------- */
function callBoostDialog(fp, who) {
  const D = callDefaults();
  let perDay = Number(D.per_day), days = Number(D.days);
  const where = (D.cities || []).map((c) => (c.name || c.key) + ' +' + (c.radius || 10) + 'mi').join(' ، ');
  const phoneHtml = (who.r ? esc(who.r.name) + ' · ' : '') + `<span class="mono" dir="ltr">${esc(who.r ? (who.r.whatsapp_number || who.phone) : who.phone)}</span>`;
  return new Promise((resolve) => {
    modal({
      title: 'Boost ی پەیوەندی' + (fp.code ? ' — Code:' + fp.code : ''), wide: true,
      html: `<div class="grid2">
          <div class="field"><label class="label" for="cb-perday">پارە لە ڕۆژێکدا ($)</label><input class="input mono" id="cb-perday" dir="ltr" inputmode="decimal" value="${esc(perDay)}"></div>
          <div class="field"><label class="label" for="cb-days">چەند ڕۆژ</label><input class="input mono" id="cb-days" dir="ltr" inputmode="numeric" value="${esc(days)}"></div>
        </div>
        <div class="quick">${[[1, 5], [1, 7], [2, 5], [2, 7]].map(([d, n]) => `<button type="button" data-cb="${d}x${n}" style="height:28px;padding:0 12px;font-size:13px">$${d} × ${n}</button>`).join('')}</div>
        <ul class="checks" style="margin-top:4px">
          <li class="check ok"><span class="ci">${ic('check', 11)}</span><div><b>Housing</b> <span>· عێراق</span></div></li>
          <li class="check ok"><span class="ci">${ic('check', 11)}</span><div><b>شوێن:</b> <span class="mono">${esc(where)}</span> <span>· تەمەن ${esc(D.age_min)}–${esc(D.age_max)}</span></div></li>
          <li class="check ok"><span class="ci">${ic('check', 11)}</span><div><b>دوگمەی «Call now» پەیوەندی دەکات بە:</b> <span>${phoneHtml}</span></div></li>
        </ul>
        <div class="st-note" style="margin-top:8px">${ic('note', 14)}<span>ئەم جۆرە ڕیکلامە نامە ناهێنێتە سیستەم — کڕیار ڕاستەوخۆ پەیوەندی بە کارمەندەکەوە دەکات. تەنها خەرجی و ژمارەکانی فەیسبووک دەبینیت.</span></div>
        <div class="note-inline" id="cb-total" style="font-size:14px"></div>`,
      confirmText: 'بڵاوکردنەوە',
      onOpen: (m) => {
        const paint = () => {
          perDay = Number(toLatin($('#cb-perday', m.root).value)); days = parseInt(digits($('#cb-days', m.root).value), 10);
          const ok = perDay >= 1 && perDay <= D.max_per_day && days >= 1 && days <= D.max_days;
          $('#cb-total', m.root).innerHTML = ok ? `${ic('dollar', 15)}<span>کۆی گشتی: <b class="mono">$${+(perDay * days).toFixed(2)}</b> ($${perDay} × ${days} ڕۆژ)</span>` : `${ic('alert', 15)}<span>بڕ دەبێت $1–$${D.max_per_day} بێت لە ڕۆژێکدا، ماوە 1–${D.max_days} ڕۆژ.</span>`;
          const b = $('[data-ok]', m.root); if (b) { b.disabled = !ok; b.textContent = ok ? `بڵاوکردنەوە — ⁦$${+(perDay * days).toFixed(2)}⁩` : 'بڵاوکردنەوە'; }
        };
        m.root.addEventListener('input', paint);
        m.root.addEventListener('click', (e) => { const q = e.target.closest('[data-cb]'); if (!q) return; const [d, n] = q.dataset.cb.split('x'); $('#cb-perday', m.root).value = d; $('#cb-days', m.root).value = n; paint(); });
        paint();
      },
      onConfirm: async () => {
        const body = { action: 'boost_call', page_post_id: fp.post_id, per_day: perDay, days };
        if (who.r) body.realtor_id = who.r.id; else body.phone = who.phone;
        const res = await metaCall(body);
        resolve(res);
        const act = String((S.settings.meta_ad_account || 'act_1242879841311980')).replace('act_', '');
        setTimeout(() => modal({
          title: 'ڕیکلامی پەیوەندی دروستکرا ✓',
          html: `<p>فەیسبووک ئێستا پێداچوونەوەی بۆ دەکات. دوگمەی «Call now» پەیوەندی دەکات بە <b class="mono" dir="ltr">${esc(res.phone)}</b>.</p>
            <div class="p-line"><span>ئایدی ڕیکلام:</span><span class="code">${esc(res.ad_id)}</span><span>·</span><span class="mono">$${esc(res.per_day)} × ${esc(res.days)} = $${esc(res.total)}</span></div>
            <div><a class="btn sm" href="https://adsmanager.facebook.com/adsmanager/manage/ads?act=${esc(act)}&selected_ad_ids=${esc(res.ad_id)}" target="_blank" rel="noopener">${ic('external', 14)} بینین لە Ads Manager</a></div>`,
        }), 30);
        if (typeof A !== 'undefined') A.loadedAt = 0;
      },
      onCancel: () => resolve(null),
    });
  });
}

const postImg = (p) => { const x = p && (p.image_url !== undefined ? p : S.postById.get(p.facebook_post_id)); const u = x && x.image_url; return u && u !== 'none' ? u : null; };
/* copy the Facebook picture of one post into storage (runs in the background) */
function refreshPostImage(fid) {
  const p = S.postById.get(fid);
  if (!p || (p.image_url && p.image_url !== 'none') || !(p.source_ids || []).length) return;
  metaCall({ action: 'fetch_images', facebook_post_id: fid })
    .then(() => loadPostsLite())
    .then(() => { if (S.view === 'posts') renderPosts(); })
    .catch(() => { /* picture is optional — the hourly job retries */ });
}
const durShort = (m) => { if (m == null || isNaN(m)) return '—'; m = Number(m); return m < 60 ? Math.round(m) + ' خولەک' : (m / 60).toFixed(m < 600 ? 1 : 0) + ' کاتژمێر'; };

async function loadPosts(reset = true) {
  const seq = ++P.seq;
  P.loading = true;
  if (reset) { P.items = []; P.done = false; }
  renderPosts();
  try {
    const rows = await rpc('get_posts_admin', {
      p_limit: CFG.postsPageSize, p_offset: reset ? 0 : P.items.length,
      p_active: P.active === 'all' ? null : P.active === 'active',
      p_search: P.q.trim() || null, p_sort: P.sort || null,
    });
    if (seq !== P.seq) return;
    P.items = reset ? (rows || []) : P.items.concat(rows || []);
    P.done = (rows || []).length < CFG.postsPageSize;
    P.loadedAt = Date.now();
  } catch (e) { if (seq === P.seq) toastErr(e); }
  finally { if (seq === P.seq) { P.loading = false; renderPosts(); } }
}

function mountPosts(root) {
  root.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div><h1 class="page-title">پۆستەکان</h1><div class="page-sub">ڕیکلامەکان، خاوەنەکانیان و ئەنجامی هەر پۆستێک</div></div>
      <div class="toolbar"><button type="button" class="btn primary" id="p-new">${ic('plus')} پۆستی نوێ</button></div>
    </div>
    <div class="toolbar">
      <div class="search">${ic('search')}<input class="input" id="p-q" type="search" placeholder="گەڕان بە کۆد یان ناونیشان…" aria-label="گەڕانی پۆست"></div>
      <div class="seg" id="p-active" role="group" aria-label="دۆخی پۆست">
        ${[['all', 'هەموو'], ['active', 'چالاک'], ['inactive', 'ناچالاک']].map(([k, l]) => `<button type="button" data-active="${k}" aria-pressed="${P.active === k}">${l}</button>`).join('')}
      </div>
      <label class="sr" for="p-sort">ڕیزکردن</label>
      <select class="select" id="p-sort" style="width:auto;height:36px">${SORTS.map(([k, l]) => `<option value="${k}" ${P.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="muted" id="p-count"></span>
    </div>
    <div class="posts" id="p-list"></div>
  </div>`;
  $('#p-new').addEventListener('click', () => Editor.open());
  const q = $('#p-q'); q.value = P.q;
  q.addEventListener('input', debounce(() => { P.q = q.value; loadPosts(true); }, 350));
  $('#p-active').addEventListener('click', (e) => {
    const b = e.target.closest('[data-active]'); if (!b) return;
    P.active = b.dataset.active;
    $$('#p-active button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    loadPosts(true);
  });
  $('#p-sort').addEventListener('change', (e) => { P.sort = e.target.value; loadPosts(true); });
  $('#p-list').addEventListener('click', onPostsClick);
  renderPosts();
  if (!P.items.length || Date.now() - P.loadedAt > 60000) loadPosts(true);
}

function postRow(p) {
  const running = p.sponsor_status === 'running';
  const isGroup = !p.realtor_id;
  const total = Number(p.total_leads) || 0;
  const segs = ATTR.map(([f, l, c]) => ({ l, c, v: Number(p[f]) || 0 })).filter((s) => s.v > 0);
  const segSum = segs.reduce((a, s) => a + s.v, 0);
  const owner = isGroup
    ? `${ic('layers', 14)}<span>${esc(p.group_name || 'گرووپ')}</span><span class="muted">${fmtN(p.group_size)} ئەندام</span>`
    : `${ic('user', 14)}<span>${esc(p.realtor_name || '—')}</span>${p.realtor_number ? `<span class="mono muted">${esc(p.realtor_number)}</span>` : ''}${p.realtor_id && !hasApp(p.realtor_id) ? '<span class="tag warn-tag" title="هێشتا نەچووەتە ناو ئەپەکە — نامەکان نابینێت">بێ ئەپ</span>' : ''}`;
  return `<article class="post ${p.active === false ? 'inactive' : ''}" data-id="${esc(p.facebook_post_id)}">
    <div class="p-main">
      <div class="p-hero">
      ${postImg(p) ? `<img class="p-thumb" src="${esc(postImg(p))}" alt="" loading="lazy" data-zoom="${esc(postImg(p))}">` : `<span class="p-thumb none" title="هێشتا وێنەی نییە">${ic('image', 22)}</span>`}
      <div class="p-hero-t">
      <div class="p-top">
        <span class="code">Code:${esc(p.post_code || '—')}</span>
        <span class="chip ${running ? 'ok' : ''}"><span class="dot"></span>${running ? 'ڕیکلام بەردەوامە' : 'ڕیکلام تەواوبووە'}</span>
        ${isGroup ? '<span class="tag">گرووپ</span>' : ''}
        ${p.active === false ? '<span class="tag">ناچالاک</span>' : ''}
        ${!(p.source_ids || []).some(looksAdId) ? '<span class="chip" title="ئایدی ڕیکلام دوای یەکەم کڕیار خۆکارانە تۆمار دەکرێت">هێشتا ئایدی ڕیکلامی نییە</span>' : ''}
      </div>
      <div class="post-title">${esc(cleanSpaces(p.headline) || 'بێ ناونیشان')}</div>
      </div>
      </div>
      <div class="p-line">${owner}</div>
      <div class="p-line">${ic('dollar', 13)}<span class="num">${money(p.sponsor_spend_usd)}</span><span>·</span><span>${fmtN(p.sponsor_days)} ڕۆژ</span>${p.sponsor_location ? `<span>·</span><span class="mono">${esc(p.sponsor_location)}</span>` : ''}${p.sponsor_start_at ? `<span>·</span>${ic('calendar', 13)}<span class="num">${esc(fmtD(p.sponsor_start_at))} ← ${esc(p.sponsor_end_at ? fmtD(p.sponsor_end_at) : '…')}</span>` : ''}</div>
    </div>
    <div class="p-stats">
      <div class="metrics">
        <div class="metric"><span class="mv">${fmtN(total)}${Number(p.leads_7d) > 0 ? `<small>(7 ڕۆژی ڕابردوو: ${fmtN(p.leads_7d)})</small>` : ''}</span><span class="ml">نامە</span></div>
        <div class="metric"><span class="mv">${fmtN(p.answered)}${p.answer_rate_pct != null ? `<small>${Math.round(p.answer_rate_pct)}%</small>` : ''}</span><span class="ml">وەرگیراو</span></div>
        <div class="metric ${Number(p.pending) > 0 ? 'warn' : ''}"><span class="mv">${fmtN(p.pending)}</span><span class="ml">چاوەڕێ</span></div>
        <div class="metric ${Number(p.escalated) > 0 ? 'bad' : ''}"><span class="mv">${fmtN(p.escalated)}</span><span class="ml">تەسلیمکراو</span></div>
        <div class="metric"><span class="mv">${money(p.cost_per_lead)}</span><span class="ml">تێچووی هەر نامەیەک</span></div>
        <div class="metric"><span class="mv">${esc(durShort(p.avg_response_min))}</span><span class="ml">تێکڕای کاتی وەرگرتن</span></div>
      </div>
      ${segSum ? `<div class="attr" title="چۆن پۆستەکە بۆ هەر نامەیەک ناسرایەوە">${segs.map((s) => `<span style="width:${(s.v * 100 / segSum).toFixed(2)}%;background:var(${s.c})"></span>`).join('')}</div>
      <div class="attr-legend">${segs.map((s) => `<span><i style="background:var(${s.c})"></i>${esc(s.l)} ${fmtN(s.v)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="post-actions">
      <button type="button" class="btn sm primary" data-act="boost" ${p.auto_message_tag ? '' : 'disabled title="نامەی ئامادەی نییە"'}>${ic('megaphone', 14)} Boost</button>
      <button type="button" class="btn sm" data-act="edit">${ic('edit', 14)} دەستکاری</button>
      <button type="button" class="btn sm" data-act="leads" ${total ? '' : 'disabled'}>${ic('inbox', 14)} نامەکان</button>
      ${p.facebook_post_url ? `<a class="btn sm" href="${esc(safeUrl(p.facebook_post_url))}" target="_blank" rel="noopener">${ic('external', 14)} فەیسبووک</a>` : ''}
      ${p.auto_message_tag ? `<button type="button" class="btn sm ghost" data-act="copy-tag" title="${esc(p.auto_message_tag)}">${ic('copy', 14)} نامەی ئامادە</button>` : ''}
      ${total === 0 ? `<button type="button" class="btn sm danger" data-act="delete">${ic('trash', 14)} سڕینەوە</button>` : ''}
    </div>
  </article>`;
}

function renderPosts() {
  const box = $('#p-list'); if (!box) return;
  const cnt = $('#p-count');
  if (cnt) cnt.textContent = P.items.length ? `${fmtN(P.items.length)} پۆست${P.done ? '' : '+'}` : '';
  if (!P.items.length) {
    box.innerHTML = P.loading ? `<div class="loading-row"><span class="spin"></span> بارکردن…</div>` : `<div class="card empty">${ic('megaphone', 36)}<div>هیچ پۆستێک نەدۆزرایەوە</div><button type="button" class="btn primary sm" data-act="new">${ic('plus', 14)} یەکەم پۆست زیاد بکە</button></div>`;
    return;
  }
  box.innerHTML = P.items.map(postRow).join('') +
    (!P.done ? `<div class="list-more"><button type="button" class="btn" data-act="more" ${P.loading ? 'disabled' : ''}>${P.loading ? '<span class="spin"></span>' : ''} پۆستی زیاتر</button></div>` : '');
}

function onPostsClick(e) {
  const z = e.target.closest('[data-zoom]'); if (z) { openLightbox(z.dataset.zoom); return; }
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const act = t.dataset.act;
  if (act === 'more') { loadPosts(false); return; }
  if (act === 'new') { Editor.open(); return; }
  const card = t.closest('.post'); if (!card) return;
  const p = P.items.find((x) => x.facebook_post_id === card.dataset.id); if (!p) return;
  if (act === 'edit') Editor.open(p);
  else if (act === 'boost') boostDialog(p).catch(toastErr);
  else if (act === 'leads') { Object.assign(L, { postId: p.facebook_post_id, filter: 'all', realtorId: null, q: '', items: [], loadedAt: 0, selId: null, sel: null }); if (R.preset !== 'all') { R.preset = 'all'; lsSet('bsg_range', R); } location.hash = '#/leads'; }
  else if (act === 'copy-tag') copyText(p.auto_message_tag, 'نامەی ئامادە کۆپی کرا');
  else if (act === 'delete') {
    modal({
      title: 'سڕینەوەی ئەم پۆستە؟',
      body: `پۆستی کۆد ${p.post_code} هیچ نامەیەکی نییە، بۆیە دەتوانرێت بسڕدرێتەوە. ئەم کارە ناگەڕێتەوە.`,
      confirmText: 'سڕینەوە', danger: true,
      onConfirm: async () => {
        const res = (await api('/rest/v1/posts?' + qs([['facebook_post_id', 'eq.' + p.facebook_post_id]]), { method: 'DELETE', prefer: 'return=representation' })).data;
        if (!res || !res.length) throw new ApiError('پۆستەکە نەسڕایەوە — دەسەڵاتت نییە یان پێشتر سڕاوەتەوە.');
        toast('پۆستەکە سڕایەوە');
        P.items = P.items.filter((x) => x.facebook_post_id !== p.facebook_post_id); renderPosts();
        loadPostsLite().then(() => { if (L.combos) L.combos.post.setItems(S.posts); }).catch(() => {});
      },
    });
  }
}

/* ============================ group creation (shared) ============================ */
function newGroupDialog(onCreated) {
  const sel = new Set();
  const list = S.realtors.filter((r) => r.active);
  modal({
    title: 'دروستکردنی گرووپی نوێ', wide: true,
    html: `<div class="field"><label class="label" for="ng-name">ناوی گرووپ</label><input class="input" id="ng-name" placeholder="بۆ نموونە: پرۆژەی DC Tower"></div>
      <div class="field">
        <div class="label"><span>ئەندامەکان</span><span class="aux" id="ng-count">هیچ کەس هەڵنەبژێردراوە</span></div>
        <div class="search" style="max-width:none">${ic('search')}<input class="input" id="ng-q" type="search" placeholder="گەڕان بە ناو یان لق…" aria-label="گەڕانی کارمەند"></div>
        <div class="members-pick" id="ng-list">${list.map((r) => `<label data-q="${esc(normTxt(r.name + ' ' + (r.branch || '')))}"><input type="checkbox" value="${esc(r.id)}"><span>${esc(r.name)}</span><small>${esc(r.branch || '')}</small></label>`).join('')}</div>
      </div>`,
    confirmText: 'دروستکردنی گرووپ',
    onOpen: (m) => {
      const q = $('#ng-q', m.root);
      q.addEventListener('input', () => { const v = normTxt(q.value); $$('#ng-list label', m.root).forEach((l) => { l.hidden = !!v && !l.dataset.q.includes(v); }); });
      $('#ng-list', m.root).addEventListener('change', (e) => {
        if (e.target.checked) sel.add(e.target.value); else sel.delete(e.target.value);
        $('#ng-count', m.root).textContent = sel.size ? sel.size + ' کەس هەڵبژێردراوە' : 'هیچ کەس هەڵنەبژێردراوە';
      });
    },
    onConfirm: async (m) => {
      const name = cleanSpaces($('#ng-name', m.root).value);
      if (!name) { m.error('ناوێک بۆ گرووپەکە بنووسە.'); return false; }
      if (!sel.size) { m.error('لانیکەم یەک ئەندام هەڵبژێرە.'); return false; }
      const g = await rpc('manager_create_group', { p_name: name });
      const gid = g && (g.id || g.group_id);
      if (!gid) throw new ApiError('گرووپەکە دروست نەکرا.');
      for (const rid of sel) await rpc('manager_add_group_member', { p_group_id: gid, p_realtor_id: rid });
      await loadGroups();
      toast('گرووپی «' + name + '» دروستکرا');
      if (onCreated) onCreated(gid);
    },
  });
}

/* ============================ post editor ============================ */
/* Facebook page posts shared by the New Post page (kept while you move between pages) */
const FB_FILTERS = [['new', 'لە سیستەم نییە'], ['all', 'هەموو'], ['in', 'لە سیستەمدایە'], ['noapp', 'کارمەندی بێ ئەپ']];
const FB = { posts: [], next: null, loading: false, loadedAt: 0, filter: 'new', q: '', mode: 'list', results: null, error: '', showHidden: false };

/* one factory, two editors: the drawer (edit a post) and the New Post page */
function createEditor(kind) {
  const PAGE = kind === 'page';
  const DEF_KEY = 'bsg_post_defaults';
  const PRICE_LINE = /^\s*نرخ\s*\/\s*سعر\s*[:：]\s*(.*)$/m;
  const CODE_LINE = /^\s*(code|کۆد|کود|كود)\s*[:：\-]?\s*[A-Za-z]*[-_]?[0-9٠-٩۰-۹]+\s*$/i;
  let root = null, st = null, prevFocus = null;

  const isAdId = looksAdId;
  const splitIds = (text) => toLatin(text).match(/\d{8,20}/g) || [];
  function assignIds(list) {
    list = list.filter(Boolean);
    const ad = list.find(isAdId) || '';
    const post = list.find((x) => x !== ad) || '';
    if (!ad && list.length > 1) return { post: list[0], ad: list[1] };
    return { post, ad };
  }
  function extractCode(text) {
    const t = toLatin(text || '');
    const strong = [...t.matchAll(/(?:code|کۆد|کود|كود)\s*[:：\-]?\s*([A-Za-z]*[-_]?[0-9]+)/gi)];
    if (strong.length) return strong[strong.length - 1][1].toUpperCase();
    const weak = t.match(/(?:الرقم|ژمارە|ژماره)\s*[:\-]?\s*([A-Za-z]*[-_]?[0-9]+)/i);
    return weak ? weak[1].toUpperCase() : '';
  }
  const cleanCode = (v) => toLatin(v).toUpperCase().replace(/\s+/g, '').replace(/^CODE[:：]?/, '');
  function idFromUrl(u) {
    const s = String(u || '');
    const m = s.match(/facebook\.com\/reel\/(\d{8,})/i) || s.match(/\/videos\/(?:[^/]+\/)?(\d{8,})/i) || s.match(/[?&](?:story_fbid|fbid|v)=(\d{8,})/i) || s.match(/\/(?:posts|permalink)\/(\d{8,})/i);
    return m ? m[1] : '';
  }
  /* ---- read headlines + realtor straight from the caption ---- */
  const KU_KEY = /بۆ\s*#?\s*(فرۆشتن|کرێ|كرێ)|فرۆشتن/;
  const AR_KEY = /لل(بيع|بیع|إيجار|إیجار|ايجار|ایجار|إجار|اجار)/;
  const LETTER = /\p{L}/u;
  const TAIL_JUNK = /\s*(See less|See more|… See more|\.\.\. See more|عرض أقل|عرض المزيد)\s*$/i;
  function cleanHead(s, lang) {
    s = String(s || '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, ' ')
      .replace(/#/g, '').replace(/_/g, ' ');
    // "headline - city" / "project | name": keep the part that carries the keyword
    const parts = s.split(/\s[-–—|]\s|\s\|\s?|\|/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) { const key = lang === 'ku' ? KU_KEY : AR_KEY; s = parts.find((x) => key.test(x)) || parts[0]; }
    if (lang === 'ku') {
      s = s.replace(/لە\s*(پرۆژەی|پڕۆژەی)\s*/g, 'لە ').replace(/(^|\s)(پرۆژەی|پڕۆژەی)\s+/g, ' ').replace(/\s*(بەردەستە|بەردەستن)\s*/g, ' ');
    } else {
      s = s.replace(/(^|\s)(لدينا|لدینا)\s+/g, ' ').replace(/\s(متوفرة|متوفر)(?=\s)/g, ' ');
    }
    return cleanSpaces(s.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, ''));
  }
  function headsFromCaption(caption) {
    const lines = String(caption || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
    const isSep = (l) => l.length >= 3 && !LETTER.test(l);
    const pick = (key, notKey) => lines.find((l) => key.test(l) && !l.includes('|') && !(notKey && notKey.test(l)) && !/wa\.me|07\d{9}/.test(toLatin(l)));
    let ku = pick(KU_KEY, AR_KEY) || '';
    let ar = pick(AR_KEY, null) || '';
    if (!ku) { const first = lines.find((l) => LETTER.test(l) && !/^published by/i.test(l)); ku = first || ''; }
    if (!ar) { const si = lines.findIndex(isSep); const after = si >= 0 ? lines.slice(si + 1).find((l) => LETTER.test(l)) : ''; ar = after || ''; }
    return fitHeads(cleanHead(ku, 'ku'), cleanHead(ar, 'ar'));
  }
  // shorten step by step until the WhatsApp prefill fits in 80 characters
  function fitHeads(ku, ar) {
    const fits = () => buildTag(ku, ar).length <= CFG.tagMax;
    const steps = [
      () => { ku = cleanSpaces(ku.replace(/[A-Za-z][\w\-.']*/g, ' ')); ar = cleanSpaces(ar.replace(/[A-Za-z][\w\-.']*/g, ' ')); },
      () => { ar = cleanSpaces(ar.replace(/(^|\s)(مشروع|مجمع)\s+/g, ' ')); },
      () => { ku = cleanSpaces(ku.replace(/(^|\s)(گەرەکی|گەڕەکی|گەڕەكی)\s+/g, ' ')); ar = cleanSpaces(ar.replace(/(^|\s)حي\s+/g, ' ')); },
    ];
    for (const s of steps) { if (fits()) break; s(); }
    return { ku, ar };
  }
  function phonesInCaption(caption) {
    const t = toLatin(caption || '');
    const out = [];
    for (const m of t.matchAll(/(?:\+?\s?964|0)\s?7(?:[\s-]?\d){9}/g)) { const d = digits(m[0]).slice(-10); if (d.length === 10 && !out.includes(d)) out.push(d); }
    return out;
  }
  function realtorsInCaption(caption) {
    const byTail = new Map(S.realtors.filter((r) => r.whatsapp_number).map((r) => [digits(r.whatsapp_number).slice(-10), r]));
    const phones = phonesInCaption(caption);
    return { phones, list: phones.map((ph) => ({ phone: '0' + ph, r: byTail.get(ph) || null })) };
  }

  const headlineOf = (f) => [cleanSpaces(f.ku), cleanSpaces(f.ar)].filter(Boolean).join(' - ');
  function buildTag(ku, ar) {
    ku = cleanSpaces(ku); ar = cleanSpaces(ar);
    if (ku && ar) return `زانیاری ${ku} - معلومات عن ${ar}`;
    if (ku) return `زانیاری ${ku}`;
    if (ar) return `معلومات عن ${ar}`;
    return '';
  }
  function splitHeadline(h) {
    const s = cleanSpaces(h);
    const i = s.indexOf(' - ');
    return i < 0 ? [s, ''] : [s.slice(0, i).trim(), s.slice(i + 3).trim()];
  }
  function captionToReply(c) {
    let lines = String(c || '').replace(/\r/g, '').split('\n');
    const cut = lines.findIndex((l) => /(بۆ زانیاری زیاتر|للمزيد من المعلومات|للمزید من المعلومات|wa\.me\/|\b07[0-9]{9}\b|\+?9647[0-9]{9})/.test(toLatin(l)));
    if (cut > 0) lines = lines.slice(0, cut);
    lines = lines.filter((l) => !CODE_LINE.test(l));
    lines = lines.filter((l) => !/کۆمێنت|کۆمێت|اکتب تعليق|أكتب تعليق|تعليقاً|تعليقا|بۆ زانینی نرخ|للحصول على معلومات عن سعر/.test(l));
    lines = lines.filter((l) => { const t = l.trim(); return !t || !t.split(/\s+/).every((w) => w.startsWith('#')); });
    while (lines.length && /^[\s\-–—_=*~.•|]*$/.test(lines[lines.length - 1])) lines.pop();
    while (lines.length && !lines[0].trim()) lines.shift();
    return lines.join('\n');
  }
  function withPrice(text, price) {
    price = cleanSpaces(price);
    const lines = String(text || '').split('\n');
    const i = lines.findIndex((l) => PRICE_LINE.test(l));
    if (i >= 0) {
      if (price) { lines[i] = 'نرخ / سعر: ' + price; return lines.join('\n'); }
      lines.splice(i, 1);
      if (i > 0 && /^[\s\-–—_=*~.•|]*$/.test(lines[i - 1])) lines.splice(i - 1, 1);
      return lines.join('\n').replace(/\s+$/, '');
    }
    const base = lines.join('\n').replace(/\s+$/, '');
    return price ? (base ? base + '\n------\n' : '') + 'نرخ / سعر: ' + price : base;
  }
  const buildReply = (f) => withPrice(captionToReply(f.caption), f.price);
  const nextCode = () => { const n = Math.max(0, ...S.posts.map((p) => parseInt(digits(p.post_code), 10) || 0)); return String(n + 1); };

  function blank() {
    const d = lsGet(DEF_KEY, {});
    return { caption: '', code: '', ku: '', ar: '', tag: '', url: '', postId: '', adId: '', owner: 'personal', realtorId: null, groupId: null, spend: d.spend != null ? String(d.spend) : '', days: d.days != null ? String(d.days) : '', loc: d.loc || 'ERBIL', start: todayYMD(), price: '', reply: '' };
  }
  function fromRow(p) {
    const [ku, ar] = splitHeadline(p.headline);
    const ids = assignIds((p.source_ids || []).map(String));
    const pm = String(p.reply_template || '').match(PRICE_LINE);
    return {
      caption: p.caption || '', code: String(p.post_code || ''), ku, ar, tag: p.auto_message_tag || '', url: p.facebook_post_url || '',
      postId: ids.post, adId: ids.ad, owner: p.realtor_id ? 'personal' : 'group', realtorId: p.realtor_id || null, groupId: p.realtor_id ? null : (p.group_id || null),
      spend: p.sponsor_spend_usd != null ? String(Number(p.sponsor_spend_usd)) : '', days: p.sponsor_days != null ? String(p.sponsor_days) : '',
      loc: p.sponsor_location || '', start: p.sponsor_start_at ? ymdOf(p.sponsor_start_at) : '', price: pm ? pm[1].trim() : '', reply: p.reply_template || '',
    };
  }

  function formInner() {
    const f = st.f;
    return `
        <form class="pe-form" id="pe-form" novalidate autocomplete="off">
          <section class="pe-sec">
            <h3><span class="n">1</span>کاپشنی فەیسبووک <span class="aux">Ctrl+V</span></h3>
            <textarea class="textarea" id="pe-caption" rows="7" placeholder="کاپشنی تەواوی پۆستەکە لێرە دابنێ. کۆتایی کاپشن دەبێت Code:0000 ی تێدا بێت.">${esc(f.caption)}</textarea>
            <div class="hint" id="pe-caption-hint"></div>
          </section>
          <section class="pe-sec">
            <h3><span class="n">2</span>کۆد، لینک و ناونیشان</h3>
            <div class="grid2">
              <div class="field"><label class="label" for="pe-code"><span>کۆدی پۆست <span class="req">*</span></span></label><input class="input mono" id="pe-code" dir="ltr" autocomplete="off" value="${esc(f.code)}" placeholder="لە کاپشنەکەوە"><div class="hint" id="pe-code-hint"></div></div>
              <div class="field"><label class="label" for="pe-url"><span>لینکی پۆست <span class="req">*</span></span></label><input class="input ltr" id="pe-url" dir="ltr" type="url" value="${esc(f.url)}" placeholder="https://www.facebook.com/…"><div class="hint" id="pe-url-hint"></div></div>
            </div>
            <div class="grid2">
              <div class="field"><label class="label" for="pe-ku"><span>ناونیشان بە کوردی <span class="req">*</span></span></label><input class="input" id="pe-ku" value="${esc(f.ku)}" placeholder="شوقە بۆ فرۆشتن لە جیهان ستی"></div>
              <div class="field"><label class="label" for="pe-ar">ناونیشان بە عەرەبی</label><input class="input" id="pe-ar" value="${esc(f.ar)}" placeholder="شقة للبيع في جيهان ستي"></div>
            </div>
            <div class="hint" id="pe-head-hint"></div>
            <div class="field">
              <div class="label"><label for="pe-tag">نامەی ئامادەی واتسئاپ <span class="req">*</span></label><span class="counter" id="pe-tag-count"></span></div>
              <div style="display:flex;gap:6px"><input class="input" id="pe-tag" value="${esc(f.tag)}"><button type="button" class="btn icon" id="pe-tag-rebuild" title="دروستکردنەوە لە ناونیشانەکانەوە" aria-label="دروستکردنەوە لە ناونیشانەکانەوە">${ic('wand')}</button><button type="button" class="btn" id="pe-tag-copy" title="کۆپیکردن بۆ دانانی لە Boost ی فەیسبووک">${ic('copy', 15)} کۆپی</button></div>
              <div class="hint" id="pe-tag-hint"></div>
            </div>
          </section>
          <section class="pe-sec">
            <h3><span class="n">3</span>ئایدییەکانی فەیسبووک <span class="aux">ئارەزوومەندانە — خۆکارانە پڕ دەبنەوە</span></h3>
            <div class="ids">
              <div class="field"><label class="label" for="pe-pid">ئایدی پۆست / ڕیل</label><input class="input mono" id="pe-pid" dir="ltr" autocomplete="off" value="${esc(f.postId)}" placeholder="ئارەزوومەندانە"></div>
              <button type="button" class="btn icon swap" id="pe-swap" title="گۆڕینەوەی شوێنی ئایدییەکان" aria-label="گۆڕینەوەی شوێنی ئایدییەکان">${ic('swap')}</button>
              <div class="field"><label class="label" for="pe-aid">ئایدی ڕیکلام (Ad ID)</label><input class="input mono" id="pe-aid" dir="ltr" autocomplete="off" value="${esc(f.adId)}" placeholder="ئارەزوومەندانە"></div>
            </div>
            <div class="hint" id="pe-ids-hint"></div>
          </section>
          <section class="pe-sec">
            <h3><span class="n">4</span>نامەکان بۆ کێ بچن؟</h3>
            <div class="seg" id="pe-owner" role="group" aria-label="خاوەنی پۆست">
              <button type="button" data-owner="personal" aria-pressed="${f.owner === 'personal'}">${ic('user', 14)} کارمەندێک</button>
              <button type="button" data-owner="group" aria-pressed="${f.owner === 'group'}">${ic('layers', 14)} گرووپێک (بە نۆرە)</button>
            </div>
            <div id="pe-own-personal" ${f.owner === 'personal' ? '' : 'hidden'}>
              <div class="field"><label class="label" for="pe-realtor-in"><span>کارمەند <span class="req">*</span></span></label><div id="pe-realtor"></div>
              <div class="hint" id="pe-realtor-hint">ئەگەر لە کاتی خۆیدا وەڵام نەداتەوە، نامەکە بۆ هاوکارەکانی لقەکەی دەگوازرێتەوە.</div></div>
            </div>
            <div id="pe-own-group" ${f.owner === 'group' ? '' : 'hidden'}>
              <div class="field"><label class="label" for="pe-group-in"><span>گرووپ <span class="req">*</span></span></label>
                <div style="display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap"><div id="pe-group" style="flex:1 1 240px"></div><button type="button" class="btn" id="pe-newgroup">${ic('plus', 14)} گرووپی نوێ</button></div>
                <div class="hint" id="pe-group-hint">نامەکان بە نۆرە و یەکسانی لە نێوان ئەندامانی گرووپەکە دابەش دەبن.</div></div>
            </div>
          </section>
          <section class="pe-sec">
            <h3><span class="n">5</span>ڕیکلام</h3>
            <div class="quick" id="pe-presets" aria-label="بودجەی ئامادە">${[[2, 4], [3, 4], [5, 4], [3, 7]].map(([d, n]) => `<button type="button" data-preset="${d}x${n}" style="height:28px;padding:0 12px;font-size:13px">$${d} × ${n} ڕۆژ = $${d * n}</button>`).join('')}</div>
            <div class="grid4 keep">
              <div class="field"><label class="label" for="pe-spend">بڕی خەرجی ($)</label><input class="input mono" id="pe-spend" dir="ltr" inputmode="decimal" value="${esc(f.spend)}" placeholder="8"><div class="quick" data-quick="spend">${[5, 8, 10, 12, 15, 20].map((v) => `<button type="button" data-v="${v}">$${v}</button>`).join('')}</div></div>
              <div class="field"><label class="label" for="pe-days">ماوە (ڕۆژ)</label><input class="input mono" id="pe-days" dir="ltr" inputmode="numeric" value="${esc(f.days)}" placeholder="4"><div class="quick" data-quick="days">${[3, 4, 5, 7, 10, 14].map((v) => `<button type="button" data-v="${v}">${v}</button>`).join('')}</div></div>
              <div class="field"><label class="label" for="pe-loc">شوێنی ڕیکلام</label><input class="input ltr" id="pe-loc" dir="ltr" list="pe-locs" value="${esc(f.loc)}"><datalist id="pe-locs"><option value="ERBIL"><option value="KURDISTAN"><option value="SULAYMANIYAH"><option value="DUHOK"><option value="IRAQ"></datalist></div>
              <div class="field"><label class="label" for="pe-start">ڕۆژی دەستپێکردن</label><input class="input" id="pe-start" type="date" value="${esc(f.start)}"></div>
            </div>
          </section>
          <section class="pe-sec">
            <h3><span class="n">6</span>وەڵامی ئامادە بۆ کارمەند <span class="aux">کارمەند بە یەک کلیک بۆ کڕیاری دەنێرێت</span></h3>
            <div class="grid2">
              <div class="field"><label class="label" for="pe-price">نرخ</label><input class="input mono" id="pe-price" dir="ltr" value="${esc(f.price)}" placeholder="ئارەزوومەندانە — کارمەند دەتوانێت دوایی زیادی بکات"><div class="hint">دێڕی «نرخ / سعر» خۆکارانە لە کۆتایی وەڵامەکە دادەنرێت.</div></div>
            </div>
            <div class="field">
              <div class="label"><label for="pe-reply">دەقی وەڵام</label><button type="button" class="btn ghost xs" id="pe-reply-rebuild">${ic('wand', 13)} دووبارە لە کاپشنەکەوە</button></div>
              <textarea class="textarea" id="pe-reply" rows="9">${esc(f.reply)}</textarea>
              <div class="hint" id="pe-reply-hint"></div>
            </div>
          </section>
        </form>
        <aside class="pe-side">
          <div class="side-card"><h4>پشکنین پێش پاشەکەوتکردن</h4><ul class="checks" id="pe-checks"></ul></div>
          <div class="side-card"><h4>ئەوەی کڕیار لە واتسئاپ دەیبینێت</h4><div class="wa-chat" id="pe-wa"></div></div>
        </aside>`;
  }
  function footHtml() {
    const isNew = st.mode === 'new';
    return (isNew ? `<button type="button" class="btn primary" id="pe-save-boost">${ic('megaphone')} زیادکردن + Boost</button><button type="button" class="btn" id="pe-save">${ic('check')} تەنها زیادکردن</button>` : `<button type="button" class="btn primary" id="pe-save">${ic('check')} پاشەکەوتکردنی گۆڕانکارییەکان</button>`) +
      (PAGE ? `<button type="button" class="btn" data-fb="change">${ic('swap', 15)} پۆستێکی تر</button>` : `<button type="button" class="btn" data-x="close">پاشگەزبوونەوە</button>`) +
      `<span class="kbd"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> بۆ پاشەکەوتکردن${PAGE ? '' : ' · <kbd>Esc</kbd> بۆ داخستن'}</span>`;
  }
  function drawerHtml() {
    const isNew = st.mode === 'new';
    return `<div class="scrim" data-x="close"></div>
    <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="pe-title">
      <div class="dr-head">
        <div><h2 id="pe-title">${isNew ? 'پۆستی نوێ' : 'دەستکاریکردنی پۆست'}</h2>
          <div class="sub">${isNew ? 'سەرەتا کاپشنەکە دابنێ — کۆد و وەڵامی ئامادە خۆیان پڕ دەبنەوە' : 'Code:' + esc(st.orig.post_code) + ' · دروستکراوە ' + esc(fmtD(st.orig.created_at))}</div></div>
        <button type="button" class="btn ghost icon close" data-x="close" aria-label="داخستن">${ic('x')}</button>
      </div>
      <div class="dr-body">${formInner()}</div>
      <div class="dr-foot">${footHtml()}</div>
    </div>`;
  }
  function pageHtml() {
    return `<div class="page pe-page">
      <div class="page-head">
        <div><h1 class="page-title">پۆستی نوێ</h1><div class="page-sub">پۆستێک لە پەیجی فەیسبووک هەڵبژێرە — کۆد، ناونیشان، کارمەند و وەڵامی ئامادە خۆیان پڕ دەبنەوە</div></div>
        <ol class="pe-steps" id="pe-steps"><li data-step="pick">${ic('image', 14)} 1 · هەڵبژاردنی پۆست</li><li data-step="form">${ic('edit', 14)} 2 · پشکنین و پاشەکەوتکردن</li></ol>
      </div>
      <section id="pe-pick" class="pe-pick">
        <div class="toolbar fb-tools">
          <div class="search">${ic('search')}<input class="input" id="pe-fbq" type="search" placeholder="گەڕان بە کۆد، ناوچە، ژمارەی کارمەند…" aria-label="گەڕانی پۆستی فەیسبووک"></div>
          <button type="button" class="btn" data-fb="search" title="لە نزیکەی 1000 پۆستی دوایی پەیجەکە دەگەڕێت">${ic('search', 15)} گەڕان لە هەموو پەیجەکە</button>
          <div class="seg" id="pe-fbfilter" role="group" aria-label="پاڵاوتن">${FB_FILTERS.map(([k, l]) => `<button type="button" data-fbfilter="${k}" aria-pressed="${FB.filter === k}">${l}<span class="seg-n" data-fbn="${k}"></span></button>`).join('')}</div>
          <button type="button" class="btn sm" data-fb="hidden" id="pe-fbhid" aria-pressed="${FB.showHidden}">${ic('eyeOff', 14)} شاردراوەکان<span class="seg-n" data-fbn="hidden"></span></button>
          <span style="flex:1"></span>
          <button type="button" class="btn ghost icon" data-fb="refresh" title="نوێکردنەوەی لیست" aria-label="نوێکردنەوەی لیست">${ic('refresh', 16)}</button>
          <button type="button" class="btn" data-fb="manual">${ic('edit', 15)} بێ فەیسبووک — دەستی بنووسە</button>
        </div>
        <div id="pe-fbinfo" class="fb-info"></div>
        <div id="pe-fbgrid"></div>
      </section>
      <section id="pe-formwrap" hidden>
        <div id="pe-picked"></div>
        <div class="pe-grid">${formInner()}</div>
        <div class="pe-foot">${footHtml()}</div>
      </section>
    </div>`;
  }

  /* ----- checks ----- */
  function setChk(k, s, m) { st.chk[k] = { s, m }; paintChecks(); }
  async function checkCode() {
    if (!st) return;
    const code = st.f.code; const seq = ++st.seq.code;
    if (!code) return setChk('code', 'bad', 'کۆدی پۆست پێویستە');
    if (!/^[A-Z]*[-_]?\d{1,8}$/.test(code)) return setChk('code', 'bad', 'کۆد دەبێت ژمارە بێت، بۆ نموونە 502');
    if (st.mode === 'edit' && code === String(st.orig.post_code)) return setChk('code', 'ok', 'کۆدی ئێستای ئەم پۆستەیە');
    setChk('code', 'wait', 'پشکنینی کۆد…');
    try {
      const free = await rpc('is_post_code_free', { p_code: code, p_exclude_code: st.mode === 'edit' ? String(st.orig.post_code) : null });
      if (!st || seq !== st.seq.code) return;
      if (free) setChk('code', 'ok', 'کۆدەکە بەتاڵە');
      else { const o = S.posts.find((p) => String(p.post_code) === code); setChk('code', 'bad', 'ئەم کۆدە پێشتر بەکارهاتووە' + (o ? ' بۆ «' + cleanSpaces(o.headline || '') + '»' : '')); }
    } catch (e) { if (st && seq === st.seq.code) setChk('code', 'warn', 'نەتوانرا کۆدەکە بپشکنرێت: ' + humanError(e)); }
  }
  async function checkTag() {
    if (!st) return;
    const tag = cleanSpaces(st.f.tag); const seq = ++st.seq.tag;
    if (!tag) return setChk('tag', 'bad', 'نامەی ئامادە پێویستە — ناونیشانەکان پڕ بکەرەوە');
    if (tag.length > CFG.tagMax) return setChk('tag', 'bad', `نامەی ئامادە ${tag.length} پیتە، زۆرترین ${CFG.tagMax} — ناونیشانەکان کورت بکەرەوە`);
    if (st.mode === 'edit' && normTxt(tag) === normTxt(st.orig.auto_message_tag || '')) return setChk('tag', 'ok', 'نامەی ئامادەی ئێستای ئەم پۆستەیە');
    setChk('tag', 'wait', 'پشکنینی نامەی ئامادە…');
    try {
      const free = await rpc('is_auto_message_tag_free', { p_tag: tag, p_post_code: st.mode === 'edit' ? String(st.orig.post_code) : null });
      if (!st || seq !== st.seq.tag) return;
      if (free) setChk('tag', 'ok', 'نامەی ئامادە تایبەتە بەم پۆستە');
      else { const o = S.posts.find((p) => normTxt(p.auto_message_tag || '') === normTxt(tag)); setChk('tag', 'bad', 'هەمان نامەی ئامادە بۆ پۆستێکی تر هەیە' + (o ? ' (کۆد ' + o.post_code + ')' : '') + ' — وشەیەکی جیاوازی تێ بکە'); }
    } catch (e) { if (st && seq === st.seq.tag) setChk('tag', 'warn', 'نەتوانرا بپشکنرێت: ' + humanError(e)); }
  }
  async function checkIds() {
    if (!st) return;
    const f = st.f; const ids = [f.postId, f.adId].filter(Boolean); const seq = ++st.seq.ids;
    if (!ids.length) return setChk('ids', 'ok', 'پێویست نییە — یەکەم کڕیار کە لە ڕیکلامەکەوە دێت، ئایدییەکە خۆکارانە تۆمار دەکات');
    if (f.postId && isAdId(f.postId) && !f.adId) return setChk('ids', 'warn', 'ئەوەی لە خانەی پۆستە وەک ئایدی ڕیکلام دەردەکەوێت — دوگمەی گۆڕینەوە بەکاربهێنە');
    if (f.postId && f.postId === f.adId) return setChk('ids', 'bad', 'هەردوو ئایدی وەک یەکن');
    setChk('ids', 'wait', 'پشکنینی ئایدییەکان…');
    try {
      const rows = await get('posts?' + qs([['select', 'facebook_post_id,post_code,headline'], ['source_ids', 'ov.{' + ids.join(',') + '}']]));
      if (!st || seq !== st.seq.ids) return;
      const other = (rows || []).filter((r) => !(st.mode === 'edit' && r.facebook_post_id === st.orig.facebook_post_id));
      if (other.length) setChk('ids', 'warn', 'ئەم ئایدییە لە پۆستی کۆد ' + other.map((o) => o.post_code).join('، ') + ' هەیە — نامەکان ڕەنگە بۆ ئەوێ بچن');
      else setChk('ids', 'ok', !f.adId ? 'ئایدی پۆست هەیە، ئایدی ڕیکلام نییە' : !f.postId ? 'ئایدی ڕیکلام هەیە، ئایدی پۆست نییە' : 'هەردوو ئایدی تۆمارکران');
    } catch (e) { if (st && seq === st.seq.ids) setChk('ids', 'warn', 'نەتوانرا بپشکنرێت: ' + humanError(e)); }
  }
  const dCode = debounce(checkCode, 350), dTag = debounce(checkTag, 400), dIds = debounce(checkIds, 400);

  function localChecks() {
    const f = st.f, out = [];
    const capCode = extractCode(f.caption);
    out.push(!f.caption.trim() ? { k: 'caption', s: 'bad', t: 'کاپشن', m: 'کاپشنی پۆستەکە پێویستە', el: 'pe-caption' }
      : !capCode ? { k: 'caption', s: 'warn', t: 'کاپشن', m: 'هیچ Code:0000 لە کاپشنەکەدا نییە — کڕیاران کۆدەکە نابینن', el: 'pe-caption' }
      : f.code && capCode !== f.code ? { k: 'caption', s: 'bad', t: 'کاپشن', m: `کۆدی ناو کاپشن (${capCode}) جیاوازە لە کۆدی پۆست (${f.code})`, el: 'pe-code' }
      : { k: 'caption', s: 'ok', t: 'کاپشن', m: 'Code:' + capCode + ' لە کاپشنەکەدا هەیە', el: 'pe-caption' });
    out.push(Object.assign({ k: 'code', t: 'کۆد', el: 'pe-code' }, st.chk.code));
    const url = f.url.trim();
    out.push(!url ? { k: 'url', s: 'bad', t: 'لینک', m: 'لینکی پۆستەکە پێویستە', el: 'pe-url' }
      : !/^https?:\/\//i.test(url) ? { k: 'url', s: 'bad', t: 'لینک', m: 'لینکەکە دەبێت بە https:// دەست پێ بکات', el: 'pe-url' }
      : !/facebook\.com|fb\.watch|instagram\.com/i.test(url) ? { k: 'url', s: 'warn', t: 'لینک', m: 'لینکی فەیسبووک نییە', el: 'pe-url' }
      : { k: 'url', s: 'ok', t: 'لینک', m: 'لینکی فەیسبووک', el: 'pe-url' });
    out.push(!cleanSpaces(f.ku) ? { k: 'head', s: 'bad', t: 'ناونیشان', m: 'ناونیشانی کوردی پێویستە', el: 'pe-ku' }
      : !cleanSpaces(f.ar) ? { k: 'head', s: 'warn', t: 'ناونیشان', m: 'ناونیشانی عەرەبی نییە — وەڵامی عەرەبی تەنها کوردی نیشان دەدات', el: 'pe-ar' }
      : { k: 'head', s: 'ok', t: 'ناونیشان', m: headlineOf(f), el: 'pe-ku' });
    out.push(Object.assign({ k: 'tag', t: 'نامەی ئامادە', el: 'pe-tag' }, st.chk.tag));
    out.push(Object.assign({ k: 'ids', t: 'ئایدییەکان', el: 'pe-pid' }, st.chk.ids));
    if (f.owner === 'personal') {
      const r = f.realtorId ? S.realtorById.get(f.realtorId) : null;
      out.push(!r ? { k: 'owner', s: 'bad', t: 'خاوەن', m: 'کارمەندێک هەڵبژێرە', el: 'pe-realtor-in' }
        : r.active === false ? { k: 'owner', s: 'warn', t: 'خاوەن', m: r.name + ' ناچالاکە — نامەی بۆ ناچێت تا چالاکی نەکەیتەوە', el: 'pe-realtor-in' }
        : !hasApp(r.id) ? { k: 'owner', s: 'warn', t: 'خاوەن', m: r.name + ' هێشتا ئەپەکەی دانەبەزاندووە — نامەکان نابینێت', el: 'pe-realtor-in' }
        : { k: 'owner', s: 'ok', t: 'خاوەن', m: r.name + (r.branch ? ' · ' + r.branch : ''), el: 'pe-realtor-in' });
    } else {
      const g = f.groupId ? S.groupById.get(f.groupId) : null;
      out.push(!g ? { k: 'owner', s: 'bad', t: 'خاوەن', m: 'گرووپێک هەڵبژێرە', el: 'pe-group-in' }
        : !g.members ? { k: 'owner', s: 'bad', t: 'خاوەن', m: 'گرووپی «' + g.name + '» هیچ ئەندامێکی نییە', el: 'pe-group-in' }
        : { k: 'owner', s: 'ok', t: 'خاوەن', m: 'گرووپی «' + g.name + '» · ' + g.members + ' ئەندام', el: 'pe-group-in' });
    }
    out.push(f.spend === '' || f.days === '' ? { k: 'ads', s: 'warn', t: 'ڕیکلام', m: 'خەرجی یان ماوە نییە — تێچووی هەر نامەیەک ناژمێردرێت', el: f.spend === '' ? 'pe-spend' : 'pe-days' }
      : isNaN(Number(f.spend)) || !/^\d+$/.test(f.days) ? { k: 'ads', s: 'bad', t: 'ڕیکلام', m: 'خەرجی و ماوە دەبێت ژمارە بن', el: 'pe-spend' }
      : { k: 'ads', s: 'ok', t: 'ڕیکلام', m: `${money(f.spend)} بۆ ${f.days} ڕۆژ${f.start ? ' لە ' + f.start : ''}`, el: 'pe-spend' });
    out.push(!f.reply.trim() ? { k: 'reply', s: 'warn', t: 'وەڵامی ئامادە', m: 'بەتاڵە — کارمەند دەبێت خۆی وەڵام بنووسێت', el: 'pe-reply' }
      : !PRICE_LINE.test(f.reply) ? { k: 'reply', s: 'warn', t: 'وەڵامی ئامادە', m: 'نرخ دیار نەکراوە', el: 'pe-price' }
      : { k: 'reply', s: 'ok', t: 'وەڵامی ئامادە', m: 'نرخ: ' + (f.reply.match(PRICE_LINE) || [])[1], el: 'pe-reply' });
    return out;
  }
  function paintChecks() {
    if (!root) return;
    const list = localChecks();
    const icon = { ok: 'check', bad: 'x', warn: 'alert', wait: 'clock' };
    $('#pe-checks', root).innerHTML = list.map((c) => `<li class="check ${c.s || 'wait'}"><span class="ci">${ic(icon[c.s] || 'clock', 11)}</span><div><b>${esc(c.t)}:</b> <span>${esc(c.m || '…')}</span></div></li>`).join('');
    const blockers = list.filter((c) => c.s === 'bad' || c.s === 'wait').length;
    const save = $('#pe-save', root); if (save && !save.disabled) save.title = blockers ? blockers + ' خاڵ پێویستی بە چارەسەرە' : '';
    // inline hints next to fields
    const byK = Object.fromEntries(list.map((c) => [c.k, c]));
    const hint = (id, c, fallback) => { const el = $('#' + id, root); if (!el) return; const show = c && (c.s === 'bad' || c.s === 'warn'); el.className = 'hint' + (show ? ' ' + c.s : ''); el.innerHTML = show ? `${ic(c.s === 'bad' ? 'xCircle' : 'alert', 13)}<span>${esc(c.m)}</span>` : (fallback || ''); };
    const capCode = extractCode(st.f.caption);
    hint('pe-caption-hint', byK.caption, capCode ? `${ic('checkCircle', 13)}<span>کۆدی <b class="mono">${esc(capCode)}</b> لە کاپشنەکەدا دۆزرایەوە</span>` : 'کۆتایی کاپشنەکە دەبێت وەک Code:502 بێت.');
    hint('pe-code-hint', byK.code, st.mode === 'new' && !st.f.code ? `<span>کۆدی بەتاڵی داهاتوو: <button type="button" class="btn xs" data-use-code="${esc(nextCode())}">${esc(nextCode())}</button></span>` : (byK.code && byK.code.s === 'ok' ? `${ic('checkCircle', 13)}<span>${esc(byK.code.m)}</span>` : ''));
    hint('pe-url-hint', byK.url, idFromUrl(st.f.url) ? `<span>ئایدی <span class="mono">${esc(idFromUrl(st.f.url))}</span> لە لینکەکەوە وەرگیرا</span>` : '');
    const hh = $('#pe-head-hint', root);
    if (hh) hh.innerHTML = st.auto.head && st.headFilled ? `${ic('wand', 13)}<span>خۆکارانە لە کاپشنەکەوە دەرهێنران و کورتکرانەوە — تکایە بپشکنە</span>` : '';
    const rh = $('#pe-realtor-hint', root);
    if (rh) {
      const cr = st.capRealtors || { list: [] };
      const others = cr.list.filter((x) => x.r && x.r.id !== st.f.realtorId);
      const curR = st.f.realtorId ? S.realtorById.get(st.f.realtorId) : null;
      const capProblems = cr.list.filter((x) => x.r && (x.r.active === false || !hasApp(x.r.id)));
      if (curR && (curR.active === false || !hasApp(curR.id)) && !capProblems.some((x) => x.r.id === curR.id)) capProblems.unshift({ r: curR, phone: '' });
      const unknown = cr.list.filter((x) => !x.r).map((x) => x.phone);
      const parts = [];
      if (st.auto.realtor && st.f.realtorId && st.realtorFrom) parts.push(`${ic('wand', 13)}<span>خۆکارانە هەڵبژێردرا لە یەکەم ژمارەی کاپشن: <span class="mono">${esc(st.realtorFrom)}</span></span>`);
      if (others.length) parts.push(`<span>ژمارەکانی تری کاپشن:</span> ${others.map((x) => `<button type="button" class="btn xs" data-pick-realtor="${esc(x.r.id)}">${esc(x.r.name)}</button>`).join(' ')}`);
      if (unknown.length) parts.push(`<span class="muted">ناسراو نییە: <span class="mono">${esc(unknown.join('، '))}</span></span>`);
      capProblems.forEach((x) => parts.push(`<span style="color:var(--warn)">${ic('alert', 13)} <b>${esc(x.r.name)}</b> ${x.r.active === false ? 'ناچالاکە' : ''}${x.r.active === false && !hasApp(x.r.id) ? ' و ' : ''}${!hasApp(x.r.id) ? 'ئەپی نییە' : ''}</span> <button type="button" class="btn xs" data-onboard-r="${esc(x.r.id)}">${ic('send', 12, 'flip')} ${x.r.active === false ? 'چالاککردن + ' : ''}ڕێنمایی ئەپ</button>`));
      rh.innerHTML = parts.length ? parts.join('<br>') : 'ئەگەر لە کاتی خۆیدا وەڵام نەداتەوە، نامەکە بۆ هاوکارەکانی لقەکەی دەگوازرێتەوە.';
      rh.style.flexWrap = 'wrap';
    }
    hint('pe-tag-hint', byK.tag, 'ئەم دەقە دەچێتە ناو دوگمەی واتسئاپی ڕیکلامەکە؛ کاتێک کڕیار دەینێرێت، پۆستەکە دەناسرێتەوە.');
    hint('pe-ids-hint', byK.ids, 'پێویست ناکات کۆپی بکەیت: کاتێک یەکەم کڕیار لە ڕیکلامەکەوە نامە دەنێرێت، سیستەم ئایدییەکان لە کۆدی ناو کاپشنەکەوە فێر دەبێت (هەر 5 خولەک جارێک).');
    const tagLen = cleanSpaces(st.f.tag).length;
    const cnt = $('#pe-tag-count', root); cnt.textContent = tagLen + ' / ' + CFG.tagMax; cnt.classList.toggle('over', tagLen > CFG.tagMax);
    $('#pe-reply-hint', root).textContent = st.auto.reply ? 'خۆکارانە لە کاپشنەکەوە دروستکرا (ژمارە تەلەفۆن و هاشتاگەکان لابران). دەتوانیت دەستکاری بکەیت.' : '';
  }
  function paintPreview() {
    if (!root) return;
    const f = st.f;
    const r = f.owner === 'personal' && f.realtorId ? S.realtorById.get(f.realtorId) : null;
    const g = f.owner === 'group' && f.groupId ? S.groupById.get(f.groupId) : null;
    const rname = r ? r.name : g ? 'کارمەندێک لە گرووپی ' + g.name : '(ناوی کارمەند)';
    const rnum = r && r.whatsapp_number ? r.whatsapp_number : '+964 7XX XXX XXXX';
    const head = headlineOf(f) || '(ناونیشانی پۆست)';
    const tpl = S.settings.auto_reply_template || 'سڵاو 👋\nنامەکەتم نارد بۆ کاک {realtor_name} دەربارەی {post_headline}.\n{realtor_name}: {realtor_number}';
    const reply = tpl.split('{realtor_name}').join(rname).split('{realtor_number}').join(rnum).split('{post_headline}').join(head);
    $('#pe-wa', root).innerHTML = `<div class="b mine"><div class="who">کڕیار</div>${esc(cleanSpaces(f.tag) || '(نامەی ئامادە)')}</div>
      <div class="b theirs"><div class="who">عەقاراتی باغی شەقڵاوە</div>${esc(reply)}</div>
      <div class="cta">${ic('chat', 13)} چات لەگەڵ کارمەند</div>`;
  }
  function paintAll() { paintChecks(); paintPreview(); }

  function setVal(id, v) { const el = $('#' + id, root); if (el && el.value !== v) el.value = v; }
  function onCaption() {
    const f = st.f;
    if (TAIL_JUNK.test(f.caption)) { f.caption = f.caption.replace(TAIL_JUNK, ''); setVal('pe-caption', f.caption); }
    const code = extractCode(f.caption);
    if (code && (st.auto.code || !f.code)) { f.code = code; st.auto.code = true; setVal('pe-code', code); dCode(); }
    if (f.caption.trim() && (st.auto.head || (!f.ku && !f.ar))) {
      const h = headsFromCaption(f.caption);
      if (h.ku || h.ar) {
        f.ku = h.ku; f.ar = h.ar; st.auto.head = true; st.headFilled = true;
        setVal('pe-ku', f.ku); setVal('pe-ar', f.ar);
        if (st.auto.tag) rebuildTag();
      }
    }
    st.capRealtors = realtorsInCaption(f.caption);
    if (f.owner === 'personal' && (st.auto.realtor || !f.realtorId)) {
      const hit = st.capRealtors.list.find((x) => x.r && x.r.active !== false && hasApp(x.r.id)) || st.capRealtors.list.find((x) => x.r && x.r.active !== false);
      if (hit) { f.realtorId = hit.r.id; st.auto.realtor = true; st.realtorFrom = hit.phone; st.combos.realtor.set(hit.r.id); }
    }
    if (st.auto.reply) { f.reply = buildReply(f); setVal('pe-reply', f.reply); }
    paintAll();
  }
  const dCaption = debounce(onCaption, 200);
  function rebuildTag() { st.f.tag = buildTag(st.f.ku, st.f.ar); setVal('pe-tag', st.f.tag); dTag(); }
  function onIdsInput(which, el) {
    const f = st.f; const found = splitIds(el.value);
    if (found.length >= 2) {
      const a = assignIds(found); f.postId = a.post; f.adId = a.ad;
      setVal('pe-pid', f.postId); setVal('pe-aid', f.adId);
      toast('ئایدییەکان جیاکرانەوە و لە شوێنی خۆیان دانران');
    } else {
      const v = digits(el.value).slice(0, 20);
      if (which === 'pid') { f.postId = v; st.auto.postId = false; } else f.adId = v;
      if (el.value !== v) el.value = v;
      // an ad id typed in the post box while the ad box is empty: move it
      if (which === 'pid' && isAdId(v) && !f.adId) { f.adId = v; f.postId = ''; setVal('pe-aid', v); setVal('pe-pid', ''); }
    }
    dIds(); paintAll();
  }

  function bind() {
    const f = st.f;
    st.combos.realtor = Combo($('#pe-realtor', root), {
      id: 'pe-realtor-in', items: S.realtors.slice().sort((a, b) => (a.active === false) - (b.active === false) || (!hasApp(a.id)) - (!hasApp(b.id)) || a.name.localeCompare(b.name)), value: f.realtorId,
      label: (r) => r.name, sub: (r) => [r.branch || '', r.active === false ? 'ناچالاک' : '', hasApp(r.id) ? '' : 'بێ ئەپ'].filter(Boolean).join(' · '), placeholder: 'ناوی کارمەند بنووسە…',
      onChange: (v) => { f.realtorId = v; st.auto.realtor = false; st.dirty = true; paintAll(); },
    });
    st.combos.group = Combo($('#pe-group', root), {
      id: 'pe-group-in', items: S.groups, value: f.groupId, label: (g) => g.name,
      sub: (g) => groupKindLabel(g.kind) + ' · ' + g.members + ' ئەندام', placeholder: 'ناوی گرووپ بنووسە…',
      onChange: (v) => { f.groupId = v; st.dirty = true; paintAll(); },
    });
    root.addEventListener('input', (e) => {
      const el = e.target; if (!el.id) return;
      if (el.id === 'pe-fbq') { FB.q = el.value; dFbRender(); return; }
      st.dirty = true;
      switch (el.id) {
        case 'pe-caption': f.caption = el.value; dCaption(); break;
        case 'pe-code': f.code = cleanCode(el.value); st.auto.code = false; dCode(); paintAll(); break;
        case 'pe-url': {
          f.url = el.value.trim();
          const id = idFromUrl(f.url);
          if (id && (!f.postId || st.auto.postId)) { f.postId = id; st.auto.postId = true; setVal('pe-pid', id); dIds(); }
          paintAll(); break;
        }
        case 'pe-ku': case 'pe-ar':
          f[el.id === 'pe-ku' ? 'ku' : 'ar'] = el.value; st.auto.head = false;
          if (st.auto.tag) rebuildTag();
          paintAll(); break;
        case 'pe-tag': f.tag = el.value; st.auto.tag = false; dTag(); paintAll(); break;
        case 'pe-pid': onIdsInput('pid', el); break;
        case 'pe-aid': onIdsInput('aid', el); break;
        case 'pe-spend': f.spend = toLatin(el.value).replace(/[^\d.]/g, ''); if (el.value !== f.spend) el.value = f.spend; paintAll(); break;
        case 'pe-days': f.days = digits(el.value); if (el.value !== f.days) el.value = f.days; paintAll(); break;
        case 'pe-loc': f.loc = el.value.trim(); break;
        case 'pe-start': f.start = el.value; paintAll(); break;
        case 'pe-price':
          f.price = el.value;
          f.reply = st.auto.reply ? buildReply(f) : withPrice(f.reply, f.price);
          setVal('pe-reply', f.reply); paintAll(); break;
        case 'pe-reply': f.reply = el.value; st.auto.reply = false; paintAll(); break;
        default: break;
      }
    });
    root.addEventListener('change', (e) => { if (e.target.id === 'pe-start') { f.start = e.target.value; paintAll(); } });
    root.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]'); if (x) { requestClose(); return; }
      const own = e.target.closest('[data-owner]');
      if (own) {
        f.owner = own.dataset.owner; st.dirty = true;
        $$('#pe-owner button', root).forEach((b) => b.setAttribute('aria-pressed', String(b === own)));
        $('#pe-own-personal', root).hidden = f.owner !== 'personal';
        $('#pe-own-group', root).hidden = f.owner !== 'group';
        paintAll(); return;
      }
      const qb = e.target.closest('[data-quick] button');
      if (qb) { const k = qb.parentElement.dataset.quick; f[k] = qb.dataset.v; setVal('pe-' + k, qb.dataset.v); st.dirty = true; paintAll(); return; }
      const zb = e.target.closest('[data-zoom]'); if (zb) { openLightbox(zb.dataset.zoom); return; }
      const fpk = e.target.closest('[data-fbpick]'); if (fpk) { pickFbPost(findFb(fpk.dataset.fbpick)); return; }
      const ffl = e.target.closest('[data-fbfilter]'); if (ffl) { FB.filter = ffl.dataset.fbfilter; renderFb(); return; }
      const fed = e.target.closest('[data-fbedit]'); if (fed) { openExisting(fed.dataset.fbedit); return; }
      const fbb = e.target.closest('[data-fbboost]'); if (fbb) { boostExisting(findFb(fbb.dataset.fbboost)); return; }
      const fbc = e.target.closest('[data-fbcall]'); if (fbc) { callExisting(findFb(fbc.dataset.fbcall)); return; }
      const fbh = e.target.closest('[data-fbhide]'); if (fbh) { hideFb(findFb(fbh.dataset.fbhide), fbh.dataset.hide === '1', fbh); return; }
      const fa = e.target.closest('[data-fb]');
      if (fa) {
        const a = fa.dataset.fb;
        if (a === 'more') loadFb(false);
        else if (a === 'hidden') { FB.showHidden = !FB.showHidden; if (FB.showHidden) FB.filter = 'all'; renderFb(); }
        else if (a === 'refresh') loadFb(true);
        else if (a === 'search') searchFb();
        else if (a === 'clear') { FB.mode = 'list'; FB.q = ''; setVal('pe-fbq', ''); renderFb(); }
        else if (a === 'manual') { st.picked = null; showStep('form'); paintPicked(); setTimeout(() => { const c = $('#pe-caption', root); if (c) c.focus(); }, 50); }
        else if (a === 'change') changePost();
        return;
      }
      const pr = e.target.closest('[data-preset]');
      if (pr) { const [d, n] = pr.dataset.preset.split('x').map(Number); f.spend = String(d * n); f.days = String(n); setVal('pe-spend', f.spend); setVal('pe-days', f.days); st.dirty = true; paintAll(); return; }
      const obr = e.target.closest('[data-onboard-r]');
      if (obr) { onboardRealtor(obr.dataset.onboardR, { onDone: () => { if (st) { st.combos.realtor.setItems(S.realtors); paintAll(); } } }); return; }
      const pk = e.target.closest('[data-pick-realtor]');
      if (pk) { f.realtorId = pk.dataset.pickRealtor; st.auto.realtor = false; st.combos.realtor.set(f.realtorId); st.dirty = true; paintAll(); return; }
      const uc = e.target.closest('[data-use-code]');
      if (uc) { f.code = uc.dataset.useCode; st.auto.code = false; setVal('pe-code', f.code); checkCode(); paintAll(); return; }
      const id = e.target.closest('button') && e.target.closest('button').id;
      if (id === 'pe-tag-rebuild') { st.auto.tag = true; rebuildTag(); paintAll(); }
      else if (id === 'pe-tag-copy') { if (cleanSpaces(f.tag)) copyText(cleanSpaces(f.tag), 'نامەی ئامادە کۆپی کرا — لە Boost دایبنێ'); }
      else if (id === 'pe-swap') { const a = f.postId; f.postId = f.adId; f.adId = a; setVal('pe-pid', f.postId); setVal('pe-aid', f.adId); st.dirty = true; checkIds(); paintAll(); }
      else if (id === 'pe-reply-rebuild') { st.auto.reply = true; f.reply = buildReply(f); setVal('pe-reply', f.reply); paintAll(); }
      else if (id === 'pe-newgroup') {
        newGroupDialog((gid) => { f.groupId = gid; st.combos.group.setItems(S.groups); st.combos.group.set(gid); st.dirty = true; paintAll(); });
      }
      else if (id === 'pe-save') save();
      else if (id === 'pe-save-boost') save({ boost: true });
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target && e.target.id === 'pe-fbq') { e.preventDefault(); searchFb(); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { if (PAGE && st.step !== 'form') return; e.preventDefault(); save(); }
    });
  }

  async function save(opts = {}) {
    if (!st || st.saving) return;
    const btn = $(opts.boost ? '#pe-save-boost' : '#pe-save', root);
    busy(btn, true); st.saving = true;
    try {
      await Promise.all([checkCode(), checkTag(), checkIds()]);
      if (!st) return;
      const list = localChecks();
      const bad = list.find((c) => c.s === 'bad' || c.s === 'wait');
      if (bad) {
        toast(bad.t + ': ' + bad.m, 'err');
        const el = $('#' + bad.el, root); if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        return;
      }
      const f = st.f; const headline = headlineOf(f); const tag = cleanSpaces(f.tag);
      let savedId = st.mode === 'new' ? null : st.orig.facebook_post_id;
      if (st.mode === 'new') {
        const row = await rpc('manager_create_post', {
          p_post_code: f.code, p_headline: headline,
          p_realtor_id: f.owner === 'personal' ? f.realtorId : null, p_group_id: f.owner === 'group' ? f.groupId : null,
          p_post_reel_id: f.postId || null, p_ad_id: f.adId || null,
          p_sponsor_spend: f.spend === '' ? null : Number(f.spend), p_sponsor_location: f.loc || '',
          p_sponsor_days: f.days === '' ? null : parseInt(f.days, 10), p_sponsor_start: f.start || '',
          p_auto_message_tag: tag, p_caption: f.caption, p_reply_template: f.reply, p_facebook_post_url: f.url.trim(),
        });
        savedId = row && row.facebook_post_id;
        lsSet(DEF_KEY, { spend: f.spend, days: f.days, loc: f.loc });
        toast('پۆستی Code:' + ((row && row.post_code) || f.code) + ' زیادکرا');
        const done = { code: (row && row.post_code) || f.code, tag, url: f.url.trim(), spend: f.spend, days: f.days, hasAd: !!f.adId };
        if (opts.boost && row && row.facebook_post_id) {
          const perDay = f.spend && f.days ? Number(f.spend) / Number(f.days) : null;
          const pagePostId = st.pickedPostId || (f.postId && !isAdId(f.postId) ? f.postId : null);
          const pRow = { facebook_post_id: row.facebook_post_id, post_code: row.post_code || f.code, auto_message_tag: tag };
          setTimeout(() => boostDialog(pRow, { perDay: perDay || undefined, days: f.days || undefined, pagePostId }).catch(toastErr), 50);
        }
        void done; // (the old manual "how to boost" sheet is no longer needed — Boost is one click)
      } else {
        const o = st.orig;
        const patch = {
          post_code: f.code, headline, auto_message_tag: tag,
          caption: f.caption.trim() ? f.caption : null, reply_template: f.reply.trim() ? f.reply : null,
          facebook_post_url: f.url.trim() || null, source_ids: [f.postId, f.adId].filter(Boolean),
          sponsor_spend_usd: f.spend === '' ? 0 : Number(f.spend), sponsor_days: f.days === '' ? null : parseInt(f.days, 10),
          sponsor_location: f.loc || null, sponsor_start_at: f.start || null,
        };
        const origOwner = o.realtor_id ? 'personal' : 'group';
        if (f.owner === 'personal' && (origOwner !== 'personal' || f.realtorId !== o.realtor_id)) {
          const r = S.realtorById.get(f.realtorId);
          const bg = r ? S.groups.find((g) => g.kind === 'branch' && (g.branch === r.branch || g.name === r.branch)) : null;
          patch.realtor_id = f.realtorId; patch.group_id = bg ? bg.id : (o.group_id || null);
        } else if (f.owner === 'group' && (origOwner !== 'group' || f.groupId !== o.group_id)) {
          patch.realtor_id = null; patch.group_id = f.groupId;
        }
        const res = (await api('/rest/v1/posts?' + qs([['facebook_post_id', 'eq.' + o.facebook_post_id]]), { method: 'PATCH', body: patch, prefer: 'return=representation' })).data;
        if (!res || !res.length) throw new ApiError('هیچ گۆڕانکارییەک پاشەکەوت نەکرا — دەسەڵاتی دەستکاریکردنی پۆستت نییە.');
        toast('گۆڕانکارییەکانی Code:' + f.code + ' پاشەکەوت کران');
      }
      st.dirty = false;
      if (PAGE) {
        // back to the list, ready for the next post
        const picked = st.picked;
        if (picked) [FB.posts, FB.results || []].forEach((arr) => arr.forEach((x) => { if (x.post_id === picked.post_id) { x.in_system = true; x.system_post = savedId; } }));
        const c = root && root.parentElement; if (c) mount(c, { step: 'pick' });
      } else close();
      await loadPostsLite().catch(() => {});
      if (PAGE) renderFb();
      if (L.combos) L.combos.post.setItems(S.posts);
      if (S.view === 'posts') loadPosts(true); else P.loadedAt = 0;
      if (savedId) refreshPostImage(savedId);
    } catch (e) { toastErr(e); }
    finally { if (st) { st.saving = false; busy(btn, false); } }
  }

  /* ----- New Post page: Facebook posts browser ----- */
  const dFbRender = debounce(() => renderFb(), 150);
  function fbRealtors(p) { if (!p._r) p._r = realtorsInCaption(p.message || '').list; return p._r; }
  const fbAppIssue = (p) => fbRealtors(p).some((x) => x.r && (x.r.active === false || !hasApp(x.r.id)));
  const findFb = (id) => FB.posts.find((x) => x.post_id === id) || (FB.results || []).find((x) => x.post_id === id) || null;
  function fbLines(p) { return String(p.message || '').replace(/\r/g, '').split('\n').map(cleanSpaces).filter((l) => /\p{L}/u.test(l) && !CODE_LINE.test(l)); }
  function fbRealtorChips(p) {
    const rs = fbRealtors(p);
    if (!rs.length) return `<span class="rchip mute">${ic('user', 12)} ژمارەی کارمەند لە کاپشندا نییە</span>`;
    return rs.map((x) => {
      if (!x.r) return `<span class="rchip mute" title="ئەم ژمارەیە بۆ هیچ کارمەندێک تۆمار نەکراوە">${ic('user', 12)} <span class="mono">${esc(x.phone)}</span> · ناسراو نییە</span>`;
      if (x.r.active === false) return `<span class="rchip bad">${ic('user', 12)} ${esc(x.r.name)} · ناچالاک <button type="button" class="rchip-btn" data-onboard-r="${esc(x.r.id)}">چالاککردن + ڕێنمایی</button></span>`;
      if (!hasApp(x.r.id)) return `<span class="rchip warn" title="هێشتا نەچووەتە ناو ئەپەکە — نامەکان نابینێت">${ic('alert', 12)} ${esc(x.r.name)} · بێ ئەپ <button type="button" class="rchip-btn" data-onboard-r="${esc(x.r.id)}">ناردنی ڕێنمایی</button></span>`;
      return `<span class="rchip ok" title="ئەپەکەی هەیە">${ic('check', 12)} ${esc(x.r.name)}</span>`;
    }).join('');
  }
  function fbCard(p) {
    const lines = fbLines(p);
    const video = /video/i.test(p.status_type || '') || /\/(reel|videos)\//i.test(p.permalink_url || '');
    const sys = p.system_post ? S.postById.get(p.system_post) : null;
    const who = fbRealtors(p)[0] || null;
    const callFirst = fbAppIssue(p);
    const callBtn = who && !p.call_running ? `<button type="button" class="btn xs call ${callFirst ? 'primary' : ''}" data-fbcall="${esc(p.post_id)}" title="ڕیکلامی «Call now» — پەیوەندی بە ${esc(who.r ? who.r.name : who.phone)}">${ic('phone', 12)} پەیوەندی</button>` : '';
    const hideBtn = `<button type="button" class="btn xs ghost icon" data-fbhide="${esc(p.post_id)}" data-hide="${p.hidden ? '0' : '1'}" title="${p.hidden ? 'گەڕاندنەوە بۆ لیست' : 'شاردنەوە (بۆ نموونە پۆستی ئۆفەر نییە)'}" aria-label="${p.hidden ? 'گەڕاندنەوە' : 'شاردنەوە'}">${ic(p.hidden ? 'eye' : 'eyeOff', 13)}</button>`;
    return `<article class="fbp ${p.in_system ? 'in' : ''} ${p.hidden ? 'hid' : ''}">
      <button type="button" class="fbp-img" data-fbpick="${esc(p.post_id)}" aria-label="هەڵبژاردنی ئەم پۆستە">
        ${p.picture ? `<img src="${esc(p.picture)}" alt="" loading="lazy">` : `<span class="fb-noimg">${ic('image', 26)}</span>`}
        ${video ? `<span class="fbp-badge">${ic('video', 12)} ڤیدیۆ</span>` : ''}
      </button>
      <div class="fbp-b">
        <div class="p-top">${p.code ? `<span class="code">Code:${esc(p.code)}</span>` : '<span class="chip warn" title="Code:0000 لە کۆتایی کاپشن نییە">بێ کۆد</span>'}
          ${p.in_system ? `<span class="chip ok">${ic('check', 11)} لە سیستەمدایە</span>` : '<span class="chip accent">نوێ</span>'}
          ${p.ad_running ? '<span class="chip ok"><span class="dot"></span>ڕیکلامی چالاکە</span>' : p.ads ? '<span class="chip">Boost کرابوو</span>' : ''}
          ${p.call_running ? `<span class="chip ok">${ic('phone', 11)} پەیوەندی چالاکە</span>` : ''}${p.hidden ? `<span class="chip">${ic('eyeOff', 11)} شاردراوە</span>` : ''}</div>
        <div class="fbp-t">${esc(lines[0] || '(بێ دەق)')}</div>
        ${lines[1] ? `<div class="fbp-s">${esc(lines[1])}</div>` : ''}
        <div class="fbp-r">${fbRealtorChips(p)}</div>
        <div class="fbp-foot"><span class="muted">${esc(ago(p.created_time, true))}</span><span style="flex:1"></span>${hideBtn}
          ${p.permalink_url ? `<a class="btn xs ghost icon" href="${esc(safeUrl(p.permalink_url))}" target="_blank" rel="noopener" title="کردنەوە لە فەیسبووک" aria-label="کردنەوە لە فەیسبووک">${ic('external', 13)}</a>` : ''}
          ${p.in_system
            ? `${sys ? `<button type="button" class="btn xs" data-fbedit="${esc(p.system_post)}">${ic('edit', 12)} دەستکاری</button>` : ''}${sys && sys.auto_message_tag && !p.ad_running ? `<button type="button" class="btn xs primary" data-fbboost="${esc(p.post_id)}">${ic('megaphone', 12)} Boost</button>` : ''}`
            : `<button type="button" class="btn xs ${callBtn && fbAppIssue(p) ? '' : 'primary'}" data-fbpick="${esc(p.post_id)}">${ic('plus', 12)} زیادکردن</button>`}${callBtn}
        </div>
      </div>
    </article>`;
  }
  function fbList() {
    const src = FB.mode === 'search' ? (FB.results || []) : FB.posts;
    const q = normTxt(FB.q.trim());
    return src.filter((p) => {
      if (!!p.hidden !== FB.showHidden) return false;
      if (FB.filter === 'new' && (p.in_system || p.call_running)) return false;
      if (FB.filter === 'in' && !p.in_system) return false;
      if (FB.filter === 'noapp' && !fbAppIssue(p)) return false;
      if (q && !normTxt((p.code || '') + ' ' + toLatin(p.message || '')).includes(q)) return false;
      return true;
    });
  }
  function renderFb() {
    if (!root || !PAGE) return;
    const grid = $('#pe-fbgrid', root), info = $('#pe-fbinfo', root); if (!grid) return;
    const srcAll = FB.mode === 'search' ? (FB.results || []) : FB.posts;
    const src = srcAll.filter((p) => !!p.hidden === FB.showHidden);
    const cnt = { new: src.filter((p) => !p.in_system && !p.call_running).length, all: src.length, in: src.filter((p) => p.in_system).length, noapp: src.filter(fbAppIssue).length, hidden: srcAll.filter((p) => p.hidden).length };
    const hb = $('#pe-fbhid', root); if (hb) hb.setAttribute('aria-pressed', String(FB.showHidden));
    Object.entries(cnt).forEach(([k, n]) => { const el = $(`[data-fbn="${k}"]`, root); if (el) el.textContent = n ? fmtN(n) : ''; });
    $$('#pe-fbfilter button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fbfilter === FB.filter)));
    if (FB.error) info.innerHTML = `<span class="hint bad">${ic('xCircle', 13)}<span>${esc(FB.error)}</span></span><button type="button" class="btn xs" data-fb="refresh">${ic('refresh', 12)} دووبارە</button>`;
    else if (FB.mode === 'search') info.innerHTML = `${ic('search', 14)}<span>ئەنجامی گەڕان بۆ «${esc(FB.q)}»: ${fmtN(src.length)} پۆست</span><button type="button" class="btn xs" data-fb="clear">${ic('x', 12)} گەڕانەوە بۆ لیست</button>`;
    else if (FB.showHidden) info.innerHTML = `${ic('eyeOff', 14)}<span>پۆستە شاردراوەکان (${fmtN(src.length)}) — ${ic('eye', 12)} دابگرە بۆ گەڕاندنەوەیان</span><button type="button" class="btn xs" data-fb="hidden">${ic('x', 12)} گەڕانەوە بۆ لیست</button>`;
    else info.innerHTML = src.length ? `<span>${fmtN(src.length)} پۆستی دوایی پەیج بارکراوە · ${fmtN(cnt.new)} لە سیستەم نییە${cnt.noapp ? ' · <b style="color:var(--warn)">' + fmtN(cnt.noapp) + ' پۆست کارمەندی بێ ئەپ یان ناچالاکی تێدایە</b>' : ''}</span>` : '';
    if (!src.length && FB.loading) { grid.innerHTML = `<div class="fbp-grid">${Array.from({ length: 6 }, () => '<div class="fbp sk"><div class="fbp-img"></div><div class="fbp-b"><span class="sk-l"></span><span class="sk-l s"></span></div></div>').join('')}</div>`; return; }
    const list = fbList();
    const more = FB.mode === 'list' && FB.next ? `<div class="list-more"><button type="button" class="btn" data-fb="more" ${FB.loading ? 'disabled' : ''}>${FB.loading ? '<span class="spin"></span>' : ic('refresh', 15)} پۆستی کۆنتر (30 ی تر)</button></div>` : '';
    if (!list.length) {
      const msg = FB.q.trim() && FB.mode !== 'search' ? `لە پۆستە بارکراوەکاندا نەدۆزرایەوە — <button type="button" class="btn sm" data-fb="search">${ic('search', 14)} گەڕان لە هەموو پەیجەکە</button>`
        : FB.showHidden ? 'هیچ پۆستێکی شاردراوە لەم لیستەدا نییە' : FB.filter === 'new' && src.length ? 'هەموو پۆستە بارکراوەکان لە سیستەمدان ✓' : FB.filter === 'noapp' && src.length ? 'هەموو کارمەندەکانی ئەم پۆستانە ئەپیان هەیە ✓' : 'هیچ پۆستێک نییە';
      grid.innerHTML = `<div class="card empty">${ic('megaphone', 30)}<div>${msg}</div></div>` + more;
      return;
    }
    grid.innerHTML = `<div class="fbp-grid">${list.map(fbCard).join('')}</div>` + more;
  }
  async function loadFb(reset) {
    if (FB.loading) return;
    FB.loading = true; FB.error = ''; if (reset) FB.mode = 'list';
    renderFb();
    try {
      const res = await metaCall({ action: 'posts', limit: 30, after: reset ? undefined : (FB.next || undefined) });
      const got = res.posts || [];
      FB.posts = reset ? got : FB.posts.concat(got.filter((p) => !FB.posts.some((o) => o.post_id === p.post_id)));
      FB.next = res.next || null; FB.loadedAt = Date.now();
    } catch (e) { FB.error = humanError(e); }
    finally { FB.loading = false; renderFb(); }
  }
  async function searchFb() {
    const q = FB.q.trim();
    if (!q) { toast('سەرەتا کۆد یان وشەیەک بنووسە', 'err'); const i = $('#pe-fbq', root); if (i) i.focus(); return; }
    if (FB.loading) return;
    FB.loading = true; FB.error = ''; renderFb();
    const btn = $('[data-fb="search"]', root); busy(btn, true);
    try {
      const res = await metaCall({ action: 'posts', q });
      FB.results = res.posts || []; FB.mode = 'search';
      if (FB.filter !== 'all' && !fbList().length) FB.filter = 'all';
    } catch (e) { FB.error = humanError(e); }
    finally { FB.loading = false; busy($('[data-fb="search"]', root), false); renderFb(); }
  }
  function showStep(step) {
    st.step = step;
    const pick = $('#pe-pick', root), form = $('#pe-formwrap', root);
    if (pick) pick.hidden = step !== 'pick';
    if (form) form.hidden = step !== 'form';
    $$('#pe-steps li', root).forEach((li) => li.classList.toggle('on', li.dataset.step === step));
    const m = $('#main'); if (m) m.scrollTop = 0;
  }
  function paintPicked() {
    const box = $('#pe-picked', root); if (!box) return;
    const p = st.picked;
    if (!p) { box.innerHTML = `<div class="picked manual">${ic('edit', 16)}<span style="flex:1">بێ پۆستی فەیسبووک — کاپشن و لینک دەستی دادەنێیت.</span><button type="button" class="btn sm" data-fb="change">${ic('image', 14)} هەڵبژاردن لە فەیسبووک</button></div>`; return; }
    const lines = fbLines(p);
    box.innerHTML = `<div class="picked">
      ${p.picture ? `<img src="${esc(p.picture)}" alt="" data-zoom="${esc(p.picture)}">` : `<span class="fb-noimg">${ic('image', 20)}</span>`}
      <div class="picked-b">
        <div class="p-top">${p.code ? `<span class="code">Code:${esc(p.code)}</span>` : '<span class="chip warn">بێ کۆد</span>'}<span class="muted" style="font-size:12px">${esc(ago(p.created_time, true))}</span></div>
        <div class="fbp-t">${esc(lines[0] || '(بێ دەق)')}</div>
        <div class="fbp-r">${fbRealtorChips(p)}</div>
      </div>
      <div class="picked-acts">${p.permalink_url ? `<a class="btn sm" href="${esc(safeUrl(p.permalink_url))}" target="_blank" rel="noopener">${ic('external', 14)} فەیسبووک</a>` : ''}<button type="button" class="btn sm" data-fb="change">${ic('swap', 14)} گۆڕینی پۆست</button></div>
    </div>`;
  }
  function pickFbPost(p) {
    if (!p || !st) return;
    if (p.in_system && !confirm('ئەم پۆستە پێشتر لە سیستەمدا هەیە. دەتەوێت دووبارە زیادی بکەیت؟')) return;
    const f = st.f;
    f.caption = p.message || ''; setVal('pe-caption', f.caption);
    f.url = p.permalink_url || ''; setVal('pe-url', f.url);
    f.postId = p.post_id || ''; setVal('pe-pid', f.postId); st.auto.postId = false; st.pickedPostId = p.post_id; st.picked = p;
    st.auto.head = true; st.auto.realtor = true; st.auto.tag = true; st.auto.reply = true; st.auto.code = true; st.dirty = true;
    onCaption(); dIds();
    if (PAGE) { showStep('form'); paintPicked(); setTimeout(() => { const k = $('#pe-ku', root); if (k) k.focus({ preventScroll: true }); }, 60); }
    toast('هەموو شتێک پڕکرایەوە — بپشکنە و پاشەکەوتی بکە');
  }
  function changePost() {
    const go = () => { const c = root && root.parentElement; if (c) mount(c, { step: 'pick' }); };
    if (st && st.dirty) modal({ title: 'پۆستێکی تر هەڵدەبژێریت؟', body: 'ئەوەی لەم فۆرمەدا نووسیوتە پاشەکەوت نەکراوە و دەسڕدرێتەوە.', confirmText: 'بەڵێ، پۆستێکی تر', danger: true, onConfirm: go });
    else go();
  }
  async function openExisting(fid) {
    try {
      const rows = await get('posts?select=*&facebook_post_id=eq.' + encodeURIComponent(fid));
      if (rows && rows[0]) Editor.open(rows[0]); else toast('پۆستەکە نەدۆزرایەوە', 'err');
    } catch (e) { toastErr(e); }
  }
  function boostExisting(p) {
    const row = p && p.system_post ? S.postById.get(p.system_post) : null;
    if (!row) { toast('پۆستەکە لە سیستەم نەدۆزرایەوە', 'err'); return; }
    boostDialog(row, { pagePostId: p.post_id }).then((r) => { if (r) { p.ad_running = true; p.ads = (p.ads || 0) + 1; renderFb(); } }).catch(toastErr);
  }

  function callExisting(p) {
    if (!p) return;
    const who = fbRealtors(p)[0];
    if (!who) { toast('ژمارەی کارمەند لە کاپشندا نییە', 'err'); return; }
    callBoostDialog(p, who).then((r) => { if (r) { p.call_running = true; renderFb(); } }).catch(toastErr);
  }
  async function hideFb(p, hide, btn) {
    if (!p) return;
    busy(btn, true);
    try {
      await rpc('manager_hide_fb_post', { p_page_post_id: p.post_id, p_hide: hide });
      p.hidden = hide;
      [FB.posts, FB.results || []].forEach((arr) => arr.forEach((x) => { if (x.post_id === p.post_id) x.hidden = hide; }));
      toast(hide ? 'شاردرایەوە — لە «شاردراوەکان» دەیبینیتەوە' : 'گەڕایەوە بۆ لیست');
      renderFb();
    } catch (e) { toastErr(e); busy(btn, false); }
  }

  function boostSheet(d) {
    const perDay = d.spend && d.days ? Number(d.spend) / Number(d.days) : null;
    modal({
      title: 'پۆستی Code:' + d.code + ' زیادکرا — ئێستا Boost بکە', wide: true,
      html: `<ol style="margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:10px;line-height:1.8">
        <li>پۆستەکە لە فەیسبووک بکەرەوە و <b>Boost post</b> دابگرە. ${d.url ? `<a class="btn xs" href="${esc(safeUrl(d.url))}" target="_blank" rel="noopener">${ic('external', 13)} کردنەوەی پۆست</a>` : ''}</li>
        <li><b>Special Ad Category</b> ← Housing.</li>
        <li><b>Pre-filled message</b>:
          <div style="display:flex;gap:6px;align-items:center;margin-top:6px"><input class="input" id="bs-tag" readonly value="${esc(d.tag)}"><button type="button" class="btn primary" id="bs-copy">${ic('copy', 15)} کۆپی</button></div></li>
        <li><b>Audience</b> ← Iraq لابە، Irbil + Baghdad زیاد بکە.</li>
        <li><b>Budget</b> ← ${perDay ? `$${+perDay.toFixed(2)} لە ڕۆژێکدا × ${esc(d.days)} ڕۆژ` : 'بڕ و ماوە'} ← Publish.</li>
        <li class="muted">پێویست ناکات ئایدی ڕیکلام کۆپی بکەیت — دوای یەکەم کڕیار خۆکارانە تۆمار دەکرێت.</li>
      </ol>`,
      onOpen: (m) => {
        $('#bs-copy', m.root).addEventListener('click', () => copyText(d.tag, 'نامەی ئامادە کۆپی کرا'));
        $('#bs-tag', m.root).addEventListener('focus', (e) => e.target.select());
      },
    });
  }

  function newState(row) {
    return {
      mode: row ? 'edit' : 'new', orig: row || null, f: row ? fromRow(row) : blank(),
      auto: { code: !row, tag: !row, reply: !row, postId: false, head: !row, realtor: !row },
      chk: { code: { s: 'wait', m: '' }, tag: { s: 'wait', m: '' }, ids: { s: 'wait', m: '' } },
      seq: { code: 0, tag: 0, ids: 0 }, dirty: false, saving: false, combos: {}, step: 'form', picked: null,
    };
  }
  function open(row) {
    if (!PAGE && !row) { location.hash = '#/new'; return; }   // new posts have their own page now
    if (root) close();
    prevFocus = document.activeElement;
    st = newState(row);
    root = document.createElement('div');
    root.innerHTML = drawerHtml();
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    bind(); paintAll();
    checkCode(); checkTag(); checkIds();
    setTimeout(() => { const el = $(row ? '#pe-ku' : '#pe-caption', root); if (el) el.focus(); }, 60);
  }
  /* New Post page: render into the page container */
  function mount(container, opts = {}) {
    st = newState(null); st.step = opts.step || 'pick';
    container.innerHTML = '';
    root = document.createElement('div');
    container.appendChild(root);
    root.innerHTML = pageHtml();
    bind(); paintAll();
    checkCode(); checkTag(); checkIds();
    setVal('pe-fbq', FB.q);
    showStep(st.step);
    renderFb();
    if (!FB.posts.length || Date.now() - FB.loadedAt > 180000) loadFb(true);
  }
  function detach() { root = null; st = null; }
  function close() {
    if (!root) return;
    root.remove(); root = null; st = null;
    document.body.style.overflow = '';
    if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
  }
  function requestClose() {
    if (!st) return;
    if (!st.dirty) { close(); return; }
    modal({ title: 'گۆڕانکارییەکان پاشەکەوت نەکراون', body: 'ئەگەر ئێستا دایبخەیت، ئەوەی نووسیوتە دەفەوتێت.', confirmText: 'داخستن بێ پاشەکەوتکردن', cancelText: 'بەردەوامبوون', danger: true, onConfirm: () => { close(); } });
  }
  return { open, close, requestClose, isOpen: () => !!root && !PAGE, mount, detach, isDirty: () => !!(st && st.dirty) };
}
const Editor = createEditor('drawer');   // edit an existing post (drawer)
const NewPost = createEditor('page');    // the New Post page (#/new)
