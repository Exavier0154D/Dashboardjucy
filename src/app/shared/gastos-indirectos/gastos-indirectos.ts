import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Producto, Presentacion } from '../../models/producto.model';
import { CostosPresentacion } from '../../core/costos-produccion.service';
import { resolverGastosIndirectos } from '../../core/gastos-indirectos-calculos';

@Component({
  selector: 'app-gastos-indirectos',
  imports: [DecimalPipe, MatIconModule],
  templateUrl: './gastos-indirectos.html',
  styleUrl: './gastos-indirectos.css'
})
export class GastosIndirectos {
  readonly producto = input.required<Producto>();
  readonly presentacion = input<Presentacion | null>(null);
  readonly datos = input<CostosPresentacion | null>(null);
  readonly cargando = input(false);
  readonly error = input<string | null>(null);
  readonly mes = input('');
  readonly seleccionarMes = output<string>();
  readonly actualizar = output<void>();
  readonly sku = computed(() => {
    const presentacion = this.presentacion();
    return presentacion?.productoId === this.producto().id ? presentacion : null;
  });
  readonly registros = computed(() => {
    const datos = this.datos();
    return this.sku() && datos?.presentacionId === this.sku()?.id ? datos?.gastosIndirectos ?? [] : [];
  });
  readonly meses = computed(() => [...new Set(this.registros().map(r => r.mes.slice(0, 7)))].sort());
  readonly conceptos = computed(() => this.registros().filter(r => r.mes === `${this.mes()}-01`));
  readonly resumen = computed(() => this.mes() ? resolverGastosIndirectos(this.registros(), this.mes()) : null);
  readonly historico = computed(() => this.meses().map(mes => ({ mes, ...resolverGastosIndirectos(this.registros(), mes)! })));

  nombreMes(mes: string): string {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return '';
    return new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${mes}-01T00:00:00Z`));
  }
}
