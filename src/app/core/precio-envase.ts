/** Los precios registrados de empaque corresponden a una unidad del SKU. */
export function unidadesPaqueteEnvase(litros: number): 1 {
  if (!Number.isFinite(litros) || litros <= 0) {
    throw new Error('El tamaño del envase debe ser mayor que cero.');
  }
  return 1;
}

/** Valida y conserva el precio unitario registrado en la base de datos. */
export function precioUnitarioEnvase(precioUnitario: number, litros: number): number {
  if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
    throw new Error('El precio unitario del empaque debe ser un número válido y no negativo.');
  }
  unidadesPaqueteEnvase(litros);
  return precioUnitario;
}

/** Los cartones contienen 12 unidades bajo 1 litro y 6 desde 1 litro. */
export function unidadesPorCarton(litros: number): 6 | 12 {
  unidadesPaqueteEnvase(litros);
  return litros < 1 ? 12 : 6;
}

/** Convierte el precio registrado por cartón al costo de una unidad del SKU. */
export function precioUnitarioCarton(precioCarton: number, litros: number): number {
  return precioUnitarioEnvase(precioCarton, litros) / unidadesPorCarton(litros);
}
