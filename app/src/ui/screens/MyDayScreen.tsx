/**
 * UZ Aero — 01 MÓJ DZIEŃ (mockupy `design/01-moj-dzien.html` + `01a` + `01c`).
 *
 * EKRAN DOMOWY po issue #23: do pilota w danej dobie przypisana jest LISTA SESJI
 * i nic ponadto. Log dnia jest płaską osią czasu (kafelek = jedna sesja, rejestracja
 * jako informacja kafelka — bez grupowania po maszynie), a sumy to Blok i Loty.
 * Klamry służby (meldunek / koniec / „Zamknij dzień") NIE MA — została usunięta razem
 * z modelem: dnia się nie otwiera ani nie zamyka, zaczyna się pierwszą sesją.
 *
 * ══ CO ZMIENIŁ ISSUE #42 (2026-08-13) ══
 * Ekran przestał mieć własny sposób pokazywania sesji. Sesja jest KAFELKIEM `DayCard`
 * — tym samym komponentem, co na „Poprzednich dniach" (12) — zamiast wiersza tabeli
 * `.leg-row`, który niósł te same trzy wielkości w drugim układzie. Przyciski pod listą
 * są jednym komponentem `ActionButton` w jednym kroju: „Poprzednie dni" były do tej pory
 * własnym przyciskiem-linkiem pisanym Archivo, obok dwóch pisanych Bebas.
 * Kafelki NIE są niebieskie (`editable`), choć wszystkie dzisiejsze sesje są w oknie
 * korekty: na 12 błękit ODDZIELA sesje w oknie od zamkniętych, a kolor przy każdej
 * pozycji listy niczego nie oddziela — to ta sama reguła, dla której SyncChip online
 * nie rysuje nic (issue #12).
 *
 * Ekran NICZEGO NIE LICZY. Napisy i sumy przychodzą gotowe z `buildMyDay`
 * (`logic/myDay.ts`), a sama doba z `usePilotDay`.
 *
 * Wszystko jest projekcją LOKALNEGO strumienia, więc ekran działa w pełni offline —
 * to dane sesji z §6 pkt 1, bez wariantu „z cache". Jedynym śladem sieci jest SyncChip
 * w nagłówku: online **nie rysuje nic** (issue #12), offline to pill z arkuszem
 * szczegółów pod tapnięciem (issue #23 pkt 5) — stemple syncu nie wiszą już na ekranie.
 *
 * Sieć zasila natomiast sam REJESTR (§4.9, issue #32): telefon po czyszczeniu pamięci
 * albo reinstalacji odtwarza własne zdarzenia z serwera. Ekran nie dostaje od tego
 * ANI JEDNEGO nowego elementu — jedyny ślad jest negatywny i dotyczy stanu PUSTEGO
 * (`ready` niżej): „JESZCZE ŻADNEGO LOTU" pokazane pilotowi, który ma dziś trzy sesje,
 * byłoby kłamstwem wyglądającym jak utrata danych. Doba z sesjami rysuje się od razu.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { REFERENCE_META_CHECKED_AT } from '../../application';
import {
  ActionButton,
  AppText,
  Card,
  DayCard,
  GroupLabel,
  Icon,
  Screen,
  ScreenHeader,
  Skeleton,
  SkeletonRows,
  StatGrid,
  SyncChip,
  type StatCell,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { usePilotDay } from '../hooks/usePilotDay';
import { useSkeleton } from '../hooks/useSkeleton';
import { utcDayStart } from '../../domain';
import { dateUtcLong, plural } from '../format';
import { buildMyDay, myDayActions, totalLabel } from './logic/myDay';
import { editableBadge } from './logic/historyDays';

/**
 * Wysokość kafelka sesji w stanie ładowania — `DayCard` z pasem akcji, ta sama liczba,
 * co w historii (12). Kafelek jest w obu miejscach tym samym komponentem, więc i plamka
 * trzymająca po nim miejsce ma jeden rozmiar.
 */
const CARD_HEIGHT = 156;

/**
 * Tick raz na minutę. Sum „do teraz" już nie ma (klamra usunięta, issue #23), ale doba
 * UTC w nagłówku i klucz `utcDayStart` muszą przekręcić się o północy — ekran domowy
 * potrafi stać otwarty całą noc i bez ticka pokazywałby wczorajszy dzień do restartu.
 */
function useMinuteTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function MyDayScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string, params?: object) => void };
}) {
  const { theme } = useTheme();

  const repo = useSessionStore((s) => s.repo);
  const queries = useSessionStore((s) => s.queries);
  const loadSession = useSessionStore((s) => s.loadSession);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const streamRevision = useSessionStore((s) => s.streamRevision);
  const streamHydrated = useSessionStore((s) => s.streamHydrated);

  // Tożsamość: kod pilota z profilu logowania, a gdy go jeszcze nie ma — identyfikator
  // z bieżącej sesji. NIGDZIE nie pytamy o kod (`CLAUDE.md`, sekcja „Pilot i samolot").
  const pilotCode = useAuthStore((s) => s.pilot?.code);
  const pilotId = useCurrentPilot((s) => s.id);

  const now = useMinuteTicker();
  const day = utcDayStart(now);
  const pilotDay = usePilotDay(pilotId, day);

  const vm = pilotDay != null ? buildMyDay(pilotDay) : null;

  // Plakietka okna korekty na wejściu do historii (`.history-badge`) — okno 24 h ma być
  // widoczne, zanim pilot pomyśli o szukaniu go (ten sam wzorzec co na ekranie startowym).
  const [historyBadge, setHistoryBadge] = useState<string | null>(null);
  useEffect(() => {
    if (queries == null) return;
    let alive = true;
    void queries.historyDays().then((days) => {
      if (alive) setHistoryBadge(editableBadge(days, Date.now()));
    });
    return () => {
      alive = false;
    };
    // `streamRevision`: odtworzenie rejestru z serwera (§4.9) potrafi dopisać dzień
    // wciąż będący w oknie korekty — plakietka ma go wtedy zobaczyć bez wychodzenia.
  }, [queries, streamRevision]);

  // Stempel ostatniego potwierdzenia cache referencyjnego (§4.8) — od issue #23 nie
  // wisi na ekranie, tylko zasila wiersz w arkuszu szczegółów SyncChipa. Zależność od
  // `lastSyncAt` odświeża wartość, gdy pętla okazji właśnie zsynchronizowała.
  const [refCheckedAt, setRefCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    if (repo == null) return;
    let alive = true;
    void repo.getMeta(REFERENCE_META_CHECKED_AT).then((value) => {
      if (alive) setRefCheckedAt(value != null ? Number(value) : null);
    });
    return () => {
      alive = false;
    };
  }, [repo, lastSyncAt]);

  const empty = vm != null && vm.empty;
  /**
   * Czy dobie już wolno wierzyć. Doba z sesjami — zawsze; doba PUSTA dopiero po
   * pierwszym uzgodnieniu rejestru z serwerem (§4.9, issue #32), bo telefon zaraz po
   * czyszczeniu pamięci ma pusty rejestr, który za chwilę przestanie być pusty.
   * To ta sama zasada, dla której `usePilotDay` oddaje `null` do pierwszego odczytu
   * z bazy — i tak samo jak tam, offline nie każe czekać na nic: lokalny rejestr JEST
   * wtedy najlepszą dostępną prawdą, a odtworzenie wraca natychmiast bez zmian.
   */
  const ready = vm != null && (!empty || streamHydrated);
  /**
   * Dopóki dobie nie wolno wierzyć, miejsce trzymają plamki (issue #33). To NIE JEST
   * to samo, co stan pusty: „JESZCZE ŻADNEGO LOTU" mówi, że dziś nic nie było, a
   * skeleton — że jeszcze nie wiemy (wzorzec `design/LOADERY.html`, reguła 4).
   * Odczyt z SQLite mieści się zwykle pod progiem bramki, więc na co dzień pilot nie
   * zobaczy tu niczego poza gotowym logiem.
   */
  const skeleton = useSkeleton(!ready);

  const totals: StatCell[] =
    vm == null
      ? []
      : [
          {
            label: 'Blok',
            value: totalLabel(vm.totals.block),
            unit: vm.empty
              ? 'brak lotów'
              : `${vm.totals.aircraftCount} ${plural(vm.totals.aircraftCount, 'samolot', 'samoloty', 'samolotów')}`,
          },
          {
            label: 'Loty',
            value: totalLabel(vm.totals.flight),
            unit: `${vm.totals.takeoffs} st / ${vm.totals.landings} ldg`,
          },
        ];

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="MÓJ DZIEŃ"
          size="md"
          // Bez „UTC" w podtytule (uwaga użytkownika przy issue #23): znacznik strefy
          // niesie nagłówek karty „Log dnia · czasy UTC" — tam mówi coś o tabeli.
          subtitle={`${pilotCode ?? pilotId} · ${dateUtcLong(now)}`}
          onSettings={() => navigation.navigate('Settings')}
          right={
            // Licznika sesji w nagłówku nie ma (issue #23 pkt 6) — liczbę sesji widać
            // na liście. Pill offline jest jedynym śladem sieci; szczegóły pod tapnięciem.
            <SyncChip
              status={synced ? 'synced' : 'offline'}
              outboxCount={outboxCount}
              lastSyncAt={lastSyncAt}
              refCheckedAt={refCheckedAt}
            />
          }
        />
      }
    >
      <View style={styles.content}>
        {/* ── log dnia: płaska oś czasu sesji + sumy ─────────────────────────
            Etykieta grupy zamiast nagłówka karty (issue #42): kafelki są osobnymi
            kartami, więc lista nie mieszka już w jednym pojemniku. Znacznik strefy
            zszedł do kafelka („08:12 → 09:05 UTC"), gdzie stoi przy samej godzinie.
            Kafelek prowadzi do detali TEJ sesji (10) — zdanie samolotu już
            POTWIERDZIŁO dane, więc jest to oglądanie i korekta, nie zatwierdzanie. */}
        {ready && vm != null && (
          <>
            <GroupLabel text="Log dnia" />
            {vm.sessions.length === 0 ? (
              <Card flush>
                <EmptySessions />
              </Card>
            ) : (
              vm.sessions.map((session) => (
                <DayCard
                  key={session.sessionUuid}
                  title={session.title}
                  aircraft={session.aircraft}
                  times={session.times}
                  stats={session.stats}
                  // Ten sam napis i ta sama ikona, co na karcie w oknie korekty na 12
                  // — bo to ta sama akcja i to samo miejsce docelowe.
                  ctaLabel="OTWÓRZ I POPRAW"
                  ctaIcon="edit"
                  // Ekran 10 opisuje sesję ze store'u, więc najpierw ładujemy wskazany
                  // strumień — ta sama droga, którą chodzi historia (12).
                  onPress={() => {
                    void loadSession(session.sessionUuid).then(() =>
                      navigation.navigate('Stats'),
                    );
                  }}
                />
              ))
            )}
            {/* Sumy doby: jedyna wielkość, która NIE należy do pojedynczej sesji —
                stąd własna karta pod listą, a nie stopka któregoś z kafelków. */}
            <Card flush>
              <StatGrid cells={totals} columns={2} />
            </Card>
          </>
        )}

        {/* ── akcje: przejęcie (jedyna główna akcja pustego dnia) i wpis ręczny ──
            Cały blok czeka na wczytanie doby (`ready`), bo inaczej pierwsza klatka
            pokazywałaby wielki zielony przycisk pustego dnia pilotowi, który ma
            za sobą trzy sesje — a potem podmieniałaby go pod palcem. */}
        {/*
          Skład pasa akcji liczy `myDayActions` — patrz jego docblock. Krótko: OBA
          wejścia istnieją zawsze, zmienia się tylko waga „ROZPOCZNIJ LOT". Do
          2026-08-14 pusty dzień miał wyłącznie zielony przycisk, więc pilot bez ani
          jednej sesji nie miał jak wpisać lotu odbytego bez telefonu — a to dokładnie
          ta sytuacja, dla której wpis ręczny istnieje (§3.8).

          Plus, nie strzałki `takeover` (zgłoszenie z urządzenia przy issue #23):
          mockup 01 rysuje tu DOPISANIE kolejnej sesji, a `maximize-2` znaczy przejęcie
          CUDZEJ maszyny (04B).
        */}
        {ready &&
          myDayActions(empty).map((action) => (
            <ActionButton
              key={action.id}
              label={action.label}
              tone={action.primary ? 'green' : 'neutral'}
              variant={action.primary ? 'solid' : 'secondary'}
              size={action.primary ? undefined : 'md'}
              icon={action.id === 'manual' ? 'edit' : action.primary ? 'start' : 'add'}
              onPress={() =>
                navigation.navigate(action.id === 'manual' ? 'ManualFlight' : 'PreflightAircraft')
              }
            />
          ))}

        {/* Przypis należy do PUSTEGO dnia: tłumaczy, czym jest zielony przycisk komuś,
            kto jeszcze nic dziś nie zrobił. Przy dniu z sesjami byłby powtórzeniem
            wiedzy, którą pilot ma już z własnej listy. */}
        {ready && empty && (
          <AppText variant="mono" tone="muted" style={styles.btnNote}>
            Odczytasz paliwo i motogodziny, potwierdzisz zadanie —{'\n'}i lecisz. Loty zapiszą
            się same.
          </AppText>
        )}

        {/* Ta sama przestrzeń w stanie ładowania: karta logu i JEDEN blok akcji.
            Jeden, bo tyle wiadomo na pewno — pusty dzień dostanie zielone „ROZPOCZNIJ
            LOT" z przypisem, a dzień z sesjami dwa przyciski drugorzędne (wzorzec,
            reguła 2: skeleton obiecuje część wspólną, nie zgaduje wariantu). */}
        {!ready && skeleton && <MyDaySkeleton />}

        {/* ── okno korekty 24 h ma mieć drzwi (12) ───────────────────────────
            Trzeci przycisk tego samego komponentu i kroju, co dwa wyżej (issue #42):
            do 2026-08-13 było to wejście własnym „linkiem" pisanym Archivo, więc na
            jednym ekranie stały obok siebie trzy różne kroje przycisków. Plakietka
            niesie to, co przedtem świeciło przy linku — dzień wciąż do poprawienia. */}
        <ActionButton
          label="POPRZEDNIE DNI"
          tone="neutral"
          variant="secondary"
          size="md"
          icon="clock"
          badge={historyBadge}
          onPress={() => navigation.navigate('History')}
        />

        {/* Stopka „Dane referencyjne · sync" USUNIĘTA (issue #23 pkt 5) — stempel
            mieszka w arkuszu szczegółów SyncChipa. */}
      </View>
    </Screen>
  );
}

/**
 * `.empty-legs` — doba bez sesji mówi to wprost, zamiast udawać tabelę bez wierszy.
 * Napis obiecuje dokładnie to, co robi model: sesje pojawią się same.
 */
function EmptySessions() {
  const { theme } = useTheme();

  return (
    <View style={styles.emptyLegs}>
      <Icon name="aircraft" size={30} color={theme.colors.borderStrong} />
      <AppText variant="display" tone="secondary" style={styles.emptyTitle}>
        JESZCZE ŻADNEGO LOTU
      </AppText>
      <AppText variant="body" tone="muted" style={styles.emptyDesc}>
        Sesje pojawią się tu same, gdy przejmiesz samolot i uruchomisz silnik. Nic nie trzeba
        otwierać.
      </AppText>
    </View>
  );
}

/**
 * Stan ŁADOWANIA logu dnia (issue #33, `design/LOADERY.html`).
 *
 * Geometria jest przepisana z `DayCard` i `StatGrid` co do piksela — o to w tym wzorcu
 * chodzi: gdy doba dojdzie, plamki podmieniają się na kafelki, a nic nie przeskakuje
 * pod palcem trzymanym już nad kartą.
 *
 * DWIE plamki-kafelki, tak jak w historii (12), bo to ta sama lista tych samych kart.
 * Liczba mówi o KSZTAŁCIE listy, nie o jej długości — tej nikt jeszcze nie zna.
 * Etykieta grupy jest napisem stałym i NIE czeka (wzorzec, reguła 3: co znamy lokalnie,
 * rysujemy od razu).
 */
function MyDaySkeleton() {
  const { theme } = useTheme();

  return (
    <View accessible accessibilityLabel="Ładowanie" style={styles.skeletonBlock}>
      <GroupLabel text="Log dnia" />
      <SkeletonRows rows={2} height={CARD_HEIGHT} radius={theme.radius.btn} gap={12} />

      {/* Sumy doby w geometrii `StatGrid`: tło prześwieca przez 1-pikselowe odstępy. */}
      <Card flush>
        <View style={[styles.skeletonTotals, { backgroundColor: theme.colors.border }]}>
          {[0, 1].map((cell) => (
            <View
              key={cell}
              style={[styles.skeletonTotalCell, { backgroundColor: theme.colors.surface }]}
            >
              <Skeleton width={28} height={8} />
              <Skeleton width={62} height={24} />
              <Skeleton width={50} height={9} />
            </View>
          ))}
        </View>
      </Card>

      {/* Wysokość i zaokrąglenie `ActionButton size="md"` — mniejszego z dwóch
          wariantów, czyli części wspólnej pustego dnia i dnia z sesjami. */}
      <Skeleton height={48} radius={theme.radius.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },

  // ── stan ładowania ─────────────────────────────────────────────────────────
  // Odstęp taki sam jak `content.gap`: skeleton zajmuje miejsce listy ORAZ przycisku.
  skeletonBlock: { gap: 12 },
  skeletonTotals: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  skeletonTotalCell: { flexGrow: 1, flexBasis: '45%', gap: 3, paddingHorizontal: 12, paddingVertical: 10 },

  // ── stan pusty listy ───────────────────────────────────────────────────────
  emptyLegs: { alignItems: 'center', gap: 8, paddingVertical: 26, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 19, lineHeight: 22, letterSpacing: 1.5, textAlign: 'center' },
  emptyDesc: { fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 260 },

  // ── stopka ekranu ──────────────────────────────────────────────────────────
  // `.btn-note`: przypis pod przyciskiem, dosunięty do niego ujemnym marginesem.
  btnNote: { fontSize: 8.5, lineHeight: 13, letterSpacing: 0.5, textAlign: 'center', marginTop: -4 },
});
