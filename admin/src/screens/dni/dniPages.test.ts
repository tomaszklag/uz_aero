/**
 * UZ Aero — panel: sklejanie stron kursorowych (moduł czysty).
 *
 * To jest test PAGINACJI KEYSET widzianej od strony panelu — pierwszego konsumenta
 * `infrastructure/pg/keyset.ts` w tym repo. Zachowania, których pilnuje, nie widać
 * w typach i żadne z nich nie jest oczywiste:
 *
 *  • granica strony nie ma szwu (żadnego wiersza dwa razy, żadnego pominiętego),
 *  • „czy jest więcej" pyta OSTATNIĄ stronę, nie pierwszą,
 *  • `nextCursor === null` znaczy KONIEC, nie „spróbuj jeszcze raz",
 *  • podpis „pokazano N z M" nigdy nie udaje, że lista jest kompletem.
 */

import { describe, expect, it } from 'vitest';

import type { SessionListItemDto, SessionPageDto } from '../../api/dto';
import { dayPages, dniEmpty, pagesSummary } from './dniPages';

const item = (uuid: string): SessionListItemDto =>
  ({ sessionUuid: uuid }) as unknown as SessionListItemDto;

const page = (uuids: string[], nextCursor: string | null, total: number): SessionPageDto => ({
  items: uuids.map(item),
  nextCursor,
  total,
});

describe('dayPages', () => {
  it('nic jeszcze nie przyszło → pusto i BEZ obietnicy ciągu dalszego', () => {
    // `hasMore: true` na pustym stanie dałby przycisk „pokaż kolejne" zanim
    // ktokolwiek cokolwiek pokazał.
    expect(dayPages(undefined)).toEqual({ items: [], shown: 0, total: 0, hasMore: false });
    expect(dayPages([])).toEqual({ items: [], shown: 0, total: 0, hasMore: false });
  });

  it('GRANICA STRONY nie ma szwu: żadnego wiersza dwa razy, żadnego pominiętego', () => {
    // Kursor koduje OSTATNI wiersz strony, a predykat serwera jest ostry (`<`, nie
    // `<=`), więc pierwszy wiersz następnej strony jest kolejnym, a nie powtórzonym.
    // Konkatenacja jest tu POPRAWNA — i dlatego nie odsiewamy duplikatów `Set`-em:
    // taki „bezpiecznik" maskowałby zepsuty predykat po stronie bazy.
    const state = dayPages([
      page(['sess-5', 'sess-4'], 'kursor-po-sess-4', 5),
      page(['sess-3', 'sess-2'], 'kursor-po-sess-2', 5),
      page(['sess-1'], null, 5),
    ]);

    expect(state.items.map((i) => i.sessionUuid)).toEqual([
      'sess-5',
      'sess-4',
      'sess-3',
      'sess-2',
      'sess-1',
    ]);
    expect(state.shown).toBe(5);
    expect(new Set(state.items.map((i) => i.sessionUuid)).size).toBe(5);
  });

  it('„czy jest więcej" pyta OSTATNIĄ stronę — kursor pierwszej jest już zużyty', () => {
    // Czytanie `nextCursor` pierwszej strony dałoby przycisk, który po dojściu
    // do końca listy nigdy nie gaśnie.
    expect(dayPages([page(['a'], 'kursor', 3)]).hasMore).toBe(true);

    expect(dayPages([page(['a'], 'kursor', 3), page(['b'], null, 3)]).hasMore).toBe(false);
  });

  it('`total` bierze z ostatniej odpowiedzi, bo jest najświeższy', () => {
    // Serwer liczy `total` tym samym filtrem przy każdym żądaniu. Jeśli w trakcie
    // przeglądania telefon dośle nowy dzień, licznik ma to pokazać — sklejona lista
    // i tak nie udaje migawki.
    const state = dayPages([page(['a'], 'kursor', 5), page(['b'], null, 7)]);
    expect(state.total).toBe(7);
    expect(state.shown).toBe(2);
  });
});

describe('pagesSummary', () => {
  it('mówi, że lista jest PRZYCIĘTA, dopóki serwer ma coś jeszcze', () => {
    // Milcząca lista przycięta kursorem to najgorszy tryb awarii narzędzia nadzoru:
    // wygląda na komplet.
    expect(pagesSummary(dayPages([page(['a', 'b'], 'kursor', 12)]))).toBe('Pokazano 2 z 12.');
  });

  it('po dociągnięciu wszystkiego mówi to wprost', () => {
    expect(pagesSummary(dayPages([page(['a', 'b'], null, 2)]))).toBe('Pokazano wszystkie 2.');
  });

  it('pusty wynik nie udaje liczby', () => {
    expect(pagesSummary(dayPages([page([], null, 0)]))).toBe('Brak dni w tym zawężeniu.');
  });
});

describe('dniEmpty', () => {
  it('rozróżnia „pusty rejestr" od „nic w tym zawężeniu"', () => {
    // Jeden napis na oba przypadki kazałby administratorowi zgadywać, czy widzi
    // własną literówkę, czy klub, w którym nikt jeszcze nie latał.
    expect(dniEmpty(true).title).not.toBe(dniEmpty(false).title);
    expect(dniEmpty(true).note).toContain('zawężona');
    expect(dniEmpty(false).note).toContain('session_claim');
  });

  it('ostrzega o pułapce sesji bez preflightu przy filtrze zakresu', () => {
    // Dzień bez `preflight_confirm` nie ma daty, więc KAŻDY zakres dat go pomija.
    // Bez tego zdania „pusto" wyglądałoby jak brak danych, a nie jak własność filtra.
    expect(dniEmpty(true).note).toContain('bez potwierdzenia przedlotowego');
  });
});
