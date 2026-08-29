/**
 * UZ Aero — WYMÓG ZAŁOGI DWUOSOBOWEJ JAKO BLOKADA Z POWODEM (uwaga z urządzenia,
 * 2026-08-29).
 *
 * Wymóg Duala jest właściwością SAMOLOTU (§3.1, konfiguracja §5.4) i obowiązuje na
 * OBU drogach do lotu: na preflightcie (02) i we wpisie ręcznym (15) — An-2 z kartki
 * podlega temu samemu prawu, co An-2 na płycie (issue #58 pkt 4).
 *
 * ══ POWÓD STOI W PRZYCISKU, NIE W BANERZE ══
 * Do 2026-08-29 oba ekrany mówiły o tym BANEREM pod listą wyboru, a „DALEJ" dostawał
 * samo `disabled` — z rachunku issue #55: „blokada widoczna z ekranu nie powtarza
 * swojego zdania w przycisku". Zgłoszenie z urządzenia ten rachunek odwraca: pilot
 * napotyka blokadę przy PRZYCISKU i tam szuka odpowiedzi, a wszystkie pozostałe
 * blokady formularzy tej aplikacji odpowiadają mu właśnie tam. Jeden wyjątek od reguły
 * kosztuje więcej niż powtórzenie, którego miał oszczędzić.
 *
 * Plakietka „wymagany · załoga 2-os." przy karcie drugiego pilota ZOSTAJE: mówi
 * o właściwości maszyny w miejscu wyboru, a nie o tym, czemu nie da się przejść dalej.
 *
 * ══ DLACZEGO WSPÓLNY MODUŁ, A NIE DWA ZDANIA ══
 * Bo rozjazd między 02 a 15 jest dokładnie tym, co zgłoszenie kazało usunąć. Jedno
 * zdanie w jednym miejscu nie ma jak się rozejść.
 */

/**
 * Zdanie blokady. Tryb rozkazujący na początku — jak wszystkie powody w tej aplikacji
 * („Wybierz samolot, którego dotyczy lot.", „Wybierz lotnisko startu.") — bo pilot
 * czyta je, szukając NASTĘPNEJ CZYNNOŚCI, nie diagnozy.
 *
 * Typ maszyny nie wchodzi do zdania: wybrany samolot jest na ekranie jeden, stoi wyżej
 * w karcie, a przycisk renderuje ten napis wersalikami po 9 px — każde zbędne słowo
 * kosztuje tam linijkę.
 */
export const DUAL_REQUIRED_REASON =
  'Wybierz drugiego pilota — ten samolot wymaga załogi dwuosobowej.';

/**
 * Powód blokady „dalej" wynikający z wymogu Duala; `null` = ten wymóg nie stoi na drodze
 * (maszyna go nie ma, drugi pilot jest wybrany albo maszyny jeszcze nie ma).
 *
 * BRAK MASZYNY nie jest tu blokadą i być nie może: to osobny, wcześniejszy powód
 * („Wybierz samolot…"), a dwa zdania naraz przycisk i tak pokazałby jako jedno.
 */
export function dualRequirementBlocker(
  aircraft: { dualRequired: boolean } | null | undefined,
  dualId: string | null,
): string | null {
  if (aircraft == null || !aircraft.dualRequired || dualId != null) return null;
  return DUAL_REQUIRED_REASON;
}
