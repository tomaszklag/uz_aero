/**
 * Ninerdeck - JEDYNE miejsce w aplikacji, w którym występuje `WebSocket` (4.0.0,
 * `docs/kanal-klubu.md` §3.4; epik KK-C #246).
 *
 * `WebSocket` jest wbudowany w React Native - bez modułu natywnego i bez zależności, więc
 * łącze nie wymaga nowego APK. Reguła „jeden plik" jest wykonywalna
 * (`__tests__/architecture.test.ts`) z tego samego powodu, co w panelu: dopóki połączenie
 * ma jedne drzwi, „skąd przyszła ta ramka" ma jedną odpowiedź, a drugie gniazdo w ekranie
 * byłoby drugim połączeniem tego samego telefonu - dokładnie tym, czego K1 zabrania.
 *
 * Adapter niczego nie rozstrzyga: przekłada zdarzenia gniazda na port, a wznowienia,
 * ciszę i tokeny prowadzi łącze (`application/live/liveLink.ts`).
 */

import type { LiveConnection, LiveSocketPort } from '../../application/ports';

export class RnLiveSockets implements LiveSocketPort {
  open(url: string): LiveConnection {
    const ws = new WebSocket(url);
    const connection: LiveConnection = {
      onopen: null,
      onmessage: null,
      onclose: null,
      send: (data) => {
        // Gniazdo w trakcie zamykania odmawia wysyłki wyjątkiem; połączenie i tak schodzi,
        // a jego `close` zaplanuje wznowienie - ramka (pong) nie ma już dokąd iść.
        try {
          ws.send(data);
        } catch {
          // celowo pusto
        }
      },
      close: (code) => ws.close(code),
    };
    ws.onopen = () => connection.onopen?.();
    ws.onmessage = (event) => connection.onmessage?.(event.data);
    ws.onclose = () => connection.onclose?.();
    return connection;
  }
}
