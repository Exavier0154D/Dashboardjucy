import { agregarCostosProduccion } from './historico-calculos';

describe('Gastos indirectos en el costo histórico', () => {
  it('mantiene cartón separado del empaque en cada fecha y no lo duplica en el total', () => {
    const [punto] = agregarCostosProduccion(
      [{ semana: '2026-01-15', costo: 1, conBase: 0 }],
      0.3,
      [{ mes: '2026-01-01', costo_unitario: 0.2 }],
      [{ mes: '2026-01-01', concepto: 'Energía', costo_unitario: 0.15, estimado: false }],
      0.1,
    );
    expect(punto.empaque).toBe(0.3);
    expect(punto.carton).toBe(0.1);
    expect(punto.subtotal).toBeCloseTo(1.4);
    expect(punto.total).toBeCloseTo(1.75);
  });
  it('suma solo el mes de cada fecha y deja pendientes los meses sin datos', () => {
    const serie = ['2025-12-31', '2026-01-01', '2026-01-31', '2026-02-01', '2026-03-01'].map(
      (semana) => ({ semana, costo: 1, conBase: 0 }),
    );
    const puntos = agregarCostosProduccion(
      serie,
      0.3,
      [{ mes: '2025-12-01', costo_unitario: 0.2 }],
      [
        { mes: '2026-01-01', concepto: 'Energía', costo_unitario: 0.1, estimado: false },
        { mes: '2026-01-01', concepto: 'Agua', costo_unitario: 0.05, estimado: true },
        { mes: '2026-02-01', concepto: 'Energía', costo_unitario: 0, estimado: false },
      ],
    );
    expect(puntos[0].total).toBeNull();
    expect(puntos[1].total).toBeCloseTo(1.65);
    expect(puntos[2].total).toBeCloseTo(1.65);
    expect(puntos[1].indirectosEstimados).toBe(true);
    expect(puntos[3].indirectos).toBe(0);
    expect(puntos[3].total).toBeCloseTo(1.5);
    expect(puntos[4].total).toBeNull();
  });

  it('mantiene el total pendiente si falta mano de obra aunque existan indirectos', () => {
    const [punto] = agregarCostosProduccion(
      [{ semana: '2026-01-15', costo: 1, conBase: 0 }],
      0.3,
      [],
      [{ mes: '2026-01-01', concepto: 'Energía', costo_unitario: 0.1, estimado: false }],
    );
    expect(punto.indirectos).toBe(0.1);
    expect(punto.total).toBeNull();
  });
});
