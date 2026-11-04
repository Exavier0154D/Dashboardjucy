import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SelectionService } from '../../core/selection.service';
import { CatalogoAdminService } from '../../core/catalogo-admin.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  private readonly selection = inject(SelectionService);
  private readonly admin = inject(CatalogoAdminService);
  private readonly destroyRef = inject(DestroyRef);
  private versionSesion = 0;
  readonly puedeAdministrar = signal(false);

  constructor() {
    afterNextRender(() => {
      const suscripcion = this.admin.escucharSesion(() => void this.actualizarPermiso());
      this.destroyRef.onDestroy(() => suscripcion.unsubscribe());
      void this.actualizarPermiso();
    });
  }

  private async actualizarPermiso(): Promise<void> {
    const version = ++this.versionSesion;
    this.puedeAdministrar.set(false);
    try {
      const sesion = await this.admin.sesionEditor();
      if (!this.destroyRef.destroyed && version === this.versionSesion) {
        this.puedeAdministrar.set(sesion.editor);
      }
    } catch {
      // Mantener oculto el acceso cuando no se pueda verificar el permiso.
    }
  }

  abrirProductos(): void {
    this.selection.limpiarSeleccion();
  }
}
