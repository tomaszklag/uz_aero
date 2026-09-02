/**
 * UZ Aero (serwer) - GRANICE, KTÓRYCH NIE PILNUJE KOMPILATOR.
 *
 * Lustro `app/src/__tests__/architecture.test.ts` i ta sama zasada: reguła architektury
 * jest warta tyle, ile jej egzekucja. Trzy własności niżej są w kodzie niewidoczne -
 * nic nie broni następnej osobie dopisać `UPDATE admin_audit`, wstrzyknąć `Database`
 * do komendy panelu albo zarejestrować trasę panelu z pominięciem bramy uprawnień.
 * Dokument może się zdezaktualizować; ten plik nie.
 *
 * Zakres rośnie razem z panelem: od przekroju 2 (`contracts/` - kontrakty odczytu)
 * doszła granica importów katalogu kontraktów.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Wszystkie pliki .ts w katalogu (rekurencyjnie), ścieżki względem `src/`. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) out.push(relative(SRC, full).split(sep).join('/'));
    }
  };
  walk(join(SRC, dir));
  return out;
}

const read = (file: string): string => readFileSync(join(SRC, file), 'utf8');

/**
 * Treść pliku BEZ komentarzy. Skaner szuka SQL-a, a nie prozy o SQL-u: opis schematu
 * tłumaczy, dlaczego `UPDATE admin_audit` jest zakazane, i bez tego kroku sam wywoływałby
 * naruszenie, którego opisuje zakaz.
 *
 * **Trzecia forma - komentarz SQL `-- …` - doszła 2026-08-08 razem ze zgnieceniem
 * migracji.** Uzasadnienia przeniosły się wtedy z docbloków TypeScriptu do komentarzy
 * przy kolumnach, czyli DO WNĘTRZA szablonu z DDL-em, gdzie oba wzorce wyżej nie sięgają.
 * Wzorzec wymaga spacji po myślnikach (`-- `), żeby nie zjeść operatora dekrementacji:
 * `i--` i `--i` nigdy jej nie mają, a komentarz SQL bez spacji się nie zdarza.
 */
const codeOf = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/(^|\s)--\s.*$/gm, '$1');

/** Ścieżki modułów, z których plik importuje (`from '…'`). */
function importedFrom(code: string): string[] {
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) out.push(match[1]!);
  return out;
}

/** Nazwy importowane w pliku - `import { A, type B as C } from '…'`. */
function importedNames(code: string): string[] {
  const out: string[] = [];
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    for (const part of match[1]!.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim();
      if (name) out.push(name);
    }
  }
  return out;
}

/** Zapis do tabeli, która ma być append-only. */
const writesTo = (table: string): RegExp =>
  new RegExp(String.raw`\bUPDATE\s+${table}\b|\bDELETE\s+FROM\s+${table}\b`, 'i');

/**
 * UPSERT do tabeli - `INSERT INTO <tabela> … ON CONFLICT … DO UPDATE`.
 *
 * Osobno od `writesTo`, bo `writesTo` go NIE WIDZI i to nie jest przeoczenie regexa:
 * w `ON CONFLICT DO UPDATE SET` po słowie `UPDATE` nie stoi nazwa tabeli, więc wzorzec
 * `UPDATE <tabela>` nie ma czego dopasować. Dla dziennika eksportu to jest dokładnie ta
 * furtka, którą trzeba zamknąć: `INSERT … ON CONFLICT (session_uuid, revision) DO UPDATE`
 * przeszedłby przez `writesTo` bez śladu, a skasowałby historię wysyłki tak samo
 * skutecznie jak `UPDATE`.
 */
const upsertsInto = (table: string): RegExp =>
  new RegExp(String.raw`INSERT\s+INTO\s+${table}\b[\s\S]*?ON\s+CONFLICT`, 'i');

describe('granice, których nie pilnuje kompilator', () => {
  // Bez tego zielony wynik pozostałych przypadków nic nie znaczy: pusta lista plików
  // albo zepsuty regex dałyby „brak naruszeń" przy dowolnie połamanej architekturze.
  it('skaner faktycznie widzi pliki i treści (kontrola samego testu)', () => {
    expect(filesUnder('.').length).toBeGreaterThan(20);
    expect(filesUnder('application/admin/commands')).toContain(
      'application/admin/commands/flags.ts',
    );

    // Adapter flag panelu ROBI `UPDATE flags` - jeśli skaner tego nie widzi, nie
    // zobaczy też `UPDATE admin_audit`.
    expect(writesTo('flags').test(codeOf('infrastructure/pg/admin/flagsRepo.ts'))).toBe(true);
    expect(writesTo('admin_audit').test('DELETE FROM admin_audit WHERE id = 1')).toBe(true);

    // Skaner UPSERT-ów widzi PRAWDZIWY upsert w repo… (kontrola przypadku niżej)
    expect(upsertsInto('exported_sheets').test(codeOf('infrastructure/pg/common/sheetsRepo.ts'))).toBe(
      true,
    );
    // …a czysty `INSERT` bez `ON CONFLICT` nim NIE jest - inaczej reguła zabraniałaby
    // dopisywania do dziennika, czyli jedynej operacji, która ma tam być dozwolona.
    expect(upsertsInto('export_log').test('INSERT INTO export_log (a) VALUES ($1)')).toBe(false);
    expect(
      upsertsInto('export_log').test('INSERT INTO export_log (a) VALUES ($1) ON CONFLICT DO NOTHING'),
    ).toBe(true);
    // I nie myli tabel: upsert do jednej nie jest upsertem do drugiej.
    expect(upsertsInto('export_log').test(codeOf('infrastructure/pg/common/sheetsRepo.ts'))).toBe(
      false,
    );

    // Zdejmowanie komentarzy nie zjada kodu i zjada prozę - obie strony naraz.
    expect(codeOf('infrastructure/pg/schema.ts')).toContain('CREATE TABLE IF NOT EXISTS admin_audit');
    expect(codeOf('infrastructure/pg/schema.ts')).not.toContain('UPDATE admin_audit');

    // Wyciąganie nazw z importów działa na pliku, który `Database` faktycznie bierze.
    expect(importedNames(read('application/mobile/commands/ingest.ts'))).toContain('Database');

    // Katalog kontraktów istnieje i skaner widzi jego import domeny - bez tego
    // przypadek „kontrakty importują wyłącznie domenę" przechodziłby na pustej liście.
    expect(filesUnder('application/admin/contracts').length).toBeGreaterThan(2);
    expect(importedFrom(read('application/admin/contracts/sessions.ts'))).toContain(
      '@uzaero/domain',
    );

    // Skaner nagłówka `Authorization` faktycznie coś widzi - w JEDYNYM pliku, który
    // ma prawo go czytać. Bez tego „zero naruszeń" mogłoby znaczyć „zły regex".
    expect(codeOf('http/tokenFromRequest.ts')).toContain('headers.authorization');
    expect(filesUnder('http/routes/admin')).toContain('http/routes/admin/auth.ts');
  });

  it('rejestr `events` jest append-only - nigdzie w src/ nie ma UPDATE ani DELETE', () => {
    const offenders = filesUnder('.').filter((f) => writesTo('events').test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('dziennik `admin_audit` jest append-only - nigdzie w src/ nie ma UPDATE ani DELETE', () => {
    // Docelowo pilnuje tego GRANT bez UPDATE/DELETE dla roli aplikacyjnej; do czasu
    // rozdzielenia connection stringów to jest jedyna wykonywalna gwarancja.
    const offenders = filesUnder('.').filter((f) => writesTo('admin_audit').test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('dziennik `export_log` jest append-only - bez UPDATE, DELETE i bez UPSERT-u', () => {
    // Ta własność NIE jest ozdobą schematu - stoi pod całą treścią przekroju A05.
    // Opiera się na niej komentarz przy `export_log` w `schema.ts` („po nim, i tylko po nim, da się
    // odpowiedzieć, co widział skarbnik klubu"), baner ekranu („dwie tabele, dwa różne
    // zadania") i podsumowanie historii rewizji („3 wiersze dziennika, 1 wiersz karty").
    // Do 2026-08-01 inwariant był ZACHOWANY, ale niepilnowany: nic nie broniło następnej
    // osobie „naprawić" wyścigu rewizji przez `ON CONFLICT DO UPDATE`, a wtedy wszystkie
    // trzy zdania wyżej stałyby się nieprawdą po cichu.
    const offenders = filesUnder('.').filter(
      (f) => writesTo('export_log').test(codeOf(f)) || upsertsInto('export_log').test(codeOf(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('karta `exported_sheets` jest UPSERT-owana i to jest ZAMIERZONE', () => {
    // Odwrotna reguła do tej wyżej i dlatego stoi osobno, a nie jako wyjątek na liście.
    // `exported_sheets` ma semantykę ZAKŁADKI W ARKUSZU: jedna nazwa = jedna karta,
    // a rewizja nadpisuje treść, bo czytelnik linku z ekranu 11 ma widzieć aktualny stan
    // dnia. Historię pamięta append-only `export_log` - i to rozdzielenie jest jedynym
    // śladem rozjazdu arkusz↔rejestr.
    //
    // Asercja jest POZYTYWNA, żeby nikt nie „ujednolicił" dwóch tabel przez zdjęcie
    // `ON CONFLICT` z tej strony: karta bez upsertu zaczęłaby po drugim eksporcie
    // wywalać się na kluczu głównym.
    expect(upsertsInto('exported_sheets').test(codeOf('infrastructure/pg/common/sheetsRepo.ts'))).toBe(
      true,
    );
    // …ale UPDATE i DELETE nie mają tu wstępu tak samo: treść nadpisuje wyłącznie
    // ścieżka eksportu, przez `writeDaySheet`, a nie zapytanie z boku.
    const offenders = filesUnder('.').filter((f) => writesTo('exported_sheets').test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('komendy panelu nie mają uchwytu do bazy - zapis wyłącznie przez AuditedWrite', () => {
    // Druga połowa mechanizmu audytu: `Audited<T>` wymusza ślad w typie, a BRAK
    // `Database`/`Queryable` odbiera możliwość ominięcia tej bramy w ogóle.
    const offenders: string[] = [];
    for (const file of filesUnder('application/admin/commands')) {
      for (const name of importedNames(read(file))) {
        if (name === 'Database' || name === 'Queryable') offenders.push(`${file} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("tryb administracyjny reguł ma JEDNO miejsce - literał `'administrative'`", () => {
    // `checkAppend(…, 'administrative')` uchyla regułę `CORRECTION_WINDOW_EXPIRED`.
    // To jedyna furtka w całej domenie, więc musi mieć jednego użytkownika i nazwisko:
    // rozlanie literału po komendach byłoby początkiem konstrukcji, w której nikt nie
    // wie, ile reguł omija panel. Zmiana tej listy to decyzja produktowa, nie refaktor.
    //
    // Użytkownikiem jest HELPER, a nie komenda: korektę ocenia się w dwóch miejscach -
    // przy zapisie (`commands/corrections.ts`) i przy podglądzie „przed → po"
    // (`queries/corrections.ts`) - a ocena musi być jedna. Obie strony idą przez
    // `correctionCandidate.ts`, więc lista dalej ma dokładnie jedną pozycję. Dopisanie
    // do niej drugiego pliku byłoby ROZLUŹNIENIEM tej reguły, nie jej utrzymaniem.
    //
    // Skanujemy `server/src`, bo tam literał jest UŻYCIEM. W `packages/domain` stoi
    // jego DEKLARACJA (`rules/authority.ts` - definicja słownika uprawnień) i ona
    // z natury musi go zawierać.
    const users = filesUnder('.')
      .filter((f) => codeOf(f).includes("'administrative'"))
      .sort();
    expect(users).toEqual(['application/admin/correctionCandidate.ts']);
  });

  it('`sessionStreams` wołają WYŁĄCZNIE analityka zużycia i szlak przekazania', () => {
    // Odczyt strumieni WIELU sesji naraz jest jedynym miejscem, w którym serwer sięga do
    // rejestru poza kartą dnia i śladem lotu (§7.5, §7.7). Metoda jest wygodna i właśnie
    // dlatego groźna: użyta w liście zamieniłaby stronę wyników w pełny przegląd
    // rejestru, a nikt by tego nie zauważył, bo wynik byłby poprawny.
    //
    // Licznik w `contract.test.ts` pilnuje ZACHOWANIA (ile razy trasa czyta), ta reguła
    // pilnuje DOSTĘPU (kto w ogóle może zawołać). Deklaracja portu i jego adapter są
    // z listy wyłączone - tam metoda z natury musi wystąpić.
    //
    // Pierwsze dwie pozycje to ten sam rachunek policzony dla innego odbiorcy:
    // `queries/consumption.ts` liczy pełen raport dla panelu (`A10a`), a
    // `common/consumptionNorm.ts` - skróconą normę dla telefonów (`GET /reference`,
    // ekrany 04/06/10). Trzecia weszła ŚWIADOMIE 2026-09-02 (szlak przekazania,
    // uwaga z urządzenia): `queries/reference.ts` dociąga strumienie SESJI-ŹRÓDEŁ
    // przekazań, bo tankowania nie mieszczą się w projekcji (niesie ich sumę, nie
    // zdarzenia) - jedna sesja na maszynę, jednym zapytaniem dla całej floty, czyli
    // dokładnie wzorzec, dla którego ta metoda istnieje. To nadal nie jest lista
    // odtwarzająca projekcję: czyta FAKTY, których projekcja nie ma.
    // **Dopisanie kolejnej pozycji jest decyzją, nie refaktorem** - każdy nowy
    // wołający otwiera rejestr kolejnej ścieżce odczytu.
    const users = filesUnder('.')
      .filter((f) => codeOf(f).includes('sessionStreams'))
      .filter(
        (f) =>
          f !== 'application/common/ports.ts' &&
          f !== 'infrastructure/pg/common/eventsStore.ts',
      )
      .sort();
    expect(users).toEqual([
      'application/admin/queries/consumption.ts',
      'application/common/consumptionNorm.ts',
      'application/mobile/queries/reference.ts',
    ]);
  });

  it('kontrakty panelu importują wyłącznie domenę i siebie nawzajem', () => {
    // `contracts/` to POWIERZCHNIA dla klienta panelu (docelowo `@uzaero/server/admin-contracts`).
    // Import czegokolwiek spoza domeny wciągnąłby tam wnętrze serwera - w skrajnym
    // przypadku `pg` do przeglądarki - a przy okazji przywiązałby panel do kształtu
    // projekcji, czyli do rzeczy, która ma się swobodnie zmieniać.
    const offenders: string[] = [];
    for (const file of filesUnder('application/admin/contracts')) {
      for (const from of importedFrom(codeOf(file))) {
        const ownFamily = from.startsWith('./');
        if (from !== '@uzaero/domain' && !ownFamily) offenders.push(`${file} → ${from}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('trasy panelu rejestrują się wyłącznie przez `adminRoute`', () => {
    // Zdolność ma być ATRYBUTEM deklaracji trasy. `app.post(...)` w pliku tras panelu
    // to trasa bez bramy uprawnień - i nikt by tego nie zauważył przy przeglądzie.
    //
    // Wyjątki są WYMIENIONE IMIENNIE, a nie opisane wzorcem ścieżki: dopisanie pliku
    // do tej listy ma być świadomą decyzją widoczną w diffie, a nie skutkiem nazwania
    // pliku „jakoś tak".
    const publicByDesign = [
      // `adminRoute.ts` - sama brama; `auth.ts` - logowanie i wylogowanie, które
      // z definicji nie mogą wymagać ważnej sesji (§8.6). Bramą `auth.ts` jest
      // nagłówek CSRF z `http/adminCsrf.ts`, a nie zdolność.
      'http/routes/admin/adminRoute.ts',
      'http/routes/admin/auth.ts',
      // Statyczny build panelu (§9) - pliki i przekierowania na `/admin/` są publiczne
      // z definicji: stronę logowania trzeba pobrać BEZ sesji. Danych tu nie ma -
      // wszystko, co panel wie, przychodzi później z `/admin/api/*` przez bramę.
      'http/routes/admin/staticPanel.ts',
    ];
    const offenders = filesUnder('http/routes/admin')
      .filter((f) => !publicByDesign.includes(f))
      .filter((f) => /\bapp\.(get|post|put|patch|delete|route)\s*\(/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('trasy panelu NIE czytają nagłówka `Authorization` na własną rękę', () => {
    // Sesja przeglądarkowa dołożyła drugi kanał tego samego poświadczenia (ciasteczko).
    // Jedno miejsce wie, skąd bierze się token (`http/tokenFromRequest.ts`) - trasa,
    // która sięgnie po nagłówek sama, wyłączy panel z autoryzacji, nie zauważywszy tego:
    // przeglądarka nagłówka nie wysyła, więc taki endpoint po prostu zawsze da 401.
    const offenders = filesUnder('http')
      .filter((f) => f !== 'http/tokenFromRequest.ts')
      .filter((f) => /headers\.authorization/.test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('oś POWIERZCHNI: `common/` nie zna panelu ani telefonu, a powierzchnie nie znają siebie', () => {
    // Druga oś podziału `server/src` (`CLAUDE.md`, `docs/architektura-kodu.md`): wewnątrz
    // `application/`, `http/routes/` i `infrastructure/pg/` drugi poziom mówi, KOMU plik
    // służy. `common/` ma twarde znaczenie „OBIE powierzchnie" - i to jest jedyna reguła
    // osi, której złamanie jest ciche: kod dalej się kompiluje i testy przechodzą.
    //
    // Konsekwencja złamania jest konkretna. `common/` sięgające do `admin/` sprawia, że
    // moduł deklarowany jako wspólny zaczyna zależeć od panelu - a wtedy telefon wciąga
    // za sobą kod back-office'u przez zwykły import, którego nikt nie zauważy. W drugą
    // stronę: `mobile/` importujące z `admin/` znaczy, że granica przestała istnieć,
    // a katalogi zostały jako dekoracja.
    //
    // Dopisane 2026-08-01, gdy przekrój floty PRZENIÓSŁ `aircraftStateView.ts` z `mobile/`
    // do `common/` (panel i `GET /reference` liczą claim tym samym kodem). Przeniesienie
    // było słuszne, ale okazało się, że osi nie pilnowało nic - reguła istniała wyłącznie
    // w dokumencie, a dokument nie wywala budowania.
    const surfaceOf = (file: string): 'admin' | 'mobile' | 'common' | null => {
      const match = /^(?:application|http\/routes|infrastructure\/pg)\/(admin|mobile|common)\//.exec(
        file,
      );
      return (match?.[1] as 'admin' | 'mobile' | 'common' | undefined) ?? null;
    };

    /** Powierzchnia, do której PROWADZI import - po samym kształcie ścieżki względnej. */
    const targetSurface = (spec: string): 'admin' | 'mobile' | 'common' | null => {
      const match = /(?:^|\/)(admin|mobile|common)\//.exec(spec);
      return (match?.[1] as 'admin' | 'mobile' | 'common' | undefined) ?? null;
    };

    /** Kogo NIE WOLNO importować, będąc w danej powierzchni. */
    const forbidden: Record<'admin' | 'mobile' | 'common', readonly string[]> = {
      common: ['admin', 'mobile'],
      mobile: ['admin'],
      admin: ['mobile'],
    };

    const files = filesUnder('.');

    // Kontrola samego skanera: gdyby klasyfikacja przestała cokolwiek rozpoznawać,
    // lista naruszeń byłaby pusta przy dowolnie połamanej osi.
    expect(files.filter((f) => surfaceOf(f) === 'common').length).toBeGreaterThan(3);
    expect(files.filter((f) => surfaceOf(f) === 'admin').length).toBeGreaterThan(10);
    expect(files.filter((f) => surfaceOf(f) === 'mobile').length).toBeGreaterThan(3);
    expect(surfaceOf('application/common/aircraftStateView.ts')).toBe('common');
    expect(targetSurface('../../admin/ports.ts')).toBe('admin');
    expect(targetSurface('./ports.ts')).toBe(null);

    const offenders: string[] = [];
    for (const file of files) {
      const from = surfaceOf(file);
      if (from == null) continue;
      for (const spec of importedFrom(codeOf(file))) {
        const to = targetSurface(spec);
        if (to != null && forbidden[from].includes(to)) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
