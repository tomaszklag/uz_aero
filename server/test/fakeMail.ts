/**
 * Ninerdeck (serwer) - atrapa poczty dla testów hasła (`MailPort`).
 *
 * Jedyna atrapa w drodze linku „ustaw hasło": token, skrót, tabela i limit są prawdziwe,
 * a list zamiast do skrzynki trafia do tablicy. Test czyta go stąd i wyjmuje link
 * (`linkIn`) - czyli robi to, co człowiek ze skrzynką, tylko bez skrzynki.
 * `failing = true` symuluje awarię dostawcy (test `502 mail_failed`).
 */

import type { MailMessage, MailPort } from '../src/application/common/ports.ts';

export class FakeMail implements MailPort {
  readonly sent: MailMessage[] = [];
  failing = false;

  async send(message: MailMessage): Promise<void> {
    if (this.failing) throw new Error('poczta nie odpowiada');
    this.sent.push(message);
  }

  /** Ostatni list do adresu (bez względu na wielkość liter); `null` = nic nie wyszło. */
  lastTo(address: string): MailMessage | null {
    const wanted = address.toLowerCase();
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i]!.to.toLowerCase() === wanted) return this.sent[i]!;
    }
    return null;
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/** Token z adresu `…/haslo/#<token>` w treści listu - dokładnie to, co czyta strona `/haslo/`. */
export function tokenIn(message: MailMessage): string {
  const m = /\/haslo\/#([A-Za-z0-9_-]+)/.exec(message.text);
  if (m == null) throw new Error(`list bez linku /haslo/#…:\n${message.text}`);
  return m[1]!;
}
