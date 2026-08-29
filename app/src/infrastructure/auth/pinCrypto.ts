/**
 * UZ Aero - ADAPTER `PinCryptoPort`: solony SHA-256 (§3.0).
 *
 * Model zagrożeń opisuje port: 4-cyfrowego PIN-u nie obroni żaden KDF przy wycieku
 * magazynu (10 000 kombinacji), a magazyn i tak trzyma refresh token. Hash z solą
 * chroni przed odczytem PIN-u wprost i przed tęczową tablicą wspólną dla urządzeń.
 *
 * Sól z `Math.random` jest tu wystarczająca - nie jest sekretem (leży obok hasha),
 * ma tylko różnicować urządzenia; kryptograficzne RNG wymagałoby modułu natywnego.
 */

import type { PinCryptoPort } from '../../application/ports/pinCryptoPort';
import type { PinRecord } from '../../application/ports/credentialsPort';
import { sha256Hex } from './sha256';

export class PinCrypto implements PinCryptoPort {
  async create(pin: string): Promise<PinRecord> {
    const salt = randomHex(16);
    return { salt, hash: sha256Hex(`${salt}:${pin}`) };
  }

  async verify(pin: string, record: PinRecord): Promise<boolean> {
    return sha256Hex(`${record.salt}:${pin}`) === record.hash;
  }
}

function randomHex(bytes: number): string {
  let out = '';
  for (let i = 0; i < bytes; i += 1) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}
