import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

// Registro do PWA com atualização automática
registerSW({ immediate: true });

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