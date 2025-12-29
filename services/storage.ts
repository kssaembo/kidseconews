import { User, Account, NewsArticle, NewsComment, NewsAiUsage } from '../types';
import { supabase } from './supabase';

const STORAGE_KEYS = {
  CURRENT_USER: 'ecokid_current_user'
};

export const db = {
  getCurrentUser: (): User | null => {
    const user = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    return user ? JSON.parse(user) : null;
  },
  
  setCurrentUser: (user: User | null) => {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  },

  getUsers: async (): Promise<User[]> => {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    return data || [];
  },

  verifyUser: async (params: { name: string; grade: number; class: number; number: number; role: string }): Promise<User | null> => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('name', params.name)
      .eq('grade', params.grade)
      .eq('class', params.class)
      .eq('number', params.number)
      .eq('role', params.role)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  getTeacherUser: async (): Promise<User | null> => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'teacher')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  
  ensureStudentInitialized: async (user: User) => {
    if (user.role !== 'student') return;
    const { data: acc } = await supabase.from('accounts').select('*').eq('userId', user.userId).maybeSingle();
    if (!acc) {
      await supabase.from('accounts').insert({
        accountId: `acc_${user.userId}`,
        userId: user.userId,
        balance: 10
      });
    }
    const { data: usage } = await supabase.from('news_ai_usage').select('*').eq('userId', user.userId).maybeSingle();
    if (!usage) {
      await supabase.from('news_ai_usage').insert({
        userId: user.userId,
        free_usage_count: 1,
        last_reset_date: new Date().toISOString()
      });
    }
  },

  getArticles: async (): Promise<NewsArticle[]> => {
    const { data, error } = await supabase.from('news_articles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    return (data || []).map(article => {
      // keywords가 이미 배열이면 그대로 사용, 문자열이면 쉼표로 분리
      let keywordsArr: string[] = [];
      if (Array.isArray(article.keywords)) {
        keywordsArr = article.keywords;
      } else if (typeof article.keywords === 'string') {
        keywordsArr = article.keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
      }

      return {
        id: article.id,
        title: article.title,
        content: article.content,
        url: article.url,
        is_approved: article.is_approved ?? false,
        created_at: article.created_at,
        keywords: keywordsArr
      };
    });
  },

  addArticle: async (article: Omit<NewsArticle, 'id' | 'created_at' | 'is_approved'>): Promise<NewsArticle> => {
    // Supabase의 keywords 컬럼이 text[] (배열) 타입일 경우 자바스크립트 배열 그대로 전송해야 합니다.
    const payload = {
      title: article.title,
      content: article.content,
      url: article.url,
      is_approved: false,
      keywords: Array.isArray(article.keywords) ? article.keywords : (article.keywords ? [article.keywords] : [])
    };

    const { data, error } = await supabase.from('news_articles').insert(payload).select().single();
    if (error) throw error;
    
    return {
      ...data,
      is_approved: data.is_approved || false,
      keywords: Array.isArray(data.keywords) ? data.keywords : []
    };
  },

  approveArticle: async (articleId: string) => {
    const { error } = await supabase.from('news_articles').update({ is_approved: true }).eq('id', articleId);
    if (error) throw error;
  },

  resetArticles: async () => {
    const { error } = await supabase.rpc('reset_approved_articles_with_comments');
    if (error) throw error;
  },

  deleteArticle: async (articleId: string) => {
    const { error } = await supabase.rpc('delete_article_with_comments', { 
      target_article_id: articleId 
    });
    if (error) throw error;
  },

  getComments: async (articleId?: string): Promise<NewsComment[]> => {
    let query = supabase.from('news_comments').select('*').order('created_at', { ascending: false });
    if (articleId) {
      query = query.eq('article_id', articleId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  addComment: async (comment: NewsComment) => {
    const { error } = await supabase.from('news_comments').insert(comment);
    if (error) throw error;
  },

  getAccount: async (userId: string): Promise<Account | undefined> => {
    const { data, error } = await supabase.from('accounts').select('*').eq('userId', userId).maybeSingle();
    if (error) throw error;
    return data || undefined;
  },

  updateBalance: async (userId: string, amount: number) => {
    const { data: account } = await supabase.from('accounts').select('balance').eq('userId', userId).maybeSingle();
    if (account) {
      const newBalance = Number(account.balance) + amount;
      await supabase.from('accounts').update({ balance: newBalance }).eq('userId', userId);
    }
  },

  getAiUsage: async (userId: string): Promise<NewsAiUsage | undefined> => {
    const { data, error } = await supabase.from('news_ai_usage').select('*').eq('userId', userId).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    
    const now = new Date();
    const lastReset = new Date(data.last_reset_date);
    const isNewWeek = now.getTime() - lastReset.getTime() > 7 * 24 * 60 * 60 * 1000;

    if (isNewWeek) {
      const updated = { free_usage_count: 1, last_reset_date: now.toISOString() };
      await supabase.from('news_ai_usage').update(updated).eq('userId', userId);
      return { userId, ...updated };
    }
    return data;
  },

  useAi: async (userId: string) => {
    const { data: usage } = await supabase.from('news_ai_usage').select('free_usage_count').eq('userId', userId).maybeSingle();
    if (usage) {
      if (usage.free_usage_count > 0) {
        await supabase.from('news_ai_usage').update({ free_usage_count: usage.free_usage_count - 1 }).eq('userId', userId);
      } else {
        await db.updateBalance(userId, -3);
      }
    }
  }
};