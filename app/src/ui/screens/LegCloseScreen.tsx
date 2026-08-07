/**
 * UZ Aero — 09 ZAMKNIJ LOT (mockupy `design/09-zamknij-lot.html` + `09a-zamknij-lot-seria.html`).
 *
 * Jednostką potwierdzania danych jest **WZLOT**, nie doba (§3.6). Po STOP ENGINE pilot
 * trafia tutaj: przegląda czasy z detekcji, opcjonalnie dopisuje odczyt liczników i uwagę.
 *
 * Jeden ekran, dwa stany — i to NIE są dwa ekrany ani parametr nawigacji:
 *
 *   • standard (09): liczniki rozwinięte z adnotacją „opcjonalnie", baner pouczający
 *     tłumaczący, po co te odczyty, CTA „ZAPISZ WZLOT";
 *   • seria skokowa (09A): wzlot ma zrzut, więc liczniki zwijają się do jednego wiersza
 *     („w serii nikt nie chodzi do licznika po każdym wzlocie"), a CTA brzmi
 *     „ZAPISZ I LEĆ DALEJ". Cały ekran ma się zamknąć jednym kciukiem — inaczej zmiana
 *     byłaby krokiem wstecz wobec papieru.
 *
 * O tym, który stan obowiązuje, decydują DANE: `vm.drop != null` znaczy „dzień skokowy
 * i ten wzlot miał wyniesienie" (issue #19). Parametr nawigacji dałby ten sam wynik
 * dopóty, dopóki ktoś nie wejdzie tu z „Mój dzień", żeby dokończyć zaległy wzlot.
 *
 * Ekran NICZEGO NIE LICZY: napisy, sumy i stany przychodzą gotowe z `buildLegClose`
 * (`logic/legClose.ts`). Te same liczby czyta serwer i arkusz, więc druga implementacja
 * w widoku rozjechałaby się przy pierwszej zmianie reguły.
 *
 * ODCZYT LICZNIKÓW JEST TU OPCJONALNY i to jest decyzja, nie niedopatrzenie (§3.6):
 * wymagany staje się dopiero przy zdaniu samolotu (09B). Dlatego obok „ZAPISZ WZLOT"
 * stoi „POTWIERDZĘ PÓŹNIEJ" — offline-first zabrania więzić pilota przy telefonie,
 * a czasy i tak są już w rejestrze (to fakty z detekcji) i wchodzą do sum.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  Field,
  Icon,
  ReadingSheet,
  Screen,
  ScreenHeader,
  SummaryStrip,
  SyncChip,
  Tag,
  TextEntrySheet,
  ValueBox,
  toneColors,
  type SummaryStripItem,
  type TextSuggestion,
} from '../components';
import { useTheme } from '../theme';
import { fontFamily } from '../theme/tokens';
import { useEduBanner, useSessionStore } from '../store';
import { useEventCorrection } from '../hooks/useEventCorrection';
import { useTaskSuggestions } from '../hooks/useTaskSuggestions';
import { dateUtcLong, motoHours, parseLitres, parseMotoHours } from '../format';
import { buildLegClose, type DropSummaryVm, type TimeRowVm } from './logic/legClose';

/** Co edytujemy w arkuszu — `null` = wszystkie zamknięte. */
type Editing = 'fuel' | 'mh' | 'notes' | null;

export function LegCloseScreen({
  navigation,
}: {
  navigation: { navigate: (s: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();

  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const lastError = useSessionStore((s) => s.lastError);
  const closeLeg = useSessionStore((s) => s.closeLeg);

  const { openCorrection, correctionSheet } = useEventCorrection();
  // Schowanie banera pouczającego pamiętamy trwale per pilot (`CLAUDE.md`, Typ C).
  const [eduDismissed, setEduDismissed] = useEduBanner('leg-close-counters');

  const [fuelL, setFuelL] = useState<number | null>(null);
  const [mh, setMh] = useState<number | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  /** Rozwinięcie zwiniętych liczników serii — stan wyłącznie wizualny. */
  const [countersOpen, setCountersOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Ostatnio używane notatki — jedyna treść tego ekranu z serwera i jedyna, której brak
  // niczego nie zmienia. Żądanie leci dopiero przy OTWARCIU arkusza (patrz hook).
  const { suggestions: remote, reload: reloadSuggestions } = useTaskSuggestions();
  const noteSuggestions = useMemo<TextSuggestion[] | null | undefined>(
    () => (remote == null ? remote : remote.notes.map((row) => ({ value: row.value, meta: null }))),
    [remote],
  );

  const vm = buildLegClose(projection, events);
  const mhFormat = projection.mhFormat ?? 'decimal';

  /**
   * Odczyt zapisujemy WYŁĄCZNIE w komplecie: `FuelMhReading` to para, a pół odczytu nie
   * jest ogniwem łańcucha paliwowego — zamknęłoby interwał wartością, której nikt nie
   * odczytał. Zamiast po cichu odrzucić połowę wpisu, blokujemy zapis z podanym powodem.
   */
  const halfReading = (fuelL == null) !== (mh == null);
  const reading = fuelL != null && mh != null ? { fuelL, mh } : null;

  const save = useCallback(async () => {
    if (halfReading) return;
    setBusy(true);
    try {
      await closeLeg({ reading, notes });
      navigation.navigate('Cockpit');
    } catch {
      // Powód jest w `lastError` — pokazany banerem niżej.
    } finally {
      setBusy(false);
    }
  }, [closeLeg, halfReading, navigation, notes, reading]);

  // Nie ma czego zamykać: pilot wszedł tu z zaległości, którą właśnie potwierdził
  // na innym urządzeniu, albo silnik jeszcze pracuje. Mówimy to wprost, zamiast
  // rysować pusty formularz (`buildLegClose` zwraca wtedy `null`).
  if (vm == null) return <NothingToClose onBack={() => navigation.navigate('Cockpit')} />;

  /**
   * SERIA = dzień skokowy i ten wzlot miał wyniesienie. `buildLegClose` daje `drop`
   * tylko przy operacji Skoki (issue #19), więc jeden warunek niesie oba fakty.
   */
  const serial = vm.drop != null;
  const countersCollapsed = serial && !countersOpen;

  const summary: SummaryStripItem[] = [
    { value: vm.summary.blockLabel, label: 'Blok' },
    { value: vm.summary.flightLabel, label: 'Lot' },
    serial && vm.drop != null
      ? { value: `${vm.drop.jumperCount}`, label: 'Skoczków', tone: 'blue' }
      : { value: `${vm.summary.takeoffs} / ${vm.summary.landings}`, label: 'St / Ldg' },
    vm.summary.trailing,
  ];

  return (
    <Screen
      scroll
      padded={false}
      header={
        <>
          <ScreenHeader
            title="ZAMKNIJ LOT"
            size="md"
            centered
            subtitle={`${vm.aircraftId} · WZLOT ${vm.legIndex} · ${dateUtcLong(Date.now())} · UTC`}
            right={
              <>
                {/* `.serie-badge` — pilot ma widzieć, że jest w serii, zanim zauważy,
                    że liczniki są zwinięte. */}
                {serial && (
                  <Tag
                    label="Seria"
                    tone="amber"
                    size="md"
                    style={{ borderRadius: theme.radius.pill }}
                  />
                )}
                <SyncChip
                  status={synced ? 'synced' : 'offline'}
                  outboxCount={outboxCount}
                  lastSyncAt={lastSyncAt}
                />
              </>
            }
          />
          {/* Wynik wzlotu policzony ze zdarzeń stoi POZA przewijaniem: pilot wpisuje
              odczyt licznika i musi widzieć czas bloku, z którym ma go porównać. */}
          <SummaryStrip items={summary} />
        </>
      }
      /* Ekran ma własny padding (`padded={false}`), więc stopka nakłada go sama. */
      footer={
        <View style={styles.footer}>
          <ActionButton
            label={serial ? 'ZAPISZ I LEĆ DALEJ' : 'ZAPISZ WZLOT'}
            tone="green"
            variant="solid"
            busy={busy}
            trailingIcon="check"
            disabledReason={
              halfReading
                ? 'Odczyt jest parą — wpisz paliwo i motogodziny albo zostaw oba puste.'
                : null
            }
            onPress={save}
          />
          {/* Offline-first: brak potwierdzenia nie może uwięzić pilota przy telefonie.
              Wzlot zostaje w rejestrze, a „Mój dzień" da mu pasek „do potwierdzenia". */}
          <ActionButton
            label="POTWIERDZĘ PÓŹNIEJ"
            tone="neutral"
            variant="secondary"
            size="md"
            onPress={() => navigation.navigate('Cockpit')}
          />
        </View>
      }
    >
      <View style={styles.content}>
        {/* ── czasy wzlotu: wszystko już zapisane, to jest przegląd z korektą ─── */}
        <Card title="Czasy wzlotu · UTC" flush>
          {vm.times.map((row) => (
            <TimeRow key={row.key} row={row} onCorrect={openCorrection} />
          ))}
        </Card>

        {/* ── zrzut ────────────────────────────────────────────────────────────
            Sekcja istnieje WYŁĄCZNIE, gdy `vm.drop != null` — to brak sekcji, nie
            sekcja pusta (issue #19): zrzut przy przelocie nie mógł się wydarzyć. */}
        {vm.drop != null && <DropSection drop={vm.drop} onCorrect={openCorrection} />}

        {/* ── liczniki ─────────────────────────────────────────────────────────
            W serii zwinięte do jednego wiersza; poza serią rozwinięte, ale nadal
            opcjonalne (§3.6). */}
        {countersCollapsed ? (
          <CollapsedCounters
            skipped={vm.skippedReadings}
            onPress={() => setCountersOpen(true)}
          />
        ) : (
          <Card
            title="Liczniki"
            flush
            headerRight={<Tag label="opcjonalnie" />}
            contentStyle={styles.counters}
          >
            <Field label="Paliwo na pokładzie" hint={vm.fuelHint}>
              <ValueBox
                value={fuelL != null ? `${Math.round(fuelL)}` : ''}
                placeholder="odczytaj z paliwomierza"
                unit="L"
                tone="amber"
                actionIcon="edit"
                onPress={() => setEditing('fuel')}
                accessibilityLabel="Paliwo na pokładzie — wpisz odczyt"
              />
            </Field>

            <Field label="Motogodziny" hint={vm.mhHint}>
              <ValueBox
                value={mh != null ? motoHours(mh, mhFormat) : ''}
                placeholder="odczytaj z licznika"
                unit="MH"
                actionIcon="edit"
                onPress={() => setEditing('mh')}
                accessibilityLabel="Motogodziny — wpisz odczyt"
              />
            </Field>
          </Card>
        )}

        {/* ── ostrzeżenie warunkowe (Typ B) ────────────────────────────────────
            Amber, BEZ „×": znika samo w chwili, gdy pilot wpisze odczyt. To nie jest
            błąd — w serii pomijanie liczników jest w porządku; ostrzeżenie mówi tylko,
            że przy ZDANIU maszyny odczyt będzie wymagany. */}
        {vm.warnSkippedReadings && reading == null && (
          <Banner
            kind="warning"
            tone="amber"
            icon="warning"
            text={
              `Paliwo i motogodziny bez odczytu od ${vm.skippedReadings} wzlotów. To jest ` +
              `w porządku w serii — ale przy zdaniu ${vm.aircraftId} odczyt będzie wymagany, ` +
              'bo bez niego następny pilot nie wie, z czym startuje.'
            }
          />
        )}

        {/* ── uwagi do wzlotu ─────────────────────────────────────────────────
            Pole jest PRZYCISKIEM z wartością, wpisywanie dzieje się w arkuszu — ten sam
            wzorzec co notatka dnia na 02E. W serii nie ma go wcale: ekran ma się zamknąć
            jednym kciukiem, a uwagę pilot dopisze po wylądowaniu na dobre. */}
        {!serial && (
          <Card title="Uwagi do wzlotu" flush headerRight={<Tag label="opcjonalnie" />}>
            <View style={styles.notes}>
              <ValueBox
                variant="text"
                value={notes ?? ''}
                placeholder="Dopisz uwagę — co się wydarzyło w tym locie"
                actionIcon="edit"
                onPress={() => {
                  reloadSuggestions();
                  setEditing('notes');
                }}
                accessibilityLabel="Uwaga do wzlotu — dopisz"
              />
            </View>
          </Card>
        )}

        {/* ── po co te odczyty (baner pouczający, Typ C) ───────────────────────
            Tylko poza serią: w serii to samo miejsce zajmuje ostrzeżenie warunkowe,
            a dwa pudełka o licznikach pod rząd zamieniają radę w szum. */}
        {!serial && (
          <Banner
            kind="edu"
            tone="blue"
            icon="info"
            text={
              'Liczniki możesz pominąć — wymagane są dopiero przy zdaniu samolotu. Ale każdy ' +
              'odczyt zamyka odcinek paliwowy, więc im częściej go robisz, tym dokładniej ' +
              'aplikacja zna normę zużycia tego samolotu.'
            }
            collapsedLabel="Po co te odczyty?"
            dismissed={eduDismissed}
            onDismiss={setEduDismissed}
          />
        )}

        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}
      </View>

      {/* ── arkusze edycji ──────────────────────────────────────────────────── */}
      <ReadingSheet
        visible={editing === 'fuel'}
        title="Odczyt paliwa"
        unit="L"
        tone="amber"
        initialText={fuelL != null ? `${Math.round(fuelL)}` : ''}
        rows={[{ label: 'Paliwo', value: vm.fuelHint }]}
        parse={parseLitres}
        onConfirm={(v) => {
          setFuelL(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      <ReadingSheet
        visible={editing === 'mh'}
        title="Odczyt motogodzin"
        unit="MH"
        tone="neutral"
        keyboard={mhFormat === 'hhmm' ? 'text' : 'decimal'}
        initialText={mh != null ? motoHours(mh, mhFormat) : ''}
        rows={[{ label: 'Motogodziny', value: vm.mhHint }]}
        parse={parseMotoHours}
        onConfirm={(v) => {
          setMh(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      <TextEntrySheet
        visible={editing === 'notes'}
        title="Uwaga do wzlotu"
        initialText={notes ?? ''}
        placeholder="np. odejście na drugi krąg, turbulencja nad lasem"
        multiline
        maxLength={2000}
        suggestions={noteSuggestions}
        onConfirm={(text) => {
          setNotes(text.length > 0 ? text : null);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      {correctionSheet}
    </Screen>
  );
}

/**
 * `.time-row` — jeden czas wzlotu: wartość, skąd pochodzi i ołówek korekty.
 *
 * Plakietka źródła nie jest ozdobą: „13:47 AUTO" i „13:47 RĘCZNIE" to ta sama godzina
 * o zupełnie różnej wiarygodności, a pilot decyduje, którą warto sprawdzić. Ołówka nie
 * ma tam, gdzie nie ma czego poprawiać — zdarzenia, którego nie było, nie da się
 * przesunąć w czasie (`targetUuid === null`).
 */
function TimeRow({ row, onCorrect }: { row: TimeRowVm; onCorrect: (uuid: string) => void }) {
  const { theme } = useTheme();
  const target = row.targetUuid;

  return (
    <View
      style={[
        styles.timeRow,
        { borderBottomWidth: theme.borderWidth, borderBottomColor: theme.colors.border },
      ]}
    >
      <AppText variant="mono" tone="muted" style={styles.timeKey}>
        {row.key}
      </AppText>
      <AppText variant="mono" style={styles.timeValue}>
        {row.value}
      </AppText>
      {row.source != null && (
        <Tag
          label={row.source === 'auto' ? 'Auto' : 'Ręcznie'}
          tone={row.source === 'auto' ? 'green' : 'amber'}
        />
      )}
      <View style={styles.spacer} />
      {target != null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Popraw czas: ${row.key}`}
          onPress={() => onCorrect(target)}
          style={({ pressed }) => [
            styles.editButton,
            {
              borderWidth: theme.borderWidth,
              borderColor: pressed ? theme.colors.greenBorder : theme.colors.borderStrong,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <Icon name="edit" size={15} color={theme.colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * `.drop-body` — wyniesienie zapisane W LOCIE (05E), tutaj wyłącznie do przejrzenia.
 *
 * Świadomie BEZ ołówka, choć mockup go rysuje: `DropSummaryVm` nie niesie uuid zdarzenia,
 * więc nie ma czym zaadresować korekty. Martwa ikona byłaby gorsza od jej braku — pilot
 * tapnąłby w nią i nic by się nie stało.
 */
function DropSection({ drop, onCorrect }: { drop: DropSummaryVm; onCorrect: (u: string) => void }) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');

  return (
    <Card title={`Zrzut ${drop.dropNumber} · zapisany w locie`} flush>
      <View style={styles.dropBody}>
        <AppText variant="display" style={[styles.dropCount, { color: blue.accent }]}>
          {drop.jumperCount}
        </AppText>
        <View style={styles.dropDetail}>
          <AppText variant="mono" tone="secondary" style={styles.dropTypes}>
            {drop.breakdown}
          </AppText>
          <AppText variant="mono" tone="muted" style={styles.dropMeta}>
            {drop.meta}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Popraw zrzut ${drop.dropNumber}`}
          onPress={() => onCorrect(drop.targetUuid)}
          style={({ pressed }) => [
            styles.editButton,
            {
              borderWidth: theme.borderWidth,
              borderColor: pressed ? theme.colors.greenBorder : theme.colors.borderStrong,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <Icon name="edit" size={15} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
    </Card>
  );
}

/**
 * `.collapsed-row` — liczniki zwinięte do jednego wiersza (09A).
 *
 * Kreskowana obwódka mówi „tego jeszcze nie ma", a nie „to jest wyłączone": odczyt
 * w serii jest pominięty świadomie, nie zablokowany. Adnotacja po prawej liczy
 * pominięcia z rzędu — ta sama liczba, która po pięciu zapala ostrzeżenie.
 */
function CollapsedCounters({ skipped, onPress }: { skipped: number; onPress: () => void }) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dopisz odczyt liczników"
      onPress={onPress}
      style={({ pressed }) => [
        styles.collapsed,
        {
          borderWidth: theme.borderWidth,
          borderStyle: 'dashed',
          borderColor: pressed ? amber.border : theme.colors.borderStrong,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <Icon name="add" size={14} color={theme.colors.textSecondary} />
      <AppText variant="mono" tone="secondary" style={styles.collapsedLabel}>
        Dopisz odczyt liczników
      </AppText>
      {skipped > 0 && (
        <AppText variant="body" tone="muted" style={styles.collapsedNote}>
          pominięty w {skipped} wzlotach
        </AppText>
      )}
    </Pressable>
  );
}

/**
 * Kolejka potwierdzeń jest pusta — ekran nie ma czego zamykać.
 *
 * `buildLegClose` zwraca wtedy `null` i to jest stan pełnoprawny, nie awaria: pilot
 * mógł wejść z zaległości, którą właśnie potwierdził, albo silnik znów pracuje.
 */
function NothingToClose({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme();

  return (
    <Screen>
      <View style={[styles.empty, { gap: theme.spacing.md }]}>
        <Icon name="check" size={30} color={theme.colors.borderStrong} />
        <AppText variant="display" tone="secondary" style={styles.emptyTitle}>
          NIC DO POTWIERDZENIA
        </AppText>
        <AppText variant="body" tone="muted" style={styles.emptyDesc}>
          Każdy zamknięty wzlot jest już przejrzany. Kolejny czeka tu po następnym
          STOP ENGINE.
        </AppText>
        <ActionButton
          label="WRÓĆ DO KOKPITU"
          tone="neutral"
          variant="secondary"
          size="md"
          icon="back"
          onPress={onBack}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },
  footer: { gap: 8, paddingHorizontal: 14, paddingBottom: 14 },

  // ── czasy wzlotu ───────────────────────────────────────────────────────────
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 6 },
  timeKey: { width: 72, fontSize: 9, lineHeight: 13, letterSpacing: 1.5, textTransform: 'uppercase' },
  timeValue: { width: 62, fontSize: 17, lineHeight: 22, letterSpacing: 1, fontFamily: fontFamily.monoBold },
  spacer: { flex: 1 },
  // Cel dotykowy 44 px mimo drobnej ikony — ołówek stoi w gęstym wierszu.
  editButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // ── zrzut ──────────────────────────────────────────────────────────────────
  dropBody: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  dropCount: { fontSize: 30, lineHeight: 32, letterSpacing: 1 },
  dropDetail: { flex: 1, gap: 3 },
  dropTypes: { fontSize: 11, lineHeight: 15, letterSpacing: 0.5 },
  dropMeta: { fontSize: 8.5, lineHeight: 12, letterSpacing: 0.5 },

  // ── liczniki ───────────────────────────────────────────────────────────────
  counters: { padding: 12, gap: 11 },
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  collapsedLabel: { fontSize: 10.5, lineHeight: 15, letterSpacing: 1.5, textTransform: 'uppercase' },
  collapsedNote: { flex: 1, fontSize: 10, lineHeight: 14, textAlign: 'right' },

  notes: { padding: 12 },

  // ── stan pusty ─────────────────────────────────────────────────────────────
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, lineHeight: 26, letterSpacing: 1.5, textAlign: 'center' },
  emptyDesc: { fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 270 },
});
