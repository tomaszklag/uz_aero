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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  CommonActions,
  usePreventRemove,
  type NavigationAction,
} from '@react-navigation/native';

import {
  AbandonDraftSheet,
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
  type MhFormat,
  type OperationType,
  type ReferenceAircraft,
  type ReferencePilot,
} from '../../domain';
import {
  emptyManualFlightDraft,
  manualFlightDirty,
  manualFlightStepBlocker,
  fuelAtStartL,
  fuelUsedL,
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
import {
  fuelAfterReference,
  fuelBeforeReference,
  fuelContinuityWarnings,
  mhAfterReference,
  mhBeforeReference,
  mhContinuityWarnings,
  oilContinuityWarnings,
  oilReference,
} from './logic/readingsContinuity';
import {
  prefillSource,
  readingsPrefill,
  type AppliedPrefill,
} from './logic/readingsPrefill';
import { useReadingsChain } from '../hooks/useReadingsChain';
import type { RemoteReadingsChain } from '../../application';
import { manualFuelBalance, manualMhBalance } from './logic/manualFlightBalance';
import { jumpDayWithoutDrop, manualFlightWarnings } from './logic/manualFlightWarnings';
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
  // `dispatch` wykonuje akcję nawigacji zatrzymaną przez bramkę rezygnacji — jak na 02.
  navigation: {
    navigate: (screen: string) => void;
    goBack: () => void;
    dispatch: (action: NavigationAction) => void;
  };
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
  /** Doba, z jaką szkic powstał — punkt odniesienia dla `manualFlightDirty`. */
  const pristineDay = useRef(draft.day).current;
  const patch = useCallback((over: Partial<ManualFlightDraft>) => {
    setDraft((d) => ({ ...d, ...over }));
  }, []);

  /* ── bramka „wstecz": krok wstecz, a z pierwszego kroku — rezygnacja ───────────
   *
   * Zgłoszenie z urządzenia (2026-08-29): „jak cofam z definicji zadania, to jest
   * cofnięcie do ekranu startu. Powinno cofać się do wyboru dnia i pilota".
   *
   * Cały stepper jest JEDNYM ekranem nawigacji, a krok to jego stan — więc przycisk
   * sprzętowy i gest krawędziowy zdejmowały ze stosu CAŁY wpis, nie krok. Strzałka
   * w nagłówku robiła to dobrze od początku i właśnie ta różnica jest usterką: dwa
   * „wstecz" na jednym ekranie mają robić to samo.
   *
   * Ta sama mechanika, co przy rezygnacji z preflightu (issue #55) i przy blokadzie
   * kokpitu (04D) — `usePreventRemove`, bo obejmuje i przycisk, i gest.
   */
  const [leaveAction, setLeaveAction] = useState<NavigationAction | null>(null);
  const [leaving, setLeaving] = useState(false);
  const dirty = manualFlightDirty(draft, pristineDay);

  usePreventRemove(!leaving && (stepIndex > 0 || dirty), ({ data }) => {
    // Z dalszego kroku „wstecz" znaczy KROK WSTECZ — akcję nawigacji porzucamy.
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
      return;
    }
    setLeaveAction(data.action);
  });

  // Zatrzymana akcja jedzie dopiero PO re-renderze z opuszczoną bramką: dispatch w tym
  // samym tiku trafiłby w listener pamiętający jeszcze bramkę podniesioną (issue #55).
  useEffect(() => {
    if (leaving && leaveAction != null) navigation.dispatch(leaveAction);
  }, [leaving, leaveAction, navigation]);

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
    /* Paliwo ma trzy pola i ani jednej godziny (issue #62, siódma tura) — arkusza
       dolewki z własnym czasem już nie ma. */
    | { kind: 'fuel'; which: 'found' | 'added' | 'after' }
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
    // Wymóg Duala (issue #58 pkt 4) jedzie odtąd bramką jak każdy inny powód — baner
    // pod listą wyboru zniknął (uwaga z urządzenia 2026-08-29, `dualRequirement.ts`).
    dualRequired: aircraft?.dualRequired === true,
  });
  /* Łańcuch odczytów pytany PUNKTOWO, gdy znamy już godzinę uruchomienia (issue #62,
     piąta tura). `null` = nie wiadomo teraz i ekran wtedy o ciągłości milczy. */
  const { chain } = useReadingsChain(
    draft.aircraftId,
    draft.engineStart,
    step === 'readings',
  );

  /**
   * ODCZYTY ZASTANE WYKRYWAJĄ SIĘ Z POPRZEDNIEGO LOTU (issue #62, siódma tura:
   * „system wykrywa ilość paliwa w oparciu o poprzedzający lot" — i ósma, która
   * rozciągnęła to na LICZNIK, bo `readings-chain` niesie MH sąsiada tą samą odpowiedzią).
   *
   * Decyzję „czy wolno wpisać się w to pole" trzyma `readingsPrefill` z testami, nie ten
   * efekt: reguła brzmi „puste jest niczyje, nasza poprzednia podpowiedź jest nasza,
   * reszta należy do pilota" i ma cztery gałęzie, których w efekcie nikt by nie sprawdził.
   */
  const applied = useRef<AppliedPrefill | null>(null);
  useEffect(() => {
    const result = readingsPrefill(draft.aircraftId, chain?.before, applied.current, {
      foundL: draft.fuel.foundL,
      mhBefore: draft.mhBefore,
    });
    if (result == null) return;
    applied.current = result.applied;
    setDraft((d) => ({
      ...d,
      fuel: { ...d.fuel, foundL: result.fields.foundL },
      mhBefore: result.fields.mhBefore,
    }));
  }, [chain, draft.aircraftId, draft.fuel.foundL, draft.mhBefore]);
  // Źródło stoi przy polu, żeby liczba nie udawała odczytu z przyrządu — i gaśnie, gdy
  // pilot ją poprawi: przy jego własnym odczycie byłoby zwyczajnie nieprawdziwe.
  const foundSrc = prefillSource(chain?.before, 'fuelL', draft.fuel.foundL);
  const mhBeforeSrc = prefillSource(chain?.before, 'mh', draft.mhBefore);

  const warnings = useMemo(
    () => {
      if (step !== 'readings') return [];
      const local = manualFlightWarnings(draft, {
        pilotDay,
        handover: aircraft?.handover ?? null,
        mhFormat,
        fetchedAt: aircraft?.fetchedAt ?? null,
      });
      /* Ciągłość idzie PIERWSZA: mówi o rozjeździe z cudzym odczytem, czyli o czymś,
         czego pilot nie widzi nigdzie indziej. Reszta ostrzeżeń dotyczy jego własnych
         liczb, które ma przed oczami na tym samym ekranie. */
      const continuity = [
        /* Ogniwem łańcucha jest ZASTANE — dokładnie ta liczba, którą poprzedni pilot
           zostawił w zbiorniku. Odkąd szkic trzyma ją wprost, nie trzeba już niczego
           cofać o poranne dolewki (issue #62, siódma tura). */
        ...fuelContinuityWarnings(chain, draft.fuel.foundL, draft.fuel.afterL),
        ...mhContinuityWarnings(chain, mhFormat, draft.mhBefore, draft.mhAfter),
        ...oilContinuityWarnings(chain, draft.oilL),
      ];

      /* Gdy łańcuch odpowiedział, jego ostrzeżenia WYPIERAJĄ te liczone z przekazania:
         `handover` mówi „ile jest teraz", a wpis dotyczy przeszłej chwili — dwa zdania
         o tej samej liczbie, z których jedno jest mniej trafne, to szum. Bez łańcucha
         (offline, pierwszy lot maszyny) zostają lokalne, dokładnie jak dotąd. */
      const superseded =
        chain?.before != null ? local.filter((w) => w.id !== 'mh-chain' && w.id !== 'fuel-chain') : local;

      return [...continuity, ...superseded];
    },
    [step, draft, pilotDay, aircraft, mhFormat, chain],
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

  // ── krok 4: paliwo i werdykt normy (issue #62, piąta i siódma tura) ────────
  const startL = fuelAtStartL(draft);
  const used = fuelUsedL(draft);
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
          /* Strzałka robi DOKŁADNIE to samo, co przycisk sprzętowy — łącznie z pytaniem
             o rezygnację nad niepustym formularzem. Dwa „wstecz" na jednym ekranie,
             które zachowują się różnie, to była pierwsza połowa zgłoszenia. */
          onBack={() => {
            if (stepIndex > 0) setStepIndex(stepIndex - 1);
            else if (dirty) setLeaveAction(CommonActions.navigate('MyDay'));
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
                plakietka nagłówka mówi o WŁAŚCIWOŚCI maszyny, a o blokadzie mówi
                „DALEJ" (uwaga z urządzenia 2026-08-29). Baner „Wymagana załoga
                dwuosobowa" USUNIĘTY: powód blokady ma jedno miejsce w całej
                aplikacji — wnętrze przycisku, który nie działa. */}
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

            {/* Dzień skokowy z pustym logiem zrzutów (zgłoszenie z urządzenia,
                2026-08-29). Ten sam rachunek, co przy zrzucie poza lotem: ostrzeżenie
                stoi na kroku, na którym da się je naprawić — wiersz „DODAJ ZRZUT" jest
                dwa centymetry wyżej. Zapisu NIE blokuje: lot skokowy bez wyniesienia
                zdarza się naprawdę (chmura, powrót z pełną kabiną). */}
            {jumpDayWithoutDrop(draft) && (
              <Banner
                kind="warning"
                tone="amber"
                icon="warning"
                text="Zadanie to skoki, a w logu nie ma ani jednego zrzutu — dopisz go na osi albo zostaw, jeśli wyniesienie się nie odbyło."
              />
            )}
          </>
        )}

        {/* ══ KROK 4 — LICZNIKI, PALIWO I OSTRZEŻENIA ════════════════════════ */}
        {step === 'readings' && (
          <>
            {/* PALIWO TO TRZY LICZBY I ANI JEDNA GODZINA (issue #62, siódma tura
                z urządzenia): zastane → dolane → zostało. Kolejność pól zastępuje
                godziny, bo tankuje się przed lotem — uzasadnienie przy
                `ManualFlightFuel`. Sekwencja na osi i lista dolewek z osobnymi
                godzinami ZNIKŁY: pytały o minutę, która nigdzie nie waży, a pozwalały
                wyrazić stan, który domena i tak odrzuca. */}
            <Card title="Paliwo" header="inline">
              <Field label="Zastane">
                <ValueBox
                  value={draft.fuel.foundL != null ? String(Math.round(draft.fuel.foundL)) : ''}
                  placeholder="odczyt z paliwomierza"
                  unit="L"
                  tone="amber"
                  {...(foundSrc != null ? { meta: foundSrc } : {})}
                  actionIcon="edit"
                  onPress={() => setSheet({ kind: 'fuel', which: 'found' })}
                  accessibilityLabel="Paliwo zastane — wpisz odczyt"
                />
              </Field>

              <Field label="Dolane">
                <ValueBox
                  value={draft.fuel.addedL > 0 ? String(Math.round(draft.fuel.addedL)) : ''}
                  placeholder="nie tankowałem"
                  unit="L"
                  tone="amber"
                  actionIcon="edit"
                  onPress={() => setSheet({ kind: 'fuel', which: 'added' })}
                  accessibilityLabel="Paliwo dolane przed lotem — wpisz ilość"
                />
              </Field>

              <Field label="Po locie">
                <ValueBox
                  value={draft.fuel.afterL != null ? String(Math.round(draft.fuel.afterL)) : ''}
                  placeholder="odczyt z paliwomierza"
                  unit="L"
                  tone="amber"
                  actionIcon="edit"
                  onPress={() => setSheet({ kind: 'fuel', which: 'after' })}
                  accessibilityLabel="Paliwo po locie — wpisz odczyt"
                />
              </Field>

              {/* Rachunek pokazujemy dopiero, gdy ma z czego wyjść — kreska przy
                  niepełnych danych byłaby liczbą o niczym. */}
              {used != null && startL != null && (
                <AppText variant="mono" tone="muted" style={{ fontSize: 9, lineHeight: 14 }}>
                  {`zużycie ${litres(used)} · przed startem ${Math.round(startL)} L − po locie ${Math.round(draft.fuel.afterL!)} L`}
                </AppText>
              )}
            </Card>

            <Card title="Motogodziny" header="inline">
              <Field label="Przed uruchomieniem">
                <ValueBox
                  value={draft.mhBefore != null ? motoHours(draft.mhBefore, mhFormat) : ''}
                  placeholder="stan licznika"
                  unit="MH"
                  {...(mhBeforeSrc != null ? { meta: mhBeforeSrc } : {})}
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
            /* Paliwa nie przesuwamy — nie ma już własnych godzin (issue #62, siódma
               tura): godzina dolewki wyprowadza się przy zapisie z biegu silnika,
               który właśnie przesunęliśmy razem z dobą. */
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

      {/* JEDEN arkusz na trzy pola paliwa — ten sam `ReadingSheet`, co wszędzie
          indziej, tylko z innym tytułem i innym wierszem odniesienia. Arkusza dolewki
          z własną godziną NIE MA (issue #62, siódma tura). */}
      <ReadingSheet
        visible={sheet?.kind === 'fuel'}
        title={fuelSheetTitle(sheet)}
        unit="L"
        tone="amber"
        initialText={(() => {
          if (sheet?.kind !== 'fuel') return '';
          const v =
            sheet.which === 'found'
              ? draft.fuel.foundL
              : sheet.which === 'added'
                ? (draft.fuel.addedL > 0 ? draft.fuel.addedL : null)
                : draft.fuel.afterL;
          return v != null ? `${Math.round(v)}` : '';
        })()}
        /* Liczba Z PODANYM ŹRÓDŁEM (issue #62, piąta tura): co poprzedni pilot zostawił,
           a co zastał następny. Stan zastany JEST podstawiany z poprzedniego lotu
           (siódma tura — decyzja użytkownika), ale źródło zostaje widoczne i pilot
           poprawia go jednym tapnięciem: paliwomierz bije rachubę. */
        rows={fuelSheetRows(sheet, chain, aircraft?.handover ?? null)}
        parse={parseLitres}
        onConfirm={(v) => {
          if (sheet?.kind !== 'fuel') return;
          const fuel = { ...draft.fuel };
          if (sheet.which === 'found') fuel.foundL = v;
          else if (sheet.which === 'added') fuel.addedL = v;
          else fuel.afterL = v;
          patch({ fuel });
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
        /* Ciągłość licznika (issue #62, szósta tura) — ta sama zasada, co przy paliwie:
           odczyt sąsiada ze źródłem, a bez łańcucha ostatnie przekazanie z cache.
           Łańcuch MH jest osią SAMOLOTU (§4.5), więc sąsiad mówi wprost, od czego ten
           wpis powinien zaczynać i na czym kończyć. */
        rows={mhSheetRows(sheet, chain, mhFormat, aircraft?.handover ?? null)}
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
          /* KOTWICA POMIARU idzie pierwsza (issue #62, szósta tura): mówi, od czego
             ten poziom miał startować — a to jest jedyne pytanie ciągłości, na które
             rejestr umie odpowiedzieć. Pary „przed/po" olej NIE MA, bo bagnet tuż po
             locie kłamie i zdanie samolotu oleju nie mierzy (issue #60). */
          ...(oilReference(chain) != null ? [oilReference(chain)!] : []),
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

      {/* Rezygnacja z wpisu — ten sam arkusz, co przy porzuceniu preflightu
          (`design/02h`). Wiersze odniesienia tylko dla FAKTYCZNYCH wyborów: kreska
          niczego nie przypomina. Data stoi w nich zawsze, bo jest pierwszym pytaniem
          kroku 1 i pilot mógł ją zmienić jako jedyną rzecz. */}
      <AbandonDraftSheet
        visible={leaveAction != null && !leaving}
        title="ZREZYGNOWAĆ Z WPISU RĘCZNEGO?"
        rows={[
          { label: 'Data lotu', value: dateUtcDayMonth(draft.day) },
          ...(aircraft != null
            ? [{ label: 'Wybrany samolot', value: `${aircraft.reg} · ${aircraft.type}` }]
            : []),
          ...(draft.operation != null
            ? [{ label: 'Zadanie', value: operationLabel(draft.operation) }]
            : []),
          ...(draft.flights.length > 0
            ? [
                {
                  label: 'Wpisane loty',
                  value: draft.flights.length === 1 ? '1 lot' : `${draft.flights.length} loty`,
                },
              ]
            : []),
        ]}
        onStay={() => setLeaveAction(null)}
        onAbandon={() => setLeaving(true)}
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

/** Tytuł arkusza paliwa — nazywa POLE, bo to ono jest pytaniem tego arkusza. */
function fuelSheetTitle(sheet: { kind: string; which?: string } | null): string {
  if (sheet == null || sheet.kind !== 'fuel') return 'Paliwo';
  if (sheet.which === 'found') return 'Paliwo zastane';
  if (sheet.which === 'added') return 'Paliwo dolane';
  return 'Paliwo po locie';
}

/**
 * Wiersze odniesienia arkusza paliwa: sąsiad z łańcucha, a bez niego — ostatnie
 * przekazanie z cache. Sąsiad wygrywa, bo dotyczy TEJ chwili, a przekazanie mówi
 * „ile jest teraz" (issue #62, piąta tura).
 *
 * Pole „dolane" odniesienia NIE MA i mieć nie może: rejestr nie wie, ile pilot
 * zatankował — zna tylko stany po obu stronach.
 */
function fuelSheetRows(
  sheet: { kind: string; which?: string } | null,
  chain: RemoteReadingsChain | null | undefined,
  handover: { reading: { fuelL: number } } | null,
): { label: string; value: string }[] {
  if (sheet == null || sheet.kind !== 'fuel' || sheet.which === 'added') return [];

  const reference =
    sheet.which === 'after' ? fuelAfterReference(chain) : fuelBeforeReference(chain);
  if (reference != null) return [reference];

  // Bez łańcucha (offline, pierwszy lot maszyny, starszy serwer) zostaje to, co było.
  return handover != null
    ? [{ label: 'Ostatnie przekazanie', value: litres(handover.reading.fuelL) }]
    : [];
}

/** Wiersze odniesienia arkusza motogodzin — jak przy paliwie, sąsiad przed przekazaniem. */
function mhSheetRows(
  sheet: { kind: string; which?: string } | null,
  chain: RemoteReadingsChain | null | undefined,
  format: MhFormat,
  handover: { reading: { mh: number } } | null,
): { label: string; value: string }[] {
  if (sheet == null || sheet.kind !== 'mh') return [];
  const which = sheet.which ?? 'before';

  const reference =
    which === 'before' ? mhBeforeReference(chain, format) : mhAfterReference(chain, format);
  if (reference != null) return [reference];

  return handover != null
    ? [{ label: 'Ostatnie przekazanie', value: motoHours(handover.reading.mh, format) }]
    : [];
}

/*
 * `refuelSheetTitle` i `refuelSheetValue` USUNIĘTE razem z arkuszem dolewki (issue #62,
 * siódma tura). Dolewka nie jest już pozycją listy z własną godziną i własnym numerem —
 * jest jedną liczbą w karcie paliwa, a zdarzenie składa się przy zapisie.
 */

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
