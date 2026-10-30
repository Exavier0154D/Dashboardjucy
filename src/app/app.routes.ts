import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'materia-prima',
    pathMatch: 'full',
  },

  {
    path: 'materia-prima',
    loadComponent: () => import('./pages/materia-prima/materia-prima').then((m) => m.MateriaPrima),
  },

  {
    path: 'insumos',
    data: { vista: 'materias' },
    loadComponent: () => import('./pages/materia-prima/materia-prima').then((m) => m.MateriaPrima),
  },

  {
    path: 'estandar',
    loadComponent: () => import('./pages/estandar/estandar').then((m) => m.Estandar),
  },

  // NUEVA RUTA: EMPAQUES
  {
    path: 'empaques',
    loadComponent: () => import('./pages/empaques/empaques').then((m) => m.Empaques),
  },

  {
    path: 'administracion',
    loadComponent: () =>
      import('./pages/administracion/administracion').then((m) => m.Administracion),
  },

  {
    path: '**',
    redirectTo: 'materia-prima',
  },
];
