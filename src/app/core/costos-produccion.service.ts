import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { tiposEmpaqueRequeridos } from '../models/empaque.model';
import { calcularEmpaque, ManoObraMensual, mesesManoObra, resolverManoObra, mesActualEcuador } from './costos-calculos';
import { GastoIndirectoMensual, leerGastosIndirectos } from './gastos-indirectos-calculos';

export interface CostosPresentacion {
  presentacionId: number;
  costoEmpaque: number;
  empaquePorProducto: boolean;
  empaqueEstimado: boolean;
  empaqueSinDato: boolean;
  manoObra: ManoObraMensual[];
  gastosIndirectos: GastoIndirectoMensual[];
  meses: string[];
}

@Injectable({ providedIn: 'root' })
export class CostosProduccionService {
  private readonly db = inject(SupabaseService).client;

  async cargar(presentacionId: number): Promise<CostosPresentacion> {
    if (!Number.isSafeInteger(presentacionId) || presentacionId <= 0) {
      throw new Error('ID de presentación inválido.');
    }
    const [empaques, registros, indirectos, presentacion] = await Promise.all([
      this.leer('empaque', 'id,presentacion_id,tipo,costo,estado', presentacionId),
      this.leer('costo_mano_obra', 'id,presentacion_id,mes,costo_unitario,estimado', presentacionId),
      this.leer('gasto_indirecto', 'id,presentacion_id,mes,concepto,costo_unitario,estimado,observacion', presentacionId),
      this.db.from('presentacion').select('producto:producto_id(categoria,variante)').eq('id', presentacionId).single()
    ]);
    if (presentacion.error) throw new Error(`No se pudo consultar el producto del SKU: ${presentacion.error.message}`);
    const producto = (presentacion.data as unknown as { producto: { categoria: string; variante: string } | null })?.producto;
    if (!producto) throw new Error('No se encontró el producto del SKU seleccionado.');
    const manoObra: ManoObraMensual[] = registros.map(r => {
      if (Number(r['presentacion_id']) !== presentacionId || r['costo_unitario'] == null ||
          String(r['costo_unitario']).trim() === '' || typeof r['estimado'] !== 'boolean') {
        throw new Error('Registro de mano de obra inválido para el SKU seleccionado.');
      }
      return { mes: String(r['mes']), costo_unitario: Number(r['costo_unitario']), estimado: r['estimado'] };
    });
    const actual = mesActualEcuador();
    resolverManoObra(manoObra, `${actual}-01`);
    manoObra.sort((a, b) => a.mes.localeCompare(b.mes));
    const gastosIndirectos = leerGastosIndirectos(indirectos, presentacionId);
    const empaque = calcularEmpaque(empaques, presentacionId, tiposEmpaqueRequeridos(producto));
    const meses = [...new Set([
      ...mesesManoObra(manoObra, actual),
      ...gastosIndirectos.map(g => g.mes.slice(0, 7))
    ])].sort();
    return {
      presentacionId,
      costoEmpaque: empaque.costo,
      empaquePorProducto: false,
      empaqueEstimado: empaque.estimado,
      empaqueSinDato: empaque.sinDato,
      manoObra,
      gastosIndirectos,
      meses
    };
  }

  private async leer(tabla: string, columnas: string, presentacionId: number): Promise<Record<string, unknown>[]> {
    const filas: Record<string, unknown>[] = [];
    let inicio = 0;
    while (true) {
      const { data, error, count } = await this.db.from(tabla)
        .select(columnas, { count: 'exact' }).eq('presentacion_id', presentacionId)
        .order('id', { ascending: true }).range(inicio, inicio + 499);
      if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`);
      if (data === null || count === null) throw new Error(`Respuesta incompleta de ${tabla}.`);
      const pagina = data as unknown as Record<string, unknown>[];
      filas.push(...pagina);
      inicio += pagina.length;
      if (inicio >= count) return filas;
      if (!pagina.length) throw new Error(`La lectura de ${tabla} se interrumpió antes de completarse.`);
    }
  }
}
