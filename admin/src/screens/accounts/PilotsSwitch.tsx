/**
 * Ninerdeck - panel: przełącznik „Członkowie · Grupy" modułu Piloci (4.0.0, makiety
 * `piloci-lista` i `piloci-grupy`; `docs/zlecenia.md` §6.1).
 *
 * Grupy klubu - nazwane listy członków, do których wysyła się zlecenie lotu - są drugą
 * połową TEGO modułu, a nie pozycją kolumny: kolumna wymienia moduły klubu. Segment
 * (`.seg`), jak oś dziennika: dwie połowy odpowiadają na dwa pytania - „kto jest w klubie"
 * i „jakie listy ludzi klub ma" - i dokładnie jedna jest zawsze włączona. Stoi w pierwszym
 * rzędzie pod nagłówkiem W OBU połowach, nad kartą zgłoszeń, żeby nie skakał, gdy tamta
 * karta się pojawia i znika.
 */

import { Link } from 'react-router-dom';

export function PilotsSwitch({ half }: { half: 'members' | 'groups' }) {
  return (
    <div className="filters">
      <div className="seg" role="group" aria-label="Część modułu Piloci">
        <Link
          className={half === 'members' ? 'seg-btn on' : 'seg-btn'}
          aria-current={half === 'members' ? 'page' : undefined}
          to="/piloci"
        >
          Członkowie
        </Link>
        <Link
          className={half === 'groups' ? 'seg-btn on' : 'seg-btn'}
          aria-current={half === 'groups' ? 'page' : undefined}
          to="/piloci/grupy"
        >
          Grupy
        </Link>
      </div>
    </div>
  );
}
