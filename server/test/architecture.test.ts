/**
 * UZ Aero (serwer) — GRANICE, KTÓRYCH NIE PILNUJE KOMPILATOR.
 *
 * Lustro `app/src/__tests__/architecture.test.ts` i ta sama zasada: reguła architektury
 * jest warta tyle, ile jej egzekucja. Trzy własności niżej są w kodzie niewidoczne —
 * nic nie broni następnej osobie dopisać `UPDATE admin_audit`, wstrzyknąć `Database`
 * do komendy panelu albo zarejestrować trasę panelu z pominięciem bramy uprawnień.
 * Dokument może się zdezaktualizować; ten plik nie.
 *
 * Zakres rośnie razem z panelem: od przekroju 2 (`contracts/` — kontrakty odczytu)
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
 * Treść pliku BEZ komentarzy. Skaner szuka SQL-a, a nie prozy o SQL-u: docblock
 * migracji tłumaczy, dlaczego `UPDATE admin_audit` jest zakazane, i bez tego kroku
 * sam wywoływałby naruszenie, którego opisuje zakaz.
 */
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

/** Nazwy importowane w pliku — `import { A, type B as C } from '…'`. */
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

describe('granice, których nie pilnuje kompilator', () => {
  // Bez tego zielony wynik pozostałych przypadków nic nie znaczy: pusta lista plików
  // albo zepsuty regex dałyby „brak naruszeń" przy dowolnie połamanej architekturze.
  it('skaner faktycznie widzi pliki i treści (kontrola samego testu)', () => {
    expect(filesUnder('.').length).toBeGreaterThan(20);
    expect(filesUnder('application/admin/commands')).toContain(
      'application/admin/commands/flags.ts',
    );

    // Adapter flag panelu ROBI `UPDATE flags` — jeśli skaner tego nie widzi, nie
    // zobaczy też `UPDATE admin_audit`.
    expect(writesTo('flags').test(codeOf('infrastructure/pg/admin/flagsRepo.ts'))).toBe(true);
    expect(writesTo('admin_audit').test('DELETE FROM admin_audit WHERE id = 1')).toBe(true);

    // Zdejmowanie komentarzy nie zjada kodu i zjada prozę — obie strony naraz.
    expect(codeOf('infrastructure/pg/schema.ts')).toContain('CREATE TABLE IF NOT EXISTS admin_audit');
    expect(codeOf('infrastructure/pg/schema.ts')).not.toContain('UPDATE admin_audit');

    // Wyciąganie nazw z importów działa na pliku, który `Database` faktycznie bierze.
    expect(importedNames(read('application/mobile/commands/ingest.ts'))).toContain('Database');

    // Katalog kontraktów istnieje i skaner widzi jego import domeny — bez tego
    // przypadek „kontrakty importują wyłącznie domenę" przechodziłby na pustej liście.
    expect(filesUnder('application/admin/contracts').length).toBeGreaterThan(2);
    expect(importedFrom(read('application/admin/contracts/sessions.ts'))).toContain(
      '@uzaero/domain',
    );

    // Skaner nagłówka `Authorization` faktycznie coś widzi — w JEDYNYM pliku, który
    // ma prawo go czytać. Bez tego „zero naruszeń" mogłoby znaczyć „zły regex".
    expect(codeOf('http/tokenFromRequest.ts')).toContain('headers.authorization');
    expect(filesUnder('http/routes/admin')).toContain('http/routes/admin/auth.ts');
  });

  it('rejestr `events` jest append-only — nigdzie w src/ nie ma UPDATE ani DELETE', () => {
    const offenders = filesUnder('.').filter((f) => writesTo('events').test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('dziennik `admin_audit` jest append-only — nigdzie w src/ nie ma UPDATE ani DELETE', () => {
    // Docelowo pilnuje tego GRANT bez UPDATE/DELETE dla roli aplikacyjnej; do czasu
    // rozdzielenia connection stringów to jest jedyna wykonywalna gwarancja.
    const offenders = filesUnder('.').filter((f) => writesTo('admin_audit').test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('komendy panelu nie mają uchwytu do bazy — zapis wyłącznie przez AuditedWrite', () => {
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

  it("tryb administracyjny reguł ma JEDNO miejsce — literał `'administrative'`", () => {
    // `checkAppend(…, 'administrative')` uchyla regułę `CORRECTION_WINDOW_EXPIRED`.
    // To jedyna furtka w całej domenie, więc musi mieć jednego użytkownika i nazwisko:
    // rozlanie literału po komendach byłoby początkiem konstrukcji, w której nikt nie
    // wie, ile reguł omija panel. Zmiana tej listy to decyzja produktowa, nie refaktor.
    //
    // Użytkownikiem jest HELPER, a nie komenda: korektę ocenia się w dwóch miejscach —
    // przy zapisie (`commands/corrections.ts`) i przy podglądzie „przed → po"
    // (`queries/corrections.ts`) — a ocena musi być jedna. Obie strony idą przez
    // `correctionCandidate.ts`, więc lista dalej ma dokładnie jedną pozycję. Dopisanie
    // do niej drugiego pliku byłoby ROZLUŹNIENIEM tej reguły, nie jej utrzymaniem.
    //
    // Skanujemy `server/src`, bo tam literał jest UŻYCIEM. W `packages/domain` stoi
    // jego DEKLARACJA (`rules/authority.ts` — definicja słownika uprawnień) i ona
    // z natury musi go zawierać.
    const users = filesUnder('.')
      .filter((f) => codeOf(f).includes("'administrative'"))
      .sort();
    expect(users).toEqual(['application/admin/correctionCandidate.ts']);
  });

  it('kontrakty panelu importują wyłącznie domenę i siebie nawzajem', () => {
    // `contracts/` to POWIERZCHNIA dla klienta panelu (docelowo `@uzaero/server/admin-contracts`).
    // Import czegokolwiek spoza domeny wciągnąłby tam wnętrze serwera — w skrajnym
    // przypadku `pg` do przeglądarki — a przy okazji przywiązałby panel do kształtu
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
    // to trasa bez bramy uprawnień — i nikt by tego nie zauważył przy przeglądzie.
    //
    // Wyjątki są WYMIENIONE IMIENNIE, a nie opisane wzorcem ścieżki: dopisanie pliku
    // do tej listy ma być świadomą decyzją widoczną w diffie, a nie skutkiem nazwania
    // pliku „jakoś tak".
    const publicByDesign = [
      // `adminRoute.ts` — sama brama; `auth.ts` — logowanie i wylogowanie, które
      // z definicji nie mogą wymagać ważnej sesji (§8.6). Bramą `auth.ts` jest
      // nagłówek CSRF z `http/adminCsrf.ts`, a nie zdolność.
      'http/routes/admin/adminRoute.ts',
      'http/routes/admin/auth.ts',
    ];
    const offenders = filesUnder('http/routes/admin')
      .filter((f) => !publicByDesign.includes(f))
      .filter((f) => /\bapp\.(get|post|put|patch|delete|route)\s*\(/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('trasy panelu NIE czytają nagłówka `Authorization` na własną rękę', () => {
    // Sesja przeglądarkowa dołożyła drugi kanał tego samego poświadczenia (ciasteczko).
    // Jedno miejsce wie, skąd bierze się token (`http/tokenFromRequest.ts`) — trasa,
    // która sięgnie po nagłówek sama, wyłączy panel z autoryzacji, nie zauważywszy tego:
    // przeglądarka nagłówka nie wysyła, więc taki endpoint po prostu zawsze da 401.
    const offenders = filesUnder('http')
      .filter((f) => f !== 'http/tokenFromRequest.ts')
      .filter((f) => /headers\.authorization/.test(codeOf(f)));
    expect(offenders).toEqual([]);
  });
});
