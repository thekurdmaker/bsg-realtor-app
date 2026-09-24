
/* ============================ realtors ============================ */
const RS = { q: '', branch: '', onlyPending: false, noApp: false, showInactive: false, sortKey: 'pending', sortDir: -1, rows: [], loading: false, loadedKey: '' };
const RCOLS = [
  ['name', 'کارمەند', ''], ['app', 'ئەپ', 'c'], ['total', 'هەموو', 'c'], ['pending', 'چاوەڕێ', 'c'], ['taken', 'وەرگیراو', 'c'],
  ['taken_opened', 'کراوەتەوە', 'c'], ['taken_unopened', 'نەکراوەتەوە', 'c'], ['escalated', 'تەسلیمکراو', 'c'], ['open_rate', 'ڕێژەی کردنەوە', 'c'],
];
async function loadRealtorStats() {
  RS.loading = true; renderRealtors();
  loadAppStatus().then(renderRealtors).catch(() => {});
  try {
    const [a, b] = rangeDates();
    const rows = await rpc('get_realtor_stats', { p_start_date: a, p_end_date: b });
    RS.rows = (rows || []).map((x) => {
      const r = S.realtorById.get(x.realtor_id) || {};
      const o = { id: x.realtor_id, name: x.realtor_name || r.name || '—', branch: x.branch || r.branch || '', wa: x.whatsapp_number || r.whatsapp_number || '', active: r.active !== false };
      ['total', 'taken', 'pending', 'escalated', 'taken_opened', 'taken_unopened'].forEach((k) => { o[k] = Number(x[k]) || 0; });
      o.open_rate = o.taken ? o.taken_opened / o.taken : null;
      return o;
    });
    RS.loadedKey = rangeDates().join('|');
  } catch (e) { toastErr(e); }
  finally { RS.loading = false; renderRealtors(); }
}
function mountRealtors(root) {
  const branches = [...new Set(S.realtors.map((r) => r.branch).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  root.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div><h1 class="page-title">کارمەندەکان</h1><div class="page-sub">ئەنجامی هەر کارمەندێک بۆ ماوەی هەڵبژێردراو — کلیک لە سەرناوی ستوونەکان بکە بۆ ڕیزکردن</div></div>
      <div class="toolbar"><div id="r-range"></div><button type="button" class="btn primary" id="r-new">${ic('plus')} کارمەندی نوێ</button></div>
    </div>
    <div class="toolbar">
      <div class="search">${ic('search')}<input class="input" id="r-q" type="search" placeholder="گەڕان بە ناو، لق یان ژمارە…" aria-label="گەڕانی کارمەند"></div>
      <label class="sr" for="r-branch">لق</label>
      <select class="select" id="r-branch" style="width:auto;height:36px"><option value="">هەموو لقەکان</option>${branches.map((b) => `<option ${RS.branch === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
      <button type="button" class="mini" id="r-pending" aria-pressed="${RS.onlyPending}">تەنها ئەوانەی نامەی چاوەڕێیان هەیە</button>
      <button type="button" class="mini" id="r-noapp" aria-pressed="${RS.noApp}">ئەپیان نییە <b id="r-noapp-n"></b></button>
      <button type="button" class="mini" id="r-inactive" aria-pressed="${RS.showInactive}">ناچالاکەکانیش پیشان بدە</button>
      <span class="muted" id="r-summary"></span>
    </div>
    <div class="table-wrap"><table class="t" id="r-table"></table></div>
  </div>`;
  bindRange($('#r-range'), loadRealtorStats);
  $('#r-new').addEventListener('click', () => realtorDialog(null));
  const q = $('#r-q'); q.value = RS.q;
  q.addEventListener('input', debounce(() => { RS.q = q.value; renderRealtors(); }, 200));
  $('#r-branch').addEventListener('change', (e) => { RS.branch = e.target.value; renderRealtors(); });
  $('#r-pending').addEventListener('click', (e) => { RS.onlyPending = !RS.onlyPending; e.currentTarget.setAttribute('aria-pressed', String(RS.onlyPending)); renderRealtors(); });
  $('#r-noapp').addEventListener('click', (e) => { RS.noApp = !RS.noApp; e.currentTarget.setAttribute('aria-pressed', String(RS.noApp)); renderRealtors(); });
  $('#r-inactive').addEventListener('click', (e) => { RS.showInactive = !RS.showInactive; e.currentTarget.setAttribute('aria-pressed', String(RS.showInactive)); renderRealtors(); });
  $('#r-table').addEventListener('click', onRealtorsClick);
  renderRealtors();
  loadRealtorStats();
}
function renderRealtors() {
  const t = $('#r-table'); if (!t) return;
  const nq = normTxt(RS.q), dq = digits(RS.q).replace(/^0+/, '');
  RS.rows.forEach((r) => { const a = appInfo(r.id); r.app = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0; r.active = (S.realtorById.get(r.id) || r).active !== false; });
  const nn = $('#r-noapp-n'); if (nn) nn.textContent = S.appStatus.size ? fmtN(RS.rows.filter((r) => !r.app).length) : '';
  let rows = RS.rows.filter((r) => (RS.showInactive || RS.noApp || r.active) && (!RS.branch || r.branch === RS.branch) && (!RS.onlyPending || r.pending > 0) && (!RS.noApp || !r.app)
    && (!nq || normTxt(r.name + ' ' + r.branch).includes(nq) || (dq.length >= 3 && digits(r.wa).includes(dq))));
  const k = RS.sortKey, d = RS.sortDir;
  rows = rows.slice().sort((a, b) => {
    if (k === 'name') return d * a.name.localeCompare(b.name);
    if (k === 'app') return a.app === b.app ? a.name.localeCompare(b.name) : d * (a.app - b.app);
    const av = a[k] == null ? -1 : a[k], bv = b[k] == null ? -1 : b[k];
    return av === bv ? a.name.localeCompare(b.name) : d * (av - bv);
  });
  const withPending = rows.filter((r) => r.pending > 0);
  const sum = $('#r-summary');
  if (sum) sum.textContent = RS.rows.length ? `${fmtN(rows.length)} کارمەند · ${fmtN(withPending.length)} کەس ${fmtN(withPending.reduce((a, r) => a + r.pending, 0))} نامەی چاوەڕێیان هەیە` : '';
  const head = `<thead><tr>${RCOLS.map(([key, label, cls]) => `<th class="sortable ${cls}" data-sort="${key}" aria-sort="${RS.sortKey === key ? (RS.sortDir < 0 ? 'descending' : 'ascending') : 'none'}">${esc(label)} <span class="arr">${RS.sortKey === key ? (RS.sortDir < 0 ? '↓' : '↑') : ''}</span></th>`).join('')}<th class="c">چالاک</th><th><span class="sr">کارەکان</span></th></tr></thead>`;
  if (!rows.length) {
    t.innerHTML = head + `<tbody><tr><td colspan="${RCOLS.length + 2}"><div class="empty">${RS.loading ? '<span class="spin"></span> بارکردن…' : ic('users', 32) + '<div>هیچ کارمەندێک بەم فلتەرە نییە</div>'}</div></td></tr></tbody>`;
    return;
  }
  t.innerHTML = head + '<tbody>' + rows.map((r) => {
    const rate = r.open_rate == null ? null : Math.round(r.open_rate * 100);
    return `<tr class="${r.active ? '' : 'inactive'}" data-id="${esc(r.id)}">
      <td class="who"><b>${esc(r.name)}</b><small>${esc(r.branch || '—')}${r.wa ? ' · <span class="mono">' + esc(r.wa) + '</span>' : ''}</small></td>
      <td class="c">${!S.appStatus.size ? '<span class="muted">…</span>' : r.app ? `<span class="chip ok" title="دوایین چوونەژوورەوە: ${esc(fmtDT(appInfo(r.id).last_sign_in_at))}">${ic('check', 12)} ${esc(fmtD(appInfo(r.id).last_sign_in_at))}</span>` : '<span class="chip warn">نییە</span>'}</td>
      <td class="c">${fmtN(r.total)}</td>
      <td class="c ${r.pending ? 'hot' : ''}">${fmtN(r.pending)}</td>
      <td class="c">${fmtN(r.taken)}</td>
      <td class="c">${fmtN(r.taken_opened)}</td>
      <td class="c">${fmtN(r.taken_unopened)}</td>
      <td class="c ${r.escalated ? 'bad' : ''}">${fmtN(r.escalated)}</td>
      <td class="c">${rate == null ? '<span class="muted">—</span>' : `<span class="bar" aria-hidden="true"><i style="width:${rate}%"></i></span> <span class="num">${rate}%</span>`}</td>
      <td class="c"><button type="button" class="switch" role="switch" aria-checked="${r.active}" data-toggle="${esc(r.id)}" aria-label="چالاکبوونی ${esc(r.name)}" title="${r.active ? 'چالاکە' : 'ناچالاکە'}"></button></td>
      <td><div class="row-actions">
        <button type="button" class="btn xs" data-edit="${esc(r.id)}">${ic('edit', 13)} دەستکاری</button>
        <button type="button" class="btn xs ${r.app ? '' : 'primary'}" data-onboard="${esc(r.id)}" ${r.wa && appInfo(r.id).has_login ? '' : 'disabled title="ئیمەیڵ/وشەی نهێنی یان ژمارەی واتسئاپ نییە"'}>${ic('send', 13, 'flip')} ڕێنمایی ئەپ</button>
        <button type="button" class="btn xs" data-notify="${esc(r.id)}" ${r.wa ? '' : 'disabled title="ژمارەی واتسئاپی نییە"'}>${ic('bell', 13)} ئاگادارکردنەوە</button>
        <button type="button" class="btn xs ghost" data-leads="${esc(r.id)}">${ic('inbox', 13)} نامەکان</button>
      </div></td>
    </tr>`;
  }).join('') + '</tbody>';
}
function onRealtorsClick(e) {
  const th = e.target.closest('[data-sort]');
  if (th) { const k = th.dataset.sort; if (RS.sortKey === k) RS.sortDir *= -1; else { RS.sortKey = k; RS.sortDir = k === 'name' ? 1 : -1; } renderRealtors(); return; }
  const tg = e.target.closest('[data-toggle]'); if (tg) { toggleRealtor(tg.dataset.toggle, tg); return; }
  const ed = e.target.closest('[data-edit]'); if (ed) { realtorDialog(S.realtorById.get(ed.dataset.edit) || null); return; }
  const ob = e.target.closest('[data-onboard]'); if (ob && !ob.disabled) { onboardRealtor(ob.dataset.onboard, { onDone: renderRealtors }); return; }
  const nt = e.target.closest('[data-notify]'); if (nt && !nt.disabled) { const r = RS.rows.find((x) => x.id === nt.dataset.notify); if (r) notifyDialog(r); return; }
  const ld = e.target.closest('[data-leads]');
  if (ld) { Object.assign(L, { realtorId: ld.dataset.leads, postId: null, filter: 'all', q: '', items: [], loadedAt: 0, selId: null, sel: null }); location.hash = '#/leads'; }
}
function notifyDialog(r) {
  const bot = botReady();
  const tpl = (S.settings && S.settings.tpl_manual_notify) || 'سەلام علیک باشی کاک {name} تکایە وتم با ئاگادارت بکەمەوە کە {pending} نامەی نوێت بۆ هاتووە هێشتا وەڵامیان نەداوەتەوە';
  const text = r.pending > 0 ? tplFill(tpl, { name: r.name, pending: r.pending }) : `سەلام علیک باشی کاک ${r.name} `;
  modal({
    title: 'ئاگادارکردنەوەی ' + r.name,
    html: `<div class="field"><label class="label" for="nt-text">نامە</label><textarea class="textarea" id="nt-text" rows="5">${esc(text)}</textarea></div>
      <div class="hint">${ic(bot ? 'bot' : 'chat', 13)}<span>${bot ? 'ڕاستەوخۆ لە ڕێگەی بۆتی واتسئاپی کارمەندانەوە دەنێردرێت.' : 'واتسئاپ دەکرێتەوە و نامەکە ئامادە دەبێت — تەنها «ناردن» دابگرە.'}</span></div>`,
    confirmText: bot ? 'ناردن بە بۆت' : 'کردنەوە لە واتسئاپ',
    onConfirm: async (m) => {
      const body = $('#nt-text', m.root).value.trim();
      if (!body) { m.error('نامەکە بەتاڵە.'); return false; }
      if (!bot) { window.open(waLink(r.wa, body), '_blank', 'noopener'); return true; }
      const res = await rpc('manager_notify_realtor', { p_realtor_id: r.id, p_body: body });
      if (res && res.ok === false) throw new ApiError(res.reason || 'ناردن سەرکەوتوو نەبوو');
      toast(res && res.duplicate ? 'ئەم نامەیە پێشتر نێردراوە' : 'نامەکە بۆ ' + r.name + ' نێردرا');
      return true;
    },
  });
}
function toggleRealtor(id, btn) {
  const r = RS.rows.find((x) => x.id === id); if (!r) return;
  const next = !r.active;
  const run = async () => {
    btn.disabled = true;
    try {
      await rpc('manager_toggle_realtor', { p_realtor_id: id, p_active: next });
      r.active = next; const rr = S.realtorById.get(id); if (rr) rr.active = next;
      S.reassign = null;
      toast(r.name + (next ? ' چالاک کرایەوە' : ' ناچالاک کرا'));
      renderRealtors();
    } catch (e) { toastErr(e); btn.disabled = false; }
  };
  if (next) { run(); return; }
  modal({
    title: 'ناچالاککردنی ' + r.name + '؟',
    body: 'لە دابەشکردنی نامەکانی گرووپ و گواستنەوەی نامەکان دەردەهێنرێت. هەر کاتێک بتەوێت دەتوانیت چالاکی بکەیتەوە.',
    confirmText: 'ناچالاککردن', danger: true,
    onConfirm: async () => { await run(); },
  });
}

/* ==================== add / edit a realtor ==================== */
async function realtorCall(body) {
  const res = (await api('/functions/v1/manager-realtors', { method: 'POST', body })).data;
  if (!res || res.ok !== true) throw new ApiError((res && res.reason) || 'ئەم کارە سەرکەوتوو نەبوو');
  return res;
}
const PW_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function genPassword(n = 8) {
  const b = new Uint8Array(n); window.crypto.getRandomValues(b);
  return Array.from(b, (x) => PW_ABC[x % PW_ABC.length]).join('');
}
const MAIL_DOMAINS = ['baghyshaqlawa.net', 'bsgrealestate.com', 'bsg.com'];
function splitEmail(e) {
  const s = String(e || '').trim(); const i = s.lastIndexOf('@');
  return i < 0 ? { user: s, domain: MAIL_DOMAINS[0] } : { user: s.slice(0, i), domain: s.slice(i + 1) };
}
let BRANCH_NAMES = null;
async function branchNames() {
  if (!BRANCH_NAMES) {
    try { BRANCH_NAMES = ((await get('branches?select=name&order=name.asc&limit=500')) || []).map((x) => x.name).filter(Boolean); }
    catch (e) { BRANCH_NAMES = []; }
  }
  return [...new Set(BRANCH_NAMES.concat(S.realtors.map((r) => r.branch).filter(Boolean)))].sort((a, b) => a.localeCompare(b));
}
const waDisplay = (p) => { const d = digits(p); return d.startsWith('964') ? '0' + d.slice(3) : d; };

function realtorDialog(r) {
  const isNew = !r;
  const em = splitEmail(isNew ? '' : (appInfo(r.id).email || ''));
  const doms = [...new Set(MAIL_DOMAINS.concat(em.domain ? [em.domain] : []))];
  const inst = modal({
    title: isNew ? 'کارمەندی نوێ' : 'دەستکاری ' + r.name,
    wide: true,
    html: `
      <div class="f2">
        <div class="field"><label class="label" for="rd-name"><span>ناو <span class="req">*</span></span></label>
          <input class="input" id="rd-name" value="${esc(isNew ? '' : r.name)}" placeholder="ناوی تەواو" autocomplete="off"></div>
        <div class="field"><label class="label" for="rd-phone"><span>ژمارەی واتسئاپ <span class="req">*</span></span></label>
          <input class="input mono" id="rd-phone" dir="ltr" inputmode="tel" value="${esc(isNew ? '' : waDisplay(r.whatsapp_number))}" placeholder="07501234567" autocomplete="off"></div>
      </div>
      <div class="hint" id="rd-phone-note" hidden></div>
      <div class="field"><label class="label" for="rd-branch">لق</label>
        <select class="select" id="rd-branch"><option value="">— بێ لق —</option></select></div>
      <div class="field" id="rd-branch-new-box" hidden><label class="label" for="rd-branch-new">ناوی لقی نوێ</label>
        <input class="input" id="rd-branch-new" placeholder="بۆ نموونە: ئاسکۆ" autocomplete="off"></div>
      <div class="field"><label class="label" for="rd-mail-user"><span>ئیمەیڵی چوونەژوورەوە ${isNew ? '<span class="req">*</span>' : ''}</span>${isNew ? '' : '<span class="aux">گۆڕینی ئیمەیڵ چوونەژوورەوەی کۆن ناکارا دەکات</span>'}</label>
        <div class="mail-row">
          <input class="input mono" id="rd-mail-user" dir="ltr" value="${esc(em.user)}" placeholder="name.family" autocomplete="off">
          <span class="at">@</span>
          <select class="select" id="rd-mail-dom" dir="ltr">${doms.map((d) => `<option ${d === em.domain ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        </div></div>
      ${isNew ? `<div class="field"><label class="label" for="rd-pw"><span>وشەی نهێنی</span><span class="aux">خۆکارانە دروست کراوە</span></label>
          <div class="mail-row"><input class="input mono" id="rd-pw" dir="ltr" value="${esc(genPassword())}" autocomplete="off">
            <button type="button" class="btn" id="rd-pw-new" title="وشەیەکی نوێ">${ic('refresh', 14)}</button></div></div>` : ''}
      <label class="p-line" style="gap:8px;cursor:pointer"><input type="checkbox" id="rd-active" ${isNew || r.active !== false ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px"> <span>چالاکە — نامەی نوێی بۆ دەنێردرێت</span></label>
      ${isNew
    ? `<div class="hint">${ic('send', 13)}<span>دوای زیادکردن، ڕێنمایی ئەپ و وشەی نهێنی ئامادە دەکرێت بۆ ناردن بە واتسئاپ.</span></div>`
    : `<div class="hint">${ic('lock', 13)}<span>وشەی نهێنی لێرەوە نابینرێت. بۆ گۆڕینی، دوگمەی «وشەی نهێنی نوێ» لە خوارەوە.</span></div>`}`,
    confirmText: isNew ? 'زیادکردن' : 'پاشەکەوتکردن',
    onOpen: async (m) => {
      const sel = $('#rd-branch', m.root), box = $('#rd-branch-new-box', m.root), nb = $('#rd-branch-new', m.root);
      const cur = isNew ? '' : (r.branch || '');
      sel.innerHTML = '<option value="">— بێ لق —</option>'
        + (await branchNames()).map((b) => `<option ${b === cur ? 'selected' : ''}>${esc(b)}</option>`).join('')
        + '<option value="__new">+ لقی نوێ…</option>';
      sel.value = cur;
      sel.addEventListener('change', () => { box.hidden = sel.value !== '__new'; if (!box.hidden) nb.focus(); });
      const pwb = $('#rd-pw-new', m.root);
      if (pwb) pwb.addEventListener('click', () => { $('#rd-pw', m.root).value = genPassword(); });
      const ph = $('#rd-phone', m.root), note = $('#rd-phone-note', m.root);
      ph.addEventListener('blur', async () => {
        const v = ph.value.trim();
        if (!v || (!isNew && digits(v) === digits(r.whatsapp_number))) { note.hidden = true; return; }
        try {
          const res = (await api('/functions/v1/manager-realtors', { method: 'POST', body: { action: 'check', phone: v, realtor_id: isNew ? null : r.id } })).data;
          if (!res || res.ok !== true) { note.hidden = true; return; }
          if (!res.phone_valid) { note.className = 'hint bad'; note.innerHTML = ic('alert', 13) + '<span>ژمارەکە دروست نییە — بۆ نموونە 07501234567</span>'; }
          else if (res.phone_owner) { note.className = 'hint bad'; note.innerHTML = ic('alert', 13) + `<span>ئەم ژمارەیە بۆ «${esc(res.phone_owner)}» تۆمار کراوە</span>`; }
          else { note.className = 'hint ok'; note.innerHTML = ic('check', 13) + `<span class="mono">${esc(res.phone_normal)}</span>`; }
          note.hidden = false;
        } catch (e) { note.hidden = true; }
      });
      setTimeout(() => $('#rd-name', m.root).focus(), 30);
    },
    onConfirm: async (m) => {
      const name = $('#rd-name', m.root).value.trim();
      const phone = $('#rd-phone', m.root).value.trim();
      const bsel = $('#rd-branch', m.root).value;
      const branch = bsel === '__new' ? $('#rd-branch-new', m.root).value.trim() : bsel;
      const mu = $('#rd-mail-user', m.root).value.trim();
      const email = mu ? mu + '@' + $('#rd-mail-dom', m.root).value : '';
      const active = $('#rd-active', m.root).checked;
      if (name.length < 3) { m.error('ناوی کارمەند پێویستە.'); return false; }
      if (!phone) { m.error('ژمارەی واتسئاپ پێویستە.'); return false; }
      if (bsel === '__new' && !branch) { m.error('ناوی لقی نوێ بنووسە.'); return false; }
      if (isNew && !email) { m.error('ئیمەیڵی چوونەژوورەوە پێویستە.'); return false; }

      if (isNew) {
        const res = await realtorCall({ action: 'create', name, phone, branch, email, password: $('#rd-pw', m.root).value.trim(), active });
        await loadRealtors();
        await loadAppStatus().catch(() => {});
        S.reassign = null; BRANCH_NAMES = null;
        toast(name + ' زیاد کرا');
        loadRealtorStats();
        setTimeout(() => onboardRealtor(res.realtor.id, { onDone: renderRealtors }), 250);
        return true;
      }
      const body = { action: 'update', realtor_id: r.id, name, phone, branch, active };
      const oldMail = String(appInfo(r.id).email || '').toLowerCase();
      if (email && email.toLowerCase() !== oldMail) body.email = email;
      const res = await realtorCall(body);
      await loadRealtors();
      await loadAppStatus().catch(() => {});
      S.reassign = null; BRANCH_NAMES = null;
      const rr = RS.rows.find((x) => x.id === r.id);
      if (rr && res.realtor) { rr.name = res.realtor.name; rr.branch = res.realtor.branch || ''; rr.wa = res.realtor.whatsapp_number || ''; rr.active = res.realtor.active !== false; }
      renderRealtors();
      toast((res.changed && res.changed.length) ? 'گۆڕدرا: ' + res.changed.join('، ') : 'هیچ نەگۆڕا');
      return true;
    },
  });
  if (!isNew) addResetPwButton(inst, r);
}
// a small extra button in the modal footer, only when editing
function addResetPwButton(inst, r) {
  const foot = $('.m-foot', inst.root); if (!foot) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn'; b.style.marginInlineEnd = 'auto';
  b.innerHTML = ic('lock', 14) + ' وشەی نهێنی نوێ';
  b.addEventListener('click', () => { inst.close(); resetPwDialog(r); });
  foot.appendChild(b);
}
function resetPwDialog(r) {
  const pw = genPassword();
  modal({
    title: 'وشەی نهێنی نوێ بۆ ' + r.name,
    html: `<div class="field"><label class="label" for="rp-pw"><span>وشەی نهێنی نوێ</span><span class="aux">دەتوانیت بیگۆڕیت</span></label>
        <div class="mail-row"><input class="input mono" id="rp-pw" dir="ltr" value="${esc(pw)}" autocomplete="off">
          <button type="button" class="btn" id="rp-new" title="وشەیەکی نوێ">${ic('refresh', 14)}</button></div></div>
      <div class="hint warn">${ic('alert', 13)}<span>وشەی نهێنی کۆنی ${esc(r.name)} ڕادەوەستێت. دوای پاشەکەوتکردن، ڕێنمایی نوێی بۆ بنێرە.</span></div>`,
    confirmText: 'گۆڕین',
    onOpen: (m) => { $('#rp-new', m.root).addEventListener('click', () => { $('#rp-pw', m.root).value = genPassword(); }); },
    onConfirm: async (m) => {
      const v = $('#rp-pw', m.root).value.trim();
      if (v.length < 6) { m.error('وشەی نهێنی دەبێت لانیکەم 6 پیت بێت.'); return false; }
      await realtorCall({ action: 'reset_password', realtor_id: r.id, password: v });
      toast('وشەی نهێنی گۆڕدرا');
      setTimeout(() => onboardRealtor(r.id, { onDone: renderRealtors }), 250);
      return true;
    },
  });
}

/* ============================ groups ============================ */
const G = { q: '', kind: 'all', selId: null, members: null, combo: null };
function mountGroups(root) {
  root.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div><h1 class="page-title">گرووپەکان</h1><div class="page-sub">گرووپی لق خۆکارانە لە لقی کارمەندەکانەوە دروست دەبێت · گرووپی تایبەت بۆ پرۆژە و پۆستی هاوبەشە</div></div>
      <div class="toolbar"><button type="button" class="btn primary" id="g-new">${ic('plus')} گرووپی نوێ</button></div>
    </div>
    <div class="split" id="g-split">
      <div class="card g-list">
        <div class="g-list-head">
          <div class="search" style="max-width:none">${ic('search')}<input class="input" id="g-q" type="search" placeholder="گەڕانی گرووپ…" aria-label="گەڕانی گرووپ"></div>
          <div class="seg" id="g-kind" role="group" aria-label="جۆری گرووپ">${[['all', 'هەموو'], ['custom', 'تایبەت'], ['branch', 'لق']].map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${G.kind === k}">${l}</button>`).join('')}</div>
        </div>
        <div class="g-items" id="g-items"></div>
      </div>
      <div class="card" id="g-detail"></div>
    </div>
  </div>`;
  $('#g-new').addEventListener('click', () => newGroupDialog((gid) => { renderGroupList(); openGroup(gid); }));
  const q = $('#g-q'); q.value = G.q;
  q.addEventListener('input', debounce(() => { G.q = q.value; renderGroupList(); }, 150));
  $('#g-kind').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; G.kind = b.dataset.kind; $$('#g-kind button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderGroupList(); });
  $('#g-items').addEventListener('click', (e) => { const b = e.target.closest('[data-gid]'); if (b) openGroup(b.dataset.gid); });
  $('#g-detail').addEventListener('click', onGroupDetailClick);
  renderGroupList();
  if (G.selId && S.groupById.get(G.selId)) openGroup(G.selId); else renderGroupDetail();
  loadGroups().then(renderGroupList).catch(() => {});
}
function renderGroupList() {
  const box = $('#g-items'); if (!box) return;
  const nq = normTxt(G.q);
  const rows = S.groups.filter((g) => (G.kind === 'all' || g.kind === G.kind || (G.kind === 'custom' && g.kind !== 'branch')) && (!nq || normTxt(g.name).includes(nq)));
  box.innerHTML = rows.length ? rows.map((g) => `<button type="button" class="g-item" data-gid="${esc(g.id)}" aria-current="${g.id === G.selId}">
      <span class="gn">${esc(g.name)}</span>
      <span class="gm">${g.kind === 'branch' ? '' : '<span class="chip accent" style="height:18px">تایبەت</span> '}${fmtN(g.members)} ئەندام</span>
    </button>`).join('') : `<div class="empty">${ic('layers', 30)}<div>هیچ گرووپێک نییە</div></div>`;
}
async function openGroup(id) {
  G.selId = id; G.members = null;
  $$('#g-items .g-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.gid === id)));
  renderGroupDetail();
  try {
    const rows = await rpc('get_group_members', { p_group_id: id });
    if (G.selId !== id) return;
    G.members = (rows || []).sort((a, b) => String(a.realtor_name).localeCompare(String(b.realtor_name)));
  } catch (e) { G.members = []; toastErr(e); }
  renderGroupDetail();
}
function groupPostCard(p) {
  const img = postImg(p);
  const owner = p.realtor_id ? ((S.realtorById.get(p.realtor_id) || {}).name || 'کارمەند') : 'هاوبەش — بۆ هەموو ئەندامان';
  return `<button type="button" class="gp ${p.active === false ? 'inactive' : ''}" data-gpost="${esc(p.facebook_post_id)}" title="کردنەوە لە پەڕەی پۆستەکان">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="gp-noimg">${ic('image', 18)}</span>`}
    <span class="gp-b">
      <span class="gp-top"><span class="code">Code:${esc(p.post_code || '—')}</span>${p.active === false ? '<span class="tag">ناچالاک</span>' : ''}${p.realtor_id ? '' : '<span class="chip accent">هاوبەش</span>'}</span>
      <span class="gp-t">${esc(cleanSpaces(p.headline) || 'بێ ناونیشان')}</span>
      <span class="gp-m">${ic(p.realtor_id ? 'user' : 'layers', 12)} ${esc(owner)} · ${esc(fmtD(p.created_at))}</span>
    </span>
  </button>`;
}
function renderGroupDetail() {
  const box = $('#g-detail'); if (!box) return;
  const g = S.groupById.get(G.selId);
  if (!g) { box.innerHTML = `<div class="empty" style="padding:60px 20px">${ic('layers', 40)}<div>گرووپێک هەڵبژێرە بۆ بینین و گۆڕینی ئەندامەکانی</div></div>`; return; }
  const posts = S.posts.filter((p) => p.group_id === g.id);
  const shared = posts.filter((p) => !p.realtor_id);
  const members = G.members;
  box.innerHTML = `<div class="g-detail">
    <div class="g-title">
      <h2>${esc(g.name)}</h2>
      <span class="chip ${g.kind === 'branch' ? '' : 'accent'}">${groupKindLabel(g.kind)}</span>
      <span class="muted">${fmtN(members ? members.length : g.members)} ئەندام</span>
      <span style="flex:1"></span>
      ${g.kind !== 'branch' ? `<button type="button" class="btn sm danger" data-g="delete">${ic('trash', 14)} سڕینەوەی گرووپ</button>` : ''}
    </div>
    ${g.kind === 'branch' ? `<div class="hint">${ic('alert', 13)}<span>ئەندامانی گرووپی لق خۆکارانە ڕێکدەخرێن کاتێک کارمەندێک دەچێتە ئەم لقەوە. دەتوانیت کەسی زیاتریش زیاد بکەیت.</span></div>` : ''}
    <div class="add-row"><div id="g-add"></div><button type="button" class="btn" data-g="add">${ic('plus', 14)} زیادکردن</button></div>
    ${members == null ? `<div class="loading-row"><span class="spin"></span> بارکردنی ئەندامەکان…</div>`
      : members.length ? `<div class="members">${members.map((m) => `<div class="member"><div><b>${esc(m.realtor_name)}</b><small>${esc(m.branch || '')}</small></div><button type="button" class="btn xs ghost icon danger" data-remove="${esc(m.realtor_id)}" title="لابردن لە گرووپ" aria-label="لابردنی ${esc(m.realtor_name)} لە گرووپ">${ic('x', 13)}</button></div>`).join('')}</div>`
      : `<div class="hint warn">${ic('alert', 13)}<span>ئەم گرووپە هیچ ئەندامێکی نییە — پۆستی هاوبەش نامە وەرناگرێت.</span></div>`}
    <div style="display:flex;flex-direction:column;gap:8px">
      <h3 class="sub-h">پۆستەکانی ئەم گرووپە ${posts.length ? `<span class="muted">(${fmtN(posts.length)} · ${fmtN(shared.length)} هاوبەش)</span>` : ''}</h3>
      ${posts.length ? `<div class="gp-list">${posts.slice(0, 60).map(groupPostCard).join('')}</div>${posts.length > 60 ? `<div class="muted" style="font-size:12.5px">+${fmtN(posts.length - 60)} پۆستی تر — لە پەڕەی پۆستەکان بیانبینە</div>` : ''}` : '<div class="muted" style="font-size:13px">هیچ پۆستێک ئەم گرووپەی بەکارنەهێناوە.</div>'}
    </div>
  </div>`;
  const inGroup = new Set((members || []).map((m) => m.realtor_id));
  G.combo = Combo($('#g-add', box), { id: 'g-add-in', items: S.realtors.filter((r) => r.active && !inGroup.has(r.id)), label: (r) => r.name, sub: (r) => r.branch || '', placeholder: 'کارمەندێک زیاد بکە…' });
}
async function onGroupDetailClick(e) {
  const gp = e.target.closest('[data-gpost]');
  if (gp) {
    const post = S.postById.get(gp.dataset.gpost);
    Object.assign(P, { q: post ? String(post.post_code || '') : '', active: 'all', items: [], loadedAt: 0, done: false });
    location.hash = '#/posts'; return;
  }
  const t = e.target.closest('[data-g],[data-remove]'); if (!t || t.disabled) return;
  const g = S.groupById.get(G.selId); if (!g) return;
  if (t.dataset.g === 'add') {
    const rid = G.combo && G.combo.value;
    if (!rid) { toast('سەرەتا کارمەندێک هەڵبژێرە', 'err'); if (G.combo) G.combo.focus(); return; }
    busy(t, true);
    try {
      await rpc('manager_add_group_member', { p_group_id: g.id, p_realtor_id: rid });
      toast((S.realtorById.get(rid) || {}).name + ' زیادکرا بۆ ' + g.name);
      await loadGroups(); renderGroupList(); await openGroup(g.id);
    } catch (err) { toastErr(err); busy(t, false); }
  } else if (t.dataset.remove) {
    const rid = t.dataset.remove; const m = (G.members || []).find((x) => x.realtor_id === rid);
    modal({
      title: 'لابردنی ' + (m ? m.realtor_name : '') + '؟',
      body: `لە گرووپی «${g.name}» لادەبرێت و چیتر نامەی پۆستە هاوبەشەکانی ئەم گرووپەی بۆ نایەت.`,
      confirmText: 'لابردن', danger: true,
      onConfirm: async () => {
        await rpc('manager_remove_group_member', { p_group_id: g.id, p_realtor_id: rid });
        toast('لە گرووپەکە لابرا');
        await loadGroups(); renderGroupList(); await openGroup(g.id);
      },
    });
  } else if (t.dataset.g === 'delete') {
    const n = S.posts.filter((p) => p.group_id === g.id).length;
    modal({
      title: 'سڕینەوەی گرووپی «' + g.name + '»؟',
      body: n ? `${n} پۆست ئەم گرووپەیان هەیە و دوای سڕینەوە بێ گرووپ دەمێننەوە (نامەکانیان بۆ کەسی تر ناگوازرێتەوە). ئەم کارە ناگەڕێتەوە.` : 'ئەم کارە ناگەڕێتەوە.',
      confirmText: 'سڕینەوەی گرووپ', danger: true,
      onConfirm: async () => {
        await rpc('manager_delete_group', { p_group_id: g.id });
        toast('گرووپەکە سڕایەوە');
        G.selId = null; G.members = null;
        await Promise.all([loadGroups(), loadPostsLite()]);
        renderGroupList(); renderGroupDetail();
      },
    });
  }
}

/* ============================ blocked ============================ */
const B = { rows: null, loaded: false };
async function loadBlocked() {
  try { B.rows = await get('blocked_customers?select=id,number_clean,reason,created_at&order=created_at.desc&limit=2000'); B.loaded = true; }
  catch (e) { B.rows = B.rows || []; toastErr(e); }
  renderBlocked();
}
function mountBlocked(root) {
  root.innerHTML = `
  <div class="page" style="max-width:920px">
    <div class="page-head">
      <div><h1 class="page-title">کڕیارە بلۆککراوەکان</h1><div class="page-sub">نامەی ئەم ژمارانە بە بێدەنگی فڕێدەدرێت — نامە دروست نابێت و وەڵامی خۆکاری بۆ ناچێت</div></div>
    </div>
    <form class="card" id="b-form" style="padding:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end" novalidate>
      <div class="field" style="flex:1 1 200px"><label class="label" for="b-num">ژمارەی کڕیار</label><input class="input mono" id="b-num" dir="ltr" placeholder="0750 000 0000" autocomplete="off"></div>
      <div class="field" style="flex:2 1 240px"><label class="label" for="b-reason">هۆکار <span class="aux">ئارەزوومەندانە</span></label><input class="input" id="b-reason" autocomplete="off"></div>
      <button type="submit" class="btn danger">${ic('ban', 15)} بلۆککردن</button>
    </form>
    <div class="card" id="b-list"></div>
  </div>`;
  $('#b-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let d = digits($('#b-num').value);
    if (/^07\d{9}$/.test(d)) d = '964' + d.slice(1); else if (/^7\d{9}$/.test(d)) d = '964' + d;
    if (d.length < 8) { toast('ژمارەیەکی دروست بنووسە', 'err'); $('#b-num').focus(); return; }
    const btn = $('#b-form button[type="submit"]'); busy(btn, true);
    try {
      await rpc('manager_block_customer', { p_number: d, p_reason: $('#b-reason').value });
      toast('+' + d + ' بلۆک کرا'); $('#b-num').value = ''; $('#b-reason').value = '';
      await loadBlocked();
    } catch (err) { toastErr(err); }
    finally { busy(btn, false); }
  });
  $('#b-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unblock]'); if (!b) return;
    const num = b.dataset.unblock;
    modal({
      title: 'لابردنی بلۆک؟', body: `نامەکانی +${num} دووبارە وەردەگیرێن و وەک نامەی ئاسایی مامەڵەیان لەگەڵ دەکرێت.`, confirmText: 'لابردنی بلۆک',
      onConfirm: async () => { await rpc('manager_unblock_customer', { p_number: num }); toast('بلۆکەکە لابرا'); await loadBlocked(); },
    });
  });
  renderBlocked();
  loadBlocked();
}
function renderBlocked() {
  const box = $('#b-list'); if (!box) return;
  if (!B.rows) { box.innerHTML = `<div class="loading-row"><span class="spin"></span> بارکردن…</div>`; return; }
  if (!B.rows.length) { box.innerHTML = `<div class="empty">${ic('ban', 32)}<div>هیچ کڕیارێک بلۆک نەکراوە</div></div>`; return; }
  box.innerHTML = B.rows.map((r) => `<div class="blk-row"><div><div class="mono">+${esc(r.number_clean)}</div><div class="hint">${esc(r.reason || 'بێ هۆکار')} · ${esc(fmtDT(r.created_at))}</div></div><button type="button" class="btn sm" data-unblock="${esc(r.number_clean)}">لابردنی بلۆک</button></div>`).join('');
}

/* ============================ router + boot ============================ */
const VIEWS = {
  leads: { label: 'نامەکان', icon: 'inbox', mount: mountLeads },
  posts: { label: 'پۆستەکان', icon: 'megaphone', mount: mountPosts },
  new: { label: 'پۆستی نوێ', icon: 'plus', mount: (root) => NewPost.mount(root), hidden: true },
  ads: { label: 'ڕیکلامەکان', icon: 'chart', mount: mountAds },
  reports: { label: 'ڕاپۆرت', icon: 'target', mount: mountReports },
  realtors: { label: 'کارمەندەکان', icon: 'users', mount: mountRealtors },
  groups: { label: 'گرووپەکان', icon: 'layers', mount: mountGroups },
  blocked: { label: 'بلۆککراوەکان', icon: 'ban', mount: (root) => { history.replaceState(null, '', '#/settings/blocked'); mountSettings(root, 'blocked'); }, hidden: true },
  settings: { label: 'ڕێکخستنەکان', icon: 'sliders', mount: mountSettings },
};
function route() {
  if ($('#app').hidden) return;
  const h = (location.hash || '').replace(/^#\/?/, '');
  const [name, arg] = h.split('/');
  const view = VIEWS[name] ? name : 'leads';
  $$('#nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.view === view ? 'page' : 'false'));
  if (S.view === 'leads' && view === 'leads' && arg && $('#l-list')) { if (arg !== L.selId) openLead(decodeURIComponent(arg)); return; }
  if (S.view === 'new' && view !== 'new') {
    if (NewPost.isDirty() && !confirm('پۆستە نوێیەکە پاشەکەوت نەکراوە. دەتەوێت بڕۆیت و بیسڕیتەوە؟')) { history.replaceState(null, '', '#/new'); return; }
    NewPost.detach();
  }
  closeMenus();
  S.view = view;
  VIEWS[view].mount($('#view'), arg ? decodeURIComponent(arg) : null);
  $('#main').scrollTop = 0;
  document.title = VIEWS[view].label + ' · بەڕێوەبەری کۆڵ سەنتەر';
}
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => { if (S.view === 'new' && NewPost.isDirty()) { e.preventDefault(); e.returnValue = ''; } });

function currentTheme() {
  const a = document.documentElement.getAttribute('data-theme');
  if (a) return a;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function paintThemeBtn() {
  const dark = currentTheme() === 'dark';
  const b = $('#btn-theme'); b.innerHTML = ic(dark ? 'sun' : 'moon', 18); b.title = dark ? 'ڕووکاری ڕوون' : 'ڕووکاری تاریک';
}

function showLogin(msg) {
  $('#app').hidden = true; $('#login').hidden = false;
  const err = $('#login-err'); err.textContent = msg || ''; err.hidden = !msg;
  setTimeout(() => { const el = $('#login-email'); if (el) el.focus(); }, 50);
}
async function enterApp() {
  const role = await rpc('current_app_user_role');
  if (role !== 'manager' && role !== 'admin') { await auth.signOut(); throw new ApiError('ئەم هەژمارە دەسەڵاتی بەڕێوەبەری نییە.'); }
  const prof = await rpc('get_my_profile').catch(() => null);
  S.me = Array.isArray(prof) ? prof[0] : prof;
  $('#me-name').textContent = (S.me && (S.me.name || S.me.email)) || (auth.s && auth.s.email) || '';
  await Promise.all([loadRealtors(), loadGroups(), loadPostsLite(), loadSettings().catch(() => {}), loadAppStatus().catch(() => {})]);
  loadHealth();
  $('#login').hidden = true; $('#app').hidden = false;
  paintTokenWarn();
  route();
  loadAttention();
}
/* ---------- system health: shout when something fails quietly ---------- */
S.health = null;
const HEALTH_ICON = { ok: 'checkCircle', warn: 'alert', bad: 'xCircle' };
async function loadHealth() {
  try { S.health = await rpc('manager_system_health'); } catch (e) { S.health = null; }
  paintHealth();
}
const worstHealth = () => (S.health || []).some((h) => h.level === 'bad') ? 'bad' : (S.health || []).some((h) => h.level === 'warn') ? 'warn' : 'ok';
function paintHealth() {
  const b = $('#btn-health'); if (!b) return;
  if (!S.health) { b.hidden = true; return; }
  const w = worstHealth();
  b.hidden = false;
  b.className = 'btn ghost icon health ' + (w === 'ok' ? '' : w);
  b.innerHTML = ic(w === 'ok' ? 'power' : 'alert', 18) + '<span class="hdot"></span>';
  b.title = w === 'bad' ? 'کێشەی گرنگ لە سیستەمدا هەیە' : w === 'warn' ? 'ئاگاداری لە سیستەمدا' : 'سیستەم باشە';
  const bad = (S.health || []).filter((h) => h.level === 'bad');
  if (bad.length && S.healthShown !== bad.map((h) => h.key).join(',')) {
    S.healthShown = bad.map((h) => h.key).join(',');
    toast(bad[0].label + ': ' + bad[0].detail, 'err', 9000);
  }
}
function healthDialog() {
  const rows = S.health || [];
  modal({
    title: 'دۆخی سیستەم', wide: true,
    html: rows.length ? `<ul class="hl">${rows.map((h) => `<li class="${esc(h.level === 'ok' ? '' : h.level)}"><span class="hi">${ic(HEALTH_ICON[h.level] || 'clock', 16)}</span><div><b>${esc(h.label)}</b><span>${esc(h.detail)}${h.at ? ' · ' + esc(ago(h.at, true)) : ''}</span></div></li>`).join('')}</ul>
      <div class="hint">${ic('refresh', 13)}<span>هەر 5 خولەک جارێک خۆکارانە دەپشکنرێت. ئەگەر شتێک سوور بوو، پێم بڵێ.</span></div>` : '<div class="loading-row"><span class="spin"></span> پشکنین…</div>',
    confirmText: 'پشکنینەوە ئێستا',
    onConfirm: async (m) => { await loadHealth(); m.close(); setTimeout(healthDialog, 60); return false; },
  });
}
function tokenDaysLeft() {
  const st = S.settings || {};
  const d = (v) => (v ? Math.ceil((Date.parse(v) - Date.now()) / 864e5) : null);
  if (st.meta_token_expires_at === 'never') return d(st.meta_token_data_access_at ? st.meta_token_data_access_at + 'T12:00:00Z' : null);
  if (st.meta_token_expires_at) return d(st.meta_token_expires_at);
  if (st.meta_token_saved_at) return Math.ceil((Date.parse(st.meta_token_saved_at + 'T00:00:00Z') + 60 * 864e5 - Date.now()) / 864e5);
  return null;
}
function paintTokenWarn() {
  const old = $('#token-warn'); if (old) old.remove();
  const left = tokenDaysLeft();
  if (left == null || left > 20) return;
  const el = document.createElement('span');
  el.id = 'token-warn'; el.className = 'token-warn';
  el.title = 'فەیسبووک هەر 90 ڕۆژ جارێک داوای نوێکردنەوەی ڕێگەپێدان دەکات — Graph API Explorer → Generate → Vault';
  el.innerHTML = ic('alert', 14) + (left > 0 ? `ڕێگەپێدانی فەیسبووک ${left} ڕۆژی ماوە` : 'ڕێگەپێدانی فەیسبووک بەسەرچووە');
  $('.top-actions').prepend(el);
}

function poll() {
  if (document.visibilityState !== 'visible' || !auth.s || $('#app').hidden) return;
  loadAttention();
  if (S.view === 'leads') { loadKpis({ silent: true, detectNew: true }); if (L.selId) loadMsgs(L.selId); }
  if (S.view === 'ads' && !modals.length && Date.now() - A.loadedAt > 5 * 60000) loadAds({ silent: true });
  if (Date.now() - (S.healthAt || 0) > 5 * 60000) { S.healthAt = Date.now(); loadHealth(); }
}

function boot() {
  $('#nav').innerHTML = Object.entries(VIEWS).filter(([, v]) => !v.hidden).map(([k, v]) => `<a href="#/${k}" data-view="${k}">${ic(v.icon, 16)}<span>${v.label}</span>${k === 'leads' ? '<span class="nav-badge" id="nav-badge-leads" hidden></span>' : ''}</a>`).join('');
  $('#btn-new-post').innerHTML = ic('plus', 16) + '<span class="hide-sm">پۆستی نوێ</span>';
  $('#btn-new-post').addEventListener('click', () => { location.hash = '#/new'; });
  $('#btn-health').addEventListener('click', healthDialog);
  $('#btn-logout').innerHTML = ic('logout', 18, 'flip');
  $('#btn-logout').addEventListener('click', () => {
    modal({ title: 'چوونەدەرەوە؟', body: 'دەبێت دووبارە ئیمەیڵ و وشەی نهێنی بنووسیتەوە.', confirmText: 'چوونەدەرەوە', onConfirm: async () => { await auth.signOut(); location.hash = ''; location.reload(); } });
  });
  paintThemeBtn();
  $('#btn-theme').addEventListener('click', () => { const next = currentTheme() === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next); lsSet('bsg_theme', next); paintThemeBtn(); });
  if (window.matchMedia) { try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintThemeBtn); } catch (e) { /* old browsers */ } }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-btn'); const err = $('#login-err'); err.hidden = true;
    busy(btn, true);
    try { await auth.signIn($('#login-email').value.trim(), $('#login-pass').value); await enterApp(); $('#login-pass').value = ''; }
    catch (ex) { console.error(ex); err.textContent = humanError(ex); err.hidden = false; }
    finally { busy(btn, false); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || modals.length || Editor.isOpen() || $('#app').hidden) return;
    const tag = e.target && e.target.tagName;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { const s = $('#l-q') || $('#p-q') || $('#ad-q') || $('#rp-q') || $('#pe-fbq') || $('#r-q') || $('#g-q'); if (s) { e.preventDefault(); s.focus(); } }
    else if (S.view === 'leads' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); moveSel(e.key === 'ArrowDown' ? 1 : -1); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
  setInterval(poll, CFG.pollMs);

  if (!auth.load()) { showLogin(); return; }
  enterApp().catch((ex) => { console.error(ex); if (ex && ex.code === 'session') auth.clear(); showLogin(humanError(ex)); });
}
boot();
})();
