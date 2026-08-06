/**
 * UZ Aero — 14 ŚLAD LOTU (mockupy `design/14-slad.html`, `14a`, `14b`).
 *
 * Wejście z tabeli lotów ekranu 10: numer lotu jest przyciskiem. Ekran pokazuje trzy
 * rzeczy z mockupu w tej samej kolejności — trasę, profil pionowy i log przeliczonych
 * punktów.
 *
 * **Wszystko liczy się LOKALNIE**, z zapisu na telefonie i z rejestru na telefonie
 * (`FlightTrackQueries`) i ekran **nie potrzebuje sieci w ogóle** — mapa nie ma kafelków
 * (decyzja 2026-08-04), tylko siatkę współrzędnych z podziałką i lotniska z katalogu
 * wbudowanego w aplikację.
 *
 * Wariant 14B (brak śladu) ma dwa powody i ekran je rozróżnia, bo znaczą co innego dla
 * pilota: lot wpisany ręcznie nigdy śladu nie miał, a lot sprzed ponad 14 dni już go
 * nie ma. W obu przypadkach czasy są prawdziwe i zostają na ekranie — brakuje wyłącznie
 * geometrii.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { FlightTrackView } from '../../application';
import { formatLatLon, timeUtc, duration } from '../format';
import {
  AppText,
  Banner,
  Card,
  DataTable,
  Screen,
  ScreenHeader,
  StatGrid,
  SyncChip,
  TrackMap,
  VerticalProfile,
  type DataTableRow,
  type TrackMapMarker,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';

/** Wysokość mapy i profilu — proporcje z mockupu 14 przy szerokości telefonu. */
const MAP_HEIGHT = 300;
const PROFILE_HEIGHT = 172;

export interface TrackScreenParams {
  sessionUuid: string;
  flightIndex: number;
}

export function TrackScreen({
  navigation,
  route,
}: {
  navigation: { goBack: () => void };
  route: { params: TrackScreenParams };
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const trackQueries = useSessionStore((s) => s.trackQueries);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);

  const [view, setView] = useState<FlightTrackView | null>(null);
  const [loaded, setLoaded] = useState(false);

  const { sessionUuid, flightIndex } = route.params;

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

  // Mapa i profil zajmują pełną szerokość karty (padding ekranu 14 + karty 12).
  const contentWidth = Math.max(200, width - 52);

  const markers = useMemo<TrackMapMarker[]>(() => {
    if (view == null || view.track.line.length === 0) return [];
    const first = view.track.line[0]!;
    const last = view.track.line[view.track.line.length - 1]!;
    return [
      { position: first, color: theme.colors.green, label: `T/O ${timeUtc(first.time)}`, ring: true },
      { position: last, color: theme.colors.red, label: `LDG ${timeUtc(last.time)}` },
    ];
  }, [view, theme]);

  const header = (
    <ScreenHeader
      title="ŚLAD LOTU"
      subtitle={view != null ? `Lot ${view.flight.index} · ${timeUtc(view.flight.takeoffAt)} UTC` : undefined}
      size="md"
      onBack={navigation.goBack}
      backLabel="Statystyki"
      right={
        <SyncChip
          status={synced ? 'synced' : 'offline'}
          outboxCount={outboxCount}
          lastSyncAt={lastSyncAt}
        />
      }
    />
  );

  if (!loaded) {
    return <Screen scroll padded={false} header={header} />;
  }

  if (view == null) {
    return (
      <Screen scroll padded={false} header={header}>
        <View style={styles.content}>
          <Card title="Nie ma takiego lotu">
            <AppText variant="body" tone="muted">
              Ten dzień nie ma lotu o tym numerze. Wróć do statystyk i wybierz lot z tabeli.
            </AppText>
          </Card>
        </View>
      </Screen>
    );
  }

  if (view.missing != null) {
    return (
      <Screen scroll padded={false} header={header}>
        <MissingTrack view={view} />
      </Screen>
    );
  }

  const { track, profile, flight } = view;

  return (
    <Screen scroll padded={false} header={header}>
      <View style={styles.content}>
        {/* ── trasa ──────────────────────────────────────────────────────── */}
        <Card
          title="Trasa"
          headerRight={
            <AppText variant="micro" tone="muted">
              {timeUtc(flight.takeoffAt)} → {flight.landingAt != null ? timeUtc(flight.landingAt) : '—'} UTC
            </AppText>
          }
          flush
        >
          <TrackMap
            line={track.line}
            markers={markers}
            width={contentWidth}
            height={MAP_HEIGHT}
            departureIcao={view.departureIcao}
          />
          <StatGrid
            columns={2}
            cells={[
              { label: 'Czas lotu', value: duration(flight.durationMs), tone: 'green' },
              { label: 'Dystans', value: track.distanceNm.toFixed(1), unit: 'NM' },
              {
                label: 'Max wysokość',
                value:
                  track.maxAltitudeFt != null
                    ? Math.round(track.maxAltitudeFt).toLocaleString('pl-PL')
                    : '— —',
                unit: 'ft',
                tone: 'blue',
              },
              {
                label: 'Punkty',
                value: track.usableCount.toLocaleString('pl-PL'),
                unit: `z ${track.totalCount.toLocaleString('pl-PL')}`,
              },
            ]}
          />
        </Card>

        {/* ── profil pionowy ─────────────────────────────────────────────── */}
        <Card title="Profil pionowy" headerRight={<AppText variant="micro" tone="muted">wysokość GPS · ft</AppText>} flush>
          <VerticalProfile profile={profile} width={contentWidth} height={PROFILE_HEIGHT} />
          {profile.averageClimbFtPerMin != null && (
            <View style={styles.profileFoot}>
              <AppText variant="micro" tone="muted">
                Wznoszenie śr. {Math.round(profile.averageClimbFtPerMin)} ft/min
              </AppText>
              {profile.averageDescentFtPerMin != null && (
                <AppText variant="micro" tone="muted">
                  Zejście śr. {Math.round(profile.averageDescentFtPerMin)} ft/min
                </AppText>
              )}
            </View>
          )}
        </Card>

        {/* ── log punktów ────────────────────────────────────────────────── */}
        <Card
          title="Log punktów · UTC"
          headerRight={
            <AppText variant="micro" tone="muted">
              {view.log.length} z {track.totalCount}
            </AppText>
          }
          flush
        >
          <DataTable
            columns={[
              { label: 'Czas', width: 62 },
              { label: 'Pozycja' },
              { label: 'GS', width: 34 },
              { label: 'Wys.', width: 52 },
              { label: 'Stan', width: 58 },
            ]}
            rows={logRows(view)}
            emptyText="Brak punktów w tym locie."
          />
        </Card>

        {/* Baner STATUSU, nie pouczający: opisuje właściwość ekranu (co skąd pochodzi),
            a nie jednorazową wskazówkę — więc nie jest zamykalny (§ banery, typ 1). */}
        <Banner
          kind="status"
          tone="blue"
          text={
            'Ślad liczy się z zapisu na telefonie i działa bez zasięgu — mapa nie pobiera ' +
            'niczego z sieci. Wysokość jest z GPS, nie ciśnieniowa. Zapis znika po 14 dniach.'
          }
        />
      </View>
    </Screen>
  );
}

/** Wiersze logu: czas, pozycja, prędkość, wysokość i stan bramki jakości. */
function logRows(view: FlightTrackView): DataTableRow[] {
  return view.log.map((point, index) => ({
    id: `${point.time}-${index}`,
    label: `punkt ${timeUtc(point.time)} UTC`,
    cells: [
      { text: timeUtc(point.time) },
      {
        text: point.rejected === 'no-position' ? '— —' : formatLatLon(point.lat, point.lon),
        muted: true,
      },
      { text: point.groundSpeedKt != null ? String(Math.round(point.groundSpeedKt)) : '—' },
      {
        text:
          point.altitudeFt != null ? Math.round(point.altitudeFt).toLocaleString('pl-PL') : '—',
      },
      rejectionCell(point.rejected, point.accuracyM),
    ],
  }));
}

/**
 * Komórka stanu: „OK" albo powód odrzucenia. Powód jest treścią, nie ozdobą —
 * po to istnieje ten log (mockup 14, przypis pod tabelą).
 */
function rejectionCell(rejected: string | null, accuracyM: number | null) {
  if (rejected == null) return { text: 'OK', chip: 'green' as const };
  if (rejected === 'accuracy') {
    return { text: accuracyM != null ? `± ${Math.round(accuracyM)} m` : 'dokładność', chip: 'amber' as const };
  }
  if (rejected === 'jump') return { text: 'skok', chip: 'amber' as const };
  if (rejected === 'speed') return { text: 'prędkość', chip: 'amber' as const };
  return { text: 'brak poz.', chip: 'amber' as const };
}

/**
 * Wariant 14B — nie ma czego rysować. Pokazujemy POWÓD i to, co mimo wszystko wiadomo:
 * czasy lotu są pełnoprawne, brakuje wyłącznie geometrii.
 */
function MissingTrack({ view }: { view: FlightTrackView }) {
  const { flight, missing } = view;
  const manual = missing === 'manual';

  return (
    <View style={styles.content}>
      <Card title={manual ? 'Bez zapisu GPS' : 'Ślad niedostępny'}>
        <AppText variant="body" tone="muted" style={styles.missingText}>
          {manual
            ? 'Ten lot został wpisany ręcznie, więc nie ma z czego narysować trasy. Czasy są prawdziwe — pochodzą z Twojego wpisu, nie z odbiornika.'
            : 'Dla tego lotu nie ma zapisu GPS. Ślad to materiał roboczy z retencją 14 dni — starsze loty mają komplet czasów i statystyk, ale trasy już nie.'}
        </AppText>
      </Card>

      <Card title="Co wiadomo o tym locie" flush>
        <StatGrid
          columns={2}
          cells={[
            { label: 'Takeoff', value: timeUtc(flight.takeoffAt) },
            { label: 'Landing', value: flight.landingAt != null ? timeUtc(flight.landingAt) : '— —' },
            { label: 'Czas lotu', value: duration(flight.durationMs), tone: 'green' },
            {
              label: 'Źródło',
              value: manual ? 'RĘCZNIE' : 'AUTO',
              tone: manual ? 'amber' : 'green',
            },
          ]}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 11 },
  profileFoot: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, paddingTop: 6 },
  missingText: { lineHeight: 19 },
});
