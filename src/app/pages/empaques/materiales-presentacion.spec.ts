import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { DataService } from '../../core/data.service';
import { MaterialesPorPresentacion } from './materiales-presentacion';

describe('Filtro de presentación en la guía de empaque', () => {
  it('muestra las capacidades en el desplegable y filtra la tabla', async () => {
    const productos = [
      {
        id: 'coco',
        nombre: 'Coco',
        marca: 'Jucy',
        categoria: 'Agua de Coco',
        activo: true,
        presentaciones: [
          {
            id: 1,
            activo: true,
            litros: 0.22,
            nombreSku: 'Coco 220 ml',
            tecnologia: 'HPP',
            codigoBarras: '',
          },
          {
            id: 2,
            activo: true,
            litros: 0.355,
            nombreSku: 'Coco 355 ml',
            tecnologia: 'HPP',
            codigoBarras: '',
          },
        ],
      },
    ];
    TestBed.configureTestingModule({
      imports: [MaterialesPorPresentacion],
      providers: [
        {
          provide: DataService,
          useValue: {
            productos: signal(productos),
            cargado: signal(true),
            cargando: signal(false),
            error: signal(null),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MaterialesPorPresentacion);
    await fixture.whenStable();
    const selector = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatSelectHarness.with({ selector: '#capacidad-materiales-select' }),
    );
    await selector.open();
    expect(
      await Promise.all((await selector.getOptions()).map((opcion) => opcion.getText())),
    ).toEqual(['Todas las presentaciones', '220 ml', '355 ml']);
    await selector.clickOptions({ text: '355 ml' });
    expect(fixture.componentInstance.capacidad()).toBe('0.355');
    expect(fixture.componentInstance.filtradas().map((fila) => fila.presentacion.id)).toEqual([2]);
  });
});
