-- EJECUTA ESTE ARCHIVO SOLO DESPUÉS DE:
-- 1. Aplicar la migración 20260817_backup_diario_coleccion.sql.
-- 2. Desplegar la función send-collection-backups.
-- 3. Configurar en la función el mismo BACKUP_CRON_SECRET indicado abajo.
--
-- Sustituye la cadena REEMPLAZAR_... antes de ejecutarlo. El script se puede
-- volver a ejecutar: actualiza los secretos y reemplaza solo este mismo job.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_secret_id uuid;
  v_cron_secret constant text :=
    'REEMPLAZAR_POR_EL_MISMO_BACKUP_CRON_SECRET_DE_LA_EDGE_FUNCTION';
begin
  if v_cron_secret like 'REEMPLAZAR_%' then
    raise exception 'Debes sustituir BACKUP_CRON_SECRET antes de ejecutar este archivo';
  end if;

  select secret.id into v_secret_id
  from vault.secrets as secret
  where secret.name = 'backup_project_url';

  if v_secret_id is null then
    perform vault.create_secret(
      'https://ozwiwtgrhrlcrzhqxswc.supabase.co',
      'backup_project_url',
      'URL del proyecto para el backup diario de colección'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      'https://ozwiwtgrhrlcrzhqxswc.supabase.co',
      'backup_project_url',
      'URL del proyecto para el backup diario de colección'
    );
  end if;

  v_secret_id := null;
  select secret.id into v_secret_id
  from vault.secrets as secret
  where secret.name = 'backup_cron_secret';

  if v_secret_id is null then
    perform vault.create_secret(
      v_cron_secret,
      'backup_cron_secret',
      'Secreto que autoriza exclusivamente el cron del backup diario'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      v_cron_secret,
      'backup_cron_secret',
      'Secreto que autoriza exclusivamente el cron del backup diario'
    );
  end if;
end;
$$;

-- Se comprueba cada cinco minutos. La propia base de datos aplica la espera
-- elegida por el usuario (15, 30 o 60 minutos) y el máximo de un email diario.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname = 'swu-send-daily-collection-backups'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'swu-send-daily-collection-backups',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'backup_project_url'
      ) || '/functions/v1/send-collection-backups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-backup-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'backup_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);

select jobid, jobname, schedule, active
from cron.job
where jobname = 'swu-send-daily-collection-backups';
