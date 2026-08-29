/**
 * UZ Aero - jak POKAZAĆ wybrane lotnisko w kontrolce formularza (issue #62 pkt 1).
 *
 * Katalog obejmuje Polskę (106 lotnisk i lądowisk, `packages/domain/src/airfields.ts`),
 * a przelot potrafi skończyć się w Berlinie - więc kod spoza katalogu jest NORMALNYM
 * dniem, nie błędem. Arkusz wyboru dawno to uznaje: kod poprawny kształtem wchodzi
 * osobnym wierszem, świadomym tapnięciem, żeby odróżnić „lecę do EDDB" od literówki
 * w EPKK.
 *
 * ══ ALE PO WYBORZE ŚLAD PO TEJ DECYZJI GINĄŁ ══
 * W formularzu EDDB wyglądało dokładnie tak samo jak EPKK - ta sama ramka, ten sam
 * krój, ta sama wielkość. Jedyną różnicą był BRAK drugiej linii z nazwą, czyli sygnał
 * negatywny: „nic więcej do powiedzenia", a nie „to jest kod, którego nie znamy".
 * Zgłoszenie z urządzenia prosiło wprost o oznaczenie graficzne.
 *
 * ══ JEDNO ŹRÓDŁO DLA ARKUSZA I FORMULARZA ══
 * Ten moduł odpowiada na oba pytania naraz - „co wpisać w drugą linię" i „czy postawić
 * plakietkę" - bo to jedno rozstrzygnięcie oglądane z dwóch stron. Rozdzielone na dwa
 * warunki w dwóch ekranach rozjechałyby się przy pierwszej zmianie katalogu.
 *
 * NAZWA ALBO PLAKIETKA, NIGDY OBIE: kod z katalogu niesie nazwę, kod spoza - plakietkę.
 * Napis „spoza katalogu" w obu miejscach naraz mówiłby to samo dwa razy, a prawa
 * krawędź kontrolki niesie DOKŁADNIE JEDNĄ rzecz (reguła osi z issue #40).
 */

import { airfieldByIcao } from '../../../domain';
import type { Tone } from '../tone';

export interface AirfieldMark {
  /** Druga wartość kontrolki - nazwa z katalogu; `null`, gdy katalog kodu nie zna. */
  meta: string | null;
  /** Kod poprawny kształtem, którego katalog nie zna - do plakietki przy wartości. */
  foreign: boolean;
}

/** Napis plakietki - jeden na całą aplikację, żeby arkusz i formularz mówiły tak samo. */
export const FOREIGN_AIRFIELD_TAG = 'spoza katalogu';

/**
 * Zdanie przy wierszu „użyj tego kodu" w arkuszu wyboru.
 *
 * Do issue #62 brzmiało „Użyj tego kodu - katalog zna tylko polskie lotniska", czyli
 * opisywało ZAWARTOŚĆ katalogu komuś, kto właśnie wpisuje kod lotniska docelowego.
 * To jest ta sama kategoria przypisów o budowie aplikacji, którą wyrzuciły issue #43
 * i #55. Pilota interesuje SKUTEK jego tapnięcia, a skutkiem jest brak nazwy.
 */
export const FOREIGN_AIRFIELD_NOTE = 'Zapisze się sam kod, bez nazwy lotniska';

/** Pusty kod nie jest ani znany, ani obcy - pole po prostu czeka na wybór. */
export function airfieldMark(icao: string | null | undefined): AirfieldMark {
  if (icao == null || icao.length === 0) return { meta: null, foreign: false };
  const known = airfieldByIcao(icao);
  return known != null ? { meta: known.name, foreign: false } : { meta: null, foreign: true };
}

/**
 * To samo rozstrzygnięcie gotowe do rozsypania w `ValueBox` - żeby oba ekrany z trasą
 * (02E i wpis ręczny) rysowały kod jednakowo, zamiast każdy po swojemu.
 *
 * BURSZTYN, bo to jest dokładnie ten ton: nie błąd (kod jest poprawny i zapisze się
 * bez przeszkód), ale rzecz, o której warto wiedzieć - jak paliwo i ostrzeżenia
 * warunkowe. Zielony znaczyłby „w porządku, nic tu nie ma", czerwony - „popraw to".
 */
export function airfieldValueProps(icao: string | null | undefined): {
  meta?: string;
  tag?: { label: string; tone: Tone };
} {
  const mark = airfieldMark(icao);
  if (mark.foreign) return { tag: { label: FOREIGN_AIRFIELD_TAG, tone: 'amber' } };
  return mark.meta != null ? { meta: mark.meta } : {};
}
