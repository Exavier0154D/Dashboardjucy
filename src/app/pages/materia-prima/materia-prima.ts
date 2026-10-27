import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { CATEGORIAS_PRODUCTO, Presentacion, Producto } from '../../models/producto.model';
import { DataService } from '../../core/data.service';
import { SelectionService } from '../../core/selection.service';
import { coincideBusqueda } from '../../core/busqueda-texto';
import { mesActualEcuador } from '../../core/costos-calculos';
import { agruparEnvases, catalogoEnvases, GrupoEnvase } from '../../core/catalogo-envases';
import { TIPOS_EMPAQUE } from '../../models/empaque.model';
import { Estandar } from '../estandar/estandar';
import { HistoricoCostos } from '../../shared/historico-costos/historico-costos';

type Vista = 'productos' | 'materias';

@Component({
  selector: 'app-materia-prima',
  imports: [
    DecimalPipe,
    FormsModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    BaseChartDirective,
    Estandar,
    HistoricoCostos,
  ],
  templateUrl: './materia-prima.html',
  styleUrl: './materia-prima.css',
})
export class MateriaPrima {
  private readonly data = inject(DataService);
  private readonly selectionService = inject(SelectionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly productos = this.data.productos.asReadonly();
  readonly materiasPrimas = this.data.materiasPrimas.asReadonly();
  readonly cargando = this.data.cargando.asReadonly();
  readonly cargado = this.data.cargado.asReadonly();
  readonly errorCarga = this.data.error.asReadonly();
  readonly productoSeleccionado = this.selectionService.productoSeleccionado;
  readonly presentacionSeleccionada = this.selectionService.presentacionSeleccionada;
  readonly mesConsulta = computed(
    () => this.selectionService.mesCostosSeleccionado() || mesActualEcuador(),
  );
  readonly anioConsulta = computed(() => this.mesConsulta().slice(0, 4));
  readonly numeroMesConsulta = computed(() => this.mesConsulta().slice(5, 7));
  readonly aniosConsulta = computed(() => {
    const anios = [
      ...this.data.mesesPreciosDisponibles(),
      this.mesConsulta(),
      mesActualEcuador(),
    ].map((mes) => Number(mes.slice(0, 4)));
    return Array.from({ length: Math.max(...anios) - Math.min(...anios) + 1 }, (_, indice) =>
      String(Math.min(...anios) + indice),
    ).reverse();
  });
  readonly mesesConsulta = Array.from({ length: 12 }, (_, indice) => ({
    numero: String(indice + 1).padStart(2, '0'),
    nombre: new Intl.DateTimeFormat('es-EC', { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, indice, 1)),
    ),
  }));

  cambiarAnioConsulta(anio: string): void {
    this.selectionService.seleccionarMesCostos(`${anio}-${this.numeroMesConsulta()}`);
  }

  cambiarMesConsulta(mes: string): void {
    this.selectionService.seleccionarMesCostos(`${this.anioConsulta()}-${mes}`);
  }
  readonly vista = signal<Vista>('productos');
  readonly tipoMaterial = signal<'ingredientes' | 'envases'>('ingredientes');
  readonly tipoEnvase = signal('Todos');
  readonly estadoEnvase = signal('Todos');
  readonly paginaEnvases = signal(1);
  readonly mostrarAnalisis = signal(false);
  readonly tiposEnvase = TIPOS_EMPAQUE;
  readonly envases = computed(() => catalogoEnvases(this.productos(), this.data.empaques()));
  readonly gruposEnvases = computed(() => agruparEnvases(this.envases()));
  readonly grupoEnvaseAbierto = signal<string | null>(null);
  readonly envasesPendientes = computed(
    () => this.envases().filter((e) => e.precio === null).length,
  );
  readonly envasesFiltrados = computed(() =>
    this.envases().filter(
      (e) =>
        (this.tipoEnvase() === 'Todos' || e.empaque.tipo === this.tipoEnvase()) &&
        (this.estadoEnvase() === 'Todos' || e.empaque.estado === this.estadoEnvase()) &&
        coincideBusqueda(
          this.textoBusqueda(),
          e.empaque.tipo,
          e.empaque.tipo === 'Tap' ? 'Tapa' : e.empaque.tipo,
          e.producto.nombre,
          e.producto.marca,
          e.presentacion.nombreSku,
          e.presentacion.codigoBarras ?? '',
          this.etiquetaPresentacion(e.presentacion),
        ),
    ),
  );
  readonly paginasEnvases = computed(() =>
    Math.max(1, Math.ceil(this.gruposEnvasesFiltrados().length / 20)),
  );
  readonly paginaEnvasesActual = computed(() =>
    Math.min(this.paginaEnvases(), this.paginasEnvases()),
  );
  readonly envasesPagina = computed(() =>
    this.gruposEnvasesFiltrados().slice(
      (this.paginaEnvasesActual() - 1) * 20,
      this.paginaEnvasesActual() * 20,
    ),
  );
  readonly gruposEnvasesFiltrados = computed(() => agruparEnvases(this.envasesFiltrados()));

  alternarGrupoEnvase(id: string): void {
    this.grupoEnvaseAbierto.update((actual) => (actual === id ? null : id));
  }
  etiquetaGrupoEnvase(grupo: GrupoEnvase): string {
    return `${Number((grupo.litros * 1000).toFixed(3)).toLocaleString('es-EC', { maximumFractionDigits: 3 })} ml`;
  }

  constructor() {
    if (this.route.snapshot.data['vista'] === 'materias') {
      this.vista.set('materias');
      this.selectionService.limpiarSeleccion();
    }
  }

  cambiarTipoMaterial(tipo: 'ingredientes' | 'envases'): void {
    this.tipoMaterial.set(tipo);
    this.textoBusqueda.set('');
    this.paginaEnvases.set(1);
    this.grupoEnvaseAbierto.set(null);
  }
  filtrarEnvases(tipo: string, estado: string): void {
    this.tipoEnvase.set(tipo);
    this.estadoEnvase.set(estado);
    this.paginaEnvases.set(1);
    this.grupoEnvaseAbierto.set(null);
  }
  abrirEnvase(fila: ReturnType<typeof catalogoEnvases>[number]): void {
    this.selectionService.seleccionarProducto(fila.producto, fila.presentacion);
    void this.router.navigate(['/materia-prima']);
  }
  elegirPresentacionPorId(producto: Producto, id: string): void {
    const presentacion = producto.presentaciones.find((p) => p.id === Number(id));
    if (presentacion) this.elegirPresentacionTarjeta(producto, presentacion);
  }
  readonly textoBusquedaProducto = signal('');
  readonly categoriaSeleccionada = signal('Todas');
  readonly marcaSeleccionada = signal('Todas');
  readonly tecnologiaSeleccionada = signal('Todas');
  readonly textoBusqueda = signal('');
  private readonly seleccionTarjetas = signal<Record<string, number>>({});

  readonly totalSku = computed(() =>
    this.productos().reduce((n, p) => n + p.presentaciones.length, 0),
  );
  readonly marcas = computed(() =>
    [...new Set(this.productos().map((p) => p.marca))].sort((a, b) => a.localeCompare(b, 'es')),
  );
  readonly tecnologias = computed(() =>
    [...new Set(this.productos().flatMap((p) => p.presentaciones.map((s) => s.tecnologia)))].sort(),
  );
  readonly categoriasConConteo = computed(() => [
    { nombre: 'Todas', total: this.productos().length },
    ...CATEGORIAS_PRODUCTO.map((nombre) => ({
      nombre,
      total: this.productos().filter((p) => p.categoria === nombre).length,
    })).filter((c) => c.total > 0),
  ]);

  readonly productosFiltrados = computed(() =>
    this.productos().filter((p) => {
      if (this.categoriaSeleccionada() !== 'Todas' && p.categoria !== this.categoriaSeleccionada())
        return false;
      if (this.marcaSeleccionada() !== 'Todas' && p.marca !== this.marcaSeleccionada())
        return false;
      const skus = this.presentacionesVisibles(p);
      if (this.tecnologiaSeleccionada() !== 'Todas' && !skus.length) return false;
      const texto = this.textoBusquedaProducto();
      const campos = [p.nombre, p.categoria, p.marca, p.variante];
      return skus.length
        ? skus.some((s) =>
            coincideBusqueda(
              texto,
              ...campos,
              s.nombreSku,
              s.codigoBarras ?? '',
              s.tecnologia,
              this.etiquetaPresentacion(s),
              s.litros.toString(),
            ),
          )
        : coincideBusqueda(texto, ...campos);
    }),
  );
  readonly skuFiltrados = computed(() =>
    this.productosFiltrados().reduce((n, p) => n + this.presentacionesVisibles(p).length, 0),
  );

  actualizarAhora(): void {
    void this.data.actualizarAhora();
  }
  cambiarVista(vista: Vista): void {
    this.vista.set(vista);
  }
  buscarProducto(valor: string): void {
    this.textoBusquedaProducto.set(valor);
  }
  filtrarPorCategoria(categoria: string): void {
    this.categoriaSeleccionada.set(categoria);
  }
  limpiarFiltrosProducto(): void {
    this.textoBusquedaProducto.set('');
    this.categoriaSeleccionada.set('Todas');
    this.marcaSeleccionada.set('Todas');
    this.tecnologiaSeleccionada.set('Todas');
  }
  claseCategoria(categoria: string): string {
    return `cat-${
      Math.max(
        CATEGORIAS_PRODUCTO.findIndex((c) => c === categoria),
        0,
      ) % 6
    }`;
  }
  presentacionesVisibles(producto: Producto): Presentacion[] {
    return producto.presentaciones.filter(
      (s) =>
        this.tecnologiaSeleccionada() === 'Todas' || s.tecnologia === this.tecnologiaSeleccionada(),
    );
  }
  presentacionTarjeta(producto: Producto): Presentacion | null {
    const skus = this.presentacionesVisibles(producto);
    const elegida = skus.find((s) => s.id === this.seleccionTarjetas()[producto.id]);
    if (elegida) return elegida;
    // Buscar un código de barras abre inicialmente su SKU, aunque no sea el primer tamaño.
    return (
      skus.find((s) =>
        coincideBusqueda(
          this.textoBusquedaProducto(),
          producto.nombre,
          producto.categoria,
          producto.marca,
          producto.variante,
          s.nombreSku,
          s.codigoBarras ?? '',
          s.tecnologia,
          this.etiquetaPresentacion(s),
          s.litros.toString(),
        ),
      ) ??
      skus[0] ??
      null
    );
  }
  tituloTarjeta(producto: Producto): string {
    if (producto.categoria !== 'Agua de Coco') return producto.variante;
    return /pitahaya|pithaya/i.test(producto.variante)
      ? 'Agua de Coco y Pitahaya'
      : 'Agua de Coco';
  }
  subtituloTarjeta(producto: Producto): string {
    return producto.categoria === 'Agua de Coco'
      ? `Agua de Coco · ${producto.marca}`
      : producto.nombre;
  }
  elegirPresentacionTarjeta(producto: Producto, presentacion: Presentacion): void {
    if (!producto.presentaciones.some((s) => s.id === presentacion.id)) return;
    this.seleccionTarjetas.update((actual) => ({ ...actual, [producto.id]: presentacion.id }));
  }
  etiquetaPresentacion(presentacion: Presentacion): string {
    const ml = Number((presentacion.litros * 1000).toFixed(3));
    return `${ml.toLocaleString('es-EC', { maximumFractionDigits: 3 })} ml · ${presentacion.tecnologia}`;
  }
  seleccionarProducto(producto: Producto): void {
    const sku = this.presentacionTarjeta(producto);
    if (!sku) return;
    this.selectionService.seleccionarMesCostos(this.mesConsulta());
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
  buscarMateriaPrima(valor: string): void {
    this.textoBusqueda.set(valor);
    this.paginaEnvases.set(1);
    this.grupoEnvaseAbierto.set(null);
  }
  limpiarBusquedaMateriaPrima(): void {
    this.textoBusqueda.set('');
  }
  readonly materiasPrimasFiltradas = computed(() =>
    this.materiasPrimas().filter((m) => coincideBusqueda(this.textoBusqueda(), m.nombre, m.unidad)),
  );
  readonly productosPorMateriaPrima = computed(() => {
    const resultado = new Map<number, string[]>();
    for (const producto of this.productos()) {
      const materias = new Set(
        producto.presentaciones.flatMap((s) => s.ingredientes.map((i) => i.materiaPrimaId)),
      );
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

  readonly totalMateriasPrimas = computed(() => this.materiasPrimas().length);
  readonly costoPromedio = computed(() => {
    const materias = this.materiasPrimas();
    if (materias.length === 0) {
      return 0;
    }
    const total = materias.reduce((sum, materia) => sum + materia.costoKg, 0);
    return total / materias.length;
  });
  readonly materiaPrimaMasCara = computed(() => {
    const materias = this.materiasPrimas();
    if (materias.length === 0) {
      return null;
    }
    return materias.reduce((mayor, actual) => (actual.costoKg > mayor.costoKg ? actual : mayor));
  });
  readonly materiaPrimaMasBarata = computed(() => {
    const materias = this.materiasPrimas();
    if (materias.length === 0) {
      return null;
    }
    return materias.reduce((menor, actual) => (actual.costoKg < menor.costoKg ? actual : menor));
  });
  // ============================================================
  // BARRA DE COSTO
  // ============================================================
  readonly costoMaximo = computed(() =>
    this.materiasPrimas().reduce((max, materia) => Math.max(max, materia.costoKg), 0),
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
    const materias = [...this.materiasPrimas()].sort((a, b) => b.costoKg - a.costoKg).slice(0, 15);
    return {
      labels: materias.map((materia) => materia.nombre),
      datasets: [
        {
          data: materias.map((materia) => materia.costoKg),
          label: 'Costo / kg',
          backgroundColor: '#1d4ed8',
          hoverBackgroundColor: '#1e40af',
          borderRadius: 6,
          barThickness: 18,
        },
      ],
    };
  });
  readonly barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` $${Number(ctx.parsed.x).toFixed(4)} / kg`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          callback: (valor) => `$${valor}`,
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          callback: function (valor) {
            const etiqueta = this.getLabelForValue(Number(valor));
            return etiqueta.length > 28 ? etiqueta.slice(0, 27) + '…' : etiqueta;
          },
        },
      },
    },
  };
}
