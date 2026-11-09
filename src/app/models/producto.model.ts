export const CATEGORIAS_PRODUCTO = [
  'Agua de Coco', 'Bebida', 'Jugos y Zumo', 'Lacteos',
  'Limonada', 'Naranja', 'Nectar', 'P. Temporales y Salsa'
] as const;

export type CategoriaCatalogo = typeof CATEGORIAS_PRODUCTO[number];
export type TecnologiaProducto = 'HPP' | 'HTST' | 'UHT';
export type EstadoFormulacion = 'copiada' | 'escalada' | 'por_completar';


export type CategoriaAnterior =
  | 'Jugo' | 'Néctar' | 'Limonada' | 'Funcional' | 'Café y lácteos'
  | 'Proteína' | 'Tradicional' | 'Agua de coco' | 'Salsas y untables';

export interface Ingrediente {
  materiaPrimaId: number;
  nombre: string;
  unidad: string;

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

  gastosIndirectosDeFabricacion?: number | null;
  gastos_indirectos_de_fabricacion?: number | null;
  ingredientes: Ingrediente[];
  items: ItemPresentacion[];
  totalKg: number;
  totalLitros: number;
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
