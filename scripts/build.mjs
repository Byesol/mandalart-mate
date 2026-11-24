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
const mobileApi = process.argv.includes('--mobile-api');
const assets = mobileApi ? {} : Object.fromEntries(await Promise.all(Object.entries(formats).map(async ([file, type]) => [
  '/' + file, {type, data: (await readFile(new URL('web/' + file, root))).toString('base64')}
])));
const worker = await readFile(new URL('worker/index.js', root), 'utf8');
const entry = 'const assets = ' + JSON.stringify(assets) + ';\nconst mobileApi = ' + mobileApi + ';\n' + worker;
if (mobileApi) {
  await mkdir(new URL('dist-mobile-api/', root), {recursive: true});
  await writeFile(new URL('dist-mobile-api/index.js', root), entry);
} else {
  await Promise.all(['dist/server/', 'dist/.openai/'].map(path => mkdir(new URL(path, root), {recursive: true})));
  await Promise.all([
    writeFile(new URL('dist/server/index.js', root), entry),
    writeFile(new URL('dist/.openai/hosting.json', root), await readFile(new URL('.openai/hosting.json', root)))
  ]);
}
