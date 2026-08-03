/**
 * UZ Aero — panel: kafle nad listą dni lotnych.
 *
 * Kafel podaje liczbę, więc pytanie brzmi zawsze: SKĄD ona jest — i co pokazujemy,
 * kiedy jej nie ma. Ten plik przybija drugą część: brak odpowiedzi to „—", nigdy zero,
 * i to nie tylko w samym module, ale TAM, GDZIE JEST ON WOŁANY.
 */

import { describe, expect, it } from 'vitest';

import type { SessionPageDto } from '../../api/dto';
import { dayPages } from './daysPages';
import { daysTiles, type DaysCounts } from './daysTiles';

/** Same braki — punkt wyjścia, w którym każdy kafel podmieniamy pojedynczo. */
const NONE: DaysCounts = { total: undefined, open: undefined, flagged: undefined, exported: undefined };

const page = (count: number, total: number): SessionPageDto => ({
  items: Array.from({ length: count }, (_, i) => ({ sessionUuid: `sess-${i}` })) as SessionPageDto['items'],
  nextCursor: null,
  total,
});

describe('kafle listy dni', () => {
  it('BRAK odpowiedzi to „—", nie zero — zero jest twierdzeniem o świecie', () => {
    const tiles = daysTiles(NONE, false);

    expect(tiles.map((t) => t.value)).toEqual(['—', '—', '—', '—']);
    // Ton też się na braku nie zapala — ani „coś się dzieje", ani uspokajająca zieleń.
    expect(tiles.every((t) => t.tone === undefined)).toBe(true);
  });

  it('reguła „—" obowiązuje TAM, GDZIE KAFEL JEST WOŁANY — także przy błędzie pobrania', () => {
    // Ta sama pomyłka, co na ekranie audytu: reguła stała w module kafli, a ekran
    // łamał ją JEDNO wywołanie wyżej, bo warunkiem było `isPending` — czyli faza
    // ładowania, a nie obecność danych. Przy nieudanym pobraniu `isPending` jest
    // `false`, więc do kafla trafiała liczba wyliczona z BRAKU odpowiedzi i tuż obok
    // banera „nie udało się pobrać listy dni" ekran twierdził, że klub nie ma ani
    // jednego dnia lotnego.
    //
    // Dlatego test składa oba moduły dokładnie tak, jak robi to `DaysScreen`:
    // `dayPages(days.data)` → `daysTiles({ total: pages.total, … })`. Osobno każdy
    // z nich przechodził.
    const noResponse = dayPages(undefined);

    expect(noResponse.total).toBeNull();
    expect(daysTiles({ ...NONE, total: noResponse.total }, false)[0]!.value).toBe('—');

    // Pusty rejestr NADAL pokazuje zero — to jest odpowiedź serwera, a nie jej brak.
    const empty = dayPages([page(0, 0)]);
    expect(daysTiles({ ...NONE, total: empty.total }, false)[0]!.value).toBe(0);
  });

  it('zero jest zerem, a liczba dodatnia zapala ton', () => {
    const tiles = daysTiles({ total: 128, open: 0, flagged: 3, exported: 91 }, true);

    expect(tiles.map((t) => t.value)).toEqual([128, 0, 3, 91]);
    // Zero otwartych dni to nie jest wiadomość — nic się nie dzieje, ton gaśnie.
    expect(tiles[1]!.tone).toBeUndefined();
    expect(tiles[2]!.tone).toBe('amber');
  });

  it('zero flag świeci na zielono, ale brak liczby flag NIE świeci wcale', () => {
    // Zielone zero znaczy „sprawdziliśmy i nie ma nic do wyjaśnienia". Postawione na
    // braku odpowiedzi byłoby uspokojeniem wystawionym bez pokrycia.
    expect(daysTiles({ ...NONE, flagged: 0 }, false)[2]!.tone).toBe('green');
    expect(daysTiles({ ...NONE, flagged: null }, false)[2]!.tone).toBeUndefined();
  });

  it('przypis pierwszego kafla mówi, czy liczba dotyczy filtra, czy całości', () => {
    expect(daysTiles(NONE, true)[0]!.note).toContain('filtr z adresu');
    expect(daysTiles(NONE, false)[0]!.note).toContain('Wszystkie sesje w rejestrze');
  });
});
