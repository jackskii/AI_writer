import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from './pages/HomePage';
import { WorkDetailPage } from './pages/WorkDetailPage';
import { EditorPage } from './pages/EditorPage';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-dark-bg text-dark-text font-ui">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/works/:workId" element={<WorkDetailPage />} />
            <Route path="/works/:workId/chapters/:chapterId" element={<EditorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
