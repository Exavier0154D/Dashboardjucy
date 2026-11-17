export interface MaterialesPresentacion {
  preforma: string;
  tapaMm: number;
  botellaInflada: boolean;
  etiquetaCompartida: string | null;
}

// Especificaciones confirmadas por presentación. No contiene precios ni
// referencias de proveedor que no se hayan facilitado.
const preforma305 = '30,5 g cristal';
const preforma27 = '27 g cristal';
const preforma22 = '22 g cristal';
const preforma465 = '46,5 g cristal';

export const MATERIALES_POR_LITROS: ReadonlyMap<number, MaterialesPresentacion> = new Map<
  number,
  MaterialesPresentacion
>([
  [0.2, { preforma: preforma305, tapaMm: 38, botellaInflada: false, etiquetaCompartida: '200 ml' }],
  [0.22, { preforma: preforma305, tapaMm: 38, botellaInflada: false, etiquetaCompartida: null }],
  [0.2395, { preforma: preforma27, tapaMm: 38, botellaInflada: false, etiquetaCompartida: null }],
  [0.24, { preforma: preforma27, tapaMm: 38, botellaInflada: false, etiquetaCompartida: null }],
  [0.3, { preforma: preforma22, tapaMm: 33, botellaInflada: false, etiquetaCompartida: '300 ml' }],
  [0.32, { preforma: preforma305, tapaMm: 38, botellaInflada: false, etiquetaCompartida: null }],
  [0.35, { preforma: preforma22, tapaMm: 33, botellaInflada: false, etiquetaCompartida: null }],
  [0.355, { preforma: preforma22, tapaMm: 33, botellaInflada: false, etiquetaCompartida: null }],
  [0.36, { preforma: preforma22, tapaMm: 33, botellaInflada: false, etiquetaCompartida: null }],
  [1, { preforma: preforma465, tapaMm: 38, botellaInflada: false, etiquetaCompartida: null }],
  [2, { preforma: preforma465, tapaMm: 38, botellaInflada: false, etiquetaCompartida: null }],
  [5, { preforma: 'No aplica', tapaMm: 46, botellaInflada: true, etiquetaCompartida: null }],
]);
