import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ReportSignatureModalHost from './components/ReportSignatureModalHost.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <ReportSignatureModalHost />
  </>
);
