import { describe, expect, it } from 'vitest';

import type { AircraftListItemDto } from '../../api/dto';
import { fleetRow, mhFormatLabel } from './fleetRows';

const aircraft: AircraftListItemDto = {
  id: 'a-1',
  reg: 'SP-KLM',
  type: 'Cessna 182',
  year: 2011,
  capacityL: 1100,
  fuelToleranceL: 55,
  mhFormat: 'decimal',
  dualRequired: false,
  serviceStatus: 'active',
  oilMinL: null,
  oilCapacityL: null,
  oilNormLPerH: null,
  fuelNormLPerH: null,
  initialMh: null,
  initialFuelL: null,
  initialOilL: null,
  reading: null,
  openSessions: 0,
};

describe('komórki', () => {
  it('nieznany rocznik to kreska, nie pusta komórka', () => {
    expect(fleetRow({ ...aircraft, year: null }).year).toBe('—');
  });

  it('pojemność formatuje wspólny pakiet, więc wygląda jak w telefonie', () => {
    expect(fleetRow(aircraft).capacity).toBe('1100 L');
  });

  it('format licznika mówi po polsku, nie kodem kontraktu', () => {
    expect(mhFormatLabel('decimal')).toBe('dziesiętny');
    expect(mhFormatLabel('hhmm')).toBe('godziny i minuty');
  });

  it('plakietka drugiego pilota pojawia się WYŁĄCZNIE przy wymogu', () => {
    // Plakietka przy każdym wierszu uczy oko pomijać kolumnę - a wymóg dotyczy
    // mniejszości floty i jest jedyną informacją, której się w niej szuka.
    expect(fleetRow(aircraft).dualLabel).toBeNull();
    expect(fleetRow({ ...aircraft, dualRequired: true }).dualLabel).toBe('wymagany');
  });
});

describe('stan służby', () => {
  it('jednostka w służbie nie niesie ostrzeżenia', () => {
    const row = fleetRow({ ...aircraft, openSessions: 1 });
    expect(row.statusLabel).toBe('W służbie');
    expect(row.warning).toBeNull();
    expect(row.muted).toBe(false);
  });

  it('wyłączona jednostka BEZ otwartej sesji też nie niesie ostrzeżenia', () => {
    const row = fleetRow({ ...aircraft, serviceStatus: 'disabled' });
    expect(row.statusLabel).toBe('Wyłączony');
    expect(row.warning).toBeNull();
    expect(row.muted).toBe(true);
  });

  it('wyłączona jednostka Z otwartą sesją - jedyny sygnał wyjątkowy tego ekranu', () => {
    // Tego nie widać nigdzie indziej w panelu 2.0: maszyna zniknęła pilotom z listy,
    // a ktoś jej jeszcze nie zdał.
    const row = fleetRow({ ...aircraft, serviceStatus: 'disabled', openSessions: 2 });
    expect(row.warning).toBe('ktoś jeszcze na nim lata');
  });
});
