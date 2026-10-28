import { Component, computed, effect, inject, signal, PLATFORM_ID } from '@angular/core';

import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CostosProduccionService, CostosPresentacion } from '../../core/costos-produccion.service';
import { resolverManoObra, sumarCostoFinal, mesActualEcuador } from '../../core/costos-calculos';
import { resolverGastosIndirectos } from '../../core/gastos-indirectos-calculos';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';

import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

import { SelectionService } from '../../core/selection.service';
import { DataService } from '../../core/data.service';

import { Ingrediente, Presentacion } from '../../models/producto.model';

import { HistoricoCostos } from '../../shared/historico-costos/historico-costos';

@Component({
  selector: 'app-estandar',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    BaseChartDirective,
    HistoricoCostos,
  ],
  templateUrl: './estandar.html',
  styleUrl: './estandar.css',
})
export class Estandar {
  // SERVICIOS

  private readonly selectionService = inject(SelectionService);

  private readonly costosService = inject(CostosProduccionService);
  private readonly data = inject(DataService);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private solicitudCostos = 0;

  // PRODUCTO SELECCIONADO

  readonly productoSeleccionado = this.selectionService.productoSeleccionado;

  readonly presentacionSeleccionada = this.selectionService.presentacionSeleccionada;

  // PRESENTACIONES

  readonly presentacionActual = computed<Presentacion | null>(() => {
    return this.presentacionSeleccionada();
  });

  readonly presentaciones = computed<Presentacion[]>(() => {
    return this.productoSeleccionado()?.presentaciones ?? [];
  });

  seleccionarPresentacion(presentacion: Presentacion): void {
    this.selectionService.seleccionarPresentacion(presentacion);
  }

  // INGREDIENTES

  readonly ingredientes = computed<Ingrediente[]>(() => {
    return this.presentacionActual()?.ingredientes ?? [];
  });

  // TABLA DE FORMULACIÓN

  readonly displayedColumns: string[] = ['componente', 'unidad', 'porcentaje', 'kg', 'litros'];

  readonly formulacion = computed(() => {
    const producto = this.productoSeleccionado();
    const presentacion = this.presentacionActual();

    if (!producto || !presentacion) {
      return [];
    }

    return presentacion.ingredientes.map((ingrediente) => {
      const item = presentacion.items.find(
        (itemPresentacion) => itemPresentacion.materiaPrimaId === ingrediente.materiaPrimaId,
      );

      return {
        componente: ingrediente.nombre,
        unidad: ingrediente.unidad,
        porcentaje: ingrediente.porcentaje,
        kg: item?.kg ?? null,
        litros: item?.litros ?? null,
      };
    });
  });

  // GRÁFICO DE COMPOSICIÓN

  readonly paleta: string[] = [
    '#1d4ed8',
    '#0ea5e9',
    '#14b8a6',
    '#22c55e',
    '#eab308',
    '#f97316',
    '#ef4444',
    '#ec4899',
    '#8b5cf6',
    '#64748b',
  ];

  readonly doughnutChartType = 'doughnut' as const;

  readonly doughnutChartData = computed<ChartData<'doughnut'>>(() => {
    const ingredientes = [...this.ingredientes()].sort((a, b) => b.porcentaje - a.porcentaje);

    return {
      labels: ingredientes.map((ingrediente) => ingrediente.nombre),
      datasets: [
        {
          data: ingredientes.map((ingrediente) => ingrediente.porcentaje),
          backgroundColor: ingredientes.map((_, i) => this.paleta[i % this.paleta.length]),
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  });

  readonly doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
      },
    },
  };

  // CALCULADORA DE BATCH

  readonly litrosBatch = signal<number>(0);

  cambiarLitrosBatch(valor: string): void {
    const litros = Number(valor);

    if (!Number.isFinite(litros) || litros < 0) {
      this.litrosBatch.set(0);
      return;
    }

    this.litrosBatch.set(litros);
  }

  readonly batchCalculado = computed(() => {
    const litrosBatch = this.litrosBatch();
    const presentacion = this.presentacionActual();

    if (litrosBatch <= 0 || !presentacion || presentacion.litros <= 0) {
      return [];
    }

    const factor = litrosBatch / presentacion.litros;

    return presentacion.items.map((item) => ({
      ingrediente: item.ingrediente,
      kg: item.kg * factor,
      litros: item.litros * factor,
    }));
  });

  // RESUMEN DE PRESENTACIÓN

  readonly totalKg = computed(() => {
    return this.presentacionActual()?.totalKg ?? 0;
  });

  readonly totalLitros = computed(() => {
    return this.presentacionActual()?.totalLitros ?? 0;
  });

  readonly totalCosto = computed(() => {
    return this.costoMateriaPrima();
  });

  readonly hayFormula = computed(
    () => this.ingredientes().length > 0 && (this.presentacionActual()?.items.length ?? 0) > 0,
  );
  readonly sumaPorcentajes = computed(() =>
    this.ingredientes().reduce((n, i) => n + i.porcentaje, 0),
  );
  readonly costos = signal<CostosPresentacion | null>(null);
  readonly costosActuales = computed(() => {
    const costos = this.costos();
    return costos?.presentacionId === this.presentacionActual()?.id ? costos : null;
  });
  readonly cargandoCostos = signal(false);
  readonly errorCostos = signal<string | null>(null);
  readonly mesSeleccionado = this.selectionService.mesCostosSeleccionado;
  private readonly indiceSemana = signal(0);
  readonly semanas = computed(() => {
    const presentacion = this.presentacionActual();
    return presentacion
      ? this.data.semanasMateriaPrima([presentacion], this.mesSeleccionado())
      : [];
  });
  readonly semanaSeleccionada = computed(
    () => this.semanas()[Math.min(this.indiceSemana(), this.semanas().length - 1)] ?? '',
  );
  readonly valoracionMateriaPrima = computed(() => {
    const presentacion = this.presentacionActual();
    return presentacion && this.semanaSeleccionada()
      ? this.data.materiaPrimaEnFecha(presentacion, this.semanaSeleccionada())
      : null;
  });
  readonly meses = computed(() => {
    const presentacion = this.presentacionActual();
    return [
      ...new Set([
        ...(this.mesSeleccionado() ? [this.mesSeleccionado()] : []),
        ...(this.costosActuales()?.meses ?? []),
        ...(presentacion ? this.data.mesesMateriaPrima(presentacion) : []),
      ]),
    ].sort();
  });
  readonly costoEmpaque = computed(() => this.costosActuales()?.costoEmpaque ?? null);
  readonly costoCarton = computed(() => this.costosActuales()?.costoCarton ?? null);
  readonly costoMateriaPrima = computed(() => {
    return this.valoracionMateriaPrima()?.costo ?? null;
  });
  readonly costoPreliminar = computed(() => {
    const materia = this.costoMateriaPrima(),
      empaque = this.costoEmpaque(),
      carton = this.costoCarton();
    return materia === null || empaque === null || carton === null
      ? null
      : materia + empaque + carton;
  });
  readonly manoObraVigente = computed(() => {
    const costos = this.costosActuales(),
      mes = this.mesSeleccionado();
    return costos && mes ? resolverManoObra(costos.manoObra, `${mes}-01`) : null;
  });
  readonly costoManoObra = computed(() => this.manoObraVigente()?.costo_unitario ?? null);
  readonly gastosIndirectosDelMes = computed(() => {
    const costos = this.costosActuales(),
      mes = this.mesSeleccionado();
    return costos && mes ? resolverGastosIndirectos(costos.gastosIndirectos, mes) : null;
  });
  readonly costoGastosIndirectos = computed(() => this.gastosIndirectosDelMes()?.costo ?? null);
  readonly costoFinal = computed(() => {
    const empaque = this.costoEmpaque();
    const carton = this.costoCarton();
    if (
      !this.costosActuales() ||
      this.cargandoCostos() ||
      this.errorCostos() ||
      empaque === null ||
      carton === null
    )
      return null;
    return sumarCostoFinal(
      this.costoMateriaPrima(),
      empaque,
      this.costoManoObra(),
      this.costoGastosIndirectos(),
      carton,
    );
  });

  constructor() {
    effect((onCleanup) => {
      const presentacion = this.presentacionActual();
      const solicitud = ++this.solicitudCostos;
      onCleanup(() => {
        this.solicitudCostos++;
      });
      this.costos.set(null);
      this.errorCostos.set(null);
      this.cargandoCostos.set(false);
      if (this.navegador && presentacion) void this.cargarCostos(presentacion.id, solicitud);
    });
  }

  etiquetaPresentacion(presentacion: Presentacion): string {
    const ml = Number((presentacion.litros * 1000).toFixed(3));
    return `${ml.toLocaleString('es-EC', { maximumFractionDigits: 3 })} ml · ${presentacion.tecnologia}`;
  }

  cambiarMes(mes: string): void {
    if (this.meses().includes(mes)) {
      this.mesSeleccionado.set(mes);
      this.indiceSemana.set(0);
    }
  }

  cambiarSemana(fecha: string): void {
    const indice = this.semanas().indexOf(fecha);
    if (indice >= 0) this.indiceSemana.set(indice);
  }

  nombreMes(mes: string): string {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return '';
    return new Intl.DateTimeFormat('es-EC', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${mes}-01T00:00:00Z`));
  }

  async actualizarCostos(): Promise<void> {
    const presentacion = this.presentacionActual();
    if (!this.navegador || !presentacion) return;
    if (!(await this.data.actualizarAhora())) {
      this.errorCostos.set(this.data.error() ?? 'No se pudieron cargar los precios históricos.');
      return;
    }
    void this.cargarCostos(presentacion.id, ++this.solicitudCostos);
  }

  private async cargarCostos(presentacionId: number, solicitud: number): Promise<void> {
    this.cargandoCostos.set(true);
    this.costos.set(null);
    this.errorCostos.set(null);
    try {
      const costos = await this.costosService.cargar(presentacionId);
      if (solicitud !== this.solicitudCostos) return;
      this.costos.set(costos);
      if (!this.mesSeleccionado()) {
        const actual = mesActualEcuador();
        const ultimoConGastos = costos.gastosIndirectos
          .map((g) => g.mes.slice(0, 7))
          .filter((mes) => mes <= actual)
          .sort()
          .at(-1);
        this.mesSeleccionado.set(
          ultimoConGastos ?? (costos.meses.includes(actual) ? actual : (costos.meses.at(-1) ?? '')),
        );
      }
    } catch (error: unknown) {
      if (solicitud !== this.solicitudCostos) return;
      this.errorCostos.set(
        error instanceof Error ? error.message : 'No se pudieron cargar los costos de producción.',
      );
    } finally {
      if (solicitud === this.solicitudCostos) this.cargandoCostos.set(false);
    }
  }
}
