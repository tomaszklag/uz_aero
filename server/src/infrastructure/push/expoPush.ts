/**
 * Ninerdeck (serwer) - budzik przez Expo Push API (`PushPort`; `PUSH_PROVIDER=expo`).
 *
 * Jeden punkt HTTP (`POST /--/api/v2/push/send`), JSON w obie strony - więc `fetch`
 * ze stdlib i ZERO zależności, ta sama zasada, co przy poczcie (`resendMail.ts`)
 * i weryfikacji tokenów Google. Wymiana dostawcy to nowy plik obok tego i jedna gałąź
 * w composition root; port zostaje.
 *
 * ══ AWARIA NIE PRZEWRACA NICZEGO ══
 * Inaczej niż `MailPort`: push jest BUDZIKIEM (§12.1), więc niedostarczony budzik nie
 * gubi ani jednej informacji - prośba o zgodę czeka w skrzynce, kompletna i z historią.
 * Dlatego ten adapter NIE RZUCA przy awarii sieci ani przy odmowie dostawcy: zapisuje
 * powód do logu i wraca. Wyjątek tutaj znaczyłby, że zatwierdzenie rezerwacji nie
 * powiodło się, bo Expo miało przerwę - a to jest gorsza odpowiedź niż cisza w telefonie.
 *
 * ══ MARTWY TOKEN WRACA DO WOŁAJĄCEGO ══
 * Expo odpowiada per wiadomość: `DeviceNotRegistered` znaczy, że aplikacji na tym
 * urządzeniu już nie ma. Oddajemy takie tokeny, żeby wiersz zniknął z bazy zamiast
 * obrastać kolejką nieodebranych budzików przy każdej decyzji.
 */

import type { PushMessage, PushPort } from '../../application/common/ports.ts';

/** Punkt wysyłki Expo Push API (v2). */
const SEND_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Termin odpowiedzi dostawcy. Wysyłka stoi PO commicie, ale nadal na ścieżce żądania
 * (pilot czeka na odpowiedź o swojej decyzji), więc dostawca, który nie odpowiada, ma
 * zamienić się w wiersz w logu, a nie w wiszące połączenie.
 */
const TIMEOUT_MS = 10_000;

/**
 * Sufit paczki. Expo przyjmuje do stu wiadomości na żądanie - większa lista dzieli się
 * na kilka, bo krok kroku ścieżki bywa listą kilkudziesięciu osób w dużym klubie.
 */
const BATCH = 100;

/** Wstrzykiwane, żeby test nie chodził do sieci - jak `HttpPost` w `resendMail.ts`. */
export type HttpPost = (
  url: string,
  init: { headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const defaultPost: HttpPost = (url, init) =>
  fetch(url, { method: 'POST', headers: init.headers, body: init.body, signal: init.signal });

/** Odpowiedź Expo: tablica biletów, po jednym na wysłaną wiadomość, W TEJ SAMEJ kolejności. */
interface PushTicket {
  status?: string;
  details?: { error?: string };
}

export class ExpoPush implements PushPort {
  constructor(
    /**
     * Token dostępu z konsoli Expo (`PUSH_ACCESS_TOKEN`) - opcjonalny. Expo przyjmuje
     * wysyłkę bez niego; z nim odrzuca żądania spoza konta, więc na produkcji warto go
     * mieć. Pusty napis znaczy „bez nagłówka", a nie „nagłówek pusty".
     */
    private readonly accessToken: string = '',
    private readonly post: HttpPost = defaultPost,
    private readonly log: (line: string) => void = (line) => console.error(line),
  ) {}

  async send(messages: readonly PushMessage[]): Promise<{ dead: string[] }> {
    const dead: string[] = [];
    for (let i = 0; i < messages.length; i += BATCH) {
      dead.push(...(await this.sendBatch(messages.slice(i, i + BATCH))));
    }
    return { dead };
  }

  private async sendBatch(batch: readonly PushMessage[]): Promise<string[]> {
    let res: Awaited<ReturnType<HttpPost>>;
    try {
      res = await this.post(SEND_URL, {
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken === '' ? {} : { authorization: `Bearer ${this.accessToken}` }),
        },
        body: JSON.stringify(
          batch.map((m) => ({
            to: m.token,
            title: m.title,
            body: m.body,
            data: m.data,
            // Budzik ma obudzić: dźwięk domyślny i wysoki priorytet na Androidzie,
            // bo prośba o zgodę na cudzy lot bywa pilna (termin jest jutro).
            sound: 'default',
            priority: 'high',
            // Kanał Androida zakłada APLIKACJA przy starcie (`infrastructure/push/
            // expoNotifications.ts`, epik R-J) z wysoką ważnością - bez nazwanego kanału
            // system wrzuciłby budzik do kanału domyślnego o ważności, której nie
            // kontrolujemy.
            channelId: 'default',
          })),
        ),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      this.log(`ExpoPush: dostawca nie odpowiedział (${batch.length} szt.): ${String(cause)}`);
      return [];
    }

    if (!res.ok) {
      this.log(`ExpoPush: dostawca odmówił (HTTP ${res.status}, ${batch.length} szt.).`);
      return [];
    }

    return deadTokens(batch, await tickets(res, this.log));
  }
}

/** Bilety z odpowiedzi; pusta lista przy każdym kształcie, którego nie rozumiemy. */
async function tickets(
  res: { text: () => Promise<string> },
  log: (line: string) => void,
): Promise<PushTicket[]> {
  try {
    const parsed = JSON.parse(await res.text()) as { data?: unknown };
    return Array.isArray(parsed.data) ? (parsed.data as PushTicket[]) : [];
  } catch (cause) {
    // Nieczytelna odpowiedź nie ma prawa przewrócić wysyłki ani skasować tokenów:
    // „nie rozumiem" to nie to samo, co „urządzenie zniknęło".
    log(`ExpoPush: nieczytelna odpowiedź dostawcy: ${String(cause)}`);
    return [];
  }
}

/**
 * Tokeny, których urządzenia już nie ma. Bilety przychodzą w KOLEJNOŚCI wiadomości,
 * więc łączymy je po indeksie - Expo nie powtarza w odpowiedzi adresata.
 */
function deadTokens(batch: readonly PushMessage[], list: readonly PushTicket[]): string[] {
  const dead: string[] = [];
  list.forEach((ticket, index) => {
    const token = batch[index]?.token;
    if (token != null && ticket.details?.error === 'DeviceNotRegistered') dead.push(token);
  });
  return dead;
}
