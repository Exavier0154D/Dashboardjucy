# DashboardJucyCostos

## Acceso de usuarios

El inicio de sesión utiliza Supabase Auth con correo y contraseña. Un administrador del proyecto debe crear o invitar las cuentas desde Supabase y desactivar el registro público si solo deben acceder usuarios autorizados. Los permisos de edición del catálogo se administran por separado mediante la autorización existente de editor.

La pantalla de inicio de sesión solo controla la interfaz. Para proteger los datos directamente en Supabase, revisa las políticas RLS y los permisos de tablas, vistas y funciones: deben impedir el acceso anónimo y conceder únicamente los permisos necesarios a las cuentas autenticadas. Verifica también que las cuentas autorizadas conserven acceso a todas las consultas que usa el dashboard.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.25.

## Costos estándar desde Administración

La pestaña **Costos estándar** permite seleccionar un SKU y guardar materia prima,
empaque, cartón, mano de obra y gastos indirectos en USD por unidad. Solo las cuentas
con el permiso existente `catalogo_es_editor()` pueden guardar. Los totales por unidad
y litro se calculan automáticamente. El selector **Base fija / Costos por mes** separa
la referencia estándar de las ediciones mensuales. Elige **Costos por mes**, selecciona
el mes y la presentación, revisa los cinco rubros y pulsa **Guardar mes**.

Los meses con edición manual usan sus cinco valores guardados en la comparativa.
Los demás conservan sus cálculos originales. La edición mensual no cambia la base
fija, la formulación ni los registros de precios de materias primas.

Antes de desplegar esta funcionalidad, aplicar la migración
`supabase/migrations/202611180001_costos_estandar.sql` al proyecto Supabase. Crea
la tabla y las políticas RLS de lectura para usuarios autenticados y escritura
exclusiva para editores. No modifica las bases calculadas de los SKU sin estándar manual.
Si la migración está pendiente, Administración muestra los costos del catálogo en modo
consulta y avisa que el guardado no está habilitado. La comparativa continúa usando
su base calculada. Después de aplicar la migración, pulsa **Reintentar** para habilitar
el guardado sin perder la selección.

Para habilitar las ediciones mensuales, aplicar también
`supabase/migrations/202611180002_costos_mensuales.sql`. Crea `costo_mensual` con
clave única por presentación y mes, validación de costos y escritura restringida
a editores. Esta migración conserva los estándares existentes. Si está pendiente,
solo el guardado mensual permanece bloqueado; la base fija y la comparativa siguen
disponibles. Tras ejecutarla, pulsa **Reintentar** en el modo mensual.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
