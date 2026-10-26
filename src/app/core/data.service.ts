import { Injectable, inject, signal } from '@angular/core';
import { MateriaPrima, Presentacion, Producto } from '../models/producto.model';
import { Empaque } from '../models/empaque.model';
import { SupabaseService } from './supabase.service';
import { SelectionService } from './selection.service';
import {
  EmpaqueDb,
  FormulaDb,
  ItemDb,
  MateriaPrimaDb,
  PresentacionDb,
  ProductoDb,
  mapearCatalogo,
} from './catalogo.mapper';

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly db = inject(SupabaseService).client;
  private readonly selection = inject(SelectionService);
  readonly materiasPrimas = signal<MateriaPrima[]>([]);
  readonly productos = signal<Producto[]>([]);
  readonly empaques = signal<Empaque[]>([]);
  readonly cargando = signal(false);
  readonly cargado = signal(false);
  readonly error = signal<string | null>(null);
  private pendiente: Promise<boolean> | null = null;

  constructor() {
    void this.cargarDatos();
  }

  /** Devuelve false y publica error() si falla. Conserva los últimos datos válidos. */
  cargarDatos(): Promise<boolean> {
    if (!this.pendiente) {
      this.pendiente = this.cargar().finally(() => {
        this.pendiente = null;
      });
    }
    return this.pendiente;
  }

  actualizarAhora(): Promise<boolean> {
    return this.cargarDatos();
  }

  empaquesDePresentacion(presentacionId: number): Empaque[] {
    return this.empaques().filter((e) => e.presentacionId === presentacionId);
  }

  costoEmpaquePresentacion(presentacionId: number): number {
    return this.empaquesDePresentacion(presentacionId)
      .filter((e) => e.tipo !== 'Cartón')
      .reduce((total, e) => total + e.costo, 0);
  }

  costoCartonPresentacion(presentacionId: number): number {
    return this.empaquesDePresentacion(presentacionId)
      .filter((e) => e.tipo === 'Cartón')
      .reduce((total, e) => total + e.costo, 0);
  }

  costoPreliminar(presentacion: Presentacion): number | null {
    return presentacion.totalCosto === null
      ? null
      : presentacion.totalCosto +
          this.costoEmpaquePresentacion(presentacion.id) +
          this.costoCartonPresentacion(presentacion.id);
  }

  private async cargar(): Promise<boolean> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const [materiasPrimas, productos, presentaciones, formulas, items, empaques] =
        await Promise.all([
          this.leer<MateriaPrimaDb>(
            'materia_prima',
            'id,nombre,unidad,costo_kg,costo_base_historico,activo',
            ['id'],
          ),
          this.leer<ProductoDb>(
            'producto',
            'id,nombre,categoria,marca,variante,fecha_revision,activo,producto_origen_id',
            ['id'],
          ),
          this.leer<PresentacionDb>(
            'presentacion',
            'id,producto_id,clave_sku,litros,codigo_barras,tecnologia,nombre_sku,linea_producto,activo,estado_formulacion,presentacion_origen_id,factor_escala',
            ['id'],
          ),
          this.leer<FormulaDb>(
            'formula_ingrediente',
            'presentacion_id,materia_prima_id,porcentaje',
            ['presentacion_id', 'materia_prima_id'],
          ),
          this.leer<ItemDb>(
            'presentacion_item',
            'presentacion_id,materia_prima_id,kg,litros,costo_original',
            ['presentacion_id', 'materia_prima_id'],
          ),
          this.leer<EmpaqueDb>(
            'empaque',
            'id,presentacion_id,tipo,costo,estado,producto_origen_id',
            ['id'],
          ),
        ]);
      const catalogo = mapearCatalogo({
        materiasPrimas,
        productos,
        presentaciones,
        formulas,
        items,
        empaques,
      });
      const productoId = this.selection.productoSeleccionado()?.id;
      const skuId = this.selection.presentacionSeleccionada()?.id;
      // No se publica una mezcla parcial de tablas si falla una consulta o validación.
      this.materiasPrimas.set(catalogo.materiasPrimas);
      this.productos.set(catalogo.productos);
      this.empaques.set(catalogo.empaques);
      if (productoId) {
        const producto = catalogo.productos.find((p) => p.id === productoId);
        if (producto)
          this.selection.seleccionarProducto(
            producto,
            producto.presentaciones.find((p) => p.id === skuId),
          );
        else this.selection.limpiarSeleccion();
      }
      this.cargado.set(true);
      return true;
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo cargar el catálogo de Supabase.');
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  private async leer<T>(tabla: string, columnas: string, orden: string[]): Promise<T[]> {
    const filas: T[] = [];
    let inicio = 0;
    while (true) {
      let consulta = this.db.from(tabla).select(columnas, { count: 'exact' });
      for (const columna of orden) consulta = consulta.order(columna, { ascending: true });
      const { data, error, count } = await consulta.range(inicio, inicio + 499);
      if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`);
      if (count === null || data === null) throw new Error(`Respuesta incompleta de ${tabla}.`);
      const lote = data as unknown as T[];
      filas.push(...lote);
      inicio += lote.length;
      if (inicio >= count) return filas;
      if (!lote.length)
        throw new Error(`La lectura de ${tabla} se interrumpió antes de completarse.`);
    }
  }
}
