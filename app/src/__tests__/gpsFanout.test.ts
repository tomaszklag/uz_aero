/**
 * UZ Aero - GPS z DWOMA odbiorcami naraz.
 *
 * Regresja z urządzenia (2026-07-29): kokpit i diagnostyka GPS na ekranie 13 słuchają
 * tego samego odbiornika jednocześnie. Gdy adapter trzymał jednego słuchacza, wejście
 * w ustawienia odbierało kokpitowi strumień, a wyjście gasiło go do zera - autodetekcja
 * milkła do końca dnia, a baner „GPS: brak sygnału" nie miał już czym zniknąć.
 *
 * Dlatego sprawdzamy KONTRAKT PORTU, nie implementację: drugi `start` nie zabiera fixów
 * pierwszemu, a `stop` jednego odbiorcy nie gasi odbiornika, dopóki został drugi.
 */

import { GpsFanout } from '../infrastructure/gps/gpsFanout';
import type { GpsFix } from '../domain';

const fix = (time: number): GpsFix => ({
  time,
  groundSpeedKt: 12,
  altitudeFt: 500,
  lat: 52.1,
  lon: 21.0,
  accuracyM: 5,
});

describe('GpsFanout - jeden odbiornik, wielu odbiorców', () => {
  it('rozsyła fix do WSZYSTKICH zapisanych odbiorców', () => {
    const fanout = new GpsFanout();
    const cockpit: GpsFix[] = [];
    const diagnostics: GpsFix[] = [];

    fanout.add((f) => cockpit.push(f));
    fanout.add((f) => diagnostics.push(f));
    fanout.emit(fix(1_000));

    expect(cockpit).toHaveLength(1);
    expect(diagnostics).toHaveLength(1);
  });

  it('mówi, kiedy OTWORZYĆ i kiedy ZAMKNĄĆ źródło', () => {
    const fanout = new GpsFanout();
    const cockpit = (): void => undefined;
    const diagnostics = (): void => undefined;

    // Pierwszy odbiorca zapala odbiornik, drugi już nie.
    expect(fanout.add(cockpit)).toBe(true);
    expect(fanout.add(diagnostics)).toBe(false);

    // Wyjście z ustawień NIE gasi odbiornika - kokpit dalej słucha.
    expect(fanout.remove(diagnostics)).toBe(false);
    expect(fanout.empty).toBe(false);

    // Dopiero zejście ostatniego.
    expect(fanout.remove(cockpit)).toBe(true);
    expect(fanout.empty).toBe(true);
  });

  it('po wypisaniu diagnostyki kokpit dostaje fixy dalej', () => {
    const fanout = new GpsFanout();
    const cockpit: GpsFix[] = [];
    const diagnostics: GpsFix[] = [];
    const cockpitListener = (f: GpsFix): void => void cockpit.push(f);
    const diagnosticsListener = (f: GpsFix): void => void diagnostics.push(f);

    fanout.add(cockpitListener);
    fanout.add(diagnosticsListener);
    fanout.emit(fix(1_000));
    fanout.remove(diagnosticsListener);
    fanout.emit(fix(2_000));

    expect(cockpit.map((f) => f.time)).toEqual([1_000, 2_000]);
    expect(diagnostics.map((f) => f.time)).toEqual([1_000]);
  });

  it('odbiorca może wypisać się w reakcji na fix, nie gubiąc pozostałych', () => {
    const fanout = new GpsFanout();
    const seen: string[] = [];
    const first = (): void => {
      seen.push('first');
      fanout.remove(first);
    };
    const second = (): void => void seen.push('second');

    fanout.add(first);
    fanout.add(second);
    fanout.emit(fix(1_000));

    expect(seen).toEqual(['first', 'second']);
  });

  it('powtórny `add` tego samego odbiorcy nie mnoży odczytów', () => {
    const fanout = new GpsFanout();
    const seen: GpsFix[] = [];
    const listener = (f: GpsFix): void => void seen.push(f);

    fanout.add(listener);
    fanout.add(listener);
    fanout.emit(fix(1_000));

    expect(seen).toHaveLength(1);
  });
});

describe('ReplayGpsAdapter - ten sam kontrakt co adapter urządzenia', () => {
  it('drugi odbiorca nie odbiera strumienia pierwszemu', async () => {
    // Import leniwy: barrel infrastruktury nie wciąga modułów natywnych, ale trzymamy
    // tę zależność lokalnie, żeby test kontraktu nie zależał od kolejności eksportów.
    const { ReplayGpsAdapter } = await import('../infrastructure/gps/replayGpsAdapter');

    const gps = new ReplayGpsAdapter([fix(1_000), fix(2_000)], { intervalMs: 0 });
    const cockpit: GpsFix[] = [];
    const stop = await gps.start((f) => void cockpit.push(f));

    // Diagnostyka dołącza PO odtworzeniu serii - nie ma już czego słuchać, ale i nie
    // wolno jej zrestartować cudzego strumienia ani go zabrać.
    const stopDiagnostics = await gps.start(() => undefined);
    expect(cockpit.map((f) => f.time)).toEqual([1_000, 2_000]);

    stopDiagnostics();
    stop();
  });
});
