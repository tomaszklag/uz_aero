/**
 * UZ Aero - test karty OLEJU na ekranie operacji (issue #70).
 *
 * Karta niesie SAME FAKTY (pomiar przy przejęciu, dolewki, stan po nich) - zużycia
 * jednej operacji nie da się policzyć, bo zdanie samolotu oleju nie mierzy (issue #60).
 * Testy pilnują trzech granic:
 *  • zero pokazuje się TYLKO przy pomiarze - operacja bez śladu oleju dostaje kreski,
 *    a nie „0,0 L" wzięte znikąd;
 *  • dolewka bez pomiaru zostawia sumę pustą (dolewka poziomu nie zna);
 *  • licznik dolewek liczy się ze strumienia EFEKTYWNEGO - dolewka unieważniona
 *    korektą nie wchodzi do sumy w projekcji, więc nie może wchodzić do licznika.
 */

import { oilCard } from '../ui/screens/logic/sessionOil';
import { projectSession } from '../domain';
import type { Event, EventOf, EventType } from '../domain';

const DAY = Date.UTC(2026, 8, 1);
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

/** Operacja z kompletem oleju: pomiar + dolewka przy przejęciu, dolewka z kokpitu. */
function oilSession(preflightOil: { oilL?: number | null; oilAddedL?: number | null }): Event[] {
  seq = 0;
  return [
    event('session_claim', at(8, 4), { mode: 'free' }),
    event('preflight_confirm', at(8, 4), {
      operation: 'skoki',
      departureIcao: 'EPZG',
      reading: { fuelL: 150, mh: 1234.5 },
      mhFormat: 'hhmm',
      ...preflightOil,
    }),
    event('engine_start', at(8, 12), {}),
    event('engine_stop', at(9, 55), {}),
    event('day_close', at(10, 20), { finalReading: { fuelL: 120, mh: 1236.1 } }),
  ];
}

function card(events: Event[]) {
  return oilCard(projectSession(events), events);
}

describe('karta oleju', () => {
  it('pomiar, dolewki i stan po nich - z licznikiem dolewek w etykiecie', () => {
    const events = oilSession({ oilL: 10.2, oilAddedL: 0.5 });
    events.splice(4, 0, event('oil_add', at(9, 58), { addedL: 0.5 }, 'oil-1'));

    const view = card(events);

    expect(view.rows).toEqual([
      { id: 'level', op: '', label: 'Pomiar przy przejęciu', value: '10,2 L' },
      { id: 'added', op: '+', label: 'Dolane · 2 dolewki', value: '1,0 L' },
    ]);
    expect(view.totalLabel).toBe('Po dolewkach');
    expect(view.totalValue).toBe('11,2 L');
    expect(view.totalTone).toBe('amber');
  });

  it('pomiar bez dolewki: zero jest odczytem, etykieta bez licznika', () => {
    const view = card(oilSession({ oilL: 10.2 }));

    expect(view.rows[0]!.value).toBe('10,2 L');
    expect(view.rows[1]).toEqual({ id: 'added', op: '+', label: 'Dolane', value: '0,0 L' });
    expect(view.totalValue).toBe('10,2 L');
  });

  it('operacja bez śladu oleju (sprzed modułu) dostaje kreski, nie zera', () => {
    const view = card(oilSession({}));

    expect(view.rows.map((row) => row.value)).toEqual(['-', '-']);
    expect(view.totalValue).toBe('-');
    // Kreska bez bursztynu: brak zapisu to zwykły stan starych danych, nie ostrzeżenie.
    expect(view.totalTone).toBe('neutral');
  });

  it('dolewka bez pomiaru (bagnet gorący) zostawia sumę pustą', () => {
    const view = card(oilSession({ oilAddedL: 0.5 }));

    expect(view.rows[0]!.value).toBe('-');
    expect(view.rows[1]).toEqual({ id: 'added', op: '+', label: 'Dolane · 1 dolewka', value: '0,5 L' });
    // Dolewka poziomu nie zna - suma „10,7" z powietrza byłaby gorsza od kreski.
    expect(view.totalValue).toBe('-');
  });

  it('dolewka unieważniona korektą wypada z licznika razem z sumą', () => {
    const events = oilSession({ oilL: 10.2 });
    events.splice(4, 0, event('oil_add', at(9, 58), { addedL: 0.5 }, 'oil-1'));
    events.push(
      event('event_correction', at(10, 30), { targetUuid: 'oil-1', action: 'void' }),
    );

    const view = card(events);

    // Suma w projekcji już dolewki nie widzi - licznik obok niej mówi to samo.
    expect(view.rows[1]).toEqual({ id: 'added', op: '+', label: 'Dolane', value: '0,0 L' });
    expect(view.totalValue).toBe('10,2 L');
  });

  it('dolewka dopisana korektą amend wchodzi do licznika', () => {
    const events = oilSession({ oilL: 10.2 });
    const preflight = events[1]!;
    events.push(
      event('event_correction', at(10, 30), {
        targetUuid: preflight.uuid,
        action: 'amend',
        fields: { oilAddedL: 0.5 },
      }),
    );

    const view = card(events);

    expect(view.rows[1]!.label).toBe('Dolane · 1 dolewka');
    expect(view.rows[1]!.value).toBe('0,5 L');
    expect(view.totalValue).toBe('10,7 L');
  });
});
