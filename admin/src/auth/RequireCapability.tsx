/**
 * Ninerdeck - panel: trasa, na którą wolno wejść tylko z danym DOSTĘPEM.
 *
 * Kolumna boczna ukrywa pozycję bez dostępu (`ui/shell/nav.ts`), ale adres da się
 * wkleić z pamięci albo z cudzej rozmowy. Do issue #216 strażnik przekierowywał wtedy
 * na ekran startowy bez słowa - dla modułu platformy, którego klub nie ma prawa
 * dostać, było to trafne („tego modułu tu nie ma"). Odkąd do panelu wchodzi KAŻDY
 * członek klubu, adres bez dostępu jest codziennością: pilot z linkiem do dziennika
 * ma się dowiedzieć, CO tam jest, KTÓREJ zdolności mu brakuje i KOGO o nią prosić -
 * przekierowanie bez słowa wyglądałoby jak awaria (`screens/common/noAccess.ts`).
 *
 * `access` mówi TYM SAMYM słownikiem, co pozycja kolumny (`Access` z `nav.ts`): trasa
 * i pozycja to jedna decyzja, więc rozstrzyga je jedna funkcja - `hasAccess`.
 *
 * **To nie jest zabezpieczenie** - dane i tak wydaje serwer, sprawdzając zdolność przy
 * każdym żądaniu (`server/src/domain/roles.ts`). Tutaj chodzi wyłącznie o to, co widzi
 * człowiek, który trafił pod adres nie dla niego.
 */

import { NoAccessScreen } from '../screens/common/NoAccessScreen';
import { hasAccess, kindOf, type Access } from '../ui/shell/nav';
import { useSessionState } from './sessionContext';

interface RequireCapabilityProps {
  access: Access;
  children: React.ReactNode;
}

export function RequireCapability({ access, children }: RequireCapabilityProps) {
  const { session } = useSessionState();
  if (!hasAccess(session?.capabilities, kindOf(session), access)) {
    return <NoAccessScreen access={access} />;
  }
  return <>{children}</>;
}
