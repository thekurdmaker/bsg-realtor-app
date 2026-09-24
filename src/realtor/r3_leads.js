
/* ============================ state ============================ */
const App = {};
const S = {
  me: null, groups: [],
  pending: [], answered: [], ansOffset: 0, ansDone: false, ansLoading: false,
  byId: new Map(),
  posts: [], postById: new Map(), postsLoaded: false, postsFilter: 'boosted',
  seg: lsGet('seg', 'pending'), sortOldest: lsGet('sort_oldest', true), q: '',
  remote: [], remoteQ: '', searching: false,
  online: true, lastSync: null, loaded: false, loadError: null,
  knownPending: null, newCount: 0, flash: new Set(),
  detailId: null, sendDetails: lsGet('send_details', true),
  statsPeriod: lsGet('stats_period', '7d'), stats: null, statsKey: '',
};

const customerName = (l) => l.name || 'کڕیار';
const MEDIA_LABEL = { image: 'وێنە', video: 'ڤیدیۆ', audio: 'دەنگ', document: 'فایل' };
const MEDIA_ICON = { image: 'image', video: 'video', audio: 'mic', document: 'file' };

function normMsg(m) {
  return {
    kind: m.kind || 'message', dir: m.direction === 'outbound' ? 'out' : 'in', by: m.sent_by || null, mgr: !!m.is_from_manager,
    text: m.message_text || '', url: m.media_url || null, type: m.media_type || null, cap: m.media_caption || '',
    at: m.created_at, images: Array.isArray(m.images) ? m.images.filter(Boolean) : null,
  };
}
function normLead(j) {
  return {
    id: j.id, status: j.status,
    name: j.customer_name_resolved || j.customer_display_name || j.customer_whatsapp_name || '',
    number: j.status === 'answered' ? (j.customer_number || null) : null,
    firstMsg: j.customer_message || '',
    postId: j.facebook_post_id || null, headline: j.post_headline || '', postUrl: j.facebook_post_url || '',
    prefill: j.reply_prefill || '',
    createdAt: j.created_at, assignedAt: j.assigned_at || j.created_at, deadline: j.answer_deadline_at || null,
    answeredAt: j.first_response_at || null, opened: !!j.whatsapp_opened,
    forwardCount: Number(j.forward_count) || 0, groupName: j.group_name || '', groupKind: j.group_kind || '',
    lastInbound: j.last_inbound_at || null, lastAt: j.last_message_at || j.created_at,
    msgCount: Number(j.message_count) || 0,
    msgs: Array.isArray(j.messages) ? j.messages.map(normMsg) : null,
  };
}
function index(list) { list.forEach((l) => S.byId.set(l.id, l)); }
function postOf(l) { return l && l.postId ? S.postById.get(l.postId) : null; }
const postCode = (l) => { const p = postOf(l); return p && p.code ? p.code : ''; };

/* ============================ cache (for bad connection) ============================ */
function saveCache() {
  if (!S.me) return;
  const slim = (l) => Object.assign({}, l, { msgs: l.msgs ? l.msgs.slice(-40) : null });
  lsSet('cache_v1', {
    me: S.me.realtor_id, at: S.lastSync,
    pending: S.pending.slice(0, 60).map(slim),
    answered: S.answered.slice(0, 20).map(slim),
    posts: S.posts,
  });
}
function loadCache() {
  const c = lsGet('cache_v1', null);
  if (!c || !S.me || c.me !== S.me.realtor_id) return false;
  S.pending = c.pending || []; S.answered = c.answered || []; S.posts = c.posts || [];
  S.postById = new Map(S.posts.map((p) => [p.id, p]));
  S.ansOffset = S.answered.length; S.lastSync = c.at || null;
  index(S.pending); index(S.answered);
  S.knownPending = new Set(S.pending.map((l) => l.id));
  return S.pending.length + S.answered.length + S.posts.length > 0;
}

/* ============================ loading ============================ */
async function loadPending(fromPoll) {
  const rows = await rpc('get_my_thread_leads', { p_status: 'pending', p_limit: CFG.pendingMax, p_offset: 0 });
  const list = (rows || []).map(normLead);
  if (S.knownPending && fromPoll) {
    const fresh = list.filter((l) => !S.knownPending.has(l.id));
    if (fresh.length) {
      S.newCount += fresh.length; fresh.forEach((l) => S.flash.add(l.id));
      setTimeout(() => { fresh.forEach((l) => S.flash.delete(l.id)); }, 6000);
    }
  }
  S.knownPending = new Set(list.map((l) => l.id));
  S.pending = list; index(list);
}
async function loadAnswered(reset) {
  if (S.ansLoading) return;
  S.ansLoading = true;
  try {
    const offset = reset ? 0 : S.ansOffset;
    const rows = await rpc('get_my_thread_leads', { p_status: 'answered', p_limit: CFG.answeredPage, p_offset: offset });
    const list = (rows || []).map(normLead);
    index(list);
    if (reset) S.answered = list;
    else { const have = new Set(S.answered.map((l) => l.id)); S.answered = S.answered.concat(list.filter((l) => !have.has(l.id))); }
    S.ansOffset = offset + list.length;
    S.ansDone = list.length < CFG.answeredPage;
  } finally { S.ansLoading = false; }
}
async function loadAll(fromPoll) {
  try {
    await Promise.all([loadPending(fromPoll), fromPoll ? Promise.resolve() : loadAnswered(true), S.postsLoaded && fromPoll ? Promise.resolve() : loadPosts()]);
    S.lastSync = new Date().toISOString(); S.loaded = true; S.loadError = null;
    App.setOnline(true);
    saveCache();
  } catch (e) {
    S.loadError = e;
    if (e && e.code === 'session') { toastErr(e); return; }
    if (e && e.code === 'network') App.setOnline(false);
    else if (!fromPoll) toastErr(e);
  }
  App.updateBadge();
  App.render();
}

/* ============================ time rules ============================ */
function waitMins(l) { const d = toDate(l.assignedAt); return d ? (Date.now() - d.getTime()) / 60000 : null; }
function deadlineMins(l) { const d = toDate(l.deadline); return d ? (d.getTime() - Date.now()) / 60000 : null; }
function leadTone(l) {
  if (l.status === 'answered') return 'is-done';
  const w = waitMins(l), dl = deadlineMins(l);
  if ((dl != null && dl < 60) || (w != null && w > 300)) return 'is-late';
  return 'is-wait';
}
function lastCustomerLine(l) {
  const list = l.msgs || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m.dir !== 'in') continue;
    if (m.kind === 'gallery') return { icon: 'image', text: fmtN((m.images || []).length) + ' وێنە' };
    if (m.type && MEDIA_LABEL[m.type]) return { icon: MEDIA_ICON[m.type], text: m.cap || m.text || MEDIA_LABEL[m.type] };
    if (m.text) return { icon: null, text: m.text };
  }
  return l.firstMsg ? { icon: null, text: l.firstMsg } : null;
}

/* ============================ inbox ============================ */
function segList() {
  if (S.seg === 'answered') return S.answered;
  if (S.seg === 'all') {
    const all = S.pending.concat(S.answered.filter((a) => !S.pending.some((p) => p.id === a.id)));
    return all.slice().sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
  }
  const list = S.pending.slice();
  list.sort((a, b) => {
    const x = String(a.assignedAt || ''), y = String(b.assignedAt || '');
    return S.sortOldest ? x.localeCompare(y) : y.localeCompare(x);
  });
  return list;
}
function matches(l, nq, dq) {
  if (!nq) return true;
  const hay = normTxt([l.name, l.headline, l.firstMsg, postCode(l), l.groupName].join(' '));
  if (hay.includes(nq)) return true;
  if (dq.length >= 3 && l.status === 'answered' && l.number && digits(l.number).includes(dq)) return true;
  if (dq.length >= 1 && postCode(l) && digits(postCode(l)) === dq) return true;
  return false;
}

function renderInbox(main) {
  const nq = normTxt(S.q), dq = digits(S.q).replace(/^0+/, '');
  const nP = S.pending.length;
  let list = segList();
  if (nq) {
    const pool = S.pending.concat(S.answered.filter((a) => !S.pending.some((p) => p.id === a.id)));
    list = pool.filter((l) => matches(l, nq, dq));
    const have = new Set(list.map((l) => l.id));
    S.remote.forEach((r) => { if (!have.has(r.id)) list.push(r); });
  }

  const cacheNote = !S.online
    ? `<div class="r-banner bad">${ic('wifiOff', 18)}<div><b>ئینتەرنێت نییە.</b> ئەمانە دوایین زانیارین کە هاتوون${S.lastSync ? ' (' + esc(ago(S.lastSync, true)) + ')' : ''}. کاتێک ئینتەرنێت هاتەوە خۆی نوێ دەبێتەوە.</div></div>` : '';

  main.innerHTML = `
    ${App.installCardHtml()}
    ${App.pushCardHtml()}
    ${cacheNote}
    <div class="r-search">${ic('search', 18)}
      <input class="r-input" id="r-q" type="search" inputmode="search" autocomplete="off" placeholder="گەڕان: ناو، ژمارە، پۆست یان کۆد…" aria-label="گەڕان لە نامەکانم" value="${esc(S.q)}">
      <button type="button" class="r-btn icon ghost r-clear" id="r-q-x" aria-label="سڕینەوەی گەڕان" ${S.q ? '' : 'hidden'}>${ic('x', 18)}</button>
    </div>
    ${nq ? '' : `<div class="r-seg" role="group" aria-label="جۆری نامە">
      <button type="button" data-seg="pending" aria-pressed="${S.seg === 'pending'}">چاوەڕێ <span class="n ${nP ? 'hot' : ''}">${fmtN(nP)}</span></button>
      <button type="button" data-seg="answered" aria-pressed="${S.seg === 'answered'}">وەرگیراو</button>
      <button type="button" data-seg="all" aria-pressed="${S.seg === 'all'}">هەموو</button>
    </div>`}
    <div class="r-listhead">
      <span>${nq ? (S.searching ? '<span class="r-spin"></span> گەڕان…' : fmtN(list.length) + ' ئەنجام') : listHeadText(list)}</span>
      ${!nq && S.seg === 'pending' && nP > 1 ? `<button type="button" class="r-btn sm ghost" id="r-sort">${ic('sort', 16)} ${S.sortOldest ? 'کۆنترین سەرەتا' : 'نوێترین سەرەتا'}</button>` : ''}
    </div>
    <div class="r-list" id="r-list">${listHtml(list, nq)}</div>
    ${!nq && S.seg !== 'pending' && !S.ansDone && S.answered.length ? `<div class="r-more"><button type="button" class="r-btn" id="r-more">${S.ansLoading ? '<span class="r-spin"></span>' : ic('down', 18)} نامەی کۆنتر</button></div>` : ''}`;
}
function listHeadText(list) {
  if (S.seg === 'pending') return list.length ? 'ئەمانە چاوەڕێی وەڵامی تۆن' : '';
  if (S.seg === 'answered') return list.length ? 'ئەوانەی وەرتگرتوون' : '';
  return list.length ? 'هەموو نامەکانت' : '';
}
function listHtml(list, nq) {
  if (!S.loaded && !list.length) {
    return [0, 1, 2].map(() => '<div class="r-skel"><i style="width:45%"></i><i style="width:80%"></i><i style="width:65%"></i></div>').join('');
  }
  if (!list.length) {
    if (nq) return `<div class="r-empty">${ic('search', 44)}<b>هیچ شتێک نەدۆزرایەوە</b><p>ناوێکی تر، ژمارەیەک یان کۆدی پۆستێک تاقی بکەرەوە.</p></div>`;
    if (S.loadError && !S.online) return `<div class="r-empty">${ic('wifiOff', 44)}<b>ئینتەرنێت نییە</b><p>کاتێک پەیوەندی هاتەوە نامەکانت لێرە دەردەکەون.</p><button type="button" class="r-btn primary" data-act="reload">${ic('refresh', 18)} دووبارە هەوڵ بدەرەوە</button></div>`;
    if (S.seg === 'pending') return `<div class="r-empty">${ic('checkCircle', 48)}<b>هیچ نامەیەکی چاوەڕێت نییە</b><p>دەستت خۆش بێت! هەر کڕیارێکی نوێ هات، لێرە دەردەکەوێت.</p></div>`;
    return `<div class="r-empty">${ic('inbox', 44)}<b>هێشتا هیچ نامەیەکت وەرنەگرتووە</b><p>کاتێک نامەیەک وەردەگریت، لێرە دەمێنێتەوە بۆ ئەوەی هەر کاتێک بتەوێت بیبینیتەوە.</p></div>`;
  }
  return list.map(leadCard).join('');
}

function leadCard(l) {
  const tone = leadTone(l);
  const pending = l.status === 'pending';
  const line = lastCustomerLine(l);
  const code = postCode(l);
  const w = waitMins(l), dl = deadlineMins(l);
  const waitChip = pending
    ? `<span class="r-chip ${tone === 'is-late' ? 'bad' : 'warn'}">${ic('clock', 13)} ${esc(dur(w))}</span>`
    : `<span class="r-chip ok">${ic('check', 13)} وەرگیرا</span>`;
  let deadline = '';
  if (pending && dl != null && dl < 180) {
    deadline = `<div class="r-deadline">${ic('alert', 15)} ${dl <= 0 ? 'کاتی تەواو بوو — بەم زووانە دەگوازرێتەوە بۆ کەسێکی تر' : 'تەنها ' + esc(dur(dl)) + ' ماوە پێش ئەوەی بگوازرێتەوە'}</div>`;
  }
  const meta = [];
  if (pending) meta.push('هاتووە ' + esc(ago(l.assignedAt, true)));
  else meta.push('وەرگیرا ' + esc(ago(l.answeredAt || l.lastAt, true)));
  if (l.forwardCount > 0 && pending) meta.push(`<span class="r-chip accent">${ic('swap', 12)} گوازراوەتەوە بۆت</span>`);
  if (l.groupKind && l.groupKind !== 'branch' && l.groupName) meta.push(`<span class="r-chip">${ic('users', 12)} ${esc(l.groupName)}</span>`);
  if (!pending && !l.opened) meta.push('<span class="r-chip">واتسئاپ نەکراوەتەوە</span>');

  const acts = pending
    ? `<div class="r-lead-acts"><button type="button" class="r-btn wa big" data-answer="${esc(l.id)}">${ic('chat', 20)} وەڵامدانەوە لە واتسئاپ</button></div>`
    : (l.number && isPhoneNum(l.number)
      ? `<div class="r-lead-acts">
          <a class="r-btn wa" href="${esc(waUrl(l.number))}" target="_blank" rel="noopener" data-wa="${esc(l.id)}">${ic('chat', 18)} واتسئاپ</a>
          <a class="r-btn" href="${esc(telUrl(l.number))}" data-call="${esc(l.id)}">${ic('phone', 18)} پەیوەندی</a>
        </div>` : '');

  return `<article class="r-lead ${tone} ${S.flash.has(l.id) ? 'is-new' : ''}" data-id="${esc(l.id)}">
    <button type="button" class="r-lead-main" data-open="${esc(l.id)}" aria-label="کردنەوەی نامەی ${esc(customerName(l))}">
      <div class="r-lead-top"><span class="r-lead-name" dir="auto">${esc(customerName(l))}</span>${waitChip}</div>
      <div class="r-lead-post">${ic('home', 14)}<span class="t">${esc(l.headline || 'پرسیاری گشتی — بێ پۆست')}</span>${code ? `<span class="r-chip code">${esc(code)}</span>` : ''}</div>
      ${line ? `<p class="r-lead-msg" dir="auto">${line.icon ? ic(line.icon, 14) : ''}${esc(line.text)}</p>` : ''}
      ${deadline}
      <div class="r-lead-meta">${meta.join(' · ')}</div>
    </button>
    ${acts}
  </article>`;
}

/* ============================ search (older leads too) ============================ */
const SAFE_COLS = 'id,status,customer_name_resolved,customer_display_name,customer_whatsapp_name,customer_message,facebook_post_id,post_headline,created_at,assigned_at,answer_deadline_at,first_response_at,message_count,last_message_at,last_inbound_at,forward_count,group_name,group_kind';
const remoteSearch = debounce(async () => {
  const q = S.q.trim();
  if (q.length < 2 || !S.me) { S.remote = []; S.searching = false; App.render(); return; }
  S.searching = true; App.render();
  try {
    const clean = q.replace(/["\\(),*%]/g, ' ').trim();
    const ors = [`customer_name_resolved.ilike."*${clean}*"`, `post_headline.ilike."*${clean}*"`, `customer_message.ilike."*${clean}*"`];
    const d = digits(q).replace(/^0+/, '');
    const codeHits = S.posts.filter((p) => p.code && digits(p.code) === digits(q)).map((p) => p.id);
    if (codeHits.length) ors.push(`facebook_post_id.in.(${codeHits.map(pgQuote).join(',')})`);
    const base = `v_my_leads?realtor_id=eq.${S.me.realtor_id}&status=in.(pending,answered)&order=created_at.desc&limit=30`;
    const jobs = [get(`${base}&select=${SAFE_COLS}&or=${encodeURIComponent('(' + ors.join(',') + ')')}`)];
    // a number is only searchable on answered leads (it stays hidden until the lead is taken)
    if (d.length >= 4) jobs.push(get(`${base.replace('status=in.(pending,answered)', 'status=eq.answered')}&select=${SAFE_COLS},customer_number&customer_number_clean=ilike.${encodeURIComponent('*' + d + '*')}`));
    const res = await Promise.all(jobs);
    if (S.q.trim() !== q) return;
    const seen = new Set();
    S.remote = [].concat(...res.map((r) => r || [])).filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).map((r) => {
      const known = S.byId.get(r.id);
      if (known) return known;
      const l = normLead(r); l.partial = true; S.byId.set(l.id, l); return l;
    });
  } catch (e) { if (e && e.code === 'session') toastErr(e); S.remote = []; }
  S.searching = false;
  if (S.q.trim() === q) App.render();
}, 380);

async function fillLead(l) {
  if (!l.partial) return l;
  const jobs = [get(`v_lead_thread?select=id,message_text,direction,sent_by,media_url,media_type,media_caption,created_at,is_from_manager&lead_id=eq.${l.id}&order=created_at.asc,id.asc&limit=300`)];
  if (l.status === 'answered' && !l.number) jobs.push(get(`v_my_leads?select=customer_number,first_response_at&id=eq.${l.id}&status=eq.answered`));
  const [msgs, num] = await Promise.all(jobs);
  l.msgs = groupImages((msgs || []).map((m) => normMsg(m)));
  if (num && num[0]) { l.number = num[0].customer_number || null; l.answeredAt = l.answeredAt || num[0].first_response_at; }
  const p = postOf(l);
  if (p) { l.prefill = l.prefill || p.reply || ''; l.postUrl = l.postUrl || p.url || ''; }
  l.partial = false;
  return l;
}
// same grouping the database does: images in a row from the same side become one gallery
function groupImages(list) {
  const out = [];
  list.forEach((m) => {
    const isImg = m.type === 'image' && m.url;
    const prev = out[out.length - 1];
    if (isImg && prev && prev.dir === m.dir && (prev.kind === 'gallery' || (prev.type === 'image' && prev.url && !prev.text))) {
      if (prev.kind !== 'gallery') { prev.kind = 'gallery'; prev.images = [prev.url]; }
      prev.images.push(m.url);
      return;
    }
    out.push(Object.assign({}, m));
  });
  return out;
}

/* ============================ lead detail ============================ */
function whoLabel(m, l) {
  if (m.dir === 'in') return customerName(l);
  if (m.mgr) return 'بەڕێوەبەر';
  if (m.by === 'ai') return 'یاریدەدەری زیرەک';
  if (m.by === 'system') return 'وەڵامی خۆکار';
  return 'کۆڵ سەنتەر';
}
function msgHtml(m, l, idx) {
  const who = whoLabel(m, l);
  const whoIc = m.dir === 'in' ? '' : (m.by === 'ai' ? ic('sparkle', 12) : ic('bot', 12));
  let body = '';
  if (m.kind === 'gallery' && m.images && m.images.length) {
    const shown = m.images.slice(0, 4);
    body = `<div class="r-gal">${shown.map((u, i) => `<button type="button" data-lb="${idx}" data-lbi="${i}" aria-label="وێنەی ${fmtN(i + 1)}"><img src="${esc(u)}" alt="" loading="lazy">${i === 3 && m.images.length > 4 ? `<span class="more">+${fmtN(m.images.length - 4)}</span>` : ''}</button>`).join('')}</div>`;
  } else if (m.url && m.type === 'image') {
    body = `<div class="r-media"><img src="${esc(m.url)}" alt="" loading="lazy" data-lb="${idx}" data-lbi="0">${m.cap ? `<div class="r-cap">${esc(m.cap)}</div>` : ''}</div>`;
  } else if (m.url && m.type === 'video') {
    body = `<div class="r-media"><video src="${esc(m.url)}" controls preload="none" playsinline></video>${m.cap ? `<div class="r-cap">${esc(m.cap)}</div>` : ''}</div>`;
  } else if (m.url && m.type === 'audio') {
    body = `<div class="r-media"><audio src="${esc(m.url)}" controls preload="none"></audio><a class="r-file" href="${esc(m.url)}" target="_blank" rel="noopener">${ic('mic', 16)} ئەگەر لێنەدرا، لێرە بیکەرەوە</a></div>`;
  } else if (m.url) {
    body = `<div class="r-media"><a class="r-file" href="${esc(m.url)}" target="_blank" rel="noopener">${ic('file', 20)} ${esc(m.cap || 'فایل')} ${ic('external', 14)}</a></div>`;
  }
  const long = m.dir === 'out' && m.text && m.text.length > 220;
  const text = m.text && !(m.url && m.text === m.cap)
    ? `<div class="r-bub ${long ? 'r-clamp' : ''}" dir="auto">${esc(m.text)}</div>${long ? `<button type="button" class="r-btn sm ghost" data-more style="align-self:flex-end">هەمووی ببینە</button>` : ''}` : '';
  return `<div class="r-msg ${m.dir}">
    <span class="r-who">${whoIc}${esc(who)}</span>
    ${body}${text}
    <span class="r-time">${esc(fmtT(m.at))}</span>
  </div>`;
}
function threadHtml(l) {
  if (!l.msgs) return `<div class="r-thread"><div class="r-empty" style="padding:24px"><span class="r-spin"></span></div></div>`;
  if (!l.msgs.length) return `<div class="r-thread"><div class="r-empty" style="padding:24px"><p>هیچ نامەیەک نییە.</p></div></div>`;
  let lastDay = '';
  const parts = l.msgs.map((m, i) => {
    const d = ymdOf(m.at); let sep = '';
    if (d && d !== lastDay) { sep = `<div class="r-day">${esc(dayLabel(m.at))}</div>`; lastDay = d; }
    return sep + msgHtml(m, l, i);
  });
  return `<div class="r-thread" id="r-thread">${parts.join('')}</div>`;
}

function openLead(id, push) {
  const l = S.byId.get(id);
  if (!l) { toast('ئەم نامەیە نەدۆزرایەوە', 'err'); return; }
  S.detailId = id;
  if (push !== false && location.hash !== '#/lead/' + id) history.pushState({ lead: id }, '', '#/lead/' + id);
  let el = $('.r-detail');
  if (!el) { el = document.createElement('div'); el.className = 'r-detail'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); ROOT.appendChild(el); el.addEventListener('click', onDetailClick); }
  document.documentElement.style.overflow = 'hidden';
  paintDetail();
  if (l.partial) fillLead(l).then(() => { if (S.detailId === id) paintDetail(); }).catch((e) => { toastErr(e); });
  S.flash.delete(id);
  if (S.newCount) { S.newCount = 0; const p = $('#r-pill'); if (p) p.hidden = true; }
}
function closeLead(fromPop) {
  const el = $('.r-detail'); if (el) el.remove();
  S.detailId = null;
  document.documentElement.style.overflow = '';
  if (!fromPop && /^#\/lead\//.test(location.hash)) history.back();
}
function paintDetail() {
  const el = $('.r-detail'); const l = S.byId.get(S.detailId);
  if (!el || !l) return;
  const pending = l.status === 'pending';
  const p = postOf(l);
  const code = postCode(l);
  const stChip = pending
    ? `<span class="r-chip ${leadTone(l) === 'is-late' ? 'bad' : 'warn'}" title="چاوەڕێ">${ic('clock', 13)} ${esc(durShort(waitMins(l)))}</span>`
    : `<span class="r-chip ok">${ic('check', 13)} وەرگیراوە</span>`;
  const dl = deadlineMins(l);
  const img = p && p.image ? `<img class="r-thumb" src="${esc(p.image)}" alt="" loading="lazy">` : `<div class="r-thumb" style="display:grid;place-items:center;color:var(--line-2)">${ic('home', 26)}</div>`;
  const postUrl = safeUrl(l.postUrl || (p && p.url));

  el.innerHTML = `
    <div class="r-d-top"><div class="r-d-top-in">
      <button type="button" class="r-btn icon ghost" data-act="close" aria-label="گەڕانەوە">${ic('back', 22)}</button>
      <div class="r-d-title"><b dir="auto">${esc(customerName(l))}</b><small>${pending ? 'هاتووە ' + esc(ago(l.assignedAt, true)) : 'وەرگیرا ' + esc(ago(l.answeredAt || l.lastAt, true))}</small></div>
      ${stChip}
    </div></div>
    <div class="r-d-body"><div class="r-d-body-in">
      ${pending && dl != null && dl < 180 ? `<div class="r-banner bad">${ic('alert', 18)}<div>${dl <= 0 ? '<b>کاتی وەڵامدانەوە تەواو بوو.</b> ئەگەر ئێستا وەرینەگریت، دەگوازرێتەوە بۆ کەسێکی تر.' : `<b>تەنها ${esc(dur(dl))} ماوە.</b> دوای ئەوە نامەکە دەگوازرێتەوە بۆ کەسێکی تر.`}</div></div>` : ''}
      ${l.forwardCount > 0 && pending ? `<div class="r-banner info">${ic('swap', 18)}<div>ئەم نامەیە لە کارمەندێکی ترەوە بۆت گوازراوەتەوە.</div></div>` : ''}
      <div class="r-card">
        <div class="r-postbox">${img}
          <div class="r-pb-t">
            <b>${esc(l.headline || 'پرسیاری گشتی — بە پۆستێکەوە نەبەستراوە')}</b>
            <div class="r-row">${code ? `<span class="r-chip code">${esc(code)}</span>` : ''}${l.groupName ? `<span class="r-chip">${ic('users', 12)} ${esc(l.groupName)}</span>` : ''}</div>
            ${postUrl ? `<a href="${esc(postUrl)}" target="_blank" rel="noopener" class="r-btn sm soft" style="align-self:flex-start">${ic('external', 15)} بینینی پۆست لە فەیسبووک</a>` : ''}
          </div>
        </div>
      </div>
      ${!pending ? numberBoxHtml(l) : ''}
      ${threadHtml(l)}
    </div></div>
    <div class="r-d-foot"><div class="r-d-foot-in">${detailFootHtml(l)}</div></div>`;
  const body = $('.r-d-body', el);
  if (body) {
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    let touched = false; body.addEventListener('touchstart', () => { touched = true; }, { once: true, passive: true });
    setTimeout(() => { if (!touched && body.isConnected) body.scrollTop = body.scrollHeight; }, 450);
  }
}
function numberBoxHtml(l) {
  if (!l.number) return '';
  if (!isPhoneNum(l.number)) {
    return `<div class="r-banner">${ic('lock', 18)}<div><b>ئەم کڕیارە ژمارەکەی شاردۆتەوە.</b> ناتوانیت ڕاستەوخۆ لە واتسئاپ نامەی بۆ بنێریت. پەیوەندی بە بەڕێوەبەرەوە بکە تاکو لە ڕێگەی کۆڵ سەنتەرەوە وەڵامی بداتەوە.</div></div>`;
  }
  return `<div class="r-numbox">${ic('phone', 18)}<span class="mono">${esc(niceNum(l.number))}</span>
    <button type="button" class="r-btn sm" data-copy="${esc(niceNum(l.number))}">${ic('copy', 15)} کۆپی</button></div>`;
}
function detailFootHtml(l) {
  if (l.status === 'pending') {
    const hasPrefill = !!(l.prefill && l.prefill.trim());
    return `${hasPrefill ? `<label class="r-check"><input type="checkbox" id="r-senddet" ${S.sendDetails ? 'checked' : ''}> زانیاری موڵکەکە ئامادە بکە لە نامەکەدا</label>` : ''}
      <button type="button" class="r-btn wa big" data-answer="${esc(l.id)}">${ic('chat', 22)} وەڵامدانەوە لە واتسئاپ</button>
      <button type="button" class="r-btn ghost" data-forward="${esc(l.id)}">${ic('swap', 17)} ناتوانم وەریبگرم</button>`;
  }
  if (l.number && isPhoneNum(l.number)) {
    return `<div class="r-row">
      <a class="r-btn wa big" href="${esc(waUrl(l.number, S.sendDetails && l.prefill ? l.prefill : ''))}" target="_blank" rel="noopener" data-wa="${esc(l.id)}">${ic('chat', 20)} واتسئاپ</a>
      <a class="r-btn big" href="${esc(telUrl(l.number))}" data-call="${esc(l.id)}">${ic('phone', 20)} پەیوەندی</a>
    </div>`;
  }
  return `<button type="button" class="r-btn big" data-act="close">${ic('back', 20)} گەڕانەوە</button>`;
}
function onDetailClick(e) {
  const t = e.target;
  if (t.closest('[data-act="close"]')) { closeLead(); return; }
  const a = t.closest('[data-answer]'); if (a) { answerLead(a.dataset.answer, a); return; }
  const f = t.closest('[data-forward]'); if (f) { forwardLead(f.dataset.forward); return; }
  const c = t.closest('[data-copy]'); if (c) { copyText(c.dataset.copy).then((ok) => toast(ok ? 'ژمارەکە کۆپی کرا' : 'کۆپی نەکرا', ok ? 'ok' : 'err')); return; }
  const w = t.closest('[data-wa]'); if (w) { markOpened(w.dataset.wa); return; }
  const more = t.closest('[data-more]'); if (more) { const b = more.previousElementSibling; if (b) b.classList.remove('r-clamp'); more.remove(); return; }
  const lb = t.closest('[data-lb]');
  if (lb) {
    const l = S.byId.get(S.detailId); const m = l && l.msgs && l.msgs[+lb.dataset.lb];
    if (m) lightbox(m.kind === 'gallery' ? m.images : [m.url], +lb.dataset.lbi || 0);
    return;
  }
  const chk = t.closest('#r-senddet'); if (chk) { S.sendDetails = chk.checked; lsSet('send_details', S.sendDetails); }
}

/* ============================ answer / forward ============================ */
function markOpened(id) {
  const l = S.byId.get(id); if (l) l.opened = true;
  rpc('realtor_mark_whatsapp_opened', { p_lead_id: id }).catch(() => {});
}
/* open WhatsApp / a phone call / Facebook outside the app */
function openOutside(url) {
  if (isNativeApp()) { location.href = url; return; }   // the Android app hands other addresses to the phone
  window.open(url, '_blank', 'noopener');
}
async function answerLead(id, btn) {
  const l = S.byId.get(id); if (!l) return;
  if (l.status === 'answered') {
    if (l.number && isPhoneNum(l.number)) { openOutside(waUrl(l.number, l.prefill)); markOpened(id); }
    return;
  }
  const withText = S.sendDetails && l.prefill ? l.prefill : '';
  // Open the new window right now, while the tap still counts, so the browser does not block it.
  // On an iPhone home-screen app this is unreliable, so there we show a big button instead.
  const iosApp = window.navigator.standalone === true;
  const native = isNativeApp();   // Android app: WhatsApp is opened directly after the answer is saved
  let win = null;
  if (!iosApp && !native) { try { win = window.open('', '_blank'); } catch (e) { win = null; } }
  busy(btn, true);
  try {
    const row = await rpc('realtor_answer_lead', { p_lead_id: id });
    const r = Array.isArray(row) ? row[0] : row;
    l.status = 'answered';
    l.number = (r && r.customer_number) || l.number;
    l.answeredAt = (r && r.first_response_at) || new Date().toISOString();
    S.pending = S.pending.filter((x) => x.id !== id);
    if (S.knownPending) S.knownPending.delete(id);
    S.answered = [l].concat(S.answered.filter((x) => x.id !== id));
    App.updateBadge();
    if (!l.number || !isPhoneNum(l.number)) {
      if (win) try { win.close(); } catch (e) { /* ignore */ }
      App.render(); if (S.detailId === id) paintDetail();
      sheet({ title: 'ژمارەی کڕیار شاراوەیە', html: `<p>نامەکە بوو بە هی تۆ، بەڵام ئەم کڕیارە ژمارەکەی لە واتسئاپ شاردۆتەوە، بۆیە ناتوانرێت ڕاستەوخۆ نامەی بۆ بنێریت.</p><p>تکایە پەیوەندی بە بەڕێوەبەرەوە بکە تاکو لە ڕێگەی کۆڵ سەنتەرەوە وەڵامی بداتەوە.</p>` });
      return;
    }
    const url = waUrl(l.number, withText);
    markOpened(id);
    if (win && !win.closed) {
      try { win.opener = null; win.location.href = url; } catch (e) { win = null; }
    }
    App.render(); if (S.detailId === id) paintDetail();
    saveCache();
    if (native) { openOutside(url); toast('نامەکە بوو بە هی تۆ'); }
    else if (!win) {
      sheet({ title: 'نامەکە بوو بە هی تۆ ✓', html: `<p>ژمارەی کڕیار: <b class="mono">${esc(niceNum(l.number))}</b></p><p>ئێستا واتسئاپ بکەرەوە و وەڵامی بدەرەوە.</p>`,
        actions: [{ label: 'کردنەوەی واتسئاپ', cls: 'wa', icon: 'chat', href: url }, { label: 'پەیوەندی', icon: 'phone', href: telUrl(l.number) }] });
    } else toast('نامەکە بوو بە هی تۆ');
  } catch (e) {
    if (win) try { win.close(); } catch (x) { /* ignore */ }
    if (e && /not your lead|already answered/i.test(e.message)) { loadAll(false); }
    toastErr(e);
  } finally { if (btn && btn.isConnected) busy(btn, false); }
}
function forwardLead(id) {
  const l = S.byId.get(id); if (!l) return;
  sheet({
    title: 'ناتوانیت ئەم نامەیە وەربگریت؟',
    html: `<p>نامەکەی <b>${esc(customerName(l))}</b> دەگوازرێتەوە بۆ کارمەندێکی تری گرووپەکەت، و ئیتر لە لیستەکەت نامێنێت.</p><p class="muted" style="font-size:13.5px">ئەم کارە ناگەڕێتەوە.</p>`,
    actions: [{
      label: 'بەڵێ، بیگوازەرەوە', cls: 'danger', icon: 'swap',
      onClick: async () => {
        const r = await rpc('realtor_forward_lead', { p_lead_id: id });
        S.pending = S.pending.filter((x) => x.id !== id);
        if (S.knownPending) S.knownPending.delete(id);
        S.byId.delete(id);
        App.updateBadge();
        if (S.detailId === id) closeLead();
        App.render(); saveCache();
        toast(r && r.outcome === 'forwarded' && r.new_realtor_name ? 'گوازرایەوە بۆ ' + r.new_realtor_name : 'نێردرا بۆ بەڕێوەبەر');
      },
    }],
    cancel: 'نەخێر، وەریدەگرم',
  });
}
