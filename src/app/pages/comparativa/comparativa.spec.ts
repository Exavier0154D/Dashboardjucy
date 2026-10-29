import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataService } from '../../core/data.service';
import { SelectionService } from '../../core/selection.service';
import { CostosPresentacion, CostosProduccionService } from '../../core/costos-produccion.service';
import { Producto, Presentacion } from '../../models/producto.model';
import { Comparativa } from './comparativa';

const sku: Presentacion = {
  id: 1,
  productoId: 'producto-1',
  claveSku: 'sku-1',
  litros: 0.5,
  codigoBarras: null,
  tecnologia: 'HPP',
  nombreSku: 'Bebida 500 ml',
  lineaProducto: null,
  activo: true,
  estadoFormulacion: 'copiada',
  presentacionOrigenId: null,
  factorEscala: null,
  ingredientes: [],
  items: [],
  totalKg: 0.5,
  totalLitros: 0.5,
  totalCosto: 1,
};
const producto: Producto = {
  id: 'producto-1',
  nombre: 'Bebida',
  categoria: 'Bebida',
  marca: 'Jucy',
  variante: '',
  activo: true,
  fechaRevision: '',
  productoOrigenId: null,
  ingredientes: [],
  presentaciones: [sku],
};
const costos: CostosPresentacion = {
  presentacionId: 1,
  costoEmpaque: 0.3,
  costoCarton: 0.1,
  cartonAplica: true,
  cartonEstimado: false,
  cartonSinDato: false,
  empaquePorProducto: false,
  empaqueEstimado: false,
  empaqueSinDato: false,
  manoObra: [
    { mes: '2026-01-01', costo_unitario: 0.2 },
    { mes: '2026-02-01', costo_unitario: 0.4 },
  ],
  gastosIndirectos: [
    { mes: '2026-01-01', concepto: 'Energía', costo_unitario: 0.1, estimado: false },
    { mes: '2026-02-01', concepto: 'Energía', costo_unitario: 0, estimado: false },
  ],
  meses: ['2026-01', '2026-02', '2026-03'],
};

describe('Comparativa con el estándar', () => {
  let fixture: ComponentFixture<Comparativa>;
  let component: Comparativa;
  let cargar: ReturnType<typeof vi.fn>;
  let actualizar: ReturnType<typeof vi.fn>;
  const productos = signal<Producto[]>([]);

  function agregar(mes: string): void {
    component.mesPendiente.set(mes);
    component.agregarMes();
  }

  beforeEach(async () => {
    productos.set([producto]);
    cargar = vi.fn().mockResolvedValue(costos);
    actualizar = vi.fn().mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [Comparativa],
      providers: [
        {
          provide: DataService,
          useValue: {
            productos,
            cargando: signal(false),
            cargado: signal(true),
            error: signal(null),
            materiaPrimaDelMes: (_sku: Presentacion, mes: string) => ({
              costo: mes === '2026-01' ? 1 : 0.8,
            }),
            mesesMateriaPrima: () =>
              Array.from({ length: 8 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
            actualizarAhora: actualizar,
          },
        },
        { provide: CostosProduccionService, useValue: { cargar } },
      ],
    }).compileComponents();
    TestBed.inject(SelectionService).seleccionarMesCostos('2026-01');
    fixture = TestBed.createComponent(Comparativa);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('compara cada mes con la misma base e incluye cartón una sola vez', async () => {
    agregar('2026-02');
    await fixture.whenStable();
    expect(component.estandar().valores.total).toBeCloseTo(1.7);
    const febrero = component.comparaciones()[0].valores;
    expect(febrero.total).toBeCloseTo(1.6);
    expect(febrero.litro).toBeCloseTo(3.2);
    expect(febrero.gif).toBe(0);
    expect(component.diferencia(febrero.total, component.estandar().valores.total)).toBeCloseTo(
      -0.1,
    );
    expect(component.porcentaje(febrero.total, component.estandar().valores.total)).toBeCloseTo(
      -5.88235,
    );
    expect(cargar).toHaveBeenCalledTimes(1);
    const tabla: HTMLTableElement = fixture.nativeElement.querySelector('table');
    expect(tabla.querySelectorAll('thead th').length).toBe(3);
    expect(tabla.textContent).toContain('febrero de 2026');
    expect(tabla.querySelector('.decrease')).not.toBeNull();
  });

  it('limita a cuatro meses independientes y habilita agregar al quitar uno', async () => {
    ['2026-01', '2026-02', '2026-04', '2026-06', '2026-08'].forEach(agregar);
    expect(component.mesesSeleccionados()).toEqual(['2026-01', '2026-02', '2026-04', '2026-06']);
    expect(component.mensajeMes()).toContain('máximo de 4');
    await fixture.whenStable();
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector('.month-entry button');
    expect(boton.disabled).toBe(true);
    fixture.nativeElement.querySelector('.month-chip').click();
    await fixture.whenStable();
    expect(boton.disabled).toBe(false);
    agregar('2026-08');
    expect(component.mesesSeleccionados().length).toBe(4);
    expect(component.mesesSeleccionados()).toContain('2026-08');
  });

  it('rechaza meses duplicados, invalidos y sin registros', () => {
    ['', '2026-13', '0000-01', '2026-09', '2026-12', '2025-01'].forEach(agregar);
    expect(component.mesesSeleccionados()).toEqual([]);
    agregar('2026-02');
    agregar('2026-02');
    expect(component.mesesSeleccionados()).toEqual(['2026-02']);
    expect(component.mensajeMes()).toContain('ya está incluido');
  });

  it('mantiene la base fija y permite comparar enero', async () => {
    agregar('2026-01');
    const base = component.estandar();
    TestBed.inject(SelectionService).seleccionarMesCostos('2026-08');
    await fixture.whenStable();
    expect(component.estandar()).toEqual(base);
    expect(component.mesesSeleccionados()).toEqual(['2026-01']);
    expect(fixture.nativeElement.querySelector('input[type="month"]')).toBeNull();
  });

  it('ofrece solo enero a agosto aunque el servicio extienda los meses', async () => {
    cargar.mockResolvedValue({ ...costos, meses: ['2026-01', '2026-09', '2026-12'] });
    await component.actualizar();
    await fixture.whenStable();
    expect(component.mesesDisponibles()).toEqual(
      Array.from({ length: 8 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
    );
    expect(fixture.nativeElement.querySelectorAll('.month-entry select option').length).toBe(9);
    agregar('2026-09');
    expect(component.mesesSeleccionados()).toEqual([]);
  });

  it('admite registros de nuevos años sin modificar la base', async () => {
    agregar('2026-02');
    const base = component.estandar();
    cargar.mockResolvedValue({
      ...costos,
      manoObra: [...costos.manoObra, { mes: '2027-01-01', costo_unitario: 5 }],
    });
    await component.actualizar();
    await fixture.whenStable();
    expect(component.aniosDisponibles()).toEqual(['2026', '2027']);
    component.mesPendiente.set('2026-03');
    component.cambiarAnio('2027');
    expect(component.mesPendiente()).toBe('');
    expect(component.mesesDisponibles()).toEqual(['2027-01']);
    agregar('2027-01');
    expect(component.mesesSeleccionados()).toEqual(['2026-02', '2027-01']);
    expect(component.estandar()).toEqual(base);
  });

  it('no trata información faltante como cero ni divide por una base cero', async () => {
    agregar('2026-03');
    await fixture.whenStable();
    expect(component.comparaciones()[0].valores.total).toBeNull();
    expect(component.comparaciones()[0].avisos).toContain('Sin gastos indirectos para este mes.');
    expect(component.diferencia(null, 1)).toBeNull();
    expect(component.porcentaje(1, null)).toBeNull();
    expect(component.porcentaje(1, 0)).toBeNull();
    expect(component.diferencia(0, 0)).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Sin dato');
  });

  it('no publica un total cuando el empaque está incompleto', async () => {
    cargar.mockResolvedValue({ ...costos, empaqueSinDato: true });
    await component.actualizar();
    await fixture.whenStable();
    expect(component.estandar().valores.total).toBeNull();
    expect(component.estandar().avisos).toContain('Empaque incompleto.');
  });

  it('conserva los meses al actualizar y muestra los errores de actualización', async () => {
    agregar('2026-02');
    await component.actualizar();
    await fixture.whenStable();
    expect(component.estandar().valores.total).toBeCloseTo(1.7);
    expect(component.mesesSeleccionados()).toEqual(['2026-02']);
    expect(cargar).toHaveBeenCalledTimes(2);
    actualizar.mockResolvedValue(false);
    await component.actualizar();
    expect(component.error()).toContain('No se pudieron actualizar');
  });

  it('muestra un estado vacío sin productos activos', async () => {
    productos.set([]);
    await fixture.whenStable();
    expect(component.costos()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No hay productos disponibles');
  });

  it('busca por nombre, SKU, volumen y tecnología sin distinguir tildes ni mayúsculas', async () => {
    productos.set([
      producto,
      {
        ...producto,
        id: 'limon',
        nombre: 'Limón',
        presentaciones: [
          {
            ...sku,
            id: 2,
            claveSku: 'LIM-1000',
            nombreSku: 'Botella familiar',
            litros: 1,
            tecnologia: 'UHT',
          },
        ],
      },
    ]);
    await fixture.whenStable();
    const cargasAntesDeBuscar = cargar.mock.calls.length;
    for (const consulta of ['LIMON', 'familiar', 'lim 1000', '1000 ml UHT']) {
      component.busquedaProducto.set(consulta);
      expect(component.opcionesFiltradas().map((o) => o.presentacion.id)).toEqual([2]);
    }
    component.busquedaProducto.set('inexistente');
    await fixture.whenStable();
    expect(component.opcionesFiltradas()).toEqual([]);
    expect(component.opcion()?.presentacion.id).toBe(1);
    expect(cargar).toHaveBeenCalledTimes(cargasAntesDeBuscar);
  });

  it('selecciona un resultado del buscador con el teclado y carga sus costos', async () => {
    productos.set([
      { ...producto, presentaciones: [sku, { ...sku, id: 2, claveSku: 'otro-sku' }] },
    ]);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.product-search input');
    input.focus();
    input.value = 'otro-sku';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(document.querySelector('mat-option')?.textContent).toContain('otro-sku');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }),
    );
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    await fixture.whenStable();
    expect(component.opcion()?.presentacion.id).toBe(2);
    expect(TestBed.inject(SelectionService).presentacionSeleccionada()?.id).toBe(2);
    expect(cargar).toHaveBeenLastCalledWith(2);
    expect(component.busquedaProducto()).toBeNull();
  });

  it('descarta respuestas antiguas al cambiar de presentación', async () => {
    let resolver!: (datos: CostosPresentacion) => void;
    cargar.mockImplementationOnce(
      () =>
        new Promise<CostosPresentacion>((resolve) => {
          resolver = resolve;
        }),
    );
    productos.set([{ ...producto, presentaciones: [sku, { ...sku, id: 2 }, { ...sku, id: 3 }] }]);
    component.seleccionarSku('2');
    fixture.detectChanges();
    cargar.mockResolvedValue({ ...costos, presentacionId: 3, costoEmpaque: 9 });
    component.seleccionarSku('3');
    fixture.detectChanges();
    await fixture.whenStable();
    resolver({ ...costos, presentacionId: 2 });
    await fixture.whenStable();
    expect(component.costos()?.presentacionId).toBe(3);
    expect(component.estandar().valores.empaque).toBe(9);
  });
});
