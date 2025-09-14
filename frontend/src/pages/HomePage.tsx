import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Calendar, FileText } from 'lucide-react';
import { worksApi } from '../services/api';
import { useWorkStore } from '../stores/useWorkStore';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardFooter, CardHeader } from '../components/ui/Card';
import { LoadingScreen, LoadingSpinner } from '../components/ui/Loading';
import { CreateWorkModal } from '../components/modals/CreateWorkModal';
import type { Work } from '../types';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { works, setWorks, setCurrentWork } = useWorkStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['works'],
    queryFn: async () => {
      const response = await worksApi.list();
      return response.data.results; // Extract the results array from paginated response
    },
    onSuccess: (data: Work[]) => {
      setWorks(data);
    }
  });

  const handleWorkClick = (work: Work) => {
    setCurrentWork(work);
    navigate(`/works/${work.id}`);
  };

  const handleCreateWork = () => {
    setIsCreateModalOpen(true);
  };

  const handleWorkCreated = (work: Work) => {
    refetch(); // Refresh the works list
    setIsCreateModalOpen(false);
    navigate(`/works/${work.id}`);
  };

  if (isLoading) {
    return <LoadingScreen message="正在加载作品列表..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-400 mb-2">加载失败</h2>
          <p className="text-dark-text-muted mb-4">无法加载作品列表</p>
          <Button onClick={() => refetch()}>重新加载</Button>
        </div>
      </div>
    );
  }

  const worksList = data || works || [];

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-dark-text">AI 小说写作助手</h1>
              <p className="text-dark-text-muted mt-1">智能写作，创意无限</p>
            </div>
            <Button onClick={handleCreateWork} className="flex items-center gap-2">
              <Plus size={18} />
              新建作品
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {worksList.length === 0 ? (
          // Empty State
          <div className="text-center py-16">
            <BookOpen size={64} className="mx-auto text-dark-text-muted mb-4" />
            <h3 className="text-xl font-semibold text-dark-text mb-2">开始您的创作之旅</h3>
            <p className="text-dark-text-muted mb-6 max-w-md mx-auto">
              创建您的第一部作品，享受AI驱动的智能写作体验
            </p>
            <Button onClick={handleCreateWork} size="lg" className="flex items-center gap-2">
              <Plus size={20} />
              创建第一部作品
            </Button>
          </div>
        ) : (
          // Works Grid
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {worksList.map((work) => (
              <Card key={work.id} className="hover:border-dark-primary transition-colors cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-dark-text text-lg truncate">
                        {work.title}
                      </h3>
                      <p className="text-dark-text-muted text-sm mt-1">
                        {work.synopsis ? (
                          work.synopsis.length > 80 
                            ? `${work.synopsis.substring(0, 80)}...`
                            : work.synopsis
                        ) : '暂无简介'}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-dark-text-muted">
                      <FileText size={16} />
                      <span>{work.word_count.toLocaleString()} 字</span>
                    </div>
                    <div className="flex items-center gap-2 text-dark-text-muted">
                      <BookOpen size={16} />
                      <span>{work.chapter_count} 章</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-dark-text-muted text-xs mt-3">
                    <Calendar size={14} />
                    <span>更新于 {new Date(work.updated_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                </CardContent>
                
                <CardFooter>
                  <Button 
                    variant="ghost" 
                    className="w-full"
                    onClick={() => handleWorkClick(work)}
                  >
                    打开作品
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Create Work Modal */}
      <CreateWorkModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onWorkCreated={handleWorkCreated}
      />
    </div>
  );
};