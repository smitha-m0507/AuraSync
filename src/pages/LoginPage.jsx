import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { isOfficialEmail } from '../utils/validation';
import { Backdrop } from '../components/art/Layout';
import { AuthArt, FeatureIcon } from '../components/art/Illustrations';

const highlights = [
  { icon: 'types', tone: 'brand', text: 'Interviews, MoM, discussions & conversations' },
  { icon: 'flowchart', tone: 'cyan', text: 'Evaluated concept flowcharts' },
  { icon: 'chatbot', tone: 'pink', text: 'Chat with your recording' }
];


export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { addToast } = useToast();
  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const validate = () => {
    const next = {};
    if (!isOfficialEmail(form.email)) next.email = 'Please use your official organizational or institutional email.';
    if (!form.password) next.password = 'Password is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await login(form.email.trim().toLowerCase(), form.password);
      addToast('Welcome back to AuraSync.', 'success');
      navigate('/');
    } catch (error) {
      addToast(error.response?.data?.error?.message || error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative isolate grid min-h-screen overflow-x-clip bg-bg-primary">
      <Backdrop blobs={['one', 'two']} />

      <section className="grid min-h-screen lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          className="order-2 flex flex-col justify-center px-6 py-12 sm:px-12 lg:order-1 lg:px-20"
        >
          <div className="glass-card mx-auto w-full max-w-md rounded-3xl p-6 shadow-aura sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-aura-violet to-aura-cyan text-white shadow-glow">
                <svg viewBox="0 0 64 64" className="h-7 w-7" fill="none" aria-hidden="true"><path d="M18 24v16M26 16v32M34 10v44M42 18v28M50 25v14" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></svg>
              </span>
              <span className="font-display text-2xl font-bold text-text-primary">AuraSync</span>
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-aura-violet-light">Secure access</p>
            <h1 className="mt-3 font-display text-3xl font-bold text-text-primary">Log in to AuraSync</h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">Welcome back — your history is waiting in Audio Lab.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-text-primary">Email</span>
                <input
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                  className="input mt-2 w-full"
                  placeholder="name@company.com"
                  autoComplete="email"
                />
                {errors.email && <p className="mt-2 text-sm text-error">{errors.email}</p>}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-text-primary">Password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => update('password', event.target.value)}
                  className="input mt-2 w-full"
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
                {errors.password && <p className="mt-2 text-sm text-error">{errors.password}</p>}
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={(event) => update('remember', event.target.checked)}
                  className="h-5 w-5 accent-aura-violet"
                />
                <span className="text-sm font-semibold text-text-secondary">Remember me</span>
              </label>

              <button type="submit" disabled={submitting} className="gradient-button w-full disabled:cursor-wait disabled:opacity-70">
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-text-secondary">
              New to AuraSync?{' '}
              <button type="button" onClick={() => navigate('/signup')} className="font-bold text-aura-cyan-light hover:underline">
                Create an account
              </button>
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          className="order-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:order-2 lg:px-20"
        >
          <AuthArt variant="login" className="mx-auto h-auto w-full max-w-md" />
          <h2 className="mt-6 text-center font-display text-4xl font-bold leading-tight text-text-primary sm:text-5xl lg:text-left">
            Your audio, decoded by <span className="text-gradient">AuraSync</span>
          </h2>
          <p className="mt-4 max-w-xl text-center text-lg leading-8 text-text-secondary lg:text-left">
            Sign in to pick up your flowcharts and chats right where you left them.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {highlights.map((item) => (
              <div key={item.text} className="glass-subtle flex items-center gap-3 rounded-2xl p-3">
                <FeatureIcon name={item.icon} tone={item.tone} className="h-9 w-9 rounded-xl" iconClassName="h-4 w-4" />
                <span className="text-sm font-semibold leading-5 text-text-primary">{item.text}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>
    </main>
  );
}