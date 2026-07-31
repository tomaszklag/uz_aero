/**
 * UZ Aero — panel: INWENTARZ IKON, przepisany 1:1 z `design/admin/*.html`.
 *
 * Jeden plik na całą rodzinę, wbrew regule „jedna odpowiedzialność = jeden plik",
 * i to jest świadomy wyjątek: to nie są komponenty z zachowaniem, tylko kilkanaście
 * czteroliniowych ścieżek SVG stanowiących JEDEN inwentarz. Rozbicie ich na kilkanaście
 * plików utrudniłoby jedyną kontrolę, jaką mamy — porównanie z mockupem wzrokiem.
 *
 * Ścieżki są kopiami z plików HTML, nie własną interpretacją. Zmiana ikony zaczyna
 * się od zmiany w `design/admin/`, tak jak każda inna zmiana wyglądu.
 */

interface IconProps {
  size?: number;
}

/** Ikona konturowa — wspólna oprawa (`stroke-width` i `viewBox` jak w mockupach). */
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

/** Samolot — znak marki i ikona floty. Jedyna ikona wypełniona, jak w mockupach. */
export function PlaneIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </svg>
  );
}

export function DashboardIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Stroke>
  );
}

export function DaysIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M12 2v20M2 12h20" />
    </Stroke>
  );
}

export function FlagIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </Stroke>
  );
}

export function FileIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </Stroke>
  );
}

export function ExportIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </Stroke>
  );
}

export function ClockIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M12 8v4l3 2" />
      <circle cx="12" cy="12" r="9" />
    </Stroke>
  );
}

export function ChartIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </Stroke>
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

export function WrenchIcon({ size }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z" />
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

/** Lupa — pasek filtrów list (A02, A03). */
export function SearchIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Stroke>
  );
}

/** Krzyżyk — zamknięcie szuflady (`.x-btn`). */
export function CloseIcon({ size = 14 }: IconProps) {
  return (
    <Stroke size={size} width={2.5}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Stroke>
  );
}

/**
 * Goła „ptaszka" — potwierdzenie akcji i stan pusty skrzynki (A03b).
 *
 * ISTNIEJE OBOK `SuccessIcon` (ptaszek w kółku) i to nie jest duplikat: mockupy
 * używają obu w różnych miejscach — kółko w banerze, sam znak na przycisku
 * „Rozwiąż i odblokuj kartę" oraz w ikonie stanu pustego.
 */
export function CheckIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size} width={3}>
      <polyline points="20 6 9 17 4 12" />
    </Stroke>
  );
}

/** Szewron w prawo — pozycja listy prowadząca w głąb. */
export function ChevronRightIcon({ size = 15 }: IconProps) {
  return (
    <Stroke size={size}>
      <polyline points="9 18 15 12 9 6" />
    </Stroke>
  );
}

/** Ołówek — przejście do korekty zdarzenia (A02b). */
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

/** Strzałka „wyjdź" — wylogowanie ze stopki sidebara. */
export function SignOutIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size} width={2.5}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="14 17 19 12 14 7" />
      <line x1="19" y1="12" x2="9" y2="12" />
    </Stroke>
  );
}
