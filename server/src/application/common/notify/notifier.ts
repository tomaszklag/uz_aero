/**
 * Ninerdeck (serwer) - ZAPIS POWIADOMIENIA I BUDZIK (milestone 3.1.0, issue #164;
 * `docs/rezerwacje.md` §12.1).
 *
 * ══ DWA KROKI, BO DWIE RÓŻNE GWARANCJE ══
 * `record()` idzie W TEJ SAMEJ TRANSAKCJI, co rzecz, o której mówi - inaczej prośba
 * o zgodę istnieje, a nikt o niej nie wie (albo odwrotnie: wiadomość o decyzji, której
 * zapis się nie powiódł). `wake()` idzie PO COMMICIE i nie ma prawa niczego przewrócić:
 * push jest budzikiem, a nie treścią, więc jego awaria kosztuje ciszę w telefonie,
 * a nie utraconą decyzję.
 *
 * Rozdzielenie jest widoczne w sygnaturach specjalnie: wołający nie ma jak pomylić
 * kolejności, bo `record` żąda uchwytu transakcji, a `wake` go nie przyjmuje.
 */

import type {
  Database,
  NewNotification,
  NotificationsPort,
  PushPort,
  PushTokensPort,
  Queryable,
} from '../ports.ts';
import type { NotificationDraft } from './bookingNotices.ts';

export class Notifier {
  constructor(
    private readonly db: Database,
    private readonly notifications: NotificationsPort,
    private readonly tokens: PushTokensPort,
    private readonly push: PushPort,
    private readonly newId: () => string,
  ) {}

  /** Wiersze skrzynki - w CUDZEJ transakcji, razem z rzeczą, o której mówią. */
  async record(
    tx: Queryable,
    orgId: string,
    drafts: readonly NotificationDraft[],
    at: Date,
  ): Promise<void> {
    if (drafts.length === 0) return;
    const rows: NewNotification[] = drafts.map((d) => ({
      id: this.newId(),
      pilotId: d.pilotId,
      kind: d.kind,
      payload: d.payload,
    }));
    await this.notifications.insert(tx, orgId, rows, at);
  }

  /**
   * Budzik - PO commicie. NIGDY nie rzuca: wyjątek tutaj znaczyłby, że decyzja
   * o rezerwacji nie powiodła się, bo dostawca push miał przerwę.
   *
   * Martwe tokeny (urządzenie odinstalowało aplikację) kasujemy od razu - inaczej
   * lista rosłaby przy każdej decyzji i przy każdej wysyłce płacilibyśmy za adresy,
   * o których dostawca już powiedział, że ich nie ma.
   */
  async wake(orgId: string, drafts: readonly NotificationDraft[]): Promise<void> {
    if (drafts.length === 0) return;
    try {
      // Jedna wiadomość na URZĄDZENIE, nie na osobę: pilot bywa zalogowany na telefonie
      // i na tablecie klubu, a budzik ma zadzwonić tam, gdzie akurat patrzy.
      const messages = [];
      for (const draft of drafts) {
        for (const token of await this.tokens.byPilots(this.db, [draft.pilotId])) {
          messages.push({
            token,
            title: draft.push.title,
            body: draft.push.body,
            // KLUB w danych budzika (obserwowanie §8, R6): osoba w dwóch klubach dostaje
            // push z klubu B przy aktywnym klubie A, a ekran otwarty tokenem A odpowiedziałby
            // 404. Telefon porównuje ten klub z aktywnym i przy różnicy otwiera skrzynkę
            // z instrukcją zamiast karty, która nie ma jak się wczytać.
            data: { kind: draft.kind, orgId, ...draft.payload },
          });
        }
      }
      if (messages.length === 0) return;

      const { dead } = await this.push.send(messages);
      if (dead.length > 0) await this.tokens.forget(this.db, dead);
    } catch (err) {
      console.error('budzik nie zadzwonił:', err);
    }
  }
}
