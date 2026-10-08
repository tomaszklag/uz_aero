/**
 * Ninerdeck (serwer) - SYGNAŁY KANAŁU KLUBU o zleceniu i rozmowie (4.0.0, issue #245;
 * `docs/zlecenia.md` §11, `docs/kanal-klubu.md` §4).
 *
 * Wołane PO commicie, obok budzika, i nigdy nie rzucają: kanał nie jest źródłem prawdy
 * (K2), więc zgubiony sygnał kosztuje najwyżej odświeżenie o jedno wejście później.
 * Rozsyłanie przychodzi z Z-E (#246) - do tego czasu port jest atrapą, a te same wywołania
 * zaczną działać bez zmiany w komendach.
 *
 * ══ KTO DOSTAJE CO (§11) ══
 *  - `order:<id>` i `orders` - autor, adresaci niewykreśleni, przydzieleni i każdy
 *    z `reservations.manage` (prowadzą wszystkie zlecenia, pkt 20). Kształt karty zależy
 *    od widza, więc sygnał nie niesie treści - ekran pobiera ją RESTem (§13.1);
 *  - `booking:<id>`, `calendar:<doba klubu>` i `aircraft:<id>` - jak przy KAŻDEJ
 *    rezerwacji, bo zlecenie JEST rezerwacją: tematy terminu liczy `ClubSignals` (doba
 *    strefą klubu, karta samolotu dla obserwujących). Otwarcie karty przez adresata
 *    („Odczytane") terminu nie zmienia i ogłasza WYŁĄCZNIE tematy zlecenia (`seen`);
 *  - `message` i `read` - uczestnicy wątku (autor i adresat) i czytający z
 *    `reservations.manage` (pkt 19).
 */

import { topic } from '../live/topics.ts';
import type { LoadedOrder } from '../orderRecords.ts';
import type { LiveAudience, LiveSignalsPort, ThreadMessageRecord } from '../ports.ts';
import type { ClubSignals, TermSpan } from './clubSignals.ts';

const MANAGERS: LiveAudience = { kind: 'capability', capability: 'reservations.manage' };

export class OrderSignals {
  constructor(
    private readonly live: LiveSignalsPort,
    private readonly club: ClubSignals,
  ) {}

  /**
   * Zmiana zlecenia i jego terminu. `extra` - osoby, którym ta zmiana ODEBRAŁA zlecenie:
   * nie są już adresatami niewykreślonymi, a ich otwarta karta ma się odświeżyć do
   * „cofnięte". `before` - termin i maszyna SPRZED edycji, gdy się zmieniły: stara doba
   * i stara karta samolotu też mają się odświeżyć.
   */
  async changed(
    orgId: string,
    loaded: LoadedOrder,
    extra: readonly string[] = [],
    before: TermSpan | null = null,
  ): Promise<void> {
    this.seen(orgId, loaded, extra);
    await this.club.booking(orgId, loaded.booking, before);
  }

  /**
   * Wyłącznie tematy zlecenia - „Odczytane" u prowadzącego. Termin się nie zmienił, więc
   * kalendarz całego klubu nie ma czego czytać od nowa.
   */
  seen(orgId: string, loaded: LoadedOrder, extra: readonly string[] = []): void {
    this.safely(() => {
      const people = audienceOf(loaded, extra);
      this.live.changed(orgId, [topic.order(loaded.order.id), topic.orders], [{ kind: 'people', pilotIds: people }, MANAGERS]);
    });
  }

  /** Nowa wiadomość w rozmowie - w całości, w kształcie REST (ramka `message`). */
  message(
    orgId: string,
    thread: { orderId: string; recipientId: string; participantIds: readonly string[] },
    message: ThreadMessageRecord,
  ): void {
    this.safely(() =>
      this.live.message(orgId, [{ kind: 'people', pilotIds: thread.participantIds }, MANAGERS], {
        orderId: thread.orderId,
        recipientId: thread.recipientId,
        message: {
          id: message.id,
          threadId: message.threadId,
          authorId: message.authorId,
          body: message.body,
          createdAt: new Date(message.createdAt).toISOString(),
        },
      }),
    );
  }

  /** Uczestnik przeczytał rozmowę - „Odczytane 14:05" (ramka `read`). */
  read(
    orgId: string,
    thread: { orderId: string; recipientId: string; participantIds: readonly string[] },
    reader: { pilotId: string; at: Date },
  ): void {
    this.safely(() =>
      this.live.read(orgId, [{ kind: 'people', pilotIds: thread.participantIds }, MANAGERS], {
        orderId: thread.orderId,
        recipientId: thread.recipientId,
        pilotId: reader.pilotId,
        at: reader.at.toISOString(),
      }),
    );
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error('sygnał kanału klubu nie wyszedł:', err);
    }
  }
}

/** Autor, adresaci niewykreśleni, przydzieleni i `extra` - bez powtórzeń. */
function audienceOf(loaded: LoadedOrder, extra: readonly string[]): string[] {
  const ids = [
    loaded.order.createdBy,
    ...loaded.recipients.filter((r) => r.removedAt == null).map((r) => r.pilotId),
    loaded.booking.pilotId,
    loaded.booking.dualId,
    ...extra,
  ];
  return [...new Set(ids.filter((id): id is string => id != null))];
}
