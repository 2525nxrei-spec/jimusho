/**
 * ジムショ — フロントエンド認証ライブラリ
 * JWT管理・ログイン状態チェック・Pro判定
 */

const TOOLBOX_AUTH = (() => {
  // API_BASE_URL: Pages Functionsは同一オリジンなので空文字
  const API_BASE = '';
  const TOKEN_KEY = 'toolbox_token';
  const USER_KEY = 'toolbox_user';

  // --- トークン管理 ---

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
    // サーバーサイドのProツールガード用にCookieにも保存
    // Secure: HTTPS環境でのみCookie送信（HTTP経由での漏洩防止）
    // SameSite=Lax: クロスサイトリクエストでのCookie送信を制限
    document.cookie = TOKEN_KEY + '=' + token + '; path=/; max-age=' + (30 * 86400) + '; SameSite=Lax; Secure';
  }

  function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Cookieも削除
    document.cookie = TOKEN_KEY + '=; path=/; max-age=0; SameSite=Lax; Secure';
  }

  function getUser() {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // JWTペイロードをデコード（Base64URL → JSON）
  function decodeJWTPayload(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function isLoggedIn() {
    const token = getToken();
    if (!token) return false;
    // JWTのexp（有効期限）を検証
    const payload = decodeJWTPayload(token);
    if (!payload || !payload.exp) {
      removeToken();
      return false;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      // 期限切れ → トークン削除
      removeToken();
      return false;
    }
    return true;
  }

  function isPro() {
    const user = getUser();
    return user && user.plan === 'pro';
  }

  // --- API通信 ---

  // エラーメッセージを親切な日本語に変換
  function friendlyError(msg, status) {
    if (!msg) msg = '';
    const lower = msg.toLowerCase();
    // 認証エラー
    if (status === 401 || lower.includes('invalid credentials') || lower.includes('invalid email or password') || lower.includes('user not found')) {
      return 'メールアドレスまたはパスワードが正しくありません';
    }
    if (lower.includes('email already')) return 'このメールアドレスは既に登録されています';
    if (lower.includes('password too short') || lower.includes('password')) return 'パスワードは8文字以上で入力してください';
    if (lower.includes('invalid email')) return '正しいメールアドレスを入力してください';
    if (status === 401 || lower.includes('unauthorized') || lower.includes('token expired')) return 'ログインの有効期限が切れました。再度ログインしてください';
    if (status === 429 || lower.includes('rate limit')) return 'リクエストが多すぎます。しばらく待ってからお試しください';
    if (status >= 500) return 'サーバーエラーが発生しました。しばらく待ってからお試しください';
    return msg || 'エラーが発生しました。しばらく待ってからお試しください';
  }

  async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, options);
    } catch (networkErr) {
      throw new Error('ネット接続を確認してください。接続が不安定な可能性があります');
    }

    const data = await response.json();

    if (!response.ok || data.ok === false) {
      throw new Error(friendlyError(data.error, response.status));
    }
    return data;
  }

  async function register(email, password, displayName) {
    const data = await apiRequest('/api/auth/register', 'POST', {
      email, password, display_name: displayName,
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function login(email, password) {
    const data = await apiRequest('/api/auth/login', 'POST', { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    removeToken();
    // bfcache(ブラウザバックキャッシュ)を無効化してログアウト後に戻れないようにする
    window.location.replace('/');
  }

  async function fetchMe() {
    try {
      const data = await apiRequest('/api/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      removeToken();
      return null;
    }
  }

  async function startCheckout() {
    const data = await apiRequest('/api/stripe/checkout', 'POST');
    // リダイレクト型: サーバーから返されたStripe Checkout URLに遷移
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error('決済セッションの作成に失敗しました。しばらく待ってからお試しください');
    }
  }

  async function openPortal() {
    const data = await apiRequest('/api/stripe/portal', 'POST');
    if (data.portal_url) {
      window.location.href = data.portal_url;
    }
  }

  async function getBillingStatus() {
    return await apiRequest('/api/billing/status');
  }

  // --- Pro制限: ツールページでの利用制限チェック ---

  // Proツール一覧（hrefのパスで判定）
  const PRO_TOOLS = [
    'invoice-generator',
    'delivery-note',
    'receipt-generator',
    'estimate-generator',
    'expense-memo',
    'revenue-tracker',
    'take-home-pay',
    'sales-email',
    'work-log',
  ];

  function isProTool(toolPath) {
    return PRO_TOOLS.some(t => toolPath.includes(t));
  }

  // ツールページで呼び出し: Proツールに非Pro userがアクセスした場合にゲート表示
  // プラン情報はDBから最新を取得（JWTのplanフィールドに依存しない）
  // 重要: この関数はasyncなので、呼び出し側で必ずawaitすること
  async function checkToolAccess() {
    const path = window.location.pathname;
    if (!isProTool(path)) return true; // Freeツールはアクセス可

    // チェック中はツール本体を非表示にする（無認証コンテンツの一瞬表示を防止）
    const mainEl = document.querySelector('main') || document.querySelector('.tool-container') || document.querySelector('.container');
    if (mainEl) mainEl.style.visibility = 'hidden';

    // ローカルキャッシュで即時判定（UX向上）
    if (isPro()) {
      if (mainEl) mainEl.style.visibility = '';
      return true;
    }

    // DBから最新のプラン情報を取得して再判定
    if (isLoggedIn()) {
      try {
        const user = await fetchMe();
        if (user && user.plan === 'pro') {
          if (mainEl) mainEl.style.visibility = '';
          return true;
        }
      } catch {
        // fetchMe失敗時はローカルの判定を使う
      }
    }

    // 未ログインまたはFreeユーザー → アップグレード案内を表示
    showUpgradeGate();
    return false;
  }

  function showUpgradeGate() {
    const gate = document.createElement('div');
    gate.id = 'toolbox-pro-gate';
    gate.innerHTML = `
      <div style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px">
        <div style="background:#fff;border-radius:16px;padding:40px 32px;max-width:440px;width:100%;text-align:center;font-family:'Plus Jakarta Sans','Noto Sans JP',sans-serif">
          <div style="width:48px;height:48px;border-radius:12px;background:#dbeafe;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:8px;color:#1d1d1f">このツールはProプランで利用できます</h2>
          <p style="font-size:0.88rem;color:#636366;line-height:1.7;margin-bottom:24px">月額100円で請求書・納品書・経費管理など<br>業務コアツールが全て使い放題になります。</p>
          <a href="/pages/pricing.html" style="display:inline-block;background:#0071e3;color:#fff;font-size:0.88rem;font-weight:600;padding:12px 28px;border-radius:980px;text-decoration:none;margin-bottom:12px;transition:opacity 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">Proにアップグレード（月額100円）</a>
          <br>
          <a href="/" style="font-size:0.8rem;color:#8e8e93;text-decoration:none">無料ツールに戻る</a>
        </div>
      </div>
    `;
    document.body.appendChild(gate);
  }

  // --- ナビバーUI更新 ---

  function updateNavUI() {
    const user = getUser();
    const navLinks = document.querySelector('.nav__links');
    if (!navLinks) return;

    // 既存のアカウントリンクがあれば削除
    const existing = navLinks.querySelector('.nav__auth-link');
    if (existing) existing.remove();

    const link = document.createElement('a');
    link.className = 'nav__link nav__auth-link';

    if (user) {
      link.href = '/pages/account.html';
      link.textContent = user.plan === 'pro' ? 'Pro' : 'アカウント';
      if (user.plan === 'pro') {
        link.style.cssText = 'color:#0071e3;font-weight:700';
      }
    } else {
      link.href = '/pages/pricing.html';
      link.textContent = 'ログイン';
    }

    // ドロップダウンの前に挿入
    const dropdown = navLinks.querySelector('.nav__dropdown');
    if (dropdown) {
      navLinks.insertBefore(link, dropdown);
    } else {
      navLinks.appendChild(link);
    }
  }

  return {
    getToken, getUser, isLoggedIn, isPro,
    register, login, logout, fetchMe,
    startCheckout, openPortal, getBillingStatus,
    isProTool, checkToolAccess, updateNavUI,
    PRO_TOOLS,
  };
})();
