/**
 * UZ Aero (serwer) - kto jest zalogowany w panelu (`GET /admin/api/me`).
 *
 * Osobne zapytanie, a nie pole w odpowiedzi logowania, bo ciasteczko sesji jest
 * `HttpOnly`: po odświeżeniu karty JavaScript panelu NIE MA jak odczytać, kim jest -
 * musi zapytać serwer. To jest jedyny powód istnienia tej trasy i całej jej treści.
 *
 * Zwracamy konto, a nie claims z tokenu: nazwisko do stopki sidebara (`.who-name`)
 * w tokenie nie siedzi i siedzieć nie powinno - token ma być mały i nieciekawy.
 *
 * Od wielofirmowości odpowiedź niesie KLUB sesji (`org`) i kod/rolę Z CZŁONKOSTWA
 * w nim: ten sam człowiek w drugim klubie ma inny kod i inną rolę, więc pytanie
 * „kim jestem" ma odtąd dopełnienie „w którym klubie".
 */

import type { PilotsPort } from '../../common/ports.ts';
import type { PanelPilot } from '../../common/commands/auth.ts';

export class AdminMeQueries {
  constructor(private readonly pilots: PilotsPort) {}

  /**
   * `null` = token przeżył konto albo członkostwo (skasowane / wyłączone po wydaniu
   * sesji). Trasa odpowiada wtedy 401, bo to jest prawda o sesji: poświadczenie jest
   * ważne kryptograficznie, ale nie stoi za nim nikt.
   */
  async get(pilotId: string, orgId: string): Promise<PanelPilot | null> {
    const account = await this.pilots.findById(pilotId);
    if (account == null || !account.active) return null;

    const membership = await this.pilots.membership(pilotId, orgId);
    if (membership == null || membership.status !== 'active' || membership.code == null) {
      return null;
    }

    return {
      id: account.id,
      code: membership.code,
      name: account.name,
      role: membership.role,
      org: { id: membership.orgId, slug: membership.orgSlug, name: membership.orgName },
    };
  }
}
