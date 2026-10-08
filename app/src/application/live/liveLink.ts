/**
 * Ninerdeck - ŁĄCZE KANAŁU KLUBU w aplikacji pilota (4.0.0, `docs/kanal-klubu.md` §3.1,
 * §3.4, §5, K1, K6; epik KK-C #246).
 *
 * JEDNO połączenie na telefon (K1) niesie powiadomienia i sygnały odświeżenia dla
 * wszystkich ekranów. Klasa nie zna Reacta, `AppState`, nawigacji ani gniazda platformy
 * (`WebSocket` ma w aplikacji jeden plik - `infrastructure/live/liveSocket.ts`). KIEDY
 * łącze ma stać, rozstrzyga `linkTarget` (na wierzchu, po odblokowaniu, poza kokpitem),
 * a woła `start`/`stop` binder w UI. Co zrobić z ramką, rozstrzyga ten, kto ją dostał
 * (szyna `LiveBus`).
 *
 * Co robi sama:
 *  - **uwierzytelnia się PIERWSZĄ RAMKĄ** (`auth` z tokenem klubu), nigdy w adresie -
 *    adres ląduje w dziennikach żądań hostingu. Serwer czeka na nią 5 s;
 *  - **liczy połączenie od powitania** (`hello`), nie od otwarcia gniazda: dopiero ono
 *    znaczy, że serwer wpuścił, i dopiero wtedy ekrany mogą ufać, że nic im nie umknie;
 *  - **odpowiada na ping** (`pong`): serwer zamyka połączenie po dwóch cyklach bez ramki
 *    od telefonu, a martwe połączenie wstrzymywałoby push tej sesji (K4);
 *  - **podaje dalej wyłącznie ramki SWOJEGO klubu** - poświadczenie jest poświadczeniem
 *    klubu, więc ramka innego nie ma prawa się tu znaleźć (§5); gdyby jednak, ginie;
 *  - **wznawia zerwane połączenie** z rosnącym odstępem i rozrzutem (`reconnect.ts`);
 *  - **pilnuje ciszy**: serwer pinguje co 25 s, więc minuta bez ramki - także po otwarciu,
 *    przed powitaniem - znaczy połączenie martwe po drodze (zmiana sieci, uśpione radio),
 *    o którym system potrafi powiedzieć bardzo późno albo wcale;
 *  - **na każde `bye` odświeża parę tokenów** - tak, jak REST robi to po 401 (§5). Token
 *    wygasł (`token_expired`, co godzinę) → nowa para i od razu ponowne połączenie.
 *    Sesję zerwał administrator (`session_revoked`) → odświeżenie odmawia i to ONO stawia
 *    znacznik zdalnego wylogowania (2.1.0, D7); łącze tylko melduje go wyżej i staje.
 *    Świeży token odrzucony jeszcze przed powitaniem to stan, którego odświeżenie nie
 *    naprawi (członkostwo wyłączone) - łącze staje zamiast kręcić się w kółko, a resztę
 *    powie REST przy najbliższej okazji synchronizacji.
 *
 * Odświeżenia tokenów z łącza i z pętli synca w tej samej chwili dzielą jedno wywołanie
 * serwera (`AuthService.rotate`) - serwer zużywa refresh atomowo, a drugie wywołanie tym
 * samym tokenem dostałoby odmowę, którą łącze wzięłoby za koniec poświadczeń.
 */

import type { AuthService } from '../auth/authService';
import type { LiveConnection, LiveSocketPort } from '../ports';
import { parseFrame, type LiveDataFrame } from './frames';
import { reconnectDelay } from './reconnect';
import { GLOBAL_TIMERS, type Timers } from './timers';

/** Minuta ciszy od serwera = połączenie martwe (serwer pinguje co 25 s). */
export const SILENCE_MS = 60_000;

/** Zamknięcie z naszej strony - zwyczajne. */
const CLOSE_NORMAL = 1000;

/** To, czego łącze potrzebuje od serwisu poświadczeń - w testach atrapa. */
export type LiveAuth = Pick<AuthService, 'freshToken' | 'rotate' | 'revoked'>;

export interface LiveLinkOptions {
  url: string;
  auth: LiveAuth;
  sockets: LiveSocketPort;
  /**
   * Ramki z treścią: `changed`, `notification` i rozmowy zleceń (`message`, `read`) -
   * wyłącznie klubu, dla którego łącze stoi.
   */
  onFrame: (frame: LiveDataFrame) => void;
  /**
   * Serwer przywitał połączenie - KAŻDE, także pierwsze: telefon łączy się przy każdym
   * powrocie z tła, a pierwsze połączenie po starcie bez zasięgu przychodzi dopiero
   * z zasięgiem. W obu przypadkach ekrany mają dociągnąć to, co ominęło je bez łącza.
   */
  onOpen: () => void;
  /** Sesję zerwano zdalnie (D7) - łącze stoi, aż pilot zaloguje się ponownie. */
  onRevoked: () => void;
  random?: () => number;
  timers?: Timers;
}

export class LiveLink {
  private readonly random: () => number;
  private readonly timers: Timers;
  /** Klub, dla którego łącze ma stać; `null` = zatrzymane. */
  private orgId: string | null = null;
  /**
   * Rośnie przy każdym `start` i `stop`. Kontynuacja asynchroniczna (odczyt tokenu,
   * odświeżenie) i zaplanowane wznowienie poznają po nim, że ich świat już minął.
   */
  private generation = 0;
  private socket: LiveConnection | null = null;
  private attempt = 0;
  /** Bieżący token wydało odświeżenie po `bye`, a serwer jeszcze go nie przywitał. */
  private freshTokenOnTrial = false;
  private retry: unknown = null;
  private silence: unknown = null;

  constructor(private readonly options: LiveLinkOptions) {
    this.random = options.random ?? Math.random;
    this.timers = options.timers ?? GLOBAL_TIMERS;
  }

  /** Łącze ma stać dla tego klubu. Ten sam klub - nic; inny - nowe połączenie od zera. */
  start(orgId: string): void {
    if (this.orgId === orgId) return;
    this.stop();
    this.orgId = orgId;
    void this.connect(this.generation);
  }

  /** Rozłącza bez wznowień - aplikacja w tle, kokpit, zamek, wylogowanie. */
  stop(): void {
    this.orgId = null;
    this.generation += 1;
    this.attempt = 0;
    this.freshTokenOnTrial = false;
    this.clearRetry();
    this.clearSilence();
    const socket = this.socket;
    this.socket = null;
    socket?.close(CLOSE_NORMAL);
  }

  private async connect(generation: number): Promise<void> {
    let token: string | null;
    try {
      token = await this.options.auth.freshToken();
    } catch {
      // Magazyn poświadczeń nie odpowiedział - to nie jest odmowa, spróbujemy później.
      if (generation === this.generation) this.reconnectLater(generation);
      return;
    }
    if (generation !== this.generation) return;
    if (token == null) {
      // Bez poświadczeń nie ma czym się uwierzytelnić - łącze wróci z nowym `start`.
      this.stop();
      return;
    }
    this.open(token, generation);
  }

  private open(token: string, generation: number): void {
    const socket = this.options.sockets.open(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      socket.send(JSON.stringify({ type: 'auth', token }));
      this.armSilence(socket, generation);
    };

    socket.onmessage = (data) => {
      if (this.socket !== socket) return;
      this.armSilence(socket, generation);
      const frame = typeof data === 'string' ? parseFrame(data) : null;
      if (frame == null) return;
      switch (frame.type) {
        case 'hello':
          this.attempt = 0;
          this.freshTokenOnTrial = false;
          this.options.onOpen();
          return;
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong' }));
          return;
        case 'bye':
          this.detach(socket);
          void this.afterBye(generation);
          return;
        case 'changed':
        case 'notification':
        case 'message':
        case 'read':
          if (frame.org === this.orgId) this.options.onFrame(frame);
          return;
        default:
          return;
      }
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearSilence();
      this.reconnectLater(generation);
    };
  }

  /** Odświeżenie tokenów po `bye` - ta sama droga, co REST po 401. */
  private async afterBye(generation: number): Promise<void> {
    if (this.freshTokenOnTrial) {
      this.stop();
      return;
    }

    let token: string | null;
    try {
      token = await this.options.auth.rotate();
    } catch {
      // Brak sieci przy odświeżeniu - „spróbuj później", nie odmowa.
      if (generation === this.generation) this.reconnectLater(generation);
      return;
    }
    if (generation !== this.generation) return;
    if (token != null) {
      this.freshTokenOnTrial = true;
      this.open(token, generation);
      return;
    }

    let revoked = false;
    try {
      revoked = await this.options.auth.revoked();
    } catch {
      revoked = false;
    }
    if (generation !== this.generation) return;
    this.stop();
    if (revoked) this.options.onRevoked();
  }

  /** Gniazdo przestaje mieć głos: jego spóźnione zdarzenia trafiają w `this.socket !== socket`. */
  private detach(socket: LiveConnection): void {
    this.socket = null;
    this.clearSilence();
    socket.close(CLOSE_NORMAL);
  }

  private reconnectLater(generation: number): void {
    this.clearRetry();
    this.retry = this.timers.set(() => {
      this.retry = null;
      if (generation === this.generation) void this.connect(generation);
    }, reconnectDelay(this.attempt++, this.random));
  }

  /**
   * Cisza ZAMYKA i od razu planuje wznowienie, nie czeka na `close`: przy zerwanej sieci
   * system potrafi zgłosić koniec połączenia dopiero po długim czasie, a do tego czasu
   * ekrany stałyby bez odświeżeń.
   */
  private armSilence(socket: LiveConnection, generation: number): void {
    this.clearSilence();
    this.silence = this.timers.set(() => {
      this.silence = null;
      if (this.socket !== socket) return;
      this.detach(socket);
      this.reconnectLater(generation);
    }, SILENCE_MS);
  }

  private clearSilence(): void {
    if (this.silence == null) return;
    this.timers.clear(this.silence);
    this.silence = null;
  }

  private clearRetry(): void {
    if (this.retry == null) return;
    this.timers.clear(this.retry);
    this.retry = null;
  }
}
