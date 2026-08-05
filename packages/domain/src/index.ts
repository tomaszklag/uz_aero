/**
 * UZ Aero — barrel warstwy DOMENY (czysty TypeScript).
 *
 * Reguła twarda: w `src/domain/**` NIE MA importów Reacta, React Native, Expo, SQLite
 * ani Zustanda. Domena to typy zdarzeń, reguły i projekcje — musi dać się uruchomić
 * w gołym Node (i dlatego testuje się ją bez natywnej bazy).
 * Egzekucja: `src/__tests__/architecture.test.ts` + reguła ESLint opisana
 * w `docs/architektura-kodu.md`.
 */

export * from './time';
export * from './events';
export * from './flags';
export * from './reference';
export * from './projections';
export * from './rules';
export * from './detection/thresholds';
export * from './detection/geo';
export * from './detection/fix';
export * from './detection/regression';
export * from './detection/history';
export * from './detection/trends';
export * from './detection/motion';
export * from './detection/onset';
export * from './detection/imu';
export * from './detection/flightDetector';
export * from './detection/flightPhase';
export * from './track/point';
export * from './track/quality';
export * from './track/simplify';
export * from './track/flightTrack';
export * from './track/profile';
export * from './track/sample';
export * from './track/mercator';
export * from './airfields';
export * from './airfieldSearch';
export * from './magneticDeclination';
export * from './track/airfieldsInView';
export * from './consumption/interval';
export * from './consumption/timeInPhase';
export * from './consumption/matrix';
export * from './consumption/nnls';
export * from './consumption/fit';
export * from './consumption/policy';
export * from './consumption/intervals';
export * from './consumption/model';
export * from './consumption/mhModel';
export * from './consumption/summary';
export * from './consumption/norm';
export * from './consumption/phaseTimeline';
