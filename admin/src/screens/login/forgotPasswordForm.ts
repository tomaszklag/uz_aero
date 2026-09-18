/**
 * Ninerdeck - panel: „Nie pamiętam hasła" - decyzje formularza (2.1.0, issue #134 D3).
 *
 * Moduł CZYSTY: cały ten ekran to jedno pole i jedna akcja, więc jedyne, co da się
 * w nim zepsuć, to KIEDY wolno wysłać i CO powiedzieć po wysłaniu. Oba pytania mają
 * odpowiedzi tutaj, z testami, a `.tsx` odpowiada wyłącznie za układ.
 *
 * ══ JEDNO ZDANIE NA KAŻDĄ ODPOWIEDŹ SERWERA ══
 * Serwer odpowiada `202` ZAWSZE: dla adresu znanego, nieznanego i po przekroczeniu
 * limitu wysyłek (§5.4, §8 pkt 2). Inna odpowiedź wyliczałaby konta, a to jest ekran,
 * na którym stoi każdy, kto zna adres panelu. Ekran musi więc powiedzieć to samo także
 * wtedy, gdy żądanie PADŁO z odmową - inaczej różnica, której serwer starannie nie robi,
 * wróciłaby przez komunikat błędu.
 *
 * Wyjątkiem jest wyłącznie AWARIA SIECI: „nie wiem, czy wysłano" to inna wiadomość niż
 * „wysłano", a milczenie w tym miejscu kazałoby czekać na list, który nigdzie nie ruszył.
 */

import { isHttpError } from '../../api/httpClient';

/**
 * Czy wolno wysłać. Pytanie jest WĄSKIE i takie ma być: pole ma zawierać coś, co
 * wygląda na adres - reszty (czy taki adres istnieje) nie rozstrzyga ani nie może
 * rozstrzygnąć przeglądarka.
 *
 * Bez małpy i kropki po niej nie ma czego wysyłać, więc przycisk stoi BEZ ZDANIA:
 * powód widać z pola nad nim (reguła issue #55).
 */
export function canSendLink(email: string): boolean {
  const value = email.trim();
  const at = value.indexOf('@');
  if (at < 1) return false;
  const domain = value.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.') && !/\s/.test(value);
}

export interface ForgotOutcome {
  tone: 'ok' | 'danger';
  text: string;
}

/** Potwierdzenie - TO SAMO zdanie dla każdego adresu i dla wyczerpanego limitu. */
export const LINK_SENT: ForgotOutcome = {
  tone: 'ok',
  text: 'Jeśli ten adres jest w systemie, link już idzie - ważny godzinę.',
};

/**
 * Wynik wysłania.
 *
 * `error == null` znaczy `202`. Odmowa serwera (np. limit) daje TO SAMO potwierdzenie:
 * z punktu widzenia człowieka stało się dokładnie to, o co prosił - a z punktu widzenia
 * bezpieczeństwa druga odpowiedź byłaby jedyną różnicą między adresem znanym a obcym.
 * Awaria SIECI jest jedynym stanem, w którym to zdanie byłoby nieprawdą.
 */
export function forgotOutcome(error: unknown): ForgotOutcome {
  if (error == null) return LINK_SENT;
  if (!isHttpError(error)) {
    return { tone: 'danger', text: 'Nie ma połączenia z serwerem. Spróbuj za chwilę.' };
  }
  return LINK_SENT;
}
