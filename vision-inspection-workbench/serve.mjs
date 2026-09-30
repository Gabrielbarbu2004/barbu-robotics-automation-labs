import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.mjs': ['app.mjs', 'text/javascript'], '/engine.mjs': ['engine.mjs', 'text/javascript'], '/README.md': ['README.md', 'text/plain'] };
createServer(async (request, response) => {
  const resource = files[new URL(request.url, 'http://localhost').pathname];
  if (!resource) { response.writeHead(404); response.end('Not found'); return; }
  try { const file = await readFile(new URL(resource[0], import.meta.url)); response.writeHead(200, { 'Content-Type': resource[1] + '; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(file); }
  catch { response.writeHead(500); response.end('Unable to read file'); }
}).listen(8080, '127.0.0.1', () => console.log('Vision Inspection Workbench: http://127.0.0.1:8080'));
