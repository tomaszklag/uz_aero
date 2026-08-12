/**
 * UZ Aero — 16 SZCZEGÓŁY LOTU (mockupy `design/16-lot.html`, `16a-lot-bez-sladu.html`).
 *
 * Ekran JEDNEGO lotu (start → lądowanie), wywoływany numerem wiersza w tabeli lotów
 * rozliczenia sesji (10). Powstał z issue #25 i przestawia jedną drogę: ślad nie jest już
 * skrótem z listy, tylko detalem lotu — miniatura trasy prowadzi w pełny ślad (14).
 *
 * Dlaczego akurat tak, a nie „numer lotu → mapa": ślad opisuje LOT, a lista pokazuje
 * loty SESJI. Skrót z listy prosto na mapę kazał tabeli udawać nawigację po śladach,
 * a przy locie wpisanym ręcznie prowadził na ekran, który nie miał czego narysować.
 * Dziś powód braku śladu stoi TUTAJ, w kafelku, i nigdzie dalej nie prowadzi.
 *
 * Ekran jest **wyłącznie do odczytu** — jedyne, co potrafi zmienić, to czas lotu przez
 * arkusz korekty (04c), ten sam, który otwiera ołówek w tabeli na 10.
 *
 * Czego tu NIE MA: czasu blokowego, paliwa i motogodzin. To wielkości SESJI (jeden bieg
 * silnika) i mieszkają na 10 — powtórzone przy locie sugerowałyby, że pojedynczy lot ma
 * własny licznik motogodzin.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { FlightTrackView } from '../../application';
import { correctionWindow } from '../../domain';
import {
  ActionButton,
  AppText,
  Card,
  Icon,
  ResultRow,
  Screen,
  ScreenHeader,
  Skeleton,
  StatGrid,
  SyncChip,
  Tag,
  TrackThumbnail,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useEventCorrection } from '../hooks/useEventCorrection';
import { useSkeleton } from '../hooks/useSkeleton';
import { timeUtc } from '../format';
import { routeLabel } from './logic/operations';
import {
  correctionNote,
  dropRows,
  flightSubtitle,
  flightTimeCells,
  flightTitle,
  methodTag,
  missingTrackCopy,
  placeNote,
  trackMetricCells,
} from './logic/flightDetails';

/** Wysokość miniatury — proporcja z mockupu 16 przy szerokości telefonu. */
const THUMB_HEIGHT = 150;

export interface FlightDetailsScreenParams {
  sessionUuid: string;
  flightIndex: number;
}

export function FlightDetailsScreen({
  navigation,
  route,
}: {
  navigation: { navigate: (screen: string, params?: object) => void; goBack: () => void };
  route: { params: FlightDetailsScreenParams };
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();

  const trackQueries = useSessionStore((s) => s.trackQueries);
  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const { openCorrection, correctionSheet } = useEventCorrection();

  const { sessionUuid, flightIndex } = route.params;

  const [view, setView] = useState<FlightTrackView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const skeleton = useSkeleton(!loaded);

  useEffect(() => {
    if (trackQueries == null) {
      setLoaded(true);
      return;
    }
    let alive = true;
    void trackQueries.byFlight(sessionUuid, flightIndex).then((result) => {
      if (!alive) return;
      setView(result);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [trackQueries, sessionUuid, flightIndex]);

  /**
   * Wejście prowadzi wyłącznie z 10, więc store trzyma TĘ sesję. Sprawdzamy to mimo
   * wszystko: zrzuty, trasa i okno korekty liczą się ze strumienia w pamięci, a podanie
   * ich z innej sesji byłoby cichym błędem — gorszym niż brak sekcji.
   */
  const sameSession = projection.sessionUuid === sessionUuid;

  const openTrack = useCallback(
    () => navigation.navigate('Track', { sessionUuid, flightIndex }),
    [navigation, sessionUuid, flightIndex],
  );

  const window24h = useMemo(
    () => correctionWindow(projection, Date.now()),
    [projection],
  );

  const drops = useMemo(
    () => (view == null || !sameSession ? [] : dropRows(events, view.flight)),
    [events, view, sameSession],
  );

  const header = (
    <ScreenHeader
      title={view != null ? flightTitle(view.flight.index) : 'LOT'}
      subtitle={
        view != null
          ? flightSubtitle(view.aircraftId, view.flight.takeoffAt, sameSession ? projection.operation : null)
          : undefined
      }
      size="md"
      onBack={navigation.goBack}
      backLabel="Rozliczenie"
      right={
        <>
          {/* Skąd wziął się ten lot: AUTO z detekcji, RĘCZNIE z wpisu pilota. */}
          {view != null && (
            <Tag
              label={methodTag(view.flight.method)}
              tone={view.flight.method === 'auto' ? 'green' : 'amber'}
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
  );

  if (!loaded) {
    // Ślad czyta się z magazynu punktów, nie z rejestru zdarzeń — kilkaset fixów potrafi
    // wyjść poza próg bramki (issue #33). Plamki mają wymiary miniatury i dwóch kart
    // pod nią, więc gdy ślad dojdzie, „PEŁNY ŚLAD" nie ucieknie spod palca.
    return (
      <Screen scroll padded={false} header={header}>
        {skeleton && (
          <View accessible accessibilityLabel="Ładowanie" style={styles.content}>
            {/* Karta śladu (nagłówek + miniatura + metryki), karta czasów, karta miejsca —
                w tych wysokościach, w jakich przyjdą. */}
            <Skeleton height={THUMB_HEIGHT + 96} radius={theme.radius.md} />
            <Skeleton height={128} radius={theme.radius.md} />
            <Skeleton height={92} radius={theme.radius.md} />
          </View>
        )}
      </Screen>
    );
  }

  if (view == null) {
    return (
      <Screen scroll padded={false} header={header}>
        <View style={styles.content}>
          <Card title="Nie ma takiego lotu">
            <AppText variant="body" tone="muted">
              Ta sesja nie ma lotu o tym numerze. Wróć do rozliczenia i wybierz lot z tabeli.
            </AppText>
          </Card>
        </View>
      </Screen>
    );
  }

  const { flight, track } = view;
  // Miniatura i metryki zajmują pełną szerokość karty (padding ekranu 14 + karty 12).
  const contentWidth = Math.max(200, width - 52);
  const flightCount = sameSession ? projection.flights.length : flight.index;
  const place = sameSession
    ? routeLabel(projection.operation, projection.departureIcao, projection.arrivalIcao)
    : (view.departureIcao ?? '');
  const note = sameSession ? placeNote(projection.operation) : null;
  // Sekcja zrzutów istnieje tylko w dniu skokowym (issue #19: przy przelocie zrzut nie
  // może się wydarzyć, więc nie ma o czym milczeć). Zero wyniesień w locie skokowym
  // jest natomiast INFORMACJĄ i mówimy je wprost.
  const showDrops = sameSession && (projection.operation === 'skoki' || drops.length > 0);

  return (
    <Screen scroll padded={false} header={header}>
      <View style={styles.content}>
        {/* ── ślad: miniatura → pełny ekran 14 ───────────────────────────── */}
        <Card
          title="Ślad lotu"
          headerRight={
            <AppText variant="micro" tone="muted">
              {timeUtc(flight.takeoffAt)} → {flight.landingAt != null ? timeUtc(flight.landingAt) : '—'} UTC
            </AppText>
          }
          flush
        >
          {view.missing != null ? (
            <MissingTrack reason={view.missing} />
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Pełny ślad lotu ${flight.index}`}
                onPress={openTrack}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              >
                <TrackThumbnail line={track.line} width={contentWidth} height={THUMB_HEIGHT} />
                <View
                  style={[
                    styles.cta,
                    {
                      backgroundColor: theme.colors.greenMuted,
                      borderColor: theme.colors.greenBorder,
                      borderWidth: theme.borderWidth,
                      borderRadius: theme.radius.pill,
                    },
                  ]}
                >
                  <AppText variant="mono" style={[styles.ctaLabel, { color: theme.colors.green }]}>
                    PEŁNY ŚLAD
                  </AppText>
                  <Icon name="next" size={10} color={theme.colors.green} />
                </View>
              </Pressable>

              {/* Te same liczby, co w nagłówku 14 — wejście ma być POWIĘKSZENIEM
                  tego, co pilot już widzi, a nie pierwszym spotkaniem z danymi. */}
              <StatGrid columns={3} cells={trackMetricCells(track)} />
              <AppText variant="mono" tone="muted" style={styles.hint}>
                stuknij miniaturę, żeby otworzyć pełny ślad — trasa, profil pionowy i log punktów
              </AppText>
            </>
          )}
        </Card>

        {/* ── czasy lotu ─────────────────────────────────────────────────── */}
        <Card
          title="Czasy lotu"
          headerRight={
            <AppText variant="micro" tone="muted">
              UTC
            </AppText>
          }
          flush
        >
          <StatGrid cells={flightTimeCells(flight, flightCount)} />
        </Card>

        {/* ── miejsce ────────────────────────────────────────────────────── */}
        {place !== '' && (
          <Card title="Miejsce" flush>
            <ResultRow label="Lotnisko" value={place} tone="neutral" style={styles.firstRow} />
            {note != null && (
              <AppText variant="mono" tone="muted" style={styles.note}>
                {note}
              </AppText>
            )}
          </Card>
        )}

        {/* ── zrzuty tego lotu ───────────────────────────────────────────── */}
        {showDrops && (
          <Card title="Zrzuty w tym locie" flush>
            {drops.length === 0 ? (
              <ResultRow
                label="Wyniesienia"
                value="żadnego zrzutu w tym locie"
                tone="neutral"
                style={styles.firstRow}
              />
            ) : (
              drops.map((row, index) => (
                <ResultRow
                  key={row.id}
                  label={row.label}
                  value={row.value}
                  tone="blue"
                  style={index === 0 ? styles.firstRow : styles.row}
                />
              ))
            )}
          </Card>
        )}

        {/* ── korekta czasów: ten sam cel, co ołówek w tabeli na 10 ──────── */}
        <ActionButton
          label="POPRAW CZASY TEGO LOTU"
          tone="neutral"
          variant="secondary"
          size="md"
          icon="edit"
          onPress={() => openCorrection(flight.landingUuid ?? flight.takeoffUuid)}
        />
        <AppText variant="mono" tone="muted" style={styles.btnNote}>
          {correctionNote(window24h)}
        </AppText>
      </View>

      {correctionSheet}
    </Screen>
  );
}

/**
 * Kafelek „bez śladu" (mockup 16A) — stan, NIE przycisk.
 *
 * Za nim nie ma ani jednego detalu więcej, więc stuknięcie prowadziłoby na ekran
 * powtarzający to samo zdanie. Powód stoi wprost, bo lot ręczny i wygasła retencja
 * znaczą dla pilota co innego (§6 pkt 3: nigdy cicha kreska tam, gdzie pilot mógłby
 * podejrzewać awarię aplikacji).
 */
function MissingTrack({ reason }: { reason: NonNullable<FlightTrackView['missing']> }) {
  const { theme } = useTheme();
  const copy = missingTrackCopy(reason);

  return (
    <>
      <View style={[styles.empty, { backgroundColor: theme.colors.bgTint }]}>
        <View
          style={[
            styles.emptyFrame,
            {
              borderColor: theme.colors.borderStrong,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          <Icon name="no-track" size={30} color={theme.colors.textMuted} />
        </View>
        <AppText variant="display" style={[styles.emptyTitle, { color: theme.colors.amber }]}>
          {copy.title}
        </AppText>
        <AppText variant="body" tone="secondary" style={styles.emptyText}>
          {copy.text}
        </AppText>
      </View>
      <ResultRow label="Źródło danych" value={copy.source} tone="neutral" style={styles.firstRow} />
    </>
  );
}

/**
 * `ResultRow` jest projektowany do wnętrza karty z paddingiem; tu karty są `flush`,
 * bo siatki dociągają się do krawędzi — wcięcie wiersza dokładamy stylem (wzorzec z 10).
 */
const row = { paddingHorizontal: 12, marginTop: 0 };

const styles = StyleSheet.create({
  content: { padding: 14, gap: 11 },
  row,
  /** Pierwszy wiersz sekcji styka się z linią nagłówka karty — własnej nie potrzebuje. */
  firstRow: { ...row, borderTopWidth: 0 },
  // Plakietka „PEŁNY ŚLAD" leży NA miniaturze, w prawym górnym rogu (mockup `.thumb-cta`).
  cta: {
    position: 'absolute',
    right: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  ctaLabel: { fontSize: 8, lineHeight: 12, letterSpacing: 1.5 },
  hint: { fontSize: 8.5, lineHeight: 13, letterSpacing: 0.5, paddingHorizontal: 12, paddingBottom: 10 },
  note: { fontSize: 8.5, lineHeight: 13, letterSpacing: 0.5, paddingHorizontal: 12, paddingBottom: 10 },
  btnNote: { fontSize: 8.5, lineHeight: 13, letterSpacing: 0.5, textAlign: 'center', marginTop: -4 },

  // ── kafelek bez śladu (16A) ────────────────────────────────────────────────
  empty: { alignItems: 'center', gap: 8, paddingVertical: 26, paddingHorizontal: 20 },
  emptyFrame: {
    width: '100%',
    height: 76,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 19, lineHeight: 22, letterSpacing: 2 },
  emptyText: { fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 280 },
});
