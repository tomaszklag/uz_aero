/**
 * Ninerdeck - panel: MOJE KONTO (`#/konto`, mockup `konto`; 2.1.0, issue #134 D6;
 * `docs/logowanie-haslem.md` §5.3, §5.6, §7.2).
 *
 * Jedyny ekran panelu, który jest O OSOBIE PATRZĄCEJ, a nie o klubie - dlatego nie ma
 * pozycji w kolumnie bocznej (nie jest modułem) i wchodzi się do niego z nazwiska
 * w pasku górnym, jak w każdej aplikacji web. Ta sama strona w ramie klubu i w ramie
 * superadministratora: hasło i sesje ma każdy zalogowany.
 *
 * Trzy karty, trzy pytania: CZYM się loguję, JAK ZMIENIĆ HASŁO (albo ustawić pierwsze -
 * droga na wspólny tablet dla kogoś, kto wchodzi Googlem) i GDZIE JESTEM ZALOGOWANY.
 *
 * ══ CZEGO TU NIE MA ══
 * Zmiany adresu (jest tożsamością - klub go nie zmienia, osoba też nie), odpinania
 * Google i przycisku „Wyloguj wszędzie": własne urządzenia wylogowuje się pojedynczo,
 * a komplet POZOSTAŁYCH zdejmuje za jednym razem zmiana hasła - i to jest skutek, który
 * ekran zapowiada PRZED kliknięciem, a nie tłumaczy po nim.
 */

import { useState } from 'react';

import type { PanelSessionDto } from '../../api/dto';
import { useSessionState } from '../../auth/sessionContext';
import {
  useChangePassword,
  useMyAccount,
  useMySessions,
  useRevokeMySession,
} from '../../queries/useSession';
import { Banner, Button, Card, Field, Loadable, PageHead, PasswordInput, Pill } from '../../ui/components';
import { sessionRows } from '../accounts/sessionRows';
import { SessionList } from '../common/SessionList';
import { NONE } from '../common/values';
import { EMPTY_PASSWORD, passwordFailure, verdictOf } from './passwordForm';

export function AccountScreen() {
  const { session } = useSessionState();
  const account = useMyAccount();
  const sessions = useMySessions();
  const change = useChangePassword();
  const revoke = useRevokeMySession();

  const [draft, setDraft] = useState(EMPTY_PASSWORD);
  const [saved, setSaved] = useState(false);

  const methods = account.data?.methods ?? [];
  const hasPassword = methods.includes('password');
  const verdict = verdictOf(draft, { email: account.data?.email ?? null, name: session?.pilot.name ?? '' }, hasPassword);
  const failure = change.error == null ? null : passwordFailure(change.error);
  /** Zdanie pod polem „Nowe hasło" - z polityki w przeglądarce albo z odmowy serwera. */
  const nextFieldError = verdict.nextError ?? failure?.field ?? null;

  const save = (): void => {
    change.mutate(
      // Obecne hasło jedzie TYLKO wtedy, gdy jakieś jest: pole bez wartości wysłane
      // jako pusty napis byłoby dla serwera złym hasłem, a nie jego brakiem.
      hasPassword ? { current: draft.current, next: draft.next } : { next: draft.next },
      {
        onSuccess: () => {
          setDraft(EMPTY_PASSWORD);
          setSaved(true);
        },
      },
    );
  };

  return (
    <>
      <PageHead
        title="Moje konto"
        // Podtytuł mówi, KIM tu jestem - bo to jest strona o mnie. Rola przed klubem, jak
        // w mockupie: „administrator w klubie Aeroklub Zielonogórski". Sesja platformowa
        // nie ma klubu ani kodu, więc zostaje z niej sama rola.
        sub={[
          session?.pilot.name,
          scopeText(session),
          session?.pilot.code == null ? null : `kod ${session.pilot.code}`,
        ]
          .filter((part) => part != null)
          .join(' · ')}
      />

      {/* Baner opisuje akcję, która właśnie się skończyła, więc nie jest zamykalny
          i nie zostaje. Nazywa OBA skutki, bo o drugi ktoś zapyta za godzinę przy
          tablecie w hangarze. */}
      {!saved ? null : (
        <Banner tone="ok" live>
          Hasło zapisane. Pozostałe urządzenia zostały wylogowane - zaloguj się na nich
          ponownie.
        </Banner>
      )}
      {failure?.banner == null ? null : (
        <Banner tone="warn" live>
          {failure.banner}
        </Banner>
      )}

      <div className="card-grid">
        {/* LOGOWANIE - czym ta osoba wchodzi. Adres DO ODCZYTU (jest tożsamością, nie
            ustawieniem), metody jako plakietki: informacja, nie przełączniki. Google
            podpina się samo po zweryfikowanym adresie, hasło ustawia karta obok. */}
        <Card title="Logowanie">
          <Loadable
            pending={account.isPending}
            skeleton={<span className="skeleton" style={{ width: '100%', height: 44 }} />}
          >
            <>
              <div className="kv">
                <span className="kv-k">E-mail</span>
                <span className="kv-v">{account.data?.email ?? NONE}</span>
              </div>
              <div className="kv">
                <span className="kv-k">Metody</span>
                <span className="pill-row" aria-label="Metody logowania">
                  {methods.length === 0 ? (
                    <span className="cell-sub">jeszcze żadnej</span>
                  ) : (
                    methods.map((method) => (
                      <Pill key={method} tone="dim">
                        {method === 'google' ? 'Google' : 'hasło'}
                      </Pill>
                    ))
                  )}
                </span>
              </div>
            </>
          </Loadable>
        </Card>

        {/* HASŁO. Osoba Z hasłem podaje obecne; osoba BEZ hasła nie ma tego pola, bo nie
            ma czego podać - a karta nazywa wtedy CZYNNOŚĆ, nie rzecz. Polityka to JEDNO
            zdanie pod nowym hasłem (D4): minimum długości i nic więcej. */}
        <Card title={hasPassword ? 'Hasło' : 'Ustaw hasło'}>
          {!hasPassword ? null : (
            <Field htmlFor="password-current" label="Obecne hasło">
              <PasswordInput
                id="password-current"
                autoComplete="current-password"
                value={draft.current}
                onChange={(event) => setDraft({ ...draft, current: event.target.value })}
              />
            </Field>
          )}

          <Field
            htmlFor="password-next"
            label="Nowe hasło"
            hint="Co najmniej 12 znaków. Bez wymogów co do rodzaju znaków."
          >
            <PasswordInput
              id="password-next"
              autoComplete="new-password"
              invalid={nextFieldError != null}
              value={draft.next}
              onChange={(event) => {
                setSaved(false);
                setDraft({ ...draft, next: event.target.value });
              }}
            />
          </Field>
          {/* JEDNO zdanie pod polem, nie dwa: polityka liczona w przeglądarce i odmowa
              serwera mówią o tej samej wartości tym samym zdaniem (jedna implementacja
              reguły), więc obok siebie byłyby powtórzeniem. */}
          {nextFieldError == null ? null : <p className="hint danger">{nextFieldError}</p>}

          <Field htmlFor="password-repeat" label="Powtórz hasło">
            <PasswordInput
              id="password-repeat"
              autoComplete="new-password"
              invalid={verdict.repeatError != null}
              value={draft.repeat}
              onChange={(event) => setDraft({ ...draft, repeat: event.target.value })}
            />
          </Field>
          {verdict.repeatError == null ? null : (
            <p className="hint danger">{verdict.repeatError}</p>
          )}

          <div className="access-row">
            {/* Skutek, który trzeba znać PRZED kliknięciem - stąd pod przyciskiem,
                a nie w banerze po zapisie. */}
            <span className="hint">
              {hasPassword
                ? 'Zapis wyloguje pozostałe urządzenia - to okno zostaje.'
                : 'Od tej chwili zalogujesz się też hasłem - w panelu i na wspólnym tablecie.'}
            </span>
            {/* Przycisk zablokowany BEZ powodu: pusty formularz widać z pól nad nim. */}
            <Button
              variant="primary"
              disabled={!verdict.canSave || change.isPending}
              onClick={save}
            >
              {change.isPending ? 'Zapisuję…' : hasPassword ? 'Zapisz hasło' : 'Ustaw hasło'}
            </Button>
          </div>
        </Card>

        {/* MOJE SESJE: własne urządzenia ze WSZYSTKICH powierzchni i klubów - to są moje
            urządzenia, a nie dane klubu. Bieżąca przeglądarka ma plakietkę i ŻADNEJ akcji. */}
        <Card title="Moje sesje" span2>
          <Loadable
            pending={sessions.isPending}
            skeleton={<span className="skeleton" style={{ width: '100%', height: 48 }} />}
          >
            <SessionList
              rows={sessionRows(sessions.data ?? [], Date.now())}
              pending={revoke.isPending}
              onRevoke={(sessionId) => revoke.mutate(sessionId)}
            />
          </Loadable>
          <span className="hint">
            Wylogowane urządzenie przestaje wysyłać i pobierać; zapisy zostają na nim do
            ponownego zalogowania.
          </span>
        </Card>
      </div>
    </>
  );
}

/**
 * „administrator w klubie Aeroklub Zielonogórski" albo „superadministrator".
 *
 * Rola stoi PRZED klubem, bo odpowiada na pierwsze pytanie tej strony: czym tu jestem.
 * Sesja platformowa nie ma klubu i nie ma go z czego wziąć - zostaje sama rola.
 */
function scopeText(session: PanelSessionDto | null): string | null {
  if (session == null) return null;
  if (session.org == null) return 'superadministrator';
  const role = session.pilot.role === 'admin' ? 'administrator' : 'pilot';
  return `${role} w klubie ${session.org.name}`;
}
