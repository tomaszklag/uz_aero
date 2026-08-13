/**
 * UZ Aero — 10 SESJA (mockupy `design/10-statystyki.html`, `10a`, `10b`, `10c`).
 *
 * Opisuje JEDNĄ SESJĘ SAMOLOTU (przejęcie → zdanie), a nie dzień pilota: dzień pilota to
 * LISTA SESJI na różnych maszynach (issue #23) i mieszka na „Mój dzień" (01).
 *
 * ══ CO ZMIENIŁ ISSUE #38 ══
 * Ekran nazywał się „Rozliczenie" i był zbudowany z pięciu sekcji, które trzy razy
 * powtarzały czas blokowy, a raz twierdziły nieprawdę („Δ sesji = czas blokowy"). Dziś:
 *  • **ślad całego biegu silnika stoi WPROST tutaj**, ze znacznikami startów i lądowań;
 *    ekran 16 (szczegóły jednego lotu) został usunięty, bo dublował to, co widać piętro
 *    wyżej — jego treść wróciła na oś czasu
 *  • **oś czasu zamiast tabeli lotów**: przejęcie → uruchomienie → starty, zrzuty
 *    i lądowania → wyłączenie → zdanie. Czas blokowy pada dokładnie RAZ, w stopce osi
 *  • **paliwo i motogodziny w jednej formie**: rachunek → wynik → oczekiwanie dla TEJ
 *    mieszanki faz → werdykt. Motogodziny mają odtąd własną normę
 *  • **plakietka „AUTO" znikła** — detekcja jest stanem domyślnym, więc oznaczamy
 *    wyłącznie wpis ręczny (ta sama reguła, co SyncChip po issue #12)
 *
 * ══ CO ZMIENIŁ ISSUE #40 (uwagi z urządzenia) ══
 *  • **kołowanie wchodzi na oś** (pkt 4) — było jedyną dziurą tego zestawienia wobec
 *    logu kokpitu
 *  • **korekta ma JEDNE drzwi** (pkt 1): „EDYTUJ DANE" pod ekranem. Ołówek przy każdym
 *    z kilkunastu wierszy dawał kilkanaście identycznych celów i zabierał prawą kolumnę
 *    jedynej liczbie, która coś w niej znaczy — czasowi trwania (pkt 2)
 *  • **plakietka „RĘCZNIE" znikła** (pkt 6): sposób powstania zapisu nie jest pytaniem
 *    pilota. Reguła z issue #38 dociągnięta do końca
 *  • **„Czas lotu" zamiast „W powietrzu"** (pkt 3) — dwa słowa łamały stopkę na telefonie
 *  • **notatki pilota mają wreszcie swoje miejsce** (pkt 5)
 *  • **z rachunków zostaje SAMA plakietka werdyktu** (pkt 7 i 8); pasmo, stawki normy
 *    i rozpisane działanie otwiera tapnięcie w nią (`design/10c-norma-detale.html`)
 *
 * Ekran jest **wyłącznie do odczytu**: nie emituje ani jednego zdarzenia. Wszystko, co
 * pokazuje, jest projekcją ze strumienia lokalnego (§5.2) — JEDYNYM wyjątkiem jest norma
 * zużycia, która przychodzi z serwera i dlatego ma stan świeżości (§4.8).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  BalanceCard,
  Banner,
  Card,
  FreshnessNote,
  ResultRow,
  Screen,
  ScreenHeader,
  SessionAxis,
  Skeleton,
  SyncChip,
  Tag,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { useAircraft } from '../hooks/useAircraft';
import { useSkeleton } from '../hooks/useSkeleton';
import { correctionWindow, isJumpOperation } from '../../domain';
import type { SessionTrackView } from '../../application';
import { dateUtcDayMonth } from '../format';
import { TrackThumbnail } from '../components/data/TrackThumbnail';
import { dateTimeUtcShort, jumperBreakdown } from './logic/statsDay';
import { buildSessionAxis } from './logic/sessionAxis';
import { fuelBalance, mhBalance } from './logic/sessionBalance';
import { sessionNotes } from './logic/sessionNotes';
import { operationTag } from './logic/operations';

/** Wysokość miniatury śladu — proporcje z mockupu 10 przy szerokości telefonu. */
const THUMB_HEIGHT = 168;

export function StatsScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string, params?: object) => void };
}) {
  const { theme } = useTheme();

  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const queries = useSessionStore((s) => s.queries);
  const trackQueries = useSessionStore((s) => s.trackQueries);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const currentPilotId = useCurrentPilot((s) => s.id);

  // Norma zużycia z cache'u referencyjnego — jedyna dana z serwera na tym ekranie.
  // Reszta liczb jest projekcją lokalnych zdarzeń, więc zawsze świeża (§5.2).
  const aircraftRef = useAircraft(projection.aircraftId);
  const norm = aircraftRef?.consumption ?? null;

  // Karty załogi pokazują KOD pilota (TMK/AKO) — tak jak mockup i jak dokumenty.
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
   * Ślad sesji — jedyny odczyt tego ekranu, który idzie do OSOBNEGO magazynu (setki
   * punktów), więc jako jedyny dostaje plamkę skeletonu (issue #33). Reszta liczy się
   * z rejestru w pamięci i jest na ekranie od pierwszej klatki.
   */
  const sessionUuid = projection.sessionUuid;
  const [track, setTrack] = useState<SessionTrackView | null>(null);
  const [trackLoaded, setTrackLoaded] = useState(false);
  const trackSkeleton = useSkeleton(!trackLoaded);

  useEffect(() => {
    if (trackQueries == null || sessionUuid == null) {
      setTrackLoaded(true);
      return;
    }
    let alive = true;
    void trackQueries.bySession(sessionUuid).then((result) => {
      if (!alive) return;
      setTrack(result);
      setTrackLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [trackQueries, sessionUuid]);

  const openTrack = useCallback(() => {
    if (sessionUuid == null) return;
    navigation.navigate('Track', { sessionUuid });
  }, [navigation, sessionUuid]);

  /**
   * Okno korekty (§decyzja 2026-07-23). Termin jest wartością BEZWZGLĘDNĄ, więc nie
   * potrzebuje tykającego zegara — liczymy go raz na zmianę projekcji.
   */
  const window24h = useMemo(() => correctionWindow(projection, Date.now()), [projection]);

  /**
   * Sesja po oknie 24 h = PODGLĄD (issue #35 pkt 2, mockup `design/10b`).
   *
   * Ekran zostaje ten sam — te same liczby, ta sama kolejność sekcji — ale znika z niego
   * wszystko, co pisze. Od issue #40 jest to dokładnie JEDNA rzecz: przycisk „EDYTUJ
   * DANE". Wyszarzony przycisk byłby gorszy od jego braku — obiecywałby akcję, którą
   * reguły domeny i tak odrzucą (§6 pkt 3). Powód stoi w banerze nad wszystkim.
   *
   * Werdykty zostają KLIKALNE także tutaj: arkusz normy niczego nie zapisuje, a zamknięte
   * okno odbiera prawo do zmiany danych, nie do ich zrozumienia.
   */
  const readOnly = !window24h.open;
  /** Po oknie wchodzi się tu wyłącznie z „Poprzednich dni" — tam też prowadzi wyjście. */
  const backScreen = readOnly ? 'History' : 'MyDay';

  const axis = useMemo(
    () => buildSessionAxis(projection, events, Date.now()),
    [projection, events],
  );

  const refuelCount = useMemo(
    () => events.filter((event) => event.type === 'refuel').length,
    [events],
  );

  const notes = useMemo(() => sessionNotes(projection, events), [projection, events]);

  /**
   * Wiek normy — jedyna dana z serwera na tym ekranie, więc jedyna z adnotacją świeżości
   * (§4.8). Od issue #40 stoi W ARKUSZU normy, przy liczbach, których dotyczy: na karcie
   * została sama plakietka werdyktu, a adnotacja o cache'u bez liczb obok nie ma czego
   * kwalifikować. Stan `live` nie rysuje nic, więc online arkusz zostaje bez niej.
   */
  const normFreshness = (
    <FreshnessNote
      state={synced ? 'live' : 'cache'}
      syncedAt={aircraftRef == null ? null : dateTimeUtcShort(aircraftRef.fetchedAt)}
    />
  );

  const fuel = useMemo(
    () => fuelBalance(projection, norm, refuelCount),
    [projection, norm, refuelCount],
  );
  const mh = useMemo(() => mhBalance(projection, norm), [projection, norm]);

  // Dzień bez sesji nie ma czego podsumowywać — pokazujemy to wprost, zamiast
  // rysować siatkę myślników.
  if (projection.sessionUuid == null) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
          <AppText variant="display" style={{ textAlign: 'center' }}>
            BRAK DANYCH SESJI
          </AppText>
          <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
            Ten ekran opisuje jeden bieg silnika. Zacznij lot, a wszystko wróci tu samo —
            również bez zasięgu.
          </AppText>
        </View>
      </Screen>
    );
  }

  const flightCount = projection.flights.length;
  // Sekcję zrzutów pokazujemy także przy zerze, gdy dzień był zadeklarowany jako skokowy —
  // brak wyniesień jest wtedy informacją dla klienta, nie ciszą.
  const showDrops =
    projection.drops.count > 0 ||
    (projection.operation != null && isJumpOperation(projection.operation));

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="SESJA"
          size="md"
          // Powrót JEST i prowadzi tam, skąd się tu wchodzi (mockup 10: „‹ Dzień",
          // 10b: „‹ Dni"): kafelkiem sesji na 01 i takim samym kafelkiem w historii (12).
          onBack={() => navigation.navigate(backScreen)}
          backLabel={readOnly ? 'Dni' : 'Dzień'}
          subtitle={subtitle(projection.aircraftId, projection.claimedAt, projection.operation)}
          right={
            <>
              {/* Liczba lotów NIE MA tu plakietki (issue #40): stopka osi mówi
                  „STARTY 2" trzy centymetry niżej, a plakietka świecąca przy każdej
                  normalnej sesji uczy oko pomijać róg nagłówka — ta sama reguła, którą
                  issue #12 wygasił zielony SyncChip. Zostaje sam stan ODCHYLONY:
                  sesja, w której silnik pracował, a maszyna nie wzbiła się w powietrze. */}
              {flightCount === 0 && (
                <Tag
                  label="bez lotu"
                  tone="amber"
                  size="md"
                  style={{ borderRadius: theme.radius.pill }}
                />
              )}
              {/* Tryb ekranu wprost (mockup 10b): bez tej plakietki brak przycisku
                  „EDYTUJ DANE" wygląda jak awaria, a nie jak reguła. */}
              {readOnly && (
                <Tag
                  label="Podgląd"
                  tone="neutral"
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
      }
      /*
       * Pas akcji ma DOKŁADNIE tyle przycisków, ile jest tu czynności do zrobienia.
       *
       * Zielone „WRÓĆ DO DNIA" zostało usunięte (issue #42, uwaga użytkownika): powrót
       * stoi w nagłówku („‹ Dzień" / „‹ Dni") i jest tam na każdym ekranie aplikacji,
       * a drugi powrót — w dodatku w kolorze akcji głównej, na miejscu, w którym reszta
       * aplikacji stawia „dalej" — obiecywał czynność, której ten ekran nie ma: sesję
       * potwierdziło zdanie samolotu (09B), tutaj się ją ogląda.
       *
       * W trybie podglądu (po oknie 24 h) nie zostaje nic, więc stopki nie ma wcale.
       * „EDYTUJ DANE" znika tam razem z ołówkami — to ta sama możliwość zapisu, tylko
       * innymi drzwiami (lista ręczna 08 / zdanie bez lotu 09C).
       */
      footer={
        readOnly ? undefined : (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            <ActionButton
              label="EDYTUJ DANE"
              tone="neutral"
              variant="secondary"
              size="md"
              icon="edit"
              onPress={() =>
                navigation.navigate(flightCount === 0 ? 'ReleaseAircraft' : 'ManualLog')
              }
            />
          </View>
        )
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

        {/* ── przebieg sesji: ślad + oś czasu ───────────────────────────────
            Mapa i oś stoją w JEDNEJ karcie, bo opisują to samo: znacznik na trasie
            i wiersz osi to ten sam start albo to samo lądowanie. */}
        <Card
          title="Przebieg sesji"
          headerRight={
            <AppText variant="micro" tone="muted">
              czasy UTC
            </AppText>
          }
          flush
        >
          {!trackLoaded && trackSkeleton && (
            <View accessible accessibilityLabel="Ładowanie śladu" style={styles.thumbFrame}>
              <Skeleton height={THUMB_HEIGHT} radius={0} />
            </View>
          )}
          {trackLoaded && track != null && track.missing == null && (
            <TrackThumbnail
              line={track.track.line}
              markers={track.markers}
              height={THUMB_HEIGHT}
              onPress={openTrack}
            />
          )}
          {trackLoaded && (track == null || track.missing != null) && (
            <View style={[styles.noTrack, { borderBottomColor: theme.colors.border }]}>
              <AppText variant="display" tone="secondary" style={styles.noTrackTitle}>
                {noTrackTitle(track)}
              </AppText>
              <AppText variant="mono" tone="muted" style={styles.noTrackText}>
                {noTrackText(track)}
              </AppText>
            </View>
          )}

          {/* Oś jest CZYSTO OPISOWA (issue #40 pkt 1): korekta wychodzi jednymi drzwiami,
              przyciskiem „EDYTUJ DANE" pod ekranem. Ołówek przy każdym z kilkunastu
              wierszy dawał kilkanaście identycznych celów i zabierał miejsce jedynej
              liczbie, która w tej kolumnie coś znaczy — czasowi trwania. */}
          <SessionAxis
            rows={axis.rows}
            foot={axis.foot}
            emptyText="Ta sesja nie ma jeszcze ani jednego zdarzenia."
          />
        </Card>

        {/* ── paliwo ───────────────────────────────────────────────────────
            Na karcie: rachunek, wynik i plakietka werdyktu. Pasmo, stawki normy
            i rozpisane działanie otwiera tapnięcie w plakietkę (issue #40 pkt 7). */}
        <BalanceCard
          title="Paliwo"
          rows={fuel.rows}
          totalLabel={fuel.totalLabel}
          totalValue={fuel.totalValue}
          totalTone={fuel.totalTone}
          verdict={fuel.verdict}
          details={fuel.details}
          freshness={normFreshness}
          naNote={fuel.naNote}
        />

        {/* ── motogodziny ──────────────────────────────────────────────────── */}
        <BalanceCard
          title="Motogodziny"
          rows={mh.rows}
          totalLabel={mh.totalLabel}
          totalValue={mh.totalValue}
          totalTone={mh.totalTone}
          verdict={mh.verdict}
          details={mh.details}
          freshness={normFreshness}
          naNote={mh.naNote}
        />

        {/* ── zrzuty: strona przychodowa sesji ──────────────────────────────
            Pojedyncze wyniesienia stoją na osi czasu wyżej; tutaj zostaje suma,
            bo to ona idzie do rozliczenia z klientem. */}
        {showDrops && (
          <Card title="Zrzuty" flush>
            <ResultRow
              label="Wyniesienia"
              value={`${projection.drops.count} · ${projection.drops.totalJumpers} skoczków`}
              tone="blue"
              style={styles.firstRow}
            />
            <ResultRow
              label="Typy skoków"
              value={jumperBreakdown(projection.drops.jumpers)}
              tone="neutral"
              style={styles.row}
            />
            <ResultRow
              label="Średnia wysokość"
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

        {/* ── załoga ───────────────────────────────────────────────────────
            Jeden wiersz na osobę zamiast dwóch kafli (issue #38 pkt 9): obie karty
            niosły ten sam czas blokowy, a Dual dodatkowo „0 / 0" startów — liczbę,
            która nic nie znaczy poza tym, że rejestr ma jednego autora. */}
        <Card title="Załoga" flush>
          <ResultRow
            label="PIC"
            value={crewLabel(projection.picId, currentPilotId, codeOf)}
            tone="neutral"
            style={styles.firstRow}
          />
          <ResultRow
            label="Dual"
            value={
              projection.dualId != null
                ? crewLabel(projection.dualId, currentPilotId, codeOf)
                : 'brak — sesja jednoosobowa'
            }
            tone="neutral"
            style={styles.row}
          />
        </Card>

        {/* ── notatki ───────────────────────────────────────────────────────
            Wszystko, co pilot NAPISAŁ o tej sesji: notatka z kroku „zadanie" (02e)
            i uwagi wpisów ręcznych (08, 15). Do issue #40 ten tekst nie wracał do
            autora nigdzie — widział go tylko administrator w panelu.
            Karta stoi na końcu, bo jest komentarzem do liczb wyżej, i pojawia się
            WYŁĄCZNIE wtedy, gdy jest treść: „Notatki —" byłoby wierszem o niczym. */}
        {notes.length > 0 && (
          <Card title="Notatki" flush>
            {notes.map((note, index) => (
              <View
                key={note.id}
                style={[
                  styles.note,
                  index > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null,
                ]}
              >
                <AppText variant="micro" tone="muted">
                  {note.when.toUpperCase()}
                </AppText>
                {/* Body font, nie mono: to zdanie napisane przez człowieka, a nie odczyt. */}
                <AppText variant="body" tone="secondary" style={styles.noteText}>
                  {note.text}
                </AppText>
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

/**
 * Podtytuł: „SP-AXA · 06 SIE · SKOKI" (mockup 10).
 *
 * Godzin tu nie ma — przejęcie i zdanie stoją na osi czasu razem z odczytami, a trzeci
 * napis w nagłówku walczyłby z nimi o tę samą linię.
 */
function subtitle(
  aircraftId: string | null,
  claimedAt: number | null,
  operation: Parameters<typeof operationTag>[0] | null,
): string {
  return [
    aircraftId,
    claimedAt != null ? dateUtcDayMonth(claimedAt) : null,
    operation != null ? operationTag(operation) : null,
  ]
    .filter((part): part is string => part != null && part !== '')
    .join(' · ');
}

/** „TMK · zalogowany (Ty)" — kod pilota z cache'u referencyjnego. */
function crewLabel(
  pilotId: string | null,
  currentPilotId: string | null,
  codeOf: (id: string) => string,
): string {
  if (pilotId == null) return '—';
  return pilotId === currentPilotId ? `${codeOf(pilotId)} (Ty)` : codeOf(pilotId);
}

/** Nagłówek kafelka „bez śladu" — dwa różne powody znaczą dla pilota co innego. */
function noTrackTitle(track: SessionTrackView | null): string {
  return track?.missing === 'manual' ? 'BEZ ZAPISU GPS' : 'ŚLAD NIEDOSTĘPNY';
}

function noTrackText(track: SessionTrackView | null): string {
  if (track?.missing === 'manual') {
    return (
      'Ta sesja została wpisana ręcznie, więc nie ma z czego narysować trasy. ' +
      'Czasy poniżej są pełnoprawne — pochodzą z Twojego wpisu, nie z odbiornika.'
    );
  }
  return (
    'Nie ma zapisu GPS dla tej sesji. Ślad to materiał roboczy z retencją 14 dni — ' +
    'starsze sesje mają komplet czasów i liczb, ale trasy już nie.'
  );
}

/**
 * `.correction-window` — pudełko z terminem samodzielnej korekty.
 *
 * Trzy stany, bo trzy różne rzeczy trzeba powiedzieć: sesja jeszcze niezdana (termin
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
  // Baner mówi, GDZIE się poprawia (issue #40 pkt 1) — ołówków przy wierszach osi już
  // nie ma, więc zdanie o nich prowadziłoby donikąd.
  const tail =
    'Później korektę nanosi administrator. Czasy zdarzeń poprawisz przyciskiem ' +
    '„EDYTUJ DANE" na dole ekranu.';

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

/**
 * `ResultRow` jest projektowany do wnętrza karty z paddingiem; tu karty są `flush`,
 * bo oś i rachunki dociągają się do krawędzi — wcięcie wiersza dokładamy stylem.
 */
const row = { paddingHorizontal: 12, marginTop: 0 };

const styles = StyleSheet.create({
  row,
  /** Pierwszy wiersz sekcji styka się z linią nagłówka karty — własnej nie potrzebuje. */
  firstRow: { ...row, borderTopWidth: 0 },
  thumbFrame: { overflow: 'hidden' },
  noTrack: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 26,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  noTrackTitle: { fontSize: 17, letterSpacing: 2 },
  noTrackText: { fontSize: 8.5, lineHeight: 14, textAlign: 'center', maxWidth: 250 },
  note: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  noteText: { fontSize: 12, lineHeight: 18 },
});
