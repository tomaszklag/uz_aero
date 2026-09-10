/**
 * UZ Aero (serwer) - `MembershipRequest` → kontrakt kolejki zgłoszeń (karta ZGŁOSZENIA
 * nad listą pilotów; issue #100, D2).
 *
 * Czysta funkcja, jak `pilotListItem.ts`: port oddaje model warstwy aplikacji, a kształt
 * „na drucie" (stemple jako ISO 8601) powstaje tutaj - testowalnie, bez bazy.
 */

import type { AdminMembershipRequest } from '../contracts/memberships.ts';
import type { MembershipRequest } from '../ports.ts';

export function membershipRequest(request: MembershipRequest): AdminMembershipRequest {
  return {
    pilotId: request.pilotId,
    name: request.name,
    email: request.email,
    requestedAt: request.requestedAt.toISOString(),
  };
}
