/**
 * UZ Aero - panel 2.0: logowanie.
 *
 * Ekran ma jedno zadanie i tyle na nim stoi: dwa pola i przycisk. Czego tu NIE MA
 * i dlaczego - to jest cała treść tej przebudowy:
 *  • **„Konta zakłada administrator, panel nie ma rejestracji…"** - opis tego, czego
 *    w produkcie nie ma, pokazywany komuś, kto chce się zalogować;
 *  • **„Panel jest dla dwóch ról…"** - wykład o uprawnieniach przed podaniem hasła;
 *  • **„panel działa wyłącznie online"** - zdanie o budowie aplikacji zamiast o pracy;
 *  • **„Nie pamiętam hasła"** - takiej trasy nie ma; przycisk obiecywałby wyjście,
 *    którego nikt nie zbudował (a wyszarzony obiecywałby je jeszcze głośniej).
 *
 * Kto nie może wejść, dowie się tego po naciśnięciu „Zaloguj się" - jednym zdaniem
 * i dopiero wtedy, gdy to pytanie faktycznie padło (`loginMessage.ts`).
 */

import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { useSessionState } from '../../auth/sessionContext';
import { useLogin } from '../../queries/useSession';
import { Banner, Button, Field, TextInput } from '../../ui/components';
import { PlaneIcon, SignInIcon } from '../../ui/components/icons';
import { HOME } from '../../ui/shell/tabs';
import { loginMessage } from './loginMessage';

export function LoginScreen() {
  const { session } = useSessionState();
  const login = useLogin();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  // Sesja żyje -> na ekranie logowania nie ma czego robić. Dotyczy też powrotu
  // „wstecz" po zalogowaniu, nie tylko wklejonego adresu.
  if (session != null) return <Navigate to={HOME} replace />;

  const message = login.error == null ? null : loginMessage(login.error);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === '' || password === '') return;
    login.mutate(
      { login: name.trim(), password },
      {
        // Hasło odrzucone kasujemy, login zostaje - poprawia się jedno, nie oba.
        onError: (error) => {
          if (loginMessage(error).clearPassword) setPassword('');
        },
      },
    );
  };

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
        <form onSubmit={submit}>
          <Field htmlFor="login" label="Login">
            <TextInput
              id="login"
              value={name}
              autoFocus
              autoComplete="username"
              placeholder="login albo e-mail"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field htmlFor="password" label="Hasło">
            <TextInput
              id="password"
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="••••••••"
              invalid={message?.clearPassword ?? false}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            block
            disabled={login.isPending || name.trim() === '' || password === ''}
          >
            <SignInIcon size={14} />
            {login.isPending ? 'Logowanie…' : 'Zaloguj się'}
          </Button>
        </form>
      </div>
    </div>
  );
}
