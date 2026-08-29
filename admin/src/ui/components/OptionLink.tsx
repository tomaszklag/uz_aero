/**
 * UZ Aero - panel: pozycja listy kart prowadząca w głąb (`.opt` jako `<a>`).
 *
 * Wariant NAWIGACYJNY karty wyboru: mockup `A03a` używa `.opt` do wypisania sesji
 * objętych flagą, każda jako link do karty dnia. Szewron po prawej zajmuje miejsce
 * `.opt-check`, bo mówi to samo co on - „to jest do kliknięcia" - tylko o ruchu
 * w głąb, a nie o zaznaczeniu.
 */

import { Link } from 'react-router-dom';

import { ChevronRightIcon } from './icons';

interface OptionLinkProps {
  to: string;
  name: string;
  /** Druga linia: mono, drobna - identyfikatory i liczby, nie zdania. */
  desc: string;
}

export function OptionLink({ to, name, desc }: OptionLinkProps) {
  return (
    <Link className="opt" to={to}>
      <span className="opt-body">
        <span className="opt-name">{name}</span>
        <span className="opt-desc">{desc}</span>
      </span>
      <span className="opt-go">
        <ChevronRightIcon size={15} />
      </span>
    </Link>
  );
}
