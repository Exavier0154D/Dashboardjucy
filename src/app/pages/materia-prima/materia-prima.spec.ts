import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MateriaPrima } from './materia-prima';
import { DataService } from '../../core/data.service';
import { SelectionService } from '../../core/selection.service';
import { Empaque } from '../../models/empaque.model';
import { MateriaPrima as Insumo, Presentacion, Producto } from '../../models/producto.model';

describe('Materia prima con ingredientes y envases', () => {
  let fixture: ComponentFixture<MateriaPrima>;
  const sku: Presentacion = {
    id: 1,
    productoId: 'coco',
    claveSku: 'coco-355',
    litros: 0.355,
    codigoBarras: '1234',
    tecnologia: 'HPP',
    nombreSku: 'Agua de coco 355 ml',
    lineaProducto: null,
    activo: true,
    estadoFormulacion: 'copiada',
    presentacionOrigenId: null,
    factorEscala: null,
    ingredientes: [],
    items: [],
    totalKg: 0.355,
    totalLitros: 0.355,
    totalCosto: 0.8,
  };
  const producto: Producto = {
    id: 'coco',
    nombre: 'Agua de coco Jucy',
    categoria: 'Agua de Coco',
    marca: 'Jucy',
    variante: 'Original',
    activo: true,
    fechaRevision: '',
    productoOrigenId: null,
    ingredientes: [],
    presentaciones: [sku],
  };
  const envase = (
    id: number,
    tipo: Empaque['tipo'],
    costo: number,
    estado: Empaque['estado'],
  ): Empaque => ({
    id,
    tipo,
    costo,
    estado,
    presentacionId: 1,
    productoId: 'coco',
    unidad: 'Unidad',
    litros: 0.355,
    tecnologia: 'HPP',
    productoOrigenId: null,
  });
  const datos = {
    productos: signal([producto]),
    materiasPrimas: signal<Insumo[]>([
      { id: 1, nombre: 'Agua', unidad: 'kg', costoKg: 2.5, costoBaseHistorico: null, activo: true },
    ]),
    empaques: signal([
      envase(1, 'Botella', 0.1, 'confirmado'),
      envase(2, 'Tap', 0, 'confirmado'),
      envase(3, 'Cartón', 0, 'sin_dato'),
    ]),
    cargando: signal(false),
    cargado: signal(true),
    error: signal<string | null>(null),
    actualizarAhora: vi.fn().mockResolvedValue(true),
    mesesPreciosDisponibles: () => ['2025-12', '2026-01'],
  };

  beforeEach(async () => {
    datos.materiasPrimas.set([
      { id: 1, nombre: 'Agua', unidad: 'kg', costoKg: 2.5, costoBaseHistorico: null, activo: true },
    ]);
    datos.productos.set([producto]);
    datos.empaques.set([
      envase(1, 'Botella', 0.1, 'confirmado'),
      envase(2, 'Tap', 0, 'confirmado'),
      envase(3, 'Cartón', 0, 'sin_dato'),
    ]);
    await TestBed.configureTestingModule({
      imports: [MateriaPrima],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { vista: 'materias' } } } },
        { provide: DataService, useValue: datos },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MateriaPrima);
    fixture.detectChanges();
    await fixture.whenStable();
  });
  function mostrarEnvases() {
    (
      fixture.nativeElement.querySelectorAll('.material-tabs button')[1] as HTMLButtonElement
    ).click();
    fixture.detectChanges();
  }

  it('calcula variaciones solo con bases positivas y alerta aumentos activos superiores al 10 %', () => {
    const component = fixture.componentInstance;
    const base = datos.materiasPrimas()[0];
    expect(component.variacionMateria(base)).toBeNull();
    expect(component.variacionMateria({ ...base, costoBaseHistorico: 0 })).toBeNull();
    expect(component.variacionMateria({ ...base, costoBaseHistorico: 5 })).toBe(-50);
    expect(component.estadoMateria({ ...base, costoKg: 11, costoBaseHistorico: 10 })).toBe(
      'Activo',
    );
    expect(component.estadoMateria({ ...base, costoBaseHistorico: 2 })).toBe('Alerta de costo');
    expect(component.estadoMateria({ ...base, costoBaseHistorico: 2, activo: false })).toBe(
      'Inactivo',
    );
  });

  it('combina búsqueda, categoría asociada y estado, y ordena sin mutar el catálogo', () => {
    const component = fixture.componentInstance;
    const base = datos.materiasPrimas()[0];
    datos.materiasPrimas.set([base, { ...base, id: 2, nombre: 'Azúcar', costoKg: 4 }]);
    datos.productos.set([
      {
        ...producto,
        presentaciones: [
          {
            ...sku,
            ingredientes: [{ materiaPrimaId: 2, nombre: 'Azúcar', unidad: 'kg', porcentaje: 100 }],
          },
        ],
      },
    ]);
    component.categoriaIngrediente.set('Agua de Coco');
    component.buscarMateriaPrima('azucar');
    component.estadoIngrediente.set('Activo');
    expect(component.materiasPrimasFiltradas().map((m) => m.id)).toEqual([2]);
    component.estadoIngrediente.set('Alerta de costo');
    expect(component.materiasPrimasFiltradas()).toEqual([]);
    component.limpiarFiltrosMateria();
    component.ordenIngredientes.set('precio-desc');
    expect(component.materiasPrimasFiltradas().map((m) => m.id)).toEqual([2, 1]);
    expect(datos.materiasPrimas().map((m) => m.id)).toEqual([1, 2]);
  });

  it('exporta solo ingredientes filtrados, conserva cero y escapa texto y fórmulas CSV', () => {
    const component = fixture.componentInstance;
    const base = datos.materiasPrimas()[0];
    datos.materiasPrimas.set([base, { ...base, id: 2, nombre: '=Agua,"especial"', costoKg: 0 }]);
    component.buscarMateriaPrima('especial');
    let contenido: unknown[] = [];
    const crearUrl = vi.fn().mockReturnValue('blob:export-test');
    const urlOriginal = URL;
    vi.stubGlobal(
      'URL',
      class extends urlOriginal {
        static override createObjectURL = crearUrl;
        static override revokeObjectURL = vi.fn();
      },
    );
    vi.stubGlobal(
      'Blob',
      class {
        constructor(partes: unknown[]) {
          contenido = partes;
        }
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      component.exportarMateriales();
      const csv = contenido.join('');
      expect(csv).toContain('"\'=Agua,""especial"""');
      expect(csv).toContain('"kg","0"');
      expect(csv).not.toContain('"2.5"');
      expect(click).toHaveBeenCalledOnce();
      expect(component.exportacionMensaje()).toBe('1 registros exportados');
      vi.runAllTimers();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export-test');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      click.mockRestore();
    }
  });

  it('abre materia prima directamente con el catálogo antes de los gráficos', () => {
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('h1')?.textContent).toBe('Materia prima');
    expect(html.querySelector('table')?.textContent).toContain('Precio de formulacion por kg');
    expect(html.querySelector('app-historico-costos')).toBeNull();
    expect(html.querySelector('details')?.open).toBe(false);
  });

  it('muestra envases por unidad y distingue un costo pendiente de un cero confirmado', () => {
    mostrarEnvases();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('table')?.textContent).toContain('Precio por unidad');
    expect(html.querySelector('table')?.textContent).toContain('Pendiente');
    expect(html.querySelector('table')?.textContent).toContain('$0.0000');
    expect(html.querySelectorAll('tbody tr').length).toBe(3);
    expect(datos.materiasPrimas().length).toBe(1);
    expect(producto.presentaciones[0].totalCosto).toBe(0.8);
  });

  it('filtra cartones pendientes y restablece la página al cambiar de filtro', () => {
    mostrarEnvases();
    fixture.componentInstance.paginaEnvases.set(5);
    const selects = fixture.nativeElement.querySelectorAll(
      '.filter-row select',
    ) as NodeListOf<HTMLSelectElement>;
    selects[0].value = 'Cartón';
    selects[0].dispatchEvent(new Event('change'));
    selects[1].value = 'sin_dato';
    selects[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelector('tbody')?.textContent).toContain('Cartón');
    expect(fixture.componentInstance.paginaEnvasesActual()).toBe(1);
  });

  it('abre el producto y la presentación asociados al envase', () => {
    mostrarEnvases();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (fixture.nativeElement.querySelector('.group-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.row-action') as HTMLButtonElement).click();
    expect(navegar).toHaveBeenCalledWith(['/materia-prima']);
    expect(TestBed.inject(SelectionService).presentacionSeleccionada()?.id).toBe(1);
  });

  it('encuentra las tapas con el nombre que se muestra en la interfaz', () => {
    mostrarEnvases();
    const buscar = fixture.nativeElement.querySelector(
      '.material-controls input',
    ) as HTMLInputElement;
    buscar.value = 'tapa';
    buscar.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelector('tbody')?.textContent).toContain('Tapa');
  });

  it('permite elegir año y mes desde la búsqueda y conserva el período al abrir y volver', async () => {
    fixture.componentInstance.cambiarVista('productos');
    fixture.detectChanges();
    await fixture.whenStable();
    const selects = fixture.nativeElement.querySelectorAll(
      '[aria-label="Período de costos"] select',
    ) as NodeListOf<HTMLSelectElement>;
    selects[0].value = '2025';
    selects[0].dispatchEvent(new Event('change'));
    await fixture.whenStable();
    selects[1].value = '12';
    selects[1].dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.mesConsulta()).toBe('2025-12');
    expect(fixture.componentInstance.productosFiltrados()).toEqual([producto]);
    fixture.componentInstance.seleccionarProducto(producto);
    const seleccion = TestBed.inject(SelectionService);
    expect(seleccion.mesCostosSeleccionado()).toBe('2025-12');
    expect(seleccion.presentacionSeleccionada()?.id).toBe(sku.id);
    fixture.componentInstance.volverProductos();
    fixture.componentInstance.limpiarFiltrosProducto();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.mesConsulta()).toBe('2025-12');
    expect(
      (
        fixture.nativeElement.querySelector(
          '[aria-label="Período de costos"] select',
        ) as HTMLSelectElement
      ).value,
    ).toBe('2025');
  });

  it('permite seleccionar una presentación y abrir sus costos', async () => {
    const segundoSku: Presentacion = {
      ...sku,
      id: 2,
      litros: 1,
      tecnologia: 'UHT',
      nombreSku: 'Agua de coco 1000 ml',
    };
    datos.productos.set([{ ...producto, presentaciones: [sku, segundoSku] }]);
    fixture.componentInstance.cambiarVista('productos');
    fixture.detectChanges();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const selector = await loader.getHarness(
      MatSelectHarness.with({ selector: '.presentation-select' }),
    );
    await selector.open();
    await selector.clickOptions({ text: '1.000 ml · UHT' });
    expect(await selector.getValueText()).toContain('1.000 ml · UHT');
    const abrir = fixture.nativeElement.querySelector(
      '.product-card .primary-button',
    ) as HTMLButtonElement;
    abrir.click();
    expect(TestBed.inject(SelectionService).presentacionSeleccionada()?.id).toBe(2);
  });

  it('muestra el nombre inferior como título único de cada tarjeta', async () => {
    datos.productos.set([
      producto,
      {
        ...producto,
        id: 'pitahaya',
        nombre: 'Agua de coco con pitahaya Prunus',
        marca: 'Prunus',
        variante: 'Y Pitahaya',
        presentaciones: [{ ...sku, id: 2, productoId: 'pitahaya' }],
      },
      {
        ...producto,
        id: 'cafe',
        nombre: 'Café Frío Sweet & Coffee',
        categoria: 'Lacteos',
        marca: 'Sweet & Coffee',
        variante: 'Café Frío',
        presentaciones: [{ ...sku, id: 3, productoId: 'cafe' }],
      },
    ]);
    fixture.componentInstance.cambiarVista('productos');
    fixture.detectChanges();
    await fixture.whenStable();

    const tarjetas = fixture.nativeElement.querySelectorAll(
      '.product-card',
    ) as NodeListOf<HTMLElement>;
    expect(tarjetas.length).toBe(3);
    expect(tarjetas[0].querySelector('h2')?.textContent).toBe('Agua de Coco · Jucy');
    expect(tarjetas[1].querySelector('h2')?.textContent).toBe('Agua de Coco con Pitahaya · Prunus');
    expect(tarjetas[2].querySelector('h2')?.textContent).toBe('Café Frío Sweet & Coffee');
    expect(tarjetas[0].querySelector('.category-tag')?.getAttribute('data-category')).toBe(
      'Agua de Coco',
    );
    expect(tarjetas[1].querySelector('.category-tag')?.getAttribute('data-category')).toBe(
      'Agua de Coco',
    );
    expect(tarjetas[2].querySelector('.category-tag')?.getAttribute('data-category')).toBe(
      'Lacteos',
    );
    expect(fixture.nativeElement.querySelector('.product-name')).toBeNull();
  });

  it('unifica botellas del mismo tamaño y permite consultar los dos precios originales', () => {
    const otroSku: Presentacion = { ...sku, id: 2, productoId: 'otro', tecnologia: 'UHT' };
    datos.productos.set([
      producto,
      { ...producto, id: 'otro', nombre: 'Otra marca de coco', presentaciones: [otroSku] },
    ]);
    datos.empaques.update((actual) => [
      ...actual,
      {
        ...envase(4, 'Botella', 0.12, 'confirmado'),
        presentacionId: 2,
        productoId: 'otro',
        tecnologia: 'UHT',
      },
    ]);
    mostrarEnvases();
    expect(fixture.nativeElement.querySelectorAll('.group-toggle').length).toBe(3);
    const resumen = fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;
    expect(resumen.textContent).toContain('2 productos');
    expect(resumen.textContent).toContain('$0.1000');
    expect(resumen.textContent).toContain('$0.1200');
    (resumen.querySelector('.group-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.group-detail-item').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.group-detail')?.textContent).toContain(
      'Otra marca de coco',
    );
    expect(fixture.nativeElement.querySelector('.group-detail')?.textContent).toContain('UHT');
    expect(datos.empaques().length).toBe(4);
    expect(producto.presentaciones[0].totalCosto).toBe(0.8);
  });
});
