import { inject, Provider } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { MAT_AUTOCOMPLETE_SCROLL_STRATEGY } from '@angular/material/autocomplete';
import { MAT_SELECT_SCROLL_STRATEGY } from '@angular/material/select';

function cerrarAlDesplazar() {
  const overlay = inject(Overlay);
  // El scroll de una lista de opciones no se propaga al contenedor principal.
  // Si se desplaza ese contenedor o el documento, cerrar el panel evita que
  // permanezca flotando cuando su campo sale de la pantalla.
  return () => overlay.scrollStrategies.close();
}

export const DESPLEGABLES_SCROLL_PROVIDERS: Provider[] = [
  { provide: MAT_AUTOCOMPLETE_SCROLL_STRATEGY, useFactory: cerrarAlDesplazar },
  { provide: MAT_SELECT_SCROLL_STRATEGY, useFactory: cerrarAlDesplazar },
];
