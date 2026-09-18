/**
 * Ninerdeck - panel: „Nie pamiętam hasła" (`#/logowanie/haslo`, mockup `00-logowanie`,
 * trzecie okno; 2.1.0, `docs/logowanie-haslem.md` §3.3, §5.4).
 *
 * Jedno pytanie i jedna akcja: adres i „Wyślij link". Hasła tu NIE MA - ani pola na
 * nowe, ani kodu do przepisania. Nowe hasło ustawia się na stronie z linku, na dowolnym
 * urządzeniu, także na telefonie, na którym czyta się pocztę - i to jest cały powód,
 * dla którego ta droga wygląda tak, a nie inaczej: na wspólnym tablecie w kabinie
 * poczty się nie otwiera.
 *
 * Ekran stoi POZA ramą, jak logowanie i wybór klubu: sesji jeszcze nie ma, więc pasek
 * górny i kolumna boczna nie miałyby czego w sobie napisać.
 *
 * Potwierdzenie jest DRUGIM STANEM tej samej karty, a nie osobnym ekranem: adres zostaje
 * na wierzchu do odczytu, a jedyne wyjście prowadzi z powrotem do logowania.
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useForgotPassword } from '../../queries/useSession';
import { Banner, Button, Field, TextInput } from '../../ui/components';
import { BrandMark } from '../../ui/components/icons';
import { canSendLink, forgotOutcome, type ForgotOutcome } from './forgotPasswordForm';

export function ForgotPasswordScreen() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  /** Wynik OSTATNIEJ wysyłki; `null` = jeszcze nie wysłano z tego ekranu. */
  const [outcome, setOutcome] = useState<ForgotOutcome | null>(null);

  const ready = canSendLink(email);
  const sent = outcome?.tone === 'ok';

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!ready || forgot.isPending) return;
    forgot.mutate(email.trim(), {
      // Jeden wynik na obie drogi: serwer nie odróżnia adresu znanego od obcego,
      // więc ekran też nie ma prawa - patrz `forgotOutcome`.
      onSuccess: () => setOutcome(forgotOutcome(null)),
      onError: (error) => setOutcome(forgotOutcome(error)),
    });
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
          <div className="card-title">Link do ustawienia hasła</div>
          {/* Jedno zdanie o tym, CO SIĘ STANIE - nie o tym, jak działa link. */}
          <p className="login-note">
            Wyślemy link na adres konta. Otwórz go na dowolnym urządzeniu i ustaw hasło -
            potem zaloguj się tutaj.
          </p>

          <Field htmlFor="forgot-email" label="E-mail">
            <TextInput
              id="forgot-email"
              mono
              type="email"
              autoComplete="username"
              required
              // Po wysłaniu pole zostaje DO ODCZYTU: mówi, dokąd poszedł list, a nie
              // zaprasza do drugiej próby zanim ktokolwiek zajrzy do skrzynki.
              disabled={sent}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          {sent ? null : (
            <Button type="submit" variant="primary" block disabled={!ready || forgot.isPending}>
              Wyślij link
            </Button>
          )}

          <Link className="login-link" to="/logowanie">
            Wróć do logowania
          </Link>
        </form>
      </div>
    </div>
  );
}
