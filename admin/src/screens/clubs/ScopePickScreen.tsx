/**
 * Ninerdeck - panel: wybór zakresu sesji (`#/klub`, mockup `00a-wybor-klubu`).
 *
 * DRUGI KROK LOGOWANIA, nie osobne miejsce - stąd ten sam układ, co ekran logowania
 * (znak, karta, lista kart) i ŻADNEJ RAMY: klub nie jest jeszcze wybrany, więc pasek
 * górny i kolumna boczna nie miałyby czego w sobie napisać.
 *
 * ══ KARTA JEST AKCJĄ, NIE LINKIEM ══
 * Kliknięcie wydaje NOWĄ SESJĘ (`POST /auth/switch`) i dopiero potem prowadzi na ekran
 * startowy tego zakresu. Bez przycisku „Dalej": wybór z dwóch nie potrzebuje
 * potwierdzenia, a drugi krok kazałby klikać dwa razy w tę samą decyzję.
 *
 * ══ PRZY JEDNYM ZAKRESIE EKRANU NIE MA ══
 * Wklejony adres odsyła na ekran startowy - lista z jedną kartą jest pytaniem bez
 * wyboru. Ta sama zasada, przez którą przełącznik w kolumnie bocznej gaśnie
 * (`ui/shell/scope.ts`).
 */

import { Navigate, useNavigate } from 'react-router-dom';

import { useSessionState } from '../../auth/sessionContext';
import { useSwitchScope } from '../../queries/useSession';
import { homeFor, kindOf } from '../../ui/shell/nav';
import { scopeCount } from '../../ui/shell/scope';
import { errorMessage } from '../common/apiMessage';
import { AuthFrame } from '../login/AuthFrame';
import { scopeOptions, scopeQuestion, type ScopeOption } from './scopeOptions';

export function ScopePickScreen() {
  const { session, loading } = useSessionState();
  const navigate = useNavigate();
  const switchScope = useSwitchScope();

  // Ekran stoi POZA `ShellRoute`, więc brama sesji jest tu jego własna: bez tego
  // wklejony adres pokazywałby pustą kartę wyboru komuś, kto nie jest zalogowany.
  if (loading) return null;
  if (session == null) return <Navigate to="/logowanie" replace />;
  if (scopeCount(session) <= 1) {
    return <Navigate to={homeFor(session.capabilities, kindOf(session))} replace />;
  }

  const pick = (option: ScopeOption): void => {
    switchScope.mutate(option.orgId, {
      // Cel liczymy ze ŚWIEŻEJ sesji, a nie z tej, którą mamy na ekranie: zdolności
      // zakresu docelowego są inne (platforma nie otwiera dziennika), więc stary
      // `homeFor` odesłałby na trasę, która zaraz odpowie 401.
      onSuccess: (next) => void navigate(homeFor(next.capabilities, kindOf(next)), { replace: true }),
    });
  };

  return (
    <AuthFrame
      title={scopeQuestion(session.scopes)}
      lead={session.pilot.name}
      message={switchScope.error == null ? null : { tone: 'danger', text: errorMessage(switchScope.error) }}
    >
      <div className="opt-list" role="list" aria-label="Wybierz zakres">
        {scopeOptions(session.scopes).map((option) => (
          <button
            key={option.orgId ?? 'platform'}
            type="button"
            role="listitem"
            className="opt"
            disabled={switchScope.isPending}
            onClick={() => pick(option)}
          >
            <span className="opt-body">
              <span className="opt-name">{option.name}</span>
              <span className="opt-desc">{option.desc}</span>
            </span>
            <span className="opt-go" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>
      {/*
        Klub, w którym ta osoba jest tylko PILOTEM, JEST na liście (issue #216): karta
        pisze „pilot · Twój kod …", a sesja tego klubu otwiera Moje konto i kalendarz.
        Do 3.1.0 serwer takiego klubu nie wysyłał - panel był dla administratora.
      */}
    </AuthFrame>
  );
}
