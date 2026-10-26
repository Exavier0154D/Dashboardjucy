import { agruparEnvases, type FilaEnvase } from './catalogo-envases';
import type { Empaque } from '../models/empaque.model';
import type { Presentacion, Producto } from '../models/producto.model';

function fila(
  id: number,
  tipo: Empaque['tipo'],
  litros: number,
  costo: number,
  estado: Empaque['estado'] = 'confirmado',
): FilaEnvase {
  const presentacion: Presentacion = {
    id,
    productoId: String(id),
    litros,
    claveSku: String(id),
    codigoBarras: null,
    tecnologia: 'HPP',
    nombreSku: `Producto ${id}`,
    lineaProducto: null,
    activo: true,
    estadoFormulacion: 'por_completar',
    presentacionOrigenId: null,
    factorEscala: null,
    ingredientes: [],
    items: [],
    totalKg: 0,
    totalLitros: litros,
    totalCosto: null,
  };
  const producto: Producto = {
    id: String(id),
    nombre: `Producto ${id}`,
    categoria: 'Agua de Coco',
    marca: 'Jucy',
    variante: 'Original',
    activo: true,
    fechaRevision: '',
    productoOrigenId: null,
    ingredientes: [],
    presentaciones: [presentacion],
  };
  const empaque: Empaque = {
    id,
    tipo,
    costo,
    estado,
    presentacionId: id,
    productoId: String(id),
    unidad: 'Unidad',
    litros,
    tecnologia: 'HPP',
    productoOrigenId: null,
  };
  return { producto, presentacion, empaque, precio: estado === 'sin_dato' ? null : costo };
}

describe('Envases agrupados por presentación', () => {
  it('agrupa los tres tipos solicitados por tamaño y mantiene tamaños y tipos distintos', () => {
    const grupos = agruparEnvases([
      fila(1, 'Botella', 0.355, 0.1),
      fila(2, 'Botella', 0.355, 0.12),
      fila(3, 'Botella', 0.24, 0.08),
      fila(4, 'Tap', 0.355, 0.02),
      fila(5, 'Tap', 0.355, 0.03),
      fila(6, 'Etiqueta', 0.355, 0.01),
      fila(7, 'Etiqueta', 0.355, 0.02),
    ]);
    expect(grupos.length).toBe(4);
    const botella = grupos.find((g) => g.tipo === 'Botella' && g.litros === 0.355)!;
    expect(botella.productos.length).toBe(2);
    expect(botella.precioMin).toBe(0.1);
    expect(botella.precioMax).toBe(0.12);
    expect(botella.registros.map((r) => r.empaque.costo)).toEqual([0.1, 0.12]);
  });

  it('conserva ceros confirmados y señala los registros pendientes de un grupo mixto', () => {
    const [grupo] = agruparEnvases([
      fila(1, 'Tap', 0.24, 0),
      fila(2, 'Tap', 0.24, 0, 'sin_dato'),
      fila(3, 'Tap', 0.24, 0.02, 'referencia_producto'),
    ]);
    expect(grupo.precioMin).toBe(0);
    expect(grupo.precioMax).toBe(0.02);
    expect(grupo.pendientes).toBe(1);
    expect(grupo.referencia).toBe(true);
    const [pendiente] = agruparEnvases([fila(1, 'Botella', 2, 0, 'sin_dato')]);
    expect(pendiente.precioMin).toBeNull();
    expect(pendiente.precioMax).toBeNull();
  });

  it('mantiene las tecnologías en el detalle y no une los cartones impresos de diferentes productos', () => {
    const uht = fila(2, 'Botella', 0.355, 0.15);
    uht.presentacion.tecnologia = 'UHT';
    const grupos = agruparEnvases([
      fila(1, 'Botella', 0.355, 0.1),
      uht,
      fila(3, 'Cartón', 0.355, 0.2),
      fila(4, 'Cartón', 0.355, 0.24),
    ]);
    expect(grupos.length).toBe(3);
    expect(grupos[0].tecnologias).toEqual(['HPP', 'UHT']);
    expect(grupos.filter((g) => g.tipo === 'Cartón').length).toBe(2);
  });
});
