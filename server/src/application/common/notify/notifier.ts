/**
 * Ninerdeck (serwer) - ZAPIS POWIADOMIENIA I ROZDZIELNIK (milestone 3.1.0, issue #164;
 * `docs/rezerwacje.md` §12.1; kanał klubu 4.0.0, `docs/kanal-klubu.md` K4, epik Z-E #246).
 *
 * ══ DWA KROKI, BO DWIE RÓŻNE GWARANCJE ══
 * `record()` idzie W TEJ SAMEJ TRANSAKCJI, co rzecz, o której mówi - inaczej prośba
 * o zgodę istnieje, a nikt o niej nie wie (albo odwrotnie: wiadomość o decyzji, której
 * zapis się nie powiódł). `wake()` idzie PO COMMICIE i nie ma prawa niczego przewrócić:
 * ramka i push są budzikami, a nie treścią, więc ich awaria kosztuje ciszę w telefonie,
 * a nie utraconą decyzję.
 *
 * Rozdzielenie jest widoczne w sygnaturach specjalnie: wołający nie ma jak pomylić
 * kolejności, bo `record` żąda uchwytu transakcji, a `wake` go nie przyjmuje.
 *
 * ══ ZAPIS ODDAJE TO, CO ZAPISAŁ ══
 * `record()` zwraca wiadomości, które NAPRAWDĘ trafiły do skrzynki - z identyfikatorem
 * wiersza i jego chwilą - a `wake()` przyjmuje WYŁĄCZNIE takie. Ramka `notification`
 * niesie pozycję skrzynki w kształcie REST, więc budzik musi znać wiersz; przy rozmowie
 * to wiersz ODŚWIEŻONY, nie nowy. Adresat spoza klubu wiersza nie dostaje, więc nie
 * dostaje też ani ramki, ani pusha. Kompilator pilnuje, żeby żaden producent nie
 * zawołał budzika z pominięciem zapisu.
 *
 * ══ ROZDZIELNIK (K4) ══
 * Po commicie wiadomość idzie DWIEMA drogami i nigdy obiema do jednego urządzenia:
 * połączenia osoby W KLUBIE WIADOMOŚCI dostają ramkę `notification`, a push dostają
 * wyłącznie urządzenia, których sesja logowania NIE jest połączona w tym klubie. Osoba
 * połączona w innym klubie dostaje push, a ramki nie: łącze niesie wyłącznie dane klubu,
 * którym się uwierzytelniło, a dzwonek liczy tylko klub aktywny. Gdy ramka nie wyjdzie
 * (awaria odczytu przed wysyłką), push dzwoni do wszystkich - dwa sygnały o jednej
 * wiadomości są lepsze niż cisza.
 */

import { safeZone } from '../../../domain/clubTime.ts';
import { notificationFrame } from '../live/frames.ts';
import type {
  ClubSettingsPort,
  Database,
  LivePort,
  NewNotification,
  NotificationsPort,
  PushMessage,
  PushPort,
  PushTokensPort,
  Queryable,
} from '../ports.ts';
import type { NotificationDraft } from './bookingNotices.ts';
import { inboxItem } from './inboxItem.ts';
import { pushData } from './pushData.ts';

/** Wiadomość, która NAPRAWDĘ trafiła do skrzynki - wyłącznie o takiej dzwoni budzik. */
export interface RecordedNotice extends NotificationDraft {
  /** Wiersz skrzynki; przy rozmowie - wiersz odświeżony, nie nowy. */
  id: string;
  /** Chwila wiersza - ta sama, którą oddaje odczyt skrzynki. */
  createdAt: number;
}

export class Notifier {
  constructor(
    private readonly db: Database,
    private readonly notifications: NotificationsPort,
    private readonly tokens: PushTokensPort,
    private readonly push: PushPort,
    private readonly live: LivePort,
    private readonly clubs: ClubSettingsPort,
    private readonly newId: () => string,
  ) {}

  /** Wiersze skrzynki - w CUDZEJ transakcji, razem z rzeczą, o której mówią. */
  async record(
    tx: Queryable,
    orgId: string,
    drafts: readonly NotificationDraft[],
    at: Date,
  ): Promise<RecordedNotice[]> {
    if (drafts.length === 0) return [];
    const rows: NewNotification[] = drafts.map((d) => ({
      id: this.newId(),
      pilotId: d.pilotId,
      kind: d.kind,
      payload: d.payload,
    }));
    const written = new Set(await this.notifications.insert(tx, orgId, rows, at));
    const recorded: RecordedNotice[] = [];
    drafts.forEach((draft, i) => {
      const id = rows[i]!.id;
      if (written.has(id)) recorded.push({ ...draft, id, createdAt: at.getTime() });
    });
    return recorded;
  }

  /**
   * Wiersz, który ODŚWIEŻA poprzedni nieprzeczytany zamiast dopisywać nowy (4.0.0,
   * `docs/zlecenia.md` §7.3) - rozmowa nie zalewa skrzynki. Budzik idzie mimo to przy
   * KAŻDEJ wiadomości (`wake`): to jest rozmowa, a nie ogłoszenie. Oddaje tablicę (pustą
   * albo z jednym wierszem), żeby wołający podał ją budzikowi tak samo jak wynik `record`.
   */
  async recordCollapsed(
    tx: Queryable,
    orgId: string,
    draft: NotificationDraft,
    collapse: { field: string; value: string },
    at: Date,
  ): Promise<RecordedNotice[]> {
    const id = await this.notifications.collapseUnread(
      tx,
      orgId,
      { id: this.newId(), pilotId: draft.pilotId, kind: draft.kind, payload: draft.payload },
      collapse,
      at,
    );
    return id == null ? [] : [{ ...draft, id, createdAt: at.getTime() }];
  }

  /**
   * Rozdzielnik - PO commicie. NIGDY nie rzuca: wyjątek tutaj znaczyłby, że decyzja
   * o rezerwacji nie powiodła się, bo dostawca push miał przerwę.
   */
  async wake(orgId: string, notices: readonly RecordedNotice[]): Promise<void> {
    if (notices.length === 0) return;
    const framed = await this.frame(orgId, notices);
    await this.ring(orgId, notices, framed);
  }

  /**
   * Ramki do połączeń odbiorców W KLUBIE WIADOMOŚCI. Oddaje, które sesje dostały ramkę -
   * budzik je omija. Pusta mapa po awarii znaczy „push do wszystkich".
   */
  private async frame(
    orgId: string,
    notices: readonly RecordedNotice[],
  ): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
    const framed = new Map<string, ReadonlySet<string>>();
    try {
      const people = [...new Set(notices.map((n) => n.pilotId))].filter((p) =>
        this.live.isConnected(orgId, p),
      );
      if (people.length === 0) return framed;
      const settings = await this.clubs.calendar(this.db, orgId);
      if (settings == null) return framed;
      // Strefa i licznik tak samo, jak liczy je odczyt skrzynki - ramka ma nieść
      // DOKŁADNIE to, co klient zobaczy po otwarciu listy.
      const timezone = safeZone(settings.timezone);
      const unread = new Map<string, number>();
      for (const pilotId of people) {
        unread.set(pilotId, await this.notifications.unreadCount(this.db, orgId, pilotId));
      }
      for (const notice of notices) {
        const count = unread.get(notice.pilotId);
        if (count == null) continue;
        const item = inboxItem(
          {
            id: notice.id,
            kind: notice.kind,
            payload: notice.payload,
            createdAt: notice.createdAt,
            readAt: null,
          },
          timezone,
        );
        if (this.live.sendToPerson(orgId, notice.pilotId, notificationFrame(orgId, item, count)) > 0) {
          framed.set(notice.pilotId, this.live.connectedSessions(orgId, notice.pilotId));
        }
      }
      return framed;
    } catch (err) {
      console.error('ramka powiadomienia nie wyszła:', err);
      return new Map();
    }
  }

  /**
   * Push - do urządzeń, które ramki NIE dostały. Martwe tokeny (urządzenie odinstalowało
   * aplikację) kasujemy od razu - inaczej lista rosłaby przy każdej decyzji i przy każdej
   * wysyłce płacilibyśmy za adresy, o których dostawca już powiedział, że ich nie ma.
   */
  private async ring(
    orgId: string,
    notices: readonly RecordedNotice[],
    framed: ReadonlyMap<string, ReadonlySet<string>>,
  ): Promise<void> {
    try {
      const people = [...new Set(notices.map((n) => n.pilotId))];
      const targets = await this.tokens.byPilots(this.db, orgId, people);
      // Jedna wiadomość na URZĄDZENIE, nie na osobę: pilot bywa zalogowany na telefonie
      // i na tablecie klubu, a budzik ma zadzwonić tam, gdzie akurat patrzy - i NIE tam,
      // gdzie ta sama wiadomość przyszła już ramką kanału (K4).
      const messages: PushMessage[] = [];
      for (const notice of notices) {
        const covered = framed.get(notice.pilotId);
        for (const target of targets) {
          if (target.pilotId !== notice.pilotId || covered?.has(target.sessionId)) continue;
          messages.push({
            token: target.token,
            title: notice.push.title,
            body: notice.push.body,
            // DOKŁADNIE to, co telefon czyta (#228, `pushData.ts`): rodzaj, KLUB
            // i identyfikatory rezerwacji i maszyny - reszta payloadu zostaje w skrzynce,
            // bo pośrednicy (Expo, FCM) nie mają jej po co widzieć. KLUB (obserwowanie §8,
            // R6): osoba w dwóch klubach dostaje push z klubu B przy aktywnym klubie A,
            // a ekran otwarty tokenem A odpowiedziałby 404 - telefon porównuje ten klub
            // z aktywnym i przy różnicy otwiera skrzynkę z instrukcją zamiast karty,
            // która nie ma jak się wczytać.
            data: pushData(orgId, notice),
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
