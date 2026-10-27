import { Presentacion } from '../models/producto.model';
import {
  calcularSerie,
  MaterialBase,
  PrecioSemanal,
  fechaHistoricaValida,
} from '../shared/historico-costos/historico-calculos';

/** Valora las cantidades del SKU con los precios vigentes al cierre del mes. */
export function calcularMateriaPrimaMensual(
  presentacion: Pick<Presentacion, 'items'>,
  mes: string,
  materiales: MaterialBase[],
  precios: PrecioSemanal[],
) {
  return calcularMateriaPrimaEnFecha(presentacion, fechaCierreMes(mes), materiales, precios);
}

export function fechaCierreMes(mes: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Mes de materia prima inválido.');
  const [anio, numeroMes] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  return `${mes}-${ultimoDia}`;
}

/** Usa los kg de producción registrados; no convierte litros en kg. */
export function calcularMateriaPrimaEnFecha(
  presentacion: Pick<Presentacion, 'items'>,
  fecha: string,
  materiales: MaterialBase[],
  precios: PrecioSemanal[],
) {
  if (!fechaHistoricaValida(fecha)) throw new Error('Fecha de materia prima inválida.');
  if (!presentacion.items.length) return null;
  const porMateria = new Map<number, number>();
  const detalle = presentacion.items.map((item) => {
    const vigente = precios
      .filter((p) => p.materia_prima_id === item.materiaPrimaId && p.semana <= fecha)
      .sort((a, b) => b.semana.localeCompare(a.semana))[0];
    const base = materiales.find((m) => m.id === item.materiaPrimaId);
    return {
      materiaPrimaId: item.materiaPrimaId,
      nombre: item.ingrediente,
      kg: item.kg,
      precioKg: vigente?.costo_kg ?? base?.costo_kg ?? null,
      fechaPrecio: vigente?.semana ?? null,
    };
  });
  for (const item of presentacion.items) {
    const [punto] = calcularSerie(
      [fecha],
      [{ materia_prima_id: item.materiaPrimaId, kg: item.kg }],
      materiales,
      precios,
    );
    porMateria.set(item.materiaPrimaId, (porMateria.get(item.materiaPrimaId) ?? 0) + punto.costo);
  }
  return {
    costo: [...porMateria.values()].reduce((total, costo) => total + costo, 0),
    porMateria,
    detalle,
  };
}

/** Conserva las fechas reales de actualización, incluso cuando hay cinco registros. */
export function semanasDePrecios(
  mes: string,
  precios: PrecioSemanal[],
  ids: Set<number>,
): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return [];
  const fechas = [
    ...new Set(
      precios
        .filter((p) => ids.has(p.materia_prima_id) && p.semana.slice(0, 7) === mes)
        .map((p) => p.semana),
    ),
  ].sort();
  // Permite consultar cuatro semanas con el precio anterior si no hubo actualizaciones.
  return fechas.length ? fechas : ['01', '08', '15', '22'].map((dia) => `${mes}-${dia}`);
}
