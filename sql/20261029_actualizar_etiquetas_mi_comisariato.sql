-- Precios unitarios de etiquetas de Mi Comisariato, transcritos de la foto.
-- Incluye el SKU de naranja 3000 ml inactivo sin cambiar su estado de actividad.
-- Confirmado por el usuario: naranja-frutilla y naranja de la foto son de 355 ml.
-- Ejecutar con una sesión autorizada en Supabase SQL Editor.
BEGIN;

CREATE TEMP TABLE etiquetas_mc_actualizacion (
  empaque_id bigint PRIMARY KEY,
  presentacion_id bigint UNIQUE NOT NULL,
  codigo_barras text NOT NULL,
  litros numeric NOT NULL,
  costo_anterior numeric NOT NULL,
  estado_anterior text NOT NULL,
  origen_anterior text,
  costo_nuevo numeric NOT NULL
) ON COMMIT DROP;

INSERT INTO etiquetas_mc_actualizacion VALUES
  (162, 54, '7861003022931', 0.355, 0.02006, 'confirmado', NULL, 0.03023),
  (159, 53, '7861003022948', 1, 0.0495, 'confirmado', NULL, 0.08306),
  (105, 35, '7861003022764', 0.355, 0.05109, 'confirmado', NULL, 0.08247),
  (102, 34, '7861003023846', 1, 0.06414, 'confirmado', NULL, 0.08305),
  (66, 22, '7861003032503', 1, 0.06414, 'confirmado', NULL, 0.05607),
  (69, 23, '7861003032497', 0.355, 0.05109, 'confirmado', NULL, 0.0934),
  (141, 47, '7861003021231', 0.355, 0.02006, 'confirmado', NULL, 0.01782),
  (135, 45, '7861003025598', 2, 0.06, 'confirmado', NULL, 0.03460),
  (138, 46, '7861003029992', 3, 0.0235, 'referencia_producto', 'orange-juice', 0.07578),
  (132, 44, '7861003021224', 1, 0.03974, 'confirmado', NULL, 0.05761);

-- Si cambió el catálogo o el precio desde la consulta, abortar sin cambios parciales.
DO $$
DECLARE
  cantidad integer;
BEGIN
  PERFORM e.id
  FROM public.empaque e
  JOIN etiquetas_mc_actualizacion a ON a.empaque_id = e.id
  FOR UPDATE OF e;

  SELECT count(*) INTO cantidad
  FROM etiquetas_mc_actualizacion a
  JOIN public.empaque e ON e.id = a.empaque_id
  JOIN public.presentacion s ON s.id = e.presentacion_id
  JOIN public.producto p ON p.id = s.producto_id
  WHERE e.presentacion_id = a.presentacion_id
    AND s.codigo_barras = a.codigo_barras AND s.litros = a.litros
    AND p.marca = 'Mi Comisariato' AND e.tipo = 'Etiqueta'
    AND (
      (e.costo = a.costo_anterior AND e.estado = a.estado_anterior
       AND e.producto_origen_id IS NOT DISTINCT FROM a.origen_anterior)
      OR (e.costo = a.costo_nuevo AND e.estado = 'confirmado'
          AND e.producto_origen_id IS NULL)
    );
  IF cantidad <> (SELECT count(*) FROM etiquetas_mc_actualizacion) THEN
    RAISE EXCEPTION 'El catálogo o los costos cambiaron. Revisar las etiquetas antes de actualizar.';
  END IF;

  UPDATE public.empaque e
  SET costo = a.costo_nuevo, estado = 'confirmado', producto_origen_id = NULL
  FROM etiquetas_mc_actualizacion a
  WHERE e.id = a.empaque_id
    AND (e.costo IS DISTINCT FROM a.costo_nuevo
         OR e.estado IS DISTINCT FROM 'confirmado'
         OR e.producto_origen_id IS NOT NULL);

  IF EXISTS (
    SELECT 1 FROM etiquetas_mc_actualizacion a
    JOIN public.empaque e ON e.id = a.empaque_id
    WHERE e.costo IS DISTINCT FROM a.costo_nuevo
       OR e.estado IS DISTINCT FROM 'confirmado'
       OR e.producto_origen_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'No se guardaron todos los costos con su precisión original.';
  END IF;
END $$;

SELECT s.nombre_sku, a.costo_anterior, e.costo AS costo_actual, e.estado
FROM etiquetas_mc_actualizacion a
JOIN public.empaque e ON e.id = a.empaque_id
JOIN public.presentacion s ON s.id = e.presentacion_id
ORDER BY s.nombre_sku;

COMMIT;
