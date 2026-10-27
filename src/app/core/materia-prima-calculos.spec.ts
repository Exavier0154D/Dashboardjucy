import {
  calcularMateriaPrimaMensual,
  calcularMateriaPrimaEnFecha,
  semanasDePrecios,
} from './materia-prima-calculos';

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

  it('multiplica kg de producción por el precio de cada semana sin convertir litros a kg', () => {
    const presentacion = {
      items: [
        {
          materiaPrimaId: 1,
          ingrediente: 'Coco',
          kg: 1.61312,
          litros: 0.355,
          costo: 999,
          costoOriginal: null,
        },
      ],
    };
    const preciosJunio = [
      { materia_prima_id: 1, semana: '2026-06-29', costo_kg: 0.35 },
      { materia_prima_id: 1, semana: '2026-06-08', costo_kg: 0.29 },
      { materia_prima_id: 1, semana: '2026-06-15', costo_kg: 0.29 },
      { materia_prima_id: 1, semana: '2026-06-22', costo_kg: 0.3 },
    ];
    const semanas = semanasDePrecios('2026-06', preciosJunio, new Set([1]));
    expect(semanas).toEqual(['2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29']);
    const costos = semanas.map((fecha) =>
      calcularMateriaPrimaEnFecha(presentacion, fecha, materiales, preciosJunio)!,
    );
    expect(costos[0].costo).toBeCloseTo(1.61312 * 0.29);
    expect(costos[2].costo).toBeCloseTo(1.61312 * 0.3);
    expect(costos[3].costo).toBeCloseTo(1.61312 * 0.35);
    expect(costos[3].detalle[0]).toMatchObject({
      kg: 1.61312,
      precioKg: 0.35,
      fechaPrecio: '2026-06-29',
    });
  });

  it('no aplica un precio futuro y mantiene precios cero o anteriores de otros ingredientes', () => {
    const resultado = calcularMateriaPrimaEnFecha(sku, '2026-02-08', materiales, precios)!;
    expect(resultado.costo).toBeCloseTo(2 * 0.24 + 0.1);
    expect(calcularMateriaPrimaEnFecha(sku, '2026-01-31', materiales, precios)?.costo).toBeCloseTo(
      0.5,
    );
    expect(
      calcularMateriaPrimaEnFecha(sku, '2026-02-08', materiales, [
        ...precios.filter((p) => p.semana !== '2026-02-08'),
        { materia_prima_id: 1, semana: '2026-02-08', costo_kg: 0 },
      ])?.costo,
    ).toBeCloseTo(0.1);
  });

  it('no oculta la quinta actualización y ofrece cuatro consultas si no hubo cambios', () => {
    const cinco = ['01', '08', '15', '22', '29'].map((dia) => ({
      materia_prima_id: 1,
      semana: `2026-06-${dia}`,
      costo_kg: 1,
    }));
    expect(semanasDePrecios('2026-06', cinco, new Set([1])).length).toBe(5);
    expect(semanasDePrecios('2026-06', cinco, new Set([2]))).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
    ]);
  });
});
