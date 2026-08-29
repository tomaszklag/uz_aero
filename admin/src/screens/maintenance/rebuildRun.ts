/**
 * UZ Aero - panel: URUCHOMIENIE przebudowy - dwa kroki (moduł CZYSTY, Node).
 *
 * Mockup `A11` mówi wprost: „Nadpisanie odblokowuje się dopiero po świeżym porównaniu
 * i podaniu powodu". Ten plik jest tą regułą zapisaną wykonywalnie - i jest bramką dla
 * CZŁOWIEKA, nie zabezpieczeniem: serwer odmawia niezależnie (`reason_required`,
 * `nothing_to_rebuild`), a wyszarzenie przycisku ma wyłącznie oszczędzić żądanie
 * i powiedzieć, czego brakuje.
 *
 * ══ RAPORT Z PORÓWNANIA I RAPORT Z ZAPISU TO DWA RÓŻNE DOKUMENTY ══
 * Oba mają ten sam kształt (`RebuildReportDto`) i różnią się jednym polem - `mode`.
 * Do 2026-08-02 ekran tej różnicy nie widział, więc zaraz po UDANYM nadpisaniu baner
 * dalej wołał „to incydent, ustal przyczynę, dopiero potem nadpisuj", tabela pokazywała
 * różnice, które właśnie zniknęły, a przycisk wracał CZYNNY z etykietą „Nadpisz N
 * wierszy". Drugie kliknięcie nadpisywało zero wierszy i dopisywało DRUGI wpis do
 * dziennika audytu. Rozróżnienie `mode` jest tu więc treścią, a nie kosmetyką:
 * po zapisie ekran pokazuje SKUTEK, a nie diagnozę sprzed zapisu.
 *
 * ══ CZEGO TEN PLIK NIE ROBI ══
 * Nie ocenia, czy różnicę WOLNO nadpisać. Tego nie da się rozstrzygnąć maszynowo:
 * odpowiedź brzmi „tak, jeśli tłumaczy ją wydanie domeny" i wymaga zajrzenia do audytu
 * i dat wydań. Panel może wyłącznie postawić przed tym pytaniem - i stawia je banerem.
 */

import { dateUtcShort, plural, relativeAge, timeUtc } from '@uzaero/format';

import type { ApiErrorDto, RebuildReportDto } from '../../api/dto';
import type { BannerTone } from '../../ui/components/Banner';

/**
 * Raport wraz z chwilą, z której pochodzi.
 *
 * Stempel jest częścią raportu, a nie ozdobą obok: porównanie ma `staleTime: Infinity`
 * i wyłączone odświeżanie przy powrocie do okna, więc odpowiedź wisi na ekranie bez
 * terminu ważności. `useMaintenance.ts` obiecywał ten stempel od początku („żeby
 * »przelicz i porównaj« nie było mylone z »tak jest teraz«") i do 2026-08-02 nie było
 * go nigdzie.
 */
export interface CurrentReport {
  report: RebuildReportDto | undefined;
  /** Epoch ms; `null` = nie ma jeszcze żadnego raportu. */
  at: number | null;
}

/** Jedno źródło raportu razem z chwilą, w której stał się aktualny. */
export interface ReportSource {
  data: RebuildReportDto | undefined;
  /** `dataUpdatedAt` zapytania albo `submittedAt` mutacji - obie w epoch ms. */
  at: number;
}

/**
 * Który z dwóch raportów opisuje bazę TERAZ - porównanie czy zapis.
 *
 * ══ DLACZEGO NIE `zapis ?? porównanie` ══
 * Tak było i to jest wada, którą ta funkcja zamyka. Po nadpisaniu raport z zapisu
 * słusznie wygrywa (tamten opisuje bazę, której już nie ma), ale po KOLEJNYM porównaniu
 * wygrywał nadal - bo wynik mutacji żyje w hooku, dopóki go ktoś nie zresetuje. Ekran
 * pokazywałby wtedy skutek sprzed pięciu minut jako odpowiedź na pytanie zadane przed
 * chwilą, a bramka „Nadpisz" zostawałaby zamknięta mimo świeżego porównania.
 *
 * Rozstrzyga stempel, nie kolejność w wyrażeniu: świeższy dokument opisuje świat.
 */
export function currentReport(compare: ReportSource, write: ReportSource): CurrentReport {
  if (write.data == null) {
    return compare.data == null ? { report: undefined, at: null } : { report: compare.data, at: compare.at };
  }
  if (compare.data == null) return { report: write.data, at: write.at };
  return compare.at > write.at
    ? { report: compare.data, at: compare.at }
    : { report: write.data, at: write.at };
}

export interface RebuildVerdict {
  tone: BannerTone;
  title: string;
  body: string;
}

/**
 * Zdanie nad tabelą różnic. `null` = nie było jeszcze ani porównania, ani zapisu, więc
 * nie ma o czym mówić - ekran pokazuje wtedy zaproszenie, a nie werdykt o bazie,
 * której nie czytał.
 *
 * **Zero różnic jest wynikiem OCZEKIWANYM i dostaje ton zielony.** Narzędzie, które
 * przy każdym uruchomieniu melduje dryf, przestaje cokolwiek znaczyć - a narzędzie,
 * które przy braku dryfu wygląda na „nic nie znalazłem, spróbuj jeszcze", uczy klikania.
 */
export function rebuildVerdict(report: RebuildReportDto | undefined): RebuildVerdict | null {
  if (report == null) return null;
  if (report.mode === 'write') return writeVerdict(report);

  if (report.rowsDiffering === 0) {
    return {
      tone: 'ok',
      title: 'Projekcja zgadza się ze strumieniem.',
      body: `Przeliczono ${report.sessions} ${plural(report.sessions, 'sesję', 'sesje', 'sesji')} z rejestru zdarzeń i żaden wiersz nie różni się od przeliczenia. Nie ma czego nadpisywać - i to jest stan, w którym baza ma być.`,
    };
  }

  const rows = report.rowsDiffering;
  return {
    tone: 'warn',
    title:
      rows === 1
        ? 'Jeden wiersz różni się od przeliczenia - to incydent, nie zadanie do sprzątnięcia.'
        : `${rows} wiersze różnią się od przeliczenia - to incydent, nie zadanie do sprzątnięcia.`,
    body: 'Projekcja jest odświeżana w tej samej transakcji, w której serwer przyjmuje zdarzenia, więc w normalnej pracy różnicy być NIE MOŻE. Zapis wyrówna liczby i tym samym skasuje jedyny ślad po tym, co je rozjechało. Najpierw ustal przyczynę (zmiana reguły liczenia w wydaniu domeny? ręczny UPDATE? odtworzenie z kopii zrobionej w połowie strumienia?), dopiero potem nadpisuj.',
  };
}

/**
 * Werdykt po ZAPISIE - mówi, co się stało, a nie co jest do zbadania.
 *
 * Diagnoza („to incydent, ustal przyczynę") była już wypowiedziana przed zapisem i po
 * nim jest nieprawdziwa dwa razy naraz: wiersze się już nie różnią, a przyczyny i tak
 * nie da się ustalić z tego ekranu, bo zapis właśnie zatarł jedyny jej ślad.
 */
function writeVerdict(report: RebuildReportDto): RebuildVerdict {
  const written = `${report.written} ${plural(report.written, 'wiersz', 'wiersze', 'wierszy')}`;

  if (report.remaining === 0) {
    return {
      tone: 'ok',
      title: `Nadpisano ${written}.`,
      body: `Liczby pochodzą z chwili ZAPISU, nie z wcześniejszego porównania: serwer przeliczył różnice ponownie, pod blokadą, bo między podglądem a decyzją telefony dosyłają paczki. Ślad operacji (liczby i powód) jest w dzienniku audytu. Kolejne nadpisanie wymaga nowego porównania - ten raport opisuje bazę SPRZED zapisu i nie ma prawa otwierać bramki drugi raz.`,
    };
  }

  const left = `${report.remaining} ${plural(report.remaining, 'sesja', 'sesje', 'sesji')}`;
  return {
    tone: 'warn',
    title: `Nadpisano ${written} z ${report.rowsDiffering} rozjechanych - ${left} zostało.`,
    body: `Jeden przebieg nadpisuje ograniczoną liczbę sesji i to jest bezpiecznik, nie awaria: każda nadpisywana sesja jest na czas transakcji zamknięta dla przyjmowania zdarzeń z telefonów, a blokady advisory idą ze wspólnej puli całego klastra. Przebudowa jest DOKOŃCZONA po kolejnych uruchomieniach - przelicz i porównaj jeszcze raz, żeby zobaczyć, co zostało.`,
  };
}

export interface RunGate {
  disabled: boolean;
  /** Powód blokady - WIDOCZNY tekst przy przycisku, nigdy sam tooltip. */
  reason: string | null;
  label: string;
}

export interface WriteGateInput {
  /** Bieżący raport - z porównania albo z zapisu; `undefined` = nie było żadnego. */
  report: RebuildReportDto | undefined;
  /** Treść pola „Powód nadpisania". */
  reason: string;
  /** Czy konto ma zdolność `maintenance.run`. */
  mayWrite: boolean;
  /** Czy zapis właśnie trwa. */
  pending: boolean;
}

/**
 * Bramka przycisku „Nadpisz N wierszy" - pięć warunków, każdy z własnym zdaniem.
 *
 * Kolejność sprawdzeń jest treścią: brak uprawnień wygrywa ze wszystkim (nie ma sensu
 * mówić „najpierw porównaj" komuś, kto i tak nie zapisze), a brak porównania wyprzedza
 * brak powodu, bo bez porównania nie wiadomo nawet, czy jest co nadpisywać.
 *
 * ══ „ŚWIEŻE PORÓWNANIE" W POSTACI WYKONYWALNEJ ══
 * Reguła z mockupu brzmi „nadpisanie odblokowuje się dopiero po ŚWIEŻYM porównaniu",
 * ale do 2026-08-02 nie miała żadnej postaci w kodzie: bramka patrzyła wyłącznie na to,
 * czy jakikolwiek raport istnieje. Świeże znaczy tu **nowsze niż ostatni zapis**, więc
 * raport z zapisu (`mode: 'write'`) bramki NIE otwiera - opisuje bazę sprzed nadpisania
 * i drugie kliknięcie na jego podstawie nadpisałoby zero wierszy, dopisując przy okazji
 * drugi wpis do dziennika audytu. Który raport jest bieżący, rozstrzyga `currentReport`.
 *
 * Bramka dla MASZYNY stoi po stronie serwera i odmawia niezależnie (409
 * `nothing_to_rebuild`) - panel nie jest tu zabezpieczeniem i nie udaje nim być.
 */
export function writeGate(input: WriteGateInput): RunGate {
  const label = writeLabel(input.report);

  if (!input.mayWrite) {
    return {
      disabled: true,
      reason: 'Wymaga roli: administrator - nadpisanie dotyka liczb wszystkich dni klubu',
      label,
    };
  }
  if (input.pending) return { disabled: true, reason: null, label: 'Nadpisuję…' };
  if (input.report == null) {
    return { disabled: true, reason: 'najpierw przelicz i porównaj', label };
  }
  if (input.report.mode === 'write') {
    return {
      disabled: true,
      reason: 'ten raport pochodzi z zapisu - przelicz i porównaj, zanim nadpiszesz ponownie',
      label,
    };
  }
  if (input.report.rowsDiffering === 0) {
    return { disabled: true, reason: 'nie ma czego nadpisywać - projekcja się zgadza', label };
  }
  if (input.reason.trim().length === 0) {
    return { disabled: true, reason: 'podaj powód - trafia do dziennika audytu', label };
  }
  return { disabled: false, reason: null, label };
}

/**
 * Etykieta przycisku. Liczbę niesie WYŁĄCZNIE raport z porównania z niezerową różnicą -
 * bo tylko wtedy jest to obietnica „tyle wierszy ruszy po kliknięciu". Po zapisie
 * `rowsDiffering` opisuje przeszłość, więc „Nadpisz 2 wiersze" byłoby zaproszeniem do
 * operacji, która nadpisze zero.
 */
function writeLabel(report: RebuildReportDto | undefined): string {
  if (report == null || report.mode === 'write' || report.rowsDiffering === 0) {
    return 'Nadpisz projekcję';
  }
  const rows = report.rowsDiffering;
  return `Nadpisz ${rows} ${plural(rows, 'wiersz', 'wiersze', 'wierszy')}`;
}

/** Bramka przycisku „Przelicz i porównaj" - jedyny warunek to uprawnienie i zajętość. */
export function compareGate(mayRun: boolean, pending: boolean): RunGate {
  if (!mayRun) {
    return {
      disabled: true,
      reason: 'Wymaga roli: administrator - porównanie czyta cały rejestr zdarzeń',
      label: 'Przelicz i porównaj',
    };
  }
  return {
    disabled: pending,
    reason: null,
    label: pending ? 'Przeliczam…' : 'Przelicz i porównaj',
  };
}

export interface RunFact {
  label: string;
  value: string;
  unit?: string;
  tone?: 'green' | 'amber' | 'red';
}

/**
 * Liczby przebiegu - kolumna „Ostatnie porównanie bez zapisu" / „Ostatni przebieg
 * z zapisem" z mockupu.
 *
 * `undefined` daje kreski, nigdy zer: „0 wierszy różnych" przy braku odpowiedzi wygląda
 * jak dobra wiadomość, a jest brakiem wiadomości. To ta sama reguła, co na pulpicie.
 *
 * **Etykiety zależą od trybu**, bo po zapisie te same liczby znaczą co innego:
 * „Wierszy różnych: 2" po udanym nadpisaniu czytałoby się jako stan bazy TERAZ, a jest
 * stanem sprzed zapisu.
 *
 * Czego tu NIE MA: **czasu przebiegu** („3 min 41 s" w mockupie) i **daty ostatniej
 * przebudowy**. Jedno i drugie wymagałoby, żeby serwer zapamiętał przebieg - a jedynym
 * miejscem, w którym cokolwiek po nim zostaje, jest `admin_audit` (i wyłącznie dla
 * ZAPISU, bo porównanie świadomie nie zostawia wpisu). Ekran mówi to wprost i odsyła
 * do dziennika, zamiast pokazywać liczbę wziętą znikąd. Stempel `Raport z` opisuje za
 * to chwilę, w której odpowiedź DOTARŁA - i tę panel zna, bo sam ją odebrał.
 */
export function runFacts(current: CurrentReport, nowMs: number): RunFact[] {
  const report = current.report;
  const written = report?.mode === 'write';
  const show = (value: number | undefined): string => (value === undefined ? '-' : String(value));

  return [
    {
      label: written ? 'Raport z zapisu' : 'Raport z porównania',
      ...stamp(current.at, nowMs),
    },
    { label: 'Sesji w rejestrze', value: show(report?.sessions) },
    {
      label: written ? 'Wierszy rozjechanych' : 'Wierszy różnych',
      value: show(report?.rowsDiffering),
      unit: report == null ? undefined : `${report.fieldsDiffering} pól`,
      tone: report == null ? undefined : report.rowsDiffering === 0 ? 'green' : 'red',
    },
    {
      label: 'Wierszy nadpisanych',
      value: show(report?.written),
      tone: report != null && report.written > 0 ? 'amber' : undefined,
    },
    {
      label: written ? 'Zostało do nadpisania' : 'Poza raportem',
      value: show(report?.remaining),
      tone: report != null && report.remaining > 0 ? 'amber' : undefined,
    },
    {
      label: 'Rejestr events',
      value: 'tylko odczyt',
      tone: 'green',
    },
  ];
}

/**
 * Chwila, z której pochodzi raport - data, godzina UTC i WIEK.
 *
 * Wiek jest tu ważniejszy niż sama godzina: przy `staleTime: Infinity` i wyłączonym
 * odświeżaniu na fokusie raport potrafi wisieć na ekranie godzinami, a „14:22 UTC"
 * samo w sobie nie mówi, czy to było przed chwilą, czy przed obiadem.
 */
function stamp(at: number | null, nowMs: number): { value: string; unit?: string } {
  if (at == null) return { value: '-' };
  return { value: `${dateUtcShort(at)} ${timeUtc(at)}`, unit: `UTC · ${relativeAge(nowMs - at)} temu` };
}

export interface RebuildFailure {
  tone: BannerTone;
  title: string;
  body: string;
}

/**
 * Odmowa serwera → komunikat. `status` i `error` przychodzą z `HttpError`; rozpakowanie
 * wyjątku należy do ekranu, a nie do tego modułu (wzorzec `flagResolve.resolveFailure`).
 *
 * 409 `nothing_to_rebuild` jest tu najważniejszy i nie jest awarią: znaczy, że projekcja
 * zgadza się ze strumieniem, więc nie ma operacji do wykonania - i serwer świadomie nie
 * zostawia po takiej próbie wpisu w dzienniku. Nazwanie tego „błędem zapisu" kazałoby
 * szukać usterki tam, gdzie jej nie ma.
 */
export function rebuildFailure(status: number | null, body: ApiErrorDto | null): RebuildFailure {
  if (status === 409 || body?.error === 'nothing_to_rebuild') {
    return {
      tone: 'status',
      title: 'Nie ma czego nadpisywać - i dlatego nic się nie stało.',
      body: 'Serwer przeliczył projekcję pod blokadą i nie znalazł ani jednej różnicy. Zapis zera wierszy nie jest operacją, więc dziennik audytu NIE dostał wpisu: dokument odpowiadający na pytanie „kto co zmienił" nie może opisywać rzeczy, które się nie wydarzyły. Jeżeli widziałeś różnice przed chwilą, znaczy to, że wyrównało je poprzednie nadpisanie.',
    };
  }
  if (status === 400 || body?.error === 'reason_required') {
    return {
      tone: 'danger',
      title: 'Serwer odmówił nadpisania - brak uzasadnienia.',
      body: 'Pole „Powód nadpisania" jest wymagane po stronie serwera, a nie tylko w tym formularzu: żądanie bez powodu odbija się o trasę, bo powód jest jedyną rzeczą, która w dzienniku audytu tłumaczy, dlaczego liczby klubu zostały wyrównane.',
    };
  }
  if (status === 403) {
    return {
      tone: 'warn',
      title: 'Twoja rola nie obejmuje narzędzi serwisowych.',
      body: 'Nadpisanie projekcji wymaga zdolności maintenance.run - dotyka liczb wszystkich dni klubu naraz. Ekran zostaje widoczny, żebyś nie musiał zgadywać, czy funkcji nie ma w produkcie, czy nie ma jej Twoje konto.',
    };
  }
  return {
    tone: 'danger',
    title: 'Nadpisanie nie doszło do skutku.',
    body: 'Serwer nie przyjął żądania, a projekcja została nietknięta - skutek i ślad audytu idą jedną transakcją, więc przerwanie cofa oba naraz. Panel działa wyłącznie online: to jedyne miejsce w systemie, w którym brak sieci wolno pokazać jako blokadę.',
  };
}
