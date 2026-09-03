/**
 * UZ Aero - test OSI CZASU sesji (ekran 10, issue #38 pkt 7 i 8; issue #40 pkt 1, 3, 4, 6).
 *
 * Oś zastąpiła tabelę lotów i opisuje CAŁY bieg silnika - od issue #40 razem
 * z kołowaniem, bez kolumny ołówka i bez plakietki „RĘCZNIE".
 *
 * Scenariusz jest ten sam, co w mockupie 10: przejęcie 08:04, silnik 08:12 → 09:55,
 * dwa kołowania (08:16 i 09:08), dwa loty (08:20–09:01 i 09:12–09:47), dwa zrzuty,
 * zdanie 11:20.
 */

import { buildSessionAxis } from '../ui/screens/logic/sessionAxis';
import { projectSession } from '../domain';
import type { Event, EventOf, EventType, SessionState } from '../domain';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;

/** Zdarzenie w strumieniu sesji - nagłówek minimalny, tyle ile czyta projekcja. */
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
    dualId: 'AKO',
    deviceTime: time,
    gpsTime: time,
    schemaVersion: 1,
    syncedAt: null,
    payload,
  } as Event;
}

/** Kanoniczna sesja z mockupu 10 - dwa loty, dwa zrzuty, komplet odczytów. */
function sessionEvents(): Event[] {
  seq = 0;
  return [
    event('session_claim', at(8, 4), { mode: 'free' }),
    event('preflight_confirm', at(8, 4), {
      operation: 'skoki',
      departureIcao: 'EPZG',
      reading: { fuelL: 150, mh: 1234.5 },
      mhFormat: 'hhmm',
    }),
    event('engine_start', at(8, 12), {}, 'engine-on'),
    event('taxi', at(8, 16), { method: 'auto' }, 'taxi-1'),
    event('takeoff', at(8, 20), { method: 'auto' }, 'to-1'),
    event('drop', at(8, 52), {
      dropNumber: 1,
      jumpers: { tandem: 2, aff: 1, solo: 1 },
      altitudeFt: 12_800,
    }, 'drop-1'),
    event('landing', at(9, 1), { method: 'auto' }, 'ldg-1'),
    event('taxi', at(9, 8), { method: 'auto' }, 'taxi-2'),
    event('takeoff', at(9, 12), { method: 'manual' }, 'to-2'),
    event('drop', at(9, 33), {
      dropNumber: 2,
      jumpers: { tandem: 2, aff: 1, solo: 1 },
      altitudeFt: 12_600,
    }, 'drop-2'),
    event('landing', at(9, 47), { method: 'manual' }, 'ldg-2'),
    event('engine_stop', at(9, 55), {}, 'engine-off'),
    event('day_close', at(11, 20), { finalReading: { fuelL: 171, mh: 1234.5 + 95 / 60 } }),
  ];
}

function axis(events: Event[] = sessionEvents(), now = at(12, 0)) {
  return buildSessionAxis(projectSession(events), events, now);
}

describe('oś operacji', () => {
  it('idzie chronologicznie od przejęcia do zdania', () => {
    const { rows } = axis();

    expect(rows.map((row) => `${row.time} ${row.kind}`)).toEqual([
      '08:04 claim',
      '08:12 engineStart',
      '08:16 taxi',
      '08:20 takeoff',
      '08:52 drop',
      '09:01 landing',
      '09:08 taxi',
      '09:12 takeoff',
      '09:33 drop',
      '09:47 landing',
      '09:55 engineStop',
      '11:20 release',
    ]);
  });

  it('każdy wiersz zdarzenia niesie jego uuid', () => {
    const { rows } = axis();
    const byKind = (kind: string) => rows.filter((row) => row.kind === kind);

    expect(byKind('takeoff').map((row) => row.id)).toEqual(['to-1', 'to-2']);
    expect(byKind('landing').map((row) => row.id)).toEqual(['ldg-1', 'ldg-2']);
    expect(byKind('drop').map((row) => row.id)).toEqual(['drop-1', 'drop-2']);
    expect(byKind('taxi').map((row) => row.id)).toEqual(['taxi-1', 'taxi-2']);
    expect(byKind('engineStart')[0]!.id).toBe('engine-on');
  });

  it('oś nie niesie już ani ołówka, ani plakietki wpisu ręcznego (issue #40 pkt 1 i 6)', () => {
    // Sposób powstania zapisu i prawo do korekty przestały być sprawą tego ekranu:
    // korekta wychodzi przyciskiem „EDYTUJ DANE", a metoda zostaje w rejestrze.
    // Wiersz `to-2` jest w scenariuszu wpisem RĘCZNYM - i wygląda jak każdy inny.
    const { rows } = axis();

    for (const row of rows) {
      expect(row).not.toHaveProperty('manual');
      expect(row).not.toHaveProperty('correctable');
    }
  });

  it('kołowanie niesie samą godzinę - czasu trwania nie liczymy', () => {
    // „Ile trwało kołowanie" jest ciekawostką w rozliczeniu sesji: do bloku i tak
    // wchodzi cały bieg silnika. Czas zostaje w kokpicie, gdzie pilot patrzy na zegar
    // w trakcie przygotowania do startu.
    const taxi = axis().rows.filter((row) => row.kind === 'taxi');

    expect(taxi.map((row) => row.time)).toEqual(['08:16', '09:08']);
    expect(taxi.every((row) => row.duration == null && row.sub == null)).toBe(true);
  });

  it('czas lotu stoi przy lądowaniu, nie przy starcie', () => {
    const { rows } = axis();

    expect(rows.filter((row) => row.kind === 'landing').map((row) => row.duration)).toEqual([
      '00:41',
      '00:35',
    ]);
    expect(rows.filter((row) => row.kind === 'takeoff').every((row) => row.duration == null)).toBe(
      true,
    );
  });

  it('numer lotu idzie w prawą kolumnę i pada RAZ - przy starcie', () => {
    // Druga linia w połowie wierszy kosztowała wysokość, którą sesja skokowa zamienia
    // w przewijanie. Przy lądowaniu numeru nie ma: prawą kolumnę zajmuje tam czas lotu,
    // czyli liczba, po którą pilot sięga, a para start → lądowanie czyta się w pionie.
    // Podpis pod nazwą zostaje tam, gdzie jest OPISEM: odczyty na końcach osi i zrzut.
    const { rows } = axis();
    const flights = rows.filter((row) => row.kind === 'takeoff' || row.kind === 'landing');

    expect(flights.map((row) => `${row.kind} ${row.flight ?? '-'}`)).toEqual([
      'takeoff lot 1',
      'landing -',
      'takeoff lot 2',
      'landing -',
    ]);
    expect(flights.every((row) => row.sub == null)).toBe(true);
    expect(rows.find((row) => row.id === 'drop-1')!.flight).toBeNull();
    expect(rows.find((row) => row.kind === 'claim')!.flight).toBeNull();
  });

  it('końce osi niosą odczyty, do których odwołują się rachunki niżej', () => {
    const { rows } = axis();

    // „paliwo", nie „odczyt" (uwaga z urządzenia, 2026-09-03) - media nazwane.
    expect(rows.find((row) => row.kind === 'claim')!.sub).toBe('paliwo 150 L · 1234:30');
    expect(rows.find((row) => row.kind === 'release')!.sub).toBe('paliwo 171 L · 1236:05');
  });

  it('pomiar oleju wchodzi do podpisu przejęcia - zdanie oleju nie mierzy (issue #60)', () => {
    const withOil = sessionEvents().map((e) =>
      e.type === 'preflight_confirm'
        ? ({ ...e, payload: { ...e.payload, oilL: 8.2, oilAddedL: 1.0 } } as Event)
        : e,
    );
    const rows = axis(withOil).rows;
    // SAM pomiar zastany, bez dolewki (uwaga z urządzenia, 2026-09-03):
    // dolewka jest zdarzeniem przebiegu i ma na osi własny wiersz.
    expect(rows.find((row) => row.kind === 'claim')!.sub).toBe(
      'paliwo 150 L · 1234:30 · olej 8,2 L',
    );
    // zdanie samolotu zostaje bez oleju - bagnet tuż po locie kłamie
    expect(rows.find((row) => row.kind === 'release')!.sub).toBe('paliwo 171 L · 1236:05');

    // STARY STRUMIEŃ: dolewka z payloadu przejęcia dostaje własny wiersz jak `oil_add`
    // (uwaga z urządzenia, 2026-09-03: „nie doświetla się wpis z dolewką oleju przy
    // przejęciu") - zaraz za przejęciem, z celem korekty w przejęciu (10F).
    const claimIndex = rows.findIndex((row) => row.kind === 'claim');
    const legacy = rows[claimIndex + 1]!;
    expect(legacy.kind).toBe('oilAdd');
    expect(legacy.name).toBe('Dolewka oleju');
    expect(legacy.sub).toBe('+1,0 L');
    expect(legacy.targetUuid).toBe(
      withOil.find((e) => e.type === 'preflight_confirm')!.uuid,
    );
    expect(legacy.corrected).toBe(false);
  });

  it('nowy strumień: dolewka jako osobne oil_add - jeden wiersz, bez dublowania', () => {
    const preflightAt = sessionEvents().find((e) => e.type === 'preflight_confirm')!;
    const withOilAdd = [
      ...sessionEvents().map((e) =>
        e.type === 'preflight_confirm'
          ? ({ ...e, payload: { ...e.payload, oilL: 8.2 } } as Event)
          : e,
      ),
      {
        ...preflightAt,
        uuid: 'oil-add-1',
        type: 'oil_add',
        payload: { addedL: 1.0 },
        deviceTime: (preflightAt.gpsTime ?? preflightAt.deviceTime) + 30_000,
        gpsTime: (preflightAt.gpsTime ?? preflightAt.deviceTime) + 30_000,
      } as Event,
    ];
    const rows = axis(withOilAdd).rows;
    const oilRows = rows.filter((row) => row.kind === 'oilAdd');
    expect(oilRows).toHaveLength(1);
    expect(oilRows[0]!.targetUuid).toBe('oil-add-1');
    expect(oilRows[0]!.sub).toBe('+1,0 L');
  });

  it('zrzut niesie skład i wysokość; brak obu nie robi pustego podpisu', () => {
    const { rows } = axis();
    expect(rows.find((row) => row.id === 'drop-1')!.sub).toBe('4 skoczków · 12 800 ft');

    const bezSkladu = sessionEvents().map((e) =>
      e.uuid === 'drop-1'
        ? ({ ...e, payload: { dropNumber: 1, jumpers: null, altitudeFt: null } } as Event)
        : e,
    );
    expect(axis(bezSkladu).rows.find((row) => row.id === 'drop-1')!.sub).toBeNull();
  });

  it('lot w powietrzu nie znika z osi - brakuje mu tylko lądowania', () => {
    const wPowietrzu = sessionEvents().filter(
      (e) => e.uuid !== 'ldg-2' && e.uuid !== 'engine-off' && e.type !== 'day_close',
    );
    const { rows } = axis(wPowietrzu);

    expect(rows.filter((row) => row.kind === 'takeoff')).toHaveLength(2);
    expect(rows.filter((row) => row.kind === 'landing')).toHaveLength(1);
    expect(rows.some((row) => row.kind === 'release')).toBe(false);
  });

  it('przy identycznym stemplu decyduje porządek przyczynowy', () => {
    // Wpis ręczny potrafi dać startowi tę samą minutę, co uruchomieniu silnika.
    // Oś czytana z góry na dół nie może wtedy sugerować startu przed uruchomieniem.
    const rowne = sessionEvents().map((e) =>
      e.uuid === 'to-1' ? ({ ...e, deviceTime: at(8, 12), gpsTime: at(8, 12) } as Event) : e,
    );
    const kinds = axis(rowne).rows.map((row) => row.kind);

    expect(kinds.indexOf('engineStart')).toBeLessThan(kinds.indexOf('takeoff'));
  });
});

/**
 * ZDARZENIA NAZIEMNE (issue #44) - tankowanie, załadunek i zmiana załogi.
 *
 * Oś ich nie znała, a to był błąd, nie decyzja: rachunek paliwa na tym samym ekranie
 * mówi „dolane · 2 tankowania", arkusz 10H pozwala tankowanie DOPISAĆ, a wpis znikał
 * bez śladu. Log kokpitu pokazywał je od zawsze - pełnoszerokim pasem, bo miał własny
 * komponent; teraz komponent jest jeden.
 */
describe('zdarzenia naziemne', () => {
  it('tankowanie wchodzi na oś z dolewką i stanem po niej', () => {
    const zTankowaniem = [
      ...sessionEvents(),
      event('refuel', at(10, 40), { beforeL: 123, addedL: 48, afterL: 171 }, 'refuel-1'),
    ];
    const row = axis(zTankowaniem).rows.find((r) => r.id === 'refuel-1')!;

    expect(row.kind).toBe('refuel');
    expect(row.time).toBe('10:40');
    expect(row.name).toBe('Tankowanie');
    // Stanu PRZED nie ma: to poprzedni odczyt, który stoi wyżej na tej samej osi.
    expect(row.sub).toBe('+48 L → 171 L');
    expect(row.targetUuid).toBe('refuel-1');
  });

  it('tankowanie po zdaniu ustawia się na końcu, przed niczym', () => {
    // Sortuje CZAS, nie typ - dolewka po zamknięciu sesji nie ma prawa wskoczyć
    // między loty tylko dlatego, że jest zdarzeniem naziemnym.
    const zTankowaniem = [
      ...sessionEvents(),
      event('refuel', at(8, 8), { beforeL: 130, addedL: 20, afterL: 150 }, 'refuel-przed'),
      event('refuel', at(10, 40), { beforeL: 123, addedL: 48, afterL: 171 }, 'refuel-po'),
    ];
    const kinds = axis(zTankowaniem).rows.map((r) => `${r.time} ${r.kind}`);

    expect(kinds[0]).toBe('08:04 claim');
    expect(kinds[1]).toBe('08:08 refuel');
    expect(kinds[2]).toBe('08:12 engineStart');
    expect(kinds[kinds.length - 2]).toBe('10:40 refuel');
    expect(kinds[kinds.length - 1]).toBe('11:20 release');
  });

  it('tankowanie co do minuty razem z uruchomieniem stoi PRZED nim', () => {
    // Przy równym stemplu decyduje porządek przyczynowy: dolewa się przy zatrzymanym
    // śmigle, więc „Tankowanie" nie ma prawa wpaść w środek biegu silnika.
    const rowneCzasy = [
      ...sessionEvents(),
      event('refuel', at(8, 12), { beforeL: 130, addedL: 20, afterL: 150 }, 'refuel-rowno'),
    ];
    const kinds = axis(rowneCzasy).rows.map((r) => r.kind);

    expect(kinds.indexOf('refuel')).toBeLessThan(kinds.indexOf('engineStart'));
  });

  it('dolewka oleju wchodzi na oś z ilością; przy równym stemplu stoi przed silnikiem (issue #60)', () => {
    const zOlejem = [
      ...sessionEvents(),
      event('refuel', at(8, 12), { beforeL: 130, addedL: 20, afterL: 150 }, 'refuel-rowno'),
      event('oil_add', at(8, 12), { addedL: 1.0 }, 'oil-1'),
    ];
    const rows = axis(zOlejem).rows;
    const oil = rows.find((r) => r.kind === 'oilAdd')!;

    expect(oil.name).toBe('Dolewka oleju');
    // Sama ilość - poziomu po dolewce nie ma jak zmierzyć (silnik zwykle gorący),
    // a pomiar z przejęcia stoi wyżej na tej samej osi.
    expect(oil.sub).toBe('+1,0 L');
    expect(oil.targetUuid).toBe('oil-1');

    const kinds = rows.map((r) => r.kind);
    expect(kinds.indexOf('oilAdd')).toBeLessThan(kinds.indexOf('engineStart'));
    // ...ale za tankowaniem o tym samym stemplu (jedna pauza, stały porządek).
    expect(kinds.indexOf('refuel')).toBeLessThan(kinds.indexOf('oilAdd'));
  });

  it('załadunek niesie skład, a bez deklaracji - sam fakt', () => {
    const zZaladunkiem = [
      ...sessionEvents(),
      event('boarding', at(8, 14), { jumpers: { tandem: 2, aff: 1, solo: 1 } }, 'boarding-1'),
      event('boarding', at(9, 5), { jumpers: null }, 'boarding-2'),
    ];
    const rows = axis(zZaladunkiem).rows;

    expect(rows.find((r) => r.id === 'boarding-1')!.sub).toBe('4 skoczków');
    // `null` to „nie podano", a nie zero - wiersz mówi tyle, ile wiemy (issue #21).
    expect(rows.find((r) => r.id === 'boarding-2')!.sub).toBeNull();
  });

  it('zmiana załogi mówi, kto kogo zmienił', () => {
    const zZaloga = [
      ...sessionEvents(),
      event('crew_change', at(9, 5), { role: 'dual', pilotOutId: null, pilotInId: 'AKO' }, 'crew-1'),
    ];
    const row = axis(zZaloga).rows.find((r) => r.id === 'crew-1')!;

    expect(row.kind).toBe('crew');
    expect(row.name).toBe('Zmiana załogi');
    // Myślnik = fotela nie było zajętego (dołączenie Duala), a nie „nie wiemy kto".
    expect(row.sub).toBe('DUAL: - → AKO');
  });

  it('uwaga bez czasów (wpis ręczny z samą notatką) nie jest punktem osi', () => {
    // `manual_log_entry` niesie dziś sam tekst i mieszka w karcie „Notatki" (issue #40
    // pkt 5). Na osi byłby zdarzeniem bez przebiegu - czymś, co się nie wydarzyło.
    const zNotatka = [
      ...sessionEvents(),
      event('manual_log_entry', at(10, 0), { notes: 'Drugi zbiornik nie trzyma wskazania' }),
    ];

    expect(axis(zNotatka).rows.map((r) => r.kind)).toEqual(axis().rows.map((r) => r.kind));
  });
});

describe('stopka osi', () => {
  it('czas blokowy pada raz, obok czasu lotu i liczby startów', () => {
    const { foot } = axis();

    // „Czas lotu", nie „W powietrzu" (issue #40 pkt 3): tamto łamało się na telefonie
    // na dwie linie i rozpychało stopkę.
    expect(foot.map((item) => `${item.key} ${item.value}`)).toEqual([
      'Blok 01:43',
      'Czas lotu 01:16',
      'Starty 2',
      'Lotnisko EPZG',
    ]);
  });

  it('operacja bez pracy silnika zamienia blok na czas TRZYMANIA maszyny', () => {
    // 09C: pilot wziął samolot, pogoda go zatrzymała, zdał bez uruchamiania silnika.
    // Zero w wielkiej cyfrze nie jest odpowiedzią na żadne pytanie - zajętość jest.
    const bezLotu: Event[] = [
      event('session_claim', at(9, 10), { mode: 'free' }),
      event('preflight_confirm', at(9, 10), {
        operation: 'skoki',
        departureIcao: 'EPZG',
        reading: { fuelL: 240, mh: 2815.2 },
        mhFormat: 'hhmm',
      }),
      event('day_close', at(10, 25), {
        finalReading: { fuelL: 240, mh: 2815.2 },
        noFlightReason: 'weather',
      }),
    ];
    const { foot, rows } = axis(bezLotu);

    expect(foot[0]).toEqual({ id: 'held', key: 'Trzymany', value: '01:15', accent: false });
    expect(foot[1]!.value).toBe('00:00');
    expect(rows.map((row) => row.kind)).toEqual(['claim', 'release']);
  });

  it('operacja jeszcze niezdana liczy trzymanie do teraz', () => {
    const trwa: Event[] = [
      event('session_claim', at(9, 10), { mode: 'free' }),
      event('preflight_confirm', at(9, 10), {
        operation: 'skoki',
        departureIcao: 'EPZG',
        reading: { fuelL: 240, mh: 2815.2 },
        mhFormat: 'hhmm',
      }),
    ];

    expect(axis(trwa, at(10, 40)).foot[0]!.value).toBe('01:30');
  });

  it('przelot pokazuje trasę zamiast jednego lotniska (issue #13)', () => {
    const przelot = sessionEvents().map((e) =>
      e.type === 'preflight_confirm'
        ? ({
            ...e,
            payload: {
              operation: 'ferry',
              departureIcao: 'EPZG',
              arrivalIcao: 'EPPO',
              reading: { fuelL: 150, mh: 1234.5 },
              mhFormat: 'hhmm',
            },
          } as Event)
        : e,
    );
    const { foot } = axis(przelot);

    expect(foot[foot.length - 1]).toEqual({
      id: 'route',
      key: 'Trasa',
      value: 'EPZG→EPPO',
      accent: false,
    });
  });
});

/**
 * Plakietka „popr." (issue #43) - jedyny ślad edycji widoczny także w trybie ODCZYTU.
 * To fakt o danych, nie akcja: liczba obok nie jest tą, którą zapisał przyrząd.
 */
describe('znacznik poprawki', () => {
  const correction = (targetUuid: string, payload: object, uuid = 'c-1'): Event =>
    ({
      uuid,
      type: 'event_correction',
      sessionUuid: 's-1',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      deviceTime: at(11, 40),
      gpsTime: at(11, 40),
      schemaVersion: 1,
      syncedAt: null,
      payload: { targetUuid, ...payload },
    }) as Event;

  it('domyślnie żaden wiersz nie jest oznaczony', () => {
    expect(axis().rows.every((row) => row.corrected === false)).toBe(true);
  });

  it('poprawione zdarzenie dostaje znacznik, sąsiedzi nie', () => {
    const events = [
      ...sessionEvents(),
      correction('ldg-1', { action: 'retime', newTime: at(9, 3) }),
    ];
    const rows = axis(events).rows;

    expect(rows.find((r) => r.id === 'ldg-1')?.corrected).toBe(true);
    expect(rows.find((r) => r.id === 'ldg-2')?.corrected).toBe(false);
  });

  it('poprawka ODCZYTU oznacza wiersz zdania, choć jego id pochodzi z projekcji', () => {
    const close = sessionEvents().find((e) => e.type === 'day_close')!;
    const events = [
      ...sessionEvents(),
      correction(close.uuid, { action: 'amend', fields: { fuelL: 168 } }),
    ];
    const release = axis(events).rows.find((r) => r.kind === 'release')!;

    expect(release.corrected).toBe(true);
    expect(release.targetUuid).toBe(close.uuid);
  });

  it('korekta NIECZYTELNA nie kłamie o stanie zapisu', () => {
    const events = [
      ...sessionEvents(),
      // Payload, którego domena nie rozumie - nic nie zmienił, więc nie ma o czym mówić.
      correction('ldg-1', { action: 'unknown-action', newTime: at(9, 3) }),
    ];
    expect(axis(events).rows.find((r) => r.id === 'ldg-1')?.corrected).toBe(false);
  });
});

/**
 * WPIS RĘCZNY: OŚ MÓWI TYLKO O GODZINACH, KTÓRE PILOT PODAŁ (zgłoszenie z urządzenia,
 * 2026-08-30: „mam «zdanie» przed «przejęciem» i «tankowaniem». Jak jest lot ręczny, to
 * czas «zdanie», «przejęcie» i «tankowanie» nie są poprawne").
 *
 * Sesja wpisana po fakcie: bieg 12:00 → 13:50 podany przez pilota, ale `day_close`
 * ostemplowane chwilą ZAPISU (11:43) - i tak ma zostać, bo od niego liczy się okno
 * korekty (`manualFlight.test.ts`).
 */
describe('oś operacji wpisanej ręcznie', () => {
  function manualEvents(): Event[] {
    return [
      event('session_claim', at(12, 0), {
        mode: 'free',
        previousPicId: null,
        manualEntry: true,
      }),
      event('preflight_confirm', at(12, 0), {
        operation: 'skoki',
        reading: { fuelL: 630, mh: 1002.1 },
      } as EventOf<'preflight_confirm'>['payload']),
      event('refuel', at(11, 59), { beforeL: 630, addedL: 180, afterL: 810 }, 'refuel-1'),
      event('engine_start', at(12, 0), {}, 'm-engine-on'),
      event('takeoff', at(12, 8), { method: 'manual' }, 'm-to'),
      event('landing', at(13, 46), { method: 'manual' }, 'm-ldg'),
      event('engine_stop', at(13, 50), {}, 'm-engine-off'),
      // Chwila ZAPISU formularza - wcześniejsza niż bieg, bo wpis powstał osobno.
      event('day_close', at(11, 43), { finalReading: { fuelL: 605, mh: 1003.1 } }),
    ];
  }

  it('ZDANIE zamyka oś, choć zapisano je wcześniej niż bieg silnika', () => {
    const rows = axis(manualEvents()).rows;
    expect(rows[rows.length - 1]!.kind).toBe('release');
    // …i nie stoi przed przejęciem, co było treścią zgłoszenia.
    expect(rows.findIndex((r) => r.kind === 'release')).toBeGreaterThan(
      rows.findIndex((r) => r.kind === 'claim'),
    );
  });

  it('PRZEJĘCIE otwiera oś - przed tankowaniem, które składa się minutę wcześniej', () => {
    // Dolewka wpisu ręcznego siada minutę PRZED uruchomieniem, a przejęcie na nim -
    // więc tankowanie wypadało przed chwilą, od której pilot dysponuje maszyną.
    const rows = axis(manualEvents()).rows;
    expect(rows[0]!.kind).toBe('claim');
    expect(rows.findIndex((r) => r.kind === 'refuel')).toBeGreaterThan(0);
  });
  it('godziny WYPROWADZONE są puste - przejęcie, zdanie i tankowanie', () => {
    // Pilot podał bieg silnika i godziny lotów; te trzy chwile są konwencją, nie
    // pomiarem. Godzina przy nich udawałaby zapamiętaną wartość.
    const rows = axis(manualEvents()).rows;
    const timeOf = (kind: string) => rows.find((r) => r.kind === kind)!.time;

    expect(timeOf('claim')).toBe('');
    expect(timeOf('release')).toBe('');
    expect(timeOf('refuel')).toBe('');
  });

  it('godziny ZADEKLAROWANE zostają - bieg silnika i loty', () => {
    const rows = axis(manualEvents()).rows;
    const timeOf = (kind: string) => rows.find((r) => r.kind === kind)!.time;

    expect(timeOf('engineStart')).toBe('12:00');
    expect(timeOf('takeoff')).toBe('12:08');
    expect(timeOf('landing')).toBe('13:46');
    expect(timeOf('engineStop')).toBe('13:50');
  });

  it('operacja z DETEKCJI pokazuje wszystkie godziny - tam każda jest zmierzona', () => {
    const rows = axis().rows;
    expect(rows.find((r) => r.kind === 'claim')!.time).not.toBe('');
    expect(rows.find((r) => r.kind === 'release')!.time).not.toBe('');
  });
});

/** Strażnik typu: projekcja musi mieć wszystko, czego oś potrzebuje. */
export type _AxisNeeds = Pick<
  SessionState,
  'claimedAt' | 'closedAt' | 'flights' | 'blockTimeMs' | 'flightTimeMs' | 'takeoffCount'
>;
