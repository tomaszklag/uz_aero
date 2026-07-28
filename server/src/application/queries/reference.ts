/**
 * UZ Aero (serwer) — zapytanie `GET /reference` (§4.6, §4.8).
 *
 * Strona ODCZYTU w naszym uproszczonym CQRS: bierze migawkę z portu i dokłada ETag.
 * ETag liczymy z najświeższego `updated_at` — flota zmienia się kilka razy w sezonie,
 * więc porównanie znacznika oszczędza telefonom pobierania niezmienionej listy
 * (telefon i tak trzyma cache; tu chodzi o koszt łącza w terenie).
 */

import type { ReferencePort, ReferenceSnapshot } from '../ports.ts';

export interface ReferenceView {
  snapshot: ReferenceSnapshot;
  /** Słaby ETag — zmienia się wtedy i tylko wtedy, gdy zmieniły się dane. */
  etag: string;
}

export class ReferenceQueries {
  constructor(private readonly reference: ReferencePort) {}

  async get(): Promise<ReferenceView> {
    const snapshot = await this.reference.snapshot();
    const stamp = snapshot.updatedAt?.getTime() ?? 0;
    return { snapshot, etag: `W/"ref-${stamp}"` };
  }
}
