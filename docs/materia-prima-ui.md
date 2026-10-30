# Interfaz de costos de materia prima

Implementación local en Angular con señales y propiedades calculadas. Las rutas existentes se conservan: `/materia-prima` abre productos y `/insumos` abre ingredientes y envases. Las pestañas interiores permiten alternar entre ambas vistas sin perder el período de consulta.

## Código y estilos

- `src/app/pages/materia-prima/materia-prima.html`: navegación, catálogo, tabla y análisis. Se retiró el bloque superior de tarjetas KPI y su nota explicativa.
- `src/app/pages/materia-prima/materia-prima.ts`: búsqueda, filtros combinables, ordenación, variaciones, configuración de gráfica y exportación CSV.
- `src/app/pages/materia-prima/materia-prima.css`: cuadrículas responsive, estados, superficies, transiciones y accesibilidad de foco.
- `src/index.html`: carga de Inter; Roboto sigue disponible para los componentes existentes.
- `src/app/pages/estandar/`: ficha del producto, selector de presentaciones, desglose de costos responsive y metodología desplegable por ingrediente.
- `src/app/shared/historico-costos/`: histórico compartido con controles agrupados, explicación desplegable, tabla por fecha y gráfica azul con relleno suave.
- `src/styles/jucy-surfaces.css`: capa visual compartida, limitada a `.jucy-workspace` y `.jucy-history`; degradados, badges translúcidos, sombras de color y microinteracciones.

La paleta usa verde `#21745b`, bordes `#e5eae7`, superficies blancas y fondos suaves. Los aumentos de precio se muestran en rojo; las reducciones, en verde; las alertas, en ámbar. El diseño respeta la preferencia de movimiento reducido ya definida en los estilos globales.

Las gráficas mantienen tonos azules: barras con degradado, línea histórica azul y composición con diferentes tonos de azul e índigo. Los puntos grises identifican precios base. La variación entre fechas se consulta en los tooltips, sin cambiar la línea a rojo o verde.

Las entradas combinan opacidad y desplazamiento, con un escalonado corto en las tarjetas. Los efectos de elevación se aplican a dispositivos con cursor preciso; las alertas y la sincronización histórica tienen un pulso discreto. La preferencia de movimiento reducido desactiva animaciones CSS, desplazamientos hover y animaciones de Chart.js. No se añaden métricas ni un nuevo bloque KPI: se realzan las tarjetas existentes en la ficha del producto y el histórico. El desglose de costos conserva su suma vertical.

## Librerías integradas

Se reutilizan las dependencias instaladas, sin agregar paquetes:

- **Angular Material**: iconos Material y componentes existentes.
- **Chart.js + ng2-charts**: barras horizontales con degradado, tooltips de precio y adaptación al contenedor. Una lista desplegable ofrece los valores de la gráfica sin depender del canvas.
- **Inter**: tipografía de la vista, con alternativas locales si Google Fonts no carga.

No se necesita Tailwind, otra librería de gráficas ni Lucide para reproducir este resultado. Los estilos son CSS encapsulado del componente Angular.

## Significado de las métricas

- Precio promedio: media de los precios por kg de todos los ingredientes del catálogo.
- Variación individual: `(precio actual - costo base histórico) / costo base histórico × 100`. Una base nula o cero se muestra como «Sin base».
- Variación promedio: media de las variaciones individuales que tienen una base positiva. No equivale a un cambio mensual.
- Alerta: ingrediente activo cuyo aumento supera el 10 % de su costo base histórico.
- Precios por revisar: alertas de ingredientes más registros de empaque sin precio.
- Categoría: categoría de los productos que utilizan el ingrediente; no se inventa una clasificación independiente de insumos.

La gráfica compara los seis precios por kg más altos del catálogo completo, independientemente de los filtros de la tabla. No representa participación del gasto: para calcularla hacen falta cantidades de producción comparables. No se muestran proveedores ni estados de escasez porque el modelo actual no proporciona esos datos.

## Exportación y verificación

El CSV incluye todos los registros filtrados, no solo la página visible. Conserva los ceros confirmados, deja vacíos los precios pendientes, escapa comillas y protege texto que podría interpretarse como fórmula en una hoja de cálculo.

Pruebas específicas:

```sh
npm test -- --watch=false --include=src/app/pages/materia-prima/materia-prima.spec.ts
```

Compilación de GitHub Pages:

```sh
npm run build:pages
```

La compilación no publica los cambios. Para revisar el diseño localmente, ejecutar `npm start` y abrir `/materia-prima` o `/insumos` en la dirección que indique Angular.
