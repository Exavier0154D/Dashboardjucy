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
  return (
    categoria === 'agua de coco' ||
    categoria === 'lacteos' ||
    (['jugos y zumo', 'limonada'].includes(categoria) &&
      /\bcoco\b/.test(normalizar(producto.variante)))
  );
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
  /** Precio por unidad registrado en la base de datos. */
  costo: number;
  /** Precio original registrado en la base de datos, antes de la conversión. */
  costoPaquete?: number;
  unidadesPaquete?: 1;
  litros: number;
  tecnologia: string;
  estado: EstadoEmpaque;
  productoOrigenId: string | null;
}
