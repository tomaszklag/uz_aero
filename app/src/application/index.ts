/**
 * UZ Aero — barrel warstwy APLIKACJI (przypadki użycia).
 *
 * Wolno importować: `domain/**` i własne porty. NIE wolno: React, React Native, Expo,
 * SQLite, Zustand ani `infrastructure/**` (implementacje wstrzykuje composition root).
 */

export * from './ports';
export * from './eventsRepo';
export * from './commands';
export * from './queries';
