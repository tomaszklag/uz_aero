/**
 * UZ Aero - PORT generatora identyfikatorów (docs/_main.md.txt §4.1).
 *
 * `uuid` zdarzenia jest kluczem idempotencji (dedup po UUID na serwerze), więc musi być
 * unikalny - ale w testach musi być PRZEWIDYWALNY, inaczej asercje na kolejności i dedupie
 * są nie do napisania. Stąd port: produkcja wstrzykuje `uuidv4` (lub `expo-crypto`),
 * testy - licznik.
 *
 * Świadomie jako typ funkcyjny, nie interfejs z jedną metodą: port ma dokładnie jedną
 * odpowiedzialność i `() => string` opisuje ją bez ceremonii.
 */

export type IdPort = () => string;
