/**
 * Ninerdeck - 31 / 31A / 31B ZLECENIE: trzy kroki (4.0.0, epik Z-C #247; makiety 31, 31A,
 * 31B, 31C; `docs/zlecenia.md` §4, §5.1, §5.2, §14.4).
 *
 * ══ KROKI 1 I 2 TO KROKI REZERWACJI ══
 * Zlecenie jest rezerwacją, która szuka załogi (§2.1): trzyma termin na maszynie od chwili
 * wysłania, więc pierwsze pytanie jest to samo, co w 22 - kto zajmie tę maszynę w tych
 * godzinach (`TermStep`, wspólny z rezerwacją). Krok 2 to 22A bez drugiego pilota - oba
 * fotele są w zleceniu PYTANIEM, więc mieszkają razem w kroku 3 - i z „Opisem" zamiast
 * notatki, bo czytają go adresaci.
 *
 * ══ KROK 3 - ZAŁOGA I ADRESACI (31B) ══
 * Dwa fotele z kartami „Ja / Szukam / Brak", pod szukanym - osoba imiennie albo grupa;
 * nad fotelami przełącznik „Wspólna lista". Reguły szkicu liczy `logic/orderForm.ts`,
 * arkusz adresatów (31C) - `logic/orderFormAddressees.ts`.
 *
 * ══ TRZY KROKI TO JEDEN EKRAN NAWIGACJI ══
 * Krok jest STANEM, nie trasą (wzorzec rezerwacji i wpisu ręcznego): „wstecz" cofa o krok,
 * a z kroku 1 przy niepustym szkicu pyta o rezygnację (02H).
 *
 * ══ WEJŚCIA ══
 * „NOWE ZLECENIE" w „Zlecone" (30) - pusty szkic; „Powiel" na karcie prowadzącego (32) -
 * ta sama treść z pustymi godzinami (`logic/orderDuplicate.ts`); „EDYTUJ" (32) - ten sam
 * formularz z wypełnionym szkicem (`logic/orderEdit.ts`, ramki edycji 31 i 31B). Wejście
 * z wolnego pasma w kalendarzu (21E) podaje maszynę i godzinę jako PREFEROWANĄ porę.
 *
 * ══ EDYCJA ══
 * Termin zlecenia nie zderza się sam ze sobą. Zmiana terminu mówi skutek pod godzinami
 * i nad „ZAPISZ ZMIANY" (§5.1). „Wspólna lista" jest zablokowana, wysłani adresaci stoją
 * z kłódką (odbiera się ich menu ⋯ na karcie, 32D), a dopisani w tej edycji - z „×".
 * Na drut jedzie sama różnica.
 *
 * ══ CAŁY EKRAN WYMAGA SIECI ══
 * Bez zajętości floty nie ma czego pokazać w kroku 1 (21B). Zapis bez zasięgu mówi o tym
 * PO tapnięciu, a wypełniony formularz zostaje (§2.2) - nigdy cichy błąd.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { CommonActions, StackActions, type NavigationAction } from '@react-navigation/native';

import type { OrderWriteResult, RemoteAddressList, RemoteOrderCard, RemoteSeat } from '../../application';
import { uuidv4 } from '../../infrastructure/id';
import { isSameFieldOperation, OPERATION_TYPES, type OperationType, type ReferenceAircraft } from '../../domain';
import {
  AbandonDraftSheet,
  ActionButton,
  AddressChip,
  AddresseeSheet,
  AddRow,
  AirfieldSheet,
  AppText,
  BookingDenyCard,
  Card,
  ChoiceCards,
  EmptyState,
  Field,
  FootNote,
  InlineNote,
  NumberSheet,
  OptionGrid,
  Screen,
  ScreenHeader,
  Skeleton,
  Tag,
  TextEntrySheet,
  ToggleRow,
  ValueBox,
  type ChoiceCard,
  type GridOption,
  type SheetRow,
} from '../components';
import { airfieldValueProps } from '../components/input/airfieldMark';
import { useOrders } from '../bootstrap/servicesContext';
import { useAbandonExit } from '../hooks/useAbandonExit';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { useNearbyPosition } from '../hooks/useNearbyPosition';
import { useOrderCard } from '../hooks/useOrderCard';
import { useOrderGroups } from '../hooks/useOrderGroups';
import { usePilots } from '../hooks/usePilots';
import { useSkeleton } from '../hooks/useSkeleton';
import { useTermPicker } from '../hooks/useTermPicker';
import { useCurrentPilot } from '../store/currentPilot';
import { draftOf, useOrderDraft } from '../store/orderDraft';
import { useTheme, type Theme } from '../theme';
import { duration, litres, maskMotoHoursInput, parseLitres, parseMotoHours } from '../format';

import { bookingDeny, type BookingDenyVm } from './logic/bookingDeny';
import { planBlocker, planNote, routeBlocker, step1Blocker, step2Subtitle } from './logic/bookingSteps';
import { toBooking } from './logic/calendarData';
import { dayHeading, dayShort } from './logic/calendarHeading';
import { clubHhmm, type ClubDayBounds } from './logic/clubClock';
import { operationLabel } from './logic/operations';
import type { Member } from './logic/orderAddressees';
import { duplicateSeed } from './logic/orderDuplicate';
import {
  draftOfOrder,
  editStep3Gate,
  editSummary,
  orderChanges,
  seatLossNote,
  sentLists,
  sentPeople,
  sentViaGroup,
  termWarning,
} from './logic/orderEdit';
import {
  audienceSummary,
  effectiveList,
  isEmptyList,
  ORDER_PLAN_WORDS,
  ORDER_TERM_WORDS,
  orderAudienceOf,
  orderDraftDirty,
  otherSeat,
  peopleCount,
  peopleOf,
  seatHint,
  seatsOf,
  sharedListOf,
  soughtSeats,
  step3Gate,
  withList,
  withMode,
  withoutEntry,
  withPerson,
  withSeatState,
  withShared,
  withSharedList,
  type AddressMode,
  type AudienceContext,
  type OrderDraft,
} from './logic/orderForm';
import { multiSheetVm, personOptions, toggled, type OtherSeat } from './logic/orderFormAddressees';
import { orderDay, seatLabel, seatLower } from './logic/orderFormat';
import { ORDER_OFFLINE, orderRefusalText } from './logic/orderRefusals';
import { TermStep } from './TermStep';

type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
  dispatch: (action: NavigationAction) => void;
};

/** Siatka operacji - te same ikony i nazwy, co na 02E, 15A i 22A. */
const OPERATIONS: GridOption<OperationType>[] = OPERATION_TYPES.map((value) => ({
  value,
  label: operationLabel(value),
  icon: `op-${value}` as const,
}));

/** Pola, które podstawia nawigacja - nie liczą się jako wpis prowadzącego. */
const SEEDED: (keyof OrderDraft)[] = ['date', 'aircraftId', 'startsAt', 'endsAt'];

/** Odmowy dotyczące TERMINU I MASZYNY - wracają na krok 1, tam stoją kontrolki (22C). */
const TERM_REFUSALS = new Set(['slot_taken', 'aircraft_disabled', 'aircraft_not_found', 'booking_in_past', 'booking_order']);

/** Zapis, który nie dojechał - formularz zostaje, a zdanie mówi, czyją decyzją jest termin. */
const SEND_OFFLINE: BookingDenyVm = {
  title: 'Zlecenie wymaga połączenia',
  body: ORDER_OFFLINE,
  offerFix: false,
};

/** Podpis dopisanego w edycji - jeszcze go nikt nie dostał (ramka 4 makiety 31B). */
const NEW_SUB = 'nowy · dostanie zlecenie po zapisie';

/** Arkusz adresatów w toku - wybór, który „ANULUJ" porzuca. */
type Picker =
  | { kind: 'single'; seat: RemoteSeat; selected: string | null }
  | { kind: 'multi'; target: RemoteSeat | 'shared'; selection: RemoteAddressList };

type Ctx = AudienceContext & { groupName: (id: string) => string };

export function NewOrderScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route?: { params?: { aircraftId?: string; startsAt?: number; duplicateOf?: string; orderId?: string } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();
  const pilotId = useCurrentPilot((p) => p.id);
  const pilots = usePilots();
  const orders = useOrders();
  const groups = useOrderGroups();
  const store = useOrderDraft();
  const draft = draftOf(store);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [deny, setDeny] = useState<{ vm: BookingDenyVm; step: 1 | 3 } | null>(null);

  const preferredAt = route?.params?.startsAt ?? null;
  const duplicateOf = route?.params?.duplicateOf ?? null;
  /** EDYCJA zlecenia - ten sam formularz, inne znaczenie zapisu (`logic/orderEdit.ts`). */
  const editId = route?.params?.orderId ?? null;
  const source = useOrderCard(editId ?? duplicateOf, { seen: false });
  const card: RemoteOrderCard | null = source.data ?? null;
  const base = useMemo(() => (editId == null || card == null ? null : draftOfOrder(card)), [editId, card]);
  const baseDay = useMemo(() => (card == null ? null : orderDay(card.day)), [card]);

  const nameOf = useCallback(
    (id: string | null) => (id == null ? null : (pilots.find((p) => p.id === id)?.name ?? null)),
    [pilots],
  );

  const picker = useTermPicker({
    term: draft,
    preferredAt,
    active: step === 1,
    // Edytowane zlecenie nie zderza się samo ze sobą (ramka 2 makiety 31).
    except: editId != null ? (card?.booking.id ?? null) : null,
    now,
    pilotId,
    nameOf,
  });
  const { data, day, aircraft } = picker;
  const waitsForSource = (editId ?? duplicateOf) != null && source.data === undefined;
  const loading = data === undefined || waitsForSource;
  const skeleton = useSkeleton(loading);

  // Formularz zaczyna się od pustego szkicu plus tego, co podała nawigacja - albo od treści
  // powielanego lub edytowanego zlecenia. Podstawiamy RAZ: ponowne wczytanie karty (sygnał
  // kanału) nie ma prawa nadpisać tego, co prowadzący zdążył zmienić.
  const start = store.start;
  const seeded = useRef(false);
  const setAnchor = picker.setAnchor;
  useEffect(() => {
    if (seeded.current) return;
    if (editId == null && duplicateOf == null) {
      seeded.current = true;
      start({ aircraftId: route?.params?.aircraftId ?? null });
      return;
    }
    if (card == null) return;
    seeded.current = true;
    if (editId != null) {
      if (base == null) return;
      start(base);
      if (baseDay != null) setAnchor((baseDay.startsAt + baseDay.endsAt) / 2);
      return;
    }
    const seed = duplicateSeed({ card, viewerId: pilotId, now: Date.now() });
    start(seed.draft);
    if (seed.anchor != null) setAnchor(seed.anchor);
  }, [editId, duplicateOf, card, base, baseDay, start, pilotId, setAnchor, route?.params?.aircraftId]);

  // ── adresaci ──────────────────────────────────────────────────────────────
  const members: Member[] = useMemo(
    () => pilots.map((p) => ({ id: p.id, name: p.name, code: p.code, active: p.active })),
    [pilots],
  );
  const ctx = useMemo<Ctx>(
    () => ({
      me: pilotId,
      groups: groups == null ? null : new Map(groups.map((g) => [g.id, g.memberIds])),
      isActive: (id) => pilots.find((p) => p.id === id)?.active ?? false,
      groupName: (id) => groups?.find((g) => g.id === id)?.name ?? 'Grupa',
    }),
    [pilotId, groups, pilots],
  );
  const seats = seatsOf(draft, aircraft);
  const sought = soughtSeats(seats);
  const editing = editId != null && card != null && base != null;
  const sent = useMemo(() => (editing && card != null ? sentLists(card) : null), [editing, card]);
  const sentIds = useMemo(() => (editing && card != null ? sentPeople(card) : null), [editing, card]);
  // „Ja" znaczy AUTORA zlecenia - koordynator poprawiający cudze zlecenie widzi tę kartę
  // jako „Zlecający" (serwer stawia w fotelu „ja" zawsze autora).
  const selfLabel = editing && card != null && card.order.createdBy !== pilotId ? 'Zlecający' : 'Ja';

  // ── bramki ────────────────────────────────────────────────────────────────
  const blocker1 =
    data == null
      ? 'Zlecenie wymaga połączenia.'
      : step1Blocker({ draft, aircraft, bookings: picker.onDay, now, words: ORDER_TERM_WORDS });
  const singleField = draft.operation != null && isSameFieldOperation(draft.operation);
  const blocker2 = routeBlocker(draft, singleField) ?? planBlocker(draft);
  const gate3 = editing && card != null ? editStep3Gate(draft, card, aircraft) : step3Gate(draft, aircraft);
  const summary =
    editing && card != null && base != null
      ? editSummary(draft, base, card, aircraft, ctx)
      : audienceSummary(draft, aircraft, ctx);
  const warning = editing && base != null && baseDay != null ? termWarning(draft, base, baseDay) : null;

  // ── wyjście ───────────────────────────────────────────────────────────────
  // W edycji „niepusty szkic" znaczy co innego: prowadzący straci ZMIANY, nie wpisy.
  const dirty = editing && base != null ? orderChanges(draft, base, aircraft) != null : orderDraftDirty(draft, SEEDED);
  const exit = useAbandonExit(
    navigation,
    step > 1 || dirty,
    () => {
      if (step === 1) return false;
      setStep(step === 3 ? 2 : 1);
      return true;
    },
    () => store.reset(),
  );

  // ── arkusze ───────────────────────────────────────────────────────────────
  const [icaoField, setIcaoField] = useState<'departure' | 'arrival' | null>(null);
  const [planField, setPlanField] = useState<'air' | 'fuel' | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [addressees, setAddressees] = useState<Picker | null>(null);
  const position = useNearbyPosition(icaoField != null);

  /** Drugi szukany fotel - z niego biorą się podpisy „termin do potwierdzenia" w 31C. */
  const otherOf = (seat: RemoteSeat): OtherSeat | null => {
    if (draft.shared || editing || seats[otherSeat(seat)] !== 'sought') return null;
    const other = draft[otherSeat(seat)];
    const people = peopleOf(effectiveList(other), ctx);
    return { seat: otherSeat(seat), mode: other.mode, person: other.person, people: people == null ? null : new Set(people.keys()) };
  };

  /**
   * Uuid nadaje TELEFON i to on jest idempotencją zapisu: powtórzony `POST` przy słabym
   * łączu wraca tym samym zleceniem, a nie drugim terminem tej samej maszyny.
   */
  const orderId = useRef(uuidv4());

  /** Odmowa zapisu → karta powodu na kroku, na którym da się ją naprawić. */
  const refused = (result: Extract<OrderWriteResult, { ok: false }> | null) => {
    if (result == null) {
      setDeny({ vm: SEND_OFFLINE, step: 3 });
      return;
    }
    if (TERM_REFUSALS.has(result.refusal) && day != null) {
      // Termin zajęty w międzyczasie wraca na krok 1 z kartą powodu, jak w rezerwacji (22C)
      // - tam stoją kontrolki, którymi da się go naprawić; kroki 2 i 3 zostają.
      setDeny({
        vm: bookingDeny({
          refusal: result.refusal,
          taken: result.taken == null ? null : toBooking(result.taken),
          takenAt: result.takenAt,
          now: Date.now(),
          day,
          reg: aircraft?.reg ?? null,
          pilotId,
          nameOf,
        }),
        step: 1,
      });
      setStep(1);
      return;
    }
    setDeny({
      vm: { title: editing ? 'Nie udało się zapisać zmian' : 'Nie udało się wysłać zlecenia', body: orderRefusalText(result.refusal), offerFix: false },
      step: 3,
    });
  };

  const save = async () => {
    if (orders == null || day == null || saving) return;
    if (draft.aircraftId == null || draft.startsAt == null || draft.endsAt == null || draft.operation == null) return;

    setSaving(true);
    setDeny(null);
    try {
      if (editing && editId != null && base != null) {
        const patch = orderChanges(draft, base, aircraft);
        // Bez różnicy nie ma czego wysyłać - prowadzący wszedł w edycję i się rozmyślił.
        if (patch == null) {
          store.reset();
          exit.proceed(CommonActions.goBack());
          return;
        }
        const result = await orders.patch(editId, patch);
        if (result == null || !result.ok) {
          refused(result);
          return;
        }
        store.reset();
        // Karta zlecenia stoi pod formularzem i odświeża się sama (wejście, kanał klubu).
        exit.proceed(CommonActions.goBack());
        return;
      }

      const result = await orders.create({
        id: orderId.current,
        aircraftId: draft.aircraftId,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        operation: draft.operation,
        fromIcao: draft.departureIcao === '' ? null : draft.departureIcao,
        toIcao: draft.arrivalIcao === '' ? null : draft.arrivalIcao,
        plannedAirMin: draft.plannedAirMin,
        plannedFuelL: draft.plannedFuelL,
        note: draft.notes,
        seats,
        audience: orderAudienceOf(draft, aircraft),
      });
      if (result == null || !result.ok) {
        refused(result);
        return;
      }

      store.reset();
      // Formularz ustępuje karcie prowadzącego - „wstecz" z niej nie wraca do formularza.
      exit.proceed(StackActions.replace('Order', { orderId: result.card.order.id, as: 'leader' }));
    } finally {
      setSaving(false);
    }
  };

  /** Odmowa terminu opisuje KONKRETNY termin i maszynę - gaśnie, gdy któreś się zmieni. */
  const slotKey = `${draft.aircraftId ?? ''}|${draft.startsAt ?? ''}|${draft.endsAt ?? ''}`;
  const denied = useRef(slotKey);
  useEffect(() => {
    if (denied.current === slotKey) return;
    denied.current = slotKey;
    setDeny((current) => (current?.step === 1 ? null : current));
  }, [slotKey]);

  const header = (
    <ScreenHeader
      title="ZLECENIE"
      size="md"
      step={`${step}/3`}
      backLabel="Wróć"
      onBack={() => {
        if (step > 1) setStep(step === 3 ? 2 : 1);
        else if (dirty) exit.ask(CommonActions.goBack());
        else navigation.goBack();
      }}
      {...(step > 1 && day != null ? { subtitle: step2Subtitle(draft, day, aircraft, dayShort(day)) } : {})}
    />
  );

  const warningNote = warning == null ? null : <InlineNote icon="warning" tone="amber" text={warning} />;

  return (
    <Screen padded={false} header={header}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          skeleton ? (
            <Skeleton height={220} radius={14} />
          ) : null
        ) : data === null || ((editId ?? duplicateOf) != null && card == null) ? (
          <EmptyState
            tone="amber"
            icon="offline"
            title="BRAK POŁĄCZENIA"
            lines={[
              [
                { text: 'Zlecenie ' },
                { text: 'wymaga połączenia', bold: true },
                { text: ' - termin potwierdza serwer, a bez zajętości floty telefon nie wie, co jest wolne.' },
              ],
              [{ text: 'Wróć tu z zasięgiem.' }],
            ]}
          />
        ) : step === 1 ? (
          <TermStep
            picker={picker}
            term={draft}
            patch={store.patch}
            deny={deny?.step === 1 ? deny.vm : null}
            pilotId={pilotId}
            now={now}
            nameOf={nameOf}
            lengthLabel="Długość terminu"
            footer={warningNote}
          />
        ) : step === 2 ? (
          <>
            <Field label="Rodzaj operacji">
              <OptionGrid options={OPERATIONS} value={draft.operation} onChange={(value) => store.set('operation', value)} />
            </Field>

            {/* Skoki = JEDNO lotnisko (issue #13); pozostałe operacje - para start → lądowanie. */}
            <Field label={singleField ? 'Lotnisko skoków' : 'Start'}>
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

            {/* Plan lotu ma w zleceniu drugiego czytelnika - adresat widzi go na karcie (28). */}
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
              <Field label="Paliwo" tag={{ label: 'opcjonalne' }} style={s.col}>
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
              const note = planNote(draft, ORDER_PLAN_WORDS);
              return note == null ? null : (
                <AppText variant="mono" style={note.tone === 'amber' ? s.planAmber : s.plan}>
                  {note.text}
                </AppText>
              );
            })()}

            {/* „Opis", nie „Notatka": czytają go adresaci - stoi na ich karcie wierszem „Opis". */}
            <Field label="Opis" tag={{ label: 'opcjonalne' }}>
              <ValueBox
                value={draft.notes ?? ''}
                variant="text"
                placeholder="Co jest do zrobienia i na co uważać - przeczytają to adresaci"
                actionIcon="more"
                onPress={() => setNoteOpen(true)}
              />
            </Field>
          </>
        ) : (
          <>
            {deny?.step === 3 && <BookingDenyCard deny={deny.vm} />}

            {/* Sposób adresowania ustala wysłanie - w edycji przełącznik mówi tylko, jaki jest. */}
            <ToggleRow
              title="Wspólna lista"
              sub={editing ? 'po wysłaniu bez zmian' : 'fotele przydzielę po odpowiedziach'}
              on={draft.shared}
              locked={editing}
              onToggle={(on) => store.update((d) => withShared(d, on, aircraft))}
            />

            {(['pic', 'dual'] as const).map((seat) => (
              <SeatBlock
                key={seat}
                seat={seat}
                draft={draft}
                aircraft={aircraft}
                ctx={ctx}
                members={members}
                selfLabel={selfLabel}
                edit={
                  editing && card != null && sent != null
                    ? { sent: draft.shared ? null : sent[seat], viaGroup: (id) => sentViaGroup(card, id), loss: seatLossNote(card, draft, seat, aircraft) }
                    : null
                }
                onState={(state) => store.update((d) => withSeatState(d, seat, state, aircraft))}
                onMode={(mode) => store.update((d) => withMode(d, seat, mode))}
                onClear={(entry) => store.update((d) => withoutEntry(d, seat, entry, aircraft))}
                onPick={() =>
                  setAddressees(
                    draft[seat].mode === 'person' && !editing
                      ? { kind: 'single', seat, selected: draft[seat].person }
                      : { kind: 'multi', target: seat, selection: draft[seat].list },
                  )
                }
              />
            ))}

            {draft.shared && sought.length > 0 && (
              <Card style={s.seatCard} contentStyle={s.seatContent}>
                <View style={s.seatHead}>
                  <AppText variant="mono" style={s.seatTitle}>
                    ADRESACI
                  </AppText>
                  {/* Bez adnotacji karta wyglądałaby jak adresaci drugiego pilota, bo stoi
                      zaraz pod jego fotelem. */}
                  <AppText variant="mono" style={s.seatNote}>
                    {sought.length === 2 ? 'oba fotele' : seatLower(sought[0]!)}
                  </AppText>
                </View>
                {editing && sent != null && card != null ? (
                  <>
                    <Chips list={sent.shared} ctx={ctx} members={members} status="sent" viaGroup={(id) => sentViaGroup(card, id)} />
                    <Chips
                      list={draft.sharedExtra}
                      ctx={ctx}
                      members={members}
                      status="new"
                      onClear={(entry) => store.update((d) => withoutEntry(d, 'shared', entry, aircraft))}
                    />
                    <AddRow
                      label="Dodaj adresatów"
                      onPress={() => setAddressees({ kind: 'multi', target: 'shared', selection: draft.sharedExtra })}
                    />
                  </>
                ) : (
                  <>
                    <Chips
                      list={sharedListOf(draft, seats)}
                      ctx={ctx}
                      members={members}
                      onClear={(entry) => store.update((d) => withoutEntry(d, 'shared', entry, aircraft))}
                    />
                    <AddRow
                      label="Dodaj adresatów"
                      onPress={() => setAddressees({ kind: 'multi', target: 'shared', selection: sharedListOf(draft, seats) })}
                    />
                  </>
                )}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {data != null && !loading && (
        <View style={s.actionBar}>
          {step === 1 ? (
            <ActionButton
              label="DALEJ"
              icon="next"
              tone="green"
              {...(blocker1 != null ? { disabledReason: blocker1 } : {})}
              onPress={() => setStep(2)}
            />
          ) : step === 2 ? (
            <ActionButton
              label="DALEJ"
              icon="next"
              tone="green"
              {...(blocker2 != null ? { disabledReason: blocker2 } : {})}
              onPress={() => setStep(3)}
            />
          ) : (
            <>
              {/* Skutek NAD przyciskiem, przypięty razem z nim - ma być widoczny w chwili
                  zapisu, także po przewinięciu formularza (31B). */}
              {warningNote}
              {gate3 == null && summary != null && <FootNote icon="group" tone="summary" parts={summary} />}
              <ActionButton
                label={saving ? (editing ? 'ZAPISUJĘ…' : 'WYSYŁAM…') : editing ? 'ZAPISZ ZMIANY' : 'WYŚLIJ ZLECENIE'}
                tone="green"
                {...(gate3 != null
                  ? gate3.reason != null
                    ? { disabledReason: gate3.reason }
                    : { disabled: true }
                  : {})}
                {...(saving ? { disabled: true } : {})}
                onPress={() => {
                  void save();
                }}
              />
            </>
          )}
        </View>
      )}

      <AirfieldSheet
        visible={icaoField != null}
        title={icaoField === 'arrival' ? 'Lotnisko lądowania' : singleField ? 'Lotnisko skoków' : 'Lotnisko startu'}
        currentIcao={icaoField === 'arrival' ? draft.arrivalIcao : draft.departureIcao}
        position={position}
        onConfirm={(icao) => {
          store.set(icaoField === 'arrival' ? 'arrivalIcao' : 'departureIcao', icao);
          setIcaoField(null);
        }}
        onCancel={() => setIcaoField(null)}
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
        hint="Ile z tego terminu maszyna spędzi w powietrzu."
        onSave={(min) => {
          store.set('plannedAirMin', min);
          setPlanField(null);
        }}
        onCancel={() => setPlanField(null)}
      />

      <NumberSheet
        visible={planField === 'fuel'}
        title="Paliwo do zabrania"
        value={draft.plannedFuelL}
        format={(l) => litres(l)}
        edit={{ toText: (l) => litres(l), parse: parseLitres, keyboardType: 'decimal-pad', label: 'Paliwo do zabrania' }}
        step={5}
        bigStep={20}
        stepLabel="5 L"
        bigStepLabel="20 L"
        min={0}
        {...(aircraft != null ? { max: aircraft.capacityL } : {})}
        placeholder="--"
        unit="L"
        onClear={() => {
          store.set('plannedFuelL', null);
          setPlanField(null);
        }}
        onSave={(l) => {
          store.set('plannedFuelL', l);
          setPlanField(null);
        }}
        onCancel={() => setPlanField(null)}
      />

      <TextEntrySheet
        visible={noteOpen}
        title="Opis zlecenia"
        initialText={draft.notes ?? ''}
        placeholder="Co jest do zrobienia i na co uważać - przeczytają to adresaci"
        multiline
        maxLength={500}
        // Podpowiedzi TU NIE MA: opis dotyczy TEGO jednego lotu (31A).
        suggestions={null}
        onConfirm={(text) => {
          store.set('notes', text.trim() === '' ? null : text.trim());
          setNoteOpen(false);
        }}
        onCancel={() => setNoteOpen(false)}
      />

      {addressees?.kind === 'single' ? (
        <AddresseeSheet
          visible
          title={`${seatLabel(addressees.seat).toUpperCase()} · ADRESAT`}
          options={personOptions({ members, me: pilotId, other: otherOf(addressees.seat) })}
          selected={addressees.selected}
          onSelect={(id) => setAddressees({ ...addressees, selected: id })}
          confirmLabel="GOTOWE"
          onConfirm={() => {
            store.update((d) => withPerson(d, addressees.seat, addressees.selected));
            setAddressees(null);
          }}
          onCancel={() => setAddressees(null)}
        />
      ) : addressees?.kind === 'multi' ? (
        (() => {
          const sheet = multiSheetVm({
            selection: addressees.selection,
            groups: groups ?? [],
            members,
            me: pilotId,
            other: addressees.target === 'shared' ? null : otherOf(addressees.target),
            ...(sentIds != null ? { exclude: sentIds } : {}),
          });
          return (
            <AddresseeSheet
              visible
              kind="multi"
              title={addressees.target === 'shared' ? 'WSPÓLNA LISTA · ADRESACI' : `${seatLabel(addressees.target).toUpperCase()} · ADRESACI`}
              sheet={sheet}
              onToggle={(entry) => setAddressees({ ...addressees, selection: toggled(addressees.selection, entry) })}
              confirmLabel={sheet.total > 0 ? `GOTOWE · ${sheet.total}` : 'GOTOWE'}
              onConfirm={() => {
                const { target, selection } = addressees;
                store.update((d) => {
                  if (target !== 'shared') return withList(d, target, selection);
                  // W edycji lista wspólna to wysłani (do odczytu) plus dopisani - arkusz
                  // poprawia wyłącznie dopisanych.
                  return editing ? { ...d, sharedExtra: selection } : withSharedList(d, selection, aircraft);
                });
                setAddressees(null);
              }}
              onCancel={() => setAddressees(null)}
            />
          );
        })()
      ) : null}

      {exit.sheetMounted && (
        <AbandonDraftSheet
          visible
          title={editing ? 'PORZUCIĆ ZMIANY?' : 'ZREZYGNOWAĆ ZE ZLECENIA?'}
          rows={abandonRows(draft, day, aircraft?.reg ?? null)}
          onStay={exit.stay}
          onAbandon={exit.leave}
        />
      )}
    </Screen>
  );
}

/** Fotel w kroku 3: stan → sposób → adresaci (31B); w edycji - wysłani i dopisani. */
function SeatBlock({
  seat,
  draft,
  aircraft,
  ctx,
  members,
  selfLabel,
  edit,
  onState,
  onMode,
  onClear,
  onPick,
}: {
  seat: RemoteSeat;
  draft: OrderDraft;
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null;
  ctx: Ctx;
  members: readonly Member[];
  selfLabel: string;
  /** Edycja: wysłani tego fotela (`null` przy wspólnej liście), licznik grupy, ostrzeżenie. */
  edit: { sent: RemoteAddressList | null; viaGroup: (groupId: string) => number; loss: string | null } | null;
  onState: (state: 'self' | 'sought' | 'none') => void;
  onMode: (mode: AddressMode) => void;
  onClear: (entry: { kind: 'person' | 'group'; id: string }) => void;
  onPick: () => void;
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const seats = seatsOf(draft, aircraft);
  const state = seats[seat];
  const otherSelf = seats[otherSeat(seat)] === 'self';
  const required = seat === 'dual' && aircraft?.dualRequired === true;
  const address = draft[seat];

  const states: ChoiceCard<'self' | 'sought' | 'none'>[] = [
    // „Ja" stoi najwyżej w jednym fotelu - w drugim gaśnie (brak akcji, nie powód).
    { value: 'self', label: selfLabel, icon: 'person', disabled: otherSelf && state !== 'self' },
    { value: 'sought', label: 'Szukam', icon: 'search' },
    ...(seat === 'dual' ? [{ value: 'none' as const, label: 'Brak', icon: 'seat-none' as const, disabled: required }] : []),
  ];
  const modes: ChoiceCard<AddressMode>[] = [
    { value: 'person', label: 'Osoba', sub: 'imiennie', icon: 'person' },
    { value: 'group', label: 'Grupa', sub: 'lub kilka osób', icon: 'group' },
  ];

  const hint = edit == null ? seatHint(draft, seat, aircraft, ctx) : null;
  const person = address.person == null ? null : members.find((m) => m.id === address.person);

  return (
    <Card style={s.seatCard} contentStyle={s.seatContent}>
      <View style={s.seatHead}>
        <AppText variant="mono" style={s.seatTitle}>
          {seatLabel(seat).toUpperCase()}
        </AppText>
        {/* Właściwość MASZYNY w miejscu wyboru - ta sama plakietka, co na 02. */}
        {required && <Tag label="wymagany · załoga 2-os." tone="amber" />}
      </View>
      <ChoiceCards options={states} value={state} onChange={onState} />
      {edit?.loss != null && <InlineNote icon="warning" tone="amber" text={edit.loss} />}

      {state === 'sought' && !draft.shared && edit != null && (
        <>
          {/* Edycja: „Wysłane do" bez kart „Osoba / Grupa" - wysłanych się tu nie odbiera
              (menu ⋯ na karcie, 32D), a dopisani dostaną zlecenie wyłącznie oni (§5.2). */}
          {edit.sent != null && !isEmptyList(edit.sent) && (
            <>
              <AppText variant="mono" style={s.sendTo}>
                WYSŁANE DO
              </AppText>
              <Chips list={edit.sent} ctx={ctx} members={members} status="sent" viaGroup={edit.viaGroup} />
            </>
          )}
          <Chips list={address.list} ctx={ctx} members={members} status="new" onClear={onClear} />
          <AddRow label="Dodaj adresatów" onPress={onPick} />
        </>
      )}

      {state === 'sought' && !draft.shared && edit == null && (
        <>
          <AppText variant="mono" style={s.sendTo}>
            WYŚLIJ DO
          </AppText>
          <ChoiceCards options={modes} value={address.mode} onChange={onMode} />
          {address.mode === 'person' ? (
            address.person != null ? (
              <>
                <AddressChip
                  kind="person"
                  code={person?.code ?? null}
                  name={person?.name ?? '—'}
                  onClear={() => onClear({ kind: 'person', id: address.person! })}
                />
                {hint != null && <FootNote icon="hint" tone="info" parts={hint} />}
              </>
            ) : (
              <AddRow label="Wybierz osobę" onPress={onPick} />
            )
          ) : (
            <>
              <Chips list={address.list} ctx={ctx} members={members} onClear={onClear} />
              <AddRow label="Dodaj adresatów" onPress={onPick} />
            </>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Grupy i osoby listy - grupy pierwsze, jak w arkuszu 31C. `sent` = wysłane (kłódka,
 * licznik osób, do których grupa naprawdę poszła), `new` = dopisane w edycji.
 */
function Chips({
  list,
  ctx,
  members,
  status = 'draft',
  viaGroup,
  onClear,
}: {
  list: RemoteAddressList;
  ctx: Ctx;
  members: readonly Member[];
  status?: 'draft' | 'sent' | 'new';
  viaGroup?: (groupId: string) => number;
  onClear?: (entry: { kind: 'person' | 'group'; id: string }) => void;
}) {
  if (isEmptyList(list)) return null;
  const groupSub = (id: string): string | null => {
    if (status === 'new') return NEW_SUB;
    const count = status === 'sent' && viaGroup != null ? viaGroup(id) : (peopleOf({ pilotIds: [], groupIds: [id] }, ctx)?.size ?? null);
    return count == null ? null : peopleCount(count);
  };
  return (
    <>
      {list.groupIds.map((id) => (
        <AddressChip
          key={`g-${id}`}
          kind="group"
          name={ctx.groupName(id)}
          sub={groupSub(id)}
          status={status}
          {...(onClear != null && status !== 'sent' ? { onClear: () => onClear({ kind: 'group', id }) } : {})}
        />
      ))}
      {list.pilotIds.map((id) => {
        const member = members.find((m) => m.id === id);
        return (
          <AddressChip
            key={`p-${id}`}
            kind="person"
            code={member?.code ?? null}
            name={member?.name ?? '—'}
            sub={status === 'sent' ? 'imiennie' : status === 'new' ? NEW_SUB : null}
            status={status}
            {...(onClear != null && status !== 'sent' ? { onClear: () => onClear({ kind: 'person', id }) } : {})}
          />
        );
      })}
    </>
  );
}

/** Wiersze arkusza rezygnacji - WYŁĄCZNIE faktyczne wybory prowadzącego. */
function abandonRows(draft: OrderDraft, day: ClubDayBounds | null, reg: string | null): SheetRow[] {
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
    twoCol: { flexDirection: 'row', gap: 9 },
    col: { flex: 1 },
    plan: { fontSize: 8.5, lineHeight: 12, letterSpacing: 1, color: t.colors.textMuted, paddingHorizontal: 2 },
    planAmber: { fontSize: 8.5, lineHeight: 12, letterSpacing: 1, color: t.colors.amber, paddingHorizontal: 2 },
    seatCard: { borderRadius: 14 },
    seatContent: { padding: 11, gap: 8 },
    seatHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 16 },
    seatTitle: { fontSize: 9, letterSpacing: 2, color: t.colors.textSecondary },
    seatNote: { fontSize: 8.5, letterSpacing: 1, color: t.colors.textMuted },
    sendTo: { fontSize: 8, letterSpacing: 1.5, color: t.colors.textMuted, paddingTop: 2, paddingHorizontal: 1 },
    actionBar: {
      gap: 9,
      paddingTop: 10,
      paddingBottom: 12,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
  });
