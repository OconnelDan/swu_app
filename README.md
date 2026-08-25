# SWU Deck Collection Checker

Aplicación web (PWA) que comprueba si tu colección de **Star Wars: Unlimited**
cubre las cartas necesarias para un mazo, a partir de tu Excel/CSV/JSON de
colección y el JSON del mazo (por ejemplo, exportado desde una deck-builder).

Tiene dos modos de persistencia separados. Sin iniciar sesión, la colección y
los mazos se guardan localmente en IndexedDB. Con una cuenta, Supabase es la
única fuente de verdad para colección y mazos, que se recuperan al entrar desde
cualquier navegador; los datos locales de invitado no se mezclan con ellos.

## Índice

- [Requisitos](#requisitos)
- [Puesta en marcha](#puesta-en-marcha)
- [Scripts disponibles](#scripts-disponibles)
- [Cómo usar la app](#cómo-usar-la-app)
- [Formatos de datos admitidos](#formatos-de-datos-admitidos)
- [Arquitectura](#arquitectura)
- [Integración con catálogos externos](#integración-con-catálogos-externos)
- [Privacidad y seguridad](#privacidad-y-seguridad)
- [Despliegue](#despliegue)
- [Limitaciones conocidas y mejoras futuras](#limitaciones-conocidas-y-mejoras-futuras)

## Requisitos

- Node.js 20 o superior
- npm 10 o superior

> En Windows, si `npm` falla con un error de política de ejecución de
> PowerShell ("no se puede cargar... porque la ejecución de scripts está
> deshabilitada"), habilita los scripts locales para tu usuario (no requiere
> administrador):
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Scripts disponibles

| Script                 | Descripción                                        |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Servidor de desarrollo con recarga en caliente     |
| `npm run build`        | Compila TypeScript y genera el build de producción |
| `npm run preview`      | Sirve el build de producción localmente            |
| `npm test`             | Ejecuta la suite de tests con Vitest (una vez)     |
| `npm run test:watch`   | Tests en modo observador                           |
| `npm run lint`         | ESLint                                             |
| `npm run typecheck`    | Comprueba tipos sin generar archivos               |
| `npm run format`       | Formatea el proyecto con Prettier                  |
| `npm run catalog:sync` | Regenera el catálogo desde la API oficial SWU      |

## Cómo usar la app

1. **Colección**: sube tu Excel/CSV, o pega un JSON. Con una cuenta iniciada
   también puedes abrir **Añadir cartas con la cámara**, encuadrar una carta para
   que el vídeo la reconozca automáticamente y sumar copias sin sustituir la
   colección completa.
2. **Comprobar**: pega o carga el JSON de un mazo. El resultado indica, para
   cada carta que ya tienes, si hay copias libres o si están comprometidas en
   otro mazo montado (y en cuál).
3. **Resultado**: verás qué cartas te faltan, con opción de ver todas o solo
   las faltantes, copiar la lista, descargarla en TXT o CSV y guardar el mazo
   como favorito. Si ya está guardado, también puedes **Montar mazo** sin salir
   del resultado. Al pulsar una miniatura se abre la misma ficha informativa
   persistente del resto de la app, sin controles para modificar la colección.
4. **Mazos → Crear mazo**: construye listas Premier, Eternal, Twin Suns o
   Trilogy eligiendo sus líderes, bases, mazos principales y banquillos cuando
   correspondan. Puedes filtrar por aspectos, tipo, arena, colección, rareza,
   coste y copias poseídas o libres. La búsqueda admite varias condiciones
   separadas por `/` (por ejemplo, `centinela / rebelde / 3`); un número aislado
   representa el coste exacto. Los resultados se paginan sin ocultar las cartas
   posteriores a la primera página. Al pulsar la miniatura de una carta se abre
   una ficha persistente con su imagen grande, texto traducido y datos de juego;
   se cierra manualmente y no modifica la composición del mazo.
5. **Mazos → Favoritos**: puedes guardar el trabajo en cualquier momento aunque
   todavía falten líderes, base o cartas. Los borradores muestran el aviso
   **Mazo inacabado** y se recuperan con **Continuar editando**. Guardar cambios
   actualiza el mismo favorito sin crear duplicados. Solo un mazo legal y con la
   estructura completa puede montarse y reservar cartas de la colección. Los
   mazos terminados también pueden volver a abrirse con **Modificar mazo** para
   cambiar líder, base, mazo principal o banquillo.
6. **Mazos → Montados**: consulta los mazos que sí reservan cartas, su reparto
   físico real y las copias pendientes. Al abrir un mazo incompleto, cada carta
   disponible en otros mazos tiene su propio botón **Mover cartas a este mazo**
   y una confirmación previa con el origen exacto de las copias. **Modificar
   mazo** permite cambiar su composición sin desmontarlo; al guardar conserva
   su prioridad y recalcula automáticamente las copias reservadas. **Desmontar
   mazo** libera las cartas y devuelve la lista a Favoritos sin borrar su JSON.
7. **Buscar**: recorre todo el catálogo y utiliza la misma búsqueda avanzada y
   los mismos filtros manuales del creador: aspectos, tipo y arena, colecciones,
   rarezas, coste máximo y cartas poseídas o libres. Aquí no existen aspectos
   automáticos de líder/base y todos los filtros comienzan sin restringir. Se
   pueden combinar texto de reglas, rasgos o palabras clave con `/`, y un número
   aislado representa el coste exacto. Comprueba si cada carta está libre o en
   qué mazos montados está usada y pulsa sobre ella para restar una copia. Si la
   copia está asignada, se confirma qué mazo puede quedar incompleto. Todas las
   coincidencias son accesibles mediante paginación y la ficha ampliada conserva
   el control para restar una copia de la colección.
8. **Ajustes**: tema y mostrar/ocultar imágenes. En modo invitado también
   permite exportar/importar una copia local y borrar los datos del dispositivo.
9. **Cuenta y amigos** _(opcional, requiere configurar Supabase)_: crea una
   cuenta verificando primero tu email y asignando después una contraseña. Los
   accesos posteriores utilizan email y contraseña, con recuperación por
   correo si la olvidas. Desde ese momento, las importaciones de colección y
   todos los cambios de mazos se guardan directamente en la cuenta. También
   puedes generar o canjear códigos de amistad y consultar qué amigos tienen
   las cartas que te faltan, incluidas sus copias libres.
10. **Backup diario por correo** _(opcional)_: desde **Mi cuenta** cada usuario
    puede activar una copia JSON de su colección. Solo se envía si hubo cambios,
    después de 15, 30 o 60 minutos de inactividad y con un máximo estricto de un
    correo por día. El proceso continúa aunque se cierre la PWA.

### Favoritos y reparto entre mazos montados

Guardar una lista en **Favoritos** solo conserva la idea: no descuenta copias
libres. Puede ser un borrador incompleto y editarse durante varios días; su
estado se calcula a partir de la composición, sin necesitar una migración de
base de datos. Como cada carta física solo puede estar en un mazo a la vez, la app
reparte la colección exclusivamente entre los **Mazos montados**. Los que ya
estaban montados mantienen prioridad y un nuevo mazo utiliza primero las
copias que continúen libres, sin quitárselas automáticamente a otro. La pantalla
de montados distingue las copias reservadas, las que están en otro mazo y las
que realmente no existen en la colección. Desde el detalle se puede dar
prioridad a una carta concreta: los demás mazos conservan su composición, pero
quedan marcados como incompletos si ceden alguna de sus copias físicas.

En `sample-data/` encontrarás un Excel de colección de ejemplo
(`coleccion_ejemplo.xlsx`) y dos mazos de ejemplo (`mazo_ejemplo.json` y
`mazo_ejemplo_agrupado.json`) ya preparados para probar la app: el resultado
mostrará intencionadamente algunas cartas faltantes.

### Cuenta, datos y amigos (opcional)

Esta función es **opcional** y requiere un proyecto propio y gratuito de
[Supabase](https://supabase.com) (Postgres + Auth). Sin configurarlo, el resto
de la app funciona igual, 100% local.

1. Crea un proyecto en Supabase y copia su **Project URL** y su clave pública
   ("anon"/"publishable key") en un archivo `.env` en la raíz del proyecto
   (usa `.env.example` como plantilla). **Nunca** uses la `service_role`/`secret
key` en el frontend.
2. En el **SQL Editor** de Supabase, pega y ejecuta todo el contenido de
   [`supabase/schema.sql`](./supabase/schema.sql). Crea las tablas de
   perfiles, códigos de invitación, amistades, colecciones y mazos por usuario,
   todas con Row Level Security.
   Si el proyecto ya estaba instalado antes de la separación entre Favoritos y
   Montados, ejecuta únicamente
   [`supabase/migrations/20260814_favoritos_y_mazos_montados.sql`](./supabase/migrations/20260814_favoritos_y_mazos_montados.sql)
   y, después,
   [`supabase/migrations/20260814_prioridad_por_carta_mazos_montados.sql`](./supabase/migrations/20260814_prioridad_por_carta_mazos_montados.sql)
   antes de publicar esta versión. Si la primera migración ya estaba aplicada,
   ejecuta solamente la segunda. Para activar el escáner de cartas en una
   instalación existente, ejecuta después
   [`supabase/migrations/20260815_anadir_cartas_con_camara.sql`](./supabase/migrations/20260815_anadir_cartas_con_camara.sql).
   Para añadir las copias diarias por correo, ejecuta finalmente
   [`supabase/migrations/20260817_backup_diario_coleccion.sql`](./supabase/migrations/20260817_backup_diario_coleccion.sql)
   y, después,
   [`supabase/migrations/20260821_optimizar_importacion_coleccion.sql`](./supabase/migrations/20260821_optimizar_importacion_coleccion.sql).
   Esta última migración evita timeouts al sustituir colecciones grandes y no
   elimina cartas, mazos, preferencias ni copias ya enviadas.
   Para poder restar cantidades desde **Buscar**, ejecuta después
   [`supabase/migrations/20260821_restar_cartas_coleccion.sql`](./supabase/migrations/20260821_restar_cartas_coleccion.sql).
3. En **Authentication → URL Configuration**, usa como Site URL
   `https://oconneldan.github.io/swu_app/` y añade como Redirect URL
   `https://oconneldan.github.io/swu_app/**` (añade también la URL local que
   uses durante el desarrollo).
4. En la cabecera, pulsa **Iniciar sesión → Crear cuenta**, introduce el email
   y abre el enlace de verificación en el mismo navegador. La app regresará a
   **Cuenta** para crear y repetir la contraseña. A partir de entonces podrás
   entrar desde cualquier navegador con email y contraseña y recuperar
   automáticamente la colección y los mazos guardados.
5. Una cuenta creada anteriormente con enlace mágico conserva su mismo usuario
   y sus datos: basta con abrir **Mi cuenta → Crear o cambiar contraseña**. La
   recuperación desde **He olvidado mi contraseña** también vuelve a esa
   pantalla mediante un enlace de un solo uso.
6. Para GitHub Pages, crea los secretos de Actions `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY`. El despliegue se detiene con un mensaje claro si
   falta alguno, evitando publicar accidentalmente la pantalla de cuentas
   deshabilitada.

La copia diaria necesita además desplegar una Edge Function y configurar el
proveedor de correo y el trabajo programado en Supabase. La guía completa, con
los comandos y las comprobaciones, está en
[`GUIA_BACKUP_DIARIO.md`](./GUIA_BACKUP_DIARIO.md). Las claves del proveedor de
correo nunca se añaden al frontend ni a GitHub Pages.

**Modelo de privacidad**: por defecto, un amigo aceptado solo puede saber
"¿tienes esta carta puntual, cuántas copias y cuántas están libres?" cuando
comprueba un mazo incompleto; nunca puede listar tu colección completa ni tus
mazos. La invitación caduca a los siete días y solo puede utilizarse una vez.

No existe sincronización manual ni una copia local de respaldo para una cuenta:
una importación sustituye únicamente la colección de Supabase; guardar,
actualizar o borrar un favorito modifica únicamente ese mazo. De esta forma un
navegador con una vista antigua no reemplaza por accidente el resto de los
datos. El modo invitado y sus copias de seguridad JSON siguen disponibles sin
crear una cuenta, pero no permiten utilizar Amigos ni añadir cartas con la
cámara.

El escáner analiza fotogramas temporales del vídeo localmente: comprueba luz,
contraste, enfoque y movimiento, y ejecuta OCR cuando la carta está preparada.
Los bordes rojo, ámbar y verde guían el encuadre y la lectura termina sin pulsar
un disparador. Ningún fotograma se guarda ni se sube; solo se envían a Supabase
el código confirmado, el nombre y la cantidad. Antes de guardar, contrasta
`SET_NUMERO` con el catálogo incluido y muestra la carta reconocida para evitar
incrementos provocados por una lectura incorrecta. Elegir una fotografía sigue
disponible como alternativa. La confirmación propone una copia y permite escribir
una cantidad de 1 a 99 para registrar varias copias físicas con un solo escaneo.

## Formatos de datos admitidos

### Colección — Excel / CSV

- **Columna A**: código de set (p. ej. `LAW`)
- **Columna B**: número de carta (p. ej. `38`, se normaliza a `038`)
- **Columna C** (opcional): nombre de la carta
- **Columnas D en adelante**: una columna por variante (normal, foil,
  hyperspace, showcase, prestige...). Se **suman todas** para obtener el
  total de copias de esa carta.
- La identidad de una carta es siempre `SET_NUMERO` (nunca el nombre).
- Si el Excel tiene varias hojas, se detecta automáticamente la más probable
  (o puedes indicarla).
- Filas repetidas con el mismo `SET_NUMERO` se suman con un aviso.
- Celdas vacías o no numéricas en las variantes se ignoran con un aviso, sin
  romper la importación.

### Colección — JSON

Dos formatos aceptados:

```json
[{ "set": "LAW", "number": 38, "name": "Lepi Lookout", "variants": [1, 1, 1] }]
```

```json
[{ "cardId": "LAW_038", "ownedCount": 3 }]
```

### Mazo — JSON

Se admite cualquier combinación de estas claves:

- Nombre: `metadata.name` o `name`
- Autor: `metadata.author` o `author`
- Líder: `leader: {id, count}`, `leader: "ID"`, o `leader_id: "ID"`
- Base: `base: {id, count}`, `base: "ID"`, o `base_id: "ID"`
- Mazo principal: `deck`, `mainDeck`, `mainboard`, `cards` (arrays de
  `{id, count}`), o `deck_grouped` (objeto `{SET: [{id, count}]}`)
- Banquillo: `sideboard`, o `sideboard_grouped`

Si una carta aparece tanto en el mazo principal como en el banquillo, sus
copias necesarias se **suman** para la comparación contra tu colección.

## Arquitectura

```
src/
├─ types/            Modelos de dominio (card, collection, deck)
├─ lib/               Lógica pura y testeable:
│                       normalizeCardId, sumVariantColumns,
│                       normalizeDeckJson, compareDeckWithCollection,
│                       cardAllocation (reparto de cartas entre favoritos),
│                       cardScanner (OCR local), cardImageUrl, collectionFingerprint,
│                       favoritesRepository, friendsRepository, backup,
│                       collectionBackupRepository
├─ schemas/           Validación con Zod (deck JSON, backup JSON)
├─ providers/
│  ├─ cardProvider/    Interfaz CardProvider + implementaciones
│  │                    (LocalCardCacheProvider, SwUnlimitedDbCardProvider)
│  └─ collectionProvider/ Interfaz CollectionProvider + implementaciones
│                          (Excel, Csv, Json, y el stub remoto documentado)
├─ contexts/          Sesión global y selección estricta del origen de datos
├─ db/                Dexie (IndexedDB): colección/favoritos del invitado,
│                       caché, historial de comprobaciones y ajustes
├─ hooks/             useCollection, useFavorites, useSettings, useAuth,
│                       useOnlineStatus (todos reactivos vía Dexie liveQuery
│                       salvo useAuth, que usa la sesión de Supabase)
├─ components/        UI reutilizable (Layout, tabla de resultados, resumen…)
├─ pages/             Las 10 pantallas de la app (incluye escáner, cuenta y amigos)
├─ tests/             Suite de Vitest (normalización, comparación, providers,
│                       favoritos, backup, reparto de cartas entre mazos)
├─ public/data/       Catálogo compacto incluido en la PWA
├─ scripts/           Generador reproducible del catálogo de cartas
```

supabase/schema.sql contiene el esquema base (tablas + Row Level Security +
funciones) para cuentas, persistencia remota y amigos. Las mejoras posteriores
están versionadas en `supabase/migrations/`; el backup diario añade también la
Edge Function `supabase/functions/send-collection-backups`.

**Principios de diseño:**

- La lógica de negocio (`src/lib`) no depende de React ni de IndexedDB: es
  pura y 100% testeable de forma aislada.
- `CardProvider` y `CollectionProvider` son interfaces: se puede añadir un
  nuevo origen de datos (otra web, otro formato de archivo, Supabase...) sin
  tocar el resto de la aplicación.
- El modo invitado funciona **completamente offline** tras la primera visita.
  El modo cuenta necesita conexión para cargar y modificar colección/mazos; si
  Supabase no responde, nunca usa IndexedDB como sustitución silenciosa.

## Integración con catálogos externos

Se investigaron dos dominios distintos, ambos legítimos pero con propósitos
diferentes:

- **`sw-unlimited-db.com`**: sitio donde muchos jugadores guardan su
  colección privada. A fecha de creación de este proyecto **no existe una
  API pública documentada** para acceder a la colección de un usuario. Por
  eso, siguiendo el principio de no hacer scraping ni inventar endpoints,
  `SwUnlimitedDbRemoteCollectionProvider` es un adaptador **preparado pero
  deshabilitado**: implementa la interfaz `CollectionProvider` y lanza un
  error explicativo. Está documentado en el propio código
  (`src/providers/collectionProvider/SwUnlimitedDbRemoteCollectionProvider.ts`)
  con los pasos a seguir si en el futuro se publica una API oficial.
- **API oficial de Star Wars: Unlimited**:
  `https://admin.starwarsunlimited.com/api/card-list` publica el catálogo usado
  por la propia web del juego. Incluye códigos de expansión, números impresos,
  tipos de variante, `variantOf`, `validationId`, nombres y textos localizados,
  coste, aspectos, arena, rasgos, estadísticas y las imágenes del CDN oficial.
  La API solo permite peticiones del origen de la web oficial mediante CORS, por
  lo que GitHub Pages no la consulta directamente. El comando
  `npm run catalog:sync` descarga sus páginas durante el desarrollo y genera
  `public/data/swu-card-catalog.json`. La PWA sirve ese archivo desde su propio
  dominio, lo guarda en la caché offline y enlaza las impresiones Hyperspace,
  Foil, Showcase, Weekly Play y las demás promos con su carta base sin comparar
  nombres manualmente. Las URL se conservan exactamente como las publica el
  CDN oficial —incluida una posible doble barra tras el dominio—. Si una imagen
  concreta falla, la interfaz prueba automáticamente la ruta equivalente de
  `cdn.swu-db.com` antes de ocultar la miniatura.

## Privacidad y seguridad

- En modo invitado, colección y mazos se guardan **solo en tu dispositivo**.
  Con sesión iniciada, colección y mazos se guardan exclusivamente en Supabase;
  borrar la caché local no los elimina y vuelven a cargarse tras iniciar sesión.
- Los nombres y las equivalencias de variantes se leen del catálogo compacto
  incluido en la PWA; no se envían códigos de cartas a una API externa. Las
  imágenes se solicitan mediante etiquetas de imagen al CDN oficial y, solo si
  este falla, a su espejo de respaldo. La ruta contiene únicamente el código
  impreso de la carta, nunca información de tu cuenta, colección o mazos. La
  caché de imágenes se revalida y caduca para no mantener diferencias
  indefinidas entre dispositivos.
- Si activas **Cuenta y amigos**, tu email, tu colección y tus mazos guardados
  se guardan en tu proyecto de Supabase, protegidos con Row Level Security:
  solo tú puedes leer o sustituir tus datos. Los amigos aceptados únicamente
  consultan el total y las copias libres de los códigos concretos que les
  faltan; no pueden enumerar tu colección ni leer tus mazos. La clave
  `service_role` de Supabase nunca debe usarse en el frontend.
- La app nunca almacena ni puede leer las contraseñas: Supabase Auth las recibe
  por conexión segura y guarda únicamente su hash. El SDK conserva la sesión
  en una base IndexedDB separada, no en `localStorage` ni dentro del archivo de
  copia de seguridad de SWU Deck Vault.
- La copia de seguridad exportable corresponde al modo invitado y es un único
  archivo `.json` bajo tu control.
- Si una cuenta activa el backup diario, una Edge Function genera un JSON de
  su colección y lo envía únicamente al email verificado de esa misma cuenta.
  La API key del proveedor de correo permanece en Supabase Secrets y nunca se
  incluye en la PWA.

## Despliegue

El proyecto incluye dos workflows de GitHub Actions:

- `.github/workflows/ci.yml`: tests + build en cada push/PR.
- `.github/workflows/deploy.yml`: despliegue automático a **GitHub Pages**
  al hacer push a `main`. Activa Pages en el repositorio
  (Settings → Pages → Source: GitHub Actions) y listo.

También puedes desplegarlo en **Cloudflare Pages**, **Netlify** o **Vercel**
con la configuración por defecto (`npm run build`, carpeta `dist`). Si no
despliegas en la raíz del dominio, define `VITE_BASE_PATH` en el build (por
ejemplo `/mi-repo/` para GitHub Pages).

## Limitaciones conocidas y mejoras futuras

- Un mazo nuevo se monta con prioridad inferior a los que ya estaban montados.
  Desde el detalle se puede trasladar la prioridad de cartas concretas; no se
  reasigna automáticamente toda la composición de otros mazos.
- No hay integración de colección con `sw-unlimited-db.com` (ver más arriba
  por qué, y cómo activarla si en el futuro existe una API oficial).
- El constructor valida Premier, Eternal, Twin Suns y Trilogy: estructura,
  tamaños, tipos, límites de copias, aspectos, rotaciones, suspensiones y cartas
  inhabilitadas incluidas en las reglas oficiales sincronizadas.
- Las cuentas no tienen modo offline para colección y mazos: se evita mantener
  una segunda copia local que pueda quedar desactualizada o sobrescribir la
  base de datos al volver la conexión.
- El alta y la recuperación de contraseña dependen del envío de emails de
  Supabase. Su servicio de correo integrado tiene límites bajos y está pensado
  para pruebas; una publicación con más usuarios debería configurar SMTP
  propio.
- El listado de sets conocidos (`SOR, SHD, TWI, JTL, LOF, SEC, LAW, ASH, IBH,
HMW, TS26`) se
  usa solo para avisos informativos; sets desconocidos igualmente se
  importan y comparan sin problema.
