/**
 * Ninerdeck (serwer) - poczta „do konsoli" (`MailPort`; `MAIL_PROVIDER=log`).
 *
 * Adapter dla dev: list ląduje w logu serwera zamiast w skrzynce, więc link „ustaw
 * hasło" da się kliknąć z terminala. To JEDYNE miejsce poza poleceniem CLI, w którym
 * token linku opuszcza serwer inaczej niż pocztą (§8 pkt 4) - i dlatego ten adapter
 * nie ma prawa stać na produkcji: composition root wybiera go wyłącznie z jawnego
 * `MAIL_PROVIDER=log`. Adapter dostawcy przez `fetch` przychodzi w epiku H-F.
 */

import type { MailMessage, MailPort } from '../../application/common/ports.ts';

export class LogMail implements MailPort {
  constructor(private readonly write: (line: string) => void = (line) => console.log(line)) {}

  async send(message: MailMessage): Promise<void> {
    this.write(
      [
        '──── POCZTA (MAIL_PROVIDER=log) ────',
        `Do:     ${message.to}`,
        `Temat:  ${message.subject}`,
        '',
        message.text,
        '────────────────────────────────────',
      ].join('\n'),
    );
  }
}
