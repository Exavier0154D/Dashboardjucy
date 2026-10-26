-- Ejecutar en Supabase > SQL Editor. Solo consulta la estructura; no modifica datos.
-- Estos resultados permiten preparar la migración de Cartón sin asumir nombres de restricciones.
select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'empaque'
order by ordinal_position;

select c.conname as restriccion, pg_get_constraintdef(c.oid) as definicion
from pg_constraint c
where c.conrelid = 'public.empaque'::regclass
order by c.conname;

select trigger_name, action_statement
from information_schema.triggers
where event_object_schema = 'public' and event_object_table = 'empaque';
