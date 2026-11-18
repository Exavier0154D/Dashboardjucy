import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CostosProduccionService } from '../../core/costos-produccion.service';
import { SupabaseService } from '../../core/supabase.service';
import { HistoricoCostos } from './historico-costos';

describe('Corte de precios del gráfico histórico', () => {
  async function crear() {
    const precios = [
      { materia_prima_id: 57, semana: '2026-01-01', costo_kg: 0.23 },
      { materia_prima_id: 57, semana: '2026-08-22', costo_kg: 0.29 },
      { materia_prima_id: 57, semana: '2026-09-01', costo_kg: 9 },
      { materia_prima_id: 57, semana: '2026-10-01', costo_kg: 0.24 },
      { materia_prima_id: 57, semana: '2026-12-01', costo_kg: 10 },
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
    return fixture.componentInstance;
  }

  it('incluye octubre y llega hasta el último precio registrado', async () => {
    const component = await crear();
    expect(component.fechaLimitePrecios()).toBe('2026-12-01');
    expect(component.semanas()).toEqual([
      '2026-01-01',
      '2026-08-22',
      '2026-09-01',
      '2026-10-01',
      '2026-12-01',
    ]);
    expect(component.hasta()).toBe('2026-12-01');
    expect(component.serie().map((p) => p.costo)).toEqual([0.23, 0.29, 9, 0.24, 10]);
    expect(component.chartData().labels).toContain('01/10/2026');
  });

  it('permite consultar meses posteriores y mantiene el último precio conocido', async () => {
    const component = await crear();
    component.hasta.set('2027-02-01');
    expect(component.serie().at(-1)?.semana).toBe('2027-02-01');
    expect(component.resumen()?.ultimo).toBe(10);
    component.desde.set('2027-01-01');
    expect(component.serie().map((p) => p.semana)).toEqual(['2027-01-01', '2027-02-01']);
    expect(component.serie().map((p) => p.costo)).toEqual([10, 10]);
  });

  it('conserva la última materia elegida al abrir el buscador y actualizar los precios', async () => {
    const component = await crear();
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
    const component = await crear();
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
    const component = await crear();
    component.seleccionarMateria(component.materiales().find((m) => m.id === 58)!);
    const nuevaVista = TestBed.createComponent(HistoricoCostos);
    await nuevaVista.componentInstance.cargarDatos();
    expect(nuevaVista.componentInstance.materiaId()).toBe(58);
    expect(nuevaVista.componentInstance.textoMateria()).toBe('Toronja Blanca');
  });
});
