/**
 * Ninerdeck (serwer) - SKĄD PRZYSZŁO ŻĄDANIE (2.1.0, issue #133 C3; §6).
 *
 * Lista sesji w panelu odpowiada na jedno pytanie: „czy to moje urządzenie". Odpowiada
 * na nie napis, więc musi być krótki i rozpoznawalny - „Android 14 · Pixel 7", a nie
 * czterdzieści znaków `User-Agent`.
 *
 * ══ TELEFON PODAJE SIĘ SAM, PRZEGLĄDARKA NIE ══
 * Aplikacja zna model, system i własną wersję (zbiera je już dziś do zgłoszeń błędów,
 * issue #87) i wysyła je nagłówkiem `X-Ninerdeck-Device`. Przeglądarka nie ma jak - jej
 * `User-Agent` jest od lat zaśmiecony zgodnościowo („Mozilla/5.0 … like Gecko"), więc
 * sklejamy z niego DWA SŁOWA, które człowiek rozpozna: przeglądarka i system.
 *
 * ══ NIEZNANE ZOSTAJE NIEZNANE ══
 * `null` jest normalnym stanem, nie awarią: panel pisze wtedy „urządzenie nieznane".
 * Wypisanie surowego `User-Agent` byłoby gorsze niż nic - nikt go nie czyta, a zajmuje
 * całą kolumnę.
 */

import type { SessionDevice } from '../application/common/ports.ts';

/** Nagłówek aplikacji pilota - ta sama wartość, którą niesie kontekst zgłoszenia błędu. */
export const DEVICE_HEADER = 'x-ninerdeck-device';

/**
 * Sufit długości etykiety. Nagłówek podaje KLIENT, więc jest danymi z zewnątrz: bez
 * ucięcia telefon mógłby wpisać do kolumny kilobajt, a lista sesji rozjechałaby się
 * w panelu. Sto znaków mieści „Android 14 · Pixel 7 · Ninerdeck 2.1.0" z zapasem.
 */
const MAX_LABEL = 100;

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  // Kolejność jest regułą, nie porządkiem alfabetycznym: Edge podaje się też jako Chrome,
  // Chrome jako Safari. Pierwsze trafienie wygrywa, więc bardziej szczegółowe idą wyżej.
  [/\bEdg\//, 'Edge'],
  [/\bOPR\/|\bOpera\//, 'Opera'],
  [/\bChrome\//, 'Chrome'],
  [/\bFirefox\//, 'Firefox'],
  [/\bSafari\//, 'Safari'],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bWindows\b/, 'Windows'],
  // Android zawiera „Linux", więc musi stać przed nim.
  [/\bAndroid\b/, 'Android'],
  [/\biPhone\b|\biPad\b|\biOS\b/, 'iOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

const match = (source: string, table: ReadonlyArray<readonly [RegExp, string]>): string | null =>
  table.find(([pattern]) => pattern.test(source))?.[1] ?? null;

/**
 * `User-Agent` → „Chrome · Windows". Sama przeglądarka albo sam system, gdy drugiego nie
 * da się rozpoznać; `null`, gdy żadnego - wtedy lepiej nie pisać nic.
 */
export function browserLabel(userAgent: string | undefined): string | null {
  if (userAgent == null || userAgent.trim() === '') return null;
  const parts = [match(userAgent, BROWSERS), match(userAgent, SYSTEMS)].filter(
    (part): part is string => part != null,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Nagłówek aplikacji ma pierwszeństwo; bez niego - dwa słowa z `User-Agent`. */
export function deviceLabelFrom(headers: {
  device: string | undefined;
  userAgent: string | undefined;
}): string | null {
  const declared = headers.device?.trim();
  if (declared != null && declared !== '') return declared.slice(0, MAX_LABEL);
  return browserLabel(headers.userAgent);
}

/** Kształt, jakiego potrzebuje ta funkcja - nie cały `FastifyRequest`, żeby dała się testować. */
interface DeviceRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

/**
 * Urządzenie z żądania. Nagłówek podany kilka razy przychodzi tablicą - bierzemy
 * pierwszy, zamiast sklejać: to jest deklaracja klienta o sobie, a nie lista.
 */
export function deviceFrom(req: DeviceRequest): SessionDevice {
  const raw = req.headers[DEVICE_HEADER];
  const device = Array.isArray(raw) ? raw[0] : raw;
  const agent = req.headers['user-agent'];
  return {
    label: deviceLabelFrom({
      device,
      userAgent: Array.isArray(agent) ? agent[0] : agent,
    }),
    ip: req.ip ?? null,
  };
}
