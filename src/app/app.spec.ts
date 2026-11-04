import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { SupabaseService } from './core/supabase.service';
import { CatalogoAdminService } from './core/catalogo-admin.service';

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
});
