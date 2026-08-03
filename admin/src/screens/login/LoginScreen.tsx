/**
 * UZ Aero — panel: EKRAN LOGOWANIA (`design/admin/A00-login.html`, wariant błędu A00a).
 *
 * Wdrożony sekcja po sekcji z mockupu: znak marki nad kartą, karta formularza 420 px,
 * baner wyjaśniający role, stopka ze stemplem UTC. Wariant A00a dokłada baner odmowy
 * NAD kartą i plakietkę statusu w jej tytule.
 *
 * Czego z A00a NIE wdrażamy i dlaczego: **licznika prób („zostały 3 z 5")**. Mockup
 * mówi to o sobie sam — „liczby 5 prób / 15 minut są WARTOŚCIAMI ROBOCZYMI… tych dwóch
 * progów NIE przepisuj do kodu bez ustalenia" — a rate-limit `/auth/*` jest zaległością
 * serwera (faza 6). Licznik prób bez działającego limitu byłby napisem, który kłamie.
 */

import { useState, type FormEvent } from 'react';

import { isHttpError } from '../../api/httpClient';
import { useLogin } from '../../queries/useSession';
import { Banner, Button, Card, Field, Pill, TextInput } from '../../ui/components';
import { PlaneIcon, SignInIcon } from '../../ui/components/icons';
import { loginMessage, type LoginMessage } from './loginMessages';

/** Szerokość karty i banerów z mockupu — wymiar układu jednego ekranu. */
const COLUMN = { width: 420 } as const;

export function LoginScreen() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<LoginMessage | null>(null);
  const [status, setStatus] = useState<number | null>(null);

  const mutation = useLogin();

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    mutation.mutate(
      { login: login.trim(), password },
      {
        onError: (error) => {
          const httpStatus = isHttpError(error) ? error.status : null;
          const code = isHttpError(error) ? error.body.error : null;
          setStatus(httpStatus);
          setMessage(loginMessage(httpStatus, code));
          // Hasło czyścimy po KAŻDEJ odmowie (A00a: „pole wyczyszczone po odrzuceniu"),
          // login zostaje — poprawianie literówki w loginie nie ma być karane
          // przepisywaniem obu pól.
          setPassword('');
        },
      },
    );
  }

  return (
    <div className="centered">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 9,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: 'var(--green-muted)',
            border: '1px solid var(--green-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--green)',
          }}
        >
          <PlaneIcon size={32} />
        </span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 40, letterSpacing: 6, lineHeight: 1 }}>
          UZ AERO
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: 2.5,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Panel administracyjny
        </span>
      </div>

      {message == null ? null : (
        <Banner tone={message.tone} live style={COLUMN}>
          <b>{message.title}</b> {message.detail}
        </Banner>
      )}

      <form onSubmit={submit} style={COLUMN}>
        <Card
          title="Logowanie"
          actions={
            status == null ? undefined : <Pill tone={status === 403 ? 'amber' : 'red'}>{status}</Pill>
          }
          style={{ gap: 13 }}
        >
          <Field htmlFor="login" label="Login">
            <TextInput
              id="login"
              name="login"
              autoComplete="username"
              autoFocus
              placeholder="login albo e-mail"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </Field>

          <Field
            htmlFor="password"
            label="Hasło"
            hint={
              message?.markPassword === true
                ? 'Pole wyczyszczone po odrzuceniu — wpisz hasło jeszcze raz.'
                : undefined
            }
          >
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              invalid={message?.markPassword === true}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            block
            disabled={mutation.isPending || login.trim().length === 0 || password.length === 0}
          >
            <SignInIcon />
            {mutation.isPending ? 'Logowanie…' : 'Zaloguj się'}
          </Button>

          <span className="hint">
            Konta zakłada administrator w bazie. Panel nie ma samodzielnej rejestracji ani logowania
            przez Google — jedyne wejście to login i hasło.
          </span>
        </Card>
      </form>

      {message == null ? (
        <Banner tone="status" style={COLUMN}>
          <b>Panel jest dla dwóch ról.</b> Konto pilota zaloguje się poprawnie, ale zobaczy tylko
          komunikat: „to konto nie ma roli administratora ani szefa wyszkolenia — panel jest tylko
          dla nich; pilot loguje się w aplikacji na telefonie".
        </Banner>
      ) : null}

      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 1.2,
          color: 'var(--text-muted)',
        }}
      >
        panel działa wyłącznie online
      </span>
    </div>
  );
}
