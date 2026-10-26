import type { ManoObraMensual } from '../../core/costos-calculos';
import { resolverManoObra, sumarCostoFinal } from '../../core/costos-calculos';
import {
  GastoIndirectoMensual,
  resolverGastosIndirectos,
} from '../../core/gastos-indirectos-calculos';

export interface PrecioSemanal {
  materia_prima_id: number;
  semana: string;
  costo_kg: number;
}
export interface MaterialBase {
  id: number;
  nombre: string;
  costo_kg: number;
}
export interface CantidadMaterial {
  materia_prima_id: number;
  kg: number;
}
export interface PuntoHistorico {
  semana: string;
  costo: number;
  conBase: number;
  conAnterior?: number;
}
export function fechaHistoricaValida(fecha: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}
// Cada precio queda vigente desde su fecha hasta la siguiente actualización.
// Antes del primer registro se utiliza el precio base histórico conservado.
export function calcularSerie(
  semanas: string[],
  cantidades: CantidadMaterial[],
  materiales: MaterialBase[],
  precios: PrecioSemanal[],
): PuntoHistorico[] {
  const ids = new Set<number>();
  for (const m of materiales) {
    if (
      !Number.isSafeInteger(m.id) ||
      m.id <= 0 ||
      ids.has(m.id) ||
      !Number.isFinite(m.costo_kg) ||
      m.costo_kg < 0
    ) {
      throw new Error('Materia prima o precio base inválido o duplicado.');
    }
    ids.add(m.id);
  }
  if (semanas.some((s) => !fechaHistoricaValida(s))) throw new Error('Fecha del rango inválida.');
  const bases = new Map(materiales.map((m) => [m.id, m.costo_kg]));
  const claves = new Set<string>();
  const porMateria = new Map<number, PrecioSemanal[]>();
  for (const p of precios) {
    if (
      !Number.isSafeInteger(p.materia_prima_id) ||
      p.materia_prima_id <= 0 ||
      !fechaHistoricaValida(p.semana) ||
      !Number.isFinite(p.costo_kg) ||
      p.costo_kg < 0
    ) {
      throw new Error('Precio histórico o fecha inválidos.');
    }
    const clave = `${p.materia_prima_id}:${p.semana}`;
    if (claves.has(clave)) throw new Error(`Precio semanal duplicado: ${clave}`);
    claves.add(clave);
    const lista = porMateria.get(p.materia_prima_id) ?? [];
    lista.push(p);
    porMateria.set(p.materia_prima_id, lista);
  }
  for (const lista of porMateria.values()) lista.sort((a, b) => a.semana.localeCompare(b.semana));
  const cantidadesPorId = new Map<number, number>();
  for (const c of cantidades) {
    if (!Number.isFinite(c.kg) || c.kg < 0) throw new Error('Cantidad de ingrediente inválida.');
    if (!bases.has(c.materia_prima_id))
      throw new Error(`Materia prima sin precio base: ${c.materia_prima_id}`);
    cantidadesPorId.set(c.materia_prima_id, (cantidadesPorId.get(c.materia_prima_id) ?? 0) + c.kg);
  }
  return semanas.map((semana) => {
    let costo = 0,
      conBase = 0,
      conAnterior = 0;
    for (const [id, kg] of cantidadesPorId) {
      if (kg === 0) continue;
      const lista = porMateria.get(id) ?? [];
      // Busca el último precio anterior o igual a esta fecha, incluyendo
      // registros previos a Desde para conservar la vigencia correctamente.
      let inicio = 0,
        fin = lista.length - 1,
        indice = -1;
      while (inicio <= fin) {
        const centro = Math.floor((inicio + fin) / 2);
        if (lista[centro].semana <= semana) {
          indice = centro;
          inicio = centro + 1;
        } else fin = centro - 1;
      }
      const vigente = indice >= 0 ? lista[indice] : undefined;
      if (!vigente) conBase++;
      else if (vigente.semana < semana) conAnterior++;
      costo += kg * (vigente?.costo_kg ?? bases.get(id)!);
    }
    return { semana, costo, conBase, conAnterior };
  });
}

export interface PuntoCostoFinal extends PuntoHistorico {
  empaque: number;
  carton: number;
  manoObra: number | null;
  mesManoObra: string | null;
  total: number | null;
  subtotal: number;
  manoObraEstimada: boolean;
  indirectos: number | null;
  indirectosEstimados: boolean;
}

// La mano de obra conserva el último valor registrado anterior o igual a la fecha.
// No se utilizan registros futuros; un cero registrado es válido.
export function agregarCostosProduccion(
  serie: PuntoHistorico[],
  empaque: number,
  registros: ManoObraMensual[],
  gastosIndirectos: GastoIndirectoMensual[],
  carton: number = 0,
): PuntoCostoFinal[] {
  return serie.map((p) => {
    const vigente = resolverManoObra(registros, p.semana);
    const manoObra = vigente?.costo_unitario ?? null;
    const gif = resolverGastosIndirectos(gastosIndirectos, p.semana.slice(0, 7));
    return {
      ...p,
      empaque,
      carton,
      manoObra,
      mesManoObra: vigente?.mes ?? null,
      indirectos: gif?.costo ?? null,
      indirectosEstimados: gif?.estimado ?? false,
      total: sumarCostoFinal(p.costo, empaque, manoObra, gif?.costo ?? null, carton),
      subtotal: p.costo + empaque + carton,
      manoObraEstimada: vigente?.estimado ?? false,
    };
  });
}
