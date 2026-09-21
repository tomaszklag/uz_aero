/**
 * Ninerdeck - panel: lista stref czasu do wyboru na karcie klubu (3.0.0).
 *
 * Strefa rysuje GODZINY kalendarza (`docs/rezerwacje.md` §6), więc jest zbiorem
 * ZAMKNIĘTYM i długim - a taki w panelu idzie natywnym `<select>` (`CLAUDE.md`, wyjątek
 * od reguły „zawsze lista kart", która powstała dla kciuka w rękawicy).
 *
 * ══ LISTA IDZIE Z PRZEGLĄDARKI, NIE Z NASZEJ TABLICY ══
 * `Intl.supportedValuesOf('timeZone')` oddaje katalog IANA, który zna ta przeglądarka -
 * czyli dokładnie ten, którego trzyma się serwer przy sprawdzaniu wpisu. Własna tablica
 * byłaby drugą kopią czegoś, co aktualizuje się bez nas, i starzałaby się w ciszy.
 *
 * ══ DLACZEGO `current` DOKLEJA SIĘ SIŁĄ ══
 * Klub może stać na strefie, której ta przeglądarka nie zna (starsze ICU, wpis sprzed
 * aktualizacji katalogu). Bez doklejenia `<select>` pokazałby wtedy PIERWSZĄ pozycję
 * listy, a zapis cicho przestawiłby klubowi konfigurację, której nikt nie tykał.
 */

/** Gdy przeglądarka nie zna `supportedValuesOf` - dość, żeby karta działała. */
const FALLBACK_ZONES = ['Europe/Warsaw', 'Europe/Berlin', 'Europe/London', 'UTC'];

function supportedZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf !== 'function') return FALLBACK_ZONES;
  try {
    const zones = intl.supportedValuesOf('timeZone');
    return zones.length > 0 ? zones : FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

/**
 * Strefy do wyboru, z `current` na pewno w środku. Pusty `current` niczego nie dokłada -
 * to formularz zakładania klubu, który o strefę nie pyta.
 */
export function clubTimeZones(current: string): string[] {
  const zones = supportedZones();
  if (current === '' || zones.includes(current)) return zones;
  return [current, ...zones];
}
