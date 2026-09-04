/**
 * UZ Aero (testy) - fałszywy dostawca tożsamości (`IdentityProviderPort`).
 *
 * ══ DLACZEGO ATRAPA, SKORO REGUŁA PROJEKTU MÓWI „PRAWDZIWE ADAPTERY" ══
 * Bo prawdziwym adapterem jest tu KRYPTOGRAFIA GOOGLE, a nie nasz kod: `GoogleIdTokens`
 * sprawdza podpis kluczem pobranym z serwera Google. Test end-to-end przez ten adapter
 * wymagałby albo sieci i cudzego konta, albo podstawienia kluczy - czyli i tak atrapy,
 * tylko o poziom niżej i z całym RSA w środku każdego przypadku.
 *
 * Podział jest więc taki: **`googleIdTokens.test.ts` sprawdza WERYFIKACJĘ** (podpis,
 * `iss`, `aud`, termin, rotacja kluczy) na kluczu wygenerowanym w procesie, a wszystkie
 * pozostałe testy biorą tę atrapę i sprawdzają to, co dzieje się PO weryfikacji:
 * podpięcie konta, zgłoszenie, odrzucenie, bramę panelu. Granica przebiega dokładnie
 * tam, gdzie kończy się nasza decyzja, a zaczyna cudza biblioteka.
 */

import type { IdentityProviderPort, ProviderProfile } from '../src/application/common/ports.ts';
import { TEST_PILOTS } from './testWorld.ts';

/**
 * Token testowy dla konta ze świata referencyjnego - „zaloguj się jako TMK".
 *
 * Kształt jest jawnie nieprawdziwy (prawdziwy token to trzy segmenty base64url), żeby
 * nikomu nie przyszło do głowy przepuścić go przez prawdziwy weryfikator.
 */
export const googleTokenFor = (code: string): string => `test-google-token:${code}`;

/** Token konta Google, którego NIE MA w klubie - droga zgłoszenia rejestracyjnego. */
export const googleTokenForStranger = (subject: string): string =>
  `test-google-stranger:${subject}`;

export class TestIdentityProvider implements IdentityProviderPort {
  private readonly extra = new Map<string, ProviderProfile>();

  /** Dopisanie własnego profilu - dla przypadków spoza świata referencyjnego. */
  register(token: string, profile: ProviderProfile): void {
    this.extra.set(token, profile);
  }

  async verifyIdToken(idToken: string): Promise<ProviderProfile | null> {
    const own = this.extra.get(idToken);
    if (own != null) return own;

    const known = TEST_PILOTS.find(([, code]) => googleTokenFor(code) === idToken);
    if (known != null) {
      const [, code, name, email] = known;
      return {
        provider: 'google',
        subject: `google-sub-${code}`,
        email,
        // Zweryfikowany, bo tak wygląda konto Gmail w produkcji - i dopiero wtedy
        // działa podpięcie po e-mailu, czyli droga, którą testy mają przechodzić.
        emailVerified: true,
        name,
      };
    }

    if (idToken.startsWith('test-google-stranger:')) {
      const subject = idToken.slice('test-google-stranger:'.length);
      return {
        provider: 'google',
        subject,
        email: `${subject}@gmail.com`,
        emailVerified: true,
        name: `Nieznajomy ${subject}`,
      };
    }

    return null;
  }
}
