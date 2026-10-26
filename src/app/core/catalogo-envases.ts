import type { Empaque, TipoEmpaque } from '../models/empaque.model';
import type { Producto } from '../models/producto.model';

/** Vista de los empaques existentes por SKU; no agrega ingredientes a las fórmulas. */
export function catalogoEnvases(productos: Producto[], empaques: Empaque[]) {
  const presentaciones = new Map(
    productos.flatMap((producto) =>
      producto.presentaciones.map(
        (presentacion) => [presentacion.id, { producto, presentacion }] as const,
      ),
    ),
  );
  return empaques
    .flatMap((empaque) => {
      const relacion = presentaciones.get(empaque.presentacionId);
      if (!relacion) return [];
      return [
        { ...relacion, empaque, precio: empaque.estado === 'sin_dato' ? null : empaque.costo },
      ];
    })
    .sort(
      (a, b) =>
        a.producto.nombre.localeCompare(b.producto.nombre, 'es') ||
        a.presentacion.litros - b.presentacion.litros ||
        a.presentacion.tecnologia.localeCompare(b.presentacion.tecnologia) ||
        a.empaque.tipo.localeCompare(b.empaque.tipo, 'es') ||
        a.empaque.id - b.empaque.id,
    );
}

export type FilaEnvase = ReturnType<typeof catalogoEnvases>[number];

export interface GrupoEnvase {
  id: string;
  tipo: TipoEmpaque;
  litros: number;
  unidad: string;
  tecnologias: string[];
  registros: FilaEnvase[];
  productos: string[];
  presentaciones: number;
  precioMin: number | null;
  precioMax: number | null;
  pendientes: number;
  referencia: boolean;
}

/** Agrupa la vista por tipo y tamaño; cada SKU conserva su precio y su estado. */
export function agruparEnvases(filas: FilaEnvase[]): GrupoEnvase[] {
  const grupos = new Map<string, FilaEnvase[]>();
  for (const fila of filas) {
    // Los cartones impresos conservan su registro individual por producto.
    const clave =
      fila.empaque.tipo === 'Cartón'
        ? JSON.stringify(['Cartón', fila.empaque.id])
        : JSON.stringify([fila.empaque.tipo, fila.presentacion.litros, fila.empaque.unidad]);
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(fila);
    else grupos.set(clave, [fila]);
  }

  return [...grupos]
    .map(([id, registros]) => {
      const primero = registros[0];
      const precios = registros.flatMap((r) => (r.precio === null ? [] : [r.precio]));
      return {
        id,
        tipo: primero.empaque.tipo,
        litros: primero.presentacion.litros,
        unidad: primero.empaque.unidad,
        tecnologias: [...new Set(registros.map((r) => r.presentacion.tecnologia))].sort(),
        registros,
        productos: [...new Map(registros.map((r) => [r.producto.id, r.producto.nombre])).values()],
        presentaciones: new Set(registros.map((r) => r.presentacion.id)).size,
        precioMin: precios.length ? Math.min(...precios) : null,
        precioMax: precios.length ? Math.max(...precios) : null,
        pendientes: registros.filter((r) => r.precio === null).length,
        referencia: registros.some((r) => r.empaque.estado === 'referencia_producto'),
      };
    })
    .sort((a, b) => {
      const orden: TipoEmpaque[] = ['Botella', 'Tap', 'Etiqueta', 'Cartón'];
      return (
        orden.indexOf(a.tipo) - orden.indexOf(b.tipo) ||
        a.litros - b.litros ||
        a.id.localeCompare(b.id)
      );
    });
}
