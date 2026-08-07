/**
 * UZ Aero — 09B ZDAJ SAMOLOT (mockupy `design/09b-zdaj-samolot.html` + `09c-zdaj-bez-lotu.html`).
 *
 * Koniec pracy z TĄ maszyną — i **nie koniec dnia pilota** (§3.6a). Służba liczy się
 * dalej, wzloty zostają w „Mój dzień", a kolejny samolot wejdzie do tej samej doby.
 * To najważniejsze zdanie całej przebudowy flow i dlatego stoi na ekranie banerem
 * typu STATUS (przyrząd, niezamykalny), a nie w komentarzu do kodu.
 *
 * Jeden ekran, dwa stany rozstrzygane DANYMI, nie parametrem nawigacji:
 *
 *   • 09B — sesja ma wzloty: **odczyt liczników jest WYMAGANY**, bo staje się
 *     przekazaniem dla następnego pilota i ogniwem łańcucha MH (§4.5). Pod odczytem
 *     stoi rozliczenie sesji: wzloty, paliwo start → koniec, średnie zużycie na tle
 *     normy samolotu i przyrost licznika;
 *   • 09C — sesja bez ani jednego wzlotu (pogoda, usterka): silnik nie ruszył, więc nie
 *     ma czasów do potwierdzenia ani zużycia do rozliczenia. Liczniki zostają bez zmian
 *     — z furtką korekty, bo licznik fizyczny jest ważniejszy od naszej rachuby (§4.1
 *     pkt 5) — a jedyne pytanie brzmi „dlaczego nie poleciałeś".
 *
 * Ekran NICZEGO NIE LICZY: napisy, sumy i blokady przychodzą z `buildRelease`
 * i funkcji obok niego (`logic/releaseAircraft.ts`).
 *
 * `dutyEnd` NIE JEST tu wysyłany i to jest decyzja (§3.6a): klamrę służby domyka pilot
 * na `01b` albo domyka się sama na ostatnim wzlocie. Gdyby zdanie samolotu ustawiało
 * koniec służby, pilot biorący drugą maszynę zamykałby dzień w jej połowie.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  Field,
  Icon,
  KeyValueRow,
  OptionGrid,
  ReadingSheet,
  Screen,
  ScreenHeader,
  SummaryStrip,
  SyncChip,
  Tag,
  ValueBox,
  toneColors,
  type GridOption,
} from '../components';
import { useTheme } from '../theme';
import { useEduBanner, useSessionStore } from '../store';
import { useAircraft } from '../hooks/useAircraft';
import {
  dateUtcLong,
  litres,
  motoHours,
  parseLitres,
  parseMotoHours,
} from '../format';
import {
  balanceRows,
  buildRelease,
  finalFuelHint,
  finalMhHint,
  handoverText,
  mhRegressionWarning,
  releaseBlocker,
} from './logic/releaseAircraft';
import type { NoFlightReason } from '../../domain';

/**
 * Siatka powodów (`.reason-grid` z 09C) — karty z ikonami, nigdy natywny `<select>`
 * (`CLAUDE.md`). Wartości po angielsku, napisy po polsku: tę samą regułę trzyma
 * `OperationType` od issue #13.
 */
const REASONS: GridOption<NoFlightReason>[] = [
  { value: 'weather', label: 'Pogoda', icon: 'reason-weather' },
  { value: 'malfunction', label: 'Usterka', icon: 'reason-malfunction' },
  { value: 'cancelled', label: 'Odwołane', icon: 'reason-cancelled' },
  { value: 'other', label: 'Inne', icon: 'reason-other' },
];

/**
 * Tick co pół minuty — podpis „Trzymany 09:10 → 10:25 · 1:15" na 09C liczy DO TERAZ.
 * Rozdzielczość `duration` to minuta, więc sekundowy zegar budziłby ekran 30 razy
 * bez zmiany napisu (ta sama reguła co na „Mój dzień").
 */
function useHalfMinuteTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function ReleaseAircraftScreen({
  navigation,
}: {
  navigation: { navigate: (s: string) => void; goBack: () => void };
}) {
  const projection = useSessionStore((s) => s.projection);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const lastError = useSessionStore((s) => s.lastError);
  const releaseAircraft = useSessionStore((s) => s.releaseAircraft);

  // Norma zużycia z cache'u referencyjnego — jedyna dana z serwera na tym ekranie
  // i jedyna, bez której ekran po prostu milczy o normie (`fuelNorm.ts`).
  const aircraft = useAircraft(projection.aircraftId);

  const [handoverDismissed, setHandoverDismissed] = useEduBanner('release-handover');
  /** `null` = pilot nie tknął pola; wtedy pokazujemy to, co wie rejestr. */
  const [fuelEdit, setFuelEdit] = useState<number | null>(null);
  const [mhEdit, setMhEdit] = useState<number | null>(null);
  const [reason, setReason] = useState<NoFlightReason | null>(null);
  const [editing, setEditing] = useState<'fuel' | 'mh' | null>(null);
  const [busy, setBusy] = useState(false);

  const now = useHalfMinuteTicker();
  const vm = buildRelease(projection, now);

  // Wartość pola podąża za rejestrem, dopóki pilot jej nie nadpisze — dzięki temu
  // późne wczytanie sesji nie zostawia pustego formularza z pustym stanem startowym.
  const reading = {
    fuelL: fuelEdit ?? vm?.initial.fuelL ?? null,
    mh: mhEdit ?? vm?.initial.mh ?? null,
  };

  const release = useCallback(async () => {
    if (reading.fuelL == null || reading.mh == null) return;
    setBusy(true);
    try {
      // `dutyEnd` świadomie POMINIĘTY — patrz nota na górze pliku. Powód jedzie tylko
      // wtedy, gdy jest czego dotyczyć: przy sesji ze wzlotami nie ma go w formularzu.
      await releaseAircraft({
        finalReading: { fuelL: reading.fuelL, mh: reading.mh },
        noFlightReason: reason,
      });
      // Wszystko wraca do „Mój dzień", nie do kokpitu: samolotu już nie ma w ręce,
      // a dzień pilota trwa dalej.
      navigation.navigate('MyDay');
    } catch {
      // Powód jest w `lastError` — pokazany banerem niżej.
    } finally {
      setBusy(false);
    }
  }, [navigation, reading.fuelL, reading.mh, releaseAircraft]);

  if (vm == null) return <NoAircraft onBack={() => navigation.navigate('MyDay')} />;

  const withoutLeg = vm.withoutLeg;
  const blocker = releaseBlocker(projection, reading, reason);

  return (
    <Screen
      scroll
      padded={false}
      header={
        <>
          <ScreenHeader
            title="ZDAJ SAMOLOT"
            size="md"
            subtitle={`${vm.aircraftId} · ${dateUtcLong(now)} · UTC`}
            onBack={navigation.goBack}
            backLabel="Kokpit"
            right={
              <SyncChip
                status={synced ? 'synced' : 'offline'}
                outboxCount={outboxCount}
                lastSyncAt={lastSyncAt}
              />
            }
          />
          {/* Bilans sesji zostaje na ekranie, gdy pilot przewija formularz: to z nim
              porównuje przyrost licznika, który właśnie przepisuje. Sesja bez wzlotu
              nie ma czego podsumowywać — paska po prostu nie ma. */}
          {!withoutLeg && (
            <SummaryStrip
              items={[
                { value: vm.summary.legs, label: 'Wzlotów' },
                { value: vm.summary.blockLabel, label: 'Blok' },
                { value: vm.summary.flightLabel, label: 'Lot' },
                { value: vm.summary.heldAt, label: 'Przejęty' },
              ]}
            />
          )}
        </>
      }
      footer={
        <View style={styles.footer}>
          <ActionButton
            label="ZDAJ SAMOLOT"
            // Bursztyn zamiast czerwieni przy zdaniu bez wzlotu: nic się nie zepsuło,
            // dzień po prostu nie doszedł do skutku (mockup 09C).
            tone={withoutLeg ? 'amber' : 'red'}
            variant="solid"
            busy={busy}
            trailingIcon="next"
            disabledReason={blocker}
            onPress={release}
          />
          <ActionButton
            label="JESZCZE NIE — WRÓĆ DO KOKPITU"
            tone="neutral"
            variant="secondary"
            size="md"
            onPress={() => navigation.navigate('Cockpit')}
          />
        </View>
      }
    >
      <View style={styles.content}>
        {withoutLeg ? (
          <>
            {/* ── stan pusty: mówimy wprost, że silnik nie ruszył ────────────── */}
            <EmptySession heldLabel={vm.heldLabel} />

            {/* ── liczniki bez zmian ─────────────────────────────────────────
                Nie każemy przepisywać tego samego. Ale furtka korekty zostaje, bo
                licznik fizyczny jest ważniejszy od naszej rachuby (§4.1 pkt 5) —
                ktoś mógł ruszyć samolot poza aplikacją. */}
            <Card title="Liczniki" flush headerRight={<Tag label="bez zmian" />}>
              <UnchangedRow
                label="Paliwo"
                value={reading.fuelL != null ? `${Math.round(reading.fuelL)}` : '—'}
                unit="L"
                onEdit={() => setEditing('fuel')}
              />
              <UnchangedRow
                label="Motogodziny"
                value={motoHours(reading.mh, vm.mhFormat)}
                unit="MH"
                onEdit={() => setEditing('mh')}
              />
            </Card>

            {/* ── jedyne pytanie tego ekranu ───────────────────────────────────
                UWAGA: `DayClosePayload` nie ma dziś pola na powód (etap B domeny go nie
                dodał), więc wybór ZOSTAJE W EKRANIE i nie trafia do rejestru. Blokada CTA
                jest tu po to, żeby pilot nie oddał samolotu bez odpowiedzi — ale dopóki
                nośnika nie ma, ekran obiecuje więcej, niż zapisuje. Do domknięcia razem
                z etapem D (payload + kolumna + widok administratora). */}
            <Card title="Dlaczego nie poleciałeś?" flush>
              <View style={styles.reasons}>
                <OptionGrid options={REASONS} value={reason} onChange={setReason} />
              </View>
            </Card>

            <Banner
              kind="status"
              tone="blue"
              icon="info"
              text={
                `Przejęcie samolotu zostaje w rejestrze — administrator widzi, że ` +
                `${vm.aircraftId} był zajęty i dlaczego nie poleciał. Twój dzień liczy się ` +
                'dalej: to nie był wzlot, ale byłeś na miejscu.'
              }
            />
          </>
        ) : (
          <>
            {/* ── odczyt końcowy: JEDYNE miejsce w nowym flow, gdzie jest wymagany ── */}
            <Card
              title="Odczyt końcowy"
              flush
              headerRight={<Tag label="wymagane" tone="red" />}
              contentStyle={styles.counters}
            >
              <Field label="Paliwo na pokładzie" hint={finalFuelHint(projection, reading.fuelL)}>
                <ValueBox
                  value={reading.fuelL != null ? `${Math.round(reading.fuelL)}` : ''}
                  placeholder="odczytaj z paliwomierza"
                  unit="L"
                  tone="amber"
                  actionIcon="edit"
                  onPress={() => setEditing('fuel')}
                  accessibilityLabel="Paliwo na pokładzie — wpisz odczyt końcowy"
                />
              </Field>

              <Field label="Motogodziny" hint={finalMhHint(projection, reading.mh)}>
                <ValueBox
                  value={reading.mh != null ? motoHours(reading.mh, vm.mhFormat) : ''}
                  placeholder="odczytaj z licznika"
                  unit="MH"
                  tone="amber"
                  actionIcon="edit"
                  onPress={() => setEditing('mh')}
                  accessibilityLabel="Motogodziny — wpisz odczyt końcowy"
                />
              </Field>
            </Card>

            {/* ── co się stanie z tymi odczytami (baner pouczający, Typ C) ───── */}
            <Banner
              kind="edu"
              tone="green"
              icon="sync"
              text={handoverText(vm.aircraftId, reading, vm.mhFormat)}
              collapsedLabel="Co znaczą te odczyty?"
              dismissed={handoverDismissed}
              onDismiss={setHandoverDismissed}
            />

            {/* ── rozliczenie: policzone, nie do wpisania ────────────────────── */}
            <Card title="Rozliczenie tego samolotu" flush>
              <View style={styles.balance}>
                {balanceRows(projection, reading, aircraft?.consumption ?? null).map((row) => (
                  <KeyValueRow
                    key={row.key}
                    label={row.key}
                    value={row.value}
                    valueTone={row.amber ? 'amber' : 'secondary'}
                    divider
                  />
                ))}
              </View>
            </Card>

            {/* ── Typ A: przyrząd, niezamykalny ─────────────────────────────── */}
            <Banner
              kind="status"
              tone="blue"
              icon="info"
              text={
                'Zdajesz samolot, nie kończysz dnia. Służba liczy się dalej, a wzloty zostają ' +
                'w „Mój dzień". Jeśli za chwilę weźmiesz inny samolot, wejdzie do tej samej służby.'
              }
            />
          </>
        )}

        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}
      </View>

      {/* ── arkusze korekty odczytu ─────────────────────────────────────────── */}
      <ReadingSheet
        visible={editing === 'fuel'}
        title="Odczyt końcowy paliwa"
        unit="L"
        tone="amber"
        initialText={reading.fuelL != null ? `${Math.round(reading.fuelL)}` : ''}
        rows={[
          { label: 'Przy przejęciu', value: litres(projection.fuel.startL) },
          { label: 'Dolane w tej sesji', value: litres(projection.fuel.addedL) },
        ]}
        parse={parseLitres}
        onConfirm={(v) => {
          setFuelEdit(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      <ReadingSheet
        visible={editing === 'mh'}
        title="Odczyt końcowy motogodzin"
        unit="MH"
        tone="neutral"
        keyboard={vm.mhFormat === 'hhmm' ? 'text' : 'decimal'}
        initialText={reading.mh != null ? motoHours(reading.mh, vm.mhFormat) : ''}
        rows={[
          {
            label: 'Przy przejęciu',
            value: `${motoHours(projection.mh.start, vm.mhFormat)} MH`,
          },
          { label: 'Odniesienie', value: finalMhHint(projection, reading.mh) },
        ]}
        parse={parseMotoHours}
        warningFor={(v) => mhRegressionWarning(projection, v)}
        onConfirm={(v) => {
          setMhEdit(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    </Screen>
  );
}

/**
 * `.empty-card` (09C) — sesja, w której silnik ani razu nie ruszył.
 *
 * Mówi to wprost, zamiast rysować tabelę czasów bez wierszy. Plakietka pod spodem jest
 * jedyną miarą takiej sesji: JAK DŁUGO samolot był zablokowany dla innych.
 */
function EmptySession({ heldLabel }: { heldLabel: string | null }) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

  return (
    <Card flush>
      <View style={styles.empty}>
        <Icon name="aircraft-off" size={32} color={theme.colors.borderStrong} />
        <AppText variant="display" tone="secondary" style={styles.emptyTitle}>
          NIE BYŁO WZLOTU
        </AppText>
        <AppText variant="body" tone="muted" style={styles.emptyDesc}>
          Silnik ani razu nie ruszył, więc nie ma czasów do potwierdzenia ani zużycia
          do rozliczenia.
        </AppText>
        {heldLabel != null && (
          <View
            style={[
              styles.hold,
              {
                borderRadius: theme.radius.pill,
                borderWidth: theme.borderWidth,
                borderColor: amber.border,
                backgroundColor: amber.muted,
              },
            ]}
          >
            <AppText variant="mono" style={[styles.holdLabel, { color: amber.accent }]}>
              {heldLabel}
            </AppText>
          </View>
        )}
      </View>
    </Card>
  );
}

/**
 * `.counter-row` (09C) — licznik, którego nie ruszamy, z furtką korekty.
 *
 * Świadomie INNY kształt niż pole odczytu na 09B, choć obie rzeczy dają się poprawić:
 * tam pilot ma coś wpisać, tu ma tylko potwierdzić wzrokiem, że nic się nie zmieniło.
 * Gdyby wyglądały tak samo, „bez zmian" czytałoby się jak pusty formularz do wypełnienia.
 * Ołówek mimo to zostaje — licznik fizyczny bije naszą rachubę (§4.1 pkt 5), bo ktoś mógł
 * ruszyć samolot poza aplikacją.
 */
function UnchangedRow({
  label,
  value,
  unit,
  onEdit,
}: {
  label: string;
  value: string;
  unit: string;
  onEdit: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.counterRow,
        { borderBottomWidth: theme.borderWidth, borderBottomColor: theme.colors.border },
      ]}
    >
      <AppText variant="mono" tone="muted" style={styles.counterKey}>
        {label}
      </AppText>
      <AppText variant="display" style={styles.counterValue}>
        {value}
      </AppText>
      <AppText variant="mono" tone="muted" style={styles.counterUnit}>
        {unit}
      </AppText>
      <View style={styles.spacer} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${value} ${unit} — popraw, jeśli różni się od stanu przy przejęciu`}
        onPress={onEdit}
        style={({ pressed }) => [
          styles.editButton,
          {
            borderWidth: theme.borderWidth,
            borderColor: pressed ? theme.colors.amberBorder : theme.colors.borderStrong,
            borderRadius: theme.radius.sm,
          },
        ]}
      >
        <Icon name="edit" size={15} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

/**
 * Pilot nie trzyma żadnej maszyny — nie ma czego zdawać.
 *
 * `buildRelease` zwraca wtedy `null` i to jest stan pełnoprawny: samolot mógł zostać
 * zdany na innym urządzeniu albo sesja jeszcze się nie wczytała.
 */
function NoAircraft({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme();

  return (
    <Screen>
      <View style={[styles.noSession, { gap: theme.spacing.md }]}>
        <AppText variant="display" tone="secondary" style={styles.emptyTitle}>
          NIE TRZYMASZ SAMOLOTU
        </AppText>
        <AppText variant="body" tone="muted" style={styles.emptyDesc}>
          Zdanie dotyczy maszyny, którą masz w ręce. Żadnej teraz nie ma — zacznij
          od przejęcia.
        </AppText>
        <ActionButton
          label={'WRÓĆ DO „MÓJ DZIEŃ”'}
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

  counters: { padding: 12, gap: 11 },
  reasons: { padding: 12 },
  balance: { paddingHorizontal: 12, paddingVertical: 2 },

  // ── liczniki bez zmian (09C) ───────────────────────────────────────────────
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 6 },
  counterKey: { width: 86, fontSize: 9, lineHeight: 13, letterSpacing: 1.5, textTransform: 'uppercase' },
  counterValue: { fontSize: 24, lineHeight: 28, letterSpacing: 1 },
  counterUnit: { fontSize: 10, lineHeight: 14 },
  spacer: { flex: 1 },
  // Cel dotykowy 44 px mimo drobnej ikony — ołówek stoi w gęstym wierszu.
  editButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // ── stan pusty 09C ─────────────────────────────────────────────────────────
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 22, lineHeight: 26, letterSpacing: 1.5, textAlign: 'center' },
  emptyDesc: { fontSize: 11.5, lineHeight: 18, textAlign: 'center', maxWidth: 260 },
  hold: { marginTop: 4, paddingHorizontal: 10, paddingVertical: 4 },
  holdLabel: { fontSize: 9, lineHeight: 13, letterSpacing: 1.5, textTransform: 'uppercase' },

  noSession: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
