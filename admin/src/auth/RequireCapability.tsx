/**
 * UZ Aero - panel: trasa, na którą wolno wejść tylko z daną zdolnością.
 *
 * Kolumna boczna ukrywa pozycję bez zdolności (`ui/shell/nav.ts`), ale adres da się
 * wkleić z pamięci albo z cudzej rozmowy - i wtedy klub dostawał RAMĘ modułu platformy
 * z błędem 401 pod spodem (issue #99 C6: „ani zakładki, ani danych"). Pusty ekran
 * z komunikatem opisuje uprawnienia komuś, kto o nie nie pytał; przekierowanie na
 * własny ekran startowy odpowiada wprost: tego modułu tu nie ma.
 *
 * **To nie jest zabezpieczenie** - dane i tak wydaje serwer, sprawdzając zdolność przy
 * każdym żądaniu (`server/src/domain/roles.ts`). Tutaj chodzi wyłącznie o to, co widzi
 * człowiek, który trafił pod adres nie dla niego.
 */

import type { Capability } from '../api/dto';
import { can } from './can';
import { HomeRedirect } from './HomeRedirect';
import { useSessionState } from './sessionContext';

interface RequireCapabilityProps {
  capability: Capability;
  children: React.ReactNode;
}

export function RequireCapability({ capability, children }: RequireCapabilityProps) {
  const { session } = useSessionState();
  if (!can(session?.capabilities, capability)) return <HomeRedirect />;
  return <>{children}</>;
}
