/**
 * UZ Aero — konfiguracja Jest dla testów WARSTWY DANYCH (Faza 1).
 *
 * Świadomy wybór: testy rdzenia (czyste projekcje + `InMemoryAdapter` + repo + store)
 * są RN-free — nie importują react-native, expo-* ani `expo-sqlite`. Dlatego zamiast
 * ciężkiego łańcucha `jest-expo` używamy izolowanego `babel-jest` (Babel strippuje typy,
 * kompiluje ESM→CJS pod bieżący Node). Type-checkingiem zajmuje się osobno `tsc --noEmit`
 * (skrypt `typecheck`) — czysty rozdział: babel = wykonanie testów, tsc = poprawność typów.
 *
 * `configFile:false` + `babelrc:false` izolują transform od builda aplikacji (Metro nadal
 * używa `babel-preset-expo`) — ta konfiguracja nie dotyka runtime RN.
 *
 * Testy komponentów RN (jeśli powstaną) można dołożyć osobnym projektem z presetem jest-expo.
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        configFile: false,
        babelrc: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
  clearMocks: true,
};
