// かんたん請求書 - フロントエンドSPA（バニラJS）
(function () {
  'use strict';

  const app = document.getElementById('app');
  let STATE = {
    settings: null,
    customers: [],
  };

  // ---------- ユーティリティ ----------
  function yen(n) {
    n = Math.round(Number(n) || 0);
    return '¥' + n.toLocaleString('ja-JP');
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function todayStr() {
    return dayjs().format('YYYY-MM-DD');
  }

  // 仕入れ書類のサムネイル/プレビューHTML（画像はimg、PDFはアイコン+リンク）
  function mediaThumbHtml(purchase, sizeClass) {
    const url = `/api/purchases/${purchase.id}/image`;
    if (purchase.image_content_type === 'application/pdf') {
      return `<a href="${url}" target="_blank" class="${sizeClass} rounded-lg border bg-red-50 flex flex-col items-center justify-center text-red-500 shrink-0">
        <i class="fas fa-file-pdf text-2xl"></i>
      </a>`;
    }
    return `<img src="${url}" class="${sizeClass} object-cover rounded-lg border shrink-0" />`;
  }

  function mediaPreviewHtml(purchase) {
    const url = `/api/purchases/${purchase.id}/image`;
    if (purchase.image_content_type === 'application/pdf') {
      return `<a href="${url}" target="_blank" class="w-full h-40 rounded-lg border mb-4 bg-red-50 flex flex-col items-center justify-center text-red-500 hover:bg-red-100">
        <i class="fas fa-file-pdf text-5xl mb-2"></i>
        <span class="text-sm font-bold">PDFを開く</span>
      </a>`;
    }
    return `<img src="${url}" class="w-full max-h-64 object-contain rounded-lg border mb-4 bg-gray-50 cursor-zoom-in" onclick="openImageModal(this.src)" />`;
  }

  function showToast(msg, isError) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (isError) el.style.background = '#dc2626';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function showLoading(show) {
    let el = document.getElementById('global-loading');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'global-loading';
        el.className = 'fixed inset-0 bg-black/20 flex items-center justify-center z-50';
        el.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(el);
      }
    } else if (el) {
      el.remove();
    }
  }

  async function api(method, url, data, opts) {
    opts = opts || {};
    try {
      if (!opts.silent) showLoading(true);
      const res = await axios({ method, url, data, headers: opts.headers });
      return res.data;
    } catch (e) {
      if (e.response && e.response.status === 401) {
        location.hash = '#/login';
        throw e;
      }
      const msg = (e.response && e.response.data && e.response.data.error) || 'エラーが発生しました';
      showToast(msg, true);
      throw e;
    } finally {
      if (!opts.silent) showLoading(false);
    }
  }

  // ---------- ドラフト保存・復元ユーティリティ ----------
  function draftKey(routeId) { return 'draft_' + routeId; }
  function saveDraft(routeId, data) {
    try { sessionStorage.setItem(draftKey(routeId), JSON.stringify(data)); } catch(e) {}
  }
  function loadDraft(routeId) {
    try { const v = sessionStorage.getItem(draftKey(routeId)); return v ? JSON.parse(v) : null; } catch(e) { return null; }
  }
  function clearDraft(routeId) {
    try { sessionStorage.removeItem(draftKey(routeId)); } catch(e) {}
  }
  // フォームフィールドの値を自動保存するヘルパー
  function autoSaveDraft(routeId, getDataFn, intervalMs) {
    intervalMs = intervalMs || 800;
    const timer = setInterval(() => {
      try { saveDraft(routeId, getDataFn()); } catch(e) {}
    }, intervalMs);
    return timer;
  }

  // ---------- ルーター ----------
  const routes = [];
  function route(pattern, handler) {
    routes.push({ pattern, handler });
  }

  function matchRoute(hash) {
    for (const r of routes) {
      const keys = [];
      const regexStr = r.pattern.replace(/:[^/]+/g, (m) => {
        keys.push(m.slice(1));
        return '([^/]+)';
      });
      const regex = new RegExp('^' + regexStr + '(?:\\?.*)?$');
      const m = hash.match(regex);
      if (m) {
        const params = {};
        keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        const queryStr = hash.split('?')[1];
        const query = {};
        if (queryStr) {
          new URLSearchParams(queryStr).forEach((v, k) => (query[k] = v));
        }
        return { handler: r.handler, params, query };
      }
    }
    return null;
  }

  async function render() {
    let hash = location.hash.replace(/^#/, '') || '/';

    // 認証状態確認
    const authStatus = await api('get', '/api/auth/status', null, { silent: true }).catch(() => ({ needsSetup: false, loggedIn: false }));

    if (authStatus.needsSetup) {
      if (hash !== '/setup') {
        location.hash = '#/setup';
        return;
      }
    } else if (!authStatus.loggedIn) {
      if (hash !== '/login') {
        location.hash = '#/login';
        return;
      }
    } else if (hash === '/login' || hash === '/setup') {
      location.hash = '#/';
      return;
    }

    const matched = matchRoute(hash);
    if (!matched) {
      app.innerHTML = '<div class="p-8 text-center text-gray-500">ページが見つかりません</div>';
      return;
    }

    if (hash !== '/login' && hash !== '/setup') {
      await renderNav(hash);
    }

    try {
      await matched.handler(matched.params, matched.query);
    } catch (e) {
      console.error(e);
    }
  }

  function contentContainer() {
    let el = document.getElementById('page-content');
    if (!el) {
      el = document.createElement('div');
      el.id = 'page-content';
      el.className = 'max-w-3xl mx-auto px-4 py-4';
      app.appendChild(el);
    }
    return el;
  }

  async function renderNav(currentHash) {
    let nav = document.getElementById('top-nav');
    // TOPの3つの主要メニュー（仕入れを取り込む / 請求先（お客様）一覧 / 設定）を常にヘッダーに表示
    const navItems = [
      { href: '#/purchase/capture', icon: 'fa-camera', label: '仕入取込', match: /^\/purchase\/capture/ },
      { href: '#/invoices', icon: 'fa-file-invoice', label: '請求書', match: /^\/invoice/ },
      { href: '#/customers', icon: 'fa-users', label: 'お客様', match: /^\/customers/ },
      { href: '#/settings', icon: 'fa-cog', label: '設定', match: /^\/settings/ },
    ];
    // 請求書未作成の仕入れ件数を取得
    let unassignedCount = 0;
    try {
      const unassigned = await api('get', '/api/purchases?unassigned=1', null, { silent: true });
      unassignedCount = Array.isArray(unassigned) ? unassigned.length : 0;
    } catch(e) {}
    const bannerHtml = unassignedCount > 0 ? `
      <a href="#/purchases/unassigned" class="no-print block bg-amber-50 border-b border-amber-200 hover:bg-amber-100 transition-colors">
        <div class="max-w-3xl mx-auto px-4 py-1.5 flex items-center gap-2">
          <i class="fas fa-exclamation-triangle text-amber-500 text-sm"></i>
          <span class="text-sm text-amber-800 font-bold">請求書未作成の仕入れ ${unassignedCount}件</span>
          <i class="fas fa-chevron-right text-amber-400 text-xs ml-auto"></i>
        </div>
      </a>` : '';
    const navHtml = `
      <header id="top-nav" class="no-print bg-white border-b sticky top-0 z-40 shadow-sm">
        <div class="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between">
          <a href="#/" class="font-bold text-blue-600 shrink-0 whitespace-nowrap flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-blue-50 active:bg-blue-100 transition-colors cursor-pointer select-none">
            <img src="/static/logo.png" alt="logo" class="w-9 h-9 object-contain drop-shadow-sm" />
            <span class="text-base tracking-wide">かんたん請求書</span>
          </a>
          <div class="flex gap-0.5">
            ${navItems.map((n) => `
              <a href="${n.href}" class="flex flex-col items-center justify-center px-2 py-1 rounded-lg ${n.match.test('/' + currentHash.replace(/^\//, '').split('?')[0]) ? 'text-blue-600 bg-blue-50 font-bold' : 'text-gray-500 hover:text-blue-600'}" title="${n.label}">
                <i class="fas ${n.icon} text-base"></i>
                <span class="text-[10px] mt-0.5 whitespace-nowrap">${n.label}</span>
              </a>`).join('')}
          </div>
        </div>
        ${bannerHtml}
      </header>`;
    if (!nav) {
      app.innerHTML = navHtml + '<div id="page-content" class="max-w-3xl mx-auto px-4 py-4"></div>';
    } else {
      const content = document.getElementById('page-content');
      if (content) content.innerHTML = '';
      else app.innerHTML = navHtml + '<div id="page-content" class="max-w-3xl mx-auto px-4 py-4"></div>';
    }
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', render);

  // ==================================================
  // ログイン / 初期セットアップ
  // ==================================================
  route('/setup', async () => {
    app.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-4">
        <div class="card p-8 w-full max-w-sm">
          <h1 class="text-xl font-bold mb-2 text-center"><i class="fas fa-file-invoice text-blue-600 mr-2"></i>初期設定</h1>
          <p class="text-sm text-gray-500 mb-6 text-center">パスワードを設定してください</p>
          <input id="setup-pw" type="password" placeholder="パスワード（4文字以上）" class="w-full border rounded-lg p-3 mb-3 big-tap" />
          <input id="setup-pw2" type="password" placeholder="もう一度入力" class="w-full border rounded-lg p-3 mb-4 big-tap" />
          <button id="setup-btn" class="w-full btn-primary rounded-lg py-3 font-bold big-tap">設定してはじめる</button>
        </div>
      </div>`;
    document.getElementById('setup-btn').onclick = async () => {
      const pw = document.getElementById('setup-pw').value;
      const pw2 = document.getElementById('setup-pw2').value;
      if (pw !== pw2) return showToast('パスワードが一致しません', true);
      await api('post', '/api/auth/setup', { password: pw });
      showToast('設定しました');
      location.hash = '#/';
      render();
    };
  });

  route('/login', async () => {
    app.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-4">
        <div class="card p-8 w-full max-w-sm">
          <h1 class="text-xl font-bold mb-6 text-center"><i class="fas fa-file-invoice text-blue-600 mr-2"></i>かんたん請求書</h1>
          <input id="login-pw" type="password" placeholder="パスワード" class="w-full border rounded-lg p-3 mb-4 big-tap" />
          <button id="login-btn" class="w-full btn-primary rounded-lg py-3 font-bold big-tap">ログイン</button>
        </div>
      </div>`;
    const doLogin = async () => {
      const pw = document.getElementById('login-pw').value;
      await api('post', '/api/auth/login', { password: pw });
      location.hash = '#/';
      render();
    };
    document.getElementById('login-btn').onclick = doLogin;
    document.getElementById('login-pw').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
  });

  // ==================================================
  // ホーム
  // ==================================================
  route('/', async () => {
    const el = contentContainer();
    const [customers, purchasesUnassigned] = await Promise.all([
      api('get', '/api/customers'),
      api('get', '/api/purchases?unassigned=1'),
    ]);

    el.innerHTML = `
      <div class="grid grid-cols-1 gap-4">
        <a href="#/purchase/capture" class="card p-6 flex items-center gap-4 big-tap hover:shadow-md">
          <div class="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl"><i class="fas fa-camera"></i></div>
          <div>
            <div class="font-bold text-lg">仕入れを取り込む</div>
            <div class="text-sm text-gray-500">見積・請求書・レシートを撮影/選択</div>
          </div>
        </a>
        <a href="#/invoices" class="card p-6 flex items-center gap-4 big-tap hover:shadow-md">
          <div class="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-2xl"><i class="fas fa-file-invoice"></i></div>
          <div>
            <div class="font-bold text-lg">請求書一覧</div>
            <div class="text-sm text-gray-500">下書き・発行済みの請求書を管理</div>
          </div>
        </a>
        <a href="#/customers" class="card p-6 flex items-center gap-4 big-tap hover:shadow-md">
          <div class="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-2xl"><i class="fas fa-users"></i></div>
          <div>
            <div class="font-bold text-lg">請求先（お客様）一覧</div>
            <div class="text-sm text-gray-500">${customers.length}件の請求先（お客様）を管理中</div>
          </div>
        </a>
        ${purchasesUnassigned.length ? `
        <a href="#/purchases/unassigned" class="card p-6 flex items-center gap-4 big-tap hover:shadow-md border-2 border-amber-300">
          <div class="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-2xl"><i class="fas fa-exclamation-triangle"></i></div>
          <div>
            <div class="font-bold text-lg">請求書未作成の仕入れ ${purchasesUnassigned.length}件</div>
            <div class="text-sm text-gray-500">請求書をまだ作成していない仕入れがあります</div>
          </div>
        </a>` : ''}
      </div>`;
  });

  // ==================================================
  // 請求先（お客様）一覧
  // ==================================================
  route('/customers', async () => {
    const el = contentContainer();
    const customers = await api('get', '/api/customers');
    el.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">請求先（お客様）一覧</h2>
        <button id="add-customer-btn" class="btn-primary rounded-lg px-4 py-2 font-bold"><i class="fas fa-plus mr-1"></i>追加</button>
      </div>
      <div class="space-y-3">
        ${customers.length === 0 ? '<div class="text-center text-gray-400 py-12">まだ請求先（お客様）が登録されていません</div>' : ''}
        ${customers.map((c) => `
          <div class="card p-4 flex justify-between items-center hover:shadow-md">
            <a href="#/customers/${c.id}" class="flex-1 flex justify-between items-center">
              <div>
                <div class="font-bold text-lg">${esc(c.name)}</div>
                <div class="text-sm text-gray-500">${esc(c.address || '')}</div>
              </div>
              <div class="text-right text-sm text-gray-400 mr-3">
                <div>請求書 ${c.invoice_count}件</div>
                <div>仕入れ ${c.purchase_count}件</div>
              </div>
            </a>
            <button class="del-customer-btn text-red-400 hover:text-red-600 p-2" data-id="${c.id}" data-name="${esc(c.name)}"><i class="fas fa-trash"></i></button>
          </div>`).join('')}
      </div>
      <div id="customer-modal-root"></div>`;

    document.getElementById('add-customer-btn').onclick = () => openCustomerModal();
    document.querySelectorAll('.del-customer-btn').forEach((btn) => {
      btn.onclick = async (e) => {
        e.preventDefault();
        const name = btn.dataset.name;
        if (!confirm(`「${name}」を削除しますか？\n関連する請求書・仕入れは削除されません。`)) return;
        await api('delete', `/api/customers/${btn.dataset.id}`);
        showToast('削除しました');
        render();
      };
    });
  });

  function openCustomerModal(customer, onSaved) {
    // customer-modal-rootが存在しない場合（未設定一覧など）は動的に生成
    let root = document.getElementById('customer-modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'customer-modal-root';
      document.body.appendChild(root);
    }
    const isEdit = !!customer;
    root.innerHTML = `
      <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" id="cust-modal-bg">
        <div class="card p-6 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
          <h3 class="font-bold text-lg mb-4">${isEdit ? '請求先（お客様）編集' : '請求先（お客様）追加'}</h3>
          <label class="text-sm text-gray-500">お名前・会社名 *</label>
          <input id="cust-name" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(customer?.name || '')}" />
          <label class="text-sm text-gray-500">郵便番号</label>
          <input id="cust-postal" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(customer?.postal_code || '')}" />
          <label class="text-sm text-gray-500">住所</label>
          <input id="cust-address" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(customer?.address || '')}" />
          <label class="text-sm text-gray-500">電話番号</label>
          <input id="cust-phone" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(customer?.phone || '')}" />
          <label class="text-sm text-gray-500">メモ</label>
          <textarea id="cust-memo" class="w-full border rounded-lg p-3 mb-4">${esc(customer?.memo || '')}</textarea>
          <div class="flex gap-3">
            <button id="cust-cancel" class="flex-1 btn-secondary rounded-lg py-3 font-bold big-tap">キャンセル</button>
            <button id="cust-save" class="flex-1 btn-primary rounded-lg py-3 font-bold big-tap">保存</button>
          </div>
        </div>
      </div>`;

    document.getElementById('cust-cancel').onclick = () => (root.innerHTML = '');
    document.getElementById('cust-modal-bg').onclick = (e) => { if (e.target.id === 'cust-modal-bg') root.innerHTML = ''; };
    document.getElementById('cust-postal').addEventListener('input', () => lookupPostalCode('cust-postal', 'cust-address'));
    document.getElementById('cust-save').onclick = async () => {
      const data = {
        name: document.getElementById('cust-name').value.trim(),
        postal_code: document.getElementById('cust-postal').value.trim(),
        address: document.getElementById('cust-address').value.trim(),
        phone: document.getElementById('cust-phone').value.trim(),
        memo: document.getElementById('cust-memo').value.trim(),
      };
      if (!data.name) return showToast('お名前を入力してください', true);
      if (isEdit) {
        await api('put', `/api/customers/${customer.id}`, data);
        showToast('更新しました');
        root.innerHTML = '';
        if (onSaved) onSaved({ ...customer, ...data });
        else render();
      } else {
        const newCustomer = await api('post', '/api/customers', data);
        showToast('追加しました');
        root.innerHTML = '';
        if (onSaved) onSaved(newCustomer);
        else render();
      }
    };
  }

  // 郵便番号から住所を自動補完（zipcloud API使用）
  async function lookupPostalCode(postalInputId, addressInputId) {
    const postal = document.getElementById(postalInputId)?.value.replace(/[^0-9]/g, '');
    if (postal.length !== 7) return;
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postal}`);
      const json = await res.json();
      if (json.results && json.results[0]) {
        const r = json.results[0];
        const addr = (r.address1 || '') + (r.address2 || '') + (r.address3 || '');
        const addrEl = document.getElementById(addressInputId);
        if (addrEl && !addrEl.value) addrEl.value = addr;
        else if (addrEl) addrEl.value = addr;
      }
    } catch(e) {}
  }

  // 請求書作成画面内で請求先（お客様）を新規登録するモーダル
  function openInvoiceCustomerModal() {
    const root = document.getElementById('inv-customer-modal-root');
    if (!root) return;
    root.innerHTML = `
      <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" id="inv-cust-modal-bg">
        <div class="card p-6 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
          <h3 class="font-bold text-lg mb-4">請求先（お客様）を新規登録</h3>
          <label class="text-sm text-gray-500">お名前・会社名 *</label>
          <input id="inv-cust-name" class="w-full border rounded-lg p-3 mb-3 big-tap" placeholder="例：株式会社○○" />
          <label class="text-sm text-gray-500">郵便番号</label>
          <input id="inv-cust-postal" class="w-full border rounded-lg p-3 mb-3 big-tap" />
          <label class="text-sm text-gray-500">住所</label>
          <input id="inv-cust-address" class="w-full border rounded-lg p-3 mb-3 big-tap" />
          <label class="text-sm text-gray-500">電話番号</label>
          <input id="inv-cust-phone" class="w-full border rounded-lg p-3 mb-3 big-tap" />
          <label class="text-sm text-gray-500">メモ</label>
          <textarea id="inv-cust-memo" class="w-full border rounded-lg p-3 mb-4"></textarea>
          <div class="flex gap-3">
            <button id="inv-cust-cancel" class="flex-1 btn-secondary rounded-lg py-3 font-bold big-tap">キャンセル</button>
            <button id="inv-cust-save" class="flex-1 btn-primary rounded-lg py-3 font-bold big-tap">登録して選択</button>
          </div>
        </div>
      </div>`;
    document.getElementById('inv-cust-cancel').onclick = () => (root.innerHTML = '');
    document.getElementById('inv-cust-modal-bg').onclick = (e) => { if (e.target.id === 'inv-cust-modal-bg') root.innerHTML = ''; };
    document.getElementById('inv-cust-postal').addEventListener('input', () => lookupPostalCode('inv-cust-postal', 'inv-cust-address'));
    document.getElementById('inv-cust-save').onclick = async () => {
      const name = document.getElementById('inv-cust-name').value.trim();
      if (!name) return showToast('お名前を入力してください', true);
      const data = {
        name,
        postal_code: document.getElementById('inv-cust-postal').value.trim(),
        address: document.getElementById('inv-cust-address').value.trim(),
        phone: document.getElementById('inv-cust-phone').value.trim(),
        memo: document.getElementById('inv-cust-memo').value.trim(),
      };
      const result = await api('post', '/api/customers', data);
      // selectに追加して選択状態にする
      const sel = document.getElementById('inv-customer');
      const opt = document.createElement('option');
      opt.value = result.id;
      opt.textContent = name;
      sel.appendChild(opt);
      sel.value = result.id;
      sel.dispatchEvent(new Event('change'));
      root.innerHTML = '';
      showToast('登録しました');
    };
  }

  // ==================================================
  // お客さん詳細
  // ==================================================
  route('/customers/:id', async (params) => {
    const el = contentContainer();
    const { customer, purchases, invoices } = await api('get', `/api/customers/${params.id}`);

    el.innerHTML = `
      <div class="mb-4">
        <a href="#/customers" class="text-blue-600 text-sm"><i class="fas fa-chevron-left mr-1"></i>請求先（お客様）一覧へ</a>
      </div>
      <div class="card p-5 mb-4">
        <div class="flex justify-between items-start">
          <div>
            <div class="font-bold text-xl">${esc(customer.name)}</div>
            <div class="text-sm text-gray-500 mt-1">${esc(customer.address || '')}</div>
            <div class="text-sm text-gray-500">${esc(customer.phone || '')}</div>
          </div>
          <div class="flex gap-2">
            <button id="edit-cust-btn" class="btn-secondary rounded-lg px-3 py-2 text-sm"><i class="fas fa-pen"></i></button>
            <button id="del-cust-btn" class="btn-danger rounded-lg px-3 py-2 text-sm"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-6">
        <a href="#/purchase/capture?customer_id=${customer.id}" class="btn-primary rounded-lg py-3 font-bold big-tap flex items-center justify-center gap-1"><i class="fas fa-camera"></i>仕入れ取込</a>
        <a href="#/invoice/new?customer_id=${customer.id}" class="rounded-lg py-3 font-bold big-tap text-white flex items-center justify-center gap-1" style="background:#059669"><i class="fas fa-file-invoice"></i>請求書作成</a>
      </div>

      <h3 class="font-bold mb-2 mt-6">請求書 (${invoices.length})</h3>
      <div class="space-y-2 mb-6">
        ${invoices.length === 0 ? '<div class="text-gray-400 text-sm py-2">まだありません</div>' : ''}
        ${invoices.map((i) => `
          <a href="#/invoice/${i.id}" class="card p-3 flex justify-between items-center hover:shadow-md">
            <div>
              <div class="font-bold">${esc(i.invoice_number || '(下書き)')}</div>
              <div class="text-xs text-gray-500">${esc(i.issue_date || '')} ・ ${statusLabel(i.status)}</div>
            </div>
            <div class="font-bold text-lg">${yen(i.total_amount)}</div>
          </a>`).join('')}
      </div>

      <h3 class="font-bold mb-2">取り込んだ仕入れ書類 (${purchases.length})</h3>
      <div class="space-y-2">
        ${purchases.length === 0 ? '<div class="text-gray-400 text-sm py-2">まだありません</div>' : ''}
        ${purchases.map((p) => `
          <a href="#/purchase/${p.id}" class="card p-3 flex justify-between items-center hover:shadow-md">
            <div class="flex items-center gap-3">
              ${mediaThumbHtml(p, 'w-12 h-12')}
              <div>
                <div class="font-bold">${esc(p.vendor_name || '(不明)')}</div>
                <div class="text-xs text-gray-500">${esc(p.purchase_date || '')} ・ ${esc(p.document_type || '')}</div>
              </div>
            </div>
            <div class="font-bold">${yen(p.total_amount)}</div>
          </a>`).join('')}
      </div>
      <div id="customer-modal-root"></div>`;

    document.getElementById('edit-cust-btn').onclick = () => openCustomerModal(customer);
    document.getElementById('del-cust-btn').onclick = async () => {
      if (!confirm(`「${customer.name}」を削除しますか？\n関連する請求書・仕入れは削除されません。`)) return;
      await api('delete', `/api/customers/${customer.id}`);
      showToast('削除しました');
      location.hash = '#/customers';
    };
  });

  function statusLabel(status) {
    const map = { draft: '下書き', issued: '発行済み', sent: '送付済み', paid: '入金済み' };
    return map[status] || status;
  }

  // ==================================================
  // 未割当仕入れ一覧
  // ==================================================
  route('/purchases/unassigned', async () => {
    const el = contentContainer();
    const [purchases, customers] = await Promise.all([
      api('get', '/api/purchases?unassigned=1'),
      api('get', '/api/customers'),
    ]);
    el.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <a href="javascript:history.back()" class="text-blue-600 text-sm"><i class="fas fa-chevron-left"></i> 戻る</a>
      </div>
      <h2 class="text-xl font-bold mb-1">請求先未設定の仕入れ</h2>
      <p class="text-sm text-gray-500 mb-4">請求先を登録すると、請求書作成画面の明細欄に表示されます</p>
      <div class="space-y-3">
        ${purchases.map((p) => `
          <div class="card p-4">
            <div class="flex gap-3 mb-3">
              ${mediaThumbHtml(p, 'w-16 h-16')}
              <div class="flex-1 min-w-0">
                <div class="font-bold truncate">${esc(p.vendor_name || '(仕入先不明)')}</div>
                <div class="text-xs text-gray-500">${esc(p.purchase_date || '')} ・ ${esc(p.document_type || '')}</div>
                <div class="font-bold text-blue-700">${yen(p.total_amount)}</div>
              </div>
            </div>
            <label class="text-xs text-gray-500 mb-1 block">請求先を選択して登録</label>
            <select data-id="${p.id}" class="assign-select w-full border rounded-lg p-2">
              <option value="">請求先（お客様）を選択...</option>
              <option value="__new__">➕ 新規登録</option>
              ${customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
            </select>
            <button class="del-purchase-btn w-full mt-2 text-red-400 hover:text-red-600 text-sm py-1" data-id="${p.id}"><i class="fas fa-trash mr-1"></i>削除</button>
          </div>`).join('')}
        ${purchases.length === 0 ? '<div class="text-center text-gray-400 py-12"><i class="fas fa-check-circle text-green-400 text-3xl mb-3 block"></i>請求先未設定の仕入れはありません</div>' : ''}
      </div>`;

    document.querySelectorAll('.assign-select').forEach((sel) => {
      sel.onchange = async (e) => {
        const purchaseId = e.target.dataset.id;
        const val = e.target.value;
        if (!val) return;
        if (val === '__new__') {
          // 新規登録モーダルを開く
          e.target.value = ''; // 選択を戻す
          openCustomerModal(null, async (newCustomer) => {
            // 登録完了後に自動割り当て
            await api('put', `/api/purchases/${purchaseId}`, { customer_id: newCustomer.id });
            showToast(`${newCustomer.name} に登録しました`);
            render();
          });
          return;
        }
        await api('put', `/api/purchases/${purchaseId}`, { customer_id: val });
        showToast('請求先を登録しました');
        render();
      };
    });
    document.querySelectorAll('.del-purchase-btn').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('この仕入れを削除しますか？')) return;
        await api('delete', `/api/purchases/${btn.dataset.id}`);
        showToast('削除しました');
        render();
      };
    });
  });

  // ==================================================
  // 仕入れ取込（画像アップロード + OCR）
  // ==================================================
  route('/purchase/capture', async (params, query) => {
    const el = contentContainer();
    const customers = await api('get', '/api/customers');
    const preselect = query.customer_id || '';

    el.innerHTML = `
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-camera mr-2 text-blue-600"></i>仕入れを取り込む</h2>
      <div class="card p-6 text-center mb-4">
        <label for="file-input" class="block cursor-pointer">
          <div class="w-24 h-24 mx-auto rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-4xl mb-3">
            <i class="fas fa-camera"></i>
          </div>
          <div class="font-bold text-lg">タップして撮影 / ファイルを選択</div>
          <div class="text-sm text-gray-500 mt-1">見積書・請求書・レシートの写真 または PDF</div>
        </label>
        <input id="file-input" type="file" accept="image/*,application/pdf,.pdf" class="file-hidden" />
      </div>
      <label class="text-sm text-gray-500">請求先（お客様）（あとで割り当ても可）</label>
      <select id="pre-customer" class="w-full border rounded-lg p-3 mb-2 big-tap">
        <option value="">未定（あとで割り当て）</option>
        ${customers.map((c) => `<option value="${c.id}" ${String(c.id) === preselect ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
            <div id="preview-area"></div>`;
    // 仕入れ取込画面のお客さん選択をドラフト保存
    const captureDraftKey = 'capture_customer';
    const capDraft = loadDraft(captureDraftKey);
    if (capDraft && capDraft.customer_id && !preselect) {
      document.getElementById('pre-customer').value = capDraft.customer_id;
    }
    document.getElementById('pre-customer').onchange = (e) => saveDraft(captureDraftKey, { customer_id: e.target.value });
    // ① 画像をCanvas経由でリサイズ・圧縮するヘルパー（PDF以外）
    async function compressImage(file, maxPx, quality) {
      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          let { width, height } = img;
          if (width > maxPx || height > maxPx) {
            if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
            else { width = Math.round(width * maxPx / height); height = maxPx; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      });
    }

    document.getElementById('file-input').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const customerId = document.getElementById('pre-customer').value;
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');

      const previewArea = document.getElementById('preview-area');

      // プログレスバーHTML生成
      function progressHTML(mediaHTML) {
        return `
          <div class="card p-4 mb-4 text-center">
            ${mediaHTML}
            <div id="upload-status" class="text-gray-500 text-sm mb-1">アップロード中...</div>
            <div class="progress-bar-wrap">
              <div id="progress-fill" class="progress-bar-fill" style="width:0%"></div>
            </div>
            <div id="progress-pct" class="progress-label">0%</div>
          </div>`;
      }

      if (isPdf) {
        previewArea.innerHTML = progressHTML(`
          <div class="w-20 h-20 mx-auto rounded-lg bg-red-50 flex items-center justify-center text-red-500 mb-3">
            <i class="fas fa-file-pdf text-3xl"></i>
          </div>
          <div class="text-sm text-gray-600 mb-2">${esc(file.name)}</div>`);
      } else {
        const previewUrl = URL.createObjectURL(file);
        previewArea.innerHTML = progressHTML(`<img src="${previewUrl}" class="max-h-48 mx-auto rounded-lg mb-3" />`);
      }

      // ① 画像の場合はアップロード前に圧縮（最大辺1800px、JPEG品質0.85）
      let uploadFile = file;
      if (!isPdf) {
        setProgress(2, '画像を最適化中...');
        try {
          const compressed = await compressImage(file, 1800, 0.85);
          uploadFile = new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
        } catch(err) { uploadFile = file; }
      }
      const formData = new FormData();
      formData.append('image', uploadFile);
      if (customerId) formData.append('customer_id', customerId);

      // プログレス更新ヘルパー
      function setProgress(pct, statusText) {
        const fill = document.getElementById('progress-fill');
        const label = document.getElementById('progress-pct');
        const status = document.getElementById('upload-status');
        if (fill) fill.style.width = pct + '%';
        if (label) label.textContent = Math.round(pct) + '%';
        if (status && statusText) status.textContent = statusText;
      }

      // OCR待ち中の疑似プログレス（50%→90%を徐々に増加）
      let ocrTimer = null;
      let ocrPct = 50;
      function startOcrProgress() {
        ocrPct = 50;
        const status = document.getElementById('upload-status');
        if (status) status.innerHTML = '<div class="spinner mx-auto mb-1" style="display:inline-block;width:16px;height:16px;border-width:2px;vertical-align:middle;margin-right:6px"></div>AI読み取り中...';
        ocrTimer = setInterval(() => {
          // 50→90%まで徐々に増加（指数的に減速）
          ocrPct = ocrPct + (90 - ocrPct) * 0.04;
          setProgress(ocrPct, null);
        }, 500);
      }
      function stopOcrProgress() {
        if (ocrTimer) { clearInterval(ocrTimer); ocrTimer = null; }
      }

      try {
        const result = await axios.post('/api/purchases/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => {
            if (!evt.total) return;
            // アップロード進捗は全体の0〜50%に割り当て
            const uploadPct = Math.round((evt.loaded / evt.total) * 50);
            setProgress(uploadPct, 'アップロード中...');
            if (evt.loaded >= evt.total) {
              // アップロード完了 → OCR待ち疑似プログレス開始
              startOcrProgress();
            }
          },
        });
        stopOcrProgress();
        setProgress(100, '完了！');
        if (result.data.ocr_error) {
          showToast('保存しましたが、自動読み取りに失敗しました。手動で入力してください', true);
        }
        location.hash = `#/purchase/${result.data.id}`;
      } catch (err) {
        stopOcrProgress();
        const msg = (err.response && err.response.data && err.response.data.error) || '取り込みに失敗しました';
        showToast(msg, true);
      }
    };
  });

  // ==================================================
  // 仕入れ詳細・編集
  // ==================================================
  route('/purchase/:id', async (params) => {
    const el = contentContainer();
    const [{ purchase, items }, customers] = await Promise.all([
      api('get', `/api/purchases/${params.id}`),
      api('get', '/api/customers'),
    ]);

    el.innerHTML = `
      <div class="mb-4">
        <button onclick="history.back()" class="text-blue-600 text-sm"><i class="fas fa-chevron-left mr-1"></i>戻る</button>
      </div>
      <div class="card p-4 mb-4">
        ${mediaPreviewHtml(purchase)}

        <label class="text-sm text-gray-500">請求先（お客様）</label>
        <select id="p-customer" class="w-full border rounded-lg p-3 mb-3 big-tap">
          <option value="">未定</option>
          ${customers.map((c) => `<option value="${c.id}" ${c.id === purchase.customer_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-sm text-gray-500">仕入先</label>
            <input id="p-vendor" class="w-full border rounded-lg p-3 big-tap" value="${esc(purchase.vendor_name || '')}" />
          </div>
          <div>
            <label class="text-sm text-gray-500">書類種別</label>
            <input id="p-doctype" class="w-full border rounded-lg p-3 big-tap" value="${esc(purchase.document_type || '')}" />
          </div>
        </div>
        <label class="text-sm text-gray-500">日付</label>
        <input id="p-date" type="date" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(purchase.purchase_date || '')}" />

        <button id="p-save-meta" class="w-full btn-secondary rounded-lg py-3 font-bold mb-2 big-tap">情報を保存</button>
      </div>

      <div class="card p-4 mb-4">
        <div class="flex justify-between items-center mb-3">
          <h3 class="font-bold">明細</h3>
          <button id="item-add-btn" class="text-blue-600 text-sm"><i class="fas fa-plus mr-1"></i>追加</button>
        </div>
        <div id="items-list"></div>
        <div class="text-right font-bold text-lg mt-3">合計: <span id="items-total">${yen(purchase.total_amount)}</span></div>
        <button id="items-save-btn" class="w-full btn-primary rounded-lg py-3 font-bold mt-3 big-tap">明細を保存</button>
      </div>

      <button id="p-to-invoice-btn" class="w-full rounded-lg py-3 font-bold mb-3 big-tap text-white" style="background:#059669">
        <i class="fas fa-file-invoice mr-1"></i>この仕入れから請求書を作成する
      </button>

      <button id="p-delete-btn" class="w-full btn-danger rounded-lg py-3 font-bold big-tap"><i class="fas fa-trash mr-1"></i>この仕入れを削除</button>
    `;

    const purchaseDraftKey = 'purchase_' + purchase.id;
    const savedDraft = loadDraft(purchaseDraftKey);
    let currentItems = items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit || '', unit_price: i.unit_price, amount: i.amount }));
    if (currentItems.length === 0) {
      currentItems = [{ name: '', quantity: 1, unit: '', unit_price: purchase.total_amount || 0, amount: purchase.total_amount || 0 }];
    }
    // ドラフト復元
    if (savedDraft) {
      if (savedDraft.vendor_name !== undefined) document.getElementById('p-vendor').value = savedDraft.vendor_name;
      if (savedDraft.document_type !== undefined) document.getElementById('p-doctype').value = savedDraft.document_type;
      if (savedDraft.purchase_date !== undefined) document.getElementById('p-date').value = savedDraft.purchase_date;
      if (savedDraft.customer_id !== undefined) document.getElementById('p-customer').value = savedDraft.customer_id;
      if (savedDraft.items && savedDraft.items.length > 0) currentItems = savedDraft.items;
    }
    renderItemsList();

    // ドラフト自動保存（800msごと）
    const draftTimer = autoSaveDraft(purchaseDraftKey, () => ({
      vendor_name: document.getElementById('p-vendor')?.value,
      document_type: document.getElementById('p-doctype')?.value,
      purchase_date: document.getElementById('p-date')?.value,
      customer_id: document.getElementById('p-customer')?.value,
      items: currentItems,
    }));
    // 画面遷移時にタイマーをクリア
    window.addEventListener('hashchange', () => clearInterval(draftTimer), { once: true });

    function renderItemsList() {
      const list = document.getElementById('items-list');
      list.innerHTML = currentItems
        .map(
          (it, idx) => `
        <div class="flex flex-wrap gap-2 mb-2 items-center border-b pb-2" data-idx="${idx}">
          <input class="item-name flex-1 min-w-[120px] border rounded-lg p-2 text-sm" placeholder="品目名" value="${esc(it.name)}" />
          <input class="item-qty w-14 border rounded-lg p-2 text-sm" type="number" step="any" placeholder="数量" value="${it.quantity}" />
          <input class="item-unit w-16 border rounded-lg p-2 text-sm" type="text" placeholder="単位" value="${esc(it.unit || '')}" />
          <input class="item-price w-24 border rounded-lg p-2 text-sm" type="number" step="any" placeholder="単価" value="${it.unit_price}" />
          <input class="item-amount w-24 border rounded-lg p-2 text-sm font-bold" type="number" step="any" placeholder="金額" value="${it.amount}" />
          <button class="item-del text-red-500 p-2"><i class="fas fa-times"></i></button>
        </div>`
        )
        .join('');

      list.querySelectorAll('[data-idx]').forEach((row) => {
        const idx = Number(row.dataset.idx);
        row.querySelector('.item-name').oninput = (e) => (currentItems[idx].name = e.target.value);
        row.querySelector('.item-qty').oninput = (e) => {
          currentItems[idx].quantity = Number(e.target.value) || 0;
          recalcAmount(idx, row);
        };
        row.querySelector('.item-unit').oninput = (e) => (currentItems[idx].unit = e.target.value);
        row.querySelector('.item-price').oninput = (e) => {
          currentItems[idx].unit_price = Number(e.target.value) || 0;
          recalcAmount(idx, row);
        };
        row.querySelector('.item-amount').oninput = (e) => {
          currentItems[idx].amount = Number(e.target.value) || 0;
          updateTotal();
        };
        row.querySelector('.item-del').onclick = () => {
          currentItems.splice(idx, 1);
          renderItemsList();
          updateTotal();
        };
      });
    }

    function recalcAmount(idx, row) {
      const it = currentItems[idx];
      it.amount = Math.round((it.quantity || 0) * (it.unit_price || 0));
      row.querySelector('.item-amount').value = it.amount;
      updateTotal();
    }

    function updateTotal() {
      const total = currentItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
      document.getElementById('items-total').textContent = yen(total);
    }

    document.getElementById('item-add-btn').onclick = () => {
      currentItems.push({ name: '', quantity: 1, unit: '', unit_price: 0, amount: 0 });
      renderItemsList();
    };

        document.getElementById('p-save-meta').onclick = async () => {
      await api('put', `/api/purchases/${purchase.id}`, {
        customer_id: document.getElementById('p-customer').value || null,
        vendor_name: document.getElementById('p-vendor').value,
        document_type: document.getElementById('p-doctype').value,
        purchase_date: document.getElementById('p-date').value,
        total_amount: purchase.total_amount,
        memo: '',
      });
      clearDraft(purchaseDraftKey);
      showToast('保存しました');
    };
    document.getElementById('items-save-btn').onclick = async () => {
      await api('put', `/api/purchases/${purchase.id}/items`, { items: currentItems });
      clearDraft(purchaseDraftKey);
      showToast('明細を保存しました');
    };

    document.getElementById('p-delete-btn').onclick = async () => {
      if (!confirm('この仕入れを削除しますか？')) return;
      await api('delete', `/api/purchases/${purchase.id}`);
      showToast('削除しました');
      location.hash = '#/';
    };

    // 仕入れ読み込み → 請求書作成画面 へのフロー
    document.getElementById('p-to-invoice-btn').onclick = async () => {
      let customerId = document.getElementById('p-customer').value;
      if (!customerId) {
        showToast('先に請求先（お客様）を選択・保存してください', true);
        document.getElementById('p-customer').focus();
        return;
      }
      // 明細・お客さんが未保存の場合に備えて先に保存してから遷移
      await api('put', `/api/purchases/${purchase.id}`, {
        customer_id: customerId,
        vendor_name: document.getElementById('p-vendor').value,
        document_type: document.getElementById('p-doctype').value,
        purchase_date: document.getElementById('p-date').value,
        total_amount: purchase.total_amount,
        memo: '',
      });
      await api('put', `/api/purchases/${purchase.id}/items`, { items: currentItems });
      location.hash = `#/invoice/new?customer_id=${customerId}`;
    };
  });

  // ==================================================
  // 請求書一覧
  // ==================================================
  route('/invoices', async () => {
    const el = contentContainer();
    const invoiceList = await api('get', '/api/invoices');
    const drafts = invoiceList.filter((i) => !i.status || i.status === 'draft');
    const sent = invoiceList.filter((i) => i.status === 'sent' || i.status === 'issued');
    const paid = invoiceList.filter((i) => i.status === 'paid');

    function renderInvoiceCards(list) {
      if (list.length === 0) return '<div class="text-gray-400 text-sm py-4 text-center">まだありません</div>';
      return list.map((i) => `
        <a href="#/invoice/${i.id}" class="card p-3 flex justify-between items-center hover:shadow-md">
          <div>
            <div class="font-bold">${esc(i.invoice_number || '(下書き)')}</div>
            <div class="text-xs text-gray-500">${esc(i.customer_name || '')} ・ ${esc(i.issue_date || '')} ・ <span class="${i.status === 'draft' ? 'text-amber-600' : 'text-green-600'}">${statusLabel(i.status)}</span></div>
          </div>
          <div class="font-bold text-lg">${yen(i.total_amount)}</div>
        </a>`).join('');
    }

    el.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold"><i class="fas fa-file-invoice mr-2 text-blue-600"></i>請求書一覧</h2>
        <a href="#/invoice/new" class="btn-primary rounded-lg px-4 py-2 font-bold"><i class="fas fa-plus mr-1"></i>新規作成</a>
      </div>

      <!-- 下書き -->
      <div class="mb-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">下書き ${drafts.length}件</span>
        </div>
        <div class="space-y-2">${renderInvoiceCards(drafts)}</div>
      </div>

      <!-- 発行済み／送付済み -->
      <div class="mb-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">発行済み／送付済み ${sent.length}件</span>
        </div>
        <div class="space-y-2">${renderInvoiceCards(sent)}</div>
      </div>

      <!-- 入金済み -->
      <div class="mb-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">入金済み ${paid.length}件</span>
        </div>
        <div class="space-y-2">${renderInvoiceCards(paid)}</div>
      </div>
    `;
  });

  // ==================================================
  // 請求書作成
  // ==================================================
  route('/invoice/new', async (params, query) => {
    await renderInvoiceForm(null, query.customer_id);
  });

  route('/invoice/:id/edit', async (params) => {
    const { invoice } = await api('get', `/api/invoices/${params.id}`);
    await renderInvoiceForm(invoice, invoice.customer_id);
  });

  const INVOICE_TAX_RATE = 10; // 消費税は一律10%固定

  async function renderInvoiceForm(existingInvoice, presetCustomerId) {
    const el = contentContainer();
    const isEdit = !!existingInvoice;
    const [customers, settings] = await Promise.all([
      api('get', '/api/customers'),
      api('get', '/api/settings'),
    ]);

    let invoiceItems = [];
    let existingItems = [];
    if (isEdit) {
      const detail = await api('get', `/api/invoices/${existingInvoice.id}`);
      existingItems = detail.items.map((it) => ({
        purchase_item_id: it.purchase_item_id,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit || '',
        unit_price: it.unit_price,
        cost_amount: it.cost_amount,
        fee_percent: it.fee_percent === null || it.fee_percent === undefined ? null : Number(it.fee_percent),
        checked: true,
      }));
    }

    const defaultFeePercent = Number(existingInvoice?.fee_percent ?? settings.default_fee_percent) || 0;

    el.innerHTML = `
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-file-invoice mr-2 text-green-600"></i>${isEdit ? '請求書を編集' : '請求書を作成'}</h2>

      <!-- ステップインジケーター -->
      <div class="flex items-center justify-between mb-5 px-1">
        <div class="flex flex-col items-center gap-1">
          <div class="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shadow">1</div>
          <span class="text-xs text-blue-600 font-bold">請求先</span>
        </div>
        <div class="flex-1 h-0.5 bg-gray-200 mx-1"></div>
        <div class="flex flex-col items-center gap-1">
          <div class="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shadow">2</div>
          <span class="text-xs text-blue-600 font-bold">商品選択</span>
        </div>
        <div class="flex-1 h-0.5 bg-gray-200 mx-1"></div>
        <div class="flex flex-col items-center gap-1">
          <div class="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shadow">3</div>
          <span class="text-xs text-blue-600 font-bold">売価設定</span>
        </div>
      </div>

      <!-- STEP 1 -->
      <div class="card p-4 mb-4 border-l-4 border-blue-500">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">STEP 1</span>
          <span class="font-bold text-base">請求先情報の登録</span>
        </div>
        <label class="text-sm text-gray-500 mb-1 block">請求先（お客様） *</label>
        <select id="inv-customer" class="w-full border rounded-lg px-3 py-2 mb-2 text-base">
          <option value="">選択してください</option>
          <option value="__new__">➕ 新規登録</option>
          ${customers.map((c) => `<option value="${c.id}" ${String(c.id) === String(presetCustomerId) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <div id="inv-customer-modal-root"></div>
        <div class="mb-2">
          <label class="text-sm text-gray-500">発行日</label>
          <input id="inv-issue-date" type="date" class="w-full border rounded-lg px-3 py-2 text-base" value="${existingInvoice?.issue_date || todayStr()}" />
        </div>
        <div class="mb-2">
          <label class="text-sm text-gray-500">支払期限</label>
          <input id="inv-due-date" type="date" class="w-full border rounded-lg px-3 py-2 text-base" value="${existingInvoice?.due_date || ''}" />
        </div>
        <div class="grid grid-cols-2 gap-3 mb-2">
          <div class="flex flex-col">
            <label class="text-sm text-gray-500 mb-1">基本利益率</label>
            <div class="flex items-center gap-2">
              <input id="inv-fee" type="number" step="any" class="flex-1 border rounded-lg px-3 py-2 text-base" style="min-width:0;" value="${defaultFeePercent}" />
              <span class="text-gray-500 font-bold text-sm shrink-0">%</span>
            </div>
          </div>
          <div class="flex flex-col">
            <label class="text-sm text-gray-500 mb-1">消費税</label>
            <div class="border rounded-lg px-3 py-2 bg-gray-100 text-gray-600 font-bold text-base">一律 10%</div>
          </div>
        </div>
        <label class="text-sm text-gray-500">備考</label>
        <textarea id="inv-memo" class="w-full border rounded-lg px-3 py-2 text-base" rows="3">${esc(existingInvoice?.memo || '')}</textarea>
      </div>

      <!-- STEP 2 -->
      <div class="card p-4 mb-4 border-l-4 border-blue-500">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">STEP 2</span>
          <span class="font-bold text-base">仕入れ商品の選択</span>
        </div>

        <!-- ① 商品選択エリア -->
        <div class="border rounded-xl p-3 mb-2 bg-gray-50">
          <div class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">① 仕入れから選択</div>
          <div id="available-items-area" class="mb-2"></div>
          <a href="#/purchases/unassigned" class="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100 transition-colors">
            <i class="fas fa-exclamation-triangle text-amber-500"></i>
            <span>請求先未設定の仕入れを確認・登録</span>
            <i class="fas fa-chevron-right text-amber-400 ml-auto"></i>
          </a>
        </div>

        <!-- 矢印 -->
        <div class="flex items-center justify-center my-2 text-blue-400">
          <i class="fas fa-arrow-down text-xl"></i>
        </div>

        <!-- ② 反映済み明細エリア -->
        <div class="border-2 border-blue-200 rounded-xl p-3 bg-blue-50">
          <div class="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">② 請求書に反映する明細</div>
          <div id="selected-items-list"></div>
          <button id="add-manual-item" class="text-blue-600 text-sm mt-2"><i class="fas fa-plus mr-1"></i>手動で明細を追加</button>
        </div>
      </div>

      <!-- STEP 3 -->
      <div class="card p-4 mb-4 border-l-4 border-blue-500">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">STEP 3</span>
          <span class="font-bold text-base">売価の設定</span>
        </div>
        <div id="profit-breakdown" class="space-y-2"></div>
      </div>

      <div class="card p-4 mb-4" id="calc-summary"></div>

      <div class="flex gap-3 mb-3">
        <button id="inv-draft-btn" class="flex-1 btn-secondary rounded-lg py-4 font-bold text-base big-tap">
          <i class="fas fa-save mr-1"></i>下書き保存
        </button>
        <button id="inv-issue-btn" class="flex-1 btn-primary rounded-lg py-4 font-bold text-base big-tap">
          <i class="fas fa-paper-plane mr-1"></i>発行する
        </button>
      </div>
    `;

    let selectedItems = [...existingItems];

    async function loadAvailableItems(customerId) {
      const areaEl = document.getElementById('available-items-area');
      if (!customerId) {
        areaEl.innerHTML = '<div class="text-sm text-gray-400 py-1">請求先（お客様）を選択すると、その請求先の仕入れ明細が表示されます</div>';
        return;
      }
      const avail = await api('get', `/api/purchases/items/available?customer_id=${customerId}`, null, { silent: true });
      if (!avail || avail.length === 0) {
        areaEl.innerHTML = '<div class="text-sm text-gray-400 py-1">この請求先の取り込み済み仕入れはありません</div>';
        return;
      }
      areaEl.innerHTML = `
        <div class="text-sm text-gray-500 mb-2">仕入れ明細（チェックして請求書に反映）</div>
        <div class="space-y-1 max-h-72 overflow-y-auto border rounded-lg p-2">
          ${avail.map((it) => `
            <label class="flex items-center gap-2 text-sm border-b pb-1 last:border-0 cursor-pointer hover:bg-gray-50 rounded px-1">
              <input type="checkbox" class="avail-check" data-item='${JSON.stringify({
                purchase_item_id: it.id,
                name: it.name,
                quantity: it.quantity,
                unit: it.unit || '',
                unit_price: it.unit_price,
                cost_amount: it.amount,
              }).replace(/'/g, "&apos;")}' />
              <span class="flex-1">
                ${esc(it.name)}
                <span class="text-gray-400 text-xs">(${esc(it.vendor_name || '')} ${esc(it.purchase_date || '')})</span>
              </span>
              <span class="font-bold shrink-0">${yen(it.amount)}</span>
            </label>`).join('')}
        </div>`;

      areaEl.querySelectorAll('.avail-check').forEach((chk) => {
        chk.onchange = (e) => {
          const data = JSON.parse(e.target.dataset.item);
          if (e.target.checked) {
            selectedItems.push({ ...data, fee_percent: null, checked: true });
          } else {
            selectedItems = selectedItems.filter((si) => si.purchase_item_id !== data.purchase_item_id);
          }
          renderSelectedItems();
        };
      });
    }

    // 項目ごとの利益率（未設定なら基本利益率を使用）から金額・利益額・消費税額を算出
    function calcItemDisplay(it) {
      const baseFee = Number(document.getElementById('inv-fee').value) || 0;
      const feePercent = (it.fee_percent === null || it.fee_percent === undefined) ? baseFee : Number(it.fee_percent);
      const cost = Number(it.cost_amount) || 0;
      const billed = Math.round(cost * (1 + feePercent / 100));
      const profit = billed - cost;
      const itemTax = Math.round(billed * (INVOICE_TAX_RATE / 100));
      return { feePercent, cost, billed, profit, itemTax };
    }

    function renderSelectedItems() {
      const list = document.getElementById('selected-items-list');
      if (selectedItems.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-sm py-2">明細がありません</div>';
      } else {
        list.innerHTML = selectedItems
          .map(
            (it, idx) => `
          <div class="flex flex-wrap gap-2 mb-2 items-center" data-idx="${idx}">
            <input class="sel-name flex-1 min-w-[120px] border rounded-lg p-2 text-sm" placeholder="品目名" value="${esc(it.name)}" />
            <input class="sel-qty w-14 border rounded-lg p-2 text-sm" type="number" step="any" placeholder="数量" value="${it.quantity ?? 1}" />
            <input class="sel-unit w-16 border rounded-lg p-2 text-sm" type="text" placeholder="単位" value="${esc(it.unit || '')}" />
            <input class="sel-cost w-24 border rounded-lg p-2 text-sm" type="number" step="any" placeholder="原価" value="${it.cost_amount}" />
            <button class="sel-del text-red-500 p-2"><i class="fas fa-times"></i></button>
          </div>`
          )
          .join('');

        list.querySelectorAll('[data-idx]').forEach((row) => {
          const idx = Number(row.dataset.idx);
          row.querySelector('.sel-name').oninput = (e) => (selectedItems[idx].name = e.target.value);
          row.querySelector('.sel-qty').oninput = (e) => (selectedItems[idx].quantity = Number(e.target.value) || 0);
          row.querySelector('.sel-unit').oninput = (e) => (selectedItems[idx].unit = e.target.value);
          row.querySelector('.sel-cost').oninput = (e) => {
            selectedItems[idx].cost_amount = Number(e.target.value) || 0;
            updateSummary();
          };
          row.querySelector('.sel-del').onclick = () => {
            selectedItems.splice(idx, 1);
            renderSelectedItems();
            updateSummary();
          };
        });
      }
      updateSummary();
    }

    // 表外：項目ごとの仕入原価・利益率(%)・利益額を分かりやすく表示。利益率は項目ごとに変更可能
    function renderProfitBreakdown() {
      const breakdownEl = document.getElementById('profit-breakdown');
      const baseFee = Number(document.getElementById('inv-fee').value) || 0;
      if (selectedItems.length === 0) {
        breakdownEl.innerHTML = '<div class="text-gray-400 text-sm py-2">明細がありません</div>';
        return;
      }
      breakdownEl.innerHTML = selectedItems
        .map((it, idx) => {
          const { feePercent, cost, billed, profit, itemTax } = calcItemDisplay(it);
          const isDefaultFee = it.fee_percent === null || it.fee_percent === undefined;
          return `
          <div class="border-2 border-blue-100 rounded-xl p-3 bg-white" data-pidx="${idx}">
            <div class="flex items-center justify-between mb-2">
              <div class="text-sm font-bold truncate flex-1 mr-2">${esc(it.name || '(品目名未入力)')}</div>
              ${isDefaultFee
                ? '<span class="text-xs bg-gray-100 text-gray-400 rounded px-2 py-0.5 shrink-0">基本利益率</span>'
                : '<button class="pb-reset text-xs bg-blue-50 text-blue-500 border border-blue-200 rounded px-2 py-0.5 shrink-0 hover:bg-blue-100">基本に戻す</button>'}
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
              <div class="flex justify-between">
                <span class="text-gray-500">仕入原価</span>
                <span class="font-bold text-gray-700">${yen(cost)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">請求額(税抜)</span>
                <span class="font-bold text-blue-700">${yen(billed)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">利益額</span>
                <span class="font-bold text-green-600">${yen(profit)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">消費税(10%)</span>
                <span class="font-bold text-gray-600">${yen(itemTax)}</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <div class="flex items-center gap-1">
                <label class="text-xs text-gray-500 shrink-0">利益率</label>
                <input class="pb-fee flex-1 min-w-0 border rounded-lg px-2 py-1 text-sm text-right" type="number" step="any" value="${feePercent}" />
                <span class="text-xs text-gray-500 shrink-0">%</span>
              </div>
              <div class="flex items-center gap-1">
                <label class="text-xs text-gray-500 shrink-0">売価</label>
                <input class="pb-billed flex-1 min-w-0 border rounded-lg px-2 py-1 text-sm text-right" type="number" step="any" value="${billed}" />
                <span class="text-xs text-gray-500 shrink-0">円</span>
              </div>
            </div>
          </div>`;
        })
        .join('');

      breakdownEl.querySelectorAll('[data-pidx]').forEach((box) => {
        const idx = Number(box.dataset.pidx);
        const feeInput = box.querySelector('.pb-fee');
        const billedInput = box.querySelector('.pb-billed');

        // 利益率変更 → 売価自動計算（DOM再生成なし）
        feeInput.oninput = (e) => {
          const v = e.target.value;
          // 入力中（末尾が「.」「-」空など）は途中なので売価を更新しない
          if (v === '' || v === '-' || v.endsWith('.')) {
            selectedItems[idx].fee_percent = v === '' ? null : (isNaN(Number(v)) ? null : Number(v));
            updateSummaryOnly();
            return;
          }
          const fee = Number(v);
          selectedItems[idx].fee_percent = fee;
          const cost = Number(selectedItems[idx].cost_amount) || 0;
          billedInput.value = Math.round(cost * (1 + fee / 100));
          updateSummaryOnly();
        };

        // 売価手打ち → 利益率自動計算（DOM再生成なし）
        billedInput.oninput = (e) => {
          const v = e.target.value;
          if (v === '' || v === '-' || v.endsWith('.')) {
            updateSummaryOnly();
            return;
          }
          const billedVal = Number(v);
          const cost = Number(selectedItems[idx].cost_amount) || 0;
          const newFee = cost > 0 ? Math.round((billedVal / cost - 1) * 100 * 10) / 10 : 0;
          selectedItems[idx].fee_percent = newFee;
          feeInput.value = newFee;
          updateSummaryOnly();
        };

        const resetBtn = box.querySelector('.pb-reset');
        if (resetBtn) {
          resetBtn.onclick = () => {
            selectedItems[idx].fee_percent = null;
            updateSummary(); // updateSummary内でrenderProfitBreakdownを呼ぶので1回だけ
          };
        }
      });
    }

    // DOM再生成なしで合計欄のみ更新（入力中に呼び出す用）
    function updateSummaryOnly() {
      let subtotalCost = 0;
      let amountBeforeTax = 0;
      let taxAmount = 0;
      selectedItems.forEach((it) => {
        const { cost, billed, itemTax } = calcItemDisplay(it);
        subtotalCost += cost;
        amountBeforeTax += billed;
        taxAmount += itemTax;
      });
      subtotalCost = Math.round(subtotalCost);
      amountBeforeTax = Math.round(amountBeforeTax);
      taxAmount = Math.round(taxAmount);
      const feeAmount = amountBeforeTax - subtotalCost;
      const total = amountBeforeTax + taxAmount;
      const totalFeeRateOnly = subtotalCost > 0 ? Math.round((feeAmount / subtotalCost) * 1000) / 10 : 0;
      const el = document.getElementById('calc-summary');
      if (el) el.innerHTML = `
        <div class="flex justify-between text-sm mb-1"><span>仕入原価合計</span><span>${yen(subtotalCost)}</span></div>
        <div class="flex justify-between text-sm mb-1"><span>利益額合計</span><span class="text-green-600 font-bold">${yen(feeAmount)}</span></div>
        <div class="flex justify-between text-sm mb-1 border-b pb-2"><span>合計利益率</span><span class="text-green-600 font-bold">${totalFeeRateOnly}%</span></div>
        <div class="flex justify-between text-sm mb-1"><span>小計（税抜）</span><span>${yen(amountBeforeTax)}</span></div>
        <div class="flex justify-between text-sm mb-1 border-b pb-2"><span>消費税合計 (10%)</span><span>${yen(taxAmount)}</span></div>
        <div class="flex justify-between font-bold text-xl mt-2"><span>合計金額（税込）</span><span class="text-green-600">${yen(total)}</span></div>
      `;
    }

    function updateSummary() {
      renderProfitBreakdown();
      let subtotalCost = 0;
      let amountBeforeTax = 0;
      let taxAmount = 0;
      selectedItems.forEach((it) => {
        const { cost, billed, itemTax } = calcItemDisplay(it);
        subtotalCost += cost;
        amountBeforeTax += billed;
        taxAmount += itemTax;
      });
      subtotalCost = Math.round(subtotalCost);
      amountBeforeTax = Math.round(amountBeforeTax);
      taxAmount = Math.round(taxAmount);
      const feeAmount = amountBeforeTax - subtotalCost;
      const total = amountBeforeTax + taxAmount;

      const totalFeeRate = subtotalCost > 0 ? Math.round((feeAmount / subtotalCost) * 1000) / 10 : 0;
      document.getElementById('calc-summary').innerHTML = `
        <div class="flex justify-between text-sm mb-1"><span>仕入原価合計</span><span>${yen(subtotalCost)}</span></div>
        <div class="flex justify-between text-sm mb-1"><span>利益額合計</span><span class="text-green-600 font-bold">${yen(feeAmount)}</span></div>
        <div class="flex justify-between text-sm mb-1 border-b pb-2"><span>合計利益率</span><span class="text-green-600 font-bold">${totalFeeRate}%</span></div>
        <div class="flex justify-between text-sm mb-1"><span>小計（税抜）</span><span>${yen(amountBeforeTax)}</span></div>
        <div class="flex justify-between text-sm mb-1 border-b pb-2"><span>消費税合計 (10%)</span><span>${yen(taxAmount)}</span></div>
        <div class="flex justify-between font-bold text-xl mt-2"><span>合計金額（税込）</span><span class="text-green-600">${yen(total)}</span></div>
      `;
    }

    document.getElementById('add-manual-item').onclick = () => {
      selectedItems.push({ purchase_item_id: null, name: '', quantity: 1, unit: '', unit_price: 0, cost_amount: 0, fee_percent: null, checked: true });
      renderSelectedItems();
    };

    document.getElementById('inv-fee').oninput = updateSummary;
    document.getElementById('inv-customer').onchange = (e) => {
      if (e.target.value === '__new__') {
        e.target.value = '';
        openInvoiceCustomerModal();
        return;
      }
      loadAvailableItems(e.target.value);
    };
    const addCustomerBtn = document.getElementById('inv-add-customer-btn');
    if (addCustomerBtn) addCustomerBtn.onclick = () => openInvoiceCustomerModal();

        // 請求書ドラフトキー
    const invoiceDraftKey = isEdit ? 'invoice_edit_' + existingInvoice.id : 'invoice_new_' + (presetCustomerId || 'x');
    const invDraft = loadDraft(invoiceDraftKey);
    if (invDraft) {
      if (invDraft.customer_id) { const sel = document.getElementById('inv-customer'); if (sel) sel.value = invDraft.customer_id; }
      if (invDraft.issue_date) { const el = document.getElementById('inv-issue-date'); if (el) el.value = invDraft.issue_date; }
      if (invDraft.due_date) { const el = document.getElementById('inv-due-date'); if (el) el.value = invDraft.due_date; }
      if (invDraft.fee_percent !== undefined) { const el = document.getElementById('inv-fee'); if (el) el.value = invDraft.fee_percent; }
      if (invDraft.memo !== undefined) { const el = document.getElementById('inv-memo'); if (el) el.value = invDraft.memo; }
      if (invDraft.items && invDraft.items.length > 0) selectedItems = invDraft.items;
    }
    renderSelectedItems();
    const invDraftTimer = autoSaveDraft(invoiceDraftKey, () => ({
      customer_id: document.getElementById('inv-customer')?.value,
      issue_date: document.getElementById('inv-issue-date')?.value,
      due_date: document.getElementById('inv-due-date')?.value,
      fee_percent: document.getElementById('inv-fee')?.value,
      memo: document.getElementById('inv-memo')?.value,
      items: selectedItems,
    }));
    window.addEventListener('hashchange', () => clearInterval(invDraftTimer), { once: true });
    if (invDraft && invDraft.customer_id) {
      loadAvailableItems(invDraft.customer_id);
    } else if (presetCustomerId) {
      loadAvailableItems(presetCustomerId);
    } else {
      // 請求先未選択時は案内メッセージを表示
      loadAvailableItems(null);
    }
    async function saveInvoice(status) {
      const customerId = document.getElementById('inv-customer').value;
      if (!customerId) return showToast('請求先（お客様）を選択してください', true);
      if (selectedItems.length === 0) return showToast('明細を１件以上追加してください', true);

      const payload = {
        customer_id: Number(customerId),
        issue_date: document.getElementById('inv-issue-date').value,
        due_date: document.getElementById('inv-due-date').value,
        fee_percent: Number(document.getElementById('inv-fee').value) || 0,
        memo: document.getElementById('inv-memo').value,
        status: status,
        items: selectedItems.map((it) => ({
          purchase_item_id: it.purchase_item_id || null,
          name: it.name,
          quantity: it.quantity || 1,
          unit: it.unit || '',
          unit_price: it.unit_price || it.cost_amount || 0,
          cost_amount: Number(it.cost_amount) || 0,
          fee_percent: it.fee_percent === null || it.fee_percent === undefined || it.fee_percent === '' ? null : Number(it.fee_percent),
        })),
      };

      let result;
      if (isEdit) {
        result = await api('put', `/api/invoices/${existingInvoice.id}`, payload);
        clearDraft(invoiceDraftKey);
        location.hash = `#/invoice/${existingInvoice.id}`;
      } else {
        result = await api('post', '/api/invoices', payload);
        clearDraft(invoiceDraftKey);
        location.hash = `#/invoice/${result.id}`;
      }
      showToast(status === 'draft' ? '下書きとして保存しました' : '発行しました');
    }
    document.getElementById('inv-draft-btn').onclick = () => saveInvoice('draft');
    document.getElementById('inv-issue-btn').onclick = () => saveInvoice('issued');
  }

  // ==================================================
  // 請求書表示 / 印刷
  // ==================================================
  route('/invoice/:id', async (params) => {
    const el = contentContainer();
    const { invoice, items, settings } = await api('get', `/api/invoices/${params.id}`);

    el.innerHTML = `
      <div class="flex justify-between items-center mb-4 no-print">
        <a href="#/customers/${invoice.customer_id}" class="text-blue-600 text-sm"><i class="fas fa-chevron-left mr-1"></i>請求先（お客様）へ戻る</a>
        <div class="flex gap-2">
          <a href="#/invoice/${invoice.id}/edit" class="btn-secondary rounded-lg px-3 py-2 text-sm"><i class="fas fa-pen mr-1"></i>編集</a>
          <button id="print-btn" class="btn-primary rounded-lg px-3 py-2 text-sm"><i class="fas fa-print mr-1"></i>印刷/PDF</button>
          <button id="del-invoice-btn" class="btn-danger rounded-lg px-3 py-2 text-sm"><i class="fas fa-trash"></i></button>
        </div>
      </div>

      <div class="mb-4 no-print">
        <label class="text-sm text-gray-500 mr-2">ステータス:</label>
        <select id="status-select" class="border rounded-lg p-2 text-sm">
          <option value="draft" ${invoice.status === 'draft' ? 'selected' : ''}>下書き</option>
          <option value="issued" ${invoice.status === 'issued' ? 'selected' : ''}>発行済み</option>
          <option value="sent" ${invoice.status === 'sent' ? 'selected' : ''}>送付済み</option>
          <option value="paid" ${invoice.status === 'paid' ? 'selected' : ''}>入金済み</option>
        </select>
      </div>

      <div id="print-area" class="card p-8 bg-white">
        <div class="flex justify-between items-start mb-8">
          <h1 class="text-2xl font-bold">請求書</h1>
          <div class="text-sm text-right text-gray-500">
            <div>請求書番号: ${esc(invoice.invoice_number || '')}</div>
            <div>発行日: ${esc(invoice.issue_date || '')}</div>
          </div>
        </div>

        <div class="flex justify-between mb-8">
          <div>
            <div class="text-lg font-bold border-b-2 border-gray-800 pb-1 mb-2">${esc(invoice.customer_name)} 様</div>
            <div class="text-sm text-gray-600">${esc(invoice.customer_postal_code || '')}</div>
            <div class="text-sm text-gray-600">${esc(invoice.customer_address || '')}</div>
            <div class="text-sm text-gray-600">${esc(invoice.customer_phone || '')}</div>
            ${invoice.due_date ? `<div class="text-sm mt-3">お支払期限: <b>${esc(invoice.due_date)}</b></div>` : ''}
          </div>
          <div class="text-sm text-right">
            <div class="font-bold text-base mb-1">${esc(settings.company_name || settings.owner_name || '')}</div>
            <div>${esc(settings.owner_name || '')}</div>
            <div>${esc(settings.postal_code || '')}</div>
            <div>${esc(settings.address || '')}</div>
            <div>TEL: ${esc(settings.phone || '')}</div>
            <div>${esc(settings.email || '')}</div>
          </div>
        </div>

        <div class="mb-8">
          <div class="text-sm text-gray-500">ご請求金額</div>
          <div class="text-3xl font-bold border-b-2 border-gray-800 pb-1 inline-block">${yen(invoice.total_amount)}<span class="text-base font-normal ml-1">（税込）</span></div>
        </div>

        <table class="w-full text-sm mb-6 border-collapse">
          <thead>
            <tr class="border-b-2 border-gray-800">
              <th class="text-left py-2">品目</th>
              <th class="text-right py-2 w-16">数量</th>
              <th class="text-center py-2 w-14">単位</th>
              <th class="text-right py-2 w-28">単価</th>
              <th class="text-right py-2 w-24">金額(税抜)</th>
              <th class="text-right py-2 w-24">消費税</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => `
              <tr class="border-b">
                <td class="py-2">${esc(it.name)}</td>
                <td class="text-right py-2">${it.quantity}</td>
                <td class="text-center py-2">${esc(it.unit || '')}</td>
                <td class="text-right py-2">${yen(it.billed_amount / (it.quantity || 1))}</td>
                <td class="text-right py-2">${yen(it.billed_amount)}</td>
                <td class="text-right py-2">${yen(it.tax_amount)}</td>
              </tr>`).join('')}
          </tbody>
        </table>

        <div class="flex justify-end mb-8">
          <div class="w-64 text-sm">
            <div class="flex justify-between py-1"><span>小計（税抜）</span><span>${yen(invoice.amount_before_tax)}</span></div>
            <div class="flex justify-between py-1 border-b"><span>消費税 (10%)</span><span>${yen(invoice.tax_amount)}</span></div>
            <div class="flex justify-between py-2 font-bold text-lg"><span>合計（税込）</span><span>${yen(invoice.total_amount)}</span></div>
          </div>
        </div>

        ${settings.bank_name ? `
        <div class="text-sm border-t pt-4 mb-4">
          <div class="font-bold mb-1">お振込先</div>
          <div>${esc(settings.bank_name)} ${esc(settings.bank_branch)} ${esc(settings.bank_account_type)} ${esc(settings.bank_account_number)}</div>
          <div>${esc(settings.bank_account_holder)}</div>
        </div>` : ''}

        ${invoice.memo ? `<div class="text-sm border-t pt-4"><div class="font-bold mb-1">備考</div><div>${esc(invoice.memo)}</div></div>` : ''}
      </div>

      <div class="card p-4 mt-4 no-print">
        <h3 class="font-bold mb-3 text-sm text-gray-600"><i class="fas fa-chart-line mr-1"></i>項目ごとの原価・利益（社内参考・請求書には印字されません）</h3>
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr class="border-b text-gray-500">
              <th class="text-left py-1">品目</th>
              <th class="text-right py-1">仕入原価</th>
              <th class="text-right py-1">利益率</th>
              <th class="text-right py-1">利益額</th>
              <th class="text-right py-1">消費税</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => `
              <tr class="border-b">
                <td class="py-1">${esc(it.name)}</td>
                <td class="text-right py-1">${yen(it.cost_amount)}</td>
                <td class="text-right py-1">${Number(it.fee_percent).toFixed(1)}%</td>
                <td class="text-right py-1 text-green-600 font-bold">${yen(it.profit_amount)}</td>
                <td class="text-right py-1">${yen(it.tax_amount)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="font-bold border-t-2">
              <td class="py-1">合計</td>
              <td class="text-right py-1">${yen(invoice.subtotal_cost)}</td>
              <td class="text-right py-1"></td>
              <td class="text-right py-1 text-green-600">${yen(invoice.fee_amount)}</td>
              <td class="text-right py-1">${yen(invoice.tax_amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    document.getElementById('print-btn').onclick = () => window.print();
    document.getElementById('del-invoice-btn').onclick = async () => {
      if (!confirm('この請求書を削除しますか？')) return;
      await api('delete', `/api/invoices/${invoice.id}`);
      showToast('削除しました');
      location.hash = `#/customers/${invoice.customer_id}`;
    };
    document.getElementById('status-select').onchange = async (e) => {
      await api('put', `/api/invoices/${invoice.id}/status`, { status: e.target.value });
      showToast('更新しました');
    };
  });

  // ==================================================
  // 設定
  // ==================================================
  route('/settings', async () => {
    const el = contentContainer();
    const settings = await api('get', '/api/settings');
    el.innerHTML = `
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-cog mr-2"></i>設定</h2>

      <div class="card p-5 mb-4">
        <h3 class="font-bold mb-3">自社情報（請求書に印字されます）</h3>
        <label class="text-sm text-gray-500">屋号・会社名</label>
        <input id="s-company" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.company_name)}" />
        <label class="text-sm text-gray-500">お名前</label>
        <input id="s-owner" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.owner_name)}" />
        <label class="text-sm text-gray-500">郵便番号</label>
        <input id="s-postal" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.postal_code)}" />
        <label class="text-sm text-gray-500">住所</label>
        <input id="s-address" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.address)}" />
        <label class="text-sm text-gray-500">電話番号</label>
        <input id="s-phone" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.phone)}" />
        <label class="text-sm text-gray-500">メールアドレス</label>
        <input id="s-email" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.email)}" />
      </div>

      <div class="card p-5 mb-4">
        <h3 class="font-bold mb-3">振込先口座</h3>
        <label class="text-sm text-gray-500">銀行名</label>
        <input id="s-bank-name" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.bank_name)}" />
        <label class="text-sm text-gray-500">支店名</label>
        <input id="s-bank-branch" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.bank_branch)}" />
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-sm text-gray-500">口座種別</label>
            <input id="s-bank-type" class="w-full border rounded-lg p-3 big-tap" value="${esc(settings.bank_account_type)}" placeholder="普通/当座" />
          </div>
          <div>
            <label class="text-sm text-gray-500">口座番号</label>
            <input id="s-bank-number" class="w-full border rounded-lg p-3 big-tap" value="${esc(settings.bank_account_number)}" />
          </div>
        </div>
        <label class="text-sm text-gray-500">口座名義</label>
        <input id="s-bank-holder" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.bank_account_holder)}" />
      </div>

      <div class="card p-5 mb-4">
        <h3 class="font-bold mb-3">請求書のデフォルト設定</h3>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-sm text-gray-500">デフォルト手数料 (%)</label>
            <input id="s-fee" type="number" step="any" class="w-full border rounded-lg p-3 big-tap" value="${settings.default_fee_percent}" />
          </div>
          <div>
            <label class="text-sm text-gray-500">デフォルト消費税 (%)</label>
            <input id="s-tax" type="number" step="any" class="w-full border rounded-lg p-3 big-tap" value="${settings.default_tax_rate}" />
          </div>
        </div>
        <label class="text-sm text-gray-500">請求書番号のプレフィックス</label>
        <input id="s-prefix" class="w-full border rounded-lg p-3 mb-3 big-tap" value="${esc(settings.invoice_prefix)}" />
      </div>

      <button id="settings-save-btn" class="w-full btn-primary rounded-lg py-3 font-bold big-tap mb-4">保存する</button>

      <div class="card p-5 mb-4">
        <h3 class="font-bold mb-3">パスワードの変更</h3>
        <input id="pw-current" type="password" placeholder="現在のパスワード" class="w-full border rounded-lg p-3 mb-3 big-tap" />
        <input id="pw-new" type="password" placeholder="新しいパスワード（4文字以上）" class="w-full border rounded-lg p-3 mb-3 big-tap" />
        <button id="pw-change-btn" class="w-full btn-secondary rounded-lg py-3 font-bold big-tap">パスワードを変更</button>
      </div>

      <button id="logout-btn" class="w-full btn-danger rounded-lg py-3 font-bold big-tap"><i class="fas fa-sign-out-alt mr-1"></i>ログアウト</button>
    `;

    document.getElementById('s-postal').addEventListener('input', () => lookupPostalCode('s-postal', 's-address'));

    document.getElementById('settings-save-btn').onclick = async () => {
      await api('put', '/api/settings', {
        company_name: document.getElementById('s-company').value,
        owner_name: document.getElementById('s-owner').value,
        postal_code: document.getElementById('s-postal').value,
        address: document.getElementById('s-address').value,
        phone: document.getElementById('s-phone').value,
        email: document.getElementById('s-email').value,
        bank_name: document.getElementById('s-bank-name').value,
        bank_branch: document.getElementById('s-bank-branch').value,
        bank_account_type: document.getElementById('s-bank-type').value,
        bank_account_number: document.getElementById('s-bank-number').value,
        bank_account_holder: document.getElementById('s-bank-holder').value,
        default_fee_percent: Number(document.getElementById('s-fee').value) || 0,
        default_tax_rate: Number(document.getElementById('s-tax').value) || 0,
        invoice_prefix: document.getElementById('s-prefix').value,
      });
      showToast('保存しました');
    };

    document.getElementById('pw-change-btn').onclick = async () => {
      const currentPassword = document.getElementById('pw-current').value;
      const newPassword = document.getElementById('pw-new').value;
      await api('post', '/api/auth/change-password', { currentPassword, newPassword });
      showToast('パスワードを変更しました');
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value = '';
    };

    document.getElementById('logout-btn').onclick = async () => {
      await api('post', '/api/auth/logout');
      location.hash = '#/login';
      render();
    };
  });
  // ---------- 画像拡大モーダル ----------
  window.openImageModal = function(src) {
    let modal = document.getElementById('img-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'img-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:16px;';
      modal.innerHTML = '<img id="img-modal-img" style="max-width:100%;max-height:90vh;object-fit:contain;border-radius:8px;box-shadow:0 4px 32px #0008;" /><button id="img-modal-close" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:28px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;">&times;</button>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function(e) {
        if (e.target === modal || e.target.id === 'img-modal-close') modal.style.display = 'none';
      });
    }
    document.getElementById('img-modal-img').src = src;
    modal.style.display = 'flex';
  };
})();
