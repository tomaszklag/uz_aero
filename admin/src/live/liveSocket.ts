/**
 * Ninerdeck - panel: JEDYNE miejsce w kodzie, w którym występuje `WebSocket` (4.0.0,
 * `docs/kanal-klubu.md` §3.4; epik KK-D #246).
 *
 * Reguła jest wykonywalna (`test/architecture.test.ts`) z tego samego powodu, co `fetch`
 * w `api/httpClient.ts`: dopóki połączenie ma jedne drzwi, „skąd przyszła ta ramka" ma
 * zawsze tę samą odpowiedź. Klasa nie zna Reacta ani zapytań - podaje ramki dalej,
 * a co z nimi zrobić, rozstrzyga `useLiveChannel`.
 *
 * Co robi sama:
 *  - **odpowiada na ping serwera** (`pong`) - serwer zamyka połączenie po dwóch cyklach
 *    bez żadnej ramki od klienta;
 *  - **wznawia zerwane połączenie** z rosnącym odstępem i rozrzutem (`reconnect.ts`);
 *  - **pilnuje ciszy**: serwer pinguje co 25 s, więc minuta bez ramki znaczy połączenie
 *    martwe po drodze (uśpiony laptop, zerwana sieć) - zamyka je i łączy się od nowa,
 *    zamiast czekać, aż przeglądarka sama to zauważy;
 *  - **po `bye` NIE wznawia** - powód odmowy rozstrzyga brama REST, a decyzję, czy łączyć
 *    się dalej, podejmuje ten, kto ją zapytał.
 */

import { parseFrame, type LiveFrame } from './frames';
import { reconnectDelay } from './reconnect';

/** Minuta ciszy od serwera = połączenie martwe (serwer pinguje co 25 s). */
export const SILENCE_MS = 60_000;

/** To, czego klasa potrzebuje od gniazda - przeglądarkowy `WebSocket` albo atrapa w testach. */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((data: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface LiveSocketOptions {
  url: string;
  /** Ramki z treścią dla panelu: `changed` i `notification`. */
  onFrame: (frame: Extract<LiveFrame, { type: 'changed' | 'notification' }>) => void;
  /** Połączenie nawiązane; `reconnected` = po zerwaniu, nie pierwsze w tej karcie. */
  onOpen: (reconnected: boolean) => void;
  /** Serwer zamknął połączenie z powodem - gniazdo już się nie wznawia. */
  onBye: (reason: string) => void;
  open?: (url: string) => SocketLike;
  random?: () => number;
  timers?: Timers;
}

/** Przeglądarkowy `WebSocket` w kształcie, którego potrzebuje klasa. */
function browserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const socket: SocketLike = {
    onopen: null,
    onmessage: null,
    onclose: null,
    send: (data) => ws.send(data),
    close: (code) => ws.close(code),
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (event) => socket.onmessage?.(event.data);
  ws.onclose = () => socket.onclose?.();
  return socket;
}

const BROWSER_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Zamknięcie z naszej strony - zwyczajne. */
const CLOSE_NORMAL = 1000;

export class LiveSocket {
  private readonly open: (url: string) => SocketLike;
  private readonly random: () => number;
  private readonly timers: Timers;
  private socket: SocketLike | null = null;
  private running = false;
  private everOpened = false;
  private attempt = 0;
  private retry: unknown = null;
  private silence: unknown = null;

  constructor(private readonly options: LiveSocketOptions) {
    this.open = options.open ?? browserSocket;
    this.random = options.random ?? Math.random;
    this.timers = options.timers ?? BROWSER_TIMERS;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.clearRetry();
    this.clearSilence();
    const socket = this.socket;
    this.socket = null;
    socket?.close(CLOSE_NORMAL);
  }

  private connect(): void {
    const socket = this.open(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      const reconnected = this.everOpened;
      this.everOpened = true;
      this.attempt = 0;
      this.armSilence(socket);
      this.options.onOpen(reconnected);
    };

    socket.onmessage = (data) => {
      if (this.socket !== socket) return;
      this.armSilence(socket);
      const frame = typeof data === 'string' ? parseFrame(data) : null;
      if (frame == null) return;
      switch (frame.type) {
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong' }));
          return;
        case 'bye':
          this.stop();
          this.options.onBye(frame.reason);
          return;
        case 'changed':
        case 'notification':
          this.options.onFrame(frame);
          return;
        default:
          return;
      }
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearSilence();
      if (this.running) this.reconnectLater();
    };
  }

  private reconnectLater(): void {
    this.retry = this.timers.set(() => {
      this.retry = null;
      if (this.running) this.connect();
    }, reconnectDelay(this.attempt++, this.random));
  }

  /**
   * Cisza ZAMYKA i od razu planuje wznowienie, nie czeka na `close`: przy zerwanej sieci
   * przeglądarka potrafi zgłosić koniec połączenia dopiero po długim czasie, a do tego
   * czasu panel stałby bez odświeżeń. Odłączone gniazdo nie ma już głosu - jego późne
   * `close` trafia w warunek `this.socket !== socket`.
   */
  private armSilence(socket: SocketLike): void {
    this.clearSilence();
    this.silence = this.timers.set(() => {
      this.silence = null;
      if (this.socket !== socket) return;
      this.socket = null;
      socket.close(CLOSE_NORMAL);
      if (this.running) this.reconnectLater();
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
