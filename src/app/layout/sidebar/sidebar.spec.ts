import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogoAdminService } from '../../core/catalogo-admin.service';
import { Sidebar } from './sidebar';

describe('Permiso de administración en el menú', () => {
  let actualizarSesion: () => void;
  const api = {
    escucharSesion: vi.fn((callback: () => void) => {
      actualizarSesion = callback;
      return { unsubscribe: vi.fn() };
    }),
    sesionEditor: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    api.sesionEditor.mockResolvedValue({ email: 'usuario@jucy.com', editor: false });
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [provideRouter([]), { provide: CatalogoAdminService, useValue: api }],
    }).compileComponents();
  });

  it('muestra Administración solo cuando la cuenta tiene permiso y actualiza el menú al cambiar de sesión', async () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/administracion"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/insumos"]')).not.toBeNull();

    api.sesionEditor.mockResolvedValue({ email: 'editor@jucy.com', editor: true });
    actualizarSesion();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/administracion"]')).not.toBeNull();

    api.sesionEditor.mockResolvedValue({ email: null, editor: false });
    actualizarSesion();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/administracion"]')).toBeNull();
  });

  it('mantiene oculto el acceso si falla la comprobación de permisos', async () => {
    api.sesionEditor.mockRejectedValue(new Error('Sin conexión'));
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/administracion"]')).toBeNull();
  });
});
