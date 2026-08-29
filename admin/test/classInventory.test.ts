/**
 * UZ Aero - panel: SZABLON JEST INWENTARZEM, nie ilustracją.
 *
 * Reguła z `CLAUDE.md` i `docs/architektura-panelu-frontend.md` §3.3: klasa używana
 * w panelu musi mieć regułę ZARÓWNO w `admin/src/styles/**`, JAK I w
 * `design/admin/SZABLON.html`. Powód jest praktyczny, nie porządkowy - szablon to
 * jedyne miejsce, w którym da się zobaczyć komplet komponentów back-office'u naraz,
 * a `CLAUDE.md` każe zaczynać każdy nowy ekran od skopiowania stamtąd `<head>`.
 * Klasa, której tam nie ma, jest niewidoczna dla autora następnego ekranu: napisze
 * ją drugi raz pod inną nazwą albo - gorzej - użyje jej, nie mając reguły.
 *
 * ══ KIERUNEK JEST JEDEN I TO JEST ŚWIADOME ══
 * Sprawdzamy WYŁĄCZNIE „panel ⊆ szablon". Odwrotna strona NIE jest naruszeniem:
 * szablon celowo wyprzedza implementację i niesie komponenty ekranów, których jeszcze
 * nie ma (progi, pulpit, statystyki), plus ramę samego mockupu (okno przeglądarki,
 * panel wariantów, nav-strip). W chwili pisania to sześćdziesiąt klas - wymuszanie
 * równości kazałoby albo kasować z szablonu inwentarz zaprojektowany i zatwierdzony,
 * albo trzymać listę wyjątków dłuższą od reguły, którą i tak trzeba by ruszać przy
 * każdym ekranie. Jedno i drugie zamieniłoby test w koszt bez zysku.
 *
 * Czego ten test NIE łapie: klasy użytej w `.tsx`, która nie ma reguły NIGDZIE.
 * Broni przed tym para z `architecture.test.ts` - zakaz sklejania nazw klas
 * w `.tsx` (nazwa musi być literałem, więc da się ją wygrepować) - oraz test
 * inwentarza klas świeżości w `screens/fleet/fleetRows.test.ts`. Pełne skanowanie
 * `className` to osobna praca; ta luka jest tu nazwana, żeby nikt nie uznał,
 * że jest zamknięta.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const STYLES = join(__dirname, '..', 'src', 'styles');
const SZABLON = join(__dirname, '..', '..', 'design', 'admin', 'SZABLON.html');

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return full.endsWith('.css') ? [full] : [];
  });
}

/**
 * Nazwy klas z SELEKTORÓW. Komentarze zdejmujemy (proza o klasie to nie klasa),
 * a z każdej reguły bierzemy wyłącznie część przed `{` - inaczej wartości typu
 * `.5rem` czy `rgba(…,0.05)` wjeżdżałyby do zbioru jako klasy.
 */
function classesIn(css: string): Set<string> {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = new Set<string>();
  for (const block of code.split('}')) {
    const selector = block.split('{')[0] ?? '';
    for (const match of selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) out.add(match[1]!);
  }
  return out;
}

const panelClasses = (): Set<string> =>
  classesIn(
    cssFiles(STYLES)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n'),
  );

const templateClasses = (): Set<string> => {
  const html = readFileSync(SZABLON, 'utf8');
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!).join('\n');
  return classesIn(styles);
};

describe('inwentarz klas: panel ↔ SZABLON.html', () => {
  // Bez tego zielony wynik nic nie znaczy: pusty zbiór po którejkolwiek stronie
  // dałby „brak naruszeń" przy dowolnie rozjechanym inwentarzu.
  it('skaner faktycznie czyta obie strony (kontrola samego testu)', () => {
    const panel = panelClasses();
    const template = templateClasses();

    expect(panel.size).toBeGreaterThan(100);
    expect(template.size).toBeGreaterThan(100);

    // Klasy, o których wiemy, że są po obu stronach - gdyby regex przestał łapać
    // selektory złożone albo modyfikatory, ten wiersz padnie pierwszy.
    for (const known of ['table-wrap', 'chip', 'drawer', 'banner', 'cell-sub']) {
      expect(panel.has(known), `panel: .${known}`).toBe(true);
      expect(template.has(known), `szablon: .${known}`).toBe(true);
    }

    // Zdejmowanie komentarzy działa: słowo z prozy nie jest klasą…
    expect(classesIn('/* .tylko-w-komentarzu */ .realna { color:red; }')).toEqual(
      new Set(['realna']),
    );
    // …a wartość z wnętrza reguły też nie.
    expect(classesIn('.x { margin:.5rem; background:rgba(0,0,0,0.05); }')).toEqual(
      new Set(['x']),
    );
  });

  it('każda klasa panelu ma regułę w SZABLON.html', () => {
    // Naruszenie znaczy jedno z dwojga i oba są warte zatrzymania: albo komponent
    // powstał w panelu z pominięciem szablonu (więc następny ekran go nie zobaczy),
    // albo styl rozjechał się między jednym a drugim.
    const template = templateClasses();
    const missing = [...panelClasses()]
      .filter((c) => !template.has(c))
      .sort()
      .map((c) => `.${c}`);

    expect(missing).toEqual([]);
  });
});
