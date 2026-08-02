/**
 * UZ Aero — panel: KATALOG TYPÓW ZDARZEŃ dla rejestru (`A04`, moduł CZYSTY).
 *
 * ══ DLACZEGO LISTA POWSTAJE Z `EVENT_META`, A NIE Z `EVENT_TYPES` ══
 * Panelowi wolno importować z `@uzaero/domain` wyłącznie TYPY (§5.1), więc runtime'owej
 * tablicy `EVENT_TYPES` nie ma jak wziąć. Zamiast dopisywać wyjątek do allowlisty
 * testu architektury, budujemy listę z `Record<EventType, …>` w `screens/day/eventTypes.ts`
 * — a kompilator pilnuje KOMPLETU: dopisanie czternastego typu zdarzenia wywala
 * kompilację tamtego pliku, zamiast pokazać administratorowi chip, którego nie ma.
 *
 * Kolejność bierzemy z kolejności kluczy mapy i **pilnuje jej test lustra**
 * (`admin/test/eventCatalog.mirror.test.ts`), który czyta katalog domeny z DYSKU.
 * Bez tego rozjazd objawiłby się dopiero wtedy, gdy ktoś by tego typu szukał chipem.
 *
 * ══ CZEGO TEN MODUŁ NIE ROBI ══
 * Nie zamyka listy typów, które rejestr POKAZUJE. Kolumna `events.type` nie ma
 * `CHECK`-a, więc wiersz może nieść kod spoza katalogu — i wtedy `eventTypeView`
 * oddaje go dosłownie, z tonem neutralnym i `known: false`. Katalog opisuje to, po czym
 * da się FILTROWAĆ (serwer i tak waliduje), a nie to, co da się zobaczyć.
 */

import type { PillTone } from '../../ui/components/Pill';
import { EVENT_META } from '../day/eventTypes';

/**
 * Wszystkie typy katalogu, w kolejności deklaracji `EVENT_META` — czyli w kolejności
 * dnia lotnego, dokładnie jak chipy w mockupie `A04`.
 */
export const EVENT_TYPE_LIST: readonly string[] = Object.keys(EVENT_META);

/** Czy kod należy do katalogu domeny — strażnik wejścia z adresu (`?typ=`). */
export function isKnownEventType(value: string | null): value is string {
  // `hasOwnProperty` przez prototyp, nie `EVENT_META[value] != null`: klucz `toString`
  // nie jest `undefined`, tylko funkcją z `Object.prototype`, więc zwykły odczyt
  // uznałby `?typ=toString` za znany typ i wysłał go do serwera jako filtr.
  return value != null && Object.prototype.hasOwnProperty.call(EVENT_META, value);
}

export interface EventTypeView {
  /** SUROWY kod z bazy — plakietka w mockupie pokazuje `drop`, nie „Zrzut". */
  code: string;
  tone: PillTone;
  /** Nazwa po polsku dla podpisu; przy kodzie spoza katalogu równa się kodowi. */
  label: string;
  /** `false` = kod spoza katalogu; wiersz zostaje, ale mówi o tym wprost. */
  known: boolean;
}

/**
 * Kod typu → plakietka. Kod NIEZNANY dostaje ton neutralny i `known: false` — nigdy
 * nie znika i nigdy nie udaje znanego. Ta sama reguła, co przy `actionView` w audycie.
 */
export function eventTypeView(type: string): EventTypeView {
  if (!isKnownEventType(type)) {
    return { code: type, tone: 'dim', label: 'typ spoza katalogu domeny', known: false };
  }
  const meta = EVENT_META[type as keyof typeof EVENT_META];
  return { code: type, tone: meta.badgeTone, label: meta.badge, known: true };
}

/**
 * Czy zdarzenie tego typu podlega korekcie administratora (`A02b`).
 *
 * LUSTRO reguły domeny `CORRECTION_TARGET_NOT_ALLOWED`, mieszkające w `EVENT_META` —
 * i panel jej NIE egzekwuje: serwer sprawdza to przy każdym żądaniu, także przy
 * podglądzie. Kopia jest po to, żeby nie zapraszać człowieka w formularz, który i tak
 * odbije. Typ spoza katalogu nie jest korygowalny, bo domena go nie zna.
 */
export function isCorrectable(type: string): boolean {
  if (!isKnownEventType(type)) return false;
  return EVENT_META[type as keyof typeof EVENT_META].correctable;
}
