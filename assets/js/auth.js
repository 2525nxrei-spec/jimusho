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
  }

  function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
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

  function isLoggedIn() {
    return !!getToken();
  }

  function isPro() {
    const user = getUser();
    return user && user.plan === 'pro';
  }

  // --- API通信 ---

  async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || 'リクエストに失敗しました');
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
    window.location.href = '/';
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
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
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
  function checkToolAccess() {
    const path = window.location.pathname;
    if (!isProTool(path)) return true; // Freeツールはアクセス可

    if (isPro()) return true; // ProユーザーはOK

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
          <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:8px;color:#1d1d1f">Pro限定ツール</h2>
          <p style="font-size:0.88rem;color:#636366;line-height:1.7;margin-bottom:24px">このツールはジムショ Proプラン（月額100円）でご利用いただけます。<br>請求書・納品書・経費管理など業務コアツールが全て使い放題。</p>
          <a href="/pages/pricing.html" style="display:inline-block;background:#0071e3;color:#fff;font-size:0.88rem;font-weight:600;padding:12px 28px;border-radius:980px;text-decoration:none;margin-bottom:12px">Proにアップグレード</a>
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
