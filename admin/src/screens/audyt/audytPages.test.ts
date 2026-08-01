/**
 * UZ Aero — panel: sklejenie stron kursorowych dziennika i stany brzegowe.
 *
 * Bliźniak `dniPages.test.ts`. Różnica, która na tym ekranie ma znaczenie: dziennik
 * nie ma górnej granicy wielkości i rośnie w trakcie przeglądania, więc podpis
 * „pokazano N z M" jest jedynym sygnałem, że lista NIE jest kompletem.
 */

import { describe, expect, it } from 'vitest';

import type { AuditEntryDto, AuditPageDto } from '../../api/dto';
import { audytEmpty, auditPages, pagesSummary } from './audytPages';

const entry = (id: number): AuditEntryDto => ({
  id,
  createdAt: '2026-06-22T14:19:02.000Z',
  actorPilotId: 'TMK',
  actorCode: 'TMK',
  actorName: 'Tomasz Małkiewicz',
  actorRole: 'admin',
  action: 'flag.resolve',
  targetType: 'flag',
  targetId: String(1000 + id),
  details: {},
  ip: '10.20.4.11',
});

const page = (
  ids: number[],
  nextCursor: string | null,
  total: number | null,
): AuditPageDto => ({
  items: ids.map(entry),
  nextCursor,
  total,
});

describe('strony dziennika audytu', () => {
  it('BRAK odpowiedzi to `total: null`, nie zero — i żadnej obietnicy ciągu dalszego', () => {
    // Zero jest twierdzeniem o świecie („nikt jeszcze niczego nie zmienił"), a brak
    // odpowiedzi nim nie jest. Ta różnica ma znaczenie dokładnie wtedy, gdy pobranie
    // się nie udało: ekran pokazuje wtedy baner o błędzie i nie może obok postawić
    // liczby, której nie zna.
    expect(auditPages(undefined)).toEqual({ items: [], shown: 0, total: null, hasMore: false });
    expect(auditPages([])).toEqual({ items: [], shown: 0, total: null, hasMore: false });
  });

  it('strony się DOKŁADAJĄ, a granica strony nie ma szwu', () => {
    // Predykat kursora jest ostry (`<`, nie `<=`), więc pierwszy wiersz następnej
    // strony jest kolejnym, a nie powtórzonym. Konkatenacja jest tu poprawna bez
    // odsiewania duplikatów — dokładanie `Set` „na wszelki wypadek" maskowałoby
    // zepsuty predykat po stronie serwera.
    const state = auditPages([page([9, 8], 'c1', 6), page([7, 6], 'c2', null), page([5, 4], null, null)]);

    expect(state.items.map((i) => i.id)).toEqual([9, 8, 7, 6, 5, 4]);
    expect(state.shown).toBe(6);
    expect(state.hasMore).toBe(false);
  });

  it('„czy jest więcej" pyta OSTATNIĄ stronę, nie pierwszą', () => {
    // `nextCursor` pierwszej strony jest już zużyty. Czytanie go dałoby przycisk
    // „pokaż kolejne", który po dojściu do końca nigdy nie gaśnie.
    expect(auditPages([page([9], 'c1', 2), page([8], null, null)]).hasMore).toBe(false);
    expect(auditPages([page([9], 'c1', 9), page([8], 'c2', null)]).hasMore).toBe(true);
  });

  it('`total` bierzemy z PIERWSZEJ strony — kolejne go NIE NIOSĄ', () => {
    // Serwer liczy `COUNT(*)` wyłącznie dla żądania bez kursora: liczba wpisów
    // w zawężeniu jest własnością ZAPYTANIA, nie strony, a pełny licznik na dzienniku
    // bez górnej granicy jest wielokrotnie droższy od samej strony. Czytanie licznika
    // z ostatniej strony kazałoby podpisowi „pokazano N z M" zgasnąć do „—" dokładnie
    // w chwili, w której człowiek klika „pokaż kolejne wpisy".
    const state = auditPages([page([9], 'c1', 12), page([8], 'c2', null)]);
    expect(state.total).toBe(12);
    expect(pagesSummary(state)).toBe('Pokazano 2 z 12.');
  });

  it('podpis mówi wprost, czy widać komplet', () => {
    expect(pagesSummary(auditPages([page([9], 'c1', 40)]))).toBe('Pokazano 1 z 40.');
    expect(pagesSummary(auditPages([page([9, 8], null, 2)]))).toBe('Pokazano wszystkie 2.');
    expect(pagesSummary(auditPages([page([], null, 0)]))).toBe('Brak wpisów w tym zawężeniu.');
  });

  it('podpis BEZ odpowiedzi nie twierdzi, że dziennik jest pusty', () => {
    // „Brak wpisów w tym zawężeniu" byłoby odpowiedzią na pytanie, na które nie mamy
    // danych — a stoi pod tym baner „nie udało się pobrać dziennika".
    expect(pagesSummary(auditPages(undefined))).toBe(
      'Liczba wpisów nieznana — serwer nie odpowiedział.',
    );
  });

  it('pusty dziennik mówi CO INNEGO niż pusty wynik filtra', () => {
    // „Nic w tym filtrze" jest wiadomością o zapytaniu; „nikt jeszcze niczego nie
    // zmienił" — o stanie systemu, i jest to stan całkowicie normalny.
    const narrowed = audytEmpty(true);
    const virgin = audytEmpty(false);

    expect(narrowed.title).not.toBe(virgin.title);
    expect(narrowed.note).toContain('zawężony');
    // Pusty dziennik NIE MOŻE sugerować awarii logowania — logowań tu z założenia nie ma.
    expect(virgin.note).toContain('logowanie nie działa');
    expect(virgin.note).toContain('rejestrze zdarzeń');
  });
});
