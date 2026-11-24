import {mkdir, readdir, readFile, copyFile, writeFile, unlink} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
const web = new URL('web/', root);
const output = new URL('dist-mobile/', root);
await mkdir(output, {recursive: true});

function origin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(name + ' must be an HTTPS origin'); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(name + ' must be an HTTPS origin');
  }
  return url.origin;
}
const authUrl = process.env.MANDALART_SUPABASE_URL?.trim();
const key = process.env.MANDALART_SUPABASE_PUBLISHABLE_KEY?.trim();
const apiUrl = process.env.MANDALART_MATES_API_URL?.trim();
const hasConfiguration = authUrl || key || apiUrl;
let configuration = null;
if (hasConfiguration) {
  if (!authUrl || !key || !apiUrl || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('Set both HTTPS origins and a Supabase publishable key to build an app with login');
  }
  configuration = {authUrl: origin(authUrl, 'MANDALART_SUPABASE_URL'), key, apiUrl: origin(apiUrl, 'MANDALART_MATES_API_URL')};
}

const files = await readdir(web, {withFileTypes: true});
const expected = new Set([...files.filter(file => file.isFile()).map(file => file.name), 'native.js']);
const oldFiles = await readdir(output, {withFileTypes: true});
await Promise.all(oldFiles.filter(file => file.isFile() && !expected.has(file.name))
  .map(file => unlink(new URL(file.name, output))));
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
  define: {MANDALART_AUTH_CONFIG: JSON.stringify(configuration)},
  format: 'iife',
  bundle: true,
  minify: true,
  target: 'es2020'
});
