/**
 * UZ Aero - wspólny wzorzec ODCZYTU z serwera pod tokenem (§3.0).
 *
 * Świeży token → wywołanie → przy 401 JEDNA rotacja i ponowienie. Każdy inny
 * nieszczęśliwy koniec (offline, martwy refresh, odmowa merytoryczna) zwija się
 * do `null` - „nie wiadomo TERAZ" - bo każda z tych przyczyn ma dla odczytu tę samą
 * odpowiedź: zostań przy tym, co masz w cache, i spróbuj przy następnej okazji.
 *
 * NIE używa go `SyncEngine.drain` (wysyłka outboxa): tam rozróżnienie
 * offline / auth_expired / rejected niesie decyzje, więc zwijanie do `null`
 * byłoby utratą informacji, a nie uproszczeniem.
 */

import type { AuthService } from '../auth/authService';
import { ServerRejectedError, ServerUnreachableError } from '../ports/serverPort';

export async function authorizedFetch<T>(
  auth: AuthService,
  call: (token: string) => Promise<T>,
): Promise<T | null> {
  let token = await auth.freshToken();
  if (token == null) return null;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call(token);
    } catch (error) {
      if (error instanceof ServerUnreachableError) return null;
      if (error instanceof ServerRejectedError && error.status === 401 && attempt === 0) {
        let rotated: string | null;
        try {
          rotated = await auth.rotate();
        } catch {
          return null;
        }
        if (rotated == null) return null;
        token = rotated;
        continue;
      }
      if (error instanceof ServerRejectedError) return null;
      throw error; // błąd programistyczny - nie udawaj, że to offline
    }
  }
}
