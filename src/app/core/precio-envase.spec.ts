import { precioUnitarioEnvase, unidadesPaqueteEnvase } from './precio-envase';
import { mapearCatalogo, type TablasCatalogo } from './catalogo.mapper';
import { calcularEmpaque } from './costos-calculos';

function tablas(litros: number, costo: number, estado = 'confirmado'): TablasCatalogo {
  return {
    materiasPrimas: [],
    formulas: [],
    items: [],
    productos: [
      {
        id: 'p',
        nombre: 'Coco',
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
        id: 1,
        producto_id: 'p',
        clave_sku: 'coco',
        litros,
        codigo_barras: null,
        tecnologia: 'HPP',
        nombre_sku: 'Coco',
        linea_producto: null,
        activo: true,
        estado_formulacion: 'por_completar',
        presentacion_origen_id: null,
        factor_escala: null,
      },
    ],
    empaques: [
      { id: 1, presentacion_id: 1, tipo: 'Botella', costo, estado, producto_origen_id: null },
    ],
  };
}

describe('Precios de envase por unidad', () => {
  it.each([0.2395, 0.24, 0.355, 0.999999])(
    'conserva el precio unitario menor de 1 litro (%s L)',
    (litros) => {
      expect(unidadesPaqueteEnvase(litros)).toBe(1);
      expect(precioUnitarioEnvase(0.105, litros)).toBe(0.105);
    },
  );
  it.each([1, 1.000001, 2, 5, 6])('conserva el precio unitario desde 1 litro (%s L)', (litros) => {
    expect(unidadesPaqueteEnvase(litros)).toBe(1);
    expect(precioUnitarioEnvase(0.2, litros)).toBe(0.2);
  });

  it.each([0.355, 1, 2])(
    'el catálogo y el cálculo de producción coinciden para %s L sin dividir dos veces',
    (litros) => {
      const origen = tablas(litros, 1.2);
      const catalogo = mapearCatalogo(origen);
      const costo = catalogo.empaques[0].costo;
      const produccion = calcularEmpaque(
        origen.empaques.map((e) => ({ ...e })),
        1,
        litros,
        ['Botella'],
      );
      expect(costo).toBeCloseTo(1.2, 12);
      expect(produccion.costo).toBeCloseTo(costo, 12);
      expect(catalogo.empaques[0].costoPaquete).toBe(1.2);
      expect(catalogo.empaques[0].unidadesPaquete).toBe(1);
      expect(origen.empaques[0].costo).toBe(1.2);
      expect(mapearCatalogo(origen).empaques[0].costo).toBe(costo);
    },
  );

  it('convierte empaque y cartón con la misma regla y los mantiene separados', () => {
    const origen = tablas(0.355, 12);
    origen.empaques = ['Botella', 'Tap', 'Etiqueta', 'Cartón'].map((tipo, index) => ({
      id: index + 1,
      presentacion_id: 1,
      tipo,
      costo: 12,
      estado: 'confirmado',
      producto_origen_id: null,
    }));
    expect(mapearCatalogo(origen).empaques.map((e) => e.costo)).toEqual([12, 12, 12, 12]);
    expect(
      calcularEmpaque(
        origen.empaques.map((e) => ({ ...e })),
        1,
        0.355,
      ).costo,
    ).toBe(36);
    expect(
      calcularEmpaque(
        origen.empaques.map((e) => ({ ...e })),
        1,
        1,
      ).costo,
    ).toBe(36);
    const separado = calcularEmpaque(
      origen.empaques.map((e) => ({ ...e })),
      1,
      0.355,
    );
    expect(separado.carton).toBe(12);
    expect(separado.costo + separado.carton).toBe(48);
  });

  it('conserva un cero confirmado y mantiene pendiente el precio sin dato', () => {
    const confirmado = mapearCatalogo(tablas(1, 0)).empaques[0];
    const pendiente = mapearCatalogo(tablas(1, 0, 'sin_dato')).empaques[0];
    expect(confirmado.costo).toBe(0);
    expect(confirmado.estado).toBe('confirmado');
    expect(pendiente.estado).toBe('sin_dato');
    expect(
      calcularEmpaque(
        tablas(1, 0, 'sin_dato').empaques.map((e) => ({ ...e })),
        1,
        1,
        ['Botella'],
      ).sinDato,
    ).toBe(true);
  });

  it('rechaza tamaños o precios no válidos', () => {
    for (const litros of [0, -1, NaN, Infinity])
      expect(() => precioUnitarioEnvase(12, litros)).toThrow(/tamaño/);
    for (const precio of [-1, NaN, Infinity])
      expect(() => precioUnitarioEnvase(precio, 1)).toThrow(/precio/);
  });
});
