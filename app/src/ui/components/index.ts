/**
 * UZ Aero — Design System: prymitywy i komponenty wielokrotnego użytku.
 *
 * Zasada: ekran nie definiuje własnych „kart", „chipów" ani „przycisków" — jeśli
 * czegoś brakuje, dokładamy to TUTAJ i używamy wszędzie. Dzięki temu zmiana wzorca
 * (np. powiększenie celów dotykowych po audycie) przechodzi przez całą aplikację.
 */

export * from './tone';

// Fundament
export * from './Screen';
export * from './AppText';
export * from './CheckIcon';
export * from './Icon';
export * from './Avatar';
export * from './Brand';

// Kontenery i nagłówki
export * from './Card';
export * from './AppBar';
export * from './ScreenHeader';
export * from './IdentityStrip';

// Statusy i komunikaty
export * from './SyncChip';
export * from './SyncStatusBox';
export * from './QueueBox';
export * from './StatusChip';
export * from './Tag';
export * from './Banner';
export * from './InlineNote';
export * from './FreshnessNote';
export * from './PeekBanner';
export * from './Caption';
export * from './CrewRow';
export * from './StepList';
export * from './PillButton';
export * from './GhostAction';

// Wprowadzanie danych
export * from './CardPicker';
export * from './OptionGrid';
export * from './OptionInput';
export * from './PinDots';
export * from './Numpad';
export * from './ProfileChip';
export * from './Field';
export * from './Stepper';
export * from './CounterRow';

// Odczyty z liczników
export * from './Readout';
export * from './LevelBar';
export * from './ScaleBar';
export * from './GaugeHero';
export * from './Trail';

// Warstwy nad ekranem
export * from './Sheet';
export * from './ReadingSheet';
export * from './DropSheet';
export * from './ManualEventSheet';
export * from './CorrectionSheet';

// Dane i akcje
export * from './DayCard';
export * from './SummaryHero';
export * from './SummaryGrid';
export * from './SummaryStrip';
export * from './ResultBar';
export * from './CalcBox';
export * from './DutyHero';
export * from './CrewCard';
export * from './DataTable';
export * from './StatGrid';
export * from './Metric';
export * from './ParamGrid';
export * from './PhaseHero';
export * from './CockpitActions';
export * from './EventLog';
export * from './DutyStrip';
export * from './ActionGrid';
export * from './ActionButton';
export * from './DetectToast';

// Ustawienia
export * from './ThemePicker';
