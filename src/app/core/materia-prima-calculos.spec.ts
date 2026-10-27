import { calcularMateriaPrimaMensual } from './materia-prima-calculos';

describe('Materia prima al cierre de cada mes', () => {
  const sku = {
    items: [
      { materiaPrimaId: 1, ingrediente: 'Coco', kg: 2, litros: 2, costo: 999, costoOriginal: 999 },
      { materiaPrimaId: 2, ingrediente: 'Agua', kg: 1, litros: 1, costo: 999, costoOriginal: null },
    ],
  };
  const materiales = [
    { id: 1, nombre: 'Coco', costo_kg: 0.2 },
    { id: 2, nombre: 'Agua', costo_kg: 0.1 },
  ];
  // Desordenados para verificar que importa la fecha y no el orden de lectura.
  const precios = [
    { materia_prima_id: 1, semana: '2026-03-01', costo_kg: 0.23 },
    { materia_prima_id: 1, semana: '2026-02-15', costo_kg: 0.25 },
    { materia_prima_id: 1, semana: '2026-02-01', costo_kg: 0.24 },
    { materia_prima_id: 1, semana: '2026-02-08', costo_kg: 0.24 },
  ];

  it('usa el último cambio dentro del mes y no el costo fijo u original del catálogo', () => {
    const febrero = calcularMateriaPrimaMensual(sku, '2026-02', materiales, precios)!;
    const marzo = calcularMateriaPrimaMensual(sku, '2026-03', materiales, precios)!;
    expect(febrero.costo).toBeCloseTo(0.6);
    expect(febrero.porMateria.get(1)).toBeCloseTo(0.5);
    expect(marzo.costo).toBeCloseTo(0.56);
  });

  it('usa base antes del primer registro y conserva precios anteriores sin tomar futuros', () => {
    expect(calcularMateriaPrimaMensual(sku, '2026-01', materiales, precios)?.costo).toBeCloseTo(
      0.5,
    );
    expect(calcularMateriaPrimaMensual(sku, '2026-04', materiales, precios)?.costo).toBeCloseTo(
      0.56,
    );
  });

  it('conserva precios cero y resuelve el último día de febrero bisiesto', () => {
    const historico = [
      { materia_prima_id: 1, semana: '2024-02-29', costo_kg: 0 },
      { materia_prima_id: 1, semana: '2024-03-01', costo_kg: 10 },
    ];
    expect(calcularMateriaPrimaMensual(sku, '2024-02', materiales, historico)?.costo).toBeCloseTo(
      0.1,
    );
  });

  it('deja pendiente una presentación sin cantidades y rechaza duplicados', () => {
    expect(calcularMateriaPrimaMensual({ items: [] }, '2026-02', materiales, precios)).toBeNull();
    expect(() =>
      calcularMateriaPrimaMensual(sku, '2026-02', materiales, [...precios, precios[0]]),
    ).toThrow(/duplicado/);
  });
});
