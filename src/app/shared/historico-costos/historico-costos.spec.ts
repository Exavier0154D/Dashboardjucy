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
    expect(component.semanas()).toEqual(['2026-01-01', '2026-08-22', '2026-09-01', '2026-10-01', '2026-12-01']);
    expect(component.hasta()).toBe('2026-12-01');
    expect(component.serie().map((p) => p.costo)).toEqual([0.23, 0.29, 9, 0.24, 10]);
    expect(component.chartData().labels).toContain('01/10/2026');
  });

  it('limita el rango manual al último precio registrado', async () => {
    const component = await crear();
    component.hasta.set('2026-12-31');
    expect(component.serie().at(-1)?.semana).toBe('2026-12-01');
    component.desde.set('2026-12-02');
    expect(component.serie()).toEqual([]);
    expect(component.resumen()).toBeNull();
  });
});
