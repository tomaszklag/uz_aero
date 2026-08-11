/**
 * UZ Aero — UPRAWNIENIE ZAPISU: `checkAppend(…, 'administrative')` vs `'pilot'`.
 *
 * Ten plik nie testuje „czy administrator może poprawić dzień po 24 h" — to sprawdza
 * przekrój serwerowy (`server/test/adminCorrections.test.ts`). Tu przybijamy własność
 * WĘŻSZĄ i ważniejszą: **różnica między trybami to DOKŁADNIE gałąź
 * `CORRECTION_WINDOW_EXPIRED` i nic poza nią**.
 *
 * Po co osobny plik i tak żmudna bateria przypadków: parametr uprawnienia jest jedynym
 * miejscem w domenie, w którym reguła daje się wyłączyć. Taka konstrukcja rozlewa się
 * po kodzie sama — ktoś dopisze drugie `authority === 'pilot' &&` przy `WRITER_MISMATCH`
 * („przecież administrator pisze w cudzej sesji"), potem trzecie, a po roku nikt nie
 * wie, ile reguł obowiązuje panel. Test niżej wywala się przy KAŻDYM takim dopisku,
 * bo porównuje pełne listy naruszeń obu trybów, przypadek po przypadku.
 *
 * PRZEPISANY 2026-08-07 (etap B3) — dwie rzeczy zmieniły się w modelu:
 *
 * 1. **Okno kotwiczy się we WZLOCIE, nie w zamknięciu dnia** (§3.6a). W tym scenariuszu
 *    wzlot kończy się o `min(154)`, a samolot jest zdawany dopiero o `min(300)` — okno
 *    biegnie więc od wcześniejszej z tych chwil, bo dotyczy DANYCH LOTU, nie przekazania
 *    maszyny.
 * 2. **Administrator nie jest NIGDY blokowany** (decyzja użytkownika), ale przy kolizji
 *    z pilotem dostaje OSTRZEŻENIA. Właściwość, której pilnuje ten plik, jest więc dziś
 *    mocniejsza i czystsza: **TWARDE reguły (`error`) są w obu trybach IDENTYCZNE — bez
 *    wyjątku, także dla okna. Różnica mieści się wyłącznie w miękkich ostrzeżeniach
 *    i wyłącznie w dwóch kodach `ADMIN_EDIT_*`.**
 *
 * Anti-creep działa tak samo jak wcześniej: dopisanie drugiego `authority === 'pilot' &&`
 * przy jakiejkolwiek regule wywali grupę A, bo porównuje pełne listy błędów obu trybów.
 *
 * Trzy grupy:
 *  A — okno NIE minęło: twarde reguły identyczne, ostrzeżenia admina wyłącznie `ADMIN_EDIT_*`,
 *  B — okno minęło: administrator traci wyłącznie `CORRECTION_WINDOW_EXPIRED`,
 *      a wszystkie pozostałe reguły dalej go odrzucają,
 *  C — pominięcie argumentu = `'pilot'`, czyli komplet reguł.
 */

import {
  CORRECTION_WINDOW_MS,
  checkAppend,
  projectSession,
  type AircraftLimits,
  type Event,
  type EventPayloadMap,
  type EventType,
  type RuleViolation,
  type ViolationCode,
} from '../domain';

const SESSION = 'sess-1';
const AC = 'ac-1';
const PIC = 'pic-1';

/** Konfiguracja SP-AXA: Cessna 182, zbiorniki 330 L (jak w `rules.test.ts`). */
const LIMITS: AircraftLimits = { capacityL: 330 };

/** 22 JUNE 2026, 08:00 UTC — początek kanonicznego dnia. */
const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const min = (m: number): number => T0 + m * 60_000;
const MH_START = 1234.5;
/**
 * Samolot zdany o 13:00 UTC (min 300) — i TO jest kotwica okna korekty
 * (model 2026-08-10: zdanie = zatwierdzenie logu, okno 24 h liczy się od niego).
 * Silnik zgasł o 10:34 (min 154); różnica 146 minut jest w tym teście celowa —
 * gdyby okno dalej wisiało na zgaszeniu silnika, asercje granicy przeszłyby
 * przez przypadek.
 */
const CLOSED_AT = min(300);
const WINDOW_ANCHOR = CLOSED_AT;
const MH_END = MH_START + 142 / 60;

let seq = 0;

interface EvOptions {
  t?: number;
  picId?: string;
  sessionUuid?: string;
  aircraftId?: string;
  gpsTime?: number | null;
}

function ev<K extends EventType>(type: K, payload: EventPayloadMap[K], o: EvOptions = {}): Event {
  const t = o.t ?? min(0);
  return {
    uuid: `e-${++seq}`,
    sessionUuid: o.sessionUuid ?? SESSION,
    aircraftId: o.aircraftId ?? AC,
    picId: o.picId ?? PIC,
    dualId: null,
    type,
    payload,
    deviceTime: t,
    gpsTime: o.gpsTime === undefined ? t : o.gpsTime,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

// ── typowe stany dnia ────────────────────────────────────────────────────────

const claim = (): Event => ev('session_claim', { mode: 'free' }, { t: min(-5) });

const preflight = (): Event =>
  ev(
    'preflight_confirm',
    {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: 'EPKK',
      dutyStart: min(0),
      reading: { fuelL: 150, mh: MH_START },
      mhFormat: 'hhmm',
    },
    { t: min(0) },
  );

const ground = (): Event[] => [claim(), preflight()];
const running = (): Event[] => [...ground(), ev('engine_start', {}, { t: min(12) })];
const inFlight = (): Event[] => [...running(), ev('takeoff', { method: 'auto' }, { t: min(25) })];

/** Pełny cykl 08:12–10:34 z jednym lotem 08:25–09:18. */
const LANDING = ev('landing', { method: 'auto' }, { t: min(78) });
const afterCycle = (): Event[] => [...inFlight(), LANDING, ev('engine_stop', {}, { t: min(154) })];

/** Ten sam dzień, ale ZAMKNIĘTY o 13:00 — materiał na okno korekty. */
const CLOSED_STREAM: Event[] = [
  ...afterCycle(),
  ev(
    'day_close',
    { finalReading: { fuelL: 112, mh: MH_END }, dutyEnd: CLOSED_AT },
    { t: CLOSED_AT },
  ),
];
/** Zdarzenia, w które celują korekty — muszą pochodzić z TEGO strumienia. */
const CLOSED_LANDING = CLOSED_STREAM.find((e) => e.type === 'landing')!;
const CLOSED_PREFLIGHT = CLOSED_STREAM.find((e) => e.type === 'preflight_confirm')!;

/** Korekta zapisana o `recordedAt` — `t` decyduje, czy okno 24 h już minęło. */
function correction(
  targetUuid: string,
  recordedAt: number,
  action: { action: 'retime'; newTime: number } | { action: 'void' } = { action: 'void' },
): Event {
  return ev('event_correction', { targetUuid, ...action } as EventPayloadMap['event_correction'], {
    t: recordedAt,
    gpsTime: null,
  });
}

const codes = (v: RuleViolation[]): ViolationCode[] => v.map((x) => x.code);

const asPilot = (stream: Event[], candidate: Event): RuleViolation[] =>
  checkAppend(projectSession(stream), candidate, LIMITS, 'pilot');

const asAdmin = (stream: Event[], candidate: Event): RuleViolation[] =>
  checkAppend(projectSession(stream), candidate, LIMITS, 'administrative');

// ─────────────────────────────────────────────────────────────────────────────
// A. Poza gałęzią okna oba tryby są NIEROZRÓŻNIALNE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bateria przypadków, w których okno korekty NIE minęło (dzień otwarty albo zamknięty
 * mniej niż 24 h temu). Każdy trafia w inną gwardię — razem pokrywają cały słownik
 * `ViolationCode` poza samym `CORRECTION_WINDOW_EXPIRED`, co pilnuje test kontrolny
 * na końcu tej grupy.
 */
const SAME_IN_BOTH_MODES: Array<[string, Event[], Event]> = [
  ['pusta sesja bez claimu', [], ev('engine_start', {}, { t: min(12) })],
  ['drugi claim', [claim()], ev('session_claim', { mode: 'free' }, { t: min(1) })],
  ['cudza sesja', ground(), ev('engine_start', {}, { t: min(12), sessionUuid: 'inna' })],
  ['cudzy samolot', ground(), ev('engine_start', {}, { t: min(12), aircraftId: 'inny' })],
  ['cudzy PIC (single-writer)', ground(), ev('engine_start', {}, { t: min(12), picId: 'inny' })],
  ['zdarzenie bez zarzutu', ground(), ev('engine_start', {}, { t: min(12) })],
  ['silnik bez preflightu', [claim()], ev('engine_start', {}, { t: min(12) })],
  ['drugi preflight', ground(), preflight()],
  [
    'ujemne motogodziny w preflightcie',
    [claim()],
    ev(
      'preflight_confirm',
      { operation: 'skoki', dutyStart: min(0), reading: { fuelL: 150, mh: -1 } },
      { t: min(0) },
    ),
  ],
  ['silnik już pracuje', running(), ev('engine_start', {}, { t: min(20) })],
  ['stop bez pracy silnika', ground(), ev('engine_stop', {}, { t: min(20) })],
  ['stop w powietrzu', inFlight(), ev('engine_stop', {}, { t: min(40) })],
  ['start w trakcie lotu', inFlight(), ev('takeoff', { method: 'auto' }, { t: min(40) })],
  ['lądowanie bez lotu', running(), ev('landing', { method: 'auto' }, { t: min(78) })],
  [
    'arytmetyka tankowania',
    afterCycle(),
    ev('refuel', { beforeL: 112, addedL: 48, afterL: 200 }, { t: min(168) }),
  ],
  [
    'ponad pojemność zbiorników',
    afterCycle(),
    ev('refuel', { beforeL: 300, addedL: 100, afterL: 400 }, { t: min(168) }),
  ],
  [
    'ujemne paliwo',
    afterCycle(),
    ev('refuel', { beforeL: 112, addedL: -8, afterL: 104 }, { t: min(168) }),
  ],
  [
    'tankowanie przy pracującym silniku',
    running(),
    ev('refuel', { beforeL: 112, addedL: 48, afterL: 160 }, { t: min(20) }),
  ],
  [
    'paliwo wyższe niż ostatni odczyt (miękko)',
    afterCycle(),
    ev('refuel', { beforeL: 200, addedL: 20, afterL: 220 }, { t: min(168) }),
  ],
  [
    'zamknięcie przy pracującym silniku',
    running(),
    ev(
      'day_close',
      { finalReading: { fuelL: 112, mh: MH_END }, dutyEnd: min(300) },
      { t: min(300) },
    ),
  ],
  [
    'cofnięty licznik MH',
    afterCycle(),
    ev(
      'day_close',
      { finalReading: { fuelL: 112, mh: MH_START - 1 }, dutyEnd: min(300) },
      { t: min(300) },
    ),
  ],
  [
    'rozjazd Δ MH vs block (miękko)',
    afterCycle(),
    ev(
      'day_close',
      { finalReading: { fuelL: 112, mh: MH_START + 5 }, dutyEnd: min(300) },
      { t: min(300) },
    ),
  ],
  [
    'paliwo urosło bez tankowania',
    afterCycle(),
    ev(
      'day_close',
      { finalReading: { fuelL: 200, mh: MH_END }, dutyEnd: min(300) },
      { t: min(300) },
    ),
  ],
  [
    'koniec służby przed meldunkiem',
    afterCycle(),
    ev(
      'day_close',
      { finalReading: { fuelL: 112, mh: MH_END }, dutyEnd: min(-60) },
      { t: min(300) },
    ),
  ],
  [
    // Skład jest opcjonalny (issue #21) — twarda gwardia została wyłącznie na
    // składzie NIEMOŻLIWYM, więc baterię zasila ujemna liczba, nie zero.
    'zrzut z ujemnym składem',
    inFlight(),
    ev(
      'drop',
      { dropNumber: 1, altitudeFt: 2450, jumpers: { tandem: -1, aff: 0, solo: 0 } },
      { t: min(40) },
    ),
  ],
  [
    'załadunek z ujemnym składem',
    running(),
    ev('boarding', { jumpers: { tandem: 0, aff: -2, solo: 0 } }, { t: min(15) }),
  ],
  [
    'załadunek w locie (miękko)',
    inFlight(),
    ev('boarding', { jumpers: { tandem: 2, aff: 0, solo: 0 } }, { t: min(30) }),
  ],
  [
    'załadunek poza operacją skokową (miękko)',
    [
      claim(),
      ev(
        'preflight_confirm',
        { operation: 'ferry', dutyStart: min(0), reading: { fuelL: 150, mh: MH_START } },
        { t: min(0) },
      ),
      ev('engine_start', {}, { t: min(12) }),
    ],
    ev('boarding', { jumpers: { tandem: 1, aff: 0, solo: 0 } }, { t: min(15) }),
  ],
  [
    'zrzut na ziemi (miękko)',
    running(),
    ev(
      'drop',
      { dropNumber: 1, altitudeFt: 2450, jumpers: { tandem: 2, aff: 1, solo: 1 } },
      { t: min(20) },
    ),
  ],
  [
    'zrzut poza operacją skokową (miękko)',
    [
      claim(),
      ev(
        'preflight_confirm',
        { operation: 'ferry', dutyStart: min(0), reading: { fuelL: 150, mh: MH_START } },
        { t: min(0) },
      ),
      ev('engine_start', {}, { t: min(12) }),
      ev('takeoff', { method: 'auto' }, { t: min(25) }),
    ],
    ev(
      'drop',
      { dropNumber: 1, altitudeFt: 2450, jumpers: { tandem: 2, aff: 1, solo: 1 } },
      { t: min(40) },
    ),
  ],
  [
    'zmiana PIC w sesji',
    ground(),
    ev('crew_change', { role: 'pic', pilotOutId: PIC, pilotInId: 'pic-2' }, { t: min(160) }),
  ],
  [
    'Dual tożsamy z PIC',
    ground(),
    ev('crew_change', { role: 'dual', pilotOutId: null, pilotInId: PIC }, { t: min(160) }),
  ],
  ['pusty wpis ręczny', ground(), ev('manual_log_entry', { notes: 'nic' }, { t: min(160) })],
  [
    'czasy wpisu ręcznego w złej kolejności',
    ground(),
    ev('manual_log_entry', { takeoff: min(78), landing: min(25) }, { t: min(160) }),
  ],
  [
    'rozjazd zegarów (miękko)',
    ground(),
    ev('engine_start', {}, { t: min(12), gpsTime: min(12) - 300_000 }),
  ],
  ['korekta celu spoza sesji', CLOSED_STREAM, correction('duch', min(310))],
  ['korekta zdarzenia niekorygowalnego', CLOSED_STREAM, correction(CLOSED_PREFLIGHT.uuid, min(310))],
  [
    'poprawiony czas z przyszłości',
    CLOSED_STREAM,
    correction(CLOSED_LANDING.uuid, min(310), { action: 'retime', newTime: min(400) }),
  ],
  [
    'drugie zamknięcie dnia',
    CLOSED_STREAM,
    ev(
      'day_close',
      { finalReading: { fuelL: 112, mh: MH_END }, dutyEnd: CLOSED_AT },
      { t: min(320) },
    ),
  ],
  ['zwykłe zdarzenie po zamknięciu', CLOSED_STREAM, ev('engine_start', {}, { t: min(320) })],
  [
    'poprawna korekta w oknie 24 h',
    CLOSED_STREAM,
    correction(CLOSED_LANDING.uuid, min(320), { action: 'retime', newTime: min(81) }),
  ],
  [
    'wpis ręczny w oknie 24 h',
    CLOSED_STREAM,
    ev(
      'manual_log_entry',
      { offBlock: min(12), takeoff: min(25), landing: min(78), onBlock: min(154) },
      { t: min(320) },
    ),
  ],
];

/** Jedyne dwa kody, o które administratorowi wolno się różnić — i to MIĘKKO. */
const ADMIN_ONLY_WARNINGS: ViolationCode[] = [
  'ADMIN_EDIT_SESSION_ACTIVE',
  'ADMIN_EDIT_PILOT_WINDOW_OPEN',
];

const hard = (v: RuleViolation[]): RuleViolation[] => v.filter((x) => x.severity === 'error');
const soft = (v: RuleViolation[]): RuleViolation[] => v.filter((x) => x.severity === 'warning');

describe('A · dopóki okno korekty trwa, oba tryby są nierozróżnialne', () => {
  it.each(SAME_IN_BOTH_MODES)('%s — twarde reguły identyczne', (_name, stream, candidate) => {
    // Porównujemy PEŁNE obiekty, nie same kody: gdyby uprawnienie zmieniało wagę albo
    // treść komunikatu, byłaby to równie realna zmiana zachowania.
    expect(hard(asAdmin(stream, candidate))).toEqual(hard(asPilot(stream, candidate)));
  });

  it.each(SAME_IN_BOTH_MODES)('%s — admin różni się WYŁĄCZNIE ostrzeżeniami ADMIN_EDIT_*', (_name, stream, candidate) => {
    const pilotSoft = soft(asPilot(stream, candidate));
    const adminSoft = soft(asAdmin(stream, candidate));

    // Wszystko, co pilot dostaje miękko, administrator dostaje też.
    expect(adminSoft).toEqual(expect.arrayContaining(pilotSoft));

    // A nadwyżka administratora mieści się w dwóch dozwolonych kodach — nigdy
    // w żadnym innym. To jest bariera przed rozlaniem się uprawnienia.
    const extra = adminSoft.filter((a) => !pilotSoft.some((p) => p.code === a.code));
    for (const w of extra) expect(ADMIN_ONLY_WARNINGS).toContain(w.code);
  });

  it('bateria faktycznie odpala każdą regułę poza samym oknem (kontrola testu)', () => {
    // Bez tego zielony wynik wyżej nic nie znaczy: bateria z samych czystych
    // przypadków porównywałaby dwie puste listy i przechodziła przy dowolnie
    // rozlanym uprawnieniu.
    const seen = new Set<ViolationCode>();
    for (const [, stream, candidate] of SAME_IN_BOTH_MODES) {
      for (const code of codes(asPilot(stream, candidate))) seen.add(code);
    }

    const expected: ViolationCode[] = [
      'SESSION_NOT_CLAIMED',
      'SESSION_ALREADY_CLAIMED',
      'SESSION_MISMATCH',
      'AIRCRAFT_MISMATCH',
      'WRITER_MISMATCH',
      'DAY_CLOSED',
      'DAY_ALREADY_CLOSED',
      'PREFLIGHT_REQUIRED',
      'PREFLIGHT_ALREADY_CONFIRMED',
      'ENGINE_ALREADY_RUNNING',
      'ENGINE_NOT_RUNNING',
      'ENGINE_STOP_IN_FLIGHT',
      'ENGINE_RUNNING_AT_DAY_CLOSE',
      'ALREADY_IN_FLIGHT',
      'NOT_IN_FLIGHT',
      'FUEL_NEGATIVE',
      'FUEL_ARITHMETIC',
      'FUEL_OVER_CAPACITY',
      'FUEL_INCREASE_WITHOUT_REFUEL',
      'FUEL_MISMATCH',
      'REFUEL_ENGINE_RUNNING',
      'MH_NEGATIVE',
      'MH_REGRESSION',
      'MH_DELTA_MISMATCH',
      'DROP_NEGATIVE_JUMPERS',
      'DROP_ON_GROUND',
      'DROP_OUTSIDE_JUMP_OPERATION',
      'BOARDING_NEGATIVE_JUMPERS',
      'BOARDING_IN_FLIGHT',
      'BOARDING_OUTSIDE_JUMP_OPERATION',
      'PIC_CHANGE_NOT_ALLOWED',
      'DUAL_IS_PIC',
      'MANUAL_ENTRY_EMPTY',
      'MANUAL_ENTRY_TIME_ORDER',
      'DUTY_END_BEFORE_START',
      'CORRECTION_TARGET_NOT_FOUND',
      'CORRECTION_TARGET_NOT_ALLOWED',
      'CORRECTION_TIME_IN_FUTURE',
      'CLOCK_DRIFT',
    ];
    expect([...seen].sort()).toEqual([...expected].sort());

    // …i przynajmniej jeden przypadek czysty, żeby „identyczne" nie znaczyło
    // „identycznie odrzucone zawsze".
    expect(asPilot(ground(), ev('engine_start', {}, { t: min(12) }))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Po 24 h znika DOKŁADNIE jedna reguła
// ─────────────────────────────────────────────────────────────────────────────

/** Chwila zapisu korekty po upływie okna (24 h + 1 h od zamknięcia). */
const LATE = WINDOW_ANCHOR + CORRECTION_WINDOW_MS + 3_600_000;

describe('B · po oknie 24 h administrator traci wyłącznie CORRECTION_WINDOW_EXPIRED', () => {
  it('poprawna korekta: pilot odbity, administrator przechodzi', () => {
    const candidate = correction(CLOSED_LANDING.uuid, LATE, {
      action: 'retime',
      newTime: min(81),
    });

    expect(codes(asPilot(CLOSED_STREAM, candidate))).toEqual(['CORRECTION_WINDOW_EXPIRED']);
    expect(asAdmin(CLOSED_STREAM, candidate)).toEqual([]);
  });

  it('granica okna jest ostra i wspólna: równo 24 h przechodzi obu, milisekundę dalej już nie', () => {
    const onEdge = correction(CLOSED_LANDING.uuid, WINDOW_ANCHOR + CORRECTION_WINDOW_MS);
    expect(asPilot(CLOSED_STREAM, onEdge)).toEqual([]);
    // Administrator też przechodzi, ale DOSTAJE OSTRZEŻENIE: okno pilota jeszcze trwa,
    // więc obaj mogliby poprawiać ten sam wzlot naraz. Ostrzeżenie, nie blokada.
    expect(hard(asAdmin(CLOSED_STREAM, onEdge))).toEqual([]);
    expect(codes(soft(asAdmin(CLOSED_STREAM, onEdge)))).toEqual(['ADMIN_EDIT_PILOT_WINDOW_OPEN']);

    const past = correction(CLOSED_LANDING.uuid, WINDOW_ANCHOR + CORRECTION_WINDOW_MS + 1);
    expect(codes(asPilot(CLOSED_STREAM, past))).toEqual(['CORRECTION_WINDOW_EXPIRED']);
    // Milisekundę po granicy okno pilota jest zamknięte, więc administrator nie ma
    // już z kim kolidować — przechodzi zupełnie czysto.
    expect(asAdmin(CLOSED_STREAM, past)).toEqual([]);
  });

  it('naruszenia koperty obowiązują administratora — znika sam kod okna, nic więcej', () => {
    // Koperta zbiera naruszenia razem, więc tu widać RÓŻNICĘ list wprost: to jedyny
    // układ, w którym oba tryby zwracają niepustą listę, a admin ma ją krótszą o jeden.
    const foreignWriter = ev(
      'event_correction',
      { targetUuid: CLOSED_LANDING.uuid, action: 'void' },
      { t: LATE, gpsTime: null, picId: 'inny-pilot' },
    );
    expect(codes(asPilot(CLOSED_STREAM, foreignWriter))).toEqual([
      'WRITER_MISMATCH',
      'CORRECTION_WINDOW_EXPIRED',
    ]);
    expect(codes(asAdmin(CLOSED_STREAM, foreignWriter))).toEqual(['WRITER_MISMATCH']);

    const foreignSession = ev(
      'event_correction',
      { targetUuid: CLOSED_LANDING.uuid, action: 'void' },
      { t: LATE, gpsTime: null, sessionUuid: 'inna' },
    );
    expect(codes(asAdmin(CLOSED_STREAM, foreignSession))).toEqual(
      codes(asPilot(CLOSED_STREAM, foreignSession)).filter(
        (c) => c !== 'CORRECTION_WINDOW_EXPIRED',
      ),
    );
  });

  it.each([
    ['cel spoza sesji', correction('duch', LATE), 'CORRECTION_TARGET_NOT_FOUND'],
    [
      'cel niekorygowalny',
      correction(CLOSED_PREFLIGHT.uuid, LATE),
      'CORRECTION_TARGET_NOT_ALLOWED',
    ],
    [
      'poprawiony czas z przyszłości',
      correction(CLOSED_LANDING.uuid, LATE, { action: 'retime', newTime: LATE + 60_000 }),
      'CORRECTION_TIME_IN_FUTURE',
    ],
  ])('reguły per typ dalej odrzucają administratora — %s', (_name, candidate, code) => {
    // Własność wyrażona ODPORNIE na to, czy okno w danym przypadku w ogóle zapada:
    // od 2026-08-07 reguła okna budzi się tylko wtedy, gdy korekta da się przypisać
    // do konkretnego wzlotu (§3.6a). Cel spoza sesji albo cel sprzed pierwszego cyklu
    // do żadnego wzlotu nie należy, więc pilot dostaje samą regułę per typ.
    //
    // Niezmiennik jest jeden i ten sam w każdym przypadku: **twarde kody administratora
    // = twarde kody pilota MINUS `CORRECTION_WINDOW_EXPIRED`**. Uchylenie okna nie jest
    // przepustką do rejestru.
    const pilotHard = codes(hard(asPilot(CLOSED_STREAM, candidate as Event)));
    const adminHard = codes(hard(asAdmin(CLOSED_STREAM, candidate as Event)));

    // ADMINISTRATOR ZAWSZE DOCHODZI DO REGUŁY PER TYP — to jest cała pointa.
    expect(adminHard).toEqual([code]);

    // Pilot dochodzi tam tylko wtedy, gdy okno go wcześniej nie odbiło. Twarda koperta
    // zwraca się sama (§„JEDEN konkretny powód"), więc pilot widzi ALBO okno, ALBO
    // regułę właściwą — nigdy obu naraz.
    expect(pilotHard).toHaveLength(1);
    expect(['CORRECTION_WINDOW_EXPIRED', code]).toContain(pilotHard[0]);
  });

  it('po 24 h administrator NIE dopisze zdarzenia spoza katalogu korekt', () => {
    // Gałąź `DAY_CLOSED` stoi w łańcuchu PRZED oknem, więc uchylenie okna jej nie
    // dotyka: panel poprawia dzień korektą, a nie dokładaniem nowego cyklu silnika.
    const late = ev('engine_start', {}, { t: LATE });
    expect(codes(asPilot(CLOSED_STREAM, late))).toEqual(['DAY_CLOSED']);
    expect(codes(asAdmin(CLOSED_STREAM, late))).toEqual(['DAY_CLOSED']);

    const secondClose = ev(
      'day_close',
      { finalReading: { fuelL: 112, mh: MH_END }, dutyEnd: CLOSED_AT },
      { t: LATE },
    );
    expect(codes(asAdmin(CLOSED_STREAM, secondClose))).toEqual(['DAY_ALREADY_CLOSED']);
  });

  it('wpis ręczny po 24 h przechodzi administratorowi, ale nadal musi być poprawny', () => {
    // Wpis BEZ ANI JEDNEGO CZASU nie da się przypisać do żadnego wzlotu, więc okno
    // się nie budzi — pilot wpada od razu na regułę treści. To jest poprawne:
    // wpis, który niczego nie poprawia, nie jest korektą wzlotu.
    const empty = ev('manual_log_entry', { notes: 'nic' }, { t: LATE });
    expect(codes(hard(asPilot(CLOSED_STREAM, empty)))).toEqual(['MANUAL_ENTRY_EMPTY']);
    expect(codes(hard(asAdmin(CLOSED_STREAM, empty)))).toEqual(['MANUAL_ENTRY_EMPTY']);

    const full = ev(
      'manual_log_entry',
      { offBlock: min(12), takeoff: min(25), landing: min(78), onBlock: min(154) },
      { t: LATE },
    );
    expect(asAdmin(CLOSED_STREAM, full)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Domyślna wartość nigdy nie poszerza uprawnień
// ─────────────────────────────────────────────────────────────────────────────

describe('C · pominięcie argumentu = tryb pilota', () => {
  it('trzy argumenty znaczą to samo, co jawne `pilot`', () => {
    const state = projectSession(CLOSED_STREAM);
    const candidate = correction(CLOSED_LANDING.uuid, LATE);

    expect(checkAppend(state, candidate, LIMITS)).toEqual(
      checkAppend(state, candidate, LIMITS, 'pilot'),
    );
    expect(codes(checkAppend(state, candidate, LIMITS))).toContain('CORRECTION_WINDOW_EXPIRED');
  });

  it('dwa argumenty (bez limitów) też zostają trybem pilota', () => {
    const state = projectSession(CLOSED_STREAM);
    const candidate = correction(CLOSED_LANDING.uuid, LATE);

    expect(codes(checkAppend(state, candidate))).toEqual(['CORRECTION_WINDOW_EXPIRED']);
  });
});
