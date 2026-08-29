/**
 * UZ Aero - panel: sklejenie stron kursorowych rejestru i stany puste (`A04`).
 *
 * Dwie własności, których złamanie nie widać po niczym poza treścią na ekranie:
 *
 *  1. **`counts: null` znaczy „nie wiemy", nie „zero".** Zero jest twierdzeniem
 *     o świecie i nie wolno go postawić obok banera o nieudanym pobraniu.
 *  2. **Pustka mówi trzy różne rzeczy.** Najważniejsza z nich - „to zdarzenie nie
 *     dotarło na serwer" - jest odpowiedzią na najczęstsze pytanie, jakie ten ekran
 *     dostanie (`ANALIZA` §5), a pustka bez tego zdania na nie nie odpowiada.
 */

import { describe, expect, it } from 'vitest';

import type { EventEntryDto, EventsPageDto } from '../../api/dto';
import { eventsEmpty, eventsPages, pagesSummary } from './eventsPages';

const item = (uuid: string): EventEntryDto =>
  ({ uuid }) as unknown as EventEntryDto;

const page = (over: Partial<EventsPageDto> = {}): EventsPageDto => ({
  items: [item('a'), item('b')],
  nextCursor: null,
  counts: { total: 2, withoutGpsFix: 0, clockDrift: 0, driftThresholdMs: 120_000 },
  ...over,
});

describe('strony rejestru: sklejanie kursorem', () => {
  it('bez odpowiedzi wszystko jest puste, a liczniki NIEZNANE', () => {
    // `counts: null`, nie zera - patrz nagłówek pliku.
    expect(eventsPages(undefined)).toEqual({ items: [], shown: 0, counts: null, hasMore: false });
    expect(eventsPages([])).toEqual({ items: [], shown: 0, counts: null, hasMore: false });
  });

  it('liczniki bierzemy z PIERWSZEJ strony, bo serwer liczy je tylko dla niej', () => {
    // Kolejne strony niosą `null`; czytanie ich licznika kazałoby kaflom zgasnąć
    // dokładnie w chwili, w której człowiek dociąga zdarzenia.
    const state = eventsPages([
      page({ nextCursor: 'c1', counts: { total: 9, withoutGpsFix: 2, clockDrift: 1, driftThresholdMs: 120_000 } }),
      page({ items: [item('c')], counts: null }),
    ]);
    expect(state.counts?.total).toBe(9);
    expect(state.shown).toBe(3);
    expect(state.items.map((i) => i.uuid)).toEqual(['a', 'b', 'c']);
  });

  it('„czy jest więcej" pyta OSTATNIĄ stronę, nie pierwszą', () => {
    // `nextCursor` pierwszej strony jest już zużyty - czytanie go kazałoby przyciskowi
    // „pokaż starsze" świecić na wiecznie.
    const state = eventsPages([page({ nextCursor: 'c1' }), page({ nextCursor: null })]);
    expect(state.hasMore).toBe(false);
    expect(eventsPages([page({ nextCursor: null }), page({ nextCursor: 'c2' })]).hasMore).toBe(true);
  });
});

describe('strony rejestru: podpis „pokazano N z M"', () => {
  it('bez liczników NIE twierdzi nic o liczbie', () => {
    expect(pagesSummary(eventsPages(undefined))).toContain('nieznana');
  });

  it('rozróżnia komplet, przycięcie i pustkę', () => {
    expect(pagesSummary(eventsPages([page()]))).toBe('Pokazano wszystkie 2.');
    expect(
      pagesSummary(
        eventsPages([
          page({ nextCursor: 'c1', counts: { total: 40, withoutGpsFix: 0, clockDrift: 0, driftThresholdMs: 1 } }),
        ]),
      ),
    ).toBe('Pokazano 2 z 40.');
    expect(
      pagesSummary(
        eventsPages([
          page({ items: [], counts: { total: 0, withoutGpsFix: 0, clockDrift: 0, driftThresholdMs: 1 } }),
        ]),
      ),
    ).toBe('Brak zdarzeń w tym zawężeniu.');
  });
});

describe('strony rejestru: pustka mówi TRZY różne rzeczy', () => {
  it('szukanie po uuid - „to zdarzenie nie dotarło", z drogą wyjścia', () => {
    // Najczęstsze pytanie tego ekranu. Pustka bez tego zdania na nie nie odpowiada,
    // a wskazanie outboxu telefonu jest KONKRETNYM działaniem, nie pocieszeniem.
    const empty = eventsEmpty({ narrowed: true, uuidLookup: true, uuid: 'ev-9' });
    expect(empty.title).toContain('NIE DOTARŁO');
    expect(empty.note).toContain('ev-9');
    expect(empty.note).toContain('outbox');
    // Oba identyfikatory wyglądają tak samo, więc pomyłka jest naturalna - ekran
    // proponuje przeszukanie po sesji zamiast kazać zgadywać.
    expect(empty.sessionRetryUuid).toBe('ev-9');
  });

  it('inne zawężenie - „nic w tym zawężeniu" plus ostrzeżenie o osi czasu', () => {
    const empty = eventsEmpty({ narrowed: true, uuidLookup: false, uuid: null });
    expect(empty.title).toContain('ZAWĘŻENIU');
    // Pułapka, w którą wpada się przy pierwszym użyciu: zakres idzie po czasie
    // PRZYJĘCIA, więc paczka z zaległego outboxu leży pod inną datą.
    expect(empty.note).toContain('PRZYJĘCIA');
    expect(empty.sessionRetryUuid).toBeNull();
  });

  it('rejestr bez ani jednego wiersza - to podejrzenie awarii synchronizacji', () => {
    // „Baza pusta" przy klubie, który lata, nie znaczy ciszy - znaczy, że zdarzenia
    // leżą w outboxach. Ekran ma to powiedzieć, a nie pokazać neutralną pustkę.
    const empty = eventsEmpty({ narrowed: false, uuidLookup: false, uuid: null });
    expect(empty.title).toContain('PUSTY');
    expect(empty.note).toContain('outbox');
  });

  it('kontrola samego testu: trzy przypadki dają TRZY różne tytuły', () => {
    const titles = [
      eventsEmpty({ narrowed: true, uuidLookup: true, uuid: 'x' }).title,
      eventsEmpty({ narrowed: true, uuidLookup: false, uuid: null }).title,
      eventsEmpty({ narrowed: false, uuidLookup: false, uuid: null }).title,
    ];
    expect(new Set(titles).size).toBe(3);
  });
});
