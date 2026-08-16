/**
 * UZ Aero — 14 ŚLAD SESJI (mockupy `design/14-slad.html`, `14b`, `14c`, `14d`).
 *
 * Wejście MINIATURĄ z ekranu sesji (10). Ekran pokazuje cztery rzeczy z mockupu w tej
 * samej kolejności — trasę, profil pionowy, statystyki lotu i log przeliczonych punktów.
 *
 * ══ CAŁY BIEG SILNIKA, NIE POJEDYNCZY LOT (issue #38) ══
 * Zapis GPS powstaje w jednym ciągu, od uruchomienia do zatrzymania silnika. Linia jest
 * jedna, a starty, lądowania, zrzuty i szczyt są na niej ZNACZNIKAMI. Profil pionowy
 * pokazuje przez to kolejne wyniesienia obok siebie, z przerwą na ziemi między nimi.
 *
 * ══ GEOMETRIA Z SERWERA, CZASY Z TELEFONU (issue #47) ══
 * Trasa, profil, log i statystyki przychodzą gotowe z `GET /me/sessions/:uuid/track` —
 * telefon oddaje nagranie i kasuje swoją kopię. Wszystko inne (rejestracja, loty, czas
 * w powietrzu, godziny znaczników) liczy się dalej LOKALNIE, więc brak zasięgu zabiera
 * ekranowi rysunek, a nie wiedzę: wariant 14C pokazuje komplet czasów i mówi wprost,
 * czego brakuje.
 *
 * Mapa nadal nie pobiera KAFELKÓW (decyzja 2026-08-04) — tłem jest siatka współrzędnych
 * z podziałką i lotniska z katalogu wbudowanego w aplikację.
 *
 * ══ GESTY (issue #47 pkt 7 i 8) ══
 * Palec na jednym wykresie stawia kursor na OBU (`cursorAt`) — to samo zdarzenie widziane
 * z dwóch stron. Dwa palce przybliżają mapę, dwuklik wraca do całości.
 *
 * Ekran ich NIE OPISUJE i to jest decyzja: baner „dwa palce przybliżają mapę…" stał nad
 * profilem przez jeden przegląd i wyleciał. Szczypta i przeciągnięcie to gesty, których
 * nikt nie musi się uczyć z aplikacji lotniczej — a zdanie o nich zajmowało wiersz nad
 * wykresem przy KAŻDYM otwarciu, żeby powiedzieć rzecz, którą palec odkrywa sam.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { MissingTrackReason, SessionTrackView } from '../../application';
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
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useSkeleton } from '../hooks/useSkeleton';
import { mapMarkers, profileMarkers } from './logic/trackMarkers';
import { trackStatsView, type PhaseBarSegment } from './logic/trackStatsRows';

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
  const [cursorAt, setCursorAt] = useState<number | null>(null);
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

  const palette = useMemo(
    () => ({ green: theme.colors.green, red: theme.colors.red, blue: theme.colors.blue }),
    [theme],
  );

  const onMap = useMemo(
    () => (view == null ? [] : mapMarkers(view.markers, palette)),
    [view, palette],
  );
  const onProfile = useMemo(
    () => (view == null ? [] : profileMarkers(view.markers, palette)),
    [view, palette],
  );
  const stats = useMemo(() => (view == null ? null : trackStatsView(view.stats)), [view]);

  const moveCursor = useCallback((at: number | null) => setCursorAt(at), []);

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
    // Pełny ślad to najcięższy odczyt w aplikacji — mapa, profil pionowy, statystyki
    // i log punktów, w dodatku zza sieci. Plamki trzymają te wysokości (issue #33).
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
          <View>
            <TrackMap
              line={track.line}
              markers={onMap}
              width={contentWidth}
              height={MAP_HEIGHT}
              departureIcao={view.departureIcao}
              cursorAt={cursorAt}
              onCursorChange={moveCursor}
            />
            {/* Odczyt stoi w STAŁYM rogu, a nie przy palcu: chip wędrujący pod palcem
                zasłania to, co pilot właśnie ogląda (mockup 14D). */}
            <CursorReadout
              at={cursorAt}
              extra={speedAt(view, cursorAt)}
              color={theme.colors.blue}
              border={theme.colors.borderStrong}
              background={theme.colors.overlay}
            />
          </View>

          {/* POD MAPĄ NIE MA NIC: liczby zeszły do „Statystyk lotu", żeby profil
              przylegał do trasy. Kursor sprzęga oba wykresy, więc pilot patrzy na nie
              na przemian — rząd metryk między nimi kazał za każdym razem przeskoczyć
              wzrokiem przez cztery liczby, których w tej chwili nie czyta. */}
        </Card>

        {/* ── profil pionowy ─────────────────────────────────────────────── */}
        <Card title="Profil pionowy" headerRight={<AppText variant="micro" tone="muted">wysokość GPS · ft</AppText>} flush>
          <View>
            <VerticalProfile
              profile={profile}
              width={contentWidth}
              height={PROFILE_HEIGHT}
              markers={onProfile}
              cursorAt={cursorAt}
              onCursorChange={moveCursor}
            />
            <CursorReadout
              at={cursorAt}
              extra={altitudeAt(view, cursorAt)}
              color={theme.colors.blue}
              border={theme.colors.borderStrong}
              background={theme.colors.overlay}
            />
          </View>
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

        {/* ── statystyki lotu (issue #47 pkt 3) ──────────────────────────── */}
        {stats != null && (
          <Card
            title="Statystyki lotu"
            headerRight={
              <AppText variant="micro" tone="muted">
                z zapisu GPS
              </AppText>
            }
            flush
          >
            {/* Sumy CAŁEJ sesji: dwa loty to jeden zapis, więc dystans i czas liczą się
                przez oba. Rozbicie per lot stoi na osi czasu ekranu 10. */}
            <StatBlock title="Podsumowanie" first>
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
            </StatBlock>

            {stats.speed != null && (
              <StatBlock title="Prędkość i pion">
                <StatGrid columns={4} cells={stats.speed} />
              </StatBlock>
            )}

            {stats.phases != null && (
              <StatBlock title="Czasy faz" note={`bieg silnika ${duration(stats.phases.totalMs)}`}>
                {/* Sumę mówi podpis nagłówka („bieg silnika 1:43") — druga taka liczba
                    pod paskiem byłaby tą samą odpowiedzią dwa razy. */}
                <PhaseBar segments={stats.phases.segments} />
              </StatBlock>
            )}

            {stats.level != null && (
              <StatBlock
                title="Trzymanie wysokości"
                note={`lot poziomy · ${duration(stats.level.levelMs)}`}
              >
                <StatGrid columns={3} cells={stats.level.cells} />
              </StatBlock>
            )}
          </Card>
        )}

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
            'Ślad pobiera się z serwera — telefon nagrywa go w locie, oddaje przy pierwszej ' +
            'okazji i nie trzyma kopii. Mapa nie pobiera kafelków: siatka i lotniska są ' +
            'z katalogu w aplikacji. Wysokość jest z GPS, nie ciśnieniowa.'
          }
        />
      </View>
    </Screen>
  );
}

/**
 * Blok statystyk: tytuł, opcjonalny podpis i treść.
 *
 * `first` gasi kreskę u góry — nagłówek karty ma własną i dwie linie jedna pod drugą
 * czytają się jak usterka rysowania.
 */
function StatBlock({
  title,
  note,
  first = false,
  children,
}: {
  title: string;
  note?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        first ? styles.statBlockFirst : styles.statBlock,
        { borderTopColor: theme.colors.border },
      ]}
    >
      <View style={styles.statBlockHead}>
        <AppText variant="micro" tone="secondary">
          {title.toUpperCase()}
        </AppText>
        {note != null && (
          <AppText variant="micro" tone="muted">
            {note}
          </AppText>
        )}
      </View>
      {children}
    </View>
  );
}

/**
 * Pasek faz — proporcja jest tu TREŚCIĄ: dzień skokowy to prawie samo wznoszenie
 * i zniżanie, i to widać jednym spojrzeniem. Kolory te same, co na profilu i mapie
 * (pełna zieleń = wznoszenie, jaśniejsza = zejście, szary = ziemia).
 */
function PhaseBar({ segments }: { segments: PhaseBarSegment[] }) {
  const { theme } = useTheme();

  const color = (tone: PhaseBarSegment['tone']): { backgroundColor: string; opacity?: number } => {
    if (tone === 'green') return { backgroundColor: theme.colors.green };
    if (tone === 'blue') return { backgroundColor: theme.colors.blue };
    if (tone === 'greenDim') return { backgroundColor: theme.colors.green, opacity: 0.55 };
    if (tone === 'ground') return { backgroundColor: theme.colors.textMuted };
    return { backgroundColor: theme.colors.borderStrong };
  };

  return (
    <View style={styles.phaseWrap}>
      <View style={styles.phaseBar}>
        {segments.map((segment) => (
          <View
            key={segment.key}
            style={[{ flex: Math.max(segment.ms, 1) }, color(segment.tone)]}
          />
        ))}
      </View>

      <View style={styles.phaseLegend}>
        {segments.map((segment) => (
          <View key={segment.key} style={styles.phaseRow}>
            <View style={[styles.phaseDot, color(segment.tone)]} />
            <AppText variant="micro" tone="secondary" style={styles.phaseName}>
              {segment.label}
            </AppText>
            <AppText variant="micro">{duration(segment.ms)}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Odczyt pod palcem — znika razem z gestem, więc nie zajmuje miejsca na stałe. */
function CursorReadout({
  at,
  extra,
  color,
  border,
  background,
}: {
  at: number | null;
  extra: string | null;
  color: string;
  border: string;
  background: string;
}) {
  if (at == null) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.readout, { borderColor: border, backgroundColor: background }]}
    >
      <AppText variant="micro" style={{ color }}>
        {timeUtc(at)}
      </AppText>
      {extra != null && (
        <AppText variant="micro" tone="secondary">
          {extra}
        </AppText>
      )}
    </View>
  );
}

/** Prędkość w chwili kursora — z wierzchołka linii najbliższego tej chwili. */
function speedAt(view: SessionTrackView, at: number | null): string | null {
  if (at == null) return null;
  let best: (typeof view.track.line)[number] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const vertex of view.track.line) {
    const distance = Math.abs(vertex.time - at);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = vertex;
    }
  }
  if (best == null) return null;
  const speed = best.groundSpeedKt == null ? null : `${Math.round(best.groundSpeedKt)} kt`;
  return [speed, formatLatLon(best.lat, best.lon)].filter((part) => part != null).join(' · ');
}

/** Wysokość w chwili kursora — interpolacja między próbkami profilu. */
function altitudeAt(view: SessionTrackView, at: number | null): string | null {
  if (at == null) return null;
  const samples = view.profile.samples;
  if (samples.length === 0) return null;

  if (at <= samples[0]!.time) return feet(samples[0]!.altitudeFt);
  const last = samples[samples.length - 1]!;
  if (at >= last.time) return feet(last.altitudeFt);

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (at <= b.time) {
      const span = b.time - a.time;
      const value =
        span <= 0 ? b.altitudeFt : a.altitudeFt + ((b.altitudeFt - a.altitudeFt) * (at - a.time)) / span;
      return feet(value);
    }
  }
  return feet(last.altitudeFt);
}

function feet(value: number): string {
  return `${Math.round(value).toLocaleString('pl-PL')} ft`;
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
 * Warianty 14B i 14C — nie ma czego rysować. Pokazujemy POWÓD i to, co mimo wszystko
 * wiadomo: czasy sesji są pełnoprawne, bo liczą się z lokalnego rejestru. Brakuje
 * wyłącznie geometrii.
 *
 * Cztery powody znaczą CO INNEGO i zwinięcie ich do jednego „brak śladu" byłoby
 * kłamstwem o locie pilota — patrz `MissingTrackReason`.
 */
function MissingTrack({ view }: { view: SessionTrackView }) {
  const first = view.flights[0] ?? null;
  const last = view.flights[view.flights.length - 1] ?? null;
  const copy = missingCopy(view.missing!, view.pendingFixes);

  return (
    <View style={styles.content}>
      <Card title={copy.title}>
        <AppText variant="body" tone="muted" style={styles.missingText}>
          {copy.text}
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

      {copy.banner != null && <Banner kind="status" tone="amber" text={copy.banner} />}
    </View>
  );
}

function missingCopy(
  reason: MissingTrackReason,
  pendingFixes: number,
): { title: string; text: string; banner: string | null } {
  if (reason === 'offline') {
    return {
      title: 'Ślad jest na serwerze',
      text:
        'Telefon nagrał tę trasę i oddał ją serwerowi, ale nie ma teraz jak jej pobrać. ' +
        'Wróć na ten ekran z zasięgiem — trasa, profil i statystyki wczytają się w całości.',
      banner:
        'Ślad nie zajmuje już pamięci telefonu: nagranie idzie na serwer i tam zostaje ' +
        'na stałe, także po reinstalacji aplikacji i na nowym telefonie. Ceną jest ten ' +
        'ekran — sama trasa wymaga zasięgu.',
    };
  }

  if (reason === 'pending-upload') {
    return {
      title: 'Nagranie czeka na wysyłkę',
      text:
        `To nagranie jest jeszcze na tym telefonie — ${pendingFixes.toLocaleString('pl-PL')} ` +
        `${plural(pendingFixes, 'punkt', 'punkty', 'punktów')} w kolejce. Pójdzie przy ` +
        'najbliższej okazji i wtedy ten ekran narysuje trasę.',
      banner: null,
    };
  }

  if (reason === 'manual') {
    return {
      title: 'Bez zapisu GPS',
      text:
        'Ta sesja została wpisana ręcznie, więc nie ma z czego narysować trasy. Czasy są ' +
        'prawdziwe — pochodzą z Twojego wpisu, nie z odbiornika.',
      banner: null,
    };
  }

  return {
    title: 'Ślad niedostępny',
    text:
      'Serwer nie ma nagrania tej sesji. Nagranie mogło nie powstać (brak zgody na ' +
      'lokalizację, wyczerpana bateria) albo nigdy nie dotarło z telefonu, na którym ' +
      'powstało. Czasy i statystyki sesji są kompletne — brakuje wyłącznie trasy.',
    banner: null,
  };
}

/** „2 loty" — trzy formy polskiej liczby mnogiej; ten sam napis, co plakietka na 10. */
function flightsLabel(count: number): string {
  return `${count} ${plural(count, 'lot', 'loty', 'lotów')}`;
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 11 },
  profileFoot: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, paddingTop: 6 },
  missingText: { lineHeight: 19 },
  statBlock: { borderTopWidth: 1 },
  statBlockFirst: { borderTopWidth: 0 },
  statBlockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  phaseWrap: { paddingHorizontal: 12, paddingBottom: 10 },
  phaseBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 },
  phaseLegend: { marginTop: 8, gap: 3 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phaseDot: { width: 7, height: 7, borderRadius: 2 },
  phaseName: { flex: 1 },
  readout: {
    position: 'absolute',
    right: 8,
    top: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'baseline',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
});
