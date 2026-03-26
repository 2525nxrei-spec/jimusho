/**
 * ジムショ UX向上 共通JavaScript
 * - ボタンフィードバック（ローディング表示）
 * - 二重送信防止
 * - 空入力バリデーション
 * - ブラウザバック時フォームデータ保持
 * - アクセシビリティ（aria-label自動付与）
 * - エラーメッセージ親切化
 */

(function() {
  'use strict';

  // ========================================
  // 1. aria-label 自動付与（アクセシビリティ）
  // ========================================
  function enhanceAccessibility() {
    // ラベル付きのinput/textareaにaria-labelを追加
    document.querySelectorAll('.field input, .field textarea, .field select, .auth-field input').forEach(function(el) {
      if (el.getAttribute('aria-label')) return; // 既に設定済みならスキップ
      // 親の.field内のlabel要素からテキストを取得
      var parent = el.closest('.field') || el.closest('.auth-field');
      if (parent) {
        var label = parent.querySelector('label');
        if (label) {
          el.setAttribute('aria-label', label.textContent.trim());
        }
      }
      // placeholderからのフォールバック
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

    // フォームにrole="form"とaria-labelを追加
    document.querySelectorAll('form').forEach(function(form) {
      if (!form.getAttribute('aria-label')) {
        // ページタイトルからフォームラベルを推定
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
  }

  // ========================================
  // 2. ボタンローディング＆二重送信防止
  // ========================================
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

          var origText = btn.textContent;
          btn.disabled = true;
          btn.classList.add('action-btn--loading', 'btn-gen--loading');

          // 元のonclickを実行
          try {
            new Function(origClick).call(btn);
          } catch(err) {
            console.error(err);
          }

          // 300ms後にリセット（計算系は即座に完了するため）
          setTimeout(function() {
            btn.disabled = false;
            btn.classList.remove('action-btn--loading', 'btn-gen--loading');
          }, 300);
        });
      }
    });

    // PDF/印刷ボタンにローディング
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
          // printはローディング不要、直接実行
          new Function(onclick).call(btn);
          return;
        }

        var origText = btn.textContent;
        btn.classList.add('btn--loading', 'btn-dl--loading');

        try {
          new Function(onclick).call(btn);
        } catch(err) {
          console.error(err);
        }

        setTimeout(function() {
          btn.classList.remove('btn--loading', 'btn-dl--loading');
        }, 1000);
      });
    });
  }

  // ========================================
  // 3. 空入力バリデーション
  // ========================================
  function validateRequiredFields(btn) {
    // ボタンの親フォームまたは.form-panel内のrequired/主要input
    var container = btn.closest('form') || btn.closest('.form-panel') || btn.closest('.panel');
    if (!container) return true;

    var hasError = false;
    // required属性のあるinput
    container.querySelectorAll('input[required], textarea[required]').forEach(function(input) {
      if (!input.value.trim()) {
        input.classList.add('ux-input-error');
        hasError = true;
        // 1回だけ揺れアニメーション
        input.style.animation = 'none';
        input.offsetHeight; // reflow
        input.style.animation = '';
      } else {
        input.classList.remove('ux-input-error');
      }
    });

    if (hasError) {
      // 最初のエラーフィールドにフォーカス
      var firstError = container.querySelector('.ux-input-error');
      if (firstError) {
        firstError.focus();
        showToast('入力必須の項目を入力してください');
      }
    }

    return !hasError;
  }

  // inputのエラー表示をリアルタイムで解除
  document.addEventListener('input', function(e) {
    if (e.target.classList.contains('ux-input-error') && e.target.value.trim()) {
      e.target.classList.remove('ux-input-error');
    }
  });

  // ========================================
  // 4. ブラウザバック時フォームデータ保持
  // ========================================
  function enableFormPersistence() {
    // bfcache対応: pageshow時にフォーム値を復元
    window.addEventListener('pageshow', function(e) {
      if (e.persisted) {
        // bfcacheから復元された場合、フォームの値はブラウザが保持済み
        // ただし動的に生成されたプレビューは再計算が必要
        document.querySelectorAll('.action-btn--primary, .btn-gen').forEach(function(btn) {
          // 自動再計算をトリガー
          var onclick = btn.getAttribute('onclick');
          if (onclick && (onclick.includes('calculate') || onclick.includes('update'))) {
            try { new Function(onclick).call(btn); } catch(err) {}
          }
        });

        // グローバルなupdate/calculate関数があれば呼ぶ
        if (typeof window.update === 'function') {
          try { window.update(); } catch(err) {}
        }
        if (typeof window.calculate === 'function') {
          try { window.calculate(); } catch(err) {}
        }
      }
    });

    // autocomplete="on"を全フォームに設定（ブラウザのフォーム復元を有効化）
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
    // auth.jsのapiRequest関数をラップしてエラーメッセージを改善
    if (typeof TOOLBOX_AUTH === 'undefined') return;

    // エラーメッセージの翻訳マップ
    var errorMap = {
      'Invalid credentials': 'メールアドレスまたはパスワードが正しくありません',
      'Invalid email or password': 'メールアドレスまたはパスワードが正しくありません',
      'User not found': 'メールアドレスまたはパスワードが正しくありません',
      'Email already registered': 'このメールアドレスは既に登録されています',
      'Email already exists': 'このメールアドレスは既に登録されています',
      'Password too short': 'パスワードは8文字以上で入力してください',
      'Invalid email': '正しいメールアドレスを入力してください',
      'Unauthorized': 'ログインの有効期限が切れました。再度ログインしてください',
      'Token expired': 'ログインの有効期限が切れました。再度ログインしてください',
      'Rate limit exceeded': 'リクエストが多すぎます。しばらく待ってからお試しください',
      'Internal server error': 'サーバーエラーが発生しました。しばらく待ってからお試しください',
      'リクエストに失敗しました': 'ネット接続を確認してください',
      'Failed to fetch': 'ネット接続を確認してください。接続が不安定な可能性があります',
      'NetworkError': 'ネット接続を確認してください',
      'Network request failed': 'ネット接続を確認してください',
    };

    // auth-errorの表示を監視して翻訳
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
    // showUpgradeGateが呼ばれた後のゲート要素を改善
    var observer = new MutationObserver(function(mutations) {
      var gate = document.getElementById('toolbox-pro-gate');
      if (gate) {
        // ゲート内のテキストをより親切に
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

  // グローバルに公開
  window.uxShowToast = showToast;

  // ========================================
  // 8. 認証フォームのスピナー強化
  // ========================================
  function enhanceAuthSubmit() {
    document.querySelectorAll('.auth-submit').forEach(function(btn) {
      if (btn.dataset.uxEnhanced) return;
      btn.dataset.uxEnhanced = 'true';

      // フォームsubmit時にスピナー表示
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
  // 9. 請求書等のフォーム保存通知改善
  // ========================================
  function enhanceSaveButtons() {
    // saveData系のalertをトーストに置き換え
    var origAlert = window.alert;
    window.alert = function(msg) {
      if (msg && (msg.includes('保存しました') || msg.includes('コピーしました'))) {
        showToast(msg);
      } else {
        origAlert.call(window, msg);
      }
    };
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
