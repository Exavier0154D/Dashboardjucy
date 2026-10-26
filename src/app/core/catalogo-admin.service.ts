import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface MateriaDB {
  id: number; nombre: string; unidad: string; costo_kg: number;
  costo_base_historico: number | null; activo: boolean;
}
export interface ProductoDB {
  id: string; nombre: string; categoria: string; marca: string; variante: string;
  fecha_revision: string | null; activo: boolean; producto_origen_id: string | null;
}
export interface PresentacionDB {
  id: number; producto_id: string; clave_sku: string; litros: number;
  codigo_barras: string | null; tecnologia: string; nombre_sku: string;
  linea_producto: string | null; activo: boolean;
  estado_formulacion: 'copiada' | 'escalada' | 'por_completar';
  presentacion_origen_id: number | null; factor_escala: number | null;
}
export interface FormulaDB { presentacion_id: number; materia_prima_id: number; porcentaje: number; }
export interface ItemDB {
  presentacion_id: number; materia_prima_id: number; kg: number; litros: number;
  costo_original: number | null;
}
export interface EmpaqueDB {
  id: number; presentacion_id: number; tipo: 'Botella' | 'Tap' | 'Etiqueta';
  costo: number; estado: 'referencia_producto' | 'sin_dato' | 'confirmado';
  producto_origen_id: string | null;
}
export interface HistorialDB {
  id: number; tabla: string; registro_id: string | null;
  accion: 'INSERT' | 'UPDATE' | 'DELETE';
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null; usuario: string | null; fecha: string;
}
export interface FilaFormula {
  materia_prima_id: number; porcentaje: number; kg: number; litros: number;
  costo_original: number | null;
}
export interface CatalogoAdmin {
  materias: MateriaDB[]; productos: ProductoDB[]; presentaciones: PresentacionDB[];
  formulas: FormulaDB[]; items: ItemDB[]; empaques: EmpaqueDB[];
}
export interface SkuForm {
  id: number | null; producto_id: string; clave_sku: string; litros: number;
  codigo_barras: string | null; tecnologia: string; nombre_sku: string;
  linea_producto: string | null; activo: boolean;
  estado_formulacion: PresentacionDB['estado_formulacion'];
}

export function validarFilas(filas: FilaFormula[]): void {
  const ids = new Set<number>();
  for (const f of filas) {
    if (!Number.isSafeInteger(f.materia_prima_id) || f.materia_prima_id <= 0 || ids.has(f.materia_prima_id)) {
      throw new Error('Selecciona materias primas válidas y sin repetir.');
    }
    ids.add(f.materia_prima_id);
    if (![f.porcentaje, f.kg, f.litros].every(n => Number.isFinite(n) && n >= 0) || f.porcentaje > 100 ||
      (f.costo_original !== null && (!Number.isFinite(f.costo_original) || f.costo_original < 0))) {
      throw new Error('Revisa los porcentajes y cantidades: deben ser números válidos, sin negativos.');
    }
  }
}

/** La comparación incluye fórmula y cantidades, para detectar ediciones concurrentes. */
export function versionSku(p: PresentacionDB, formulas: FormulaDB[], items: ItemDB[]) {
  return {
    presentacion: p,
    formula: formulas.filter(f => f.presentacion_id === p.id).sort((a, b) => a.materia_prima_id - b.materia_prima_id),
    items: items.filter(i => i.presentacion_id === p.id).sort((a, b) => a.materia_prima_id - b.materia_prima_id)
  };
}

@Injectable({ providedIn: 'root' })
export class CatalogoAdminService {
  private readonly db = inject(SupabaseService).client;

  async leer<T>(tabla: string, orden = ['id'], limite = Infinity, filtro?: { columna: string; valor: string }): Promise<T[]> {
    const filas: T[] = [];
    while (filas.length < limite) {
      let q = this.db.from(tabla).select('*', { count: 'exact' });
      for (const columna of orden) q = q.order(columna, { ascending: true });
      if (filtro) q = q.eq(filtro.columna, filtro.valor);
      const { data, error, count } = await q.range(filas.length, Math.min(filas.length + 499, limite - 1));
      if (error) throw error;
      if (data === null || count === null) throw new Error(`Respuesta incompleta al leer ${tabla}.`);
      if (!data.length && filas.length < Math.min(count, limite)) throw new Error(`Lectura interrumpida de ${tabla}.`);
      filas.push(...data as unknown as T[]);
      if (filas.length >= count) break;
    }
    return filas;
  }

  async cargarCatalogo(): Promise<CatalogoAdmin> {
    const [materias, productos, presentaciones, formulas, items, empaques] = await Promise.all([
      this.leer<MateriaDB>('materia_prima'), this.leer<ProductoDB>('producto'),
      this.leer<PresentacionDB>('presentacion'),
      this.leer<FormulaDB>('formula_ingrediente', ['presentacion_id', 'materia_prima_id']),
      this.leer<ItemDB>('presentacion_item', ['presentacion_id', 'materia_prima_id']),
      this.leer<EmpaqueDB>('empaque')
    ]);
    return { materias, productos, presentaciones, formulas, items, empaques };
  }

  async sesionEditor(): Promise<{ email: string | null; editor: boolean }> {
    const { data, error } = await this.db.auth.getUser();
    if (!data.user) {
      if (error && error.name !== 'AuthSessionMissingError') throw error;
      return { email: null, editor: false };
    }
    if (error) throw error;
    const permiso = await this.db.rpc('catalogo_es_editor');
    if (permiso.error) throw permiso.error;
    return { email: data.user.email ?? data.user.id, editor: permiso.data === true };
  }
  async iniciarSesion(email: string, password: string): Promise<void> {
    const { error } = await this.db.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }
  async cerrarSesion(): Promise<void> {
    const { error } = await this.db.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }
  escucharSesion(fn: () => void) {
    return this.db.auth.onAuthStateChange(() => { queueMicrotask(fn); }).data.subscription;
  }
  private async exigirEditor(): Promise<void> {
    if (!(await this.sesionEditor()).editor) throw new Error('Inicia sesión con una cuenta autorizada para editar.');
  }

  async guardarMateria(id: number | null, datos: Pick<MateriaDB, 'nombre' | 'unidad' | 'costo_kg' | 'activo'>): Promise<void> {
    await this.exigirEditor();
    const q = this.db.from('materia_prima');
    const result = id === null ? await q.insert(datos).select('id').single() :
      await q.update(datos).eq('id', id).select('id').single();
    if (result.error) throw result.error;
    if (!result.data) throw new Error('No se guardó la materia prima. Revisa tus permisos y recarga.');
  }
  async guardarProducto(id: string | null, datos: Pick<ProductoDB, 'nombre' | 'categoria' | 'marca' | 'variante' | 'fecha_revision' | 'activo'>): Promise<void> {
    await this.exigirEditor();
    const q = this.db.from('producto');
    const result = id === null ? await q.insert({ id: `producto-${crypto.randomUUID()}`, ...datos }).select('id').single() :
      await q.update(datos).eq('id', id).select('id').single();
    if (result.error) throw result.error;
    if (!result.data) throw new Error('No se guardó el producto. Revisa tus permisos y recarga.');
  }
  async guardarEmpaque(id: number | null, datos: Pick<EmpaqueDB, 'presentacion_id' | 'tipo' | 'costo' | 'estado'>): Promise<void> {
    await this.exigirEditor();
    const q = this.db.from('empaque');
    const result = id === null ? await q.insert(datos).select('id').single() :
      await q.update(datos).eq('id', id).select('id').single();
    if (result.error) throw result.error;
    if (!result.data) throw new Error('No se guardó el empaque. Revisa tus permisos y recarga.');
  }
  async guardarSku(sku: SkuForm, filas: FilaFormula[], antes: ReturnType<typeof versionSku> | null): Promise<void> {
    validarFilas(filas);
    await this.exigirEditor();
    const { data, error } = await this.db.rpc('catalogo_guardar_sku', { p_sku: sku, p_filas: filas, p_antes: antes });
    if (error) throw error;
    if (!data) throw new Error('No se guardó el SKU. Revisa tus permisos.');
  }
  async listarHistorial(tabla: string | null): Promise<HistorialDB[]> {
    // Se muestran los 200 cambios más recientes, con desempate estable y paginación.
    const filas: HistorialDB[] = [];
    while (filas.length < 200) {
      let q = this.db.from('historial_cambios').select('*', { count: 'exact' })
        .order('fecha', { ascending: false }).order('id', { ascending: false });
      if (tabla) q = q.eq('tabla', tabla);
      const { data, error, count } = await q.range(filas.length, 199);
      if (error) throw error;
      if (data === null || count === null) throw new Error('Respuesta incompleta del historial.');
      if (!data.length && filas.length < Math.min(count, 200)) throw new Error('Lectura interrumpida del historial.');
      filas.push(...data as HistorialDB[]);
      if (filas.length >= count) break;
    }
    return filas;
  }
}
