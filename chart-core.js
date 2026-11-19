(function (root) {
  'use strict';
  const PERIODS = Object.freeze({
    '7day': 'Últimos 7 dias', '1month': 'Último mês', '3month': 'Últimos 3 meses',
    '6month': 'Últimos 6 meses', '12month': 'Último ano', overall: 'Desde sempre'
  });

  function dimensions(cols, rows) {
    const values = [cols, rows].map(value => String(value).trim());
    const numbers = values.map(Number);
    if (values.some(value => !value) || numbers.some(value => !Number.isInteger(value) || value < 1 || value > 20)) {
      throw new Error('Use números inteiros de 1 a 20 para colunas e linhas.');
    }
    return { cols: numbers[0], rows: numbers[1], limit: numbers[0] * numbers[1] };
  }

  function config(values) {
    const size = dimensions(values.cols, values.rows);
    const username = String(values.username || '').trim();
    if (!username || username.length > 100 || /[\s/?#\\]/u.test(username)) {
      throw new Error('Informe apenas seu nome de usuário do Last.fm, sem espaços ou link.');
    }
    if (!Object.hasOwn(PERIODS, values.period)) throw new Error('Escolha um período válido.');
    return { username, period: values.period, ...size };
  }

  function identity(value) { return `${value.username.trim().toLowerCase()}|${value.period}`; }
  function requestKey(value) { return `${identity(value)}|${value.cols}x${value.rows}`; }
  function matches(a, b) { return Boolean(a && b && requestKey(a) === requestKey(b)); }

  function safeURL(value, lastfmOnly = false) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return '';
      if (lastfmOnly && url.hostname !== 'last.fm' && !url.hostname.endsWith('.last.fm')) return '';
      return url.href;
    } catch { return ''; }
  }

  function normalizeAlbum(album, index) {
    if (!album || typeof album.name !== 'string' || !album.name.trim()) return null;
    const images = Array.isArray(album.image) ? album.image : [];
    const preferred = ['extralarge', 'mega', 'large', 'medium', 'small']
      .map(size => images.find(image => image.size === size)?.['#text']);
    const image = [...preferred, ...images.map(item => item['#text'])].map(url => safeURL(url)).find(Boolean) || '';
    return {
      rank: index + 1, name: album.name,
      artist: (typeof album.artist === 'string' ? album.artist : album.artist?.name) || 'Artista desconhecido',
      image: image.includes('2a96cbd8b46e442fc41c2b86b821562f') ? '' : image,
      playcount: Math.max(0, Number.parseInt(album.playcount, 10) || 0), url: safeURL(album.url, true)
    };
  }

  function exportLayout(cols, rows, quality = 'standard') {
    dimensions(cols, rows);
    const cell = 220, gap = 14, margin = 28, header = 104, text = 84, footer = 44;
    const logicalWidth = margin * 2 + cols * cell + (cols - 1) * gap;
    const logicalHeight = margin * 2 + header + rows * (cell + text) + (rows - 1) * gap + footer;
    const maxEdge = quality === 'high' ? 4096 : 2400;
    const maxPixels = quality === 'high' ? 4_000_000 : 2_000_000;
    const scale = Math.min(2, maxEdge / logicalWidth, maxEdge / logicalHeight, Math.sqrt(maxPixels / (logicalWidth * logicalHeight)));
    return { cell, gap, margin, header, text, footer, logicalWidth, logicalHeight, scale,
      width: Math.max(1, Math.floor(logicalWidth * scale)), height: Math.max(1, Math.floor(logicalHeight * scale)) };
  }

  function filename(snapshot) {
    const username = snapshot.username.replace(/[^\p{L}\p{N}_.-]/gu, '_').slice(0, 100) || 'usuario';
    return `lastfm-${username}-${snapshot.period}-${snapshot.cols}x${snapshot.rows}.png`;
  }

  // A new request invalidates every previous response, even when abort is ignored by a transport.
  function createRequestGate() {
    let current = null, sequence = 0;
    return {
      start(key) {
        current?.controller.abort();
        const ticket = { key, id: ++sequence, controller: new AbortController() };
        current = ticket;
        return ticket;
      },
      isCurrent: ticket => current === ticket && !ticket.controller.signal.aborted,
      active: () => current,
      finish(ticket) { if (current === ticket) current = null; },
      cancel() { current?.controller.abort(); current = null; }
    };
  }

  function readPreferences(storage) {
    const defaults = { username: '', period: '1month', cols: 5, rows: 5, view: 'fit', quality: 'standard' };
    try {
      const saved = JSON.parse(storage.getItem('chartgen.preferences.v2'));
      if (!saved || typeof saved !== 'object') return defaults;
      let size;
      try { size = dimensions(saved.cols, saved.rows); } catch { size = dimensions(5, 5); }
      return { username: typeof saved.username === 'string' ? saved.username.slice(0, 100) : '',
        period: Object.hasOwn(PERIODS, saved.period) ? saved.period : defaults.period,
        cols: size.cols, rows: size.rows, view: saved.view === 'detail' ? 'detail' : 'fit',
        quality: saved.quality === 'high' ? 'high' : 'standard' };
    } catch { return defaults; }
  }

  const api = { PERIODS, dimensions, config, identity, requestKey, matches, safeURL, normalizeAlbum, exportLayout, filename, createRequestGate, readPreferences };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChartCore = api;
})(globalThis);
