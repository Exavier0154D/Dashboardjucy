import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { MatIconModule } from '@angular/material/icon';
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

const COLORES_EMPAQUE: Record<(typeof TIPOS_EMPAQUE_BASE)[number], string> = {
  Botella: '#2563eb',
  Tap: '#059669',
  Etiqueta: '#f59e0b',
};

@Component({
  selector: 'app-empaques',
  imports: [DecimalPipe, RouterLink, BaseChartDirective, MatIconModule],
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
        {
          label: 'Botella',
          data: top.map((r) => r.botella),
          backgroundColor: COLORES_EMPAQUE.Botella,
          borderRadius: 3,
        },
        {
          label: 'Tapa',
          data: top.map((r) => r.tap),
          backgroundColor: COLORES_EMPAQUE.Tap,
          borderRadius: 3,
        },
        {
          label: 'Etiqueta',
          data: top.map((r) => r.etiqueta),
          backgroundColor: COLORES_EMPAQUE.Etiqueta,
          borderRadius: 3,
        },
      ],
    };
  });
  readonly barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    animation:
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? false
        : { duration: 450 },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, padding: 18 } },
      tooltip: {
        backgroundColor: '#172554',
        borderColor: '#60a5fa',
        borderWidth: 1,
        padding: 14,
        cornerRadius: 9,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: $${Number(ctx.parsed.x).toFixed(4)} / unidad`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        border: { display: false },
        grid: { color: '#eef2f6' },
      },
      y: { stacked: true, border: { display: false }, grid: { display: false } },
    },
  };
  readonly doughnutType = 'doughnut' as const;
  readonly doughnutData = computed<ChartData<'doughnut'>>(() => ({
    labels: this.tiposEmpaque.map((tipo) => (tipo === 'Tap' ? 'Tapa' : tipo)),
    datasets: [
      {
        data: this.tiposEmpaque.map((tipo) =>
          this.empaques()
            .filter((e) => e.tipo === tipo)
            .reduce((n, e) => n + e.costo, 0),
        ),
        backgroundColor: this.tiposEmpaque.map((tipo) => COLORES_EMPAQUE[tipo]),
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  }));
  readonly doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    animation:
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? false
        : { duration: 450 },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, padding: 18 } },
      tooltip: {
        backgroundColor: '#172554',
        borderColor: '#60a5fa',
        borderWidth: 1,
        padding: 14,
        cornerRadius: 9,
        callbacks: { label: (ctx) => ` ${ctx.label}: $${Number(ctx.parsed).toFixed(4)}` },
      },
    },
  };
}
