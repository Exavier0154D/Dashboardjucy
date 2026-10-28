export const TIPOS_EMPAQUE_BASE = ['Botella', 'Tap', 'Etiqueta'] as const;
export const TIPOS_EMPAQUE = [...TIPOS_EMPAQUE_BASE, 'Cartón'] as const;
export type TipoEmpaque = (typeof TIPOS_EMPAQUE)[number];

export function requiereCarton(producto: { categoria: string; variante: string }): boolean {
  const normalizar = (valor: string) =>
    valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  const categoria = normalizar(producto.categoria);
  return categoria === 'agua de coco' || categoria === 'lacteos';
}

export function tiposEmpaqueRequeridos(producto: {
  categoria: string;
  variante: string;
}): readonly TipoEmpaque[] {
  return requiereCarton(producto) ? TIPOS_EMPAQUE : TIPOS_EMPAQUE_BASE;
}
export type EstadoEmpaque = 'referencia_producto' | 'sin_dato' | 'confirmado';

export interface Empaque {
  id: number;
  presentacionId: number;
  productoId: string;
  tipo: TipoEmpaque;
  unidad: string;
  /** Costo por unidad del SKU, con el precio del cartón dividido por sus unidades. */
  costo: number;
  /** Precio original registrado en la base de datos, antes de la conversión. */
  costoPaquete?: number;
  unidadesPaquete?: 1 | 6 | 12;
  litros: number;
  tecnologia: string;
  estado: EstadoEmpaque;
  productoOrigenId: string | null;
}
