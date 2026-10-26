export const CATEGORIAS_PRODUCTO = [
  'Agua de Coco', 'Bebida', 'Jugos y Zumo', 'Lacteos',
  'Limonada', 'Naranja', 'Nectar', 'P. Temporales y Salsa'
] as const;

export type CategoriaCatalogo = typeof CATEGORIAS_PRODUCTO[number];
export type TecnologiaProducto = 'HPP' | 'HTST' | 'UHT';
export type EstadoFormulacion = 'copiada' | 'escalada' | 'por_completar';

// Alias temporal para componentes que todavía importan el tipo anterior.
export type CategoriaAnterior =
  | 'Jugo' | 'Néctar' | 'Limonada' | 'Funcional' | 'Café y lácteos'
  | 'Proteína' | 'Tradicional' | 'Agua de coco' | 'Salsas y untables';

export interface Ingrediente {
  materiaPrimaId: number;
  nombre: string;
  unidad: string;
  /** Porcentaje en escala 0–100. */
  porcentaje: number;
}

export interface ItemPresentacion {
  materiaPrimaId: number;
  ingrediente: string;
  kg: number;
  litros: number;
  /** Costo vigente: kg × costo/kg de materia prima. */
  costo: number;
  costoOriginal: number | null;
}

export interface Presentacion {
  id: number;
  productoId: string;
  claveSku: string;
  litros: number;
  codigoBarras: string | null;
  tecnologia: TecnologiaProducto;
  nombreSku: string;
  lineaProducto: string | null;
  activo: boolean;
  estadoFormulacion: EstadoFormulacion;
  presentacionOrigenId: number | null;
  factorEscala: number | null;
  /** Gastos indirectos de fabricación asignados por SKU / presentación. */
  gastosIndirectosDeFabricacion?: number | null;
  gastos_indirectos_de_fabricacion?: number | null;
  ingredientes: Ingrediente[];
  items: ItemPresentacion[];
  totalKg: number;
  totalLitros: number;
  /** Solo materia prima. NULL cuando no existe fórmula/cantidad. */
  totalCosto: number | null;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: CategoriaCatalogo;
  marca: string;
  variante: string;
  activo: boolean;
  fechaRevision: string;
  productoOrigenId: string | null;
  /** Compatibilidad: fórmula del SKU seleccionado o del primero al cargar. */
  ingredientes: Ingrediente[];
  presentaciones: Presentacion[];
}

export type ProductoCatalogo = Producto;
export type PresentacionCatalogo = Presentacion;

export interface MateriaPrima {
  id: number;
  nombre: string;
  unidad: string;
  costoKg: number;
  costoBaseHistorico: number | null;
  activo: boolean;
}
