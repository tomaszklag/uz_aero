/**
 * UZ Aero - panel: KATALOG TYPÓW FLAG tak, jak opisuje je skrzynka (moduł CZYSTY).
 *
 * Treść przepisana z legendy `design/admin/A03-flagi.html` („Typy flag - co serwer
 * liczy dziś" oraz „Dopisane do katalogu 2026-07-31"). Panel nie wymyśla tu niczego:
 * warunki i skutki są opisem zachowania `server/src/domain/mhChain.ts`
 * i `clockDrift.ts`.
 *
 * **Dlaczego `Record<FlagType, …>`, a nie tablica.** Panelowi wolno importować
 * z `@uzaero/domain` wyłącznie TYPY (§5.1), więc listy `FLAG_TYPES` nie może wziąć
 * wprost - a lista przepisana ręcznie rozjeżdża się po cichu. Mapa indeksowana typem
 * domenowym rozwiązuje to bez wyjątku od reguły: dopisanie szóstego typu w domenie
 * **wywala kompilację tego pliku**, bo `Record` wymaga kompletu kluczy. Kolejność
 * kluczy jest kolejnością chipów w mockupie i stąd bierze ją `FLAG_TYPE_ORDER`.
 *
 * **`session_overlap` ROZDZIELONE 2026-08-07** (§4.7) na `aircraft_overlap` (kto pisze
 * do MASZYNY - jedyna bramka arkusza) i `pilot_overlap` (co robi PILOT - grafik, bez
 * wpływu na arkusz). Legenda MUSI je rozróżniać, bo to dwie różne sprawy dla
 * administratora: pierwsza trzyma dokument klubu, druga mówi, że rejestr opisuje
 * człowieka w dwóch miejscach naraz. Mockup `A03-flagi.html` zna jeszcze starą, jedną
 * pozycję - treść niżej jest opisem KODU (`server/src/domain/{mhChain,pilotOverlap}.ts`).
 *
 * Czego tu NIE MA: PROGÓW (`0.1 h`, `±10 L`, `120 s`). Są wartościami domeny
 * (`packages/domain/src/rules/tolerances.ts`), a panel nie ma prawa trzymać ich kopii -
 * literał w tej tabeli byłby dokładnie tym „panelem, który mówi po swojemu". Do czasu,
 * aż serwer zacznie je wystawiać (ekran `A08`), legenda odsyła do miejsca, w którym
 * próg naprawdę mieszka.
 */

import type { FlagType } from '@uzaero/domain';

import type { PillTone } from '../../ui/components/Pill';

export interface FlagTypeMeta {
  /** Ton plakietki - czerwony tam, gdzie fakt jest zawsze błędem albo blokadą. */
  tone: PillTone;
  /** Podpis pod plakietką w tabeli: co ta flaga znaczy w jednym oddechu. */
  short: string;
  /** Kolumna „Warunek" legendy - na co reaguje detektor serwera. */
  condition: string;
  /** Kolumna „Skutek i znaczenie w praktyce". */
  effect: string;
}

export const FLAG_TYPE_META: Record<FlagType, FlagTypeMeta> = {
  aircraft_overlap: {
    tone: 'red',
    short: 'dwa telefony piszą do jednej maszyny',
    condition: 'Więcej niż jedna NIEZAMKNIĘTA sesja tego samego samolotu',
    effect:
      'Jedyna flaga bramkująca kartę arkusza: dopóki nie wiadomo, który strumień opisuje ' +
      'maszynę, doba tej maszyny nie ma jednej prawdy. Sporna sesja wypada z karty, ' +
      'a reszta doby idzie do arkusza z adnotacją „niekompletna". Typowo przejęcie ' +
      'offline - poprzednik ma niewysłane dane albo nie zdał samolotu.',
  },
  pilot_overlap: {
    tone: 'amber',
    short: 'pilot rzekomo na dwóch maszynach naraz',
    condition: 'Sesje jednego PILOTA na RÓŻNYCH maszynach o wspólnym odcinku czasu',
    effect:
      'Anomalia GRAFIKU, nie danych maszyny - arkusza NIE blokuje i karta dnia powstaje ' +
      'normalnie. Zetknięcie co do minuty nakładką NIE JEST: po §3.6a pilot legalnie zdaje ' +
      'jedną maszynę i bierze drugą o tej samej godzinie. Najczęstsza postać wady to ' +
      'zapomniane zdanie poprzedniego samolotu.',
  },
  mh_gap: {
    tone: 'amber',
    short: 'dziura w łańcuchu MH',
    condition: 'Start MH wyższy niż koniec MH poprzedniej sesji ponad tolerancję',
    effect:
      'Możliwy lot bez aplikacji albo zawyżony odczyt startowy. Eksportu nie blokuje - ' +
      'karta idzie do arkusza, a sprawa zostaje do wyjaśnienia.',
  },
  mh_regression: {
    tone: 'red',
    short: 'licznik się cofnął',
    condition: 'Odczyt startowy niższy niż koniec poprzednika poniżej tolerancji',
    effect:
      'Błąd wpisu albo nakładające się dni. Licznik motogodzin jest monotoniczny ' +
      'i fizyczny - cofnąć się nie może, więc to zawsze pomyłka człowieka lub złe scalenie.',
  },
  fuel_mismatch: {
    tone: 'amber',
    short: 'paliwo poza tolerancją',
    condition: 'Odczyt paliwomierza rozjeżdża się z przekazaniem poprzednika',
    effect:
      'Tankowanie poza aplikacją, spuszczone paliwo albo błędny odczyt - podejrzane są ' +
      'obie strony różnicy. Telefon mówi pilotowi od razu, serwer flaguje przekazanie ' +
      'po fakcie; próg jest ten sam po obu stronach.',
  },
  clock_drift: {
    tone: 'blue',
    short: 'zegar telefonu przestawiony',
    condition: '|device_time − gps_time| powyżej progu, jedna flaga na sesję',
    effect:
      'Czasy zdarzeń zostają w rejestrze bez zmian - porządek robi licznik MH, nie zegar. ' +
      'Flaga tłumaczy błędny stempel, nie unieważnia go.',
  },
};

/** Kolejność chipów typu w pasku filtrów - jak w `A03-flagi.html`. */
export const FLAG_TYPE_ORDER = Object.keys(FLAG_TYPE_META) as FlagType[];
