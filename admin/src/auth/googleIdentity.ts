/**
 * UZ Aero - panel 2.0: przycisk „Kontynuuj z Google" (Google Identity Services).
 *
 * JEDYNE miejsce w panelu, które wie o skrypcie Google - ładuje go, inicjuje i renderuje
 * przycisk. Ekran logowania dostaje z tego modułu jedną funkcję i jeden callback
 * z tokenem; o Google nie wie nic ponad to, że trzeba go poprosić o tożsamość.
 *
 * == DLACZEGO SKRYPT, A NIE WLASNY PRZYCISK Z PRZEKIEROWANIEM ==
 * Bo to jedyna droga, na której przeglądarka dostaje TOKEN TOŻSAMOŚCI (`credential`)
 * bez sekretu klienta po naszej stronie i bez obsługi przekierowań w statycznym
 * buildzie za `@fastify/static`. Przepływ „authorization code" wymagałby sekretu na
 * serwerze i trasy zwrotnej; GIS oddaje podpisany JWT wprost do callbacku, a serwer
 * sprawdza jego podpis kluczami Google (`docs/logowanie-google.md` §7).
 *
 * == CO TO ZNACZY DLA CSP ==
 * Skrypt i ramka wyboru konta przychodzą z `accounts.google.com`, więc polityka
 * statycznego buildu (`server/src/http/routes/admin/staticPanel.ts`) dopuszcza TEN
 * JEDEN origin - i nic poza nim.
 *
 * Typy GIS są tu zadeklarowane RĘCZNIE i wąsko: pakiet `@types/google.accounts` opisuje
 * całe API, z którego używamy trzech funkcji, a każda zależność panelu to jeden import
 * więcej w buildzie, który ma działać w hangarze bez internetu.
 */

interface CredentialResponse {
  /** Token tożsamości Google (JWT) - jedzie do `POST /admin/api/auth/login`. */
  credential: string;
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    ux_mode?: 'popup';
    itp_support?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** Jedno ładowanie na życie strony - drugi `<script>` tego samego adresu nic nie wnosi. */
let loading: Promise<GoogleIdApi> | null = null;

function loadGoogleIdentity(): Promise<GoogleIdApi> {
  const ready = window.google?.accounts?.id;
  if (ready != null) return Promise.resolve(ready);

  loading ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (api != null) resolve(api);
      else reject(new Error('Skrypt Google wczytał się, ale nie wystawił google.accounts.id'));
    };
    script.onerror = () => {
      // Następna próba ma prawo zacząć od nowa - nieudane ładowanie nie jest stanem
      // trwałym (brak sieci w hangarze mija).
      loading = null;
      reject(new Error('Nie udało się wczytać skryptu Google'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Renderuje przycisk Google W PODANYM elemencie i oddaje token przez `onCredential`.
 *
 * `ux_mode: 'popup'` - wybór konta w okienku nad panelem, bez opuszczania strony:
 * przekierowanie wymagałoby trasy zwrotnej, której statyczny build nie ma.
 * Odrzuca obietnicę, gdy skrypt nie dojechał - ekran pokazuje wtedy powód zamiast
 * pustego miejsca po przycisku.
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  onCredential: (idToken: string) => void,
): Promise<void> {
  const api = await loadGoogleIdentity();
  api.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
    ux_mode: 'popup',
    itp_support: true,
  });
  api.renderButton(parent, {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    locale: 'pl',
    // Szerokość karty logowania minus jej padding (`login.css`): przycisk ma wypełnić
    // wiersz jak dawne pola, a GIS nie zna `width: 100%`.
    width: 336,
  });
}
