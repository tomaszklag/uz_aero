/**
 * Ninerdeck (serwer) - SKRZYNKA PILOTA (milestone 3.1.0, issue #164;
 * `docs/rezerwacje.md` §12.1).
 *
 * Cienka warstwa nad portem: strona listy + licznik nieprzeczytanych JEDNYM żądaniem.
 *
 * ══ LICZNIK JEDZIE RAZEM Z LISTĄ, NIE OSOBNĄ TRASĄ ══
 * Zapala się przy dzwonku na Pulpicie, a telefon pyta o skrzynkę przy każdym wejściu -
 * osobna trasa znaczyłaby drugie żądanie o odpowiedź, którą to samo zapytanie ma pod
 * ręką. Liczy CAŁĄ skrzynkę, nie pobraną stronę: „3" ma znaczyć trzy nieprzeczytane,
 * a nie trzy na pierwszej stronie.
 *
 * ══ „NOWE" TO NIE „DO DECYZJI" ══
 * Ten licznik mówi o WIADOMOŚCIACH („nie widziałeś jeszcze tej nowiny") i gaśnie
 * z przeczytaniem. O SPRAWACH mówi plakietka przy wierszu, liczona z rezerwacji -
 * i stoi, dopóki decyzja nie zapadnie, choćby pilot czytał listę dziesięć razy (§9.4).
 * Gdyby jedno gasiło drugie, wystarczyłoby zerknąć na skrzynkę, żeby prośba o zgodę
 * przestała się dopominać.
 */

import type {
  Database,
  NotificationCursor,
  NotificationRecord,
  NotificationsPort,
  PushTokensPort,
  Clock,
} from '../../common/ports.ts';

export interface InboxView {
  items: NotificationRecord[];
  /** Nieprzeczytane w CAŁEJ skrzynce - liczba przy dzwonku na Pulpicie. */
  unread: number;
}

export class NotificationQueries {
  constructor(
    private readonly db: Database,
    private readonly notifications: NotificationsPort,
    private readonly pushTokens: PushTokensPort,
    private readonly clock: Clock,
  ) {}

  async inbox(
    orgId: string,
    pilotId: string,
    page: { limit: number; before?: NotificationCursor },
  ): Promise<InboxView> {
    const [items, unread] = await Promise.all([
      this.notifications.list(this.db, orgId, pilotId, page),
      this.notifications.unreadCount(this.db, orgId, pilotId),
    ]);
    return { items, unread };
  }

  /** `false` = wiersza nie ma w TEJ skrzynce (cudza osoba, cudzy klub) → 404. */
  async markRead(orgId: string, pilotId: string, id: string): Promise<boolean> {
    return this.notifications.markRead(this.db, orgId, pilotId, id, this.clock.now());
  }

  /**
   * Token urządzenia. BEZ KLUBU i bez transakcji: opisuje urządzenie OSOBY, a ta bywa
   * w kilku klubach naraz i przełącza je bez wylogowania (§12.2).
   */
  async registerPushToken(pilotId: string, sessionId: string, token: string): Promise<void> {
    await this.pushTokens.register(
      this.db,
      { token, sessionId, pilotId },
      this.clock.now(),
    );
  }
}
