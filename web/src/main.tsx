import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthProvider';
import { system } from './lib/system';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    </ChakraProvider>
  </StrictMode>,
);
