/**
 * Ninerdeck (serwer) - poczta wychodząca przez Resend (`MailPort`; `MAIL_PROVIDER=resend`).
 *
 * Jeden punkt HTTP (`POST /emails`), JSON w obie strony - więc `fetch` ze stdlib i ZERO
 * zależności, ta sama zasada, co przy weryfikacji tokenów Google (`googleIdTokens.ts`):
 * SDK dostawcy dokłada drzewo paczek i własny cykl wydawniczy za wywołanie, które mieści
 * się w dwudziestu liniach. Wymiana dostawcy (Brevo, Postmark) to nowy plik obok tego
 * i jedna gałąź w composition root - port zostaje.
 *
 * ══ AWARIA = WYJĄTEK ══
 * Zgodnie z `MailPort`: to wołający decyduje, czy niedoręczony list jest `502`, czy cichą
 * odmową (§5.4 - „Nie pamiętam hasła" odpowiada `202` także dla adresu nieznanego, więc
 * nie ma prawa zdradzić awarii inaczej niż wspólnym błędem). Tutaj wyjątek leci ZAWSZE
 * przy odpowiedzi innej niż 2xx i przy braku odpowiedzi w terminie.
 *
 * ══ CZEGO NIE MA W KOMUNIKACIE BŁĘDU ══
 * Ani klucza API, ani treści listu: treść niesie token linku „ustaw hasło", a komunikat
 * błędu ląduje w logu hostingu, czyli w miejscu, w którym tokenu być nie może (§8 pkt 4 -
 * poza pocztą token opuszcza serwer wyłącznie przez `MAIL_PROVIDER=log` i `seed --reset-link`).
 * Do logu idzie status, nazwa błędu dostawcy i adresat - tyle, ile trzeba, żeby wiedzieć,
 * czy to zła domena nadawcy, wyczerpany limit, czy padł dostawca.
 */

import type { MailMessage, MailPort } from '../../application/common/ports.ts';

/** Punkt wysyłki Resend (API v1). */
const SEND_URL = 'https://api.resend.com/emails';

/**
 * Termin odpowiedzi dostawcy. Wysyłka stoi na ścieżce żądania HTTP („Nie pamiętam hasła"
 * czeka na `202`), więc dostawca, który nie odpowiada, ma zamienić się w błąd, a nie
 * w wiszące połączenie. 10 s to z zapasem ponad normalny czas odpowiedzi Resend.
 */
const TIMEOUT_MS = 10_000;

/** Wstrzykiwane, żeby test nie chodził do sieci - jak `JwksFetch` w `googleIdTokens.ts`. */
export type HttpPost = (
  url: string,
  init: { headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const defaultPost: HttpPost = (url, init) =>
  fetch(url, { method: 'POST', headers: init.headers, body: init.body, signal: init.signal });

export class ResendMail implements MailPort {
  /**
   * @param apiKey klucz z konsoli Resend (`MAIL_API_KEY`).
   * @param from nadawca w postaci `Nazwa <adres@domena>` albo samego adresu (`MAIL_FROM`).
   *   Domena musi być zweryfikowana u dostawcy (SPF + DKIM), inaczej Resend odrzuca
   *   wysyłkę - i właśnie dlatego to jest zmienna, a nie stała w kodzie: adres nadawcy
   *   należy do wdrożenia, nie do produktu.
   */
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly post: HttpPost = defaultPost,
  ) {
    // Pusta konfiguracja poczty ma zatrzymać START, nie pierwszy reset hasła o 22:00.
    if (apiKey === '') throw new Error('ResendMail: potrzebny MAIL_API_KEY.');
    if (from === '') throw new Error('ResendMail: potrzebny MAIL_FROM.');
  }

  async send(message: MailMessage): Promise<void> {
    let res: Awaited<ReturnType<HttpPost>>;
    try {
      res = await this.post(SEND_URL, {
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      // Sieć albo termin. Przyczyna idzie dalej jako `cause` - bez niej „poczta nie
      // odpowiada" nie odróżnia padniętego DNS-u od przekroczonego terminu.
      throw new Error(`ResendMail: dostawca nie odpowiedział (${message.to}).`, { cause });
    }

    if (res.ok) return;

    throw new Error(`ResendMail: dostawca odmówił (HTTP ${res.status}, ${message.to}): ${await providerError(res)}`);
  }
}

/**
 * Powód odmowy słowami dostawcy. Resend odpowiada JSON-em `{ name, message }`, ale przy
 * awarii bramy potrafi oddać HTML - dlatego czytamy TEKST i dopiero próbujemy go rozebrać,
 * a nieudany rozbiór nie ma prawa przesłonić pierwotnego błędu drugim wyjątkiem.
 */
async function providerError(res: { text: () => Promise<string> }): Promise<string> {
  let body: string;
  try {
    body = await res.text();
  } catch {
    return 'bez treści odpowiedzi';
  }

  try {
    const parsed = JSON.parse(body) as { message?: unknown; name?: unknown };
    if (typeof parsed.message === 'string' && parsed.message !== '') {
      return typeof parsed.name === 'string' ? `${parsed.name}: ${parsed.message}` : parsed.message;
    }
  } catch {
    /* nie JSON - niżej wraca surowa treść */
  }

  return body.slice(0, 300);
}
