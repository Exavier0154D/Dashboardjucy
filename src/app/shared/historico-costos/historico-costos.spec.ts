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

  it('termina en agosto aunque existan filas posteriores y no extiende la línea hasta hoy', async () => {
    const component = await crear();
    expect(component.semanas()).toEqual(['2026-01-01', '2026-08-22']);
    expect(component.hasta()).toBe('2026-08-22');
    expect(component.serie().map((p) => p.costo)).toEqual([0.23, 0.29]);
    expect(component.chartData().labels).toEqual(['01/01/2026', '22/08/2026']);
  });

  it('excluye fechas posteriores incluso al introducir manualmente otro rango', async () => {
    const component = await crear();
    component.hasta.set('2026-12-31');
    expect(component.serie().map((p) => p.semana)).toEqual(['2026-01-01', '2026-08-22']);
    expect(component.resumen()?.ultimo).toBe(0.29);
    component.desde.set('2026-09-01');
    expect(component.serie()).toEqual([]);
    expect(component.resumen()).toBeNull();
  });
});
