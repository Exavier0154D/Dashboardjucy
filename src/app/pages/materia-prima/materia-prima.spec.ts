import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { MateriaPrima } from './materia-prima';
import { DataService } from '../../core/data.service';
import { SelectionService } from '../../core/selection.service';
import { Empaque } from '../../models/empaque.model';
import { Presentacion, Producto } from '../../models/producto.model';

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
    materiasPrimas: signal([
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

  it('abre materia prima directamente con el catálogo antes de los gráficos', () => {
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('h1')?.textContent).toBe('Materia prima');
    expect(html.querySelector('table')?.textContent).toContain('Precio por kg');
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

    const tarjetas = fixture.nativeElement.querySelectorAll('.product-card') as NodeListOf<HTMLElement>;
    expect(tarjetas.length).toBe(3);
    expect(tarjetas[0].querySelector('h2')?.textContent).toBe('Agua de Coco · Jucy');
    expect(tarjetas[1].querySelector('h2')?.textContent).toBe('Agua de Coco · Prunus');
    expect(tarjetas[2].querySelector('h2')?.textContent).toBe('Café Frío Sweet & Coffee');
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
