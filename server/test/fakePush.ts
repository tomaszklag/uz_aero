/**
 * Ninerdeck (serwer) - atrapa budzika dla testów akceptacji (`PushPort`).
 *
 * Ta sama granica, co przy poczcie (`fakeMail.ts`): podmieniamy WYŁĄCZNIE cudzą usługę
 * HTTP. Skrzynka, tokeny urządzeń, transakcje i decyzje są prawdziwe - a testy o to
 * właśnie pytają, bo skrzynka jest źródłem prawdy, a push tylko budzikiem (§12.1).
 *
 * `failing = true` symuluje awarię dostawcy: przy budziku to NIE JEST ścieżka błędu,
 * tylko sprawdzenie, że decyzja zapada mimo ciszy w telefonie.
 */

import { randomUUID } from 'node:crypto';

import type { Database, PushMessage, PushPort } from '../src/application/common/ports.ts';
import { Notifier } from '../src/application/common/notify/notifier.ts';
import { PgNotificationsRepo } from '../src/infrastructure/pg/common/notificationsRepo.ts';
import { PgPushTokensRepo } from '../src/infrastructure/pg/common/pushTokensRepo.ts';

export class FakePush implements PushPort {
  readonly sent: PushMessage[] = [];
  failing = false;
  /** Tokeny, które „dostawca" uzna za martwe - test sprawdza, czy znikają z bazy. */
  dead: string[] = [];

  async send(messages: readonly PushMessage[]): Promise<{ dead: string[] }> {
    if (this.failing) throw new Error('dostawca push nie odpowiada');
    this.sent.push(...messages);
    return { dead: this.dead };
  }

  /** Budziki wysłane na dany token, najstarsze pierwsze. */
  to(token: string): PushMessage[] {
    return this.sent.filter((m) => m.token === token);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/**
 * Powiadamiacz na prawdziwych adapterach i atrapie budzika - dla testów, które pytają
 * o SKUTEK w bazie (wiersz skrzynki), a nie o dzwonek. Ten sam skład, co w produkcji,
 * z jednym podmienionym elementem: cudzą usługą HTTP.
 */
export function silentNotifier(db: Database): Notifier {
  // Zegar systemowy wystarczy: ten powiadamiacz nie pokazuje budzika nikomu, a zegar
  // adaptera tokenów odróżnia wyłącznie sesje żywe od wygasłych przy wysyłce.
  const clock = { now: () => new Date() };
  return new Notifier(db, new PgNotificationsRepo(), new PgPushTokensRepo(clock), new FakePush(), randomUUID);
}
