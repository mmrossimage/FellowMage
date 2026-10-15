import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useStore } from './store';

// só em desenvolvimento: acesso ao estado pelo console (testes e depuração)
if (import.meta.env.DEV) (window as unknown as { __fm: typeof useStore }).__fm = useStore;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
