// Listick for Seanime: tracking, tray and Home rows.

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
    const muted = { fontSize: '12px', color: 'rgba(255,255,255,0.55)' };
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
html,body{background:transparent!important;color-scheme:dark;overflow:hidden}
*{box-sizing:border-box}
body{margin:0;padding:0 16px;display:flow-root;color:rgb(209,209,209);font:14px/1.4 Inter,"Segoe UI",system-ui,sans-serif;--n:2;--gap:16px;--muted:rgb(140,140,140);--brand:rgb(159,146,255);--pop:rgb(11,11,11)}
@media(min-width:640px){body{--n:3;padding:0 32px}}
@media(min-width:900px){body{--n:4}}
@media(min-width:1180px){body{--n:5}}
@media(min-width:1500px){body{--n:6}}
@media(min-width:1900px){body{--n:7}}
.sec{margin:0 0 28px}
.head{display:flex;align-items:center;gap:12px;margin:0 0 6px}
h2{flex:1;margin:0;font-size:24px;font-weight:600;color:#fff;letter-spacing:-.01em}
.arr{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:transparent;color:#fff;cursor:pointer;display:grid;place-items:center;padding:0}
.arr:hover{background:rgba(255,255,255,.08)}
.arr svg{width:18px;height:18px}
.sec.fits .arr{visibility:hidden}
.row{display:flex;gap:var(--gap);overflow-x:auto;scroll-behavior:smooth;scrollbar-width:none;padding:18px 4px 6px;margin:0 -4px}
.row::-webkit-scrollbar{display:none}
.card{position:relative;flex:0 0 calc((100% - (var(--n) - 1) * var(--gap)) / var(--n));cursor:pointer;outline:0}
.body{position:relative;aspect-ratio:6/8;border-radius:.5rem;overflow:hidden;isolation:isolate;background:rgb(20,20,20)}
.body>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .3s ease}
.card:hover .body>img{transform:scale(1.1)}
.grad{position:absolute;z-index:5;left:0;right:0;bottom:-4px;height:40%;opacity:.8;background:linear-gradient(to top,#0c0c0c,transparent)}
.prog{position:absolute;z-index:6;top:0;left:0;width:100%;height:4px;background:rgb(40,40,40)}
.prog i{position:absolute;left:0;top:0;height:4px;background:rgb(143,143,143)}
.prog.cur i{background:var(--brand)}
.rel{position:absolute;z-index:10;right:4px;top:8px;display:grid;place-items:center;height:26px;padding:0 7px;border-radius:999px;background:rgb(97,82,223);color:#fff}
.rel.soon{background:rgb(63,63,70)}
.rel svg{width:15px;height:15px}
.badge{position:absolute;z-index:10;left:0;bottom:0;font-weight:600;letter-spacing:.025em;font-size:14px;padding:2px 6px;border-radius:.5rem;border-top-left-radius:0;border-bottom-right-radius:0;background:rgba(9,9,11,.4);color:#fff}
.badge span{color:var(--muted)}
.score{position:absolute;z-index:10;right:0;bottom:0;font-weight:600;font-size:13px;padding:2px 6px;border-radius:.5rem;border-top-right-radius:0;border-bottom-left-radius:0;background:rgba(9,9,11,.6);color:#fff}
.ts{padding-top:8px}
.t{margin:0;font-size:16px;font-weight:500;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.s{margin:4px 0 0;font-size:14px;color:var(--muted)}
.pop{position:absolute;z-index:15;top:-5%;left:-1.5%;width:103%;height:105%;display:none;flex-direction:column;justify-content:space-between;padding:8px;border-radius:.7rem;border:1px solid rgba(255,255,255,.05);background:var(--pop);opacity:0;transition:opacity .15s ease}
@media(min-width:1024px){.pop{display:flex}.card:hover .pop,.card:focus-visible .pop{opacity:1}}
.ban{position:relative;aspect-ratio:4/2;border-radius:.5rem .5rem 0 0;overflow:hidden;isolation:isolate;margin:0 0 8px;background:linear-gradient(to top,rgb(20,20,20),transparent)}
.ban>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ban .bg{position:absolute;z-index:2;left:0;right:0;bottom:-4px;height:80%;background:linear-gradient(to top,var(--pop) 10%,transparent)}
.ban .badge{z-index:4}
.pt{margin:0 8px;text-align:center;font-size:15px;font-weight:500;line-height:1.15;color:#fff;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pt:hover{color:rgb(199,194,255)}
.po{margin:2px 16px 0;text-align:center;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ps{margin:6px 0 0;display:flex;justify-content:center;align-items:center;gap:4px;font-size:13px;color:var(--muted)}
.ps svg{width:14px;height:14px}
.watch{margin:8px 0 0;width:100%;display:flex;align-items:center;justify-content:center;gap:6px;height:34px;border:0;border-radius:.5rem;background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:14px;font-weight:500;cursor:pointer}
.watch:hover{background:rgba(255,255,255,.14)}
.watch svg{width:20px;height:20px}
.na{margin:6px 0 0;text-align:center;font-size:12px}
.na b{font-weight:600}
.st{margin:4px 0 0;text-align:center;font-size:12px;color:var(--muted)}
.foot{display:flex;align-items:center;gap:8px}
.ms{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.06);font-size:12px;font-weight:600}
.ms svg{width:13px;height:13px;color:rgb(244,114,182)}
</style></head><body>
<div id="r"></div>
<script>
var W = window.webview, d = null;
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var url = function (u) { return /^https?:\/\//.test(u || '') ? esc(u) : ''; };
var cap = function (s) { s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
var SVG = function (p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; };
var TOWER = SVG('<path d="M12 12v9M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/><circle cx="12" cy="12" r="1"/>');
var CAL = SVG('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>');
var PLAY = SVG('<path d="M8 5l11 7-11 7z" fill="currentColor"/>');
var HEART = SVG('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor"/>');
var ARR = function (dir) { return '<button class="arr" data-dir="' + dir + '" aria-label="' + (dir < 0 ? 'Back' : 'More') + '">' + SVG('<path d="' + (dir < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6') + '"/>') + '</button>'; };
function until(sec) {
  var m = Math.round((sec * 1000 - Date.now()) / 60000);
  if (m < 60) return 'in ' + Math.max(1, m) + ' minutes';
  if (m < 1440) return 'in ' + Math.round(m / 60) + ' hours';
  var days = Math.round(m / 1440); return 'in ' + days + (days === 1 ? ' day' : ' days');
}
function progBar(x) {
  if (!x.progress || !x.episodes || x.listStatus === 'COMPLETED') return '';
  return '<div class="prog' + (x.listStatus === 'CURRENT' ? ' cur' : '') + '"><i style="width:' + Math.min(100, Math.ceil(x.progress / x.episodes * 100)) + '%"></i></div>';
}
function relBadge(x) {
  return x.status === 'RELEASING' || x.status === 'NOT_YET_RELEASED' ? '<div class="rel' + (x.status === 'RELEASING' ? '' : ' soon') + '" title="' + (x.status === 'RELEASING' ? 'Releasing' : 'Not yet released') + '">' + TOWER + '</div>' : '';
}
function progBadge(x, always) {
  if (!x.progress && !(always && x.episodes)) return '';
  return '<div class="badge">' + Number(x.progress || 0) + (x.episodes || always ? '<span>/' + (x.episodes ? Number(x.episodes) : '-') + '</span>' : '') + '</div>';
}
function card(x) {
  var when = [cap(x.season), x.year].filter(Boolean).join(' ');
  var fmt = x.format && x.format !== 'TV' ? ' - ' + esc(String(x.format).replace(/_/g, ' ')) : '';
  var cont = x.progress && (x.listStatus === 'CURRENT' || x.listStatus === 'PAUSED');
  return '<div class="card" tabindex="0" data-id="' + Number(x.anilistId) + '">' +
    '<div class="pop"><div>' +
      '<div class="ban">' + (x.progress !== x.episodes ? progBar(x) : '') + relBadge(x) +
        (url(x.banner || x.cover) ? '<img loading="lazy" src="' + url(x.banner || x.cover) + '" alt="">' : '') + progBadge(x, true) + '<div class="bg"></div></div>' +
      '<p class="pt">' + esc(x.title) + '</p>' + (x.otherTitle ? '<p class="po">' + esc(x.otherTitle) + '</p>' : '') +
      (when ? '<p class="ps">' + CAL + ' ' + esc(when) + fmt + '</p>' : '') +
      '<button class="watch">' + PLAY + (cont ? 'Continue' : 'Watch') + '</button>' +
      (x.next ? '<p class="na">Episode <b>' + Number(x.next.episode) + '</b> ' + until(x.next.at) + '</p>' : '') +
      (x.listStatus && x.listStatus !== 'CURRENT' ? '<p class="st">' + cap(x.listStatus) + '</p>' : '') +
    '</div><div class="foot">' + (x.meanScore ? '<span class="ms">' + HEART + Number(x.meanScore) + '%</span>' : '') + '</div></div>' +
    '<div class="body">' + progBar(x) + relBadge(x) + (url(x.cover) ? '<img loading="lazy" src="' + url(x.cover) + '" alt="">' : '') + '<div class="grad"></div>' + progBadge(x, false) +
      (x.score ? '<div class="score">' + Number(x.score) + '</div>' : '') + '</div>' +
    '<div class="ts"><p class="t">' + esc(x.title) + '</p>' + (when ? '<p class="s">' + esc(when) + '</p>' : x.episode ? '<p class="s">Episode ' + Number(x.episode) + '</p>' : '') + '</div>' +
  '</div>';
}
function render() {
  if (!d) return;
  document.getElementById('r').innerHTML = d.rows.map(function (r) {
    return '<div class="sec"><div class="head"><h2>' + esc(r.name) + '</h2>' + ARR(-1) + ARR(1) + '</div><div class="row">' + r.items.map(card).join('') + '</div></div>';
  }).join('');
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
document.getElementById('r').addEventListener('keydown', function (e) {
  var c = e.target.closest && e.target.closest('.card'); if (c && e.key === 'Enter') W.send('open', Number(c.getAttribute('data-id')));
});
W.on('data', function (v) { d = typeof v === 'string' ? JSON.parse(v) : v; render(); });
</script></body></html>`;
    const homePicks = ctx.state($storage.get('homeRows') || []), homeData = ctx.state(''), homeView = ctx.state(false);
    // AniList details, cached
    const media = new Map(), MEDIA_MS = 6 * 3600000;
    const QUERY = 'query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id title{romaji english userPreferred} coverImage{extraLarge large} bannerImage season seasonYear startDate{year} format status episodes meanScore nextAiringEpisode{episode airingAt}}}}';
    const fetchMedia = async (ids) => {
      if (media.size > 3000) media.clear();
      const missing = [...new Set(ids)].filter((id) => !media.has(id) || Date.now() - media.get(id).at > MEDIA_MS);
      for (let i = 0; i < missing.length; i += 50) {
        try {
          const r = await ctx.fetch('https://graphql.anilist.co', { method: 'POST', timeout: 20, headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ query: QUERY, variables: { ids: missing.slice(i, i + 50) } }) });
          if (!r.ok) break;
          for (const m of ((r.json().data || {}).Page || {}).media || []) media.set(m.id, { at: Date.now(), m });
        } catch (err) { break; }
      }
    };
    // your AniList progress and status, and whether titles show in English
    const listData = () => {
      const byId = new Map();
      let english = false;
      try {
        for (const l of ($anilist.getAnimeCollection(false).MediaListCollection || {}).lists || [])
          for (const e of l.entries || []) {
            if (!e.media) continue;
            byId.set(e.media.id, { progress: e.progress, status: e.status, score: e.score });
            const t = e.media.title || {};
            if (t.english && t.romaji && t.english !== t.romaji && t.userPreferred) english = t.userPreferred === t.english;
          }
      } catch (err) { console.warn(`listick: AniList list: ${err}`); }
      return { byId, english };
    };
    const homeItem = (x, ld) => {
      const m = (media.get(x.anilistId) || {}).m, l = ld.byId.get(x.anilistId) || {};
      if (!m) return { anilistId: x.anilistId, title: x.title, cover: x.poster, year: x.year, episode: x.episode };
      const t = m.title || {}, title = (ld.english && t.english) || t.userPreferred || t.romaji || x.title;
      const other = [t.english, t.romaji].find((o) => o && o.toUpperCase() !== title.toUpperCase()) || null;
      return {
        anilistId: x.anilistId, title, otherTitle: other, cover: (m.coverImage || {}).extraLarge || (m.coverImage || {}).large || x.poster, banner: m.bannerImage || null,
        season: m.season || null, year: m.seasonYear || (m.startDate || {}).year || x.year, format: m.format || null, status: m.status || null, episodes: m.episodes || null,
        meanScore: m.meanScore || null, next: m.nextAiringEpisode ? { episode: m.nextAiringEpisode.episode, at: m.nextAiringEpisode.airingAt } : null,
        progress: l.progress || 0, listStatus: l.status || null, score: l.score ? (l.score > 10 ? Math.round(l.score) / 10 : l.score) : null, episode: x.episode,
      };
    };
    let homeRun = 0;
    const syncHome = async () => {
      const d = data.get();
      if (!d) return;
      const run = ++homeRun, groups = [...(d.lists || []), ...(d.discover || [])];
      const rows = [{ id: 'upnext', name: 'Up next', items: d.upNext || [] }, { id: 'plan', name: 'Plan to watch', items: d.plan || [] },
        ...homePicks.get().map((id) => groups.find((g) => g.id === id)).filter(Boolean)].filter((r) => r.items.length);
      await fetchMedia(rows.flatMap((r) => r.items.map((x) => x.anilistId)));
      if (run !== homeRun) return;
      const ld = listData();
      homeData.set(JSON.stringify({ rows: rows.map((r) => ({ name: r.name, items: r.items.map((x) => homeItem(x, ld)) })) }));
    };
    const setPicks = (ids) => {
      const v = ids.filter((x) => typeof x === 'string').slice(0, 30);
      $storage.set('homeRows', v); homePicks.set(v); syncHome(); tray.update();
    };
    if (ready) {
      const home = ctx.newWebview({ slot: 'after-home-screen-toolbar', fullWidth: true, autoHeight: true });
      home.setContent(() => HOME);
      home.channel.sync('data', homeData);
      home.channel.on('open', (id) => { if (Number(id) > 0) ctx.screen.navigateTo('/entry', { id: String(Number(id)) }); });
    }
    const toggleView = ctx.eventHandler('listick-home-view', () => { homeView.set(!homeView.get()); tray.update(); });
    const on = (e) => (e && typeof e === 'object' ? !!e.value : !!e);
    // the tray's Home rows view: a switch per list and row
    const homeRows = (d) => {
      const picks = homePicks.get();
      const sw = (g) => tray.switch(g.owner ? `${g.name} · ${g.owner}` : g.name, {
        value: picks.includes(g.id),
        onChange: ctx.eventHandler(`listick-home-${g.id}`, (e) => setPicks(on(e) ? [...homePicks.get().filter((x) => x !== g.id), g.id] : homePicks.get().filter((x) => x !== g.id))),
      });
      const group = (name, gs) => (gs && gs.length ? [tray.text(name, { style: { fontSize: '11px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginTop: '8px' } }), ...gs.map(sw)] : []);
      return [
        tray.text('Up next and Plan to watch always show.', { style: muted }),
        ...group('Your lists', d.lists), ...group('Discover', d.discover),
      ];
    };

    tray.onOpen(() => { retry(); load(false); });
    ctx.setInterval(() => { retry(); load(true); }, 15 * 60000);
    load(true);

    const refresh = ctx.eventHandler('listick-refresh', () => load(true));
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
        ...(ready ? [tray.button(homeView.get() ? 'Done' : 'Home rows', { size: 'xs', intent: homeView.get() ? 'primary-subtle' : 'gray-subtle', onClick: toggleView }),
          tray.button('Refresh', { size: 'xs', intent: 'gray-subtle', loading: loading.get(), onClick: refresh })] : []),
      ], { style: { alignItems: 'center' } });
      if (!ready) return tray.stack([title, tray.text('Set your Listick address and API key in the plugin\'s settings (Extensions › Listick).', { style: muted })]);
      const d = data.get();
      if (!d) return tray.stack([title, tray.text(error.get() || 'Loading…', { style: muted })]);
      if (homeView.get()) return tray.stack([title, ...homeRows(d)], { gap: 2 });
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
