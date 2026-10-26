import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MateriaPrima } from './materia-prima';

describe('MateriaPrima', () => {
  let component: MateriaPrima;
  let fixture: ComponentFixture<MateriaPrima>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MateriaPrima],
    }).compileComponents();

    fixture = TestBed.createComponent(MateriaPrima);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
