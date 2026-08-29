/**
 * UZ Aero (serwer) - DZIENNIK ŻĄDAŃ na konsoli.
 *
 * Po co: klub uruchamia jeden serwer i chce widzieć, co się na nim dzieje - czy telefon
 * dowozi paczki zdarzeń, czy panel odpytuje to, co powinien, i czy coś nagle zaczęło
 * odpowiadać 4xx. Do tego nie trzeba stosu obserwowalności; wystarczy jedna czytelna
 * linia na żądanie w oknie, w którym serwer wystartował.
 *
 * ══ CO LOGUJEMY, A CZEGO NIE ══
 * Metoda, ścieżka, status, czas i rozmiar żądania. **Nigdy** nagłówków (`authorization`
 * niesie JWT), ciasteczek (sesja panelu), treści żądania ani odpowiedzi: dziennik na
 * konsoli bywa kopiowany do zgłoszeń i wklejany w czacie, a token skopiowany razem
 * z linią loga jest tokenem oddanym. Ścieżkę zapisujemy BEZ query stringu - dziś nie
 * nosi on sekretów, ale to jest miejsce, w którym pierwszy `?token=…` wyciekłby po cichu.
 *
 * ══ DLACZEGO WŁASNY HOOK, A NIE `logger: true` FASTIFY'EGO ══
 * Wbudowany Pino wypisuje JSON-a na żądanie i drugiego na odpowiedź. To jest format dla
 * agregatora logów, a nie dla człowieka patrzącego w konsolę - przy jednym serwerze klubu
 * dwie linie JSON-a na każdy puls telefonu zamieniają okno w szum. Jedna linia po
 * ZAKOŃCZENIU żądania niesie komplet (status i czas), więc nie trzeba jej z niczym łączyć.
 *
 * ══ FORMAT ══
 *   `08:14:32  POST /events                    200   38 ms  1.2 kB`
 *   `08:14:33  GET  /me/task-suggestions       401    2 ms`
 * Czas w UTC, jak wszystkie czasy w tym systemie (`CLAUDE.md`) - inaczej dziennik serwera
 * nie dałby się zestawić z czasami zdarzeń, które w nim widać.
 */

import type { FastifyInstance } from 'fastify';

export interface RequestLogOptions {
  /** Wypisywanie linii; podmieniane w testach. Domyślnie `console.log`. */
  write?: (line: string) => void;
  /** Zegar do stempla; domyślnie systemowy. */
  now?: () => Date;
}

const pad = (value: string | number, width: number): string => String(value).padEnd(width);
const padStart = (value: string | number, width: number): string => String(value).padStart(width);

/** „08:14:32" w UTC - ta sama strefa co czasy zdarzeń. */
function stamp(at: Date): string {
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${p2(at.getUTCHours())}:${p2(at.getUTCMinutes())}:${p2(at.getUTCSeconds())}`;
}

/** „1.2 kB" / „840 B" - rozmiar wejścia, żeby było widać paczki zdarzeń i śladu. */
function size(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return '';
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
}

/** Ścieżka bez query stringu - patrz nota o sekretach na górze pliku. */
export function pathOf(url: string): string {
  const cut = url.indexOf('?');
  return cut === -1 ? url : url.slice(0, cut);
}

/** Jedna linia dziennika. Wydzielona z hooka, żeby dała się sprawdzić bez serwera. */
export function requestLine(input: {
  at: Date;
  method: string;
  url: string;
  status: number;
  ms: number;
  requestBytes: number | null;
}): string {
  const parts = [
    stamp(input.at),
    pad(input.method, 6),
    pad(pathOf(input.url), 34),
    padStart(input.status, 3),
    padStart(`${Math.round(input.ms)} ms`, 8),
    size(input.requestBytes),
  ];
  return parts.join('  ').trimEnd();
}

/**
 * Podpina dziennik do instancji Fastify.
 *
 * Logujemy w `onResponse`, a nie w `onRequest`: dopiero wtedy znamy status i czas, więc
 * jedna linia zamyka temat. Żądanie, które nigdy nie dojdzie do odpowiedzi (zerwane
 * połączenie), zostawia po sobie ciszę i to jest świadomy kompromis - cena za brak
 * dwóch linii na każdy puls telefonu.
 */
export function registerRequestLog(app: FastifyInstance, options: RequestLogOptions = {}): void {
  const write = options.write ?? ((line: string) => console.log(line));
  const now = options.now ?? (() => new Date());

  app.addHook('onResponse', async (req, reply) => {
    const length = Number(req.headers['content-length']);
    write(
      requestLine({
        at: now(),
        method: req.method,
        url: req.url,
        status: reply.statusCode,
        // `elapsedTime` liczy Fastify od przyjęcia żądania - bez własnego stopera.
        ms: reply.elapsedTime,
        requestBytes: Number.isFinite(length) ? length : null,
      }),
    );
  });
}
