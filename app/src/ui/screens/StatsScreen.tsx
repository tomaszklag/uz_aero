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
 * ══ CO ZMIENIŁ ISSUE #43 ══
 * Ekran ma odtąd DWA STANY. W odczycie jest tym, czym był — opisem sesji, który nie
 * emituje ani jednego zdarzenia. Po „EDYTUJ DANE" wchodzi w TRYB EDYCJI: każdy wiersz
 * osi staje się celem 44 px z ołówkiem, na górze pojawiają się wykryte niespójności
 * logu, a w pasie akcji „DODAJ WPIS". Przycisk nie prowadzi już na osobny ekran (lista
 * ręczna 08 została skasowana) — poprawia się TAM, gdzie się patrzy.
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
 * Wszystko, co ekran pokazuje, jest projekcją ze strumienia lokalnego (§5.2) — JEDYNYM
 * wyjątkiem jest norma zużycia, która przychodzi z serwera i dlatego ma stan świeżości
 * (§4.8). W trybie odczytu ekran nie emituje ani jednego zdarzenia; w trybie edycji
 * emituje wyłącznie korekty i dopisane fakty, każdy przez `useSessionEdit`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  BalanceCard,
  Banner,
  Card,
  FreshnessNote,
  Icon,
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
import { useSessionEdit } from '../hooks/useSessionEdit';
import { useSkeleton } from '../hooks/useSkeleton';
import {
  aircraftLimitsFrom,
  correctionWindow,
  isJumpOperation,
  sessionInconsistencies,
} from '../../domain';
import type { SessionTrackView } from '../../application';
import { dateUtcDayMonth } from '../format';
import { TrackThumbnail } from '../components/data/TrackThumbnail';
import { dateTimeUtcShort, jumperBreakdown } from './logic/statsDay';
import { buildSessionAxis } from './logic/sessionAxis';
import { withIssues } from './logic/sessionEdit';
import { fuelBalance, mhBalance } from './logic/sessionBalance';
import { missingSessionNote, noteTargetUuid, sessionNotes } from './logic/sessionNotes';
import { operationTag } from './logic/operations';

/** Wysokość miniatury śladu — proporcje z mockupu 10 przy szerokości telefonu. */
const THUMB_HEIGHT = 168;

export function StatsScreen({
  navigation,
  route,
}: {
  navigation: { navigate: (screen: string, params?: object) => void };
  /**
   * `edit` — wejść od razu w tryb edycji (kafelek „Popraw dane sesji" w kokpicie),
   * `from` — dokąd wraca nagłówek. Kokpit jest stanem modalnym, więc wejście stamtąd
   * musi wracać DO KOKPITU, a nie na „Mój dzień": inaczej pilot trzymający samolot
   * wychodziłby z niego bokiem (`CLAUDE.md`, sekcja o modalności).
   */
  route?: { params?: { edit?: boolean; from?: string } };
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

  /**
   * Piloci z cache'u referencyjnego (§4.8) — dwa zastosowania, jeden odczyt.
   * Karty załogi pokazują KOD (TMK/AKO), a tryb edycji potrzebuje pełnej listy jako
   * wyboru Duala. Osobny odczyt dla arkusza byłby drugim zapytaniem o to samo.
   */
  const [pilots, setPilots] = useState<readonly { id: string; code: string; name: string }[]>(
    [],
  );
  useEffect(() => {
    if (queries == null) return;
    let alive = true;
    void queries.pilots().then((list) => {
      if (!alive) return;
      setPilots(list.map((p) => ({ id: p.id, code: p.code, name: p.name })));
    });
    return () => {
      alive = false;
    };
  }, [queries]);

  const codeOf = useCallback(
    (id: string) => pilots.find((p) => p.id === id)?.code ?? id,
    [pilots],
  );

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
  /**
   * Po oknie wchodzi się tu wyłącznie z „Poprzednich dni" — tam też prowadzi wyjście.
   * Wejście z kokpitu (issue #43) podaje `from` i wraca dokładnie tam, skąd przyszło.
   */
  const backScreen = route?.params?.from ?? (readOnly ? 'History' : 'MyDay');

  /**
   * Tryb edycji (issue #43). Po oknie 24 h nie da się w niego wejść — nie ma przycisku,
   * który by go włączył, a `editing` i tak sprowadzamy do `false`: parametr trasy
   * przychodzi z zewnątrz i nie może obchodzić reguły.
   */
  const [editingRequested, setEditingRequested] = useState(route?.params?.edit === true);
  const editing = editingRequested && !readOnly;

  const aircraftLimits = useMemo(() => aircraftLimitsFrom(aircraftRef), [aircraftRef]);

  /**
   * Niespójności logu — liczone TYLKO w trybie edycji.
   *
   * Nie dlatego, że w odczycie są nieprawdziwe, ale dlatego, że w odczycie nie ma czym
   * na nie odpowiedzieć: baner mówiący „lot nie ma lądowania" bez możliwości dopisania
   * go jest zarzutem, nie pomocą. Pilot zobaczy je w chwili, w której może działać.
   */
  const issues = useMemo(
    () => (editing ? sessionInconsistencies(projection, events, aircraftLimits) : []),
    [editing, projection, events, aircraftLimits],
  );

  const axis = useMemo(
    () => buildSessionAxis(projection, events, Date.now()),
    [projection, events],
  );
  const axisRows = useMemo(() => withIssues(axis.rows, issues), [axis.rows, issues]);

  const edit = useSessionEdit(axisRows, { codeOf, currentPilotId, pilots });

  const refuelCount = useMemo(
    () => events.filter((event) => event.type === 'refuel').length,
    [events],
  );

  const notes = useMemo(() => sessionNotes(projection, events), [projection, events]);
  /** Gdzie wpisać notatkę, której jeszcze nie ma — patrz `noteTargetUuid`. */
  const noteTarget = useMemo(() => noteTargetUuid(events), [events]);
  /**
   * Dopisanie notatki ma sens TYLKO przy jej braku: notatka sesji jest jedna, więc
   * przy istniejącej „dodanie" znaczyłoby nadpisanie. Reguła mieszka w logice, żeby
   * miała test — ten warunek już raz był w JSX i już raz był zły.
   */
  const canAddNote = editing && noteTarget != null && missingSessionNote(notes);

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
              {/* Plakietka trybu edycji (issue #43) — JEDYNY sposób, w jaki ekran mówi
                  „teraz piszesz". Amber, bo to stan odchylony od normalnego (odczytu),
                  a nie sukces. */}
              {editing && (
                <Tag
                  label="EDYCJA"
                  tone="amber"
                  size="md"
                  icon="edit"
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
        readOnly ? undefined : editing ? (
          /*
           * Pas edycji: dopisanie brakującego faktu i wyjście z trybu.
           *
           * „ZAKOŃCZ EDYCJĘ" nie jest zielonym przyciskiem pełnym, bo NICZEGO nie
           * zapisuje: każda korekta zapisuje się w chwili potwierdzenia arkusza
           * (append-only). Przycisk w kolorze akcji głównej obiecywałby zatwierdzenie,
           * którego nie ma.
           *
           * Pod pasem stało kiedyś zdanie tłumaczące to wprost („korekty zapisują się
           * od razu…") i zostało USUNIĘTE: opisywało wewnętrzną budowę rejestru komuś,
           * kto o nią nie pytał, i tłumaczyło brak przycisku, którego nikt nie szukał —
           * ta sama reguła, przez którą wyleciał przypis „odczytu nie da się unieważnić"
           * z arkuszy korekty.
           */
          <View style={{ paddingHorizontal: 14, paddingBottom: 14, flexDirection: 'row', gap: 8 }}>
            <ActionButton
              label="DODAJ WPIS"
              tone="neutral"
              variant="secondary"
              size="md"
              icon="add"
              onPress={edit.openAdd}
              style={{ flex: 1 }}
            />
            <ActionButton
              label="ZAKOŃCZ EDYCJĘ"
              tone="green"
              variant="secondary"
              size="md"
              icon="check"
              onPress={() => setEditingRequested(false)}
              style={{ flex: 1 }}
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            <ActionButton
              label="EDYTUJ DANE"
              tone="neutral"
              variant="secondary"
              size="md"
              icon="edit"
              onPress={() => setEditingRequested(true)}
            />
          </View>
        )
      }
    >
      <View style={{ padding: 14, gap: theme.spacing.md }}>
        {/* ── niespójności logu (issue #43) ────────────────────────────────
            Stoją NAD terminem korekty, bo wymagają czynności, a termin jest tylko
            informacją. Baner typu `warning`: znika sam, gdy log przestaje być
            sprzeczny — zamknięcie go niczego by nie naprawiło. */}
        {issues.length > 0 && (
          <Banner
            kind="warning"
            tone="amber"
            icon="warning"
            title={issuesTitle(issues.length)}
            text={issues.map((issue) => `• ${issue.message}`).join('\n')}
          />
        )}

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

          {/* W trybie ODCZYTU oś jest czysto opisowa (issue #40 pkt 1): korekta wychodzi
              jednymi drzwiami, przyciskiem „EDYTUJ DANE" pod ekranem. Ołówek przy każdym
              z kilkunastu wierszy dawał kilkanaście identycznych celów i zabierał miejsce
              jedynej liczbie, która w tej kolumnie coś znaczy — czasowi trwania.
              W trybie EDYCJI (issue #43) wiersz staje się przyciskiem i ołówek wraca —
              bo wtedy jest jedyną treścią tej kolumny. */}
          <SessionAxis
            rows={axisRows}
            foot={axis.foot}
            emptyText="Ta sesja nie ma jeszcze ani jednego zdarzenia."
            onCorrect={editing ? edit.openRow : undefined}
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
        {/*
          Ołówek stoi przy WIERSZU „Dual", tak samo jak na osi i przy notatce — nie
          w nagłówku karty. Nagłówkowa pigułka była wypełnionym, zielonym przyciskiem,
          czyli najmocniejszym elementem ekranu — a otwarcie korekty załogi nie jest
          tu akcją główną, tylko jednym z kilku ołówków. PIC pencila NIE MA i to jest
          precyzja, nie niedoróbka: jego zmiana to przelogowanie, nie korekta
          (`PIC_CHANGE_NOT_ALLOWED`).
        */}
        <Card title="Załoga" flush>
          <ResultRow
            label="PIC"
            value={crewLabel(projection.picId, currentPilotId, codeOf)}
            tone="neutral"
            style={styles.firstRow}
          />
          {editing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Popraw drugiego pilota"
              onPress={edit.openCrew}
              style={({ pressed }) => [
                styles.crewRow,
                { borderTopColor: theme.colors.border },
                pressed ? { backgroundColor: theme.colors.surfaceHover } : null,
              ]}
            >
              <AppText variant="mono" tone="muted" style={styles.crewLabel}>
                DUAL
              </AppText>
              <AppText variant="mono" tone="primary" style={styles.crewValue}>
                {projection.dualId != null
                  ? crewLabel(projection.dualId, currentPilotId, codeOf)
                  : 'brak — sesja jednoosobowa'}
              </AppText>
              <Icon name="edit" size={13} color={theme.colors.textMuted} />
            </Pressable>
          ) : (
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
          )}
        </Card>

        {/* ── notatki ───────────────────────────────────────────────────────
            Wszystko, co pilot NAPISAŁ o tej sesji: notatka z kroku „zadanie" (02e)
            i uwagi wpisów ręcznych (08, 15). Do issue #40 ten tekst nie wracał do
            autora nigdzie — widział go tylko administrator w panelu.
            Karta stoi na końcu, bo jest komentarzem do liczb wyżej.

            W trybie ODCZYTU istnieje tylko z treścią (issue #40: „Notatki —" byłoby
            wierszem o niczym). W trybie EDYCJI dochodzi drugie wejście — dopisanie
            notatki sesji, której jeszcze nie ma: bez niego affordancja gasłaby
            dokładnie w stanie, w którym jest potrzebna. */}
        {(notes.length > 0 || canAddNote) && (
          <Card title="Notatki" flush>
            {notes.map((note, index) => {
              const border =
                index > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null;
              const body = (
                <>
                  {/* Podpis TYLKO tam, gdzie coś rozróżnia — czyli przy uwagach wpisów
                      ręcznych. Notatka sesji jest jedna i nie ma jej od czego odróżnić;
                      stempel „Zadanie · 08:04" mówił o godzinie preflightu, nie o niej. */}
                  {note.when != null && (
                    <AppText variant="micro" tone="muted">
                      {note.when.toUpperCase()}
                    </AppText>
                  )}
                  {/* Body font, nie mono: to zdanie napisane przez człowieka, a nie odczyt. */}
                  <AppText variant="body" tone="secondary" style={styles.noteText}>
                    {note.text}
                  </AppText>
                </>
              );

              // W trybie edycji notatka jest celem dotknięcia (issue #43): to jedyna
              // dana sesji pisana ZDANIEM, więc literówkę widać w niej gołym okiem,
              // a do tej pory nie dało się jej poprawić w ogóle. Bez adresu (sesja
              // bez `preflight_confirm` w strumieniu) zostaje sam odczyt.
              if (!editing || note.targetUuid == null) {
                return (
                  <View key={note.id} style={[styles.note, border]}>
                    {body}
                  </View>
                );
              }

              return (
                <Pressable
                  key={note.id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    note.when == null ? 'Popraw notatkę sesji' : `Popraw notatkę: ${note.when}`
                  }
                  onPress={() => edit.openNote(note.targetUuid!, note.text)}
                  style={({ pressed }) => [
                    styles.note,
                    styles.noteEditable,
                    border,
                    pressed ? { backgroundColor: theme.colors.surfaceHover } : null,
                  ]}
                >
                  <View style={styles.noteBody}>{body}</View>
                  <Icon name="edit" size={13} color={theme.colors.textMuted} />
                </Pressable>
              );
            })}

            {/* Dopisanie notatki — plus, nie ołówek: ołówek obiecuje poprawianie
                istniejącej wartości, a tu jeszcze niczego nie ma (ta sama zasada, co
                w katalogu ikon).

                Wiersz istnieje WYŁĄCZNIE wtedy, gdy notatki sesji jeszcze nie ma.
                Jest ona jedna — jedno pole w payloadzie preflightu — więc obok
                istniejącej obiecywałby drugą, a naprawdę nadpisałby pierwszą. Gdy
                notatka jest, jedyną czynnością zostaje jej poprawienie (ołówek wyżej). */}
            {canAddNote && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dodaj notatkę do sesji"
                onPress={() => edit.openNote(noteTarget, '')}
                style={({ pressed }) => [
                  styles.note,
                  styles.noteEditable,
                  notes.length > 0
                    ? { borderTopWidth: 1, borderTopColor: theme.colors.border }
                    : null,
                  pressed ? { backgroundColor: theme.colors.surfaceHover } : null,
                ]}
              >
                <AppText variant="body" tone="muted" style={styles.noteAdd}>
                  Dodaj notatkę do sesji
                </AppText>
                <Icon name="add" size={13} color={theme.colors.textMuted} />
              </Pressable>
            )}
          </Card>
        )}
      </View>

      {/* Arkusze trybu edycji — korekta czasu, odczytu, zrzutu, dopisanie wpisu
          i historia zmian. Renderują się same, gdy `useSessionEdit` ma otwarty cel. */}
      {edit.sheets}
    </Screen>
  );
}

/** „2 niespójności w logu" — liczebnik idzie za polską odmianą, nie za angielską. */
function issuesTitle(count: number): string {
  const form = count === 1 ? 'niespójność' : count < 5 ? 'niespójności' : 'niespójności';
  return `${count} ${form} w logu`;
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
  /** W edycji wiersz jest przyciskiem: ołówek po prawej, treść w kolumnie obok. */
  noteEditable: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  crewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    borderTopWidth: 1,
  },
  crewLabel: { fontSize: 8, letterSpacing: 1.5 },
  crewValue: { flex: 1, fontSize: 11, textAlign: 'right' },
  noteBody: { flex: 1, gap: 4 },
  noteText: { fontSize: 12, lineHeight: 18 },
  noteAdd: { flex: 1, fontSize: 12 },
});
