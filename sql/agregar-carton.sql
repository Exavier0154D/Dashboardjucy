-- Supabase > SQL Editor. Ejecutar DESPUÉS de publicar el soporte de Cartón.
-- Un cartón por botella. No modifica Botella, Tap ni Etiqueta.
-- Fuentes y equivalencias: ver carton-referencias.md.
-- Puede repetirse: no duplica empaques ni reemplaza costos ya confirmados.
begin;

-- Se conserva el nombre y la condición de las restricciones existentes.
-- Solo se amplían CHECK que afectan exclusivamente a la columna tipo.
-- Ante una estructura distinta, se aborta toda la transacción.
do $carton$
declare
  tipo_columna smallint;
  tipo_dato oid;
  restriccion record;
begin
  select attnum, atttypid into tipo_columna, tipo_dato
  from pg_attribute
  where attrelid = 'public.empaque'::regclass and attname = 'tipo' and not attisdropped;

  if tipo_dato is null or tipo_dato not in ('text'::regtype::oid, 'varchar'::regtype::oid) then
    raise exception 'La columna empaque.tipo no es text/varchar. Ejecuta inspeccionar-empaque-carton.sql antes de adaptar esta migración.';
  end if;

  lock table public.empaque in share row exclusive mode;
  for restriccion in
    select c.conname, c.conkey, pg_get_expr(c.conbin, c.conrelid) as expresion
    from pg_constraint c
    where c.conrelid = 'public.empaque'::regclass
      and c.contype = 'c' and tipo_columna = any(c.conkey)
  loop
    if cardinality(restriccion.conkey) <> 1 then
      raise exception 'La restricción % combina tipo con otras columnas. Revisa su definición antes de ampliarla.', restriccion.conname;
    end if;
    if position('Cartón' in restriccion.expresion) = 0 then
      execute format('alter table public.empaque drop constraint %I', restriccion.conname);
      execute format('alter table public.empaque add constraint %I check ((%s) or tipo = %L)',
        restriccion.conname, restriccion.expresion, 'Cartón');
    end if;
  end loop;
end;
$carton$;

create temporary table carton_objetivos on commit drop as
with productos as (
  select p.*, translate(lower(trim(p.categoria)), 'áéíóú', 'aeiou') as categoria_normalizada,
    translate(lower(trim(p.variante)), 'áéíóú', 'aeiou') as variante_normalizada
  from public.producto p
  where p.activo
), objetivos as (
  select s.id as presentacion_id, p.id as producto_id, p.nombre, s.nombre_sku, s.litros,
    p.categoria_normalizada, p.variante_normalizada
  from public.presentacion s
  join productos p on p.id = s.producto_id
  where s.activo and (
    p.categoria_normalizada in ('agua de coco', 'lacteos') or
    (p.categoria_normalizada in ('jugos y zumo', 'limonada') and p.variante_normalizada ~ '\mcoco\M')
  )
)
select o.*,
  case
    when categoria_normalizada = 'lacteos' and variante_normalizada like '%intenso%'
      and litros in (0.220, 0.240) then 0.20::numeric
    when categoria_normalizada = 'lacteos' and variante_normalizada like '%latte%'
      and litros in (0.320, 0.350, 0.355) then 0.24::numeric
    when categoria_normalizada <> 'lacteos' and litros in (0.350, 0.355) then 0.20::numeric
    when litros = 0.370 then 0.19::numeric
    when litros = 1.000 then 0.22::numeric
    else null::numeric
  end as costo_referencia
from objetivos o;

-- Completa únicamente cartones todavía sin dato si existe una referencia válida.
update public.empaque e
set costo = o.costo_referencia,
    estado = 'referencia_producto',
    producto_origen_id = o.producto_id
from carton_objetivos o
where e.presentacion_id = o.presentacion_id and e.tipo = 'Cartón'
  and e.estado = 'sin_dato' and o.costo_referencia is not null;

insert into public.empaque (presentacion_id, tipo, costo, estado, producto_origen_id)
select o.presentacion_id, 'Cartón', coalesce(o.costo_referencia, 0),
  case when o.costo_referencia is null then 'sin_dato' else 'referencia_producto' end,
  case when o.costo_referencia is null then null else o.producto_id end
from carton_objetivos o
where not exists (
  select 1 from public.empaque e
  where e.presentacion_id = o.presentacion_id and e.tipo = 'Cartón'
);

-- Resultado para revisar: sin_dato NO significa que el cartón sea gratis.
select o.presentacion_id, o.nombre_sku, e.tipo, e.costo, e.estado
from carton_objetivos o
join public.empaque e on e.presentacion_id = o.presentacion_id and e.tipo = 'Cartón'
order by o.nombre_sku;

commit;
