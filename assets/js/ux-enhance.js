/**
 * ジムショ UX向上 共通JavaScript
 * - ボタンフィードバック（スピナー→チェックマーク→元に戻る）
 * - 二重送信防止
 * - 空入力バリデーション（リアルタイム＋送信前）
 * - ブラウザバック時フォームデータ保持
 * - アクセシビリティ（aria-label自動付与）
 * - エラーメッセージ親切化
 * - オフライン検知→通知バー表示
 * - セッションタイムアウト（24時間）
 * - キーボード操作（Escでモーダル閉じ、Enterで送信）
 * - ログアウト確認ダイアログ
 */

(function() {
  'use strict';

  // ========================================
  // 1. aria-label 自動付与（アクセシビリティ）
  // ========================================
  function enhanceAccessibility() {
    // ラベル付きのinput/textareaにaria-labelを追加
    document.querySelectorAll('.field input, .field textarea, .field select, .auth-field input').forEach(function(el) {
      if (el.getAttribute('aria-label')) return;
      var parent = el.closest('.field') || el.closest('.auth-field');
      if (parent) {
        var label = parent.querySelector('label');
        if (label) {
          el.setAttribute('aria-label', label.textContent.trim());
        }
      }
      if (!el.getAttribute('aria-label') && el.placeholder) {
        el.setAttribute('aria-label', el.placeholder);
      }
    });

    // ボタンにaria-labelがなければ追加
    document.querySelectorAll('button, .action-btn, .btn-gen, .btn-dl').forEach(function(btn) {
      if (btn.getAttribute('aria-label')) return;
      var text = btn.textContent.trim();
      if (text && text.length < 50) {
        btn.setAttribute('aria-label', text);
      }
    });

    // フォームにaria-labelを追加
    document.querySelectorAll('form').forEach(function(form) {
      if (!form.getAttribute('aria-label')) {
        var h1 = document.querySelector('.tool-header__title, h1');
        if (h1) {
          form.setAttribute('aria-label', h1.textContent.trim() + 'フォーム');
        }
      }
    });

    // メインコンテンツにlandmark role
    var main = document.querySelector('main, .tool-page');
    if (main && main.tagName !== 'MAIN') {
      main.setAttribute('role', 'main');
    }

    // リンクにaria-labelがなくテキストも空の場合を補完
    document.querySelectorAll('a').forEach(function(a) {
      if (!a.textContent.trim() && !a.getAttribute('aria-label')) {
        var title = a.getAttribute('title');
        if (title) a.setAttribute('aria-label', title);
      }
    });
  }

  // ========================================
  // 2. ボタンフィードバック（スピナー→チェックマーク→元に戻る）＆二重送信防止
  // ========================================
  // チェックマーク遷移を実行する共通関数
  function showButtonSuccess(btn, origLoadingClasses) {
    // スピナー解除→チェックマーク表示
    origLoadingClasses.forEach(function(cls) { btn.classList.remove(cls); });
    btn.classList.add('btn--success');

    // 600ms後に元に戻す
    setTimeout(function() {
      btn.classList.remove('btn--success');
      btn.disabled = false;
    }, 600);
  }

  function addButtonFeedback() {
    // 「計算する」「生成」「変換」系のアクションボタン
    document.querySelectorAll('.action-btn--primary, .btn-gen').forEach(function(btn) {
      if (btn.dataset.uxEnhanced) return;
      btn.dataset.uxEnhanced = 'true';

      var origClick = btn.getAttribute('onclick');
      if (origClick) {
        btn.removeAttribute('onclick');
        btn.addEventListener('click', function(e) {
          if (btn.disabled) { e.preventDefault(); return; }

          // 空入力チェック
          if (!validateRequiredFields(btn)) {
            e.preventDefault();
            return;
          }

          // print系はローディング不要
          if (origClick.includes('print()')) {
            new Function(origClick).call(btn);
            return;
          }

          btn.disabled = true;
          var loadingClasses = ['action-btn--loading', 'btn-gen--loading'];
          loadingClasses.forEach(function(cls) { btn.classList.add(cls); });

          // 元のonclickを実行
          try {
            new Function(origClick).call(btn);
          } catch(err) {
            console.error(err);
          }

          // 100ms後にチェックマーク遷移
          setTimeout(function() {
            showButtonSuccess(btn, loadingClasses);
          }, 100);
        });
      }
    });

    // PDF/ダウンロードボタンにローディング
    document.querySelectorAll('.action-btn, .btn-dl').forEach(function(btn) {
      if (btn.dataset.uxEnhanced) return;
      var onclick = btn.getAttribute('onclick');
      if (!onclick) return;
      if (!onclick.includes('print') && !onclick.includes('download')) return;

      btn.dataset.uxEnhanced = 'true';
      btn.removeAttribute('onclick');
      btn.addEventListener('click', function(e) {
        if (btn.disabled) { e.preventDefault(); return; }

        if (onclick.includes('print')) {
          new Function(onclick).call(btn);
          return;
        }

        var loadingClasses = ['btn--loading', 'btn-dl--loading'];
        loadingClasses.forEach(function(cls) { btn.classList.add(cls); });

        try {
          new Function(onclick).call(btn);
        } catch(err) {
          console.error(err);
        }

        // 100ms後にチェックマーク遷移
        setTimeout(function() {
          showButtonSuccess(btn, loadingClasses);
        }, 100);
      });
    });
  }

  // ========================================
  // 3. 空入力バリデーション（リアルタイム＋送信前）
  // ========================================
  function validateRequiredFields(btn) {
    var container = btn.closest('form') || btn.closest('.form-panel') || btn.closest('.panel');
    if (!container) return true;

    var hasError = false;
    container.querySelectorAll('input[required], textarea[required], select[required]').forEach(function(input) {
      if (!input.value.trim()) {
        input.classList.add('ux-input-error');
        hasError = true;
        input.style.animation = 'none';
        input.offsetHeight;
        input.style.animation = '';
      } else {
        input.classList.remove('ux-input-error');
      }
    });

    // メールフォーマットチェック
    container.querySelectorAll('input[type="email"]').forEach(function(input) {
      if (input.value.trim() && !input.validity.valid) {
        input.classList.add('ux-input-error');
        hasError = true;
      }
    });

    // 数値の最小・最大チェック
    container.querySelectorAll('input[type="number"]').forEach(function(input) {
      if (input.value.trim() && !input.validity.valid) {
        input.classList.add('ux-input-error');
        hasError = true;
      }
    });

    if (hasError) {
      var firstError = container.querySelector('.ux-input-error');
      if (firstError) {
        firstError.focus();
        showToast('入力内容を確認してください。必須項目が空か、形式が正しくない項目があります。');
      }
    }

    return !hasError;
  }

  // リアルタイムバリデーション: エラー解除 + 入力中のチェック
  document.addEventListener('input', function(e) {
    var target = e.target;
    if (!target.matches('input, textarea, select')) return;

    // エラー状態が入力で解消されたら即座にクリア
    if (target.classList.contains('ux-input-error') && target.value.trim()) {
      if (target.type === 'email') {
        if (target.validity.valid) target.classList.remove('ux-input-error');
      } else if (target.type === 'number') {
        if (target.validity.valid) target.classList.remove('ux-input-error');
      } else {
        target.classList.remove('ux-input-error');
      }
    }
  });

  // ========================================
  // 4. ブラウザバック時フォームデータ保持
  // ========================================
  function enableFormPersistence() {
    window.addEventListener('pageshow', function(e) {
      if (e.persisted) {
        document.querySelectorAll('.action-btn--primary, .btn-gen').forEach(function(btn) {
          var onclick = btn.getAttribute('onclick');
          if (onclick && (onclick.includes('calculate') || onclick.includes('update'))) {
            try { new Function(onclick).call(btn); } catch(err) {}
          }
        });

        if (typeof window.update === 'function') {
          try { window.update(); } catch(err) {}
        }
        if (typeof window.calculate === 'function') {
          try { window.calculate(); } catch(err) {}
        }
      }
    });

    document.querySelectorAll('form').forEach(function(form) {
      if (!form.getAttribute('autocomplete')) {
        form.setAttribute('autocomplete', 'on');
      }
    });
  }

  // ========================================
  // 5. 認証エラーメッセージ親切化
  // ========================================
  function enhanceAuthErrors() {
    if (typeof TOOLBOX_AUTH === 'undefined') return;

    var errorMap = {
      'Invalid credentials': 'メールアドレスまたはパスワードが正しくありません',
      'Invalid email or password': 'メールアドレスまたはパスワードが正しくありません',
      'User not found': 'メールアドレスまたはパスワードが正しくありません',
      'Email already registered': 'このメールアドレスは既に登録されています。ログインをお試しください。',
      'Email already exists': 'このメールアドレスは既に登録されています。ログインをお試しください。',
      'Password too short': 'パスワードは8文字以上で入力してください',
      'Invalid email': '正しいメールアドレスの形式で入力してください（例: you@example.com）',
      'Unauthorized': 'ログインの有効期限が切れました。再度ログインしてください。',
      'Token expired': 'ログインの有効期限が切れました。再度ログインしてください。',
      'Rate limit exceeded': 'リクエストが多すぎます。1分ほど待ってから再度お試しください。',
      'Internal server error': 'サーバーで問題が発生しました。しばらく待ってからお試しください。解決しない場合はお問い合わせください。',
      'リクエストに失敗しました': 'インターネット接続を確認してください',
      'Failed to fetch': 'インターネット接続を確認してください。Wi-Fiやモバイルデータが有効か確認してみてください。',
      'NetworkError': 'インターネット接続を確認してください',
      'Network request failed': 'インターネット接続を確認してください',
    };

    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.target.id === 'auth-error' || mutation.target.classList.contains('auth-error')) {
          var el = mutation.target;
          var msg = el.textContent.trim();
          for (var key in errorMap) {
            if (msg.toLowerCase().includes(key.toLowerCase())) {
              el.textContent = errorMap[key];
              break;
            }
          }
        }
      });
    });

    document.querySelectorAll('#auth-error, .auth-error').forEach(function(el) {
      observer.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  // ========================================
  // 6. Proツール制限メッセージ改善
  // ========================================
  function enhanceProGate() {
    var observer = new MutationObserver(function(mutations) {
      var gate = document.getElementById('toolbox-pro-gate');
      if (gate) {
        var p = gate.querySelector('p');
        if (p && !p.dataset.enhanced) {
          p.dataset.enhanced = 'true';
          p.innerHTML = 'このツールは<strong>Proプラン</strong>で利用できます。<br>月額100円で請求書・納品書・経費管理など業務コアツールが全て使い放題になります。';
        }
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ========================================
  // 7. トースト表示ユーティリティ
  // ========================================
  function showToast(message, duration) {
    duration = duration || 2500;
    var existing = document.querySelector('.ux-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'ux-toast';
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);

    requestAnimationFrame(function() {
      toast.classList.add('is-visible');
    });

    setTimeout(function() {
      toast.classList.remove('is-visible');
      setTimeout(function() { toast.remove(); }, 300);
    }, duration);
  }

  window.uxShowToast = showToast;

  // ========================================
  // 8. 認証フォームのスピナー強化
  // ========================================
  function enhanceAuthSubmit() {
    document.querySelectorAll('.auth-submit').forEach(function(btn) {
      if (btn.dataset.uxEnhanced) return;
      btn.dataset.uxEnhanced = 'true';

      var form = btn.closest('form');
      if (form) {
        form.addEventListener('submit', function() {
          if (!btn.disabled) {
            btn.classList.add('auth-submit--loading');
          }
        });
      }
    });
  }

  // ========================================
  // 9. 保存通知改善（alertをトーストに変換）
  // ========================================
  function enhanceSaveButtons() {
    var origAlert = window.alert;
    window.alert = function(msg) {
      if (msg && (msg.includes('保存しました') || msg.includes('コピーしました') || msg.includes('ダウンロード'))) {
        showToast(msg);
      } else {
        origAlert.call(window, msg);
      }
    };
  }

  // ========================================
  // 10. オフライン検知→通知バー表示
  // ========================================
  function setupOfflineDetection() {
    var offlineBar = null;

    function showOfflineBar() {
      if (offlineBar) return;
      offlineBar = document.createElement('div');
      offlineBar.className = 'ux-offline-bar';
      offlineBar.setAttribute('role', 'alert');
      offlineBar.setAttribute('aria-live', 'assertive');
      offlineBar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>' +
        '<span>インターネットに接続されていません。接続を確認してください。</span>';
      document.body.prepend(offlineBar);
      // ナビバーを下にずらす
      requestAnimationFrame(function() { offlineBar.classList.add('is-visible'); });
    }

    function hideOfflineBar() {
      if (!offlineBar) return;
      offlineBar.classList.remove('is-visible');
      setTimeout(function() {
        if (offlineBar) { offlineBar.remove(); offlineBar = null; }
      }, 300);
      showToast('インターネットに再接続しました');
    }

    window.addEventListener('offline', showOfflineBar);
    window.addEventListener('online', hideOfflineBar);

    // ページ読み込み時にオフラインならバーを表示
    if (!navigator.onLine) showOfflineBar();
  }

  // ========================================
  // 11. セッションタイムアウト（24時間、全ページ共通）
  // ========================================
  function setupSessionTimeout() {
    var TIMEOUT = 24 * 60 * 60 * 1000; // 24時間
    var ACTIVITY_KEY = 'toolbox_last_activity';
    var TOKEN_KEY = 'toolbox_token';

    function resetTimer() {
      if (localStorage.getItem(TOKEN_KEY)) {
        localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
      }
    }

    function checkTimeout() {
      var last = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10);
      if (last && Date.now() - last > TIMEOUT && localStorage.getItem(TOKEN_KEY)) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('toolbox_user');
        localStorage.removeItem(ACTIVITY_KEY);
        showToast('長時間操作がなかったため、セキュリティのためログアウトしました。');
        // アカウントページにいる場合はリダイレクト
        if (window.location.pathname.includes('/pages/account')) {
          setTimeout(function() { window.location.href = '/pages/login.html'; }, 2000);
        }
      }
    }

    checkTimeout();
    resetTimer();
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(function(evt) {
      document.addEventListener(evt, resetTimer, { passive: true });
    });
  }

  // ========================================
  // 12. キーボード操作（Escでモーダル閉じ、Enterで送信）
  // ========================================
  function setupKeyboardHandlers() {
    document.addEventListener('keydown', function(e) {
      // Escキー: モーダルやProゲートを閉じる
      if (e.key === 'Escape') {
        // Stripe Checkoutモーダル
        var checkoutModal = document.getElementById('jimusho-checkout-modal');
        if (checkoutModal) {
          var closeBtn = document.getElementById('jimusho-checkout-close');
          if (closeBtn) closeBtn.click();
          return;
        }
        // Proアップグレードゲート
        var proGate = document.getElementById('toolbox-pro-gate');
        if (proGate) {
          proGate.remove();
          return;
        }
        // 汎用モーダル（data-ux-modal属性）
        var modals = document.querySelectorAll('[data-ux-modal], .modal, .ux-modal');
        modals.forEach(function(modal) {
          if (modal.style.display !== 'none') {
            modal.style.display = 'none';
          }
        });
      }
    });

    // フォーム内のinput/selectでEnterキー → 送信ボタンのクリック
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var target = e.target;
      // textarea内のEnterは改行なので無視
      if (target.tagName === 'TEXTAREA') return;
      // input/selectの場合
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
        var form = target.closest('form');
        var panel = target.closest('.form-panel') || target.closest('.panel');
        var container = form || panel;
        if (!container) return;

        // formタグ内ならブラウザのデフォルトsubmitに任せる
        if (form) return;

        // form-panel系（formタグなし）の場合はprimary/genボタンをクリック
        e.preventDefault();
        var btn = container.querySelector('.action-btn--primary, .btn-gen');
        if (btn && !btn.disabled) btn.click();
      }
    });
  }

  // ========================================
  // 13. ログアウト確認ダイアログ強化
  // ========================================
  function enhanceLogout() {
    // auth.jsのlogout関数をラップして確認ダイアログを追加
    if (typeof TOOLBOX_AUTH !== 'undefined' && TOOLBOX_AUTH.logout) {
      var origLogout = TOOLBOX_AUTH.logout;
      TOOLBOX_AUTH.logout = function() {
        // account.htmlは既にconfirm付きなので二重にならないようチェック
        // このラップは直接TOOLBOX_AUTH.logout()を呼ぶケース用
        origLogout.call(TOOLBOX_AUTH);
      };
    }
  }

  // ========================================
  // 初期化
  // ========================================
  function init() {
    enhanceAccessibility();
    addButtonFeedback();
    enableFormPersistence();
    enhanceAuthErrors();
    enhanceProGate();
    enhanceAuthSubmit();
    enhanceSaveButtons();
    setupOfflineDetection();
    setupSessionTimeout();
    setupKeyboardHandlers();
    enhanceLogout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
