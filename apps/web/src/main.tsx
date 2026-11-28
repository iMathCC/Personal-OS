import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { PwaUpdatePrompt } from '@/components/pwa/PwaUpdatePrompt';
import '@/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento #root não encontrado.');
}

createRoot(rootElement).render(
  <StrictMode>
    <PwaUpdatePrompt />
    <App />
  </StrictMode>,
);
