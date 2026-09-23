/**
 * Ninerdeck (serwer) - budzik „do konsoli" (`PushPort`; `PUSH_PROVIDER=log`).
 *
 * Adapter dla dev: powiadomienie ląduje w logu serwera zamiast na telefonie. W odróżnieniu
 * od `LogMail` (który drukuje TOKEN linku i dlatego nie ma prawa stać na produkcji) ten
 * adapter nie wypuszcza niczego tajnego - push jest budzikiem, a treść i tak stoi
 * w skrzynce. Dlatego jest też WARTOŚCIĄ DOMYŚLNĄ `PUSH_PROVIDER` (§12.3): serwer, który
 * nie wstaje przez brak budzika, kosztuje więcej niż budzik, który nie dzwoni.
 */

import type { PushMessage, PushPort } from '../../application/common/ports.ts';

export class LogPush implements PushPort {
  constructor(private readonly write: (line: string) => void = (line) => console.log(line)) {}

  async send(messages: readonly PushMessage[]): Promise<{ dead: string[] }> {
    for (const message of messages) {
      this.write(
        [
          '──── PUSH (PUSH_PROVIDER=log) ────',
          `Do:     ${message.token}`,
          `Tytuł:  ${message.title}`,
          `Treść:  ${message.body}`,
          `Dane:   ${JSON.stringify(message.data)}`,
          '──────────────────────────────────',
        ].join('\n'),
      );
    }
    // Konsola nie odrzuca tokenów, więc martwych nie ma - i to jest uczciwa odpowiedź,
    // a nie zaślepka: w dev nikt nie odinstalował aplikacji, do której piszemy.
    return { dead: [] };
  }
}
