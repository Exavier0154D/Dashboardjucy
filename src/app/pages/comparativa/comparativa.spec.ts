import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataService } from '../../core/data.service';
import { CostosPresentacion, CostosProduccionService } from '../../core/costos-produccion.service';
import { Producto, Presentacion } from '../../models/producto.model';

import { Comparativa } from './comparativa';

describe('Comparativa', () => {
  let component: Comparativa;
  let fixture: ComponentFixture<Comparativa>;
  const sku: Presentacion = {
    id: 1, productoId: 'producto-1', claveSku: 'sku-1', litros: 0.5,
    codigoBarras: null, tecnologia: 'HPP', nombreSku: 'Bebida 500 ml',
    lineaProducto: null, activo: true, estadoFormulacion: 'copiada',
    presentacionOrigenId: null, factorEscala: null,
    ingredientes: [], items: [], totalKg: 0.5, totalLitros: 0.5, totalCosto: 1
  };
  const producto: Producto = {
    id: 'producto-1', nombre: 'Bebida', categoria: 'Bebida', marca: 'Jucy',
    variante: '', activo: true, fechaRevision: '', productoOrigenId: null,
    ingredientes: [], presentaciones: [sku]
  };
  const costos: CostosPresentacion = {
    presentacionId: 1, costoEmpaque: 0.3, empaquePorProducto: false,
    empaqueEstimado: false, empaqueSinDato: false,
    manoObra: [
      { mes: '2026-01-01', costo_unitario: 0.2 },
      { mes: '2026-02-01', costo_unitario: 0.4 }
    ],
    gastosIndirectos: [
      { mes: '2026-01-01', concepto: 'Energía', costo_unitario: 0.1, estimado: false },
      { mes: '2026-02-01', concepto: 'Energía', costo_unitario: 0, estimado: false }
    ], meses: ['2026-01', '2026-02', '2026-03']
  };
  let cargar: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    cargar = vi.fn().mockResolvedValue(costos);
    await TestBed.configureTestingModule({
      imports: [Comparativa],
      providers: [
        { provide: DataService, useValue: {
          productos: signal([producto]), cargando: signal(false),
          cargado: signal(true), error: signal(null)
        } },
        { provide: CostosProduccionService, useValue: { cargar } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Comparativa);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('muestra cada mes del rango con sus propios costos y cuenta SKU únicos', async () => {
    component.mesDesde.set('2026-01');
    component.mesHasta.set('2026-03');
    await fixture.whenStable();
    const filas = component.filas();
    expect(filas.map(f => f.mes)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(filas[0].totalUnidad).toBeCloseTo(1.6);
    expect(filas[0].totalLitro).toBeCloseTo(3.2);
    expect(filas[1].gif).toBe(0);
    expect(filas[1].totalUnidad).toBeCloseTo(1.7);
    expect(filas[2].manoObra).toBe(0.4);
    expect(filas[2].gif).toBeNull();
    expect(filas[2].totalUnidad).toBeNull();
    expect(component.resumen()).toEqual({ productos: 1, sku: 1, calculados: 2, observados: 1 });
    expect(cargar).toHaveBeenCalledTimes(1);
    expect(component.filasPorSku().length).toBe(1);
    expect(component.filasPorSku()[0].meses.map(f => f.mes)).toEqual(['2026-01', '2026-02', '2026-03']);
    const tabla: HTMLTableElement = fixture.nativeElement.querySelector('.monthly-report');
    expect(tabla.querySelectorAll(':scope > tbody > tr:not(.formula-row)').length).toBe(1);
    expect(tabla.querySelectorAll('.month-heading').length).toBe(3);
    expect(tabla.querySelectorAll(':scope > tbody > tr:first-child > td.total').length).toBe(6);
    expect(tabla.querySelector('.formula-row > td')?.getAttribute('colspan')).toBe('20');
    expect(fixture.nativeElement.textContent).toContain('febrero de 2026');
  });

  it('incluye ambos extremos al cruzar de año y permite un solo mes', () => {
    component.mesDesde.set('2025-12');
    component.mesHasta.set('2026-02');
    expect(component.mesesDelRango()).toEqual(['2025-12', '2026-01', '2026-02']);
    component.mesDesde.set('2026-02');
    expect(component.filas().length).toBe(1);
  });

  it('no genera filas para rangos invertidos, vacíos o inválidos', async () => {
    component.mesDesde.set('2026-03');
    component.mesHasta.set('2026-01');
    await fixture.whenStable();
    expect(component.rangoInvalido()).toBe(true);
    expect(component.filas()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Corrige el rango');
    component.mesDesde.set('');
    expect(component.mesesDelRango()).toEqual([]);
    component.mesDesde.set('2026-13');
    expect(component.mesesDelRango()).toEqual([]);
  });

  it('abre y restablece el rango de meses con gastos cargados', () => {
    expect(component.mesesDelRango()).toEqual(['2026-01', '2026-02']);
    component.mesDesde.set('2026-01');
    component.mesHasta.set('2026-03');
    component.limpiarFiltros();
    expect(component.mesesDelRango()).toEqual(['2026-01', '2026-02']);
  });

  it('conserva el rango elegido por el usuario al recargar', async () => {
    component.cambiarDesde('2026-02');
    component.cambiarHasta('2026-03');
    component.reintentarCostos();
    await fixture.whenStable();
    expect(component.mesesDelRango()).toEqual(['2026-02', '2026-03']);
  });
});
