/**
 * Ninerdeck - panel: INWENTARZ IKON, przepisany 1:1 z `design/admin/*.html`.
 *
 * Jeden plik na całą rodzinę, wbrew regule „jedna odpowiedzialność = jeden plik",
 * i to jest świadomy wyjątek: to nie są komponenty z zachowaniem, tylko kilkanaście
 * czteroliniowych ścieżek SVG stanowiących JEDEN inwentarz. Rozbicie ich na kilkanaście
 * plików utrudniłoby jedyną kontrolę, jaką mamy - porównanie z mockupem wzrokiem.
 *
 * Ścieżki są kopiami z plików HTML, nie własną interpretacją. Zmiana ikony zaczyna
 * się od zmiany w makiecie (`design/panel/SZABLON.html`), tak jak każda inna zmiana
 * wyglądu.
 */

interface IconProps {
  size?: number;
}

/** Ikona konturowa - wspólna oprawa (`stroke-width` i `viewBox` jak w mockupach). */
function Stroke({ size = 15, width = 2, children }: IconProps & { width?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * Monogram `9` - ZNAK MARKI Ninerdeck (plakietka logowania, wybór klubu, ikona aplikacji).
 *
 * Cyfra jest geometryczna: oczko o promieniu 6,1 z obwodem grubości 3,3 i ogon tej samej
 * szerokości, więc jego lewa krawędź siada na okręgu wewnętrznym, a prawa jest pionową
 * styczną do zewnętrznego. Oczko biegnie W DRUGĄ STRONĘ niż obrys - to ono, przez regułę
 * niezerowego nawinięcia, robi z niego dziurę.
 *
 * Ta sama geometria stoi w `app/scripts/build-icons.js` (stała `NINE`) i to ona generuje
 * ikony aplikacji. Skrypt musi działać gołym `node`, więc ścieżki stąd NIE IMPORTUJE -
 * poprawka znaku wchodzi w OBU miejscach naraz albo rozjeżdża markę.
 */
export function BrandMark({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.1 8.1A6.1 6.1 0 1 0 14.8 13.52L14.8 22H18.1ZM14.8 8.1A2.8 2.8 0 0 1 9.2 8.1A2.8 2.8 0 0 1 14.8 8.1Z" />
    </svg>
  );
}

/** Samolot - ikona floty. Jedyna ikona wypełniona, jak w mockupach. */
export function PlaneIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </svg>
  );
}

export function PeopleIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Stroke>
  );
}

export function LockIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Stroke>
  );
}

export function InfoIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </Stroke>
  );
}

export function WarningIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Stroke>
  );
}

export function ErrorIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </Stroke>
  );
}

export function SuccessIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="8 12.5 11 15.5 16 9.5" />
    </Stroke>
  );
}

/** Lupa - pasek filtrów list (A02, A03). */
export function SearchIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Stroke>
  );
}

/** Krzyżyk - zamknięcie szuflady (`.x-btn`). */
export function CloseIcon({ size = 14 }: IconProps) {
  return (
    <Stroke size={size} width={2.5}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Stroke>
  );
}

/**
 * Goła „ptaszka" - potwierdzenie akcji i stan pusty skrzynki (A03b).
 *
 * ISTNIEJE OBOK `SuccessIcon` (ptaszek w kółku) i to nie jest duplikat: mockupy
 * używają obu w różnych miejscach - kółko w banerze, sam znak na przycisku
 * „Rozwiąż i odblokuj kartę" oraz w ikonie stanu pustego.
 */
export function CheckIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size} width={3}>
      <polyline points="20 6 9 17 4 12" />
    </Stroke>
  );
}

/** Ołówek - przejście do korekty zdarzenia (A02b). */
export function EditIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Stroke>
  );
}

/** Strzałka „wejdź" z przycisku logowania (A00). */
export function SignInIcon({ size = 14 }: IconProps) {
  return (
    <Stroke size={size} width={2.5}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </Stroke>
  );
}

/** Strzałka „wyjdź" - wylogowanie ze stopki sidebara. */
export function SignOutIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size} width={2.5}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="14 17 19 12 14 7" />
      <line x1="19" y1="12" x2="9" y2="12" />
    </Stroke>
  );
}

/** Kosz - „tego zdarzenia nie było" w linii tytułu szuflady korekty (3.2.0, §5). */
export function TrashIcon({ size = 15 }: IconProps) {
  return (
    <Stroke size={size} width={2.2}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Stroke>
  );
}

/** Plus - założenie nowego konta i nowej jednostki floty. */
export function PlusIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size} width={2.5}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Stroke>
  );
}

/* ── ikony kolumny bocznej (styl lekki, issue #107) - 1:1 z `design/panel/SZABLON.html` ── */

/** Książka - moduł Dziennik. */
export function BookIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </Stroke>
  );
}

/** Robak - moduł Zgłoszenia (na czas testów, issue #87). */
export function BugIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </Stroke>
  );
}

/** Kalendarz - moduł zajętości floty. Kartka z dwoma kolcami i linią nagłówka. */
export function CalendarIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size} width={2.2}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </Stroke>
  );
}

/** Budynek - klub w kolumnie i moduł Organizacje (wielofirmowość 2.0.0). */
export function BuildingIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size} width={2.2}>
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
    </Stroke>
  );
}

/** Szewrony w górę i w dół - „zmień klub" przy kafelku kontekstu. */
export function SwitchIcon({ size = 14 }: IconProps) {
  return (
    <Stroke size={size} width={2.2}>
      <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
    </Stroke>
  );
}

/**
 * Klucz - KOD KLUBU (mockup `piloci-kod-klubu`; issue #101, E3).
 *
 * Nie kłódka: kłódka w tym panelu znaczy BRAK UPRAWNIENIA (`can.ts`), a kod klubu jest
 * dokładnie odwrotnością - tym, co drzwi otwiera.
 */
export function KeyIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size} width={2.5}>
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </Stroke>
  );
}

/**
 * Oko - przełącznik „pokaż hasło" (2.1.0, mockupy `00-logowanie` i `konto`).
 *
 * JEDNA ikona w obu stanach, a nie oko i oko przekreślone: o tym, czy hasło jest
 * odsłonięte, mówi kontrast (`.eye-btn[aria-pressed='true']` w `login.css`) i sama
 * treść pola. Druga ścieżka kazałaby czytać ikonę, zamiast patrzeć na to, co pod nią.
 */
export function EyeIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size} width={2}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </Stroke>
  );
}

/**
 * Przeglądarka i telefon - RODZAJ urządzenia w wierszu sesji (2.1.0, §5.6).
 *
 * DWIE ikony, nie trzy: rozstrzyga POWIERZCHNIA sesji (`panel` / `mobile`), która jest
 * danymi, a nie kształt obudowy, którego rejestr nie zna. Mockup rysuje przy tablecie
 * własną ikonę, ale wziąć ją byłoby skąd wyłącznie z nazwy urządzenia - a zgadywanie
 * „w napisie jest «Tab», więc to tablet" jest domysłem postawionym obok faktów.
 */
export function MonitorIcon({ size = 15 }: IconProps) {
  return (
    <Stroke size={size} width={2}>
      <rect width="20" height="14" x="2" y="3" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" x2="16" y1="21" y2="21" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" x2="12" y1="17" y2="21" strokeLinecap="round" strokeLinejoin="round" />
    </Stroke>
  );
}

export function PhoneIcon({ size = 15 }: IconProps) {
  return (
    <Stroke size={size} width={2}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 18h.01" strokeLinecap="round" strokeLinejoin="round" />
    </Stroke>
  );
}

/* ── ścieżka akceptacji i kolejka decyzji (3.1.0, issue #165) - 1:1 z `design/panel/kalendarz-*.html` ── */

/**
 * Uchwyt przeciągania - sześć kropek. Wypełniony, bo to nie jest kontur rzeczy, tylko
 * faktura chwytu; stoi w przycisku `.drag-handle`, który przyjmuje fokus i strzałki.
 */
export function DragHandleIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

/** Lista z ptaszkiem - stan pusty ścieżki („potwierdzają się od razu") i kolejki („nikt nie czeka"). */
export function ChecklistIcon({ size = 22 }: IconProps) {
  return (
    <Stroke size={size} width={1.8}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Stroke>
  );
}

/**
 * Podgląd w szufladzie (kolejka decyzji, issue #206) - ramka okna z linią szuflady.
 * Stoi w `.go` przy wartości prowadzącej w głąb; świeci dopiero pod kursorem.
 */
export function PreviewIcon({ size = 12 }: IconProps) {
  return (
    <Stroke size={size} width={2}>
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="15" y1="4" x2="15" y2="20" strokeLinecap="round" />
    </Stroke>
  );
}
