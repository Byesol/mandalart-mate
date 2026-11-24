import {spawnSync} from 'node:child_process';
import {cp, copyFile, mkdir, mkdtemp, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const needsStaging = windows && /[^\x00-\x7f]/.test(root);
const tempRoot = await realpath(tmpdir());
let staging;

try {
  let project = root;
  if (needsStaging) {
    if (/[^\x00-\x7f]/.test(tempRoot)) throw new Error('Android needs an ASCII-only Windows temporary directory.');
    staging = await mkdtemp(path.join(tempRoot, 'mandalart-android-'));
    project = staging;
    await cp(path.join(root, 'android'), path.join(staging, 'android'), {
      recursive: true,
      filter: source => !['.gradle', '.idea', 'build'].includes(path.basename(source))
    });
    await cp(path.join(root, 'node_modules'), path.join(staging, 'node_modules'), {recursive: true});
  }

  const android = path.join(project, 'android');
  const args = ['--no-daemon', '--max-workers', '2', 'assembleDebug', 'bundleRelease'];
  const wrapper = windows ? 'gradlew.bat' : './gradlew';
  const result = spawnSync(windows ? 'cmd.exe' : 'bash', windows ? ['/d', '/c', wrapper, ...args] : [wrapper, ...args],
    {cwd: android, stdio: 'inherit', windowsHide: true});
  if (result.error || result.status !== 0) throw result.error ?? new Error('Android Gradle build failed');

  const output = path.join(root, 'artifacts', 'android');
  await mkdir(output, {recursive: true});
  await Promise.all([
    copyFile(path.join(android, 'app/build/outputs/apk/debug/app-debug.apk'), path.join(output, 'mandalart-mate-debug.apk')),
    copyFile(path.join(android, 'app/build/outputs/bundle/release/app-release.aab'), path.join(output, 'mandalart-mate-unsigned.aab'))
  ]);
  console.log('Android packages saved to ' + output);
} finally {
  if (staging) {
    const resolved = await realpath(staging);
    if (path.dirname(resolved) === tempRoot && path.basename(resolved).startsWith('mandalart-android-')) {
      await rm(resolved, {recursive: true, force: true, maxRetries: 3});
    }
  }
}
