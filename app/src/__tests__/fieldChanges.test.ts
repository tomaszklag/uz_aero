/**
 * UZ Aero - test LICZNIKA POPRAWEK PER POLE (issue #43, uwagi z urządzenia).
 *
 * Ta jedna liczba zapala plakietkę „popr." przy wierszu osi, przy notatce i przy drugim
 * pilocie, a potem podpisuje wejście w historię zmian. Cały jej sens jest w zawężeniu:
 * `preflight_confirm` niesie paliwo, licznik motogodzin, notatkę i Duala w JEDNYM
 * payloadzie, więc licznik per zdarzenie zapalałby wszystkie cztery znaczniki naraz -
 * i każdy z nich kłamałby o trzech pozostałych.
 */

import { fieldChanges } from '../ui/screens/logic/fieldChanges';
import type { Event, EventOf, EventType } from '../domain';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;

function event<T extends EventType>(
  type: T,
  time: number,
  payload: EventOf<T>['payload'],
  uuid?: string,
): Event {
  seq += 1;
  return {
    uuid: uuid ?? `e-${seq}`,
    type,
    sessionUuid: 's-1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    deviceTime: time,
    gpsTime: time,
    schemaVersion: 1,
    syncedAt: null,
    payload,
  } as Event;
}

/** Sesja z jednym lądowaniem i preflightem - dwa różne cele korekty. */
function base(): Event[] {
  seq = 0;
  return [
    event('session_claim', at(8, 4), { mode: 'free' }),
    event(
      'preflight_confirm',
      at(8, 6),
      {
        operation: 'skoki',
        departureIcao: 'EPZG',
        reading: { fuelL: 150, mh: 1234.5 },
        notes: 'Drugi zbiornik nie trzyma wskazania.',
      },
      'preflight-1',
    ),
    event('engine_start', at(8, 12), {}),
    event('landing', at(9, 41), { method: 'auto', position: null }, 'landing-1'),
  ];
}

function correction(
  targetUuid: string,
  payload: object,
  when = at(11, 0),
  uuid?: string,
): Event {
  return event('event_correction', when, { targetUuid, ...payload } as never, uuid);
}

describe('licznik poprawek per pole', () => {
  it('zdarzenie, którego nikt nie ruszał, ma zero', () => {
    expect(fieldChanges(base(), 'preflight-1', ['notes'])).toBe(0);
  });

  it('liczy TYLKO pytane pole, choć payload niesie cztery', () => {
    // Sedno całej rzeczy: jedna korekta paliwa, jedna notatki, jedna Duala - i każde
    // pytanie musi dostać swoją jedynkę, a nie wspólną trójkę.
    const events = [
      ...base(),
      correction('preflight-1', { action: 'amend', fields: { fuelL: 148 } }, at(11, 0), 'c-1'),
      correction('preflight-1', { action: 'amend', fields: { notes: 'Po poprawce.' } }, at(11, 5), 'c-2'),
      correction('preflight-1', { action: 'amend', fields: { dualId: 'AKO' } }, at(11, 9), 'c-3'),
    ];

    expect(fieldChanges(events, 'preflight-1', ['fuelL'])).toBe(1);
    expect(fieldChanges(events, 'preflight-1', ['notes'])).toBe(1);
    expect(fieldChanges(events, 'preflight-1', ['dualId'])).toBe(1);
  });

  it('kilka pól w jednej korekcie liczy się osobno', () => {
    // `amend` bywa wielopolowy (arkusz odczytu zapisuje paliwo i licznik razem),
    // a historia rozbija go na wpis per pole - licznik musi widzieć to samo.
    const events = [
      ...base(),
      correction('preflight-1', { action: 'amend', fields: { fuelL: 148, mh: 1234.6 } }),
    ];

    expect(fieldChanges(events, 'preflight-1', ['fuelL'])).toBe(1);
    expect(fieldChanges(events, 'preflight-1', ['mh'])).toBe(1);
    expect(fieldChanges(events, 'preflight-1', ['fuelL', 'mh'])).toBe(2);
  });

  it('przesunięcie czasu liczy się jako zmiana pola „czas"', () => {
    const events = [...base(), correction('landing-1', { action: 'retime', newTime: at(9, 44) })];

    expect(fieldChanges(events, 'landing-1', ['time'])).toBe(1);
    expect(fieldChanges(events, 'landing-1', ['fuelL'])).toBe(0);
  });

  it('unieważnienie nie jest zmianą ŻADNEGO pola', () => {
    // `void` nie rusza wartości, tylko to, czy zdarzenie w ogóle obowiązuje - a wiersz
    // unieważniony i tak znika z osi, więc nie ma przy czym zapalić plakietki.
    const events = [...base(), correction('landing-1', { action: 'void' })];

    expect(fieldChanges(events, 'landing-1', ['time'])).toBe(0);
  });

  it('poprawki dwóch różnych zdarzeń się nie mieszają', () => {
    const events = [
      ...base(),
      correction('landing-1', { action: 'retime', newTime: at(9, 44) }, at(11, 0), 'c-1'),
      correction('preflight-1', { action: 'amend', fields: { notes: 'Inna.' } }, at(11, 2), 'c-2'),
    ];

    expect(fieldChanges(events, 'landing-1', ['time'])).toBe(1);
    expect(fieldChanges(events, 'preflight-1', ['time'])).toBe(0);
  });

  it('brak adresu daje zero, a nie wyjątek', () => {
    // Sesja bez preflightu w strumieniu - ekran ma wtedy po prostu nie rysować plakietki.
    expect(fieldChanges(base(), null, ['notes'])).toBe(0);
  });
});
