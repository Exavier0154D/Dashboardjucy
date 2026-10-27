import { TIPOS_EMPAQUE, TIPOS_EMPAQUE_BASE, TipoEmpaque } from '../models/empaque.model';
import { precioUnitarioCarton, precioUnitarioEnvase, unidadesPaqueteEnvase } from './precio-envase';

export interface ManoObraMensual {
  mes: string;
  costo_unitario: number;
  estimado?: boolean;
}

function fechaValida(fecha: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(fecha)) {
    return false;
  }

  const valor = new Date(`${fecha}T00:00:00Z`);

  return Number.isFinite(valor.getTime()) && valor.toISOString().slice(0, 10) === fecha;
}

// MANO DE OBRA

export function resolverManoObra(
  registros: ManoObraMensual[],
  fecha: string,
): ManoObraMensual | null {
  if (!fechaValida(fecha)) {
    throw new Error('Fecha de mano de obra inválida.');
  }

  const mes = `${fecha.slice(0, 7)}-01`;
  const claves = new Set<string>();

  let vigente: ManoObraMensual | null = null;

  for (const registro of registros) {
    if (!fechaValida(registro.mes) || !registro.mes.endsWith('-01')) {
      throw new Error('El registro de mano de obra debe corresponder al primer día del mes.');
    }

    if (claves.has(registro.mes)) {
      throw new Error(`Mano de obra duplicada para ${registro.mes}.`);
    }

    claves.add(registro.mes);

    if (!Number.isFinite(registro.costo_unitario) || registro.costo_unitario < 0) {
      throw new Error('Costo de mano de obra inválido.');
    }

    // No utiliza registros futuros y conserva un cero válido.
    if (registro.mes <= mes && (!vigente || registro.mes > vigente.mes)) {
      vigente = registro;
    }
  }

  return vigente;
}

export function manoObraDelMes(registros: ManoObraMensual[], fecha: string): number | null {
  return resolverManoObra(registros, fecha)?.costo_unitario ?? null;
}

// MESES

export function mesActualEcuador(ahora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(ahora);

  const anio = partes.find((parte) => parte.type === 'year')!.value;

  const mes = partes.find((parte) => parte.type === 'month')!.value;

  return `${anio}-${mes}`;
}

/**
 * Incluye meses intermedios y el mes actual,
 * aunque todavía no exista una actualización.
 */
export function mesesManoObra(registros: ManoObraMensual[], actual = mesActualEcuador()): string[] {
  resolverManoObra(registros, `${actual}-01`);

  const fechas = [actual, ...registros.map((registro) => registro.mes.slice(0, 7))].sort();

  const meses: string[] = [];

  const indice = (fecha: string): number => {
    const [anio, mes] = fecha.split('-').map(Number);

    return anio * 12 + mes - 1;
  };

  const inicio = indice(fechas[0]);
  const fin = indice(fechas[fechas.length - 1]);

  for (let i = inicio; i <= fin; i++) {
    const anio = String(Math.floor(i / 12)).padStart(4, '0');

    const mes = String((i % 12) + 1).padStart(2, '0');

    meses.push(`${anio}-${mes}`);
  }

  return meses;
}

// COSTO POR UNIDAD

/**
 * Suma materia prima, empaque, cartón, mano de obra e indirectos como rubros separados.
 *
 * null indica un dato pendiente.
 * Un costo de cero registrado es válido.
 *
 */
export function sumarCostoFinal(
  materiaPrima: number | null,
  empaque: number,
  manoObra: number | null,
  indirectos: number | null,
  carton: number = 0,
): number | null {
  if (
    !Number.isFinite(empaque) ||
    empaque < 0 ||
    (materiaPrima !== null && (!Number.isFinite(materiaPrima) || materiaPrima < 0))
  ) {
    throw new Error('Costo de materia prima o empaque inválido.');
  }

  if (manoObra !== null && (!Number.isFinite(manoObra) || manoObra < 0)) {
    throw new Error('Costo de mano de obra inválido.');
  }
  if (!Number.isFinite(carton) || carton < 0) {
    throw new Error('Costo de cartón inválido.');
  }

  if (indirectos !== null && (!Number.isFinite(indirectos) || indirectos < 0)) {
    throw new Error('Costo de gastos indirectos inválido.');
  }

  if (materiaPrima === null || manoObra === null || indirectos === null) {
    return null;
  }

  return materiaPrima + empaque + carton + manoObra + indirectos;
}

// EMPAQUES

export interface ResumenEmpaque {
  costo: number;
  carton: number;
  cartonAplica: boolean;
  cartonEstimado: boolean;
  cartonSinDato: boolean;
  porProducto: boolean;
  estimado: boolean;
  sinDato: boolean;
}

/**
 * Lee precios unitarios de envases y precios por cartón de la base de datos.
 */
export function calcularEmpaque(
  filas: Record<string, unknown>[],
  presentacionId: number,
  litros: number,
  requeridos: readonly TipoEmpaque[] = TIPOS_EMPAQUE_BASE,
): ResumenEmpaque {
  if (!Number.isSafeInteger(presentacionId) || presentacionId <= 0) {
    throw new Error('ID de presentación inválido.');
  }

  unidadesPaqueteEnvase(litros);
  const tipos = new Set<string>();

  let costo = 0;
  let carton = 0;
  let cartonEstimado = false;
  let cartonSinDato = false;
  let estimado = false;
  let sinDato = false;

  for (const fila of filas) {
    if (fila['presentacion_id'] == null) {
      throw new Error('El empaque debe estar vinculado a una presentación.');
    }

    if (Number(fila['presentacion_id']) !== presentacionId) {
      continue;
    }

    const tipo = String(fila['tipo']);

    if (!(TIPOS_EMPAQUE as readonly string[]).includes(tipo) || tipos.has(tipo)) {
      throw new Error('Tipo de empaque inválido o duplicado.');
    }

    tipos.add(tipo);

    const valor = fila['costo'];

    if (
      valor == null ||
      String(valor).trim() === '' ||
      !Number.isFinite(Number(valor)) ||
      Number(valor) < 0
    ) {
      throw new Error('Hay un empaque sin costo válido.');
    }

    const estado = fila['estado'];

    if (!['referencia_producto', 'sin_dato', 'confirmado'].includes(String(estado))) {
      throw new Error('Estado de empaque inválido.');
    }

    if (tipo === 'Cartón') {
      carton += precioUnitarioCarton(Number(valor), litros);
      cartonEstimado ||= estado === 'referencia_producto';
      cartonSinDato ||= estado === 'sin_dato';
    } else {
      costo += precioUnitarioEnvase(Number(valor), litros);
      estimado ||= estado === 'referencia_producto';
      sinDato ||= estado === 'sin_dato';
    }
  }

  return {
    costo,
    carton,
    cartonAplica: requeridos.includes('Cartón') || tipos.has('Cartón'),
    cartonEstimado,
    cartonSinDato: cartonSinDato || (requeridos.includes('Cartón') && !tipos.has('Cartón')),
    porProducto: false,
    estimado,
    sinDato: sinDato || requeridos.some((tipo) => tipo !== 'Cartón' && !tipos.has(tipo)),
  };
}
