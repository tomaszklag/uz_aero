/**
 * UZ Aero (serwer) - kto jest zalogowany w panelu (`GET /admin/api/me`).
 *
 * Osobne zapytanie, a nie pole w odpowiedzi logowania, bo ciasteczko sesji jest
 * `HttpOnly`: po odświeżeniu karty JavaScript panelu NIE MA jak odczytać, kim jest -
 * musi zapytać serwer. To jest jedyny powód istnienia tej trasy i całej jej treści.
 *
 * Zwracamy konto, a nie claims z tokenu: nazwisko do stopki sidebara (`.who-name`)
 * w tokenie nie siedzi i siedzieć nie powinno - token ma być mały i nieciekawy.
 */

import type { PilotsPort } from '../../common/ports.ts';
import type { PanelPilot } from '../../common/commands/auth.ts';

export class AdminMeQueries {
  constructor(private readonly pilots: PilotsPort) {}

  /**
   * `null` = token przeżył konto (skasowane albo wyłączone po wydaniu sesji).
   * Trasa odpowiada wtedy 401, bo to jest prawda o sesji: poświadczenie jest ważne
   * kryptograficznie, ale nie stoi za nim nikt.
   */
  async get(pilotId: string): Promise<PanelPilot | null> {
    const account = await this.pilots.findById(pilotId);
    if (account == null || !account.active) return null;

    const { id, code, name, role } = account;
    return { id, code, name, role };
  }
}
