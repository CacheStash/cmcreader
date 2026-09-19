import './polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { webApi } from './services/webApi';

// If running in browser (outside Electron), use webApi adapter
if (!window.electronAPI) {
  window.electronAPI = webApi;
}

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