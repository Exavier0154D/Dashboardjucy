export type TipoEmpaque = 'Botella' | 'Tap' | 'Etiqueta';
export type EstadoEmpaque = 'referencia_producto' | 'sin_dato' | 'confirmado';

export interface Empaque {
  id: number;
  presentacionId: number;
  productoId: string;
  tipo: TipoEmpaque;
  unidad: string;
  costo: number;
  litros: number;
  tecnologia: string;
  estado: EstadoEmpaque;
  productoOrigenId: string | null;
}
