import { Empaque } from '../models/empaque.model';
import { Producto } from '../models/producto.model';

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
