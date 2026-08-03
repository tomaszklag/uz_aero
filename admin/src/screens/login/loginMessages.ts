/**
 * UZ Aero — panel: KOMUNIKATY ekranu logowania (moduł CZYSTY, testowany bez DOM-u).
 *
 * Ekran jest `.tsx` bez decyzji o treści; co dokładnie zobaczy człowiek po odbitym
 * logowaniu, rozstrzyga ten plik — dokładnie jak `screens/*.ts` w aplikacji pilota.
 *
 * Trzy odpowiedzi serwera, trzy różne wiadomości i to jest cała treść tego modułu:
 *  • **401 `invalid_credentials`** — jeden komunikat dla złego hasła i dla konta,
 *    którego nie ma (A00a). Rozróżnienie ich byłoby wyliczarką loginów;
 *  • **403 `no_panel_access`** — hasło było DOBRE, odbija rola. Mockup A00 wymaga
 *    tu wyjaśnienia, nie cichego odbicia: człowiek ma wiedzieć, że nie szuka błędu
 *    w haśle, którego nie popełnił;
 *  • **awaria sieci** — panel działa wyłącznie online i wolno mu to powiedzieć wprost
 *    (to jedyne miejsce w systemie, gdzie brak sieci jest blokadą).
 */

import type { BannerTone } from '../../ui/components/Banner';

export interface LoginMessage {
  tone: BannerTone;
  /** Pierwsze zdanie, pogrubione w banerze (`<b>` z mockupu). */
  title: string;
  detail: string;
  /** Czy zaznaczyć pole hasła jako odrzucone (A00a: czerwona obwódka). */
  markPassword: boolean;
}

/**
 * Odpowiedź serwera → komunikat. `status` i `error` przychodzą z `HttpError`;
 * `null` znaczy „nie było odpowiedzi" (awaria sieci albo serwer nie odpowiedział).
 */
export function loginMessage(status: number | null, error: string | null): LoginMessage {
  if (status === 403 && error === 'no_panel_access') {
    return {
      tone: 'warn',
      title: 'To konto nie ma dostępu do panelu.',
      detail:
        'Panel jest dla administratora i szefa wyszkolenia — pilot pracuje w aplikacji na telefonie. ' +
        'Jeśli rola ma się zmienić, poproś administratora; hasło jest poprawne i nie trzeba go resetować.',
      markPassword: false,
    };
  }

  if (status === 401) {
    return {
      tone: 'danger',
      title: 'Nieprawidłowy login lub hasło.',
      detail:
        'Odpowiedź jest celowo taka sama dla złego hasła i dla konta, którego nie ma — ' +
        'panel nie podpowiada, które loginy istnieją.',
      markPassword: true,
    };
  }

  if (status === 403 && error === 'csrf_header_required') {
    // Stan, który przy poprawnie zbudowanym panelu nie ma prawa wystąpić — ale jeśli
    // wystąpi (zły proxy w devie, wtyczka obcinająca nagłówki), komunikat „złe hasło"
    // wysłałby człowieka w wielogodzinne szukanie nie tam, gdzie trzeba.
    return {
      tone: 'danger',
      title: 'Żądanie odrzucone przez zabezpieczenie panelu.',
      detail:
        'Serwer nie zobaczył nagłówka sesji panelu. To nie jest błąd hasła — zgłoś to administratorowi.',
      markPassword: false,
    };
  }

  if (status == null) {
    return {
      tone: 'danger',
      title: 'Brak połączenia z serwerem.',
      detail:
        'Panel działa wyłącznie online — bez serwera nie ma czego pokazać. Spróbuj ponownie za chwilę.',
      markPassword: false,
    };
  }

  return {
    tone: 'danger',
    title: 'Logowanie nie powiodło się.',
    detail: `Serwer odpowiedział kodem ${status}. Jeśli to się powtarza, zgłoś administratorowi.`,
    markPassword: false,
  };
}
