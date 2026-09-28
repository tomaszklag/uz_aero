/**
 * Ninerdeck - strażnik makiet `design/`: spis, linki, panele wariantów, prototyp.
 *
 * Po co. Makiety są zatwierdzoną specyfikacją, a przegląda się je jak PROTOTYP:
 * otwiera spis, znajduje ekran i przeklikuje się dalej tak, jak przeszedłby pilot.
 * Każdy plik niesie przy tym ręcznie przepisany pasek nawigacji, panel „Warianty tego
 * ekranu" i kartę w spisie - i to przepisywanie dryfuje po cichu. Do 2026-09-28 dwanaście
 * makiet nie miało karty w spisie, osiemnaście paneli oznaczało jako „ten ekran" cudzy
 * plik, a przejścia z bieżących ekranów prowadziły do archiwum linii 2.x. Nikt tego nie
 * widział, bo nic nie sprawdzało.
 *
 * REJESTREM MAKIET JEST SPIS (`design/index.html`): karta niesie plik i rodzaj
 * (`data-kind`), a karta archiwum - klasę `archive`. Test nie trzyma własnej listy, więc
 * przeniesienie makiety do archiwum albo dopisanie wzorca to zmiana jednej karty.
 *
 * Test mieszka w `app/`, bo to jedyny workspace z runnerem (jak `tokensCssVars.test.ts`).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const DESIGN = join(__dirname, '..', '..', '..', 'design');
const ENTRY = '00-login.html';

/** Rodzaje kart, które NIE są ekranem aplikacji - nie muszą być osiągalne klikaniem. */
const NOT_A_SCREEN = new Set(['Wzorzec', 'Spis', 'Archiwum']);

const read = (file: string): string => readFileSync(join(DESIGN, file), 'utf8');

/** Treść bez komentarzy HTML - komentarz z nazwą pliku nie jest linkiem. */
const code = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, '');

function htmlFilesUnder(dir: string): string[] {
  return readdirSync(join(DESIGN, dir)).flatMap((name) => {
    const rel = dir === '' ? name : `${dir}/${name}`;
    if (statSync(join(DESIGN, rel)).isDirectory()) return htmlFilesUnder(rel);
    return name.endsWith('.html') ? [rel] : [];
  });
}

type Link = { href: string; body: string };

function linksOf(html: string): Link[] {
  return [...code(html).matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, href, body]) => ({
    href: href!,
    body: body!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}

const isLocal = (href: string): boolean => !/^(https?:|mailto:|javascript:)/.test(href);

type Card = { file: string; kind: string; archive: boolean };

/** Karty spisu: `<a href="…" class="card …" data-kind="…">`. */
function cardsOf(index: string): Card[] {
  return [...code(index).matchAll(/<a href="([^"]+)" class="card([^"]*)" data-kind="([^"]+)"/g)].map(
    ([, href, classes, kind]) => ({ file: href!.split('#')[0]!, kind: kind!, archive: /\barchive\b/.test(classes!) }),
  );
}

const rootFiles = readdirSync(DESIGN).filter((f) => f.endsWith('.html') && f !== 'index.html').sort();
const cards = cardsOf(read('index.html'));
const cardOf = new Map(cards.map((c) => [c.file, c]));
const archived = new Set(cards.filter((c) => c.archive).map((c) => c.file));
const screens = cards.filter((c) => !c.archive && !NOT_A_SCREEN.has(c.kind) && !c.file.includes('/')).map((c) => c.file);

describe('makiety design/: spis, linki, panele wariantów i prototyp', () => {
  it('skaner znalazł makiety i spis (kontrola testu)', () => {
    // Bez tego zielone wyniki niżej mogłyby znaczyć „nie przeczytano nic".
    expect(rootFiles.length).toBeGreaterThan(100);
    expect(screens.length).toBeGreaterThan(80);
    expect(archived.size).toBeGreaterThan(5);
    expect(screens).toContain(ENTRY);
    expect(screens).toContain('20-pulpit.html');
  });

  it('każda makieta ma kartę w swoim spisie', () => {
    const missing = rootFiles.filter((f) => !cardOf.has(f));

    const panelIndex = read('panel/index.html');
    const panelMissing = readdirSync(join(DESIGN, 'panel'))
      .filter((f) => f.endsWith('.html') && f !== 'index.html' && !panelIndex.includes(`href="${f}"`))
      .map((f) => `panel/${f}`);

    expect([...missing, ...panelMissing]).toEqual([]);
  });

  it('żaden link ani kotwica w design/ nie prowadzi w próżnię', () => {
    const dead: string[] = [];
    for (const file of htmlFilesUnder('')) {
      const html = read(file);
      for (const { href } of linksOf(html)) {
        if (!isLocal(href) || href === '#') continue;
        const [path, anchor] = href.split('#');
        const target = path === '' ? file : normalize(join(dirname(file), path!)).replace(/\\/g, '/');
        if (!existsSync(join(DESIGN, target))) {
          dead.push(`${file} → ${href}`);
          continue;
        }
        if (anchor && target.endsWith('.html') && !read(target).includes(`id="${anchor}"`)) {
          dead.push(`${file} → ${href} (brak kotwicy)`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it('panel „Warianty tego ekranu" oznacza jako bieżący wyłącznie ten plik', () => {
    // Konwencja: bieżąca pozycja ma klasę `active` i plakietkę „ten ekran" (arkusz: „ten
    // arkusz"). Panel skopiowany od sąsiada zostawiał oba znaczniki przy cudzym pliku.
    const wrong: string[] = [];
    for (const file of rootFiles) {
      const card = cardOf.get(file);
      if (card == null || card.archive || NOT_A_SCREEN.has(card.kind)) continue;
      const panel = /<aside class="variants-panel">([\s\S]*?)<\/aside>/.exec(code(read(file)))?.[1];
      if (panel == null) continue;

      const items = [...panel.matchAll(/<a class="vp-item( active)?" href="([^"#]+)[^"]*">([\s\S]*?)<\/a>/g)];
      const active = items.filter((m) => m[1] != null).map((m) => m[2]);
      const tagged = items.filter((m) => /vp-tag">ten (ekran|arkusz)</.test(m[3]!)).map((m) => m[2]);
      if (active.length !== 1 || active[0] !== file) wrong.push(`${file}: active → [${active.join(', ')}]`);
      if (tagged.length !== 1 || tagged[0] !== file) wrong.push(`${file}: „ten ekran" → [${tagged.join(', ')}]`);
    }
    expect(wrong).toEqual([]);
  });

  it('bieżące makiety prowadzą do archiwum wyłącznie z dopiskiem „2.x"', () => {
    // Kliknięcie w prototypie, które bez ostrzeżenia ląduje w linii 2.x, pokazuje ekran,
    // którego pilot już nie ma - a wygląda jak część bieżącego flow. Arkusze wzorców
    // (LOADERY, ZGŁOSZENIA, IKONA) nie są częścią prototypu i ilustrują się czym chcą.
    const leaks: string[] = [];
    for (const file of rootFiles) {
      const card = cardOf.get(file);
      if (card == null || card.archive || NOT_A_SCREEN.has(card.kind)) continue;
      for (const { href, body } of linksOf(read(file))) {
        const target = href.split('#')[0]!;
        if (archived.has(target) && !body.includes('2.x')) leaks.push(`${file} → ${target} („${body.slice(0, 40)}")`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it(`każdy bieżący ekran da się osiągnąć klikaniem od ${ENTRY}, bez spisu i archiwum`, () => {
    // To jest własność PROTOTYPU: przegląd przechodzi przez aplikację tak, jak pilot,
    // a nie przez spis. Ekran osiągalny wyłącznie ze spisu jest ekranem bez wejścia.
    const seen = new Set([ENTRY]);
    const queue = [ENTRY];
    while (queue.length > 0) {
      const file = queue.shift()!;
      for (const { href } of linksOf(read(file))) {
        const target = href.split('#')[0]!;
        if (!isLocal(href) || target === '' || target.includes('/') || target === 'index.html') continue;
        if (archived.has(target) || seen.has(target) || !rootFiles.includes(target)) continue;
        seen.add(target);
        queue.push(target);
      }
    }
    expect(screens.filter((f) => !seen.has(f))).toEqual([]);
  });
});
