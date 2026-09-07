/**
 * UZ Aero - panel 2.0: odpowiedź serwera -> ZDANIE DLA CZŁOWIEKA.
 *
 * Moduł CZYSTY (bez Reacta), wspólny dla obu ekranów - bo „nie ma połączenia"
 * i „sesja wygasła" znaczą to samo przy koncie i przy samolocie, a dwie kopie tego
 * samego zdania rozjeżdżają się przy pierwszej poprawce jednej z nich.
 *
 * == REGULA REDAKCYJNA ==
 * Komunikat mówi, CO ZROBIC, a nie co odrzucił serwer. Kod HTTP pojawia się
 * w tekście wyłącznie tam, gdzie nie umiemy powiedzieć nic mądrzejszego - i wtedy
 * jest jedyną rzeczą, którą człowiek może przekazać dalej, zgłaszając usterkę.
 *
 * Odmowy ZNANE (`409 refused`, `409 conflict`) nie mają tu swoich zdań: należą do
 * ekranu, bo brzmią inaczej przy koncie i przy samolocie. Ten plik oddaje surowy kod,
 * a nazwanie go po polsku jest sprawą `accountRefusal.ts` / `aircraftRefusal.ts`.
 */

import type { FleetRefusalDto, PilotRefusalDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';

/** Pole zajęte przez inny wiersz (`409 conflict`); `null` = to nie ten przypadek. */
export function conflictField(error: unknown): 'code' | 'email' | 'reg' | null {
  if (!isHttpError(error)) return null;
  if (error.status !== 409 || error.body.error !== 'conflict') return null;
  return error.body.field ?? null;
}

/** Powód odmowy reguły (`409 refused`); `null` = to nie ten przypadek. */
export function refusalOf(error: unknown): PilotRefusalDto | FleetRefusalDto | null {
  if (!isHttpError(error)) return null;
  if (error.status !== 409 || error.body.error !== 'refused') return null;
  return error.body.reason ?? null;
}

/**
 * Odmowa REGUŁ REJESTRU (`422 rule_violation`) - zdaniem odpowiada DOMENA.
 *
 * Nie tłumaczymy tego na własne napisy, inaczej niż `409 refused`: tamte powody są
 * kodami (`last_admin`), a te przychodzą gotowym zdaniem po polsku - tym samym, które
 * czyta pilot na telefonie. Druga wersja rozjechałaby się przy pierwszej poprawce
 * jednej z nich, a mówią o tym samym fakcie.
 *
 * `null` = to nie ten przypadek; wołający schodzi wtedy na `errorMessage`.
 */
export function ruleViolationMessage(error: unknown): string | null {
  if (!isHttpError(error)) return null;
  if (error.status !== 422 || error.body.error !== 'rule_violation') return null;
  const messages = (error.body.violations ?? []).map((v) => v.message).filter((m) => m !== '');
  return messages.length === 0 ? null : messages.join(' ');
}

/**
 * Zdanie dla wszystkiego, czego ekran nie umiał nazwać sam.
 *
 * `400 no_changes` ma tu swoje zdanie mimo że ekran pilnuje tego wcześniej (przycisk
 * jest nieaktywny bez zmian): wyścig jest realny - ktoś inny mógł zapisać dokładnie
 * tę samą wartość między wczytaniem listy a kliknięciem.
 */
export function errorMessage(error: unknown): string {
  // Awaria sieci to NIE jest odpowiedź serwera - `fetch` rzuca `TypeError` i wtedy
  // nie ma żadnego statusu. Te dwa przypadki wymagają dwóch różnych zdań.
  if (!isHttpError(error)) return 'Nie ma połączenia z serwerem. Spróbuj za chwilę.';

  if (error.status === 401) return 'Sesja wygasła. Zaloguj się jeszcze raz.';
  if (error.status === 403) return 'Twoje konto nie ma uprawnień do tej zmiany.';
  if (error.status === 404) return 'Tego już nie ma - odśwież listę.';
  if (error.status === 400 && error.body.error === 'no_changes') return 'Nic się nie zmieniło.';
  if (error.status === 400) return 'Popraw zaznaczone pola.';

  return `Nie udało się zapisać (kod ${error.status}). Zgłoś to, jeśli się powtórzy.`;
}
