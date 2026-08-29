/**
 * UZ Aero - testy kafelka „Flight time" w kokpicie (`logic/cockpitFlightTime.ts`).
 *
 * Ten przyrząd czyta się w locie i nikt go nie weryfikuje kalkulatorem, więc każdy
 * zgubiony lot zostaje zgubiony na dobre. Sedno: kafelek mierzy SESJĘ, a nie bieżące
 * wyniesienie - wcześniejsze loty (także dopisane ręcznie) nie mają prawa z niego
 * znikać w chwili oderwania.
 */

import { cockpitFlightTimeMs } from '../ui/screens/logic/cockpitFlightTime';

const min = (m: number): number => m * 60_000;
const T0 = Date.UTC(2026, 5, 22, 13, 24, 0);

describe('cockpitFlightTimeMs - czas lotu sesji na przyrządzie', () => {
  it('na ziemi pokazuje sumę lotów zamkniętych', () => {
    expect(cockpitFlightTimeMs({ closedMs: min(44), openTakeoffAt: null, now: T0 })).toBe(min(44));
  });

  it('w locie DOLICZA otwarty lot do wcześniejszych, zamiast ich podmieniać', () => {
    // Dwa loty w sesji (0:44 i 0:42) i trzeci w powietrzu od 15 minut.
    const ms = cockpitFlightTimeMs({
      closedMs: min(44) + min(42),
      openTakeoffAt: T0,
      now: T0 + min(15),
    });

    expect(ms).toBe(min(101));
  });

  it('lot dopisany RĘCZNIE liczy się tak samo - projekcja nie zna metody', () => {
    // Wpis ręczny (05f, 08) zamyka lot w projekcji dokładnie jak detekcja GPS, więc
    // po dopisaniu przegapionego lotu przyrząd MUSI drgnąć. Że nie drgał, było błędem
    // ekranu, nie projekcji.
    const przedWpisem = cockpitFlightTimeMs({ closedMs: 0, openTakeoffAt: T0, now: T0 + min(15) });
    const poWpisie = cockpitFlightTimeMs({
      closedMs: min(38),
      openTakeoffAt: T0,
      now: T0 + min(15),
    });

    expect(poWpisie - przedWpisem).toBe(min(38));
  });

  it('pierwszy lot sesji: sam licznik na żywo, bez fałszywego doliczenia', () => {
    expect(cockpitFlightTimeMs({ closedMs: 0, openTakeoffAt: T0, now: T0 + min(3) })).toBe(min(3));
  });

  it('start RETRO-DATOWANY w przyszłość zatrzymuje przyrząd na sumie, nie cofa go', () => {
    // Czas zdarzenia bywa z innego zegara niż ticker (§5.1) - ujemna różnica nie może
    // zjadać czasu lotów już zapisanych.
    expect(cockpitFlightTimeMs({ closedMs: min(44), openTakeoffAt: T0 + 5_000, now: T0 })).toBe(
      min(44),
    );
  });
});
