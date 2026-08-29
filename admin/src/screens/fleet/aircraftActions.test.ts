/**
 * UZ Aero - panel: dostępność akcji na flocie i komunikaty odmowy.
 *
 * Dwie własności, których złamanie widzi użytkownik natychmiast: przycisk jest
 * WIDOCZNY i zablokowany Z POWODEM (nigdy ukryty), a odmowa serwera niesie ZASADĘ,
 * a nie surowy kod.
 */

import { describe, expect, it } from 'vitest';

import type { AircraftListItemDto, Capability } from '../../api/dto';
import {
  canManageFleet,
  disableAction,
  editAction,
  fleetFailure,
  fleetLoad,
  isFleetRefusal,
  missingAircraftCopy,
  refusalText,
  saveCopy,
} from './aircraftActions';

const ADMIN: Capability[] = ['panel.access', 'fleet.manage'];
const TRAINING_LEAD: Capability[] = ['panel.access', 'flags.resolve'];

const dto = (over: Partial<AircraftListItemDto> = {}): AircraftListItemDto => ({
  id: 'ac-1',
  reg: 'SP-KLM',
  type: 'Cessna 208 Caravan',
  year: 2011,
  capacityL: 1257,
  fuelToleranceL: 62.85,
  oilMinL: null,
  oilCapacityL: null,
  oilNormLPerH: null,
  mhFormat: 'decimal',
  dualRequired: true,
  serviceStatus: 'active',
  updatedAt: '2026-07-30T18:41:00.000Z',
  claim: null,
  reading: null,
  lastEventAt: null,
  openSessions: 0,
  openFlags: 0,
  ...over,
});

describe('kto co może', () => {
  it('flotę zmienia wyłącznie `fleet.manage`', () => {
    expect(canManageFleet(ADMIN)).toBe(true);
    expect(canManageFleet(TRAINING_LEAD)).toBe(false);
    expect(canManageFleet(undefined)).toBe(false);
  });

  it('szef wyszkolenia dostaje POWÓD przy przycisku, a nie zniknięcie przycisku', () => {
    const action = editAction(TRAINING_LEAD);
    expect(action.enabled).toBe(false);
    expect(action.reason).toContain('administrator');
  });

  it('administrator nie ma żadnego powodu blokady', () => {
    expect(editAction(ADMIN)).toEqual({ enabled: true, reason: null });
  });
});

describe('wyłączenie ze służby', () => {
  it('jednostka z OTWARTYM dniem ma zgaszony wybór i odmieniony powód', () => {
    expect(disableAction(dto({ openSessions: 1 }), ADMIN).reason).toContain('1 otwarty dzień');
    expect(disableAction(dto({ openSessions: 2 }), ADMIN).reason).toContain('2 otwarte dni');
    expect(disableAction(dto({ openSessions: 5 }), ADMIN).reason).toContain('5 otwartych dni');
  });

  it('bez otwartych dni wyłączenie jest dostępne', () => {
    expect(disableAction(dto(), ADMIN)).toEqual({ enabled: true, reason: null });
  });

  it('brak zdolności wygrywa nad liczbą otwartych dni', () => {
    expect(disableAction(dto({ openSessions: 3 }), TRAINING_LEAD).reason).toContain('administrator');
  });
});

describe('odmowa serwera → zdanie dla człowieka', () => {
  it('rozpoznaje WYŁĄCZNIE kody floty - koperta `409 refused` jest wspólna', () => {
    expect(isFleetRefusal('open_session')).toBe(true);
    // `last_admin` należy do ekranu kont; wzięcie go tutaj dałoby `undefined` w miejscu
    // wyjaśnienia zasady.
    expect(isFleetRefusal('last_admin')).toBe(false);
    expect(isFleetRefusal(undefined)).toBe(false);
  });

  it('tłumaczy zasadę, a nie kod', () => {
    expect(refusalText('open_session')).toContain('otwarty dzień');
    expect(refusalText('capacity_not_positive')).toContain('FUEL_MISMATCH');
  });

  it('`open_session` jest KOŃCOWA - druga próba nic nie zmieni bez zamknięcia dnia', () => {
    const failure = fleetFailure(409, { error: 'refused', reason: 'open_session' });
    expect(failure.final).toBe(true);
    expect(failure.tone).toBe('warn');
  });

  it('zajęta rejestracja wskazuje POLE i podpowiada, gdzie szukać', () => {
    const failure = fleetFailure(409, { error: 'conflict', field: 'reg' });
    expect(failure.title).toContain('rejestracja');
    expect(failure.detail).toContain('wyłączona ze służby');
    expect(failure.final).toBe(false);
  });

  it('403 tłumaczy, dlaczego odczyt działa, a zapis nie', () => {
    const failure = fleetFailure(403, { error: 'forbidden', required: 'fleet.manage' });
    expect(failure.detail).toContain('administrator');
    expect(failure.final).toBe(true);
  });

  it('brak sieci mówi, że nie wiadomo, czy żądanie doszło', () => {
    expect(fleetFailure(null, null).detail).toContain('Nie wiadomo');
  });

  it('nieznany status nie udaje, że rozumie - podaje kod i kieruje do audytu', () => {
    expect(fleetFailure(503, null).detail).toContain('503');
  });
});

describe('komunikat po zapisie', () => {
  it('mówi o PRZYSZŁOŚCI i o tym, kiedy zobaczą to telefony', () => {
    expect(saveCopy('update', 'SP-KLM').title).toContain('SP-KLM');
    expect(saveCopy('update', 'SP-KLM').note).toContain('po zapisie');
    expect(saveCopy('create', 'SP-NOWY').note).toContain('referencyjnych');
  });
});

// ── szuflada nad jednostką, której nie ma na liście ─────────────────────────────

describe('stan pobrania floty', () => {
  const ok = { pending: false, error: false };

  it('AWARIA wygrywa z ładowaniem - druga lista może się jeszcze kręcić', () => {
    expect(fleetLoad({ pending: true, error: false }, { pending: false, error: true })).toBe(
      'error',
    );
    expect(fleetLoad({ pending: false, error: true }, ok)).toBe('error');
  });

  it('dopóki KTÓRAKOLWIEK lista leci, nie wiadomo, czy jednostki nie ma', () => {
    expect(fleetLoad({ pending: true, error: false }, ok)).toBe('loading');
    expect(fleetLoad(ok, { pending: true, error: false })).toBe('loading');
  });

  it('obie gotowe i bez błędu = wiemy, co jest na liście', () => {
    expect(fleetLoad(ok, ok)).toBe('ready');
  });
});

describe('jednostka spoza listy - trzy komunikaty, nie dwa', () => {
  it('BŁĄD pobrania NIE mówi „zdejmij filtr" - to była rada o filtrze, którego serwer nie zastosował', () => {
    const copy = missingAircraftCopy('error');
    expect(copy.tone).toBe('danger');
    expect(copy.note).not.toContain('Zdejmij filtr');
    expect(copy.note).not.toContain('zawężeni');
    // Musi powiedzieć wprost, czego NIE WIADOMO - inaczej człowiek przyjmie, że
    // samolotu nie ma, i założy go drugi raz.
    expect(copy.title).toContain('Nie wiadomo');
    expect(copy.sub).not.toContain('zawężeniu');
  });

  it('BRAK w zawężeniu kieruje do filtra, bo to jedyny przypadek, w którym to pomaga', () => {
    const copy = missingAircraftCopy('ready');
    expect(copy.tone).toBe('warn');
    expect(copy.note).toContain('Zdejmij filtr');
  });

  it('POBIERANIE nie jest błędem i nie wygląda na błąd', () => {
    const copy = missingAircraftCopy('loading');
    expect(copy.tone).toBe('status');
    expect(copy.sub).toContain('wczytywanie');
  });

  it('trzy stany dają trzy RÓŻNE komunikaty - żaden nie jest kopią sąsiada', () => {
    const notes = (['loading', 'error', 'ready'] as const).map((s) => missingAircraftCopy(s).note);
    expect(new Set(notes).size).toBe(3);
    const subs = (['loading', 'error', 'ready'] as const).map((s) => missingAircraftCopy(s).sub);
    expect(new Set(subs).size).toBe(3);
  });
});
