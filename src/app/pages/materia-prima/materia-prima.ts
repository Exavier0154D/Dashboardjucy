import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { CATEGORIAS_PRODUCTO, Presentacion, Producto } from '../../models/producto.model';
import { DataService } from '../../core/data.service';
import { SelectionService } from '../../core/selection.service';
import { coincideBusqueda } from '../../core/busqueda-texto';
import { Estandar } from '../estandar/estandar';
import { HistoricoCostos } from '../../shared/historico-costos/historico-costos';

type Vista = 'productos' | 'materias';

@Component({
  selector: 'app-materia-prima',
  imports: [DatePipe, DecimalPipe, MatCardModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatTableModule,
    BaseChartDirective, Estandar, HistoricoCostos],
  templateUrl: './materia-prima.html',
  styleUrl: './materia-prima.css'
})
export class MateriaPrima {
  private readonly data = inject(DataService);
  private readonly selectionService = inject(SelectionService);
  readonly productos = this.data.productos.asReadonly();
  readonly materiasPrimas = this.data.materiasPrimas.asReadonly();
  readonly cargando = this.data.cargando.asReadonly();
  readonly cargado = this.data.cargado.asReadonly();
  readonly errorCarga = this.data.error.asReadonly();
  readonly productoSeleccionado = this.selectionService.productoSeleccionado;
  readonly presentacionSeleccionada = this.selectionService.presentacionSeleccionada;
  readonly vista = signal<Vista>('productos');
  readonly textoBusquedaProducto = signal('');
  readonly categoriaSeleccionada = signal('Todas');
  readonly marcaSeleccionada = signal('Todas');
  readonly tecnologiaSeleccionada = signal('Todas');
  readonly textoBusqueda = signal('');
  private readonly seleccionTarjetas = signal<Record<string, number>>({});

  readonly totalSku = computed(() => this.productos().reduce((n, p) => n + p.presentaciones.length, 0));
  readonly marcas = computed(() => [...new Set(this.productos().map(p => p.marca))].sort((a, b) => a.localeCompare(b, 'es')));
  readonly tecnologias = computed(() => [...new Set(this.productos().flatMap(p => p.presentaciones.map(s => s.tecnologia)))].sort());
  readonly categoriasConConteo = computed(() => [
    { nombre: 'Todas', total: this.productos().length },
    ...CATEGORIAS_PRODUCTO.map(nombre => ({ nombre, total: this.productos().filter(p => p.categoria === nombre).length }))
      .filter(c => c.total > 0)
  ]);

  readonly productosFiltrados = computed(() => this.productos().filter(p => {
    if (this.categoriaSeleccionada() !== 'Todas' && p.categoria !== this.categoriaSeleccionada()) return false;
    if (this.marcaSeleccionada() !== 'Todas' && p.marca !== this.marcaSeleccionada()) return false;
    const skus = this.presentacionesVisibles(p);
    if (this.tecnologiaSeleccionada() !== 'Todas' && !skus.length) return false;
    const texto = this.textoBusquedaProducto();
    const campos = [p.nombre, p.categoria, p.marca, p.variante];
    return skus.length
      ? skus.some(s => coincideBusqueda(texto, ...campos, s.nombreSku, s.codigoBarras ?? '',
        s.tecnologia, this.etiquetaPresentacion(s), s.litros.toString()))
      : coincideBusqueda(texto, ...campos);
  }));
  readonly skuFiltrados = computed(() => this.productosFiltrados().reduce((n, p) => n + this.presentacionesVisibles(p).length, 0));

  actualizarAhora(): void { void this.data.actualizarAhora(); }
  cambiarVista(vista: Vista): void { this.vista.set(vista); }
  buscarProducto(valor: string): void { this.textoBusquedaProducto.set(valor); }
  filtrarPorCategoria(categoria: string): void { this.categoriaSeleccionada.set(categoria); }
  limpiarFiltrosProducto(): void {
    this.textoBusquedaProducto.set('');
    this.categoriaSeleccionada.set('Todas');
    this.marcaSeleccionada.set('Todas');
    this.tecnologiaSeleccionada.set('Todas');
  }
  claseCategoria(categoria: string): string {
    return `cat-${Math.max(CATEGORIAS_PRODUCTO.findIndex(c => c === categoria), 0) % 6}`;
  }
  presentacionesVisibles(producto: Producto): Presentacion[] {
    return producto.presentaciones.filter(s => this.tecnologiaSeleccionada() === 'Todas' || s.tecnologia === this.tecnologiaSeleccionada());
  }
  presentacionTarjeta(producto: Producto): Presentacion | null {
    const skus = this.presentacionesVisibles(producto);
    const elegida = skus.find(s => s.id === this.seleccionTarjetas()[producto.id]);
    if (elegida) return elegida;
    // Buscar un código de barras abre inicialmente su SKU, aunque no sea el primer tamaño.
    return skus.find(s => coincideBusqueda(this.textoBusquedaProducto(), producto.nombre,
      producto.categoria, producto.marca, producto.variante, s.nombreSku,
      s.codigoBarras ?? '', s.tecnologia, this.etiquetaPresentacion(s), s.litros.toString())) ?? skus[0] ?? null;
  }
  elegirPresentacionTarjeta(producto: Producto, presentacion: Presentacion): void {
    if (!producto.presentaciones.some(s => s.id === presentacion.id)) return;
    this.seleccionTarjetas.update(actual => ({ ...actual, [producto.id]: presentacion.id }));
  }
  etiquetaPresentacion(presentacion: Presentacion): string {
    const ml = Number((presentacion.litros * 1000).toFixed(3));
    return `${ml.toLocaleString('es-EC', { maximumFractionDigits: 3 })} ml · ${presentacion.tecnologia}`;
  }
  seleccionarProducto(producto: Producto): void {
    const sku = this.presentacionTarjeta(producto);
    if (!sku) return;
    this.selectionService.seleccionarProducto(producto, sku);
    this.vista.set('productos');
  }
  elegirPresentacionSeleccionada(presentacion: Presentacion): void {
    this.selectionService.seleccionarPresentacion(presentacion);
  }
  volverProductos(): void {
    this.selectionService.limpiarSeleccion();
    this.vista.set('productos');
  }
  buscarMateriaPrima(valor: string): void { this.textoBusqueda.set(valor); }
  limpiarBusquedaMateriaPrima(): void { this.textoBusqueda.set(''); }
  readonly materiasPrimasFiltradas = computed(() => this.materiasPrimas().filter(m =>
    coincideBusqueda(this.textoBusqueda(), m.nombre, m.unidad)
  ));
  readonly productosPorMateriaPrima = computed(() => {
    const resultado = new Map<number, string[]>();
    for (const producto of this.productos()) {
      const materias = new Set(producto.presentaciones.flatMap(s => s.ingredientes.map(i => i.materiaPrimaId)));
      for (const materiaId of materias) {
        resultado.set(materiaId, [...(resultado.get(materiaId) ?? []), producto.nombre]);
      }
    }
    return resultado;
  });
  listaProductosMateriaPrima(materiaId: number): string[] {
    return this.productosPorMateriaPrima().get(materiaId) ?? [];
  }
  readonly displayedColumns = ['nombre', 'unidad', 'costoKg', 'productos'];

  readonly totalMateriasPrimas =
    computed(() => this.materiasPrimas().length);
  readonly costoPromedio = computed(() => {
    const materias = this.materiasPrimas();
    if (materias.length === 0) {
      return 0;
    }
    const total =
      materias.reduce((sum, materia) => sum + materia.costoKg, 0);
    return total / materias.length;
  });
  readonly materiaPrimaMasCara = computed(() => {
    const materias = this.materiasPrimas();
    if (materias.length === 0) {
      return null;
    }
    return materias.reduce((mayor, actual) =>
      actual.costoKg > mayor.costoKg ? actual : mayor
    );
  });
  readonly materiaPrimaMasBarata = computed(() => {
    const materias = this.materiasPrimas();
    if (materias.length === 0) {
      return null;
    }
    return materias.reduce((menor, actual) =>
      actual.costoKg < menor.costoKg ? actual : menor
    );
  });
  // ============================================================
  // BARRA DE COSTO
  // ============================================================
  readonly costoMaximo = computed(() =>
    this.materiasPrimas().reduce(
      (max, materia) => Math.max(max, materia.costoKg),
      0
    )
  );
  porcentajeCosto(costo: number): number {
    const max = this.costoMaximo();
    return max > 0 ? (costo / max) * 100 : 0;
  }
  // ============================================================
  // GRÁFICO
  // ============================================================
  readonly barChartType = 'bar' as const;
  readonly barChartData = computed<ChartData<'bar'>>(() => {
    const materias =
      [...this.materiasPrimas()]
        .sort((a, b) => b.costoKg - a.costoKg)
        .slice(0, 15);
    return {
      labels: materias.map(materia => materia.nombre),
      datasets: [
        {
          data: materias.map(materia => materia.costoKg),
          label: 'Costo / kg',
          backgroundColor: '#1d4ed8',
          hoverBackgroundColor: '#1e40af',
          borderRadius: 6,
          barThickness: 18
        }
      ]
    };
  });
  readonly barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: ctx =>
            ` $${Number(ctx.parsed.x).toFixed(4)} / kg`
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          callback: valor => `$${valor}`
        }
      },
      y: {
        grid: {
          display: false
        },
        ticks: {
          callback: function (valor) {
            const etiqueta =
              this.getLabelForValue(Number(valor));
            return etiqueta.length > 28
              ? etiqueta.slice(0, 27) + '…'
              : etiqueta;
          }
        }
      }
    }
  };
}
