(function (root) {
  'use strict';
  const Core = typeof module !== 'undefined' && module.exports ? require('./chart-core.js') : root.ChartCore;
  const abortError = () => new DOMException('Exportação cancelada.', 'AbortError');

  // CORS failures and timeouts resolve to a local placeholder, never a tainted canvas.
  function loadImage(url, signal, timeoutMs = 7000) {
    if (!url || signal?.aborted) return Promise.resolve(null);
    return new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        image.onload = image.onerror = null;
        if (!value) image.removeAttribute('src');
        resolve(value);
      };
      const cancel = () => finish(null);
      const timer = setTimeout(cancel, timeoutMs);
      signal?.addEventListener('abort', cancel, { once: true });
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => finish(image.naturalWidth && image.naturalHeight ? image : null);
      image.onerror = () => finish(null);
      image.src = url;
    });
  }

  function fitText(ctx, value, width) {
    const chars = Array.from(String(value));
    if (ctx.measureText(chars.join('')).width <= width) return chars.join('');
    while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
    return chars.join('') + '…';
  }

  function textLines(ctx, value, width, count = 2) {
    const words = String(value).trim().split(/\s+/u);
    const lines = [];
    let line = '';
    while (words.length) {
      const word = words.shift();
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
      if (!line) { line = fitText(ctx, word, width); }
      else words.unshift(word);
      lines.push(line); line = '';
      if (lines.length === count) {
        if (words.length) lines[count - 1] = fitText(ctx, lines[count - 1] + ' …', width);
        return lines;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function placeholder(ctx, x, y, size) {
    ctx.fillStyle = '#ecd7e4'; ctx.fillRect(x, y, size, size);
    const cx = x + size / 2, cy = y + size / 2;
    ctx.fillStyle = '#b86186'; ctx.beginPath(); ctx.arc(cx, cy, size * .33, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#dca7c3'; ctx.lineWidth = size * .012;
    for (const radius of [.22, .28]) { ctx.beginPath(); ctx.arc(cx, cy, size * radius, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#fae7ef'; ctx.beginPath(); ctx.arc(cx, cy, size * .09, 0, Math.PI * 2); ctx.fill();
  }

  async function render(snapshot, options = {}) {
    const { quality = 'standard', signal, onProgress = () => {}, imageLoader = loadImage,
      createCanvas = () => document.createElement('canvas'), imageBudgetMs = 22000 } = options;
    Core.dimensions(snapshot.cols, snapshot.rows);
    if (!snapshot.albums?.length) throw new Error('Gere um chart com álbuns antes de exportar.');
    if (signal?.aborted) throw abortError();
    const layout = Core.exportLayout(snapshot.cols, snapshot.rows, quality);
    const canvas = createCanvas();
    canvas.width = layout.width; canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.width = canvas.height = 0; throw new Error('Não foi possível criar o PNG neste navegador.'); }
    const { margin, cell, gap, header, text, scale, logicalWidth, logicalHeight } = layout;
    const covers = new AbortController();
    const cancel = () => covers.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(cancel, imageBudgetMs);
    try {
      ctx.scale(scale, scale);
      ctx.fillStyle = '#fbf2f6'; ctx.fillRect(0, 0, logicalWidth, logicalHeight);
      ctx.fillStyle = '#422c3b'; ctx.font = '32px Georgia, serif';
      ctx.fillText(fitText(ctx, 'amigos do mati', logicalWidth - margin * 2), margin, margin + 28);
      ctx.font = '600 18px system-ui, sans-serif'; ctx.fillStyle = '#a63e66';
      ctx.fillText(fitText(ctx, `@${snapshot.username}`, logicalWidth - margin * 2), margin, margin + 56);
      ctx.font = '15px system-ui, sans-serif'; ctx.fillStyle = '#79616e';
      ctx.fillText(fitText(ctx, Core.PERIODS[snapshot.period], logicalWidth - margin * 2), margin, margin + 80);
      const albums = snapshot.albums.slice(0, snapshot.cols * snapshot.rows);
      const position = index => ({ x: margin + (index % snapshot.cols) * (cell + gap),
        y: margin + header + Math.floor(index / snapshot.cols) * (cell + text + gap) });
      for (let index = 0; index < snapshot.cols * snapshot.rows; index++) {
        const { x, y } = position(index);
        const album = albums[index];
        if (!album) {
          ctx.fillStyle = '#f2e6ed'; ctx.fillRect(x, y, cell, cell);
          ctx.fillStyle = '#ac8b9d'; ctx.font = '24px system-ui, sans-serif'; ctx.fillText('—', x + cell / 2 - 12, y + cell / 2 + 8);
          continue;
        }
        placeholder(ctx, x, y, cell);
        ctx.fillStyle = '#a63e66'; ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillText(`#${album.rank}`, x, y + cell + 17);
        ctx.fillStyle = '#422c3b'; ctx.font = '600 17px system-ui, sans-serif';
        textLines(ctx, album.name, cell).forEach((line, lineIndex) => ctx.fillText(line, x, y + cell + 39 + lineIndex * 19));
        ctx.fillStyle = '#79616e'; ctx.font = '15px system-ui, sans-serif';
        ctx.fillText(fitText(ctx, album.artist, cell), x, y + cell + 78);
      }
      ctx.fillStyle = '#79616e'; ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(fitText(ctx, `${snapshot.cols} × ${snapshot.rows} · ${albums.length} álbuns · Last.fm`, logicalWidth - margin * 2), margin, logicalHeight - margin);
      let next = 0, done = 0, missing = 0;
      const worker = async () => {
        while (next < albums.length) {
          if (signal?.aborted) throw abortError();
          const index = next++, album = albums[index];
          let image = null;
          if (!covers.signal.aborted && album.image) {
            try { image = await imageLoader(album.image, covers.signal); } catch { image = null; }
          }
          if (signal?.aborted) throw abortError();
          if (image) {
            const { x, y } = position(index);
            const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
            const side = Math.min(width, height);
            ctx.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, x, y, cell, cell);
            image.close?.();
          } else missing++;
          onProgress(++done, albums.length);
        }
      };
      const results = await Promise.allSettled(Array.from({ length: Math.min(6, albums.length) }, worker));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      if (signal?.aborted) throw abortError();
      return { canvas, layout, missing };
    } catch (error) {
      canvas.width = canvas.height = 0;
      throw error;
    } finally {
      clearTimeout(deadline); covers.abort(); signal?.removeEventListener('abort', cancel);
    }
  }

  function toBlob(canvas, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Não foi possível finalizar o PNG. Tente a qualidade padrão.')), timeoutMs);
      try {
        canvas.toBlob(blob => {
          clearTimeout(timer);
          if (blob) resolve(blob); else reject(new Error('Não foi possível gerar o PNG. Tente a qualidade padrão.'));
        }, 'image/png');
      } catch (error) { clearTimeout(timer); reject(error); }
    });
  }
  const api = { render, toBlob, loadImage, fitText, textLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChartExporter = api;
})(globalThis);
