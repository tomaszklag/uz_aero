/**
 * Ninerdeck - 22 / 22A NOWA REZERWACJA: dwa kroki.
 *
 * ══ KROK 1 PYTA O TERMIN I MASZYNĘ, NIE O ZADANIE ══
 * Odwrotnie niż przejęcie - i to jest decyzja makiety 22. Rezerwacja rozstrzyga
 * KONKURENCJĘ o zasób: kto zajmie tę maszynę w tych godzinach. Rodzaj lotu, trasa
 * i paliwo opisują lot i nikomu niczego nie zabierają, więc idą w kroku 2. Preflight
 * ma kolejność odwrotną, bo tam maszyna jest już w ręce, a pytaniem jest „co dziś
 * robimy".
 *
 * ══ DWA KROKI TO JEDEN EKRAN NAWIGACJI ══
 * Krok jest STANEM, nie trasą (wzorzec wpisu ręcznego, issue #62): „wstecz" z kroku 2
 * cofa o krok, a z kroku 1 przy niepustym szkicu pyta o rezygnację. Dwa „wstecz" na
 * jednym ekranie - strzałka w nagłówku i gest krawędziowy - mają robić to samo.
 *
 * ══ CAŁY EKRAN WYMAGA SIECI ══
 * Bez zajętości floty nie da się ani pokazać, co jest wolne, ani zapisać terminu
 * (§2.1, §2.2) - a rezerwacja rozstrzygnięta lokalnie znaczyłaby „twój slot przepadł"
 * godzinę później. Ekran mówi to wprost, zamiast rysować pusty formularz.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { CommonActions, type NavigationAction } from '@react-navigation/native';

import {
  AbandonDraftSheet,
  ActionButton,
  AirfieldSheet,
  AppText,
  BookingAircraftCard,
  BookingTimeSheet,
  Card,
  DayChips,
  FlightDateSheet,
  DualSheet,
  Field,
  Icon,
  IconAction,
  NumberSheet,
  OptionGrid,
  Screen,
  ScreenHeader,
  Skeleton,
  SlotChips,
  TextEntrySheet,
  ValueBox,
  type GridOption,
  type SheetRow,
} from '../components';
import { airfieldValueProps } from '../components/input/airfieldMark';
import { useAbandonExit } from '../hooks/useAbandonExit';
import { useCalendar } from '../hooks/useCalendar';
import { useFleet } from '../hooks/useFleet';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { useNearbyPosition } from '../hooks/useNearbyPosition';
import { usePilots } from '../hooks/usePilots';
import { useSlotSuggestions } from '../hooks/useSlotSuggestions';
import { useSkeleton } from '../hooks/useSkeleton';
import { useCurrentPilot } from '../store/currentPilot';
import { bookingDraftDirty, useBookingDraft, type BookingDraft } from '../store/bookingDraft';
import { useTheme, type Theme } from '../theme';
import { duration, litres, maskMotoHoursInput, parseLitres, parseMotoHours } from '../format';
import {
  isSameFieldOperation,
  OPERATION_TYPES,
  type OperationType,
} from '../../domain';

import { buildAircraftOptions } from './logic/aircraftAvailability';
import {
  confirmLabel,
  planNote,
  slotNote,
  step1Blocker,
  step2Blocker,
  step2Subtitle,
} from './logic/bookingSteps';
import { bookingsOnDay } from './logic/calendarData';
import { buildDayChips, defaultDay } from './logic/calendarDays';
import { dayHeading, dayShort } from './logic/calendarHeading';
import { buildFleetGrid } from './logic/calendarGrid';
import { clubHhmm } from './logic/clubClock';
import { dualRequirementBlocker } from './logic/dualRequirement';
import { operationLabel } from './logic/operations';
import { buildSlotChips } from './logic/slotChips';

/** `dispatch` wykonuje akcję nawigacji zatrzymaną przez bramkę rezygnacji - jak na 02 i 15. */
type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
  dispatch: (action: NavigationAction) => void;
};

/** Siatka operacji - te same ikony i nazwy, co na 02E i 15A. */
const OPERATIONS: GridOption<OperationType>[] = OPERATION_TYPES.map((value) => ({
  value,
  label: operationLabel(value),
  icon: `op-${value}` as const,
}));

/** Pola, które podstawia nawigacja - nie liczą się jako wpis pilota (patrz szkic). */
const SEEDED: (keyof BookingDraft)[] = ['date', 'aircraftId', 'startsAt', 'endsAt'];

export function NewBookingScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route?: { params?: { aircraftId?: string; startsAt?: number } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();

  const pilotId = useCurrentPilot((p) => p.id);
  const pilots = usePilots();
  const { aircraft: fleet } = useFleet();
  const draft = useBookingDraft();

  const [step, setStep] = useState<1 | 2>(1);

  /**
   * Godzina, w którą pilot wycelował na osi kalendarza - ŻYCZENIE, nie termin.
   * Podstawiona jako `startsAt` wyglądałaby jak wpisana (issue #62), więc jedzie do
   * zapytania o sugestie, które premiuje sloty blisko niej.
   */
  const preferredAt = route?.params?.startsAt ?? null;

  // Formularz zaczyna się od pustego szkicu plus tego, co podała nawigacja. Szkic
  // jest magazynem globalnym, więc bez tego wejście po rezygnacji wracałoby
  // z wyborami sprzed godziny - a te czytają się jak podpowiedź.
  const start = useBookingDraft((d) => d.start);
  useEffect(() => {
    start({ aircraftId: route?.params?.aircraftId ?? null });
  }, [start, route?.params?.aircraftId]);
  const [anchor, setAnchor] = useState<number | null>(preferredAt);
  const { data } = useCalendar(anchor);
  const skeleton = useSkeleton(data === undefined);

  // ── doba ──────────────────────────────────────────────────────────────────
  const selected = useMemo(() => {
    if (data == null) return null;
    if (draft.date != null && data.days.some((d) => d.date === draft.date)) return draft.date;
    return defaultDay(data.days, anchor ?? now);
  }, [data, draft.date, anchor, now]);

  const day = data?.days.find((d) => d.date === selected) ?? null;
  const onDay = useMemo(
    () => (data == null || day == null ? [] : bookingsOnDay(data.bookings, day)),
    [data, day],
  );

  // Okno osi - to samo, w którym liczą się procenty pasków w kalendarzu. Bierzemy je
  // z `buildFleetGrid`, żeby karta samolotu i zakładka Kalendarz nie rysowały tej samej
  // doby w dwóch różnych skalach.
  const grid = useMemo(
    () =>
      data == null || day == null
        ? null
        : buildFleetGrid({
            day,
            aircraft: fleet,
            bookings: data.bookings,
            homeIcao: data.homeIcao,
            pilotId,
            codeOf: () => null,
            nameOf: () => null,
            now,
          }),
    [data, day, fleet, pilotId, now],
  );

  const aircraft = fleet.find((a) => a.id === draft.aircraftId) ?? null;
  const options = useMemo(
    () =>
      day == null || grid == null
        ? []
        : buildAircraftOptions({
            aircraft: fleet,
            bookings: onDay,
            day,
            window: { from: grid.from, to: grid.to },
          }),
    [fleet, onDay, day, grid],
  );

  // ── sugestie godzin ───────────────────────────────────────────────────────
  const minutes =
    draft.startsAt != null && draft.endsAt != null && draft.endsAt > draft.startsAt
      ? Math.round((draft.endsAt - draft.startsAt) / 60_000)
      : null;

  const { data: slots } = useSlotSuggestions({
    aircraftId: draft.aircraftId,
    day: day == null ? null : (day.startsAt + day.endsAt) / 2,
    // Bez ustawionego terminu proponujemy dwie godziny - tyle trwa typowy lot klubowy,
    // a sugestia bez długości nie miałaby czego zaproponować.
    minutes: minutes ?? 120,
    preferredAt,
    enabled: step === 1,
  });

  const chips = useMemo(
    () =>
      day == null || grid == null || slots == null
        ? []
        : buildSlotChips({
            slots: slots.suggestions,
            busy: onDay.filter((b) => b.aircraftId === draft.aircraftId),
            day,
            window: { from: grid.from, to: grid.to },
            startsAt: draft.startsAt,
            endsAt: draft.endsAt,
            nameOf: (id) => (id == null ? null : (pilots.find((p) => p.id === id)?.name ?? null)),
          }),
    [slots, onDay, day, grid, draft.aircraftId, draft.startsAt, draft.endsAt, pilots],
  );

  // ── bramki ────────────────────────────────────────────────────────────────
  const gate1 = { draft, aircraft, bookings: onDay, now };
  const blocker1 = data == null ? 'Rezerwacja wymaga połączenia.' : step1Blocker(gate1);
  const singleField = draft.operation != null && isSameFieldOperation(draft.operation);
  const blocker2 = step2Blocker({ draft, aircraft, singleField });

  // ── wyjście ───────────────────────────────────────────────────────────────
  const dirty = bookingDraftDirty(draft, SEEDED);
  const exit = useAbandonExit(
    navigation,
    step > 1 || dirty,
    () => {
      if (step === 1) return false;
      setStep(1);
      return true;
    },
    () => draft.reset(),
  );

  // ── arkusze ───────────────────────────────────────────────────────────────
  const [timeEdge, setTimeEdge] = useState<'start' | 'end' | null>(null);
  const [icaoField, setIcaoField] = useState<'departure' | 'arrival' | null>(null);
  const [planField, setPlanField] = useState<'air' | 'fuel' | null>(null);
  const [dualOpen, setDualOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const position = useNearbyPosition(icaoField != null);

  const pickSlot = useCallback(
    (startsAt: number, endsAt: number) => {
      draft.set('startsAt', startsAt);
      draft.set('endsAt', endsAt);
    },
    [draft],
  );

  const header = (
    <ScreenHeader
      title="REZERWACJA"
      size="md"
      step={`${step}/2`}
      backLabel={step === 1 ? 'Kalendarz' : 'Wróć'}
      /* Strzałka robi DOKŁADNIE to samo, co przycisk sprzętowy - łącznie z pytaniem
         o rezygnację nad niepustym formularzem (issue #62). */
      onBack={() => {
        if (step === 2) setStep(1);
        else if (dirty) exit.ask(CommonActions.goBack());
        else navigation.goBack();
      }}
      {...(step === 2 && day != null
        ? { subtitle: step2Subtitle(draft, day, aircraft, dayShort(day)) }
        : {})}
    />
  );

  return (
    <Screen padded={false} header={header}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {data === undefined ? (
          skeleton ? (
            <Skeleton height={220} radius={14} />
          ) : null
        ) : data === null ? (
          <Offline theme={theme} />
        ) : step === 1 ? (
          <>
            <Field label="Dzień" labelNote="czas klubu">
              <View style={s.dayRow}>
                <View style={s.dayStrip}>
                  <DayChips
                    days={buildDayChips({
                      days: data.days,
                      bookings: data.bookings,
                      pilotId,
                      selected: selected ?? '',
                      now,
                    })}
                    onSelect={(date) => draft.set('date', date)}
                  />
                </View>
                {/* `.day-more` z makiety: wyjście do pełnego kalendarza stoi NA KOŃCU
                    paska, a nie w nagłówku - dotyczy tego jednego pola, nie ekranu.
                    Ikona, nie przycisk z napisem: nazwanie go („Inna data") powtarzałoby
                    etykietę pola dwa centymetry wyżej. */}
                <IconAction
                  name="calendar"
                  accessibilityLabel="Wybierz datę z kalendarza"
                  onPress={() => setDateOpen(true)}
                />
              </View>
            </Field>

            <Field label="Samolot">
              <View style={s.cards}>
                {options.map((option) => (
                  <BookingAircraftCard
                    key={option.aircraftId}
                    option={option}
                    bars={grid?.rows.find((r) => r.aircraftId === option.aircraftId)?.bars ?? []}
                    selected={draft.aircraftId === option.aircraftId}
                    onPress={() => draft.set('aircraftId', option.aircraftId)}
                  />
                ))}
              </View>
            </Field>

            {chips.length > 0 && (
              <Field label="Sugerowane godziny" labelNote={minutes == null ? '2 h' : duration(minutes * 60_000)}>
                <SlotChips chips={chips} onSelect={pickSlot} />
              </Field>
            )}

            <Field label="Godziny" hint={slotNote(gate1) ?? undefined}>
              <View style={s.timeRow}>
                <ValueBox
                  value={draft.startsAt == null || day == null ? '' : clubHhmm(draft.startsAt, day)}
                  placeholder="--:--"
                  meta="Od"
                  actionIcon="edit"
                  onPress={() => setTimeEdge('start')}
                  style={s.timeBox}
                />
                <Icon name="next" size={16} color={theme.colors.textMuted} />
                <ValueBox
                  value={draft.endsAt == null || day == null ? '' : clubHhmm(draft.endsAt, day)}
                  placeholder="--:--"
                  meta="Do"
                  actionIcon="edit"
                  onPress={() => setTimeEdge('end')}
                  style={s.timeBox}
                />
              </View>
            </Field>
          </>
        ) : (
          <>
            <Field label="Rodzaj operacji">
              <OptionGrid
                options={OPERATIONS}
                value={draft.operation}
                onChange={(value) => draft.set('operation', value)}
              />
            </Field>

            <Field label={singleField ? 'Lotnisko' : 'Start'}>
              <ValueBox
                value={draft.departureIcao}
                placeholder="wybierz lotnisko"
                {...airfieldValueProps(draft.departureIcao)}
                actionIcon="more"
                onPress={() => setIcaoField('departure')}
              />
            </Field>

            {!singleField && (
              <Field label="Lądowanie">
                <ValueBox
                  value={draft.arrivalIcao}
                  placeholder="wybierz lotnisko"
                  {...airfieldValueProps(draft.arrivalIcao)}
                  actionIcon="more"
                  onPress={() => setIcaoField('arrival')}
                />
              </Field>
            )}

            <Field
              label="Drugi pilot"
              {...(aircraft?.dualRequired === true
                ? { tag: { label: 'wymagany · załoga 2-os.', tone: 'amber' as const } }
                : { tag: { label: 'opcjonalne' } })}
            >
              <ValueBox
                value={pilots.find((p) => p.id === draft.dualId)?.code ?? ''}
                meta={pilots.find((p) => p.id === draft.dualId)?.name ?? ''}
                placeholder="bez drugiego pilota"
                actionIcon="more"
                onPress={() => setDualOpen(true)}
              />
            </Field>

            <View style={s.twoCol}>
              <Field label="Czas lotu" style={s.col}>
                <ValueBox
                  value={draft.plannedAirMin == null ? '' : duration(draft.plannedAirMin * 60_000)}
                  unit="h:mm"
                  placeholder="--:--"
                  actionIcon="edit"
                  onPress={() => setPlanField('air')}
                />
              </Field>
              <Field label="Paliwo" tag={{ label: 'opcj.' }} style={s.col}>
                <ValueBox
                  value={draft.plannedFuelL == null ? '' : litres(draft.plannedFuelL)}
                  unit="L"
                  placeholder="--"
                  actionIcon="edit"
                  onPress={() => setPlanField('fuel')}
                />
              </Field>
            </View>

            {(() => {
              const note = planNote(draft);
              return note == null ? null : (
                <AppText variant="body" style={note.tone === 'amber' ? s.noteAmber : s.note}>
                  {note.text}
                </AppText>
              );
            })()}

            <Field label="Notatka" tag={{ label: 'opcjonalne' }}>
              <ValueBox
                value={draft.notes ?? ''}
                variant="text"
                placeholder="Dla kogo, po co, na co uważać…"
                actionIcon="more"
                onPress={() => setNoteOpen(true)}
              />
            </Field>
          </>
        )}
      </ScrollView>

      {data != null && (
        <View style={s.actionBar}>
          {step === 1 ? (
            <ActionButton
              label="DALEJ"
              icon="next"
              tone="green"
              {...(blocker1 != null ? { disabledReason: blocker1 } : {})}
              onPress={() => setStep(2)}
            />
          ) : (
            <ActionButton
              label={confirmLabel(draft, day)}
              tone="green"
              {...(blocker2 != null ? { disabledReason: blocker2 } : {})}
              onPress={() => {
                /* Zapis dochodzi w F6 - patrz `docs/rezerwacje.md` §2.1. */
              }}
            />
          )}
        </View>
      )}

      {/* Arkusze zostają ZAMONTOWANE, a chowa je `visible` - rama przeżywa własną
          niewidzialność, żeby zdążyć z animacją wyjazdu (`SheetSurface`, issue #62).
          Warunek na DANE zostaje warunkiem: bez odpowiedzi serwera żaden z nich nie ma
          jak być otwarty, więc nic się przez niego nie przełącza w trakcie pracy. */}
      {day != null && (
        <BookingTimeSheet
          visible={timeEdge != null}
          edge={timeEdge ?? 'start'}
          value={timeEdge === 'end' ? draft.endsAt : draft.startsAt}
          day={day}
          target={`${aircraft?.reg ?? 'Samolot'} · ${dayHeading(day)}`}
          min={grid?.from ?? day.startsAt}
          max={grid?.to ?? day.endsAt}
          rows={timeRows(draft, day, onDay, pilots)}
          onChange={(next) => draft.set(timeEdge === 'end' ? 'endsAt' : 'startsAt', next)}
          onConfirm={() => setTimeEdge(null)}
          onCancel={() => setTimeEdge(null)}
        />
      )}

      <AirfieldSheet
        visible={icaoField != null}
        title={
          icaoField === 'arrival'
            ? 'Lotnisko lądowania'
            : singleField
              ? 'Lotnisko'
              : 'Lotnisko startu'
        }
        currentIcao={icaoField === 'arrival' ? draft.arrivalIcao : draft.departureIcao}
        position={position}
        onConfirm={(icao) => {
          draft.set(icaoField === 'arrival' ? 'arrivalIcao' : 'departureIcao', icao);
          setIcaoField(null);
        }}
        onCancel={() => setIcaoField(null)}
      />


      <DualSheet
        visible={dualOpen}
        dualId={draft.dualId}
        options={pilots.filter((p) => p.id !== pilotId).map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        soloBlocker={dualRequirementBlocker(aircraft, null)}
        onSave={(id) => {
          draft.set('dualId', id);
          setDualOpen(false);
        }}
        onCancel={() => setDualOpen(false)}
      />

      <NumberSheet
        visible={planField === 'air'}
        title="Planowany czas lotu"
        value={draft.plannedAirMin}
        format={(min) => duration(min * 60_000)}
        edit={{
          toText: (min) => duration(min * 60_000),
          mask: (text) => maskMotoHoursInput(text, 'hhmm'),
          parse: (text) => {
            const hours = parseMotoHours(text);
            return hours == null ? null : Math.round(hours * 60);
          },
          keyboardType: 'numeric',
          label: 'Planowany czas lotu',
        }}
        step={15}
        stepLabel="15 min"
        min={0}
        max={24 * 60}
        placeholder="--:--"
        unit="h:mm"
        hint="Ile z tej rezerwacji spędzisz w powietrzu."
        onSave={(min) => {
          draft.set('plannedAirMin', min);
          setPlanField(null);
        }}
        onCancel={() => setPlanField(null)}
      />

      <NumberSheet
        visible={planField === 'fuel'}
        title="Paliwo do zabrania"
        value={draft.plannedFuelL}
        format={(l) => litres(l)}
        edit={{
          toText: (l) => litres(l),
          parse: parseLitres,
          keyboardType: 'decimal-pad',
          label: 'Paliwo do zabrania',
        }}
        step={5}
        bigStep={20}
        stepLabel="5 L"
        bigStepLabel="20 L"
        min={0}
        {...(aircraft != null ? { max: aircraft.capacityL } : {})}
        placeholder="--"
        unit="L"
        onClear={() => {
          draft.set('plannedFuelL', null);
          setPlanField(null);
        }}
        onSave={(l) => {
          draft.set('plannedFuelL', l);
          setPlanField(null);
        }}
        onCancel={() => setPlanField(null)}
      />

      <TextEntrySheet
        visible={noteOpen}
        title="Notatka do rezerwacji"
        initialText={draft.notes ?? ''}
        placeholder="Dla kogo, po co, na co uważać…"
        multiline
        maxLength={500}
        // Podpowiedzi TU NIE MA: notatka opisuje KONKRETNY, przyszły lot, a podsuwanie
        // treści sprzed tygodnia byłoby podsuwaniem nieprawdy (reguła z 02E).
        suggestions={null}
        onConfirm={(text) => {
          draft.set('notes', text.trim() === '' ? null : text.trim());
          setNoteOpen(false);
        }}
        onCancel={() => setNoteOpen(false)}
      />

      {/* Kalendarz miesięczny daty. `FlightDateSheet` powstał dla wpisu RĘCZNEGO,
          gdzie przyszłość jest nonsensem i dlatego `now` jest tam GÓRNĄ GRANICĄ.
          Rezerwacja patrzy dokładnie w drugą stronę, więc granicę przesuwamy o rok
          do przodu - rozdzielenie ról `now` (granica kontra kotwica skrótów) należy
          do epiku, który ten arkusz przepisze. */}
      <FlightDateSheet
        visible={dateOpen}
        day={day?.startsAt ?? now}
        now={now + 365 * 86_400_000}
        onConfirm={(picked) => {
          // Data spoza okna przestawia KOTWICĘ - następna odpowiedź przyniesie doby
          // wokół niej, a pasek chipów pokaże je zamiast dzisiejszych.
          setAnchor(picked);
          draft.set('date', null);
          setDateOpen(false);
        }}
        onCancel={() => setDateOpen(false)}
      />

      {/* Rama arkusza przeżywa własną niewidzialność, więc warunek stoi tutaj,
          a nie w propie `visible` (`hooks/abandonExit.ts`). */}
      {exit.sheetMounted && (
        <AbandonDraftSheet
          visible
          title="ZREZYGNOWAĆ Z REZERWACJI?"
          rows={abandonRows(draft, day, aircraft?.reg ?? null)}
          onStay={exit.stay}
          onAbandon={exit.leave}
        />
      )}
    </Screen>
  );
}

/** 21B w wersji formularza - bez sieci nie ma czego pokazać ani czym zarezerwować. */
function Offline({ theme }: { theme: Theme }) {
  const s = styles(theme);

  return (
    <Card flush>
      <View style={s.warning}>
        <Icon name="offline" size={30} color={theme.colors.amber} />
        <AppText variant="display" style={s.warningTitle}>
          BRAK POŁĄCZENIA
        </AppText>
        <AppText variant="body" style={s.warningText}>
          Termin potwierdza serwer - bez połączenia telefon nie wie, co jest wolne,
          i nie ma jak zająć godzin.
        </AppText>
        <AppText variant="body" style={s.warningText}>
          Wróć tu z zasięgiem. Lot możesz rozpocząć bez rezerwacji.
        </AppText>
      </View>
    </Card>
  );
}

/** Wiersze odniesienia arkusza godziny - co stoi obok tego terminu. */
function timeRows(
  draft: BookingDraft,
  day: { startsAt: number; endsAt: number; date: string },
  onDay: readonly { aircraftId: string; startsAt: number; endsAt: number; pilotId: string | null; kind: string }[],
  pilots: readonly { id: string; name: string }[],
): SheetRow[] {
  const rows: SheetRow[] = [];

  if (draft.startsAt != null && draft.endsAt != null && draft.endsAt > draft.startsAt) {
    rows.push({
      label: 'Długość rezerwacji',
      value: duration(draft.endsAt - draft.startsAt),
    });
  }

  const next = onDay
    .filter((b) => b.aircraftId === draft.aircraftId && draft.startsAt != null && b.startsAt >= draft.startsAt)
    .sort((a, b) => a.startsAt - b.startsAt)[0];

  if (next != null) {
    const who =
      next.kind === 'block'
        ? 'wyłączenie z użytku'
        : (pilots.find((p) => p.id === next.pilotId)?.name ?? 'inna rezerwacja');
    rows.push({ label: 'Następna zajętość', value: `${clubHhmm(next.startsAt, day)} · ${who}` });
  }

  return rows;
}

/** Wiersze arkusza rezygnacji - WYŁĄCZNIE faktyczne wybory pilota. */
function abandonRows(
  draft: BookingDraft,
  day: { startsAt: number; endsAt: number; date: string } | null,
  reg: string | null,
): SheetRow[] {
  const rows: SheetRow[] = [];
  if (reg != null) rows.push({ label: 'Samolot', value: reg });
  if (day != null && draft.startsAt != null && draft.endsAt != null) {
    rows.push({
      label: 'Termin',
      value: `${dayHeading(day)} · ${clubHhmm(draft.startsAt, day)} → ${clubHhmm(draft.endsAt, day)}`,
    });
  }
  if (draft.operation != null) rows.push({ label: 'Zadanie', value: operationLabel(draft.operation) });
  return rows;
}

const styles = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 14, gap: 14 },
    dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dayStrip: { flex: 1 },
    cards: { gap: 7 },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeBox: { flex: 1 },
    twoCol: { flexDirection: 'row', gap: 10 },
    col: { flex: 1 },
    note: { fontSize: 11, lineHeight: 16, color: t.colors.textMuted, paddingHorizontal: 2 },
    noteAmber: { fontSize: 11, lineHeight: 16, color: t.colors.amber, paddingHorizontal: 2 },
    actionBar: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    warning: { alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 20 },
    warningTitle: { fontSize: 19, lineHeight: 22, letterSpacing: 1.5, color: t.colors.amber },
    warningText: { fontSize: 12, lineHeight: 18, textAlign: 'center', color: t.colors.textSecondary },
  });
