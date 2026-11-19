const API_KEY = '8b2854f4f61653b88a4161656c020b46'; 
const usernameInput = document.getElementById('username');
const fetchBtn = document.getElementById('fetch-btn');
const periodSelect = document.getElementById('period');
const colsInput = document.getElementById('cols');
const rowsInput = document.getElementById('rows');
const exportBtn = document.getElementById('export-btn');
const chartGrid = document.getElementById('chart-grid');
const statusMsg = document.getElementById('status');
const exportContainer = document.getElementById('export-container');

let currentAlbums = [];
let isLoading = false;

function lastFmRequest(method, params) {
    return new Promise((resolve, reject) => {
        const defaultParams = {
            method: method,
            api_key: API_KEY,
            format: 'json'
        };
        const allParams = { ...defaultParams, ...params };
        const queryString = Object.entries(allParams)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        const callbackName = `jsonp_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
        const url = `https://ws.audioscrobbler.com/2.0/?${queryString}&callback=${callbackName}`;

        const script = document.createElement('script');
        script.src = url;
        window[callbackName] = function(data) {
            delete window[callbackName];
            document.body.removeChild(script);
            if (data && data.error) {
                reject(new Error(data.message || `Erro ${data.error}`));
            } else {
                resolve(data);
            }
        };
        script.onerror = function() {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('Falha ao carregar dados. Verifique sua conexão.'));
        };
        document.body.appendChild(script);
    });
}

async function fetchTopAlbums(username, period, limit) {
    if (!username || username.trim() === '') {
        throw new Error('Informe um nome de usuário.');
    }
    const data = await lastFmRequest('user.gettopalbums', {
        user: username.trim(),
        period: period,
        limit: limit
    });
    if (!data.topalbums || !data.topalbums.album) {
        throw new Error('Usuário não encontrado ou sem scrobbles.');
    }
    let albums = data.topalbums.album;
    if (!Array.isArray(albums)) albums = [albums];
    return albums.map((album, index) => ({
        rank: index + 1,
        name: album.name,
        artist: album.artist?.name || 'Artista desconhecido',
        image: album.image && album.image.length > 0
            ? album.image.find(img => img.size === 'extralarge')?.['#text']
              || album.image.find(img => img.size === 'large')?.['#text']
              || album.image[0]?.['#text']
              || ''
            : ''
    }));
}

function renderAlbums(container, albums, cols, rows, options = {}) {
    const grid = container;
    grid.innerHTML = '';
    const totalCells = cols * rows;
    const display = albums.slice(0, totalCells);

    const gap = options.gap || 12;
    const imgSize = options.imgSize || 100;
    const fontSize = options.fontSize || 1;
    const padding = options.padding || 6;

    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gap = `${gap}px`;

    if (display.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:40px; color:#888;">Nenhum álbum encontrado.</p>';
        return;
    }

    display.forEach((album) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.padding = `${padding}px`;

        const img = document.createElement('img');
        img.src = album.image || 'https://via.placeholder.com/150?text=No+Cover';
        img.alt = album.name;
        img.style.width = '100%';
        img.style.aspectRatio = '1/1';
        img.style.objectFit = 'cover';
        img.style.borderRadius = `${options.borderRadius || 10}px`;
        cell.appendChild(img);

        const rank = document.createElement('div');
        rank.className = 'rank';
        rank.textContent = `#${album.rank}`;
        rank.style.fontSize = `${0.8 * fontSize}rem`;
        cell.appendChild(rank);

        const name = document.createElement('div');
        name.className = 'album-name';
        name.textContent = album.name;
        name.style.fontSize = `${0.9 * fontSize}rem`;
        cell.appendChild(name);

        const artist = document.createElement('div');
        artist.className = 'artist-name';
        artist.textContent = album.artist;
        artist.style.fontSize = `${0.75 * fontSize}rem`;
        cell.appendChild(artist);

        grid.appendChild(cell);
    });

    const remaining = totalCells - display.length;
    for (let i = 0; i < remaining; i++) {
        const empty = document.createElement('div');
        empty.className = 'cell';
        empty.style.backgroundColor = 'rgba(255,255,255,0.03)';
        empty.style.aspectRatio = '1/1';
        empty.style.display = 'flex';
        empty.style.alignItems = 'center';
        empty.style.justifyContent = 'center';
        empty.style.color = '#555';
        empty.textContent = '—';
        grid.appendChild(empty);
    }
}

function renderPreview(albums, cols, rows) {
    renderAlbums(chartGrid, albums, cols, rows, {
        gap: 12,
        padding: 6,
        borderRadius: 10,
        fontSize: 1
    });
}

function exportChart() {
    const cols = parseInt(colsInput.value, 10) || 5;
    const rows = parseInt(rowsInput.value, 10) || 5;

    const container = exportContainer;
    container.style.width = '1200px';
    container.style.padding = '30px';
    container.style.backgroundColor = '#1a1a2e';
    container.style.borderRadius = '20px';
    container.style.display = 'block';

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gap = '20px';
    container.appendChild(grid);


    renderAlbums(grid, currentAlbums, cols, rows, {
        gap: 20,
        padding: 12,
        borderRadius: 14,
        fontSize: 1.4 // aumenta fonte
    });

    const images = grid.querySelectorAll('img');
    let loaded = 0;
    const total = images.length;
    if (total === 0) {
        doExport(container, grid);
        return;
    }
    images.forEach(img => {
        if (img.complete) {
            loaded++;
            if (loaded === total) doExport(container, grid);
        } else {
            img.onload = () => {
                loaded++;
                if (loaded === total) doExport(container, grid);
            };
            img.onerror = () => {
                loaded++;
                if (loaded === total) doExport(container, grid);
            };
        }
    });
}

function doExport(container, grid) {
    html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#1a1a2e',
        logging: false,
        width: 1200,
        height: container.scrollHeight
    }).then(canvas => {
        container.innerHTML = '';
        container.style.display = 'none';

        const link = document.createElement('a');
        link.download = `lastfm-chart-${usernameInput.value || 'user'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(err => {
        console.error('Erro ao exportar:', err);
        statusMsg.textContent = '❌ Erro ao gerar imagem.';
        container.innerHTML = '';
        container.style.display = 'none';
    });
}


async function loadChart() {
    const username = usernameInput.value.trim();
    if (!username) {
        statusMsg.textContent = '⚠️ Digite um usuário.';
        return;
    }

    const period = periodSelect.value;
    const cols = parseInt(colsInput.value, 10) || 5;
    const rows = parseInt(rowsInput.value, 10) || 5;
    const limit = cols * rows;

    if (limit > 400) {
        statusMsg.textContent = '⚠️ Máximo 20×20 = 400 células.';
        return;
    }

    isLoading = true;
    fetchBtn.disabled = true;
    exportBtn.disabled = true;
    statusMsg.textContent = '⏳ Carregando...';

    try {
        const albums = await fetchTopAlbums(username, period, Math.min(limit, 1000));
        currentAlbums = albums;
        renderPreview(albums, cols, rows);
        statusMsg.textContent = `✅ ${albums.length} álbuns carregados. Exibindo ${Math.min(limit, albums.length)}.`;
        exportBtn.disabled = false;
    } catch (error) {
        statusMsg.textContent = `❌ ${error.message}`;
        chartGrid.innerHTML = '';
        exportBtn.disabled = true;
    } finally {
        isLoading = false;
        fetchBtn.disabled = false;
    }
}


function updatePreview() {
    if (currentAlbums.length === 0) return;
    const cols = parseInt(colsInput.value, 10) || 5;
    const rows = parseInt(rowsInput.value, 10) || 5;
    renderPreview(currentAlbums, cols, rows);
}

fetchBtn.addEventListener('click', loadChart);
usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadChart();
});

periodSelect.addEventListener('change', loadChart);
colsInput.addEventListener('change', updatePreview);
rowsInput.addEventListener('change', updatePreview);

exportBtn.addEventListener('click', exportChart);

statusMsg.textContent = 'Digite um usuário e clique em "Gerar".';