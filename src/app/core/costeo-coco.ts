import type { ItemPresentacion, Presentacion } from '../models/producto.model';
import { valorarMateriaPrimaRegistrada } from './costos-calculos';

export const RENDIMIENTO_AGUA_COCO = 0.22;
export const DESPERDICIO_AGUA_COCO = 0.78;
export const LEYENDA_RENDIMIENTO_COCO =
  'Rendimiento del coco: 22% aprovechable y 78% cáscara y residuos. El costo de materia prima se calcula a partir del agua de coco requerida, convirtiéndola a coco entero y multiplicando por su precio vigente.';

export type ContextoCosteo = Pick<Presentacion, 'items'> &
  Partial<Pick<Presentacion, 'id' | 'productoId' | 'litros' | 'ingredientes'>>;

export interface ReglaExtraccionCoco {
  productoId: string;
  materiaPrimaId: number;
  precioCocoEnteroConfirmado: boolean;
  densidadKgPorLitro: number;
  evidencia: string;
  /** Solo cantidades netas verificadas; no se derivan de porcentajes de una mezcla. */
  aguaAprovechablePorPresentacion?: Readonly<Record<number, number>>;
}

// Precio del material 57 confirmado expresamente por el usuario para Original Jucy.
// La densidad se configura aquí; otras bases/productos requieren confirmación explícita.
export const REGLAS_EXTRACCION_COCO: readonly ReglaExtraccionCoco[] = [
  {
    productoId: 'catalogo-2026-b00a0c1d9779e618e5649392',
    materiaPrimaId: 57,
    precioCocoEnteroConfirmado: true,
    densidadKgPorLitro: 1,
    evidencia:
      'Usuario confirma que el precio del Coco 57 para Agua de Coco Original Jucy corresponde a coco entero antes de extracción.',
  },
];

function esCocoEntero(nombre: string): boolean {
  return (
    /\bcoco\b/i.test(nombre) && !/\b(agua|pulpa|leche|crema|aceite|rallad[oa])\b/i.test(nombre)
  );
}

export function cocoNecesario(litrosAguaAprovechable: number, densidadKgPorLitro = 1): number {
  if (
    !Number.isFinite(litrosAguaAprovechable) ||
    litrosAguaAprovechable <= 0 ||
    !Number.isFinite(densidadKgPorLitro) ||
    densidadKgPorLitro <= 0
  )
    throw new Error('Cantidad de agua aprovechable o densidad inválida.');
  const aguaRequeridaKg = litrosAguaAprovechable * densidadKgPorLitro;
  const cocoEnteroRequeridoKg = aguaRequeridaKg / RENDIMIENTO_AGUA_COCO;
  if (!Number.isFinite(cocoEnteroRequeridoKg)) throw new Error('Cantidad de coco fuera de rango.');
  return cocoEnteroRequeridoKg;
}

function baseExtraccion(
  p: ContextoCosteo | null,
  materiaPrimaId: number,
  reglas: readonly ReglaExtraccionCoco[],
) {
  const item = p?.items.find((i) => i.materiaPrimaId === materiaPrimaId);
  if (!p || !item || !esCocoEntero(item.ingrediente)) return null;
  const regla = reglas.find(
    (r) =>
      r.productoId === p.productoId &&
      r.materiaPrimaId === materiaPrimaId &&
      r.precioCocoEnteroConfirmado &&
      !!r.evidencia.trim(),
  );
  if (!regla || !Number.isFinite(regla.densidadKgPorLitro) || regla.densidadKgPorLitro <= 0)
    return null;
  const pura =
    p.items.length === 1 &&
    p.ingredientes?.length === 1 &&
    p.ingredientes[0].materiaPrimaId === materiaPrimaId &&
    p.ingredientes[0].porcentaje === 100;
  const litrosAgua = pura
    ? p.litros
    : p.id === undefined
      ? undefined
      : regla.aguaAprovechablePorPresentacion?.[p.id];
  if (litrosAgua === undefined || !Number.isFinite(litrosAgua) || litrosAgua <= 0) return null;
  return { litrosAgua, densidadKgPorLitro: regla.densidadKgPorLitro };
}

/** Única ruta de valoración: deriva coco desde agua comprobada o conserva los kg originales. */
export function valorarIngrediente(
  p: ContextoCosteo | null,
  item: Pick<ItemPresentacion, 'materiaPrimaId' | 'ingrediente' | 'kg'>,
  precioKg: number,
  reglas: readonly ReglaExtraccionCoco[] = REGLAS_EXTRACCION_COCO,
) {
  const base = baseExtraccion(p, item.materiaPrimaId, reglas);
  const kgCosteo = base ? cocoNecesario(base.litrosAgua, base.densidadKgPorLitro) : item.kg;
  const costo = valorarMateriaPrimaRegistrada(kgCosteo, precioKg);
  return {
    costo,
    kgCosteo,
    kgRegistrados: item.kg,
    diferenciaKg: kgCosteo - item.kg,
    rendimientoAplicado: base !== null,
    aguaRequeridaKg: base ? base.litrosAgua * base.densidadKgPorLitro : null,
  };
}

export function revisarBaseCoco(
  p: ContextoCosteo | null,
  reglas: readonly ReglaExtraccionCoco[] = REGLAS_EXTRACCION_COCO,
) {
  const candidatos = (p?.items ?? []).filter((i) => esCocoEntero(i.ingrediente));
  const pendientes = candidatos
    .filter((i) => !baseExtraccion(p, i.materiaPrimaId, reglas))
    .map((i) => i.materiaPrimaId);
  return { confirmado: candidatos.length > 0 && pendientes.length === 0, pendientes };
}
