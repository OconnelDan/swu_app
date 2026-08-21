import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { AuthProvider } from "@/contexts/AuthProvider";
import { DataSourceProvider } from "@/contexts/DataSourceProvider";

// Actualiza el service worker automáticamente en segundo plano; no interrumpe
// al usuario con confirmaciones. La interfaz queda disponible tras la primera
// visita; los datos offline corresponden exclusivamente al modo invitado.
registerSW({ immediate: true });

// La primera caché de imágenes no tenía caducidad y podía mantener diferencias
// entre dispositivos. La nueva versión utiliza otro nombre, revalida en
// segundo plano y elimina esta caché heredada una única vez cuando exista.
if ("caches" in window) {
  void window.caches.delete("swu-images");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <DataSourceProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </DataSourceProvider>
    </AuthProvider>
  </React.StrictMode>
);
