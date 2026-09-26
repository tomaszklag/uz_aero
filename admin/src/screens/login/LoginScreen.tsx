/**
 * Ninerdeck - panel: logowanie.
 *
 * Kształt ekranu (znak, tytuł, formularz bez karty, zdanie pod spodem) składa
 * `AuthFrame` - układ jak w GitLabie, przegląd właściciela 2026-09-24.
 *
 * == DWIE METODY, JEDNA KOLUMNA (2.1.0, `docs/logowanie-haslem.md` D1, §5.2, §7.2) ==
 * Hasło jest DRUGĄ metodą tej samej osoby, nie zamiennikiem Google: obie kończą się
 * tą samą sesją i tym samym klubem. Formularz stoi NA WIERZCHU, bo administrator klubu
 * założonego bez konta Google (D8) nie ma innej drogi i to on musi ją zobaczyć pierwszy;
 * Google zostaje pod separatorem dla każdego, kto je ma.
 *
 * Panel loguje WYŁĄCZNIE e-mailem: przed zalogowaniem nie ma kontekstu klubu, więc kod
 * pilota - jedyny w klubie, nie na serwerze - nie miałby się do czego odnieść. Na
 * telefonie (00F) działa i kod, bo tam urządzenie pamięta kluby, z których się na nim
 * logowano.
 *
 * Czego tu NIE MA i dlaczego (to jest cała treść tej przebudowy):
 *  • **wykładu o uprawnieniach** i zdania „konta zakłada administrator" - opisu budowy
 *    produktu pokazywanego komuś, kto chce się zalogować. Kto nie może wejść, dowie się
 *    tego po próbie, jednym zdaniem (`loginMessage.ts`);
 *  • **pola na NOWE hasło ani kodu do przepisania** - hasło ustawia strona z linku
 *    (`/haslo/`), nigdy ten ekran. „Nie pamiętam hasła" prowadzi na `#/logowanie/haslo`,
 *    gdzie jedynym pytaniem jest adres; „Załóż konto" (issue #180) na `#/logowanie/konto`,
 *    gdzie pytaniami są imię i nazwisko oraz adres - a osoba powstaje dopiero na
 *    stronie z linku;
 *  • **wymogów co do znaków i wskaźnika siły** - tu hasła się PODAJE, a nie ustawia.
 *
 * == PRZYCISK RYSUJE GOOGLE, NIE MY ==
 * Element `.login-google` jest pustym kontenerem, w który skrypt Google wstawia swój
 * przycisk (`auth/googleIdentity.ts`). Dopóki skrypt jedzie, stoi w tym miejscu plamka
 * o jego wysokości - nie spinner i nie pustka, ta sama reguła co dla tabel panelu.
 * Formularz NIE CZEKA na nic: jest znany lokalnie i stoi od pierwszej klatki.
 * Gdy serwer nie zna klienta Google (`google: null`), separator i kontener znikają
 * W CAŁOŚCI - zostaje sam formularz.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { renderGoogleButton } from '../../auth/googleIdentity';
import { useSessionState } from '../../auth/sessionContext';
import { useAuthMethods, useLogin, usePasswordLogin } from '../../queries/useSession';
import { Button, Field, PasswordInput, TextInput } from '../../ui/components';
import { FORGOT_PASSWORD, SIGN_UP, homeFor, kindOf } from '../../ui/shell/nav';
import { scopeCount, SCOPE_PICK } from '../../ui/shell/scope';
import { AuthFrame } from './AuthFrame';
import { loginMessage } from './loginMessage';

export function LoginScreen() {
  const { session } = useSessionState();
  const login = useLogin();
  const password = usePasswordLogin();
  const methods = useAuthMethods();

  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');

  const slot = useRef<HTMLDivElement | null>(null);
  /** Skrypt Google nie dojechał - powód do pokazania zamiast pustego miejsca. */
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  const clientId = methods.data?.google?.clientId ?? null;
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
  //
  // Kilka zakresów (kluby administratora, platforma) => DRUGI KROK logowania: wybór
  // zakresu (issue #101, E2). Serwer wybrał już jeden deterministycznie, więc pominięcie
  // tego ekranu wpuszczałoby administratora dwóch klubów zawsze do tego samego - i to
  // bez powiedzenia mu, do którego.
  if (session != null) {
    return (
      <Navigate
        to={scopeCount(session) > 1 ? SCOPE_PICK : homeFor(session.capabilities, kindOf(session))}
        replace
      />
    );
  }

  // Odmowa OSTATNIEJ próby, niezależnie od metody: obie mutacje mówią o tej samej
  // czynności, a dwa banery naraz kazałyby zgadywać, który jest świeży.
  const failure = password.error ?? login.error;
  const message =
    failure != null
      ? loginMessage(failure)
      : methods.error != null
        ? { tone: 'danger' as const, text: 'Nie ma połączenia z serwerem. Spróbuj za chwilę.' }
        : scriptError != null
          ? {
              tone: 'danger' as const,
              text: 'Nie udało się wczytać logowania Google. Sprawdź połączenie z internetem albo zaloguj się hasłem.',
            }
          : null;

  // Google rysujemy dopiero, gdy serwer potwierdził, że to wdrożenie je ma. Do tego
  // czasu nie ma ani separatora, ani plamki: obiecywałyby kontrolkę, o której nic
  // jeszcze nie wiadomo.
  const hasGoogle = clientId != null;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (password.isPending) return;
    password.mutate({ email: email.trim(), password: secret });
  };

  return (
    <AuthFrame
      title="Zaloguj się do Ninerdeck"
      message={message}
      // Droga dla kogoś bez KONTA wcale - jedno zdanie pod formularzem (wzorzec GitLab
      // „Don't have an account yet? Register now"). Do 2026-09-24 stało w osobnej ramce.
      footer={
        <>
          Nie masz jeszcze konta? <Link to={SIGN_UP}>Załóż konto</Link>
        </>
      }
    >
      <form className="login-form" onSubmit={submit} autoComplete="on">
        <Field htmlFor="login-email" label="E-mail">
          <TextInput
            id="login-email"
            mono
            type="email"
            // Bez `autocomplete` menedżer haseł nie skojarzy pary adres + hasło,
            // a to on jest tu sojusznikiem: hasło ma być długie i wklejone.
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field
          htmlFor="login-password"
          label="Hasło"
          // „Nie pamiętam hasła" PRZY POLU, którego dotyczy. Służy też osobie z Googlem,
          // która hasła nigdy nie ustawiła: list z linku ustawia hasło niezależnie od
          // tego, czy jakieś było (D5), więc osobnego „nie mam jeszcze hasła" NIE MA.
          action={
            <Link className="label-action" to={FORGOT_PASSWORD}>
              Nie pamiętam hasła
            </Link>
          }
        >
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            required
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
        </Field>

        <Button type="submit" variant="primary" block disabled={password.isPending}>
          Zaloguj się
        </Button>
      </form>

      {/* Postęp czynności, o którą człowiek właśnie poprosił - pod przyciskiem,
          którego dotyczy. To nie jest blokada, więc nie ma tu powodu, tylko stan. */}
      {password.isPending ? <p className="login-status">Logowanie…</p> : null}

      {hasGoogle ? (
        <>
          <div className="login-divider" role="separator">
            albo zaloguj się przez
          </div>
          {rendered || scriptError != null ? null : <div className="login-google-skeleton" aria-hidden="true" />}
          <div
            ref={slot}
            className={rendered ? 'login-google' : 'login-google pending'}
            aria-busy={login.isPending}
          />
          {login.isPending ? <p className="login-status">Logowanie…</p> : null}
        </>
      ) : null}
    </AuthFrame>
  );
}
