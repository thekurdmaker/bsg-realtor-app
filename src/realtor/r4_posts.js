
/* ============================ posts ============================ */
const BOOST = {
  running: { label: 'ڕیکلامی چالاک', cls: 'ok', icon: 'rocket' },
  ended: { label: 'ڕیکلامی تەواوبوو', cls: '', icon: 'clock' },
  none: { label: 'بێ ڕیکلام', cls: 'warn', icon: 'megaphone' },
};
function boostState(x) {
  const spent = Number(x.spend) > 0;
  if (!x.start && !spent) return 'none';
  if (x.active === false) return 'ended';
  if (x.expired && Date.now() >= new Date(x.expired).getTime()) return 'ended';
  if (!x.start) return x.status === 'ended' ? 'ended' : 'running';
  return Date.now() <= boostEnd(x) ? 'running' : 'ended';
}
const boostEnd = (x) => (x.fbEnd ? new Date(x.fbEnd).getTime() : x.start ? new Date(x.start).getTime() + (Number(x.days) || 0) * 864e5 : null);
const CODE_RX = /(?:code|کۆد|کود|كود)\s*[:：\-]?\s*[A-Za-z]*[-_]?[0-9]+/i;
function capHeadline(c) {
  const lines = String(c || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => /\p{L}/u.test(l) && !CODE_RX.test(l) && !/^[*\-_=🔶\s]+$/u.test(l));
  return lines[0] || '';
}

async function loadPosts() {
  const [rows, fbRows] = await Promise.all([
    rpc('realtor_get_my_posts').then((r) => r || []),
    rpc('realtor_get_fb_posts').then((r) => r || []).catch(() => null),   // Facebook page posts with my phone number
  ]);
  const ids = rows.map((r) => r.facebook_post_id).filter(Boolean);
  let extra = [];
  if (ids.length) {
    const inList = encodeURIComponent('(' + ids.map(pgQuote).join(',') + ')');
    extra = (await get(`posts?select=facebook_post_id,realtor_id,group_id,image_url,sponsor_start_at,sponsor_days,sponsor_spend_usd,active,expired_at,created_at&facebook_post_id=in.${inList}`)) || [];
  }
  const ex = new Map(extra.map((x) => [x.facebook_post_id, x]));
  const gName = new Map(S.groups.map((g) => [g.group_id, g.group_name]));
  const list = rows.map((r) => {
    const x = ex.get(r.facebook_post_id) || {};
    return {
      id: r.facebook_post_id, kind: 'sys', headline: r.headline || '', code: r.post_code || '', reply: r.reply_template || '',
      caption: r.caption || '', url: r.facebook_post_url || '',
      total: Number(r.total) || 0, answered: Number(r.answered) || 0, waiting: Number(r.waiting) || 0,
      forwarded: Number(r.forwarded) || 0, escalated: Number(r.escalated) || 0, status: r.post_status || '',
      image: x.image_url && x.image_url !== 'none' ? x.image_url : '',
      mine: !!(S.me && x.realtor_id && x.realtor_id === S.me.realtor_id),
      groupId: x.group_id || null, groupName: gName.get(x.group_id) || '',
      start: x.sponsor_start_at || null, days: x.sponsor_days, spend: x.sponsor_spend_usd,
      active: x.active, expired: x.expired_at || null, createdAt: x.created_at || null,
    };
  });
  const byId = new Map(list.map((p) => [p.id, p]));
  const fb = fbRows || [];
  fb.forEach((f) => {
    const fbInfo = { fb: true, fbRunning: !!f.running, fbEver: !!f.ever_boosted, runKind: f.run_kind || null, fbEnd: f.ad_end || null };
    const sys = f.system_post ? byId.get(f.system_post) : null;
    if (sys) {
      if (sys.fbPost) return;                      // one Facebook post per system post is enough
      Object.assign(sys, fbInfo, { fbPost: f.post_id });
      if (!sys.image && f.picture) sys.image = f.picture;
      if (!sys.url && f.permalink_url) sys.url = f.permalink_url;
      if (!sys.caption && f.message) sys.caption = f.message;
      if (f.created_time && !sys.createdAt) sys.createdAt = f.created_time;
      return;
    }
    list.push(Object.assign({
      id: 'fb:' + f.post_id, kind: 'fb', fbPost: f.post_id, headline: capHeadline(f.message), code: f.code || '', reply: '',
      caption: f.message || '', url: f.permalink_url || '', image: f.picture || '', mine: false,
      total: 0, answered: 0, waiting: 0, forwarded: 0, escalated: 0, createdAt: f.created_time || null,
    }, fbInfo));
  });
  list.forEach((p) => {
    const sysState = p.kind === 'sys' ? boostState(p) : 'none';
    p.boost = p.fb ? (p.fbRunning ? 'running' : (p.fbEver || sysState !== 'none') ? 'ended' : 'none') : sysState;
    p.sortAt = p.createdAt ? new Date(p.createdAt).getTime() : 0;
  });
  list.sort((a, b) => (b.boost === 'running') - (a.boost === 'running') || b.sortAt - a.sortAt);
  S.posts = list;
  S.fbPostsOk = fbRows !== null;
  S.postById = new Map(S.posts.map((p) => [p.id, p]));
  S.postsLoaded = true;
}

const POST_FILTERS = [['boosted', 'بووستکراو'], ['running', 'چالاک'], ['ended', 'تەواوبوو'], ['none', 'بێ بووست'], ['leads', 'نامەی هەیە'], ['all', 'هەموو']];
function postMatch(p, f) {
  if (f === 'all') return true;
  if (f === 'boosted') return p.boost !== 'none';
  if (f === 'leads') return p.total > 0;
  return p.boost === f;
}
function renderPosts(main) {
  const f = POST_FILTERS.some(([k]) => k === S.postsFilter) ? S.postsFilter : 'boosted';
  const counts = {}; POST_FILTERS.forEach(([k]) => { counts[k] = S.posts.filter((p) => postMatch(p, k)).length; });
  const list = S.posts.filter((p) => postMatch(p, f));
  main.innerHTML = `
    ${!S.online ? `<div class="r-banner bad">${ic('wifiOff', 18)}<div><b>ئینتەرنێت نییە.</b> ئەمانە دوایین زانیارین.</div></div>` : ''}
    <div class="r-filters" role="group" aria-label="جۆری پۆست">${POST_FILTERS.map(([k, l]) => `<button type="button" data-pf="${k}" aria-pressed="${f === k}">${esc(l)} <span class="n">${fmtN(counts[k] || 0)}</span></button>`).join('')}</div>
    <div class="r-list">${postsListHtml(list, f)}</div>`;
  if (S.chipJump) {
    S.chipJump = false;
    const on = main.querySelector('[data-pf][aria-pressed="true"]');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}
function postsListHtml(list, f) {
  if (!S.postsLoaded && !list.length) return [0, 1].map(() => '<div class="r-skel"><i style="height:150px;border-radius:12px"></i><i style="width:70%"></i><i style="width:40%"></i></div>').join('');
  if (!list.length) {
    if (f === 'none') return `<div class="r-empty">${ic('megaphone', 44)}<b>هەموو پۆستەکانت بووست کراون</b><p>ئەو پۆستانەی ژمارەکەی تۆیان تێدایە و هەرگیز بووست نەکراون لێرە دەردەکەون.</p></div>`;
    if (f === 'running') return `<div class="r-empty">${ic('rocket', 44)}<b>ئێستا هیچ ڕیکلامێکی چالاکت نییە</b><p>کاتێک پۆستێکت بووست بکرێت، لێرە دەردەکەوێت.</p></div>`;
    if (f === 'leads') return `<div class="r-empty">${ic('inbox', 44)}<b>هێشتا هیچ نامەیەک لە پۆستەکانتەوە نەهاتووە</b></div>`;
    return `<div class="r-empty">${ic('megaphone', 44)}<b>هیچ پۆستێکت نییە</b><p>ئەو پۆستانەی پەیجی فەیسبووک کە ژمارەکەی تۆیان تێدایە لێرە دەردەکەون.</p></div>`;
  }
  return list.map(postCard).join('');
}
function postCard(p) {
  const b = BOOST[p.boost];
  const end = boostEnd(p);
  let when = '';
  if (p.boost === 'running' && end) when = 'تا ' + fmtD(new Date(end).toISOString());
  else if (p.boost === 'ended' && end) when = 'تەواو بوو ' + fmtD(new Date(end).toISOString());
  else if (p.kind === 'fb' && p.createdAt) when = 'بڵاوکرایەوە ' + fmtD(p.createdAt);
  const label = p.boost === 'running' && p.runKind === 'call' ? 'ڕیکلامی پەیوەندی' : b.label;
  const url = safeUrl(p.url);
  return `<article class="r-post" data-post="${esc(p.id)}">
    <div class="r-post-img">
      ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" data-pimg="${esc(p.id)}">` : `<div class="r-noimg">${ic('image', 44)}</div>`}
      <span class="r-badge-img ${esc(p.boost)}"><span class="dot"></span>${esc(label)}</span>
      ${p.code ? `<span class="r-code-img">${esc(p.code)}</span>` : ''}
    </div>
    <div class="r-post-b">
      <h3>${esc(p.headline || 'بێ ناونیشان')}</h3>
      <div class="r-post-owner">${p.kind === 'fb' ? ic('user', 13) + ' ژمارەکەت لە پۆستەکەدایە' : p.mine ? ic('user', 13) + ' پۆستی خۆت' : ic('users', 13) + ' پۆستی گرووپ' + (p.groupName ? ': ' + esc(p.groupName) : '')}${when ? ' · ' + esc(when) : ''}</div>
      ${p.kind === 'fb' ? (p.boost === 'running' && p.runKind === 'call' ? `<div class="r-post-note">${ic('phone', 14)} کڕیار ڕاستەوخۆ پەیوەندیت پێوە دەکات</div>` : '') : `<div class="r-stats3">
        <div><b class="num">${fmtN(p.total)}</b><small>کڕیار</small></div>
        <div><b class="num">${fmtN(p.answered)}</b><small>وەرگیراو</small></div>
        <div class="${p.waiting ? 'w' : ''}"><b class="num">${fmtN(p.waiting)}</b><small>چاوەڕێ</small></div>
      </div>`}
      <div class="r-post-acts">
        ${url ? `<a class="r-btn sm soft" href="${esc(url)}" target="_blank" rel="noopener">${ic('external', 15)} فەیسبووک</a>` : ''}
        ${url ? `<button type="button" class="r-btn sm" data-share="${esc(p.id)}">${ic('share', 15)} ناردن</button>` : ''}
        ${p.caption ? `<button type="button" class="r-btn sm" data-copycap="${esc(p.id)}">${ic('copy', 15)} کۆپی دەق</button>` : ''}
        ${p.mine ? `<button type="button" class="r-btn sm" data-editreply="${esc(p.id)}">${ic('edit', 15)} نامەی ئامادە</button>` : ''}
      </div>
      <div class="r-req">
        <div class="r-req-h">${ic('send', 14)} داواکاری <span class="r-soon">بەم زووانە</span></div>
        <div class="r-req-row">
          <button type="button" disabled aria-disabled="true">${ic('rocket', 18)}<span>داوای بووست</span></button>
          <button type="button" disabled aria-disabled="true">${ic('repeat', 18)}<span>دووبارە بڵاوکردنەوە</span></button>
          <button type="button" disabled aria-disabled="true">${ic('plus', 18)}<span>پۆستی نوێ</span></button>
        </div>
      </div>
    </div>
  </article>`;
}
function onPostsClick(e) {
  const t = e.target;
  const pf = t.closest('[data-pf]'); if (pf) { S.postsFilter = pf.dataset.pf; S.chipJump = true; App.render(); return; }
  const img = t.closest('[data-pimg]') || (t.closest('.r-post-img') && t.closest('.r-post-img').querySelector('[data-pimg]')); if (img) { const p = S.postById.get(img.dataset.pimg); if (p && p.image) lightbox([p.image], 0); return; }
  const sh = t.closest('[data-share]');
  if (sh) {
    const p = S.postById.get(sh.dataset.share); if (!p) return;
    const text = (p.headline || '') + (p.code ? ' — Code:' + p.code : '');
    if (navigator.share) { navigator.share({ title: p.headline || '', text, url: p.url }).catch(() => {}); }
    else copyText(p.url).then((ok) => toast(ok ? 'لینکی پۆستەکە کۆپی کرا' : 'کۆپی نەکرا', ok ? 'ok' : 'err'));
    return;
  }
  const cc = t.closest('[data-copycap]');
  if (cc) { const p = S.postById.get(cc.dataset.copycap); if (p) copyText(p.caption).then((ok) => toast(ok ? 'دەقی پۆستەکە کۆپی کرا' : 'کۆپی نەکرا', ok ? 'ok' : 'err')); return; }
  const er = t.closest('[data-editreply]'); if (er) { editReply(er.dataset.editreply); }
}
function editReply(id) {
  const p = S.postById.get(id); if (!p) return;
  sheet({
    title: 'نامەی ئامادە بۆ ئەم پۆستە',
    html: `<p style="font-size:14px">کاتێک وەڵامی کڕیارێکی ئەم پۆستە دەدەیتەوە، ئەم دەقە خۆکارانە لە واتسئاپ ئامادە دەبێت. دەتوانیت نرخ، ڕووبەر یان هەر زانیارییەکی تر بنووسیت.</p>
      <div class="r-field"><label class="r-label" for="r-reply">دەق</label><textarea class="r-textarea" id="r-reply" rows="8">${esc(p.reply)}</textarea></div>`,
    actions: [{
      label: 'پاشەکەوتکردن', cls: 'primary', icon: 'check',
      onClick: async (s) => {
        const v = $('#r-reply', s.el).value;
        await rpc('realtor_update_post_reply', { p_facebook_post_id: id, p_reply_template: v });
        p.reply = v;
        S.pending.concat(S.answered).forEach((l) => { if (l.postId === id) l.prefill = v; });
        saveCache();
        toast('پاشەکەوت کرا');
      },
    }],
    cancel: 'پاشگەزبوونەوە',
  });
}
