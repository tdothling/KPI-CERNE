import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// @ts-ignore - Virtual module handled by vite-plugin-pwa
import { registerSW } from 'virtual:pwa-register';

// Inicializa o PWA
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log("PWA: Nova atualização disponível.");
  },
  onOfflineReady() {
    console.log("PWA: Aplicativo pronto para uso offline.");
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);