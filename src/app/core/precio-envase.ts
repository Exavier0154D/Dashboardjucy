export function unidadesPaqueteEnvase(litros: number): 1 {
  if (!Number.isFinite(litros) || litros <= 0) {
    throw new Error('El tamaño del envase debe ser mayor que cero.');
  }
  return 1;
}

export function precioUnitarioEnvase(precioUnitario: number, litros: number): number {
  if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
    throw new Error('El precio unitario del empaque debe ser un número válido y no negativo.');
  }
  unidadesPaqueteEnvase(litros);
  return precioUnitario;
}

export function unidadesPorCarton(litros: number): 6 | 12 {
  unidadesPaqueteEnvase(litros);
  return litros < 1 ? 12 : 6;
}

export function precioUnitarioCarton(precioCarton: number, litros: number): number {
  return precioUnitarioEnvase(precioCarton, litros) / unidadesPorCarton(litros);
}
