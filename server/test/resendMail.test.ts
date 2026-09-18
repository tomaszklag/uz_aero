/**
 * Ninerdeck (serwer) - adapter poczty Resend (`infrastructure/mail/resendMail.ts`).
 *
 * Jednostkowo, z podstawionym wywołaniem HTTP: prawdziwy dostawca stoi za kluczem API
 * i limitem wysyłek, więc tu sprawdzamy to, co jest NASZĄ decyzją - kształt żądania,
 * zamianę odmowy na wyjątek i to, czego w komunikacie błędu BYĆ NIE MOŻE (klucz API
 * i treść listu z tokenem linku, §8 pkt 4). Próba na żywym koncie jest osobnym krokiem
 * przed wdrożeniem (#137).
 */

import { describe, expect, it } from 'vitest';

import { ResendMail, type HttpPost } from '../src/infrastructure/mail/resendMail.ts';

const MESSAGE = {
  to: 'pilot@example.com',
  subject: 'Ustaw hasło w Ninerdeck',
  text: 'Link ważny godzinę: https://app.ninerdeck.pl/haslo/#sekretny-token-linku',
};

/** Zapisuje żądanie i oddaje zadaną odpowiedź - bez sieci. */
function recorder(response: { ok: boolean; status: number; body: string | (() => never) }) {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const post: HttpPost = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return {
      ok: response.ok,
      status: response.status,
      text: async () =>
        typeof response.body === 'function' ? response.body() : response.body,
    };
  };
  return { calls, post };
}

/**
 * Wyjątek z odrzuconej wysyłki. `catch` na `Promise<void>` daje `void | Error`, więc
 * osobny helper - i przy okazji nie przepuszcza wysyłki, która wbrew testowi się udała.
 */
async function rejection(promise: Promise<void>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('oczekiwano wyjątku, a wysyłka się udała');
}

describe('ResendMail', () => {
  it('wysyła list na punkt Resend - Bearer, nadawca z konfiguracji, treść tekstowa', async () => {
    const { calls, post } = recorder({ ok: true, status: 200, body: '{"id":"abc"}' });

    await new ResendMail('re_klucz', 'Ninerdeck <konto@ninerdeck.pl>', post).send(MESSAGE);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.headers.authorization).toBe('Bearer re_klucz');
    expect(JSON.parse(calls[0]!.body)).toEqual({
      from: 'Ninerdeck <konto@ninerdeck.pl>',
      to: ['pilot@example.com'],
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    });
  });

  it('odmowa dostawcy = wyjątek z jego powodem, BEZ klucza API i BEZ treści listu', async () => {
    const { post } = recorder({
      ok: false,
      status: 403,
      body: '{"name":"validation_error","message":"The ninerdeck.pl domain is not verified"}',
    });

    const error = await rejection(
      new ResendMail('re_klucz', 'Ninerdeck <konto@ninerdeck.pl>', post).send(MESSAGE),
    );

    expect(error.message).toContain('403');
    expect(error.message).toContain('validation_error');
    expect(error.message).toContain('domain is not verified');
    expect(error.message).toContain('pilot@example.com');
    // Komunikat ląduje w logu hostingu: ani klucza, ani tokenu linku być w nim nie może.
    expect(error.message).not.toContain('re_klucz');
    expect(error.message).not.toContain('sekretny-token-linku');
  });

  it('odpowiedź nie-JSON (awaria bramy) nie przesłania błędu drugim wyjątkiem', async () => {
    const { post } = recorder({ ok: false, status: 502, body: '<html>Bad gateway</html>' });

    const error = await rejection(new ResendMail('re_klucz', 'konto@ninerdeck.pl', post).send(MESSAGE));

    expect(error.message).toContain('502');
    expect(error.message).toContain('Bad gateway');
  });

  it('brak odpowiedzi (sieć, termin) = wyjątek z przyczyną', async () => {
    const post: HttpPost = async () => {
      throw new Error('TimeoutError');
    };

    const error = await rejection(new ResendMail('re_klucz', 'konto@ninerdeck.pl', post).send(MESSAGE));

    expect(error.message).toContain('nie odpowiedział');
    expect((error.cause as Error).message).toBe('TimeoutError');
    expect(error.message).not.toContain('sekretny-token-linku');
  });

  it('pusty klucz albo pusty nadawca zatrzymuje START, nie pierwszą wysyłkę', () => {
    expect(() => new ResendMail('', 'konto@ninerdeck.pl')).toThrow(/MAIL_API_KEY/);
    expect(() => new ResendMail('re_klucz', '')).toThrow(/MAIL_FROM/);
  });
});
