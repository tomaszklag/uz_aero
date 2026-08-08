/**
 * UZ Aero — test GRANIC WARSTW.
 *
 * Reguła architektury jest warta tyle, ile jej egzekucja. Projekt nie ma jeszcze ESLinta
 * (patrz `docs/architektura-kodu.md` — gotowa konfiguracja `no-restricted-imports` czeka
 * na jego wprowadzenie), więc kierunek zależności pilnuje test: skanuje pliki źródłowe
 * i sprawdza, czego importują.
 *
 * Kierunek jest jednokierunkowy, do środka:
 *
 *   ui  →  application  →  domain
 *   infrastructure  →  application/ports  →  domain
 *
 * Test celowo czyta pliki z dysku zamiast polegać na module graph — dzięki temu wyłapuje
 * też importy typów (`import type`), które w runtime znikają, a i tak wiążą warstwy.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(__dirname, '..');

/**
 * Domena mieszka od Fazy 2 w `packages/domain` (współdzielona z serwerem) — skanujemy
 * ją tam. W `app/src/domain` został wyłącznie shim zgodności (`export * from '@uzaero/domain'`).
 */
const DOMAIN_SRC = join(__dirname, '..', '..', '..', 'packages', 'domain', 'src');

/** Wszystkie pliki .ts/.tsx w katalogu (rekurencyjnie), ścieżki względem bazy. */
function filesUnder(base: string, dir: string): string[] {
  const abs = join(base, dir);
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry)) {
        out.push(relative(base, full).split(sep).join('/'));
      }
    }
  };
  walk(abs);
  return out;
}

const sourceFiles = (dir: string): string[] => filesUnder(SRC, dir);
const domainFiles = (): string[] => filesUnder(DOMAIN_SRC, '.');

const importsOf = (file: string): string[] => importsFrom(SRC, file);
const domainImportsOf = (file: string): string[] => importsFrom(DOMAIN_SRC, file);

/** Źródła importów z pliku: `import … from 'x'`, `export … from 'x'`, `require('x')`. */
function importsFrom(base: string, file: string): string[] {
  const code = readFileSync(join(base, file), 'utf8');
  const found: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) found.push(m[1]!);
  }
  return found;
}

/** Pakiety spoza domeny: framework UI, natywne moduły, store. */
const FRAMEWORK = [
  /^react$/,
  /^react\//,
  /^react-native$/,
  /^react-native[-/]/,
  /^@react-native/,
  /^expo$/,
  /^expo-/,
  /^@expo/,
  /^zustand/,
];

const isFramework = (spec: string): boolean => FRAMEWORK.some((re) => re.test(spec));

/** Import do innej warstwy: `../application`, `../../infrastructure/...` itp. */
function crossesTo(spec: string, layer: string): boolean {
  return new RegExp(`(^|/)\\.\\.?/(\\.\\./)*${layer}(/|$)`).test(spec);
}

describe('granice warstw', () => {
  // Bez tego zielony wynik pozostałych testów nic nie znaczy: pusta lista plików albo
  // zepsuty regex dałyby „brak naruszeń" przy dowolnie połamanej architekturze.
  it('skaner faktycznie widzi pliki i importy (kontrola samego testu)', () => {
    expect(domainFiles().length).toBeGreaterThan(5);
    expect(sourceFiles('application').length).toBeGreaterThan(5);

    const storeImports = importsOf('ui/store/sessionStore.ts');
    expect(storeImports).toContain('zustand');
    expect(storeImports).toContain('../../domain');
    expect(isFramework('zustand')).toBe(true);
    expect(crossesTo('../../infrastructure/clock', 'infrastructure')).toBe(true);
    expect(crossesTo('../ui/theme', 'ui')).toBe(true);
    expect(crossesTo('./violations', 'ui')).toBe(false);

    // Shim w `app/src/domain` ma być JEDYNYM plikiem i tylko re-eksportem pakietu.
    expect(sourceFiles('domain')).toEqual(['domain/index.ts']);
    expect(importsOf('domain/index.ts')).toEqual(['@uzaero/domain']);
  });

  it('domain (packages/domain) nie importuje Reacta, RN, Expo, SQLite ani Zustanda', () => {
    const offenders: string[] = [];
    for (const file of domainFiles()) {
      for (const spec of domainImportsOf(file)) {
        if (isFramework(spec)) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('domain nie importuje ŻADNEGO pakietu — czysty TS, zero zależności', () => {
    // Mocniejsze niż w aplikacji: domena jest współdzielona z serwerem, więc każdy
    // import pakietu (choćby dev-owego) wiązałby OBIE strony z jego obecnością.
    const offenders: string[] = [];
    for (const file of domainFiles()) {
      for (const spec of domainImportsOf(file)) {
        if (!spec.startsWith('.')) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('domain nie sięga do app/ ani server/ ścieżkami względnymi', () => {
    const offenders: string[] = [];
    for (const file of domainFiles()) {
      for (const spec of domainImportsOf(file)) {
        if (/(^|\/)\.\.\/(\.\.\/)*(app|server)(\/|$)/.test(spec) || spec.includes('../../..')) {
          offenders.push(`${file} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('application nie importuje frameworka ani infrastructure/ui (zależności wstrzykiwane)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('application')) {
      for (const spec of importsOf(file)) {
        if (isFramework(spec)) offenders.push(`${file} → ${spec}`);
        for (const layer of ['infrastructure', 'ui']) {
          if (crossesTo(spec, layer)) offenders.push(`${file} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('infrastructure nie importuje ui', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('infrastructure')) {
      for (const spec of importsOf(file)) {
        if (crossesTo(spec, 'ui')) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tylko adapter SQLite dotyka expo-sqlite', () => {
    const users = sourceFiles('.')
      .filter((f) => importsOf(f).some((s) => s === 'expo-sqlite'))
      .sort();
    expect(users).toEqual(['infrastructure/storage/expoSqliteAdapter.ts']);
  });

  it('tylko adapter GPS dotyka expo-location', () => {
    // Lista jest CELOWO jednoelementowa także po dodaniu usługi w tle: moduł taska
    // opisuje odczyt strukturalnym `RawLocation` i nie potrzebuje expo-location.
    const users = sourceFiles('.')
      .filter((f) => importsOf(f).some((s) => s === 'expo-location'))
      .sort();
    expect(users).toEqual(['infrastructure/gps/expoLocationAdapter.ts']);
  });

  it('tylko moduł taska dotyka expo-task-manager', () => {
    const users = sourceFiles('.')
      .filter((f) => importsOf(f).some((s) => s === 'expo-task-manager'))
      .sort();
    expect(users).toEqual(['infrastructure/gps/backgroundLocationTask.ts']);
  });

  it('index.ts rejestruje task lokalizacji (start headless nie montuje Reacta)', () => {
    // Jedyna widoczna w Node gwarancja ścieżki headless: bez tego importu task
    // nigdy nie zostanie zdefiniowany w bundle'u i Android ubije usługę po restarcie.
    const entry = readFileSync(join(SRC, '..', 'index.ts'), 'utf8');
    expect(entry).toContain('./src/infrastructure/gps/backgroundLocationTask');
  });

  it('tylko adapter czujników dotyka expo-sensors', () => {
    const users = sourceFiles('.')
      .filter((f) => importsOf(f).some((s) => s === 'expo-sensors'))
      .sort();
    expect(users).toEqual(['infrastructure/sensors/expoSensorsAdapter.ts']);
  });

  it('barrel infrastruktury nie wciąga modułów natywnych (testy w Node)', () => {
    const barrel = importsOf('infrastructure/index.ts');
    expect(barrel).not.toContain('./storage/expoSqliteAdapter');
    expect(barrel).not.toContain('./gps/expoLocationAdapter');
    expect(barrel).not.toContain('./sensors/expoSensorsAdapter');
    // Moduły usługi GPS w tle: task (expo-task-manager), writer headless (wciąga
    // adapter SQLite) i prośba o uprawnienie powiadomień (react-native).
    expect(barrel).not.toContain('./gps/backgroundLocationTask');
    expect(barrel).not.toContain('./gps/headlessTraceWriter');
    expect(barrel).not.toContain('./permissions/notificationPermission');
  });

  it('plik .tsx eksportuje WYŁĄCZNIE komponenty (granica Fast Refresh)', () => {
    // Reguła narzędziowa i — przy kontekstach — reguła POPRAWNOŚCI. Fast Refresh
    // podmienia moduł w miejscu tylko wtedy, gdy wszystkie jego eksporty są
    // komponentami; jeden eksport obok (hook, stała, funkcja pomocnicza) odbiera
    // modułowi status granicy odświeżania.
    //
    // Przy zwykłym komponencie kosztem jest utrata stanu ekranu. Przy pliku, który
    // woła `createContext`, kosztem jest BŁĄD: kontekst re-ewaluuje się razem
    // z komponentami, zamontowany provider podaje stary obiekt, odświeżony ekran
    // szuka nowego — i `useContext` zwraca `undefined`. Na ekranie stojącym wewnątrz
    // providera pojawia się „useTheme() musi być użyty wewnątrz <ThemeProvider>",
    // albo — ciszej i gorzej — `useGps()` zwraca `null` przy działającym odbiorniku.
    //
    // Stąd `ui/theme/themeContext.ts` i `ui/bootstrap/servicesContext.ts` osobno
    // od swoich providerów. Lustro reguły panelu: `admin/test/architecture.test.ts`
    // i `docs/architektura-panelu-frontend.md` §2.3.
    const EXCEPTIONS = new Set([
      // Hook zwracający GOTOWY element (`correctionSheet`), więc plik musi być `.tsx`,
      // choć komponentu nie eksportuje. Kontekstu nie tworzy, więc jedynym skutkiem
      // jest propagacja odświeżenia do trzech ekranów, które go wołają — bez utraty
      // tożsamości czegokolwiek. Świadomie zostawione.
      'ui/hooks/useEventCorrection.tsx',
    ]);

    const exportsOf = (file: string): { kind: string; name: string }[] =>
      [
        ...readFileSync(join(SRC, file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .matchAll(/^export\s+(?:async\s+)?(function|const|class|let)\s+(\w+)/gm),
      ].map((m) => ({ kind: m[1]!, name: m[2]! }));

    const tsx = sourceFiles('ui').filter((f) => f.endsWith('.tsx'));

    // Kontrola samego skanera: gdyby regex przestał łapać, lista naruszeń byłaby
    // pusta przy dowolnie połamanym drzewie komponentów.
    expect(tsx.length).toBeGreaterThan(50);
    expect(exportsOf('ui/theme/ThemeProvider.tsx')).toEqual([
      { kind: 'function', name: 'ThemeProvider' },
    ]);

    const offenders: string[] = [];
    for (const file of tsx.filter((f) => !EXCEPTIONS.has(f))) {
      for (const { kind, name } of exportsOf(file)) {
        // Komponent w tej aplikacji to ZAWSZE `export function` z wielkiej litery.
        if (kind !== 'function' || !/^[A-Z]/.test(name)) offenders.push(`${file} → ${kind} ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Decyzje nawigacyjne, które już raz wróciły tylnymi drzwiami.
 *
 * Skanujemy ŹRÓDŁO, bo nie ma tu czego wywołać: `navigation.reset` to jedno słowo
 * w jednym callbacku i żaden test jednostkowy modelu widoku go nie zobaczy. Ten sam
 * chwyt, którym panel pilnuje kształtu banera korekt, żeby bramka `day_open` nie
 * wróciła (`admin/test/correctionWarnings.test.ts`).
 */
describe('nawigacja — decyzje zapisane w mockupach', () => {
  it('ekran 11 NIE kasuje stosu — synchronizacja jest statusem, nie końcem drogi', () => {
    // `design/11-eksport.html`: „NIE czyści już stosu: ten ekran przestał być końcem
    // drogi. Synchronizacja jest statusem, który można sprawdzić w środku dnia."
    // Pilot, który zajrzał w status między wzlotami, musi mieć drogę powrotną do kokpitu.
    const source = readFileSync(join(SRC, 'ui/screens/SyncScreen.tsx'), 'utf8');
    expect(source).not.toMatch(/navigation\.reset\s*\(/);
  });
});
