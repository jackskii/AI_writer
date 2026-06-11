import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from './pages/HomePage';
import { WorkDetailPage } from './pages/WorkDetailPage';
import { EditorPage } from './pages/EditorPage';
import { AuthPage } from './pages/AuthPage';
import { useAuthStore } from './stores/useAuthStore';
import { Toast } from './components/ui/Toast';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 60 seconds - show cached data instantly, refresh in background
      gcTime: 5 * 60 * 1000, // 5 minutes - keep unused data in cache
      retry: 1,
    },
  },
});

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth" replace />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-dark-bg text-dark-text font-ui">
          <Toast />
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/" element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            } />
            <Route path="/works/:workId" element={
              <ProtectedRoute>
                <WorkDetailPage />
              </ProtectedRoute>
            } />
            <Route path="/works/:workId/chapters/:chapterId" element={
              <ProtectedRoute>
                <EditorPage />
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
