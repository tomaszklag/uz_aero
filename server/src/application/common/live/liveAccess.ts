/**
 * Ninerdeck (serwer) - KANAŁ KLUBU PRZY ODEBRANIU DOSTĘPU (4.0.0, `docs/kanal-klubu.md`
 * §3.1; epik Z-E #246).
 *
 * Brama sprawdza połączenie RAZ, przy nawiązaniu - REST pyta przy każdym żądaniu. Każda
 * decyzja, która dziś odbiera dostęp w REST, musi więc sama zamknąć połączenia, których
 * dotyczy, inaczej kanał niósłby ramki komuś, kto po odświeżeniu ekranu dostałby już 401.
 * Wołane PO commicie: połączenie zamknięte przed zapisem zdążyłoby wrócić przez bramę,
 * która jeszcze nie widzi decyzji.
 *
 * ══ POWÓD RAMKI `bye` MÓWI KLIENTOWI, CO ZROBIĆ ══
 *  - `session_revoked` - ta sesja logowania już nie żyje: wylogowanie, „Wyloguj to
 *    urządzenie", „Wyloguj wszędzie w tym klubie", zmiana i reset hasła. Telefon idzie
 *    istniejącą ścieżką zdalnego wylogowania (2.1.0), panel - na ekran logowania;
 *  - `membership_disabled` - TEN klub przestał być dla tej osoby dostępny: wyłączone
 *    członkostwo albo wyłączony klub. Inne kluby osoby pracują dalej.
 * Trzeci powód, `token_expired`, zna samo połączenie (termin tokenu) - tu go nie ma.
 *
 * Blokady osoby na całej platformie nie ma czym wywołać: żadna komenda nie wyłącza
 * `pilots.active`. Gdy się pojawi, zamknie połączenia zakresem osoby z powodem
 * `membership_disabled`.
 */

import type { Capability } from '../../../domain/roles.ts';
import type { LivePort } from '../ports.ts';

export class LiveAccess {
  constructor(private readonly live: LivePort) {}

  /** Jedna sesja logowania: wylogowanie urządzenia, z telefonu, z panelu albo cudzą ręką. */
  sessionRevoked(sessionId: string): void {
    this.live.close({ kind: 'sessions', sessionIds: [sessionId] }, 'session_revoked');
  }

  /** „Wyloguj wszędzie w tym klubie" - wszystkie sesje członka W TYM klubie. */
  memberSessionsRevoked(orgId: string, pilotId: string): void {
    this.live.close({ kind: 'member', orgId, pilotId }, 'session_revoked');
  }

  /**
   * Hasło: reset z linku gasi wszystkie sesje osoby we wszystkich klubach
   * (`exceptSessionId` = `null`), zmiana w ustawieniach - wszystkie poza bieżącą.
   */
  personSessionsRevoked(pilotId: string, exceptSessionId: string | null): void {
    this.live.close({ kind: 'person', pilotId, exceptSessionId }, 'session_revoked');
  }

  /** Wyłączone członkostwo - osoba lata dalej w swoich pozostałych klubach. */
  membershipDisabled(orgId: string, pilotId: string): void {
    this.live.close({ kind: 'member', orgId, pilotId }, 'membership_disabled');
  }

  /** Wyłączony klub - dla każdej osoby w nim to ten sam skutek, co wyłączone członkostwo. */
  clubDisabled(orgId: string): void {
    this.live.close({ kind: 'club', orgId }, 'membership_disabled');
  }

  /**
   * Nowy zakres uprawnień członka. Połączenia nie trzeba zamykać - członek dalej jest
   * w klubie - ale sygnały do posiadaczy zdolności mają od tej chwili liczyć się według
   * nowego zbioru.
   */
  scopeChanged(orgId: string, pilotId: string, capabilities: readonly Capability[]): void {
    this.live.updateCapabilities(orgId, pilotId, capabilities);
  }
}
