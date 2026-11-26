import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { CostosProduccionService } from '../../core/costos-produccion.service';
import { SupabaseService } from '../../core/supabase.service';
import { HistoricoCostos } from './historico-costos';

describe('Corte de precios del gráfico histórico', () => {
  async function crear(
    preciosAdicionales: { materia_prima_id: number; semana: string; costo_kg: number }[] = [],
  ) {
    const precios = [
      { materia_prima_id: 57, semana: '2026-01-01', costo_kg: 0.23 },
      { materia_prima_id: 57, semana: '2026-08-22', costo_kg: 0.29 },
      { materia_prima_id: 57, semana: '2026-09-01', costo_kg: 9 },
      { materia_prima_id: 57, semana: '2026-10-01', costo_kg: 0.24 },
      { materia_prima_id: 57, semana: '2026-12-01', costo_kg: 10 },
      ...preciosAdicionales,
    ];
    TestBed.configureTestingModule({
      imports: [HistoricoCostos],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: CostosProduccionService, useValue: {} },
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: (tabla: string) => ({
                select: () => ({
                  order: () => ({
                    range: async () => {
                      const data =
                        tabla === 'precio_historico'
                          ? precios
                          : [
                              {
                                id: 57,
                                nombre: 'Coco',
                                costo_kg: 0.35,
                                costo_base_historico: 0.25,
                              },
                              {
                                id: 58,
                                nombre: 'Toronja Blanca',
                                costo_kg: 0.8,
                                costo_base_historico: 0.8,
                              },
                            ];
                      return { data, count: data.length, error: null };
                    },
                  }),
                }),
              }),
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(HistoricoCostos);
    await fixture.whenStable();
    await fixture.componentInstance.cargarDatos();
    return fixture;
  }

  it('incluye octubre y llega hasta el último precio registrado', async () => {
    const component = (await crear()).componentInstance;
    expect(component.fechaLimitePrecios()).toBe('2026-12-01');
    expect(component.semanas()).toEqual([
      '2026-01-01',
      '2026-08-22',
      '2026-09-01',
      '2026-10-01',
      '2026-12-01',
    ]);
    expect(component.desde()).toBe('');
    expect(component.hasta()).toBe('');
    component.seleccionarMes('desde', '2026-01');
    component.seleccionarCorte('desde', '2026-01-01');
    component.seleccionarMes('hasta', '2026-12');
    component.seleccionarCorte('hasta', '2026-12-29');
    expect(component.serie().find((p) => p.semana === '2026-01-08')?.costo).toBe(0.23);
    expect(component.serie().find((p) => p.semana === '2026-02-01')?.costo).toBe(0.23);
    expect(component.serie().find((p) => p.semana === '2026-08-15')?.costo).toBe(0.23);
    expect(component.serie().find((p) => p.semana === '2026-08-29')?.costo).toBe(0.29);
    expect(component.serie().at(-1)?.costo).toBe(10);
    expect(component.chartData().labels).toContain('01/10/2026');
    component.limpiarSelectorMateria();
    expect(component.mesDesde()).toBe('');
    expect(component.desde()).toBe('');
    expect(component.mesHasta()).toBe('');
    expect(component.hasta()).toBe('');
  });

  it('limita los cortes al año activo y ajusta Hasta al mover Desde', async () => {
    const fixture = await crear([
      { materia_prima_id: 57, semana: '2025-02-08', costo_kg: 0.2 },
      { materia_prima_id: 57, semana: '2025-03-15', costo_kg: 0.21 },
      { materia_prima_id: 58, semana: '2026-04-01', costo_kg: 0.8 },
    ]);
    const component = fixture.componentInstance;
    expect(component.aniosDisponibles()).toContain('2025');
    expect(component.fechasDisponibles()).toContain('2026-02-08');
    expect(component.fechasDisponibles()).toContain('2026-08-22');
    expect(component.fechasDisponibles()).not.toContain('2025-02-08');
    fixture.detectChanges();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const anio = await loader.getHarness(MatSelectHarness.with({ selector: '#historico-anio' }));
    const mesDesde = await loader.getHarness(
      MatSelectHarness.with({ selector: '#historico-mes-desde' }),
    );
    const semanaDesde = await loader.getHarness(
      MatSelectHarness.with({ selector: '#historico-desde' }),
    );
    const mesHasta = await loader.getHarness(
      MatSelectHarness.with({ selector: '#historico-mes-hasta' }),
    );
    const semanaHasta = await loader.getHarness(
      MatSelectHarness.with({ selector: '#historico-hasta' }),
    );
    expect(await mesDesde.getValueText()).toBe('');
    expect(await semanaDesde.getValueText()).toBe('');
    expect(await mesHasta.isDisabled()).toBe(true);
    await mesDesde.open();
    expect(
      await Promise.all((await mesDesde.getOptions()).map((opcion) => opcion.getText())),
    ).toContain('Febrero');
    await mesDesde.clickOptions({ text: 'Febrero' });
    expect(component.mesDesde()).toBe('2026-02');
    expect(component.desde()).toBe('');
    expect(await semanaDesde.getValueText()).toBe('');
    await semanaDesde.open();
    expect(
      await Promise.all((await semanaDesde.getOptions()).map((opcion) => opcion.getText())),
    ).toContain('08/02/2026');
    await semanaDesde.clickOptions({ text: '08/02/2026' });
    expect(component.desde()).toBe('2026-02-08');
    expect(await mesHasta.isDisabled()).toBe(false);
    await mesHasta.open();
    await mesHasta.clickOptions({ text: 'Octubre' });
    expect(component.mesHasta()).toBe('2026-10');
    expect(component.hasta()).toBe('');
    expect(await semanaHasta.getValueText()).toBe('');
    await semanaHasta.open();
    await semanaHasta.clickOptions({ text: '01/10/2026' });
    expect(component.hasta()).toBe('2026-10-01');
    component.seleccionarMes('desde', '2026-11');
    expect(component.desde()).toBe('');
    expect(component.hasta()).toBe('');
    component.seleccionarCorte('desde', '2026-11-01');
    expect(component.mesesHasta()).not.toContain('2026-10');
    component.seleccionarMes('hasta', '2026-12');
    component.seleccionarCorte('hasta', '2026-12-01');
    expect(component.resumen()?.ultimo).toBe(10);
    component.seleccionarCorte('desde', '2026-11-29');
    expect(component.hasta()).toBe('2026-12-01');
    expect(component.fechasHasta()[0]).toBe('2026-11-29');
    expect(component.semanasHasta()).not.toContain('2026-09-29');
    component.seleccionarMes('desde', '2026-12');
    component.seleccionarCorte('desde', '2026-12-01');
    component.seleccionarMes('hasta', '2026-12');
    component.seleccionarCorte('hasta', '2026-12-08');
    component.seleccionarCorte('desde', '2026-12-15');
    expect(component.hasta()).toBe('');
    expect(component.mesHasta()).toBe('');
    component.seleccionarCorte('hasta', '2025-03-15');
    expect(component.hasta()).toBe('');
    await anio.open();
    expect(
      await Promise.all((await anio.getOptions()).map((opcion) => opcion.getText())),
    ).toContain('2025');
    await anio.clickOptions({ text: '2025' });
    await fixture.whenStable();
    expect(component.fechasDisponibles()).toContain('2025-02-08');
    expect(component.desde()).toBe('');
    expect(component.hasta()).toBe('');
    component.seleccionarMes('desde', '2025-02');
    component.seleccionarCorte('desde', '2025-02-08');
    component.seleccionarMes('hasta', '2025-03');
    component.seleccionarCorte('hasta', '2025-03-15');
    expect(component.resumen()?.porcentaje).toBeCloseTo(5);
  });

  it('conserva la última materia elegida al abrir el buscador y actualizar los precios', async () => {
    const component = (await crear()).componentInstance;
    component.seleccionarMateria(component.materiales().find((m) => m.id === 58)!);
    component.prepararBusquedaMateria();
    expect(component.textoMateria()).toBe('Toronja Blanca');
    expect(component.materiaId()).toBe(58);
    expect(component.materiasSelector().map((m) => m.id)).toEqual([58]);
    await component.cargarDatos();
    expect(component.materiaId()).toBe(58);
    expect(component.textoMateria()).toBe('Toronja Blanca');
  });

  it('recupera la selección confirmada al cancelar una búsqueda y permite limpiarla explícitamente', async () => {
    const component = (await crear()).componentInstance;
    component.seleccionarMateria(component.materiales().find((m) => m.id === 58)!);
    component.buscarMateria('Coc');
    component.restaurarSeleccionMateria();
    expect(component.materiaId()).toBe(58);
    expect(component.textoMateria()).toBe('Toronja Blanca');
    component.limpiarSelectorMateria();
    component.restaurarSeleccionMateria();
    expect(component.materiaId()).toBeNull();
    expect(component.textoMateria()).toBe('');
  });

  it('recuerda la materia elegida al volver a crear la vista', async () => {
    const component = (await crear()).componentInstance;
    component.seleccionarMateria(component.materiales().find((m) => m.id === 58)!);
    const nuevaVista = TestBed.createComponent(HistoricoCostos);
    await nuevaVista.componentInstance.cargarDatos();
    expect(nuevaVista.componentInstance.materiaId()).toBe(58);
    expect(nuevaVista.componentInstance.textoMateria()).toBe('Toronja Blanca');
  });
});
