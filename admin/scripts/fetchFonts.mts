/**
 * UZ Aero - panel: generator czcionek self-hostowanych (`npm run fonts:fetch`).
 *
 * Pobiera woff2 (subsety latin + latin-ext - polskie znaki) z Google Fonts
 * do `public/fonts/` razem z licencjami OFL i emituje `src/styles/fonts.css`
 * z deklaracjami @font-face 1:1 z odpowiedzią css2 (wagi, unicode-range,
 * font-display: swap). Ten sam wzorzec, co `tokens:css`: plik wynikowy jest
 * GENEROWANY, poprawki wchodzą przez ponowny bieg, nie ręczną edycję.
 *
 * Uruchamiać przy zmianie zestawu rodzin/wag w CSS2_URL - wymaga sieci.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN = dirname(dirname(fileURLToPath(import.meta.url)));
const FONTS_DIR = join(ADMIN, 'public', 'fonts');
const CSS_OUT = join(ADMIN, 'src', 'styles', 'fonts.css');

const CSS2_URL =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500;700&display=swap';

// UA nowoczesnej przeglądarki - bez niego Google oddaje TTF zamiast woff2.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SUBSETS = new Set(['latin', 'latin-ext']);

const SLUGS: Record<string, string> = {
  Archivo: 'archivo',
  'Bebas Neue': 'bebas-neue',
  'JetBrains Mono': 'jetbrains-mono',
};

interface Face {
  subset: string;
  family: string;
  style: string;
  weight: string;
  url: string;
  unicodeRange: string;
}

const cssResponse = await fetch(CSS2_URL, { headers: { 'user-agent': UA } });
if (!cssResponse.ok) throw new Error(`css2: HTTP ${cssResponse.status}`);
const css = await cssResponse.text();

const faces: Face[] = [];
const blockRe = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
for (const match of css.matchAll(blockRe)) {
  const [, subset, body] = match;
  const field = (name: string): string => {
    const m = body!.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (m == null) throw new Error(`brak pola ${name} w bloku ${subset}`);
    return m[1]!.trim();
  };
  const src = body!.match(/url\((https:[^)]+\.woff2)\)/);
  if (src == null) throw new Error(`brak url woff2 w bloku ${subset} - zły User-Agent?`);
  faces.push({
    subset: subset!,
    family: field('font-family').replace(/'/g, ''),
    style: field('font-style'),
    weight: field('font-weight'),
    url: src[1]!,
    unicodeRange: field('unicode-range'),
  });
}

const wanted = faces.filter((f) => SUBSETS.has(f.subset));
if (wanted.length === 0) throw new Error('nic nie sparsowano - format css2 się zmienił?');

mkdirSync(FONTS_DIR, { recursive: true });

// Jeden URL może obsługiwać kilka deklaracji (font zmienny) - pobieramy raz.
const fileByUrl = new Map<string, string>();
for (const face of wanted) {
  if (fileByUrl.has(face.url)) continue;
  const slug = SLUGS[face.family];
  if (slug == null) throw new Error(`nieznana rodzina: ${face.family}`);
  // Bez wagi w nazwie: Google oddaje font ZMIENNY - jeden plik na rodzinę×subset
  // obsługuje wszystkie wagi (dlatego deklaracji jest więcej niż plików).
  const name = `${slug}-${face.subset}.woff2`;
  const res = await fetch(face.url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`woff2 ${face.url}: HTTP ${res.status}`);
  writeFileSync(join(FONTS_DIR, name), Buffer.from(await res.arrayBuffer()));
  fileByUrl.set(face.url, name);
  console.log(`✓ ${name} (${res.headers.get('content-length')} B)`);
}

const header = `/**
 * UZ Aero - panel: czcionki self-hostowane (§9 architektury frontendu).
 *
 * PLIK GENEROWANY skryptem (pobranie woff2 z Google Fonts + emisja @font-face) -
 * poprawki wprowadzaj przez ponowne wygenerowanie, nie ręcznie. Subsety latin
 * + latin-ext (polskie znaki); wagi jak w dawnym linku CDN: Archivo 400–800,
 * Bebas Neue 400, JetBrains Mono 400/500/700. Licencje OFL: public/fonts/OFL-*.txt.
 *
 * Ścieżki /fonts/* są absolutne od korzenia serwisu - Vite przepisuje je pod
 * base '/admin/' przy buildzie (weryfikacja: grep dist/assets/*.css po '/admin/fonts/').
 */
`;

const blocks = wanted.map(
  (f) => `/* ${f.family} · ${f.weight} · ${f.subset} */
@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: swap;
  src: url('/fonts/${fileByUrl.get(f.url)}') format('woff2');
  unicode-range: ${f.unicodeRange};
}`,
);

writeFileSync(CSS_OUT, `${header}\n${blocks.join('\n\n')}\n`);
console.log(`✓ ${CSS_OUT}: ${wanted.length} deklaracji, ${fileByUrl.size} plików`);

// Licencje OFL z oficjalnego repo Google Fonts.
const LICENSES: Array<[string, string]> = [
  ['OFL-Archivo.txt', 'https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/OFL.txt'],
  ['OFL-BebasNeue.txt', 'https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/OFL.txt'],
  [
    'OFL-JetBrainsMono.txt',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt',
  ],
];
for (const [name, url] of LICENSES) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`licencja ${url}: HTTP ${res.status}`);
  writeFileSync(join(FONTS_DIR, name), await res.text());
  console.log(`✓ ${name}`);
}
