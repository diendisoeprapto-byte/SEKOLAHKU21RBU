/**
 * ============================================================================
 * Aplikasi                     : SERBU 21 (SDN Rawa Badak Utara 21)
 * Original Creator & Architect : Endi Soeprapto, S.Pd., Gr.
 * Dedikasi                     : "For my beloved daughter, Dilanesa"
 * Tahun                        : 2026
 * ============================================================================
 */

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { verifySystemOwnershipIntegrity } from './utils/ownershipWatermark';

verifySystemOwnershipIntegrity();

createRoot(document.getElementById('root')!).render(<App />);
