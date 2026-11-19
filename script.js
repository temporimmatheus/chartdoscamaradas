(function () {
  'use strict';
  const Core = ChartCore;
  const client = LastfmClient.createClient({ apiKey: '8b2854f4f61653b88a4161656c020b46' });
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['chart-form','settings-fields','username','period','cols','rows','fetch-btn','export-btn','status','error','retry-btn','chart-grid','chart-container','chart-summary','chart-user','chart-meta','empty-state','empty-title','empty-description','view-fit','view-detail','loading-indicator','quality','export-info','cancel-export','download-link','share-btn','album-dialog','close-dialog','album-cover','album-rank','album-title','album-artist','album-plays','album-link'].map(id => [id, $(id)]));
  const gate = Core.createRequestGate();
  const state = { snapshot: null, loading: false, exporting: false, exportController: null,
    view: 'fit', cards: new Map(), download: null };
  const integerFormat = new Intl.NumberFormat('pt-BR');
  const rawConfig = () => ({ username: ui.username.value, period: ui.period.value, cols: ui.cols.value, rows: ui.rows.value });
  const getConfig = () => Core.config(rawConfig());

  function preferences() {
    try { localStorage.setItem('chartgen.preferences.v2', JSON.stringify({ ...rawConfig(), view: state.view, quality: ui.quality.value })); } catch { /* Storage may be unavailable in private mode. */ }
  }
  function message(text) { ui.status.textContent = text; }
  function clearError() { ui.error.hidden = true; ui.error.textContent = ''; ui['retry-btn'].hidden = true; }
  function showError(text, retry = false) { ui.error.textContent = text; ui.error.hidden = false; ui['retry-btn'].hidden = !retry; }
  function selectionMatches() { try { return Core.matches(state.snapshot, getConfig()); } catch { return false; } }
  function clearDownload() {
    if (state.download) URL.revokeObjectURL(state.download.url);
    state.download = null;
    ui['download-link'].hidden = true;
    ui['download-link'].removeAttribute('href');
    ui['share-btn'].hidden = true;
  }
  function controls() {
    ui['fetch-btn'].disabled = state.loading || state.exporting;
    ui['settings-fields'].disabled = state.exporting;
    ui.quality.disabled = state.exporting;
    ui['export-btn'].disabled = state.exporting || state.loading || !state.snapshot?.albums.length || !selectionMatches();
    ui['cancel-export'].hidden = !state.exporting;
    ui['loading-indicator'].hidden = !state.loading;
    ui['chart-container'].setAttribute('aria-busy', String(state.loading));
    document.querySelectorAll('[data-size]').forEach(button => {
      const selected = Number(ui.cols.value) === Number(button.dataset.size) && Number(ui.rows.value) === Number(button.dataset.size);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (!state.exporting) {
      if (state.snapshot?.albums.length) {
        const layout = Core.exportLayout(state.snapshot.cols, state.snapshot.rows, ui.quality.value);
        ui['export-info'].textContent = `${layout.width} × ${layout.height} px`;
      } else ui['export-info'].textContent = '';
    }
  }
  function empty(title, description) {
    ui['empty-title'].textContent = title; ui['empty-description'].textContent = description;
    ui['empty-state'].hidden = false; ui['chart-grid'].hidden = true;
  }
  function clearResult(title = 'Nenhum chart gerado', description = 'Preencha seu usuário e clique em Gerar chart.') {
    state.snapshot = null; state.cards.clear(); ui['chart-grid'].replaceChildren();
    ui['chart-summary'].hidden = true; clearDownload(); empty(title, description);
  }
  function setView(view) {
    state.view = view === 'detail' ? 'detail' : 'fit';
    ui['chart-container'].dataset.view = state.view;
    ui['view-fit'].setAttribute('aria-pressed', String(state.view === 'fit'));
    ui['view-detail'].setAttribute('aria-pressed', String(state.view === 'detail'));
    preferences();
  }
  function validation(focus = false) {
    ui.username.removeAttribute('aria-invalid');
    for (const field of [ui.cols, ui.rows]) {
      const number = Number(field.value);
      const invalid = !field.value.trim() || !Number.isInteger(number) || number < 1 || number > 20;
      field.setAttribute('aria-invalid', String(invalid));
    }
    try { return getConfig(); }
    catch (error) {
      const invalidSize = [ui.cols, ui.rows].find(field => field.getAttribute('aria-invalid') === 'true');
      if (!invalidSize) ui.username.setAttribute('aria-invalid', 'true');
      showError(error.message);
      if (focus) (invalidSize || ui.username).focus();
      return null;
    }
  }
  function makeCard(album, index) {
    const item = document.createElement('div'); item.className = 'cell'; item.setAttribute('role', 'listitem');
    const button = document.createElement('button'); button.className = 'album-card'; button.type = 'button';
    button.setAttribute('aria-label', `${album.rank}. ${album.name}, ${album.artist}. Ver detalhes.`);
    button.title = `${album.name} — ${album.artist}`;
    button.addEventListener('click', () => details(album));
    const cover = document.createElement('span'); cover.className = 'cover';
    const record = document.createElement('span'); record.className = 'cover-record'; record.setAttribute('aria-hidden', 'true'); cover.append(record);
    if (album.image) {
      const image = document.createElement('img');
      image.alt = ''; image.width = image.height = 300;
      image.loading = index < 10 ? 'eager' : 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => { image.remove(); }, { once: true });
      image.src = album.image; cover.append(image);
    }
    button.append(cover);
    for (const [className, text] of [['rank', `#${album.rank}`], ['album-name', album.name], ['artist-name', album.artist]]) {
      const span = document.createElement('span'); span.className = className; span.textContent = text; button.append(span);
    }
    item.append(button); return item;
  }
  function render(snapshot) {
    clearDownload();
    ui['chart-summary'].hidden = false;
    ui['chart-user'].textContent = `@${snapshot.username}`;
    const shown = snapshot.albums.length, slots = snapshot.cols * snapshot.rows;
    ui['chart-meta'].textContent = `${Core.PERIODS[snapshot.period]} · ${snapshot.cols} × ${snapshot.rows} · ${integerFormat.format(shown)} ${shown === 1 ? 'álbum' : 'álbuns'}`;
    if (!shown) {
      ui['chart-grid'].replaceChildren(); state.cards.clear();
      empty('Nenhum álbum neste período', 'Escolha outro período ou confira se este perfil tem scrobbles de álbuns.');
      return;
    }
    const fragment = document.createDocumentFragment(), nextCards = new Map();
    snapshot.albums.forEach((album, index) => {
      const key = JSON.stringify([album.rank, album.name, album.artist, album.image, album.playcount, album.url]);
      const card = state.cards.get(key) || makeCard(album, index);
      fragment.append(card); nextCards.set(key, card);
    });
    for (let index = shown; index < slots; index++) {
      const key = `empty-${index}`;
      let card = state.cards.get(key);
      if (!card) { card = document.createElement('div'); card.className = 'empty-cell'; card.textContent = '—'; card.setAttribute('aria-hidden', 'true'); }
      fragment.append(card); nextCards.set(key, card);
    }
    state.cards = nextCards;
    ui['chart-grid'].replaceChildren(fragment);
    ui['chart-container'].style.setProperty('--cols', snapshot.cols);
    ui['chart-container'].dataset.dense = String(snapshot.cols > 7);
    ui['chart-grid'].hidden = false; ui['empty-state'].hidden = true;
  }
  async function loadChart({ focus = false, refresh = false } = {}) {
    if (state.exporting) return;
    const config = validation(focus);
    if (!config) { gate.cancel(); state.loading = false; controls(); return; }
    const key = Core.requestKey(config);
    if (gate.active()?.key === key) return;
    const ticket = gate.start(key);
    state.loading = true; clearError(); clearDownload(); preferences(); controls();
    message('Buscando álbuns no Last.fm…');
    try {
      const result = await client.getAlbums({ ...config, signal: ticket.controller.signal, refresh });
      if (!gate.isCurrent(ticket)) return;
      state.snapshot = { ...config, albums: result.albums, total: result.total };
      render(state.snapshot);
      if (!result.albums.length) message('Nenhum álbum encontrado neste período.');
      else if (result.albums.length < config.limit) message(`${result.albums.length} álbuns encontrados. Os espaços restantes ficarão vazios.`);
      else message(`${result.albums.length} álbuns carregados.${result.cached ? ' Resultado recente reutilizado.' : ''}`);
      if (focus && window.matchMedia?.('(max-width: 760px)').matches) {
        const preview = $('preview');
        preview.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        preview.focus({ preventScroll: true });
      }
    } catch (error) {
      if (!gate.isCurrent(ticket)) return;
      clearResult('Não foi possível carregar o chart', 'Confira a mensagem de erro e tente novamente.');
      message('A busca não foi concluída.'); showError(error.message, true);
    } finally {
      if (gate.active() === ticket) { gate.finish(ticket); state.loading = false; controls(); }
    }
  }
  function identityEdited() {
    if (state.exporting) return;
    gate.cancel(); state.loading = false; clearError(); clearDownload();
    ui.username.removeAttribute('aria-invalid'); preferences(); controls();
    message(selectionMatches() && state.snapshot?.albums.length ? 'Chart pronto para exportar.' : 'Clique em Gerar chart para carregar este usuário e período.');
  }
  function sizeEdited() {
    if (state.exporting) return;
    preferences();
    const config = validation();
    if (!config) { gate.cancel(); state.loading = false; controls(); return; }
    clearError();
    if (state.snapshot && Core.identity(state.snapshot) === Core.identity(config)) loadChart();
    else { gate.cancel(); state.loading = false; controls(); message('Clique em Gerar chart para carregar esta configuração.'); }
  }
  function details(album) {
    ui['album-rank'].textContent = `ÁLBUM #${album.rank}`;
    ui['album-title'].textContent = album.name; ui['album-artist'].textContent = album.artist;
    ui['album-plays'].textContent = `${integerFormat.format(album.playcount)} ${album.playcount === 1 ? 'reprodução' : 'reproduções'} neste período`;
    ui['album-link'].hidden = !album.url;
    if (album.url) ui['album-link'].href = album.url; else ui['album-link'].removeAttribute('href');
    const image = ui['album-cover']; image.hidden = true; image.removeAttribute('src');
    image.onload = () => { image.hidden = false; }; image.onerror = () => { image.hidden = true; };
    if (album.image) image.src = album.image;
    ui['album-dialog'].showModal();
  }
  async function exportChart() {
    if (state.exporting || state.loading || !selectionMatches() || !state.snapshot?.albums.length) return;
    state.exporting = true; state.exportController = new AbortController(); clearError(); clearDownload(); controls();
    const snapshot = { ...state.snapshot, albums: state.snapshot.albums.map(album => ({ ...album })) };
    const controller = state.exportController;
    let canvas;
    try {
      message('Preparando PNG…');
      const rendered = await ChartExporter.render(snapshot, { quality: ui.quality.value, signal: controller.signal,
        onProgress: (done, total) => { ui['export-info'].textContent = `Preparando capas: ${done} de ${total}`; } });
      canvas = rendered.canvas;
      ui['export-info'].textContent = 'Finalizando PNG…';
      const blob = await ChartExporter.toBlob(canvas);
      if (controller.signal.aborted) throw new DOMException('Exportação cancelada.', 'AbortError');
      const filename = Core.filename(snapshot), url = URL.createObjectURL(blob);
      state.download = { blob, url, filename };
      const link = ui['download-link']; link.href = url; link.download = filename; link.hidden = false; link.click();
      if (navigator.canShare && typeof File !== 'undefined') {
        try { ui['share-btn'].hidden = !navigator.canShare({ files: [new File([blob], filename, { type: 'image/png' })] }); } catch { ui['share-btn'].hidden = true; }
      }
      message(rendered.missing ? `PNG pronto. ${rendered.missing} capas indisponíveis foram substituídas por um disco ilustrado.` : 'PNG pronto. Se o download não iniciar, toque em Salvar PNG pronto.');
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) message('Exportação cancelada.');
      else { showError(error.message || 'Não foi possível exportar. Tente a qualidade padrão.'); message('O chart continua disponível para uma nova tentativa.'); }
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
      state.exporting = false; state.exportController = null; controls();
    }
  }

  ui['chart-form'].addEventListener('submit', event => { event.preventDefault(); loadChart({ focus: true }); });
  ui['retry-btn'].addEventListener('click', () => loadChart({ focus: true, refresh: true }));
  ui.username.addEventListener('input', identityEdited);
  ui.period.addEventListener('change', () => {
    identityEdited();
    if (ui.username.value.trim()) loadChart();
  });
  for (const field of [ui.cols, ui.rows]) {
    field.addEventListener('input', () => {
      if (state.exporting) return;
      gate.cancel(); state.loading = false; clearDownload(); controls();
    });
    field.addEventListener('change', sizeEdited);
  }
  document.querySelectorAll('[data-size]').forEach(button => button.addEventListener('click', () => {
    if (state.exporting) return;
    ui.cols.value = ui.rows.value = button.dataset.size; sizeEdited();
  }));
  ui['view-fit'].addEventListener('click', () => setView('fit'));
  ui['view-detail'].addEventListener('click', () => setView('detail'));
  ui.quality.addEventListener('change', () => { clearDownload(); preferences(); controls(); });
  ui['export-btn'].addEventListener('click', exportChart);
  ui['cancel-export'].addEventListener('click', () => state.exportController?.abort());
  ui['close-dialog'].addEventListener('click', () => ui['album-dialog'].close());
  ui['album-dialog'].addEventListener('click', event => { if (event.target === ui['album-dialog']) {
    const rect = ui['album-dialog'].getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) ui['album-dialog'].close();
  } });
  ui['share-btn'].addEventListener('click', async () => {
    if (!state.download) return;
    const { blob, filename } = state.download;
    try { await navigator.share({ files: [new File([blob], filename, { type: 'image/png' })] }); }
    catch (error) { if (error.name !== 'AbortError') showError('Não foi possível compartilhar. Use Salvar PNG pronto.'); }
  });
  let saved;
  try { saved = Core.readPreferences(localStorage); } catch { saved = Core.readPreferences({ getItem: () => null }); }
  ui.username.value = saved.username; ui.period.value = saved.period; ui.cols.value = saved.cols; ui.rows.value = saved.rows;
  ui.quality.value = saved.quality; setView(saved.view); controls();
  window.addEventListener('pagehide', () => { gate.cancel(); state.exportController?.abort(); clearDownload(); });
  // Restore interactive controls when a browser resumes this page from its back/forward cache.
  window.addEventListener('pageshow', event => { if (event.persisted) { state.loading = false; controls(); } });
})();
