import { useState } from 'react';
import { supabase } from './supabaseClient';
import { Lock, Mail } from 'lucide-react';

export default function Login({ setSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
    } else {
      setSession(data.session);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-app)' }}>
      <div className="bento-card" style={{ padding: '40px', width: '100%', maxWidth: '400px', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>Mutual Celulares</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Ingresa a tu cuenta para continuar</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '0.875rem', width: '100%' }}>
            Error al iniciar sesión: {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ width: '100%' }}>
          <div className="form-group">
            <label style={{ color: 'var(--text-secondary)', marginBottom: '8px', display: 'block', fontSize: '14px' }}>Correo Electrónico</label>
            <div className="search-pill" style={{ padding: '0', background: 'var(--bg-app)', border: '1px solid var(--border-light)', boxShadow: 'none' }}>
              <Mail style={{ marginLeft: '16px', color: 'var(--text-secondary)' }} size={20} />
              <input
                type="email"
                style={{ padding: '12px 16px 12px 12px', border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-primary)' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '32px', marginTop: '20px' }}>
            <label style={{ color: 'var(--text-secondary)', marginBottom: '8px', display: 'block', fontSize: '14px' }}>Contraseña</label>
            <div className="search-pill" style={{ padding: '0', background: 'var(--bg-app)', border: '1px solid var(--border-light)', boxShadow: 'none' }}>
              <Lock style={{ marginLeft: '16px', color: 'var(--text-secondary)' }} size={20} />
              <input
                type="password"
                style={{ padding: '12px 16px 12px 12px', border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-primary)' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button type="submit" className="action-button" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
