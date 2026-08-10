/**
 * UZ Aero — 10 ROZLICZENIE SAMOLOTU.
 *
 * Odwzorowanie mockupu `design/10-statystyki.html`: okno korekty → czas blokowy sesji →
 * karty załogi → lista wzlotów → paliwo → motogodziny → zrzuty → para akcji.
 *
 * Rozlicza JEDNĄ SESJĘ SAMOLOTU (przejęcie → zdanie), a nie dzień pilota. Do 2026-08-06
 * były tym samym; po §3.6a nie są — służba należy do pilota, obejmuje kilka maszyn
 * i mieszka na „Mój dzień" (01). Dlatego bohaterem ekranu jest czas blokowy, a nie duty.
 *
 * Ekran jest **wyłącznie do odczytu**: nie emituje ani jednego zdarzenia. Wszystko, co
 * pokazuje, jest projekcją ze strumienia lokalnego (§5.2), więc te same liczby wychodzą
 * na telefonie bez zasięgu i po synchronizacji — dlatego nie ma tu ani jednego wariantu
 * „dane z cache". SyncChip w nagłówku mówi wyłącznie o tym, ile zdarzeń czeka w outboksie,
 * a nie o wiarygodności statystyk.
 *
 * Kolejność sekcji nie jest dowolna: najpierw to, co ma termin (okno korekty), potem to,
 * co pilot przepisuje do dokumentów (czas blokowy, załoga, loty), a dopiero na końcu
 * rozliczenia (paliwo, motogodziny, zrzuty). Akcje stoją pod wszystkim — „ZATWIERDŹ"
 * ma być decyzją po przeczytaniu, nie skrótem na górze ekranu.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  CrewCard,
  CrewGrid,
  DataTable,
  SessionHero,
  FreshnessNote,
  ResultRow,
  Screen,
  ScreenHeader,
  StatGrid,
  SyncChip,
  Tag,
  type DataTableRow,
  type StatCell,
  type Tone,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { useAircraft } from '../hooks/useAircraft';
import { useEventCorrection } from '../hooks/useEventCorrection';
import { correctionWindow } from '../../domain';
import { motoHours, timeUtc } from '../format';
import {
  buildCrewCards,
  buildFlightRows,
  dateTimeUtcShort,
  flightsBadge,
  fuelPerHour,
  hhmm,
  jumperBreakdown,
  sessionSubtitle,
} from './logic/statsDay';
import { compareToNorm, normLabel, verdictLabel } from './logic/fuelNorm';
import { legsLabel } from './logic/claimStrip';

/** Kolumny listy lotów — `#` i `Typ` mają stałą szerokość, czasy dzielą resztę po równo. */
const FLIGHT_COLUMNS = [
  { label: '#', width: 20 },
  { label: 'Takeoff' },
  { label: 'Landing' },
  { label: 'Czas' },
  { label: 'Typ', width: 66 },
];

export function StatsScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string, params?: object) => void };
}) {
  const { theme } = useTheme();

  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const queries = useSessionStore((s) => s.queries);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const currentPilotId = useCurrentPilot((s) => s.id);
  const { openCorrection, correctionSheet } = useEventCorrection();

  // Norma zużycia z cache'u referencyjnego — jedyna dana z serwera na tym ekranie.
  // Reszta liczb jest projekcją lokalnych zdarzeń, więc zawsze świeża (§5.2).
  const aircraftRef = useAircraft(projection.aircraftId);
  const norm = aircraftRef?.consumption ?? null;
  const verdict = compareToNorm(
    projection.fuel.consumedL != null && projection.blockTimeMs > 0
      ? projection.fuel.consumedL / (projection.blockTimeMs / 3_600_000)
      : null,
    norm,
  );
  const normVerdict = verdictLabel(verdict);
  const normTone: Tone = verdict === 'w-normie' ? 'green' : 'amber';

  // Karty załogi pokazują KOD pilota (TMK/AKO) — tak jak mockup i jak dokumenty.
  // Kody mieszkają w cache referencyjnym; do czasu odczytu pokazujemy identyfikator.
  const [codes, setCodes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (queries == null) return;
    let alive = true;
    void queries.pilots().then((list) => {
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const pilot of list) map[pilot.id] = pilot.code;
      setCodes(map);
    });
    return () => {
      alive = false;
    };
  }, [queries]);

  const codeOf = useCallback((id: string) => codes[id] ?? id, [codes]);

  /** Wejście w ślad lotu (14) — numer lotu w tabeli jest celem dotykowym. */
  const openTrack = useCallback(
    (flightIndex: number) => {
      const sessionUuid = projection.sessionUuid;
      if (sessionUuid == null) return;
      navigation.navigate('Track', { sessionUuid, flightIndex });
    },
    [navigation, projection.sessionUuid],
  );

  /**
   * Okno korekty (§decyzja 2026-07-23). Termin jest wartością BEZWZGLĘDNĄ, więc nie
   * potrzebuje tykającego zegara — liczymy go raz na zmianę projekcji.
   */
  const window24h = useMemo(() => correctionWindow(projection, Date.now()), [projection]);

  const crewChanged = useMemo(() => events.some((e) => e.type === 'crew_change'), [events]);

  const crewCards = useMemo(
    () => buildCrewCards(projection, currentPilotId, codeOf, crewChanged),
    [codeOf, crewChanged, currentPilotId, projection],
  );

  const flightRows = useMemo<DataTableRow[]>(
    () =>
      buildFlightRows(projection.flights).map((row) => ({
        id: row.id,
        label: row.label,
        cells: [
          // Numer lotu otwiera ślad (14) — wejście z mockupu 10. Lot ręczny też jest
          // klikalny: ekran 14 tłumaczy wtedy, DLACZEGO trasy nie ma (wariant 14B),
          // a martwy numer kazałby pilotowi zgadywać, czy to brak danych, czy awaria.
          {
            text: row.no,
            muted: true,
            pressLabel: `Ślad lotu ${row.no}`,
            onPress: () => openTrack(Number(row.no)),
          },
          { text: row.takeoff },
          { text: row.landing },
          { text: row.time },
          { text: row.methodLabel, chip: row.method === 'auto' ? 'green' : 'amber' },
        ],
      })),
    [projection.flights, openTrack],
  );

  // Dzień bez sesji nie ma czego podsumowywać — pokazujemy to wprost, zamiast
  // rysować siatkę myślników.
  if (projection.sessionUuid == null) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
          <AppText variant="display" style={{ textAlign: 'center' }}>
            BRAK DANYCH DNIA
          </AppText>
          <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
            Statystyki liczą się ze zdarzeń dnia lotnego. Zacznij od preflightu, a wrócą tu
            same — również bez zasięgu.
          </AppText>
        </View>
      </Screen>
    );
  }

  const aircraft = projection.aircraftId ?? '—';
  const mhFormat = projection.mhFormat ?? 'decimal';
  const mhFormatLabel = mhFormat === 'hhmm' ? 'hh:mm' : 'dziesiętny';
  /**
   * Zakres SESJI: przejęcie → zdanie. Nie klamra służby (§3.6a) — ten ekran rozlicza
   * jeden samolot, a służba należy do pilota i potrafi objąć kilka maszyn.
   * Sesja jeszcze trwa, dopóki `closedAt` jest puste; wtedy mówimy to wprost.
   */
  const sessionRange =
    projection.claimedAt != null
      ? `przejęty ${timeUtc(projection.claimedAt)} → ${
          projection.closedAt != null ? `zdany ${timeUtc(projection.closedAt)} UTC` : 'jeszcze w ręce'
        } · ${legsLabel(projection.legs.length)}`
      : undefined;

  const fuelCells: StatCell[] = [
    { label: 'Startowe', value: amount(projection.fuel.startL), unit: 'litrów', tone: 'amber' },
    { label: 'Dolane', value: amount(projection.fuel.addedL), unit: 'litrów', tone: 'amber' },
    { label: 'Końcowe', value: amount(projection.fuel.endL), unit: 'litrów', tone: 'amber' },
    { label: 'Zużyte', value: amount(projection.fuel.consumedL), unit: 'litrów', tone: 'amber' },
  ];

  const dropCells: StatCell[] = [
    { label: 'Zrzutów', value: `${projection.drops.count}`, unit: 'wyniesień', tone: 'blue' },
    {
      label: 'Skoczków',
      value: `${projection.drops.totalJumpers}`,
      unit: 'łącznie',
      tone: 'blue',
    },
  ];

  // Sekcja rozliczeniowa operacji Skoki. Pokazujemy ją także przy zerze zrzutów, gdy
  // dzień był zadeklarowany jako skoki — brak wyniesień jest wtedy informacją, nie ciszą.
  const showDrops = projection.drops.count > 0 || projection.operation === 'skoki';

  const mhDelta =
    projection.mh.deltaH == null
      ? '—'
      : `${projection.mh.deltaH >= 0 ? '+' : '−'}${motoHours(Math.abs(projection.mh.deltaH), mhFormat)}`;

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="ROZLICZENIE"
          size="md"
          // Powrót JEST i prowadzi na 01 (mockup 10: „‹ Dzień"). Ekran otwierał się kiedyś
          // wyłącznie po zamknięciu dnia — dziś wchodzi się tu z „Mój dzień" linkiem przy
          // KAŻDEJ maszynie doby, także w jej trakcie, więc droga powrotna musi istnieć.
          onBack={() => navigation.navigate('MyDay')}
          backLabel="Dzień"
          subtitle={sessionSubtitle(aircraft, projection.claimedAt, projection.closedAt)}
          right={
            <>
              <Tag
                // Plakietka liczy WZLOTY, nie loty (mockup 10): jednostką sesji jest cykl
                // silnika, a kołowanie techniczne bez startu też jest wzlotem.
                label={legsLabel(projection.legs.length)}
                tone="green"
                size="md"
                style={{ borderRadius: theme.radius.pill }}
              />
              <SyncChip
                status={synced ? 'synced' : 'offline'}
                outboxCount={outboxCount}
                lastSyncAt={lastSyncAt}
              />
            </>
          }
        />
      }
      /* Para akcji na końcu treści; przy krótkim dniu (mało lotów) dosuwa się do dołu.
         Ekran ma własny padding, więc stopka też nakłada go sama.
         Mockup linkuje 04c — a 04c jest arkuszem NAD logiem, nie ekranem. Pełny log dnia
         z ołówkami (i dopisaniem brakującego lotu) to lista ręczna; tabela wyżej pokrywa
         korekty samych lotów. */
      footer={
        <View style={{ gap: theme.spacing.sm, paddingHorizontal: 14, paddingBottom: 14 }}>
          <ActionButton
            label="EDYTUJ DANE"
            tone="neutral"
            variant="secondary"
            size="md"
            icon="edit"
            onPress={() => navigation.navigate('ManualLog')}
          />
          <ActionButton
            label="ZATWIERDŹ → SYNC"
            tone="green"
            variant="solid"
            trailingIcon="next"
            onPress={() => navigation.navigate('Sync')}
          />
        </View>
      }
    >
      <View style={{ padding: 14, gap: theme.spacing.md }}>
        {/* ── okno korekty ─────────────────────────────────────────────────
            Baner typu `status`: to odliczanie terminu, a nie pouczenie — nie wolno
            go zamknąć, bo razem z nim zniknąłby jedyny widoczny termin dnia. */}
        <CorrectionWindowBanner
          confirmed={window24h.confirmed}
          open={window24h.open}
          closesAt={window24h.closesAt}
        />

        {/* ── czas blokowy sesji ───────────────────────────────────────────── */}
        <SessionHero value={hhmm(projection.blockTimeMs)} range={sessionRange} />

        {/* ── załoga ───────────────────────────────────────────────────────── */}
        <CrewGrid>
          {crewCards.map((card) => (
            <CrewCard
              key={card.id}
              role={card.role}
              code={card.code}
              stats={card.stats}
              tag={card.tag}
              active={card.active}
              emptyText={card.emptyText}
            />
          ))}
        </CrewGrid>

        {/* ── lista lotów ──────────────────────────────────────────────────── */}
        <Card title="Lista lotów · czasy UTC" flush>
          {/* Ołówek otwiera arkusz korekty (04c) dla lądowania lotu (id wiersza = uuid
              zdarzenia — patrz `buildFlightRows`). Po zamknięciu dnia działa w oknie
              24 h; po oknie komendę odrzucą reguły, a powód trafi do banera. */}
          <DataTable
            columns={FLIGHT_COLUMNS}
            rows={flightRows}
            onCorrect={openCorrection}
            emptyText="Żaden lot nie został zapisany."
          />
        </Card>

        {/* ── paliwo ───────────────────────────────────────────────────────── */}
        <Card title="Paliwo" flush>
          <StatGrid cells={fuelCells} />
          <ResultRow
            label="Średnie zużycie (na block time)"
            value={fuelPerHour(projection.fuel.consumedL, projection.blockTimeMs) ?? '— —'}
            tone="amber"
            style={styles.row}
          />
          {/* 10a: zero nie jest średnią — mówimy, DLACZEGO nie liczymy (§6: nigdy
              cicha kreska tam, gdzie pilot mógłby podejrzewać błąd aplikacji). */}
          {projection.blockTimeMs === 0 && (
            <AppText variant="mono" tone="muted" style={styles.avgNote}>
              nie liczymy — block time 0:00 (dzielenie przez zero to nie statystyka)
            </AppText>
          )}

          {/* Na tle normy samolotu — PIERWSZA dana z serwera na tym ekranie, więc
              jedyna, która ma tu stan świeżości. Koniec dnia bywa offline, a norma
              policzona tydzień temu dalej jest dobrym punktem odniesienia — pod
              warunkiem, że pilot wie, że jest sprzed tygodnia (§4.8). */}
          {normVerdict != null && (
            <>
              <ResultRow
                label="Na tle normy samolotu"
                value={normVerdict}
                tone={normTone}
                style={styles.row}
              />
              <FreshnessNote
                state={synced ? 'live' : 'cache'}
                syncedAt={aircraftRef == null ? null : dateTimeUtcShort(aircraftRef.fetchedAt)}
                style={styles.avgNote}
              />
              <AppText variant="mono" tone="muted" style={styles.avgNote}>
                {normLabel(norm)}
              </AppText>
            </>
          )}
        </Card>

        {/* ── motogodziny (§3.7: początek / koniec / delta) ─────────────────── */}
        {/* Samolot stoi w podnagłówku ekranu — w tytule karty byłby drugi raz. */}
        <Card title={`Motogodziny · licznik w formacie ${mhFormatLabel}`} flush>
          <ResultRow
            label="Początek dnia"
            value={motoHours(projection.mh.start, mhFormat)}
            tone="neutral"
            style={styles.firstRow}
          />
          <ResultRow
            label="Koniec dnia (przekazanie)"
            value={motoHours(projection.mh.end, mhFormat)}
            tone="neutral"
            style={styles.row}
          />
          {/* Δ MH = block time to inwariant §4.5 — dlatego stoją tu obok siebie
              i dlatego różnica jest wyróżniona zielenią, a nie schowana w tekście. */}
          <ResultRow
            label={`Δ dnia (= block time ${hhmm(projection.blockTimeMs)})`}
            value={mhDelta}
            tone="green"
            style={styles.row}
          />
        </Card>

        {/* ── zrzuty: strona przychodowa dnia ──────────────────────────────── */}
        {showDrops && (
          <Card title="Zrzuty · rozliczenie" flush>
            <StatGrid cells={dropCells} />
            <ResultRow
              label="Typy skoków"
              value={jumperBreakdown(projection.drops.jumpers)}
              tone="neutral"
              style={styles.row}
            />
            <ResultRow
              label="Średnia wysokość zrzutu"
              value={
                projection.drops.avgAltitudeFt != null
                  ? `${Math.round(projection.drops.avgAltitudeFt)} FT`
                  : '—'
              }
              tone="neutral"
              style={styles.row}
            />
            <ResultRow
              label="Klient"
              value={projection.client ?? '—'}
              tone="neutral"
              style={styles.row}
            />
          </Card>
        )}

      </View>

      {correctionSheet}
    </Screen>
  );
}

/**
 * `.correction-window` — niebieskie pudełko z terminem samodzielnej korekty.
 *
 * Trzy stany, bo trzy różne rzeczy trzeba powiedzieć: dzień jeszcze otwarty (termin
 * dopiero zacznie biec), okno otwarte (konkretna data i godzina) i okno zamknięte
 * (dalsza droga prowadzi przez administratora). Nigdzie nie mówimy „nie da się" bez
 * powiedzenia, co zamiast tego.
 */
function CorrectionWindowBanner({
  confirmed,
  open,
  closesAt,
}: {
  /** Czy sesja jest już zatwierdzona zdaniem — dopiero wtedy okno w ogóle tyka. */
  confirmed: boolean;
  open: boolean;
  closesAt: number | null;
}) {
  const tail =
    'Później korektę nanosi administrator. Stuknij ołówek przy locie, żeby poprawić czas ' +
    'albo oznaczyć zdarzenie jako błędne.';

  if (!confirmed) {
    return (
      <Banner
        kind="status"
        tone="blue"
        icon="clock"
        title="Okno korekty: 24 h od zdania samolotu"
        text={`Do zdania poprawiasz dane bez limitu; po zdaniu masz na to 24 h. ${tail}`}
      />
    );
  }

  if (open && closesAt != null) {
    return (
      <Banner
        kind="status"
        tone="blue"
        icon="clock"
        title="Okno korekty: 24 h od zdania samolotu"
        text={`Dane możesz poprawiać jeszcze do ${dateTimeUtcShort(closesAt)} UTC. ${tail}`}
      />
    );
  }

  return (
    <Banner
      kind="status"
      tone="amber"
      icon="clock"
      title="Okno korekty zamknięte"
      text="Minęły 24 godziny od zdania samolotu — dalsze poprawki wprowadza administrator."
    />
  );
}

/** Litry bez jednostki (jednostka stoi pod wartością w komórce `StatGrid`). */
function amount(value: number | null): string {
  return value == null ? '—' : `${Math.round(value)}`;
}

/**
 * `ResultRow` jest projektowany do wnętrza karty z paddingiem; tu karty są `flush`,
 * bo siatki dociągają się do krawędzi — wcięcie wiersza dokładamy stylem.
 *
 * Baza stoi poza `StyleSheet.create`, bo wpis `firstRow` wyrasta z niej spreadem —
 * wewnątrz arkusza wpisy nie widzą się nawzajem.
 */
const row = { paddingHorizontal: 12, marginTop: 0 };

const styles = StyleSheet.create({
  row,
  /** Pierwszy wiersz sekcji styka się z linią nagłówka karty — własnej nie potrzebuje. */
  firstRow: { ...row, borderTopWidth: 0 },
  /** Przypis pod średnią (10a) — mono 9, w świetle karty. */
  avgNote: {
    fontSize: 9,
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
});
