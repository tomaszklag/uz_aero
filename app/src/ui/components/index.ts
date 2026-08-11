/**
 * UZ Aero — Design System: prymitywy i komponenty wielokrotnego użytku.
 *
 * Zasada: ekran nie definiuje własnych „kart", „chipów" ani „przycisków" — jeśli
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

// Kontenery i nagłówki
export * from './layout/Card';
export * from './layout/AppBar';
export * from './layout/ScreenHeader';
export * from './layout/IdentityStrip';

// Statusy i komunikaty
export * from './status/SyncChip';
export * from './status/SyncStatusBox';
export * from './status/QueueBox';
export * from './status/ExportedBox';
export * from './status/StatusChip';
export * from './status/Tag';
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
export * from './input/CounterRow';

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
export * from './sheets/DropSheet';
export * from './sheets/BoardingSheet';
export * from './sheets/ManualEventSheet';
export * from './sheets/ManualEntrySheet';
export * from './sheets/CorrectionSheet';
export * from './sheets/AirfieldSheet';
export * from './sheets/TextEntrySheet';
export * from './sheets/LeaveCockpitSheet';

// Dane i akcje
export * from './data/DayCard';
export * from './data/SummaryHero';
export * from './data/SummaryGrid';
export * from './data/SummaryStrip';
export * from './data/ResultBar';
export * from './data/CalcBox';
export * from './data/SessionHero';
export * from './data/CrewCard';
export * from './data/DataTable';
export * from './data/KeyValueRow';
// Ślad lotu (14): łamana rysowana layoutem, mapa z kafelków i profil pionowy.
export * from './data/TrackPolyline';
export * from './data/TrackMap';
export * from './data/VerticalProfile';
export * from './data/StatGrid';
export * from './data/Metric';
export * from './data/ParamGrid';
export * from './data/PhaseHero';
export * from './data/CockpitActions';
export * from './data/EventLog';
export * from './data/ClaimStrip';
export * from './data/FuelStrip';
export * from './data/ActionGrid';
export * from './data/ActionButton';
export * from './data/DetectToast';

// Ustawienia
export * from './settings/ThemePicker';
export * from './settings/SettingsAction';
