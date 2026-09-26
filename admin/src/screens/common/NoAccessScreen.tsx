/**
 * Ninerdeck - panel: EKRAN „Brak dostępu" (issue #216, makieta `design/panel/brak-dostepu.html`).
 *
 * Stoi W RAMIE: kolumna boczna pokazuje obok moduły, do których ta osoba ma prawo,
 * więc odpowiedź „tego tu nie ma dla Ciebie" sąsiaduje z tym, co jest. Treść liczy
 * `noAccess.ts` - tu zostaje samo złożenie z komponentu `NoAccess` (`.no-access`
 * z inwentarza szablonu) i jednej drogi wyjścia: na ekran startowy tej sesji.
 */

import { useSessionState } from '../../auth/sessionContext';
import { LinkButton, NoAccess } from '../../ui/components';
import { LockIcon } from '../../ui/components/icons';
import { homeFor, kindOf, type Access } from '../../ui/shell/nav';
import { noAccessCopy } from './noAccess';

export function NoAccessScreen({ access }: { access: Access }) {
  const { session } = useSessionState();
  const kind = kindOf(session);
  const copy = noAccessCopy(access, kind);

  return (
    <div className="card">
      <NoAccess icon={<LockIcon />} title={copy.title} reason={copy.reason} note={copy.note} />
      <div className="drawer-foot">
        <LinkButton to={homeFor(session?.capabilities, kind)} variant="ghost">
          Wróć na ekran startowy
        </LinkButton>
      </div>
    </div>
  );
}
