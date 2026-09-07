/**
 * UZ Aero - test FAZY LOTU i prędkości pionowej (mockup 05 `.phase-hero`).
 *
 * Faza jest najbardziej wyeksponowaną informacją w kokpicie w locie - napis 54 px,
 * który pilot czyta jednym spojrzeniem. Jeśli będzie migotał między „Climb" a „Descent"
 * na szumie GPS, przestanie znaczyć cokolwiek.
 *
 * Dlatego testujemy dokładnie te sytuacje, w których consumer-grade GPS kłamie:
 * pojedynczy przeskok wysokości, przerwa w sygnale, cofnięty zegar, brak wysokości.
 */

import { VS_THRESHOLD_FPM, flightPhase, verticalSpeedFpm, type GpsFix } from '../domain';

const T0 = Date.UTC(2026, 5, 22, 13, 0, 0);

/** Fix po `sec` sekundach od T0. */
const fix = (sec: number, groundSpeedKt: number, altitudeFt: number | null): GpsFix => ({
  time: T0 + sec * 1000,
  groundSpeedKt,
  altitudeFt,
});

describe('prędkość pionowa', () => {
  it('liczy z okna czasu, nie z dwóch ostatnich fixów', () => {
    // Wznoszenie 500 ft w 30 s = 1000 ft/min, ale okno ma 10 s → liczymy z ostatnich 10 s.
    const fixes = [
      fix(0, 90, 1000),
      fix(10, 90, 1200),
      fix(20, 90, 1400),
      fix(30, 90, 1500),
    ];
    // Okno 10 s od fixa t=30 obejmuje t=20 (1400 ft) → 100 ft / 10 s = 600 ft/min.
    expect(verticalSpeedFpm(fixes)).toBeCloseTo(600, 0);
  });

  it('nie daje się zwieść pojedynczemu przeskokowi wysokości', () => {
    // Klasyczny artefakt GPS: jeden fix wyżej o 30 ft. Przy liczeniu z pary sąsiednich
    // fixów (1 s) dałoby to +1800 ft/min i fałszywe „Climb".
    const level = [fix(0, 90, 3000), fix(2, 90, 3000), fix(4, 90, 3000), fix(5, 90, 3030)];
    const vs = verticalSpeedFpm(level)!;
    expect(Math.abs(vs)).toBeLessThan(VS_THRESHOLD_FPM);
    expect(flightPhase(true, level).phase).toBe('cruise');
  });

  it('zwraca null, gdy brakuje wysokości albo danych', () => {
    expect(verticalSpeedFpm([])).toBeNull();
    expect(verticalSpeedFpm([fix(0, 90, 1000)])).toBeNull();
    expect(verticalSpeedFpm([fix(0, 90, null), fix(5, 90, null)])).toBeNull();
  });

  it('nie domyka wyliczenia po przerwie w sygnale', () => {
    // Fix sprzed 5 minut jest poza oknem - nie wolno go użyć jako punktu odniesienia.
    const fixes = [fix(0, 90, 1000), fix(300, 90, 5000)];
    expect(verticalSpeedFpm(fixes)).toBeNull();
  });

  it('nie liczy przy cofniętym zegarze', () => {
    const fixes = [fix(10, 90, 1000), fix(10, 90, 1500)];
    expect(verticalSpeedFpm(fixes)).toBeNull();
  });

  it('nie podaje wyniku z okna zbyt ciasnego w czasie', () => {
    // Dwa fixy sekundę po sobie, 20 ft różnicy → naiwnie 1200 ft/min z czystego szumu.
    expect(verticalSpeedFpm([fix(0, 90, 3000), fix(1, 90, 3020)])).toBeNull();
  });
});

describe('faza lotu', () => {
  it('na ziemi rozróżnia postój od kołowania', () => {
    expect(flightPhase(false, [fix(0, 0, 500)]).phase).toBe('idle');
    expect(flightPhase(false, [fix(0, 12, 500)]).phase).toBe('taxi');
  });

  it('w powietrzu nazywa wznoszenie, przelot i zniżanie', () => {
    const climb = [fix(0, 90, 2000), fix(10, 90, 2200)]; // +1200 ft/min
    const cruise = [fix(0, 120, 3500), fix(10, 120, 3505)];
    const descent = [fix(0, 100, 3500), fix(10, 100, 3300)]; // −1200 ft/min

    expect(flightPhase(true, climb).phase).toBe('climb');
    expect(flightPhase(true, cruise).phase).toBe('cruise');
    expect(flightPhase(true, descent).phase).toBe('descent');
    expect(flightPhase(true, climb).verticalSpeedFpm).toBeCloseTo(1200, 0);
  });

  it('bez wysokości mówi „cruise", a nie zgaduje wznoszenia', () => {
    const noAlt = [fix(0, 110, null), fix(10, 110, null)];
    const reading = flightPhase(true, noAlt);
    expect(reading.phase).toBe('cruise');
    expect(reading.verticalSpeedFpm).toBeNull();
  });

  it('nie przełącza fazy na wartości tuż poniżej progu', () => {
    // ~200 ft/min to wciąż przelot - inaczej napis migotałby przez cały lot.
    const gentle = [fix(22, 100, 3067), fix(26, 100, 3080), fix(30, 100, 3100)];
    const reading = flightPhase(true, gentle);
    expect(Math.abs(reading.verticalSpeedFpm!)).toBeLessThan(VS_THRESHOLD_FPM);
    expect(reading.phase).toBe('cruise');
  });
});
