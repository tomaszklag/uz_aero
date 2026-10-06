/**
 * Ninerdeck - TRANSPORT HTTP wspólny dla adapterów serwera (`HttpServerApi`, `HttpOrderApi`).
 *
 * Wydzielony przy zleceniach (4.0.0, epik Z-C #247): drugi adapter potrzebował tego samego
 * wysłania żądania, a kopia rozjechałaby się przy pierwszej poprawce limitu albo nagłówka.
 * Tłumaczy świat HTTP na jeden rodzaj niepowodzenia transportu - wyjątek fetch / timeout
 * → `ServerUnreachableError`, normalny stan pracy w terenie. Co zrobić z odpowiedzią poza
 * 2xx, rozstrzyga adapter (`request` zamienia ją w `ServerRejectedError(status, code)`).
 *
 * DWA LIMITY CZASU, bo dwa różne pytania (uwaga z urządzenia, 2026-08-30).
 * W tle limit jest krótki: pętla okazji woła nas co minutę, więc lepiej szybko
 * powiedzieć „offline" i wrócić za chwilę, niż wisieć na słabym zasięgu i blokować
 * kolejne okazje. Pod przyciskiem „PONÓW PRÓBĘ" ten sam rachunek jest odwrotny -
 * nikt nie wróci za minutę, bo to pilot właśnie poprosił i patrzy na ekran, a poprosił
 * dokładnie wtedy, gdy długo nic nie szło, czyli gdy serwer zdążył się uśpić.
 * Zimny start bywa dłuższy niż 8 s i to zamieniało udaną wysyłkę w „brak sieci":
 * telefon przerywał, serwer w tym samym czasie przyjmował paczkę i zapisywał ją,
 * a w logach API zostawał sukces przy pilotze patrzącym na napis OFFLINE.
 *
 * Który limit obowiązuje, wynika z `SyncTrigger` - warstwa aplikacji mówi, KTO
 * poprosił, a sekundy zostają tutaj, bo są własnością transportu.
 */

import { ServerRejectedError, ServerUnreachableError } from '../../application/ports';
import type { SyncTrigger } from '../../application/ports';

/** Pętla okazji - krótko, bo zaraz wróci. */
export const TIMEOUT_MS = 8_000;
/** Ponowienie z ręki pilota - tyle, ile trwa obudzenie uśpionej instancji. */
export const MANUAL_TIMEOUT_MS = 30_000;

export function timeoutFor(trigger: SyncTrigger | undefined): number {
  return trigger === 'manual' ? MANUAL_TIMEOUT_MS : TIMEOUT_MS;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SendOptions {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Brak = limit tła; patrz nota na górze pliku. */
  timeoutMs?: number;
}

export class HttpTransport {
  /**
   * `device` to napis, po którym CZŁOWIEK rozpozna swój tablet na liście sesji
   * w panelu („Android 14 · Pixel 7 · Ninerdeck 2.1.0"). Jedzie z KAŻDYM żądaniem,
   * bo serwer używa go dwa razy: przy zakładaniu sesji i przy odświeżaniu stempla
   * „ostatnio aktywny" w bramie (2.1.0, §6).
   *
   * Podaje go WOŁAJĄCY, a nie ten transport: model i wersję zna React Native, a warstwa
   * infrastruktury nie importuje UI (`architecture.test.ts`). `null` = nie wiemy -
   * wtedy nagłówka po prostu nie ma i panel napisze „urządzenie nieznane", zamiast
   * dostać zmyśloną nazwę.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly device: string | null = null,
  ) {}

  /** Odczyt z ciałem JSON; odpowiedź poza 2xx → `ServerRejectedError` z kodem z ciała. */
  async request<T>(method: HttpMethod, path: string, options: SendOptions): Promise<T> {
    const response = await this.send(method, path, options);
    if (!response.ok) {
      const code = await errorCode(response);
      throw new ServerRejectedError(response.status, code);
    }
    return (await response.json()) as T;
  }

  /**
   * Surowe wysłanie żądania: mapuje wyłącznie awarie SIECI (`ServerUnreachableError`);
   * interpretację statusu zostawia wołającemu - `getReference` musi odróżnić 304 od błędu.
   */
  async send(method: HttpMethod, path: string, options: SendOptions): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...(options.body != null ? { 'content-type': 'application/json' } : {}),
          ...(options.token != null ? { authorization: `Bearer ${options.token}` } : {}),
          // Telefon PODAJE SIĘ SAM - przeglądarka nie ma jak, więc serwer składa jej
          // etykietę z `User-Agent`. Nasza jest krótka i rozpoznawalna, bo ma
          // odpowiedzieć na jedno pytanie: „czy to moje urządzenie".
          ...(this.device != null ? { 'x-ninerdeck-device': this.device } : {}),
          ...options.headers,
        },
        ...(options.body != null ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch (error) {
      throw new ServerUnreachableError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Kod błędu z ciała odpowiedzi; brak/nie-JSON → sam status wystarczy. */
export async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `http_${response.status}`;
  } catch {
    return `http_${response.status}`;
  }
}
