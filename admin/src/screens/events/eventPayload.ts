/**
 * UZ Aero — panel: `payload` zdarzenia → linie do wypisania (moduł CZYSTY).
 *
 * ══ REGUŁA NADRZĘDNA: POKAŻ WSZYSTKO, ZGADUJ NIC ══
 * `events.payload` jest `JSONB` o kształcie zależnym od typu zdarzenia — a rejestr
 * istnieje po to, żeby odpowiedzieć na pytanie „co DOKŁADNIE przyszło z telefonu".
 * Pole, którego panel nie zna, trafia więc na ekran z SUROWĄ nazwą klucza i surową
 * wartością; nie jest pomijane, nie jest podmieniane na „—" i nie zmienia kolejności.
 * Rejestr, który ukrywa pole, bo go nie rozumie, przestaje być narzędziem śledczym —
 * a to jedyne, po co ten ekran istnieje.
 *
 * ══ DLACZEGO WŁASNY WYPIS, A NIE `JSON.stringify(…, null, 2)` ══
 * Bo mockup `A04` wyróżnia klucze i wartości kolorem, a kolor w panelu wchodzi
 * WYŁĄCZNIE przez klasę CSS. Gotowy napis trzeba by kolorować regexem w komponencie,
 * czyli podejmować decyzję o treści w `.tsx` — dokładnie tam, gdzie nie wolno. Tutaj
 * decyzja jest czysta i ma test.
 *
 * ══ CZEGO TEN MODUŁ NIE ZAKŁADA ══
 * Że payload jest OBIEKTEM. `JSONB` przyjmuje też tablicę, liczbę, napis i `null`,
 * a wiersz wpisany ręcznie albo pochodzący ze starszego telefonu może mieć dowolny
 * kształt. Korzeń jest więc obsługiwany tak samo jak każda inna wartość.
 */

/** Ton wartości = NAZWA KLASY modyfikatora, nie kolor (kolory tylko w CSS). */
export type PayloadTone = 'green' | 'blue' | 'red';

export interface PayloadLine {
  /** Stabilny klucz Reacta — ścieżka w drzewie, unikalna w obrębie payloadu. */
  id: string;
  /** Gotowe wcięcie w spacjach; liczy je TEN moduł, żeby `.tsx` nie liczył nic. */
  indent: string;
  /** Klucz w cudzysłowach (`"dropNumber"`); `null` = element tablicy albo korzeń. */
  key: string | null;
  /** Zapis wartości albo nawias otwierający/zamykający bloku. */
  value: string;
  /** `null` = nawias lub blok; ton niesie wyłącznie wartość liściowa. */
  tone: PayloadTone | null;
  /** Przecinek na końcu linii — wypis ma dać się skopiować i wkleić jako JSON. */
  comma: boolean;
}

/** Dwie spacje na poziom — tyle, ile ma mockup. */
const STEP = '  ';

/**
 * Twarda granica zagnieżdżenia. `JSONB` z bazy nie bywa cykliczny, ale bywa głęboki
 * (payload śladu, zagnieżdżone diffy), a rejestr ma się otworzyć ZAWSZE — także na
 * wierszu, który ktoś wpisał ręcznie. Przekroczenie nie ucina po cichu: linia mówi
 * wprost, że dalej jest treść, której wypis nie pokazuje.
 */
const MAX_DEPTH = 12;

/** Napis w cudzysłowach z escape'em — `JSON.stringify` na samym napisie. */
const quoted = (text: string): string => JSON.stringify(text);

/**
 * Ton wartości LIŚCIOWEJ. Kolejność gałęzi jest kolejnością pewności: im mniej wiemy
 * o wartości, tym bardziej dosłowny zapis i tym bardziej neutralny ton.
 */
function leaf(value: unknown): { text: string; tone: PayloadTone | null } {
  if (value === null) return { text: 'null', tone: 'red' };
  if (typeof value === 'string') return { text: quoted(value), tone: 'green' };
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { text: String(value), tone: 'blue' };
  }
  // `undefined` nie występuje w JSON-ie, ale występuje w JavaScripcie — a odpowiedź
  // przechodzi przez `JSON.parse`, więc lepiej nazwać ten przypadek niż udawać, że go
  // nie ma. Reszta (funkcja, symbol) jest tu niemożliwa i też ma nazwę zamiast pustki.
  return { text: String(value), tone: null };
}

function walk(
  value: unknown,
  context: { key: string | null; depth: number; path: string; comma: boolean },
  out: PayloadLine[],
): void {
  const indent = STEP.repeat(context.depth);
  const base = { id: context.path, indent, key: context.key };

  if (context.depth >= MAX_DEPTH && value !== null && typeof value === 'object') {
    out.push({
      ...base,
      value: '… (zagnieżdżenie głębsze niż wypis rejestru)',
      tone: null,
      comma: context.comma,
    });
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      // Pusta tablica NIE znika: „[]" i brak pola to dwie różne informacje.
      out.push({ ...base, value: '[]', tone: null, comma: context.comma });
      return;
    }
    out.push({ ...base, value: '[', tone: null, comma: false });
    value.forEach((item, index) => {
      walk(
        item,
        {
          key: null,
          depth: context.depth + 1,
          path: `${context.path}.${index}`,
          comma: index < value.length - 1,
        },
        out,
      );
    });
    out.push({
      id: `${context.path}]`,
      indent,
      key: null,
      value: ']',
      tone: null,
      comma: context.comma,
    });
    return;
  }

  if (value !== null && typeof value === 'object') {
    // `Object.entries` oddaje WYŁĄCZNIE własne klucze wyliczalne, więc klucz taki jak
    // `constructor` czy `hasOwnProperty` jedzie tu jako zwykłe pole — a nic z prototypu
    // nie wjeżdża do wypisu. Kolejność zostaje TA, W KTÓREJ PRZYSZŁA z serwera.
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.push({ ...base, value: '{}', tone: null, comma: context.comma });
      return;
    }
    out.push({ ...base, value: '{', tone: null, comma: false });
    entries.forEach(([key, item], index) => {
      walk(
        item,
        {
          key: quoted(key),
          depth: context.depth + 1,
          path: `${context.path}.${key}`,
          comma: index < entries.length - 1,
        },
        out,
      );
    });
    out.push({
      id: `${context.path}}`,
      indent,
      key: null,
      value: '}',
      tone: null,
      comma: context.comma,
    });
    return;
  }

  const { text, tone } = leaf(value);
  out.push({ ...base, value: text, tone, comma: context.comma });
}

/**
 * `payload` → linie wypisu, W KOLEJNOŚCI Z SERWERA.
 *
 * Korzeń dowolnego kształtu: obiekt, tablica, liczba, napis, `null`. Wynik zawsze ma
 * co najmniej jedną linię — payload, który nic nie wypisuje, wyglądałby na brak danych,
 * a `null` w bazie to konkretna, zapisana wartość.
 */
export function payloadLines(payload: unknown): PayloadLine[] {
  const out: PayloadLine[] = [];
  walk(payload, { key: null, depth: 0, path: '$', comma: false }, out);
  return out;
}

/**
 * Podpis nad wypisem — mówi, CZYM jest to, na co człowiek patrzy.
 *
 * Rozróżniamy kształt korzenia, bo `{}` i `null` znaczą co innego: pierwsze to
 * zdarzenie bez treści (kołowanie, uruchomienie silnika — poprawny stan), drugie to
 * wiersz, w którym payload jest jawnym `null`-em, czyli czymś, czego telefon nie
 * zapisuje. Jeden napis na oba kazałby zgadywać.
 */
export function payloadNote(payload: unknown): string {
  if (payload === null) return 'payload · JSONB — jawny null, nie pusty obiekt';
  if (Array.isArray(payload)) return 'payload · JSONB — tablica, nie obiekt';
  if (typeof payload !== 'object') return 'payload · JSONB — wartość prosta, nie obiekt';
  if (Object.keys(payload as object).length === 0) {
    return 'payload · JSONB — pusty obiekt (zdarzenie bez treści)';
  }
  return 'payload · JSONB — surowy, tak jak w bazie';
}
