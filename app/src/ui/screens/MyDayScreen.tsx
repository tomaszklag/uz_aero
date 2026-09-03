/**
 * UZ Aero - 01 MÓJ DZIEŃ (mockupy `design/01-moj-dzien.html` + `01a` + `01c`).
 *
 * EKRAN DOMOWY po issue #23: do pilota w danej dobie przypisana jest LISTA SESJI
 * i nic ponadto. Log dnia jest płaską osią czasu (kafelek = jedna sesja, rejestracja
 * jako informacja kafelka - bez grupowania po maszynie), a sumy to Blok i Loty.
 * Klamry służby (meldunek / koniec / „Zamknij dzień") NIE MA - została usunięta razem
 * z modelem: dnia się nie otwiera ani nie zamyka, zaczyna się pierwszą sesją.
 *
 * ══ CO ZMIENIŁ ISSUE #42 (2026-08-13) ══
 * Ekran przestał mieć własny sposób pokazywania sesji. Sesja jest KAFELKIEM `DayCard`
 * - tym samym komponentem, co na „Poprzednich dniach" (12) - zamiast wiersza tabeli
 * `.leg-row`, który niósł te same trzy wielkości w drugim układzie. Przyciski pod listą
 * są jednym komponentem `ActionButton` w jednym kroju: „Poprzednie dni" były do tej pory
 * własnym przyciskiem-linkiem pisanym Archivo, obok dwóch pisanych Bebas.
 * Kafelki NIE są niebieskie (`editable`), choć wszystkie dzisiejsze sesje są w oknie
 * korekty: na 12 błękit ODDZIELA sesje w oknie od zamkniętych, a kolor przy każdej
 * pozycji listy niczego nie oddziela - to ta sama reguła, dla której SyncChip online
 * nie rysuje nic (issue #12).
 *
 * Ekran NICZEGO NIE LICZY. Napisy i sumy przychodzą gotowe z `buildMyDay`
 * (`logic/myDay.ts`), a sama doba z `usePilotDay`.
 *
 * Wszystko jest projekcją LOKALNEGO strumienia, więc ekran działa w pełni offline -
 * to dane sesji z §6 pkt 1, bez wariantu „z cache". Jedynym śladem sieci jest SyncChip
 * w nagłówku: online **nie rysuje nic** (issue #12), offline to pill z arkuszem
 * szczegółów pod tapnięciem (issue #23 pkt 5) - stemple syncu nie wiszą już na ekranie.
 *
 * Sieć zasila natomiast sam REJESTR (§4.9, issue #32): telefon po czyszczeniu pamięci
 * albo reinstalacji odtwarza własne zdarzenia z serwera. Ekran nie dostaje od tego
 * ANI JEDNEGO nowego elementu - jedyny ślad jest negatywny i dotyczy stanu PUSTEGO
 * (`ready` niżej): „DZIŚ BEZ LOTÓW" pokazane pilotowi, który ma dziś trzy sesje,
 * byłoby kłamstwem wyglądającym jak utrata danych. Doba z sesjami rysuje się od razu.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { REFERENCE_META_CHECKED_AT } from '../../application';
import {
  ActionButton,
  AppText,
  Banner,
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
  Tag,
  type StatCell,
} from '../components';
import { useAdminNotices } from '../hooks/useAdminNotices';
import { adminNoticeText } from './logic/adminNotices';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { usePilotDay } from '../hooks/usePilotDay';
import { useSkeleton } from '../hooks/useSkeleton';
import { utcDayStart } from '../../domain';
import { dateUtcLong, plural } from '../format';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useOperationSignatures } from '../hooks/useOperationSignatures';
import { buildMyDay, myDayActions, totalLabel } from './logic/myDay';
import { editableBadge } from './logic/historyDays';

/**
 * Wysokość kafelka sesji w stanie ładowania - `DayCard` z pasem akcji, ta sama liczba,
 * co w historii (12). Kafelek jest w obu miejscach tym samym komponentem, więc i plamka
 * trzymająca po nim miejsce ma jeden rozmiar.
 */
const CARD_HEIGHT = 156;

/**
 * Tick raz na minutę. Sum „do teraz" już nie ma (klamra usunięta, issue #23), ale doba
 * UTC w nagłówku i klucz `utcDayStart` muszą przekręcić się o północy - ekran domowy
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
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const streamRevision = useSessionStore((s) => s.streamRevision);
  const streamHydrated = useSessionStore((s) => s.streamHydrated);

  // Tożsamość: kod pilota z profilu logowania, a gdy go jeszcze nie ma - identyfikator
  // z bieżącej sesji. NIGDZIE nie pytamy o kod (`CLAUDE.md`, sekcja „Pilot i samolot").
  const pilotCode = useAuthStore((s) => s.pilot?.code);
  const pilotId = useCurrentPilot((s) => s.id);

  const now = useMinuteTicker();
  const day = utcDayStart(now);
  const pilotDay = usePilotDay(pilotId, day);

  /* Znak maszyny mieszka w cache referencyjnym, projekcja zna sam identyfikator -
     bez tego kafelek pokazywał UUID (zgłoszenie z urządzenia 2026-08-30). */
  const regOf = useAircraftRegistrations();
  const signatureOf = useOperationSignatures();
  const vm = pilotDay != null ? buildMyDay(pilotDay, regOf) : null;

  // Decyzje administratora o moich operacjach (issue #81) - z lokalnego rejestru,
  // z pamięcią potwierdzeń; komunikat mówi kto, kiedy, dlaczego i co z zapisami.
  const adminNotices = useAdminNotices();

  // Pas akcji nie zależy od doby (`myDayActions` bez argumentów od 2026-08-16), więc
  // liczy się raz i poza czekaniem na strumień. Kolejność tablicy jest kolejnością
  // na ekranie - miejsce przycisku zostaje decyzją modelu, nie układu JSX.
  const actions = myDayActions();

  // Plakietka okna korekty na wejściu do historii (`.history-badge`) - okno 24 h ma być
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
    // wciąż będący w oknie korekty - plakietka ma go wtedy zobaczyć bez wychodzenia.
  }, [queries, streamRevision]);

  // Stempel ostatniego potwierdzenia cache referencyjnego (§4.8) - od issue #23 nie
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
   * Czy dobie już wolno wierzyć. Doba z sesjami - zawsze; doba PUSTA dopiero po
   * pierwszym uzgodnieniu rejestru z serwerem (§4.9, issue #32), bo telefon zaraz po
   * czyszczeniu pamięci ma pusty rejestr, który za chwilę przestanie być pusty.
   * To ta sama zasada, dla której `usePilotDay` oddaje `null` do pierwszego odczytu
   * z bazy - i tak samo jak tam, offline nie każe czekać na nic: lokalny rejestr JEST
   * wtedy najlepszą dostępną prawdą, a odtworzenie wraca natychmiast bez zmian.
   */
  const ready = vm != null && (!empty || streamHydrated);
  /**
   * Dopóki dobie nie wolno wierzyć, miejsce trzymają plamki (issue #33). To NIE JEST
   * to samo, co stan pusty: „DZIŚ BEZ LOTÓW" mówi, że dziś nic nie było, a
   * skeleton - że jeszcze nie wiemy (wzorzec `design/LOADERY.html`, reguła 4).
   * Odczyt z SQLite mieści się zwykle pod progiem bramki, więc na co dzień pilot nie
   * zobaczy tu niczego poza gotowym logiem.
   */
  const skeleton = useSkeleton(!ready);

  /**
   * Sumy doby w tej samej trójce, co kafelek sesji: Loty · Blok · Lot (2026-08-16).
   *
   * Podpis „5 st / 5 ldg" ZNIKŁ (zgłoszenie z urządzenia): lot to start i lądowanie,
   * więc obie liczby są liczbą lotów powiedzianą jeszcze dwa razy - a stała nad nimi
   * etykieta „Loty" niosła przy tym CZAS w powietrzu, nie licznik. Czas lotu dostał
   * własną komórkę i własną nazwę, bo to inna wielkość niż blok: blok mierzy pracę
   * silnika (uruchomienie → wyłączenie), lot - powietrze (start → lądowanie).
   *
   * Liczba samolotów zostaje jako jedyny podpis, bo mówi coś, czego nie widać
   * w żadnej z trzech liczb: ile maszyn złożyło się na tę dobę. Przy pustej dobie
   * podpisu nie ma - „brak lotów" powtarzało tytuł karty stanu pustego tuż nad nim.
   */
  const totals: StatCell[] =
    vm == null
      ? []
      : [
          { label: 'Loty', value: totalLabel(vm.totals.flights) },
          {
            label: 'Blok',
            value: totalLabel(vm.totals.block),
            unit: vm.empty
              ? undefined
              : `${vm.totals.aircraftCount} ${plural(vm.totals.aircraftCount, 'samolot', 'samoloty', 'samolotów')}`,
          },
          { label: 'Lot', value: totalLabel(vm.totals.flight) },
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
          // niesie nagłówek karty „Log dnia · czasy UTC" - tam mówi coś o tabeli.
          subtitle={`${pilotCode ?? pilotId} · ${dateUtcLong(now)}`}
          onSettings={() => navigation.navigate('Settings')}
          right={
            // Licznika sesji w nagłówku nie ma (issue #23 pkt 6) - liczbę sesji widać
            // na liście. Pill offline jest jedynym śladem sieci; szczegóły pod tapnięciem.
            <SyncChip refCheckedAt={refCheckedAt} />
          }
        />
      }
    >
      <View style={styles.content}>
        {/* ── decyzje administratora o MOICH operacjach (issue #81) ────────────
            Zakończenie albo unieważnienie z panelu przyszło dosyłką: kokpit zszedł,
            zaległe zapisy zostały wstrzymane, a pilot ma się dowiedzieć DLACZEGO stoi
            na tym ekranie - zanim spojrzy na log. Baner typu `status` (to zdarzenie,
            nie pouczenie), ale z przyciskiem: pilot POTWIERDZA, że przeczytał, i baner
            nie wraca. Operacja unieważniona nie ma innego śladu na ekranie. */}
        {adminNotices.notices.map((notice) => {
          const text = adminNoticeText(notice, regOf, signatureOf);
          return (
            <Banner
              key={notice.sessionUuid}
              kind="status"
              tone="amber"
              icon="warning"
              title={text.title}
              text={text.text}
              action={{ label: 'ROZUMIEM', onPress: () => adminNotices.acknowledge(notice.sessionUuid) }}
            />
          );
        })}

        {/* ── log dnia: płaska oś czasu operacji + sumy ─────────────────────────
            Etykieta grupy zamiast nagłówka karty (issue #42): kafelki są osobnymi
            kartami, więc lista nie mieszka już w jednym pojemniku. Znacznik strefy
            zszedł do kafelka („08:12 → 09:05 UTC"), gdzie stoi przy samej godzinie.
            Kafelek prowadzi do detali TEJ operacji (10) - zdanie samolotu już
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
                  // „RĘCZNIE" przy tytule - fakt o pochodzeniu CAŁEJ sesji
                  // (decyzja 2026-08-16); wiersze osi znaczników nie dostają.
                  {...(session.manual ? { titleTag: 'RĘCZNIE' } : {})}
                  // Ten sam napis i ta sama ikona, co na karcie w oknie korekty na 12
                  // - bo to ta sama akcja i to samo miejsce docelowe.
                  ctaLabel="OTWÓRZ I POPRAW"
                  ctaIcon="edit"
                  // Ekran 10 opisuje sesję ze store'u, więc najpierw ładujemy wskazany
                  // strumień - ta sama droga, którą chodzi historia (12).
                  onPress={() => {
                    // `from: 'MyDay'`: operacja zakończona przez administratora otwiera
                    // się w PODGLĄDZIE (okno korekty zamknięte), a podgląd bez tego
                    // parametru wracałby do historii - kafelek stoi tutaj.
                    void loadSession(session.sessionUuid).then(() =>
                      navigation.navigate('Stats', { from: 'MyDay' }),
                    );
                  }}
                  // Plakietka stanu w stopce (issue #81) - fakt o CAŁEJ operacji, jak
                  // „RĘCZNIE" przy tytule; kafelek zostaje nieniebieski, bo poprawek
                  // w tej operacji już nie ma.
                  foot={
                    session.adminClosed ? (
                      <Tag label="Zakończył administrator" tone="amber" icon="warning" />
                    ) : undefined
                  }
                />
              ))
            )}
            {/* Sumy doby: jedyna wielkość, która NIE należy do pojedynczej operacji -
                stąd własna karta pod listą, a nie stopka któregoś z kafelków. */}
            <Card flush>
              <StatGrid cells={totals} columns={3} />
            </Card>
          </>
        )}

        {/* Ta sama przestrzeń w stanie ładowania - SAM log dnia z sumami. Przyciski
            plamki nie potrzebują: stoją już na ekranie, bo nie zależą od doby. */}
        {!ready && skeleton && <MyDaySkeleton />}

        {/* ── pas akcji: POD logiem dnia (uwaga z urządzenia, 2026-08-26) ─────
            Log jest właściwą treścią ekranu domowego, więc stoi pierwszy; akcje idą
            pod nim w kolejności z `myDayActions` - „ROZPOCZNIJ LOT" (droga codzienna,
            zielona i główna przez cały dzień) nad „DODAJ LOT RĘCZNIE" (droga
            awaryjna: lot bez telefonu, §3.8 - dostępna też przy pustym dniu).

            Blok NIE czeka na `ready`: o dobie nie mówi ani słowa, więc rysuje się
            w pierwszej klatce. Ikona wpisu to `edit`, nie strzałki `takeover`
            (zgłoszenie przy issue #23): mockup 01 rysuje tu DOPISANIE operacji,
            a `maximize-2` znaczy przejęcie CUDZEJ maszyny. */}
        {actions.map((action) => (
          <ActionButton
            key={action.id}
            label={action.label}
            tone={action.primary ? 'green' : 'neutral'}
            variant={action.primary ? 'solid' : 'secondary'}
            size={action.primary ? undefined : 'md'}
            icon={action.primary ? 'start' : 'edit'}
            onPress={() =>
              navigation.navigate(action.id === 'start' ? 'PreflightAircraft' : 'ManualFlight')
            }
          />
        ))}

        {/* ── okno korekty 24 h ma mieć drzwi (12) ───────────────────────────
            Trzeci przycisk tego samego komponentu i kroju, co dwa wyżej (issue #42):
            do 2026-08-13 było to wejście własnym „linkiem" pisanym Archivo, więc na
            jednym ekranie stały obok siebie trzy różne kroje przycisków. Plakietka
            niesie to, co przedtem świeciło przy linku - dzień wciąż do poprawienia. */}
        <ActionButton
          label="POPRZEDNIE DNI"
          tone="neutral"
          variant="secondary"
          size="md"
          icon="clock"
          badge={historyBadge}
          onPress={() => navigation.navigate('History')}
        />

        {/* Stopka „Dane referencyjne · sync" USUNIĘTA (issue #23 pkt 5) - stempel
            mieszka w arkuszu szczegółów SyncChipa. */}
      </View>
    </Screen>
  );
}

/**
 * `.empty-legs` - doba bez sesji mówi to wprost, zamiast udawać tabelę bez wierszy.
 *
 * TEKST ZAPOWIADA ZAWARTOŚĆ, NIE TŁUMACZY MECHANIKI (2026-08-16, po przeglądzie UX).
 * Poprzedni napis („Sesje pojawią się tu same, gdy przejmiesz samolot i uruchomisz
 * silnik. Nic nie trzeba otwierać.") zawinił na cztery sposoby naraz:
 *  · „przejmiesz" łamało słownik trzy centymetry od przycisku „ROZPOCZNIJ LOT" -
 *    przejmuje się maszynę INNEMU pilotowi (04B), a nie wolny samolot;
 *  · „Nic nie trzeba otwierać" zaprzeczało czynności, której w modelu NIE MA - żeby
 *    zdementować „otwieranie dnia", trzeba je najpierw czytelnikowi przypomnieć;
 *  · obietnica „zapisze się samo" stała też pod zielonym przyciskiem (przypis
 *    usunięty w całości 2026-08-26), więc pusty ekran niósł ją dwa razy;
 *  · tytuł mówił „LOTU", opis „Sesje" - dwie nazwy tej samej rzeczy w sąsiednich
 *    wierszach, choć karta jest listą SESJI.
 * Odtąd tytuł nazywa FAKT o dobie, a opis wylicza, co konkretnie stanie w tym miejscu
 * po pierwszym locie. Ani jedno, ani drugie nie powtarza przycisku obok.
 */
function EmptySessions() {
  const { theme } = useTheme();

  return (
    <View style={styles.emptyLegs}>
      <Icon name="aircraft" size={30} color={theme.colors.borderStrong} />
      <AppText variant="display" tone="secondary" style={styles.emptyTitle}>
        DZIŚ BEZ LOTÓW
      </AppText>
      <AppText variant="body" tone="muted" style={styles.emptyDesc}>
        Po pierwszym locie stanie tu karta operacji: czasy bloku, starty i lądowania, paliwo.
      </AppText>
    </View>
  );
}

/**
 * Stan ŁADOWANIA logu dnia (issue #33, `design/LOADERY.html`).
 *
 * Geometria jest przepisana z `DayCard` i `StatGrid` co do piksela - o to w tym wzorcu
 * chodzi: gdy doba dojdzie, plamki podmieniają się na kafelki, a nic nie przeskakuje
 * pod palcem trzymanym już nad kartą.
 *
 * JEDNA plamka-kafelek (issue #58 pkt 6). Doba ma dwa warianty - karta stanu pustego
 * albo lista kafelków sesji - a skeleton obiecuje ich CZĘŚĆ WSPÓLNĄ (reguła 2
 * wzorca): przynajmniej jedną kartę tej wysokości. Dwie plamki zgadywały wariant
 * z sesjami; najczęstszy start dnia (zero lotów) podmieniał je na JEDNĄ kartę
 * „DZIŚ BEZ LOTÓW" i pół ekranu skakało. Karta stanu pustego i kafelek sesji mają
 * tę samą wysokość (156 dp), więc jedna plamka pasuje do obu przyszłości.
 * Etykieta grupy jest napisem stałym i NIE czeka (reguła 3: co znamy lokalnie,
 * rysujemy od razu). Z tego samego powodu skeleton nie ma już plamki na przycisk:
 * od 2026-08-16 pas akcji nie zależy od doby, więc przyciski są NA EKRANIE, a nie
 * w drodze - plamka trzymałaby miejsce po czymś, co stoi obok niej.
 */
function MyDaySkeleton() {
  const { theme } = useTheme();

  return (
    <View accessible accessibilityLabel="Ładowanie" style={styles.skeletonBlock}>
      <GroupLabel text="Log dnia" />
      <SkeletonRows rows={1} height={CARD_HEIGHT} radius={theme.radius.btn} gap={12} />

      {/* Sumy doby w geometrii `StatGrid`: tło prześwieca przez 1-pikselowe odstępy.
          TRZY komórki, bo tyle ich jest od 2026-08-16 (Loty · Blok · Lot). */}
      <Card flush>
        <View style={[styles.skeletonTotals, { backgroundColor: theme.colors.border }]}>
          {[0, 1, 2].map((cell) => (
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
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },

  // ── stan ładowania ─────────────────────────────────────────────────────────
  // Odstęp taki sam jak `content.gap`: skeleton zajmuje miejsce listy ORAZ przycisku.
  skeletonBlock: { gap: 12 },
  skeletonTotals: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  // `flexBasis` jak w `StatGrid` dla trzech kolumn (30%) - plamki mają stać dokładnie
  // tam, gdzie za chwilę staną komórki sum.
  skeletonTotalCell: { flexGrow: 1, flexBasis: '30%', gap: 3, paddingHorizontal: 12, paddingVertical: 10 },

  // ── stan pusty listy ───────────────────────────────────────────────────────
  emptyLegs: { alignItems: 'center', gap: 8, paddingVertical: 26, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 19, lineHeight: 22, letterSpacing: 1.5, textAlign: 'center' },
  emptyDesc: { fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 260 },

});
