import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { DataService } from '../../core/data.service';
import { Presentacion } from '../../models/producto.model';
import {
  EstadoEmpaque,
  TipoEmpaque,
  TIPOS_EMPAQUE_BASE,
  tiposEmpaqueRequeridos,
} from '../../models/empaque.model';
import { coincideBusqueda } from '../../core/busqueda-texto';

@Component({
  selector: 'app-empaques',
  imports: [DecimalPipe, RouterLink, BaseChartDirective],
  templateUrl: './empaques.html',
  styleUrl: './empaques.css',
})
export class Empaques {
  private readonly data = inject(DataService);
  readonly productos = this.data.productos.asReadonly();
  readonly empaques = this.data.empaques.asReadonly();
  readonly cargando = this.data.cargando.asReadonly();
  readonly cargado = this.data.cargado.asReadonly();
  readonly errorCarga = this.data.error.asReadonly();
  readonly tiposEmpaque = TIPOS_EMPAQUE_BASE;
  readonly busqueda = signal('');
  readonly soloIncompletos = signal(false);
  readonly mostrarGraficos = signal(false);
  readonly presentacionDetalleId = signal<number | null>(null);
  actualizarAhora(): void {
    void this.data.actualizarAhora();
  }
  buscar(valor: string): void {
    this.busqueda.set(valor);
  }
  toggleIncompletos(): void {
    this.soloIncompletos.update((v) => !v);
  }
  elegirPresentacion(id: number): void {
    this.presentacionDetalleId.set(id);
  }
  etiqueta(p: Presentacion): string {
    return `${Number((p.litros * 1000).toFixed(3)).toLocaleString('es-EC', { maximumFractionDigits: 3 })} ml · ${p.tecnologia}`;
  }
  nombreEstado(estado: EstadoEmpaque): string {
    return estado === 'confirmado'
      ? 'Confirmado'
      : estado === 'sin_dato'
        ? 'Sin dato'
        : 'Referencia';
  }
  readonly resumen = computed(() =>
    this.productos().flatMap((producto) =>
      producto.presentaciones.map((presentacion) => {
        const empaques = this.empaques().filter((e) => e.presentacionId === presentacion.id);
        const valor = (tipo: TipoEmpaque): number =>
          empaques.find((e) => e.tipo === tipo)?.costo ?? 0;
        const requiereCarton = tiposEmpaqueRequeridos(producto).includes('Cartón');
        const tieneCarton = requiereCarton || empaques.some((e) => e.tipo === 'Cartón');
        const incompleto =
          tiposEmpaqueRequeridos(producto).some(
            (t) => !empaques.some((e) => e.tipo === t && e.estado !== 'sin_dato'),
          ) || empaques.some((e) => e.estado === 'sin_dato');
        const referencia = empaques.some((e) => e.estado === 'referencia_producto');
        const componentesEmpaque = empaques.filter((e) => e.tipo !== 'Cartón');
        const total = componentesEmpaque.reduce((n, e) => n + e.costo, 0);
        const carton = valor('Cartón');
        const preliminar =
          presentacion.totalCosto === null ? null : presentacion.totalCosto + total + carton;
        return {
          id: presentacion.id,
          producto,
          presentacion,
          nombre: producto.nombre,
          categoria: producto.categoria,
          botella: valor('Botella'),
          tap: valor('Tap'),
          etiqueta: valor('Etiqueta'),
          carton,
          cartonPendiente:
            tieneCarton && !empaques.some((e) => e.tipo === 'Cartón' && e.estado !== 'sin_dato'),
          tieneCarton,
          total,
          incompleto,
          referencia,
          preliminar,
          pct: preliminar !== null && preliminar > 0 ? (total / preliminar) * 100 : null,
          componentesEmpaque,
        };
      }),
    ),
  );
  readonly resumenFiltrado = computed(() =>
    this.resumen().filter(
      (r) =>
        coincideBusqueda(
          this.busqueda(),
          r.nombre,
          r.categoria,
          r.producto.marca,
          r.presentacion.nombreSku,
          r.presentacion.codigoBarras ?? '',
          this.etiqueta(r.presentacion),
        ) &&
        (!this.soloIncompletos() || r.incompleto),
    ),
  );
  readonly detalle = computed(
    () => this.resumen().find((r) => r.id === this.presentacionDetalleId()) ?? null,
  );
  readonly totalRegistros = computed(
    () => this.empaques().filter((e) => e.tipo !== 'Cartón').length,
  );
  readonly sinCosto = computed(() => this.resumen().filter((r) => r.incompleto).length);
  readonly promedioPorTipo = computed(() =>
    this.tiposEmpaque.map((tipo) => {
      const filas = this.empaques().filter((e) => e.tipo === tipo && e.estado !== 'sin_dato');
      return {
        tipo,
        promedio: filas.length ? filas.reduce((n, e) => n + e.costo, 0) / filas.length : null,
      };
    }),
  );
  readonly empaqueMasCaro = computed(() =>
    this.resumen().reduce<ReturnType<typeof this.resumen>[number] | null>(
      (mejor, r) => (!mejor || r.total > mejor.total ? r : mejor),
      null,
    ),
  );
  readonly barType = 'bar' as const;
  readonly barData = computed<ChartData<'bar'>>(() => {
    const top = [...this.resumen()].sort((a, b) => b.total - a.total).slice(0, 15);
    return {
      labels: top.map((r) => `${r.nombre} · ${this.etiqueta(r.presentacion)}`),
      datasets: [
        { label: 'Botella', data: top.map((r) => r.botella), backgroundColor: '#1d4ed8' },
        { label: 'Tap', data: top.map((r) => r.tap), backgroundColor: '#16a34a' },
        { label: 'Etiqueta', data: top.map((r) => r.etiqueta), backgroundColor: '#f59e0b' },
      ],
    };
  });
  readonly barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } },
  };
  readonly doughnutType = 'doughnut' as const;
  readonly doughnutData = computed<ChartData<'doughnut'>>(() => ({
    labels: [...this.tiposEmpaque],
    datasets: [
      {
        data: this.tiposEmpaque.map((tipo) =>
          this.empaques()
            .filter((e) => e.tipo === tipo)
            .reduce((n, e) => n + e.costo, 0),
        ),
        backgroundColor: ['#1d4ed8', '#16a34a', '#f59e0b'],
      },
    ],
  }));
}
