import { Injectable, signal } from '@angular/core';
import { Producto, Presentacion } from '../models/producto.model';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  readonly productoSeleccionado = signal<Producto | null>(null);
  readonly presentacionSeleccionada = signal<Presentacion | null>(null);

  seleccionarProducto(producto: Producto, presentacion?: Presentacion | null): void {
    const sku = presentacion
      ? producto.presentaciones.find(p => p.id === presentacion.id)
      : producto.presentaciones[0] ?? null;
    if (presentacion && !sku) {
      throw new Error('La presentación no pertenece al producto seleccionado.');
    }
    this.productoSeleccionado.set({ ...producto, ingredientes: sku?.ingredientes ?? [] });
    this.presentacionSeleccionada.set(sku ?? null);
  }

  seleccionarPresentacion(presentacion: Presentacion): void {
    const producto = this.productoSeleccionado();
    if (!producto) throw new Error('Selecciona un producto antes de elegir su presentación.');
    this.seleccionarProducto(producto, presentacion);
  }

  seleccionarPresentacionPorId(id: number): void {
    const producto = this.productoSeleccionado();
    const sku = producto?.presentaciones.find(p => p.id === id);
    if (!producto || !sku) throw new Error('No se encontró ese SKU en el producto seleccionado.');
    this.seleccionarProducto(producto, sku);
  }

  limpiarSeleccion(): void {
    this.productoSeleccionado.set(null);
    this.presentacionSeleccionada.set(null);
  }
}
