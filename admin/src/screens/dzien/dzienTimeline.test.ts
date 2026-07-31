/**
 * UZ Aero — panel: oś zdarzeń karty dnia (moduł czysty).
 *
 * Trzy reguły, których nie widać w typach i które są całym sensem tego ekranu:
 *  1. panel NIE PRZESORTOWUJE osi — porządek chronologiczny nadał serwer,
 *  2. zdarzenie unieważnione jest PRZEKREŚLONE, nie ukryte,
 *  3. `voided` i `correctedTime` czytamy z odpowiedzi, a nie odtwarzamy z payloadów.
 */

import type { Event } from '@uzaero/domain';
import { describe, expect, it } from 'vitest';

import type { TimelineEntryDto } from '../../api/dto';
import { timelineRows, timelineSummary } from './dzienTimeline';

const DAY = Date.UTC(2026, 6, 30);
const at = (h: number, m: number, s = 0): number => DAY + ((h * 60 + m) * 60 + s) * 1000;

function event(over: Partial<Event> & Pick<Event, 'type' | 'payload'>): Event {
  return {
    uuid: `e-${over.type}-${String(over.gpsTime ?? 0)}`,
    sessionUuid: 'sess-1',
    aircraftId: 'SP-KLM',
    picId: 'AWR',
    dualId: null,
    deviceTime: at(6, 0),
    gpsTime: at(6, 0),
    schemaVersion: 1,
    syncedAt: null,
    ...over,
  } as Event;
}

const entry = (e: Event, over: Partial<TimelineEntryDto> = {}): TimelineEntryDto => ({
  event: e,
  voided: false,
  correctedTime: null,
  ...over,
});

const takeoff = (time: number, uuid = `to-${time}`) =>
  event({ type: 'takeoff', payload: { method: 'auto' }, gpsTime: time, deviceTime: time, uuid } as Partial<Event> & Pick<Event, 'type' | 'payload'>);

describe('timelineRows — porządek', () => {
  it('ODDAJE WIERSZE W KOLEJNOŚCI, W KTÓREJ PRZYSZŁY — nawet gdy czasy są nie po kolei', () => {
    // Porządek chronologiczny nadaje serwer (`eventTimeline.ts`: sort po czasie
    // zdarzenia, GPS przed zegarem telefonu). Drugie sortowanie tutaj UKRYŁOBY regres,
    // gdyby tamto się zepsuło — a to właśnie ten regres zdarzył się w produkcji:
    // cała paczka ma identyczny `received_at`, więc kolejność z bazy była losowa.
    const entries = [
      entry(takeoff(at(9, 0), 'trzeci')),
      entry(takeoff(at(7, 0), 'pierwszy')),
      entry(takeoff(at(8, 0), 'drugi')),
    ];

    expect(timelineRows(entries).map((row) => row.uuid)).toEqual(['trzeci', 'pierwszy', 'drugi']);
  });

  it('czas w kolumnie to czas ZAPISANY, w konwencji domeny (GPS przed zegarem)', () => {
    const gps = timelineRows([
      entry(event({ type: 'landing', payload: { method: 'auto' }, gpsTime: at(8, 26, 12), deviceTime: at(8, 38, 12) })),
    ])[0]!;
    expect(gps.time).toBe('08:26:12');

    // Brak fixa → czas zdarzenia spada na zegar urządzenia, dokładnie jak w projekcji.
    const device = timelineRows([
      entry(event({ type: 'landing', payload: { method: 'auto' }, gpsTime: null, deviceTime: at(13, 13, 33) })),
    ])[0]!;
    expect(device.time).toBe('13:13:33');
  });

  it('czas ma SEKUNDY — rejestr czyta się inaczej niż arkusz', () => {
    // Różnica między `landing 08:14:09` a `landing 08:14:52` rozstrzyga, które
    // zdarzenie unieważniła korekta. Obcięcie sekund odbiera osi jej sens.
    expect(timelineRows([entry(takeoff(at(8, 14, 9)))])[0]!.time).toBe('08:14:09');
  });
});

describe('timelineRows — zdarzenie unieważnione', () => {
  it('ZOSTAJE NA OSI, przekreślone — nigdy nie znika', () => {
    // Rejestr jest append-only i to właśnie ten wiersz tłumaczy, dlaczego liczby dnia
    // różnią się od tego, co zapisał telefon. Ukrycie go byłoby najgorszą możliwą
    // uprzejmością narzędzia, którego zadaniem jest pokazywać rejestr takim, jaki jest.
    const rows = timelineRows([
      entry(takeoff(at(8, 2), 'zostaje')),
      entry(takeoff(at(8, 14), 'fałszywe'), { voided: true }),
    ]);

    expect(rows).toHaveLength(2);
    const voided = rows[1]!;
    expect(voided.voided).toBe(true);
    expect(voided.badge).toBe('void');
    expect(voided.meta[0]).toContain('UNIEWAŻNIONE');
    expect(voided.meta[0]).toContain('nie wchodzi do wyliczeń');
  });
});

describe('timelineRows — zdarzenie poprawione (`retime`)', () => {
  it('pokazuje OBA czasy i mówi, który liczy projekcja', () => {
    const row = timelineRows([
      entry(takeoff(at(9, 18)), { correctedTime: at(9, 30) }),
    ])[0]!;

    // Wiersz NIE jest przekreślony — `retime` poprawia czas, nie unieważnia faktu.
    expect(row.voided).toBe(false);
    // Kolumna pokazuje czas ZAPISANY, bo to po nim serwer ułożył oś.
    expect(row.time).toBe('09:18:00');
    const note = row.meta[0]!;
    expect(note).toContain('09:30:00');
    expect(note).toContain('09:18:00');
    expect(note).toContain('projekcja liczy dzień z tą wartością');
  });
});

describe('timelineRows — korekta jako zwykły wpis', () => {
  it('sama `event_correction` stoi na osi i wskazuje swój cel', () => {
    // Poprawia się fakt, nie poprawkę: korekta nie bywa unieważniona i nie znika.
    const row = timelineRows([
      entry(
        event({
          type: 'event_correction',
          payload: { targetUuid: '5e2b91c7-ab34', action: 'void' },
          gpsTime: at(18, 22, 5),
          deviceTime: at(18, 22, 5),
        }),
      ),
    ])[0]!;

    expect(row.name).toBe('event_correction');
    expect(row.badge).toBe('korekta');
    expect(row.meta.join(' ')).toContain('5e2b91c7-ab34');
    expect(row.meta.join(' ')).toContain('niczego nie nadpisuje');
  });

  it('`retime` niesie nowy czas w opisie korekty', () => {
    const row = timelineRows([
      entry(
        event({
          type: 'event_correction',
          payload: { targetUuid: 'cel', action: 'retime', newTime: at(13, 1, 33) },
        }),
      ),
    ])[0]!;

    expect(row.meta.join(' ')).toContain('13:01:33');
  });
});

describe('timelineRows — payload w opisie', () => {
  it('preflight niesie odczyt W FORMACIE LICZNIKA i log korekt odczytu', () => {
    const row = timelineRows([
      entry(
        event({
          type: 'preflight_confirm',
          payload: {
            operation: 'skoki',
            departureIcao: 'EPRA',
            arrivalIcao: 'EPRA',
            dutyStart: at(5, 45),
            reading: { fuelL: 780, mh: 3902.1 },
            client: 'SKY CAMP',
            mhFormat: 'decimal',
            corrections: [
              { field: 'mh', from: 3901.4, to: 3902.1, reason: 'licznik pokazuje więcej niż przekazanie' },
            ],
          },
        }),
      ),
    ])[0]!;

    const text = row.meta.join(' | ');
    expect(text).toContain('780 L');
    expect(text).toContain('3902.1');
    expect(text).toContain('SKY CAMP');
    // Korekta odczytu jest LOGIEM, nie nadpisaniem — widać oba końce i powód.
    expect(text).toContain('3901.4 → 3902.1');
    expect(text).toContain('licznik pokazuje więcej niż przekazanie');
  });

  it('zrzut bez fixa GPS mówi „brak wysokości", a nie zero', () => {
    const row = timelineRows([
      entry(
        event({
          type: 'drop',
          payload: {
            dropNumber: 9,
            altitudeFt: null,
            jumpers: { tandem: 2, aff: 1, solo: 2 },
            client: 'SKY CAMP',
          },
        }),
      ),
    ])[0]!;

    const text = row.meta.join(' | ');
    expect(text).toContain('brak (bez fixa GPS)');
    expect(text).toContain('= 5');
  });

  it('wpis ręczny tłumaczy, dlaczego stoi w tym miejscu osi', () => {
    const row = timelineRows([
      entry(
        event({
          type: 'manual_log_entry',
          payload: {
            takeoff: at(12, 35),
            landing: at(12, 59),
            offBlock: null,
            onBlock: null,
            notes: 'brak fixa GPS nad strefą',
          },
        }),
      ),
    ])[0]!;

    const text = row.meta.join(' | ');
    expect(text).toContain('12:35:00');
    expect(text).toContain('brak fixa GPS nad strefą');
    expect(text).toContain('sortuje po czasie zdarzenia, nie zapisu');
  });

  it('opis jest listą NAPISÓW — payload nigdy nie wraca jako znaczniki', () => {
    // Payloady pochodzą z telefonów i zawierają dowolne teksty wpisane przez pilota.
    // Ten moduł oddaje je jako zwykłe napisy, a komponent renderuje je jako dzieci
    // Reacta — nigdy przez `dangerouslySetInnerHTML`.
    const row = timelineRows([
      entry(
        event({
          type: 'manual_log_entry',
          payload: { takeoff: null, landing: null, notes: '<img src=x onerror=alert(1)>' },
        }),
      ),
    ])[0]!;

    expect(row.meta.every((line) => typeof line === 'string')).toBe(true);
    // Napis przechodzi DOSŁOWNIE, bez ucieczek i bez wycinania — to zadanie Reacta.
    expect(row.meta.join(' ')).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('timelineSummary', () => {
  it('liczy REJESTR, nie strumień efektywny', () => {
    // `state.eventCount` liczy zdarzenia PO nałożeniu korekt (bez unieważnionych
    // i bez samych korekt). Mockup pyta o rejestr — „84 zdarzenia, w tym 1 korekta"
    // — więc odpowiadamy o rejestrze. Obie liczby są poprawne i mówią o czym innym.
    const entries = [
      entry(takeoff(at(8, 2), 'a')),
      entry(takeoff(at(8, 14), 'b'), { voided: true }),
      entry(event({ type: 'event_correction', payload: { targetUuid: 'b', action: 'void' } })),
    ];

    expect(timelineSummary(entries)).toBe('3 zdarzenia, w tym 1 korekta i 1 unieważnione');
  });

  it('dzień bez korekt nie dopisuje pustego ogona', () => {
    expect(timelineSummary([entry(takeoff(at(8, 0), 'a'))])).toBe('1 zdarzenie');
    expect(timelineSummary([])).toBe('0 zdarzeń');
  });
});
