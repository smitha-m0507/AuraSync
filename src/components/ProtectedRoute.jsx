import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg-primary p-8">
        <div className="max-w-md rounded-3xl border border-border bg-bg-surface p-8 text-center shadow-aura">
          <p className="font-display text-2xl font-bold text-text-primary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg-primary p-8">
        <div className="max-w-md rounded-3xl border border-border bg-bg-surface p-8 text-center shadow-aura">
          <p className="font-display text-2xl font-bold text-text-primary">AuraSync session required</p>
          <p className="mt-3 text-text-secondary">Please sign in to continue.</p>
        </div>
      </div>
    );
  }

  return children;
}
