import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '../../core/data.service';
import { TIPOS_EMPAQUE } from '../../models/empaque.model';
import {
  CatalogoAdminService, CatalogoAdmin, EmpaqueDB, FilaFormula, HistorialDB,
  MateriaDB, PresentacionDB, ProductoDB, validarFilas, versionSku
} from '../../core/catalogo-admin.service';

type Pestana = 'productos' | 'materias' | 'empaques' | 'presentaciones' | 'historial';
function texto(valor = '', requerido = true) {
  return new FormControl(valor, { nonNullable: true, validators: requerido ? [Validators.required] : [] });
}
function numero(valor = 0, max?: number) {
  return new FormControl(valor, { nonNullable: true,
    validators: [Validators.required, Validators.min(0), ...(max === undefined ? [] : [Validators.max(max)])] });
}
function filaFormula(f?: FilaFormula) {
  return new FormGroup({
    materia_prima_id: new FormControl<number | null>(f?.materia_prima_id ?? null, Validators.required),
    porcentaje: numero(f?.porcentaje ?? 0, 100), kg: numero(f?.kg ?? 0), litros: numero(f?.litros ?? 0),
    costo_original: new FormControl<number | null>(f?.costo_original ?? null, Validators.min(0))
  });
}
const vacio: CatalogoAdmin = { materias: [], productos: [], presentaciones: [], formulas: [], items: [], empaques: [] };

@Component({
  selector: 'app-administracion', imports: [DatePipe, DecimalPipe, ReactiveFormsModule, MatIconModule],
  templateUrl: './administracion.html', styleUrl: './administracion.css'
})
export class Administracion implements OnInit, OnDestroy {
  private readonly api = inject(CatalogoAdminService);
  private readonly data = inject(DataService);
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
  readonly busqueda = signal('');
  readonly filtroProducto = signal('');
  readonly filtroHistorial = signal('');
  readonly editando = signal<Pestana | null>(null);
  readonly categorias = ['Agua de Coco', 'Bebida', 'Jugos y Zumo', 'Lacteos', 'Limonada', 'Naranja', 'Nectar', 'P. Temporales y Salsa'];
  readonly tecnologias = ['HPP', 'HTST', 'UHT'];
  readonly tiposEmpaque = TIPOS_EMPAQUE;
  readonly tablasHistorial = ['producto', 'materia_prima', 'presentacion', 'formula_ingrediente', 'presentacion_item', 'empaque', 'precio_historico', 'costo_mano_obra'];
  readonly materiasPorId = computed(() => new Map(this.materias().map(m => [m.id, m])));
  readonly productosPorId = computed(() => new Map(this.productos().map(p => [p.id, p])));
  readonly skuPorId = computed(() => new Map(this.presentaciones().map(p => [p.id, p])));
  readonly materiasFiltradas = computed(() => this.materias().filter(m => this.coincide(m.nombre, m.unidad)));
  readonly productosFiltrados = computed(() => this.productos().filter(p => this.coincide(p.nombre, p.marca, p.variante, p.categoria)));
  readonly presentacionesFiltradas = computed(() => this.presentaciones().filter(p =>
    (!this.filtroProducto() || p.producto_id === this.filtroProducto()) &&
    this.coincide(this.etiquetaSku(p), p.codigo_barras ?? '', p.clave_sku)));
  readonly empaquesFiltrados = computed(() => this.empaques().filter(e => {
    const p = this.skuPorId().get(e.presentacion_id);
    return (!this.filtroProducto() || p?.producto_id === this.filtroProducto()) &&
      this.coincide(p ? this.etiquetaSku(p) : String(e.presentacion_id), e.tipo, e.estado);
  }));

  readonly formLogin = new FormGroup({ email: texto(), password: texto() });
  readonly formMateria = new FormGroup({
    id: new FormControl<number | null>(null), nombre: texto(), unidad: texto('Kg'), costo_kg: numero(),
    activo: new FormControl(true, { nonNullable: true })
  });
  readonly formProducto = new FormGroup({
    id: new FormControl<string | null>(null), nombre: texto(), categoria: texto(), marca: texto(), variante: texto(),
    fecha_revision: texto('', false), activo: new FormControl(true, { nonNullable: true })
  });
  readonly formEmpaque = new FormGroup({
    id: new FormControl<number | null>(null),
    presentacion_id: new FormControl<number | null>(null, Validators.required),
    tipo: new FormControl<EmpaqueDB['tipo']>('Botella', { nonNullable: true, validators: Validators.required }),
    costo: numero(),
    estado: new FormControl<EmpaqueDB['estado']>('confirmado', { nonNullable: true, validators: Validators.required })
  });
  readonly formSku = new FormGroup({
    id: new FormControl<number | null>(null), producto_id: texto(), clave_sku: texto(), nombre_sku: texto(),
    litros: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.000001)] }),
    tecnologia: texto('HPP'), codigo_barras: texto('', false), linea_producto: texto('', false),
    estado_formulacion: new FormControl<PresentacionDB['estado_formulacion']>('por_completar', { nonNullable: true }),
    activo: new FormControl(true, { nonNullable: true }),
    filas: new FormArray<ReturnType<typeof filaFormula>>([])
  });
  private skuAntes: ReturnType<typeof versionSku> | null = null;
  get filasArray() { return this.formSku.controls.filas; }

  async ngOnInit(): Promise<void> {
    if (!this.browser) { this.cargando.set(false); return; }
    this.suscripcion = this.api.escucharSesion(() => { if (!this.destruido) void this.actualizarSesion(); });
    await Promise.all([this.cargarTodo(), this.actualizarSesion()]);
  }
  ngOnDestroy(): void { this.destruido = true; this.sesionVersion++; this.historialVersion++; this.suscripcion?.unsubscribe(); }
  async actualizarSesion(): Promise<void> {
    const version = ++this.sesionVersion;
    try {
      const s = await this.api.sesionEditor();
      if (this.destruido || version !== this.sesionVersion) return;
      this.email.set(s.email); this.editor.set(s.editor); this.errorSesion.set(null);
      if (!s.editor) { this.editando.set(null); this.historial.set([]); this.historialVersion++; this.cargandoHistorial.set(false); }
      else if (this.pestana() === 'historial') await this.cargarHistorial();
    } catch (e) {
      if (this.destruido || version !== this.sesionVersion) return;
      this.editor.set(false); this.editando.set(null); this.historial.set([]); this.historialVersion++; this.cargandoHistorial.set(false);
      this.errorSesion.set('No se pudo comprobar el acceso de editor. ' + this.mensaje(e));
    }
  }
  async iniciarSesion(): Promise<void> {
    if (this.autenticando()) return;
    this.formLogin.markAllAsTouched(); if (this.formLogin.invalid) return;
    this.autenticando.set(true); this.errorSesion.set(null);
    try {
      const v = this.formLogin.getRawValue();
      await this.api.iniciarSesion(v.email, v.password);
      await this.actualizarSesion();
    } catch (e) { this.errorSesion.set(this.mensaje(e)); }
    finally { this.formLogin.controls.password.reset(''); this.autenticando.set(false); }
  }
  async cerrarSesion(): Promise<void> {
    if (this.autenticando() || this.guardando()) return;
    this.autenticando.set(true);
    try { await this.api.cerrarSesion(); this.email.set(null); this.editor.set(false); this.editando.set(null); this.historial.set([]); await this.actualizarSesion(); }
    catch (e) { this.errorSesion.set(this.mensaje(e)); }
    finally { this.autenticando.set(false); }
  }
  async cargarTodo(): Promise<void> {
    if (this.cargando() && this.catalogo() !== vacio) return;
    this.cargando.set(true); this.error.set(null);
    try { const c = await this.api.cargarCatalogo(); if (!this.destruido) this.catalogo.set(c); }
    catch (e) { this.error.set(this.mensaje(e)); }
    finally { this.cargando.set(false); }
  }
  cambiarPestana(p: Pestana): void {
    if (this.guardando()) return;
    this.pestana.set(p); this.editando.set(null); this.busqueda.set(''); this.error.set(null);
    if (p === 'historial') void this.cargarHistorial();
  }
  async cargarHistorial(): Promise<void> {
    if (!this.editor()) return;
    const version = ++this.historialVersion;
    this.cargandoHistorial.set(true); this.errorHistorial.set(null);
    try {
      const h = await this.api.listarHistorial(this.filtroHistorial() || null);
      if (!this.destruido && version === this.historialVersion && this.editor()) this.historial.set(h);
    } catch (e) { if (version === this.historialVersion) { this.historial.set([]); this.errorHistorial.set(this.mensaje(e)); } }
    finally { if (version === this.historialVersion) this.cargandoHistorial.set(false); }
  }
  cambiarFiltroHistorial(valor: string): void { this.filtroHistorial.set(valor); void this.cargarHistorial(); }
  cancelar(): void { if (!this.guardando()) this.editando.set(null); }
  private abrir(p: Pestana): boolean {
    if (!this.editor() || this.guardando()) return false;
    this.error.set(null); this.aviso.set(null); this.editando.set(p); return true;
  }
  editarMateria(m?: MateriaDB): void {
    if (!this.abrir('materias')) return;
    this.formMateria.reset({ id: m?.id ?? null, nombre: m?.nombre ?? '', unidad: m?.unidad ?? 'Kg', costo_kg: m?.costo_kg ?? 0, activo: m?.activo ?? true });
  }
  async guardarMateria(): Promise<void> {
    this.formMateria.markAllAsTouched(); if (this.formMateria.invalid) return;
    const { id, ...v } = this.formMateria.getRawValue();
    const nombre = v.nombre.trim(), unidad = v.unidad.trim();
    if (!nombre || !unidad || !Number.isFinite(v.costo_kg)) { this.error.set('Revisa nombre, unidad y costo.'); return; }
    if (this.materias().some(m => m.id !== id && this.normalizar(m.nombre) === this.normalizar(nombre))) { this.error.set('Ya existe una materia prima con ese nombre.'); return; }
    await this.guardar(() => this.api.guardarMateria(id, { ...v, nombre, unidad }));
  }
  editarProducto(p?: ProductoDB): void {
    if (!this.abrir('productos')) return;
    this.formProducto.reset({ id: p?.id ?? null, nombre: p?.nombre ?? '', categoria: p?.categoria ?? this.categorias[0], marca: p?.marca ?? '', variante: p?.variante ?? '', fecha_revision: p?.fecha_revision ?? '', activo: p?.activo ?? true });
  }
  async guardarProducto(): Promise<void> {
    this.formProducto.markAllAsTouched(); if (this.formProducto.invalid) return;
    const { id, ...v } = this.formProducto.getRawValue();
    const nombre = v.nombre.trim(), marca = v.marca.trim(), variante = v.variante.trim();
    if (!nombre || !marca || !variante || !this.categorias.includes(v.categoria)) { this.error.set('Completa nombre, marca, variante y una categoría del catálogo.'); return; }
    if (this.productos().some(p => p.id !== id && this.normalizar(p.marca) === this.normalizar(marca) && this.normalizar(p.variante) === this.normalizar(variante) && p.categoria === v.categoria)) { this.error.set('Ya existe esa marca, categoría y variante.'); return; }
    await this.guardar(() => this.api.guardarProducto(id, { ...v, nombre, marca, variante, fecha_revision: v.fecha_revision || null }));
  }
  editarEmpaque(e?: EmpaqueDB): void {
    if (!this.abrir('empaques')) return;
    this.formEmpaque.reset({ id: e?.id ?? null, presentacion_id: e?.presentacion_id ?? null, tipo: e?.tipo ?? 'Botella', costo: e?.costo ?? 0, estado: e?.estado ?? 'confirmado' });
  }
  async guardarEmpaque(): Promise<void> {
    this.formEmpaque.markAllAsTouched(); if (this.formEmpaque.invalid) return;
    const { id, presentacion_id, ...v } = this.formEmpaque.getRawValue();
    if (presentacion_id === null || !this.skuPorId().has(presentacion_id) || !Number.isFinite(v.costo)) { this.error.set('Selecciona un SKU y un costo válidos.'); return; }
    if (this.empaques().some(e => e.id !== id && e.presentacion_id === presentacion_id && e.tipo === v.tipo)) { this.error.set('Ese SKU ya tiene este tipo de empaque. Edita el registro existente.'); return; }
    if (v.estado === 'sin_dato' && v.costo !== 0) { this.error.set('Un empaque sin dato debe tener costo 0; para registrar un precio selecciona otro estado.'); return; }
    await this.guardar(() => this.api.guardarEmpaque(id, { ...v, presentacion_id }));
  }
  editarSku(p?: PresentacionDB): void {
    if (!this.abrir('presentaciones')) return;
    this.filasArray.clear();
    this.skuAntes = p ? versionSku(p, this.catalogo().formulas, this.catalogo().items) : null;
    if (p) {
      const formulas = this.skuAntes!.formula;
      const items = this.skuAntes!.items;
      if (formulas.length !== items.length || formulas.some(f => !items.some(i => i.materia_prima_id === f.materia_prima_id))) {
        this.error.set('La fórmula y sus cantidades no coinciden. Revisa este SKU antes de editarlo.'); this.editando.set(null); return;
      }
      for (const f of formulas) {
        const i = items.find(i => i.materia_prima_id === f.materia_prima_id)!;
        this.filasArray.push(filaFormula({ ...i, porcentaje: f.porcentaje }));
      }
    }
    this.formSku.reset({ id: p?.id ?? null, producto_id: p?.producto_id ?? this.filtroProducto(),
      clave_sku: p?.clave_sku ?? `sku-${crypto.randomUUID()}`, nombre_sku: p?.nombre_sku ?? '', litros: p?.litros ?? 0,
      tecnologia: p?.tecnologia ?? 'HPP', codigo_barras: p?.codigo_barras ?? '', linea_producto: p?.linea_producto ?? '',
      estado_formulacion: p?.estado_formulacion ?? 'por_completar', activo: p?.activo ?? true,
      filas: this.filasArray.getRawValue() });
  }
  agregarFila(): void { if (!this.guardando()) this.filasArray.push(filaFormula()); }
  quitarFila(i: number): void { if (!this.guardando()) this.filasArray.removeAt(i); }
  totalPorcentaje(): number { return this.filasArray.controls.reduce((s, f) => s + Number(f.controls.porcentaje.value), 0); }
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
    this.formSku.markAllAsTouched(); if (this.formSku.invalid) return;
    const { filas: raw, ...v } = this.formSku.getRawValue();
    const filas: FilaFormula[] = raw.map(f => ({ ...f, materia_prima_id: Number(f.materia_prima_id) }));
    try { validarFilas(filas); } catch (e) { this.error.set(this.mensaje(e)); return; }
    if (!v.nombre_sku.trim() || !v.clave_sku.trim() || !this.productosPorId().has(v.producto_id) || !this.tecnologias.includes(v.tecnologia) || !Number.isFinite(v.litros)) { this.error.set('Completa los datos del SKU.'); return; }
    if (this.presentaciones().some(p => p.id !== v.id && (p.clave_sku === v.clave_sku.trim() ||
      (p.producto_id === v.producto_id && p.tecnologia === v.tecnologia && Math.abs(p.litros - v.litros) < 0.0000005)))) { this.error.set('Ya existe esa clave SKU o esa combinación de producto, litros y tecnología.'); return; }
    const usadas = new Set(this.skuAntes?.formula.map(f => f.materia_prima_id) ?? []);
    if (filas.some(f => { const m = this.materiasPorId().get(f.materia_prima_id); return !m || (!m.activo && !usadas.has(m.id)); })) { this.error.set('Solo puedes agregar materias primas activas.'); return; }
    if (!filas.length && v.estado_formulacion !== 'por_completar') { this.error.set('Un SKU sin fórmula debe estar por completar.'); return; }
    if (filas.length && Math.abs(this.totalPorcentaje() - 100) > 0.01 &&
      !confirm(`La fórmula suma ${this.totalPorcentaje().toFixed(4)} %. ¿Guardar con esta diferencia?`)) return;
    await this.guardar(() => this.api.guardarSku({ ...v, nombre_sku: v.nombre_sku.trim(), clave_sku: v.clave_sku.trim(),
      codigo_barras: v.codigo_barras.trim() || null, linea_producto: v.linea_producto.trim() || null }, filas, this.skuAntes));
  }
  private async guardar(accion: () => Promise<void>): Promise<void> {
    if (this.guardando() || !this.editor()) return;
    this.guardando.set(true); this.error.set(null); this.aviso.set(null);
    try {
      await accion();
      this.editando.set(null); this.aviso.set('Cambios guardados.');
      // Un error al recargar no debe presentarse como un fallo de la escritura ya confirmada.
      try {
        this.catalogo.set(await this.api.cargarCatalogo());
        if (this.data.cargando()) await this.data.actualizarAhora();
        if (!await this.data.actualizarAhora()) throw new Error(this.data.error() ?? 'No se pudo actualizar el dashboard.');
      } catch (e) { this.error.set('Los cambios se guardaron, pero debes recargar los datos. ' + this.mensaje(e)); }
    } catch (e) { this.error.set(this.mensaje(e)); }
    finally { this.guardando.set(false); }
  }
  etiquetaSku(p: PresentacionDB): string {
    const producto = this.productosPorId().get(p.producto_id);
    return `${producto?.marca ?? ''} · ${p.nombre_sku} · ${p.litros} L · ${p.tecnologia}`;
  }
  nombreSku(id: number): string { const p = this.skuPorId().get(id); return p ? this.etiquetaSku(p) : `SKU #${id}`; }
  costoSku(id: number): number | null {
    const items = this.catalogo().items.filter(i => i.presentacion_id === id);
    if (!items.length || items.some(i => !this.materiasPorId().has(i.materia_prima_id))) return null;
    return items.reduce((s, i) => s + i.kg * this.materiasPorId().get(i.materia_prima_id)!.costo_kg, 0);
  }
  cantidadIngredientes(id: number): number { return this.catalogo().formulas.filter(f => f.presentacion_id === id).length; }
  nombreProducto(id: string): string { return this.productosPorId().get(id)?.nombre ?? id; }
  etiquetaTabla(t: string): string {
    return ({ producto: 'Producto', materia_prima: 'Materia prima', presentacion: 'SKU', formula_ingrediente: 'Fórmula',
      presentacion_item: 'Cantidad', empaque: 'Empaque', precio_historico: 'Precio histórico', costo_mano_obra: 'Mano de obra' } as Record<string, string>)[t] ?? t;
  }
  resumen(h: HistorialDB): string {
    const d = h.datos_nuevos ?? h.datos_anteriores ?? {};
    const parte = d['nombre'] ?? d['nombre_sku'] ?? (d['presentacion_id'] ? this.nombreSku(Number(d['presentacion_id'])) : h.registro_id);
    const m = d['materia_prima_id'] ? this.materiasPorId().get(Number(d['materia_prima_id']))?.nombre : null;
    return [parte, m, d['tipo']].filter(Boolean).join(' · ');
  }
  cambios(h: HistorialDB): string[] {
    if (h.accion !== 'UPDATE') return [];
    const antes = h.datos_anteriores ?? {}, despues = h.datos_nuevos ?? {};
    return Object.keys(despues).filter(k => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
      .map(k => `${k}: ${antes[k] ?? '—'} → ${despues[k] ?? '—'}`);
  }
  private normalizar(s: string): string { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
  private coincide(...campos: string[]): boolean {
    const texto = this.normalizar(campos.join(' '));
    return this.normalizar(this.busqueda()).split(/\s+/).every(p => texto.includes(p));
  }
  private mensaje(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String(e.message);
    return 'No se pudo completar la operación.';
  }
}
