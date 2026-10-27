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
