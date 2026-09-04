/**
 * UZ Aero - panel 2.0: logowanie.
 *
 * Ekran ma jedno zadanie i tyle na nim stoi: znak i JEDEN przycisk Google. Czego tu
 * NIE MA i dlaczego (to jest cała treść tej przebudowy, podtrzymana po wejściu Google):
 *  • **„Konta zakłada administrator…"** - opis tego, jak zbudowany jest produkt,
 *    pokazywany komuś, kto chce się zalogować;
 *  • **„Panel jest dla administratora…"** - wykład o uprawnieniach przed wyborem konta;
 *  • **pola loginu i hasła** - hasła zniknęły z produktu 2026-09-04
 *    (`docs/logowanie-google.md`); tożsamości dowodzi konto Google.
 *
 * Kto nie może wejść, dowie się tego po wybraniu konta - jednym zdaniem i dopiero
 * wtedy, gdy to pytanie faktycznie padło (`loginMessage.ts`).
 *
 * == PRZYCISK RYSUJE GOOGLE, NIE MY ==
 * Element `.login-google` jest pustym kontenerem, w który skrypt Google wstawia swój
 * przycisk (`auth/googleIdentity.ts`). Dopóki nie ma identyfikatora klienta albo
 * skrypt jeszcze jedzie, w tym miejscu stoi plamka o wysokości przycisku - nie spinner
 * i nie pustka, ta sama reguła co dla tabel panelu.
 */

import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { renderGoogleButton } from '../../auth/googleIdentity';
import { useSessionState } from '../../auth/sessionContext';
import { useGoogleClient, useLogin } from '../../queries/useSession';
import { Banner } from '../../ui/components';
import { PlaneIcon } from '../../ui/components/icons';
import { HOME } from '../../ui/shell/tabs';
import { loginMessage } from './loginMessage';

export function LoginScreen() {
  const { session } = useSessionState();
  const login = useLogin();
  const client = useGoogleClient();

  const slot = useRef<HTMLDivElement | null>(null);
  /** Skrypt Google nie dojechał - powód do pokazania zamiast pustego miejsca. */
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  const clientId = client.data?.clientId ?? null;
  const mutate = login.mutate;

  useEffect(() => {
    const parent = slot.current;
    if (parent == null || clientId == null) return;

    let alive = true;
    renderGoogleButton(parent, clientId, (idToken) => mutate({ idToken }))
      .then(() => {
        if (alive) setRendered(true);
      })
      .catch((error: unknown) => {
        if (alive) setScriptError(error instanceof Error ? error.message : 'Nie udało się wczytać logowania Google');
      });
    return () => {
      alive = false;
    };
  }, [clientId, mutate]);

  // Sesja żyje -> na ekranie logowania nie ma czego robić. Dotyczy też powrotu
  // „wstecz" po zalogowaniu, nie tylko wklejonego adresu.
  if (session != null) return <Navigate to={HOME} replace />;

  const message =
    login.error != null
      ? loginMessage(login.error)
      : client.error != null
        ? { tone: 'danger' as const, text: 'Nie ma połączenia z serwerem. Spróbuj za chwilę.' }
        : scriptError != null
          ? { tone: 'danger' as const, text: 'Nie udało się wczytać logowania Google. Sprawdź połączenie z internetem.' }
          : null;

  return (
    <div className="login">
      <div className="login-mark">
        <span className="login-badge">
          <PlaneIcon size={28} />
        </span>
        <span className="login-title">UZ AERO</span>
        <span className="login-note">Panel administracyjny</span>
      </div>

      {message == null ? null : (
        <div className="login-banner">
          <Banner tone={message.tone} live>
            {message.text}
          </Banner>
        </div>
      )}

      <div className="login-card">
        {/* Plamka w geometrii przycisku, dopóki Google go nie narysuje - nigdy pustka. */}
        {rendered || scriptError != null ? null : (
          <div className="login-google-skeleton" aria-hidden="true" />
        )}
        <div
          ref={slot}
          className={rendered ? 'login-google' : 'login-google pending'}
          aria-busy={login.isPending}
        />
        {login.isPending ? <p className="login-status">Logowanie…</p> : null}
      </div>
    </div>
  );
}
