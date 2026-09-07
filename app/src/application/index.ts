/**
 * UZ Aero - barrel warstwy APLIKACJI (przypadki użycia).
 *
 * Wolno importować: `domain/**` i własne porty. NIE wolno: React, React Native, Expo,
 * SQLite, Zustand ani `infrastructure/**` (implementacje wstrzykuje composition root).
 */

export * from './ports';
export * from './eventsRepo';
export * from './commands';
export * from './queries';
export * from './auth/authService';
export * from './sync/syncEngine';
export * from './sync/eventRestore';
export * from './sync/referenceSync';
export * from './sync/traceSync';
export * from './sync/bugReportSync';
export * from './sync/sessionTrackFetch';
export * from './sync/themePrefsSync';
export * from './traceRecorder';
