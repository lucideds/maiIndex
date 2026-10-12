import { Router } from 'express';
import { openapi } from './openapi';

// Scalar is pinned and loaded from the CDN: the self-contained npm package is ~48 MB
// unpacked, which is not worth shipping in the image for one static page.
const SCALAR_VERSION = '1.72.1';

// Cabinet Dark for the docs page. Tokens mirror :root in frontend/src/index.css - keep
// them in step - and Scalar's own --scalar-* variables are mapped onto them, so no
// colour is written outside the token block. Same anti-slop rules as the app: solid
// fills, no glow, no gradients, radius by role.
const THEME_CSS = `
:root {
  --bg-body: #0e0b0d;
  --bg-surface: #151114;
  --bg-card: #171316;
  --bg-card-hover: #201a1d;
  --border-color: #2b2326;
  --border-subtle: #3b3034;
  --text-main: #f2ede9;
  --text-muted: #a3968f;
  --accent-primary: #e7dcc4;
  --accent-primary-hover: #f3ecdd;
  --accent-ink: #1c1512;
  --accent-tint: rgba(231, 220, 196, 0.12);
  --alert: #e08272;
  --ok: #8fd9a4;
  --dx-accent: #35b6c9;
  --badge-adv-color: #efb057;
  --badge-mas-color: #bda6ee;
  --font-display: 'M PLUS Rounded 1c', 'M PLUS 1', sans-serif;
  --font-ui: 'M PLUS 1', 'Segoe UI', sans-serif;
  --font-mono: 'M PLUS 1 Code', ui-monospace, Consolas, monospace;
  --radius-sm: 5px;
  --radius-md: 9px;
  --radius-lg: 14px;
}

.dark-mode, .light-mode {
  --scalar-background-1: var(--bg-body);
  --scalar-background-2: var(--bg-surface);
  --scalar-background-3: var(--bg-card-hover);
  --scalar-background-accent: var(--accent-tint);

  --scalar-color-1: var(--text-main);
  --scalar-color-2: var(--text-muted);
  --scalar-color-3: var(--text-muted);
  --scalar-color-accent: var(--accent-primary);
  --scalar-color-disabled: var(--text-muted);
  --scalar-color-ghost: var(--text-muted);

  --scalar-border-color: var(--border-color);

  --scalar-button-1: var(--accent-primary);
  --scalar-button-1-color: var(--accent-ink);
  --scalar-button-1-hover: var(--accent-primary-hover);

  /* HTTP verbs borrow the app's semantic hues */
  --scalar-color-green: var(--ok);
  --scalar-color-blue: var(--dx-accent);
  --scalar-color-orange: var(--badge-adv-color);
  --scalar-color-red: var(--alert);
  --scalar-color-yellow: var(--badge-adv-color);
  --scalar-color-purple: var(--badge-mas-color);

  --scalar-font: var(--font-ui);
  --scalar-font-code: var(--font-mono);
  --scalar-radius: var(--radius-sm);
  --scalar-radius-lg: var(--radius-md);
  --scalar-radius-xl: var(--radius-lg);

  --scalar-shadow-1: none;
  --scalar-shadow-2: none;
}

body { background: var(--bg-body); }
h1, h2, .section-header, .section-header-label { font-family: var(--font-display); }
a { text-underline-offset: 2px; }
`;

const config = {
  darkMode: true,
  hideDarkModeToggle: true,
  forceDarkModeState: 'dark',
  withDefaultFonts: false,
  hideClientButton: true,
  customCss: THEME_CSS,
};

// The config rides in a data attribute, so it has to be attribute-escaped.
const configAttr = JSON.stringify(config).replace(/&/g, '&amp;').replace(/'/g, '&#39;');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>MaiIndex API</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=M+PLUS+1+Code:wght@400;500;600&family=M+PLUS+1:wght@400;500;700&family=M+PLUS+Rounded+1c:wght@700;800&display=swap" rel="stylesheet">
  <style>body { background: #0e0b0d; margin: 0; }</style>
</head>
<body>
  <script id="api-reference" data-url="/api/openapi.json" data-configuration='${configAttr}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js"></script>
</body>
</html>`;

export function createDocsRouter() {
  const router = Router();
  router.get('/openapi.json', (_req, res) => res.json(openapi));
  router.get('/docs', (_req, res) => res.type('html').send(page));
  return router;
}
