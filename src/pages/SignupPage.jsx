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


export default function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const { addToast } = useToast();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    purpose: 'Enterprise'
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const validate = () => {
    const next = {};
    if (!form.fullName.trim()) next.fullName = 'Full name is required.';
    if (!isOfficialEmail(form.email)) next.email = 'Please use your official organizational or institutional email (e.g., @yourcompany.com)';
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters.';
    if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    if (!form.purpose) next.purpose = 'Purpose is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await signup({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        purpose: form.purpose
      });
      addToast('AuraSync account created. Please log in.', 'success');
      navigate('/login');
    } catch (error) {
      addToast(error.response?.data?.error?.message || error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative isolate grid min-h-screen overflow-x-clip bg-bg-primary">
      <Backdrop />

      <section className="grid min-h-screen lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20"
        >
          <div className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-bg-surface/60 px-4 py-2 text-sm font-semibold text-text-secondary backdrop-blur-xl">
            <span className="h-2 w-2 rounded-full bg-aura-cyan" />
            AI-powered Audio-to-Intelligence
          </div>
          <AuthArt variant="signup" className="mx-auto h-auto w-full max-w-md" />
          <h1 className="mt-6 font-display text-4xl font-bold leading-tight text-text-primary sm:text-5xl">
            Turn your voice into <span className="text-gradient">clear answers</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-text-secondary">
            AuraSync turns interviews, meetings, discussions and conversations into transcripts, evaluated concept flowcharts and a chatbot you can question.
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

        <motion.div
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center justify-center px-6 py-12 sm:px-12 lg:px-20"
        >
          <form onSubmit={onSubmit} className="glass-card w-full max-w-md rounded-3xl p-6 shadow-aura sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-aura-cyan-light">Create account</p>
            <h2 className="mt-3 font-display text-3xl font-bold text-text-primary">Join AuraSync</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">Use your official organizational or institutional email to begin.</p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-text-primary">Full Name</span>
                <input
                  value={form.fullName}
                  onChange={(event) => update('fullName', event.target.value)}
                  className="input mt-2 w-full"
                  placeholder="Avery Morgan"
                  autoComplete="name"
                />
                {errors.fullName && <p className="mt-2 text-sm text-error">{errors.fullName}</p>}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-text-primary">Official Email</span>
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
                <span className="text-sm font-semibold text-text-primary">Purpose</span>
                <select
                  value={form.purpose}
                  onChange={(event) => update('purpose', event.target.value)}
                  className="input mt-2 w-full"
                >
                  <option>Education</option>
                  <option>Enterprise</option>
                </select>
                {errors.purpose && <p className="mt-2 text-sm text-error">{errors.purpose}</p>}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-text-primary">Password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => update('password', event.target.value)}
                  className="input mt-2 w-full"
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
                {errors.password && <p className="mt-2 text-sm text-error">{errors.password}</p>}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-text-primary">Confirm Password</span>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => update('confirmPassword', event.target.value)}
                  className="input mt-2 w-full"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
                {errors.confirmPassword && <p className="mt-2 text-sm text-error">{errors.confirmPassword}</p>}
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="gradient-button mt-6 w-full disabled:cursor-wait disabled:opacity-70"
            >
              {submitting ? 'Creating AuraSync account...' : 'Create account'}
            </button>

            <p className="mt-5 text-center text-sm text-text-secondary">
              Already have an account?{' '}
              <button type="button" onClick={() => navigate('/login')} className="font-bold text-aura-cyan-light hover:underline">
                Log in
              </button>
            </p>
          </form>
        </motion.div>
      </section>
    </main>
  );
}