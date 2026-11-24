import {mkdir, readFile, writeFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const formats = {
  'index.html': 'text/html; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'model.js': 'text/javascript; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'mates.js': 'text/javascript; charset=utf-8',
  'sw.js': 'text/javascript; charset=utf-8',
  'manifest.webmanifest': 'application/manifest+json; charset=utf-8',
  'icon-192.png': 'image/png',
  'icon-512.png': 'image/png'
};
const assets = Object.fromEntries(await Promise.all(Object.entries(formats).map(async ([file, type]) => [
  '/' + file, {type, data: (await readFile(new URL('web/' + file, root))).toString('base64')}
])));
const worker = await readFile(new URL('worker/index.js', root), 'utf8');
await Promise.all(['dist/server/', 'dist/.openai/'].map(path => mkdir(new URL(path, root), {recursive: true})));
await Promise.all([
  writeFile(new URL('dist/server/index.js', root), 'const assets = ' + JSON.stringify(assets) + ';\n' + worker),
  writeFile(new URL('dist/.openai/hosting.json', root), await readFile(new URL('.openai/hosting.json', root)))
]);
