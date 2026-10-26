import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners
} from '@angular/core';

import { provideRouter } from '@angular/router';
import {
  provideClientHydration,
  withEventReplay
} from '@angular/platform-browser';

import {
  provideCharts,
  withDefaultRegisterables
} from 'ng2-charts';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    provideRouter(routes),

    provideClientHydration(
      withEventReplay()
    ),

    provideCharts(
      withDefaultRegisterables()
    )
  ]
};
