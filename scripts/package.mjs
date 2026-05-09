import { createWriteStream, statSync } from 'node:fs';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createAppPack } from './pkgutil.mjs';

/** Bundled example notebooks ship inside the .tgz; embedded outputs can explode archive size. */
const DEFAULT_MAX_IPYNB_BYTES = 1024 * 1024;

/**
 * @param {string} examplesDir
 * @param {number} maxBytes
 */
async function assertBundledExamplesUnderSizeLimit(examplesDir, maxBytes) {
  let entries;
  try {
    entries = await readdir(examplesDir);
  } catch {
    return;
  }
  const violations = [];
  for (const name of entries) {
    if (!name.endsWith('.ipynb')) continue;
    const abs = join(examplesDir, name);
    const st = await stat(abs);
    if (!st.isFile()) continue;
    if (st.size > maxBytes) {
      violations.push(`${name} (~${(st.size / 1024).toFixed(1)} KiB > ${maxBytes / 1024} KiB cap)`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      [
        `Example notebook(s) exceed ${maxBytes} bytes — clear cell outputs (Jupyter / VS Code) or use nbstripout before packaging:`,
        ...violations.map((v) => `  - ${v}`),
      ].join('\n'),
    );
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const buildOutDir = join(rootDir, 'build');
const packageInfo = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf8'));
const tgzName = `${packageInfo.name || 'app'}-${packageInfo.version || '0.0.0'}.tgz`;
const tgzPath = join(buildOutDir, tgzName);
await mkdir(buildOutDir, { recursive: true });

const maxIpynb = Number(process.env.PACKAGE_MAX_IPYNB_BYTES);
await assertBundledExamplesUnderSizeLimit(
  join(rootDir, 'public', 'Examples'),
  Number.isFinite(maxIpynb) && maxIpynb > 0 ? maxIpynb : DEFAULT_MAX_IPYNB_BYTES,
);

const { closePromise, stdout } = await createAppPack(false);
await Promise.all([ pipeline(stdout, createWriteStream(tgzPath)), closePromise ]);

const maxBytes = 30 * 1024 * 1024;
const st = statSync(tgzPath);
if (st.size > maxBytes) {
  throw new Error(
    `Package exceeds ${maxBytes} bytes: ${tgzPath} is ${st.size} bytes (~${(st.size / 1024 / 1024).toFixed(2)} MiB)`,
  );
}

console.log(`\nPackage created: ${tgzPath} (${(st.size / 1024 / 1024).toFixed(2)} MiB, max 30 MiB)`);
