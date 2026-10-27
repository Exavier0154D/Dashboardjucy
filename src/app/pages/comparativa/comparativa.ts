import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DataService } from '../../core/data.service';
import { CostosPresentacion, CostosProduccionService } from '../../core/costos-produccion.service';
import { mesActualEcuador, resolverManoObra, sumarCostoFinal } from '../../core/costos-calculos';
import { Producto, Presentacion } from '../../models/producto.model';
import { coincideBusqueda } from '../../core/busqueda-texto';
import { resolverGastosIndirectos } from '../../core/gastos-indirectos-calculos';
import { fechaCierreMes } from '../../core/materia-prima-calculos';

interface OpcionSku {
  producto: Producto;
  presentacion: Presentacion;
}
interface CargaSku {
  datos: CostosPresentacion | null;
  error: string | null;
}
interface FilaFormula {
  materiaPrimaId: number;
  nombre: string;
  unidad: string | null;
  porcentaje: number | null;
  kg: number | null;
  litros: number | null;
  costo: number | null;
}
interface FilaReporte extends OpcionSku {
  mes: string;
  fecha: string;
  formula: FilaFormula[];
  materiaPrima: number | null;
  empaque: number | null;
  carton: number | null;
  cartonSinDato: boolean;
  cartonAplica: boolean;
  manoObra: number | null;
  gif: number | null;
  mesAplicado: string | null;
  totalUnidad: number | null;
  totalLitro: number | null;
  avisos: string[];
  error: string | null;
  pendiente: boolean;
}

@Component({
  selector: 'app-comparativa',
  standalone: true,
  imports: [DecimalPipe, MatCardModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './comparativa.html',
  styleUrl: './comparativa.css',
})
export class Comparativa {
  private readonly data = inject(DataService);
  private readonly costos = inject(CostosProduccionService);
  private readonly registros = signal<Record<number, CargaSku>>({});
  private readonly revision = signal(0);
  readonly productos = this.data.productos.asReadonly();
  readonly cargandoCatalogo = this.data.cargando.asReadonly();
  readonly cargado = this.data.cargado.asReadonly();
  readonly errorCarga = this.data.error.asReadonly();
  readonly cargandoCostos = signal(false);
  readonly actualizando = signal(false);
  readonly errorActualizacion = signal('');
  readonly textoBusqueda = signal('');
  readonly categoriaSeleccionada = signal('Todas');
  readonly marcaSeleccionada = signal('Todas');
  readonly tecnologiaSeleccionada = signal('Todas');
  readonly mesDesde = signal(mesActualEcuador());
  readonly mesHasta = signal(mesActualEcuador());
  readonly frecuencia = signal('semanal');
  readonly semanaFiltro = signal('todas');
  private rangoManual = false;
  readonly orden = signal('producto');
  readonly cargando = computed(
    () => this.cargandoCatalogo() || this.cargandoCostos() || this.actualizando(),
  );

  readonly opciones = computed<OpcionSku[]>(() =>
    this.productos()
      .filter((p) => p.activo)
      .flatMap((producto) =>
        producto.presentaciones
          .filter((p) => p.activo)
          .map((presentacion) => ({ producto, presentacion })),
      ),
  );
  readonly categorias = computed(() =>
    [...new Set(this.opciones().map((o) => o.producto.categoria))].sort(),
  );
  readonly marcas = computed(() =>
    [...new Set(this.opciones().map((o) => o.producto.marca))].sort(),
  );
  readonly tecnologias = computed(() =>
    [...new Set(this.opciones().map((o) => o.presentacion.tecnologia))].sort(),
  );
  readonly opcionesFiltradas = computed(() =>
    this.opciones().filter(
      (o) =>
        (this.categoriaSeleccionada() === 'Todas' ||
          o.producto.categoria === this.categoriaSeleccionada()) &&
        (this.marcaSeleccionada() === 'Todas' || o.producto.marca === this.marcaSeleccionada()) &&
        (this.tecnologiaSeleccionada() === 'Todas' ||
          o.presentacion.tecnologia === this.tecnologiaSeleccionada()) &&
        coincideBusqueda(
          this.textoBusqueda(),
          o.producto.nombre,
          o.producto.marca,
          o.producto.variante,
          o.producto.categoria,
          o.presentacion.nombreSku,
          o.presentacion.claveSku,
          o.presentacion.lineaProducto ?? '',
          o.presentacion.codigoBarras ?? '',
          this.etiqueta(o.presentacion),
        ),
    ),
  );

  readonly rangoInvalido = computed(() => {
    const valido = (mes: string) => /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(mes);
    return (
      !valido(this.mesDesde()) || !valido(this.mesHasta()) || this.mesDesde() > this.mesHasta()
    );
  });
  readonly mesesDelRango = computed(() => {
    if (this.rangoInvalido()) return [];
    const indice = (mes: string) => {
      const [anio, numero] = mes.split('-').map(Number);
      return anio * 12 + numero - 1;
    };
    const meses: string[] = [];
    const fin = indice(this.mesHasta());
    for (let i = indice(this.mesDesde()); i <= fin; i++) {
      meses.push(
        `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`,
      );
    }
    return meses;
  });

  readonly periodosDelRango = computed(() =>
    this.mesesDelRango().flatMap((mes) => {
      if (this.frecuencia() === 'mensual')
        return [{ mes, fecha: fechaCierreMes(mes), etiqueta: this.etiquetaMes(mes) }];
      return this.data
        .semanasMateriaPrima(
          this.opcionesFiltradas().map((o) => o.presentacion),
          mes,
        )
        .map((fecha, indice) => ({
          mes,
          fecha,
          indice,
          etiqueta: `${this.etiquetaMes(mes)} · Semana ${indice + 1} · ${fecha.split('-').reverse().join('/')}`,
        }))
        .filter((p) => this.semanaFiltro() === 'todas' || p.indice === Number(this.semanaFiltro()));
    }),
  );

  readonly filas = computed<FilaReporte[]>(() => {
    const registros = this.registros();
    const filas = this.periodosDelRango().flatMap(({ mes, fecha }) =>
      this.opcionesFiltradas().map((o) => {
        const carga = registros[o.presentacion.id];
        const datos = carga?.datos;
        const valoracion =
          this.frecuencia() === 'mensual'
            ? this.data.materiaPrimaDelMes(o.presentacion, mes)
            : this.data.materiaPrimaEnFecha(o.presentacion, fecha);
        const mp = valoracion?.costo ?? null;
        const materiaPrima = mp !== null && Number.isFinite(mp) && mp >= 0 ? mp : null;
        const mano = datos ? resolverManoObra(datos.manoObra, `${mes}-01`) : null;
        const empaque = datos?.costoEmpaque ?? null;
        const carton = datos?.costoCarton ?? null;

        const indirectos = datos ? resolverGastosIndirectos(datos.gastosIndirectos, mes) : null;
        const gif = indirectos?.costo ?? null;

        const manoObraVal = mano?.costo_unitario ?? null;

        const totalUnidad =
          empaque === null || carton === null
            ? null
            : sumarCostoFinal(materiaPrima, empaque, manoObraVal, gif, carton);

        const litrosValidos = Number.isFinite(o.presentacion.litros) && o.presentacion.litros > 0;
        const avisos: string[] = [];
        if (materiaPrima === null)
          avisos.push('Materia prima pendiente: sin fórmula/cantidades o costo inválido.');
        if (datos && gif === null)
          avisos.push(`Sin gastos indirectos registrados para ${this.etiquetaMes(mes)}.`);
        if (indirectos?.estimado) avisos.push('Gastos indirectos estimados por referencia.');
        if (!litrosValidos)
          avisos.push('Volumen nominal inválido: no se calcula el costo por litro.');
        if (datos) {
          if (datos.empaqueSinDato)
            avisos.push('Empaque incompleto: los tipos sin dato aportan 0 al subtotal.');
          if (datos.empaqueEstimado) avisos.push('Empaque estimado por referencia de producto.');
          if (datos.cartonSinDato) avisos.push('Cartón sin dato: aporta 0 al subtotal.');
          if (datos.cartonEstimado) avisos.push('Cartón estimado por referencia.');
          if (!mano) avisos.push('Sin mano de obra vigente para el mes elegido.');
          else {
            if (mano.mes.slice(0, 7) !== mes)
              avisos.push(`Mano de obra vigente desde ${this.etiquetaMes(mano.mes.slice(0, 7))}.`);
            if (mano.estimado) avisos.push('Mano de obra estimada.');
          }
        }
        return {
          ...o,
          mes,
          fecha,
          formula: this.formulaSku(o.presentacion, valoracion?.porMateria),
          materiaPrima,
          empaque,
          carton,
          cartonSinDato: datos?.cartonSinDato ?? false,
          cartonAplica: datos?.cartonAplica ?? false,
          manoObra: manoObraVal,
          gif,
          mesAplicado: mano?.mes.slice(0, 7) ?? null,
          totalUnidad,
          totalLitro:
            totalUnidad === null || !litrosValidos ? null : totalUnidad / o.presentacion.litros,
          avisos,
          error: carga?.error ?? null,
          pendiente: !carga,
        };
      }),
    );

    const orden = this.orden();
    return filas.sort((a, b) => {
      const porMes = a.fecha.localeCompare(b.fecha);
      if (porMes) return porMes;
      if (orden !== 'producto') {
        const x = orden === 'unidad' ? a.totalUnidad : a.totalLitro;
        const y = orden === 'unidad' ? b.totalUnidad : b.totalLitro;
        if (x === null && y !== null) return 1;
        if (x !== null && y === null) return -1;
        if (x !== null && y !== null && x !== y) return x - y;
      }
      return (
        a.producto.nombre.localeCompare(b.producto.nombre, 'es') ||
        a.presentacion.litros - b.presentacion.litros ||
        a.presentacion.tecnologia.localeCompare(b.presentacion.tecnologia)
      );
    });
  });

  readonly resumen = computed(() => {
    const filas = this.filas();
    return {
      productos: new Set(filas.map((f) => f.producto.id)).size,
      sku: new Set(filas.map((f) => f.presentacion.id)).size,
      calculados: filas.filter((f) => f.totalUnidad !== null).length,
      observados: filas.filter((f) => !!f.error || f.avisos.length > 0).length,
    };
  });

  readonly filasPorSku = computed(() => {
    const grupos = new Map<number, { presentacionId: number; meses: FilaReporte[] }>();
    // El orden por costo corresponde al primer mes del rango.
    for (const fila of this.filas()) {
      let grupo = grupos.get(fila.presentacion.id);
      if (!grupo) {
        grupo = { presentacionId: fila.presentacion.id, meses: [] };
        grupos.set(fila.presentacion.id, grupo);
      }
      grupo.meses.push(fila);
    }
    return [...grupos.values()];
  });

  constructor() {
    effect(
      (onCleanup) => {
        const opciones = this.opciones();
        this.revision();
        let cancelado = false;
        onCleanup(() => {
          cancelado = true;
        });
        this.registros.set({});
        this.cargandoCostos.set(opciones.length > 0);
        if (opciones.length) void this.cargarCostos(opciones, () => cancelado);
      },
      { allowSignalWrites: true },
    );
  }

  private async cargarCostos(opciones: OpcionSku[], cancelado: () => boolean): Promise<void> {
    let indice = 0;
    const trabajador = async (): Promise<void> => {
      while (!cancelado()) {
        const opcion = opciones[indice++];
        if (!opcion) return;
        let carga: CargaSku;
        try {
          carga = { datos: await this.costos.cargar(opcion.presentacion.id), error: null };
        } catch (error: unknown) {
          carga = {
            datos: null,
            error:
              error instanceof Error ? error.message : 'No se pudieron cargar los costos del SKU.',
          };
        }
        if (cancelado()) return;
        this.registros.update((actuales) => ({ ...actuales, [opcion.presentacion.id]: carga }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, opciones.length) }, () => trabajador()));
    if (!cancelado()) {
      if (!this.rangoManual) this.usarRangoDisponible();
      this.cargandoCostos.set(false);
    }
  }

  cambiarDesde(mes: string): void {
    this.rangoManual = true;
    this.mesDesde.set(mes);
  }

  cambiarHasta(mes: string): void {
    this.rangoManual = true;
    this.mesHasta.set(mes);
  }

  private usarRangoDisponible(): void {
    const actual = mesActualEcuador();
    const meses = Object.values(this.registros())
      .flatMap((carga) => carga.datos?.gastosIndirectos.map((g) => g.mes.slice(0, 7)) ?? [])
      .filter((mes) => mes <= actual)
      .sort();
    this.mesDesde.set(meses[0] ?? actual);
    this.mesHasta.set(meses.at(-1) ?? actual);
  }

  async actualizarAhora(): Promise<void> {
    if (this.cargando()) return;
    this.actualizando.set(true);
    this.errorActualizacion.set('');
    try {
      await this.data.actualizarAhora();
      this.revision.update((n) => n + 1);
    } catch (error: unknown) {
      this.errorActualizacion.set(
        error instanceof Error ? error.message : 'No se pudo actualizar el reporte.',
      );
    } finally {
      this.actualizando.set(false);
    }
  }

  reintentarCostos(): void {
    if (!this.cargando()) this.revision.update((n) => n + 1);
  }

  limpiarFiltros(): void {
    this.textoBusqueda.set('');
    this.categoriaSeleccionada.set('Todas');
    this.marcaSeleccionada.set('Todas');
    this.tecnologiaSeleccionada.set('Todas');
    this.orden.set('producto');
    this.rangoManual = false;
    this.usarRangoDisponible();
  }

  private formulaSku(p: Presentacion, costos?: Map<number, number>): FilaFormula[] {
    const ids = new Set([
      ...p.ingredientes.map((i) => i.materiaPrimaId),
      ...p.items.map((i) => i.materiaPrimaId),
    ]);
    return [...ids].map((materiaPrimaId) => {
      const ingrediente = p.ingredientes.find((i) => i.materiaPrimaId === materiaPrimaId);
      const items = p.items.filter((i) => i.materiaPrimaId === materiaPrimaId);
      const sumar = (campo: 'kg' | 'litros' | 'costo'): number | null => {
        if (!items.length || items.some((i) => !Number.isFinite(i[campo]) || i[campo] < 0))
          return null;
        return items.reduce((total, i) => total + i[campo], 0);
      };
      const porcentaje = ingrediente?.porcentaje;
      return {
        materiaPrimaId,
        nombre: ingrediente?.nombre ?? items[0]?.ingrediente ?? 'Ingrediente sin nombre',
        unidad: ingrediente?.unidad ?? null,
        porcentaje:
          porcentaje !== undefined && Number.isFinite(porcentaje) && porcentaje >= 0
            ? porcentaje
            : null,
        kg: sumar('kg'),
        litros: sumar('litros'),
        costo: costos?.get(materiaPrimaId) ?? null,
      };
    });
  }

  etiqueta(p: Presentacion): string {
    return `${Number((p.litros * 1000).toFixed(3)).toLocaleString('es-EC', { maximumFractionDigits: 3 })} ml · ${p.tecnologia}`;
  }

  etiquetaMes(mes: string): string {
    return new Intl.DateTimeFormat('es-EC', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${mes}-01T00:00:00Z`));
  }
}
