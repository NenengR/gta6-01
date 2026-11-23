// Sunbreak Coastline, a gta6-01 entry (Node 22, standard library only): an original open-world
// crime game that runs as plain static files a desktop browser loads offline. The game lives in
// this directory's game/ folder (game/index.html plus its ES modules, no library, no network
// request): a sun-soaked coastal city to explore on foot and by car, with traffic and
// pedestrians, cars to steal, a wanted level and police, five story missions, combat, and a HUD
// with a minimap. This program hands the game in. It copies game/ and screenshots/ from beside
// this file to the output directory and writes dossier.json there, the summary the judge reads,
// built with the vendored make.fun library. Put your 3 or 4 PNG or JPEG screenshots in
// screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The directory this file lives in, resolved from the module URL so the program works no
// matter which directory it is launched from.
const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_OUTPUT_DIR = '/output';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others
// refuse an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more
// than 993 files in game/ or 48 MiB of game files, in all, or a path under game/ over 1000
// bytes: game/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
function dossierOptions() {
  return {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  };
}

// Copy a directory tree into the output when it exists beside this file, skipping it quietly
// when it does not.
function copyTreeIfPresent(name) {
  const source = join(scriptDir, name);
  if (!existsSync(source)) return;
  cpSync(source, join(outputDir, name), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyTreeIfPresent('game');
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
copyTreeIfPresent('screenshots');

writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, dossierOptions()),
);
