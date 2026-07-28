/**
 * UZ Aero — ADAPTER `CredentialsPort` na `expo-secure-store` (§3.0, §5.2).
 *
 * Tokeny i profil idą do Keystore Androida — wyciągnięcie plików aplikacji z urządzenia
 * nie daje sesji. Wszystko pod JEDNYM kluczem jako JSON: komplet poświadczeń jest
 * niepodzielny (token bez profilu jest bezużyteczny, profil bez tokenów kłamie),
 * więc zapis częściowy nie ma prawa istnieć.
 *
 * ⚠️ Moduł natywny — pierwszy raz zadziała po przebudowie dev clienta
 * (`npm run android`). Do tego czasu `load()` rzuci przy imporcie natywnym; composition
 * root łapie to i trzyma aplikację na ekranie logowania z czytelnym powodem, zamiast
 * wywracać się na starcie.
 */

import * as SecureStore from 'expo-secure-store';

import type { CredentialsPort, StoredCredentials } from '../../application/ports';

const KEY = 'uzaero.credentials.v1';

export class SecureCredentials implements CredentialsPort {
  async load(): Promise<StoredCredentials | null> {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as StoredCredentials;
    } catch {
      // Uszkodzony wpis traktujemy jak brak profilu — droga przez 00-login,
      // a nie crash pętli synca przy każdej okazji.
      return null;
    }
  }

  async save(credentials: StoredCredentials): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(credentials));
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
  }
}
