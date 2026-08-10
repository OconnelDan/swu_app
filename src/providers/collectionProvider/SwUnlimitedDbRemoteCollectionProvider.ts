import type { CollectionImportResult, CollectionProvider } from "@/types/collection";

/**
 * ADAPTADOR PREPARADO PERO NO ACTIVO.
 *
 * Motivo: en el momento de escribir este código no existe documentación
 * pública de una API oficial de sw-unlimited-db.com para obtener la
 * colección privada de un usuario. Por tanto, siguiendo la sección 16 de
 * la especificación:
 *
 *   - No se ha hecho scraping del formulario de login.
 *   - No se han inventado endpoints.
 *   - No se almacena ni se pide ninguna contraseña.
 *   - No hay tokens ni credenciales en el código fuente.
 *
 * Si en el futuro sw-unlimited-db.com publica una API autorizada
 * (OAuth, token personal, API key, etc.), esta clase es el lugar donde
 * implementarla. La interfaz CollectionProvider ya es compatible con
 * esa sustitución sin tocar el resto de la aplicación.
 *
 * Para activarla:
 *   1. Documentar aquí el endpoint oficial y el método de autenticación.
 *   2. Implementar importFromSource() usando fetch() contra ese endpoint,
 *      pasando el token que el usuario introduzca en Ajustes (nunca
 *      hardcodeado).
 *   3. Mostrar la fecha de última sincronización en la UI (ya prevista
 *      en CollectionImportResult.importedAt).
 *   4. Activar esta opción en Ajustes > "Proveedor de datos de cartas /
 *      colección" solo tras confirmación explícita del usuario.
 */
export class SwUnlimitedDbRemoteCollectionProvider implements CollectionProvider {
  readonly id = "sw-unlimited-db-remote";

  async importFromSource(_input: unknown): Promise<CollectionImportResult> {
    throw new Error(
      "La sincronización remota con sw-unlimited-db.com no está disponible: no existe " +
        "actualmente una API pública y documentada para la colección privada del usuario. " +
        "Usa la importación mediante Excel, CSV o JSON."
    );
  }
}
