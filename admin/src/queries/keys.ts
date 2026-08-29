/**
 * UZ Aero - panel: klucze zapytań TanStack Query, wszystkie w JEDNYM miejscu.
 *
 * Hierarchicznie, żeby unieważnianie prefiksem było jednolinijkowe
 * (`docs/architektura-panelu-frontend.md` §4.2): mutacja, która zmienia skład listy,
 * unieważnia `keys.<zasób>.all` i nie musi znać żadnego konkretnego filtra.
 *
 * Klucze dochodzą razem z ekranami, które ich używają - z jednym wyjątkiem,
 * opisanym niżej przy `sessions`/`exports`/`dashboard`.
 */

import type { AuditListQuery } from '../api/audit';
import type { ConsumptionQuery } from '../api/consumption';
import type { CorrectionDraftDto } from '../api/dto';
import type { EventListQuery } from '../api/events';
import type { ExportListQuery } from '../api/exports';
import type { FlagListQuery } from '../api/flags';
import type { FleetListQuery } from '../api/fleet';
import type { PilotListQuery } from '../api/pilots';
import type { SessionListQuery } from '../api/sessions';
import type { StatsQuery } from '../api/stats';

export const keys = {
  /** Tożsamość i zdolności zalogowanego (`GET /admin/api/me`). */
  me: ['me'] as const,

  flags: {
    all: ['flags'] as const,
    list: (query: FlagListQuery) => ['flags', 'list', query] as const,
    /** Sam licznik spraw danego statusu (`limit=1`; liczy się wyłącznie `total`). */
    count: (status: 'open' | 'resolved') => ['flags', 'count', status] as const,
  },

  /**
   * Dni lotne (`A02`, `A02a`).
   *
   * `list` NIE zawiera kursora i to jest istota tego klucza: kursor keyset opisuje
   * pozycję WEWNĄTRZ jednego wyniku filtra, więc jest parametrem strony (`pageParam`
   * zapytania nieskończonego), a nie częścią jego tożsamości. Wpisanie go do klucza
   * dałoby osobny wpis cache'u na każdą stronę i pierwszy powrót „wstecz" zaczynałby
   * listę od nowa.
   *
   * `count` odpowiada na INNE pytanie niż lista: kafle nad tabelą („dni z flagą",
   * „wyeksportowane") potrzebują liczby, którą policzył serwer całym filtrem, a nie
   * sumy z wierszy pobranej strony - ta kłamałaby przy każdym obcięciu `limit`-em.
   */
  sessions: {
    all: ['sessions'] as const,
    list: (query: SessionListQuery) => ['sessions', 'list', query] as const,
    count: (query: SessionListQuery) => ['sessions', 'count', query] as const,
    detail: (sessionUuid: string) => ['sessions', 'detail', sessionUuid] as const,
    /**
     * Ślad jednego lotu (`A02c`). Pod prefiksem `sessions`, bo to zasób TEJ sesji -
     * korekta czasu startu zmienia okno lotu, więc unieważnienie `sessions.all`
     * ma pociągnąć za sobą także mapę. Osobny prefiks rozerwałby ten związek.
     */
    track: (sessionUuid: string, flightIndex: number) =>
      ['sessions', 'track', sessionUuid, flightIndex] as const,
  },

  /**
   * Dziennik audytu (`A09`).
   *
   * Tak samo jak przy dniach: `list` NIE zawiera kursora (to parametr strony, nie
   * tożsamość pytania), a `count` odpowiada na inne pytanie niż lista - kafle nad
   * tabelą („wpisy dziś") potrzebują liczby policzonej przez serwer całym filtrem,
   * a nie sumy z pobranej strony.
   */
  audit: {
    all: ['audit'] as const,
    list: (query: AuditListQuery) => ['audit', 'list', query] as const,
    count: (query: AuditListQuery) => ['audit', 'count', query] as const,
  },

  /**
   * Rejestr zdarzeń (`A04`).
   *
   * Tak samo jak przy dniach i dzienniku: `list` NIE zawiera kursora - kursor keyset
   * opisuje pozycję WEWNĄTRZ jednego wyniku filtra, więc jest parametrem strony,
   * a nie częścią tożsamości pytania. Wpisanie go do klucza dałoby osobny wpis cache'u
   * na każdą stronę i pierwszy powrót „wstecz" zaczynałby rejestr od nowa.
   *
   * Bez `count`, inaczej niż przy dzienniku audytu: liczniki kafli jadą W TEJ SAMEJ
   * odpowiedzi co lista (`counts`), bo serwer liczy je jednym zapytaniem nad całym
   * zakresem filtra. Osobne zapytanie byłoby drugim żądaniem o liczbę, którą serwer
   * i tak właśnie przysłał.
   */
  events: {
    all: ['events'] as const,
    list: (query: EventListQuery) => ['events', 'list', query] as const,
  },

  /**
   * Konta pilotów (`A06`, `A06a`).
   *
   * Bez `count`, inaczej niż przy dniach i dzienniku: liczniki kafli jadą W TEJ SAMEJ
   * odpowiedzi co lista (`counts`), bo są liczone po CAŁYM klubie jednym zapytaniem,
   * a nie po zawężeniu. Osobne zapytanie o to samo byłoby drugim żądaniem o liczbę,
   * którą serwer i tak właśnie przysłał.
   *
   * `detail` nie ma, bo szuflada konta (`A06a`) nie pobiera niczego osobno: otwiera
   * wiersz, który już jest na liście. Konto spoza listy (wklejony link do konta
   * odfiltrowanego) rozpoznaje ekran i mówi o tym wprost, zamiast pytać serwer
   * o zasób, którego trasa `GET /pilots/:id` nie wystawia.
   */
  pilots: {
    all: ['pilots'] as const,
    list: (query: PilotListQuery) => ['pilots', 'list', query] as const,
  },

  /**
   * Flota (`A07`, `A07a`).
   *
   * `tolerance` jest kluczowana POJEMNOŚCIĄ, bo to jest całe pytanie: „jaki próg wyjdzie
   * dla 1100 L". Dzięki temu poprawianie liczby w formularzu tam i z powrotem wraca do
   * już policzonej odpowiedzi zamiast pytać serwer drugi raz o to samo - a mockup `A07a`
   * przewiduje właśnie takie poprawianie. Wpis żyje bez końca (`staleTime: Infinity`
   * w hooku), bo `max(10 L, 5%)` nie zmienia się między żądaniami.
   *
   * `detail` nie ma: szuflada samolotu otwiera wiersz, który już jest na liście - trasy
   * `GET /fleet/:id` serwer nie wystawia, bo flota ma kilka jednostek i pobranie
   * całości jest tańsze niż druga trasa. Ta sama decyzja, co przy kontach.
   */
  fleet: {
    /**
     * **Jedyny zasób bez `all` - i to jest treść, nie niekonsekwencja.**
     *
     * Pod prefiksem `['fleet']` żyją DWA pytania o różnej naturze: skład listy (starzeje
     * się przy każdym zapisie) i próg dla pojemności (funkcja czysta, `staleTime:
     * Infinity`). `invalidateQueries` dopasowuje PREFIKSOWO, więc `all` unieważniałoby
     * jedno razem z drugim - i tak było do 2026-08-01, mimo że `useFleetCommands`
     * deklarował w komentarzu, że progu NIE unieważnia. Koszt nie był teoretyczny:
     * szuflada zapisu jest w tej chwili otwarta, więc jej zapytanie o próg jest AKTYWNE
     * i unieważnienie kończyło się natychmiastowym żądaniem o liczbę, która nie może
     * się zmienić.
     *
     * Zamiast korzenia obejmującego wszystko mamy więc `lists` - prefiks dokładnie tego,
     * co po zapisie faktycznie jest nieaktualne. Korzeń, który obiecuje więcej, niż
     * którakolwiek mutacja chce unieważnić, jest pułapką, a nie wygodą.
     */
    lists: ['fleet', 'list'] as const,
    list: (query: FleetListQuery) => ['fleet', 'list', query] as const,
    tolerance: (capacityL: number) => ['fleet', 'tolerance', capacityL] as const,
  },

  /**
   * PODGLĄD korekty (`A02b`) - dry-run, więc zwykłe zapytanie z cache'em.
   *
   * Cały szkic (`targetUuid` + akcja + `newTime`) jest częścią klucza, bo jest częścią
   * PYTANIA: „co się stanie, jeśli przesunę to zdarzenie na 13:01:33" to inne pytanie
   * niż „…na 13:02:00". Dzięki temu przełączanie `retime` ↔ `void` w formularzu wraca
   * do już policzonej odpowiedzi zamiast pytać serwer drugi raz o to samo - a mockup
   * przewiduje właśnie takie przełączanie tam i z powrotem.
   */
  corrections: {
    all: ['corrections'] as const,
    preview: (sessionUuid: string, draft: CorrectionDraftDto) =>
      ['corrections', 'preview', sessionUuid, draft] as const,
  },

  /**
   * Monitor eksportu (`A05`).
   *
   * `all` jest tu KORZENIEM obejmującym wszystko i to jest właściwe, odwrotnie niż
   * przy flocie: pod tym prefiksem żyją wyłącznie pytania o STAN arkusza (lista,
   * historia rewizji, treść karty), a każde z nich starzeje się od tej samej rzeczy -
   * od wysyłki karty. Rozwiązanie flagi, korekta zdarzenia i ponowienie unieważniają
   * je razem, bo razem przestają być prawdziwe.
   *
   * `sheet` i `history` są kluczowane UUID-em sesji, nie nazwą karty: nazwę liczy
   * serwer, a panel nie ma prawa jej składać (druga konwencja nazw = link do karty,
   * której nie ma).
   */
  exports: {
    all: ['exports'] as const,
    list: (query: ExportListQuery) => ['exports', 'list', query] as const,
    history: (sessionUuid: string) => ['exports', 'history', sessionUuid] as const,
    sheet: (sessionUuid: string) => ['exports', 'sheet', sessionUuid] as const,
  },

  /**
   * Konserwacja (`A11`).
   *
   * `projections` to PORÓWNANIE różnic - zapytanie kosztowne (pełny skan rejestru),
   * więc ekran nie odpala go przy wejściu: uruchamia je człowiek przyciskiem, a klucz
   * służy do trzymania odpowiedzi między przełączeniami ekranu. Klucz nie ma parametrów,
   * bo pytanie nie ma parametrów: „czy projekcja zgadza się ze strumieniem" dotyczy
   * CAŁEJ bazy i innego zakresu nie ma.
   *
   * **Bez korzenia `all` - z tego samego powodu, co przy flocie i mocniejszego.**
   * Pod prefiksem `['maintenance']` żyją trzy pytania, których NIC nie starzeje razem:
   * porównanie projekcji (pełny skan rejestru, ~4 min), stan tabeli tokenów (jedno
   * `COUNT`) i stan schematu (zmienia go wyłącznie START SERWERA). Korzeń był tu
   * pułapką dosłownie: `invalidateQueries` dopasowuje PREFIKSOWO i refetchuje ZAPYTANIA
   * AKTYWNE niezależnie od `staleTime`, więc unieważnienie po nadpisaniu projekcji
   * odpalało drugi czterominutowy skan rejestru - a jego wynik i tak był wyrzucany,
   * bo ekran pokazuje wtedy raport z ZAPISU. Skan świadomie zdjęto z automatu
   * (`useMaintenance.ts`: „żeby nie zamienić ekranu diagnostycznego w generator
   * obciążenia"); wywołanie go ubocznie kasowało tę decyzję.
   *
   * Każda mutacja unieważnia więc dokładnie ten klucz, który zdezaktualizowała -
   * i ani jednego więcej (`useMaintenanceCommands.test.ts`).
   */
  maintenance: {
    projections: ['maintenance', 'projections'] as const,
    refreshTokens: ['maintenance', 'refresh-tokens'] as const,
    schema: ['maintenance', 'schema'] as const,
  },

  dashboard: ['dashboard'] as const,

  /**
   * Statystyki (`A10`). Klucz niesie CAŁY zakres dat, bo zakres jest tożsamością
   * pytania - „lipiec" i „ostatnie 30 dni" to dwa różne raporty i oba mają prawo żyć
   * w cache'u obok siebie (przełączanie presetów wraca wtedy do policzonej odpowiedzi).
   * Ujęcia (samolot / pilot / operacja) w kluczu NIE MA: to jeden raport, a przełącznik
   * tylko wybiera tabelę z tej samej odpowiedzi.
   */
  stats: {
    all: ['stats'] as const,
    report: (query: StatsQuery) => ['stats', 'report', query] as const,
  },

  /**
   * Analityka zużycia (`A10a`, `A10b`).
   *
   * Klucz niesie CAŁE pytanie: samolot i zakres. Przełączanie jednostki chipem wraca
   * wtedy do policzonej odpowiedzi zamiast pytać serwer drugi raz - a raport jest
   * kosztowny (czyta strumienie kilkudziesięciu sesji), więc jest to oszczędność
   * realna, nie kosmetyczna.
   *
   * Pod prefiksem `fleet` NIE stoi, choć dotyczy jednostki: `keys.fleet.lists`
   * unieważnia się przy każdym zapisie konfiguracji, a analityka nie zmienia się od
   * zmiany pojemności zbiorników - zmienia się od nowych DNI. Wspólny prefiks kazałby
   * jej przeliczać się bez powodu.
   */
  consumption: {
    all: ['consumption'] as const,
    report: (query: ConsumptionQuery) => ['consumption', 'report', query] as const,
  },
};
