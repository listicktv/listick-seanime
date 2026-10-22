// Listick for Seanime: tracking + tray. Each callback runs in its own runtime: keep it self-contained.

function init() {
  // progress updates -> UI runtime
  $app.onPreUpdateEntryProgress((e) => {
    if (e.mediaId && e.progress && e.progress > 0) $store.set('listick:watched', { id: e.mediaId, ep: e.progress, at: Date.now() });
    e.next();
  });

  $ui.register((ctx) => {
    const ICON = 'https://raw.githubusercontent.com/listicktv/listick-seanime/main/icon.png';
    const base = ($getUserPreference('url') || '').trim().replace(/\/+$/, ''), key = ($getUserPreference('key') || '').trim();
    const ready = !!base && !!key;
    let loadedAt = 0;
    const call = (method, path, body, extra) => ctx.fetch(base + path, {
      method, timeout: 20, body: body ? JSON.stringify(body) : undefined,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...extra },
    });
    // true: done or refused for good; false: try again
    const send = async (body) => {
      if (!ready) return true;
      try {
        const r = await call('POST', '/api/v1/anime/play', body);
        if (r.ok) { if (body.state === 'watched') loadedAt = 0; return true; }
        console.warn(`listick: ${body.state} ${body.anilistId} E${body.episode}: ${r.status}`);
        return r.status < 500 && r.status !== 429;
      } catch (err) { console.warn(`listick: ${err}`); return false; }
    };

    // ---------- tracking ----------
    let pending = [];
    const watched = async (body) => { if (!(await send(body))) pending = [...pending, body].slice(-50); };
    const retry = async () => { const q = pending; pending = []; for (const b of q) await watched(b); };
    $store.watch('listick:watched', (v) => { if (v) watched({ anilistId: v.id, episode: v.ep, state: 'watched' }); });

    let now = null, sentAt = 0;
    const playing = (id, ep, pct) => {
      if (!id || !ep) return;
      if (now && now.id === id && now.ep === ep && Date.now() - sentAt < 60000) return;
      now = { id, ep }; sentAt = Date.now();
      send({ anilistId: id, episode: ep, state: 'playing', progress: pct > 0 && pct <= 1 ? pct * 100 : pct });
    };
    const stopped = () => {
      if (!now) return;
      send({ anilistId: now.id, episode: now.ep, state: 'stopped' });
      now = null;
    };
    // desktop / external players
    ctx.playback.registerEventListener((e) => {
      if (e.isVideoStopped || e.isVideoCompleted || e.isStreamStopped || e.isStreamCompleted) return stopped();
      if (e.state) playing(e.state.mediaId, e.state.episodeNumber, e.state.completionPercentage);
    });
    // built-in player
    if (ctx.videoCore) {
      let cur = null;
      ctx.videoCore.addEventListener('video-loaded', (e) => {
        const i = e.state && e.state.playbackInfo;
        cur = i && i.media && i.episode ? { id: i.media.id, ep: i.episode.progressNumber || i.episode.episodeNumber } : null;
        if (cur) playing(cur.id, cur.ep, 0);
      });
      ctx.videoCore.addEventListener('video-status', (e) => { if (cur && !e.paused && e.duration > 0) playing(cur.id, cur.ep, (e.currentTime / e.duration) * 100); });
      ctx.videoCore.addEventListener('video-ended', () => stopped());
      ctx.videoCore.addEventListener('video-terminated', () => { stopped(); cur = null; });
    }

    // ---------- tray ----------
    const tray = ctx.newTray({ iconUrl: ICON, withContent: true, width: '400px', minHeight: '120px' });
    const data = ctx.state(null), error = ctx.state(''), loading = ctx.state(false);
    const listPick = ctx.fieldRef(''), rowPick = ctx.fieldRef('');
    listPick.onValueChange(() => tray.update());
    rowPick.onValueChange(() => tray.update());
    let etag = '';
    const load = async (force) => {
      if (!ready || loading.get() || (!force && Date.now() - loadedAt < 60000)) return;
      loading.set(true);
      try {
        const r = await call('GET', '/api/v1/anime', undefined, etag && data.get() ? { 'if-none-match': etag } : {});
        if (r.status === 304) { error.set(''); loadedAt = Date.now(); }
        else if (r.ok) {
          const d = r.json(), h = r.headers || {};
          etag = h.etag || h.Etag || h.ETag || '';
          data.set(d); error.set(''); loadedAt = Date.now(); syncHome();
          tray.updateBadge({ number: (d.upNext || []).length, intent: 'info' });
        } else error.set(r.status === 401 ? 'Wrong API key' : r.status === 403 ? 'This key is not a Seanime key' : `Listick answered ${r.status}`);
      } catch (err) { error.set("Can't reach Listick"); }
      loading.set(false);
      tray.update();
    };
    // ---------- Home ----------
    const HOME = String.raw`<!doctype html><html><head><meta charset="utf-8"><style>
html,body{background:transparent!important;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;color:#fff;font:14px/1.4 Inter,"Segoe UI",system-ui,sans-serif;--n:2;--gap:16px}
@media(min-width:640px){body{--n:3}}
@media(min-width:900px){body{--n:4}}
@media(min-width:1180px){body{--n:5}}
@media(min-width:1500px){body{--n:6}}
@media(min-width:1900px){body{--n:7}}
.bar{display:flex;justify-content:flex-end;margin:0 0 6px}
.pill{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.85);border-radius:999px;padding:7px 14px;cursor:pointer;font:inherit;font-size:13px}
.pill:hover,.pill[aria-expanded="true"]{background:rgba(255,255,255,.1);color:#fff}
.pill svg{width:16px;height:16px}
.picks{display:none;margin:0 0 28px;padding:18px 20px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.03)}
.picks.on{display:block}
.picks h3{margin:0 0 4px;font-size:16px;font-weight:600}
.picks .note{margin:0 0 14px;font-size:13px;color:rgba(255,255,255,.5)}
.grp{margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.45)}
.opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 24px;margin:0 0 14px}
.opt{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;cursor:pointer;user-select:none;border-bottom:1px solid rgba(255,255,255,.05)}
.opt input{position:absolute;opacity:0;pointer-events:none}
.sw{flex:none;width:36px;height:20px;border-radius:999px;background:rgba(255,255,255,.15);position:relative;transition:background .2s}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}
.opt input:checked + .sw{background:#6152df}
.opt input:checked + .sw::after{transform:translateX(16px)}
.opt input:focus-visible + .sw{outline:2px solid #a5b4fc;outline-offset:2px}
.sec{margin:0 0 32px}
.head{display:flex;align-items:center;gap:12px;margin:0 0 14px}
h2{flex:1;margin:0;font-size:24px;font-weight:600;letter-spacing:-.01em}
.arr{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:transparent;color:#fff;cursor:pointer;display:grid;place-items:center;padding:0}
.arr:hover{background:rgba(255,255,255,.08)}
.sec.fits .arr{visibility:hidden}
.arr svg{width:18px;height:18px}
.row{display:flex;gap:var(--gap);overflow-x:auto;scroll-behavior:smooth;scrollbar-width:none}
.row::-webkit-scrollbar{display:none}
.card{flex:0 0 calc((100% - (var(--n) - 1) * var(--gap)) / var(--n));cursor:pointer;background:none;border:0;padding:0;color:inherit;text-align:left;font:inherit}
.poster{aspect-ratio:6/8;width:100%;border-radius:8px;overflow:hidden;background:#16161c}
.poster img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s ease,filter .25s ease}
.card:hover .poster img{transform:scale(1.04);filter:brightness(1.08)}
.t{margin:10px 0 0;font-size:16px;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card:hover .t{color:#c7d2fe}
.s{margin:2px 0 0;font-size:14px;color:rgba(255,255,255,.5)}
</style></head><body>
<div class="bar"><button class="pill" id="g" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4"/></svg>Customize</button></div>
<div class="picks" id="p"></div>
<div id="r"></div>
<script>
var W = window.webview, d = null;
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var img = function (u) { return /^https?:\/\//.test(u || '') ? '<img loading="lazy" src="' + esc(u) + '" alt="">' : ''; };
var ARR = function (dir) { return '<button class="arr" data-dir="' + dir + '" aria-label="' + (dir < 0 ? 'Back' : 'More') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + (dir < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6') + '"/></svg></button>'; };
function render() {
  if (!d) return;
  document.getElementById('r').innerHTML = d.rows.map(function (r) {
    return '<div class="sec"><div class="head"><h2>' + esc(r.name) + '</h2>' + ARR(-1) + ARR(1) + '</div><div class="row">' + r.items.map(function (x) {
      return '<button class="card" data-id="' + Number(x.anilistId) + '"><div class="poster">' + img(x.poster) + '</div><p class="t">' + esc(x.title) + '</p><p class="s">' +
        (x.episode ? 'Episode ' + Number(x.episode) : esc(x.year || '')) + '</p></button>';
    }).join('') + '</div></div>';
  }).join('');
  var opt = function (o) {
    return '<label class="opt"><span>' + esc(o.name) + '</span><input type="checkbox" value="' + esc(o.id) + '"' + (d.picks.indexOf(o.id) >= 0 ? ' checked' : '') + '><span class="sw"></span></label>';
  };
  var group = function (name, os) { return os.length ? '<p class="grp">' + name + '</p><div class="opts">' + os.map(opt).join('') + '</div>' : ''; };
  document.getElementById('p').innerHTML = '<h3>Rows on Home</h3><p class="note">Up next and Plan to watch always show. Turn on any others.</p>' +
    group('Your lists', d.options.filter(function (o) { return o.group === 'lists'; })) + group('Discover', d.options.filter(function (o) { return o.group !== 'lists'; }));
  fits();
}
// arrows only on rows that scroll
function fits() {
  [].forEach.call(document.querySelectorAll('.sec'), function (s) { var r = s.querySelector('.row'); s.classList.toggle('fits', r.scrollWidth <= r.clientWidth + 1); });
}
window.addEventListener('resize', fits);
document.getElementById('r').addEventListener('click', function (e) {
  var a = e.target.closest('.arr');
  if (a) { var row = a.closest('.sec').querySelector('.row'); row.scrollBy({ left: Number(a.getAttribute('data-dir')) * row.clientWidth * 0.9 }); return; }
  var c = e.target.closest('.card'); if (c) W.send('open', Number(c.getAttribute('data-id')));
});
document.getElementById('p').addEventListener('change', function () {
  W.send('picks', JSON.stringify([].map.call(document.querySelectorAll('#p input:checked'), function (i) { return i.value; })));
});
document.getElementById('g').addEventListener('click', function () {
  var on = document.getElementById('p').classList.toggle('on');
  this.setAttribute('aria-expanded', String(on));
});
W.on('data', function (v) { d = typeof v === 'string' ? JSON.parse(v) : v; render(); });
</script></body></html>`;
    const homePicks = ctx.state($storage.get('homeRows') || []), homeData = ctx.state('');
    const syncHome = () => {
      const d = data.get();
      if (!d) return;
      const groups = [...(d.lists || []), ...(d.discover || [])], picks = homePicks.get();
      homeData.set(JSON.stringify({
        rows: [{ id: 'upnext', name: 'Up next', items: d.upNext || [] }, { id: 'plan', name: 'Plan to watch', items: d.plan || [] },
          ...picks.map((id) => groups.find((g) => g.id === id)).filter(Boolean)].filter((r) => r.items.length),
        options: [...(d.lists || []).map((g) => ({ id: g.id, name: g.owner ? `${g.name} · ${g.owner}` : g.name, group: 'lists' })),
          ...(d.discover || []).map((g) => ({ id: g.id, name: g.name, group: 'discover' }))], picks,
      }));
    };
    if (ready) {
      const home = ctx.newWebview({ slot: 'after-home-screen-toolbar', fullWidth: true, autoHeight: true });
      home.setContent(() => HOME);
      home.channel.sync('data', homeData);
      home.channel.on('open', (id) => { if (Number(id) > 0) ctx.screen.navigateTo('/entry', { id: String(Number(id)) }); });
      home.channel.on('picks', (v) => {
        let ids = [];
        try { ids = JSON.parse(v); } catch (err) { return; }
        ids = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string').slice(0, 30) : [];
        $storage.set('homeRows', ids); homePicks.set(ids); syncHome();
      });
    }

    tray.onOpen(() => { retry(); load(false); });
    ctx.setInterval(() => { retry(); load(true); }, 15 * 60000);
    load(true);

    const refresh = ctx.eventHandler('listick-refresh', () => load(true));
    const muted = { fontSize: '12px', color: 'rgba(255,255,255,0.55)' };
    const row = (x) => tray.flex([
      x.poster ? tray.img(x.poster, { width: '34px', height: '48px', style: { borderRadius: '4px', objectFit: 'cover', flexShrink: '0' } }) : tray.div([], { style: { width: '34px', height: '48px' } }),
      tray.stack([
        tray.text(x.title, { style: { fontSize: '13px', fontWeight: '600' } }),
        tray.text(x.episode ? `Episode ${x.episode}` : x.year ? String(x.year) : '', { style: muted }),
      ], { gap: 0, style: { flex: '1', minWidth: '0' } }),
      tray.button('Open', { size: 'xs', intent: 'gray-subtle', onClick: ctx.eventHandler(`listick-open-${x.anilistId}`, () => ctx.screen.navigateTo('/entry', { id: String(x.anilistId) })) }),
    ], { gap: 2, style: { alignItems: 'center' } });
    const rows = (xs, none) => (xs && xs.length ? xs.map(row) : [tray.text(none, { style: muted })]);
    // a dropdown of lists, then the picked one's titles
    const picker = (label, groups, ref, none) => {
      if (!groups || !groups.length) return [tray.text(none, { style: muted })];
      const g = groups.find((x) => x.id === ref.current) || groups[0];
      return [
        tray.select(label, { fieldRef: ref, value: g.id, options: groups.map((x) => ({ label: x.owner ? `${x.name} · ${x.owner}` : x.name, value: x.id })) }),
        ...rows(g.items, ''),
      ];
    };

    tray.render(() => {
      const title = tray.flex([
        tray.text('Listick', { style: { fontWeight: '600', fontSize: '14px', flex: '1' } }),
        ...(ready ? [tray.button('Refresh', { size: 'xs', intent: 'gray-subtle', loading: loading.get(), onClick: refresh })] : []),
      ], { style: { alignItems: 'center' } });
      if (!ready) return tray.stack([title, tray.text('Set your Listick address and API key in the plugin\'s settings (Extensions › Listick).', { style: muted })]);
      const d = data.get();
      if (!d) return tray.stack([title, tray.text(error.get() || 'Loading…', { style: muted })]);
      return tray.stack([
        title,
        ...(error.get() ? [tray.text(error.get(), { style: muted })] : []),
        tray.tabs({ defaultValue: 'upnext', items: [
          tray.tabsList([tray.tabsTrigger(tray.text('Up next'), { value: 'upnext' }), tray.tabsTrigger(tray.text('Plan'), { value: 'plan' }),
            tray.tabsTrigger(tray.text('Lists'), { value: 'lists' }), tray.tabsTrigger(tray.text('Discover'), { value: 'discover' })]),
          tray.tabsContent(rows(d.upNext, 'Nothing up next'), { value: 'upnext' }),
          tray.tabsContent(rows(d.plan, 'No anime in Plan to watch'), { value: 'plan' }),
          tray.tabsContent(picker('List', d.lists, listPick, 'No lists with anime'), { value: 'lists' }),
          tray.tabsContent(picker('Row', d.discover, rowPick, 'No rows yet'), { value: 'discover' }),
        ] }),
      ], { gap: 2 });
    });
  });
}
