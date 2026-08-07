/**
 * UZ Aero — 01 MÓJ DZIEŃ (mockupy `design/01-moj-dzien.html` + `01a-moj-dzien-pusty.html`).
 *
 * EKRAN DOMOWY po przebudowie flow (§3.6a): klamra służby wokół listy wzlotów doby,
 * przekrojowo po wszystkich samolotach. Reguła, którą ten ekran ma UCZYNIĆ WIDOCZNĄ:
 * **loty są zapisywane, służba jest deklarowana i zawsze stanowi klamrę wokół lotów**.
 * Dlatego każda z dwóch godzin klamry niesie podpis, SKĄD pochodzi („poprawione" vs
 * „z pierwszego wzlotu"), a „ZAMKNIJ DZIEŃ" jest opcją, nie krokiem procedury.
 *
 * Ekran NICZEGO NIE LICZY. Napisy, sumy i stany klamry przychodzą gotowe z `buildMyDay`
 * (`logic/myDay.ts`), karta samolotu w ręce z `buildHeldAircraft` (`logic/heldAircraft.ts`),
 * a sama doba z `useDutyDay`. To nie jest kosmetyka: te same liczby czyta serwer i arkusz,
 * więc druga implementacja w widoku rozjechałaby się przy pierwszej zmianie reguły.
 *
 * Wszystko jest projekcją LOKALNEGO strumienia, więc ekran działa w pełni offline —
 * to dane sesji z §6 pkt 1, bez wariantu „z cache". Jedynym śladem sieci jest SyncChip,
 * który online **nie rysuje nic** (issue #12) i stempel cache referencyjnego w stopce.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { REFERENCE_META_CHECKED_AT } from '../../application';
import {
  ActionButton,
  AppText,
  Banner,
  Card,
  Icon,
  RefDataStamp,
  Screen,
  ScreenHeader,
  StatGrid,
  StatusChip,
  SyncChip,
  Tag,
  toneColors,
  type StatCell,
} from '../components';
import { useTheme } from '../theme';
import { fontFamily } from '../theme/tokens';
import { useCurrentPilot, useEduBanner, useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useDutyDay } from '../hooks/useDutyDay';
import { utcDayStart } from '../../domain';
import { dateUtcLong, plural } from '../format';
import { buildMyDay, totalLabel, type BracketVm, type LegRowVm } from './logic/myDay';
import { buildHeldAircraft, type HeldAircraftVm } from './logic/heldAircraft';
import { editableBadge } from './logic/historyDays';

/**
 * Tick co pół minuty. Służba w toku liczy się DO TERAZ („8:15 · do teraz"), a liczba,
 * która zastyga w chwili wejścia na ekran, jest gorsza od braku liczby — pilot
 * przepisuje ją do dokumentów. Rozdzielczość `duration` to minuta, więc sekundowy
 * zegar (jak w kokpicie) budziłby ekran 30 razy bez zmiany napisu.
 */
function useHalfMinuteTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function MyDayScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void };
}) {
  const { theme } = useTheme();

  const repo = useSessionStore((s) => s.repo);
  const queries = useSessionStore((s) => s.queries);
  const projection = useSessionStore((s) => s.projection);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);

  // Tożsamość: kod pilota z profilu logowania, a gdy go jeszcze nie ma — identyfikator
  // z bieżącej sesji. NIGDZIE nie pytamy o kod (`CLAUDE.md`, sekcja „Pilot i samolot").
  const pilotCode = useAuthStore((s) => s.pilot?.code);
  const pilotId = useCurrentPilot((s) => s.id);

  const [eduDismissed, setEduDismissed] = useEduBanner('my-day-duty');

  const now = useHalfMinuteTicker();
  const day = utcDayStart(now);
  const duty = useDutyDay(pilotId, day);

  const held = buildHeldAircraft(projection);
  const vm = duty != null ? buildMyDay(duty, now, held?.aircraftId ?? null) : null;

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
  }, [queries]);

  // Stempel ostatniego potwierdzenia cache referencyjnego (§4.8). Zależność od
  // `lastSyncAt` odświeża napis, gdy pętla okazji właśnie zsynchronizowała.
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
  // Dzień zamknięty = pilot ZADEKLAROWAŁ koniec klamry. Nie ma wtedy czego zamykać,
  // więc przycisku nie ma w ogóle — to brak akcji, nie blokada z powodem (issue #19).
  const dayClosed = vm != null && vm.end.origin === 'declared';

  const totals: StatCell[] =
    vm == null
      ? []
      : [
          {
            label: 'Służba',
            value: totalLabel(vm.totals.duty),
            unit: vm.empty ? 'brak wzlotów' : dayClosed ? 'zamknięta' : 'do teraz',
            tone: vm.empty ? undefined : 'green',
          },
          { label: 'Blok', value: totalLabel(vm.totals.block) },
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
          centered
          subtitle={`${pilotCode ?? pilotId} · ${dateUtcLong(now)} · UTC`}
          onSettings={() => navigation.navigate('Settings')}
          right={
            <>
              {/* Prawy slot należy do licznika wzlotów. SyncChip stoi obok, ale online
                  NIE RYSUJE NIC (issue #12) — plakietka istnieje wyłącznie offline,
                  a brak sieci musi być widoczny również na ekranie domowym. */}
              {vm != null && vm.legCount > 0 && (
                <Tag
                  label={`${vm.legCount} ${plural(vm.legCount, 'wzlot', 'wzloty', 'wzlotów')}`}
                  tone="green"
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
      }
    >
      <View style={styles.content}>
        {/* ── reguła klamry (baner POUCZAJĄCY, trwały per pilot) ───────────────
            Typ `edu`: pomocny za pierwszym razem, szum przy każdym kolejnym. Mockup 01
            rysuje go zwiniętym, a 01A rozwiniętym — i to NIE jest reguła per wariant,
            tylko skutek pamiętania stanu: pilot w trzecim wzlocie dnia zamknął
            wyjaśnienie dawno temu. Dlatego stan bierzemy z `useEduBanner`, a nie
            z liczby wzlotów (tak samo tłumaczy to komentarz w samym mockupie). */}
        <Banner
          kind="edu"
          tone="blue"
          icon="clock"
          text={
            'Loty zapisują się same — służby nie musisz zaczynać ani kończyć. Klamra bierze ' +
            'się z pierwszego i ostatniego wzlotu; popraw ją tylko wtedy, gdy zameldowałeś ' +
            'się wcześniej albo zostajesz dłużej niż samolot.'
          }
          collapsedLabel="Jak liczy się służba?"
          dismissed={eduDismissed}
          onDismiss={setEduDismissed}
        />

        {/* ── samolot w ręce — jedyna akcja „na teraz" ─────────────────────── */}
        {held != null && (
          <ClaimCard
            held={held}
            onCockpit={() => navigation.navigate('Cockpit')}
            onRelease={() => navigation.navigate('ReleaseAircraft')}
          />
        )}

        {/* ── klamra służby: meldunek → wzloty → koniec → sumy ─────────────── */}
        {vm != null && (
          <Card title="Służba · wzloty dnia · czasy UTC" flush>
            <BracketRow label="Meldunek" bracket={vm.start} edge="top" />

            {vm.groups.length === 0 ? (
              <EmptyLegs />
            ) : (
              vm.groups.map((group, index) => (
                <View key={`${group.aircraftId}-${index}`}>
                  <View
                    style={[
                      styles.groupHead,
                      {
                        borderBottomWidth: theme.borderWidth,
                        borderBottomColor: theme.colors.hairline,
                      },
                      index > 0 && {
                        borderTopWidth: theme.borderWidth,
                        borderTopColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.groupId}>
                      <AppText variant="mono" style={styles.groupReg}>
                        {group.aircraftId}
                      </AppText>
                      {group.held && (
                        <AppText variant="mono" tone="green" style={styles.groupState}>
                          w ręce
                        </AppText>
                      )}
                    </View>
                    {/* „Rozliczenie" prowadzi do bilansu paliwa i MH tej maszyny (10),
                        a ekran 10 opisuje SESJĘ ZE STORE'U. Dlatego link istnieje tylko
                        przy maszynie trzymanej — dla grup wcześniejszych prowadziłby do
                        cudzych liczb pod właściwym nagłówkiem. */}
                    {group.held && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Rozliczenie ${group.aircraftId}`}
                        onPress={() => navigation.navigate('Stats')}
                        style={({ pressed }) => [styles.groupLink, { opacity: pressed ? 0.6 : 1 }]}
                      >
                        <AppText variant="mono" tone="muted" style={styles.groupLinkLabel}>
                          Rozliczenie
                        </AppText>
                        <Icon name="next" size={11} color={theme.colors.textMuted} />
                      </Pressable>
                    )}
                  </View>

                  {group.legs.map((leg) => (
                    <View key={leg.index}>
                      <LegRow leg={leg} />
                      {!leg.confirmed && (
                        <LegNote
                          index={leg.index}
                          // 09 bierze najstarszy niepotwierdzony wzlot sam (`buildLegClose`),
                          // więc wiersz nie musi go wskazywać — kolejka rozładowuje się
                          // od początku niezależnie od tego, w który pilot tapnął.
                          onPress={() => navigation.navigate('LegClose')}
                        />
                      )}
                    </View>
                  ))}
                </View>
              ))
            )}

            <BracketRow label="Koniec służby" bracket={vm.end} edge="bottom" />
            <StatGrid cells={totals} columns={3} />
          </Card>
        )}

        {/* ── przejęcie: jedyna główna akcja pustego dnia, drugorzędna przy dniu w toku ──
            Cały blok akcji czeka na wczytanie doby (`vm`), bo inaczej pierwsza klatka
            pokazywałaby wielki zielony przycisk pustego dnia pilotowi, który ma za sobą
            trzy wzloty — a potem podmieniałaby go pod palcem. */}
        {vm != null &&
          (empty ? (
            <>
              <ActionButton
                label="PRZEJMIJ SAMOLOT"
                tone="green"
                variant="solid"
                icon="start"
                onPress={() => navigation.navigate('PreflightAircraft')}
              />
              <AppText variant="mono" tone="muted" style={styles.btnNote}>
                Odczytasz paliwo i motogodziny, potwierdzisz zadanie — i lecisz.{'\n'}
                Służba zacznie się sama.
              </AppText>
            </>
          ) : (
            <ActionButton
              label={held != null ? 'PRZEJMIJ INNY SAMOLOT' : 'PRZEJMIJ SAMOLOT'}
              tone="neutral"
              variant="secondary"
              size="md"
              icon="takeover"
              onPress={() => navigation.navigate('PreflightAircraft')}
            />
          ))}

        {/* ── zamknięcie dnia — OPCJONALNE i tak nazwane ──────────────────────
            Nie ma go przy pustym dniu ani po zamknięciu: to brak akcji, nie blokada
            z powodem. Jest natomiast blokada z powodem, gdy silnik jeszcze pracuje —
            wtedy klamry nie da się domknąć, bo ostatni wzlot trwa (`end.editable`). */}
        {vm != null && !empty && !dayClosed && (
          <>
            <ActionButton
              label="ZAMKNIJ DZIEŃ"
              tone="neutral"
              variant="secondary"
              size="md"
              icon="check"
              disabledReason={
                vm.end.editable ? null : 'Wzlot jeszcze trwa — najpierw wyłącz silnik'
              }
              onPress={() => navigation.navigate('ReleaseAircraft')}
            />
            <AppText variant="mono" tone="muted" style={styles.btnNote}>
              {held != null ? `Zamknięcie dnia zda też ${held.aircraftId}. ` : ''}
              Nie musisz go zamykać —{'\n'}niezamknięty dzień domyka się na ostatnim wzlocie.
            </AppText>
          </>
        )}

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

        <RefDataStamp checkedAt={refCheckedAt} style={styles.refStamp} />
      </View>
    </Screen>
  );
}

/**
 * `.claim-card` — samolot, który pilot trzyma teraz.
 *
 * Zielona obwódka i pozycja nad klamrą są z mockupu i mają powód: to jedyny element
 * ekranu, który mówi „zrób coś TERAZ". Reszta ekranu opisuje to, co już się wydarzyło.
 */
function ClaimCard({
  held,
  onCockpit,
  onRelease,
}: {
  held: HeldAircraftVm;
  onCockpit: () => void;
  onRelease: () => void;
}) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');

  return (
    <Card flush style={{ borderColor: green.border }}>
      <View style={styles.claimHead}>
        <View style={styles.claimId}>
          <AppText variant="mono" style={[styles.claimReg, { color: theme.colors.green }]}>
            {held.aircraftId}
          </AppText>
          <AppText variant="mono" tone="muted" style={styles.claimSince}>
            {held.since}
          </AppText>
        </View>
        <StatusChip label={held.engineLabel} tone={held.engineRunning ? 'green' : 'neutral'} />
      </View>

      <View style={styles.claimActions}>
        <ActionButton
          label="KOKPIT"
          tone="green"
          variant="solid"
          size="md"
          icon="start"
          onPress={onCockpit}
          style={styles.claimPrimary}
        />
        <ActionButton
          label="ZDAJ SAMOLOT"
          tone="neutral"
          variant="secondary"
          size="md"
          onPress={onRelease}
        />
      </View>
    </Card>
  );
}

/**
 * `.bracket-row` — jedna godzina klamry z podpisem, SKĄD pochodzi.
 *
 * Podpis nie jest ozdobą: bez niego ekran pokazywałby dwie identyczne liczby o zupełnie
 * różnym statusie — „07:10, bo tak wyszło z lotów" i „07:10, bo pilot tak wpisał" —
 * a pilot nie wiedziałby, czy ma co poprawiać. Kolor podpisu niesie tę samą różnicę:
 * błękit = deklaracja pilota, szarość = wartość wyliczona.
 *
 * Czas lokalny stoi TYLKO tutaj i tylko przy zadeklarowanej godzinie — reguła strefy
 * czasowej z `CLAUDE.md`: pilot melduje się o godzinie lokalnej, wszystko inne jest UTC.
 */
function BracketRow({
  label,
  bracket,
  edge,
}: {
  label: string;
  bracket: BracketVm;
  edge: 'top' | 'bottom';
}) {
  const { theme } = useTheme();
  const resolved = bracket.origin === 'declared' || bracket.origin === 'derived';

  return (
    <View
      style={[
        styles.bracketRow,
        { backgroundColor: theme.colors.surfaceRaised },
        edge === 'top'
          ? { borderBottomWidth: theme.borderWidth, borderBottomColor: theme.colors.border }
          : { borderTopWidth: theme.borderWidth, borderTopColor: theme.colors.border },
      ]}
    >
      <AppText variant="mono" tone="muted" style={styles.bracketLabel}>
        {label}
      </AppText>

      <View style={styles.bracketBody}>
        <View style={styles.bracketValueRow}>
          <AppText
            variant="display"
            style={[
              resolved ? styles.bracketValue : styles.bracketValuePending,
              resolved ? null : { color: theme.colors.textMuted },
            ]}
          >
            {bracket.value}
          </AppText>
          {bracket.localTime != null && (
            <AppText variant="mono" tone="muted" style={styles.bracketLocal}>
              {bracket.localTime} LT
            </AppText>
          )}
        </View>
        <AppText
          variant="mono"
          tone={bracket.origin === 'declared' ? 'blue' : 'muted'}
          style={styles.bracketHint}
        >
          {bracket.hint}
        </AppText>
      </View>
    </View>
  );
}

/** `.leg-row` — jeden wzlot: numer w dobie, czasy i oba czasy trwania. */
function LegRow({ leg }: { leg: LegRowVm }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.legRow,
        { borderBottomWidth: theme.borderWidth, borderBottomColor: theme.colors.border },
      ]}
    >
      {/* Numer wzlotu niepotwierdzonego jest bursztynowy — ten sam sygnał co pasek
          niżej, widoczny również wtedy, gdy pasek zjedzie poza krawędź ekranu. */}
      <AppText
        variant="mono"
        tone={leg.confirmed ? 'secondary' : 'amber'}
        style={styles.legNumber}
      >
        {leg.index}
      </AppText>
      <AppText variant="mono" style={styles.legTimes}>
        {leg.times}
      </AppText>
      <View style={styles.legMetrics}>
        <LegMetric label="Blok" value={leg.blockLabel} />
        <LegMetric label="Lot" value={leg.flightLabel} />
      </View>
    </View>
  );
}

/** `.leg-metric` — mikro-para „klucz nad wartością" wewnątrz wiersza wzlotu. */
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
 * `.leg-note` — wzlot czeka na potwierdzenie.
 *
 * To ZAPROSZENIE, nie ostrzeżenie, i stąd bursztyn zamiast czerwieni: czasy są już
 * w rejestrze i wchodzą do sum (to fakty z detekcji), brakuje wyłącznie przejrzenia
 * i ewentualnych odczytów. Pilot wyszedł z ekranu 09 przez „Potwierdzę później",
 * co offline-first wprost dopuszcza — nic nie jest zepsute, coś jest niedokończone.
 */
function LegNote({ index, onPress }: { index: number; onPress: () => void }) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Dokończ zamknięcie wzlotu ${index}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.legNote,
        {
          backgroundColor: amber.muted,
          borderTopWidth: theme.borderWidth,
          borderTopColor: amber.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Icon name="clock" size={13} color={amber.accent} />
      <AppText variant="mono" style={[styles.legNoteLabel, { color: amber.accent }]}>
        Wzlot {index} — do potwierdzenia
      </AppText>
      <Icon name="more" size={12} color={amber.accent} />
    </Pressable>
  );
}

/**
 * `.empty-legs` — doba bez wzlotów mówi to wprost, zamiast udawać tabelę bez wierszy.
 * Napis obiecuje dokładnie to, co robi model: dzień zacznie się sam.
 */
function EmptyLegs() {
  const { theme } = useTheme();

  return (
    <View style={styles.emptyLegs}>
      <Icon name="aircraft" size={30} color={theme.colors.borderStrong} />
      <AppText variant="display" tone="secondary" style={styles.emptyTitle}>
        JESZCZE ŻADNEGO WZLOTU
      </AppText>
      <AppText variant="body" tone="muted" style={styles.emptyDesc}>
        Dzień zacznie się sam, gdy przejmiesz samolot i uruchomisz silnik. Nic nie trzeba
        otwierać.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },

  // ── karta samolotu w ręce ──────────────────────────────────────────────────
  claimHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 11,
  },
  claimId: { flexShrink: 1, gap: 3 },
  claimReg: { fontSize: 19, lineHeight: 23, letterSpacing: 1.5, fontFamily: fontFamily.monoBold },
  claimSince: { fontSize: 9, lineHeight: 13, letterSpacing: 1, textTransform: 'uppercase' },
  claimActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  claimPrimary: { flex: 1 },

  // ── klamra ─────────────────────────────────────────────────────────────────
  bracketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 12,
  },
  bracketLabel: { width: 74, fontSize: 8, lineHeight: 11, letterSpacing: 2, textTransform: 'uppercase' },
  bracketBody: { flex: 1, gap: 3 },
  bracketValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  bracketValue: { fontSize: 26, lineHeight: 28, letterSpacing: 1.5 },
  /** Wartość jeszcze nieustalona („— : —", „TRWA") — mniejsza i przygaszona. */
  bracketValuePending: { fontSize: 18, lineHeight: 28, letterSpacing: 2 },
  bracketLocal: { fontSize: 10, lineHeight: 14, letterSpacing: 1, marginLeft: 7 },
  bracketHint: { fontSize: 8.5, lineHeight: 12, letterSpacing: 0.5 },

  // ── grupa wzlotów jednej maszyny ───────────────────────────────────────────
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 7,
  },
  groupId: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  groupReg: { fontSize: 12, lineHeight: 16, letterSpacing: 1, fontFamily: fontFamily.monoBold },
  groupState: { fontSize: 8, lineHeight: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  // Cel dotykowy 44 px mimo drobnego napisu — link stoi w gęstej liście.
  groupLink: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 4 },
  groupLinkLabel: { fontSize: 8.5, letterSpacing: 1.5, textTransform: 'uppercase' },

  // ── wiersz wzlotu ──────────────────────────────────────────────────────────
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  legNumber: { minWidth: 44, height: 44, fontSize: 12, lineHeight: 44, textAlign: 'center' },
  legTimes: { width: 104, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  legMetrics: { flex: 1, flexDirection: 'row', gap: 12 },
  legMetric: { gap: 1 },
  legMetricKey: { fontSize: 7, lineHeight: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  legMetricValue: { fontSize: 11, lineHeight: 15 },

  legNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  legNoteLabel: { flex: 1, fontSize: 9.5, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' },

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
  refStamp: { justifyContent: 'center', paddingTop: 2, paddingBottom: 4 },
});
