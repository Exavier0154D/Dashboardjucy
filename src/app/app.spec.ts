import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('ofrece acceso directo al catálogo de materia prima', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(
      compiled.querySelector('nav[aria-label="Menú principal"] a[href="/insumos"]')?.textContent,
    ).toContain('Materia prima');
    expect(compiled.querySelector('main router-outlet')).not.toBeNull();
  });
});
