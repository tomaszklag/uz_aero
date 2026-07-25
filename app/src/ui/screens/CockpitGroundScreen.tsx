/**
 * UZ Aero — 04/04A KOKPIT · GROUND (silnik wyłączony).
 *
 * Pierwszy ekran wpięty end-to-end: intencja pilota → komenda (walidacja inwariantów)
 * → zdarzenie w SQLite → projekcja → to, co widać. Wzorzec dla kolejnych ekranów.
 *
 * Zasady, których ten ekran pilnuje:
 *  • zapis wyłącznie przez komendy — ekran nie dotyka repozytorium ani bazy;
 *  • twarde odrzucenie inwariantu pokazujemy pilotowi, nigdy cicho (§6 pkt 3);
 *  • miękkie flagi (`warnings`) też są widoczne — zdarzenie zapisane, ale warte uwagi;
 *  • czasy w UTC; kolory wyłącznie z tokenów motywu.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Screen, SyncChip } from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { duration, durationLong, litres, motoHours, timeUtc } from '../format';
import type { Event } from '../../domain';

/** Odświeżanie liczników „na żywo" — sekundowy tick tylko gdy silnik pracuje. */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function CockpitGroundScreen() {
  const { theme } = useTheme();
  const s = useStyles();

  const context = useSessionStore((st) => st.context);
  const projection = useSessionStore((st) => st.projection);
  const events = useSessionStore((st) => st.events);
  const outboxCount = useSessionStore((st) => st.outboxCount);
  const synced = useSessionStore((st) => st.synced);
  const warnings = useSessionStore((st) => st.warnings);
  const lastError = useSessionStore((st) => st.lastError);

  const startEngine = useSessionStore((st) => st.startEngine);
  const stopEngine = useSessionStore((st) => st.stopEngine);
  const [busy, setBusy] = useState(false);

  const now = useTicker(projection.engineRunning);

  /**
   * Komenda może odrzucić intencję (twardy inwariant) — wtedy store zapisuje `lastError`
   * i rzuca dalej. Tu przechwytujemy, żeby ekran nie wywalił aplikacji; komunikat
   * i tak zobaczy pilot (banner niżej).
   */
  const runCommand = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      // Powód jest już w `lastError` — cichy błąd byłby złamaniem zasady.
    } finally {
      setBusy(false);
    }
  }, []);

  if (!context) return <NoSessionState />;

  const engineOn = projection.engineRunning;
  const liveBlockMs =
    projection.blockTimeMs +
    (projection.openEngineStartAt != null ? now - projection.openEngineStartAt : 0);
  const dutyMs = projection.dutyStart != null ? now - projection.dutyStart : 0;

  return (
    <Screen scroll padded={false}>
      {/* ── pasek: samolot, trasa, wskaźnik łączności ───────────────────── */}
      <View style={s.appBar}>
        <View>
          <AppText variant="mono" tone="green" style={s.aircraft}>
            {projection.aircraftId ?? '—'}
          </AppText>
          <AppText variant="label" tone="muted">
            {[projection.departureIcao, projection.arrivalIcao].filter(Boolean).join(' → ') || '—'}
            {projection.operation ? ` · ${projection.operation.toUpperCase()}` : ''}
          </AppText>
        </View>
        <SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />
      </View>

      <View style={s.body}>
        {/* ── status silnika ──────────────────────────────────────────── */}
        <View style={[s.statusChip, engineOn && s.statusChipOn]}>
          <View style={[s.statusDot, engineOn && s.statusDotOn]} />
          <AppText variant="label" tone={engineOn ? "green" : "muted"}>
            {engineOn ? 'RUNNING · SILNIK PRACUJE' : 'GROUND · SILNIK WYŁĄCZONY'}
          </AppText>
        </View>

        {/* ── akcja główna ────────────────────────────────────────────── */}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => runCommand(engineOn ? stopEngine : startEngine)}
          style={({ pressed }) => [
            s.primary,
            engineOn ? s.primaryStop : s.primaryStart,
            (pressed || busy) && s.pressed,
          ]}
        >
          <AppText variant="display" style={{ color: engineOn ? theme.colors.red : theme.colors.green }}>
            {engineOn ? 'STOP ENGINE' : 'START ENGINE'}
          </AppText>
          <AppText variant="label" tone="muted">
            {engineOn ? 'zapisze odczyt MH i paliwa' : 'rozpoczyna cykl silnika'}
          </AppText>
        </Pressable>

        {/* ── komunikaty: twardy błąd i miękkie flagi ─────────────────── */}
        {lastError != null && (
          <Banner tone="error" title="Nie zapisano" text={lastError} />
        )}
        {warnings.length > 0 && (
          <Banner
            tone="warning"
            title="Zapisane — sprawdź"
            text={warnings.map((w) => w.message).join('\n')}
          />
        )}

        {/* ── liczniki dnia ───────────────────────────────────────────── */}
        <View style={s.grid}>
          <Metric label="Duty time" value={duration(dutyMs)} />
          <Metric label="Block time" value={duration(liveBlockMs)} />
          <Metric label="Loty" value={`${projection.flights.length}`} />
          <Metric
            label="Starty / lądowania"
            value={`${projection.takeoffCount} / ${projection.landingCount}`}
          />
          <Metric label="Paliwo" value={litres(projection.fuel.lastReadingL)} />
          <Metric
            label="Motogodziny"
            value={motoHours(projection.mh.end ?? projection.mh.start, projection.mhFormat)}
          />
        </View>

        {/* ── log dnia ────────────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHead}>
            <AppText variant="label" tone="muted">
              LOG DNIA · UTC · {projection.engineRuns.length} CYKLI · {projection.takeoffCount} T/O
            </AppText>
          </View>
          {events.length === 0 ? (
            <View style={s.empty}>
              <AppText variant="body" tone="muted">
                Brak zdarzeń — zacznij od START ENGINE.
              </AppText>
            </View>
          ) : (
            [...events]
              .sort((a, b) => (b.gpsTime ?? b.deviceTime) - (a.gpsTime ?? a.deviceTime))
              .map((e) => <LogRow key={e.uuid} event={e} />)
          )}
        </View>

        {projection.engineRunning && projection.openEngineStartAt != null && (
          <AppText variant="mono" tone="green" style={s.live}>
            ● {durationLong(now - projection.openEngineStartAt)} — cykl w toku
          </AppText>
        )}
      </View>
    </Screen>
  );
}

/**
 * Pusty stan: brak sesji.
 *
 * RUSZTOWANIE: przycisk otwiera dzień danymi scenariusza (SP-AXA / TMK), bo ekrany
 * preflightu (02 → 02a → 03) jeszcze nie istnieją. Docelowo sesję otwiera preflight,
 * a ten stan zostaje tylko jako informacja. Sam przycisk przechodzi normalną ścieżką
 * komend — `claim` + `preflight_confirm` — więc niczego nie obchodzi.
 */
function NoSessionState() {
  const s = useStyles();
  const claim = useSessionStore((st) => st.claim);
  const confirmPreflight = useSessionStore((st) => st.confirmPreflight);
  const lastError = useSessionStore((st) => st.lastError);
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
      // Powód trafia do `lastError` i jest pokazany niżej.
    } finally {
      setBusy(false);
    }
  }, [claim, confirmPreflight]);

  return (
    <Screen>
      <View style={s.centered}>
        <AppText variant="display">BRAK SESJI</AppText>
        <AppText variant="body" tone="muted" style={s.centeredText}>
          Dzień lotny zaczyna się od preflightu — wyboru samolotu i odczytu liczników.
        </AppText>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={startDay}
          style={({ pressed }) => [s.primary, s.primaryStart, s.wide, (pressed || busy) && s.pressed]}
        >
          <AppText variant="display" tone="green">
            OTWÓRZ DZIEŃ
          </AppText>
          <AppText variant="label" tone="muted">
            SP-AXA · 150 L · 1234:30 MH (scenariusz)
          </AppText>
        </Pressable>

        {lastError != null && (
          <Banner tone="error" title="Nie zapisano" text={lastError} />
        )}
      </View>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.metric}>
      <AppText variant="paramLabel" tone="muted">
        {label}
      </AppText>
      <AppText variant="param">{value}</AppText>
    </View>
  );
}

function LogRow({ event }: { event: Event }) {
  const s = useStyles();
  return (
    <View style={s.logRow}>
      <AppText variant="mono" style={s.logTime}>
        {timeUtc(event.gpsTime ?? event.deviceTime)}
      </AppText>
      <AppText variant="label" style={s.logType}>
        {event.type.replace(/_/g, ' ')}
      </AppText>
      {event.syncedAt == null && (
        <AppText variant="label" tone="amber">
          ↑
        </AppText>
      )}
    </View>
  );
}

function Banner({
  tone,
  title,
  text,
}: {
  tone: 'error' | 'warning';
  title: string;
  text: string;
}) {
  const { theme } = useTheme();
  const s = useStyles();
  const color = tone === 'error' ? theme.colors.red : theme.colors.amber;
  return (
    <View style={[s.banner, { borderColor: color, backgroundColor: `${color}1F` }]}>
      <AppText variant="label" style={{ color }}>
        {title}
      </AppText>
      <AppText variant="body" tone="secondary">
        {text}
      </AppText>
    </View>
  );
}

function useStyles() {
  const { theme } = useTheme();
  const { colors, spacing, radius } = theme;

  return StyleSheet.create({
    appBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: theme.borderWidth,
      borderBottomColor: colors.border,
    },
    aircraft: { letterSpacing: 1.5 },
    body: { padding: spacing.md, gap: spacing.md },

    statusChip: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: theme.borderWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    statusChipOn: { borderColor: colors.greenBorder, backgroundColor: colors.greenMuted },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted },
    statusDotOn: { backgroundColor: colors.green },

    primary: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xl,
      borderRadius: radius.lg,
      borderWidth: theme.borderWidth,
    },
    primaryStart: { borderColor: colors.greenBorder, backgroundColor: colors.greenMuted },
    primaryStop: { borderColor: colors.redBorder, backgroundColor: colors.redMuted },
    pressed: { opacity: 0.7 },

    banner: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: theme.borderWidth,
    },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    metric: {
      flexGrow: 1,
      flexBasis: '30%',
      gap: 2,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: theme.borderWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },

    card: {
      borderRadius: radius.md,
      borderWidth: theme.borderWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    cardHead: {
      padding: spacing.sm,
      borderBottomWidth: theme.borderWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surfaceRaised,
    },
    empty: { padding: spacing.md, alignItems: 'center' },
    logRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderTopWidth: theme.borderWidth,
      borderTopColor: colors.border,
    },
    logTime: { width: 56 },
    logType: { flex: 1, textTransform: 'uppercase' },
    live: { textAlign: 'center' },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    centeredText: { textAlign: 'center' },
    wide: { alignSelf: 'stretch' },
  });
}
