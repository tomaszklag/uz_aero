/**
 * UZ Aero — 15 LOT RĘCZNY (mockupy `design/15-reczny-lot.html` → `15e`, przebudowa
 * 2026-08-16).
 *
 * Wpis CAŁEGO lotu po fakcie — telefon został w kurtce, bateria padła, lot spisany
 * na papierze. Od przebudowy jest STEPPEREM o czterech krokach, jak lot normalny
 * (02 → 02E → 02A), i niesie PEŁNĄ PARITĘ z zapisem automatycznym:
 *  1. data lotu (pierwsza — wpis zaczyna się od „którego to było?", issue #58 pkt 1;
 *     domyślnie dzisiejsza) · samolot · Dual (wymagany, gdy wymaga go samolot — pkt 4),
 *  2. zadanie: rodzaj operacji, lotniska, klient, notatka — pola z 02E,
 *  3. czasy: bieg silnika + DOWOLNIE WIELE lotów + zrzuty w dniu skokowym,
 *  4. liczniki: paliwo przed/dolewki/po, motogodziny z obu stron + OSTRZEŻENIA.
 *
 * Kroki są STANEM ekranu, nie osobnymi trasami: wpis ręczny nie ma nawigacyjnych
 * odgałęzień (kokpit, arkusze zadania), które kazały rozbić preflight na trzy trasy —
 * a jeden plik trzyma szkic bez osobnego store'a.
 *
 * Ekran NICZEGO NIE LICZY: bramki kroków i budowa wejścia komendy mieszkają
 * w `logic/manualFlight.ts`, ostrzeżenia w `logic/manualFlightWarnings.ts`,
 * a resztę reguł egzekwuje domena w komendzie `manualFlight` — z próbą generalną
 * przed pierwszym zapisem, bo strumień append-only nie ma transakcji.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AirfieldSheet,
  AppText,
  Banner,
  Card,
  CardPicker,
  Field,
  FlightDateSheet,
  FlightTimesSheet,
  ManualDropSheet,
  OilSheet,
  OptionGrid,
  ReadingSheet,
  RefuelEntrySheet,
  Screen,
  ScreenHeader,
  SessionAxis,
  SyncChip,
  Tag,
  TextEntrySheet,
  ValueBox,
  type GridOption,
  type PickerOption,
} from '../components';
import { Icon } from '../components/foundation/Icon';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { usePilotDay } from '../hooks/usePilotDay';
import { uuidv4 } from '../../infrastructure/id';
import {
  dateTimeUtcShort,
  dateUtcDayMonth,
  dateUtcLong,
  litres,
  maskMotoHoursInput,
  motoHours,
  oilLitres,
  parseLitres,
  parseMotoHours,
  timeUtc,
} from '../format';
import {
  oilAfterRow,
  oilEntryWarning,
  oilValueText,
  type OilConfig,
} from './logic/oilPreflight';
import {
  OPERATION_TYPES,
  isJumpOperation,
  isSameFieldOperation,
  type OperationType,
  type ReferenceAircraft,
  type ReferencePilot,
} from '../../domain';
import {
  emptyManualFlightDraft,
  manualFlightNeedsDual,
  manualFlightStepBlocker,
  sortedFlights,
  toManualFlightInput,
  type ManualFlightDraft,
  type ManualFlightStep,
} from './logic/manualFlight';
import {
  buildManualFlightAxis,
  manualAxisTarget,
  nextDropAt,
  nextFlightTimes,
  previousDrop,
} from './logic/manualFlightAxis';
import { buildManualFuelChain, fuelChainTarget, sortedRefuels } from './logic/manualFuelChain';
import { manualFuelBalance, manualMhBalance } from './logic/manualFlightBalance';
import { manualFlightWarnings } from './logic/manualFlightWarnings';
import { operationLabel } from './logic/operations';
/** Nazwa lotniska albo plakietka „spoza katalogu" — ta sama, co na 02E (issue #62 pkt 1). */
import { airfieldValueProps } from '../components/input/airfieldMark';

/** Kolejność kroków — indeks w tej tablicy jest numerem w plakietce „n / 4". */
const STEPS: ManualFlightStep[] = ['aircraft', 'task', 'times', 'readings'];

/** Siatka operacji — DOKŁADNIE ta sama, co na 02E (ikony `.op-grid`, napisy pilota). */
const OPERATIONS: GridOption<OperationType>[] = OPERATION_TYPES.map((value) => ({
  value,
  label: operationLabel(value),
  icon: `op-${value}` as const,
}));

const HOUR = 3_600_000;
const MIN = 60_000;

export function ManualFlightScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const queries = useSessionStore((s) => s.queries);
  const manualFlight = useSessionStore((s) => s.manualFlight);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const pilotId = useCurrentPilot((s) => s.id);

  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<ManualFlightDraft>(() =>
    emptyManualFlightDraft(Date.now()),
  );
  const patch = useCallback((over: Partial<ManualFlightDraft>) => {
    setDraft((d) => ({ ...d, ...over }));
  }, []);

  // ── dane referencyjne: flota i piloci (do wyboru Duala) ────────────────────
  const [fleet, setFleet] = useState<ReferenceAircraft[]>([]);
  const [pilots, setPilots] = useState<ReferencePilot[]>([]);
  useEffect(() => {
    if (!queries) return;
    let alive = true;
    void Promise.all([queries.aircraft(), queries.pilots()]).then(([aircraft, list]) => {
      if (!alive) return;
      setFleet(aircraft);
      setPilots(list);
    });
    return () => {
      alive = false;
    };
  }, [queries]);

  const aircraft = fleet.find((a) => a.id === draft.aircraftId) ?? null;
  /**
   * Konfiguracja oleju do arkusza (issue #60). `normLPerH` ŚWIADOMIE null: wpis
   * opisuje przeszłość, a oczekiwanie z normy liczy się względem bieżącego licznika —
   * podpowiadałoby o innym dniu (ta sama reguła, co brak podpowiedzi zadania na 15A).
   */
  const oilConfig: OilConfig = {
    minL: aircraft?.oilMinL ?? null,
    capacityL: aircraft?.oilCapacityL ?? null,
    normLPerH: null,
  };
  const mhFormat = aircraft?.mhFormat ?? 'decimal';

  // Dzień pilota w DOBIE WPISU — materiał ostrzeżenia o kolizji czasów (lokalny
  // rejestr) i wiersza „Sesje w tej dobie" w arkuszu daty.
  const pilotDay = usePilotDay(pilotId, draft.day);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Który arkusz jest otwarty; listy (loty, zrzuty, dolewki) niosą też `id` pozycji.
  type SheetState =
    | { kind: 'date' }
    | { kind: 'airfield'; role: 'departure' | 'arrival' }
    | { kind: 'client' }
    | { kind: 'notes' }
    /* `field` = KTÓRY koniec pary pilot tapnął (issue #62, trzecia tura); brak =
       obie godziny naraz, czyli wejście z karty „Bieg silnika" i „DODAJ LOT",
       gdzie para powstaje w całości. */
    | { kind: 'engine'; field?: 'start' | 'stop' }
    | { kind: 'flight'; id: string | null; field?: 'takeoff' | 'landing' }
    | { kind: 'drop'; id: string | null }
    | { kind: 'refuel'; id: string | null }
    | { kind: 'fuel'; which: 'before' | 'after' }
    | { kind: 'mh'; which: 'before' | 'after' }
    | { kind: 'oil' }
    | null;
  const [sheet, setSheet] = useState<SheetState>(null);
  const close = () => setSheet(null);

  const step = STEPS[stepIndex]!;
  /* Pojemność zbiorników wchodzi do bramki (issue #62, piąta tura): sufit odczytu jest
     twardym błędem domeny, a przy nieznanej pojemności reguła śpi — tak jak w domenie. */
  const blocker = manualFlightStepBlocker(step, draft, {
    capacityL: aircraft?.capacityL ?? null,
  });
  // Wymóg Duala (issue #58 pkt 4) — jak na 02: baner nazywa powód, przycisk dostaje
  // sam `disabled` (blokada widoczna z ekranu nie powtarza swojego zdania w przycisku).
  const needsDual = step === 'aircraft' && manualFlightNeedsDual(aircraft, draft);
  const warnings = useMemo(
    () =>
      step === 'readings'
        ? manualFlightWarnings(draft, {
            pilotDay,
            handover: aircraft?.handover ?? null,
            mhFormat,
            fetchedAt: aircraft?.fetchedAt ?? null,
          })
        : [],
    [step, draft, pilotDay, aircraft, mhFormat],
  );

  const save = useCallback(async () => {
    const input = toManualFlightInput(draft, { sessionUuid: uuidv4(), picId: pilotId });
    if (input == null) return;
    setBusy(true);
    setError(null);
    try {
      await manualFlight(input);
      navigation.navigate('MyDay');
    } catch (e) {
      // Powód odmowy domeny wprost przy przycisku — nigdy cichy błąd (§6 pkt 3).
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [draft, manualFlight, navigation, pilotId]);

  // ── opcje list ─────────────────────────────────────────────────────────────
  const aircraftOptions: PickerOption<string>[] = useMemo(
    () =>
      fleet.map((a) => ({
        value: a.id,
        label: a.reg,
        detail: a.type,
        // Wyłączony ze służby — jak w preflightcie. Cudzy claim NIE blokuje:
        // wpis dotyczy przeszłości, a nie prawa zapisu „tu i teraz" (§4.4 chroni
        // sesję bieżącą, nie historię).
        disabledReason: a.serviceStatus === 'disabled' ? 'Wyłączony ze służby' : undefined,
        tags:
          a.serviceStatus === 'disabled'
            ? [{ label: 'Wyłączony', tone: 'red' as const }]
            : undefined,
      })),
    [fleet],
  );
  // Pilot zalogowany nie może być jednocześnie Dualem — jak na kroku 1 preflightu.
  const dualOptions: PickerOption<string>[] = useMemo(
    () =>
      pilots
        .filter((p) => p.id !== pilotId)
        .map((p) => ({ value: p.id, label: p.code, detail: p.name })),
    [pilots, pilotId],
  );

  const dualName = pilots.find((p) => p.id === draft.dualId)?.name ?? null;
  const flights = sortedFlights(draft);
  // Zrzut istnieje wyłącznie w dniu skokowym (issue #19) — i to samo pytanie
  // rozstrzyga, czy zrzuty wchodzą na oś kroku 3.
  const jumpDay = draft.operation != null && isJumpOperation(draft.operation);
  const axis = useMemo(
    () => buildManualFlightAxis(draft, { jumpDay }),
    [draft, jumpDay],
  );
  /** Ile zrzutów wypada poza każdym lotem — oś już je oznaczyła, baner je zlicza. */
  const strayDrops = axis.rows.filter((r) => r.kind === 'drop' && r.warned === true).length;
  /** Bieg silnika ma oba końce — dopiero wtedy lot ma w czym się zawierać (pkt 10). */
  const engineRunSet = draft.engineStart != null && draft.engineStop != null;

  // ── krok 4: sekwencja paliwa i werdykt normy (issue #62, piąta tura) ────────
  const fuelChain = useMemo(() => buildManualFuelChain(draft), [draft]);
  const norm = aircraft?.consumption ?? null;
  const balances = useMemo(
    () =>
      [
        manualFuelBalance(draft, norm),
        manualMhBalance(draft, norm, mhFormat),
      ].filter((b): b is NonNullable<typeof b> => b != null),
    [draft, norm, mhFormat],
  );
  /* Norma jest DANĄ Z SERWERA, więc niesie adnotację wieku (§4.8) — ta sama, co przy
     ostrzeżeniach łańcucha. Bez normy nie ma czego kwalifikować i adnotacji nie ma. */
  const normSrc =
    norm != null && aircraft?.fetchedAt != null
      ? `z cache · sync ${dateTimeUtcShort(aircraft.fetchedAt)}`
      : null;
  // Granice godzin wpisu = doba lotu; stepper nie ucieknie w cudzy dzień.
  const dayMin = draft.day;
  const dayMax = draft.day + 24 * HOUR - MIN;

  // Podtytuł od kroku 2 niesie KONTEKST wpisu (wybór z kroku 1) — nie zegar.
  const subtitle =
    stepIndex === 0
      ? undefined
      : `${aircraft?.reg ?? '—'} · ${dateUtcDayMonth(draft.day)}${step === 'times' ? ' · CZASY UTC' : ''}`;

  const flightBounds = { min: dayMin, max: dayMax };

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="LOT RĘCZNY"
          size="md"
          {...(subtitle != null ? { subtitle } : {})}
          step={`${stepIndex + 1} / ${STEPS.length}`}
          onBack={() => {
            if (stepIndex > 0) setStepIndex(stepIndex - 1);
            else navigation.navigate('MyDay');
          }}
          backLabel={stepIndex === 0 ? 'Mój dzień' : 'Wróć'}
          right={
            <SyncChip
              status={synced ? 'synced' : 'offline'}
              outboxCount={outboxCount}
              lastSyncAt={lastSyncAt}
            />
          }
        />
      }
      footer={
        step === 'readings' ? (
          <ActionButton
            label="ZAPISZ LOT"
            tone="green"
            variant="solid"
            icon="check"
            busy={busy}
            disabledReason={blocker}
            onPress={() => void save()}
          />
        ) : (
          <ActionButton
            label="DALEJ"
            tone="green"
            variant="solid"
            icon="next"
            disabledReason={blocker}
            disabled={needsDual}
            onPress={() => setStepIndex(stepIndex + 1)}
          />
        )
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        {/* ══ KROK 1 — DATA I SAMOLOT ════════════════════════════════════════ */}
        {step === 'aircraft' && (
          <>
            {/* Data lotu PIERWSZA (issue #58 pkt 1): wpis ręczny zaczyna się od
                pytania „którego to było?" — data jest polem z dzisiejszą wartością
                domyślną, nie napisem w nagłówku (zgłoszenie z urządzenia, 2026-08-16).
                Przypisu o dobie tu NIE MA (pkt 3) — to samo zdanie stoi w arkuszu
                daty, przy kontrolce, której dotyczy. */}
            <Card title="Data lotu · UTC" header="inline">
              <ValueBox
                value={dateUtcLong(draft.day)}
                actionIcon="clock"
                onPress={() => setSheet({ kind: 'date' })}
                accessibilityLabel={`Data lotu ${dateUtcLong(draft.day)} — zmień`}
              />
            </Card>

            <Card title="Samolot" header="inline">
              {fleet.length === 0 ? (
                <AppText variant="body" tone="muted">
                  Brak samolotów w pamięci urządzenia.
                </AppText>
              ) : (
                <CardPicker
                  options={aircraftOptions}
                  value={draft.aircraftId}
                  // Wybór Duala PRZEŻYWA zmianę maszyny (issue #58 — jak `setAircraft`
                  // na 02): wybrana osoba nie traci ważności, a znikające bez słowa
                  // pole czyta się jak błąd. Wymóg załogi 2-os. i tak egzekwuje
                  // `manualFlightNeedsDual` przy DALEJ.
                  onChange={(id) => patch({ aircraftId: id })}
                />
              )}
            </Card>

            {/* Dual — zwykle OPCJONALNY; przy samolocie z wymogiem załogi dwuosobowej
                plakietka i baner mówią to samo, co na 02 (issue #58 pkt 4 — wpis
                ręczny opisuje ten sam lot tym samym prawem). */}
            <Card
              title="Drugi pilot (Dual)"
              header="inline"
              headerRight={
                <Tag
                  label={aircraft?.dualRequired ? 'wymagany · załoga 2-os.' : 'opcjonalne'}
                  tone={aircraft?.dualRequired ? 'amber' : 'neutral'}
                />
              }
            >
              <CardPicker
                options={dualOptions}
                value={draft.dualId}
                onChange={(id) => patch({ dualId: draft.dualId === id ? null : id })}
              />
              {needsDual && (
                <Banner
                  kind="warning"
                  title="Wymagana załoga dwuosobowa"
                  text={`${aircraft?.type ?? 'Ten samolot'} wymaga drugiego pilota — wybierz go, aby przejść dalej.`}
                />
              )}
            </Card>
          </>
        )}

        {/* ══ KROK 2 — ZADANIE (pola z 02E; bez podpowiedzi z ostatniego dnia:
            wpis opisuje konkretny lot z przeszłości, podstawianie robiłoby domysł) ══ */}
        {step === 'task' && (
          <>
            <Card title="Rodzaj operacji" header="inline">
              <OptionGrid
                options={OPERATIONS}
                value={draft.operation}
                onChange={(operation) => patch({ operation })}
              />
            </Card>

            {/* Skoki = JEDNO lotnisko (issue #13), reszta = para start → lądowanie. */}
            <Card
              title={
                draft.operation != null && isSameFieldOperation(draft.operation)
                  ? 'Lotnisko'
                  : 'Trasa'
              }
              header="inline"
            >
              <Field label="Start">
                <ValueBox
                  value={draft.departureIcao ?? ''}
                  placeholder="wybierz lotnisko"
                  {...airfieldValueProps(draft.departureIcao)}
                  actionIcon="search"
                  onPress={() => setSheet({ kind: 'airfield', role: 'departure' })}
                  accessibilityLabel={`Lotnisko startu ${draft.departureIcao ?? 'niewybrane'} — zmień`}
                />
              </Field>
              {!(draft.operation != null && isSameFieldOperation(draft.operation)) && (
                <Field label="Lądowanie">
                  <ValueBox
                    value={draft.arrivalIcao ?? ''}
                    placeholder="wybierz lotnisko"
                    {...airfieldValueProps(draft.arrivalIcao)}
                    actionIcon="search"
                    onPress={() => setSheet({ kind: 'airfield', role: 'arrival' })}
                    accessibilityLabel={`Lotnisko lądowania ${draft.arrivalIcao ?? 'niewybrane'} — zmień`}
                  />
                </Field>
              )}
            </Card>

            <Card
              title="Klient"
              header="inline"
              headerRight={<Tag label="opcjonalne" tone="neutral" />}
            >
              <ValueBox
                variant="text"
                value={draft.client ?? ''}
                placeholder="np. nazwa klubu skoczków"
                actionIcon="edit"
                onPress={() => setSheet({ kind: 'client' })}
                accessibilityLabel={`Klient ${draft.client ?? 'pusty'} — zmień`}
              />
            </Card>

            {/* Notatka MA WŁASNE MIEJSCE (zgłoszenie z urządzenia) — do przebudowy
                mieszkała w arkuszu czasów, czyli w oknie służącym do czegoś innego. */}
            <Card
              title="Notatka do sesji"
              header="inline"
              headerRight={<Tag label="opcjonalne" tone="neutral" />}
            >
              <ValueBox
                variant="text"
                value={draft.notes ?? ''}
                placeholder="np. skąd pochodzi ten wpis"
                actionIcon="edit"
                onPress={() => setSheet({ kind: 'notes' })}
                accessibilityLabel={`Notatka ${draft.notes ?? 'pusta'} — zmień`}
              />
            </Card>
          </>
        )}

        {/* ══ KROK 3 — PRZEBIEG SESJI: bieg silnika, a w nim loty i zrzuty ═══
            Do issue #62 były tu DWIE PŁASKIE LISTY („Loty" i „Zrzuty"), przez co
            zrzut nie miał jak pokazać, do którego lotu należy — mimo że domena
            definiuje to zawieraniem się w czasie (`DROP_ON_GROUND`). Odtąd jest oś,
            ta sama, którą pilot ogląda w kokpicie i w rozliczeniu. Uzasadnienie
            w całości: `logic/manualFlightAxis.ts`. */}
        {step === 'times' && (
          <>
            {/* KARTY „BIEG SILNIKA" TU NIE MA (issue #62, czwarta tura z urządzenia):
                niosła parę godzin, którą oś rysuje jako swój pierwszy i ostatni wiersz —
                „dubluje się «bieg silnika» z tym, co mam na osi czasu, nie ma sensu ten
                input". Oba końce osi startują z `--:--` i SĄ wejściem w ich wpisanie,
                więc pusty krok 3 i krok 3 z pełną sesją to ten sam ekran w dwóch
                stanach, a nie dwa różne układy.

                Reguła „nie da się dodać lotu bez biegu silnika" (pkt 10) zostaje
                w mocy — pilnuje jej BRAK wiersza „DODAJ LOT", nie wyszarzony przycisk
                (zasada z 10B i 02G). Powód niesie „DALEJ" na dole.

                Karta ma pasek nagłówka i `flush` — dokładnie jak „Przebieg sesji"
                na ekranie rozliczenia: oś sama trzyma swoje wiersze, a stopka sum
                ma dobijać do krawędzi. Bez „czasy UTC" w nagłówku (inaczej niż tam):
                podtytuł kroku mówi to zdanie o dwie linie wyżej. */}
            <Card title="Przebieg sesji" flush>
                <SessionAxis
                  rows={axis.rows}
                  foot={axis.foot}
                  /* Każdy wiersz otwiera SWÓJ arkusz — inaczej niż w rozliczeniu,
                     gdzie oś jest opisowa (issue #40) i ołówków nie ma. Tutaj jest
                     formularzem, więc cel dotknięcia i ołówek są jego treścią. */
                  onCorrect={(rowId) => {
                    const target = manualAxisTarget(rowId);
                    if (target == null) return;
                    if (target.kind === 'engine') {
                      setSheet({ kind: 'engine', field: target.field });
                    } else if (target.kind === 'flight') {
                      setSheet({ kind: 'flight', id: target.id, field: target.field });
                    } else {
                      setSheet({ kind: 'drop', id: target.id });
                    }
                  }}
                />

              {/* Dopisanie jako OSTATNIE WIERSZE OSI, nie przyciski pod kartą
                  (wzorzec „DODAJ WPIS", issue #43): nowy lot i nowy zrzut trafią
                  w przebieg sesji, więc wejście stoi tam, gdzie skończy się skutek.

                  „DODAJ LOT" istnieje dopiero z BIEGIEM SILNIKA (issue #62 pkt 10):
                  lot bez niego nie ma w czym się zawierać, a nowy lot dziedziczy
                  jego granice — bez nich nie byłoby czego podstawić. */}
              {engineRunSet && (
                <AxisAddRow
                  label="DODAJ LOT"
                  onPress={() => setSheet({ kind: 'flight', id: null })}
                />
              )}

              {/* Zrzuty WYŁĄCZNIE w dniu skokowym (issue #19) — to brak wiersza,
                  nie blokada z powodem: przy przelocie zrzut nie może się wydarzyć.
                  Bez ani jednego lotu też go nie ma: `nextDropAt` nie miałby czego
                  podstawić, a zrzut na ziemi jest tym, przed czym ta oś ostrzega. */}
              {jumpDay && flights.length > 0 && (
                <AxisAddRow
                  label="DODAJ ZRZUT"
                  tone="muted"
                  onPress={() => setSheet({ kind: 'drop', id: null })}
                />
              )}
            </Card>

            {/* Zrzut poza każdym lotem — miękka reguła domeny `DROP_ON_GROUND`. Do
                issue #62 to zdanie padało dopiero na kroku 4, czyli ekran po tym, na
                którym godzinę się wpisuje; ostrzeżenie ma stać tam, gdzie da się je
                naprawić. NIE blokuje: fakt lotu jest cenniejszy niż kompletność
                formularza. Wiersz osi mówi KTÓRY zrzut, baner — co z tym zrobić. */}
            {strayDrops > 0 && (
              <Banner
                kind="warning"
                tone="amber"
                icon="warning"
                text={
                  strayDrops === 1
                    ? 'Jeden zrzut wypada poza wszystkimi lotami — popraw jego godzinę albo dopisz lot, w którym się odbył.'
                    : `${strayDrops} zrzuty wypadają poza wszystkimi lotami — popraw ich godziny albo dopisz loty, w których się odbyły.`
                }
              />
            )}
          </>
        )}

        {/* ══ KROK 4 — LICZNIKI, PALIWO I OSTRZEŻENIA ════════════════════════ */}
        {step === 'readings' && (
          <>
            {/* PALIWO JAKO SEKWENCJA (issue #62, piąta tura z urządzenia): „najpierw
                podaję, ile było przed lotem, następnie ile dodałem, oraz później ile
                zostało". Do tej tury były to trzy rozłączne pola w kolejności
                przed → po → dolewki, choć dolewka wypada w czasie MIĘDZY odczytami —
                pilot składał z nich zdanie w głowie. Ta sama oś, co na kroku 3
                i na ekranie rozliczenia; uzasadnienie w `logic/manualFuelChain.ts`. */}
            <Card title="Paliwo" flush>
              <SessionAxis
                rows={fuelChain.rows}
                foot={fuelChain.foot}
                onCorrect={(rowId) => {
                  const target = fuelChainTarget(rowId);
                  if (target == null) return;
                  if (target.kind === 'reading') setSheet({ kind: 'fuel', which: target.which });
                  else setSheet({ kind: 'refuel', id: target.id });
                }}
              />
              <AxisAddRow
                label="DODAJ DOLEWKĘ"
                tone="muted"
                onPress={() => setSheet({ kind: 'refuel', id: null })}
              />
            </Card>

            <Card title="Motogodziny" header="inline">
              <Field label="Przed uruchomieniem">
                <ValueBox
                  value={draft.mhBefore != null ? motoHours(draft.mhBefore, mhFormat) : ''}
                  placeholder="stan licznika"
                  unit="MH"
                  actionIcon="edit"
                  onPress={() => setSheet({ kind: 'mh', which: 'before' })}
                  accessibilityLabel="Motogodziny przed uruchomieniem — wpisz stan"
                />
              </Field>
              <Field label="Po locie">
                <ValueBox
                  value={draft.mhAfter != null ? motoHours(draft.mhAfter, mhFormat) : ''}
                  placeholder="stan licznika"
                  unit="MH"
                  actionIcon="edit"
                  onPress={() => setSheet({ kind: 'mh', which: 'after' })}
                  accessibilityLabel="Motogodziny po locie — wpisz stan"
                />
              </Field>
              {/* Podpisu „przyrost … · blok …" tu NIE MA (issue #62, piąta tura):
                  przyrost licznika NIE RÓWNA SIĘ czasowi blokowemu i nie ma prawa się
                  równać (obrotomierz na wolnych obrotach chodzi wolniej niż zegar),
                  więc zestawianie ich obok sugerowało błąd przy poprawnym odczycie —
                  ta sama poprawka, którą issue #38 wprowadziło na ekranie 10. Przyrost
                  porównuje się z NORMĄ maszyny, w karcie niżej. */}
            </Card>

            {/* ── NORMA: czy to zużycie się zgadza (issue #62, piąta tura) ────────
                „W oparciu o te dane oraz dane z czasu lotu powinniśmy przeliczyć normę
                i sprawdzić, czy się zgadza". Oczekiwanie liczy DOMENA z normy tej
                maszyny (cache referencyjny, więc działa offline) — ta sama arytmetyka,
                którą po zapisaniu pokaże ekran rozliczenia.

                Karty nie ma, gdy nie ma czego pokazać: bez kompletu odczytów albo bez
                normy maszyny ekran MILCZY, zamiast rysować kreski. Werdykt jest
                bursztynowy, nie czerwony — wynik poza pasmem jest DO SPRAWDZENIA,
                a paliwomierz i licznik mają rację (liczniki fizyczne > dane serwera). */}
            {balances.length > 0 && (
              <Card title="Norma zużycia" header="inline">
                {balances.map((b) => (
                  <Field key={b.label} label={b.label}>
                    <ValueBox
                      value={b.actual}
                      tone={b.verdict?.tone ?? 'neutral'}
                      {...(b.verdict != null ? { tag: b.verdict } : {})}
                    />
                    {b.expected != null && (
                      <AppText variant="mono" tone="muted" style={{ fontSize: 9, lineHeight: 14 }}>
                        {normSrc != null ? `${b.expected} · ${normSrc}` : b.expected}
                      </AppText>
                    )}
                  </Field>
                ))}
              </Card>
            )}

            {/* ── olej (issue #60) — tu OPCJONALNY, świadomym wyjątkiem ──────────
                Na 02a pomiar jest krokiem WYMAGANYM (decyzja 2026-08-27), ale lot
                z kartki sprzed tygodnia może uczciwego pomiaru nie mieć, a fakt lotu
                jest cenniejszy niż kompletność formularza (reguła flow 15 — blokera
                NIE MA). Stąd tag „opcjonalnie": tu naprawdę odróżnia. */}
            <Card title="Olej · opcjonalnie" header="inline">
              <Field label="Pomiar i dolewka">
                <ValueBox
                  value={(() => {
                    if (draft.oilL != null) {
                      return (draft.oilAddedL ?? 0) > 0
                        ? `${oilValueText(draft.oilL)} + ${oilValueText(draft.oilAddedL)}`
                        : oilValueText(draft.oilL);
                    }
                    return draft.oilAddedL != null ? `+ ${oilValueText(draft.oilAddedL)}` : '';
                  })()}
                  placeholder="pomiar z bagnetu"
                  unit="L"
                  actionIcon="edit"
                  onPress={() => setSheet({ kind: 'oil' })}
                  accessibilityLabel="Olej — pomiar i dolewka"
                />
              </Field>
              {draft.oilL != null && (draft.oilAddedL ?? 0) > 0 && (
                <AppText variant="mono" tone="muted" style={{ fontSize: 9, lineHeight: 14 }}>
                  {`po dolewce ${oilLitres(draft.oilL + (draft.oilAddedL ?? 0))}`}
                </AppText>
              )}
            </Card>

            {/* Ostrzeżenia z lokalnego rejestru i cache referencyjnego — amber,
                znikają razem z warunkiem, NIGDY nie blokują zapisu. */}
            {warnings.map((w) => (
              <Banner
                key={w.id}
                kind="warning"
                tone="amber"
                icon="warning"
                text={w.src != null ? `${w.text}\n${w.src}` : w.text}
              />
            ))}

            {error != null && (
              <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={error} />
            )}
          </>
        )}
      </View>

      {/* ══ ARKUSZE ══════════════════════════════════════════════════════════ */}

      <FlightDateSheet
        visible={sheet?.kind === 'date'}
        day={draft.day}
        now={Date.now()}
        sessionsInfo={
          pilotDay != null && pilotDay.sessions.length > 0
            ? `${pilotDay.sessions.length} · ${pilotDay.sessions
                .map((s) => s.aircraftId.toUpperCase())
                .join(', ')}`
            : null
        }
        onConfirm={(day) => {
          // Zmiana doby PRZESUWA wpisane godziny razem z dniem — godziny z kartki
          // opisują ten sam poranek, tylko w innej dacie.
          const delta = day - draft.day;
          patch({
            day,
            engineStart: draft.engineStart != null ? draft.engineStart + delta : null,
            engineStop: draft.engineStop != null ? draft.engineStop + delta : null,
            flights: draft.flights.map((f) => ({
              ...f,
              takeoff: f.takeoff + delta,
              landing: f.landing + delta,
            })),
            drops: draft.drops.map((d) => ({ ...d, at: d.at + delta })),
            refuels: draft.refuels.map((r) => ({ ...r, at: r.at + delta })),
          });
          close();
        }}
        onCancel={close}
      />

      <AirfieldSheet
        visible={sheet?.kind === 'airfield'}
        title={
          sheet?.kind === 'airfield' && sheet.role === 'arrival'
            ? 'Lotnisko lądowania'
            : draft.operation != null && isSameFieldOperation(draft.operation)
              ? 'Lotnisko skoków'
              : 'Lotnisko startu'
        }
        currentIcao={
          (sheet?.kind === 'airfield' && sheet.role === 'arrival'
            ? draft.arrivalIcao
            : draft.departureIcao) ?? ''
        }
        position={null}
        onConfirm={(icao) => {
          const value = icao.length > 0 ? icao : null;
          if (sheet?.kind === 'airfield' && sheet.role === 'arrival') {
            patch({ arrivalIcao: value });
          } else {
            patch({ departureIcao: value });
          }
          close();
        }}
        onCancel={close}
      />

      <TextEntrySheet
        visible={sheet?.kind === 'client'}
        title="KLIENT"
        initialText={draft.client ?? ''}
        placeholder="np. nazwa klubu skoczków"
        suggestions={null}
        onConfirm={(text) => {
          patch({ client: text.length > 0 ? text : null });
          close();
        }}
        onCancel={close}
      />

      <TextEntrySheet
        visible={sheet?.kind === 'notes'}
        title="NOTATKA DO SESJI"
        initialText={draft.notes ?? ''}
        placeholder="np. skąd pochodzi ten wpis"
        multiline
        suggestions={null}
        onConfirm={(text) => {
          patch({ notes: text.length > 0 ? text : null });
          close();
        }}
        onCancel={close}
      />

      {/* Godziny biegu są PUSTE, dopóki pilot ich nie wpisze (issue #62 pkt 3): do #62
          arkusz otwierał się z 10:00 i 11:00, a potem mierzył od nich przesunięcie
          i tymi liczbami ruszał przy ±1 min. Ta sama reguła, która każe wpisywać
          paliwo przed uruchomieniem zamiast brać je z cache. */}
      <FlightTimesSheet
        visible={sheet?.kind === 'engine'}
        title={engineSheetTitle(sheet)}
        durationLabel="Blok"
        fields={engineSheetFields(sheet, draft)}
        min={dayMin}
        max={dayMax}
        onConfirm={(v) => {
          patch({ engineStart: v['start']!, engineStop: v['stop']! });
          close();
        }}
        onCancel={close}
      />

      <FlightTimesSheet
        visible={sheet?.kind === 'flight'}
        title={flightSheetTitle(sheet, flights)}
        durationLabel="Czas lotu"
        fields={flightSheetFields(sheet, draft)}
        min={flightBounds.min}
        max={flightBounds.max}
        /* Lot MUSI mieścić się w biegu silnika (issue #62, trzecia tura): arkusz
           przyjmował start po wyłączeniu bez słowa, a odmowa padała dopiero przy
           „DALEJ". Nie jako `min`/`max`, bo te przycięłyby wpis po cichu. */
        {...(draft.engineStart != null && draft.engineStop != null
          ? {
              bounds: {
                from: draft.engineStart,
                to: draft.engineStop,
                label: 'biegu silnika',
                format: timeUtc,
              },
            }
          : {})}
        onDelete={
          sheet?.kind === 'flight' && sheet.id != null
            ? () => {
                patch({ flights: draft.flights.filter((f) => f.id !== sheet.id) });
                close();
              }
            : undefined
        }
        onConfirm={(v) => {
          if (sheet?.kind !== 'flight') return;
          if (sheet.id == null) {
            patch({
              flights: [
                ...draft.flights,
                { id: uuidv4(), takeoff: v['takeoff']!, landing: v['landing']! },
              ],
            });
          } else {
            patch({
              flights: draft.flights.map((f) =>
                f.id === sheet.id ? { ...f, takeoff: v['takeoff']!, landing: v['landing']! } : f,
              ),
            });
          }
          close();
        }}
        onCancel={close}
      />

      <ManualDropSheet
        visible={sheet?.kind === 'drop'}
        title={dropSheetTitle(sheet, [...draft.drops].sort((a, b) => a.at - b.at))}
        value={dropSheetValue(sheet, draft)}
        min={dayMin}
        max={dayMax}
        onDelete={
          sheet?.kind === 'drop' && sheet.id != null
            ? () => {
                patch({ drops: draft.drops.filter((d) => d.id !== sheet.id) });
                close();
              }
            : undefined
        }
        onConfirm={(v) => {
          if (sheet?.kind !== 'drop') return;
          if (sheet.id == null) {
            patch({ drops: [...draft.drops, { id: uuidv4(), ...v }] });
          } else {
            patch({
              drops: draft.drops.map((d) => (d.id === sheet.id ? { ...d, ...v } : d)),
            });
          }
          close();
        }}
        onCancel={close}
      />

      <RefuelEntrySheet
        visible={sheet?.kind === 'refuel'}
        title={refuelSheetTitle(sheet, sortedRefuels(draft))}
        value={refuelSheetValue(sheet, draft)}
        min={dayMin}
        max={dayMax}
        onDelete={
          sheet?.kind === 'refuel' && sheet.id != null
            ? () => {
                patch({ refuels: draft.refuels.filter((r) => r.id !== sheet.id) });
                close();
              }
            : undefined
        }
        onConfirm={(v) => {
          if (sheet?.kind !== 'refuel') return;
          if (sheet.id == null) {
            patch({ refuels: [...draft.refuels, { id: uuidv4(), ...v }] });
          } else {
            patch({
              refuels: draft.refuels.map((r) => (r.id === sheet.id ? { ...r, ...v } : r)),
            });
          }
          close();
        }}
        onCancel={close}
      />

      <ReadingSheet
        visible={sheet?.kind === 'fuel'}
        title={sheet?.kind === 'fuel' && sheet.which === 'before' ? 'Paliwo przed uruchomieniem' : 'Paliwo po locie'}
        unit="L"
        tone="amber"
        initialText={(() => {
          const v = sheet?.kind === 'fuel' && sheet.which === 'before' ? draft.fuelBeforeL : draft.fuelAfterL;
          return v != null ? `${Math.round(v)}` : '';
        })()}
        rows={
          aircraft?.handover != null
            ? [{ label: 'Ostatnie przekazanie', value: litres(aircraft.handover.reading.fuelL) }]
            : []
        }
        parse={parseLitres}
        onConfirm={(v) => {
          if (sheet?.kind !== 'fuel') return;
          patch(sheet.which === 'before' ? { fuelBeforeL: v } : { fuelAfterL: v });
          close();
        }}
        onCancel={close}
      />

      <ReadingSheet
        visible={sheet?.kind === 'mh'}
        title={sheet?.kind === 'mh' && sheet.which === 'before' ? 'Motogodziny przed uruchomieniem' : 'Motogodziny po locie'}
        unit="MH"
        tone="neutral"
        mask={(t) => maskMotoHoursInput(t, mhFormat)}
        initialText={(() => {
          const v = sheet?.kind === 'mh' && sheet.which === 'before' ? draft.mhBefore : draft.mhAfter;
          return v != null ? motoHours(v, mhFormat) : '';
        })()}
        rows={
          aircraft?.handover != null
            ? [{ label: 'Ostatnie przekazanie', value: motoHours(aircraft.handover.reading.mh, mhFormat) }]
            : []
        }
        parse={parseMotoHours}
        onConfirm={(v) => {
          if (sheet?.kind !== 'mh') return;
          patch(sheet.which === 'before' ? { mhBefore: v } : { mhAfter: v });
          close();
        }}
        onCancel={close}
      />

      {/* ── arkusz pomiaru oleju (issue #60) — TEN SAM komponent co na 02a ────
          Bez wiersza „Oczekiwane wg normy": wpis opisuje przeszłość (patrz
          `oilConfig` wyżej). Minimum i zbiornik zostają — to konfiguracja
          jednostki, nie rachunek na dziś. */}
      <OilSheet
        visible={sheet?.kind === 'oil'}
        initialLevelText={oilValueText(draft.oilL)}
        initialAddedText={oilValueText(draft.oilAddedL)}
        parse={parseLitres}
        rows={[
          ...(aircraft?.oilMinL != null
            ? [{ label: `Minimum przed lotem · ${aircraft.reg}`, value: oilLitres(aircraft.oilMinL) }]
            : []),
          ...(aircraft?.oilCapacityL != null
            ? [{ label: `Zbiornik oleju · ${aircraft.reg}`, value: oilLitres(aircraft.oilCapacityL) }]
            : []),
        ]}
        afterRowFor={(l, a) => oilAfterRow(l, a, oilConfig)}
        warningFor={(l, a) => oilEntryWarning(l, a, oilConfig, null)}
        onConfirm={(l, a) => {
          patch({ oilL: l, oilAddedL: a });
          close();
        }}
        onCancel={close}
      />
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze — wartości startowe arkuszy (poza JSX, żeby dało się je czytać)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wiersz dopisania na końcu osi — 44 px celu dotknięcia i kreska nad nim, dokładnie
 * jak „DODAJ WPIS" w trybie edycji rozliczenia (issue #43). Plus, nie ołówek: ołówek
 * obiecuje poprawianie istniejącej wartości.
 */
function AxisAddRow({
  label,
  tone = 'green',
  onPress,
}: {
  label: string;
  tone?: 'green' | 'muted';
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const color = tone === 'green' ? theme.colors.green : theme.colors.textMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.axisAdd,
        { borderTopColor: theme.colors.border },
        pressed ? { backgroundColor: theme.colors.surfaceHover } : null,
      ]}
    >
      <Icon name="add" size={13} color={color} />
      <AppText variant="mono" style={{ ...styles.axisAddLabel, color }}>
        {label}
      </AppText>
    </Pressable>
  );
}

type EngineSheetState = { kind: 'engine'; field?: 'start' | 'stop' } | { kind: string } | null;

/**
 * Tytuł arkusza biegu silnika. Edycja jednego końca nazywa TEN koniec — pilot tapnął
 * w „Uruchomienie" na osi i ma dostać arkusz o tej samej nazwie (issue #62, trzecia
 * tura); wejście z karty otwiera parę i tytuł mówi o całości.
 */
function engineSheetTitle(sheet: EngineSheetState): string {
  if (sheet == null || sheet.kind !== 'engine') return 'BIEG SILNIKA';
  const field = (sheet as { field?: 'start' | 'stop' }).field;
  if (field === 'start') return 'URUCHOMIENIE';
  if (field === 'stop') return 'WYŁĄCZENIE';
  return 'BIEG SILNIKA';
}

/**
 * Pola arkusza biegu: edytowany koniec jako kontrolka, drugi jako wiersz odniesienia.
 * Bez `field` (wejście z karty) edytowalne są oba — para powstaje wtedy w całości.
 */
function engineSheetFields(sheet: EngineSheetState, draft: ManualFlightDraft) {
  const field = sheet != null && sheet.kind === 'engine'
    ? (sheet as { field?: 'start' | 'stop' }).field
    : undefined;
  return [
    {
      key: 'start',
      label: 'Uruchomienie',
      value: draft.engineStart,
      ...(field === 'stop' ? { readOnly: true } : {}),
    },
    {
      key: 'stop',
      label: 'Wyłączenie',
      value: draft.engineStop,
      ...(field === 'start' ? { readOnly: true } : {}),
    },
  ];
}

type FlightSheetState =
  | { kind: 'flight'; id: string | null; field?: 'takeoff' | 'landing' }
  | { kind: string }
  | null;

/** Który koniec pary pilot tapnął; `undefined` = wejście otwierające parę w całości. */
function flightSheetField(sheet: FlightSheetState): 'takeoff' | 'landing' | undefined {
  if (sheet == null || sheet.kind !== 'flight') return undefined;
  return (sheet as { field?: 'takeoff' | 'landing' }).field;
}

function flightSheetTitle(
  sheet: FlightSheetState,
  flights: { id: string }[],
): string {
  if (sheet == null || sheet.kind !== 'flight') return 'LOT';
  const s = sheet as { kind: 'flight'; id: string | null };
  if (s.id == null) return 'DODAJ LOT';
  const index = flights.findIndex((f) => f.id === s.id);
  // „START · LOT 2" — dokładnie ten tytuł niesie mockup 15D. Edycja jednego końca
  // nazywa go pierwsza, bo to on jest pytaniem arkusza; numer lotu mówi, którego.
  const field = flightSheetField(sheet);
  const name = field === 'takeoff' ? 'START' : field === 'landing' ? 'LĄDOWANIE' : null;
  return name != null ? `${name} · LOT ${index + 1}` : `LOT ${index + 1}`;
}

/**
 * Wartości startowe pary start–lądowanie: edytowany lot swoje, NOWY lot dziedziczy
 * granice BIEGU SILNIKA (issue #62 pkt 8 — uzasadnienie przy `nextFlightTimes`).
 */
function flightSheetFields(sheet: FlightSheetState, draft: ManualFlightDraft) {
  if (sheet == null || sheet.kind !== 'flight') return [];
  const s = sheet as { kind: 'flight'; id: string | null };
  const existing = s.id != null ? draft.flights.find((f) => f.id === s.id) : null;
  if (existing != null) {
    // Edytowany koniec jest kontrolką, drugi wierszem odniesienia — pilot poprawia
    // godzinę WZGLĘDEM niego, a reguła kolejności ma co porównać (issue #62).
    const field = flightSheetField(sheet);
    return [
      {
        key: 'takeoff',
        label: 'Start',
        value: existing.takeoff,
        ...(field === 'landing' ? { readOnly: true } : {}),
      },
      {
        key: 'landing',
        label: 'Lądowanie',
        value: existing.landing,
        ...(field === 'takeoff' ? { readOnly: true } : {}),
      },
    ];
  }
  // Wiersz „DODAJ LOT" istnieje wyłącznie przy wpisanym biegu, więc `null` tu nie
  // wejdzie — a gdyby weszło, arkusz otworzy się pusty i blokada każe wpisać godziny.
  const next = nextFlightTimes(draft);
  return [
    { key: 'takeoff', label: 'Start', value: next?.takeoff ?? null },
    { key: 'landing', label: 'Lądowanie', value: next?.landing ?? null },
  ];
}

type DropSheetState = { kind: 'drop'; id: string | null } | { kind: string } | null;

function dropSheetTitle(sheet: DropSheetState, drops: { id: string }[]): string {
  if (sheet == null || sheet.kind !== 'drop') return 'ZRZUT';
  const s = sheet as { kind: 'drop'; id: string | null };
  if (s.id == null) return 'DODAJ ZRZUT';
  return `ZRZUT ${drops.findIndex((d) => d.id === s.id) + 1}`;
}

/**
 * Nowy zrzut ląduje w połowie PIERWSZEGO lotu, który zrzutu jeszcze nie ma (issue #62
 * pkt 9 — uzasadnienie przy `nextDropAt`). Do #62 trafiał zawsze w połowę OSTATNIEGO,
 * więc na dniu skokowym wszystkie wpadały do tego samego lotu.
 *
 * SKŁAD I WYSOKOŚĆ DZIEDZICZY PO POPRZEDNIM zrzucie (czwarta tura z urządzenia):
 * dzień skokowy to ta sama maszyna, ten sam klub i zwykle ta sama wysokość wyniesienia
 * lot po locie, więc wbijanie tych samych liczb od nowa przy każdym wyniesieniu było
 * pracą, której formularz miał materiał nie wymagać. Godzina zostaje wyliczana — ta
 * akurat jest za każdym razem inna.
 */
function dropSheetValue(sheet: DropSheetState, draft: ManualFlightDraft) {
  if (sheet != null && sheet.kind === 'drop') {
    const s = sheet as { kind: 'drop'; id: string | null };
    const existing = s.id != null ? draft.drops.find((d) => d.id === s.id) : null;
    if (existing != null) {
      return { at: existing.at, jumpers: existing.jumpers, altitudeFt: existing.altitudeFt };
    }
  }
  // Wiersz „DODAJ ZRZUT" pokazuje się dopiero przy pierwszym locie, więc `null`
  // tu nie wejdzie; awaryjnie bierzemy uruchomienie silnika.
  const at = nextDropAt(draft) ?? draft.engineStart ?? draft.day + 10 * HOUR;
  const previous = previousDrop(draft, at);
  return {
    at,
    jumpers: previous?.jumpers ?? null,
    altitudeFt: previous?.altitudeFt ?? null,
  };
}

type RefuelSheetState = { kind: 'refuel'; id: string | null } | { kind: string } | null;

function refuelSheetTitle(sheet: RefuelSheetState, refuels: { id: string }[]): string {
  if (sheet == null || sheet.kind !== 'refuel') return 'DOLEWKA';
  const s = sheet as { kind: 'refuel'; id: string | null };
  if (s.id == null) return 'DODAJ DOLEWKĘ';
  return `DOLEWKA ${refuels.findIndex((r) => r.id === s.id) + 1}`;
}

/** Nowa dolewka staje kwadrans przed uruchomieniem — dolewa się przed biegiem. */
function refuelSheetValue(sheet: RefuelSheetState, draft: ManualFlightDraft) {
  if (sheet != null && sheet.kind === 'refuel') {
    const s = sheet as { kind: 'refuel'; id: string | null };
    const existing = s.id != null ? draft.refuels.find((r) => r.id === s.id) : null;
    if (existing != null) {
      return { at: existing.at, addedL: existing.addedL, afterL: existing.afterL };
    }
  }
  return {
    at: (draft.engineStart ?? draft.day + 10 * HOUR) - 15 * MIN,
    addedL: 0,
    afterL: draft.fuelBeforeL ?? 0,
  };
}

const styles = StyleSheet.create({
  // 44 px celu dotknięcia i kreska nad wierszem — jak „DODAJ WPIS" na osi edycji (10D).
  axisAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderTopWidth: 1,
  },
  axisAddLabel: { fontSize: 10, letterSpacing: 1.5 },
});
