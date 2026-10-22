// Fake Seanime: each callback evaluated from source in a fresh context.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const SOURCE = fs.readFileSync(new URL('../plugin.js', import.meta.url), 'utf8');
const ANIME = {
  upNext: [{ anilistId: 1000, key: 'tmdb:tv:1429', title: 'Attack on Titan', year: 2019, poster: 'https://img/p.jpg', episode: 4 }],
  plan: [{ anilistId: 7001, key: 'tmdb:tv:7000', title: 'Later', year: 2024, poster: null }],
  lists: [{ id: 'abc123', name: 'Favourites', items: [{ anilistId: 3000, key: 'kitsu:anime:300', title: 'Solo', year: 2020, poster: null }] },
    { id: 'def456', name: 'Kai picks', owner: 'kai', items: [{ anilistId: 21, key: 'tmdb:tv:37854', title: 'One Piece', year: 1999, poster: null }] }],
  discover: [{ id: 'anime-trending', name: 'Trending anime', items: [{ anilistId: 154587, key: 'tmdb:tv:209867', title: 'Frieren', year: 2023, poster: null }] }],
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const plain = (x) => JSON.parse(JSON.stringify(x));   // cross-context objects

function seanime(prefs, fails = []) {
  const watchers = {}, store = {}, hooks = {}, calls = [], handlers = {}, listeners = {}, video = {}, nav = [];
  let register = null, renderFn = null, openFn = null, badge = null;
  const $store = { set: (k, v) => { store[k] = v; (watchers[k] || []).forEach((f) => f(v)); }, get: (k) => store[k], watch: (k, f) => { (watchers[k] ||= []).push(f); } };
  const storage = {}, $storage = { get: (k) => storage[k], set: (k, v) => { storage[k] = v; } };
  const $anilist = { getAnimeCollection: () => ({ MediaListCollection: { lists: [{ entries: [
    { progress: 3, status: 'CURRENT', score: 80, media: { id: 154587, title: { romaji: 'Sousou no Frieren', english: "Frieren: Beyond Journey's End", userPreferred: "Frieren: Beyond Journey's End" } } }] }] } }) };
  const base = { $store, $storage, $anilist, $getUserPreference: (k) => prefs[k], console: { warn: () => {}, log: () => {}, error: () => {} }, Date, JSON, String, Math, Promise };
  const fresh = (fn, extra = {}) => vm.runInNewContext(`(${fn.toString()})`, { ...base, ...extra });
  const component = (type) => (...args) => ({ type, args });
  const tray = new Proxy({
    render: (f) => { renderFn = f; }, onOpen: (f) => { openFn = f; }, update: () => {}, updateBadge: (b) => { badge = b; },
  }, { get: (t, k) => t[k] || component(k) });
  const refs = [], web = { on: {}, synced: null, html: '' };
  const ctx = {
    fetch: async (url, opts) => {
      calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers.authorization, inm: opts.headers['if-none-match'] });
      if (url === 'https://graphql.anilist.co') return { ok: true, status: 200, json: () => ({ data: { Page: { media: JSON.parse(opts.body).variables.ids.map((id) => ({
        id, title: { romaji: `R${id}`, english: id === 154587 ? "Frieren: Beyond Journey's End" : null, userPreferred: `R${id}` }, coverImage: { extraLarge: `https://img/${id}.jpg` },
        season: 'FALL', seasonYear: 2023, format: 'TV', status: 'FINISHED', episodes: 28, meanScore: 90 })) } } }) };
      if (url.endsWith('/api/v1/anime')) return opts.headers['if-none-match'] === '"t1"' ? { ok: false, status: 304, headers: {}, json: () => null }
        : { ok: true, status: 200, headers: { Etag: '"t1"' }, json: () => ANIME };
      const status = fails.shift() || 200;
      return { ok: status < 300, status, json: () => ({}) };
    },
    state: (v) => ({ get: () => v, set: (n) => { v = n; } }),
    fieldRef: (v) => { const r = { current: v, cbs: [], setValue: (n) => { r.current = n; r.cbs.forEach((f) => f(n)); }, onValueChange: (f) => r.cbs.push(f) }; refs.push(r); return r; },
    newTray: () => tray, setInterval: () => () => {},
    newWebview: (o) => { web.opts = o; return { setContent: (f) => { web.html = f(); }, channel: { sync: (k, s) => { web.synced = s; }, on: (k, f) => { web.on[k] = f; } } }; },
    eventHandler: (k, f) => { handlers[k] = f; return k; },
    screen: { navigateTo: (path, params) => nav.push([path, params]) },
    playback: { registerEventListener: (f) => { listeners.playback = f; } },
    videoCore: { addEventListener: (t, f) => { video[t] = f; } },
  };
  const $app = new Proxy({}, { get: (_, k) => (f) => { hooks[k] = f; } });
  const $ui = { register: (f) => { register = f; } };
  vm.runInNewContext(`${SOURCE}\ninit();`, { ...base, $app, $ui });
  fresh(register)(ctx);
  const hook = (name, e) => { let next = false; fresh(hooks[name])({ ...e, next: () => { next = true; } }); return next; };
  const texts = (node, out = []) => {
    if (Array.isArray(node)) node.forEach((n) => texts(n, out));
    else if (node && node.args) node.args.forEach((a) => (typeof a === 'string' && (node.type === 'text' || node.type === 'switch') ? out.push(a) : typeof a === 'object' ? texts(a.items || a, out) : null));
    return out;
  };
  return { calls, handlers, listeners, video, nav, refs, web, storage, hook, render: () => texts(renderFn()), open: () => openFn(), badge: () => badge };
}

test('without an address and key it asks for them and calls nothing', async () => {
  const s = seanime({ url: '', key: '' });
  await tick();
  assert.deepEqual(s.calls, []);
  assert.match(s.render().join(' '), /Listick address and API key/);
});

test('an episode Seanime counts goes to Listick as watched', async () => {
  const s = seanime({ url: 'https://listick.example/', key: 'k123' });
  await tick();
  assert.equal(s.hook('onPreUpdateEntryProgress', { mediaId: 1000, progress: 3 }), true, 'the update goes on');
  s.hook('onPreUpdateEntryProgress', { mediaId: 1000, progress: 0 });
  await tick();
  const plays = s.calls.filter((c) => c.url.endsWith('/api/v1/anime/play'));
  assert.deepEqual(plays.map((c) => [c.url, c.auth, c.body]), [['https://listick.example/api/v1/anime/play', 'Bearer k123', { anilistId: 1000, episode: 3, state: 'watched' }]]);
});

test('a failed watched send is tried again later, a refused one is not', async () => {
  const s = seanime({ url: 'https://listick.example', key: 'k123' }, [500, 404]);
  await tick();
  s.hook('onPreUpdateEntryProgress', { mediaId: 1000, progress: 3 });
  s.hook('onPreUpdateEntryProgress', { mediaId: 4242, progress: 1 });
  await tick();
  s.open();
  await tick();
  const plays = s.calls.filter((c) => c.url.endsWith('/api/v1/anime/play')).map((c) => c.body.anilistId);
  assert.deepEqual(plays, [1000, 4242, 1000]);
});

test('the tray shows Up next, Plan to watch and lists, opens an anime, and badges Up next', async () => {
  const s = seanime({ url: 'https://listick.example', key: 'k123' });
  await tick();
  assert.equal(s.calls[0].url, 'https://listick.example/api/v1/anime');
  const text = s.render();
  for (const t of ['Attack on Titan', 'Episode 4', 'Later', 'Solo', 'Frieren']) assert.ok(text.includes(t), t);
  assert.ok(!text.includes('One Piece'), 'only the picked list shows');
  s.refs[0].setValue('def456');
  assert.ok(s.render().includes('One Piece'), 'another list picked');
  assert.deepEqual(plain(s.badge()), { number: 1, intent: 'info' });
  s.handlers['listick-open-1000']();
  assert.deepEqual(plain(s.nav), [['/entry', { id: '1000' }]]);
  s.open();
  await tick();
  assert.equal(s.calls.filter((c) => c.method === 'GET').length, 1, 'opening again within a minute uses what it has');
  s.handlers['listick-refresh']();
  await tick();
  const gets = s.calls.filter((c) => c.method === 'GET');
  assert.equal(gets.at(-1).inm, '"t1"', 'a refresh asks whether anything changed');
  assert.ok(s.render().includes('Frieren'), 'a 304 keeps what it has');
});

test('the built-in player and other players show as watching now, then stopped', async () => {
  const s = seanime({ url: 'https://listick.example', key: 'k123' });
  await tick();
  s.video['video-loaded']({ state: { playbackInfo: { media: { id: 1000 }, episode: { episodeNumber: 4, progressNumber: 4 } } } });
  s.video['video-status']({ paused: false, currentTime: 600, duration: 1200 });
  s.video['video-terminated']({});
  s.listeners.playback({ state: { mediaId: 3000, episodeNumber: 2, completionPercentage: 0.5 } });
  s.listeners.playback({ isVideoCompleted: true });
  await tick();
  assert.deepEqual(s.calls.filter((c) => c.url.endsWith('/api/v1/anime/play')).map((c) => c.body), [
    { anilistId: 1000, episode: 4, state: 'playing', progress: 0 },
    { anilistId: 1000, episode: 4, state: 'stopped' },
    { anilistId: 3000, episode: 2, state: 'playing', progress: 50 },
    { anilistId: 3000, episode: 2, state: 'stopped' },
  ], 'status within a minute of the last send is not sent again');
});

test('Home shows Up next, Plan to watch and the rows you turn on in the tray, as Seanime cards', async () => {
  const s = seanime({ url: 'https://listick.example', key: 'k123' });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(s.web.opts.slot, 'after-home-screen-toolbar');
  assert.match(s.web.html, /esc\(x\.title\)/, 'titles are escaped');
  const home = () => JSON.parse(s.web.synced.get());
  assert.deepEqual(home().rows.map((r) => r.name), ['Up next', 'Plan to watch']);
  const f = home().rows[0].items.find((x) => x.anilistId === 154587) || home().rows.flatMap((r) => r.items).find((x) => x.anilistId === 154587);
  assert.equal(f, undefined, 'Frieren is only in Discover here');
  const aot = home().rows[0].items[0];
  assert.deepEqual([aot.title, aot.cover, aot.season, aot.episodes, aot.progress], ['R1000', 'https://img/1000.jpg', 'FALL', 28, 0], 'AniList details');
  s.handlers['listick-home-view']();
  const tray = s.render().join(' ');
  for (const t of ['Your lists', 'Discover', 'Favourites', 'Trending anime']) assert.ok(tray.includes(t), t);
  s.handlers['listick-home-anime-trending']({ value: true });
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(home().rows.map((r) => r.name), ['Up next', 'Plan to watch', 'Trending anime'], 'a row turned on');
  assert.deepEqual(plain(s.storage.homeRows), ['anime-trending'], 'kept for next time');
  const fr = home().rows[2].items[0];
  assert.deepEqual([fr.title, fr.progress, fr.listStatus, fr.score], ["Frieren: Beyond Journey's End", 3, 'CURRENT', 8], 'your AniList progress, English titles as you prefer');
  s.handlers['listick-home-anime-trending']({ value: false });
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(home().rows.map((r) => r.name), ['Up next', 'Plan to watch'], 'and off again');
  s.web.on.open(154587);
  assert.deepEqual(plain(s.nav), [['/entry', { id: '154587' }]]);
});
