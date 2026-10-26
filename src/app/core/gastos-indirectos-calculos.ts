export interface GastoIndirectoMensual {
  mes: string;
  concepto: string;
  costo_unitario: number;
  estimado: boolean;
  observacion?: string | null;
}

export interface GastoIndirecto extends GastoIndirectoMensual {
  id: number;
  presentacion_id: number;
  observacion: string | null;
}

export interface ResumenGastosIndirectos {
  costo: number;
  estimado: boolean;
  conceptos: number;
}

export function validarMesGif(mes: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(mes)) {
    throw new Error('El mes de gastos indirectos debe ser una fecha YYYY-MM-01.');
  }
}

/** Convierte y valida las filas de Supabase para una presentación. */
export function leerGastosIndirectos(
  filas: Record<string, unknown>[],
  presentacionId: number
): GastoIndirectoMensual[] {
  const claves = new Set<string>();
  return filas.map(fila => {
    const mes = String(fila['mes']);
    validarMesGif(mes);
    const concepto = String(fila['concepto'] ?? '').trim();
    const valor = fila['costo_unitario'];
    if (Number(fila['presentacion_id']) !== presentacionId || !concepto ||
        valor == null || String(valor).trim() === '' ||
        !Number.isFinite(Number(valor)) || Number(valor) < 0 ||
        typeof fila['estimado'] !== 'boolean') {
      throw new Error('Registro de gastos indirectos inválido para la presentación.');
    }
    const clave = `${mes}|${concepto.toLocaleLowerCase('es').replace(/\s+/g, ' ')}`;
    if (claves.has(clave)) {
      throw new Error(`Gasto indirecto duplicado: ${concepto}, ${mes}.`);
    }
    claves.add(clave);
    return { mes, concepto, costo_unitario: Number(valor), estimado: fila['estimado'] as boolean,
      observacion: fila['observacion'] == null ? null : String(fila['observacion']) };
  }).sort((a, b) => a.mes.localeCompare(b.mes) || a.concepto.localeCompare(b.concepto));
}

/** Suma los conceptos del mes exacto, nunca los doce meses del año. */
export function resolverGastosIndirectos(
  registros: GastoIndirectoMensual[],
  mesSeleccionado: string
): ResumenGastosIndirectos | null {
  const mes = `${mesSeleccionado}-01`;
  validarMesGif(mes);
  const aplicables = registros.filter(r => r.mes === mes);
  if (!aplicables.length) return null;
  const costo = aplicables.reduce((total, r) => total + r.costo_unitario, 0);
  if (!Number.isFinite(costo) || costo < 0) throw new Error('Total de gastos indirectos inválido.');
  return { costo, estimado: aplicables.some(r => r.estimado), conceptos: aplicables.length };
}
