/**
 * UZ Aero - test NOTATEK SESJI (ekran 10, issue #40 pkt 5).
 *
 * Zgłoszenie brzmiało krótko: „brakuje pola z dodanymi notatkami". Tekst wpisany przez
 * pilota - przy zadaniu (02e) albo przy wpisie ręcznym (08, 15) - nie wracał do niego
 * nigdzie; widział go tylko administrator w panelu.
 *
 * Test pilnuje trzech rzeczy: OBA źródła trafiają do jednej listy, kolejność jest
 * chronologiczna, a pusty tekst nie udaje notatki (bo karta pojawia się na ekranie
 * wtedy i tylko wtedy, gdy lista nie jest pusta).
 */

import {
  missingSessionNote,
  noteChanges,
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
    event(
      'preflight_confirm',
      at(8, 6),
      {
        operation: 'skoki',
        departureIcao: 'EPZG',
        reading: { fuelL: 150, mh: 1234.5 },
        notes: over.taskNote === undefined ? 'Drugi zbiornik nie trzyma wskazania.' : over.taskNote,
      },
      'preflight-1',
    ),
    event('engine_start', at(8, 12), {}),
    event(
      'manual_log_entry',
      at(9, 12),
      {
        takeoff: at(9, 12),
        notes:
          over.manualNote === undefined ? 'Start dopisany z pamięci - brak fixa.' : over.manualNote,
      },
      'manual-1',
    ),
    event('engine_stop', at(9, 55), {}),
  ];
}

function notes(events: Event[] = sessionEvents()) {
  return sessionNotes(projectSession(events), events);
}

/** Korekta wartości - `amend` z issue #43. Czas poprawki nie musi mieścić się w sesji. */
function amend(targetUuid: string, fields: object, when = at(11, 0)): Event {
  return event('event_correction', when, { targetUuid, action: 'amend', fields } as never);
}

describe('notatki operacji', () => {
  it('zbiera notatkę z zadania i uwagi wpisu ręcznego w jednej liście', () => {
    expect(notes().map((note) => `${note.when ?? '-'} - ${note.text}`)).toEqual([
      '- - Drugi zbiornik nie trzyma wskazania.',
      'Wpis ręczny · 09:12 - Start dopisany z pamięci - brak fixa.',
    ]);
  });

  it('notatka operacji NIE MA stempla - miałby opisywać godzinę preflightu, nie ją', () => {
    // Zgłoszenie z urządzenia (2026-08-14): przy notatce świeciło „Zadanie · 08:06",
    // czyli czas POTWIERDZENIA zadania. Notatka sesji jest jedna, więc stempel niczego
    // nie rozróżniał, a po pierwszej poprawce treści zaczynał wprost kłamać.
    const sesyjna = notes().find((note) => note.kind === 'session');

    expect(sesyjna?.when).toBeNull();
  });

  it('uwaga wpisu ręcznego stempel MA - jest ich wiele i trzeba je rozróżnić', () => {
    const wpis = notes().find((note) => note.kind === 'entry');

    expect(wpis?.when).toBe('Wpis ręczny · 09:12');
  });

  it('notatka niesie uuid zdarzenia jako klucz listy', () => {
    expect(notes().map((note) => note.id)).toEqual(['preflight', 'manual-1']);
  });

  it('operacja bez ani jednej notatki daje pustą listę - ekran nie rysuje wtedy karty', () => {
    expect(notes(sessionEvents({ taskNote: null, manualNote: null }))).toEqual([]);
  });

  it('same spacje to nie notatka', () => {
    // Pole jest wolnym tekstem, więc dochodzą do niego spacje z klawiatury. Wiersz
    // z pustą treścią wyglądałby jak utracona dana.
    expect(notes(sessionEvents({ taskNote: '   ', manualNote: '\n' }))).toEqual([]);
  });

  it('kolejność jest chronologiczna - także gdy wpis ręczny opisuje wcześniejszą godzinę', () => {
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
 * Karta „Notatki" pojawia się w trybie ODCZYTU tylko z treścią (issue #40) - i to
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

  it('operacja bez preflightu nie ma czego adresować - ołówka wtedy nie ma', () => {
    const bezPreflightu = sessionEvents().filter((e) => e.type !== 'preflight_confirm');
    expect(noteTargetUuid(bezPreflightu)).toBeNull();
  });

  it('dopisanie jest możliwe TYLKO przy braku notatki operacji', () => {
    // Druga połowa tego samego zgłoszenia: przy istniejącej notatce wiersz „Dodaj
    // notatkę do sesji" obiecywał drugą, a naprawdę nadpisałby pierwszą - notatka
    // sesji to JEDNO pole w payloadzie preflightu.
    expect(missingSessionNote(notes())).toBe(false);
    expect(missingSessionNote(notes(sessionEvents({ taskNote: null })))).toBe(true);
  });

  it('nie ma po co dopisywać notatki, którą ktoś już poprawiał', () => {
    // Sesja z poprawioną notatką ma notatkę - inaczej „popr." nie miałoby czego opisywać.
    const poprawiona = [...sessionEvents(), amend('preflight-1', { notes: 'Po poprawce.' })];

    expect(missingSessionNote(notes(poprawiona))).toBe(false);
  });

  it('uwagi wpisów ręcznych nie zamykają drogi do notatki operacji', () => {
    // To dwa różne byty: uwaga należy do SWOJEGO wpisu i jest ich tyle, ile wpisów.
    // Gdyby liczyła się jak notatka sesji, sesja z wpisem ręcznym nie miałaby jak
    // dostać notatki własnej.
    const tylkoWpis = notes(sessionEvents({ taskNote: null }));

    expect(tylkoWpis).toHaveLength(1);
    expect(missingSessionNote(tylkoWpis)).toBe(true);
  });
});

/**
 * ŚLAD POPRAWKI przy notatce (zgłoszenie z urządzenia, 2026-08-14).
 *
 * Notatka dała się poprawić, ale nic o tym nie mówiła: pilot czytał tekst nie wiedząc,
 * że to już nie jest to, co wpisał, i nie miał jak dojść do historii zmian. Licznik
 * `changes` zasila JEDNO i drugie - plakietkę „popr." przy wierszu i wejście w historię
 * w arkuszu - więc nie mają jak powiedzieć czegoś innego.
 */
describe('ślad poprawki notatki', () => {
  it('świeżo napisana notatka nie ma żadnych zmian', () => {
    expect(notes().map((note) => note.changes)).toEqual([0, 0]);
  });

  it('poprawka treści liczy się przy TEJ notatce', () => {
    const events = [...sessionEvents(), amend('preflight-1', { notes: 'Po poprawce.' })];
    const lista = notes(events);

    expect(lista.find((n) => n.kind === 'session')?.changes).toBe(1);
    expect(lista.find((n) => n.kind === 'session')?.text).toBe('Po poprawce.');
    // Uwaga wpisu ręcznego to osobny tekst w osobnym zdarzeniu - poprawka preflightu
    // nie ma jak jej dotknąć.
    expect(lista.find((n) => n.kind === 'entry')?.changes).toBe(0);
  });

  it('poprawka ODCZYTU nie jest poprawką notatki', () => {
    // Sedno filtra po polu: `preflight_confirm` niesie paliwo, licznik, notatkę i Duala
    // w JEDNYM payloadzie. Bez zawężenia notatka świeciłaby „popr." po zmianie paliwa.
    const events = [...sessionEvents(), amend('preflight-1', { fuelL: 148 })];

    expect(notes(events).find((n) => n.kind === 'session')?.changes).toBe(0);
  });

  it('kolejne poprawki dokładają się do licznika', () => {
    const events = [
      ...sessionEvents(),
      amend('preflight-1', { notes: 'Pierwsza poprawka.' }, at(11, 0)),
      amend('preflight-1', { notes: 'Druga poprawka.' }, at(12, 0)),
    ];

    expect(notes(events).find((n) => n.kind === 'session')?.changes).toBe(2);
  });

  it('skasowanie notatki jest zmianą, ale nie ma już czego opisać', () => {
    // `notes: null` KASUJE notatkę - wiersz znika z listy razem z plakietką. Ślad
    // zostaje w rejestrze i widać go w historii zmian preflightu.
    const events = [...sessionEvents({ manualNote: null }), amend('preflight-1', { notes: null })];

    expect(notes(events)).toEqual([]);
  });

  it('uwaga wpisu ręcznego ma własny licznik', () => {
    const events = [...sessionEvents(), amend('manual-1', { notes: 'Poprawiona uwaga.' })];
    const lista = notes(events);

    expect(lista.find((n) => n.kind === 'entry')?.changes).toBe(1);
    expect(lista.find((n) => n.kind === 'session')?.changes).toBe(0);
  });

  it('noteChanges bez adresu daje zero, a nie wyjątek', () => {
    // Sesja bez preflightu w strumieniu - `noteTargetUuid` zwraca wtedy `null`.
    expect(noteChanges(sessionEvents(), null)).toBe(0);
  });
});
