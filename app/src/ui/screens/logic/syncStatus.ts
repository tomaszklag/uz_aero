/**
 * UZ Aero - stan synchronizacji → sekcja „Synchronizacja" w Ustawieniach (13).
 *
 * Ten sam podział co `statsDay.ts`: logika prezentacji w czystych funkcjach,
 * testowalnych bez React Native.
 *
 * ══ MODUŁ SCHUDŁ DWA RAZY ══
 * Raz razem z ekranem 11 (2026-08-12), który był trzecim widokiem tej samej operacji.
 *
 * Drugi raz przy issue #82, i to jest zmiana o CO POKAZUJEMY, nie o kształt:
 *
 *  • **katalog uwag serwera (`flagLabel`) i wiersz „Uwagi serwera" ZNIKNĘŁY.**
 *    Zgłoszenie z urządzenia: „co to są «Uwagi serwera» oraz «dwa telefony piszą do
 *    jednej maszyny»? […] wyświetlamy taką informację, ale nie bardzo jest co z tym
 *    zrobić - widzę takie ostrzeżenie i nie wiem, co mam dalej zrobić i zareagować."
 *    Racja: flagi §4.5 są narzędziem ADMINISTRATORA. Rozstrzyga je panel, a pilot
 *    dostawał listę rzeczy, których nie naprawi - a to jest dokładnie ta kategoria,
 *    którą issue #72 wyrzuciło z ustawień, a issue #84 z ekranu kokpitu (rozjazd
 *    zegara). Flagi jadą dalej w odpowiedzi serwera i widzi je panel;
 *
 *  • **dwa stemple czasu scaliły się w JEDEN.** „Czemu mam dwa czasy, które się różnią,
 *    czyli «ostatnia wysyłka» i «data synchronizacji»? To nie powinno być jakoś to samo,
 *    w sensie jeden mechanizm synchronizacji?" - patrz `lastContactAt` niżej.
 */

import { utcDayStart } from '../../../domain';
import { dateTimeUtcShort, timeUtc } from '../../format';

// Odmiana liczebników awansowała do `ui/format.ts` (używają jej też komponenty DS) -
// re-eksport trzyma dotychczasowe importy ekranów i testów w mocy.
export { eventsCount, plural } from '../../format';

/**
 * KIEDY TELEFON OSTATNI RAZ ROZMAWIAŁ Z SERWEREM - jedna liczba zamiast dwóch.
 *
 * ══ CO TU BYŁO ŹLE ══
 * Ustawienia pokazywały dwa stemple: „Ostatnia udana wysyłka" (wypchnięcie outboxa)
 * i „Dane referencyjne · sync HH:MM" (potwierdzenie cache'u floty). To są faktycznie
 * dwa kierunki jednego mechanizmu, ale z ekranu wyglądały jak dwa różne zegary - i o to
 * właśnie padło pytanie.
 *
 * Gorzej: wysyłka aktualizuje swój stempel WYŁĄCZNIE wtedy, gdy było co wysłać
 * (`SyncOutcome.idle` przy pustej kolejce nie liczy się jako `synced`). Pilot bez
 * zaległości widział więc godzinę zamrożoną sprzed kilku godzin obok świeżego stempla
 * danych referencyjnych - dwie liczby, z których jedna wyglądała na awarię, a obie były
 * poprawne. Zgłoszenie trafiło w prawdziwą usterkę, nie w kosmetykę.
 *
 * ══ DLACZEGO PÓŹNIEJSZY, A NIE WCZEŚNIEJSZY ══
 * Bo pytanie brzmi „od kiedy nie mam kontaktu z serwerem", a nie „która z moich danych
 * jest najstarsza". Starsze dane referencyjne przy świeżej wysyłce to normalny stan
 * (brama wieku 15 min), a nie brak łączności - o zaległościach mówi osobny wiersz
 * kolejki, i to on jest miejscem na złe wieści.
 *
 * `null` = jeszcze ani jednej udanej rozmowy.
 */
export function lastContactAt(
  pushedAt: number | null,
  referenceCheckedAt: number | null,
): number | null {
  if (pushedAt == null) return referenceCheckedAt;
  if (referenceCheckedAt == null) return pushedAt;
  return Math.max(pushedAt, referenceCheckedAt);
}

/**
 * Napis wiersza „Ostatnia synchronizacja".
 *
 * SAMA GODZINA TYLKO W TEJ SAMEJ DOBIE UTC. „08:12 UTC" przy stemplu sprzed dwóch dni
 * mówiłoby nieprawdę o tym, co pilot naprawdę chce wiedzieć - a właśnie zamrożony
 * stempel bez daty był tym, co kazało zapytać, czy aplikacja w ogóle się synchronizuje.
 *
 * @param now chwila odczytu - podaje ją wołający, żeby funkcja została czysta.
 */
export function lastContactLabel(at: number | null, now: number): string {
  if (at == null) return 'jeszcze żadnej';
  return utcDayStart(at) === utcDayStart(now)
    ? `${timeUtc(at)} UTC`
    : `${dateTimeUtcShort(at)} UTC`;
}
