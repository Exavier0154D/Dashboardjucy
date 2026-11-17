import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { DESPLEGABLES_SCROLL_PROVIDERS } from './core/desplegables-scroll';
import { App } from './app';
import { SupabaseService } from './core/supabase.service';
import { CatalogoAdminService } from './core/catalogo-admin.service';

@Component({ template: 'Sugerencias de búsqueda' })
class PanelBusquedaPrueba {}

@Component({
  imports: [MatAutocompleteModule],
  providers: DESPLEGABLES_SCROLL_PROVIDERS,
  template: `<input aria-label="Buscar materia prima" [matAutocomplete]="opciones" />
    <mat-autocomplete #opciones="matAutocomplete">
      <mat-option value="Coco">Coco</mat-option>
      <mat-option value="Limón">Limón</mat-option>
    </mat-autocomplete>`,
})
class BuscadorScrollPrueba {}

describe('Acceso a la aplicación', () => {
  let cambiarSesion: (event: string, session: any) => void;
  const auth = {
    onAuthStateChange: vi.fn((callback: typeof cambiarSesion) => {
      cambiarSesion = callback;
      callback('INITIAL_SESSION', null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: { client: { auth } } },
        { provide: CatalogoAdminService, useValue: {
          escucharSesion: () => ({ unsubscribe: () => {} }),
          sesionEditor: async () => ({ email: null, editor: false }),
        } },
      ],
    }).compileComponents();
  });

  it('pide iniciar sesión antes de mostrar el catálogo y permite salir', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#login-email')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();

    auth.signInWithPassword.mockImplementation(async () => {
      cambiarSesion('SIGNED_IN', { user: { email: 'usuario@jucy.com' } });
      return { error: null };
    });
    fixture.componentInstance.formulario.setValue({ email: 'usuario@jucy.com', password: 'clave' });
    await fixture.componentInstance.iniciarSesion();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('usuario@jucy.com');

    auth.signOut.mockImplementation(async () => {
      cambiarSesion('SIGNED_OUT', null);
      return { error: null };
    });
    await fixture.componentInstance.cerrarSesion();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#login-email')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
  });

  it('muestra el error y limpia la contraseña si las credenciales fallan', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    auth.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login') });
    fixture.componentInstance.formulario.setValue({ email: 'usuario@jucy.com', password: 'incorrecta' });
    await fixture.componentInstance.iniciarSesion();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Revisa tu correo');
    expect(fixture.componentInstance.formulario.controls.password.value).toBe('');
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
  });

  it('restaura una sesión existente al cargar', async () => {
    auth.onAuthStateChange.mockImplementationOnce((callback) => {
      cambiarSesion = callback;
      callback('INITIAL_SESSION', { user: { email: 'usuario@jucy.com' } });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#login-email')).toBeNull();
  });

  it('reposiciona las sugerencias al desplazar el panel principal con la rueda', async () => {
    auth.onAuthStateChange.mockImplementationOnce((callback) => {
      cambiarSesion = callback;
      callback('INITIAL_SESSION', { user: { email: 'usuario@jucy.com' } });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const contenido = fixture.nativeElement.querySelector('#contenido-principal') as HTMLElement;
    const overlay = TestBed.inject(Overlay);
    const panel = overlay.create({ scrollStrategy: overlay.scrollStrategies.reposition() });
    try {
      panel.attach(new ComponentPortal(PanelBusquedaPrueba));
      const reposicionar = vi.spyOn(panel, 'updatePosition');
      contenido.scrollTop = 200;
      contenido.dispatchEvent(new Event('scroll'));
      expect(reposicionar).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    } finally {
      panel.dispose();
    }
  });

  it('permite recorrer las opciones y cierra el buscador al desplazar la página sin perder la selección', async () => {
    auth.onAuthStateChange.mockImplementationOnce((callback) => {
      cambiarSesion = callback;
      callback('INITIAL_SESSION', { user: { email: 'usuario@jucy.com' } });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: 'prueba-scroll', component: BuscadorScrollPrueba }]);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    await router.navigateByUrl('/prueba-scroll');
    fixture.detectChanges();
    await fixture.whenStable();
    const buscador = fixture.debugElement.query(By.directive(MatAutocompleteTrigger));
    const trigger = buscador.injector.get(MatAutocompleteTrigger);
    const contenido = fixture.nativeElement.querySelector('#contenido-principal') as HTMLElement;
    trigger.openPanel();
    fixture.detectChanges();
    await fixture.whenStable();
    (trigger.autocomplete.panel.nativeElement.querySelector('mat-option') as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(buscador.nativeElement.value).toBe('Coco');

    trigger.openPanel();
    fixture.detectChanges();
    await fixture.whenStable();
    const opciones = trigger.autocomplete.panel.nativeElement;
    opciones.scrollTop = 50;
    opciones.dispatchEvent(new Event('scroll'));
    expect(trigger.panelOpen).toBe(true);

    contenido.scrollTop = 200;
    contenido.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(trigger.panelOpen).toBe(false);
    expect(buscador.nativeElement.value).toBe('Coco');
    expect(fixture.nativeElement.querySelector('#contenido-principal')).not.toBeNull();
  });
});
