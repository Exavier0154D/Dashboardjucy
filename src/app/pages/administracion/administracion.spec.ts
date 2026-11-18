import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CatalogoAdminService, CatalogoAdmin, EmpaqueDB } from '../../core/catalogo-admin.service';
import { DataService } from '../../core/data.service';
import { Administracion } from './administracion';
import { CostosEstandarService } from '../../core/costos-estandar.service';
import { signal } from '@angular/core';
import { CostosProduccionService } from '../../core/costos-produccion.service';

describe('Vista de costos estándar', () => {
  const costos = { materiaPrima: 0.38, empaque: 0.16, carton: 0.04, manoObra: 0.01, gif: 0.03 };
  const disponible = signal(true);
  beforeEach(async () => {
    disponible.set(true);
    await TestBed.configureTestingModule({
      imports: [Administracion],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: CatalogoAdminService, useValue: {} },
        { provide: DataService, useValue: {} },
        {
          provide: CostosEstandarService,
          useValue: {
            cargar: vi.fn().mockResolvedValue(costos),
            guardar: vi.fn(),
            disponible,
            disponiblePara: () => disponible(),
          },
        },
        { provide: CostosProduccionService, useValue: {} },
      ],
    }).compileComponents();
  });

  async function vista(editor: boolean) {
    const fixture = TestBed.createComponent(Administracion);
    const c = fixture.componentInstance;
    c.periodoEstandar.set('base');
    c.catalogo.set({
      materias: [],
      productos: [],
      formulas: [],
      items: [],
      empaques: [],
      presentaciones: [
        {
          id: 1,
          litros: 0.5,
          nombre_sku: 'Bebida 500 ml',
          clave_sku: 'bebida-500',
          tecnologia: 'HPP',
        },
      ] as CatalogoAdmin['presentaciones'],
    });
    c.pestana.set('estandar');
    c.editor.set(editor);
    await c.seleccionarEstandar(1);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra los costos y totales en consulta sin ofrecer el guardado', async () => {
    const fixture = await vista(false);
    const panel: HTMLElement = fixture.nativeElement.querySelector('.estandar-panel');
    expect(panel.textContent).toContain('$0.6200');
    expect(panel.textContent).toContain('$1.2400');
    expect(panel.querySelector('button[type="submit"]')).toBeNull();
    expect(panel.querySelector('fieldset')?.disabled).toBe(true);
    expect(panel.querySelector('mat-select')?.classList.contains('toolbar__select')).toBe(false);
  });

  it('explica el bloqueo y desactiva edición y guardado mientras la tabla está pendiente', async () => {
    disponible.set(false);
    const fixture = await vista(true);
    const panel: HTMLElement = fixture.nativeElement.querySelector('.estandar-panel');
    expect(panel.textContent).toContain('El guardado aún no está habilitado');
    expect(panel.querySelector('fieldset')?.disabled).toBe(true);
    expect((panel.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('muestra el mes editable y el botón de guardar del período elegido', async () => {
    const fixture = await vista(true);
    await fixture.componentInstance.cambiarPeriodoEstandar('mes');
    await fixture.componentInstance.cambiarMesEstandar('2026-07');
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.estandar-panel');
    expect((panel.querySelector('input[type="month"]') as HTMLInputElement).value).toBe('2026-07');
    expect(panel.textContent).toContain('julio de 2026');
    expect(panel.querySelector('button[type="submit"]')?.textContent).toContain('Guardar mes');
  });

  it('filtra desde el buscador y conserva la presentación que se está editando', async () => {
    const fixture = await vista(true);
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.estandar-buscador input');
    input.value = 'producto inexistente';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.opcionesSkuEstandar()).toEqual([]);
    expect(fixture.componentInstance.skuEstandar()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Tu selección actual se conserva');
    expect(fixture.nativeElement.textContent).toContain('No hay presentaciones que coincidan');
    const limpiar = fixture.nativeElement.querySelector('.estandar-limpiar') as HTMLButtonElement;
    limpiar.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.opcionesSkuEstandar().length).toBe(1);
    expect(fixture.componentInstance.formEstandar.controls.empaque.value).toBe(costos.empaque);
  });

  it('abre en modo mensual y mantiene los filtros secundarios cerrados', () => {
    const fixture = TestBed.createComponent(Administracion);
    fixture.componentInstance.pestana.set('estandar');
    fixture.detectChanges();
    expect(fixture.componentInstance.periodoEstandar()).toBe('mes');
    expect(fixture.nativeElement.querySelector('input[type="month"]')).not.toBeNull();
    expect(
      (fixture.nativeElement.querySelector('.estandar-filtros-extra') as HTMLDetailsElement).open,
    ).toBe(false);
  });

  it('filtra Productos de Administración por categoría y búsqueda, sin categorías en Materias primas', async () => {
    const fixture = await vista(true);
    const c = fixture.componentInstance;
    c.catalogo.update((catalogo) => ({
      ...catalogo,
      productos: [
        {
          id: 'coco',
          nombre: 'Agua de Coco',
          categoria: 'Agua de Coco',
          marca: 'Jucy',
          variante: 'Original',
          activo: true,
          fecha_revision: null,
          producto_origen_id: null,
        },
        {
          id: 'leche',
          nombre: 'Leche',
          categoria: 'Lacteos',
          marca: 'Jucy',
          variante: 'Natural',
          activo: true,
          fecha_revision: null,
          producto_origen_id: null,
        },
      ],
      materias: [
        {
          id: 1,
          nombre: 'Azúcar',
          unidad: 'kg',
          costo_kg: 1,
          costo_base_historico: null,
          activo: true,
        },
      ],
    }));
    c.cambiarPestana('productos');
    fixture.detectChanges();
    const categorias: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.admin-categorias-productos button'),
    );
    categorias.find((b) => b.textContent?.includes('Lacteos'))!.click();
    fixture.detectChanges();
    expect(c.productosFiltrados().map((p) => p.id)).toEqual(['leche']);
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    input.value = 'inexistente';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(c.productosFiltrados()).toEqual([]);
    c.cambiarPestana('materias');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-categorias-productos')).toBeNull();
    const materiaInput: HTMLInputElement =
      fixture.nativeElement.querySelector('input[type="search"]');
    materiaInput.value = 'azucar';
    materiaInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(c.materiasFiltradas().map((m) => m.id)).toEqual([1]);
  });

  it('muestra la coincidencia y carga sus costos automáticamente al escribir', async () => {
    const fixture = await vista(true);
    const c = fixture.componentInstance;
    c.catalogo.update((catalogo) => ({
      ...catalogo,
      presentaciones: [
        ...catalogo.presentaciones,
        {
          ...catalogo.presentaciones[0],
          id: 2,
          litros: 1,
          nombre_sku: 'Bebida 1 litro',
          clave_sku: 'bebida-1',
        },
      ],
    }));
    fixture.detectChanges();
    const buscador: HTMLInputElement = fixture.nativeElement.querySelector(
      '.estandar-buscador input',
    );
    buscador.value = 'Bebida 1 litro';
    buscador.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(c.busquedaSkuEstandar()).toBe('Bebida 1 litro');
    expect(c.opcionesSkuEstandar().map((p) => p.id)).toEqual([2]);
    expect(fixture.nativeElement.querySelectorAll('.estandar-resultado').length).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();
    expect(c.skuEstandar()).toBe(2);
    expect(c.litroEstandar()).toBeCloseTo(0.62);
    expect(buscador.value).toBe('Bebida 1 litro');
  });

  it('conserva las ediciones pendientes cuando la búsqueda coincide con otro producto', async () => {
    const fixture = await vista(true);
    const c = fixture.componentInstance;
    c.catalogo.update((catalogo) => ({
      ...catalogo,
      presentaciones: [
        ...catalogo.presentaciones,
        { ...catalogo.presentaciones[0], id: 2, nombre_sku: 'Bebida grande', litros: 2 },
      ],
    }));
    c.formEstandar.controls.empaque.setValue(9);
    c.formEstandar.markAsDirty();
    c.buscarSkuParaCostos('grande');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(c.skuEstandar()).toBe(1);
    expect(c.formEstandar.controls.empaque.value).toBe(9);
  });
});

describe('Búsqueda de presentaciones para editar costos', () => {
  let c: Administracion;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogoAdminService, useValue: {} },
        { provide: DataService, useValue: {} },
        { provide: CostosEstandarService, useValue: {} },
        { provide: CostosProduccionService, useValue: {} },
      ],
    });
    c = TestBed.runInInjectionContext(() => new Administracion());
    c.catalogo.set({
      materias: [],
      formulas: [],
      items: [],
      empaques: [],
      productos: [
        { id: 'coco', nombre: 'Agua de Coco', categoria: 'Agua de Coco', marca: 'Jucy' },
        { id: 'nectar', nombre: 'Néctar de piña', categoria: 'Nectar', marca: 'Otra' },
      ] as CatalogoAdmin['productos'],
      presentaciones: [
        {
          id: 1,
          producto_id: 'coco',
          nombre_sku: 'Coco 2 litros',
          litros: 2,
          tecnologia: 'HPP',
          clave_sku: 'coco-2',
          codigo_barras: '7860001234',
        },
        {
          id: 2,
          producto_id: 'coco',
          nombre_sku: 'Coco 500 ml',
          litros: 0.5,
          tecnologia: 'UHT',
          clave_sku: 'coco-500',
          codigo_barras: null,
        },
        {
          id: 3,
          producto_id: 'nectar',
          nombre_sku: 'Piña 1 litro',
          litros: 1,
          tecnologia: 'HTST',
          clave_sku: 'pina-1',
          codigo_barras: '7860009999',
        },
      ] as CatalogoAdmin['presentaciones'],
    });
  });

  it('busca por nombre, marca, código de barras y volumen sin depender de tildes', () => {
    c.busquedaSkuEstandar.set('nectar pina');
    expect(c.opcionesSkuEstandar().map((p) => p.id)).toEqual([3]);
    c.busquedaSkuEstandar.set('7860001234');
    expect(c.opcionesSkuEstandar().map((p) => p.id)).toEqual([1]);
    c.busquedaSkuEstandar.set('jucy 500 ml');
    expect(c.opcionesSkuEstandar().map((p) => p.id)).toEqual([2]);
  });

  it('combina los filtros y los limpia sin perder el mes ni los cambios pendientes', () => {
    c.skuEstandar.set(1);
    c.mesEstandar.set('2026-07');
    c.formEstandar.controls.empaque.setValue(9);
    c.categoriaSkuEstandar.set('Agua de Coco');
    c.marcaSkuEstandar.set('Jucy');
    c.tecnologiaSkuEstandar.set('UHT');
    expect(c.opcionesSkuEstandar().map((p) => p.id)).toEqual([2]);
    expect(c.seleccionFueraFiltroEstandar()).toBe(true);
    c.limpiarFiltrosEstandar();
    expect(c.opcionesSkuEstandar().length).toBe(3);
    expect(c.skuEstandar()).toBe(1);
    expect(c.mesEstandar()).toBe('2026-07');
    expect(c.formEstandar.controls.empaque.value).toBe(9);
  });
});

describe('Eliminación desde administración', () => {
  const empaque: EmpaqueDB = {
    id: 7,
    presentacion_id: 3,
    tipo: 'Botella',
    costo: 1,
    estado: 'confirmado',
    producto_origen_id: null,
  };
  const catalogo: CatalogoAdmin = {
    productos: [],
    materias: [],
    presentaciones: [],
    formulas: [],
    items: [],
    empaques: [empaque],
  };
  let component: Administracion;
  let api: { eliminarRegistro: ReturnType<typeof vi.fn>; cargarCatalogo: ReturnType<typeof vi.fn> };
  let actualizar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    api = {
      eliminarRegistro: vi.fn().mockResolvedValue(undefined),
      cargarCatalogo: vi.fn().mockResolvedValue({ ...catalogo, empaques: [] }),
    };
    actualizar = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: CatalogoAdminService, useValue: api },
        { provide: DataService, useValue: { actualizarAhora: actualizar } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new Administracion());
    component.catalogo.set(catalogo);
    component.editor.set(true);
    component.editarEmpaque(empaque);
  });
  afterEach(() => vi.restoreAllMocks());

  it('exige acceso de editor y confirmación antes de eliminar', async () => {
    component.editor.set(false);
    await component.eliminarActual();
    expect(component.confirmacion()).toBeNull();
    component.editor.set(true);
    await component.eliminarActual();
    expect(component.confirmacion()).not.toBeNull();
    await component.cancelarConfirmacion();
    expect(api.eliminarRegistro).not.toHaveBeenCalled();
    expect(component.editando()).toBe('empaques');
  });

  it('elimina el registro existente aunque el formulario tenga cambios inválidos y actualiza el dashboard', async () => {
    component.formEmpaque.controls.costo.setValue(-1);
    await component.eliminarActual();
    await component.confirmarEliminacion();
    expect(api.eliminarRegistro).toHaveBeenCalledWith('empaque', 7);
    expect(actualizar).toHaveBeenCalledOnce();
    expect(component.empaques()).toEqual([]);
    expect(component.editando()).toBeNull();
    expect(component.aviso()).toBe('Registro eliminado.');
  });

  it('conserva el formulario y muestra el error cuando la base de datos rechaza la eliminación', async () => {
    api.eliminarRegistro.mockRejectedValue(new Error('Registro en uso'));
    await component.eliminarActual();
    await component.confirmarEliminacion();
    expect(component.error()).toBe('Registro en uso');
    expect(component.editando()).toBe('empaques');
    expect(component.guardando()).toBe(false);
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('bloquea productos con SKU y materias primas usadas en cantidades', async () => {
    component.catalogo.set({
      ...catalogo,
      presentaciones: [{ id: 3, producto_id: 'p' } as CatalogoAdmin['presentaciones'][number]],
      items: [{ presentacion_id: 3, materia_prima_id: 9, kg: 1, litros: 0, costo_original: null }],
    });
    component.editando.set('productos');
    component.formProducto.controls.id.setValue('p');
    await component.eliminarActual();
    expect(component.error()).toContain('SKU');
    component.editando.set('materias');
    component.formMateria.controls.id.setValue(9);
    await component.eliminarActual();
    expect(component.error()).toContain('en uso');
    expect(api.eliminarRegistro).not.toHaveBeenCalled();
    expect(component.confirmacion()).toBeNull();
  });
});

describe('Costos estándar desde Administración', () => {
  const costos = { materiaPrima: 0.38, empaque: 0.16, carton: 0.04, manoObra: 0.01, gif: 0.03 };
  let component: Administracion;
  let cargar: ReturnType<typeof vi.fn>;
  let guardar: ReturnType<typeof vi.fn>;
  const disponible = signal(true);
  let referencia: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    cargar = vi.fn().mockResolvedValue(costos);
    guardar = vi.fn().mockResolvedValue(undefined);
    disponible.set(true);
    referencia = vi.fn().mockResolvedValue({
      costoEmpaque: 0.2,
      costoCarton: 0.03,
      empaqueSinDato: false,
      cartonSinDato: false,
      manoObra: [{ mes: '2026-01-01', costo_unitario: 0.01 }],
      gastosIndirectos: [
        { mes: '2026-01-01', concepto: 'Energía', costo_unitario: 0.02, estimado: false },
      ],
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: CatalogoAdminService, useValue: {} },
        {
          provide: DataService,
          useValue: {
            productos: () => [{ presentaciones: [{ id: 1 }] }],
            materiaPrimaDelMes: vi.fn().mockReturnValue({ costo: 0.45 }),
          },
        },
        {
          provide: CostosEstandarService,
          useValue: {
            cargar,
            guardar,
            disponible,
            disponiblePara: () => disponible(),
            obtener: () => costos,
          },
        },
        { provide: CostosProduccionService, useValue: { cargar: referencia } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new Administracion());
    component.periodoEstandar.set('base');
    component.catalogo.set({
      materias: [],
      productos: [],
      formulas: [],
      items: [],
      empaques: [],
      presentaciones: [
        { id: 1, litros: 0.5 },
        { id: 2, litros: 1 },
      ] as CatalogoAdmin['presentaciones'],
    });
  });

  it('carga los cinco costos y permite guardar solo con permiso de editor', async () => {
    await component.seleccionarEstandar(1);
    expect(component.totalEstandar()).toBeCloseTo(0.62);
    expect(component.litroEstandar()).toBeCloseTo(1.24);
    await component.guardarEstandar();
    expect(guardar).not.toHaveBeenCalled();
    component.editor.set(true);
    await component.seleccionarEstandar(1);
    expect(component.formEstandar.getRawValue()).toEqual(costos);
    expect(component.totalEstandar()).toBeCloseTo(0.62);
    expect(component.litroEstandar()).toBeCloseTo(1.24);
    await component.guardarEstandar();
    expect(guardar).toHaveBeenCalledWith(1, costos);
  });

  it('rechaza negativos y conserva los cambios ante errores del servidor', async () => {
    component.editor.set(true);
    await component.seleccionarEstandar(1);
    component.formEstandar.controls.empaque.setValue(-1);
    await component.guardarEstandar();
    expect(guardar).not.toHaveBeenCalled();
    component.formEstandar.controls.empaque.setValue(2);
    guardar.mockRejectedValue(new Error('No autorizado'));
    await component.guardarEstandar();
    expect(component.errorEstandar()).toBe('No autorizado');
    expect(component.formEstandar.controls.empaque.value).toBe(2);
    expect(component.guardando()).toBe(false);
  });

  it('descarta una carga anterior al cambiar de presentación', async () => {
    let resolver!: (valor: typeof costos) => void;
    cargar.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    const anterior = component.seleccionarEstandar(1);
    await component.seleccionarEstandar(2);
    resolver({ ...costos, empaque: 9 });
    await anterior;
    expect(component.skuEstandar()).toBe(2);
    expect(component.formEstandar.controls.empaque.value).toBe(0.16);
  });

  it('precarga la referencia actual y mantiene en blanco los rubros sin dato', async () => {
    cargar.mockResolvedValue(null);
    await component.seleccionarEstandar(1);
    expect(referencia).toHaveBeenCalledWith(1);
    expect(component.formEstandar.getRawValue()).toEqual({
      materiaPrima: null,
      empaque: 0.2,
      carton: 0.03,
      manoObra: 0.01,
      gif: 0.02,
    });
    expect(component.totalEstandar()).toBeNull();
    expect(component.origenEstandar()).toBe('catalogo');
  });

  it('bloquea el guardado cuando falta habilitar el almacenamiento', async () => {
    component.editor.set(true);
    disponible.set(false);
    await component.seleccionarEstandar(1);
    await component.guardarEstandar();
    expect(guardar).not.toHaveBeenCalled();
    expect(component.totalEstandar()).toBeCloseTo(0.62);
  });

  it('oculta los datos anteriores cuando falla una carga y permite reintentar', async () => {
    await component.seleccionarEstandar(1);
    cargar.mockRejectedValueOnce(new Error('Sin conexión'));
    await component.seleccionarEstandar(2);
    expect(component.estandarListo()).toBe(false);
    expect(component.totalEstandar()).toBeNull();
    expect(component.errorEstandar()).toBe('Sin conexión');
    await component.seleccionarEstandar(2);
    expect(component.estandarListo()).toBe(true);
    expect(component.errorEstandar()).toBe('');
  });

  it('guarda el período seleccionado y vuelve a cargar la base al cambiar de modo', async () => {
    component.editor.set(true);
    await component.seleccionarEstandar(1);
    await component.cambiarPeriodoEstandar('mes');
    await component.cambiarMesEstandar('2026-07');
    expect(cargar).toHaveBeenLastCalledWith(1, '2026-07');
    await component.guardarEstandar();
    expect(guardar).toHaveBeenLastCalledWith(1, costos, '2026-07');
    expect(component.aviso()).toContain('julio de 2026');
    await component.cambiarPeriodoEstandar('base');
    expect(cargar).toHaveBeenLastCalledWith(1);
  });

  it('impide que un mes vacío termine guardándose como base fija', async () => {
    component.editor.set(true);
    await component.seleccionarEstandar(1);
    await component.cambiarPeriodoEstandar('mes');
    await component.cambiarMesEstandar('');
    expect(component.estandarListo()).toBe(false);
    await component.guardarEstandar();
    expect(guardar).not.toHaveBeenCalled();
    expect(component.errorEstandar()).toContain('mes válido');
  });

  it('precarga los costos del mes elegido en lugar de tomar la primera mano de obra', async () => {
    cargar.mockResolvedValue(null);
    referencia.mockResolvedValue({
      costoEmpaque: 0.2,
      costoCarton: 0.03,
      empaqueSinDato: false,
      cartonSinDato: false,
      manoObra: [
        { mes: '2026-01-01', costo_unitario: 0.01 },
        { mes: '2026-07-01', costo_unitario: 0.09 },
      ],
      gastosIndirectos: [
        { mes: '2026-07-01', concepto: 'Energía', costo_unitario: 0.08, estimado: false },
      ],
    });
    await component.cambiarPeriodoEstandar('mes');
    await component.cambiarMesEstandar('2026-07');
    await component.seleccionarEstandar(1);
    expect(TestBed.inject(DataService).materiaPrimaDelMes).toHaveBeenCalledWith(
      { id: 1 },
      '2026-07',
    );
    expect(component.formEstandar.getRawValue()).toEqual({
      materiaPrima: 0.45,
      empaque: 0.2,
      carton: 0.03,
      manoObra: 0.09,
      gif: 0.08,
    });
  });

  it('descarta la respuesta de un mes anterior al cambiar de período', async () => {
    await component.seleccionarEstandar(1);
    await component.cambiarPeriodoEstandar('mes');
    let resolver!: (valor: typeof costos) => void;
    cargar.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    const anterior = component.cambiarMesEstandar('2026-07');
    await component.cambiarMesEstandar('2026-08');
    resolver({ ...costos, empaque: 9 });
    await anterior;
    expect(component.mesEdicion()).toBe('2026-08');
    expect(component.formEstandar.controls.empaque.value).toBe(costos.empaque);
  });
});
