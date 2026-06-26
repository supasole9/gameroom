// Character library loaded from image files dropped in public/characters/.
// Add a .png/.jpg/.webp/.gif/.svg there and it becomes a selectable fighter.
// Reusable across games. Re-read on demand so new files appear without a restart.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '..', '..', 'public', 'characters');
const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function prettify(file) {
  return basename(file, extname(file))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function characterLibrary() {
  let files = [];
  try { files = readdirSync(DIR); } catch { return []; }
  return files
    .filter((f) => !f.startsWith('.') && EXTS.has(extname(f).toLowerCase()))
    .sort()
    .map((f) => {
      const url = '/characters/' + encodeURIComponent(f);
      return { token: 'img:' + url, url, file: f, name: prettify(f) };
    });
}
