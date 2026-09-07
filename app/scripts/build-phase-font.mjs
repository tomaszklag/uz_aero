/**
 * UZ Aero - generator fontu ikon faz lotu (assets/fonts/UZAeroPhases.ttf).
 *
 * Dlaczego font, a nie react-native-svg: projekt świadomie nie dokłada modułów
 * natywnych ponad expo-font (nagłówek `Icon.tsx`), a font ładuje się przez Metro
 * bez przebudowy dev clienta. Źródłem prawdy są SVG w assets/phase-icons/ -
 * te same kształty wklejamy do mockupów rodziny 05.
 *
 * Uruchomienie: npm run build:phase-font (wynik commitujemy do repo - build
 * aplikacji NIE zależy od tego skryptu).
 *
 * Kontrakt ze `src/ui/components/foundation/Icon.tsx`: nazwy plików i punkty
 * kodowe muszą zgadzać się z mapą PHASE_GLYPHS - zmieniasz tu, zmień i tam.
 */

import { createWriteStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'assets', 'phase-icons');
const outDir = join(root, 'assets', 'fonts');

/** Punkty kodowe w obszarze prywatnym - stałe, żeby TTF był odtwarzalny. */
const GLYPHS = [
  { file: 'phase-taxi.svg', name: 'plane-taxi', codepoint: 0xe001 },
  { file: 'phase-propeller.svg', name: 'propeller', codepoint: 0xe002 },
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
  const glyph = Readable.from([readFileSync(join(srcDir, file), 'utf8')]);
  glyph.metadata = { name, unicode: [String.fromCodePoint(codepoint)] };
  fontStream.write(glyph);
}
fontStream.end();
