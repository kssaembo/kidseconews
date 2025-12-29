import React, { useState, useEffect } from 'react';
import { User, Account, NewsAiUsage } from './types';
import { db } from './services/storage';
import Header from './components/Header';
import LoginView from './views/LoginView';
import StudentDashboard from './views/StudentDashboard';
import TeacherDashboard from './views/TeacherDashboard';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | undefined>();
  const [aiUsage, setAiUsage] = useState<NewsAiUsage | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initApp = async () => {
      try {
        const user = db.getCurrentUser();
        if (user) {
          setCurrentUser(user);
          await refreshData(user);
        }
      } catch (err) {
        console.error("Init failed:", err);
      } finally {
        setLoading(false);
      }
    };
    initApp();
  }, []);

  const refreshData = async (user: User) => {
    if (user.role === 'student') {
      try {
        const [acc, usage] = await Promise.all([
          db.getAccount(user.userId),
          db.getAiUsage(user.userId)
        ]);
        setAccount(acc);
        setAiUsage(usage);
      } catch (err) {
        console.error("Data refresh failed:", err);
      }
    }
    setLoading(false);
  };

  const handleLogin = async (user: User) => {
    setLoading(true);
    try {
      // 학생인 경우 계좌/AI사용량 초기화 (최초 1회만 생성됨)
      if (user.role === 'student') {
        await db.ensureStudentInitialized(user);
      }
      
      setCurrentUser(user);
      db.setCurrentUser(user);
      await refreshData(user);
    } catch (err: any) {
      console.error("Login session failed:", err);
      alert(`접속 중 오류가 발생했습니다: ${err.message}`);
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    db.setCurrentUser(null);
    setAccount(undefined);
    setAiUsage(undefined);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center font-kids text-2xl flex-col gap-4">
      <div className="animate-bounce text-6xl">🚀</div>
      <div>데이터를 불러오는 중...</div>
    </div>
  );

  if (!currentUser) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen pb-10">
      <Header 
        user={currentUser} 
        account={account} 
        aiUsage={aiUsage}
        onLogout={handleLogout} 
      />
      
      <main>
        {currentUser.role === 'teacher' ? (
          <TeacherDashboard />
        ) : (
          <StudentDashboard user={currentUser} onUpdate={() => refreshData(currentUser)} />
        )}
      </main>
    </div>
  );
};

export default App;