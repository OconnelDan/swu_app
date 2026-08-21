# Activar el backup diario de la colección

Esta función guarda cada cambio inmediatamente en Supabase y, después del
periodo de inactividad elegido por el usuario, envía una copia completa por
correo. Hay un límite estricto de **un correo por usuario y día**, calculado en
su zona horaria. Si no existen cambios netos desde la última copia, no se
envía nada.

El usuario puede activar o desactivar la función y elegir 15, 30 o 60 minutos
desde **Mi cuenta → Copia diaria de la colección**.

## Qué recibe el usuario

- `coleccion-swu-AAAA-MM-DD.json`: colección completa. Es un array compatible
  con la importación JSON que ya existe en la aplicación.
- `cambios-swu-AAAA-MM-DD.csv`: diferencias respecto a la última copia enviada.

Los cambios que se hagan después del correo de hoy permanecen pendientes y se
enviarán al día siguiente. Cerrar la PWA o apagar el móvil no afecta al proceso,
porque el envío se realiza en Supabase.

## Requisitos externos

Para enviar correos se utiliza Resend mediante HTTPS:

1. Crea una cuenta en <https://resend.com/>.
2. Añade y verifica un dominio propio en Resend.
3. Crea una API key.
4. Decide la dirección remitente, por ejemplo:
   `SWU Deck Vault <backup@tu-dominio.es>`.

Durante una prueba, Resend permite usar su remitente de demostración, pero para
enviar a todos los usuarios hace falta verificar un dominio.

## Paso 1 — Ejecutar la migración

En **Supabase → SQL Editor → New query**:

1. Abre `supabase/migrations/20260817_backup_diario_coleccion.sql`.
2. Copia todo su contenido.
3. Pégalo en el editor.
4. Pulsa **Run**.
5. La consulta final debe devolver las tres funciones creadas.

La migración deja el correo desactivado para todos los usuarios. Cada persona
debe activarlo expresamente desde **Mi cuenta**. Al activarlo, la colección
existente se toma como línea base y solo se enviará después de un cambio nuevo.

## Paso 2 — Instalar y enlazar Supabase CLI

Desde una terminal abierta en la raíz del proyecto:

```bash
npm install --global supabase
supabase login
supabase link --project-ref ozwiwtgrhrlcrzhqxswc
```

`supabase login` abre el navegador para autorizar tu cuenta. No guardes el
access token dentro del repositorio.

## Paso 3 — Crear los secretos de la Edge Function

Genera primero un secreto aleatorio. En PowerShell puedes utilizar:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Guarda el resultado: será `BACKUP_CRON_SECRET` y se utilizará también en el
Paso 5.

Después ejecuta, sustituyendo los valores entre comillas:

```bash
supabase secrets set RESEND_API_KEY="re_TU_API_KEY"
supabase secrets set BACKUP_EMAIL_FROM="SWU Deck Vault <backup@tu-dominio.es>"
supabase secrets set BACKUP_CRON_SECRET="TU_SECRETO_ALEATORIO"
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles de forma
automática dentro de una Edge Function alojada por Supabase. La service role
nunca se añade al frontend ni a GitHub Pages.

## Paso 4 — Desplegar la función

```bash
supabase functions deploy send-collection-backups --no-verify-jwt
```

El endpoint queda protegido por el encabezado `x-backup-cron-secret`; aunque
se despliegue con `--no-verify-jwt`, una llamada sin ese secreto recibe 401.

## Paso 5 — Programar la comprobación

1. Abre `supabase/setup/programar_backup_diario.sql`.
2. Sustituye
   `REEMPLAZAR_POR_EL_MISMO_BACKUP_CRON_SECRET_DE_LA_EDGE_FUNCTION` por el
   secreto generado en el Paso 3.
3. Ejecuta el archivo completo en **Supabase → SQL Editor**.
4. La última consulta debe mostrar el job
   `swu-send-daily-collection-backups` como activo.

El cron se ejecuta cada cinco minutos, pero eso **no** significa que envíe un
correo cada cinco minutos. La función únicamente reclama usuarios que cumplan
todas estas condiciones:

1. Tienen el correo activado.
2. Su colección cambió desde la última copia.
3. Han transcurrido 15, 30 o 60 minutos desde el último cambio.
4. Todavía no se les ha enviado un correo durante su día local.

## Paso 6 — Publicar el frontend

Sube los archivos del ZIP conservando sus carpetas, crea el Pull Request y
fusiónalo con `main`. GitHub Pages se desplegará con el workflow existente. No
hay que añadir ninguna clave nueva al frontend.

## Prueba completa

1. Entra en la aplicación con tu cuenta.
2. Abre **Mi cuenta**.
3. Activa **Enviar la copia automática por correo**.
4. Deja seleccionados **15 minutos** y guarda.
5. Escanea y guarda una carta.
6. Espera al menos 15 minutos sin modificar la colección. El cron puede tardar
   hasta cinco minutos adicionales en comprobarla.
7. Comprueba el correo y la carpeta de spam.
8. Importa el JSON adjunto en la previsualización de Colección para verificar
   que el archivo es restaurable; no confirmes la importación si solo estás
   haciendo la prueba.

Si después del primer correo modificas otra carta ese mismo día, no habrá un
segundo envío. Esa modificación permanecerá pendiente para el día siguiente.

## Diagnóstico

- **Mi cuenta muestra “Falta la función” o un error de esquema**: vuelve a
  ejecutar la migración del Paso 1.
- **No aparece el bloque de copias en Mi cuenta**: confirma que GitHub Pages
  terminó de desplegar el nuevo `main` y recarga la PWA.
- **El job está activo pero no llega el correo**: revisa **Supabase → Edge
  Functions → send-collection-backups → Logs** y el historial de Resend.
- **Aparece “dominio no verificado”**: verifica el dominio remitente en Resend
  y vuelve a configurar `BACKUP_EMAIL_FROM`.
- **Aparece 401 en el cron**: el secreto de Vault no coincide exactamente con
  `BACKUP_CRON_SECRET` de la Edge Function.
- **Aparece un error en Mi cuenta**: queda guardado en
  `collection_backup_settings.last_error`; la función reintenta cada 30
  minutos sin superar el límite diario.

## Seguridad y retención

- El destinatario es siempre el email verificado de Supabase Auth del propio
  usuario. No se admite escribir una dirección arbitraria.
- La API key de Resend y el secreto del cron solo existen en Supabase Secrets.
- Los envíos usan una clave de idempotencia para reducir el riesgo de correos
  duplicados durante un reintento.
- Se conservan las últimas 30 instantáneas enviadas por usuario y hasta 90 días
  de historial detallado, con un máximo adicional de 20.000 movimientos.
- Las políticas RLS solo permiten a cada usuario consultar sus propios datos.
