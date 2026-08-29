/**
 * UZ Aero - panel: kafle nad dziennikiem audytu.
 *
 * Kafel podaje liczbę, więc pytanie brzmi zawsze: SKĄD ona jest. Tutaj - z osobnego
 * zapytania do serwera z podmienionym jednym wymiarem filtra. Ten plik przybija dwie
 * rzeczy: że podmieniamy dokładnie ten wymiar, o który kafel pyta (reszta zawężenia
 * zostaje), i że brak odpowiedzi pokazuje się jako „-", nigdy jako zero.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_AUDIT_FILTER } from './auditFilters';
import { auditPages } from './auditPages';
import { auditTiles, tileQueries, utcDay } from './auditTiles';

/** 31 lipca 2026, 14:19 UTC - ta sama chwila, co w mockupie `A09`. */
const NOW = Date.UTC(2026, 6, 31, 14, 19, 2);

describe('kafle dziennika audytu', () => {
  it('dzień UTC bierze się z zegara UTC, nie z lokalnego', () => {
    // Kafel „wpisy dziś" mówi o dobie UTC, bo taki jest czas w całym systemie.
    // `toLocaleDateString` dałoby tu inną datę po 22:00 w Warszawie latem.
    expect(utcDay(NOW)).toBe('2026-07-31');
    expect(utcDay(Date.UTC(2026, 6, 31, 23, 59, 59))).toBe('2026-07-31');
  });

  it('kafel „dziś" zawęża zakres do doby i ZOSTAWIA resztę filtra', () => {
    // Kafle nad tabelą muszą mówić o tym samym wycinku, co lista pod nią - inaczej
    // „7 wpisów dziś" obok listy jednego konta byłoby zdaniem o czymś innym.
    const { today } = tileQueries(
      { ...DEFAULT_AUDIT_FILTER, actor: 'TMK', from: '2026-01-01', to: '2026-12-31' },
      NOW,
    );

    expect(today).toMatchObject({ actor: 'TMK', from: '2026-07-31', to: '2026-07-31', limit: 1 });
  });

  it('kafel korekt podmienia zakres I akcję - i mówi o tym w przypisie', () => {
    const { corrections } = tileQueries(
      { ...DEFAULT_AUDIT_FILTER, scope: { kind: 'group', id: 'konta' }, actor: 'TMK' },
      NOW,
    );

    expect(corrections.action).toEqual(['event.correct']);
    expect(corrections.from).toBe('2026-07-01');
    expect(corrections.to).toBeUndefined();
    // Konto zostaje: pytanie brzmi „ile korekt zrobiło TO konto", a nie „ile ich było".
    expect(corrections.actor).toBe('TMK');

    const note = auditTiles(0, 0, 0, false)[2]!.note;
    expect(note).toContain('niezależnie od chipa akcji');
  });

  it('`limit: 1` - kafel pyta o `total`, nie o wiersze', () => {
    const queries = tileQueries(DEFAULT_AUDIT_FILTER, NOW);
    expect(queries.today.limit).toBe(1);
    expect(queries.corrections.limit).toBe(1);
  });

  it('BRAK odpowiedzi to „-", nie zero - zero jest twierdzeniem o świecie', () => {
    const tiles = auditTiles(undefined, undefined, undefined, false);

    expect(tiles.map((t) => t.value)).toEqual(['-', '-', '-', '∞']);
    // Ton „coś się dzieje" też nie zapala się na braku danych.
    expect(tiles[1]!.tone).toBeUndefined();
    expect(tiles[2]!.tone).toBeUndefined();
  });

  it('reguła „-" obowiązuje TAM, GDZIE KAFEL JEST WOŁANY - także przy błędzie pobrania', () => {
    // Ta reguła była już przybita w `auditTiles`, a mimo to ekran łamał ją JEDNO
    // wywołanie wyżej: warunkiem było `isPending`, czyli faza ładowania, a nie
    // obecność danych. Przy nieudanym pobraniu `isPending` jest `false`, więc do kafla
    // trafiała liczba wyliczona z BRAKU odpowiedzi - i tuż obok banera „nie udało się
    // pobrać dziennika" ekran twierdził, że w całej historii systemu nie było ani
    // jednej akcji administratora.
    //
    // Dlatego test składa oba moduły dokładnie tak, jak robi to `AuditScreen`:
    // `auditPages(entries.data)` → `auditTiles(pages.total, …)`. Osobno każdy z nich
    // przechodził.
    const noResponse = auditPages(undefined);

    expect(noResponse.total).toBeNull();
    expect(auditTiles(noResponse.total, undefined, undefined, false)[0]!.value).toBe('-');

    // Pusty dziennik NADAL pokazuje zero - to jest odpowiedź serwera, a nie jej brak.
    const empty = auditPages([{ items: [], nextCursor: null, total: 0 }]);
    expect(auditTiles(empty.total, undefined, undefined, false)[0]!.value).toBe(0);
  });

  it('zero jest zerem, a liczba dodatnia zapala ton', () => {
    const tiles = auditTiles(120, 0, 3, true);

    expect(tiles[0]!.value).toBe(120);
    expect(tiles[1]!.value).toBe(0);
    expect(tiles[1]!.tone).toBeUndefined();
    expect(tiles[2]!.tone).toBe('amber');
  });

  it('przypis pierwszego kafla mówi, czy liczba dotyczy filtra, czy całości', () => {
    expect(auditTiles(1, 1, 1, true)[0]!.note).toContain('filtr z adresu');
    expect(auditTiles(1, 1, 1, false)[0]!.note).toContain('Wszystkie akcje panelu');
  });

  it('kafla „nieudane logowania" NIE MA - i to jest sprawdzane, nie przypadek', () => {
    // Mockup go pokazuje, ale takich wpisów nie da się policzyć: wiersz `admin_audit`
    // powstaje wyłącznie razem ze SKUTKIEM, a nieudane logowanie skutku nie ma i nie
    // ma nawet aktora. Kafel z liczbą 0 byłby tu kłamstwem, nie brakiem danych.
    const labels = auditTiles(1, 1, 1, false).map((t) => t.label.toLowerCase());
    expect(labels.some((label) => label.includes('logowan'))).toBe(false);
  });
});
