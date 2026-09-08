/**
 * UZ Aero - panel: TREŚĆ arkusza makiet `design/panel/panel.css` (czysta funkcja).
 *
 * Makiety panelu i panel mają JEDEN arkusz stylów, złożony z tych samych plików:
 * `admin/src/styles/` w kolejności kaskady z `main.tsx` + rama makiety
 * (`design/panel/rama.css` - kanwa, okno przeglądarki, inwentarz, których panel nie ma).
 * Do stylu lekkiego (issue #107) sklejano to RĘCZNIE, a nagłówek `panel.css` prosił,
 * żeby nowy komponent dokładać najpierw tam, a potem przepisywać do panelu -
 * czyli utrzymywać kopię, która rozjeżdża się przy pierwszej poprawce jednej strony.
 * Odtąd plik jest GENEROWANY, a równość przybija `admin/test/panelCss.generated.test.ts`.
 *
 * Osobno od pisania pliku (`emitPanelCss.ts`), bo dokładnie tę treść porównuje test -
 * ten sam podział, co `tokensCss.ts` / `emitCss.ts` w pakiecie tokenów.
 *
 * Kolejność JEST znacząca i nie wolno jej przestawiać: `tbody tr.voided` z `logbook.css`
 * dokłada przekreślenie do reguł tabeli. Arkusz przestawiony alfabetycznie wyglądałby
 * prawie tak samo - i to „prawie" byłoby awarią cichą.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ADMIN = join(here, '..');
const STYLES = join(ADMIN, 'src', 'styles');
const FRAME = join(ADMIN, '..', 'design', 'panel', 'rama.css');

/**
 * Źródło bez '\r': przy `core.autocrlf=true` pliki leżą na dysku z CRLF, a generator
 * ma produkować ten sam bajt w bajt wynik na każdej maszynie.
 */
const read = (file: string): string =>
  readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trimEnd();

/** Arkusze panelu w kolejności z `admin/src/main.tsx` - bez `fonts.css` (patrz niżej). */
const SHEETS: readonly { file: string; title: string }[] = [
  { file: 'tokens.css', title: 'TOKENY' },
  { file: 'base.css', title: 'RESET I KORZEŃ DOKUMENTU' },
  { file: 'layout.css', title: 'WYMIARY RAMY I SZKIELET UKŁADU' },
  { file: 'components/shell.css', title: 'RAMA - PASEK GÓRNY, KOLUMNA BOCZNA, OKRUSZKI' },
  { file: 'components/controls.css', title: 'PRZYCISKI I POLA FORMULARZA' },
  { file: 'components/surfaces.css', title: 'KARTY, PLAKIETKI, BANERY, STANY PUSTE' },
  { file: 'components/page.css', title: 'NAGŁÓWEK STRONY I KAFLE' },
  { file: 'components/filters.css', title: 'WYSZUKIWANIE I ZAWĘŻENIA' },
  { file: 'components/table.css', title: 'TABELA' },
  { file: 'components/drawer.css', title: 'SZUFLADA SZCZEGÓŁU' },
  { file: 'components/skeleton.css', title: 'PLAMKI ŁADOWANIA' },
  { file: 'components/login.css', title: 'EKRAN LOGOWANIA' },
  { file: 'components/logbook.css', title: 'DZIENNIK - PARY, BRAKI, ZAKRES DAT' },
  { file: 'components/track.css', title: 'ŚLAD GPS - MAPA I PROFIL PIONOWY' },
  { file: 'components/bugs.css', title: 'ZGŁOSZENIA BŁĘDÓW' },
];

export const PANEL_CSS_HEADER = `/* ══════════════════════════════════════════════════════════════════════════════
   UZ AERO - PANEL · WSPÓLNY ARKUSZ MAKIET
   ══════════════════════════════════════════════════════════════════════════════

   PLIK GENEROWANY - NIE EDYTUJ RĘCZNIE.
   Źródło: admin/src/styles/ (arkusze panelu, w kolejności kaskady z admin/src/main.tsx)
           + design/panel/rama.css (kanwa, okno przeglądarki, inwentarz - tylko makieta)
   Odtworzenie: npm run panel:css --workspace admin
   Równość pliku ze źródłem przybija admin/test/panelCss.generated.test.ts.

   CZYM JEST TEN PLIK
   Odpowiednik bloku <style> z makiet telefonu (design/*.html), wyniesiony do osobnego
   pliku, bo makiet panelu jest kilkanaście. Makieta linkuje go jednym wierszem:
   <link rel="stylesheet" href="panel.css">. Panel i makiety mają DOKŁADNIE te same
   reguły i te same nazwy klas - grep po \`cell-sub\` znajduje jednocześnie makietę
   i ekran, a recenzent porównuje DOM z plikiem HTML linia w linię.

   KIERUNEK: MAKIETA PROWADZI UKŁAD, ARKUSZ JEST JEDEN
   Nowy ekran zaczyna się od makiety (design/panel/SZABLON.html); nowy komponent
   dokłada się do arkusza w admin/src/styles/components/ i uruchamia generator -
   makieta widzi go w tej samej chwili, co panel. Klasy tylko makiety (rama, atrapa
   przycisku Google, komponenty czekające na kod) mieszkają w rama.css.

   CZCIONKI
   Z Google Fonts, przez <link> w <head> makiety - nie z self-hostowanych woff2,
   którymi jedzie panel (admin/src/styles/fonts.css). Makieta ma się otwierać z dysku
   dwuklikiem, a @font-face ze ścieżkami /fonts/* działa wyłącznie na serwerze panelu.
   Kroje i wagi są te same (Bebas Neue · Archivo 400-700 · JetBrains Mono 400/500/700),
   więc metryka też.
   ══════════════════════════════════════════════════════════════════════════════ */`;

const banner = (n: number, title: string, source: string): string =>
  `/* ═══════════════════════════════════════════════════════════════════════════
   ${String(n).padStart(2, '0')}. ${title}
   źródło: ${source}
   ═══════════════════════════════════════════════════════════════════════════ */`;

/** Nagłówek + arkusze panelu z banerami sekcji + rama makiety. Dokładnie to, co ma leżeć w pliku. */
export function composePanelCss(): string {
  const parts = SHEETS.map((sheet, index) => {
    const body = read(join(STYLES, sheet.file));
    return `${banner(index + 1, sheet.title, `admin/src/styles/${sheet.file}`)}\n\n${body}`;
  });
  const frame = read(FRAME);
  return `${PANEL_CSS_HEADER}\n\n${parts.join('\n\n')}\n\n${frame}\n`;
}
