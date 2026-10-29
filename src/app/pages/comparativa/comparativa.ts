import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { coincideBusqueda } from '../../core/busqueda-texto';
import { DataService } from '../../core/data.service';
import { SelectionService } from '../../core/selection.service';
import { CostosPresentacion, CostosProduccionService } from '../../core/costos-produccion.service';
import { mesActualEcuador, resolverManoObra, sumarCostoFinal } from '../../core/costos-calculos';
import { resolverGastosIndirectos } from '../../core/gastos-indirectos-calculos';

type Rubro = 'materiaPrima' | 'empaque' | 'carton' | 'manoObra' | 'gif' | 'total' | 'litro';
interface Periodo {
  mes: string;
  valores: Record<Rubro, number | null>;
  avisos: string[];
}

@Component({
  selector: 'app-comparativa',
  standalone: true,
  imports: [DecimalPipe, MatIconModule, MatAutocompleteModule],
  templateUrl: './comparativa.html',
  styleUrl: './comparativa.css',
})
export class Comparativa {
  private readonly data = inject(DataService);
  private readonly selection = inject(SelectionService);
  private readonly servicioCostos = inject(CostosProduccionService);
  private readonly revision = signal(0);
  readonly catalogoCargando = this.data.cargando.asReadonly();
  readonly errorCatalogo = this.data.error.asReadonly();
  readonly cargando = signal(false);
  readonly actualizando = signal(false);
  readonly error = signal('');
  readonly mensajeMes = signal('');
  readonly costos = signal<CostosPresentacion | null>(null);
  readonly skuId = signal<number | null>(null);
  readonly busquedaProducto = signal<string | null>(null);
  private readonly anioPreferido = signal(
    this.selection.mesCostosSeleccionado().slice(0, 4) || mesActualEcuador().slice(0, 4),
  );
  readonly mesesSeleccionados = signal<string[]>([]);
  readonly mesPendiente = signal('');
  readonly limiteMeses = 4;
  readonly rubros: { clave: Rubro; nombre: string }[] = [
    { clave: 'materiaPrima', nombre: 'Materia prima' },
    { clave: 'empaque', nombre: 'Empaque actual' },
    { clave: 'carton', nombre: 'Cartón actual' },
    { clave: 'manoObra', nombre: 'Mano de obra' },
    { clave: 'gif', nombre: 'Gastos indirectos' },
    { clave: 'total', nombre: 'Costo por unidad' },
    { clave: 'litro', nombre: 'Costo por litro' },
  ];
  readonly opciones = computed(() =>
    this.data
      .productos()
      .filter((producto) => producto.activo)
      .flatMap((producto) =>
        producto.presentaciones
          .filter((p) => p.activo)
          .map((presentacion) => ({ producto, presentacion })),
      ),
  );
  readonly opcion = computed(() => {
    const id = this.skuId() ?? this.selection.presentacionSeleccionada()?.id;
    return this.opciones().find((o) => o.presentacion.id === id) ?? this.opciones()[0] ?? null;
  });
  readonly opcionesFiltradas = computed(() =>
    this.opciones().filter(({ producto, presentacion }) =>
      coincideBusqueda(
        this.busquedaProducto() ?? '',
        producto.nombre,
        presentacion.nombreSku ?? '',
        presentacion.claveSku,
        `${presentacion.litros * 1000} ml`,
        presentacion.tecnologia,
      ),
    ),
  );
  readonly mostrarProducto = (id: number | null): string => {
    const o = this.opciones().find((o) => o.presentacion.id === id);
    return o
      ? `${o.producto.nombre} · ${o.presentacion.nombreSku || o.presentacion.claveSku} · ${o.presentacion.litros * 1000} ml · ${o.presentacion.tecnologia}`
      : '';
  };
  readonly mesesRegistrados = computed(() => {
    const p = this.opcion()?.presentacion;
    const datos = this.costos();
    return [
      ...new Set([
        ...(datos?.manoObra.map((r) => r.mes.slice(0, 7)) ?? []),
        ...(datos?.gastosIndirectos.map((r) => r.mes.slice(0, 7)) ?? []),
        ...(p ? this.data.mesesMateriaPrima(p) : []),
      ]),
    ]
      .filter((mes) => this.mesValido(mes))
      .sort();
  });
  readonly aniosDisponibles = computed(() =>
    [...new Set(this.mesesRegistrados().map((mes) => mes.slice(0, 4)))].sort(),
  );
  readonly anioSeleccionado = computed(() => {
    const anios = this.aniosDisponibles();
    return anios.includes(this.anioPreferido()) ? this.anioPreferido() : (anios.at(-1) ?? '');
  });
  readonly mesesDisponibles = computed(() =>
    this.mesesRegistrados().filter((mes) => mes.startsWith(`${this.anioSeleccionado()}-`)),
  );
  readonly estandar = computed(() => this.calcularPeriodo(''));
  readonly comparaciones = computed(() =>
    this.mesesSeleccionados().map((mes) => this.calcularPeriodo(mes)),
  );
  readonly periodos = computed(() => [this.estandar(), ...this.comparaciones()]);

  constructor() {
    effect((onCleanup) => {
      const id = this.opcion()?.presentacion.id;
      this.revision();
      let cancelado = false;
      onCleanup(() => {
        cancelado = true;
      });
      this.costos.set(null);
      this.error.set('');
      this.cargando.set(!!id);
      if (!id) return;
      void this.servicioCostos
        .cargar(id)
        .then((datos) => {
          if (!cancelado) this.costos.set(datos);
        })
        .catch((error: unknown) => {
          if (!cancelado)
            this.error.set(
              error instanceof Error ? error.message : 'No se pudieron cargar los costos.',
            );
        })
        .finally(() => {
          if (!cancelado) this.cargando.set(false);
        });
    });
  }

  seleccionarSku(valor: string): void {
    const opcion = this.opciones().find((o) => o.presentacion.id === Number(valor));
    if (!opcion) return;
    this.skuId.set(opcion.presentacion.id);
    this.busquedaProducto.set(null);
    this.selection.seleccionarProducto(opcion.producto, opcion.presentacion);
  }

  cambiarAnio(anio: string): void {
    if (!this.aniosDisponibles().includes(anio)) return;
    this.anioPreferido.set(anio);
    this.mesPendiente.set('');
    this.mensajeMes.set('');
  }

  agregarMes(): void {
    const mes = this.mesPendiente();
    if (!this.mesValido(mes)) {
      this.mensajeMes.set('Selecciona un mes válido.');
    } else if (!this.mesesDisponibles().includes(mes)) {
      this.mensajeMes.set('Selecciona un mes registrado del año elegido.');
    } else if (this.mesesSeleccionados().includes(mes)) {
      this.mensajeMes.set('Este mes ya está incluido en la comparación.');
    } else if (this.mesesSeleccionados().length >= this.limiteMeses) {
      this.mensajeMes.set('Puedes comparar un máximo de 4 meses. Quita uno para agregar otro.');
    } else {
      this.mesesSeleccionados.update((meses) => [...meses, mes].sort());
      this.mesPendiente.set('');
      this.mensajeMes.set('');
    }
  }

  quitarMes(mes: string): void {
    this.mesesSeleccionados.update((meses) => meses.filter((m) => m !== mes));
    this.mensajeMes.set('');
  }

  diferencia(valor: number | null, base: number | null): number | null {
    return valor === null || base === null ? null : valor - base;
  }

  porcentaje(valor: number | null, base: number | null): number | null {
    return valor === null || base === null || base === 0 ? null : ((valor - base) / base) * 100;
  }

  nombreMes(mes: string): string {
    if (!mes) return 'Est?ndar del producto';
    if (!this.mesValido(mes)) return '';
    return new Intl.DateTimeFormat('es-EC', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${mes}-01T00:00:00Z`));
  }

  async actualizar(): Promise<void> {
    if (this.cargando() || this.actualizando() || this.catalogoCargando()) return;
    this.actualizando.set(true);
    this.error.set('');
    try {
      if (await this.data.actualizarAhora()) this.revision.update((n) => n + 1);
      else this.error.set(this.data.error() ?? 'No se pudieron actualizar los datos.');
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'No se pudieron actualizar los datos.',
      );
    } finally {
      this.actualizando.set(false);
    }
  }

  private mesValido(mes: string): boolean {
    return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  }

  private calcularPeriodo(mes: string): Periodo {
    const p = this.opcion()?.presentacion;
    const datos = this.costos();
    const avisos: string[] = [];
    const materia = p
      ? mes
        ? (this.data.materiaPrimaDelMes(p, mes)?.costo ?? null)
        : p.totalCosto
      : null;
    const materiaPrima =
      materia !== null && Number.isFinite(materia) && materia >= 0 ? materia : null;
    // La base no depende del per?odo elegido: usa los primeros registros del SKU.
    const mesManoBase = datos?.manoObra.map((r) => r.mes.slice(0, 7)).sort()[0];
    const mesGifBase = datos?.gastosIndirectos.map((r) => r.mes.slice(0, 7)).sort()[0];
    const mesMano = mes || mesManoBase;
    const mesGif = mes || mesGifBase;
    const mano = datos && mesMano ? resolverManoObra(datos.manoObra, `${mesMano}-01`) : null;
    const indirectos =
      datos && mesGif ? resolverGastosIndirectos(datos.gastosIndirectos, mesGif) : null;
    const empaque = datos?.costoEmpaque ?? null;
    const carton = datos?.costoCarton ?? null;
    const manoObra = mano?.costo_unitario ?? null;
    const gif = indirectos?.costo ?? null;
    const total =
      empaque === null || carton === null || datos?.empaqueSinDato || datos?.cartonSinDato
        ? null
        : sumarCostoFinal(materiaPrima, empaque, manoObra, gif, carton);
    if (materiaPrima === null)
      avisos.push('Materia prima sin fórmula, cantidades o precios completos.');
    if (datos) {
      if (datos.empaqueSinDato) avisos.push('Empaque incompleto.');
      if (datos.cartonSinDato) avisos.push('Cartón incompleto.');
      if (datos.empaqueEstimado || datos.cartonEstimado)
        avisos.push('Empaque o cartón estimados por referencia.');
      if (manoObra === null) avisos.push('Sin mano de obra vigente.');
      else if (mes && mano && mano.mes.slice(0, 7) !== mes)
        avisos.push(`Mano de obra vigente desde ${this.nombreMes(mano.mes.slice(0, 7))}.`);
      if (mano?.estimado) avisos.push('Mano de obra estimada.');
      if (gif === null) avisos.push('Sin gastos indirectos para este mes.');
      if (indirectos?.estimado) avisos.push('Gastos indirectos estimados.');
    }
    const litros = p?.litros ?? 0;
    const volumenValido = Number.isFinite(litros) && litros > 0;
    if (p && !volumenValido) avisos.push('Volumen inválido para calcular el costo por litro.');
    return {
      mes,
      valores: {
        materiaPrima,
        empaque,
        carton,
        manoObra,
        gif,
        total,
        litro: total !== null && volumenValido ? total / litros : null,
      },
      avisos,
    };
  }
}
