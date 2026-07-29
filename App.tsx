
import React, { useState, useEffect } from 'react';
import { User, Account, NewsAiUsage } from './types.ts';
import { db } from './services/storage.ts';
import Header from './components/Header.tsx';
import LoginView from './views/LoginView.tsx';
import StudentDashboard from './views/StudentDashboard.tsx';
import TeacherDashboard from './views/TeacherDashboard.tsx';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | undefined>();
  const [aiUsage, setAiUsage] = useState<NewsAiUsage | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. URL 파라미터 확인 (클래스뱅크 자동로그인 연동)
        const params = new URLSearchParams(window.location.search);
        const nameParam = params.get('name');
        const gradeParam = params.get('grade');
        const classParam = params.get('class');
        const numberParam = params.get('number');
        const token = params.get('token');
        const classCodeParam = params.get('classCode');

        const isStudentUrl = Boolean(gradeParam && classParam && numberParam);

        // 1-1. 학생 인적사항 파라미터가 포함된 URL 접근인 경우 (클래스뱅크 학생 접근)
        if (isStudentUrl) {
          const studentUser = await db.loginStudentWithParams({
            name: nameParam,
            grade: Number(gradeParam),
            classNum: Number(classParam),
            number: Number(numberParam),
            token: token,
            classCode: classCodeParam
          });

          if (studentUser) {
            await db.ensureStudentInitialized(studentUser);
            setCurrentUser(studentUser);
            db.setCurrentUser(studentUser);
            await refreshData(studentUser);
          } else {
            // 학생 파라미터로 왔으나 매칭되는 학생 계정이 없는 경우
            // 기존 저장된 교사 세션이 뜨지 않도록 세션을 초기화함
            setCurrentUser(null);
            db.setCurrentUser(null);
          }

          // URL 파라미터 정리
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('name');
          cleanUrl.searchParams.delete('grade');
          cleanUrl.searchParams.delete('class');
          cleanUrl.searchParams.delete('number');
          cleanUrl.searchParams.delete('token');
          cleanUrl.searchParams.delete('classCode');
          window.history.replaceState({}, '', cleanUrl.toString());

          setLoading(false);
          return;
        }

        // 1-2. 학생 파라미터 없이 토큰만 단독 전달된 경우 (클래스뱅크 교사/역할선택 연동)
        if (token) {
          const tokenUser = await db.loginWithToken(token);
          if (tokenUser) {
            if (tokenUser.role === 'student') {
              await db.ensureStudentInitialized(tokenUser);
            }
            setCurrentUser(tokenUser);
            db.setCurrentUser(tokenUser);
            await refreshData(tokenUser);

            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('token');
            window.history.replaceState({}, '', cleanUrl.toString());

            setLoading(false);
            return;
          }
        }

        // 2. URL 파라미터가 없는 일반 접근인 경우: 기존 로컬스토리지 로그인 세션 확인
        const user = db.getCurrentUser();
        if (user) {
          setCurrentUser(user);
          await refreshData(user);
        }
      } catch (err) {
        console.error("초기화 오류:", err);
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
        console.warn("데이터 로드 실패:", err);
      }
    }
  };

  const handleLogin = async (user: User) => {
    setLoading(true);
    try {
      if (user.role === 'student') {
        await db.ensureStudentInitialized(user);
      }
      setCurrentUser(user);
      db.setCurrentUser(user);
      await refreshData(user);
    } catch (err: any) {
      alert(`오류가 발생했습니다: ${err.message}`);
    } finally {
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
    <div className="min-h-screen flex items-center justify-center font-kids text-2xl flex-col gap-4 bg-blue-50">
      <div className="animate-bounce text-6xl">🚀</div>
      <div className="text-blue-600">데이터를 불러오는 중...</div>
    </div>
  );

  if (!currentUser) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50/30">
      <Header 
        user={currentUser} 
        account={account} 
        aiUsage={aiUsage}
      />
      
      <main className="max-w-6xl mx-auto flex-1 w-full">
        {currentUser.role === 'teacher' ? (
          <TeacherDashboard user={currentUser} />
        ) : (
          <StudentDashboard user={currentUser} onUpdate={() => refreshData(currentUser)} />
        )}
      </main>

      <footer className="w-full py-8 text-center text-gray-400 text-xs font-medium border-t border-gray-100 mt-12 bg-white/50">
        ⓒ 2026. Kwon's class. All rights reserved.
      </footer>
    </div>
  );
};

export default App;
