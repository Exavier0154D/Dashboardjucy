import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from './layout/sidebar/sidebar';
import { SupabaseService } from './core/supabase.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Sidebar, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly auth = inject(SupabaseService).client.auth;
  private readonly destroyRef = inject(DestroyRef);
  readonly comprobando = signal(true);
  readonly email = signal<string | null>(null);
  readonly ocupado = signal(false);
  readonly error = signal('');
  readonly formulario = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    afterNextRender(() => {
      const { data } = this.auth.onAuthStateChange((_evento, sesion) => {
        queueMicrotask(() => {
          if (this.destroyRef.destroyed) return;
          this.email.set(sesion?.user.email ?? (sesion ? sesion.user.id : null));
          this.comprobando.set(false);
        });
      });
      this.destroyRef.onDestroy(() => data.subscription.unsubscribe());
    });
  }

  async iniciarSesion(): Promise<void> {
    if (this.ocupado()) return;
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) return;
    this.ocupado.set(true);
    this.error.set('');
    const { email, password } = this.formulario.getRawValue();
    try {
      const { error } = await this.auth.signInWithPassword({ email: email.trim(), password });
      if (error) this.error.set('No se pudo iniciar sesión. Revisa tu correo y contraseña.');
    } catch {
      this.error.set('No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.');
    } finally {
      this.formulario.controls.password.reset('');
      this.ocupado.set(false);
    }
  }

  async cerrarSesion(): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      const { error } = await this.auth.signOut({ scope: 'local' });
      if (error) this.error.set('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    } catch {
      this.error.set('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      this.ocupado.set(false);
    }
  }
}
