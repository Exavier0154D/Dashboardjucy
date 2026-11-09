export function normalizarBusqueda(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
}


export function coincideBusqueda(consulta: string, ...campos: string[]): boolean {
  const palabras = normalizarBusqueda(consulta).split(' ').filter(Boolean);
  const texto = normalizarBusqueda(campos.join(' '));
  return palabras.every(palabra => texto.includes(palabra));
}
