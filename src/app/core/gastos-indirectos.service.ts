import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  inject,
  signal
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';

import { SupabaseService } from './supabase.service';

import {
  GastoIndirecto,
  validarMesGif
} from './gastos-indirectos-calculos';

export interface GuardarIndirecto {
  presentacion_id: number;
  mes: string;
  concepto: string;
  costo_unitario: number;
  estimado: boolean;
  observacion: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class GastosIndirectosService {
  private readonly db = inject(SupabaseService).client;

  private readonly sesion = signal(false);

  readonly autenticado = this.sesion.asReadonly();

  constructor() {
    const destroyRef = inject(DestroyRef);
    const navegador = isPlatformBrowser(inject(PLATFORM_ID));

    if (navegador) {
      const { data } = this.db.auth.onAuthStateChange(
        (_evento, sesion) => {
          this.sesion.set(!!sesion);
        }
      );

      destroyRef.onDestroy(() => {
        data.subscription.unsubscribe();
      });
    }
  }

  async cargar(
    presentacionId: number
  ): Promise<GastoIndirecto[]> {
    this.validarId(presentacionId);

    const filas: GastoIndirecto[] = [];
    let inicio = 0;

    while (true) {
      const { data, error, count } = await this.db
        .from('gasto_indirecto')
        .select(
          'id,presentacion_id,mes,concepto,costo_unitario,estimado,observacion',
          { count: 'exact' }
        )
        .eq('presentacion_id', presentacionId)
        .order('id', { ascending: true })
        .range(inicio, inicio + 499);

      if (error) {
        throw new Error(
          `No se pudieron leer los gastos indirectos: ${error.message}`
        );
      }

      if (data === null || count === null) {
        throw new Error(
          'Respuesta incompleta de gastos indirectos.'
        );
      }

      for (const raw of data) {
        const registro = raw as Record<string, unknown>;

        const id = Number(registro['id']);
        const mes = String(registro['mes']);
        const concepto = registro['concepto'];
        const costo = registro['costo_unitario'];
        const estimado = registro['estimado'];

        validarMesGif(mes);

        if (
          Number(registro['presentacion_id']) !== presentacionId ||
          !Number.isSafeInteger(id) ||
          id <= 0 ||
          typeof concepto !== 'string' ||
          !concepto.trim() ||
          costo == null ||
          String(costo).trim() === '' ||
          !Number.isFinite(Number(costo)) ||
          Number(costo) < 0 ||
          typeof estimado !== 'boolean'
        ) {
          throw new Error(
            'Registro de gastos indirectos inválido.'
          );
        }

        filas.push({
          id,
          presentacion_id: presentacionId,
          mes,
          concepto,
          costo_unitario: Number(costo),
          estimado,
          observacion:
            registro['observacion'] == null
              ? null
              : String(registro['observacion'])
        });
      }

      inicio += data.length;

      if (inicio >= count) {
        return filas;
      }

      if (data.length === 0) {
        throw new Error(
          'La lectura de gastos indirectos se interrumpió.'
        );
      }
    }
  }

  async guardar(
    valor: GuardarIndirecto
  ): Promise<void> {
    this.validarId(valor.presentacion_id);
    validarMesGif(valor.mes);

    const concepto = valor.concepto.trim();
    const observacion = valor.observacion?.trim() || null;

    if (
      !concepto ||
      concepto.length > 120 ||
      !Number.isFinite(valor.costo_unitario) ||
      valor.costo_unitario < 0 ||
      valor.costo_unitario >= 100000000 ||
      typeof valor.estimado !== 'boolean' ||
      (observacion?.length ?? 0) > 1000
    ) {
      throw new Error(
        'Revisa el concepto, el costo y la observación.'
      );
    }

    const {
      data,
      error: errorSesion
    } = await this.db.auth.getUser();

    if (errorSesion || !data.user) {
      throw new Error(
        'Inicia sesión con un usuario editor para guardar.'
      );
    }

    // RLS verifica que el usuario tenga permisos de editor.
    const { error } = await this.db
      .from('gasto_indirecto')
      .upsert(
        {
          presentacion_id: valor.presentacion_id,
          mes: valor.mes,
          concepto,
          costo_unitario: valor.costo_unitario,
          estimado: valor.estimado,
          observacion
        },
        {
          onConflict: 'presentacion_id,mes,concepto'
        }
      );

    if (error) {
      throw new Error(
        `No se pudo guardar el gasto: ${error.message}`
      );
    }
  }

  private validarId(id: number): void {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Presentación inválida.');
    }
  }
}
