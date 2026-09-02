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
};

const aircraft = { mhFormat: 'decimal', reading } as AircraftListItemDto;

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
});
