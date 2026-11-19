# ChartGenerator — Amigos do Mati

ChartGenerator is a static web app that creates a Last.fm listening chart from a user's top albums. The Portuguese interface supports a 1 × 1 to 20 × 20 grid and lets users preview and export the result as a PNG.

## Features

- Load top albums for 7 days, 1 month, 3 months, 6 months, 1 year, or all time.
- Choose a 3 × 3, 5 × 5, or 10 × 10 preset, or enter custom dimensions.
- Preview album artwork in a responsive grid.
- Export charts with the existing `html2canvas` implementation.
- Uses no backend or build tool.

## Technology

- HTML5
- CSS
- Vanilla JavaScript
- Last.fm API `user.gettopalbums`
- `html2canvas` for PNG export

## Project files

| Path | Purpose |
| --- | --- |
| `index.html` | Page structure and Portuguese interface |
| `style.css` | Responsive layout and visual styling |
| `script.js` | Last.fm requests, chart rendering, and export logic |
| `ChartGenerator.zip` | Archived copy of the project |
| `README.md` | Project documentation |

There is currently no `assets/`, `tests/`, package manifest, build configuration, or backend directory.

## Run locally

The app is made entirely of static files. Start a local server in the project directory:

```sh
python -m http.server 8000
```

Open `http://localhost:8000` and enter a Last.fm username.

VS Code's Live Server extension is also sufficient. Internet access is required for Last.fm data and remote cover images.

## Current behavior

The basic flow is implemented in `script.js`:

1. `lastFmRequest()` calls the Last.fm JSON API.
2. `fetchTopAlbums()` maps returned albums to rank, name, artist, and cover fields.
3. `loadChart()` validates the username and grid size, loads the albums, and renders the preview.
4. `updatePreview()` rerenders existing results when columns or rows change.
5. `exportChart()` prepares an export container and calls `html2canvas()`.

The Last.fm API key is currently embedded in `script.js`. For a maintained deployment, move this configuration to an environment or server-side service and rotate the exposed key.

## Known integration gaps

The page and script are currently out of sync:

- `index.html` references `chart-core.js`, `lastfm.js`, and `chart-export.js`, but those files do not exist.
- The favicon and Apple touch icon referenced in `assets/` are missing.
- `script.js` requires an `export-container` element that is absent from `index.html`.
- `html2canvas` is not loaded by the page.
- `chart-grid` starts with `hidden`; `script.js` never reveals it after loading.
- Form submission is not prevented by the current click-based handler.
- UI controls for presets, fit/detail preview, album details, retry, quality, cancellation, and sharing do not have complete handlers.
- There are no automated tests or test scripts.

Because these issues prevent the full interface from working reliably, the app should be considered a work in progress. Verify chart loading and PNG download in a browser after integrating the missing modules and elements.
