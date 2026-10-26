# Cartón por botella

Se agrega un cartón por cada botella a todas las presentaciones activas de aguas de coco,
jugos de coco, limonada con coco y lácteos. Es adicional a Botella, Tap y Etiqueta.
La equivalencia confirmada es 350 ml de cartón para botellas de 350 y 355 ml de coco.
Intenso de 220 ml utiliza el cartón de 240 ml Intenso; Latte de 320 ml, el de 350 ml Latte.

Los archivos fuente son enero.csv a agosto.csv de 2026, proporcionados por el usuario
en Desktop/cartones. Se revisaron las columnas semanales; las columnas iniciales dic-25/dic-26
no se interpretan como precios actuales. Un blanco o `$-` no representa un precio cero.

| Cartón | Referencia USD por botella | Evidencia semanal |
| --- | ---: | --- |
| Coco 350/355 ml | 0.20 | CARTON 350 ML COCO PRUNUS: 8 observaciones, enero a julio |
| Latte 320/350/355 ml | 0.24 | CARTON 350 ML FRAPPE LATTE: 6 observaciones, febrero a julio |
| Intenso 220/240 ml | 0.20 | CARTON 240 ML FRAPPE LATTE INTENSO: abril, 8 a 14 |
| 370 ml | 0.19 | CARTON 370 ML: 6 observaciones, enero a agosto |
| 1000 ml | 0.22 | CARTON 1000ML: marzo, 1 a 7, y julio, 6 a 12 |
| 240 ml genérico, incluido 239.5 ml | Pendiente | No hay una tendencia válida después de excluir 0.17 y 6.25 según la indicación del usuario |
| 2000 ml y tamaños sin equivalencia | Pendiente | No tienen observaciones semanales válidas |

Se descarta el 0.02 aislado del cartón de 1000 ml en julio frente al 0.22 repetido.
El valor de Intenso tiene una sola observación y no se presenta como una tendencia.
La referencia de coco Prunus se aplica a los demás cocos de 350/355 ml como estimación.
Todos los precios importados quedan en `referencia_producto`, no `confirmado`.
Los pendientes se registran con costo técnico 0 y estado `sin_dato`; la aplicación
los señala como incompletos. No se inventan precios para llenar los vacíos.

## Aplicación

1. Publicar primero la aplicación con soporte de `Cartón`.
2. Copiar y ejecutar todo `agregar-carton.sql` en Supabase > SQL Editor. La actualización
   ocurre dentro de una única sentencia DO, sin depender de tablas temporales ni de otra sesión.
3. Revisar los resultados y completar los cartones sin dato con precios verificados.
4. Pulsar **Actualizar ahora** en la sección Empaques de la web.

El SQL conserva los precios de cartón ya registrados, salvo que estén en `sin_dato`
y exista una referencia válida. No modifica los otros tipos de empaque ni aplica
precios actuales a registros históricos. No requiere una tabla nueva.

La migración amplía restricciones CHECK de `empaque.tipo` cuando esa columna es
text/varchar. Si utiliza un enum, un dominio o una restricción que combina columnas,
se detiene y revierte la transacción. En ese caso ejecutar `inspeccionar-empaque-carton.sql`
y adaptar la migración con el esquema real. No se modifican permisos ni políticas RLS.
