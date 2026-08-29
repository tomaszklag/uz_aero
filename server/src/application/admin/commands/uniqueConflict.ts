/**
 * UZ Aero (serwer) - naruszenie UNIKALNOŚCI zgłoszone przez bazę (SQLSTATE `23505`)
 * → nazwa pola formularza.
 *
 * ══ DLACZEGO TO ISTNIEJE OBOK SPRAWDZENIA PRZED ZAPISEM ══
 * Sprawdzenie w porcie (`conflict`) zostaje pierwszą linią i tylko ono umie powiedzieć,
 * KTÓRE pole jest zajęte, nie wywracając transakcji. Ale sprawdzenie i `INSERT` to dwa
 * kroki, a między nimi mieści się druga transakcja z tą samą wartością: przegrany
 * wyścig wychodziłby z komendy jako nieznany błąd i lądował jako **500**, choć jest
 * dokładnie tym samym zdarzeniem, które sprawdzenie opisuje jako 409.
 *
 * ══ DLACZEGO OSOBNY PLIK, A NIE DRUGA KOPIA ══
 * Bo cała trudność siedzi w jednej linii regexa i jest niewidoczna: `\b` NIE wystarcza,
 * bo podkreślenie jest znakiem słowa, więc `\bcode\b` nie widzi `pilots_code_key` -
 * a to najczęstsza postać, w jakiej sterowniki podają ograniczenie. Druga kopia tej
 * reguły rozjechałaby się przy pierwszej poprawce, a objaw byłby taki, że jeden
 * formularz pokazuje zajęte pole, a drugi „coś się zepsuło".
 *
 * Ograniczenie NIEROZPOZNANE oddaje `null` i leci dalej jako 500 - i tak ma być:
 * `pilots_pkey` znaczyłoby kolizję uuid-ów, czyli awarię, a nie zajętą wartość.
 */

/**
 * `fields` w kolejności PRIORYTETU - przy podwójnej kolizji wygrywa pierwsze pole
 * z listy. To jest kolejność pól w FORMULARZU: człowiek poprawia najpierw to, co widzi
 * wyżej. (Ta sama zasada, co w `PilotsAdminPort.conflict`.)
 */
export function uniqueConflictOn<F extends string>(err: unknown, fields: readonly F[]): F | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { code?: unknown; constraint?: unknown; detail?: unknown; message?: unknown };
  if (e.code !== '23505') return null;

  // Sterowniki podają raz `constraint` (`pilots_code_key`), raz `detail`
  // (`Key (code)=(TMK) already exists`) - sklejamy wszystko i szukamy w całości.
  const where = [e.constraint, e.detail, e.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

  for (const field of fields) {
    if (mentionsField(where, field)) return field;
  }
  return null;
}

/** Separatorem jest tu wszystko poza literą i cyfrą - patrz nagłówek pliku. */
function mentionsField(text: string, field: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${field}([^a-z0-9]|$)`, 'i').test(text);
}
