/**
 * Ninerdeck (serwer) - adapter budzika (`ExpoPush`; milestone 3.1.0, issue #164 G7).
 *
 * Granica testu jest ta sama, co przy poczcie (`resendMail.test.ts`): podmieniamy
 * WYŁĄCZNIE wywołanie HTTP, a sprawdzamy nasze decyzje - kształt paczki, dzielenie na
 * części i to, co robimy z odpowiedzią.
 *
 * Najważniejsza z nich: **awaria NIE RZUCA**. Push jest budzikiem (§12.1), więc wyjątek
 * stąd znaczyłby, że decyzja o rezerwacji nie powiodła się, bo dostawca miał przerwę -
 * a to jest gorsza odpowiedź niż cisza w telefonie.
 */

import { describe, expect, it } from 'vitest';

import { ExpoPush, type HttpPost } from '../src/infrastructure/push/expoPush.ts';
import type { PushMessage } from '../src/application/common/ports.ts';

const message = (token: string): PushMessage => ({
  token,
  title: 'Prośba o zgodę',
  body: 'Rezerwacja czeka na Twoją decyzję.',
  data: { kind: 'approval_requested' },
});

/** Dostawca odpowiadający biletami - po jednym na wiadomość, W KOLEJNOŚCI wysyłki. */
const ticketing = (
  tickets: (status: string, index: number) => Record<string, unknown>,
  calls: unknown[][] = [],
): HttpPost => {
  const post: HttpPost = async (_url, init) => {
    const body = JSON.parse(init.body) as unknown[];
    calls.push(body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: body.map((_, i) => tickets('ok', i)) }),
    };
  };
  return post;
};

describe('budzik przez Expo Push API', () => {
  it('wysyła jedną paczkę i nie melduje martwych tokenów, gdy wszystko poszło', async () => {
    const calls: unknown[][] = [];
    const push = new ExpoPush('', ticketing(() => ({ status: 'ok' }), calls));

    const { dead } = await push.send([message('a'), message('b')]);
    expect(dead).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2);
    expect(calls[0]![0]).toMatchObject({ to: 'a', title: 'Prośba o zgodę', priority: 'high' });
  });

  it('DZIELI wysyłkę na części po sto - krok ścieżki bywa listą kilkudziesięciu osób', async () => {
    const calls: unknown[][] = [];
    const push = new ExpoPush('', ticketing(() => ({ status: 'ok' }), calls));

    await push.send(Array.from({ length: 150 }, (_, i) => message(`t${i}`)));
    expect(calls.map((c) => c.length)).toEqual([100, 50]);
  });

  it('MARTWY TOKEN wraca do wołającego, żeby wiersz zniknął z bazy', async () => {
    // `DeviceNotRegistered` znaczy, że aplikacji na tym urządzeniu już nie ma. Bilety
    // przychodzą w KOLEJNOŚCI wiadomości i tylko po niej da się je z nimi złączyć -
    // Expo nie powtarza w odpowiedzi adresata.
    const post: HttpPost = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: [
            { status: 'ok' },
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
            { status: 'error', details: { error: 'MessageRateExceeded' } },
          ],
        }),
    });

    const { dead } = await new ExpoPush('', post).send([
      message('żywy'),
      message('odinstalowany'),
      message('za-szybko'),
    ]);
    // Wyłącznie odinstalowany: przekroczony limit tempa jest problemem CHWILI, a nie
    // dowodem, że urządzenia nie ma - skasowanie go zgasiłoby budzik na zawsze.
    expect(dead).toEqual(['odinstalowany']);
  });

  it('AWARIA SIECI NIE RZUCA - decyzja o rezerwacji nie zależy od dostawcy push', async () => {
    const post: HttpPost = async () => {
      throw new Error('ECONNRESET');
    };
    const logged: string[] = [];
    const push = new ExpoPush('', post, (line) => logged.push(line));

    await expect(push.send([message('a')])).resolves.toEqual({ dead: [] });
    expect(logged[0]).toContain('nie odpowiedział');
  });

  it('ODMOWA DOSTAWCY też nie rzuca i nie kasuje żadnego tokenu', async () => {
    const post: HttpPost = async () => ({ ok: false, status: 429, text: async () => 'slow down' });
    const logged: string[] = [];

    const { dead } = await new ExpoPush('', post, (line) => logged.push(line)).send([message('a')]);
    expect(dead).toEqual([]);
    expect(logged[0]).toContain('429');
  });

  it('NIECZYTELNA ODPOWIEDŹ nie znaczy „urządzenia zniknęły"', async () => {
    const post: HttpPost = async () => ({ ok: true, status: 200, text: async () => '<html>502</html>' });
    const logged: string[] = [];

    const { dead } = await new ExpoPush('', post, (line) => logged.push(line)).send([message('a')]);
    expect(dead).toEqual([]);
    expect(logged[0]).toContain('nieczytelna');
  });

  it('token dostępu jedzie nagłówkiem TYLKO wtedy, gdy jest', async () => {
    const headers: Record<string, string>[] = [];
    const post: HttpPost = async (_url, init) => {
      headers.push(init.headers);
      return { ok: true, status: 200, text: async () => '{"data":[]}' };
    };

    await new ExpoPush('', post).send([message('a')]);
    await new ExpoPush('sekret', post).send([message('a')]);
    expect(headers[0]!.authorization).toBeUndefined();
    expect(headers[1]!.authorization).toBe('Bearer sekret');
  });
});
