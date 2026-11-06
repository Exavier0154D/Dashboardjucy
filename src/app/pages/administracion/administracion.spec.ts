import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CatalogoAdminService, CatalogoAdmin, EmpaqueDB } from '../../core/catalogo-admin.service';
import { DataService } from '../../core/data.service';
import { Administracion } from './administracion';

describe('Eliminación desde administración', () => {
  const empaque: EmpaqueDB = { id: 7, presentacion_id: 3, tipo: 'Botella', costo: 1, estado: 'confirmado', producto_origen_id: null };
  const catalogo: CatalogoAdmin = { productos: [], materias: [], presentaciones: [], formulas: [], items: [], empaques: [empaque] };
  let component: Administracion;
  let api: { eliminarRegistro: ReturnType<typeof vi.fn>; cargarCatalogo: ReturnType<typeof vi.fn> };
  let actualizar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    api = { eliminarRegistro: vi.fn().mockResolvedValue(undefined), cargarCatalogo: vi.fn().mockResolvedValue({ ...catalogo, empaques: [] }) };
    actualizar = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: CatalogoAdminService, useValue: api },
      { provide: DataService, useValue: { actualizarAhora: actualizar } },
    ] });
    component = TestBed.runInInjectionContext(() => new Administracion());
    component.catalogo.set(catalogo);
    component.editor.set(true);
    component.editarEmpaque(empaque);
  });
  afterEach(() => vi.restoreAllMocks());

  it('exige acceso de editor y confirmación antes de eliminar', async () => {
    component.editor.set(false);
    await component.eliminarActual();
    expect(component.confirmacion()).toBeNull();
    component.editor.set(true);
    await component.eliminarActual();
    expect(component.confirmacion()).not.toBeNull();
    await component.cancelarConfirmacion();
    expect(api.eliminarRegistro).not.toHaveBeenCalled();
    expect(component.editando()).toBe('empaques');
  });

  it('elimina el registro existente aunque el formulario tenga cambios inválidos y actualiza el dashboard', async () => {
    component.formEmpaque.controls.costo.setValue(-1);
    await component.eliminarActual();
    await component.confirmarEliminacion();
    expect(api.eliminarRegistro).toHaveBeenCalledWith('empaque', 7);
    expect(actualizar).toHaveBeenCalledOnce();
    expect(component.empaques()).toEqual([]);
    expect(component.editando()).toBeNull();
    expect(component.aviso()).toBe('Registro eliminado.');
  });

  it('conserva el formulario y muestra el error cuando la base de datos rechaza la eliminación', async () => {
    api.eliminarRegistro.mockRejectedValue(new Error('Registro en uso'));
    await component.eliminarActual();
    await component.confirmarEliminacion();
    expect(component.error()).toBe('Registro en uso');
    expect(component.editando()).toBe('empaques');
    expect(component.guardando()).toBe(false);
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('bloquea productos con SKU y materias primas usadas en cantidades', async () => {
    component.catalogo.set({ ...catalogo, presentaciones: [{ id: 3, producto_id: 'p' } as CatalogoAdmin['presentaciones'][number]], items: [{ presentacion_id: 3, materia_prima_id: 9, kg: 1, litros: 0, costo_original: null }] });
    component.editando.set('productos');
    component.formProducto.controls.id.setValue('p');
    await component.eliminarActual();
    expect(component.error()).toContain('SKU');
    component.editando.set('materias');
    component.formMateria.controls.id.setValue(9);
    await component.eliminarActual();
    expect(component.error()).toContain('en uso');
    expect(api.eliminarRegistro).not.toHaveBeenCalled();
    expect(component.confirmacion()).toBeNull();
  });
});
