/**
 * UZ Aero - Design System: prymitywy i komponenty wielokrotnego użytku.
 *
 * Zasada: ekran nie definiuje własnych „kart", „chipów" ani „przycisków" - jeśli
 * czegoś brakuje, dokładamy to TUTAJ i używamy wszędzie. Dzięki temu zmiana wzorca
 * (np. powiększenie celów dotykowych po audycie) przechodzi przez całą aplikację.
 */

export * from './tone';

// Fundament
export * from './foundation/Screen';
export * from './foundation/AppText';
export * from './foundation/CheckIcon';
export * from './foundation/Icon';
export * from './foundation/Avatar';
export * from './foundation/Brand';
export * from './foundation/KeyboardCollapse';
// Wzorzec ładowania (issue #33, `design/LOADERY.html`): plamka trzymająca miejsce
// po danej, której jeszcze nie ma, i jej najczęstszy kształt - lista wierszy.
// Spinnera na cały ekran nie ma w tej aplikacji nigdzie.
export * from './foundation/Skeleton';
export * from './foundation/SkeletonRows';

// Kontenery i nagłówki
export * from './layout/Card';
export * from './layout/GroupLabel';
export * from './layout/SkeletonScreen';
export * from './layout/AppBar';
export * from './layout/ScreenHeader';
export * from './layout/IdentityStrip';

// Statusy i komunikaty
export * from './status/SyncChip';
export * from './status/StatusChip';
export * from './status/Tag';
export * from './status/CorrectedTag';
export * from './status/Banner';
export * from './status/InlineNote';
export * from './status/FreshnessNote';
export * from './status/PeekBanner';
export * from './status/NoGpsBanner';
export * from './status/Caption';
export * from './status/OutboxGuard';
export * from './status/RefDataStamp';
export * from './status/CrewRow';
export * from './status/StepList';
export * from './status/PillButton';
export * from './status/GhostAction';

// Wprowadzanie danych
export * from './input/AirfieldSuggestions';
export * from './input/CardPicker';
export * from './input/OptionGrid';
export * from './input/OptionInput';
export * from './input/PinDots';
export * from './input/Numpad';
export * from './input/ProfileChip';
export * from './input/Field';
export * from './input/Stepper';
export * from './input/CalendarGrid';
export * from './input/PlaceholderOverlay';
export * from './input/CounterRow';
export * from './input/ReasonField';

// Odczyty z liczników
export * from './readouts/Readout';
export * from './readouts/LevelBar';
export * from './readouts/ScaleBar';
export * from './readouts/GaugeHero';
export * from './readouts/Trail';

// Warstwy nad ekranem
export * from './sheets/Sheet';
export * from './sheets/PinChangeSheet';
export * from './sheets/ReadingSheet';
export * from './sheets/OilSheet';
export * from './sheets/DropSheet';
export * from './sheets/BoardingSheet';
export * from './sheets/JumperDefaultsSheet';
export * from './sheets/ManualEventSheet';
// `ManualEntrySheet` SKASOWANY (przebudowa 15, 2026-08-16) - komponent po usuniętym
// ekranie 08, z krokiem 10 minut i bez wpisu godziny z klawiatury. Czasy wpisu
// ręcznego przechodzą przez arkusze na `TimeStepper`:
export * from './sheets/FlightTimesSheet';
export * from './sheets/FlightDateSheet';
export * from './sheets/ManualDropSheet';
/* `RefuelEntrySheet` SKASOWANY (issue #62, siódma tura): dolewka przestała być pozycją
   listy z własną godziną - jest jedną liczbą w karcie paliwa, a zdarzenie składa się
   przy zapisie. Ostatni i jedyny wołający był w ekranie 15. */
export * from './sheets/CorrectionSheet';
// Tryb edycji sesji (issue #43): odczyty przy przejęciu i zdaniu, skład zrzutu,
// dopisanie brakującego faktu i historia zmian pola.
export * from './sheets/ReadingCorrectionSheet';
export * from './sheets/DropCorrectionSheet';
export * from './sheets/CrewCorrectionSheet';
export * from './sheets/AddEventSheet';
export * from './sheets/CorrectionHistorySheet';
export * from './sheets/AirfieldSheet';
export * from './sheets/TextEntrySheet';
export * from './sheets/LeaveCockpitSheet';
// Rezygnacja z wielokrokowego formularza, który jeszcze nic nie zapisał - JEDEN arkusz
// na obie drogi do lotu (preflight 02 i wpis ręczny 15; dawny `AbandonPreflightSheet`).
export * from './sheets/AbandonDraftSheet';

// Dane i akcje
export * from './data/DayCard';
// `SummaryHero` i `SummaryGrid` USUNIĘTE 2026-08-12 - były komponentami ekranu 03
// (podsumowanie preflightu), a ten zniknął przy skróceniu przejęcia do trzech kroków
// (etap C4: „ROZPOCZNIJ LOT" prowadzi wprost do kokpitu). Rolę siatki klucz/wartość
// pełni dziś `StatGrid`.
export * from './data/SummaryStrip';
export * from './data/ResultBar';
export * from './data/CalcBox';
export * from './data/SessionHero';
export * from './data/CrewCard';
export * from './data/DataTable';
export * from './data/SessionAxis';
export * from './data/HistoryLink';
export * from './data/IconAction';
export * from './data/BalanceCard';
export * from './data/BalanceSummary';
export * from './data/KeyValueRow';
// Ślad lotu: łamana rysowana layoutem, pełna mapa (14), miniatura na szczegółach
// lotu (16) i profil pionowy.
export * from './data/TrackPolyline';
export * from './data/TrackMap';
export * from './data/TrackThumbnail';
export * from './data/VerticalProfile';
export * from './data/StatGrid';
// `Metric` i `MetricGrid` USUNIĘTE 2026-08-12 - komórka i zawijana siatka liczników
// dnia na ziemi ze starego kokpitu. Po przebudowie flow role przejęły `ParamGrid`
// (sztywna siatka przyrządów w locie) i `StatGrid` (bilanse do przepisania).
export * from './data/ParamGrid';
export * from './data/PhaseHero';
export * from './data/CockpitActions';
// `EventLog` (log kokpitu z szyną ikon, chipami i pasami tankowania) USUNIĘTY
// przy issue #44: kokpit i rozliczenie rysują tę samą sesję, więc rysuje ją jeden
// komponent - `SessionAxis` wyżej.
export * from './data/ClaimStrip';
export * from './data/FuelStrip';
export * from './data/ActionGrid';
export * from './data/ActionButton';
export * from './data/DetectToast';

// Ustawienia
export * from './settings/ThemePicker';
export * from './settings/SettingsAction';
