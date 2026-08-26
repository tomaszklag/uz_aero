/**
 * UZ Aero — 15 LOT RĘCZNY (mockupy `design/15-reczny-lot.html` → `15e`, przebudowa
 * 2026-08-16).
 *
 * Wpis CAŁEGO lotu po fakcie — telefon został w kurtce, bateria padła, lot spisany
 * na papierze. Od przebudowy jest STEPPEREM o czterech krokach, jak lot normalny
 * (02 → 02E → 02A), i niesie PEŁNĄ PARITĘ z zapisem automatycznym:
 *  1. samolot · data lotu (domyślnie dzisiejsza) · opcjonalny Dual,
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
import { View } from 'react-native';

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
  OptionGrid,
  ReadingSheet,
  RefuelEntrySheet,
  Screen,
  ScreenHeader,
  SyncChip,
  Tag,
  TextEntrySheet,
  ValueBox,
  type GridOption,
  type PickerOption,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { usePilotDay } from '../hooks/usePilotDay';
import { uuidv4 } from '../../infrastructure/id';
import {
  dateUtcDayMonth,
  dateUtcLong,
  duration,
  litres,
  maskMotoHoursInput,
  motoHours,
  parseLitres,
  parseMotoHours,
  timeUtc,
} from '../format';
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
  manualFlightStepBlocker,
  preRunAddedL,
  sortedFlights,
  toManualFlightInput,
  type ManualFlightDraft,
  type ManualFlightStep,
} from './logic/manualFlight';
import { manualFlightWarnings } from './logic/manualFlightWarnings';
import { operationLabel } from './logic/operations';

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
  const mhFormat = aircraft?.mhFormat ?? 'decimal';

  // Dzień pilota w DOBIE WPISU — materiał ostrzeżenia o kolizji czasów (lokalny
  // rejestr) i wiersza „Sesje w tej dobie" w arkuszu daty.
  const pilotDay = usePilotDay(pilotId, draft.day);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Który arkusz jest otwarty; listy (loty, zrzuty, dolewki) niosą też `id` pozycji.
  type SheetState =
    | { kind: 'date' }
    | { kind: 'dual' }
    | { kind: 'airfield'; role: 'departure' | 'arrival' }
    | { kind: 'client' }
    | { kind: 'notes' }
    | { kind: 'engine' }
    | { kind: 'flight'; id: string | null }
    | { kind: 'drop'; id: string | null }
    | { kind: 'refuel'; id: string | null }
    | { kind: 'fuel'; which: 'before' | 'after' }
    | { kind: 'mh'; which: 'before' | 'after' }
    | null;
  const [sheet, setSheet] = useState<SheetState>(null);
  const close = () => setSheet(null);

  const step = STEPS[stepIndex]!;
  const blocker = manualFlightStepBlocker(step, draft);
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
  const drops = [...draft.drops].sort((a, b) => a.at - b.at);
  const refuels = [...draft.refuels].sort((a, b) => a.at - b.at);
  // Do rachunku zużycia wchodzą tylko dolewki PO odczycie „przed uruchomieniem" —
  // poranne tankowanie już w tym odczycie siedzi (patrz `preRunAddedL`).
  const addedTotal =
    draft.refuels.reduce((sum, r) => sum + r.addedL, 0) - preRunAddedL(draft);

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
            onPress={() => setStepIndex(stepIndex + 1)}
          />
        )
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        {/* ══ KROK 1 — SAMOLOT I DATA ════════════════════════════════════════ */}
        {step === 'aircraft' && (
          <>
            <Card title="Samolot" header="inline">
              {fleet.length === 0 ? (
                <AppText variant="body" tone="muted">
                  Brak samolotów w pamięci urządzenia.
                </AppText>
              ) : (
                <CardPicker
                  options={aircraftOptions}
                  value={draft.aircraftId}
                  onChange={(id) => patch({ aircraftId: id })}
                />
              )}
            </Card>

            {/* Data lotu — POLE z dzisiejszą wartością domyślną, nie napis w nagłówku:
                data z zegara przy wpisie sprzed tygodnia kłamała o tym, czego wpis
                dotyczy (zgłoszenie z urządzenia, 2026-08-16). */}
            <Card title="Data lotu · UTC" header="inline">
              <ValueBox
                value={dateUtcLong(draft.day)}
                actionIcon="clock"
                onPress={() => setSheet({ kind: 'date' })}
                accessibilityLabel={`Data lotu ${dateUtcLong(draft.day)} — zmień`}
              />
              <AppText variant="mono" tone="muted" style={{ fontSize: 9, lineHeight: 14 }}>
                doba liczy się od uruchomienia silnika
              </AppText>
            </Card>

            {/* Dual — OPCJONALNY i dlatego jedyny z plakietką na tym kroku
                (wymagalność jest stanem domyślnym; oznaczamy wyłącznie wyjątki). */}
            <Card
              title="Drugi pilot (Dual)"
              header="inline"
              headerRight={<Tag label="opcjonalne" tone="neutral" />}
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
                value={draft.notes ?? ''}
                placeholder="np. skąd pochodzi ten wpis"
                actionIcon="edit"
                onPress={() => setSheet({ kind: 'notes' })}
                accessibilityLabel={`Notatka ${draft.notes ?? 'pusta'} — zmień`}
              />
            </Card>
          </>
        )}

        {/* ══ KROK 3 — CZASY: bieg silnika, loty, zrzuty ═════════════════════ */}
        {step === 'times' && (
          <>
            <Card title="Bieg silnika" header="inline">
              <ValueBox
                value={
                  draft.engineStart != null && draft.engineStop != null
                    ? `${timeUtc(draft.engineStart)} → ${timeUtc(draft.engineStop)}`
                    : ''
                }
                placeholder="wpisz godziny biegu"

                actionIcon="edit"
                onPress={() => setSheet({ kind: 'engine' })}
                accessibilityLabel="Godziny biegu silnika — zmień"
              />
              {draft.engineStart != null && draft.engineStop != null && (
                <AppText variant="mono" tone="muted" style={{ fontSize: 9, lineHeight: 14 }}>
                  {`blok ${duration(draft.engineStop - draft.engineStart)} · czas w powietrzu ${duration(
                    flights.reduce((sum, f) => sum + Math.max(0, f.landing - f.takeoff), 0),
                  )}`}
                </AppText>
              )}
            </Card>

            <Card title="Loty · start → lądowanie" header="inline">
              {flights.map((f, i) => (
                <Field key={f.id} label={`Lot ${i + 1}`}>
                  <ValueBox
                    value={`${timeUtc(f.takeoff)} → ${timeUtc(f.landing)} · ${duration(f.landing - f.takeoff)}`}
                    actionIcon="edit"
                    onPress={() => setSheet({ kind: 'flight', id: f.id })}
                    accessibilityLabel={`Lot ${i + 1} — popraw czasy`}
                  />
                </Field>
              ))}
              {/* Dopisanie jest OSTATNIM wierszem listy (wzorzec „DODAJ WPIS" z osi,
                  issue #43): nowy lot trafi na koniec, więc wejście stoi tam, gdzie
                  skończy się jego skutek. */}
              <ActionButton
                label="DODAJ LOT"
                tone="green"
                variant="secondary"
                size="md"
                icon="add"
                onPress={() => setSheet({ kind: 'flight', id: null })}
              />
            </Card>

            {/* Zrzuty WYŁĄCZNIE w dniu skokowym (issue #19) — to brak sekcji,
                nie blokada z powodem: przy przelocie zrzut nie może się wydarzyć. */}
            {draft.operation != null && isJumpOperation(draft.operation) && (
              <Card
                title="Zrzuty"
                header="inline"
                headerRight={<Tag label="opcjonalne" tone="neutral" />}
              >
                {drops.map((d, i) => (
                  <Field key={d.id} label={`Zrzut ${i + 1}`}>
                    <ValueBox
                      value={`${timeUtc(d.at)} · ${dropSummary(d.jumpers, d.altitudeFt)}`}
                      actionIcon="edit"
                      onPress={() => setSheet({ kind: 'drop', id: d.id })}
                      accessibilityLabel={`Zrzut ${i + 1} — popraw`}
                    />
                  </Field>
                ))}
                <ActionButton
                  label="DODAJ ZRZUT"
                  tone="green"
                  variant="secondary"
                  size="md"
                  icon="add"
                  onPress={() => setSheet({ kind: 'drop', id: null })}
                />
              </Card>
            )}
          </>
        )}

        {/* ══ KROK 4 — LICZNIKI, PALIWO I OSTRZEŻENIA ════════════════════════ */}
        {step === 'readings' && (
          <>
            <Card title="Paliwo" header="inline">
              <Field label="Przed uruchomieniem">
                <ValueBox
                  value={draft.fuelBeforeL != null ? String(Math.round(draft.fuelBeforeL)) : ''}
                  placeholder="odczyt z paliwomierza"
                  unit="L"
                  tone="amber"
                  actionIcon="edit"
                  onPress={() => setSheet({ kind: 'fuel', which: 'before' })}
                  accessibilityLabel="Paliwo przed uruchomieniem — wpisz odczyt"
                />
              </Field>
              <Field label="Po locie">
                <ValueBox
                  value={draft.fuelAfterL != null ? String(Math.round(draft.fuelAfterL)) : ''}
                  placeholder="odczyt z paliwomierza"
                  unit="L"
                  tone="amber"
                  actionIcon="edit"
                  onPress={() => setSheet({ kind: 'fuel', which: 'after' })}
                  accessibilityLabel="Paliwo po locie — wpisz odczyt"
                />
              </Field>

              <Field label="Dolewki">
                {refuels.map((r, i) => (
                  <ValueBox
                    key={r.id}
                    value={`${timeUtc(r.at)} · +${Math.round(r.addedL)} L → ${Math.round(r.afterL)} L`}

                    tone="amber"
                    actionIcon="edit"
                    onPress={() => setSheet({ kind: 'refuel', id: r.id })}
                    accessibilityLabel={`Dolewka ${i + 1} — popraw`}
                  />
                ))}
                <ActionButton
                  label="DODAJ DOLEWKĘ"
                  tone="green"
                  variant="secondary"
                  size="md"
                  icon="add"
                  onPress={() => setSheet({ kind: 'refuel', id: null })}
                />
              </Field>

              {draft.fuelBeforeL != null && draft.fuelAfterL != null && (
                <AppText variant="mono" tone="muted" style={{ fontSize: 9, lineHeight: 14 }}>
                  {`zużycie ${litres(draft.fuelBeforeL + addedTotal - draft.fuelAfterL)} · ${Math.round(draft.fuelBeforeL)} L${addedTotal > 0 ? ` + ${Math.round(addedTotal)} L dolane` : ''} − ${Math.round(draft.fuelAfterL)} L po locie`}
                </AppText>
              )}
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
              {draft.mhBefore != null && draft.mhAfter != null && draft.engineStart != null && draft.engineStop != null && (
                <AppText variant="mono" tone="muted" style={{ fontSize: 9, lineHeight: 14 }}>
                  {`przyrost ${motoHours(draft.mhAfter - draft.mhBefore, mhFormat)} · blok ${duration(draft.engineStop - draft.engineStart)}`}
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

      <FlightTimesSheet
        visible={sheet?.kind === 'engine'}
        title="BIEG SILNIKA"
        subtitle={`${dateUtcDayMonth(draft.day)} · czasy UTC`}
        durationLabel="Blok"
        fields={[
          { key: 'start', label: 'Uruchomienie', value: draft.engineStart ?? draft.day + 10 * HOUR },
          { key: 'stop', label: 'Wyłączenie', value: draft.engineStop ?? draft.day + 11 * HOUR },
        ]}
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
        subtitle={`${dateUtcDayMonth(draft.day)} · czasy UTC`}
        durationLabel="Czas lotu"
        fields={flightSheetFields(sheet, draft)}
        min={flightBounds.min}
        max={flightBounds.max}
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
        title={dropSheetTitle(sheet, drops)}
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
        title={refuelSheetTitle(sheet, refuels)}
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
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze — wartości startowe arkuszy (poza JSX, żeby dało się je czytać)
// ─────────────────────────────────────────────────────────────────────────────

type FlightSheetState = { kind: 'flight'; id: string | null } | { kind: string } | null;

function flightSheetTitle(
  sheet: FlightSheetState,
  flights: { id: string }[],
): string {
  if (sheet == null || sheet.kind !== 'flight') return 'LOT';
  const s = sheet as { kind: 'flight'; id: string | null };
  if (s.id == null) return 'DODAJ LOT';
  const index = flights.findIndex((f) => f.id === s.id);
  return `LOT ${index + 1}`;
}

/**
 * Wartości startowe pary start–lądowanie: edytowany lot swoje, NOWY lot zaczyna
 * 10 minut po ostatnim lądowaniu (albo 5 minut po uruchomieniu, gdy lotów brak) —
 * typowy rytm dnia skokowego, a pilot i tak poprawia godziny z kartki.
 */
function flightSheetFields(sheet: FlightSheetState, draft: ManualFlightDraft) {
  if (sheet == null || sheet.kind !== 'flight') return [];
  const s = sheet as { kind: 'flight'; id: string | null };
  const existing = s.id != null ? draft.flights.find((f) => f.id === s.id) : null;
  if (existing != null) {
    return [
      { key: 'takeoff', label: 'Start', value: existing.takeoff },
      { key: 'landing', label: 'Lądowanie', value: existing.landing },
    ];
  }
  const flights = sortedFlights(draft);
  const lastLanding = flights.at(-1)?.landing;
  const base =
    lastLanding != null
      ? lastLanding + 10 * MIN
      : (draft.engineStart ?? draft.day + 10 * HOUR) + 5 * MIN;
  return [
    { key: 'takeoff', label: 'Start', value: base },
    { key: 'landing', label: 'Lądowanie', value: base + 30 * MIN },
  ];
}

type DropSheetState = { kind: 'drop'; id: string | null } | { kind: string } | null;

function dropSheetTitle(sheet: DropSheetState, drops: { id: string }[]): string {
  if (sheet == null || sheet.kind !== 'drop') return 'ZRZUT';
  const s = sheet as { kind: 'drop'; id: string | null };
  if (s.id == null) return 'DODAJ ZRZUT';
  return `ZRZUT ${drops.findIndex((d) => d.id === s.id) + 1}`;
}

/** Nowy zrzut zaczyna w połowie ostatniego lotu — tam zwykle pada „drzwi otwarte". */
function dropSheetValue(sheet: DropSheetState, draft: ManualFlightDraft) {
  if (sheet != null && sheet.kind === 'drop') {
    const s = sheet as { kind: 'drop'; id: string | null };
    const existing = s.id != null ? draft.drops.find((d) => d.id === s.id) : null;
    if (existing != null) {
      return { at: existing.at, jumpers: existing.jumpers, altitudeFt: existing.altitudeFt };
    }
  }
  const last = sortedFlights(draft).at(-1);
  const at =
    last != null
      ? last.takeoff + Math.round((last.landing - last.takeoff) / 2)
      : (draft.engineStart ?? draft.day + 10 * HOUR) + 20 * MIN;
  return { at, jumpers: null, altitudeFt: null };
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

/** Podsumowanie zrzutu w wierszu listy: skład albo „skład niepodany" + wysokość. */
function dropSummary(
  jumpers: { tandem: number; aff: number; solo: number } | null,
  altitudeFt: number | null,
): string {
  const parts: string[] = [];
  if (jumpers == null) {
    parts.push('skład niepodany');
  } else {
    if (jumpers.tandem > 0) parts.push(`${jumpers.tandem} tandem`);
    if (jumpers.aff > 0) parts.push(`${jumpers.aff} AFF`);
    if (jumpers.solo > 0) parts.push(`${jumpers.solo} solo`);
  }
  if (altitudeFt != null) parts.push(`${altitudeFt} ft`);
  return parts.join(' · ');
}
