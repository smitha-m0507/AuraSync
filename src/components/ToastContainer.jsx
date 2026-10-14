import { useToast } from '../context/ToastContext';

const styles = {
  success: 'border-success/30 bg-success/12 text-success',
  error: 'border-error/30 bg-error/12 text-error',
  info: 'border-aura-cyan/30 bg-aura-cyan/12 text-aura-cyan-light'
};

export default function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-semibold shadow-aura backdrop-blur-xl ${styles[toast.type] || styles.info}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
