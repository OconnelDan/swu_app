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

| Script               | Descripción                                        |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo con recarga en caliente     |
| `npm run build`      | Compila TypeScript y genera el build de producción |
| `npm run preview`    | Sirve el build de producción localmente            |
| `npm test`           | Ejecuta la suite de tests con Vitest (una vez)     |
| `npm run test:watch` | Tests en modo observador                           |
| `npm run lint`       | ESLint                                             |
| `npm run typecheck`  | Comprueba tipos sin generar archivos               |
| `npm run format`     | Formatea el proyecto con Prettier                  |

## Cómo usar la app

1. **Colección → Actualizar colección**: sube tu Excel/CSV, o pega un JSON.
   Verás una previsualización con avisos antes de confirmar.
2. **Comprobar**: pega o carga el JSON de un mazo. El resultado indica, para
   cada carta que ya tienes, si hay copias libres o si están comprometidas en
   otro mazo montado (y en cuál).
3. **Resultado**: verás qué cartas te faltan, con opción de ver todas o solo
   las faltantes, copiar/descargar la lista, guardar el mazo como favorito, e
   imágenes de cada carta (si el catálogo de cartas está activo).
4. **Mazos → Favoritos**: guarda ideas o mazos que quieras probar sin reservar
   ninguna carta. Cuando decidas prepararlo físicamente, pulsa **Montar mazo**.
5. **Mazos → Montados**: consulta los mazos que sí reservan cartas, su reparto
   físico real y las copias pendientes. **Desmontar mazo** libera las cartas y
   devuelve la lista a Favoritos sin borrar su JSON.
6. **Buscar**: localiza cualquier carta de tu colección por código o nombre y
   comprueba al instante si está libre, en qué mazo(s) montado(s) está usada
   (con cuántas copias en cada uno), o si no la tienes.
7. **Ajustes**: tema y mostrar/ocultar imágenes. En modo invitado también
   permite exportar/importar una copia local y borrar los datos del dispositivo.
8. **Cuenta y amigos** _(opcional, requiere configurar Supabase)_: crea una
   cuenta verificando primero tu email y asignando después una contraseña. Los
   accesos posteriores utilizan email y contraseña, con recuperación por
   correo si la olvidas. Desde ese momento, las importaciones de colección y
   todos los cambios de mazos se guardan directamente en la cuenta. También
   puedes generar o canjear códigos de amistad y consultar qué amigos tienen
   las cartas que te faltan, incluidas sus copias libres.

### Favoritos y reparto entre mazos montados

Guardar una lista en **Favoritos** solo conserva la idea: no descuenta copias
libres. Como cada carta física solo puede estar en un mazo a la vez, la app
reparte la colección exclusivamente entre los **Mazos montados**. Los que ya
estaban montados mantienen prioridad y un nuevo mazo utiliza primero las
copias que continúen libres, sin quitárselas automáticamente a otro. La pantalla
de montados distingue las copias reservadas, las que están en otro mazo y las
que realmente no existen en la colección.

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
   antes de publicar esta versión.
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

**Modelo de privacidad**: por defecto, un amigo aceptado solo puede saber
"¿tienes esta carta puntual, cuántas copias y cuántas están libres?" cuando
comprueba un mazo incompleto; nunca puede listar tu colección completa ni tus
mazos. La invitación caduca a los siete días y solo puede utilizarse una vez.

No existe sincronización manual ni una copia local de respaldo para una cuenta:
una importación sustituye únicamente la colección de Supabase; guardar,
actualizar o borrar un favorito modifica únicamente ese mazo. De esta forma un
navegador con una vista antigua no reemplaza por accidente el resto de los
datos. El modo invitado y sus copias de seguridad JSON siguen disponibles sin
crear una cuenta, pero no permiten utilizar Amigos.

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
│                       cardImageUrl, collectionFingerprint,
│                       favoritesRepository, friendsRepository, backup
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
├─ pages/             Las 9 pantallas de la app (incluye cuenta y amigos)
├─ tests/             Suite de Vitest (normalización, comparación, providers,
│                       favoritos, backup, reparto de cartas entre mazos)
```

supabase/schema.sql contiene el esquema SQL (tablas + Row Level Security +
funciones) para cuentas, persistencia remota y amigos, pensado para pegarse
directamente en el SQL Editor de Supabase.

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
- **`swu-db.com`**: expone una **API REST pública y documentada**
  (`https://www.swu-db.com/api`) para el **catálogo** de cartas (nombre, set,
  número, tipo, rareza, imagen) — nunca colecciones privadas. Se usa en
  `SwUnlimitedDbCardProvider` mediante el endpoint documentado
  `GET https://api.swu-db.com/cards/{set}/{numero}`, con caché local para no
  repetir peticiones. **Se consulta automáticamente** siempre que haya
  conexión, para poder mostrar nombres e imágenes; si no hay conexión o una
  carta no está en el catálogo, la comprobación sigue funcionando igualmente
  usando solo los códigos de carta (`SET_NUMERO`).

## Privacidad y seguridad

- En modo invitado, colección y mazos se guardan **solo en tu dispositivo**.
  Con sesión iniciada, colección y mazos se guardan exclusivamente en Supabase;
  borrar la caché local no los elimina y vuelven a cargarse tras iniciar sesión.
- Para mostrar nombres e imágenes de cartas, la app **consulta
  automáticamente** el catálogo público de `swu-db.com` cuando hay conexión
  (ver "Integración con catálogos externos"). Esa consulta solo envía el
  código de la carta (p. ej. `LAW_038`), nunca tu colección completa ni tus
  mazos. No hay forma de desactivar esta consulta desde Ajustes; si prefieres
  que la app no haga ninguna petición de red, desconéctate: seguirá
  funcionando igualmente solo con los códigos de carta.
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
  La reasignación controlada de cartas para dar prioridad a otro mazo es la
  siguiente mejora prevista; por ahora puedes desmontar uno y montar otro.
- No hay integración de colección con `sw-unlimited-db.com` (ver más arriba
  por qué, y cómo activarla si en el futuro existe una API oficial).
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
