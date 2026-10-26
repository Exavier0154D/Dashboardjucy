import { calcularEmpaque } from './costos-calculos';
import { requiereCarton, tiposEmpaqueRequeridos } from '../models/empaque.model';

const productoCoco = { categoria: 'Agua de Coco', variante: 'Original' };
const fila = (tipo: string, costo: number, estado = 'confirmado', presentacion_id = 1) =>
  ({ presentacion_id, tipo, costo, estado });
const base = () => [fila('Botella', 0.1), fila('Tap', 0.02), fila('Etiqueta', 0.03)];

describe('Cartón por presentación', () => {
  it('lo exige en aguas de coco, jugos de coco y todos los lácteos', () => {
    for (const producto of [productoCoco, { categoria: 'Lacteos', variante: 'Café Frio' },
      { categoria: 'Jugos y Zumo', variante: 'De Coco' }, { categoria: 'Limonada', variante: 'Con Coco' }]) {
      expect(requiereCarton(producto)).toBe(true);
      expect(tiposEmpaqueRequeridos(producto)).toContain('Cartón');
    }
    expect(requiereCarton({ categoria: 'Limonada', variante: 'Original' })).toBe(false);
    expect(requiereCarton({ categoria: 'Jugos y Zumo', variante: 'De Naranja' })).toBe(false);
  });

  it('suma el cartón una sola vez al costo unitario del SKU', () => {
    const resumen = calcularEmpaque([...base(), fila('Cartón', 0.2), fila('Cartón', 9, 'confirmado', 2)],
      1, tiposEmpaqueRequeridos(productoCoco));
    expect(resumen.costo).toBeCloseTo(0.35);
    expect(resumen.sinDato).toBe(false);
    expect(resumen.estimado).toBe(false);
  });

  it('mantiene pendiente un cartón faltante o sin dato, pero permite un cero confirmado', () => {
    const requeridos = tiposEmpaqueRequeridos(productoCoco);
    expect(calcularEmpaque(base(), 1, requeridos).sinDato).toBe(true);
    expect(calcularEmpaque([...base(), fila('Cartón', 0, 'sin_dato')], 1, requeridos).sinDato).toBe(true);
    expect(calcularEmpaque([...base(), fila('Cartón', 0)], 1, requeridos).sinDato).toBe(false);
  });

  it('un cartón no oculta la falta de etiqueta y no se exige a otros productos', () => {
    expect(calcularEmpaque([fila('Botella', 0.1), fila('Tap', 0.02), fila('Cartón', 0.2)], 1).sinDato).toBe(true);
    expect(calcularEmpaque(base(), 1).sinDato).toBe(false);
  });

  it('rechaza cartones duplicados o con precios inválidos', () => {
    expect(() => calcularEmpaque([...base(), fila('Cartón', 0.2), fila('Cartón', 0.2)], 1)).toThrow(/duplicado/);
    expect(() => calcularEmpaque([...base(), fila('Cartón', -0.2)], 1)).toThrow(/costo válido/);
  });
});
