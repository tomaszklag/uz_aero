/**
 * UZ Aero - sesja → OŚ CZASU ekranu 10 (mockup `design/10-statystyki.html`).
 *
 * ══ CO ZASTĄPIŁA (issue #38 pkt 7 i 8) ══
 * Tabelę lotów: pięć kolumn, z których dwie mówiły to samo (para godzin obok czasu lotu),
 * jedna świeciła plakietką „AUTO" w każdym wierszu, a wszystkie razem milczały o tym,
 * o co pilot pytał - kiedy silnik ruszył i kiedy stanął. Oś czasu odpowiada wprost:
 * przejęcie → uruchomienie → starty, zrzuty i lądowania → wyłączenie → zdanie.
 *
 * ══ CO ZMIENIŁ ISSUE #40 ══
 *  • **kołowanie wchodzi na oś** (pkt 4). `taxi` było jedyną dziurą tego zestawienia:
 *    log kokpitu (04, 05) pokazuje je od zawsze, a rozliczenie tej samej sesji już nie.
 *    Wiersz niesie samą GODZINĘ - czas trwania kołowania zostaje w kokpicie, gdzie
 *    pilot patrzy na zegar w trakcie przygotowania; w rozliczeniu jest ciekawostką,
 *    bo do bloku i tak wchodzi cały bieg silnika.
 *  • **znika kolumna ołówka** (pkt 1). Korekta ma odtąd jedne drzwi: „EDYTUJ DANE" pod
 *    ekranem, czyli listę ręczną (08), gdzie poprawianie jest zadaniem ekranu, a nie
 *    ozdobą podsumowania. Dwanaście identycznych celów w jednej kolumnie czytało się
 *    jak szum i odbierało miejsce jedynej liczbie, która w tej kolumnie coś znaczy.
 *  • **znika plakietka „RĘCZNIE"** (pkt 6). Sposób POWSTANIA zapisu nie jest pytaniem
 *    pilota - metoda zostaje w rejestrze i w panelu administratora. To ta sama reguła,
 *    którą issue #38 wygasił plakietkę „AUTO", tylko dociągnięta do końca.
 *
 * ══ CO ZMIENIŁ ISSUE #44 ══
 * Ten builder obsługuje odtąd TAKŻE log kokpitu (04, 05) - przez `buildCockpitAxis`
 * z `cockpitLog.ts`, który dokłada do jego wyniku wiersz „na żywo" i znaczniki outboxa.
 * Kokpit miał wcześniej własny builder i własny komponent, więc ta sama sesja miała dwa
 * słowniki („Start engine" kontra „Uruchomienie"), dwa zestawy kolorów i dwa miejsca na
 * te same liczby. Przy okazji weszły tu ZDARZENIA NAZIEMNE (tankowanie, załadunek,
 * zmiana załogi): kokpit pokazywał je od zawsze, a rozliczenie nie - mimo że rachunek
 * paliwa odwołuje się do tankowań, a arkusz 10H pozwala je dopisać.
 *
 * ══ DLACZEGO ZE STRUMIENIA, A NIE Z SAMEJ PROJEKCJI ══
 * Bo projekcja nie zna wszystkich punktów osi: niesie loty (`Flight`), ale uruchomienia
 * silnika, kołowania ani zrzutu nie opisuje. Te bierzemy ze strumienia EFEKTYWNEGO
 * (po korektach 04c), czyli dokładnie tego, który projekcja policzyła - inaczej oś
 * pokazywałaby czasy sprzed poprawki obok czasów po niej.
 *
 * Kolejność ustala CZAS, nie typ zdarzenia: sesja z wpisem ręcznym potrafi mieć lądowanie
 * zapisane po zatrzymaniu silnika, a oś ma pokazać, jak było, nie jak być powinno.
 * Remisy rozstrzyga ranga (`RANK`) - przy zdarzeniach co do sekundy równych jedyny
 * sensowny porządek jest przyczynowy: nie ma startu przed uruchomieniem silnika.
 */

import { applyCorrections, correctionHistory } from '../../../domain';
import type { Event, EventOf, MhFormat, SessionState } from '../../../domain';
import { hhmm, landingsCount, litres, motoHours, oilLitres, thousands, timeUtc } from '../../format';

/**
 * Rodzaj punktu na osi - steruje kolorem kropki i tonem napisu.
 *
 * Zdarzenia naziemne weszły tu przy issue #44, razem z logiem kokpitu. Do tej pory
 * oś ich nie znała i był to BŁĄD, a nie decyzja: rachunek paliwa na tym samym ekranie
 * mówił „dolane · 2 tankowania", a oś nie pokazywała ani jednego - mimo że arkusz
 * dopisania (10H) pozwala tankowanie i załadunek dodać. Wpis dopisany ręcznie znikał
 * więc bez śladu.
 */
export type AxisKind =
  | 'claim'
  | 'engineStart'
  | 'taxi'
  | 'takeoff'
  | 'drop'
  | 'landing'
  | 'engineStop'
  | 'release'
  | 'refuel'
  | 'oilAdd'
  | 'boarding'
  | 'crew'
  /** Stan TRWAJĄCY - dokłada go kokpit (`cockpitLog.ts`), nie ten builder. */
  | 'live';

/** Jeden wiersz osi. */
export interface AxisRow {
  /** Klucz listy - uuid zdarzenia tam, gdzie takie jest. */
  id: string;
  kind: AxisKind;
  /** Stempel do sortowania. Po napisie „08:20" sortować się NIE DA: sesja spod północy
   *  ustawiłaby się od końca, a i tak trzeba by rozstrzygać remisy. */
  at: number;
  /** „08:20" - czas UTC, jak cała reszta aplikacji. */
  time: string;
  /** „Start", „Lądowanie", „Zrzut 2". */
  name: string;
  /** Druga linia: „4 skoczków · 12 800 ft", „odczyt 150 L · 1 234:30". */
  sub: string | null;
  /**
   * Numer lotu przy STARCIE („lot 1") - po prawej, nie pod nazwą i nie przy lądowaniu.
   *
   * Jest przypisem do zdarzenia, a nie jego opisem: mówi, który lot się tu zaczyna.
   * Pod nazwą kosztował drugą linię w połowie wierszy osi - czyli całą wysokość, którą
   * sesja skokowa zamienia w przewijanie. Przy lądowaniu go nie ma, bo prawą kolumnę
   * zajmuje tam czas lotu, a para start → lądowanie i tak czyta się w pionie.
   */
  flight: string | null;
  /** Czas lotu przy lądowaniu („00:41"); `null` wszędzie indziej. */
  duration: string | null;
  /**
   * UUID zdarzenia, które ten wiersz opisuje - ADRES KOREKTY (issue #43).
   *
   * Nie zawsze równy `id`: końce osi mają identyfikatory własne (`claim`, `release`),
   * bo pochodzą z PROJEKCJI, a nie z pojedynczego zdarzenia. Poprawia się w nich odczyty,
   * czyli payload `preflight_confirm` i `day_close` - i to ich uuid tu stoi.
   * `null` = wiersza nie da się poprawić (nie ma czego adresować).
   */
  targetUuid: string | null;
  /** Czy zdarzenie było już poprawiane - plakietka „popr." (widoczna też w odczycie). */
  corrected: boolean;
  /**
   * Wiersz ma wykrytą niespójność (issue #43). Dokłada go `withIssues` z `sessionEdit.ts`,
   * a nie ten builder: niespójności liczy domena na całej sesji i są wiedzą O SESJI,
   * nie cechą pojedynczego zdarzenia.
   */
  warned?: boolean;
  /** Zdarzenie czeka w outboxie - znacznik ↑ (dokłada kokpit, patrz `cockpitLog.ts`). */
  pending?: boolean;
}

/** Kafelek stopki osi. */
export interface AxisFootItem {
  /**
   * Co to za wielkość - po tym, a nie po napisie, wybiera się kafelki na inny ekran
   * (kokpit pomija `route`, bo trasa stoi w jego pasku górnym). Filtr po `key` łamałby
   * się przy pierwszej zmianie napisu, a ten napis raz brzmi „Trasa", a raz „Lotnisko".
   */
  id: 'block' | 'flightTime' | 'takeoffs' | 'route' | 'held';
  key: string;
  value: string;
  /** Wyróżnienie zielenią - jeden kafelek na stopkę, żeby akcent coś znaczył. */
  accent: boolean;
}

/** Oś razem ze stopką - wszystko, co rysuje karta „Przebieg sesji". */
export interface SessionAxis {
  rows: AxisRow[];
  foot: AxisFootItem[];
}

/**
 * Godzina wiersza, którą pilot NAPRAWDĘ podał (zgłoszenie z urządzenia, 2026-08-30:
 * „jak jest lot ręczny, to czas «zdanie», «przejęcie» i «tankowanie» nie są poprawne -
 * może nie ma sensu wyświetlać godzin dla tych zdarzeń?").
 *
 * We wpisie ręcznym pilot deklaruje BIEG SILNIKA i godziny lotów. Przejęcie i zdanie
 * siadają na końcach biegu (patrz komenda `manualFlight`), a minuta tankowania jest
 * czystą konwencją - zdarzenie składa się minutę przed uruchomieniem, bo w obu
 * dozwolonych oknach silnik stoi i minuta nie waży NIGDZIE (issue #62, siódma tura).
 *
 * Pokazane obok siebie te trzy godziny udawały pomiar: „11:59" przy tankowaniu wygląda
 * jak zapamiętana chwila, a przejęcie i zdanie powtarzały liczbę stojącą dwa wiersze
 * dalej. Rejestr ma mówić prawdę o swojej dokładności, więc w sesji wpisanej ręcznie
 * te wiersze nie mają godziny - a sesja z detekcji GPS pokazuje wszystkie, bo tam
 * KAŻDA jest zmierzona.
 */
function declaredTime(at: number, manualEntry: boolean, derived: boolean): string {
  return manualEntry && derived ? '' : timeUtc(at);
}

/** Najpóźniejsza chwila zbudowanych już wierszy; 0 dla osi pustej. */
function lastEventAt(rows: readonly { at: number }[]): number {
  return rows.reduce((max, row) => (row.at > max ? row.at : max), 0);
}

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

/**
 * Zdarzenia, które ktoś poprawiał - po nich oś stawia plakietkę „popr." (issue #43).
 *
 * Pytamy `correctionHistory`, a nie samych payloadów korekt, bo liczy się to, co
 * FAKTYCZNIE zmieniło dane: korekta nieczytelna (obcy kształt payloadu w bazie) nie
 * zmienia niczego, więc plakietka przy niej kłamałaby o stanie zapisu.
 */
function correctedUuids(events: readonly Event[]): Set<string> {
  const out = new Set<string>();
  for (const event of events) {
    if (event.type !== 'event_correction') continue;
    const target = (event.payload as { targetUuid?: unknown })?.targetUuid;
    if (typeof target !== 'string' || out.has(target)) continue;
    if (correctionHistory(events, target).length > 0) out.add(target);
  }
  return out;
}

/**
 * Porządek przyczynowy przy identycznych stemplach czasu. Nie jest to kosmetyka:
 * `engine_start` i pierwszy `takeoff` wpisane ręcznie na tę samą minutę ustawiłyby się
 * losowo, a oś czytana z góry na dół sugerowałaby start przed uruchomieniem silnika.
 */
const RANK: Record<AxisKind, number> = {
  claim: 0,
  // Tankowanie i załadunek dzieją się PRZY ZATRZYMANYM śmigle, więc przy równym stemplu
  // stoją przed uruchomieniem i po wyłączeniu - inaczej „Tankowanie" wpadałoby w środek
  // biegu silnika tylko dlatego, że zegar pokazał tę samą minutę.
  refuel: 0.5,
  // Dolewka oleju dzieje się w tej samej pauzie, co tankowanie - przy równym stemplu
  // stoi tuż za nim, przed załadunkiem (issue #60).
  oilAdd: 0.55,
  boarding: 0.6,
  crew: 0.7,
  engineStart: 1,
  taxi: 2,
  takeoff: 3,
  drop: 4,
  landing: 5,
  engineStop: 6,
  release: 7,
  // Stan trwający jest zawsze na końcu - dokłada go kokpit już po posortowaniu.
  live: 8,
};

/**
 * Buduje oś sesji.
 *
 * @param projection stan sesji (odczyty, loty, sumy).
 * @param events surowy strumień sesji - korekty nakładamy tutaj.
 * @param now do policzenia „trzymany", gdy sesja jeszcze nie została zdana.
 */
export function buildSessionAxis(
  projection: SessionState,
  events: Event[],
  now: number,
): SessionAxis {
  const effective = applyCorrections(events);
  const mhFormat: MhFormat = projection.mhFormat ?? 'decimal';
  const corrected = correctedUuids(events);
  const uuidOf = (type: Event['type']): string | null =>
    events.find((e) => e.type === type)?.uuid ?? null;

  const rows: AxisRow[] = [];

  if (projection.claimedAt != null) {
    // Adresem korekty przejęcia jest `preflight_confirm` - to ON niesie odczyt startowy.
    // Samego `session_claim` poprawić się nie da (jest tożsamością sesji), a i nie ma
    // w nim czego zmieniać: mode przejęcia nie jest liczbą do sprostowania.
    const target = uuidOf('preflight_confirm');
    rows.push({
      id: 'claim',
      kind: 'claim',
      at: projection.claimedAt,
      time: declaredTime(projection.claimedAt, projection.manualEntry, true),
      name: 'Przejęcie',
      sub: claimReadingLine(projection, mhFormat),
      flight: null,
      duration: null,
      targetUuid: target,
      corrected: target != null && corrected.has(target),
    });
  }

  for (const event of effective) {
    if (event.type === 'engine_start' || event.type === 'engine_stop') {
      rows.push({
        id: event.uuid,
        kind: event.type === 'engine_start' ? 'engineStart' : 'engineStop',
        at: at(event),
        time: timeUtc(at(event)),
        name: event.type === 'engine_start' ? 'Uruchomienie' : 'Wyłączenie',
        sub: null,
        flight: null,
        duration: null,
        targetUuid: event.uuid,
        corrected: corrected.has(event.uuid),
      });
    }

    if (event.type === 'taxi') {
      rows.push({
        id: event.uuid,
        kind: 'taxi',
        at: at(event),
        time: timeUtc(at(event)),
        name: 'Kołowanie',
        sub: null,
        flight: null,
        // Bez czasu trwania: godzina rozpoczęcia mówi wszystko, co z kołowania wynika
        // dla rozliczenia sesji, a „ile trwało" jest ciekawostką, nie daną - do bloku
        // wchodzi i tak cały bieg silnika. W kokpicie (04, 05) czas zostaje, bo tam
        // pilot patrzy na zegar w trakcie przygotowania.
        duration: null,
        targetUuid: event.uuid,
        corrected: corrected.has(event.uuid),
      });
    }

    if (event.type === 'drop') {
      const drop = event as EventOf<'drop'>;
      rows.push({
        id: drop.uuid,
        kind: 'drop',
        at: at(drop),
        time: timeUtc(at(drop)),
        name: `Zrzut ${drop.payload.dropNumber}`,
        sub: dropLine(drop.payload.jumpers, drop.payload.altitudeFt),
        flight: null,
        duration: null,
        targetUuid: drop.uuid,
        corrected: corrected.has(drop.uuid),
      });
    }

    // ── ZDARZENIA NAZIEMNE (issue #44) ────────────────────────────────────────
    // Dzieją się MIĘDZY pracą silnika, ale w tym samym czasie co reszta, więc wchodzą
    // na tę samą oś. Do issue #44 log kokpitu rysował je pełnoszerokim pasem amber,
    // a oś rozliczenia nie rysowała ich wcale.
    if (event.type === 'refuel') {
      const refuel = event as EventOf<'refuel'>;
      rows.push({
        id: refuel.uuid,
        kind: 'refuel',
        at: at(refuel),
        time: declaredTime(at(refuel), projection.manualEntry, true),
        name: 'Tankowanie',
        // Dolewka i stan PO niej: pierwsza liczba mówi, ile poszło z dystrybutora,
        // druga - z czym samolot został. Stanu przed nie ma, bo to poprzedni odczyt,
        // który stoi wyżej na tej samej osi.
        sub: `+${Math.round(refuel.payload.addedL)} L → ${litres(refuel.payload.afterL)}`,
        flight: null,
        duration: null,
        targetUuid: refuel.uuid,
        corrected: corrected.has(refuel.uuid),
      });
    }

    if (event.type === 'oil_add') {
      const oilAdd = event as EventOf<'oil_add'>;
      rows.push({
        id: oilAdd.uuid,
        kind: 'oilAdd',
        at: at(oilAdd),
        time: timeUtc(at(oilAdd)),
        name: 'Dolewka oleju',
        // Sama ilość: stanu po dolewce zwykle nie ma jak zmierzyć (silnik gorący),
        // a pomiar z przejęcia stoi wyżej na tej samej osi (issue #60).
        sub: `+${oilLitres(oilAdd.payload.addedL)}`,
        flight: null,
        duration: null,
        targetUuid: oilAdd.uuid,
        corrected: corrected.has(oilAdd.uuid),
      });
    }

    if (event.type === 'boarding') {
      const boarding = event as EventOf<'boarding'>;
      rows.push({
        id: boarding.uuid,
        kind: 'boarding',
        at: at(boarding),
        time: timeUtc(at(boarding)),
        name: 'Załadunek',
        // Skład jest od issue #21 opcjonalny - bez deklaracji zostaje sam fakt.
        sub: jumpersLine(boarding.payload.jumpers),
        flight: null,
        duration: null,
        targetUuid: boarding.uuid,
        corrected: corrected.has(boarding.uuid),
      });
    }

    if (event.type === 'crew_change') {
      const crew = event as EventOf<'crew_change'>;
      rows.push({
        id: crew.uuid,
        kind: 'crew',
        at: at(crew),
        time: timeUtc(at(crew)),
        name: 'Zmiana załogi',
        sub: crewLine(crew.payload),
        flight: null,
        duration: null,
        targetUuid: crew.uuid,
        corrected: corrected.has(crew.uuid),
      });
    }
  }

  for (const flight of projection.flights) {
    rows.push({
      id: flight.takeoffUuid,
      kind: 'takeoff',
      at: flight.takeoffAt,
      time: timeUtc(flight.takeoffAt),
      name: 'Start',
      sub: null,
      flight: `lot ${flight.index}`,
      duration: null,
      targetUuid: flight.takeoffUuid,
      corrected: corrected.has(flight.takeoffUuid),
    });

    // Lot w powietrzu nie ma wiersza lądowania - i to jest informacja, nie brak danych.
    // Ukrycie go schowałoby przed pilotem dokładnie ten lot, który wymaga korekty.
    if (flight.landingAt != null && flight.landingUuid != null) {
      rows.push({
        id: flight.landingUuid,
        kind: 'landing',
        at: flight.landingAt,
        time: timeUtc(flight.landingAt),
        /* KRĘGI PRZY LĄDOWANIU (uwaga z urządzenia, 2026-08-29): lot z touch and go
           ma jedną kopertę czasu i kilka przyziemień, a oś jest jedynym miejscem
           w rozliczeniu, gdzie ta liczba może stanąć przy swoim locie. Bez tego
           stopka mówiłaby „5 lądowań" nad osią z jednym wierszem lądowania i pilot
           nie miałby jak sprawdzić, do którego lotu należą. */
        name:
          (flight.touchAndGo ?? 0) > 0
            ? `Lądowanie · ${landingsCount(flight.touchAndGo! + 1)}`
            : 'Lądowanie',
        sub: null,
        // Numer lotu pada RAZ, przy starcie: para start → lądowanie czyta się w pionie,
        // a przy lądowaniu prawą kolumnę zajmuje czas lotu - czyli liczba, po którą
        // pilot tu sięga. Powtórzony numer walczyłby z nią o to samo miejsce.
        flight: null,
        duration: hhmm(flight.durationMs),
        targetUuid: flight.landingUuid,
        corrected: corrected.has(flight.landingUuid),
      });
    }
  }

  if (projection.closedAt != null) {
    // Adresem korekty zdania jest `day_close` - to ON niesie odczyt końcowy.
    const target = uuidOf('day_close');
    rows.push({
      id: 'release',
      kind: 'release',
      /* ZDANIE ZAMYKA OŚ, NAWET GDY ZAPISANO JE PÓŹNIEJ (zgłoszenie z urządzenia,
         2026-08-30: „mam «zdanie» przed «przejęciem»").

         `closedAt` to czas ZDARZENIA `day_close`, a wpis ręczny nie stempluje go
         godziną z formularza - i słusznie: od niego liczy się okno korekty, więc wpis
         sprzed dwóch dni rodziłby się z oknem już wygasłym (decyzja z przebudowy 15,
         przybita testem w `manualFlight.test.ts`). Zdanie niesie więc chwilę ZAPISU,
         która z przebiegiem sesji nie ma nic wspólnego i potrafi wypaść przed nim.

         Oś sortuje po `at`, więc bierze tu PÓŹNIEJSZĄ z dwóch chwil. Dla sesji na żywo
         nic to nie zmienia (zdanie i tak następuje po wyłączeniu), a wpisowi ręcznemu
         przywraca kolejność przyczynową. To jest klucz SORTOWANIA, nie twierdzenie
         o godzinie - godziny ten wiersz w sesji ręcznej i tak nie pokazuje. */
      at: Math.max(projection.closedAt, lastEventAt(rows)),
      time: declaredTime(projection.closedAt, projection.manualEntry, true),
      name: 'Zdanie',
      sub: readingLine(projection.fuel.endL, projection.mh.end, mhFormat),
      flight: null,
      duration: null,
      targetUuid: target,
      corrected: target != null && corrected.has(target),
    });
  }

  rows.sort((a, b) => compare(a, b));

  return { rows, foot: buildFoot(projection, now) };
}

/**
 * Stopka: cztery liczby, których nie ma nigdzie indziej na ekranie.
 *
 * Czas blokowy pada tu i TYLKO tu (issue #38 pkt 9) - przed przebudową stał w bohaterze
 * ekranu, w obu kartach załogi, w podpisie średniego zużycia i w wierszu Δ motogodzin.
 *
 * Sesja bez pracy silnika (09C) zamienia „Blok" na „Trzymany": zero w wielkiej cyfrze
 * nie jest odpowiedzią na żadne pytanie, a czas zajętości maszyny - jest.
 */
function buildFoot(projection: SessionState, now: number): AxisFootItem[] {
  const items: AxisFootItem[] = [];

  if (projection.blockTimeMs > 0) {
    items.push({ id: 'block', key: 'Blok', value: hhmm(projection.blockTimeMs), accent: false });
    // „Czas lotu", nie „W powietrzu" (issue #40 pkt 3): dwa słowa łamały się na telefonie
    // na dwie linie i rozpychały stopkę. Przy okazji to ta sama nazwa, co w kokpicie.
    items.push({
      id: 'flightTime',
      key: 'Czas lotu',
      value: hhmm(projection.flightTimeMs),
      accent: true,
    });
  } else {
    const held = heldMs(projection, now);
    items.push({
      id: 'held',
      key: 'Trzymany',
      value: held == null ? '-' : hhmm(held),
      accent: false,
    });
    items.push({ id: 'block', key: 'Blok', value: hhmm(0), accent: false });
  }

  items.push({
    id: 'takeoffs',
    key: projection.takeoffCount === 1 ? 'Start' : 'Starty',
    value: String(projection.takeoffCount),
    accent: false,
  });

  if (projection.departureIcao != null) {
    // Przelot ma parę lotnisk, skoki jedno (issue #13) - kafelek mówi to, co wie.
    const route =
      projection.arrivalIcao != null && projection.arrivalIcao !== projection.departureIcao
        ? `${projection.departureIcao}→${projection.arrivalIcao}`
        : projection.departureIcao;
    items.push({
      id: 'route',
      key: route.includes('→') ? 'Trasa' : 'Lotnisko',
      value: route,
      accent: false,
    });
  }

  return items;
}

/** Ile maszyna była zajęta: przejęcie → zdanie, a przy sesji trwającej - do teraz. */
function heldMs(projection: SessionState, now: number): number | null {
  if (projection.claimedAt == null) return null;
  return Math.max(0, (projection.closedAt ?? now) - projection.claimedAt);
}

/**
 * Podpis wiersza przejęcia i zdania: „odczyt 150 L · 1 234:30".
 *
 * To NIE jest ozdobnik - rachunki paliwa i motogodzin niżej odwołują się do tych dwóch
 * chwil („odczyt przy przejęciu", „licznik przy zdaniu"), więc bez nich wiersze rachunku
 * wskazywałyby na moment, którego ekran nigdzie nie pokazuje. Brakujący odczyt po prostu
 * wypada z podpisu; pusty podpis znaczy „nic nie spisano" i tak też wygląda.
 */
function readingLine(fuelL: number | null, mh: number | null, format: MhFormat): string | null {
  const parts: string[] = [];
  if (fuelL != null) parts.push(`odczyt ${litres(fuelL)}`);
  if (mh != null) parts.push(motoHours(mh, format));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Podpis PRZEJĘCIA = odczyty + pomiar oleju (issue #60). Osobno od `readingLine`,
 * bo zdanie samolotu oleju NIE MIERZY (bagnet tuż po locie kłamie - olej nie spłynął)
 * i jego podpis ma zostać dokładnie taki, jaki był. Dolewka w nawiasie, wzorem
 * tankowania na tej samej osi („+48 L → 171 L"): ilość dolana jest faktem przebiegu,
 * nie przypisem.
 */
function claimReadingLine(projection: SessionState, format: MhFormat): string | null {
  const base = readingLine(projection.fuel.startL, projection.mh.start, format);
  const { levelL, addedL } = projection.oil;
  const oil =
    levelL != null
      ? `olej ${oilLitres(levelL)}${addedL > 0 ? ` (+${oilLitres(addedL)})` : ''}`
      : null;
  const parts = [base, oil].filter((p): p is string => p != null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Podpis zrzutu - skład i wysokość są od issue #21 OPCJONALNE (`null` = niepodany,
 * nie zero), więc wiersz składa się z tego, co faktycznie zapisano.
 */
function dropLine(
  jumpers: EventOf<'drop'>['payload']['jumpers'],
  altitudeFt: EventOf<'drop'>['payload']['altitudeFt'],
): string | null {
  const parts: string[] = [];
  const composition = jumpersLine(jumpers);
  if (composition != null) parts.push(composition);
  // `thousands` z pakietu formatów, nie `toLocaleString`: ten drugi wstawia SPACJĘ
  // NIEROZDZIELAJĄCĄ i ta sama wysokość wyglądałaby inaczej niż na 05 i 14.
  if (altitudeFt != null) parts.push(`${thousands(altitudeFt)} ft`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** „4 skoczków" albo `null` - skład bywa niezadeklarowany i to nie jest zero (issue #21). */
function jumpersLine(jumpers: EventOf<'drop'>['payload']['jumpers']): string | null {
  if (jumpers == null) return null;
  return `${jumpers.tandem + jumpers.aff + jumpers.solo} skoczków`;
}

/**
 * Podpis zmiany załogi: „PIC: KRZ → TMK", „DUAL: - → ADM".
 *
 * Myślnik po którejś stronie znaczy, że fotela wtedy nie było zajętego (dodanie albo
 * zdjęcie Duala) - nie że pilota nie znamy.
 */
function crewLine(payload: EventOf<'crew_change'>['payload']): string {
  const role = payload.role === 'pic' ? 'PIC' : 'DUAL';
  return `${role}: ${payload.pilotOutId ?? '-'} → ${payload.pilotInId ?? '-'}`;
}

/** Czas rośnie w dół; przy remisie decyduje porządek przyczynowy. */
function compare(a: AxisRow, b: AxisRow): number {
  if (a.at !== b.at) return a.at - b.at;
  return RANK[a.kind] - RANK[b.kind];
}
