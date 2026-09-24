/**
 * Ninerdeck - panel: „Załóż konto" (`#/logowanie/konto`, mockup `00-logowanie`,
 * czwarte okno; issue #180, 2026-09-24; `docs/logowanie-haslem.md` §5.4a).
 *
 * Rejestracja e-mailem to TEN SAM mechanizm, co „Nie pamiętam hasła": imię, nazwisko
 * i adres → list z linkiem → hasło ustawia strona `/haslo/` i DOPIERO WTEDY powstaje
 * osoba (adres potwierdzony samym kliknięciem, jak `email_verified` u Google). Ekran
 * jest lustrem 00H z aplikacji - te same pola, ten sam lead, to samo potwierdzenie
 * w trybie warunkowym - bo do #180 konto dało się założyć wyłącznie z telefonu,
 * a właściciel zakładający konta testowe nie ma po co po niego sięgać.
 *
 * Czego tu NIE MA: pola hasła (ustawia je strona z linku, na dowolnym urządzeniu)
 * ani kodu klubu - do klubu wchodzi się kodem w APLIKACJI, osobną decyzją administratora;
 * rejestracja niczego w klubie nie omija. Osoba z kontem Google nie zakłada drugiego
 * konta - loguje się Googlem, a hasło ustawia potem w `#/konto`.
 *
 * Ekran stoi POZA ramą, jak logowanie: sesji jeszcze nie ma. Potwierdzenie jest DRUGIM
 * STANEM tej samej karty: pola zostają do odczytu (literówkę w adresie widać TERAZ),
 * a jedyne wyjście prowadzi z powrotem do logowania.
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useSignUp } from '../../queries/useSession';
import { Banner, Button, Field, TextInput } from '../../ui/components';
import { BrandMark } from '../../ui/components/icons';
import { canSignUp, normalizeName, SIGNUP_LEAD, signUpOutcome, type SignUpOutcome } from './signUpForm';

export function SignUpScreen() {
  const signUp = useSignUp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  /** Wynik OSTATNIEJ wysyłki; `null` = jeszcze nie wysłano z tego ekranu. */
  const [outcome, setOutcome] = useState<SignUpOutcome | null>(null);

  const ready = canSignUp(name, email);
  const sent = outcome?.tone === 'ok';

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!ready || signUp.isPending) return;
    signUp.mutate(
      { name: normalizeName(name), email: email.trim() },
      {
        // Jeden wynik na adres wolny i zajęty: serwer ich nie odróżnia, więc ekran
        // też nie ma prawa - patrz `signUpOutcome`.
        onSuccess: () => setOutcome(signUpOutcome(null)),
        onError: (error) => setOutcome(signUpOutcome(error)),
      },
    );
  };

  return (
    <div className="login">
      <div className="login-mark">
        <span className="login-badge">
          <BrandMark size={28} />
        </span>
        <span className="login-title">NINERDECK</span>
        <span className="login-note">Panel administracyjny</span>
      </div>

      {outcome == null ? null : (
        <div className="login-banner">
          <Banner tone={outcome.tone} live>
            {outcome.text}
          </Banner>
        </div>
      )}

      <div className="login-card">
        <form onSubmit={submit}>
          <div className="card-title">Załóż konto</div>
          <p className="login-note">{SIGNUP_LEAD}</p>

          {/* Imię i nazwisko - jedyna rzecz, której serwer nie ma skąd wziąć: u osoby
              z Google przychodzi z profilu, tutaj nie ma innego źródła. */}
          <Field htmlFor="signup-name" label="Imię i nazwisko">
            <TextInput
              id="signup-name"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              required
              disabled={sent}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field htmlFor="signup-email" label="E-mail">
            <TextInput
              id="signup-email"
              mono
              type="email"
              autoComplete="email"
              required
              // Po wysłaniu pola zostają DO ODCZYTU: mówią, dokąd poszedł list, a nie
              // zapraszają do drugiej próby, zanim ktokolwiek zajrzy do skrzynki.
              disabled={sent}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          {sent ? null : (
            // Puste albo za krótkie pole blokuje BEZ zdania - widać je nad przyciskiem (issue #55).
            <Button type="submit" variant="primary" block disabled={!ready || signUp.isPending}>
              Wyślij link
            </Button>
          )}

        </form>
      </div>

      {/* Wyjście POD kartą (issue #180, wzorzec GitHub „New to GitHub?" odwrócony): karta
          niesie jedną akcję, a ktoś, kto ma już konto albo kliknął tu przez pomyłkę,
          wraca bez wysyłania czegokolwiek. Po wysłaniu zostaje sam powrót. */}
      <div className="login-alt">
        {sent ? (
          <Link to="/logowanie">Wróć do logowania</Link>
        ) : (
          <>
            Masz już konto? <Link to="/logowanie">Zaloguj się</Link>
          </>
        )}
      </div>
    </div>
  );
}
