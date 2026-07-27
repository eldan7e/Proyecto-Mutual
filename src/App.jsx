import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Loader2 } from 'lucide-react';
import Login from './Login';
import Layout from './Layout';
import { ToastProvider, useToast, globalToast } from './components/ui/ToastProvider';
import { ConfirmProvider, useConfirm, globalConfirm } from './components/ui/ConfirmProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

const safeLazy = (importFunc) => {
  return lazy(() => {
    return importFunc().catch((error) => {
      const isChunkError = /failed to fetch/i.test(error.message) ||
                           /dynamically imported module/i.test(error.message) ||
                           /loading chunk/i.test(error.message);
      if (isChunkError) {
        console.warn("Chunk load failed. Reloading page to fetch the latest assets...", error);
        window.location.reload();
        return new Promise(() => {}); // Keep pending while reloading
      }
      throw error;
    });
  });
};

const Dashboard = safeLazy(() => import('./Dashboard'));
const Comunidad = safeLazy(() => import('./Comunidad'));
const Facturacion = safeLazy(() => import('./Facturacion'));
const CargaManual = safeLazy(() => import('./CargaManual'));
const GestionDeuda = safeLazy(() => import('./GestionDeuda'));
const GestionPagos = safeLazy(() => import('./GestionPagos'));
const Descuentos = safeLazy(() => import('./Descuentos'));
const ConciliacionBancaria = safeLazy(() => import('./ConciliacionBancaria'));
const MovimientosBancarios = safeLazy(() => import('./MovimientosBancarios'));
const IngresoDiario = safeLazy(() => import('./IngresoDiario'));
const Campanas = safeLazy(() => import('./Campanas'));
const Tareas = safeLazy(() => import('./Tareas'));
const LogDiario = safeLazy(() => import('./LogDiario'));
const CuentaCorriente = safeLazy(() => import('./CuentaCorriente'));
const InformeSaldos = safeLazy(() => import('./InformeSaldos'));

// Global hooks initializer
function GlobalHooksInitializer() {
  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    globalToast.setFunctions(addToast);
    globalConfirm.setFunction(confirm);
  }, [addToast, confirm]);

  return null;
}

// Pantalla de carga mientras se descarga el chunk de la ruta
const PageLoader = () => (
  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
    <Loader2 className="animate-spin" size={40} style={{ color: 'var(--accent)' }} />
  </div>
);

function App() {
  const [session, setSession] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitializing(false);
    }).catch(() => {
      setIsInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setIsInitializing(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  if (isInitializing) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={40} style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  if (!session) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Login setSession={setSession} />
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <GlobalHooksInitializer />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route element={<Layout session={session} theme={theme} toggleTheme={toggleTheme} />}>
                  <Route index element={<Dashboard />} />
                  <Route path="comunidad" element={<Comunidad />} />
                  <Route path="socios" element={<Navigate to="/comunidad?tab=socios" replace />} />
                  <Route path="planes" element={<Navigate to="/comunidad?tab=planes" replace />} />
                  <Route path="facturacion" element={<Facturacion />} />
                  <Route path="cuenta-corriente" element={<CuentaCorriente />} />
                  <Route path="informe-saldos" element={<InformeSaldos />} />
                  <Route path="carga-manual" element={<CargaManual />} />
                  <Route path="gestion-deuda" element={<GestionDeuda />} />
                  <Route path="gestion-pagos" element={<GestionPagos />} />
                  <Route path="descuentos" element={<Descuentos />} />
                  <Route path="conciliacion-bancaria" element={<ConciliacionBancaria />} />
                  <Route path="movimientos-bancarios" element={<MovimientosBancarios />} />
                  <Route path="ingreso-diario" element={<IngresoDiario />} />
                  <Route path="campanas" element={<Campanas />} />
                  <Route path="tareas" element={<Tareas />} />
                  <Route path="log-diario" element={<LogDiario />} />
                  <Route path="grupos" element={<Navigate to="/comunidad?tab=grupos" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
