/**
 * Ninerdeck - ekran 27: KARTA MASZYNY (obserwowanie 3.2.0, issue #205;
 * `design/27-samolot.html` i warianty `27a` wolna, `27b` wyłączona, `27c` bez sieci;
 * `docs/obserwowanie-samolotu.md` §6).
 *
 * ══ WEJŚCIA ══ nagłówek wiersza maszyny w kalendarzu (21), skrzynka (25C),
 * powiadomienie push, stopka podglądu 26B - dla osoby ze zdolnością „Obserwowanie
 * samolotów". Karta leży NAD zakładkami, jak 23, 25 i 26: paska zakładek tu nie ma.
 *
 * ══ EKRAN ODPOWIADA, NIE OFERUJE ══
 * Hero = stan „teraz" (kto ją ma, od kiedy, zgodnie z planem czy poza nim), potem
 * karta-przełącznik obserwowania, liczniki ze źródłem, terminy jak w kalendarzu,
 * dwa wykresy 90 dni z kursorem i historia WSZYSTKICH operacji stronami. Ołówków
 * nie ma - karta maszyny niczego nie zmienia poza jednym przełącznikiem (issue #40).
 *
 * ══ CAŁY MODUŁ WYMAGA SIECI ══ (§2.2)
 * Karta czyta cudze operacje, terminy i odczyty innych pilotów - bez sieci mówi to
 * wprost (27C, wzorzec 21B) i ponawia co minutę; cache'u nie ma i nie będzie.
 * Przełącznik zapisuje się na serwerze WPROST, nie przez outbox: bez sieci karta niesie
 * POWÓD w sobie, nie cichy błąd (§6 pkt 3).
 *
 * Napisy i grupy wierszy liczy `logic/aircraftCard.ts`, geometrię wykresów
 * `logic/aircraftSeries.ts` - oba czyste, z testami.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  Card,
  GroupLabel,
  Icon,
  KeyValueRow,
  ReadingsChart,
  Screen,
  ScreenHeader,
  Skeleton,
  WatchSwitch,
} from '../components';
import { toneColors } from '../components/tone';
import { askForPush } from '../hooks/askForPush';
import { useAircraftCard, useAircraftOperations } from '../hooks/useAircraftCard';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilots } from '../hooks/usePilots';
import { useSkeleton } from '../hooks/useSkeleton';
import { useCurrentPilot, useSessionStore } from '../store';
import { useTheme, type Theme } from '../theme';

import {
  aircraftCardVm,
  historyLabel,
  operationRows,
  type HeroVm,
  type OperationRow,
} from './logic/aircraftCard';
import { toSeries } from './logic/aircraftSeries';
import { optInAfterWatch } from './logic/pushOptIn';

type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
};

/** Okno wykresów - te same 90 dni, o które pyta serwer (§6.4). */
const SERIES_DAYS = 90;
const DAY_MS = 86_400_000;

/** Powód, dla którego przełącznik nie zapisał się - WEWNĄTRZ karty, nie pod nią (issue #55). */
const WATCH_OFFLINE = 'Obserwowanie zapisuje serwer - potrzebne połączenie.';

export function AircraftCardScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route?: { params?: { aircraftId?: string } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();

  const aircraftId = route?.params?.aircraftId ?? null;
  const { data, reload } = useAircraftCard(aircraftId);
  const ops = useAircraftOperations(aircraftId);
  const skeleton = useSkeleton(data === undefined);

  const pilotId = useCurrentPilot((p) => p.id);
  const pilots = usePilots();
  const sync = useSessionStore((st) => st.sync);
  const loadSession = useSessionStore((st) => st.loadSession);

  const nameOf = useCallback(
    (id: string) => pilots.find((p) => p.id === id)?.name ?? null,
    [pilots],
  );

  const vm = useMemo(
    () => (data == null ? null : aircraftCardVm(data, { now, pilotId, nameOf })),
    [data, now, pilotId, nameOf],
  );

  const series = useMemo(
    () => (data == null ? null : { mh: toSeries(data.series.mh), fuel: toSeries(data.series.fuel) }),
    [data],
  );

  const rows = useMemo(
    () => (data == null || ops.data == null ? [] : operationRows(ops.data.items, data.aircraft.mhFormat, { now, pilotId, nameOf })),
    [data, ops.data, now, pilotId, nameOf],
  );

  // ── przełącznik obserwowania: zapis wprost, powód w karcie ────────────────
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const toggleWatch = useCallback(async () => {
    if (data == null || aircraftId == null || sync == null || watchBusy) return;
    setWatchBusy(true);
    setWatchError(null);
    const on = !data.watching;
    const done = await sync.setAircraftWatch(aircraftId, on);
    setWatchBusy(false);
    if (!done) {
      setWatchError(WATCH_OFFLINE);
      return;
    }
    // Trzeci moment prośby o zgodę na powiadomienia (§8): osoba właśnie poprosiła o budzik.
    void askForPush(optInAfterWatch(on));
    reload();
  }, [data, aircraftId, sync, watchBusy, reload]);

  const openOperation = useCallback(
    async (row: OperationRow) => {
      if (!row.mine) return;
      await loadSession(row.sessionUuid);
      navigation.navigate('Stats');
    },
    [loadSession, navigation],
  );

  const header = (
    <ScreenHeader title={vm?.title ?? 'SAMOLOT'} size="md" backLabel="Wróć" onBack={() => navigation.goBack()} />
  );

  if (data === null) {
    return (
      <Screen padded={false} header={header}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Offline theme={theme} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen padded={false} header={header}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {vm == null || data == null || series == null ? (
          skeleton ? (
            <>
              <Skeleton width={220} height={12} />
              <Skeleton height={128} radius={16} />
              <Skeleton height={64} radius={14} />
              <Skeleton height={150} radius={14} />
            </>
          ) : null
        ) : (
          <>
            <GroupLabel text={vm.sub} />

            <Hero hero={vm.hero} theme={theme} />

            {/* ══ OBSERWUJ ══ karta-przełącznik: jeden cel dotknięcia na całą kartę. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: vm.watch.on, busy: watchBusy }}
              accessibilityLabel={vm.watch.on ? 'Obserwujesz - wyłącz obserwowanie' : 'Obserwuj tę maszynę'}
              onPress={() => void toggleWatch()}
              style={({ pressed }) => [
                s.watch,
                vm.watch.on
                  ? { borderColor: theme.colors.greenBorder, backgroundColor: theme.colors.greenMuted }
                  : { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface },
                pressed && { opacity: 0.75 },
              ]}
            >
              <View
                style={[
                  s.watchIcon,
                  vm.watch.on
                    ? { backgroundColor: theme.colors.greenMuted }
                    : { backgroundColor: theme.colors.surfaceRaised },
                ]}
              >
                <Icon name="bell" size={18} color={vm.watch.on ? theme.colors.green : theme.colors.textSecondary} />
              </View>
              <View style={s.watchBody}>
                <AppText variant="display" style={s.watchTitle}>
                  {vm.watch.title}
                </AppText>
                <AppText variant="body" style={s.watchSub}>
                  {vm.watch.sub}
                </AppText>
                {watchError != null && (
                  <AppText variant="mono" tone="amber" style={s.watchError}>
                    {watchError}
                  </AppText>
                )}
              </View>
              <WatchSwitch on={vm.watch.on} busy={watchBusy} />
            </Pressable>

            <GroupLabel text="Liczniki" />
            <Card>
              {vm.counters.map((row) => (
                <KeyValueRow key={row.label} label={row.label} value={row.value} sub={row.sub} valueTone="secondary" />
              ))}
            </Card>

            <GroupLabel text="Najbliższe terminy" />
            <Card>
              {vm.upcoming.length === 0 ? (
                <AppText variant="body" tone="muted">
                  Nic nie stoi w kalendarzu tej maszyny.
                </AppText>
              ) : (
                vm.upcoming.map((row) => (
                  <KeyValueRow
                    key={`${row.label} ${row.value}`}
                    label={row.label}
                    value={row.value}
                    sub={row.sub}
                    valueTone={row.tone === 'amber' ? 'amber' : 'secondary'}
                    // Własna rezerwacja prowadzi w kartę 23; cudza i wyłączenie nie otwierają niczego.
                    onPress={row.bookingId == null ? undefined : () => navigation.navigate('BookingDetails', { bookingId: row.bookingId })}
                    pressLabel={row.bookingId == null ? undefined : `Twoja rezerwacja ${row.label}`}
                  />
                ))
              )}
            </Card>

            <View style={s.sectionRow}>
              <GroupLabel text="Przebieg" />
              <AppText variant="micro" tone="muted" style={s.sectionNote}>
                {`ostatnie ${SERIES_DAYS} dni · UTC`}
              </AppText>
            </View>

            <ReadingsChart
              kind="mh"
              title="Motogodziny"
              points={series.mh}
              from={now - SERIES_DAYS * DAY_MS}
              to={now}
              now={now}
              mhFormat={data.aircraft.mhFormat}
              days={SERIES_DAYS}
              nameOf={nameOf}
              legend={[
                { color: 'green', label: 'odczyt przejęcia / zdania' },
                { color: 'blue', label: 'wpis administratora' },
                { color: 'dash', label: 'maszyna stała' },
              ]}
            />

            <ReadingsChart
              kind="fuel"
              title="Paliwo"
              points={series.fuel}
              from={now - SERIES_DAYS * DAY_MS}
              to={now}
              now={now}
              mhFormat={data.aircraft.mhFormat}
              capacityL={data.aircraft.capacityL}
              days={SERIES_DAYS}
              nameOf={nameOf}
              legend={[
                { color: 'green', label: 'odczyt' },
                { color: 'blue', label: 'tankowanie' },
                { color: 'dash', label: 'maszyna stała' },
              ]}
              footer={
                // Sumy okien pod wykresami - te same liczby, co „Ostatnie 30 dni" na 26B, plus 90 dni.
                <View style={s.sums}>
                  {vm.sums.map((sum, i) => (
                    <View key={sum.label} style={[s.sum, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.colors.border }]}>
                      <AppText variant="micro" tone="muted" style={s.sumLabel}>
                        {sum.label}
                      </AppText>
                      <AppText variant="mono" style={s.sumValue}>
                        {sum.line1}
                      </AppText>
                      <AppText variant="mono" style={s.sumValue}>
                        {sum.line2}
                      </AppText>
                    </View>
                  ))}
                </View>
              }
            />

            {/* ══ HISTORIA · WSZYSTKIE OPERACJE ══ zwarte wiersze jak w Historii (24). */}
            <View style={s.sectionRow}>
              <GroupLabel text="Historia" />
              {ops.data != null && (
                <AppText variant="micro" tone="muted" style={s.sectionNote}>
                  {historyLabel(ops.data.total)}
                </AppText>
              )}
            </View>

            {ops.data === undefined ? (
              <>
                <Skeleton height={56} radius={12} />
                <Skeleton height={56} radius={12} />
              </>
            ) : ops.data === null ? (
              <AppText variant="body" tone="muted" style={s.historyMissing}>
                Historia tej maszyny nie dojechała - wróć na ten ekran z zasięgiem.
              </AppText>
            ) : rows.length === 0 ? (
              <AppText variant="body" tone="muted" style={s.historyMissing}>
                Ta maszyna nie ma jeszcze ani jednej operacji w dzienniku.
              </AppText>
            ) : (
              <View style={s.hist}>
                {rows.map((row) => (
                  <OpRow key={row.sessionUuid} row={row} onOpen={openOperation} theme={theme} />
                ))}
                {/* Doładowanie starszych - ta sama kontrolka, co archiwum w Historii (24):
                    ton podpisu i przerywana ramka, bo to droga do RESZTY, nie akcja ekranu. */}
                {ops.data.next != null && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Pokaż starsze, ${ops.data.remaining}`}
                    onPress={ops.loadMore}
                    disabled={ops.loadingMore}
                    style={({ pressed }) => [s.expand, pressed && { opacity: 0.7 }]}
                  >
                    <AppText variant="micro" tone="muted" style={s.expandLabel}>
                      {ops.loadingMore ? 'Wczytywanie…' : 'Pokaż starsze'}
                    </AppText>
                    <AppText variant="micro" tone="secondary" style={s.expandCount}>
                      {String(ops.data.remaining)}
                    </AppText>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * HERO: STAN TERAZ. Ton karty idzie za stanem (zieleń = pracuje, bursztyn = wyłączona,
 * błękit = zarezerwowana, neutralny = wolna), a pod kreską stoi, do której chwili
 * dotarły zapisy - rejestr mówi prawdę o swojej dokładności (§2.3).
 */
function Hero({ hero, theme }: { hero: HeroVm; theme: Theme }) {
  const s = styles(theme);
  const tone = hero.tone === 'off' ? null : toneColors(theme, hero.tone);
  const badge = hero.badgeTone === 'dim' ? null : toneColors(theme, hero.badgeTone);

  return (
    <View style={[s.hero, { borderColor: tone?.border ?? theme.colors.borderStrong }]}>
      <View style={s.heroTop}>
        <AppText variant="micro" tone="muted" style={s.heroDate}>
          Stan teraz
        </AppText>
        <View
          style={[
            s.heroBadge,
            badge == null
              ? { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderStrong }
              : { backgroundColor: badge.muted, borderColor: badge.border },
          ]}
        >
          <AppText variant="micro" style={[s.heroBadgeText, { color: badge?.accent ?? theme.colors.textMuted }]}>
            {hero.badge}
          </AppText>
        </View>
      </View>

      <View style={s.heroMain}>
        <AppText variant="display" style={s.heroName}>
          {hero.main}
        </AppText>
        {hero.small != null && (
          <AppText variant="mono" tone="secondary" style={s.heroSmall}>
            {hero.small}
          </AppText>
        )}
      </View>

      {(hero.zone != null || hero.count != null) && (
        <View style={s.heroMeta}>
          {hero.zone != null && (
            <AppText variant="micro" tone="muted" style={s.heroZone}>
              {hero.zone}
            </AppText>
          )}
          {hero.zoneValue != null && (
            <AppText variant="mono" tone="secondary" style={s.heroDur}>
              {hero.zoneValue}
            </AppText>
          )}
          {hero.count != null && (
            <AppText variant="display" style={[s.heroCount, { color: tone?.accent ?? theme.colors.textPrimary }]}>
              {hero.count}
            </AppText>
          )}
          {hero.after != null && (
            <AppText variant="mono" tone="secondary" style={s.heroDur}>
              {hero.after}
            </AppText>
          )}
        </View>
      )}

      <AppText variant="mono" tone="muted" style={[s.heroNote, { borderTopColor: theme.colors.border }]}>
        {hero.note}
      </AppText>
    </View>
  );
}

/**
 * Zwarty wiersz operacji (`.op`): kto, kiedy, ile, a w drugiej linii ODCZYTY
 * przejęcie → zdanie. Własna operacja otwiera rozliczenie (10) i ma szewron; cudza nie
 * otwiera niczego - jej szczegóły to dziennik panelu. Wiersz bez szewronu NIE jest
 * wyszarzony: to brak akcji, nie zablokowana akcja.
 */
function OpRow({
  row,
  onOpen,
  theme,
}: {
  row: OperationRow;
  onOpen: (row: OperationRow) => Promise<void>;
  theme: Theme;
}) {
  const s = styles(theme);
  return (
    <Pressable
      style={({ pressed }) => [s.op, row.mine && pressed && { borderColor: theme.colors.borderStrong }]}
      accessibilityRole={row.mine ? 'button' : undefined}
      accessibilityLabel={`${row.hours}, ${row.who}`}
      disabled={!row.mine}
      onPress={() => void onOpen(row)}
    >
      <View style={s.opMain}>
        <AppText variant="mono" style={s.opHours} numberOfLines={1}>
          {row.hours}
          <AppText variant="mono" style={s.opWho}>
            {`  ${row.who}`}
          </AppText>
        </AppText>
        <AppText variant="mono" tone="secondary" style={s.opSig} numberOfLines={1}>
          {row.readings}
        </AppText>
      </View>
      <View style={s.nums}>
        {row.nums.map((value, i) => (
          <AppText key={i} variant="mono" tone="secondary" style={[s.num, i === 0 && s.numFirst]}>
            {value}
          </AppText>
        ))}
      </View>
      <View style={s.go}>{row.mine && <Icon name="more" size={13} color={theme.colors.borderStrong} />}</View>
    </Pressable>
  );
}

/**
 * Bez sieci - karta na cały ekran, ten sam prymityw, co kalendarz (21B) i pusta flota
 * (02G). Przycisku ponowienia NIE MA, ale ekran nie stoi: dopóki widać tę kartę, pyta
 * serwer co minutę i wraca sam. Przełącznika „Obserwuj" tu nie ma - zapis idzie na
 * serwer wprost, więc bez sieci obiecywałby akcję, której nie da się wykonać.
 */
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
          Karta maszyny pokazuje cudze operacje, terminy i odczyty - a tego telefon nie wie
          bez połączenia z serwerem.
        </AppText>
        <AppText variant="body" style={s.warningText}>
          Wróć tu z zasięgiem. Lot rozpoczniesz bez tego ekranu - wystarczy „ROZPOCZNIJ LOT" na Pulpicie.
        </AppText>
      </View>
    </Card>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 14, gap: 12, paddingBottom: 28 },

    hero: {
      borderWidth: t.borderWidth,
      borderRadius: 16,
      backgroundColor: t.colors.surface,
      paddingTop: 15,
      paddingHorizontal: 14,
      paddingBottom: 13,
      gap: 8,
    },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    heroDate: { letterSpacing: 1.5 },
    heroBadge: { borderWidth: t.borderWidth, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
    heroBadgeText: { fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
    heroMain: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
    heroName: { fontSize: 26, letterSpacing: 1.5, lineHeight: 28, color: t.colors.textPrimary },
    heroSmall: { fontSize: 10, letterSpacing: 1 },
    heroMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
    heroZone: { fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
    heroDur: { fontSize: 10.5, letterSpacing: 1 },
    heroCount: { fontSize: 17, letterSpacing: 1.5, lineHeight: 20 },
    heroNote: { fontSize: 8.5, letterSpacing: 0.8, paddingTop: 6, borderTopWidth: 1, borderStyle: 'dashed' },

    watch: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 13,
      borderRadius: 14,
      borderWidth: t.borderWidth,
    },
    watchIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    watchBody: { flex: 1, minWidth: 0, gap: 2 },
    watchTitle: { fontSize: 17, letterSpacing: 1.5, lineHeight: 19, color: t.colors.textPrimary },
    watchSub: { fontSize: 10.5, lineHeight: 15, color: t.colors.textSecondary },
    watchError: { fontSize: 9, lineHeight: 13, letterSpacing: 0.5, paddingTop: 2 },

    sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    sectionNote: { letterSpacing: 1, textTransform: 'none' },

    sums: { flexDirection: 'row' },
    sum: { flex: 1, paddingVertical: 9, paddingHorizontal: 13, gap: 3 },
    sumLabel: { letterSpacing: 1.5 },
    sumValue: { fontSize: 10.5, lineHeight: 15, letterSpacing: 0.5, color: t.colors.textPrimary },

    hist: { gap: 6 },
    historyMissing: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
    op: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingVertical: 9,
      paddingLeft: 12,
      paddingRight: 10,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    opMain: { flex: 1, gap: 3, minWidth: 0 },
    opHours: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: t.colors.textPrimary },
    opWho: { fontSize: 10, fontWeight: '400', letterSpacing: 0.3, color: t.colors.textSecondary },
    opSig: { fontSize: 9, letterSpacing: 0.3 },
    nums: { flexDirection: 'row' },
    num: { fontSize: 11.5, fontWeight: '700', textAlign: 'right', width: 40 },
    numFirst: { width: 20 },
    go: { width: 18, alignItems: 'center', justifyContent: 'center' },
    expand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 42,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.colors.borderStrong,
    },
    expandLabel: { flex: 1, letterSpacing: 1.5 },
    expandCount: { fontWeight: '700' },

    warning: { alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 20 },
    warningTitle: { fontSize: 19, lineHeight: 22, letterSpacing: 1.5, color: t.colors.amber },
    warningText: { fontSize: 12, lineHeight: 18, textAlign: 'center', color: t.colors.textSecondary },
  });
