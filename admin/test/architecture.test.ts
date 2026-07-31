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

  it('kolory wchodzą WYŁĄCZNIE przez zmienne CSS — zero hexów w kodzie', () => {
    // `CLAUDE.md`: „Nie wpisuj hardcoded kolorów — tylko zmienne CSS". W panelu
    // wszystkie pochodzą z generowanego `tokens.css`.
    const offenders = filesUnder('.').filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(codeOf(f)));
    expect(offenders).toEqual([]);
  });
});
