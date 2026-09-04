/**
 * UZ Aero - KONTEKST ZGŁOSZENIA BŁĘDU (issue #87).
 *
 * Pod obserwacją jedna własność i jej konsekwencje: **`context` i `rows` powstają
 * z jednego wywołania**, bo napis „Dołączamy automatycznie" nad listą jest obietnicą.
 * Lista, która pokazuje co innego, niż telefon wyśle, jest w narzędziu do zgłaszania
 * błędów gorsza niż brak listy.
 */

import {
  bugPlaceLabel,
  buildBugContext,
  routeLabel,
  type BugContextInput,
} from '../ui/components/bug/bugContext';

const AT = Date.UTC(2026, 8, 4, 9, 41, 7);

const input = (over: Partial<BugContextInput> = {}): BugContextInput => ({
  place: { route: 'Stats', sheet: null },
  release: {
    appVersion: '1.4.0',
    platform: 'android',
    osVersion: '14',
    deviceModel: 'Pixel 7a',
    schemaVersion: 8,
  },
  sync: { state: 'synced', outboxCount: 0, lastSyncAt: Date.UTC(2026, 8, 4, 9, 38), lastAttemptAt: null },
  operation: {
    sessionUuid: 'S1',
    signature: 'SP-AXA/2026-09-04/TMK/2',
    aircraftId: 'a-uuid',
    aircraftReg: 'SP-AXA',
    operation: 'Skoki',
    engineRunning: true,
    flights: 3,
    closed: false,
  },
  pilot: { id: 'p-uuid', code: 'TMK', name: 'Tomasz Małkiewicz' },
  theme: 'night',
  at: AT,
  ...over,
});

const rowOf = (view: ReturnType<typeof buildBugContext>, label: string): string | undefined =>
  view.rows.find((r) => r.label === label)?.value;

describe('etykieta miejsca', () => {
  it('trasa dostaje ludzki napis z numerem ekranu, a nieznana - własną nazwę', () => {
    expect(routeLabel('Stats')).toBe('OPERACJA (10)');
    // Nowy ekran ma być WIDOCZNY pod swoją nazwą, a nie schowany pod „nieznany":
    // zgłoszenie z ekranu, którego nie ma w mapie, i tak musi dać się umiejscowić.
    expect(routeLabel('ManualFlightStep9')).toBe('ManualFlightStep9');
    expect(routeLabel(null)).toBe('NIEZNANY EKRAN');
  });

  it('arkusz DOKLEJA się do ekranu, zamiast go zastępować', () => {
    // Sam tytuł arkusza nie mówi, w którym miejscu aplikacji pilot stał - ten sam
    // arkusz korekty otwiera się z kilku ekranów.
    expect(bugPlaceLabel({ route: 'Stats', sheet: 'KOREKTA ODCZYTU' })).toBe(
      'OPERACJA (10) · arkusz KOREKTA ODCZYTU',
    );
    expect(bugPlaceLabel({ route: 'Stats', sheet: '   ' })).toBe('OPERACJA (10)');
  });
});

describe('kontekst zgłoszenia', () => {
  it('to, co widzi pilot, i to, co jedzie na serwer, opisuje TĘ SAMĄ chwilę', () => {
    const view = buildBugContext(input());

    expect(view.screen).toBe('OPERACJA (10)');
    expect(rowOf(view, 'Miejsce')).toBe('OPERACJA (10)');
    expect(view.context.screenLabel).toBe(view.screen);

    expect(rowOf(view, 'Operacja')).toBe('SP-AXA/2026-09-04/TMK/2');
    expect(view.context.signature).toBe('SP-AXA/2026-09-04/TMK/2');
    expect(view.sessionUuid).toBe('S1');
    expect(view.context.sessionUuid).toBe('S1');
  });

  it('niesie wydanie, urządzenie, motyw i stan łączności - bez pytania pilota', () => {
    const view = buildBugContext(input());

    expect(rowOf(view, 'Aplikacja')).toBe('1.4.0');
    expect(rowOf(view, 'Telefon')).toBe('Pixel 7a · android 14 · motyw NIGHT');
    expect(rowOf(view, 'Synchronizacja')).toBe('kolejka 0 · ostatnia 09:38 UTC');
    expect(rowOf(view, 'Czas zgłoszenia')).toBe('2026-09-04 09:41:07 UTC');

    expect(view.context).toMatchObject({
      appVersion: '1.4.0',
      platform: 'android',
      osVersion: '14',
      deviceModel: 'Pixel 7a',
      schemaVersion: 8,
      theme: 'night',
      engineRunning: true,
      flights: 3,
      reportedAt: new Date(AT).toISOString(),
    });
  });

  it('stan łączności ODCHYLONY nazywa się w wierszu, stan domyślny nie', () => {
    // Reguła SyncChipa (issue #12): „zsynchronizowano" jest stanem domyślnym, więc
    // napis o nim przy każdym zgłoszeniu niczego by nie odróżniał.
    expect(rowOf(buildBugContext(input()), 'Synchronizacja')).not.toMatch(/offline|stoi/);

    const offline = buildBugContext(
      input({ sync: { state: 'offline', outboxCount: 3, lastSyncAt: null, lastAttemptAt: AT } }),
    );
    expect(rowOf(offline, 'Synchronizacja')).toBe('offline · kolejka 3 · nigdy nie wysłano');

    const blocked = buildBugContext(
      input({ sync: { state: 'blocked', outboxCount: 2, lastSyncAt: null, lastAttemptAt: AT } }),
    );
    expect(rowOf(blocked, 'Synchronizacja')).toContain('sync stoi');
  });

  it('bez operacji nie ma wierszy o operacji - „Operacja -" byłoby wierszem o niczym', () => {
    const view = buildBugContext(
      input({
        place: { route: 'MyDay', sheet: null },
        operation: {
          sessionUuid: null,
          signature: null,
          aircraftId: null,
          aircraftReg: null,
          operation: null,
          engineRunning: false,
          flights: 0,
          closed: false,
        },
      }),
    );

    expect(rowOf(view, 'Operacja')).toBeUndefined();
    expect(rowOf(view, 'Samolot · zadanie')).toBeUndefined();
    // …ale pilot, wydanie i czas zostają: bez nich zgłoszenie nie ma adresu.
    expect(rowOf(view, 'Pilot')).toBe('TMK · Tomasz Małkiewicz');
    expect(view.sessionUuid).toBeNull();
  });

  it('operacja bez sygnatury pokazuje uuid, a maszyna spoza cache - swój identyfikator', () => {
    // Sygnatury nie da się złożyć przed uruchomieniem silnika (issue #68), a znaku
    // maszyny - bez cache floty. Zgłoszenie musi wtedy podać COKOLWIEK adresowalnego,
    // bo bez tego administrator nie znajdzie operacji, o której mowa.
    const view = buildBugContext(
      input({
        operation: {
          sessionUuid: 'S9',
          signature: null,
          aircraftId: 'a-uuid',
          aircraftReg: null,
          operation: null,
          engineRunning: false,
          flights: 0,
          closed: false,
        },
      }),
    );

    expect(rowOf(view, 'Operacja')).toBe('S9');
    expect(rowOf(view, 'Samolot · zadanie')).toBe('a-uuid');
  });

  it('pilot bez profilu z cache jedzie samym kodem, a bez kodu - identyfikatorem', () => {
    const noName = buildBugContext(input({ pilot: { id: 'p-uuid', code: 'TMK', name: null } }));
    expect(rowOf(noName, 'Pilot')).toBe('TMK');

    const raw = buildBugContext(input({ pilot: { id: 'p-uuid', code: null, name: null } }));
    expect(rowOf(raw, 'Pilot')).toBe('p-uuid');
  });
});
