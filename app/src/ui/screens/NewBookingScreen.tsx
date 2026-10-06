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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { CommonActions, StackActions, type NavigationAction } from '@react-navigation/native';

import {
  AbandonDraftSheet,
  ActionButton,
  AirfieldSheet,
  AppText,
  Card,
  DualSheet,
  Field,
  Icon,
  NumberSheet,
  OptionGrid,
  Screen,
  ScreenHeader,
  Skeleton,
  TextEntrySheet,
  ValueBox,
  type GridOption,
  type SheetRow,
} from '../components';
import { airfieldValueProps } from '../components/input/airfieldMark';
import { uuidv4 } from '../../infrastructure/id';
import type { RemoteBooking } from '../../application/ports';
import { askForPush } from '../hooks/askForPush';
import { useAbandonExit } from '../hooks/useAbandonExit';
import { useBooking } from '../hooks/useBooking';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { useNearbyPosition } from '../hooks/useNearbyPosition';
import { usePilots } from '../hooks/usePilots';
import { useSkeleton } from '../hooks/useSkeleton';
import { useTermPicker } from '../hooks/useTermPicker';
import { useSessionStore } from '../store';
import { useCurrentPilot } from '../store/currentPilot';
import { bookingDraftDirty, useBookingDraft, type BookingDraft } from '../store/bookingDraft';
import { useTheme, type Theme } from '../theme';
import { duration, litres, maskMotoHoursInput, parseLitres, parseMotoHours } from '../format';
import {
  isSameFieldOperation,
  OPERATION_TYPES,
  type OperationType,
} from '../../domain';

import { bookingDeny, BOOKING_OFFLINE, type BookingDenyVm } from './logic/bookingDeny';
import { optInAfterBooking } from './logic/pushOptIn';
import {
  aircraftChanged,
  bookingChanged,
  bookingChanges,
  draftOfBooking,
} from './logic/bookingEdit';
import {
  confirmLabel,
  planNote,
  step1Blocker,
  step2Blocker,
  step2Subtitle,
} from './logic/bookingSteps';
import { toBooking } from './logic/calendarData';
import { dayHeading, dayShort } from './logic/calendarHeading';
import { clubHhmm } from './logic/clubClock';
import { dualRequirementBlocker } from './logic/dualRequirement';
import { operationLabel } from './logic/operations';
import { TermStep } from './TermStep';

/** `dispatch` wykonuje akcję nawigacji zatrzymaną przez bramkę rezygnacji - jak na 02 i 15. */
type Nav = {
  navigate: (screen: string, params?: object) => void;
  /**
   * Po ZAPISIE formularz ustępuje miejsca szczegółom (23), a nie kładzie ich na
   * sobie: „wstecz" z karty rezerwacji ma wrócić do kalendarza, a nie do wypełnionego
   * formularza, z którego ta rezerwacja właśnie powstała.
   */
  replace: (screen: string, params?: object) => void;
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
  route?: { params?: { aircraftId?: string; startsAt?: number; bookingId?: string } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();

  const pilotId = useCurrentPilot((p) => p.id);
  const pilots = usePilots();
  const draft = useBookingDraft();

  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [deny, setDeny] = useState<BookingDenyVm | null>(null);
  const sync = useSessionStore((st) => st.sync);

  /**
   * Godzina, w którą pilot wycelował na osi kalendarza - ŻYCZENIE, nie termin.
   * Podstawiona jako `startsAt` wyglądałaby jak wpisana (issue #62), więc jedzie do
   * zapytania o sugestie, które premiuje sloty blisko niej.
   */
  const preferredAt = route?.params?.startsAt ?? null;

  /**
   * POPRAWKA istniejącego terminu, jeśli nawigacja podała identyfikator („PRZESUŃ
   * I POPRAW" z karty 23). Ten sam formularz, inne znaczenie zapisu.
   */
  const editId = route?.params?.bookingId ?? null;
  const edited = useBooking(editId);
  const base = useMemo(
    () =>
      edited.data == null ? null : draftOfBooking(edited.data.booking, edited.data.day),
    [edited.data],
  );

  // Formularz zaczyna się od pustego szkicu plus tego, co podała nawigacja - albo od
  // odtworzonej rezerwacji. Szkic jest magazynem globalnym, więc bez tego wejście po
  // rezygnacji wracałoby z wyborami sprzed godziny, a te czytają się jak podpowiedź.
  const start = useBookingDraft((d) => d.start);
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (editId == null) {
      start({ aircraftId: route?.params?.aircraftId ?? null });
      return;
    }
    // Podstawiamy RAZ: ponowne wczytanie tej samej rezerwacji (powrót na ekran)
    // przywracałoby wartości sprzed poprawek, których pilot jeszcze nie zapisał.
    if (base == null || seeded.current === editId) return;
    seeded.current = editId;
    start(base);
  }, [start, editId, base, route?.params?.aircraftId]);

  const nameOf = useCallback(
    (id: string | null) => (id == null ? null : (pilots.find((p) => p.id === id)?.name ?? null)),
    [pilots],
  );

  // Krok terminu wspólny ze zleceniem (31). Poprawiany termin nie zderza się sam ze
  // sobą: bez `except` „PRZESUŃ I POPRAW" zaczynało od „SP-AXA jest w tych godzinach
  // zajęta." i nie dawało przejść dalej bez przesunięcia terminu w całości.
  const picker = useTermPicker({
    term: draft,
    preferredAt,
    active: step === 1,
    except: editId,
    now,
    pilotId,
    nameOf,
  });
  const { data, day, aircraft } = picker;
  const skeleton = useSkeleton(data === undefined);

  // ── bramki ────────────────────────────────────────────────────────────────
  const gate1 = { draft, aircraft, bookings: picker.onDay, now };
  const blocker1 = data == null ? 'Rezerwacja wymaga połączenia.' : step1Blocker(gate1);
  const singleField = draft.operation != null && isSameFieldOperation(draft.operation);
  const blocker2 = step2Blocker({ draft, aircraft, singleField });

  // ── wyjście ───────────────────────────────────────────────────────────────
  // W poprawce „niepusty szkic" znaczy co innego niż przy nowej rezerwacji: pilot
  // straci ZMIANY, a nie wpisy - więc bramka rezygnacji porównuje z zapisanym
  // terminem, nie z pustym formularzem.
  const dirty =
    base == null ? bookingDraftDirty(draft, SEEDED) : bookingChanged(draft, base);
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
  const [icaoField, setIcaoField] = useState<'departure' | 'arrival' | null>(null);
  const [planField, setPlanField] = useState<'air' | 'fuel' | null>(null);
  const [dualOpen, setDualOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const position = useNearbyPosition(icaoField != null);

  /**
   * Uuid nadaje TELEFON i to on jest całą idempotencją zapisu (ta sama zasada, co
   * przy zdarzeniach rejestru): powtórzony `POST` przy słabym łączu wraca tym samym
   * terminem, a nie drugą rezerwacją tego samego pilota. Dlatego identyfikator
   * powstaje RAZ na wejście w formularz, a nie przy każdym tapnięciu.
   */
  const bookingId = useRef(uuidv4());

  /**
   * Odmowa → zdanie na ekranie. Wspólna dla zakładania i poprawki: serwer odmawia
   * jednym słownikiem, więc dwa tłumaczenia rozjechałyby się przy pierwszej zmianie.
   */
  const refusalVm = useCallback(
    (result: { refusal: string; taken: RemoteBooking | null; takenAt: number | null }) =>
      bookingDeny({
        refusal: result.refusal,
        taken: result.taken == null ? null : toBooking(result.taken),
        takenAt: result.takenAt,
        now: Date.now(),
        day: day ?? { date: '', startsAt: 0, endsAt: 0 },
        reg: aircraft?.reg ?? null,
        pilotId,
        nameOf,
      }),
    [day, aircraft, pilotId, nameOf],
  );

  const save = useCallback(async () => {
    if (sync == null || day == null || saving) return;
    if (draft.aircraftId == null || draft.startsAt == null || draft.endsAt == null) return;
    if (draft.operation == null) return;

    setSaving(true);
    setDeny(null);
    try {
      /**
       * POPRAWKA BEZ ZMIANY MASZYNY idzie jednym `PATCH`-em i niesie samą różnicę.
       * Brak różnicy to nie jest błąd - pilot wszedł w poprawkę i się rozmyślił,
       * więc karta po prostu wraca bez ani jednego zapisu.
       */
      if (editId != null && base != null && !aircraftChanged(draft, base)) {
        const changes = bookingChanges(draft, base);
        if (changes == null) {
          exit.proceed(StackActions.replace('BookingDetails', { bookingId: editId }));
          return;
        }

        const patched = await sync.patchBooking(editId, changes);
        if (patched == null) {
          setDeny(BOOKING_OFFLINE);
          setStep(1);
          return;
        }
        if (!patched.ok) {
          setDeny(refusalVm(patched));
          setStep(1);
          return;
        }

        draft.reset();
        exit.proceed(StackActions.replace('BookingDetails', { bookingId: editId }));
        return;
      }

      const result = await sync.createBooking({
        id: bookingId.current,
        aircraftId: draft.aircraftId,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        operation: draft.operation,
        dualId: draft.dualId,
        fromIcao: draft.departureIcao === '' ? null : draft.departureIcao,
        toIcao: draft.arrivalIcao === '' ? null : draft.arrivalIcao,
        plannedAirMin: draft.plannedAirMin,
        plannedFuelL: draft.plannedFuelL,
        note: draft.notes,
      });

      // `null` = zapis NIE DOJECHAŁ (brak sieci albo odmowa transportowa). To inna
      // kategoria niż odmowa reguły i mówi co innego: o terminie nie wiemy nic.
      if (result == null) {
        setDeny(BOOKING_OFFLINE);
        setStep(1);
        return;
      }

      if (!result.ok) {
        setDeny(refusalVm(result));
        // Odmowa dotyczy TERMINU I MASZYNY, czyli kroku 1 - tam stoją kontrolki,
        // którymi da się ją naprawić, i tam stoi karta z powodem (makieta 22C).
        setStep(1);
        return;
      }

      /**
       * ZMIANA MASZYNY: nowy termin już stoi, więc stary można oddać (decyzja
       * właściciela 2026-09-21). Kolejność jest częścią tej decyzji - odwrotna
       * zwalniałaby slot, zanim wiadomo, czy jest co wziąć w zamian.
       *
       * Nieudane odwołanie NIE cofa zapisu: pilot ma wtedy DWA terminy i lepiej,
       * żeby dowiedział się o tym z karty starej rezerwacji niż stracił nową.
       */
      if (editId != null) await sync.cancelBooking(editId, null);

      // Szkic ustępuje: następne wejście w formularz zaczyna od nowa, a nie od
      // wyborów sprzed chwili (reguła rezygnacji z issue #55).
      draft.reset();
      // Prośba o zgodę na powiadomienia (epik R-J, J3) - wyłącznie przy rezerwacji,
      // która CZEKA: o jej losie pilot ma się dowiedzieć bez otwierania aplikacji.
      void askForPush(optInAfterBooking(result.booking.status));
      exit.proceed(StackActions.replace('BookingDetails', { bookingId: result.booking.id }));
    } finally {
      setSaving(false);
    }
  }, [sync, day, saving, draft, editId, base, refusalVm, exit]);

  /**
   * Odmowa opisuje KONKRETNY termin i maszynę, więc gaśnie, gdy któreś się zmieni -
   * inaczej karta mówiłaby o godzinach, których w formularzu już nie ma.
   */
  const slotKey = `${draft.aircraftId ?? ''}|${draft.startsAt ?? ''}|${draft.endsAt ?? ''}`;
  const denied = useRef(slotKey);
  useEffect(() => {
    if (denied.current === slotKey) return;
    denied.current = slotKey;
    setDeny(null);
  }, [slotKey]);

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
          <TermStep
            picker={picker}
            term={draft}
            patch={draft.patch}
            deny={deny}
            pilotId={pilotId}
            now={now}
            nameOf={nameOf}
            lengthLabel="Długość rezerwacji"
          />
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
              label={saving ? 'ZAPISUJĘ…' : confirmLabel(draft, day, editId != null)}
              tone="green"
              {...(blocker2 != null ? { disabledReason: blocker2 } : {})}
              /* Przycisk mówi, co się DZIEJE - zapis idzie do serwera i może potrwać
                 na słabym łączu, a samo zgaśnięcie byłoby nieodróżnialne od martwego
                 tapnięcia (reguła ponowienia synchronizacji). */
              {...(saving ? { disabled: true } : {})}
              onPress={() => {
                void save();
              }}
            />
          )}
        </View>
      )}

      {/* Arkusze zostają ZAMONTOWANE, a chowa je `visible` - rama przeżywa własną
          niewidzialność, żeby zdążyć z animacją wyjazdu (`SheetSurface`, issue #62).
          Arkusze kroku terminu (godzina, kalendarz miesięczny) mieszkają w `TermStep`. */}
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
