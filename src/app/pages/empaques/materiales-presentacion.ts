import { Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '../../core/data.service';
import { coincideBusqueda } from '../../core/busqueda-texto';
import { MATERIALES_POR_LITROS } from '../../models/materiales-presentacion';

@Component({
  selector: 'app-materiales-presentacion',
  imports: [MatIconModule],
  templateUrl: './materiales-presentacion.html',
  styleUrl: './materiales-presentacion.css',
})
export class MaterialesPorPresentacion {
  readonly data = inject(DataService);
  readonly busqueda = signal('');
  readonly capacidad = signal('');
  readonly filas = computed(() =>
    this.data
      .productos()
      .filter((p) => p.activo)
      .flatMap((producto) =>
        producto.presentaciones
          .filter((p) => p.activo && p.litros !== 3)
          .map((presentacion) => ({
            producto,
            presentacion,
            materiales: MATERIALES_POR_LITROS.get(presentacion.litros) ?? null,
          })),
      ),
  );
  readonly capacidades = computed(() =>
    [...new Set(this.filas().map((f) => f.presentacion.litros))].sort((a, b) => a - b),
  );
  readonly filtradas = computed(() =>
    this.filas().filter(
      (f) =>
        (!this.capacidad() || f.presentacion.litros === Number(this.capacidad())) &&
        coincideBusqueda(
          this.busqueda(),
          f.producto.nombre,
          f.producto.marca,
          f.producto.categoria,
          f.presentacion.nombreSku,
          f.presentacion.codigoBarras ?? '',
          f.presentacion.tecnologia,
        ),
    ),
  );
  presentacion(litros: number): string {
    return `${(litros * 1000).toLocaleString('es-EC', { maximumFractionDigits: 3 })} ml`;
  }
}
