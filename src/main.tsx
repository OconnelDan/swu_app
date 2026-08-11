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
