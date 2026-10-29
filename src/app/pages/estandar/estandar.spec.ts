import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CostosPresentacion, CostosProduccionService } from '../../core/costos-produccion.service';
import { SelectionService } from '../../core/selection.service';
import { Presentacion } from '../../models/producto.model';
import { Estandar } from './estandar';
import { DataService } from '../../core/data.service';

describe('Costo final del estándar', () => {
  let component: Estandar;
  const costos: CostosPresentacion = {
    presentacionId: 1,
    costoEmpaque: 0.3,
    empaquePorProducto: false,
    costoCarton: 0,
    cartonAplica: false,
    cartonEstimado: false,
    cartonSinDato: false,
    empaqueEstimado: false,
    empaqueSinDato: false,
    manoObra: [{ mes: '2026-01-01', costo_unitario: 0.2 }],
    gastosIndirectos: [
      { mes: '2026-01-01', concepto: 'Energía', costo_unitario: 0.1, estimado: false },
      { mes: '2026-01-01', concepto: 'Agua', costo_unitario: 0.05, estimado: true },
      { mes: '2026-02-01', concepto: 'Energía', costo_unitario: 0, estimado: false },
    ],
    meses: ['2026-01', '2026-02', '2026-03'],
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Estandar],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: CostosProduccionService, useValue: {} },
        {
          provide: DataService,
          useValue: {
            materiaPrimaEnFecha: () => ({ costo: 1, detalle: [] }),
            semanasMateriaPrima: (_skus: Presentacion[], mes: string) =>
              mes ? ['01', '08', '15', '22'].map((dia) => `${mes}-${dia}`) : [],
            mesesMateriaPrima: () => [],
          },
        },
      ],
    });
    TestBed.overrideComponent(Estandar, { set: { template: '' } });
    TestBed.inject(SelectionService).presentacionSeleccionada.set({
      id: 1,
      productoId: 'producto-1',
      claveSku: 'sku-1',
      litros: 1,
      codigoBarras: null,
      tecnologia: 'HPP',
      nombreSku: 'Producto 1',
      lineaProducto: null,
      activo: true,
      estadoFormulacion: 'copiada',
      presentacionOrigenId: null,
      factorEscala: null,
      ingredientes: [],
      items: [],
      totalKg: 1,
      totalLitros: 1,
      totalCosto: 1,
    } satisfies Presentacion);
    const fixture = TestBed.createComponent(Estandar);
    component = fixture.componentInstance;
    await fixture.whenStable();
    component.costos.set(costos);
    component.mesSeleccionado.set('2026-01');
  });

  it('suma todos los conceptos del mes una sola vez al costo del SKU', () => {
    expect(component.costoGastosIndirectos()).toBeCloseTo(0.15);
    expect(component.costoFinal()).toBeCloseTo(1.65);
    expect(component.gastosIndirectosDelMes()?.estimado).toBe(true);
  });

  it('marca como referencia solo septiembre a diciembre de 2026', () => {
    for (let mes = 1; mes <= 12; mes++) {
      expect(component.esCostoReferencia(`2026-${String(mes).padStart(2, '0')}`)).toBe(mes >= 9);
    }
    expect(component.esCostoReferencia('2025-09')).toBe(false);
    expect(component.esCostoReferencia('2027-09')).toBe(false);
  });

  it('recalcula al cambiar el mes y conserva un cero registrado', () => {
    component.cambiarMes('2026-02');
    expect(component.costoGastosIndirectos()).toBe(0);
    expect(component.costoFinal()).toBeCloseTo(1.5);
    component.cambiarMes('2026-03');
    expect(component.costoGastosIndirectos()).toBeNull();
    expect(component.costoFinal()).toBeNull();
    expect(component.costoPreliminar()).toBeCloseTo(1.3);
  });

  it('no aplica los gastos cargados de otra presentación', () => {
    component.costos.set({ ...costos, presentacionId: 2 });
    expect(component.costoFinal()).toBeNull();
  });

  it('revalora la materia prima y el total al cambiar de mes', () => {
    const valorar = vi
      .spyOn(TestBed.inject(DataService), 'materiaPrimaEnFecha')
      .mockImplementation((_sku, fecha) => ({
        costo: fecha.startsWith('2026-01') ? 1 : 0.8,
        porMateria: new Map(),
        detalle: [],
      }));
    expect(component.costoMateriaPrima()).toBe(1);
    component.cambiarMes('2026-02');
    expect(component.costoMateriaPrima()).toBe(0.8);
    expect(component.totalCosto()).toBe(0.8);
    expect(component.costoFinal()).toBeCloseTo(1.3);
    expect(valorar).toHaveBeenLastCalledWith(component.presentacionActual(), '2026-02-01');
  });

  it('recalcula el costo final al elegir otra semana del mismo mes', () => {
    vi.spyOn(TestBed.inject(DataService), 'materiaPrimaEnFecha').mockImplementation(
      (_sku, fecha) => ({
        costo: fecha.endsWith('-08') ? 0.8 : 1,
        porMateria: new Map(),
        detalle: [],
      }),
    );
    expect(component.costoFinal()).toBeCloseTo(1.65);
    component.cambiarSemana('2026-01-08');
    expect(component.costoMateriaPrima()).toBe(0.8);
    expect(component.costoFinal()).toBeCloseTo(1.45);
    expect(component.costoGastosIndirectos()).toBeCloseTo(0.15);
    component.cambiarMes('2026-02');
    expect(component.semanaSeleccionada()).toBe('2026-02-01');
  });

  it('presenta cartón aparte y lo suma una sola vez al total', () => {
    component.costos.set({ ...costos, costoCarton: 0.1, cartonAplica: true });
    expect(component.costoEmpaque()).toBe(0.3);
    expect(component.costoCarton()).toBe(0.1);
    expect(component.costoPreliminar()).toBeCloseTo(1.4);
    expect(component.costoFinal()).toBeCloseTo(1.75);
  });
});
