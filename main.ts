// Sunbreak Coastline, an entry for the gta6-01 bounty (Node 22, standard library only).
//
// The game itself is plain static files a desktop browser loads offline: game/index.html plus
// its ES modules, no library and no network request. It is a sun-soaked coastal city you can
// explore on foot and by car, with traffic and pedestrians on the streets, cars to steal, a
// wanted level with police chasing you, five story missions, combat, and a HUD with a minimap.
// This script is the entrypoint that hands the game in. It copies game/ and screenshots/ from
// beside this file into the output directory and writes dossier.json there, the summary the
// judge reads, built with the vendored make.fun library. Put 3 or 4 PNG or JPEG screenshots in
// screenshots/ (the first by name becomes the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where this script lives, derived from its own module URL so the program finds its files no
// matter which directory it is launched from.
function resolveScriptDir() {
  return dirname(fileURLToPath(import.meta.url));
}

// The output directory: the grader's /output, or MAKEFUN_OUTPUT_DIR when set for local runs.
function resolveOutputDir() {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

// The scorer's own caps (reference/gate.json). Only text_max_bytes shapes the bytes; the rest
// refuse an entry the scorer would refuse: more than 4 screenshots or one over 256 KiB, more
// than 993 files in game/ or 48 MiB of game files in all, or a path under game/ over 1000
// bytes (game/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
function buildCaps() {
  const screenshotCap = { max: 4, max_bytes: 262144 };
  return {
    text_max_bytes: 163840,
    screenshots: screenshotCap,
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  };
}

// Mirror a folder from beside this script into the output directory, if it exists there.
// A missing folder is skipped quietly.
function mirrorFolderIfPresent(home, target, name) {
  const source = join(home, name);
  if (!existsSync(source)) return;
  cpSync(source, join(target, name), { recursive: true });
}

// Build the judge's summary for the finished output directory and write it there.
function writeDossier(target) {
  const dossier = buildDossier(target, buildCaps());
  writeFileSync(join(target, 'dossier.json'), dossier);
}

function main() {
  const home = resolveScriptDir();
  const target = resolveOutputDir();

  mkdirSync(target, { recursive: true });
  mirrorFolderIfPresent(home, target, 'game');
  mkdirSync(join(target, 'screenshots'), { recursive: true });
  mirrorFolderIfPresent(home, target, 'screenshots');

  writeDossier(target);
}

main();
