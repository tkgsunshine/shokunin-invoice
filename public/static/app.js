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
      renderNav(hash);
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

  function renderNav(currentHash) {
    let nav = document.getElementById('top-nav');
    const navHtml = `
      <header id="top-nav" class="no-print bg-white border-b sticky top-0 z-40 shadow-sm">
        <div class="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="#/" class="text-lg font-bold text-blue-600"><i class="fas fa-file-invoice mr-2"></i>かんたん請求書</a>
          <div class="flex gap-3 text-gray-500">
            <a href="#/customers" class="p-2 hover:text-blue-600" title="お客さん"><i class="fas fa-users text-xl"></i></a>
            <a href="#/settings" class="p-2 hover:text-blue-600" title="設定"><i class="fas fa-cog text-xl"></i></a>
          </div>
        </div>
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
          <p class="text-sm text-gray-500 mb-6 text-center">合言葉（パスワード）を設定してください</p>
          <input id="setup-pw" type="password" placeholder="合言葉（4文字以上）" class="w-full border rounded-lg p-3 mb-3 big-tap" />
          <input id="setup-pw2" type="password" placeholder="もう一度入力" class="w-full border rounded-lg p-3 mb-4 big-tap" />
          <button id="setup-btn" class="w-full btn-primary rounded-lg py-3 font-bold big-tap">設定してはじめる</button>
        </div>
      </div>`;
    document.getElementById('setup-btn').onclick = async () => {
      const pw = document.getElementById('setup-pw').value;
      const pw2 = document.getElementById('setup-pw2').value;
      if (pw !== pw2) return showToast('合言葉が一致しません', true);
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
          <input id="login-pw" type="password" placeholder="合言葉" class="w-full border rounded-lg p-3 mb-4 big-tap" />
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
        <a href="#/customers" class="card p-6 flex items-center gap-4 big-tap hover:shadow-md">
          <div class="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-2xl"><i class="fas fa-users"></i></div>
          <div>
            <div class="font-bold text-lg">お客さん一覧</div>
            <div class="text-sm text-gray-500">${customers.length}件のお客さんを管理中</div>
          </div>
        </a>
        ${purchasesUnassigned.length ? `
        <a href="#/purchases/unassigned" class="card p-6 flex items-center gap-4 big-tap hover:shadow-md border-2 border-amber-300">
          <div class="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-2xl"><i class="fas fa-exclamation-triangle"></i></div>
          <div>
            <div class="font-bold text-lg">未割当の仕入れ ${purchasesUnassigned.length}件</div>
            <div class="text-sm text-gray-500">お客さんの割り当てが必要です</div>
          </div>
        </a>` : ''}
      </div>`;
  });

  // ==================================================
  // お客さん一覧
  // ==================================================
  route('/customers', async () => {
    const el = contentContainer();
    const customers = await api('get', '/api/customers');
    el.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">お客さん一覧</h2>
        <button id="add-customer-btn" class="btn-primary rounded-lg px-4 py-2 font-bold"><i class="fas fa-plus mr-1"></i>追加</button>
      </div>
      <div class="space-y-3">
        ${customers.length === 0 ? '<div class="text-center text-gray-400 py-12">まだお客さんが登録されていません</div>' : ''}
        ${customers.map((c) => `
          <a href="#/customers/${c.id}" class="card p-4 flex justify-between items-center hover:shadow-md">
            <div>
              <div class="font-bold text-lg">${esc(c.name)}</div>
              <div class="text-sm text-gray-500">${esc(c.address || '')}</div>
            </div>
            <div class="text-right text-sm text-gray-400">
              <div>請求書 ${c.invoice_count}件</div>
              <div>仕入れ ${c.purchase_count}件</div>
            </div>
          </a>`).join('')}
      </div>
      <div id="customer-modal-root"></div>`;

    document.getElementById('add-customer-btn').onclick = () => openCustomerModal();
  });

  function openCustomerModal(customer) {
    const root = document.getElementById('customer-modal-root');
    const isEdit = !!customer;
    root.innerHTML = `
      <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" id="cust-modal-bg">
        <div class="card p-6 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
          <h3 class="font-bold text-lg mb-4">${isEdit ? 'お客さん編集' : 'お客さん追加'}</h3>
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
      } else {
        await api('post', '/api/customers', data);
        showToast('追加しました');
      }
      root.innerHTML = '';
      render();
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
        <a href="#/customers" class="text-blue-600 text-sm"><i class="fas fa-chevron-left mr-1"></i>お客さん一覧へ</a>
      </div>
      <div class="card p-5 mb-4">
        <div class="flex justify-between items-start">
          <div>
            <div class="font-bold text-xl">${esc(customer.name)}</div>
            <div class="text-sm text-gray-500 mt-1">${esc(customer.address || '')}</div>
            <div class="text-sm text-gray-500">${esc(customer.phone || '')}</div>
          </div>
          <button id="edit-cust-btn" class="btn-secondary rounded-lg px-3 py-2 text-sm"><i class="fas fa-pen"></i></button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-6">
        <a href="#/purchase/capture?customer_id=${customer.id}" class="btn-primary rounded-lg py-3 text-center font-bold big-tap"><i class="fas fa-camera mr-1"></i>仕入れ取込</a>
        <a href="#/invoice/new?customer_id=${customer.id}" class="rounded-lg py-3 text-center font-bold big-tap text-white" style="background:#059669"><i class="fas fa-file-invoice mr-1"></i>請求書作成</a>
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
              <img src="/api/purchases/${p.id}/image" class="w-12 h-12 object-cover rounded-lg border" />
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
  });

  function statusLabel(status) {
    const map = { draft: '下書き', sent: '送付済み', paid: '入金済み' };
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
      <h2 class="text-xl font-bold mb-4">未割当の仕入れ</h2>
      <div class="space-y-3">
        ${purchases.map((p) => `
          <div class="card p-4">
            <div class="flex gap-3 mb-3">
              <img src="/api/purchases/${p.id}/image" class="w-16 h-16 object-cover rounded-lg border" />
              <div class="flex-1">
                <div class="font-bold">${esc(p.vendor_name || '(不明)')}</div>
                <div class="text-xs text-gray-500">${esc(p.purchase_date || '')} ・ ${esc(p.document_type || '')}</div>
                <div class="font-bold">${yen(p.total_amount)}</div>
              </div>
            </div>
            <select data-id="${p.id}" class="assign-select w-full border rounded-lg p-2 big-tap">
              <option value="">お客さんを選択...</option>
              ${customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
            </select>
          </div>`).join('')}
        ${purchases.length === 0 ? '<div class="text-center text-gray-400 py-12">未割当の仕入れはありません</div>' : ''}
      </div>`;

    document.querySelectorAll('.assign-select').forEach((sel) => {
      sel.onchange = async (e) => {
        const id = e.target.dataset.id;
        const customerId = e.target.value;
        if (!customerId) return;
        await api('put', `/api/purchases/${id}`, { customer_id: customerId });
        showToast('割り当てました');
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
          <div class="font-bold text-lg">タップして撮影 / 画像を選択</div>
          <div class="text-sm text-gray-500 mt-1">見積書・請求書・レシートの写真</div>
        </label>
        <input id="file-input" type="file" accept="image/*" capture="environment" class="file-hidden" />
      </div>
      <label class="text-sm text-gray-500">お客さん（あとで割り当ても可）</label>
      <select id="pre-customer" class="w-full border rounded-lg p-3 mb-2 big-tap">
        <option value="">未定（あとで割り当て）</option>
        ${customers.map((c) => `<option value="${c.id}" ${String(c.id) === preselect ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      <div id="preview-area"></div>`;

    document.getElementById('file-input').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const customerId = document.getElementById('pre-customer').value;

      const previewArea = document.getElementById('preview-area');
      const previewUrl = URL.createObjectURL(file);
      previewArea.innerHTML = `
        <div class="card p-4 mb-4 text-center">
          <img src="${previewUrl}" class="max-h-48 mx-auto rounded-lg mb-3" />
          <div class="text-gray-500"><div class="spinner mx-auto mb-2"></div>読み取り中...</div>
        </div>`;

      const formData = new FormData();
      formData.append('image', file);
      if (customerId) formData.append('customer_id', customerId);

      try {
        showLoading(true);
        const result = await axios.post('/api/purchases/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showLoading(false);
        location.hash = `#/purchase/${result.data.id}`;
      } catch (err) {
        showLoading(false);
        showToast('取り込みに失敗しました', true);
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
        <img src="/api/purchases/${purchase.id}/image" class="w-full max-h-64 object-contain rounded-lg border mb-4 bg-gray-50" />

        <label class="text-sm text-gray-500">お客さん</label>
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

      <button id="p-delete-btn" class="w-full btn-danger rounded-lg py-3 font-bold big-tap"><i class="fas fa-trash mr-1"></i>この仕入れを削除</button>
    `;

    let currentItems = items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit_price: i.unit_price, amount: i.amount }));
    if (currentItems.length === 0) {
      currentItems = [{ name: '', quantity: 1, unit_price: purchase.total_amount || 0, amount: purchase.total_amount || 0 }];
    }
    renderItemsList();

    function renderItemsList() {
      const list = document.getElementById('items-list');
      list.innerHTML = currentItems
        .map(
          (it, idx) => `
        <div class="flex gap-2 mb-2 items-center" data-idx="${idx}">
          <input class="item-name flex-1 border rounded-lg p-2 text-sm" placeholder="品目名" value="${esc(it.name)}" />
          <input class="item-qty w-14 border rounded-lg p-2 text-sm" type="number" step="any" placeholder="数量" value="${it.quantity}" />
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
      currentItems.push({ name: '', quantity: 1, unit_price: 0, amount: 0 });
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
      showToast('保存しました');
    };

    document.getElementById('items-save-btn').onclick = async () => {
      await api('put', `/api/purchases/${purchase.id}/items`, { items: currentItems });
      showToast('明細を保存しました');
    };

    document.getElementById('p-delete-btn').onclick = async () => {
      if (!confirm('この仕入れを削除しますか？')) return;
      await api('delete', `/api/purchases/${purchase.id}`);
      showToast('削除しました');
      location.hash = '#/';
    };
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
        unit_price: it.unit_price,
        cost_amount: it.cost_amount,
        checked: true,
      }));
    }

    el.innerHTML = `
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-file-invoice mr-2 text-green-600"></i>${isEdit ? '請求書を編集' : '請求書を作成'}</h2>

      <div class="card p-4 mb-4">
        <label class="text-sm text-gray-500">お客さん *</label>
        <select id="inv-customer" class="w-full border rounded-lg p-3 mb-3 big-tap">
          <option value="">選択してください</option>
          ${customers.map((c) => `<option value="${c.id}" ${String(c.id) === String(presetCustomerId) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-sm text-gray-500">発行日</label>
            <input id="inv-issue-date" type="date" class="w-full border rounded-lg p-3 big-tap" value="${existingInvoice?.issue_date || todayStr()}" />
          </div>
          <div>
            <label class="text-sm text-gray-500">支払期限</label>
            <input id="inv-due-date" type="date" class="w-full border rounded-lg p-3 big-tap" value="${existingInvoice?.due_date || ''}" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-sm text-gray-500">手数料 (%)</label>
            <input id="inv-fee" type="number" step="any" class="w-full border rounded-lg p-3 big-tap" value="${existingInvoice?.fee_percent ?? settings.default_fee_percent}" />
          </div>
          <div>
            <label class="text-sm text-gray-500">消費税 (%)</label>
            <input id="inv-tax" type="number" step="any" class="w-full border rounded-lg p-3 big-tap" value="${existingInvoice?.tax_rate ?? settings.default_tax_rate}" />
          </div>
        </div>
        <label class="text-sm text-gray-500">備考</label>
        <textarea id="inv-memo" class="w-full border rounded-lg p-3 big-tap">${esc(existingInvoice?.memo || '')}</textarea>
      </div>

      <div class="card p-4 mb-4">
        <div class="flex justify-between items-center mb-3">
          <h3 class="font-bold">明細（仕入れから選択 + 手動追加OK）</h3>
        </div>
        <div id="available-items-area" class="mb-4"></div>
        <button id="add-manual-item" class="text-blue-600 text-sm mb-3"><i class="fas fa-plus mr-1"></i>手動で明細を追加</button>
        <div id="selected-items-list"></div>
      </div>

      <div class="card p-4 mb-4" id="calc-summary"></div>

      <button id="inv-save-btn" class="w-full btn-primary rounded-lg py-4 font-bold text-lg big-tap mb-3">
        <i class="fas fa-check mr-1"></i>${isEdit ? '更新する' : '請求書を作成する'}
      </button>
    `;

    let selectedItems = [...existingItems];

    async function loadAvailableItems(customerId) {
      const areaEl = document.getElementById('available-items-area');
      if (!customerId) {
        areaEl.innerHTML = '<div class="text-sm text-gray-400">お客さんを選択すると未使用の仕入れ明細が表示されます</div>';
        return;
      }
      const avail = await api('get', `/api/purchases/items/available?customer_id=${customerId}`, null, { silent: true });
      if (avail.length === 0) {
        areaEl.innerHTML = '<div class="text-sm text-gray-400">未反映の仕入れ明細はありません</div>';
        return;
      }
      areaEl.innerHTML = `
        <div class="text-sm text-gray-500 mb-2">未反映の仕入れ明細（チェックして請求書に反映）</div>
        <div class="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-2">
          ${avail.map((it) => `
            <label class="flex items-center gap-2 text-sm border-b pb-2">
              <input type="checkbox" class="avail-check" data-item='${JSON.stringify({
                purchase_item_id: it.id,
                name: it.name,
                quantity: it.quantity,
                unit_price: it.unit_price,
                cost_amount: it.amount,
              }).replace(/'/g, "&apos;")}' />
              <span class="flex-1">${esc(it.name)} <span class="text-gray-400">(${esc(it.vendor_name || '')} ${esc(it.purchase_date || '')})</span></span>
              <span class="font-bold">${yen(it.amount)}</span>
            </label>`).join('')}
        </div>`;

      areaEl.querySelectorAll('.avail-check').forEach((chk) => {
        chk.onchange = (e) => {
          const data = JSON.parse(e.target.dataset.item);
          if (e.target.checked) {
            selectedItems.push({ ...data, checked: true });
          } else {
            selectedItems = selectedItems.filter((si) => si.purchase_item_id !== data.purchase_item_id);
          }
          renderSelectedItems();
        };
      });
    }

    function renderSelectedItems() {
      const list = document.getElementById('selected-items-list');
      if (selectedItems.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-sm py-2">明細がありません</div>';
      } else {
        list.innerHTML = selectedItems
          .map(
            (it, idx) => `
          <div class="flex gap-2 mb-2 items-center" data-idx="${idx}">
            <input class="sel-name flex-1 border rounded-lg p-2 text-sm" placeholder="品目名" value="${esc(it.name)}" />
            <input class="sel-cost w-24 border rounded-lg p-2 text-sm" type="number" step="any" placeholder="原価" value="${it.cost_amount}" />
            <button class="sel-del text-red-500 p-2"><i class="fas fa-times"></i></button>
          </div>`
          )
          .join('');

        list.querySelectorAll('[data-idx]').forEach((row) => {
          const idx = Number(row.dataset.idx);
          row.querySelector('.sel-name').oninput = (e) => (selectedItems[idx].name = e.target.value);
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

    function updateSummary() {
      const feePercent = Number(document.getElementById('inv-fee').value) || 0;
      const taxRate = Number(document.getElementById('inv-tax').value) || 0;
      const subtotalCost = selectedItems.reduce((s, i) => s + (Number(i.cost_amount) || 0), 0);
      const amountBeforeTax = selectedItems.reduce((s, i) => s + Math.round((Number(i.cost_amount) || 0) * (1 + feePercent / 100)), 0);
      const feeAmount = amountBeforeTax - subtotalCost;
      const taxAmount = Math.round(amountBeforeTax * (taxRate / 100));
      const total = amountBeforeTax + taxAmount;

      document.getElementById('calc-summary').innerHTML = `
        <div class="flex justify-between text-sm mb-1"><span>仕入原価合計</span><span>${yen(subtotalCost)}</span></div>
        <div class="flex justify-between text-sm mb-1"><span>手数料 (${feePercent}%)</span><span>${yen(feeAmount)}</span></div>
        <div class="flex justify-between text-sm mb-1 border-b pb-2"><span>小計</span><span>${yen(amountBeforeTax)}</span></div>
        <div class="flex justify-between text-sm mb-1"><span>消費税 (${taxRate}%)</span><span>${yen(taxAmount)}</span></div>
        <div class="flex justify-between font-bold text-xl mt-2"><span>合計金額</span><span class="text-green-600">${yen(total)}</span></div>
      `;
    }

    document.getElementById('add-manual-item').onclick = () => {
      selectedItems.push({ purchase_item_id: null, name: '', quantity: 1, unit_price: 0, cost_amount: 0, checked: true });
      renderSelectedItems();
    };

    document.getElementById('inv-fee').oninput = updateSummary;
    document.getElementById('inv-tax').oninput = updateSummary;
    document.getElementById('inv-customer').onchange = (e) => loadAvailableItems(e.target.value);

    renderSelectedItems();
    if (presetCustomerId) loadAvailableItems(presetCustomerId);

    document.getElementById('inv-save-btn').onclick = async () => {
      const customerId = document.getElementById('inv-customer').value;
      if (!customerId) return showToast('お客さんを選択してください', true);
      if (selectedItems.length === 0) return showToast('明細を1件以上追加してください', true);

      const payload = {
        customer_id: Number(customerId),
        issue_date: document.getElementById('inv-issue-date').value,
        due_date: document.getElementById('inv-due-date').value,
        fee_percent: Number(document.getElementById('inv-fee').value) || 0,
        tax_rate: Number(document.getElementById('inv-tax').value) || 0,
        memo: document.getElementById('inv-memo').value,
        items: selectedItems.map((it) => ({
          purchase_item_id: it.purchase_item_id || null,
          name: it.name,
          quantity: it.quantity || 1,
          unit_price: it.unit_price || it.cost_amount || 0,
          cost_amount: Number(it.cost_amount) || 0,
        })),
      };

      let result;
      if (isEdit) {
        result = await api('put', `/api/invoices/${existingInvoice.id}`, payload);
        location.hash = `#/invoice/${existingInvoice.id}`;
      } else {
        result = await api('post', '/api/invoices', payload);
        location.hash = `#/invoice/${result.id}`;
      }
      showToast('保存しました');
    };
  }

  // ==================================================
  // 請求書表示 / 印刷
  // ==================================================
  route('/invoice/:id', async (params) => {
    const el = contentContainer();
    const { invoice, items, settings } = await api('get', `/api/invoices/${params.id}`);

    el.innerHTML = `
      <div class="flex justify-between items-center mb-4 no-print">
        <a href="#/customers/${invoice.customer_id}" class="text-blue-600 text-sm"><i class="fas fa-chevron-left mr-1"></i>お客さんへ戻る</a>
        <div class="flex gap-2">
          <a href="#/invoice/${invoice.id}/edit" class="btn-secondary rounded-lg px-3 py-2 text-sm"><i class="fas fa-pen mr-1"></i>編集</a>
          <button id="print-btn" class="btn-primary rounded-lg px-3 py-2 text-sm"><i class="fas fa-print mr-1"></i>印刷/PDF</button>
        </div>
      </div>

      <div class="mb-4 no-print">
        <label class="text-sm text-gray-500 mr-2">ステータス:</label>
        <select id="status-select" class="border rounded-lg p-2 text-sm">
          <option value="draft" ${invoice.status === 'draft' ? 'selected' : ''}>下書き</option>
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

        <div class="text-center mb-8">
          <div class="text-sm text-gray-500">ご請求金額</div>
          <div class="text-3xl font-bold">${yen(invoice.total_amount)}</div>
        </div>

        <table class="w-full text-sm mb-6 border-collapse">
          <thead>
            <tr class="border-b-2 border-gray-800">
              <th class="text-left py-2">品目</th>
              <th class="text-right py-2 w-20">数量</th>
              <th class="text-right py-2 w-28">単価</th>
              <th class="text-right py-2 w-28">金額</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => `
              <tr class="border-b">
                <td class="py-2">${esc(it.name)}</td>
                <td class="text-right py-2">${it.quantity}</td>
                <td class="text-right py-2">${yen(it.billed_amount / (it.quantity || 1))}</td>
                <td class="text-right py-2">${yen(it.billed_amount)}</td>
              </tr>`).join('')}
          </tbody>
        </table>

        <div class="flex justify-end mb-8">
          <div class="w-64 text-sm">
            <div class="flex justify-between py-1"><span>小計</span><span>${yen(invoice.amount_before_tax)}</span></div>
            <div class="flex justify-between py-1 border-b"><span>消費税 (${invoice.tax_rate}%)</span><span>${yen(invoice.tax_amount)}</span></div>
            <div class="flex justify-between py-2 font-bold text-lg"><span>合計</span><span>${yen(invoice.total_amount)}</span></div>
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
    `;

    document.getElementById('print-btn').onclick = () => window.print();
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
        <h3 class="font-bold mb-3">合言葉の変更</h3>
        <input id="pw-current" type="password" placeholder="現在の合言葉" class="w-full border rounded-lg p-3 mb-3 big-tap" />
        <input id="pw-new" type="password" placeholder="新しい合言葉（4文字以上）" class="w-full border rounded-lg p-3 mb-3 big-tap" />
        <button id="pw-change-btn" class="w-full btn-secondary rounded-lg py-3 font-bold big-tap">合言葉を変更</button>
      </div>

      <button id="logout-btn" class="w-full btn-danger rounded-lg py-3 font-bold big-tap"><i class="fas fa-sign-out-alt mr-1"></i>ログアウト</button>
    `;

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
      showToast('合言葉を変更しました');
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value = '';
    };

    document.getElementById('logout-btn').onclick = async () => {
      await api('post', '/api/auth/logout');
      location.hash = '#/login';
      render();
    };
  });
})();
