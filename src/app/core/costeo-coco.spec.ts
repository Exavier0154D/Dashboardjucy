import {
  DESPERDICIO_AGUA_COCO,
  RENDIMIENTO_AGUA_COCO,
  REGLAS_EXTRACCION_COCO,
  cocoNecesario,
  revisarBaseCoco,
  valorarIngrediente,
} from './costeo-coco';
import { sumarCostoFinal } from './costos-calculos';
import { mapearCatalogo, TablasCatalogo } from './catalogo.mapper';
import { calcularMateriaPrimaMensual, calcularMateriaPrimaEnFecha } from './materia-prima-calculos';
import {
  calcularSerie,
  agregarCostosProduccion,
} from '../shared/historico-costos/historico-calculos';

function datos(): TablasCatalogo {
  return {
    materiasPrimas: [
      {
        id: 57,
        nombre: 'Coco',
        unidad: 'Kg',
        costo_kg: 0.35,
        costo_base_historico: 0.35,
        activo: true,
      },
    ],
    productos: [
      {
        id: 'catalogo-2026-b00a0c1d9779e618e5649392',
        nombre: 'Agua de Coco Original Jucy',
        categoria: 'Agua de Coco',
        marca: 'Jucy',
        variante: 'Original',
        fecha_revision: null,
        activo: true,
        producto_origen_id: null,
      },
    ],
    presentaciones: [
      {
        id: 3,
        producto_id: 'catalogo-2026-b00a0c1d9779e618e5649392',
        clave_sku: 'coco-2395',
        litros: 0.2395,
        codigo_barras: null,
        tecnologia: 'HPP',
        nombre_sku: 'Agua de Coco 239.5 ml',
        linea_producto: null,
        activo: true,
        estado_formulacion: 'escalada',
        presentacion_origen_id: 101,
        factor_escala: 0.997916666667,
      },
    ],
    formulas: [{ presentacion_id: 3, materia_prima_id: 57, porcentaje: 100 }],
    items: [
      {
        presentacion_id: 3,
        materia_prima_id: 57,
        kg: 1.088288,
        litros: 0.2395,
        costo_original: 0.381204166667,
      },
    ],
    empaques: [],
  };
}

describe('Extracción dinámica desde agua aprovechable y precio confirmado', () => {
  const materiales = [{ id: 57, nombre: 'Coco', costo_kg: 0.35 }];
  const precios = [
    { materia_prima_id: 57, semana: '2026-02-01', costo_kg: 0.24 },
    { materia_prima_id: 57, semana: '2026-02-15', costo_kg: 0.25 },
    { materia_prima_id: 57, semana: '2026-03-01', costo_kg: 0.23 },
    { materia_prima_id: 57, semana: '2026-03-15', costo_kg: 0.29 },
    { materia_prima_id: 57, semana: '2026-03-22', costo_kg: 0.22 },
  ];

  it('ejecuta 0.2395 / 0.22 × 0.35 en el catálogo, dejando el kg registrado solo como referencia', () => {
    const entrada = datos();
    const original = structuredClone(entrada);
    const p = mapearCatalogo(entrada).productos[0].presentaciones[0];
    expect(p.items[0].kgCosteo).toBeCloseTo(1.08863636363636, 12);
    expect(p.items[0].diferenciaKg).toBeCloseTo(1.08863636363636 - 1.088288, 12);
    expect(p.items[0].rendimientoAplicado).toBe(true);
    expect(p.totalCosto).toBeCloseTo(0.381022727272727, 12);
    expect(p.totalCosto!.toFixed(2)).toBe('0.38');
    expect(p.totalCosto).not.toBeCloseTo(1.088288 * 0.35, 8);
    expect(p.items[0].kg).toBe(1.088288);
    expect(entrada).toEqual(original);
    expect(revisarBaseCoco(p).confirmado).toBe(true);
  });

  it('350 ml a 0.20/kg cuestan 0.3181818 y se muestran como 0.32 aunque el kg registrado sea 0 o 99', () => {
    for (const kg of [0, 99, 1.5909090909]) {
      const entrada = datos();
      entrada.presentaciones[0].litros = 0.35;
      entrada.materiasPrimas[0].costo_kg = 0.2;
      entrada.items[0].kg = kg;
      const p = mapearCatalogo(entrada).productos[0].presentaciones[0];
      expect(p.items[0].kg).toBe(kg);
      expect(p.items[0].kgCosteo).toBeCloseTo(1.59090909090909, 12);
      expect(p.totalCosto).toBeCloseTo(0.318181818181818, 12);
      expect(p.totalCosto!.toFixed(2)).toBe('0.32');
      const enFecha = calcularMateriaPrimaEnFecha(
        p,
        '2026-01-01',
        [{ id: 57, nombre: 'Coco', costo_kg: 0.2 }],
        [],
      )!;
      expect(enFecha.costo).toBeCloseTo(0.318181818181818, 12);
      expect(enFecha.detalle[0].kgRegistrados).toBe(kg);
    }
  });

  it('usa precios de febrero y marzo sin tomar futuros, y coincide con el gráfico histórico', () => {
    const p = mapearCatalogo(datos()).productos[0].presentaciones[0];
    const febrero = calcularMateriaPrimaMensual(p, '2026-02', materiales, precios)!;
    const marzo = calcularMateriaPrimaMensual(p, '2026-03', materiales, precios)!;
    expect(febrero.costo).toBeCloseTo(0.272159090909091, 12);
    expect(marzo.costo).toBeCloseTo(0.2395, 12);
    expect(febrero.detalle[0].precioKg).toBe(0.25);
    expect(marzo.detalle[0].precioKg).toBe(0.22);
    expect(calcularMateriaPrimaEnFecha(p, '2026-03-01', materiales, precios)!.costo).toBeCloseTo(
      1.0886363636363636 * 0.23,
      12,
    );
    const serie = calcularSerie(
      ['2026-02-28', '2026-03-31'],
      [{ materia_prima_id: 57, kg: p.items[0].kg }],
      materiales,
      precios,
      p,
    );
    expect(serie.map((i) => i.costo)).toEqual([febrero.costo, marzo.costo]);
  });

  it('actualiza unidad y litro sin redondear los rubros, también en el histórico', () => {
    const p = mapearCatalogo(datos()).productos[0].presentaciones[0];
    const total = sumarCostoFinal(p.totalCosto, 0.16012, 0.0123005718, 0.0265, 0.448 / 12)!;
    expect(total).toBeCloseTo(0.381022727272727 + 0.16012 + 0.0123005718 + 0.0265 + 0.448 / 12, 12);
    expect(total.toFixed(2)).toBe('0.62');
    expect((total / p.litros).toFixed(2)).toBe('2.58');
    expect(total).not.toBe(0.38 + 0.16 + 0.04 + 0.01 + 0.03);
    const serie = calcularSerie(
      ['2026-01-01'],
      [{ materia_prima_id: 57, kg: 1.088288 }],
      materiales,
      [],
      p,
    );
    const [punto] = agregarCostosProduccion(
      serie,
      0.16012,
      [{ mes: '2026-01-01', costo_unitario: 0.0123005718 }],
      [{ mes: '2026-01-01', concepto: 'GIF', costo_unitario: 0.0265, estimado: true }],
      0.448 / 12,
    );
    expect(punto.total).toBe(total);
  });

  it('respeta densidad configurable y conserva el valor original sin precio de coco entero confirmado', () => {
    const entrada = datos();
    const p = mapearCatalogo(entrada, [{ ...REGLAS_EXTRACCION_COCO[0], densidadKgPorLitro: 1.03 }])
      .productos[0].presentaciones[0];
    expect(p.totalCosto).toBeCloseTo(((0.2395 * 1.03) / 0.22) * 0.35, 12);
    for (const reglas of [
      [],
      [{ ...REGLAS_EXTRACCION_COCO[0], precioCocoEnteroConfirmado: false }],
    ]) {
      const original = mapearCatalogo(entrada, reglas).productos[0].presentaciones[0];
      expect(original.totalCosto).toBeCloseTo(1.088288 * 0.35, 12);
      expect(revisarBaseCoco(original, reglas).confirmado).toBe(false);
    }
    expect(RENDIMIENTO_AGUA_COCO + DESPERDICIO_AGUA_COCO).toBe(1);
    expect(cocoNecesario(0.35, 1)).toBeCloseTo(1.59090909090909, 12);
    expect(() => cocoNecesario(0.35, 0)).toThrow();
  });

  it('no convierte el volumen total ni porcentajes de mezclas, y conserva los ingredientes sin coco', () => {
    const entrada = datos();
    entrada.materiasPrimas.push({
      id: 2,
      nombre: 'Azúcar',
      unidad: 'Kg',
      costo_kg: 2,
      costo_base_historico: 2,
      activo: true,
    });
    entrada.formulas[0].porcentaje = 80;
    entrada.formulas.push({ presentacion_id: 3, materia_prima_id: 2, porcentaje: 20 });
    entrada.items[0] = { ...entrada.items[0], kg: 0.4, litros: 0.08 };
    entrada.items.push({
      presentacion_id: 3,
      materia_prima_id: 2,
      kg: 0.01,
      litros: 0,
      costo_original: null,
    });
    entrada.presentaciones[0].litros = 0.5;
    const p = mapearCatalogo(entrada).productos[0].presentaciones[0];
    expect(p.totalCosto).toBeCloseTo(0.4 * 0.35 + 0.01 * 2, 12);
    expect(p.items.every((i) => !i.rendimientoAplicado)).toBe(true);
    expect(revisarBaseCoco(p).pendientes).toEqual([57]);
    const reglas = [{ ...REGLAS_EXTRACCION_COCO[0], aguaAprovechablePorPresentacion: { 3: 0.08 } }];
    const comprobada = mapearCatalogo(entrada, reglas).productos[0].presentaciones[0];
    expect(comprobada.totalCosto).toBeCloseTo((0.08 / 0.22) * 0.35 + 0.01 * 2, 12);
    expect(comprobada.items[1].costo).toBe(0.02);
    expect(
      valorarIngrediente(null, { materiaPrimaId: 2, ingrediente: 'Azúcar', kg: 0.01 }, 2).costo,
    ).toBe(0.02);
  });

  it('no aplica a agua ya extraída ni a otro producto sin confirmar, y no duplica al repetir', () => {
    for (const cambio of ['procesado', 'otro']) {
      const entrada = datos();
      if (cambio === 'procesado') entrada.materiasPrimas[0].nombre = 'Agua de coco';
      else {
        entrada.productos[0].id = 'otro';
        entrada.presentaciones[0].producto_id = 'otro';
      }
      const p = mapearCatalogo(entrada).productos[0].presentaciones[0];
      expect(p.totalCosto).toBeCloseTo(0.3809008, 12);
    }
    const p = mapearCatalogo(datos()).productos[0].presentaciones[0];
    const a = valorarIngrediente(p, p.items[0], 0.35);
    const b = valorarIngrediente(p, { ...p.items[0], kg: a.kgCosteo }, 0.35);
    expect(b.costo).toBe(a.costo);
    expect(revisarBaseCoco(null).confirmado).toBe(false);
  });
});
