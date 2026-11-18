import { Injectable, inject, signal } from '@angular/core';
import { CatalogoAdminService } from './catalogo-admin.service';
import { SupabaseService } from './supabase.service';

export const RUBROS_ESTANDAR = [
  { clave: 'materiaPrima', nombre: 'Materia prima' },
  { clave: 'empaque', nombre: 'Empaque' },
  { clave: 'carton', nombre: 'Cartón' },
  { clave: 'manoObra', nombre: 'Mano de obra' },
  { clave: 'gif', nombre: 'Gastos indirectos' },
] as const;
export type CostosEstandar = Record<(typeof RUBROS_ESTANDAR)[number]['clave'], number>;

export function mesCostoValido(mes: string): boolean {
  return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

export function validarCostosEstandar(valor: unknown): valor is CostosEstandar {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    RUBROS_ESTANDAR.every(({ clave }) => {
      const costo = (valor as Record<string, unknown>)[clave];
      return typeof costo === 'number' && Number.isFinite(costo) && costo >= 0;
    }) &&
    Number.isFinite(
      RUBROS_ESTANDAR.reduce((suma, { clave }) => suma + (valor as CostosEstandar)[clave], 0),
    )
  );
}

@Injectable({ providedIn: 'root' })
export class CostosEstandarService {
  private readonly db = inject(SupabaseService).client;
  private readonly api = inject(CatalogoAdminService);
  private readonly registros = signal<Record<string, CostosEstandar>>({});
  readonly disponible = signal(true);
  readonly disponibleMensual = signal(true);

  disponiblePara(mes = ''): boolean {
    return mes ? this.disponibleMensual() : this.disponible();
  }

  obtener(id: number, mes = ''): CostosEstandar | null {
    return this.registros()[mes ? `${id}:${mes}` : id] ?? null;
  }

  mesesGuardados(id: number): string[] {
    return Object.keys(this.registros())
      .filter((clave) => clave.startsWith(`${id}:`))
      .map((clave) => clave.split(':')[1])
      .sort();
  }

  async cargar(id: number, mes = ''): Promise<CostosEstandar | null> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Presentación inválida.');
    if (mes && !mesCostoValido(mes)) throw new Error('Selecciona un mes válido.');
    const clave = mes ? `${id}:${mes}` : String(id);
    const disponible = mes ? this.disponibleMensual : this.disponible;
    let consulta = this.db
      .from(mes ? 'costo_mensual' : 'costo_estandar')
      .select('costos')
      .eq('presentacion_id', id);
    if (mes) consulta = consulta.eq('mes', `${mes}-01`);
    const { data, error } = await consulta.maybeSingle();
    if (error && ['PGRST205', '42P01'].includes(error.code)) {
      disponible.set(false);
      this.registros.update((registros) => {
        const siguientes = { ...registros };
        delete siguientes[clave];
        return siguientes;
      });
      return null;
    }
    if (error) throw new Error('No se pudieron cargar los costos estándar. Vuelve a intentarlo.');
    disponible.set(true);
    const costos: unknown = data?.costos ?? null;
    if (data !== null && !validarCostosEstandar(costos))
      throw new Error('Costos estándar inválidos.');
    this.registros.update((registros) => {
      const siguientes = { ...registros };
      if (costos) siguientes[clave] = costos as CostosEstandar;
      else delete siguientes[clave];
      return siguientes;
    });
    return costos as CostosEstandar | null;
  }

  async guardar(id: number, costos: CostosEstandar, mes = ''): Promise<void> {
    if (!Number.isSafeInteger(id) || id <= 0 || !validarCostosEstandar(costos)) {
      throw new Error('Completa los cinco costos con números válidos, sin negativos.');
    }
    if (mes && !mesCostoValido(mes)) throw new Error('Selecciona un mes válido.');
    if (!(await this.api.sesionEditor()).editor)
      throw new Error('Inicia sesión con una cuenta autorizada para editar.');
    if (!this.disponiblePara(mes))
      throw new Error('El guardado de costos de este período aún no está habilitado.');
    const { data, error } = await this.db
      .from(mes ? 'costo_mensual' : 'costo_estandar')
      .upsert(
        { presentacion_id: id, costos, ...(mes ? { mes: `${mes}-01` } : {}) },
        { onConflict: mes ? 'presentacion_id,mes' : 'presentacion_id' },
      )
      .select('costos')
      .single();
    if (error) {
      if (['PGRST205', '42P01'].includes(error.code)) {
        (mes ? this.disponibleMensual : this.disponible).set(false);
        throw new Error('El guardado de costos estándar aún no está habilitado.');
      }
      if (error.code === '42501')
        throw new Error('Tu cuenta no tiene permiso para guardar estos costos.');
      throw new Error(
        'No se pudieron guardar los costos. Tus cambios siguen en el formulario; vuelve a intentarlo.',
      );
    }
    if (!data || !validarCostosEstandar(data.costos))
      throw new Error('No se guardaron los costos estándar.');
    this.registros.update((registros) => ({
      ...registros,
      [mes ? `${id}:${mes}` : id]: data.costos as CostosEstandar,
    }));
  }

  async cargarMensuales(id: number): Promise<void> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Presentación inválida.');
    const registros: Record<string, CostosEstandar> = {};
    let inicio = 0;
    while (true) {
      const { data, error, count } = await this.db
        .from('costo_mensual')
        .select('mes,costos', { count: 'exact' })
        .eq('presentacion_id', id)
        .order('mes')
        .range(inicio, inicio + 499);
      if (error && ['PGRST205', '42P01'].includes(error.code)) {
        this.disponibleMensual.set(false);
        break;
      }
      if (error || data === null || count === null)
        throw new Error('No se pudieron cargar los costos mensuales.');
      for (const fila of data) {
        if (
          typeof fila.mes !== 'string' ||
          !mesCostoValido(fila.mes.slice(0, 7)) ||
          !fila.mes.endsWith('-01') ||
          !validarCostosEstandar(fila.costos)
        )
          throw new Error('Costos mensuales inválidos.');
        registros[`${id}:${fila.mes.slice(0, 7)}`] = fila.costos;
      }
      inicio += data.length;
      if (inicio >= count) {
        this.disponibleMensual.set(true);
        break;
      }
      if (!data.length) throw new Error('Lectura incompleta de los costos mensuales.');
    }
    this.registros.update((actuales) => ({
      ...Object.fromEntries(
        Object.entries(actuales).filter(([clave]) => !clave.startsWith(`${id}:`)),
      ),
      ...registros,
    }));
  }
}
