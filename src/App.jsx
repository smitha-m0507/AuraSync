import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { LabProvider } from './context/LabContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ToastContainer from './components/ToastContainer';
import ProtectedRoute from './components/ProtectedRoute';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AudioLabPage from './pages/AudioLabPage';
import ReportsPage from './pages/ReportsPage';
import NotFoundPage from './pages/NotFoundPage';

function PageTransition({ children }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -18 }}
        transition={{ duration: 0.28 }}
        className="min-h-screen"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <ToastProvider>
        <AppProvider>
          <AuthProvider>
            <LabProvider>
            <HashRouter>
              <ToastContainer />
              <Navbar />
              <PageTransition>
                <Routes>
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                  <Route path="/lab" element={<ProtectedRoute><AudioLabPage /></ProtectedRoute>} />
                  <Route path="/audio" element={<Navigate to="/lab" replace />} />
                  <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </PageTransition>
              <Footer />
            </HashRouter>
            </LabProvider>
          </AuthProvider>
        </AppProvider>
      </ToastProvider>
    </ThemeProvider>
    </MotionConfig>
  );
}
