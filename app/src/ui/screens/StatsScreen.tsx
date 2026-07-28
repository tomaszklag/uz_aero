/**
 * UZ Aero — 10 STATYSTYKI DNIA.
 *
 * Odwzorowanie mockupu `design/10-statystyki.html`: okno korekty → czas służby → karty
 * załogi → lista lotów → paliwo → motogodziny → zrzuty → para akcji.
 *
 * Ekran jest **wyłącznie do odczytu**: nie emituje ani jednego zdarzenia. Wszystko, co
 * pokazuje, jest projekcją ze strumienia lokalnego (§5.2), więc te same liczby wychodzą
 * na telefonie bez zasięgu i po synchronizacji — dlatego nie ma tu ani jednego wariantu
 * „dane z cache". SyncChip w nagłówku mówi wyłącznie o tym, ile zdarzeń czeka w outboksie,
 * a nie o wiarygodności statystyk.
 *
 * Kolejność sekcji nie jest dowolna: najpierw to, co ma termin (okno korekty), potem to,
 * co pilot przepisuje do dokumentów (czas służby, załoga, loty), a dopiero na końcu
 * rozliczenia (paliwo, motogodziny, zrzuty). Akcje stoją pod wszystkim — „ZATWIERDŹ"
 * ma być decyzją po przeczytaniu, nie skrótem na górze ekranu.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, type ViewStyle } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  CrewCard,
  CrewGrid,
  DataTable,
  DutyHero,
  ResultRow,
  Screen,
  ScreenHeader,
  StatGrid,
  SyncChip,
  Tag,
  type DataTableRow,
  type StatCell,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { useEventCorrection } from '../hooks/useEventCorrection';
import { correctionWindow } from '../../domain';
import { dateUtcLong, motoHours, timeUtc } from '../format';
import {
  buildCrewCards,
  buildFlightRows,
  dateTimeUtcShort,
  flightsBadge,
  fuelPerHour,
  hhmm,
  jumperBreakdown,
} from './statsDay';

/** Ekrany 04c (korekta zdarzenia) i 11 (synchronizacja) jeszcze nie istnieją. */
const NOT_BUILT = 'Ekran w budowie';

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
  navigation: { navigate: (screen: string) => void };
}) {
  const { theme } = useTheme();

  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const queries = useSessionStore((s) => s.queries);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const currentPilotId = useCurrentPilot((s) => s.id);
  const { openCorrection, correctionSheet } = useEventCorrection();

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
          { text: row.no, muted: true },
          { text: row.takeoff },
          { text: row.landing },
          { text: row.time },
          { text: row.methodLabel, chip: row.method === 'auto' ? 'green' : 'amber' },
        ],
      })),
    [projection.flights],
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
  const dutyMs =
    projection.dutyStart != null && projection.dutyEnd != null
      ? projection.dutyEnd - projection.dutyStart
      : null;

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
          title="STATYSTYKI DNIA"
          size="md"
          // Wyśrodkowany bez powrotu: statystyki otwierają się po zamknięciu dnia,
          // a „wstecz" prowadziłoby do formularza, którego nie da się powtórzyć.
          centered
          subtitle={`${aircraft} · ${projection.dutyStart != null ? dateUtcLong(projection.dutyStart) : '—'}`}
          right={
            <>
              <Tag
                label={flightsBadge(projection.flights.length)}
                tone="green"
                size="md"
                style={{ borderRadius: theme.radius.pill }}
              />
              <SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />
            </>
          }
        />
      }
    >
      <View style={{ padding: 14, gap: theme.spacing.md }}>
        {/* ── okno korekty ─────────────────────────────────────────────────
            Baner typu `status`: to odliczanie terminu, a nie pouczenie — nie wolno
            go zamknąć, bo razem z nim zniknąłby jedyny widoczny termin dnia. */}
        <CorrectionWindowBanner
          dayClosed={window24h.dayClosed}
          open={window24h.open}
          closesAt={window24h.closesAt}
        />

        {/* ── czas służby ──────────────────────────────────────────────────── */}
        <DutyHero
          value={dutyMs != null ? hhmm(dutyMs) : '—'}
          range={
            projection.dutyStart != null
              ? `${timeUtc(projection.dutyStart)} UTC → ${
                  projection.dutyEnd != null ? `${timeUtc(projection.dutyEnd)} UTC` : 'dzień otwarty'
                }`
              : undefined
          }
        />

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
            value={fuelPerHour(projection.fuel.consumedL, projection.blockTimeMs) ?? '—'}
            tone="amber"
            style={rowStyle}
          />
        </Card>

        {/* ── motogodziny (§3.7: początek / koniec / delta) ─────────────────── */}
        <Card title={`Motogodziny · ${mhFormatLabel} z konfiguracji ${aircraft}`} flush>
          <ResultRow
            label="Początek dnia"
            value={motoHours(projection.mh.start, mhFormat)}
            tone="neutral"
            style={firstRowStyle}
          />
          <ResultRow
            label="Koniec dnia (przekazanie)"
            value={motoHours(projection.mh.end, mhFormat)}
            tone="neutral"
            style={rowStyle}
          />
          {/* Δ MH = block time to inwariant §4.5 — dlatego stoją tu obok siebie
              i dlatego różnica jest wyróżniona zielenią, a nie schowana w tekście. */}
          <ResultRow
            label={`Δ dnia (= block time ${hhmm(projection.blockTimeMs)})`}
            value={mhDelta}
            tone="green"
            style={rowStyle}
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
              style={rowStyle}
            />
            <ResultRow
              label="Średnia wysokość zrzutu"
              value={
                projection.drops.avgAltitudeFt != null
                  ? `${Math.round(projection.drops.avgAltitudeFt)} FT`
                  : '—'
              }
              tone="neutral"
              style={rowStyle}
            />
            <ResultRow
              label="Klient"
              value={projection.client ?? '—'}
              tone="neutral"
              style={rowStyle}
            />
          </Card>
        )}

        {/* ── akcje ────────────────────────────────────────────────────────── */}
        <View style={{ gap: theme.spacing.sm }}>
          {/* Mockup linkuje 04c — a 04c jest arkuszem NAD logiem, nie ekranem. Pełny
              log dnia z ołówkami (i możliwością dopisania brakującego lotu) to lista
              ręczna; tabela wyżej pokrywa korekty samych lotów. */}
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
            disabledReason={NOT_BUILT}
            onPress={() => navigation.navigate('Export')}
          />
        </View>
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
  dayClosed,
  open,
  closesAt,
}: {
  dayClosed: boolean;
  open: boolean;
  closesAt: number | null;
}) {
  const tail =
    'Później korektę nanosi administrator. Stuknij ołówek przy locie, żeby poprawić czas ' +
    'albo oznaczyć zdarzenie jako błędne.';

  if (!dayClosed) {
    return (
      <Banner
        kind="status"
        tone="blue"
        icon="clock"
        title="Okno korekty: 24 h po zatwierdzeniu"
        text={`Dane możesz poprawiać teraz i jeszcze przez 24 h po zatwierdzeniu dnia. ${tail}`}
      />
    );
  }

  if (open && closesAt != null) {
    return (
      <Banner
        kind="status"
        tone="blue"
        icon="clock"
        title="Okno korekty: 24 h po zatwierdzeniu"
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
      text="Minęły 24 godziny od zamknięcia dnia — dalsze poprawki wprowadza administrator."
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
 */
const rowStyle: ViewStyle = { paddingHorizontal: 12, marginTop: 0 };

/** Pierwszy wiersz sekcji styka się z linią nagłówka karty — własnej nie potrzebuje. */
const firstRowStyle: ViewStyle = { ...rowStyle, borderTopWidth: 0 };
