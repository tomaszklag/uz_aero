/**
 * UZ Aero — KOKPIT (mockupy 04: ziemia · 05: lot)
 *
 * Jeden ekran, dwa tryby — zgodnie z §6: aplikacja **sama** przełącza tryb na podstawie
 * stanu silnika, pilot niczego nie wybiera.
 *
 *   • silnik OFF → GROUND (04): przewijalny ekran — status, wielki START ENGINE,
 *     pasek czasu służby, log całego dnia, siatka akcji naziemnych;
 *   • silnik ON  → LOT (05): układ **stały**, przewija się wyłącznie log cyklu —
 *     faza lotu ogromną czcionką, siatka GPS, log bieżącego cyklu z podziałem na loty,
 *     pasek akcji przyklejony do dołu.
 *
 * Ta różnica układów jest z designu i ma powód: na ziemi pilot czyta, w locie sięga.
 * W powietrzu przyciski muszą być zawsze w tym samym miejscu, niezależnie od tego,
 * ile zdarzeń przybyło w logu.
 *
 * Cały ekran jest zbudowany z komponentów Design Systemu — nie ma tu własnych „kart"
 * ani „chipów". Zapis wyłącznie przez komendy; twarde odrzucenie inwariantu i miękkie
 * flagi zawsze widoczne (§6 pkt 3: nigdy cichy błąd).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  ActionButton,
  ActionGrid,
  AppBar,
  AppText,
  Banner,
  Card,
  CockpitActions,
  DetectToast,
  DropSheet,
  DutyStrip,
  EventLog,
  ManualEventSheet,
  NoGpsBanner,
  ParamGrid,
  PhaseHero,
  Screen,
  StatusChip,
  SyncChip,
  Tag,
  type ActionCardSpec,
  type Tone,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useGps } from '../bootstrap/ServicesProvider';
import { useFlightDetection } from '../hooks/useFlightDetection';
import { useEventCorrection } from '../hooks/useEventCorrection';
import { duration, litres, timeLocal, timeUtc } from '../format';
import { buildCycleRows, buildLogRows } from './cockpitLog';
import { gpsLossText, staleCellNote, unknownPhaseDetail } from './gpsLoss';
import type { Event, FlightPhase } from '../../domain';

/** Sekundowy tick — tylko gdy jest co odliczać. */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Napisy faz z mockupu 05 (`.phase-hero-name`). */
const PHASE_LABEL: Record<FlightPhase, string> = {
  idle: 'Engine idle',
  taxi: 'Taxi',
  climb: 'Climb',
  cruise: 'Cruise',
  descent: 'Descent',
};

/** Kolor fazy: niebieski = w powietrzu, zielony = ziemia z pracującym silnikiem. */
const PHASE_TONE: Record<FlightPhase, Tone> = {
  idle: 'neutral',
  taxi: 'green',
  climb: 'blue',
  cruise: 'blue',
  descent: 'blue',
};

/** „+1 200 FT/MIN" — znak jest istotny, więc wypisujemy go jawnie. */
function verticalSpeedLabel(fpm: number | null): string | null {
  if (fpm == null) return null;
  const rounded = Math.round(fpm / 50) * 50;
  return `${rounded >= 0 ? '+' : '−'}${Math.abs(rounded)} FT/MIN`;
}

export function CockpitScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void };
}) {
  const { theme } = useTheme();
  const gps = useGps();

  const context = useSessionStore((s) => s.context);
  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const synced = useSessionStore((s) => s.synced);
  const warnings = useSessionStore((s) => s.warnings);
  const lastError = useSessionStore((s) => s.lastError);
  const startEngine = useSessionStore((s) => s.startEngine);
  const stopEngine = useSessionStore((s) => s.stopEngine);
  const drop = useSessionStore((s) => s.drop);
  const takeoff = useSessionStore((s) => s.takeoff);
  const landing = useSessionStore((s) => s.landing);

  const [busy, setBusy] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const engineOn = projection.engineRunning;
  const inFlight = projection.inFlight;
  const now = useTicker(engineOn || projection.dutyStart != null);

  // Elewacja lotniska = wysokość GPS z chwili ENGINE START (§3.3). Bierzemy ją
  // z payloadu zdarzenia, żeby przetrwała restart aplikacji.
  const fieldElevationFt = useMemo(() => {
    const start = [...events]
      .reverse()
      .find((e): e is Extract<Event, { type: 'engine_start' }> => e.type === 'engine_start');
    return start?.payload.fieldElevationFt ?? null;
  }, [events]);

  const { fix, phase, pending, undo, gpsAvailable, lastFixAt } = useFlightDetection({
    gps,
    enabled: engineOn,
    fieldElevationFt,
  });
  const { openCorrection, correctionSheet } = useEventCorrection();

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      // Powód jest w `lastError` — pokazujemy go banerem niżej.
    } finally {
      setBusy(false);
    }
  }, []);

  const handleStart = useCallback(
    () =>
      run(() =>
        startEngine({
          // Elewację zapisujemy przy starcie — potem nie ma z czego jej odtworzyć.
          fieldElevationFt: fix?.altitudeFt ?? null,
        }),
      ),
    [fix, run, startEngine],
  );

  if (!context) return <NoSession onStart={() => navigation.navigate('PreflightAircraft')} />;

  const mhFormat = projection.mhFormat ?? 'decimal';
  const liveFlightMs =
    projection.openTakeoffAt != null ? now - projection.openTakeoffAt : projection.flightTimeMs;
  const dutyMs = projection.dutyStart != null ? now - projection.dutyStart : 0;

  /** Komunikaty wspólne dla obu trybów — nigdy cichy błąd (§6 pkt 3). */
  const messages = (
    <>
      {lastError != null && (
        <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
      )}
      {warnings.length > 0 && (
        <Banner
          kind="warning"
          icon="warning"
          title="Zapisane — sprawdź"
          text={warnings.map((w) => w.message).join('\n')}
        />
      )}
    </>
  );

  const toast =
    pending == null ? null : (
      <DetectToast
        title={pending.detection === 'takeoff' ? 'Takeoff' : 'Landing'}
        detail={`${timeUtc(pending.fix.time)} UTC · GS ${Math.round(pending.fix.groundSpeedKt)} KT`}
        secondsLeft={pending.secondsLeft}
        undoLabel={pending.detection === 'takeoff' ? 'COFNIJ — NIE BYŁO STARTU' : 'COFNIJ — TO PRZELOT'}
        onUndo={undo}
      />
    );

  // ─────────────────────────────────────────────────────────────────────────
  // TRYB LOT (mockup 05) — układ stały, przewija się tylko log cyklu.
  // ─────────────────────────────────────────────────────────────────────────
  if (engineOn) {
    const cycleRows = buildCycleRows(events, projection, mhFormat, now);
    const landings = cycleRows.filter((r) => r.kind === 'landing').length;
    const takeoffs = cycleRows.filter((r) => r.kind === 'takeoff').length;
    // Degradacja CZUJNIKA (mockup 05g) — osobna oś od sieci: SyncChip może świecić
    // zielono, a autodetekcja stoi. Baner-przyrząd + ręczny zapis jako jedyna droga.
    const gpsLost = !gpsAvailable;

    return (
      <Screen padded={false}>
        <AppBar
          aircraft={projection.aircraftId}
          subtitle={[projection.departureIcao, projection.arrivalIcao].filter(Boolean).join(' → ')}
          compact
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />
              <StatusChip label="Running" tone="green" />
            </View>
          }
          onSettings={() => navigation.navigate('Settings')}
        />

        {/* ── `.no-gps` (05g): baner typu STATUS — przyrząd, znika sam z powrotem fixa ── */}
        {gpsLost && (
          <NoGpsBanner
            text={gpsLossText(lastFixAt, now)}
            onManualEvent={() => setManualOpen(true)}
            onManualList={() => navigation.navigate('ManualLog')}
          />
        )}

        <PhaseHero
          // Fazy z GPS nie znamy; „w locie" wiemy ZE ZDARZEŃ — projekcja nie potrzebuje fixa.
          phase={gpsLost && inFlight ? 'In Flight' : PHASE_LABEL[phase.phase]}
          tone={gpsLost ? 'amber' : PHASE_TONE[phase.phase]}
          detail={
            gpsLost
              ? unknownPhaseDetail(lastFixAt)
              : (verticalSpeedLabel(phase.verticalSpeedFpm) ?? 'brak danych o wysokości')
          }
        />

        <ParamGrid
          cells={
            gpsLost
              ? [
                  { label: 'Ground speed', value: '— —', unit: 'KT', stale: true, note: staleCellNote(lastFixAt) },
                  { label: 'Altitude', value: '— —', unit: 'FT', stale: true, note: staleCellNote(lastFixAt) },
                  {
                    label: 'Fuel on board',
                    value: `${Math.round(projection.fuel.lastReadingL ?? 0)}`,
                    unit: 'L',
                    tone: 'amber',
                    tint: true,
                    note: 'dane lokalne — bez GPS',
                  },
                  {
                    label: 'Flight time',
                    value: duration(liveFlightMs),
                    tone: 'green',
                    tint: true,
                    note: 'zegar — liczy normalnie',
                  },
                ]
              : [
                  { label: 'Ground speed', value: `${Math.round(fix?.groundSpeedKt ?? 0)}`, unit: 'KT' },
                  {
                    label: 'Altitude',
                    value: fix?.altitudeFt != null ? `${Math.round(fix.altitudeFt)}` : '—',
                    unit: 'FT',
                  },
                  {
                    label: 'Fuel on board',
                    value: `${Math.round(projection.fuel.lastReadingL ?? 0)}`,
                    unit: 'L',
                    tone: 'amber',
                    tint: true,
                  },
                  { label: 'Flight time', value: duration(liveFlightMs), tone: 'green', tint: true },
                ]
          }
        />

        {/* Log bieżącego cyklu — jedyny element, który się przewija. */}
        <Card
          title={`Cykl bieżący · ${takeoffs} T/O · ${landings} LDG`}
          headerRight={<Tag label={`Lot #${projection.flights.length + (inFlight ? 1 : 0)}`} />}
          flush
          style={{ flex: 1, borderRadius: 0, borderLeftWidth: 0, borderRightWidth: 0 }}
          contentStyle={{ flex: 1 }}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <EventLog rows={cycleRows} emptyText="Cykl dopiero się zaczął." />
          </ScrollView>
        </Card>

        {(lastError != null || warnings.length > 0) && (
          <View style={{ paddingHorizontal: 14, paddingTop: theme.spacing.sm, gap: theme.spacing.sm }}>
            {messages}
          </View>
        )}

        <CockpitActions
          // 05g: bez fixa ręczny zapis to JEDYNA droga — etykieta i amber mówią to
          // wprost, zanim pilot doczyta baner.
          primaryLabel={inFlight ? (gpsLost ? 'LAND · RĘCZNIE' : 'LAND') : gpsLost ? 'T/O · RĘCZNIE' : 'T/O'}
          primaryTone={gpsLost ? 'amber' : undefined}
          primaryIcon={inFlight ? 'landing' : 'takeoff'}
          onPrimary={() => setManualOpen(true)}
          onDrop={() => setDropOpen(true)}
          // Wyniesienie z definicji dzieje się w powietrzu (§3.3).
          dropDisabledReason={inFlight ? null : 'Zrzut zapiszesz w powietrzu'}
          onStop={() => run(stopEngine)}
          // `engine_stop` w powietrzu byłby fałszywym wpisem — blokujemy z powodem (§3.2).
          stopDisabledReason={inFlight ? 'Silnik zatrzymasz po wylądowaniu i dobiegu' : null}
        />

        {/* ── zrzut (mockup 05e) — arkusz nad kokpitem, nie osobny ekran ── */}
        <DropSheet
          visible={dropOpen}
          // Numer LOTU, nie zrzutu — w jednym locie bywa kilka wyniesień.
          flightNumber={projection.flights.length + (inFlight ? 1 : 0)}
          time={timeUtc(now)}
          // Wysokość bierzemy z GPS, nie z palca — pilot ustawia tylko liczby skoczków.
          altitudeFt={fix?.altitudeFt ?? null}
          client={projection.client}
          busy={busy}
          onConfirm={(jumpers) => {
            setDropOpen(false);
            void run(() => drop({ jumpers, altitudeFt: fix?.altitudeFt ?? null }));
          }}
          onCancel={() => setDropOpen(false)}
        />

        {/* ── wpis ręczny (mockup 05f) — ratunek na fałszywą detekcję GPS ── */}
        <ManualEventSheet
          visible={manualOpen}
          initialType={inFlight ? 'landing' : 'takeoff'}
          now={now}
          formatTime={timeUtc}
          busy={busy}
          onConfirm={(type, at) => {
            setManualOpen(false);
            // Czas wybrany przez pilota JEST czasem zdarzenia — zapis dostaje go jawnie,
            // a chwila zapisu zostaje w `deviceTime` (§5.1, dwa zegary).
            void run(() =>
              type === 'takeoff' ? takeoff('manual', null, at) : landing('manual', null, at),
            );
          }}
          onCancel={() => setManualOpen(false)}
        />

        {toast}
      </Screen>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRYB GROUND (mockup 04) — przewijalny ekran dnia.
  // ─────────────────────────────────────────────────────────────────────────
  const logRows = buildLogRows(events, projection, mhFormat);

  /**
   * Akcje naziemne (`.action-grid`). Każda niesie podpis ze stanem, żeby pilot widział,
   * czy warto tam wchodzić, bez otwierania ekranu i wracania.
   */
  const groundActions: ActionCardSpec[] = [
    {
      id: 'refuel',
      icon: 'refuel',
      label: 'Tankowanie',
      tone: 'amber',
      sub:
        projection.fuel.addedL > 0
          ? `Dolane dziś: ${litres(projection.fuel.addedL)}`
          : `Na pokładzie: ${litres(projection.fuel.lastReadingL)}`,
      onPress: () => navigation.navigate('Refuel'),
    },
    {
      id: 'crew',
      icon: 'crew',
      label: 'Zmiana załogi',
      sub: `PIC: ${projection.picId ?? '—'}${projection.dualId != null ? ` · DUAL: ${projection.dualId}` : ''}`,
      onPress: () => navigation.navigate('CrewChange'),
    },
    {
      id: 'manual',
      icon: 'manual-log',
      label: 'Lista ręczna',
      sub: `Fallback GPS · ${projection.flights.length} lotów`,
      onPress: () => navigation.navigate('ManualLog'),
    },
    {
      id: 'end-day',
      icon: 'end-day',
      label: 'Zakończ dzień',
      tone: 'red',
      sub: 'Statystyki + synchronizacja',
      onPress: () => navigation.navigate('EndOfDay'),
    },
  ];

  return (
    <Screen scroll padded={false}>
      <AppBar
        aircraft={projection.aircraftId}
        subtitle={[
          [projection.departureIcao, projection.arrivalIcao].filter(Boolean).join(' → '),
          projection.operation?.toUpperCase(),
        ]
          .filter(Boolean)
          .join(' · ')}
        right={<SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />}
        // `.settings-btn` z mockupu 04 → ekran 13 (ustawienia: motyw, PIN, konto,
        // diagnostyka GPS). Do czasu 13 prowadził do StyleGuide.
        onSettings={() => navigation.navigate('Settings')}
      />

      <View style={{ padding: theme.spacing.lg, gap: 14 }}>
        <StatusChip label="Ground · silnik wyłączony" tone="neutral" style={{ alignSelf: 'center' }} />

        <ActionButton
          label="START ENGINE"
          tone="green"
          size="hero"
          icon="start"
          holdMs={2000}
          busy={busy}
          hint="Przytrzymaj 2 sekundy aby potwierdzić"
          onPress={handleStart}
        />

        {projection.dutyStart != null && (
          <DutyStrip
            elapsed={duration(dutyMs)}
            since={`Meldunek ${timeUtc(projection.dutyStart)} UTC · ${timeLocal(projection.dutyStart)} LT`}
          />
        )}

        {messages}

        <Card
          title={`Log dnia · UTC · ${projection.engineRuns.length} cykli · ${projection.takeoffCount} T/O`}
          flush
        >
          {/* Ołówek przy każdym wierszu → arkusz korekty (04c). Cel ≥ 44 px: naprawa
              błędu nie może być trudniejsza niż jego popełnienie (§8, audyt). */}
          <EventLog
            rows={logRows}
            onCorrect={openCorrection}
            emptyText="Brak zdarzeń — zacznij od START ENGINE."
          />
        </Card>

        <ActionGrid actions={groundActions} />
      </View>

      {correctionSheet}
      {toast}
    </Screen>
  );
}

/**
 * Brak sesji — dzień jeszcze się nie zaczął.
 *
 * Jedyne wejście prowadzi przez preflight (02 → 02a → 03): to tam pilot wybiera
 * samolot i odczytuje liczniki, a odczyt startowy jest początkiem łańcucha MH (§4.5).
 * Skrótu „otwórz dzień na sztywno" celowo nie ma — omijałby odczyty.
 */
function NoSession({ onStart }: { onStart: () => void }) {
  const { theme } = useTheme();
  const lastError = useSessionStore((s) => s.lastError);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
        <AppText variant="display" style={{ textAlign: 'center' }}>
          BRAK SESJI
        </AppText>
        <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
          Dzień lotny zaczyna się od preflightu — wyboru samolotu i odczytu liczników.
        </AppText>
        <ActionButton label="ROZPOCZNIJ PREFLIGHT" tone="green" variant="solid" onPress={onStart} />
        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}
      </View>
    </Screen>
  );
}
