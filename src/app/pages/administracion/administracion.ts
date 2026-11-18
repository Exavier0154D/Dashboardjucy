import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { A11yModule } from '@angular/cdk/a11y';
import { DataService } from '../../core/data.service';
import {
  CostosEstandarService,
  RUBROS_ESTANDAR,
  validarCostosEstandar,
  mesCostoValido,
} from '../../core/costos-estandar.service';
import { CostosProduccionService } from '../../core/costos-produccion.service';
import { resolverManoObra, mesActualEcuador } from '../../core/costos-calculos';
import { resolverGastosIndirectos } from '../../core/gastos-indirectos-calculos';
import { DESPLEGABLES_SCROLL_PROVIDERS } from '../../core/desplegables-scroll';
import { TIPOS_EMPAQUE } from '../../models/empaque.model';
import { coincideBusqueda } from '../../core/busqueda-texto';
import {
  precioUnitarioCarton,
  precioUnitarioEnvase,
  unidadesPaqueteEnvase,
  unidadesPorCarton,
} from '../../core/precio-envase';
import {
  CatalogoAdminService,
  CatalogoAdmin,
  EmpaqueDB,
  FilaFormula,
  HistorialDB,
  MateriaDB,
  PresentacionDB,
  ProductoDB,
  validarFilas,
  versionSku,
} from '../../core/catalogo-admin.service';

type Pestana = 'productos' | 'materias' | 'empaques' | 'presentaciones' | 'historial' | 'estandar';
function texto(valor = '', requerido = true) {
  return new FormControl(valor, {
    nonNullable: true,
    validators: requerido ? [Validators.required] : [],
  });
}
function numero(valor = 0, max?: number) {
  return new FormControl(valor, {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.min(0),
      ...(max === undefined ? [] : [Validators.max(max)]),
    ],
  });
}
function costoEstandar() {
  return new FormControl<number | null>(null, [Validators.required, Validators.min(0)]);
}
function filaFormula(f?: FilaFormula) {
  return new FormGroup({
    materia_prima_id: new FormControl<number | null>(
      f?.materia_prima_id ?? null,
      Validators.required,
    ),
    porcentaje: numero(f?.porcentaje ?? 0, 100),
    kg: numero(f?.kg ?? 0),
    litros: numero(f?.litros ?? 0),
    costo_original: new FormControl<number | null>(f?.costo_original ?? null, Validators.min(0)),
  });
}
const vacio: CatalogoAdmin = {
  materias: [],
  productos: [],
  presentaciones: [],
  formulas: [],
  items: [],
  empaques: [],
};

@Component({
  selector: 'app-administracion',
  providers: DESPLEGABLES_SCROLL_PROVIDERS,
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, MatIconModule, MatSelectModule, A11yModule],
  templateUrl: './administracion.html',
  styleUrls: [
    './administracion.css',
    './administracion-dashboard.css',
    './administracion-catalogo.css',
  ],
})
export class Administracion implements OnInit, OnDestroy {
  private readonly api = inject(CatalogoAdminService);
  private readonly data = inject(DataService);
  readonly estandares = inject(CostosEstandarService);
  private readonly produccion = inject(CostosProduccionService);
  readonly rubrosEstandar = RUBROS_ESTANDAR;
  readonly skuEstandar = signal<number | null>(null);
  readonly busquedaSkuEstandar = signal('');
  readonly mostrarSkuEstandar = (id: number | null): string => {
    const p = this.skuPorId().get(id ?? 0);
    return p ? `${this.nombreProducto(p.producto_id)} · ${p.litros} L · ${p.tecnologia}` : '';
  };
  private temporizadorBusqueda?: ReturnType<typeof setTimeout>;
  buscarSkuParaCostos(valor: string): void {
    if (this.guardando()) return;
    clearTimeout(this.temporizadorBusqueda);
    this.busquedaSkuEstandar.set(valor);
    const opciones = this.opcionesSkuEstandar();
    if (
      (!valor.trim() && !this.categoriaSkuEstandar()) ||
      opciones.length !== 1 ||
      opciones[0].id === this.skuEstandar() ||
      this.formEstandar.dirty
    )
      return;
    const id = opciones[0].id;
    this.temporizadorBusqueda = setTimeout(() => {
      if (
        !this.destruido &&
        !this.guardando() &&
        !this.formEstandar.dirty &&
        this.opcionesSkuEstandar().length === 1 &&
        this.opcionesSkuEstandar()[0].id === id &&
        this.skuEstandar() !== id
      ) {
        void this.seleccionarEstandar(id);
      }
    }, 300);
  }
  readonly categoriaSkuEstandar = signal('');
  cambiarCategoriaCostos(categoria: string): void {
    if (this.guardando()) return;
    this.categoriaSkuEstandar.set(categoria);
    this.buscarSkuParaCostos(this.busquedaSkuEstandar());
  }
  readonly marcaSkuEstandar = signal('');
  readonly tecnologiaSkuEstandar = signal('');
  readonly categoriasSkuEstandar = computed(() =>
    [
      ...new Set(
        this.productos()
          .map((p) => p.categoria)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es')),
  );
  readonly marcasSkuEstandar = computed(() =>
    [
      ...new Set(
        this.productos()
          .map((p) => p.marca)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es')),
  );
  readonly tecnologiasSkuEstandar = computed(() =>
    [
      ...new Set(
        this.presentaciones()
          .map((p) => p.tecnologia)
          .filter(Boolean),
      ),
    ].sort(),
  );
  readonly opcionesSkuEstandar = computed(() =>
    this.presentaciones().filter((p) => {
      const producto = this.productosPorId().get(p.producto_id);
      return (
        (!this.categoriaSkuEstandar() || producto?.categoria === this.categoriaSkuEstandar()) &&
        (!this.marcaSkuEstandar() || producto?.marca === this.marcaSkuEstandar()) &&
        (!this.tecnologiaSkuEstandar() || p.tecnologia === this.tecnologiaSkuEstandar()) &&
        coincideBusqueda(
          this.busquedaSkuEstandar(),
          producto?.nombre ?? '',
          producto?.marca ?? '',
          producto?.variante ?? '',
          producto?.categoria ?? '',
          p.nombre_sku ?? '',
          p.clave_sku ?? '',
          p.codigo_barras ?? '',
          p.tecnologia ?? '',
          `${p.litros} L`,
          `${p.litros * 1000} ml`,
        )
      );
    }),
  );
  readonly seleccionFueraFiltroEstandar = computed(
    () =>
      this.skuEstandar() !== null &&
      !this.opcionesSkuEstandar().some((p) => p.id === this.skuEstandar()),
  );

  limpiarFiltrosEstandar(): void {
    if (this.guardando()) return;
    clearTimeout(this.temporizadorBusqueda);
    this.busquedaSkuEstandar.set('');
    this.categoriaSkuEstandar.set('');
    this.marcaSkuEstandar.set('');
    this.tecnologiaSkuEstandar.set('');
  }
  readonly periodoEstandar = signal<'base' | 'mes'>('mes');
  readonly mesEstandar = signal(mesActualEcuador());
  readonly mesEdicion = computed(() =>
    this.periodoEstandar() === 'mes' ? this.mesEstandar() : '',
  );
  readonly guardadoDisponible = computed(() => this.estandares.disponiblePara(this.mesEdicion()));

  async cambiarPeriodoEstandar(periodo: 'base' | 'mes'): Promise<void> {
    if (this.guardando()) return;
    this.periodoEstandar.set(periodo);
    if (this.skuEstandar()) await this.seleccionarEstandar(this.skuEstandar()!);
  }

  async cambiarMesEstandar(mes: string): Promise<void> {
    if (this.guardando()) return;
    this.mesEstandar.set(mes);
    if (this.skuEstandar()) await this.seleccionarEstandar(this.skuEstandar()!);
  }

  nombreMesEstandar(): string {
    const mes = this.mesEstandar();
    return mesCostoValido(mes)
      ? new Intl.DateTimeFormat('es-EC', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${mes}-01T00:00:00Z`))
      : 'Selecciona un mes';
  }
  readonly formEstandar = new FormGroup({
    materiaPrima: costoEstandar(),
    empaque: costoEstandar(),
    carton: costoEstandar(),
    manoObra: costoEstandar(),
    gif: costoEstandar(),
  });

  readonly cargandoEstandar = signal(false);
  readonly estandarListo = signal(false);
  readonly errorEstandar = signal('');
  readonly origenEstandar = signal<'guardado' | 'catalogo'>('catalogo');
  readonly presentacionEstandar = computed(
    () => this.skuPorId().get(this.skuEstandar() ?? 0) ?? null,
  );
  private versionEstandar = 0;
  async seleccionarEstandar(id: number): Promise<void> {
    if (this.guardando()) return;
    const version = ++this.versionEstandar;
    const p = this.skuPorId().get(id);
    this.skuEstandar.set(p?.id ?? null);
    this.aviso.set(null);
    this.errorEstandar.set('');
    this.formEstandar.reset();
    this.estandarListo.set(false);
    this.cargandoEstandar.set(false);
    if (!p) return;
    const mes = this.mesEdicion();
    if (this.periodoEstandar() === 'mes' && !mesCostoValido(mes)) {
      this.errorEstandar.set('Selecciona un mes válido para consultar o editar.');
      return;
    }
    this.cargandoEstandar.set(true);
    try {
      const costos = mes ? await this.estandares.cargar(id, mes) : await this.estandares.cargar(id);
      if (version !== this.versionEstandar) return;
      if (costos) {
        this.formEstandar.reset(costos);
        this.origenEstandar.set('guardado');
      } else {
        const datos = await this.produccion.cargar(id);
        if (version !== this.versionEstandar) return;
        const mesMano = mes ? `${mes}-01` : datos.manoObra.map((r) => r.mes).sort()[0];
        const mesGif = mes || datos.gastosIndirectos.map((r) => r.mes.slice(0, 7)).sort()[0];
        const presentacion = mes
          ? this.data
              .productos()
              .flatMap((p) => p.presentaciones)
              .find((p) => p.id === id)
          : null;
        this.formEstandar.reset({
          materiaPrima: mes
            ? presentacion
              ? (this.data.materiaPrimaDelMes(presentacion, mes)?.costo ?? null)
              : null
            : this.costoSku(id),
          empaque: datos.empaqueSinDato ? null : datos.costoEmpaque,
          carton: datos.cartonSinDato ? null : datos.costoCarton,
          manoObra: mesMano
            ? (resolverManoObra(datos.manoObra, mesMano)?.costo_unitario ?? null)
            : null,
          gif: mesGif
            ? (resolverGastosIndirectos(datos.gastosIndirectos, mesGif)?.costo ?? null)
            : null,
        });
        this.origenEstandar.set('catalogo');
      }
      this.estandarListo.set(true);
    } catch (e) {
      if (version === this.versionEstandar) this.errorEstandar.set(this.mensaje(e));
    } finally {
      if (version === this.versionEstandar) this.cargandoEstandar.set(false);
    }
  }

  totalEstandar(): number | null {
    const costos = this.formEstandar.getRawValue();
    return this.estandarListo() && validarCostosEstandar(costos)
      ? Object.values(costos).reduce((suma, costo) => suma + costo, 0)
      : null;
  }

  litroEstandar(): number | null {
    const litros = this.skuPorId().get(this.skuEstandar() ?? 0)?.litros ?? 0;
    const total = this.totalEstandar();
    return total !== null && Number.isFinite(litros) && litros > 0 ? total / litros : null;
  }

  async guardarEstandar(): Promise<void> {
    const id = this.skuEstandar();
    this.formEstandar.markAllAsTouched();
    const costos = this.formEstandar.getRawValue();
    if (
      !id ||
      !this.estandarListo() ||
      !this.guardadoDisponible() ||
      (this.periodoEstandar() === 'mes' && !mesCostoValido(this.mesEdicion())) ||
      !validarCostosEstandar(costos) ||
      this.guardando() ||
      !this.editor()
    )
      return;
    this.guardando.set(true);
    this.errorEstandar.set('');
    this.aviso.set(null);
    try {
      const mes = this.mesEdicion();
      if (mes) await this.estandares.guardar(id, costos, mes);
      else await this.estandares.guardar(id, costos);
      this.origenEstandar.set('guardado');
      this.aviso.set(
        mes ? `Costos de ${this.nombreMesEstandar()} guardados.` : 'Costos estándar guardados.',
      );
      this.formEstandar.markAsPristine();
    } catch (e) {
      this.errorEstandar.set(this.mensaje(e));
    } finally {
      this.guardando.set(false);
    }
  }
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private suscripcion?: { unsubscribe(): void };
  private sesionVersion = 0;
  private historialVersion = 0;
  private destruido = false;
  readonly catalogo = signal<CatalogoAdmin>(vacio);
  readonly materias = computed(() => this.catalogo().materias);
  readonly productos = computed(() => this.catalogo().productos);
  readonly presentaciones = computed(() => this.catalogo().presentaciones);
  readonly empaques = computed(() => this.catalogo().empaques);
  readonly historial = signal<HistorialDB[]>([]);
  readonly pestana = signal<Pestana>('productos');
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly autenticando = signal(false);
  readonly cargandoHistorial = signal(false);
  readonly editor = signal(false);
  readonly email = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly errorSesion = signal<string | null>(null);
  readonly errorHistorial = signal<string | null>(null);
  readonly confirmacion = signal<{ titulo: string; mensaje: string } | null>(null);
  readonly busqueda = signal('');
  readonly filtroProducto = signal('');
  readonly filtroHistorial = signal('');
  readonly editando = signal<Pestana | null>(null);
  readonly categorias = [
    'Agua de Coco',
    'Bebida',
    'Jugos y Zumo',
    'Lacteos',
    'Limonada',
    'Naranja',
    'Nectar',
    'P. Temporales y Salsa',
  ];
  readonly tecnologias = ['HPP', 'HTST', 'UHT'];
  readonly tiposEmpaque = TIPOS_EMPAQUE;
  readonly tablasHistorial = [
    'producto',
    'materia_prima',
    'presentacion',
    'formula_ingrediente',
    'presentacion_item',
    'empaque',
    'precio_historico',
    'costo_mano_obra',
  ];
  readonly materiasPorId = computed(() => new Map(this.materias().map((m) => [m.id, m])));
  readonly productosPorId = computed(() => new Map(this.productos().map((p) => [p.id, p])));
  readonly skuPorId = computed(() => new Map(this.presentaciones().map((p) => [p.id, p])));
  readonly materiasFiltradas = computed(() =>
    this.materias().filter((m) => this.coincide(m.nombre, m.unidad)),
  );
  readonly productosFiltrados = computed(() =>
    this.productos().filter((p) => this.coincide(p.nombre, p.marca, p.variante, p.categoria)),
  );
  readonly presentacionesFiltradas = computed(() =>
    this.presentaciones().filter(
      (p) =>
        (!this.filtroProducto() || p.producto_id === this.filtroProducto()) &&
        this.coincide(this.etiquetaSku(p), p.codigo_barras ?? '', p.clave_sku),
    ),
  );
  readonly empaquesFiltrados = computed(() =>
    this.empaques().filter((e) => {
      const p = this.skuPorId().get(e.presentacion_id);
      return (
        (!this.filtroProducto() || p?.producto_id === this.filtroProducto()) &&
        this.coincide(p ? this.etiquetaSku(p) : String(e.presentacion_id), e.tipo, e.estado)
      );
    }),
  );

  readonly formLogin = new FormGroup({ email: texto(), password: texto() });
  readonly formMateria = new FormGroup({
    id: new FormControl<number | null>(null),
    nombre: texto(),
    unidad: texto('Kg'),
    costo_kg: numero(),
    activo: new FormControl(true, { nonNullable: true }),
  });
  readonly formProducto = new FormGroup({
    id: new FormControl<string | null>(null),
    nombre: texto(),
    categoria: texto(),
    marca: texto(),
    variante: texto(),
    fecha_revision: texto('', false),
    activo: new FormControl(true, { nonNullable: true }),
  });
  readonly formEmpaque = new FormGroup({
    id: new FormControl<number | null>(null),
    presentacion_id: new FormControl<number | null>(null, Validators.required),
    tipo: new FormControl<EmpaqueDB['tipo']>('Botella', {
      nonNullable: true,
      validators: Validators.required,
    }),
    costo: numero(),
    estado: new FormControl<EmpaqueDB['estado']>('confirmado', {
      nonNullable: true,
      validators: Validators.required,
    }),
  });
  readonly formSku = new FormGroup({
    id: new FormControl<number | null>(null),
    producto_id: texto(),
    clave_sku: texto(),
    nombre_sku: texto(),
    litros: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.000001)],
    }),
    tecnologia: texto('HPP'),
    codigo_barras: texto('', false),
    linea_producto: texto('', false),
    estado_formulacion: new FormControl<PresentacionDB['estado_formulacion']>('por_completar', {
      nonNullable: true,
    }),
    activo: new FormControl(true, { nonNullable: true }),
    filas: new FormArray<ReturnType<typeof filaFormula>>([]),
  });
  private skuAntes: ReturnType<typeof versionSku> | null = null;
  get filasArray() {
    return this.formSku.controls.filas;
  }

  async ngOnInit(): Promise<void> {
    if (!this.browser) {
      this.cargando.set(false);
      return;
    }
    this.suscripcion = this.api.escucharSesion(() => {
      if (!this.destruido) void this.actualizarSesion();
    });
    await Promise.all([this.cargarTodo(), this.actualizarSesion()]);
  }
  ngOnDestroy(): void {
    clearTimeout(this.temporizadorBusqueda);
    this.destruido = true;
    this.versionEstandar++;
    this.sesionVersion++;
    this.historialVersion++;
    this.suscripcion?.unsubscribe();
  }
  async actualizarSesion(): Promise<void> {
    const version = ++this.sesionVersion;
    try {
      const s = await this.api.sesionEditor();
      if (this.destruido || version !== this.sesionVersion) return;
      this.email.set(s.email);
      this.editor.set(s.editor);
      this.errorSesion.set(null);
      if (!s.editor) {
        this.cancelarConfirmacion();
        this.editando.set(null);
        this.historial.set([]);
        this.historialVersion++;
        this.cargandoHistorial.set(false);
      } else if (this.pestana() === 'historial') await this.cargarHistorial();
    } catch (e) {
      if (this.destruido || version !== this.sesionVersion) return;
      this.cancelarConfirmacion();
      this.editor.set(false);
      this.editando.set(null);
      this.historial.set([]);
      this.historialVersion++;
      this.cargandoHistorial.set(false);
      this.errorSesion.set('No se pudo comprobar el acceso de editor. ' + this.mensaje(e));
    }
  }
  async iniciarSesion(): Promise<void> {
    if (this.autenticando()) return;
    this.formLogin.markAllAsTouched();
    if (this.formLogin.invalid) return;
    this.autenticando.set(true);
    this.errorSesion.set(null);
    try {
      const v = this.formLogin.getRawValue();
      await this.api.iniciarSesion(v.email, v.password);
      await this.actualizarSesion();
    } catch (e) {
      this.errorSesion.set(this.mensaje(e));
    } finally {
      this.formLogin.controls.password.reset('');
      this.autenticando.set(false);
    }
  }
  async cerrarSesion(): Promise<void> {
    if (this.autenticando() || this.guardando()) return;
    this.autenticando.set(true);
    try {
      await this.api.cerrarSesion();
      this.email.set(null);
      this.editor.set(false);
      this.editando.set(null);
      this.historial.set([]);
      await this.actualizarSesion();
    } catch (e) {
      this.errorSesion.set(this.mensaje(e));
    } finally {
      this.autenticando.set(false);
    }
  }
  async cargarTodo(): Promise<void> {
    if (this.cargando() && this.catalogo() !== vacio) return;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const c = await this.api.cargarCatalogo();
      if (!this.destruido) this.catalogo.set(c);
    } catch (e) {
      this.error.set(this.mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }
  cambiarPestana(p: Pestana): void {
    if (this.guardando()) return;
    this.cancelarConfirmacion();
    this.pestana.set(p);
    this.editando.set(null);
    this.busqueda.set('');
    this.error.set(null);
    if (p === 'historial') void this.cargarHistorial();
  }
  async cargarHistorial(): Promise<void> {
    if (!this.editor()) return;
    const version = ++this.historialVersion;
    this.cargandoHistorial.set(true);
    this.errorHistorial.set(null);
    try {
      const h = await this.api.listarHistorial(this.filtroHistorial() || null);
      if (!this.destruido && version === this.historialVersion && this.editor())
        this.historial.set(h);
    } catch (e) {
      if (version === this.historialVersion) {
        this.historial.set([]);
        this.errorHistorial.set(this.mensaje(e));
      }
    } finally {
      if (version === this.historialVersion) this.cargandoHistorial.set(false);
    }
  }
  cambiarFiltroHistorial(valor: string): void {
    this.filtroHistorial.set(valor);
    void this.cargarHistorial();
  }
  cancelar(): void {
    if (!this.guardando()) {
      this.cancelarConfirmacion();
      this.editando.set(null);
    }
  }
  private abrir(p: Pestana): boolean {
    if (!this.editor() || this.guardando()) return false;
    this.error.set(null);
    this.aviso.set(null);
    this.editando.set(p);
    return true;
  }
  editarMateria(m?: MateriaDB): void {
    if (!this.abrir('materias')) return;
    this.formMateria.reset({
      id: m?.id ?? null,
      nombre: m?.nombre ?? '',
      unidad: m?.unidad ?? 'Kg',
      costo_kg: m?.costo_kg ?? 0,
      activo: m?.activo ?? true,
    });
  }
  async guardarMateria(): Promise<void> {
    this.formMateria.markAllAsTouched();
    if (this.formMateria.invalid) return;
    const { id, ...v } = this.formMateria.getRawValue();
    const nombre = v.nombre.trim(),
      unidad = v.unidad.trim();
    if (!nombre || !unidad || !Number.isFinite(v.costo_kg)) {
      this.error.set('Revisa nombre, unidad y costo.');
      return;
    }
    if (
      this.materias().some(
        (m) => m.id !== id && this.normalizar(m.nombre) === this.normalizar(nombre),
      )
    ) {
      this.error.set('Ya existe una materia prima con ese nombre.');
      return;
    }
    await this.guardar(() => this.api.guardarMateria(id, { ...v, nombre, unidad }));
  }
  editarProducto(p?: ProductoDB): void {
    if (!this.abrir('productos')) return;
    this.formProducto.reset({
      id: p?.id ?? null,
      nombre: p?.nombre ?? '',
      categoria: p?.categoria ?? this.categorias[0],
      marca: p?.marca ?? '',
      variante: p?.variante ?? '',
      fecha_revision: p?.fecha_revision ?? '',
      activo: p?.activo ?? true,
    });
  }
  async guardarProducto(): Promise<void> {
    this.formProducto.markAllAsTouched();
    if (this.formProducto.invalid) return;
    const { id, ...v } = this.formProducto.getRawValue();
    const nombre = v.nombre.trim(),
      marca = v.marca.trim(),
      variante = v.variante.trim();
    if (!nombre || !marca || !variante || !this.categorias.includes(v.categoria)) {
      this.error.set('Completa nombre, marca, variante y una categoría del catálogo.');
      return;
    }
    if (
      this.productos().some(
        (p) =>
          p.id !== id &&
          this.normalizar(p.marca) === this.normalizar(marca) &&
          this.normalizar(p.variante) === this.normalizar(variante) &&
          p.categoria === v.categoria,
      )
    ) {
      this.error.set('Ya existe esa marca, categoría y variante.');
      return;
    }
    await this.guardar(() =>
      this.api.guardarProducto(id, {
        ...v,
        nombre,
        marca,
        variante,
        fecha_revision: v.fecha_revision || null,
      }),
    );
  }
  editarEmpaque(e?: EmpaqueDB): void {
    if (!this.abrir('empaques')) return;
    this.formEmpaque.reset({
      id: e?.id ?? null,
      presentacion_id: e?.presentacion_id ?? null,
      tipo: e?.tipo ?? 'Botella',
      costo: e?.costo ?? 0,
      estado: e?.estado ?? 'confirmado',
    });
  }
  unidadesPaqueteEmpaque(presentacionId: number | null, tipo: string): number | null {
    const sku = presentacionId === null ? null : this.skuPorId().get(presentacionId);
    if (!sku) return null;
    return tipo === 'Cartón'
      ? unidadesPorCarton(Number(sku.litros))
      : unidadesPaqueteEnvase(Number(sku.litros));
  }
  precioUnitarioEmpaque(empaque: EmpaqueDB): number | null {
    const sku = this.skuPorId().get(empaque.presentacion_id);
    if (!sku || empaque.estado === 'sin_dato') return null;
    return empaque.tipo === 'Cartón'
      ? precioUnitarioCarton(Number(empaque.costo), Number(sku.litros))
      : precioUnitarioEnvase(Number(empaque.costo), Number(sku.litros));
  }
  async guardarEmpaque(): Promise<void> {
    this.formEmpaque.markAllAsTouched();
    if (this.formEmpaque.invalid) return;
    const { id, presentacion_id, ...v } = this.formEmpaque.getRawValue();
    if (
      presentacion_id === null ||
      !this.skuPorId().has(presentacion_id) ||
      !Number.isFinite(v.costo)
    ) {
      this.error.set('Selecciona un SKU y un costo válidos.');
      return;
    }
    if (
      this.empaques().some(
        (e) => e.id !== id && e.presentacion_id === presentacion_id && e.tipo === v.tipo,
      )
    ) {
      this.error.set('Ese SKU ya tiene este tipo de empaque. Edita el registro existente.');
      return;
    }
    if (v.estado === 'sin_dato' && v.costo !== 0) {
      this.error.set(
        'Un empaque sin dato debe tener costo 0; para registrar un precio selecciona otro estado.',
      );
      return;
    }
    await this.guardar(() => this.api.guardarEmpaque(id, { ...v, presentacion_id }));
  }
  editarSku(p?: PresentacionDB): void {
    if (!this.abrir('presentaciones')) return;
    this.filasArray.clear();
    this.skuAntes = p ? versionSku(p, this.catalogo().formulas, this.catalogo().items) : null;
    if (p) {
      const formulas = this.skuAntes!.formula;
      const items = this.skuAntes!.items;
      if (
        formulas.length !== items.length ||
        formulas.some((f) => !items.some((i) => i.materia_prima_id === f.materia_prima_id))
      ) {
        this.error.set(
          'La fórmula y sus cantidades no coinciden. Revisa este SKU antes de editarlo.',
        );
        this.editando.set(null);
        return;
      }
      for (const f of formulas) {
        const i = items.find((i) => i.materia_prima_id === f.materia_prima_id)!;
        this.filasArray.push(filaFormula({ ...i, porcentaje: f.porcentaje }));
      }
    }
    this.formSku.reset({
      id: p?.id ?? null,
      producto_id: p?.producto_id ?? this.filtroProducto(),
      clave_sku: p?.clave_sku ?? `sku-${crypto.randomUUID()}`,
      nombre_sku: p?.nombre_sku ?? '',
      litros: p?.litros ?? 0,
      tecnologia: p?.tecnologia ?? 'HPP',
      codigo_barras: p?.codigo_barras ?? '',
      linea_producto: p?.linea_producto ?? '',
      estado_formulacion: p?.estado_formulacion ?? 'por_completar',
      activo: p?.activo ?? true,
      filas: this.filasArray.getRawValue(),
    });
  }
  agregarFila(): void {
    if (!this.guardando()) this.filasArray.push(filaFormula());
  }
  quitarFila(i: number): void {
    if (!this.guardando()) this.filasArray.removeAt(i);
  }
  totalPorcentaje(): number {
    return this.filasArray.controls.reduce((s, f) => s + Number(f.controls.porcentaje.value), 0);
  }
  costoFormula(): number | null {
    if (!this.filasArray.length) return null;
    let total = 0;
    for (const f of this.filasArray.getRawValue()) {
      const m = this.materiasPorId().get(Number(f.materia_prima_id));
      if (!m) return null;
      total += f.kg * m.costo_kg;
    }
    return total;
  }
  async guardarSku(): Promise<void> {
    this.formSku.markAllAsTouched();
    if (this.formSku.invalid) return;
    const { filas: raw, ...v } = this.formSku.getRawValue();
    const filas: FilaFormula[] = raw.map((f) => ({
      ...f,
      materia_prima_id: Number(f.materia_prima_id),
    }));
    try {
      validarFilas(filas);
    } catch (e) {
      this.error.set(this.mensaje(e));
      return;
    }
    if (
      !v.nombre_sku.trim() ||
      !v.clave_sku.trim() ||
      !this.productosPorId().has(v.producto_id) ||
      !this.tecnologias.includes(v.tecnologia) ||
      !Number.isFinite(v.litros)
    ) {
      this.error.set('Completa los datos del SKU.');
      return;
    }
    if (
      this.presentaciones().some(
        (p) =>
          p.id !== v.id &&
          (p.clave_sku === v.clave_sku.trim() ||
            (p.producto_id === v.producto_id &&
              p.tecnologia === v.tecnologia &&
              Math.abs(p.litros - v.litros) < 0.0000005)),
      )
    ) {
      this.error.set('Ya existe esa clave SKU o esa combinación de producto, litros y tecnología.');
      return;
    }
    const usadas = new Set(this.skuAntes?.formula.map((f) => f.materia_prima_id) ?? []);
    if (
      filas.some((f) => {
        const m = this.materiasPorId().get(f.materia_prima_id);
        return !m || (!m.activo && !usadas.has(m.id));
      })
    ) {
      this.error.set('Solo puedes agregar materias primas activas.');
      return;
    }
    if (!filas.length && v.estado_formulacion !== 'por_completar') {
      this.error.set('Un SKU sin fórmula debe estar por completar.');
      return;
    }
    if (
      filas.length &&
      Math.abs(this.totalPorcentaje() - 100) > 0.01 &&
      !confirm(
        `La fórmula suma ${this.totalPorcentaje().toFixed(4)} %. ¿Guardar con esta diferencia?`,
      )
    )
      return;
    await this.guardar(() =>
      this.api.guardarSku(
        {
          ...v,
          nombre_sku: v.nombre_sku.trim(),
          clave_sku: v.clave_sku.trim(),
          codigo_barras: v.codigo_barras.trim() || null,
          linea_producto: v.linea_producto.trim() || null,
        },
        filas,
        this.skuAntes,
      ),
    );
  }
  puedeEliminar(): boolean {
    switch (this.editando()) {
      case 'productos':
        return this.formProducto.controls.id.value !== null;
      case 'materias':
        return this.formMateria.controls.id.value !== null;
      case 'presentaciones':
        return this.formSku.controls.id.value !== null;
      case 'empaques':
        return this.formEmpaque.controls.id.value !== null;
      default:
        return false;
    }
  }
  async eliminarActual(): Promise<void> {
    if (!this.browser || !this.editor() || this.guardando() || !this.puedeEliminar()) return;
    this.error.set(null);
    this.aviso.set(null);
    const c = this.catalogo();
    let tabla: 'producto' | 'materia_prima' | 'presentacion' | 'empaque';
    let id: string | number;
    let nombre: string;
    let detalle = '';
    switch (this.editando()) {
      case 'productos': {
        tabla = 'producto';
        id = this.formProducto.controls.id.value!;
        nombre = this.nombreProducto(id);
        if (c.presentaciones.some((p) => p.producto_id === id)) {
          this.error.set(
            'Elimina primero los SKU de este producto o desactívalo para conservar sus datos.',
          );
          return;
        }
        break;
      }
      case 'materias': {
        tabla = 'materia_prima';
        id = this.formMateria.controls.id.value!;
        nombre = this.materiasPorId().get(id)?.nombre ?? `Materia prima #${id}`;
        if (
          c.formulas.some((f) => f.materia_prima_id === id) ||
          c.items.some((i) => i.materia_prima_id === id)
        ) {
          this.error.set(
            'Esta materia prima está en uso. Retírala de las fórmulas y cantidades antes de eliminarla, o desactívala.',
          );
          return;
        }
        break;
      }
      case 'presentaciones':
        tabla = 'presentacion';
        id = this.formSku.controls.id.value!;
        nombre = this.nombreSku(id);
        detalle =
          ' Esto también puede eliminar su fórmula, cantidades, empaques y otros datos asociados.';
        break;
      case 'empaques': {
        tabla = 'empaque';
        id = this.formEmpaque.controls.id.value!;
        const empaque = c.empaques.find((e) => e.id === id);
        nombre = empaque
          ? `${empaque.tipo} · ${this.nombreSku(empaque.presentacion_id)}`
          : `Empaque #${id}`;
        break;
      }
      default:
        return;
    }
    this.confirmacion.set({
      titulo: `¿Eliminar «${nombre}»?`,
      mensaje: `${detalle} Esta acción es permanente y no guarda los cambios pendientes del formulario.`,
    });
    this.eliminacionPendiente = { tabla, id };
  }
  private eliminacionPendiente: {
    tabla: 'producto' | 'materia_prima' | 'presentacion' | 'empaque';
    id: string | number;
  } | null = null;
  cancelarConfirmacion(): void {
    this.confirmacion.set(null);
    this.eliminacionPendiente = null;
  }
  async confirmarEliminacion(): Promise<void> {
    const pendiente = this.eliminacionPendiente;
    this.cancelarConfirmacion();
    if (!pendiente) return;
    await this.guardar(
      () => this.api.eliminarRegistro(pendiente.tabla, pendiente.id),
      'Registro eliminado.',
    );
  }
  private async guardar(accion: () => Promise<void>, exito = 'Cambios guardados.'): Promise<void> {
    if (this.guardando() || !this.editor()) return;
    this.guardando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    try {
      await accion();
      this.editando.set(null);
      this.aviso.set(exito);
      // Un error al recargar no debe presentarse como un fallo de la escritura ya confirmada.
      try {
        this.catalogo.set(await this.api.cargarCatalogo());
        if (!(await this.data.actualizarAhora()))
          throw new Error(this.data.error() ?? 'No se pudo actualizar el dashboard.');
      } catch (e) {
        this.error.set(
          'Los cambios se guardaron, pero debes recargar los datos. ' + this.mensaje(e),
        );
      }
    } catch (e) {
      this.error.set(this.mensaje(e));
    } finally {
      this.guardando.set(false);
    }
  }
  etiquetaSku(p: PresentacionDB): string {
    const producto = this.productosPorId().get(p.producto_id);
    return `${producto?.marca ?? ''} · ${p.nombre_sku} · ${p.litros} L · ${p.tecnologia}`;
  }
  nombreSku(id: number): string {
    const p = this.skuPorId().get(id);
    return p ? this.etiquetaSku(p) : `SKU #${id}`;
  }
  costoSku(id: number): number | null {
    const items = this.catalogo().items.filter((i) => i.presentacion_id === id);
    if (!items.length || items.some((i) => !this.materiasPorId().has(i.materia_prima_id)))
      return null;
    return items.reduce(
      (s, i) => s + i.kg * this.materiasPorId().get(i.materia_prima_id)!.costo_kg,
      0,
    );
  }
  cantidadIngredientes(id: number): number {
    return this.catalogo().formulas.filter((f) => f.presentacion_id === id).length;
  }
  nombreProducto(id: string): string {
    return this.productosPorId().get(id)?.nombre ?? id;
  }
  etiquetaTabla(t: string): string {
    return (
      (
        {
          producto: 'Producto',
          materia_prima: 'Materia prima',
          presentacion: 'SKU',
          formula_ingrediente: 'Fórmula',
          presentacion_item: 'Cantidad',
          empaque: 'Empaque',
          precio_historico: 'Precio histórico',
          costo_mano_obra: 'Mano de obra',
        } as Record<string, string>
      )[t] ?? t
    );
  }
  resumen(h: HistorialDB): string {
    const d = h.datos_nuevos ?? h.datos_anteriores ?? {};
    const parte =
      d['nombre'] ??
      d['nombre_sku'] ??
      (d['presentacion_id'] ? this.nombreSku(Number(d['presentacion_id'])) : h.registro_id);
    const m = d['materia_prima_id']
      ? this.materiasPorId().get(Number(d['materia_prima_id']))?.nombre
      : null;
    return [parte, m, d['tipo']].filter(Boolean).join(' · ');
  }
  cambios(h: HistorialDB): string[] {
    if (h.accion !== 'UPDATE') return [];
    const antes = h.datos_anteriores ?? {},
      despues = h.datos_nuevos ?? {};
    return Object.keys(despues)
      .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
      .map((k) => `${k}: ${antes[k] ?? '—'} → ${despues[k] ?? '—'}`);
  }
  private normalizar(s: string): string {
    return s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }
  private coincide(...campos: string[]): boolean {
    const texto = this.normalizar(campos.join(' '));
    return this.normalizar(this.busqueda())
      .split(/\s+/)
      .every((p) => texto.includes(p));
  }
  private mensaje(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String(e.message);
    return 'No se pudo completar la operación.';
  }
}
