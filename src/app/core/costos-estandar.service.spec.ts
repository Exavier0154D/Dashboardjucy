import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CostosEstandarService } from './costos-estandar.service';
import { CatalogoAdminService } from './catalogo-admin.service';
import { SupabaseService } from './supabase.service';

describe('Guardado de costos estándar', () => {
  const costos = { materiaPrima: 1, empaque: 0.2, carton: 0, manoObra: 0.1, gif: 0.05 };
  let service: CostosEstandarService;
  let permiso: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;
  let single: ReturnType<typeof vi.fn>;
  let maybeSingle: ReturnType<typeof vi.fn>;
  let upsert: ReturnType<typeof vi.fn>;
  let eq: ReturnType<typeof vi.fn>;
  let range: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    permiso = vi.fn().mockResolvedValue({ editor: true });
    single = vi.fn().mockResolvedValue({ data: { costos }, error: null });
    maybeSingle = vi.fn().mockResolvedValue({ data: { costos }, error: null });
    upsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    eq = vi.fn();
    range = vi.fn().mockResolvedValue({ data: [], count: 0, error: null });
    const consulta = { eq, maybeSingle, order: vi.fn(), range };
    eq.mockReturnValue(consulta);
    consulta.order.mockReturnValue(consulta);
    from = vi.fn().mockReturnValue({
      upsert,
      select: vi.fn().mockReturnValue(consulta),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogoAdminService, useValue: { sesionEditor: permiso } },
        { provide: SupabaseService, useValue: { client: { from } } },
      ],
    });
    service = TestBed.inject(CostosEstandarService);
  });

  it('impide escribir sin permiso de editor', async () => {
    permiso.mockResolvedValue({ editor: false });
    await expect(service.guardar(1, costos)).rejects.toThrow('autorizada');
    expect(from).not.toHaveBeenCalled();
    expect(service.obtener(1)).toBeNull();
  });

  it('rechaza números inválidos y acepta cero', async () => {
    for (const valor of [-1, NaN, Infinity, null]) {
      await expect(service.guardar(1, { ...costos, gif: valor as number })).rejects.toThrow();
    }
    expect(from).not.toHaveBeenCalled();
    await service.guardar(1, costos);
    expect(service.obtener(1)).toEqual(costos);
  });

  it('conserva la base confirmada si el servidor rechaza un cambio', async () => {
    await service.guardar(1, costos);
    single.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(service.guardar(1, { ...costos, gif: 9 })).rejects.toThrow('no tiene permiso');
    expect(service.obtener(1)).toEqual(costos);
  });

  it('tolera la tabla pendiente sin interrumpir la comparativa y reintenta después', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST205' } });
    expect(await service.cargar(1)).toBeNull();
    expect(service.disponible()).toBe(false);
    await expect(service.guardar(1, costos)).rejects.toThrow('no está habilitado');
    expect(await service.cargar(1)).toEqual(costos);
    expect(service.disponible()).toBe(true);
  });

  it('no convierte errores de acceso o conexión en una base vacía', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(service.cargar(1)).rejects.toThrow('Vuelve a intentarlo');
    expect(service.disponible()).toBe(true);
  });

  it('rechaza una fila con costos nulos en lugar de crear una referencia vacía', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { costos: null }, error: null });
    await expect(service.cargar(1)).rejects.toThrow('inválidos');
  });

  it('guarda y carga meses separados sin sobrescribir la base fija', async () => {
    await service.guardar(1, costos);
    await service.guardar(1, costos, '2026-07');
    expect(from).toHaveBeenLastCalledWith('costo_mensual');
    expect(upsert).toHaveBeenLastCalledWith(
      { presentacion_id: 1, mes: '2026-07-01', costos },
      { onConflict: 'presentacion_id,mes' },
    );
    await service.cargar(1, '2026-07');
    expect(eq).toHaveBeenLastCalledWith('mes', '2026-07-01');
    expect(service.obtener(1)).toEqual(costos);
    expect(service.obtener(1, '2026-07')).toEqual(costos);
    expect(service.obtener(1, '2026-08')).toBeNull();
  });

  it('rechaza períodos inválidos antes de consultar o guardar', async () => {
    for (const mes of ['2026-13', '2026-00', '0000-01', '2026-1', '2026-01-01']) {
      await expect(service.cargar(1, mes)).rejects.toThrow('mes válido');
      await expect(service.guardar(1, costos, mes)).rejects.toThrow('mes válido');
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('incorpora los meses guardados y conserva las bases y otros SKU', async () => {
    await service.guardar(1, costos);
    await service.guardar(2, costos, '2026-01');
    range.mockResolvedValue({ data: [{ mes: '2026-09-01', costos }], error: null, count: 1 });
    await service.cargarMensuales(1);
    expect(service.mesesGuardados(1)).toEqual(['2026-09']);
    expect(service.obtener(1)).toEqual(costos);
    expect(service.mesesGuardados(2)).toEqual(['2026-01']);
  });

  it('mantiene habilitada la base fija si falta la tabla mensual', async () => {
    range.mockResolvedValue({ data: null, count: null, error: { code: 'PGRST205' } });
    await service.cargarMensuales(1);
    expect(service.disponiblePara('2026-07')).toBe(false);
    expect(service.disponiblePara()).toBe(true);
    await expect(service.guardar(1, costos, '2026-07')).rejects.toThrow('no está habilitado');
    await service.guardar(1, costos);
    expect(service.obtener(1)).toEqual(costos);
  });
});
