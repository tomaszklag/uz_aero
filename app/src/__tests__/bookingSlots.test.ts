/**
 * Ninerdeck - SUGESTIE SLOTÓW i OKNO DOBY LOTNEJ (`@ninerdeck/domain`, issue #159).
 *
 * Reguła w jednym zdaniu: sadzamy przy zajętych miejscach, nie na środku pustego rzędu.
 * Testy pilnują tego, co z niej wynika, i dwóch rzeczy, które NIE SĄ błędem: dzień pełny
 * oddaje pustą listę, a dziura krótsza o minutę od żądania nie daje kandydata.
 */

import {
  CIVIL_TWILIGHT_MS,
  MAX_SLOT_SUGGESTIONS,
  MIN_USEFUL_SLOT_MS,
  SLOT_GRAIN_MS,
  flightDayWindow,
  suggestSlots,
  sunTimes,
  type BusySpan,
} from '@ninerdeck/domain';

const H = 3_600_000;
const MIN = 60_000;

/** Doba testowa: 4 lipca 2026, okno „lotne" 06:00-20:00 UTC dla czytelności godzin. */
const DAY = Date.UTC(2026, 6, 4);
const at = (h: number, m = 0): number => DAY + h * H + m * MIN;
const WINDOW = { from: at(6), to: at(20) };

const busy = (fromH: number, toH: number): BusySpan => ({ startsAt: at(fromH), endsAt: at(toH) });
const hhmm = (t: number): string =>
  `${String(Math.floor((t - DAY) / H)).padStart(2, '0')}:${String(Math.round(((t - DAY) % H) / MIN)).padStart(2, '0')}`;

describe('sugestie slotów: upakowanie dnia', () => {
  it('DZIEŃ PUSTY daje propozycje, które się nie nakładają', () => {
    // Bez tego pusty dzień oddawałby cztery godziny odległe o kwadrans, czyli jedną
    // propozycję powiedzianą cztery razy.
    const out = suggestSlots({ window: WINDOW, busy: [], duration: 2 * H });
    expect(out).toHaveLength(MAX_SLOT_SUGGESTIONS);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.startsAt).toBeGreaterThanOrEqual(out[i - 1]!.endsAt);
    }
    // Nic nie dotyka zajętości, bo zajętości nie ma - i powód to mówi.
    expect(out.every((s) => s.reason === 'open-day')).toBe(true);
  });

  it('DZIEŃ PEŁNY oddaje pustą listę - i to NIE jest błąd', () => {
    const out = suggestSlots({ window: WINDOW, busy: [busy(6, 20)], duration: H });
    expect(out).toEqual([]);
  });

  it('DZIURA DOKŁADNIE RÓWNA ŻĄDANIU daje jednego kandydata, który ją wypełnia', () => {
    const out = suggestSlots({
      window: WINDOW,
      busy: [busy(6, 10), busy(12, 20)],
      duration: 2 * H,
    });
    expect(out).toHaveLength(1);
    expect(hhmm(out[0]!.startsAt)).toBe('10:00');
    expect(out[0]!.reason).toBe('fills-gap');
    expect(out[0]!.gapBeforeMs).toBe(0);
    expect(out[0]!.gapAfterMs).toBe(0);
  });

  it('DZIURA KRÓTSZA O MINUTĘ nie daje nic', () => {
    const out = suggestSlots({
      window: WINDOW,
      busy: [busy(6, 10), { startsAt: at(12) - MIN, endsAt: at(20) }],
      duration: 2 * H,
    });
    expect(out).toEqual([]);
  });

  it('PRZYLEGANIE Z OBU STRON WYGRYWA z przyleganiem z jednej', () => {
    // Dwie dziury: 10:00-12:00 mieści lot dokładnie (oba boki), 14:00-17:00 zostawia
    // godzinę z którejś strony.
    const out = suggestSlots({
      window: WINDOW,
      busy: [busy(6, 10), busy(12, 14), busy(17, 20)],
      duration: 2 * H,
    });
    expect(hhmm(out[0]!.startsAt)).toBe('10:00');
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
  });

  it('ZETKNIĘCIE CO DO MINUTY JEST LEGALNE - slot zaczyna się, gdy cudzy się kończy', () => {
    const out = suggestSlots({ window: WINDOW, busy: [busy(6, 10)], duration: 2 * H });
    expect(hhmm(out[0]!.startsAt)).toBe('10:00');
    expect(out[0]!.gapBeforeMs).toBe(0);
  });

  it('MARTWA RESZTKA jest karana mocniej niż warte jedno przyleganie', () => {
    // Dziura 10:00-12:30 przy żądaniu 2 h: doklejenie do lewej zostawia 30 min (martwe),
    // doklejenie do prawej - też 30 min. Obie możliwości są gorsze od slotu luzem…
    const gap = { startsAt: at(12, 30), endsAt: at(20) };
    const out = suggestSlots({
      window: WINDOW,
      busy: [busy(6, 10), gap],
      duration: 2 * H,
    });
    // …więc jedyny kandydat z tej dziury ma ocenę UJEMNĄ i przegrywa - a że innej dziury
    // nie ma, lista jest pusta albo niesie wyłącznie takie sloty z ujemną oceną.
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.score).toBeLessThan(0);
    expect(MIN_USEFUL_SLOT_MS).toBeGreaterThan(30 * MIN);
  });

  it('PORA DNIA przesuwa wybór, ale wyłącznie gdy pilot ją podał', () => {
    const bez = suggestSlots({ window: WINDOW, busy: [], duration: H });
    const z = suggestSlots({ window: WINDOW, busy: [], duration: H, preferredAt: at(15) });
    expect(hhmm(bez[0]!.startsAt)).toBe('06:00');
    expect(hhmm(z[0]!.startsAt)).toBe('15:00');
  });

  it('SLOT, KTÓRY JUŻ SIĘ ZACZĄŁ, nie jest propozycją', () => {
    const out = suggestSlots({ window: WINDOW, busy: [], duration: H, now: at(14, 20) });
    expect(out[0]!.startsAt).toBeGreaterThanOrEqual(at(14, 20));
  });

  it('ziarno stoi na kwadransie, a przyleganie NIE MUSI w nie trafić', () => {
    // Rezerwacja kończąca się o 10:07 daje przyleganie o 10:07 - siatka co kwadrans
    // zgubiłaby dokładnie ten slot, o który w całej regule chodzi.
    const out = suggestSlots({
      window: WINDOW,
      busy: [{ startsAt: at(6), endsAt: at(10, 7) }],
      duration: 2 * H,
    });
    expect(hhmm(out[0]!.startsAt)).toBe('10:07');
    expect(SLOT_GRAIN_MS).toBe(15 * MIN);
  });

  it('zajętości NAKŁADAJĄCE SIĘ i nieposortowane scalają się same', () => {
    const out = suggestSlots({
      window: WINDOW,
      busy: [busy(12, 14), busy(6, 13), busy(13, 14)],
      duration: 2 * H,
    });
    expect(hhmm(out[0]!.startsAt)).toBe('14:00');
  });

  it('żądanie bez sensu (zero, ujemne) oddaje pustą listę zamiast wywalać się', () => {
    expect(suggestSlots({ window: WINDOW, busy: [], duration: 0 })).toEqual([]);
    expect(suggestSlots({ window: WINDOW, busy: [], duration: -H })).toEqual([]);
  });
});

describe('okno doby lotnej', () => {
  // Kraków-Pobiednik (EPKP) - lotnisko z katalogu, blisko środka Polski.
  const HOME = { lat: 50.0819, lon: 20.1372 };
  const doba = (utcDay: number) => ({ startsAt: utcDay, endsAt: utcDay + 86_400_000 });

  it('LATO daje okno dłuższe niż zima - i o to w całej decyzji chodziło', () => {
    const lato = flightDayWindow(doba(Date.UTC(2026, 5, 21)), HOME);
    const zima = flightDayWindow(doba(Date.UTC(2026, 11, 21)), HOME);
    expect(lato.basis).toBe('solar');
    expect(zima.basis).toBe('solar');
    const godziny = (w: { from: number; to: number }) => (w.to - w.from) / H;
    expect(godziny(lato)).toBeGreaterThan(16);
    expect(godziny(zima)).toBeLessThan(10);
  });

  it('okno to ZMIERZCH CYWILNY, nie sam wschód i zachód', () => {
    const day = doba(Date.UTC(2026, 5, 21));
    const sun = sunTimes(HOME.lat, HOME.lon, day.startsAt + 12 * H)!;
    const okno = flightDayWindow(day, HOME);
    expect(okno.from).toBe(sun.sunriseAt - CIVIL_TWILIGHT_MS);
    expect(okno.to).toBe(sun.sunsetAt + CIVIL_TWILIGHT_MS);
  });

  it('POŁUDNIE SŁONECZNE wypada tam, gdzie każe długość geograficzna', () => {
    // Kotwica NIEZALEŻNA od reszty algorytmu: południe słoneczne to 12:00 UTC minus
    // 4 minuty na każdy stopień długości wschodniej, plus równanie czasu (21 czerwca
    // Słońce spóźnia się o niecałe dwie minuty). Dla 20,14°E daje to 10:41 UTC.
    const sun = sunTimes(HOME.lat, HOME.lon, Date.UTC(2026, 5, 21, 12))!;
    const poludnie = (sun.sunriseAt + sun.sunsetAt) / 2;
    const minuty = Math.round((poludnie - Date.UTC(2026, 5, 21)) / MIN);
    expect(minuty).toBeGreaterThan(10 * 60 + 39);
    expect(minuty).toBeLessThan(10 * 60 + 44);
  });

  it('DŁUGOŚĆ DNIA zgadza się z kątem godzinnym policzonym ręcznie', () => {
    // Drugi rachunek sprawdzalny na kartce: dla szerokości 50,0819° i deklinacji
    // przesilenia (23,44°) kąt godzinny wschodu wynosi 122,9°, czyli pół doby to
    // 491,6 minuty. Razem 16 h 23 min - i tyle ma wyjść.
    const sun = sunTimes(HOME.lat, HOME.lon, Date.UTC(2026, 5, 21, 12))!;
    const minutyDnia = (sun.sunsetAt - sun.sunriseAt) / MIN;
    expect(minutyDnia).toBeGreaterThan(981);
    expect(minutyDnia).toBeLessThan(985);
  });

  it('RÓWNANIE CZASU jest uwzględnione - inaczej luty myliłby się o kwadrans', () => {
    // W połowie lutego Słońce SPÓŹNIA się o ~14 minut (południe wypada później),
    // na początku listopada SPIESZY o ~16 (wcześniej). Pominięcie tej poprawki
    // przesunęłoby południe o pół godziny między tymi datami.
    const noon = (month: number, day: number): number => {
      const utcDay = Date.UTC(2026, month, day);
      const sun = sunTimes(HOME.lat, HOME.lon, utcDay + 12 * H)!;
      return ((sun.sunriseAt + sun.sunsetAt) / 2 - utcDay) / MIN;
    };
    expect(noon(1, 11)).toBeGreaterThan(10 * 60 + 50);
    expect(noon(10, 3)).toBeLessThan(10 * 60 + 30);
  });

  it('KLUB BEZ LOTNISKA MACIERZYSTEGO dostaje okno domyślne, nie pustkę', () => {
    const okno = flightDayWindow(doba(Date.UTC(2026, 5, 21)), null);
    expect(okno.basis).toBe('default');
    expect((okno.to - okno.from) / H).toBe(15);
  });

  it('NOC POLARNA schodzi do okna domyślnego zamiast oddawać NaN', () => {
    // Longyearbyen w grudniu - Słońce nie przecina horyzontu.
    const okno = flightDayWindow(doba(Date.UTC(2026, 11, 21)), { lat: 78.22, lon: 15.65 });
    expect(okno.basis).toBe('default');
    expect(Number.isFinite(okno.from)).toBe(true);
    expect(Number.isFinite(okno.to)).toBe(true);
  });

  it('okno NIE WYCHODZI poza dobę, którą opisuje', () => {
    const day = doba(Date.UTC(2026, 5, 21));
    const okno = flightDayWindow(day, HOME);
    expect(okno.from).toBeGreaterThanOrEqual(day.startsAt);
    expect(okno.to).toBeLessThanOrEqual(day.endsAt);
  });
});
