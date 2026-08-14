/**
 * UZ Aero — test NOTATEK SESJI (ekran 10, issue #40 pkt 5).
 *
 * Zgłoszenie brzmiało krótko: „brakuje pola z dodanymi notatkami". Tekst wpisany przez
 * pilota — przy zadaniu (02e) albo przy wpisie ręcznym (08, 15) — nie wracał do niego
 * nigdzie; widział go tylko administrator w panelu.
 *
 * Test pilnuje trzech rzeczy: OBA źródła trafiają do jednej listy, kolejność jest
 * chronologiczna, a pusty tekst nie udaje notatki (bo karta pojawia się na ekranie
 * wtedy i tylko wtedy, gdy lista nie jest pusta).
 */

import {
  missingSessionNote,
  noteTargetUuid,
  sessionNotes,
} from '../ui/screens/logic/sessionNotes';
import { projectSession } from '../domain';
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

/** Sesja z notatką do zadania i jednym wpisem ręcznym z uwagami. */
function sessionEvents(over: { taskNote?: string | null; manualNote?: string | null } = {}): Event[] {
  seq = 0;
  return [
    event('session_claim', at(8, 4), { mode: 'free' }),
    event('preflight_confirm', at(8, 6), {
      operation: 'skoki',
      departureIcao: 'EPZG',
      reading: { fuelL: 150, mh: 1234.5 },
      notes: over.taskNote === undefined ? 'Drugi zbiornik nie trzyma wskazania.' : over.taskNote,
    }),
    event('engine_start', at(8, 12), {}),
    event(
      'manual_log_entry',
      at(9, 12),
      {
        takeoff: at(9, 12),
        notes:
          over.manualNote === undefined ? 'Start dopisany z pamięci — brak fixa.' : over.manualNote,
      },
      'manual-1',
    ),
    event('engine_stop', at(9, 55), {}),
  ];
}

function notes(events: Event[] = sessionEvents()) {
  return sessionNotes(projectSession(events), events);
}

describe('notatki sesji', () => {
  it('zbiera notatkę z zadania i uwagi wpisu ręcznego w jednej liście', () => {
    expect(notes().map((note) => `${note.when ?? '—'} — ${note.text}`)).toEqual([
      '— — Drugi zbiornik nie trzyma wskazania.',
      'Wpis ręczny · 09:12 — Start dopisany z pamięci — brak fixa.',
    ]);
  });

  it('notatka sesji NIE MA stempla — miałby opisywać godzinę preflightu, nie ją', () => {
    // Zgłoszenie z urządzenia (2026-08-14): przy notatce świeciło „Zadanie · 08:06",
    // czyli czas POTWIERDZENIA zadania. Notatka sesji jest jedna, więc stempel niczego
    // nie rozróżniał, a po pierwszej poprawce treści zaczynał wprost kłamać.
    const sesyjna = notes().find((note) => note.kind === 'session');

    expect(sesyjna?.when).toBeNull();
  });

  it('uwaga wpisu ręcznego stempel MA — jest ich wiele i trzeba je rozróżnić', () => {
    const wpis = notes().find((note) => note.kind === 'entry');

    expect(wpis?.when).toBe('Wpis ręczny · 09:12');
  });

  it('notatka niesie uuid zdarzenia jako klucz listy', () => {
    expect(notes().map((note) => note.id)).toEqual(['preflight', 'manual-1']);
  });

  it('sesja bez ani jednej notatki daje pustą listę — ekran nie rysuje wtedy karty', () => {
    expect(notes(sessionEvents({ taskNote: null, manualNote: null }))).toEqual([]);
  });

  it('same spacje to nie notatka', () => {
    // Pole jest wolnym tekstem, więc dochodzą do niego spacje z klawiatury. Wiersz
    // z pustą treścią wyglądałby jak utracona dana.
    expect(notes(sessionEvents({ taskNote: '   ', manualNote: '\n' }))).toEqual([]);
  });

  it('kolejność jest chronologiczna — także gdy wpis ręczny opisuje wcześniejszą godzinę', () => {
    // Wpis po fakcie potrafi nieść czas sprzed przejęcia (pilot odtwarza lot z pamięci).
    // Lista czyta się jak reszta ekranu: w czasie sesji, a nie w czasie wpisywania.
    const wczesny = sessionEvents().map((e) =>
      e.uuid === 'manual-1' ? ({ ...e, deviceTime: at(7, 0), gpsTime: at(7, 0) } as Event) : e,
    );

    expect(notes(wczesny).map((note) => note.id)).toEqual(['manual-1', 'preflight']);
  });
});

/**
 * DOPISANIE notatki (zgłoszenie z urządzenia, 2026-08-14).
 *
 * Karta „Notatki" pojawia się w trybie ODCZYTU tylko z treścią (issue #40) — i to
 * zostaje. Ale w trybie EDYCJI ta sama reguła odbierała jedyne wejście: sesja bez
 * notatki nie miała karty, więc nie miała jak notatki dostać. Adres celu musi więc
 * istnieć NIEZALEŻNIE od tego, czy notatka już jest.
 */
describe('cel dopisania notatki', () => {
  it('istnieje także wtedy, gdy notatek nie ma ANI JEDNEJ', () => {
    const puste = sessionEvents({ taskNote: null, manualNote: null });
    expect(notes(puste)).toHaveLength(0);

    const target = noteTargetUuid(puste);
    expect(target).not.toBeNull();
    expect(puste.find((e) => e.uuid === target)?.type).toBe('preflight_confirm');
  });

  it('jest tym samym zdarzeniem, które niesie notatkę z zadania', () => {
    const events = sessionEvents();
    const fromTask = notes(events).find((n) => n.id === 'preflight');

    expect(fromTask?.targetUuid).toBe(noteTargetUuid(events));
  });

  it('sesja bez preflightu nie ma czego adresować — ołówka wtedy nie ma', () => {
    const bezPreflightu = sessionEvents().filter((e) => e.type !== 'preflight_confirm');
    expect(noteTargetUuid(bezPreflightu)).toBeNull();
  });

  it('dopisanie jest możliwe TYLKO przy braku notatki sesji', () => {
    // Druga połowa tego samego zgłoszenia: przy istniejącej notatce wiersz „Dodaj
    // notatkę do sesji" obiecywał drugą, a naprawdę nadpisałby pierwszą — notatka
    // sesji to JEDNO pole w payloadzie preflightu.
    expect(missingSessionNote(notes())).toBe(false);
    expect(missingSessionNote(notes(sessionEvents({ taskNote: null })))).toBe(true);
  });

  it('uwagi wpisów ręcznych nie zamykają drogi do notatki sesji', () => {
    // To dwa różne byty: uwaga należy do SWOJEGO wpisu i jest ich tyle, ile wpisów.
    // Gdyby liczyła się jak notatka sesji, sesja z wpisem ręcznym nie miałaby jak
    // dostać notatki własnej.
    const tylkoWpis = notes(sessionEvents({ taskNote: null }));

    expect(tylkoWpis).toHaveLength(1);
    expect(missingSessionNote(tylkoWpis)).toBe(true);
  });
});
