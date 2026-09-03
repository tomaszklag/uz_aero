import { describe, expect, it } from 'vitest';

import type { AircraftListItemDto, AircraftReadingDto } from '../../api/dto';
import { currentStateLocked, currentStateView } from './currentState';

const reading: AircraftReadingDto = {
  mh: 1236.5,
  fuelL: 112,
  at: Date.UTC(2026, 5, 21, 9, 15),
  byPilotId: 'p-1',
  byPilotName: 'Tomasz Małkiewicz',
  oilL: 8.2,
  oilAddedSinceL: 0,
  oilAt: Date.UTC(2026, 5, 18, 7, 40),
  source: 'handover',
  note: null,
};

const aircraft = { mhFormat: 'decimal', reading } as AircraftListItemDto;

/** Odczyt wpisany ręką administratora (issue #81): olej z tego samego wpisu. */
const adminReading: AircraftReadingDto = {
  ...reading,
  at: Date.UTC(2026, 8, 3, 12, 5),
  byPilotId: null,
  byPilotName: 'Tomasz Klag',
  oilAt: Date.UTC(2026, 8, 3, 12, 5),
  source: 'admin',
  note: 'Odczyt z tarczy po zakończeniu operacji z 3 września.',
};

describe('currentStateLocked - granica „kto prowadzi tę liczbę"', () => {
  it('tworzenie i lista w drodze: pola do wpisania', () => {
    expect(currentStateLocked(null)).toBe(false);
  });

  it('bez odczytu i przy odczycie Z PANELU: liczba jest nadal wpisem administratora', () => {
    expect(currentStateLocked({ ...aircraft, reading: null })).toBe(false);
    expect(currentStateLocked({ ...aircraft, reading: { ...reading, source: 'initial' } })).toBe(
      false,
    );
  });

  it('maszynę prowadzi dziennik: pola do odczytu', () => {
    expect(currentStateLocked(aircraft)).toBe(true);
    expect(currentStateLocked({ ...aircraft, reading: { ...reading, source: 'open_session' } })).toBe(
      true,
    );
  });
});

describe('currentStateView - wartości z dziennika', () => {
  it('licznik idzie w FORMACIE maszyny, paliwo i olej bez jednostki (etykieta mówi „L")', () => {
    const view = currentStateView(reading, 'decimal');
    expect(view.mh.value).toBe('1236.5');
    expect(view.fuel.value).toBe('112');
    expect(view.oil.value).toBe('8,2');

    expect(currentStateView(reading, 'hhmm').mh.value).toBe('1236:30');
  });

  it('podpis mówi, skąd liczba i z kiedy', () => {
    const view = currentStateView(reading, 'decimal');
    expect(view.fuel.hint).toBe('Z dziennika · odczyt 21 CZERWCA 09:15 UTC.');
    expect(view.mh.hint).toBe(view.fuel.hint);
    // Olej ma WŁASNY stempel - pomiar bywa dużo starszy niż odczyt paliwa.
    expect(view.oil.hint).toBe('Z dziennika · pomiar 18 CZERWCA 07:40 UTC.');
  });

  it('dolewki po pomiarze wchodzą do wartości i podpis to mówi - ale tylko gdy były', () => {
    const topped = { ...reading, oilL: 10.2, oilAddedSinceL: 2 };
    const view = currentStateView(topped, 'decimal');
    expect(view.oil.value).toBe('10,2');
    expect(view.oil.hint).toBe('Z dziennika · pomiar 18 CZERWCA 07:40 UTC + dolewki 2,0 L.');
  });

  it('olej bez ani jednego pomiaru to kreska z powodem, nie zero', () => {
    const bare = { ...reading, oilL: null, oilAddedSinceL: null, oilAt: null };
    const view = currentStateView(bare, 'decimal');
    expect(view.oil.value).toBe('—');
    expect(view.oil.hint).toBe('W dzienniku nie ma pomiaru oleju.');
  });

  it('odczyt administratora (issue #81): pola do odczytu, a podpis mówi KTO i DLACZEGO', () => {
    // Wpis z panelu, który wyprzedził zdanie, prowadzi maszynę tak samo jak dziennik -
    // poprawia się go osobną akcją, nie polami stanu.
    expect(currentStateLocked({ ...aircraft, reading: adminReading })).toBe(true);

    const view = currentStateView(adminReading, 'decimal');
    expect(view.fuel.hint).toBe(
      'Wpis administratora Tomasz Klag · 3 WRZEŚNIA 12:05 UTC. Odczyt z tarczy po zakończeniu operacji z 3 września.',
    );
    expect(view.mh.hint).toBe(view.fuel.hint);
    // Olej z TEGO SAMEGO wpisu nie udaje pomiaru z bagnetu.
    expect(view.oil.hint).toBe('Wpis administratora 3 WRZEŚNIA 12:05 UTC.');
  });

  it('odczyt administratora BEZ oleju zostawia kotwicę oleju przy dzienniku', () => {
    const view = currentStateView({ ...adminReading, oilAt: reading.oilAt }, 'decimal');
    expect(view.oil.hint).toBe('Z dziennika · pomiar 18 CZERWCA 07:40 UTC.');
  });
});
