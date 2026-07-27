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
  ActionGrid,
  AppBar,
  AppText,
  Banner,
  Card,
  DetectToast,
  DutyStrip,
  EventLog,
  Icon,
  Metric,
  MetricGrid,
  PhaseHero,
  Screen,
  StatusChip,
  SyncChip,
  type ActionCardSpec,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useGps } from '../bootstrap/ServicesProvider';
import { useFlightDetection } from '../hooks/useFlightDetection';
import { duration, durationLong, litres, timeLocal, timeUtc } from '../format';
import { buildLogRows } from './cockpitLog';
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

  if (!context) return <NoSession onStart={() => navigation.navigate('PreflightAircraft')} />;

  const liveBlockMs =
    projection.blockTimeMs +
    (projection.openEngineStartAt != null ? now - projection.openEngineStartAt : 0);
  const liveFlightMs =
    projection.openTakeoffAt != null ? now - projection.openTakeoffAt : projection.flightTimeMs;
  const dutyMs = projection.dutyStart != null ? now - projection.dutyStart : 0;

  const logRows = buildLogRows(events, projection, projection.mhFormat ?? 'decimal');

  /**
   * Akcje naziemne (`.action-grid` z mockupu 04). Każda niesie podpis ze stanem, żeby
   * pilot widział, czy warto tam wchodzić. Widoczne wyłącznie przy wyłączonym silniku —
   * to są czynności na ziemi, a §3.2 nie pozwala ich mieszać z lotem.
   *
   * Ekrany docelowe (06 / 07 / 08 / 09) jeszcze nie istnieją, więc karty są **zablokowane
   * z podanym powodem** zamiast prowadzić w pustkę. Ukrycie ich byłoby gorsze: pilot nie
   * dowiedziałby się, że te czynności w ogóle są przewidziane.
   */
  const soon = 'Ekran w budowie';
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
      disabledReason: soon,
      onPress: () => undefined,
    },
    {
      id: 'crew',
      icon: 'crew',
      label: 'Zmiana załogi',
      sub: `PIC: ${projection.picId ?? '—'}${projection.dualId != null ? ` · DUAL: ${projection.dualId}` : ''}`,
      disabledReason: soon,
      onPress: () => undefined,
    },
    {
      id: 'manual',
      icon: 'manual-log',
      label: 'Lista ręczna',
      sub: `Fallback GPS · ${projection.flights.length} lotów`,
      disabledReason: soon,
      onPress: () => undefined,
    },
    {
      id: 'end-day',
      icon: 'end-day',
      label: 'Zakończ dzień',
      tone: 'red',
      sub: 'Statystyki + synchronizacja',
      disabledReason: soon,
      onPress: () => undefined,
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

        {/* ── akcja główna (`.start-engine`) ───────────────────────────── */}
        {engineOn ? (
          <ActionButton
            label="STOP ENGINE"
            tone="red"
            size="hero"
            icon={<Icon name="stop" size={22} color={theme.colors.bg} />}
            holdMs={2000}
            busy={busy}
            hint="Przytrzymaj 2 sekundy aby potwierdzić"
            // Zatrzymanie silnika w powietrzu byłoby fałszywym wpisem — blokujemy
            // z podanym powodem, nie po cichu (§3.2).
            disabledReason={inFlight ? 'Silnik zatrzymasz po wylądowaniu i dobiegu' : null}
            onPress={() => run(stopEngine)}
          />
        ) : (
          <ActionButton
            label="START ENGINE"
            tone="green"
            size="hero"
            icon={<Icon name="start" size={24} color={theme.colors.bg} />}
            holdMs={2000}
            busy={busy}
            hint="Przytrzymaj 2 sekundy aby potwierdzić"
            onPress={handleStart}
          />
        )}

        {/* ── czas służby (`.duty-strip`) — tylko na ziemi ──────────────── */}
        {!engineOn && projection.dutyStart != null && (
          <DutyStrip
            elapsed={duration(dutyMs)}
            since={`Meldunek ${timeUtc(projection.dutyStart)} UTC · ${timeLocal(projection.dutyStart)} LT`}
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

        {/* ── parametry GPS — wyłącznie w locie (mockup 05) ─────────────── */}
        {engineOn && (
          <MetricGrid>
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
          </MetricGrid>
        )}

        {/* ── log dnia (`.day-log`) ────────────────────────────────────── */}
        <Card
          title={`Log dnia · UTC · ${projection.engineRuns.length} cykli · ${projection.takeoffCount} T/O`}
          flush
        >
          {/* TODO: `onCorrect` → ekran 04c. Korekta wymaga nowego typu zdarzenia
              w domenie (rejestr jest append-only, więc poprawka to osobny wpis),
              więc dopinamy ją razem z tamtym ekranem — pusty ołówek byłby gorszy
              niż jego brak. */}
          <EventLog rows={logRows} emptyText="Brak zdarzeń — zacznij od START ENGINE." />
        </Card>

        {/* ── akcje naziemne (`.action-grid`) ──────────────────────────── */}
        {!engineOn && <ActionGrid actions={groundActions} />}

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
        <ActionButton label="ROZPOCZNIJ PREFLIGHT" tone="green" onPress={onStart} />
        {lastError != null && <Banner kind="warning" tone="red" title="Nie zapisano" text={lastError} />}
      </View>
    </Screen>
  );
}
