(function (root) {
  'use strict';
  const Core = typeof module !== 'undefined' && module.exports ? require('./chart-core.js') : root.ChartCore;
  const ERRORS = {
    6: 'Usuário não encontrado. Confira o nome informado.', 10: 'A chave de acesso ao Last.fm não está válida.',
    11: 'O Last.fm está temporariamente indisponível. Tente novamente.',
    16: 'O Last.fm não conseguiu concluir a busca. Tente novamente.',
    26: 'O acesso desta aplicação ao Last.fm está suspenso.',
    29: 'Muitas buscas em pouco tempo. Aguarde um momento e tente novamente.'
  };
  const abortError = () => new DOMException('Busca cancelada.', 'AbortError');

  function createClient({ apiKey, fetchImpl = (...args) => fetch(...args), timeoutMs = 15000, ttlMs = 300000, now = Date.now } = {}) {
    const cache = new Map();

    async function request(params, signal) {
      if (signal?.aborted) throw abortError();
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const query = new URLSearchParams({ method: 'user.gettopalbums', api_key: apiKey, format: 'json', ...params });
        const response = await fetchImpl(`https://ws.audioscrobbler.com/2.0/?${query}`, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (signal?.aborted) throw abortError();
        if (!response.ok) throw new Error(response.status === 429 ? ERRORS[29] : 'Não foi possível consultar o Last.fm. Tente novamente.');
        const data = await response.json();
        if (signal?.aborted) throw abortError();
        if (data?.error) throw new Error(ERRORS[data.error] || 'O Last.fm retornou um erro. Tente novamente.');
        if (!data?.topalbums || typeof data.topalbums !== 'object') throw new Error('O Last.fm retornou dados inesperados. Tente novamente.');
        return data.topalbums;
      } catch (error) {
        if (signal?.aborted) throw abortError();
        if (timedOut) throw new Error('O Last.fm demorou para responder. Tente novamente.');
        if (error instanceof TypeError) throw new Error('Não foi possível conectar ao Last.fm. Confira sua conexão.');
        if (error instanceof SyntaxError) throw new Error('O Last.fm retornou uma resposta inválida. Tente novamente.');
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
    }

    async function getAlbums({ username, period, limit, signal, refresh = false }) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 400) throw new Error('Quantidade inválida de álbuns.');
      if (signal?.aborted) throw abortError();
      const key = Core.identity({ username, period });
      const saved = cache.get(key);
      if (!refresh && saved && now() - saved.time < ttlMs && (saved.albums.length >= limit || saved.exhausted)) {
        // Promote recently used entries without retaining an unbounded browsing history.
        cache.delete(key); cache.set(key, saved);
        return { ...saved, albums: saved.albums.slice(0, limit), cached: true };
      }
      const albums = [];
      const perPage = Math.min(100, limit);
      let total = null, exhausted = false;
      for (let page = 1; page <= Math.ceil(limit / perPage); page++) {
        const top = await request({ user: username, period, limit: String(perPage), page: String(page) }, signal);
        const raw = top.album == null ? [] : Array.isArray(top.album) ? top.album : [top.album];
        const attr = top['@attr'] || {};
        if (attr.total != null && Number.isFinite(Number(attr.total))) total = Math.max(0, Number(attr.total));
        raw.forEach((album, index) => {
          const item = Core.normalizeAlbum(album, (page - 1) * perPage + index);
          if (item) albums.push(item);
        });
        const pages = Number(attr.totalPages);
        exhausted = raw.length < perPage || (total !== null && page * perPage >= total) || (pages > 0 && page >= pages);
        if (exhausted || albums.length >= limit) break;
      }
      if (signal?.aborted) throw abortError();
      const entry = { albums, total, exhausted, time: now() };
      cache.delete(key); cache.set(key, entry);
      while (cache.size > 12) cache.delete(cache.keys().next().value);
      return { ...entry, albums: albums.slice(0, limit), cached: false };
    }
    return { getAlbums };
  }
  const api = { createClient };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LastfmClient = api;
})(globalThis);
