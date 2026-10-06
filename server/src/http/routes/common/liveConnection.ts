/**
 * Ninerdeck (serwer) - POŁĄCZENIE KANAŁU KLUBU po uwierzytelnieniu (4.0.0,
 * `docs/kanal-klubu.md` §3.1, §3.2, §5; epik Z-E #246).
 *
 * Wspólne dla obu wejść - telefonu (`mobile/live.ts`) i panelu (`admin/live.ts`). Wejścia
 * różnią się WYŁĄCZNIE tym, jak połączenie dowodzi tożsamości; od chwili, w której rejestr
 * zna osobę, klub i sesję, protokół jest jeden:
 *  - `hello` na powitanie - sesja i czas serwera;
 *  - `bye token_expired` w chwili wygaśnięcia tokenu, którym połączenie otwarto;
 *  - ping serwera co 25 s; DWA cykle bez żadnej ramki od klienta zamykają połączenie.
 *    Pośrednicy hostingu zamykają bezczynne połączenia, a martwe połączenie trzymałoby
 *    w rejestrze sesję „połączoną" i wstrzymywało jej push (K4);
 *  - od klienta WYŁĄCZNIE `ping` i `pong` (K2) - kanał niczego nie zapisuje. Ramka
 *    poprawnego kształtu, ale nieznanego typu, jest ignorowana: starszy serwer nie wywraca
 *    się na nowszym kliencie. Ramka, która nie jest obiektem JSON z `type`, binarna, za duża
 *    (limit wtyczki) albo za częsta - zamyka połączenie.
 */

import type { RawData, WebSocket } from 'ws';

import { byeFrame, helloFrame, pingFrame, pongFrame } from '../../../application/common/live/frames.ts';
import type { Clock, LiveByeReason, LiveFrame, LivePeer, LivePort } from '../../../application/common/ports.ts';
import { FrameRate } from './liveRate.ts';

/** Czasy i limity połączenia - w produkcji stałe z dokumentu, w testach skrócone. */
export interface LiveTiming {
  /** Telefon: czas na ramkę `auth` (§3.1). */
  authTimeoutMs: number;
  /** Ping serwera (§3.1); dwa cykle bez odpowiedzi zamykają połączenie. */
  pingIntervalMs: number;
  /** Tempo ramek od klienta - najwyżej `frames` w oknie `windowMs`. */
  rate: { frames: number; windowMs: number };
  /** Największa ramka od klienta w bajtach - limit wtyczki, sprawdzany przed parsowaniem. */
  maxPayload: number;
}

export const LIVE_TIMING: LiveTiming = {
  authTimeoutMs: 5_000,
  pingIntervalMs: 25_000,
  rate: { frames: 20, windowMs: 10_000 },
  maxPayload: 4_096,
};

/** Zamknięcie po ramce `bye` - zwyczajne, powód niesie ramka. */
export const CLOSE_NORMAL = 1000;
/** Naruszenie protokołu: brak `auth`, zły kształt, binarna, za częsta. */
export const CLOSE_POLICY = 1008;

/** Ramka od klienta po odczytaniu - `null` = nie jest obiektem JSON z napisem `type`. */
export interface ClientFrame {
  type: string;
  [field: string]: unknown;
}

export function parseClientFrame(data: RawData, isBinary: boolean): ClientFrame | null {
  if (isBinary) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
  } catch {
    return null;
  }
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' ? (value as ClientFrame) : null;
}

export function sendFrame(socket: WebSocket, frame: LiveFrame): void {
  socket.send(JSON.stringify(frame));
}

/** `bye` z powodem i zwyczajne zamknięcie - klient robi to, co przy tej samej odmowie REST. */
export function sayBye(socket: WebSocket, reason: LiveByeReason): void {
  sendFrame(socket, byeFrame(reason));
  socket.close(CLOSE_NORMAL, reason);
}

/**
 * Najdłuższe opóźnienie `setTimeout` - dłuższe Node skraca po cichu do 1 ms, czyli
 * zamknąłby połączenie od razu. Token żyje najwyżej 8 h, więc to wyłącznie bezpiecznik.
 */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Ile połączenie ma jeszcze żyć - od teraz do terminu tokenu, nie mniej niż zero. */
export function untilExpiry(expiresAt: Date, now: Date): number {
  return Math.min(Math.max(expiresAt.getTime() - now.getTime(), 0), MAX_TIMER_MS);
}

/**
 * Połączenie PO uwierzytelnieniu: wpis w rejestrze, powitanie, ping i odbiór ramek.
 * Koniec połączenia - z którejkolwiek strony - odłącza je od rejestru.
 *
 * ══ POŁĄCZENIE NIE PRZEŻYWA TOKENU, KTÓRYM JE OTWARTO ══
 * Brama sprawdza połączenie raz, przy nawiązaniu; REST - przy każdym żądaniu. O każdym
 * odebraniu dostępu, które zna serwer, kanał mówi sam (`LiveAccess`), a termin tokenu
 * jest granicą dla wszystkiego, czego nie zna: w chwili `exp` przychodzi `bye
 * token_expired`, telefon odświeża parę tokenów i łączy się ponownie - przez bramę,
 * która widzi stan bieżący. Panel po ośmiu godzinach i tak loguje się od nowa.
 */
export function serveLive(
  socket: WebSocket,
  live: LivePort,
  peer: LivePeer,
  expiresAt: Date,
  timing: LiveTiming,
  clock: Clock,
): void {
  const detach = live.attach(peer, {
    send: (frame) => sendFrame(socket, frame),
    close: (reason) => sayBye(socket, reason),
  });
  sendFrame(socket, helloFrame(peer.sessionId, clock.now()));

  const expiry = setTimeout(() => {
    detach();
    sayBye(socket, 'token_expired');
  }, untilExpiry(expiresAt, clock.now()));

  let unanswered = 0;
  const ping = setInterval(() => {
    if (unanswered >= 2) {
      socket.terminate();
      return;
    }
    unanswered += 1;
    sendFrame(socket, pingFrame());
  }, timing.pingIntervalMs);

  const rate = new FrameRate(timing.rate);
  socket.on('message', (data, isBinary) => {
    // Każda ramka od klienta dowodzi, że połączenie żyje - nie tylko `pong`.
    unanswered = 0;
    const frame = parseClientFrame(data, isBinary);
    if (frame == null || !rate.allow(clock.now().getTime())) {
      socket.close(CLOSE_POLICY, frame == null ? 'bad_frame' : 'too_fast');
      return;
    }
    if (frame.type === 'ping') sendFrame(socket, pongFrame());
    // `pong` i każdy inny typ - bez odpowiedzi (§3.2).
  });

  socket.on('close', () => {
    clearInterval(ping);
    clearTimeout(expiry);
    detach();
  });
}
