import { TestBed } from '@angular/core/testing';
import { GastosIndirectos } from './gastos-indirectos';
import { CostosPresentacion } from '../../core/costos-produccion.service';
import { Producto, Presentacion } from '../../models/producto.model';

describe('Detalle de gastos indirectos', () => {
  const sku: Presentacion = {
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
  };
  const producto: Producto = {
    id: 'producto-1',
    nombre: 'Producto 1',
    categoria: 'Bebida',
    marca: 'Jucy',
    variante: '',
    activo: true,
    fechaRevision: '',
    productoOrigenId: null,
    ingredientes: [],
    presentaciones: [sku],
  };
  const datos: CostosPresentacion = {
    presentacionId: 1,
    costoEmpaque: 0.3,
    empaquePorProducto: false,
    costoCarton: 0,
    cartonAplica: false,
    cartonEstimado: false,
    cartonSinDato: false,
    empaqueEstimado: false,
    empaqueSinDato: false,
    manoObra: [],
    gastosIndirectos: [
      {
        mes: '2026-01-01',
        concepto: 'Energía',
        costo_unitario: 0.1,
        estimado: false,
        observacion: 'Fuente: enero.csv',
      },
      {
        mes: '2026-01-01',
        concepto: 'Servicios',
        costo_unitario: 0.2,
        estimado: true,
        observacion: 'Costo conservado',
      },
      {
        mes: '2026-02-01',
        concepto: 'Gastos indirectos de fabricación',
        costo_unitario: 0,
        estimado: false,
      },
    ],
    meses: ['2026-01', '2026-02'],
  };

  async function crear() {
    await TestBed.configureTestingModule({ imports: [GastosIndirectos] }).compileComponents();
    const fixture = TestBed.createComponent(GastosIndirectos);
    fixture.componentRef.setInput('producto', producto);
    fixture.componentRef.setInput('presentacion', sku);
    fixture.componentRef.setInput('datos', datos);
    fixture.componentRef.setInput('mes', '2026-01');
    await fixture.whenStable();
    return fixture;
  }

  it('muestra los meses, suma los conceptos y presenta observaciones y estimados', async () => {
    const fixture = await crear();
    expect(fixture.componentInstance.resumen()?.costo).toBeCloseTo(0.3);
    expect(fixture.nativeElement.textContent).toContain('2 meses registrados');
    expect(fixture.nativeElement.textContent).toContain('Fuente: enero.csv');
    expect(fixture.nativeElement.textContent).toContain('Incluye costos estimados');
    expect(fixture.nativeElement.querySelectorAll('.empty-state').length).toBe(0);
  });

  it('conserva los ceros y distingue un mes sin registro', async () => {
    const fixture = await crear();
    fixture.componentRef.setInput('mes', '2026-02');
    await fixture.whenStable();
    expect(fixture.componentInstance.resumen()?.costo).toBe(0);
    fixture.componentRef.setInput('mes', '2026-03');
    await fixture.whenStable();
    expect(fixture.componentInstance.resumen()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('El costo final queda pendiente');
  });

  it('emite selección de mes y actualización para compartir los datos con el estándar', async () => {
    const fixture = await crear();
    const mes = vi.fn(),
      actualizar = vi.fn();
    fixture.componentInstance.seleccionarMes.subscribe(mes);
    fixture.componentInstance.actualizar.subscribe(actualizar);
    fixture.nativeElement.querySelectorAll('.month-link')[1].click();
    fixture.nativeElement.querySelector('.indirectos-controls button').click();
    expect(mes).toHaveBeenCalledWith('2026-02');
    expect(actualizar).toHaveBeenCalledTimes(1);
  });

  it('no muestra datos de otra presentación y distingue los errores de una ausencia de registros', async () => {
    const fixture = await crear();
    fixture.componentRef.setInput('datos', { ...datos, presentacionId: 2 });
    fixture.componentRef.setInput('error', 'No se pudo leer gasto_indirecto');
    await fixture.whenStable();
    expect(fixture.componentInstance.registros()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'No se pudo leer',
    );
    expect(fixture.nativeElement.querySelectorAll('.empty-state').length).toBe(0);
  });
});
