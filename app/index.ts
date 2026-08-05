import { registerRootComponent } from 'expo';

// Rejestracja taska lokalizacji MUSI nastąpić przy KAŻDYM załadowaniu bundle'a —
// także w starcie headless po śmierci procesu, gdy `App` nigdy się nie montuje
// (usługa GPS w tle przeżywa proces; patrz `backgroundLocationTask.ts`).
import './src/infrastructure/gps/backgroundLocationTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
