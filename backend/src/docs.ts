import { Router } from 'express';
import { openapi } from './openapi';

// Scalar is pinned and loaded from the CDN: the self-contained npm package is ~48 MB
// unpacked, which is not worth shipping in the image for one static page.
const SCALAR_VERSION = '1.72.1';

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MaiIndex API</title>
</head>
<body>
  <script id="api-reference" data-url="/api/openapi.json" data-configuration='{"theme":"default","darkMode":true,"hideDarkModeToggle":false}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js"></script>
</body>
</html>`;

export function createDocsRouter() {
  const router = Router();
  router.get('/openapi.json', (_req, res) => res.json(openapi));
  router.get('/docs', (_req, res) => res.type('html').send(page));
  return router;
}
