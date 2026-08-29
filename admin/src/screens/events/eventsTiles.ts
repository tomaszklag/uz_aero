/**
 * UZ Aero - panel: KAFLE rejestru zdarzeń (moduł CZYSTY).
 *
 * Cztery kafle z mockupu `A04`, z czego **trzy niesie serwer, a czwartego NIE MA
 * I NIE BĘDZIE** - i to jest tutaj najważniejsza decyzja, a nie liczby.
 *
 * ══ „PRZYJĘTE / DUPLIKATY" - DLACZEGO KRESKA, A NIE LICZBA ══
 * Mockup pokazuje `247 / 18` z podpisem „duplikaty odsiane po uuid - retry outboxa
 * działa". Takiej liczby w bazie NIE MA i nie da się jej odtworzyć: `POST /events`
 * odsiewa duplikaty przez `INSERT … ON CONFLICT (uuid) DO NOTHING`, a różnicę
 * `events.length − accepted` zwraca WYŁĄCZNIE w odpowiedzi synca, do telefonu.
 * W rejestrze nie zostaje po niej żaden ślad - bo z definicji nie zostaje po niej wiersz.
 *
 * Policzenie czegokolwiek „na oko" w tym miejscu byłoby inną wielkością pod tą samą
 * etykietą, więc kafel zostaje na ekranie z kreską i mówi, czego brakuje. Ta sama
 * decyzja, co przy kolumnie „Ostatnie logowanie" na `A06` i przy zrzutach na pulpicie:
 * **brak nazwany jest lepszy niż brak ukryty** - kafel usunięty kazałby następnej osobie
 * szukać liczby, która nie istnieje.
 */

import type { EventCountsDto } from '../../api/dto';
import type { TileTone } from '../../ui/components/Tile';
import { driftSeconds } from './eventsRows';

export interface EventTile {
  label: string;
  value: string;
  tone: TileTone | null;
  note: string;
}

/** „-", nigdy „0": brak odpowiedzi nie jest twierdzeniem o pustym rejestrze. */
const DASH = '-';

/**
 * Liczniki serwera → kafle.
 *
 * `counts === null` znaczy „nie wiemy" (zapytanie w drodze albo nieudane) i wszystkie
 * trzy liczbowe kafle pokazują wtedy kreskę. Najdroższa możliwa pomyłka narzędzia
 * nadzoru to „0 zdarzeń bez fixa" wypisane tuż obok banera o błędzie pobrania - bo
 * wygląda jak dobra wiadomość.
 */
export function eventsTiles(counts: EventCountsDto | null, narrowed: boolean): EventTile[] {
  const scope = narrowed ? 'w bieżącym zawężeniu' : 'w całym rejestrze';
  const unknown = 'Nie wiadomo - rejestr się nie pobrał.';

  return [
    {
      label: narrowed ? 'Zdarzeń w zawężeniu' : 'Zdarzeń w rejestrze',
      value: counts == null ? DASH : String(counts.total),
      tone: null,
      note:
        counts == null
          ? unknown
          : `Liczy serwer nad CAŁYM zakresem zapytania ${scope} - także wtedy, gdy strona jest przycięta kursorem.`,
    },
    {
      label: 'Przyjęte / duplikaty',
      value: DASH,
      tone: null,
      // Kafel POMINIĘTY, zgłoszony jawnie - uzasadnienie w nagłówku pliku.
      note:
        'Serwer nie zlicza duplikatów: POST /events odsiewa je przez ON CONFLICT DO NOTHING, ' +
        'a liczba wraca wyłącznie do telefonu w odpowiedzi synca. W bazie nie zostaje po niej ślad.',
    },
    {
      label: 'Rozjazd zegarów',
      value: counts == null ? DASH : String(counts.clockDrift),
      // Zero rozjazdów NIE jest ostrzeżeniem - bursztyn zapala się dopiero przy sprawie.
      tone: counts == null ? null : counts.clockDrift > 0 ? 'amber' : 'green',
      note:
        counts == null
          ? unknown
          : `|device − gps| powyżej progu ${driftSeconds(counts.driftThresholdMs)} - tego samego, ` +
            'którym serwer wystawia flagę CLOCK_DRIFT. Próg podaje serwer; panel go nie zna.',
    },
    {
      label: 'Bez fixa GPS',
      value: counts == null ? DASH : String(counts.withoutGpsFix),
      tone: null,
      note:
        counts == null
          ? unknown
          : 'gps_time = null - czas wzięty z zegara telefonu, bez potwierdzenia z GPS. ' +
            'Dla tych wierszy różnica zegarów nie istnieje, a nie wynosi zero.',
    },
  ];
}
