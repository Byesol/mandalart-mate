import {mkdir, readdir, readFile, copyFile, writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
const web = new URL('web/', root);
const output = new URL('dist-mobile/', root);
await mkdir(output, {recursive: true});

const files = await readdir(web, {withFileTypes: true});
await Promise.all(files.filter(file => file.isFile() && file.name !== 'index.html')
  .map(file => copyFile(new URL(file.name, web), new URL(file.name, output))));

const html = await readFile(new URL('index.html', web), 'utf8');
const anchor = '<script src="./model.js" defer>';
if (!html.includes(anchor)) throw new Error('Mobile bridge script insertion point is missing');
const embedded = html.replace(anchor, '<script src="./native.js" defer></script>\n  ' + anchor);
await writeFile(new URL('index.html', output), embedded, 'utf8');
await build({
  entryPoints: [fileURLToPath(new URL('native/bridge.js', root))],
  outfile: fileURLToPath(new URL('native.js', output)),
  format: 'iife',
  bundle: true,
  minify: true,
  target: 'es2020'
});
