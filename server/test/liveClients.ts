/**
 * Ninerdeck (serwer) - klienci kanału klubu w testach (4.0.0, epik Z-E #246): połączenie
 * `injectWS` z nasłuchem podpiętym przed otwarciem i zbieranie ramek od serwera.
 *
 * Nasłuch MUSI stać przed otwarciem (`onInit`): panel wita od razu po nawiązaniu, więc
 * nasłuch podpięty po `await injectWS(...)` gubiłby powitanie.
 */

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

export type Frame = { type: string; [field: string]: unknown };

/** Zbiera ramki od serwera; `waitFor` bierze także te, które przyszły wcześniej. */
export function listen(ws: WebSocket) {
  const frames: Frame[] = [];
  const waiters: { match: (f: Frame) => boolean; resolve: (f: Frame) => void }[] = [];
  ws.on('message', (data) => {
    const frame = JSON.parse(String(data)) as Frame;
    frames.push(frame);
    for (const waiter of [...waiters]) {
      if (!waiter.match(frame)) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(frame);
    }
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.once('close', (code, reason) => resolve({ code, reason: String(reason) })),
  );
  return {
    frames,
    closed,
    waitFor(match: (f: Frame) => boolean, ms = 1_000): Promise<Frame> {
      const already = frames.find(match);
      if (already != null) return Promise.resolve(already);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ramka nie przyszła')), ms);
        waiters.push({ match, resolve: (f) => (clearTimeout(timer), resolve(f)) });
      });
    },
  };
}

export type LiveInbox = ReturnType<typeof listen>;

export const sendFrame = (ws: WebSocket, frame: unknown): void => ws.send(JSON.stringify(frame));

/** Czeka, aż warunek się spełni - zamknięcie po stronie serwera przychodzi po kliencie. */
export async function waitUntil(check: () => boolean, ms = 2_000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('warunek nie spełnił się w czasie');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Połączenie `injectWS` z nasłuchem podpiętym przed otwarciem. */
export async function connectLive(
  app: FastifyInstance,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ ws: WebSocket; inbox: LiveInbox }> {
  await app.ready();
  let inbox: LiveInbox | null = null;
  const ws = await app.injectWS(path, { headers }, { onInit: (socket) => (inbox = listen(socket)) });
  return { ws, inbox: inbox! };
}
