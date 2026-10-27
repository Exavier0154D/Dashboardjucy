import { Presentacion } from '../models/producto.model';
import {
  calcularSerie,
  MaterialBase,
  PrecioSemanal,
} from '../shared/historico-costos/historico-calculos';

/** Valora las cantidades del SKU con los precios vigentes al cierre del mes. */
export function calcularMateriaPrimaMensual(
  presentacion: Pick<Presentacion, 'items'>,
  mes: string,
  materiales: MaterialBase[],
  precios: PrecioSemanal[],
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Mes de materia prima inválido.');
  if (!presentacion.items.length) return null;
  const [anio, numeroMes] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  const fecha = `${mes}-${ultimoDia}`;
  const porMateria = new Map<number, number>();
  for (const item of presentacion.items) {
    const [punto] = calcularSerie(
      [fecha],
      [{ materia_prima_id: item.materiaPrimaId, kg: item.kg }],
      materiales,
      precios,
    );
    porMateria.set(item.materiaPrimaId, (porMateria.get(item.materiaPrimaId) ?? 0) + punto.costo);
  }
  return { costo: [...porMateria.values()].reduce((total, costo) => total + costo, 0), porMateria };
}
