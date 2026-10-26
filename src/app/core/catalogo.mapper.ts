import {
  CATEGORIAS_PRODUCTO, CategoriaCatalogo, EstadoFormulacion, Ingrediente,
  ItemPresentacion, MateriaPrima, Presentacion, Producto, TecnologiaProducto
} from '../models/producto.model';
import { Empaque, EstadoEmpaque, TipoEmpaque } from '../models/empaque.model';

type Numero = number | string;
export interface MateriaPrimaDb {
  id: Numero; nombre: string; unidad: string; costo_kg: Numero;
  costo_base_historico: Numero | null; activo: boolean;
}
export interface ProductoDb {
  id: string; nombre: string; categoria: string; marca: string; variante: string;
  fecha_revision: string | null; activo: boolean; producto_origen_id: string | null;
}
export interface PresentacionDb {
  id: Numero; producto_id: string; clave_sku: string; litros: Numero;
  codigo_barras: string | null; tecnologia: string; nombre_sku: string;
  linea_producto: string | null; activo: boolean; estado_formulacion: string;
  presentacion_origen_id: Numero | null; factor_escala: Numero | null;
}
export interface FormulaDb {
  presentacion_id: Numero; materia_prima_id: Numero; porcentaje: Numero;
}
export interface ItemDb {
  presentacion_id: Numero; materia_prima_id: Numero; kg: Numero; litros: Numero;
  costo_original: Numero | null;
}
export interface EmpaqueDb {
  id: Numero; presentacion_id: Numero; tipo: string; costo: Numero;
  estado: string; producto_origen_id: string | null;
}
export interface TablasCatalogo {
  materiasPrimas: MateriaPrimaDb[]; productos: ProductoDb[];
  presentaciones: PresentacionDb[]; formulas: FormulaDb[];
  items: ItemDb[]; empaques: EmpaqueDb[];
}
export interface Catalogo {
  materiasPrimas: MateriaPrima[]; productos: Producto[]; empaques: Empaque[];
}

function numero(valor: Numero, campo: string): number {
  if (valor === null || valor === undefined || String(valor).trim() === '') {
    throw new Error(`Falta el valor numérico de ${campo}.`);
  }
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido en ${campo}.`);
  return n;
}
function id(valor: Numero): number {
  const n = numero(valor, 'ID');
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('ID inválido en el catálogo.');
  return n;
}
function unico<T extends string>(valor: string, opciones: readonly T[], campo: string): T {
  if (!opciones.includes(valor as T)) throw new Error(`${campo} no reconocido: ${valor}.`);
  return valor as T;
}
function agrupar<T>(filas: T[], clave: (fila: T) => number): Map<number, T[]> {
  const grupos = new Map<number, T[]>();
  for (const fila of filas) {
    const k = clave(fila);
    grupos.set(k, [...(grupos.get(k) ?? []), fila]);
  }
  return grupos;
}

/** Construye todo el catálogo antes de publicar sus señales. No usa datos locales de respaldo. */
export function mapearCatalogo(tablas: TablasCatalogo): Catalogo {
  const materiasPrimas: MateriaPrima[] = tablas.materiasPrimas.map(m => ({
    id: id(m.id), nombre: m.nombre, unidad: m.unidad,
    costoKg: numero(m.costo_kg, 'costo/kg'), activo: m.activo,
    costoBaseHistorico: m.costo_base_historico === null ? null : numero(m.costo_base_historico, 'costo base')
  }));
  const mpPorId = new Map(materiasPrimas.map(m => [m.id, m]));
  const productosPorId = new Map(tablas.productos.map(p => [p.id, p]));
  const presentacionesPorId = new Map(tablas.presentaciones.map(p => [id(p.id), p]));
  if (mpPorId.size !== materiasPrimas.length || productosPorId.size !== tablas.productos.length ||
      presentacionesPorId.size !== tablas.presentaciones.length) throw new Error('IDs duplicados en el catálogo.');
  const formulas = agrupar(tablas.formulas, f => id(f.presentacion_id));
  const items = agrupar(tablas.items, i => id(i.presentacion_id));
  for (const fila of [...tablas.formulas, ...tablas.items]) {
    if (!presentacionesPorId.has(id(fila.presentacion_id)) || !mpPorId.has(id(fila.materia_prima_id))) {
      throw new Error('Una fórmula o cantidad tiene referencias que no existen.');
    }
  }
  const presentaciones: Presentacion[] = tablas.presentaciones.map(p => {
    const presentacionId = id(p.id);
    if (!productosPorId.has(p.producto_id)) throw new Error('Un SKU apunta a un producto inexistente.');
    const ingredientes: Ingrediente[] = (formulas.get(presentacionId) ?? []).map(f => {
      const m = mpPorId.get(id(f.materia_prima_id))!;
      const porcentaje = numero(f.porcentaje, 'porcentaje');
      if (porcentaje > 100) throw new Error('El porcentaje debe estar entre 0 y 100.');
      return { materiaPrimaId: m.id, nombre: m.nombre, unidad: m.unidad, porcentaje };
    });
    const cantidades: ItemPresentacion[] = (items.get(presentacionId) ?? []).map(i => {
      const m = mpPorId.get(id(i.materia_prima_id))!;
      const kg = numero(i.kg, 'kg');
      return { materiaPrimaId: m.id, ingrediente: m.nombre, kg,
        litros: numero(i.litros, 'litros del ingrediente'), costo: kg * m.costoKg,
        costoOriginal: i.costo_original === null ? null : numero(i.costo_original, 'costo original') };
    });
    const idsFormula = new Set(ingredientes.map(i => i.materiaPrimaId));
    const idsItems = new Set(cantidades.map(i => i.materiaPrimaId));
    if (idsFormula.size !== ingredientes.length || idsItems.size !== cantidades.length ||
        idsFormula.size !== idsItems.size || [...idsItems].some(k => !idsFormula.has(k))) {
      throw new Error(`Los ingredientes y las cantidades no coinciden en ${p.nombre_sku}.`);
    }
    const litros = numero(p.litros, 'presentación en litros');
    if (litros === 0) throw new Error('El tamaño de la presentación debe ser mayor que cero.');
    const estado = unico<EstadoFormulacion>(p.estado_formulacion,
      ['copiada', 'escalada', 'por_completar'], 'Estado de formulación');
    if (estado !== 'por_completar' && cantidades.length === 0) throw new Error(`Faltan cantidades en ${p.nombre_sku}.`);
    return {
      id: presentacionId, productoId: p.producto_id, claveSku: p.clave_sku, litros,
      codigoBarras: p.codigo_barras, tecnologia: unico<TecnologiaProducto>(p.tecnologia, ['HPP', 'HTST', 'UHT'], 'Tecnología'),
      nombreSku: p.nombre_sku, lineaProducto: p.linea_producto, activo: p.activo,
      estadoFormulacion: estado,
      presentacionOrigenId: p.presentacion_origen_id === null ? null : id(p.presentacion_origen_id),
      factorEscala: p.factor_escala === null ? null : numero(p.factor_escala, 'factor de escala'),
      ingredientes, items: cantidades,
      totalKg: cantidades.reduce((a, i) => a + i.kg, 0),
      totalLitros: cantidades.reduce((a, i) => a + i.litros, 0),
      totalCosto: cantidades.length ? cantidades.reduce((a, i) => a + i.costo, 0) : null
    };
  });
  const productos: Producto[] = tablas.productos.filter(p => p.activo).map(p => {
    const skus = presentaciones.filter(s => s.productoId === p.id && s.activo)
      .sort((a, b) => a.litros - b.litros || a.tecnologia.localeCompare(b.tecnologia) || a.id - b.id);
    return { id: p.id, nombre: p.nombre,
      categoria: unico<CategoriaCatalogo>(p.categoria, CATEGORIAS_PRODUCTO, 'Categoría'),
      marca: p.marca, variante: p.variante, fechaRevision: p.fecha_revision ?? '',
      activo: p.activo, productoOrigenId: p.producto_origen_id,
      ingredientes: skus[0]?.ingredientes ?? [], presentaciones: skus };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const skusVisibles = new Map(productos.flatMap(p => p.presentaciones).map(p => [p.id, p]));
  const empaques: Empaque[] = [];
  for (const e of tablas.empaques) {
    const presentacionId = id(e.presentacion_id);
    if (!presentacionesPorId.has(presentacionId)) throw new Error('Un empaque apunta a un SKU inexistente.');
    const sku = skusVisibles.get(presentacionId);
    if (!sku) continue;
    empaques.push({ id: id(e.id), presentacionId, productoId: sku.productoId,
      tipo: unico<TipoEmpaque>(e.tipo, ['Botella', 'Tap', 'Etiqueta'], 'Tipo de empaque'),
      costo: numero(e.costo, 'costo de empaque'), unidad: 'Unidad', litros: sku.litros,
      tecnologia: sku.tecnologia, estado: unico<EstadoEmpaque>(e.estado,
        ['referencia_producto', 'sin_dato', 'confirmado'], 'Estado de empaque'),
      productoOrigenId: e.producto_origen_id });
  }
  return { materiasPrimas: materiasPrimas.filter(m => m.activo), productos, empaques };
}
