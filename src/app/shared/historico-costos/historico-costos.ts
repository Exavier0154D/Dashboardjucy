import {
  Component,
  NgZone,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { coincideBusqueda } from '../../core/busqueda-texto';

import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { SupabaseService } from '../../core/supabase.service';
import { Producto, Presentacion } from '../../models/producto.model';
import { CostosProduccionService, CostosPresentacion } from '../../core/costos-produccion.service';
import {
  agregarCostosProduccion,
  calcularSerie,
  fechaHistoricaValida,
  CantidadMaterial,
  MaterialBase,
  PrecioSemanal,
} from './historico-calculos';

@Component({
  selector: 'app-historico-costos',
  standalone: true,
  imports: [
    DecimalPipe,
    BaseChartDirective,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatDatepickerModule,
  ],
  providers: [provideNativeDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: 'es-EC' }],
  templateUrl: './historico-costos.html',
  styleUrl: './historico-costos.css',
})
export class HistoricoCostos implements OnInit, OnDestroy {
  // Ampliar este corte cuando se confirmen los siguientes meses de precios.
  readonly fechaLimitePrecios = '2026-09-30';
  readonly modo = input<'materia' | 'producto'>('materia');
  readonly producto = input<Producto | null>(null);
  readonly presentacion = input<Presentacion | null>(null);
  private readonly costosService = inject(CostosProduccionService);
  readonly costos = signal<CostosPresentacion | null>(null);
  readonly costosActuales = computed(() =>
    this.costos()?.presentacionId === this.presentacion()?.id ? this.costos() : null,
  );
  readonly sinFormula = computed(
    () =>
      this.modo() === 'producto' &&
      !!this.presentacion() &&
      this.presentacion()!.items.length === 0,
  );
  readonly hayRegistros = computed(
    () =>
      this.precios().length > 0 ||
      (this.costosActuales()?.manoObra.length ?? 0) > 0 ||
      (this.costosActuales()?.gastosIndirectos.length ?? 0) > 0,
  );
  private readonly db = inject(SupabaseService).client;
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly zona = inject(NgZone);
  readonly materiales = signal<MaterialBase[]>([]);
  private readonly precios = signal<PrecioSemanal[]>([]);
  private readonly cantidades = signal<CantidadMaterial[]>([]);
  readonly materiaId = signal<number | null>(null);
  readonly textoMateria = signal('');
  private readonly filtroMateria = signal('');
  private seleccionInicializada = false;
  readonly materiasSelector = computed(() =>
    this.materiales().filter((m) => coincideBusqueda(this.filtroMateria(), m.nombre)),
  );
  readonly mostrarMateria = (valor: MaterialBase | string | null): string =>
    typeof valor === 'string' ? valor : (valor?.nombre ?? '');
  readonly desde = signal('');
  readonly hasta = signal('');
  fechaCalendario(fecha: string): Date | null {
    if (!fecha) return null;
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Date(anio, mes - 1, dia);
  }
  seleccionarFecha(campo: 'desde' | 'hasta', fecha: Date | null): void {
    this[campo].set(fecha && !Number.isNaN(fecha.getTime())
      ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
      : '');
  }
  readonly cargando = signal(true);
  readonly cargandoProducto = signal(false);
  readonly error = signal<string | null>(null);
  readonly errorProducto = signal<string | null>(null);
  private solicitud = 0;
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private consultando = false;
  private destruido = false;

  readonly semanas = computed(() => {
    const ids = new Set(this.cantidades().map((c) => c.materia_prima_id));
    const fechas = this.precios()
      .filter((p) => this.modo() === 'materia' || ids.has(p.materia_prima_id))
      .map((p) => p.semana);
    if (this.modo() === 'producto') {
      const costos = this.costosActuales();
      fechas.push(...(costos?.manoObra ?? []).map((m) => m.mes));
      // Incluye los cambios de mes para interrumpir el total cuando no hay GIF.
      fechas.push(...(costos?.meses ?? []).map((m) => `${m}-01`));
    }
    return [...new Set(fechas)].filter((fecha) => fecha <= this.fechaLimitePrecios).sort();
  });
  readonly rangoInvalido = computed(
    () =>
      !fechaHistoricaValida(this.desde()) ||
      !fechaHistoricaValida(this.hasta()) ||
      this.desde() > this.hasta(),
  );
  readonly materiaActual = computed(
    () => this.materiales().find((m) => m.id === this.materiaId()) ?? null,
  );
  readonly errorCalculo = computed(() => {
    if (this.cargando() || this.modo() !== 'producto') return null;
    const ids = new Set(this.materiales().map((m) => m.id));
    return this.cantidades().some((c) => !ids.has(c.materia_prima_id))
      ? 'Un ingrediente no tiene precio base accesible. Revisa las materias primas y sus permisos de lectura.'
      : null;
  });
  readonly listo = computed(
    () =>
      !this.cargando() &&
      !this.cargandoProducto() &&
      !this.error() &&
      !this.errorProducto() &&
      !this.errorCalculo() &&
      !this.rangoInvalido() &&
      (this.modo() === 'materia'
        ? !!this.materiaActual()
        : !!this.producto() && !!this.presentacion() && this.cantidades().length > 0),
  );
  readonly serie = computed(() => {
    if (!this.listo()) return [];
    const cantidades =
      this.modo() === 'materia'
        ? [{ materia_prima_id: this.materiaId()!, kg: 1 }]
        : this.cantidades();
    const fechas = [...new Set([...this.semanas(), this.desde(), this.hasta()])].sort();
    return calcularSerie(
      fechas.filter((s) => s >= this.desde() && s <= this.hasta() && s <= this.fechaLimitePrecios),
      cantidades,
      this.materiales(),
      this.precios(),
    );
  });
  readonly serieFinal = computed(() => {
    const costos = this.costosActuales();
    return this.modo() === 'producto' && costos
      ? agregarCostosProduccion(
          this.serie(),
          costos.costoEmpaque,
          costos.manoObra,
          costos.gastosIndirectos,
          costos.costoCarton,
        )
      : [];
  });
  readonly puntosSinManoObra = computed(
    () => this.serieFinal().filter((p) => p.manoObra === null).length,
  );
  readonly puntosSinIndirectos = computed(
    () => this.serieFinal().filter((p) => p.indirectos === null).length,
  );
  readonly resumen = computed(() => {
    const puntos = this.serie();
    if (!puntos.length) return null;
    const inicial = puntos[0].costo,
      ultimo = puntos[puntos.length - 1].costo;
    return {
      inicial,
      ultimo,
      diferencia: ultimo - inicial,
      porcentaje: inicial === 0 ? null : ((ultimo - inicial) / inicial) * 100,
      semanasBase: puntos.filter((p) => p.conBase > 0).length,
    };
  });
  readonly chartData = computed<ChartData<'line'>>(() => ({
    labels: this.serie().map((p) => p.semana.split('-').reverse().join('/')),
    datasets: [
      {
        label: this.modo() === 'materia' ? 'Precio USD/kg' : 'Costo MP USD/presentación',
        data: this.serie().map((p) => p.costo),
        borderColor: '#1d4ed8',
        backgroundColor: (context) => {
          const area = context.chart.chartArea;
          if (!area) return 'rgba(59, 130, 246, 0.12)';
          const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.26)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)');
          return gradient;
        },
        pointBackgroundColor: this.serie().map((p) => (p.conBase > 0 ? '#94a3b8' : '#1d4ed8')),
        pointBorderColor: this.serie().map((p) => (p.conBase > 0 ? '#64748b' : '#1d4ed8')),
        pointRadius: 3,
        pointHoverRadius: 6,
        pointHitRadius: 16,
        borderWidth: 2,
        tension: 0,
        stepped: 'before',
        fill: true,
        spanGaps: false,
      },
    ],
  }));
  readonly chartOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const valores = this.serie().map((p) => p.costo);
    const minimo = valores.length ? Math.min(...valores) : 0;
    const maximo = valores.length ? Math.max(...valores) : 0;
    const margen = Math.max((maximo - minimo) * 0.1, maximo * 0.01, 0.0001);
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation:
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? false
          : { duration: 450 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { usePointStyle: true, padding: 22, color: '#64748b', font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: '#172554',
          borderColor: '#60a5fa',
          borderWidth: 1,
          padding: 14,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) =>
              ctx.parsed.y === null
                ? `${ctx.dataset.label}: sin dato`
                : `${ctx.dataset.label}: $${Number(ctx.parsed.y).toFixed(4)}`,
            afterLabel: (ctx) => {
              const punto = this.serie()[ctx.dataIndex];
              if (!punto) return '';
              const anterior = this.serie()[ctx.dataIndex - 1];
              const cambio = anterior ? punto.costo - anterior.costo : null;
              const variacion =
                cambio === null
                  ? ''
                  : `Cambio: ${cambio > 0 ? '+' : ''}$${cambio.toFixed(4)}${
                      anterior.costo > 0
                        ? ` (${cambio > 0 ? '+' : ''}${((cambio / anterior.costo) * 100).toFixed(2)} %)`
                        : ''
                    } respecto a la fecha anterior`;
              return [
                variacion,
                punto.conBase > 0 ? `${punto.conBase} materia(s) con precio base histórico` : '',
                punto.conAnterior
                  ? `${punto.conAnterior} materia(s) mantienen un precio anterior vigente`
                  : '',
                !punto.conBase && !punto.conAnterior ? 'Precios registrados en esta fecha' : '',
              ].filter(Boolean);
            },
          },
        },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          title: { display: true, text: 'Fecha' },
          ticks: { maxRotation: 45, autoSkip: true },
        },
        y: {
          border: { display: false },
          grid: { color: '#eef2f6' },
          beginAtZero: false,
          min: Math.max(0, minimo - margen),
          max: maximo + margen,
          title: { display: true, text: 'Costo (USD)' },
          ticks: { callback: (valor) => `$${valor}` },
        },
      },
    };
  });

  constructor() {
    effect((onCleanup) => {
      const modo = this.modo(),
        producto = this.producto(),
        presentacion = this.presentacion();
      const solicitud = ++this.solicitud;
      onCleanup(() => {
        if (this.solicitud === solicitud) this.solicitud++;
      });
      this.cantidades.set([]);
      this.costos.set(null);
      this.errorProducto.set(null);
      this.cargandoProducto.set(false);
      if (this.navegador && modo === 'producto' && producto && presentacion) {
        this.cargandoProducto.set(true);
        void this.cargarCantidades(presentacion.id, solicitud);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.navegador) return;
    await this.cargarDatos();
    if (!this.destruido)
      this.temporizador = this.zona.runOutsideAngular(() =>
        setInterval(() => {
          if (!document.hidden)
            this.zona.run(() => {
              void this.cargarDatos(true);
            });
        }, 15000),
      );
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.solicitud++;
    if (this.temporizador !== null) clearInterval(this.temporizador);
  }

  // Paginación para evitar el límite de filas de Supabase.
  private async todasLasFilas(tabla: string, columnas: string): Promise<Record<string, unknown>[]> {
    const filas: Record<string, unknown>[] = [];
    let inicio = 0;
    while (true) {
      const { data, error, count } = await this.db
        .from(tabla)
        .select(columnas, { count: 'exact' })
        .order('id')
        .range(inicio, inicio + 499);
      if (error) throw error;
      if (data === null || count === null) throw new Error(`Respuesta incompleta de ${tabla}.`);
      const pagina = data as unknown as Record<string, unknown>[];
      filas.push(...pagina);
      inicio += pagina.length;
      if (inicio >= count) return filas;
      if (!pagina.length) throw new Error(`La lectura de ${tabla} se interrumpió.`);
    }
  }

  async cargarDatos(silencioso = false): Promise<void> {
    if (this.consultando || this.destruido) return;
    this.consultando = true;
    const solicitud = this.solicitud;
    const producto = this.producto(),
      presentacion = this.presentacion();
    const semanasAnteriores = this.semanas();
    const hastaAnterior = semanasAnteriores[semanasAnteriores.length - 1];
    if (!silencioso) this.cargando.set(true);
    this.error.set(null);
    try {
      const [materias, precios] = await Promise.all([
        this.todasLasFilas('materia_prima', 'id,nombre,costo_kg,costo_base_historico'),
        this.todasLasFilas('precio_historico', 'id,materia_prima_id,semana,costo_kg'),
      ]);
      if (
        materias.some((m) => m['costo_kg'] == null) ||
        precios.some((p) => p['costo_kg'] == null)
      ) {
        throw new Error('Hay materias primas o registros históricos sin precio.');
      }
      const materiales: MaterialBase[] = materias.map((m) => ({
        id: Number(m['id']),
        nombre: String(m['nombre']),
        costo_kg: Number(m['costo_base_historico'] ?? m['costo_kg']),
      }));
      const historicos: PrecioSemanal[] = precios
        .filter((p) => String(p['semana']) <= this.fechaLimitePrecios)
        .map((p) => ({
          materia_prima_id: Number(p['materia_prima_id']),
          semana: String(p['semana']),
          costo_kg: Number(p['costo_kg']),
        }));
      if (
        materiales.some((m) => !Number.isFinite(m.costo_kg) || m.costo_kg < 0) ||
        historicos.some(
          (p) => !Number.isFinite(p.costo_kg) || p.costo_kg < 0 || !fechaHistoricaValida(p.semana),
        )
      ) {
        throw new Error('Hay precios o fechas inválidos en Supabase.');
      }
      // Detecta duplicados antes de mostrarlos en los gráficos.
      calcularSerie([], [], materiales, historicos);
      if (this.destruido) return;
      this.materiales.set(materiales.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      this.precios.set(historicos);
      if (!this.seleccionInicializada) {
        this.seleccionInicializada = true;
        const primera = materiales[0];
        if (primera) this.seleccionarMateria(primera);
      } else if (this.materiaId() !== null && !materiales.some((m) => m.id === this.materiaId())) {
        this.limpiarSelectorMateria();
      } else if (this.materiaId() !== null) {
        this.textoMateria.set(materiales.find((m) => m.id === this.materiaId())!.nombre);
      }
      if (
        solicitud === this.solicitud &&
        this.modo() === 'producto' &&
        producto &&
        presentacion &&
        !this.cargandoProducto()
      ) {
        this.errorProducto.set(null);
        if (!silencioso) this.cargandoProducto.set(true);
        await this.cargarCantidades(presentacion.id, solicitud);
      }
      const semanas = this.semanas();
      if (!this.desde() || this.desde() === semanasAnteriores[0]) this.desde.set(semanas[0] ?? '');
      if (!this.hasta() || this.hasta() === hastaAnterior)
        this.hasta.set(semanas[semanas.length - 1] ?? '');
    } catch (e) {
      if (!this.destruido && solicitud === this.solicitud) this.error.set(this.mensajeError(e));
    } finally {
      this.consultando = false;
      if (!this.destruido) this.cargando.set(false);
    }
  }

  private async cargarCantidades(presentacionId: number, solicitud: number): Promise<void> {
    try {
      const costos = await this.costosService.cargar(presentacionId);
      const filas: CantidadMaterial[] = [];
      let inicio = 0;
      while (true) {
        const { data, error, count } = await this.db
          .from('presentacion_item')
          .select('materia_prima_id,kg', { count: 'exact' })
          .eq('presentacion_id', presentacionId)
          .order('materia_prima_id')
          .range(inicio, inicio + 499);
        if (error) throw error;
        if (data === null || count === null)
          throw new Error('Respuesta incompleta de las cantidades del SKU.');
        for (const item of data) {
          if (item.kg == null || item.materia_prima_id == null)
            throw new Error('Hay ingredientes sin kg o sin ID.');
          const kg = Number(item.kg),
            id = Number(item.materia_prima_id);
          if (!Number.isFinite(kg) || kg < 0 || !Number.isSafeInteger(id) || id <= 0)
            throw new Error('Hay cantidades o IDs inválidos.');
          filas.push({ materia_prima_id: id, kg });
        }
        inicio += data.length;
        if (inicio >= count) break;
        if (!data.length) throw new Error('La lectura de ingredientes se interrumpió.');
      }
      if (!filas.length && !this.sinFormula())
        throw new Error('Esta presentación no tiene ingredientes registrados.');
      if (solicitud === this.solicitud && !this.destruido) {
        const anteriores = this.semanas();
        this.cantidades.set(filas);
        this.costos.set(costos);
        const fechas = this.semanas();
        if (!this.desde() || this.desde() === anteriores[0]) this.desde.set(fechas[0] ?? '');
        if (!this.hasta() || this.hasta() === anteriores[anteriores.length - 1]) {
          this.hasta.set(fechas[fechas.length - 1] ?? '');
        }
      }
    } catch (e) {
      if (solicitud === this.solicitud) this.errorProducto.set(this.mensajeError(e));
    } finally {
      if (solicitud === this.solicitud) this.cargandoProducto.set(false);
    }
  }

  prepararBusquedaMateria(): void {
    this.filtroMateria.set(this.materiaId() === null ? this.textoMateria() : '');
  }

  buscarMateria(valor: string): void {
    this.textoMateria.set(valor);
    this.filtroMateria.set(valor);
    // Mientras se escribe, no se muestra el gráfico de la materia anterior.
    this.materiaId.set(null);
  }

  seleccionarMateria(materia: MaterialBase): void {
    this.materiaId.set(materia.id);
    this.textoMateria.set(materia.nombre);
    this.filtroMateria.set('');
  }

  limpiarSelectorMateria(): void {
    this.materiaId.set(null);
    this.textoMateria.set('');
    this.filtroMateria.set('');
  }
  private mensajeError(e: unknown): string {
    return e && typeof e === 'object' && 'message' in e
      ? String(e.message)
      : 'No se pudo consultar el histórico.';
  }
}
