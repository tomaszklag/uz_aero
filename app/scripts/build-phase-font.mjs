/**
 * UZ Aero — generator fontu własnych glifów (assets/fonts/UZAeroPhases.ttf).
 *
 * Dlaczego font, a nie react-native-svg: projekt świadomie nie dokłada modułów
 * natywnych ponad expo-font (nagłówek `Icon.tsx`), a font ładuje się przez Metro
 * bez przebudowy dev clienta. Źródłem prawdy są SVG w assets/phase-icons/ —
 * fazy lotu (rodzina 05) wklejamy do mockupów w tych samych kształtach.
 *
 * Poza fazami font niesie ZNAK MARKI (issue #54): samolot z mockupów logowania
 * i jego przekreślony wariant z 09C. Żaden zestaw fontowy nie ma tego kształtu
 * (mockupy rysują go strokiem w stylu Lucide), a MDI `airplane` podstawiane
 * w zamian różniło się od ikony launchera generowanej wprost z mockupu.
 * `plane.svg` (stroke 1.6 — marka, 00/00a/00b) i `plane-off.svg` (1.4 + linia
 * 3,3→21,21 — 09C) to DOSŁOWNIE ścieżki z mockupów; na wypełnienie, którego
 * wymaga font, zamienia je `stroke-outline.mjs` w czasie generacji — obrys
 * ANALITYCZNY (Clipper), nie trasowanie rastra: potrace zostawiał falujące
 * krawędzie na skosach (zgłoszenie z urządzenia, 2026-08-26). Zmiana kształtu
 * = podmiana ścieżki stroke jak w mockupie.
 *
 * Uruchomienie: npm run build:phase-font (wynik commitujemy do repo — build
 * aplikacji NIE zależy od tego skryptu).
 *
 * Kontrakt ze `src/ui/components/foundation/Icon.tsx`: nazwy plików i punkty
 * kodowe muszą zgadzać się z mapą PHASE_GLYPHS — zmieniasz tu, zmień i tam.
 */

import { createWriteStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';

import { expandStrokes } from './stroke-outline.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'assets', 'phase-icons');
const outDir = join(root, 'assets', 'fonts');

/** Punkty kodowe w obszarze prywatnym — stałe, żeby TTF był odtwarzalny. */
const GLYPHS = [
  { file: 'phase-taxi.svg', name: 'plane-taxi', codepoint: 0xe001 },
  { file: 'phase-propeller.svg', name: 'propeller', codepoint: 0xe002 },
  { file: 'plane.svg', name: 'plane', codepoint: 0xe003 },
  { file: 'plane-off.svg', name: 'plane-off', codepoint: 0xe004 },
];

const fontStream = new SVGIcons2SVGFontStream({
  fontName: 'UZAeroPhases',
  fontHeight: 1000,
  normalize: true,
  log: () => {},
});

const chunks = [];
fontStream.on('data', (c) => chunks.push(Buffer.from(c)));
fontStream.on('end', () => {
  const svgFont = Buffer.concat(chunks).toString('utf8');
  const ttf = svg2ttf(svgFont, {});
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'UZAeroPhases.ttf');
  writeFileSync(out, Buffer.from(ttf.buffer));
  console.log(`OK → ${out} (${ttf.buffer.length} B)`);
});

import { Readable } from 'node:stream';
for (const { file, name, codepoint } of GLYPHS) {
  const raw = readFileSync(join(srcDir, file), 'utf8');
  // Źródła rysowane kreską (znak marki) dostają obrys; wypełnione (fazy) idą wprost.
  const glyph = Readable.from([expandStrokes(raw) ?? raw]);
  glyph.metadata = { name, unicode: [String.fromCodePoint(codepoint)] };
  fontStream.write(glyph);
}
fontStream.end();
