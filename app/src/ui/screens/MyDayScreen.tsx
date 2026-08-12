/**
 * UZ Aero — 01 MÓJ DZIEŃ (mockupy `design/01-moj-dzien.html` + `01a` + `01c`).
 *
 * EKRAN DOMOWY po issue #23: do pilota w danej dobie przypisana jest LISTA SESJI
 * i nic ponadto. Log dnia jest płaską osią czasu (wiersz = jedna sesja, rejestracja
 * jako informacja wiersza — bez grupowania po maszynie), a sumy to Blok i Loty.
 * Klamry służby (meldunek / koniec / „Zamknij dzień") NIE MA — została usunięta razem
 * z modelem: dnia się nie otwiera ani nie zamyka, zaczyna się pierwszą sesją.
 *
 * Ekran NICZEGO NIE LICZY. Napisy i sumy przychodzą gotowe z `buildMyDay`
 * (`logic/myDay.ts`), a sama doba z `usePilotDay`.
 *
 * Wszystko jest projekcją LOKALNEGO strumienia, więc ekran działa w pełni offline —
 * to dane sesji z §6 pkt 1, bez wariantu „z cache". Jedynym śladem sieci jest SyncChip
 * w nagłówku: online **nie rysuje nic** (issue #12), offline to pill z arkuszem
 * szczegółów pod tapnięciem (issue #23 pkt 5) — stemple syncu nie wiszą już na ekranie.
 *
 * Sieć zasila natomiast sam REJESTR (§4.9, issue #32): telefon po czyszczeniu pamięci
 * albo reinstalacji odtwarza własne zdarzenia z serwera. Ekran nie dostaje od tego
 * ANI JEDNEGO nowego elementu — jedyny ślad jest negatywny i dotyczy stanu PUSTEGO
 * (`ready` niżej): „JESZCZE ŻADNEGO LOTU" pokazane pilotowi, który ma dziś trzy sesje,
 * byłoby kłamstwem wyglądającym jak utrata danych. Doba z sesjami rysuje się od razu.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { REFERENCE_META_CHECKED_AT } from '../../application';
import {
  ActionButton,
  AppText,
  Card,
  Icon,
  Screen,
  ScreenHeader,
  Skeleton,
  StatGrid,
  SyncChip,
  Tag,
  type StatCell,
} from '../components';
import { useTheme } from '../theme';
import { fontFamily } from '../theme/tokens';
import { useCurrentPilot, useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { usePilotDay } from '../hooks/usePilotDay';
import { useSkeleton } from '../hooks/useSkeleton';
import { utcDayStart } from '../../domain';
import { dateUtcLong, plural } from '../format';
import { buildMyDay, totalLabel, type SessionRowVm } from './logic/myDay';
import { editableBadge } from './logic/historyDays';

/**
 * Tick raz na minutę. Sum „do teraz" już nie ma (klamra usunięta, issue #23), ale doba
 * UTC w nagłówku i klucz `utcDayStart` muszą przekręcić się o północy — ekran domowy
 * potrafi stać otwarty całą noc i bez ticka pokazywałby wczorajszy dzień do restartu.
 */
function useMinuteTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function MyDayScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string, params?: object) => void };
}) {
  const { theme } = useTheme();

  const repo = useSessionStore((s) => s.repo);
  const queries = useSessionStore((s) => s.queries);
  const loadSession = useSessionStore((s) => s.loadSession);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const streamRevision = useSessionStore((s) => s.streamRevision);
  const streamHydrated = useSessionStore((s) => s.streamHydrated);

  // Tożsamość: kod pilota z profilu logowania, a gdy go jeszcze nie ma — identyfikator
  // z bieżącej sesji. NIGDZIE nie pytamy o kod (`CLAUDE.md`, sekcja „Pilot i samolot").
  const pilotCode = useAuthStore((s) => s.pilot?.code);
  const pilotId = useCurrentPilot((s) => s.id);

  const now = useMinuteTicker();
  const day = utcDayStart(now);
  const pilotDay = usePilotDay(pilotId, day);

  const vm = pilotDay != null ? buildMyDay(pilotDay) : null;

  // Plakietka okna korekty na wejściu do historii (`.history-badge`) — okno 24 h ma być
  // widoczne, zanim pilot pomyśli o szukaniu go (ten sam wzorzec co na ekranie startowym).
  const [historyBadge, setHistoryBadge] = useState<string | null>(null);
  useEffect(() => {
    if (queries == null) return;
    let alive = true;
    void queries.historyDays().then((days) => {
      if (alive) setHistoryBadge(editableBadge(days, Date.now()));
    });
    return () => {
      alive = false;
    };
    // `streamRevision`: odtworzenie rejestru z serwera (§4.9) potrafi dopisać dzień
    // wciąż będący w oknie korekty — plakietka ma go wtedy zobaczyć bez wychodzenia.
  }, [queries, streamRevision]);

  // Stempel ostatniego potwierdzenia cache referencyjnego (§4.8) — od issue #23 nie
  // wisi na ekranie, tylko zasila wiersz w arkuszu szczegółów SyncChipa. Zależność od
  // `lastSyncAt` odświeża wartość, gdy pętla okazji właśnie zsynchronizowała.
  const [refCheckedAt, setRefCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    if (repo == null) return;
    let alive = true;
    void repo.getMeta(REFERENCE_META_CHECKED_AT).then((value) => {
      if (alive) setRefCheckedAt(value != null ? Number(value) : null);
    });
    return () => {
      alive = false;
    };
  }, [repo, lastSyncAt]);

  const empty = vm != null && vm.empty;
  /**
   * Czy dobie już wolno wierzyć. Doba z sesjami — zawsze; doba PUSTA dopiero po
   * pierwszym uzgodnieniu rejestru z serwerem (§4.9, issue #32), bo telefon zaraz po
   * czyszczeniu pamięci ma pusty rejestr, który za chwilę przestanie być pusty.
   * To ta sama zasada, dla której `usePilotDay` oddaje `null` do pierwszego odczytu
   * z bazy — i tak samo jak tam, offline nie każe czekać na nic: lokalny rejestr JEST
   * wtedy najlepszą dostępną prawdą, a odtworzenie wraca natychmiast bez zmian.
   */
  const ready = vm != null && (!empty || streamHydrated);
  /**
   * Dopóki dobie nie wolno wierzyć, miejsce trzymają plamki (issue #33). To NIE JEST
   * to samo, co stan pusty: „JESZCZE ŻADNEGO LOTU" mówi, że dziś nic nie było, a
   * skeleton — że jeszcze nie wiemy (wzorzec `design/LOADERY.html`, reguła 4).
   * Odczyt z SQLite mieści się zwykle pod progiem bramki, więc na co dzień pilot nie
   * zobaczy tu niczego poza gotowym logiem.
   */
  const skeleton = useSkeleton(!ready);

  const totals: StatCell[] =
    vm == null
      ? []
      : [
          {
            label: 'Blok',
            value: totalLabel(vm.totals.block),
            unit: vm.empty
              ? 'brak lotów'
              : `${vm.totals.aircraftCount} ${plural(vm.totals.aircraftCount, 'samolot', 'samoloty', 'samolotów')}`,
          },
          {
            label: 'Loty',
            value: totalLabel(vm.totals.flight),
            unit: `${vm.totals.takeoffs} st / ${vm.totals.landings} ldg`,
          },
        ];

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="MÓJ DZIEŃ"
          size="md"
          // Bez „UTC" w podtytule (uwaga użytkownika przy issue #23): znacznik strefy
          // niesie nagłówek karty „Log dnia · czasy UTC" — tam mówi coś o tabeli.
          subtitle={`${pilotCode ?? pilotId} · ${dateUtcLong(now)}`}
          onSettings={() => navigation.navigate('Settings')}
          right={
            // Licznika sesji w nagłówku nie ma (issue #23 pkt 6) — liczbę sesji widać
            // na liście. Pill offline jest jedynym śladem sieci; szczegóły pod tapnięciem.
            <SyncChip
              status={synced ? 'synced' : 'offline'}
              outboxCount={outboxCount}
              lastSyncAt={lastSyncAt}
              refCheckedAt={refCheckedAt}
            />
          }
        />
      }
    >
      <View style={styles.content}>
        {/* ── log dnia: płaska oś czasu sesji + sumy ─────────────────────────
            Nagłówek karty jest SAMYM napisem — link „Rozliczenie →" usunięty (uwaga
            użytkownika po issue #23): nic nie mówił, a detale sesji mają jedno
            wejście — ołówek wiersza. Zdanie samolotu już POTWIERDZIŁO dane, więc
            wiersz prowadzi do oglądania i korekt, nie do zatwierdzania. */}
        {ready && vm != null && (
          <Card title="Log dnia · czasy UTC" flush>
            {vm.sessions.length === 0 ? (
              <EmptySessions />
            ) : (
              vm.sessions.map((session) => (
                <SessionRow
                  key={session.index}
                  session={session}
                  // Ołówek = detale TEJ sesji (10): ekran 10 opisuje sesję ze store'u,
                  // więc najpierw ładujemy wskazany strumień — ta sama droga, którą
                  // chodzi historia (12).
                  onOpen={async () => {
                    await loadSession(session.sessionUuid);
                    navigation.navigate('Stats');
                  }}
                />
              ))
            )}
            <StatGrid cells={totals} columns={2} />
          </Card>
        )}

        {/* ── akcje: przejęcie (jedyna główna akcja pustego dnia) i wpis ręczny ──
            Cały blok czeka na wczytanie doby (`ready`), bo inaczej pierwsza klatka
            pokazywałaby wielki zielony przycisk pustego dnia pilotowi, który ma
            za sobą trzy sesje — a potem podmieniałaby go pod palcem. */}
        {ready &&
          (empty ? (
            <>
              <ActionButton
                label="ROZPOCZNIJ LOT"
                tone="green"
                variant="solid"
                icon="start"
                onPress={() => navigation.navigate('PreflightAircraft')}
              />
              <AppText variant="mono" tone="muted" style={styles.btnNote}>
                Odczytasz paliwo i motogodziny, potwierdzisz zadanie —{'\n'}i lecisz. Loty zapiszą
                się same.
              </AppText>
            </>
          ) : (
            <>
              {/* Plus, nie strzałki `takeover` (zgłoszenie z urządzenia przy issue #23):
                  mockup 01 rysuje tu DOPISANIE kolejnej sesji do listy dnia, a strzałki
                  `maximize-2` znaczą przejęcie CUDZEJ maszyny (04B). */}
              <ActionButton
                label="ROZPOCZNIJ LOT"
                tone="neutral"
                variant="secondary"
                size="md"
                icon="add"
                onPress={() => navigation.navigate('PreflightAircraft')}
              />
              {/* Ręczny wpis CAŁEGO lotu (mockup 15, story pkt 7): telefon został
                  w kurtce, bateria padła, lot spisany na papierze. Tworzy kompletną
                  sesję z oknem korekty 24 h. */}
              <ActionButton
                label="DODAJ LOT RĘCZNIE"
                tone="neutral"
                variant="secondary"
                size="md"
                icon="edit"
                onPress={() => navigation.navigate('ManualFlight')}
              />
            </>
          ))}

        {/* Ta sama przestrzeń w stanie ładowania: karta logu i JEDEN blok akcji.
            Jeden, bo tyle wiadomo na pewno — pusty dzień dostanie zielone „ROZPOCZNIJ
            LOT" z przypisem, a dzień z sesjami dwa przyciski drugorzędne (wzorzec,
            reguła 2: skeleton obiecuje część wspólną, nie zgaduje wariantu). */}
        {!ready && skeleton && <MyDaySkeleton />}

        {/* ── okno korekty 24 h ma mieć drzwi (12) ─────────────────────────── */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Poprzednie dni"
          onPress={() => navigation.navigate('History')}
          style={({ pressed }) => [
            styles.historyLink,
            {
              borderWidth: theme.borderWidth,
              borderColor: pressed ? theme.colors.greenBorder : theme.colors.border,
            },
          ]}
        >
          <Icon name="clock" size={14} color={theme.colors.textSecondary} />
          <AppText variant="body" tone="secondary" style={styles.historyLabel}>
            Poprzednie dni
          </AppText>
          {historyBadge != null && <Tag label={historyBadge} tone="blue" />}
        </Pressable>

        {/* Stopka „Dane referencyjne · sync" USUNIĘTA (issue #23 pkt 5) — stempel
            mieszka w arkuszu szczegółów SyncChipa. */}
      </View>
    </Screen>
  );
}

/**
 * `.leg-row` — jedna SESJA na płaskiej osi czasu: numer w dobie, czasy silnika nad
 * rejestracją (issue #23 pkt 3: maszyna jest informacją wiersza, nie osią grupowania),
 * loty i czasy trwania. Ołówek (`.edit-btn` z mockupu) otwiera detale tej sesji —
 * tam mieszkają korekty.
 */
function SessionRow({ session, onOpen }: { session: SessionRowVm; onOpen: () => void }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.legRow,
        { borderBottomWidth: theme.borderWidth, borderBottomColor: theme.colors.border },
      ]}
    >
      <AppText variant="mono" tone="secondary" style={styles.legNumber}>
        {session.index}
      </AppText>
      <View style={styles.legId}>
        <AppText variant="mono" style={styles.legTimes}>
          {session.times}
        </AppText>
        <AppText variant="mono" tone="muted" style={styles.legReg}>
          {session.aircraftId}
        </AppText>
      </View>
      <View style={styles.legMetrics}>
        <LegMetric label="Loty" value={session.flightsLabel} />
        <LegMetric label="Blok" value={session.blockLabel} />
        <LegMetric label="Lot" value={session.flightLabel} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sesja ${session.index} — szczegóły i korekty`}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.legEdit,
          {
            borderWidth: theme.borderWidth,
            borderColor: pressed ? theme.colors.greenBorder : theme.colors.borderStrong,
          },
        ]}
      >
        <Icon name="edit" size={15} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

/** `.leg-metric` — mikro-para „klucz nad wartością" wewnątrz wiersza sesji. */
function LegMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.legMetric}>
      <AppText variant="mono" tone="muted" style={styles.legMetricKey}>
        {label}
      </AppText>
      <AppText variant="mono" tone="secondary" style={styles.legMetricValue}>
        {value}
      </AppText>
    </View>
  );
}

/**
 * `.empty-legs` — doba bez sesji mówi to wprost, zamiast udawać tabelę bez wierszy.
 * Napis obiecuje dokładnie to, co robi model: sesje pojawią się same.
 */
function EmptySessions() {
  const { theme } = useTheme();

  return (
    <View style={styles.emptyLegs}>
      <Icon name="aircraft" size={30} color={theme.colors.borderStrong} />
      <AppText variant="display" tone="secondary" style={styles.emptyTitle}>
        JESZCZE ŻADNEGO LOTU
      </AppText>
      <AppText variant="body" tone="muted" style={styles.emptyDesc}>
        Sesje pojawią się tu same, gdy przejmiesz samolot i uruchomisz silnik. Nic nie trzeba
        otwierać.
      </AppText>
    </View>
  );
}

/**
 * Stan ŁADOWANIA logu dnia (issue #33, `design/LOADERY.html`).
 *
 * Geometria jest przepisana z `SessionRow` i `StatGrid` co do piksela — o to w tym
 * wzorcu chodzi: gdy doba dojdzie, plamki podmieniają się na liczby, a nic nie
 * przeskakuje pod palcem trzymanym już nad ołówkiem wiersza.
 *
 * Trzy wiersze, bo tyle mieści się bez przewijania. Liczba mówi o KSZTAŁCIE listy,
 * nie o jej długości — tej nikt jeszcze nie zna.
 */
function MyDaySkeleton() {
  const { theme } = useTheme();

  return (
    <View accessible accessibilityLabel="Ładowanie" style={styles.skeletonBlock}>
      <Card title="Log dnia · czasy UTC" flush>
        {[0, 1, 2].map((row) => (
          <View
            key={row}
            style={[
              styles.legRow,
              { borderBottomWidth: theme.borderWidth, borderBottomColor: theme.colors.border },
            ]}
          >
            <View style={styles.skeletonNumber}>
              <Skeleton width={14} height={12} />
            </View>
            <View style={[styles.legId, styles.skeletonId]}>
              <Skeleton width={96} height={12} />
              <Skeleton width={54} height={9} />
            </View>
            <View style={styles.legMetrics}>
              <SkeletonMetric value={18} />
              <SkeletonMetric value={30} />
              <SkeletonMetric value={30} />
            </View>
            {/* Ołówek ma obrys i cel dotykowy, ale pusty środek: skeleton nie jest
                interaktywny (wzorzec, reguła 6) — nie ma jeszcze dokąd prowadzić. */}
            <View
              style={[
                styles.legEdit,
                { borderWidth: theme.borderWidth, borderColor: theme.colors.border },
              ]}
            />
          </View>
        ))}

        {/* Sumy doby w geometrii `StatGrid`: tło prześwieca przez 1-pikselowe odstępy. */}
        <View style={[styles.skeletonTotals, { backgroundColor: theme.colors.border }]}>
          {[0, 1].map((cell) => (
            <View
              key={cell}
              style={[styles.skeletonTotalCell, { backgroundColor: theme.colors.surface }]}
            >
              <Skeleton width={28} height={8} />
              <Skeleton width={62} height={24} />
              <Skeleton width={50} height={9} />
            </View>
          ))}
        </View>
      </Card>

      {/* Wysokość i zaokrąglenie `ActionButton size="md"` — mniejszego z dwóch
          wariantów, czyli części wspólnej pustego dnia i dnia z sesjami. */}
      <Skeleton height={48} radius={theme.radius.md} />
    </View>
  );
}

/** `.leg-metric` w stanie ładowania: etykieta nad wartością, ta sama para wysokości. */
function SkeletonMetric({ value }: { value: number }) {
  return (
    <View style={styles.skeletonMetric}>
      <Skeleton width={26} height={7} />
      <Skeleton width={value} height={11} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },

  // ── wiersz sesji ───────────────────────────────────────────────────────────
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 6, paddingVertical: 5 },
  legNumber: { minWidth: 44, minHeight: 44, fontSize: 12, lineHeight: 44, textAlign: 'center' },
  legId: { width: 112, gap: 2 },
  legTimes: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  legReg: { fontSize: 8.5, lineHeight: 12, letterSpacing: 1.5, fontFamily: fontFamily.monoBold },
  legMetrics: { flex: 1, flexDirection: 'row', gap: 12 },
  // `.edit-btn` z mockupu: cel dotykowy 44 px, obrys jak pozostałe akcje drugorzędne.
  legEdit: { minWidth: 44, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  legMetric: { gap: 1 },
  legMetricKey: { fontSize: 7, lineHeight: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  legMetricValue: { fontSize: 11, lineHeight: 15 },

  // ── stan ładowania ─────────────────────────────────────────────────────────
  // Odstęp taki sam jak `content.gap`: skeleton zajmuje miejsce karty ORAZ przycisku.
  skeletonBlock: { gap: 12 },
  skeletonNumber: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // Plamki potrzebują odrobinę więcej luzu niż wiersze tekstu, które zastępują —
  // linia ma światło wewnątrz swojej wysokości, prostokąt nie ma go wcale.
  skeletonId: { gap: 4 },
  skeletonMetric: { gap: 3 },
  skeletonTotals: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  skeletonTotalCell: { flexGrow: 1, flexBasis: '45%', gap: 3, paddingHorizontal: 12, paddingVertical: 10 },

  // ── stan pusty listy ───────────────────────────────────────────────────────
  emptyLegs: { alignItems: 'center', gap: 8, paddingVertical: 26, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 19, lineHeight: 22, letterSpacing: 1.5, textAlign: 'center' },
  emptyDesc: { fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 260 },

  // ── stopka ekranu ──────────────────────────────────────────────────────────
  // `.btn-note`: przypis pod przyciskiem, dosunięty do niego ujemnym marginesem.
  btnNote: { fontSize: 8.5, lineHeight: 13, letterSpacing: 0.5, textAlign: 'center', marginTop: -4 },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  historyLabel: { fontSize: 12.5, fontFamily: fontFamily.bodySemiBold },
});
