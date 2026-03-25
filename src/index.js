import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { TenantProvider } from './contexts/TenantContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <TenantProvider> 
      <App />
    </TenantProvider>
  </React.StrictMode>
);
