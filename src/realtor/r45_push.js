/* ============================ notifications (OneSignal) ============================
   Android app  -> native OneSignal through window.Capacitor.Plugins.BsgPush (real native push)
   iPhone PWA   -> OneSignal Web SDK, only on the address saved in OneSignal (bsglink.online)
   Both log in with app_users.id, the same id the server already sends every new lead to. */
const PUSH_APP_ID = '64d04a6a-e9b8-43b5-b0ab-f752e586bcb9';
const PUSH_WEB_ORIGINS = ['https://bsglink.online', 'https://www.bsglink.online'];
const isNativeApp = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const Push = {
  state: 'unknown',   // on | off | denied | install | unsupported | unknown
  sdk: null,          // web: OneSignal object
  started: false,
  plugin() {
    const C = window.Capacitor; if (!C) return null;
    if (!this._p) this._p = typeof C.registerPlugin === 'function' ? C.registerPlugin('BsgPush') : (C.Plugins && C.Plugins.BsgPush) || null;
    return this._p;
  },
  webAllowed() { return PUSH_WEB_ORIGINS.includes(location.origin); },
  set(s) { if (this.state !== s) { this.state = s; lsSet('push_state', s); if (App.render && S.me) App.render(); } },

  async start() {
    if (!S.me || !S.me.app_user_id) return;
    const uid = String(S.me.app_user_id);
    try {
      if (isNativeApp()) {
        const p = this.plugin(); if (!p) { this.set('unsupported'); return; }
        if (!this.started) {
          this.started = true;
          p.addListener('click', () => { if (typeof loadAll === 'function') loadAll(false); location.hash = '#/inbox'; });
          document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
        }
        await p.login({ externalId: uid });
        await this.refresh();
        // first run: ask right away (Android shows its own "Allow notifications?" box)
        if (this.state !== 'on' && !lsGet('push_asked', false)) { lsSet('push_asked', true); await this.enable(true); }
        return;
      }
      if (isIOS() && !isStandalone()) { this.set('install'); return; }
      if (!('Notification' in window) || !('serviceWorker' in navigator)) { this.set('unsupported'); return; }
      if (!this.webAllowed()) { this.set('unsupported'); return; }
      const OS = await this.loadWeb(); if (!OS) { this.set('unsupported'); return; }
      await OS.login(uid);
      await this.refresh();
    } catch (e) { this.set('unknown'); }
  },
  loadWeb() {
    if (this._web) return this._web;
    this._web = new Promise((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OS) => {
        try {
          await OS.init({ appId: PUSH_APP_ID, serviceWorkerPath: 'OneSignalSDKWorker.js', serviceWorkerParam: { scope: '/' }, notifyButton: { enable: false } });
          OS.Notifications.addEventListener('permissionChange', () => this.refresh());
          this.sdk = OS; resolve(OS);
        } catch (e) { resolve(null); }
      });
      const s = document.createElement('script');
      s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; s.defer = true;
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
      setTimeout(() => resolve(null), 15000);
    });
    return this._web;
  },
  async refresh() {
    try {
      if (isNativeApp()) {
        const r = await this.plugin().status();
        this.set(r.permission && r.optedIn !== false ? 'on' : (lsGet('push_asked', false) && !r.permission ? 'denied' : 'off'));
        return;
      }
      if (!this.sdk) return;
      const native = this.sdk.Notifications.permissionNative;
      const opted = this.sdk.User && this.sdk.User.PushSubscription ? this.sdk.User.PushSubscription.optedIn : true;
      this.set(native === 'granted' && opted ? 'on' : native === 'denied' ? 'denied' : 'off');
    } catch (e) { /* keep the last state */ }
  },
  async enable(silent) {
    try {
      if (isNativeApp()) {
        const r = await this.plugin().requestPermission();
        await this.refresh();
        if (!r.granted && !silent) this.explainDenied();
        return;
      }
      if (this.state === 'install') { installHelp(); return; }
      const OS = this.sdk || await this.loadWeb();
      if (!OS) { if (!silent) toast('ئاگادارکردنەوە لەم وێبگەڕە کار ناکات', 'err'); return; }
      await OS.Notifications.requestPermission();
      if (OS.User && OS.User.PushSubscription && !OS.User.PushSubscription.optedIn) await OS.User.PushSubscription.optIn();
      await this.refresh();
      if (this.state !== 'on' && !silent) this.explainDenied();
    } catch (e) { if (!silent) toastErr(e); }
  },
  explainDenied() {
    const native = isNativeApp();
    sheet({
      title: 'ئاگادارکردنەوە داخراوە',
      html: native
        ? '<p>بۆ ئەوەی هەر نامەیەکی نوێ بێت ئاگادار بکرێیتەوە، لە ڕێکخستنەکانی مۆبایل ئاگادارکردنەوە بۆ ئەم ئەپە بکەرەوە.</p><p class="muted">ئەگەر مۆبایلەکەت Xiaomi، Oppo یان Huawei ـە: لە ڕێکخستنی باتری ئەم ئەپە «No restrictions» هەڵبژێرە.</p>'
        : '<p>لە ڕێکخستنەکانی iPhone: <b>Settings ← Notifications</b> ← ئەم ئەپە ← <b>Allow Notifications</b> دابگیرسێنە.</p>',
      actions: native ? [{ label: 'کردنەوەی ڕێکخستنەکان', cls: 'primary', icon: 'bell', onClick: async () => { await this.plugin().openSettings(); } }] : [],
      cancel: 'باشە',
    });
  },
  async test(btn) {
    busy(btn, true);
    try {
      const r = await rpc('realtor_test_push');
      if (r && r.ok === false && r.reason === 'too soon') toast('چەند چرکەیەک چاوەڕێ بکە و دووبارە هەوڵ بدەرەوە');
      else toast('ناردرا — لە چەند چرکەیەکدا دەگات');
    } catch (e) { toastErr(e); }
    finally { busy(btn, false); }
  },
  async logout() {
    try {
      if (isNativeApp()) { const p = this.plugin(); if (p) await p.logout(); }
      else if (this.sdk) await this.sdk.logout();
    } catch (e) { /* ignore */ }
    lsDel('push_state');
  },
};
Push.state = lsGet('push_state', 'unknown');

App.pushCardHtml = function () {
  if (!S.me || Push.state === 'on' || Push.state === 'unknown' || Push.state === 'unsupported') return '';
  if (Push.state === 'install') return '';   // the install card already explains this
  const denied = Push.state === 'denied';
  return `<div class="r-banner warn r-push-card">${ic('bell', 18)}<div><b>ئاگادارکردنەوە ${denied ? 'داخراوە' : 'کوژاوەتەوە'}.</b> کاتێک نامەیەکی نوێ دێت نازانیت. <button type="button" class="r-btn sm primary" data-act="pushon" style="margin-top:8px">${ic('bell', 15)} داگیرساندن</button></div></div>`;
};
App.pushSettingsHtml = function () {
  const st = Push.state;
  const label = { on: 'داگیرساوە ✓', off: 'کوژاوەتەوە', denied: 'لە ڕێکخستنی مۆبایلدا داخراوە', install: 'سەرەتا ئەپەکە لەسەر شاشە دابنێ', unsupported: 'لەم وێبگەڕە کار ناکات', unknown: '…' }[st] || '…';
  return `<h2 class="r-sec-h">ئاگادارکردنەوە</h2>
    <div class="r-card"><div class="r-set">
      <div class="r-set-row"><span class="r-set-ic">${ic('bell', 20)}</span>
        <div class="t"><b>ئاگادارکردنەوەی نامەی نوێ</b><small class="${st === 'on' ? 'ok' : ''}">${esc(label)}</small></div>
        ${st === 'on' ? '' : st === 'install' ? `<button type="button" class="r-btn sm primary" data-act="install">چۆن؟</button>` : st === 'unsupported' ? '' : `<button type="button" class="r-btn sm primary" data-act="pushon">داگیرساندن</button>`}
      </div>
      ${st === 'on' ? `<div class="r-set-row"><span class="r-set-ic">${ic('send', 20)}</span><div class="t"><b>تاقیکردنەوە</b><small>ئاگادارکردنەوەیەکی تاقیکاری بۆ ئەم مۆبایلە بنێرە</small></div><button type="button" class="r-btn sm" data-act="pushtest">ناردن</button></div>` : ''}
    </div></div>`;
};
