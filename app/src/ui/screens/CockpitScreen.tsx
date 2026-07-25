/**
 * UZ Aero — KOKPIT (mockupy 04/04a: ziemia · 05/05a–05d: lot)
 *
 * Jeden ekran, dwa tryby — zgodnie z §6: aplikacja **sama** przełącza tryb na podstawie
 * stanu silnika, pilot niczego nie wybiera.
 *   • silnik OFF → tryb GROUND: duży START ENGINE, log dnia, liczniki, akcje naziemne;
 *   • silnik ON  → tryb LOT: faza lotu ogromną czcionką, siatka GPS, log cyklu,
 *                  STOP dostępny dopiero po wylądowaniu.
 *
 * Cały ekran jest zbudowany z komponentów Design Systemu — nie ma tu własnych „kart"
 * ani „chipów". Zapis wyłącznie przez komendy; twarde odrzucenie inwariantu i miękkie
 * flagi zawsze widoczne (§6 pkt 3: nigdy cichy błąd).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AppBar,
  AppText,
  Banner,
  Card,
  DetectToast,
  EventLog,
  Metric,
  MetricGrid,
  PhaseHero,
  Screen,
  StatusChip,
  SyncChip,
  type EventLogRow,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useGps } from '../bootstrap/ServicesProvider';
import { useFlightDetection } from '../hooks/useFlightDetection';
import { duration, durationLong, litres, motoHours, timeUtc } from '../format';
import type { Event } from '../../domain';

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

/** Etykiety zdarzeń po polsku — log ma być czytelny, nie techniczny. */
const EVENT_LABEL: Record<string, string> = {
  session_claim: 'Przejęcie samolotu',
  preflight_confirm: 'Preflight',
  engine_start: 'Start engine',
  engine_stop: 'Stop engine',
  takeoff: 'Takeoff',
  landing: 'Landing',
  drop: 'Zrzut',
  refuel: 'Tankowanie',
  crew_change: 'Zmiana załogi',
  manual_log_entry: 'Wpis ręczny',
  day_close: 'Zamknięcie dnia',
};

const EVENT_TONE: Record<string, 'green' | 'red' | 'blue' | 'amber' | 'neutral'> = {
  engine_start: 'green',
  engine_stop: 'red',
  drop: 'blue',
  refuel: 'amber',
  day_close: 'red',
};

export function CockpitScreen() {
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

  const [busy, setBusy] = useState(false);
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

  const { fix, pending, undo, gpsAvailable } = useFlightDetection({
    gps,
    enabled: engineOn,
    fieldElevationFt,
  });

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

  if (!context) return <NoSession />;

  const liveBlockMs =
    projection.blockTimeMs +
    (projection.openEngineStartAt != null ? now - projection.openEngineStartAt : 0);
  const liveFlightMs =
    projection.openTakeoffAt != null ? now - projection.openTakeoffAt : projection.flightTimeMs;
  const dutyMs = projection.dutyStart != null ? now - projection.dutyStart : 0;

  const logRows: EventLogRow[] = [...events]
    .sort((a, b) => (b.gpsTime ?? b.deviceTime) - (a.gpsTime ?? a.deviceTime))
    .map((e) => ({
      id: e.uuid,
      time: timeUtc(e.gpsTime ?? e.deviceTime),
      label: EVENT_LABEL[e.type] ?? e.type,
      tone: EVENT_TONE[e.type] ?? 'neutral',
      pending: e.syncedAt == null,
    }));

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
        compact={engineOn}
        right={<SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />}
      />

      <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
        {engineOn ? (
          <PhaseHero
            phase={inFlight ? 'In flight' : 'Taxi'}
            detail={
              gpsAvailable
                ? `${Math.round(fix?.groundSpeedKt ?? 0)} KT · ${
                    fix?.altitudeFt != null ? `${Math.round(fix.altitudeFt)} FT` : 'brak wysokości'
                  }`
                : 'GPS: brak sygnału — użyj wpisu ręcznego'
            }
            tone={inFlight ? 'blue' : 'green'}
            aside={<StatusChip label={duration(liveBlockMs)} tone="neutral" dot={false} />}
          />
        ) : (
          <StatusChip
            label="GROUND · SILNIK WYŁĄCZONY"
            tone="neutral"
            style={{ alignSelf: 'center' }}
          />
        )}

        {/* ── akcja główna ─────────────────────────────────────────────── */}
        {engineOn ? (
          <ActionButton
            label="STOP ENGINE"
            tone="red"
            holdMs={2000}
            busy={busy}
            hint="przytrzymaj 2 s"
            // Zatrzymanie silnika w powietrzu byłoby fałszywym wpisem — blokujemy
            // z podanym powodem, nie po cichu (§3.2).
            disabledReason={inFlight ? 'Silnik zatrzymasz po wylądowaniu i dobiegu' : null}
            onPress={() => run(stopEngine)}
          />
        ) : (
          <ActionButton
            label="START ENGINE"
            tone="green"
            holdMs={2000}
            busy={busy}
            hint="przytrzymaj 2 s"
            onPress={handleStart}
          />
        )}

        {lastError != null && <Banner kind="warning" tone="red" title="Nie zapisano" text={lastError} />}
        {warnings.length > 0 && (
          <Banner
            kind="warning"
            title="Zapisane — sprawdź"
            text={warnings.map((w) => w.message).join('\n')}
          />
        )}
        {engineOn && !gpsAvailable && (
          <Banner
            kind="status"
            tone="amber"
            title="GPS: brak sygnału"
            text="Starty i lądowania nie będą wykrywane automatycznie. Zapisz je ręcznie — czasy możesz cofnąć."
          />
        )}

        {/* ── parametry ────────────────────────────────────────────────── */}
        <MetricGrid>
          {engineOn ? (
            <>
              <Metric label="Ground speed" value={`${Math.round(fix?.groundSpeedKt ?? 0)}`} unit="KT" />
              <Metric
                label="Altitude"
                value={fix?.altitudeFt != null ? `${Math.round(fix.altitudeFt)}` : '—'}
                unit="FT"
              />
              <Metric
                label="Fuel on board"
                value={litres(projection.fuel.lastReadingL)}
                tone="amber"
                emphasis
              />
              <Metric
                label="Flight time"
                value={duration(liveFlightMs)}
                tone={inFlight ? 'green' : 'neutral'}
                emphasis={inFlight}
              />
            </>
          ) : (
            <>
              <Metric label="Duty time" value={duration(dutyMs)} />
              <Metric label="Block time" value={duration(liveBlockMs)} />
              <Metric label="Loty" value={`${projection.flights.length}`} />
              <Metric
                label="Starty / lądowania"
                value={`${projection.takeoffCount} / ${projection.landingCount}`}
              />
              <Metric label="Paliwo" value={litres(projection.fuel.lastReadingL)} tone="amber" />
              <Metric
                label="Motogodziny"
                value={motoHours(projection.mh.end ?? projection.mh.start, projection.mhFormat)}
              />
            </>
          )}
        </MetricGrid>

        {/* ── log ──────────────────────────────────────────────────────── */}
        <Card
          title={`LOG DNIA · UTC · ${projection.engineRuns.length} CYKLI · ${projection.takeoffCount} T/O`}
          flush
        >
          <EventLog rows={logRows} emptyText="Brak zdarzeń — zacznij od START ENGINE." />
        </Card>

        {engineOn && projection.openEngineStartAt != null && (
          <AppText variant="mono" tone="green" style={{ textAlign: 'center' }}>
            ● {durationLong(now - projection.openEngineStartAt)} — cykl w toku
          </AppText>
        )}
      </View>

      {/* ── toast autodetekcji: brak reakcji = zapis (§3.2) ─────────────── */}
      {pending != null && (
        <DetectToast
          title={pending.detection === 'takeoff' ? 'Takeoff' : 'Landing'}
          detail={`${timeUtc(pending.fix.time)} UTC · GS ${Math.round(pending.fix.groundSpeedKt)} KT`}
          secondsLeft={pending.secondsLeft}
          undoLabel={pending.detection === 'takeoff' ? 'COFNIJ — NIE BYŁO STARTU' : 'COFNIJ — TO PRZELOT'}
          onUndo={undo}
        />
      )}
    </Screen>
  );
}

/**
 * Brak sesji.
 *
 * RUSZTOWANIE: przycisk otwiera dzień danymi scenariusza, bo ekrany preflightu
 * (02 → 02a → 03) jeszcze nie istnieją. Idzie normalną ścieżką komend, więc niczego
 * nie obchodzi — docelowo zastąpi go preflight.
 */
function NoSession() {
  const { theme } = useTheme();
  const claim = useSessionStore((s) => s.claim);
  const confirmPreflight = useSessionStore((s) => s.confirmPreflight);
  const lastError = useSessionStore((s) => s.lastError);
  const [busy, setBusy] = useState(false);

  const startDay = useCallback(async () => {
    setBusy(true);
    try {
      const now = Date.now();
      await claim({
        sessionUuid: `sess-${now}`,
        aircraftId: 'SP-AXA',
        picId: 'TMK',
        dualId: null,
        mode: 'free',
      });
      await confirmPreflight({
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: 'EPWA',
        dutyStart: now,
        reading: { fuelL: 150, mh: 1234.5 },
        mhFormat: 'hhmm',
      });
    } catch {
      // Powód w `lastError`.
    } finally {
      setBusy(false);
    }
  }, [claim, confirmPreflight]);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
        <AppText variant="display" style={{ textAlign: 'center' }}>
          BRAK SESJI
        </AppText>
        <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
          Dzień lotny zaczyna się od preflightu — wyboru samolotu i odczytu liczników.
        </AppText>
        <ActionButton
          label="OTWÓRZ DZIEŃ"
          tone="green"
          busy={busy}
          hint="SP-AXA · 150 L · 1234:30 MH (scenariusz)"
          onPress={startDay}
        />
        {lastError != null && <Banner kind="warning" tone="red" title="Nie zapisano" text={lastError} />}
      </View>
    </Screen>
  );
}
