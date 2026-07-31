/**
 * UZ Aero (serwer) — preferencje pilota `/me/prefs` (decyzja 2026-07-29: motyw jest
 * preferencją PILOTA i synchronizuje się przez serwer).
 *
 * Jedna klasa na odczyt i zapis, bo obie strony serwują TEN SAM kontrakt: `put`
 * zwraca dokładnie to, co zwróciłby `get` po operacji — stan AUTORYTATYWNY.
 * To nie uprzejmość, tylko mechanizm LWW: telefon, którego stempel przegrał
 * (inny telefon tego samego pilota zapisał nowszy wybór), dowiaduje się o tym
 * z odpowiedzi i dostosowuje lokalny motyw, zamiast wiecznie ponawiać przegrany PUT.
 *
 * Serwer NIE zna listy motywów — nazwy motywów to tokeny UI aplikacji
 * (`app/src/ui/theme/tokens.ts`), a przenoszenie ich do domeny wiązałoby obie
 * strony z paletą ekranu. Walidację długości robi trasa (zod), sens nazwy ocenia
 * wyłącznie telefon (nieznana nazwa = fallback na Night po stronie UI).
 */

import type { PilotPrefs, PilotPrefsPort } from '../ports.ts';

export class PrefsCommands {
  constructor(private readonly prefs: PilotPrefsPort) {}

  /** Preferencje pilota z tokenu; `null` = konto nie istnieje (404 w trasie). */
  get(pilotId: string): Promise<PilotPrefs | null> {
    return this.prefs.get(pilotId);
  }

  /**
   * Zapis LWW (warunek w SQL adaptera) + odczyt stanu po operacji.
   * Starszy stempel niczego nie nadpisuje — odpowiedź niesie wtedy zwycięzcę.
   */
  async put(pilotId: string, theme: string, updatedAt: Date): Promise<PilotPrefs | null> {
    await this.prefs.setIfNewer(pilotId, theme, updatedAt);
    return this.prefs.get(pilotId);
  }
}
