/** Los precios registrados de empaque corresponden a paquetes, según el tamaño del SKU. */
export function unidadesPaqueteEnvase(litros: number): 6 | 12 {
  if (!Number.isFinite(litros) || litros <= 0) {
    throw new Error('El tamaño del envase debe ser mayor que cero.');
  }
  return litros >= 1 ? 6 : 12;
}

/** Se aplica una sola vez al leer un precio de paquete de la base de datos. */
export function precioUnitarioEnvase(precioPaquete: number, litros: number): number {
  if (!Number.isFinite(precioPaquete) || precioPaquete < 0) {
    throw new Error('El precio del paquete de envases debe ser un número válido y no negativo.');
  }
  return precioPaquete / unidadesPaqueteEnvase(litros);
}
