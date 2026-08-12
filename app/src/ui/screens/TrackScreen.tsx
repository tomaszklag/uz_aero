/**
 * UZ Aero — 14 ŚLAD SESJI (mockupy `design/14-slad.html`, `14b`).
 *
 * Wejście MINIATURĄ z ekranu sesji (10). Ekran pokazuje trzy rzeczy z mockupu w tej samej
 * kolejności — trasę, profil pionowy i log przeliczonych punktów.
 *
 * ══ CAŁY BIEG SILNIKA, NIE POJEDYNCZY LOT (issue #38) ══
 * Zapis GPS powstaje w jednym ciągu, od uruchomienia do zatrzymania silnika. Do issue #38
 * ekran wycinał z niego okno JEDNEGO lotu — gubiąc kołowanie i przerwy między
 * wyniesieniami, czyli czas, który wchodzi wprost do normy zużycia. Dziś linia jest jedna,
 * a starty, lądowania i zrzuty są na niej ZNACZNIKAMI. Profil pionowy pokazuje przez to
 * kolejne wyniesienia obok siebie, z przerwą na ziemi między nimi.
 *
 * **Wszystko liczy się LOKALNIE**, z zapisu na telefonie i z rejestru na telefonie
 * (`FlightTrackQueries`) i ekran **nie potrzebuje sieci w ogóle** — mapa nie ma kafelków
 * (decyzja 2026-08-04), tylko siatkę współrzędnych z podziałką i lotniska z katalogu
 * wbudowanego w aplikację.
 *
 * Wariant 14B (brak śladu) podaje POWÓD zamiast pustej mapy. Powody są dwa i znaczą co
 * innego: sesja wpisana ręcznie nigdy śladu nie miała, a sesja sprzed ponad 14 dni już go
 * nie ma. W obu przypadkach czasy są prawdziwe i zostają na ekranie — brakuje wyłącznie
 * geometrii.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { SessionTrackView } from '../../application';
import { dateUtcDayMonth, duration, formatLatLon, plural, timeUtc } from '../format';
import {
  AppText,
  Banner,
  Card,
  DataTable,
  Screen,
  ScreenHeader,
  Skeleton,
  StatGrid,
  SyncChip,
  TrackMap,
  VerticalProfile,
  type DataTableRow,
  type TrackMapMarker,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useSkeleton } from '../hooks/useSkeleton';

/** Wysokość mapy i profilu — proporcje z mockupu 14 przy szerokości telefonu. */
const MAP_HEIGHT = 300;
const PROFILE_HEIGHT = 172;

export interface TrackScreenParams {
  sessionUuid: string;
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

  const [view, setView] = useState<SessionTrackView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const skeleton = useSkeleton(!loaded);

  const { sessionUuid } = route.params;

  useEffect(() => {
    if (trackQueries == null) {
      setLoaded(true);
      return;
    }
    let alive = true;
    void trackQueries.bySession(sessionUuid).then((result) => {
      if (!alive) return;
      setView(result);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [trackQueries, sessionUuid]);

  // Mapa i profil zajmują pełną szerokość karty (padding ekranu 14 + karty 12).
  const contentWidth = Math.max(200, width - 52);

  /**
   * Znaczniki: każdy start, każde lądowanie i każdy zrzut (issue #38 pkt 2).
   *
   * Podpis niesie numer, nie samą godzinę — przy trzech wyniesieniach nad tym samym
   * placem „T/O 08:20" i „T/O 09:12" leżą kilka pikseli od siebie i bez numeru nie da
   * się ich przypisać do wierszy osi czasu na ekranie 10.
   *
   * Znacznik bez pozycji (zapis nie sięga tej chwili) po prostu nie powstaje — punkt
   * postawiony „gdzieś obok" kłamałby na mapie.
   */
  const markers = useMemo<TrackMapMarker[]>(() => {
    if (view == null) return [];
    return view.markers
      .filter((marker) => marker.position != null)
      .map((marker) => {
        if (marker.kind === 'takeoff') {
          return {
            position: marker.position!,
            color: theme.colors.green,
            label: `T/O ${marker.index} · ${timeUtc(marker.at)}`,
            ring: true,
          };
        }
        if (marker.kind === 'landing') {
          return {
            position: marker.position!,
            color: theme.colors.red,
            label: `LDG ${marker.index} · ${timeUtc(marker.at)}`,
          };
        }
        return {
          position: marker.position!,
          color: theme.colors.blue,
          label: `ZRZUT ${marker.index}`,
          ring: true,
        };
      });
  }, [view, theme]);

  const header = (
    <ScreenHeader
      title="ŚLAD SESJI"
      // Podtytuł 1:1 z mockupu 14: rejestracja · dzień i miesiąc · liczba lotów.
      // Bez „· UTC" (wzorzec nagłówków po issue #23) i bez godzin — te stoją przy
      // znacznikach na mapie i w nagłówku karty trasy.
      subtitle={
        view != null
          ? `${view.aircraftId ?? '—'} · ${dateUtcDayMonth(view.fromAt)} · ${flightsLabel(view.flights.length)}`
          : undefined
      }
      size="md"
      onBack={navigation.goBack}
      backLabel="Sesja"
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
    // Pełny ślad to najcięższy odczyt w aplikacji — mapa, profil pionowy i log punktów
    // z osobnego magazynu. Plamki trzymają te trzy wysokości (issue #33).
    return (
      <Screen scroll padded={false} header={header}>
        {skeleton && (
          <View accessible accessibilityLabel="Ładowanie" style={styles.content}>
            <Skeleton height={MAP_HEIGHT + 88} radius={theme.radius.md} />
            <Skeleton height={PROFILE_HEIGHT + 44} radius={theme.radius.md} />
            <Skeleton height={160} radius={theme.radius.md} />
          </View>
        )}
      </Screen>
    );
  }

  if (view == null) {
    return (
      <Screen scroll padded={false} header={header}>
        <View style={styles.content}>
          <Card title="Nie ma takiej sesji">
            <AppText variant="body" tone="muted">
              Tej sesji nie ma w rejestrze na tym telefonie. Wróć do „Mój dzień" i otwórz
              sesję z listy.
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

  const { track, profile } = view;

  return (
    <Screen scroll padded={false} header={header}>
      <View style={styles.content}>
        {/* ── trasa ──────────────────────────────────────────────────────── */}
        <Card
          title="Trasa"
          headerRight={
            <AppText variant="micro" tone="muted">
              {/* Zakres = BIEG SILNIKA, nie pojedynczy lot: tyle trwał zapis. */}
              {timeUtc(view.fromAt)} → {view.toAt != null ? timeUtc(view.toAt) : '—'} UTC
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
              {
                label: 'W powietrzu',
                value: duration(view.flightTimeMs),
                unit: flightsLabel(view.flights.length),
                tone: 'green',
              },
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
            emptyText="Brak punktów w tej sesji."
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
function logRows(view: SessionTrackView): DataTableRow[] {
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
function MissingTrack({ view }: { view: SessionTrackView }) {
  const manual = view.missing === 'manual';
  const first = view.flights[0] ?? null;
  const last = view.flights[view.flights.length - 1] ?? null;

  return (
    <View style={styles.content}>
      <Card title={manual ? 'Bez zapisu GPS' : 'Ślad niedostępny'}>
        <AppText variant="body" tone="muted" style={styles.missingText}>
          {manual
            ? 'Ta sesja została wpisana ręcznie, więc nie ma z czego narysować trasy. Czasy są prawdziwe — pochodzą z Twojego wpisu, nie z odbiornika.'
            : 'Dla tej sesji nie ma zapisu GPS. Ślad to materiał roboczy z retencją 14 dni — starsze sesje mają komplet czasów i statystyk, ale trasy już nie.'}
        </AppText>
      </Card>

      <Card title="Co wiadomo o tej sesji" flush>
        <StatGrid
          columns={2}
          cells={[
            { label: 'Uruchomienie', value: timeUtc(view.fromAt) },
            { label: 'Wyłączenie', value: view.toAt != null ? timeUtc(view.toAt) : '— —' },
            { label: 'W powietrzu', value: duration(view.flightTimeMs), tone: 'green' },
            {
              label: 'Loty',
              value: String(view.flights.length),
              unit:
                first != null && last != null
                  ? `${timeUtc(first.takeoffAt)} → ${last.landingAt != null ? timeUtc(last.landingAt) : '—'}`
                  : undefined,
            },
          ]}
        />
      </Card>
    </View>
  );
}

/** „2 loty" — trzy formy polskiej liczby mnogiej; ten sam napis, co plakietka na 10. */
function flightsLabel(count: number): string {
  return `${count} ${plural(count, 'lot', 'loty', 'lotów')}`;
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 11 },
  profileFoot: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, paddingTop: 6 },
  missingText: { lineHeight: 19 },
});
