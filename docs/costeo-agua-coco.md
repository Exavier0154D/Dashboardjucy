# Extracción dinámica del coco

## Cuándo se aplica

`REGLAS_EXTRACCION_COCO`, en `src/app/core/costeo-coco.ts`, registra el producto Agua de Coco Original Jucy (`catalogo-2026-b00a0c1d9779e618e5649392`), materia prima 57 y la confirmación expresa de precio de coco entero antes de extracción. La densidad configurable inicial es `densidadKgPorLitro: 1`.

La fórmula se aplica a sus presentaciones con un solo ingrediente, Coco al 100%, y una sola línea de cantidades coincidente. No basta con que el nombre contenga «coco». Otros productos sin una base de precio confirmada mantienen el cálculo anterior y se identifican para revisión en las observaciones.

Para mezclas no se usa todo el volumen del envase ni se interpretan porcentajes como proporciones volumétricas. Solo puede activarse la extracción si una regla aporta explícitamente `aguaAprovechablePorPresentacion` con litros netos verificados para ese SKU. Actualmente no hay mezclas configuradas.

## Fórmula ejecutada

```
agua requerida (kg) = litros de agua aprovechable × densidad (kg/L)
coco entero requerido (kg) = agua requerida / 0.22
costo = coco entero requerido × precio vigente del coco entero por kg
```

`valorarIngrediente()` es la función compartida por el mapper del catálogo y por `calcularSerie()`. Llama a `cocoNecesario()` para obtener la cantidad derivada; luego valora esa cantidad con el precio correspondiente. Los casos no habilitados conservan `kg registrados × precio/kg`.

`presentacion_item.kg` nunca se divide entre 0.22 ni se sobrescribe. El modelo conserva `kg` como referencia y expone `kgCosteo`, `diferenciaKg` y `rendimientoAplicado`. El detalle por fecha incluye además `kgRegistrados`. Las fórmulas y porcentajes originales no se modifican.

## Ejemplos verificables

SKU 3, 0.2395 L y $0.35/kg:

```
Agua: 0.2395 × 1 = 0.2395 kg
Coco: 0.2395 / 0.22 = 1.088636363636… kg
Costo: 1.088636363636… × 0.35 = $0.381022727272… → $0.38
Kg registrados de referencia: 1.088288 (no utilizados para derivar el costo)
```

350 ml, 1 kg/L y $0.20/kg:

```
Coco: 0.350 / 0.22 = 1.590909090909… kg
Costo: 1.590909090909… × 0.20 = $0.318181818181… → $0.32
```

Las pruebas cambian los kg registrados a 0 y 99 y obtienen el mismo costo calculado desde 350 ml. Esto comprueba la sustitución real de la lógica y evita que un redondeo visual oculte el uso de los kg antiguos.

## Precios, períodos y tabla

- Catálogo y estándar dinámico de Comparativa: `materia_prima.costo_kg`, obtenido por `DataService` desde Supabase.
- Meses: `calcularMateriaPrimaMensual()` usa el último precio histórico vigente al cierre del mes. Antes del primer precio histórico se conserva la base histórica existente.
- Estándar con selección semanal: precio vigente en la fecha elegida.
- Gráfico histórico de producto: pasa el contexto de la presentación a `calcularSerie()` y ejecuta la misma regla. El histórico por kg de materia prima no aplica extracción.

Con los precios del diagnóstico para el SKU 3, febrero al cierre ($0.25/kg) produce $0.272159090909… y marzo al cierre ($0.22/kg) produce $0.2395. Los precios no están fijados en producción: se toman de los registros cargados para la fecha.

`Comparativa.calcularPeriodo()` conserva la prioridad de costos manuales estándar y mensuales. El período muestra «Costo manual guardado» y una observación explícita; no se sustituye silenciosamente por el cálculo dinámico.

El total sigue sumando materia prima + empaque + cartón + mano de obra + GIF. El costo por litro divide el total interno por los litros de presentación. No hay redondeos intermedios.

## Interfaz y restricciones

Se mantiene la tabla principal y una sola leyenda de rendimiento cuando procede. No hay tarjetas, simuladores, controles de densidad ni nuevos servicios de estado temporal. La densidad se configura en las reglas del código.

No se escriben registros de Supabase, no se ejecutan migraciones y no se cambian precios históricos ni formulaciones. Los demás rubros conservan sus reglas.

## Validación

`npx ng test --watch=false` cubre 350 ml, SKU 3, densidad configurable, independencia de los kg registrados, referencias y diferencias, precios de febrero/marzo, coincidencia con el histórico, costos por unidad y litro, manuales, productos sin coco, agua procesada y mezclas con/sin cantidad neta comprobada.

`npx ng build` comprueba la compilación de producción.
