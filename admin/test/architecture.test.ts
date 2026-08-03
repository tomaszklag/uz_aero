/**
 * UZ Aero — panel: GRANICE, KTÓRYCH NIE PILNUJE KOMPILATOR.
 *
 * Lustro `server/test/architecture.test.ts` i `app/src/__tests__/architecture.test.ts`,
 * z tą samą doktryną: reguła architektury jest warta tyle, ile jej egzekucja.
 * Dokument może się zdezaktualizować; ten plik nie.
 *
 * Pilnuje tabeli kierunków zależności z `docs/architektura-panelu-frontend.md` §2.1
 * oraz trzech reguł z §2.2 — z których najważniejsza brzmi: **panel nie liczy po
 * swojemu**. Nie zaczyna się to od `SELECT SUM` we froncie, tylko od `toFixed(1)`
 * w komórce tabeli.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');

/** Wszystkie pliki .ts/.tsx w katalogu (rekurencyjnie), ścieżki względem `src/`. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(relative(SRC, full).split(sep).join('/'));
    }
  };
  walk(join(SRC, dir));
  return out;
}

const read = (file: string): string => readFileSync(join(SRC, file), 'utf8');

/** Treść pliku BEZ komentarzy — skaner szuka kodu, nie prozy o kodzie. */
const codeOf = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Ścieżki modułów, z których plik importuje (`from '…'`). */
function importedFrom(code: string): string[] {
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) out.push(match[1]!);
  return out;
}

/** `src/queries/useSession.ts` + `../api/session` → `queries/api/session`-owa rodzina. */
function resolveImport(file: string, specifier: string): string {
  if (!specifier.startsWith('.')) return specifier;
  const parts = join(file, '..', specifier).split(sep).join('/');
  return parts;
}

/** Czy plik (po rozwiązaniu ścieżki) należy do danej warstwy `src/`. */
const inLayer = (resolved: string, layer: string): boolean => resolved.startsWith(`${layer}/`);

/** Import WARTOŚCIOWY (nie `import type`) z danego modułu. */
function valueImportsFrom(code: string, module: string): boolean {
  const re = new RegExp(String.raw`import\s+(?!type\s)([^;]*?)\s+from\s+'${module}'`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    // `import { type A, type B } from '…'` jest importem typów mimo braku `import type`.
    const clause = match[1]!;
    const names = clause.replace(/[{}]/g, '').split(',').map((n) => n.trim()).filter(Boolean);
    if (names.some((n) => !n.startsWith('type '))) return true;
  }
  return false;
}

/**
 * Wyrażenia z `className={…}` — z BILANSEM KLAMER, nie regexem do pierwszej `}`.
 *
 * Regex musiałby uciąć `` className={`pill ${map[k] ?? 'dim'}`} `` na klamrze zamykającej
 * interpolację, czyli przestałby widzieć drugą połowę wyrażenia. Klamry wewnątrz literałów
 * napisowych mogłyby ten licznik przekręcić — w panelu nie ma ani jednego takiego miejsca,
 * a udawanie parsera TSX byłoby kosztem większym od reguły, której broni.
 */
function classNameExpressions(code: string): string[] {
  const out: string[] = [];
  const re = /className=\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < code.length && depth > 0) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}') depth -= 1;
      i += 1;
    }
    if (depth === 0) out.push(code.slice(start, i - 1));
  }
  return out;
}

/** Wyrażenia `className`, w których nazwa klasy powstaje z KAWAŁKÓW. */
function classNameOffenders(files: string[], source: (file: string) => string): string[] {
  const out: string[] = [];
  for (const file of files) {
    for (const expression of classNameExpressions(source(file))) {
      // 1. Literał szablonowy z interpolacją PRZYKLEJONĄ do tekstu (`fresh-${x}`, `${x}px`).
      const template = /`([^`]*)`/.exec(expression)?.[1];
      const glued =
        template != null && (/[^\s`]\$\{/.test(template) || /\}[^\s`]/.test(template));
      // 2. Dodawanie napisów: `'fresh-' + x` albo `x + '-stale'`.
      const concatenated = /['"][^'"]*['"]\s*\+|\+\s*['"]/.test(expression);
      // 3. `join` separatorem, który NIE jest spacją: `['fresh', x].join('-')`.
      //    `join(' ')` składa listę KLAS i jest wzorcem panelu, nie naruszeniem.
      const joined = /\.join\(\s*['"][^\s'"]/.test(expression);
      if (glued || concatenated || joined) out.push(`${file} → ${expression}`);
    }
  }
  return out;
}

describe('granice warstw panelu', () => {
  // Bez tego zielony wynik pozostałych przypadków nic nie znaczy: pusta lista plików
  // albo zepsuty regex dałyby „brak naruszeń" przy dowolnie połamanej architekturze.
  it('skaner faktycznie widzi pliki i treści (kontrola samego testu)', () => {
    expect(filesUnder('.').length).toBeGreaterThan(20);
    expect(filesUnder('api')).toContain('api/httpClient.ts');
    expect(filesUnder('ui')).toContain('ui/shell/Sidebar.tsx');

    // Skaner `fetch` widzi jedyne prawdziwe wystąpienie…
    expect(codeOf('api/httpClient.ts')).toMatch(/\bfetch\(/);
    // …a zdejmowanie komentarzy zjada prozę, nie kod.
    expect(codeOf('api/httpClient.ts')).not.toContain('JEDYNE miejsce');

    // Rozwiązywanie ścieżek względnych działa.
    expect(resolveImport('queries/useSession.ts', '../api/session')).toBe('api/session');
    expect(resolveImport('ui/shell/Sidebar.tsx', '../../auth/can')).toBe('auth/can');

    // Rozróżnianie importu typu od wartości działa w OBIE strony.
    expect(valueImportsFrom("import type { X } from 'm';", 'm')).toBe(false);
    expect(valueImportsFrom("import { X } from 'm';", 'm')).toBe(true);
    expect(valueImportsFrom("import { type X } from 'm';", 'm')).toBe(false);
  });

  it('`fetch` występuje WYŁĄCZNIE w api/httpClient.ts', () => {
    // Dopóki sieć ma jedne drzwi, „skąd wzięła się ta liczba" ma zawsze tę samą
    // odpowiedź. Drugie wywołanie `fetch` w komponencie jest pierwszym krokiem
    // do panelu, który liczy po swojemu.
    const offenders = filesUnder('.')
      .filter((f) => f !== 'api/httpClient.ts')
      .filter((f) => /\bfetch\(/.test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('`api/` nie zna Reacta ani warstw nad sobą', () => {
    const offenders: string[] = [];
    for (const file of filesUnder('api')) {
      for (const from of importedFrom(codeOf(file))) {
        const resolved = resolveImport(file, from);
        const forbidden =
          from === 'react' ||
          from.startsWith('react-') ||
          from.startsWith('@tanstack/') ||
          inLayer(resolved, 'queries') ||
          inLayer(resolved, 'screens') ||
          inLayer(resolved, 'ui') ||
          inLayer(resolved, 'auth');
        if (forbidden) offenders.push(`${file} → ${from}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('`queries/` nie zna ekranów ani komponentów', () => {
    const offenders: string[] = [];
    for (const file of filesUnder('queries')) {
      for (const from of importedFrom(codeOf(file))) {
        const resolved = resolveImport(file, from);
        if (inLayer(resolved, 'screens') || inLayer(resolved, 'ui')) {
          offenders.push(`${file} → ${from}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('`ui/` NIE zna `api/` ani `queries/` — komponent dostaje dane propsami', () => {
    // To jest reguła, która trzyma bibliotekę komponentów przy życiu: komponent
    // sięgający po dane sam nie da się użyć drugi raz w innym kontekście, a wtedy
    // „design system" zamienia się w zbiór jednorazowych kawałków ekranu.
    //
    // Wyjątek: `import type` z `api/dto.ts`. DTO jest KSZTAŁTEM danych, które
    // komponent i tak dostaje propsami; alternatywą byłaby trzecia deklaracja
    // tych samych pól, czyli dokładnie ta duplikacja, której unikamy.
    const offenders: string[] = [];
    for (const file of filesUnder('ui')) {
      const code = codeOf(file);
      for (const from of importedFrom(code)) {
        const resolved = resolveImport(file, from);
        if (resolved === 'api/dto' && !valueImportsFrom(code, from)) continue;
        if (inLayer(resolved, 'api') || inLayer(resolved, 'queries') || inLayer(resolved, 'screens')) {
          offenders.push(`${file} → ${from}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('moduły CZYSTE (`.ts` w screens/ i ui/) nie importują Reacta', () => {
    // Rozdział, na którym stoi cała testowalność panelu: decyzja o treści mieszka
    // w `.ts` obok ekranu i ma test w Node, a `.tsx` odpowiada wyłącznie za układ.
    const offenders = [...filesUnder('screens'), ...filesUnder('ui')]
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => importedFrom(codeOf(f)).some((from) => from === 'react'));
    expect(offenders).toEqual([]);
  });

  it('z `@uzaero/domain` wolno importować WYŁĄCZNIE typy', () => {
    // Zakaz ma jeden konkretny cel: odciąć panelowi możliwość liczenia. Skoro
    // `projectSession` jest nieosiągalne, jedynym źródłem liczby jest odpowiedź
    // serwera (`docs/architektura-panelu-frontend.md` §5.1).
    const offenders = filesUnder('.').filter((f) => valueImportsFrom(codeOf(f), '@uzaero/domain'));
    expect(offenders).toEqual([]);
  });

  it('nigdzie nie importujemy z `server/src` — panel nie widzi wnętrza serwera', () => {
    const offenders = filesUnder('.').filter((f) =>
      importedFrom(codeOf(f)).some((from) => from.includes('server/src') || from.includes('@uzaero/server')),
    );
    expect(offenders).toEqual([]);
  });

  it('arytmetyka NIE mieszka w widoku — `toFixed`, `Math.round`, `Intl.NumberFormat`', () => {
    // Najtańszy sposób złapania momentu, w którym panel zaczyna liczyć po swojemu:
    // zaczyna się od zaokrąglenia w komórce tabeli. Liczby przychodzą z serwera,
    // formaty z `@uzaero/format`.
    const banned = /\.toFixed\(|Math\.round\(|Math\.floor\(|Math\.ceil\(|Intl\.NumberFormat/;
    const offenders = filesUnder('.')
      .filter((f) => f.endsWith('.tsx') || f.startsWith('ui/'))
      .filter((f) => banned.test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('plik .tsx eksportuje WYŁĄCZNIE komponenty (granica Fast Refresh)', () => {
    // Reguła narzędziowa, nie estetyczna. Fast Refresh podmienia moduł w miejscu tylko
    // wtedy, gdy WSZYSTKIE jego eksporty są komponentami; jeden eksport obok — hook,
    // stała, tablica — i Vite odrzuca cały moduł jako granicę odświeżania:
    //
    //     [vite] hmr invalidate /src/auth/SessionProvider.tsx:
    //     Could not Fast Refresh ("useSessionState" export is incompatible)
    //
    // Unieważnienie idzie wtedy w górę drzewa importów aż do `main.tsx`, który niczego
    // nie przyjmuje — więc kończy się PRZEŁADOWANIEM CAŁEJ STRONY. W panelu znaczy to
    // utratę stanu ekranu i ponowne `GET /me` przy każdym zapisie pliku. Kosztu nie
    // widać w testach ani w buildzie, tylko w pracy człowieka, dlatego pilnuje go test.
    //
    // Stąd `auth/sessionContext.ts` osobno od `auth/SessionProvider.tsx`.
    const EXCEPTIONS = new Set([
      // Tablice KONFIGURACJI, które zawierają JSX (elementy tras, ikony pozycji), więc
      // muszą być `.tsx` — ale komponentami nie są i odświeżyć się nie mogą. Pełne
      // przeładowanie po edycji mapy tras albo nawigacji jest tu zachowaniem POPRAWNYM:
      // zmienia się szkielet aplikacji, a nie ciało komponentu.
      'routes.tsx',
      'ui/shell/navItems.tsx',
    ]);

    const exportsOf = (file: string): { kind: string; name: string }[] =>
      [...codeOf(file).matchAll(/^export\s+(?:async\s+)?(function|const|class|let)\s+(\w+)/gm)].map(
        (m) => ({ kind: m[1]!, name: m[2]! }),
      );

    const tsx = filesUnder('.').filter((f) => f.endsWith('.tsx'));

    // Kontrola samego skanera: gdyby regex przestał cokolwiek łapać, lista naruszeń
    // byłaby pusta przy dowolnie połamanym panelu.
    expect(tsx.length).toBeGreaterThan(30);
    expect(exportsOf('auth/SessionProvider.tsx')).toEqual([
      { kind: 'function', name: 'SessionProvider' },
    ]);

    const offenders: string[] = [];
    for (const file of tsx.filter((f) => !EXCEPTIONS.has(f))) {
      for (const { kind, name } of exportsOf(file)) {
        // Komponent w tym panelu to ZAWSZE `export function` z wielkiej litery.
        // `export const` bywa komponentem (`memo`, `forwardRef`), ale tutaj nie ma
        // ani jednego takiego — więc reguła zostaje wąska i czytelna.
        if (kind !== 'function' || !/^[A-Z]/.test(name)) offenders.push(`${file} → ${kind} ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('nazwa klasy CSS nie powstaje przez SKLEJENIE w .tsx', () => {
    // Wada, która to wymusiła (`A07`, przekrój floty): ekran renderował
    //
    //     className={`cell-sub fresh-${row.mh.freshness}`}
    //
    // czyli wypisywał `fresh-stale` — klasę, której nie definiuje ani `SZABLON.html`,
    // ani żaden arkusz panelu. Trzy stany świeżości były policzone, przetestowane
    // (`fleetRows.test.ts`) i NIEWIDOCZNE: odczyt sprzed trzech minut i sprzed dwóch dni
    // wyglądały identycznie. Ani kompilator, ani testy modułu czystego nie mają jak
    // tego zobaczyć — nazwa klasy powstaje dopiero w przeglądarce.
    //
    // Reguła: nazwa klasy w `className` musi być CAŁYM tokenem. `` `pill ${tone}` `` jest
    // w porządku (podstawiamy nazwę klasy), `` `fresh-${x}` `` nie jest (sklejamy nazwę
    // z fragmentu). Nazwa klasy jest decyzją o treści, więc — jak każda inna — mieszka
    // w module czystym z testem, który może sprawdzić ją wobec arkusza i wobec mockupu.
    //
    // ══ TRZY SPOSOBY SKLEJENIA, NIE JEDEN (rozszerzenie 2026-08-01) ══
    // Do tej pory reguła widziała wyłącznie literał szablonowy, więc `'fresh-' + x`
    // i `['fresh', x].join('-')` przechodziły bez śladu — a produkują dokładnie tę samą
    // niewidzialną klasę. Skaner czyta więc CAŁE wyrażenie `className={…}` (z bilansem
    // klamer, żeby `${…}` w środku nie ucinało go w połowie) i sprawdza wszystkie trzy.
    const offenders = classNameOffenders(
      filesUnder('.').filter((f) => f.endsWith('.tsx')),
      codeOf,
    );
    expect(offenders).toEqual([]);
  });

  it('skaner nazw klas faktycznie łapie sklejenia (kontrola samego testu)', () => {
    // Jedyny przypadek w tym pliku, który do 2026-08-01 nie miał asercji kontrolnej —
    // a jest jedynym opartym na skanerze WŁASNEJ konstrukcji (bilans klamer), więc
    // najłatwiej go po cichu zepsuć. Bez tego „zero naruszeń" mogłoby znaczyć „zero
    // znalezionych wyrażeń".
    const sample = (code: string): string[] =>
      classNameOffenders(['x.tsx'], () => code).map((o) => o.split(' → ')[1] ?? '');

    // Skaner w ogóle coś widzi w prawdziwym panelu.
    expect(classNameExpressions(codeOf('ui/components/Pill.tsx')).length).toBeGreaterThan(0);

    // ZŁE — trzy postaci tego samego błędu.
    expect(sample('<i className={`fresh-${x}`} />')).toHaveLength(1);
    expect(sample("<i className={'fresh-' + x} />")).toHaveLength(1);
    expect(sample("<i className={['fresh', x].join('-')} />")).toHaveLength(1);

    // DOBRE — podstawiamy CAŁE nazwy klas, nie ich kawałki.
    expect(sample('<i className={`pill ${tone}`} />')).toEqual([]);
    expect(sample("<i className={[a, b].filter(Boolean).join(' ')} />")).toEqual([]);
    expect(sample("<i className={live ? 'dot live' : 'dot'} />")).toEqual([]);
    // Zagnieżdżone klamry w interpolacji nie ucinają wyrażenia w połowie — inaczej
    // skaner przestawałby widzieć wszystko, co po nich następuje.
    expect(classNameExpressions('<i className={`pill ${map[k] ?? "dim"}`} />')).toEqual([
      '`pill ${map[k] ?? "dim"}`',
    ]);
  });

  it('kolory wchodzą WYŁĄCZNIE przez zmienne CSS — zero hexów w kodzie', () => {
    // `CLAUDE.md`: „Nie wpisuj hardcoded kolorów — tylko zmienne CSS". W panelu
    // wszystkie pochodzą z generowanego `tokens.css`.
    const offenders = filesUnder('.').filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(codeOf(f)));
    expect(offenders).toEqual([]);
  });
});
