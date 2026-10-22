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
    const call = (method, path, body) => ctx.fetch(base + path, {
      method, timeout: 20, body: body ? JSON.stringify(body) : undefined,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
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
    const tray = ctx.newTray({ iconUrl: ICON, withContent: true, width: '340px', minHeight: '120px' });
    const data = ctx.state(null), error = ctx.state(''), loading = ctx.state(false);
    const load = async (force) => {
      if (!ready || loading.get() || (!force && Date.now() - loadedAt < 60000)) return;
      loading.set(true);
      try {
        const r = await call('GET', '/api/v1/anime');
        if (r.ok) {
          const d = r.json();
          data.set(d); error.set(''); loadedAt = Date.now();
          tray.updateBadge({ number: (d.upNext || []).length, intent: 'info' });
        } else error.set(r.status === 401 ? 'Wrong API key' : r.status === 403 ? 'This key is not a Seanime key' : `Listick answered ${r.status}`);
      } catch (err) { error.set("Can't reach Listick"); }
      loading.set(false);
      tray.update();
    };
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
    const rows = (xs, none) => (xs && xs.length ? xs.slice(0, 30).map(row) : [tray.text(none, { style: muted })]);

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
          tray.tabsList([tray.tabsTrigger(tray.text('Up next'), { value: 'upnext' }), tray.tabsTrigger(tray.text('Plan to watch'), { value: 'plan' }), tray.tabsTrigger(tray.text('Lists'), { value: 'lists' })]),
          tray.tabsContent(rows(d.upNext, 'Nothing up next'), { value: 'upnext' }),
          tray.tabsContent(rows(d.plan, 'No anime in Plan to watch'), { value: 'plan' }),
          tray.tabsContent((d.lists || []).length ? d.lists.flatMap((l) => [tray.text(l.name, { style: { fontWeight: '600', fontSize: '12px', marginTop: '6px' } }), ...rows(l.items, '')])
            : [tray.text('No lists with anime', { style: muted })], { value: 'lists' }),
        ] }),
      ], { gap: 2 });
    });
  });
}
