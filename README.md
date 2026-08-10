# SWU Deck Collection Checker


Aplicación web (PWA) que comprueba si tu colección de **Star Wars: Unlimited**
cubre las cartas necesarias para un mazo, a partir de tu Excel/CSV/JSON de
colección y el JSON del mazo (por ejemplo, exportado desde una deck-builder).

Funciona completamente en el navegador: no hay backend, y todos tus datos
(colección, mazos favoritos, ajustes) se guardan localmente en tu dispositivo
mediante IndexedDB.

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

| Script              | Descripción                                      |
| ------------------- | ------------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo con recarga en caliente    |
| `npm run build`       | Compila TypeScript y genera el build de producción |
| `npm run preview`     | Sirve el build de producción localmente            |
| `npm test`            | Ejecuta la suite de tests con Vitest (una vez)     |
| `npm run test:watch`  | Tests en modo observador                           |
| `npm run lint`        | ESLint                                             |
| `npm run typecheck`   | Comprueba tipos sin generar archivos               |
| `npm run format`      | Formatea el proyecto con Prettier                  |

## Cómo usar la app

1. **Colección → Actualizar colección**: sube tu Excel/CSV, o pega un JSON.
   Verás una previsualización con avisos antes de confirmar.
2. **Comprobar**: pega o carga el JSON de un mazo. El resultado indica, para
   cada carta que ya tienes, si hay copias libres o si están comprometidas en
   otro mazo favorito (y en cuál).
3. **Resultado**: verás qué cartas te faltan, con opción de ver todas o solo
   las faltantes, copiar/descargar la lista, guardar el mazo como favorito, e
   imágenes de cada carta (si el catálogo de cartas está activo).
4. **Favoritos**: vuelve a comprobar mazos guardados cuando actualices tu
   colección; la app te avisa si el favorito quedó desactualizado.
5. **Buscar**: localiza cualquier carta de tu colección por código o nombre y
   comprueba al instante si está libre, en qué mazo(s) favorito(s) está usada
   (con cuántas copias en cada uno), o si no la tienes.
6. **Ajustes**: tema, mostrar/ocultar imágenes, copia de seguridad completa
   (exportar/importar todo en un `.json`), y borrado de datos.
7. **Amigos** *(opcional, requiere configurar Supabase)*: crea una cuenta,
   genera un código de invitación para un amigo o introduce el suyo, y
   sincroniza tu colección con la nube. Desde el resultado de un mazo
   incompleto, puedes consultar cuáles de tus amigos tienen las cartas que
   te faltan y cuántas copias.

### Reparto de cartas entre mazos favoritos

Como cada carta física solo puede estar en un mazo a la vez, la app reparte
las copias de tu colección entre tus mazos favoritos guardados (por orden de
creación: el favorito más antiguo tiene prioridad). Así, al comprobar un mazo
nuevo o revisar el buscador de cartas, sabrás no solo cuántas copias tienes en
total, sino cuántas están **libres** y cuántas ya están **asignadas** a otro
mazo guardado. Esto es orientativo: no bloquea nada, solo te ayuda a decidir
si mover cartas de un mazo a otro antes de tu próxima partida o torneo.

En `sample-data/` encontrarás un Excel de colección de ejemplo
(`coleccion_ejemplo.xlsx`) y dos mazos de ejemplo (`mazo_ejemplo.json` y
`mazo_ejemplo_agrupado.json`) ya preparados para probar la app: el resultado
mostrará intencionadamente algunas cartas faltantes.

### Amigos y colección compartida (opcional)

Esta función es **opcional** y requiere un proyecto propio y gratuito de
[Supabase](https://supabase.com) (Postgres + Auth). Sin configurarlo, el resto
de la app funciona igual, 100% local.

1. Crea un proyecto en Supabase y copia su **Project URL** y su clave pública
   ("anon"/"publishable key") en un archivo `.env` en la raíz del proyecto
   (usa `.env.example` como plantilla). **Nunca** uses la `service_role`/`secret
   key` en el frontend.
2. En el **SQL Editor** de Supabase, pega y ejecuta todo el contenido de
   [`supabase/schema.sql`](./supabase/schema.sql). Crea las tablas de
   perfiles, códigos de invitación, amistades y colección compartida, todas
   con Row Level Security.
3. En la app, ve a **Amigos**: crea una cuenta, sincroniza tu colección, y
   genera o canjea un código de invitación.

**Modelo de privacidad**: por defecto, un amigo aceptado solo puede saber
"¿tienes esta carta puntual y cuántas copias?" cuando tú comprueba un mazo
incompleto — nunca puede listar tu colección completa sin más.

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
├─ db/                Dexie (IndexedDB): colección, favoritos, caché,
│                       historial de comprobaciones, ajustes
├─ hooks/             useCollection, useFavorites, useSettings, useAuth,
│                       useOnlineStatus (todos reactivos vía Dexie liveQuery
│                       salvo useAuth, que usa la sesión de Supabase)
├─ components/        UI reutilizable (Layout, tabla de resultados, resumen…)
├─ pages/             Las 8 pantallas de la app (incluye buscador y amigos)
├─ tests/             Suite de Vitest (normalización, comparación, providers,
│                       favoritos, backup, reparto de cartas entre mazos)
```

supabase/schema.sql contiene el esquema SQL (tablas + Row Level Security +
funciones) para la sincronización opcional de amigos, pensado para pegarse
directamente en el SQL Editor de Supabase.

**Principios de diseño:**

- La lógica de negocio (`src/lib`) no depende de React ni de IndexedDB: es
  pura y 100% testeable de forma aislada.
- `CardProvider` y `CollectionProvider` son interfaces: se puede añadir un
  nuevo origen de datos (otra web, otro formato de archivo, Supabase...) sin
  tocar el resto de la aplicación.
- La app funciona **completamente offline** tras la primera visita para todo
  lo esencial (colección, favoritos, comprobación de mazos). La función de
  amigos es la única pieza que necesita red y una cuenta.

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

- Toda tu colección, tus mazos favoritos y tus ajustes se guardan **solo en
  tu dispositivo** (IndexedDB del navegador), salvo que actives
  voluntariamente la función de Amigos (ver más abajo).
- Para mostrar nombres e imágenes de cartas, la app **consulta
  automáticamente** el catálogo público de `swu-db.com` cuando hay conexión
  (ver "Integración con catálogos externos"). Esa consulta solo envía el
  código de la carta (p. ej. `LAW_038`), nunca tu colección completa ni tus
  mazos. No hay forma de desactivar esta consulta desde Ajustes; si prefieres
  que la app no haga ninguna petición de red, desconéctate: seguirá
  funcionando igualmente solo con los códigos de carta.
- Si activas **Amigos**, tu email y tu colección (recuento por carta) se
  guardan en tu propio proyecto de Supabase, protegidos con Row Level
  Security: solo tú puedes leer/editar tu fila, y tus amigos aceptados solo
  pueden consultar, carta por carta, si tienes copias de las que a ellos les
  faltan (nunca listar tu colección completa). La clave `service_role` de
  Supabase nunca debe usarse en el frontend.
- No se almacena ninguna contraseña ni token de terceros en el código; las
  contraseñas de la función Amigos las gestiona el sistema de autenticación
  de Supabase.
- La copia de seguridad exportable es un único archivo `.json` bajo tu
  control; puedes guardarla donde quieras.

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

- El reparto de cartas entre mazos favoritos (ver arriba) es orientativo: no
  bloquea nada ni reserva copias de verdad, solo te informa. Se asigna por
  orden de creación del favorito; no hay forma de fijar manualmente la
  prioridad de un mazo sobre otro.
- No hay integración de colección con `sw-unlimited-db.com` (ver más arriba
  por qué, y cómo activarla si en el futuro existe una API oficial).
- La función de Amigos requiere que sincronices tu colección manualmente
  (botón "Sincronizar colección con la nube" en Amigos); no se sincroniza
  automáticamente todavía cada vez que la actualizas.
- No hay un rol de administrador ni restablecimiento de contraseña integrado
  en la UI de la app: eso lo gestiona el panel de Supabase de cada proyecto.
- El listado de sets conocidos (`SOR, SHD, TWI, JTL, LOF, SEC, LAW, ASH`) se
  usa solo para avisos informativos; sets desconocidos igualmente se
  importan y comparan sin problema.
