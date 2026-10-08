import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const catalogPath = new URL('../src/messages.json', import.meta.url);
const lockPath = new URL('../src/translations.lock.json', import.meta.url);
const digest = text => createHash('sha256').update(text).digest('hex');
const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort().join(',');

export function validateTranslations(catalog, lock, review = false) {
  const errors = [];
  for (const [key, message] of Object.entries(catalog)) {
    if (!message || typeof message.es !== 'string' || !message.es.trim() || typeof message.en !== 'string' || !message.en.trim()) {
      errors.push(`${key}: both Spanish and English texts are required.`); continue;
    }
    if (placeholders(message.es) !== placeholders(message.en)) errors.push(`${key}: translation parameters differ.`);
    const previous = lock[key];
    const esChanged = previous?.es !== digest(message.es);
    const enChanged = previous?.en !== digest(message.en);
    if (!review && (esChanged || enChanged)) errors.push(`${key}: translations need review. Update both languages, then run npm run i18n:review.`);
    if (review && previous && esChanged !== enChanged) errors.push(`${key}: only one language changed. Update its counterpart before approving.`);
  }
  if (!review) for (const key of Object.keys(lock)) if (!(key in catalog)) errors.push(`${key}: removed message needs review.`);
  return errors;
}

async function main() {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const review = process.argv.includes('--review');
  let lock = {};
  try { lock = JSON.parse(await readFile(lockPath, 'utf8')); }
  catch (error) { if (!review || error.code !== 'ENOENT') throw error; }
  const errors = validateTranslations(catalog, lock, review);
  if (errors.length) throw new Error(errors.join('\n'));
  if (review) {
    const next = Object.fromEntries(Object.entries(catalog).map(([key, { es, en }]) => [key, { es: digest(es), en: digest(en) }]));
    await writeFile(lockPath, `${JSON.stringify(next, null, 2)}\n`);
  }
  console.log(`${Object.keys(catalog).length} bilingual messages ${review ? 'approved' : 'verified'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
