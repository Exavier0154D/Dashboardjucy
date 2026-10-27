import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DataService } from '../../core/data.service';
import { CostosPresentacion, CostosProduccionService } from '../../core/costos-produccion.service';
import { SelectionService } from '../../core/selection.service';
import { calcularMateriaPrimaEnFecha, semanasDePrecios } from '../../core/materia-prima-calculos';
import { Presentacion, Producto } from '../../models/producto.model';
import { Estandar } from './estandar';

describe('Períodos visibles y cálculo del estándar', () => {
  it('sincroniza los selectores cuando llegan opciones y al cambiar de mes o semana', async () => {
    const materiales = [{ id: 57, nombre: 'Coco', costo_kg: 0.35 }];
    const precios = [
      { materia_prima_id: 57, semana: '2026-01-01', costo_kg: 0.24 },
      { materia_prima_id: 57, semana: '2026-01-20', costo_kg: 0.26 },
      { materia_prima_id: 57, semana: '2026-08-22', costo_kg: 0.32 },
    ];
    const meses = signal<string[]>([]);
    const sku: Presentacion = {
      id: 5,
      productoId: 'coco',
      claveSku: 'coco-355',
      litros: 0.355,
      codigoBarras: null,
      tecnologia: 'HPP',
      nombreSku: 'Coco 355 ml',
      lineaProducto: null,
      activo: true,
      estadoFormulacion: 'copiada',
      presentacionOrigenId: null,
      factorEscala: null,
      ingredientes: [{ materiaPrimaId: 57, nombre: 'Coco', unidad: 'kg', porcentaje: 100 }],
      items: [
        {
          materiaPrimaId: 57,
          ingrediente: 'Coco',
          kg: 1.61312,
          litros: 0.355,
          costo: 0.565,
          costoOriginal: 0.565,
        },
      ],
      totalKg: 1.61312,
      totalLitros: 0.355,
      totalCosto: 0.565,
    };
    const producto: Producto = {
      id: 'coco',
      nombre: 'Agua de Coco',
      categoria: 'Agua de Coco',
      marca: 'Jucy',
      variante: 'Original',
      activo: true,
      fechaRevision: '',
      productoOrigenId: null,
      ingredientes: sku.ingredientes,
      presentaciones: [sku],
    };
    TestBed.configureTestingModule({
      imports: [Estandar],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: CostosProduccionService, useValue: {} },
        {
          provide: DataService,
          useValue: {
            mesesMateriaPrima: () => meses(),
            semanasMateriaPrima: (_skus: Presentacion[], mes: string) =>
              semanasDePrecios(mes, precios, new Set([57])),
            materiaPrimaEnFecha: (p: Presentacion, fecha: string) =>
              calcularMateriaPrimaEnFecha(p, fecha, materiales, precios),
          },
        },
      ],
    });
    TestBed.inject(SelectionService).seleccionarProducto(producto);
    TestBed.inject(SelectionService).seleccionarMesCostos('2026-01');
    const fixture = TestBed.createComponent(Estandar);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    expect(component.mesSeleccionado()).toBe('2026-01');
    component.mesSeleccionado.set('2026-10');
    await fixture.whenStable();
    // El valor del modelo existe antes de que lleguen las opciones del selector.
    meses.set(['2026-01', '2026-08', '2026-10']);
    component.costos.set({
      presentacionId: 5,
      costoEmpaque: 0,
      costoCarton: 0,
      cartonAplica: false,
      cartonEstimado: false,
      cartonSinDato: false,
      empaquePorProducto: false,
      empaqueEstimado: false,
      empaqueSinDato: false,
      manoObra: [],
      gastosIndirectos: [],
      meses: ['2026-01', '2026-08', '2026-10'],
    } satisfies CostosPresentacion);
    await fixture.whenStable();
    const selects = fixture.nativeElement.querySelectorAll(
      '.cost-controls select',
    ) as NodeListOf<HTMLSelectElement>;
    expect(selects[0].value).toBe('2026-10');
    expect(selects[1].value).toBe(component.semanaSeleccionada());
    selects[0].value = '2026-01';
    selects[0].dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(component.mesSeleccionado()).toBe('2026-01');
    expect(selects[1].value).toBe('2026-01-01');
    expect(component.costoMateriaPrima()).toBeCloseTo(1.61312 * 0.24, 8);
    expect(
      fixture.nativeElement.querySelector('.cost-lines .cost-line__value').textContent,
    ).toContain('0.3871');
    selects[1].value = '2026-01-20';
    selects[1].dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(component.semanaSeleccionada()).toBe(selects[1].value);
    expect(component.costoMateriaPrima()).toBeCloseTo(1.61312 * 0.26, 8);
    component.cambiarMes('2026-10');
    await fixture.whenStable();
    expect(selects[0].value).toBe('2026-10');
    expect(selects[1].value).toBe('2026-10-01');
    expect(component.costoMateriaPrima()).toBeCloseTo(1.61312 * 0.32, 8);
  });
});
