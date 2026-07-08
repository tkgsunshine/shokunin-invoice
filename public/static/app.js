// 職人かんたん請求書 - フロントエンドSPA (バニラJS + axios + Tailwind CDN)
;(function () {
  const app = document.getElementById('app')
  let STATE = {
    settings: null,
    customers: [],
    currentCustomerId: null,
  }

  // ---------- ユーティリティ ----------
  function yen(n) {
    const num = Math.round(Number(n) || 0)
    return '¥' + num.toLocaleString('ja-JP')
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10)
  }

  function toast(msg, isError) {
    const el = document.createElement('div')
    el.className = 'toast'
    if (isError) el.style.background = '#dc2626'
    el.textContent = msg
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 2600)
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[m]))
  }

  async function api(method, url, data, isForm) {
    try {
      const config = { method, url, data }
      if (isForm) {
        config.headers = { 'Content-Type': 'multipart/form-data' }
      }
      const res = await axios(config)
      return res.data
    } catch (e) {
      if (e.response && e.response.status === 401) {
        renderLogin()
        throw e
      }
      const msg = e.response?.data?.error || 'エラーが発生しました'
      toast(msg, true)
      throw e
    }
  }

  // ---------- ルーティング ----------
  function navigate(hash) {
    location.hash = hash
  }

  window.addEventListener('hashchange', route)

  async function route() {
    const hash = location.hash || '#/home'
    const [, path, param] = hash.match(/^#\/(\w+)(?:\/(.+))?$/) || [null, 'home', null]

    // 認証チェック
    const status = await api('get', '/api/auth/status')
    if (!status.hasPassword) {
      return renderSetup()
    }
    if (!status.authenticated) {
      return renderLogin()
    }

    switch (path) {
      case 'home':
        return renderHome()
      case 'customers':
        return renderCustomerList()
      case 'customer':
        return renderCustomerDetail(param)
      case 'upload':
        return renderUpload(param)
      case 'invoice-new':
        return renderInvoiceNew(param)
      case 'invoice-view':
        return renderInvoiceView(param)
      case 'settings':
        return renderSettings()
      default:
        return renderHome()
    }
  }

  // ---------- 共通レイアウト ----------
  function shell(contentHtml, opts) {
    opts = opts || {}
    const showNav = opts.showNav !== false
    app.innerHTML = `
      <div class="min-h-screen ${showNav ? 'pb-24' : ''}">
        <header class="bg-orange-500 text-white px-4 py-4 flex items-center justify-between shadow no-print">
          <div class="flex items-center gap-2">
            ${opts.back ? `<button id="back-btn" class="text-2xl mr-1"><i class="fas fa-chevron-left"></i></button>` : ''}
            <h1 class="text-lg font-black tracking-wide">${opts.title || '職人かんたん請求書'}</h1>
          </div>
          ${opts.headerRight || ''}
        </header>
        <main class="max-w-2xl mx-auto p-4">
          ${contentHtml}
        </main>
        ${showNav ? bottomNav(opts.active) : ''}
      </div>
    `
    const backBtn = document.getElementById('back-btn')
    if (backBtn) backBtn.onclick = () => history.back()
  }

  function bottomNav(active) {
    const items = [
      { key: 'home', icon: 'fa-house', label: 'ホーム', hash: '#/home' },
      { key: 'customers', icon: 'fa-users', label: 'お客様', hash: '#/customers' },
      { key: 'upload', icon: 'fa-camera', label: '仕入取込', hash: '#/upload' },
      { key: 'settings', icon: 'fa-gear', label: '設定', hash: '#/settings' },
    ]
    return `
      <nav class="bottom-nav no-print">
        ${items
          .map(
            (it) => `
          <button data-hash="${it.hash}" class="${active === it.key ? 'active' : ''}">
            <i class="fas ${it.icon}"></i>${it.label}
          </button>`
          )
          .join('')}
      </nav>
      <script>
        document.querySelectorAll('.bottom-nav button').forEach(b => {
          b.addEventListener('click', () => { location.hash = b.dataset.hash })
        })
      </script>
    `
  }

  // ---------- ログイン / 初期設定 ----------
  function renderSetup() {
    app.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-6">
        <div class="card p-8 w-full max-w-sm">
          <div class="text-center mb-6">
            <i class="fas fa-helmet-safety text-5xl text-orange-500"></i>
            <h1 class="text-xl font-black mt-3">はじめに合言葉を決めてください</h1>
            <p class="text-gray-500 text-sm mt-2">この端末からアプリを使う時に入力します</p>
          </div>
          <label class="field-label">合言葉(4文字以上)</label>
          <input type="password" id="setup-password" class="mb-4" placeholder="例: 1234abcd" />
          <button id="setup-btn" class="big-btn bg-orange-500 text-white w-full">はじめる</button>
        </div>
      </div>
    `
    document.getElementById('setup-btn').onclick = async () => {
      const password = document.getElementById('setup-password').value
      try {
        await api('post', '/api/auth/setup', { password })
        toast('設定しました')
        navigate('#/home')
        route()
      } catch {}
    }
  }

  function renderLogin() {
    app.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-6">
        <div class="card p-8 w-full max-w-sm">
          <div class="text-center mb-6">
            <i class="fas fa-helmet-safety text-5xl text-orange-500"></i>
            <h1 class="text-xl font-black mt-3">職人かんたん請求書</h1>
          </div>
          <label class="field-label">合言葉</label>
          <input type="password" id="login-password" class="mb-4" placeholder="合言葉を入力" />
          <button id="login-btn" class="big-btn bg-orange-500 text-white w-full">ログイン</button>
        </div>
      </div>
    `
    const doLogin = async () => {
      const password = document.getElementById('login-password').value
      try {
        await api('post', '/api/auth/login', { password })
        navigate('#/home')
        route()
      } catch {}
    }
    document.getElementById('login-btn').onclick = doLogin
    document.getElementById('login-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin()
    })
  }

  // ---------- ホーム ----------
  async function renderHome() {
    shell(
      `
      <div class="space-y-4 mt-2">
        <button data-go="#/upload" class="big-btn bg-orange-500 text-white w-full flex items-center justify-center gap-3">
          <i class="fas fa-camera text-2xl"></i> 仕入れの写真を取り込む
        </button>
        <button data-go="#/invoice-new" class="big-btn bg-blue-600 text-white w-full flex items-center justify-center gap-3">
          <i class="fas fa-file-invoice text-2xl"></i> 請求書を作る
        </button>
        <button data-go="#/customers" class="big-btn bg-gray-700 text-white w-full flex items-center justify-center gap-3">
          <i class="fas fa-users text-2xl"></i> お客様を管理する
        </button>
      </div>
      <div id="recent-invoices" class="mt-8"></div>
      `,
      { active: 'home' }
    )
    document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => navigate(b.dataset.go)))

    const invoices = await api('get', '/api/invoices')
    const recent = invoices.slice(0, 5)
    const box = document.getElementById('recent-invoices')
    box.innerHTML = `
      <h2 class="font-bold text-gray-600 mb-2">最近の請求書</h2>
      ${
        recent.length === 0
          ? `<p class="text-gray-400 text-sm">まだ請求書がありません</p>`
          : recent
              .map(
                (inv) => `
          <div class="card p-4 mb-2 flex justify-between items-center cursor-pointer" data-inv="${inv.id}">
            <div>
              <div class="font-bold">${escapeHtml(inv.customer_name)} 様</div>
              <div class="text-xs text-gray-400">${inv.invoice_number} / ${inv.issue_date}</div>
            </div>
            <div class="text-lg font-black text-orange-600">${yen(inv.total_amount)}</div>
          </div>`
              )
              .join('')
      }
    `
    box.querySelectorAll('[data-inv]').forEach((el) => (el.onclick = () => navigate('#/invoice-view/' + el.dataset.inv)))
  }

  // ---------- 顧客一覧 ----------
  async function renderCustomerList() {
    shell(
      `
      <button id="add-customer-btn" class="big-btn bg-orange-500 text-white w-full mb-4 flex items-center justify-center gap-2">
        <i class="fas fa-plus"></i> 新しいお客様を追加
      </button>
      <div id="customer-list"></div>
      `,
      { active: 'customers', title: 'お客様管理', back: true }
    )

    document.getElementById('add-customer-btn').onclick = () => openCustomerModal()

    const customers = await api('get', '/api/customers')
    STATE.customers = customers
    const list = document.getElementById('customer-list')
    if (customers.length === 0) {
      list.innerHTML = `<p class="text-gray-400 text-center mt-8">お客様がまだ登録されていません</p>`
      return
    }
    list.innerHTML = customers
      .map(
        (c) => `
      <div class="card p-4 mb-3 cursor-pointer" data-c="${c.id}">
        <div class="flex justify-between items-center">
          <div class="font-bold text-lg">${escapeHtml(c.name)} 様</div>
          <i class="fas fa-chevron-right text-gray-300"></i>
        </div>
        <div class="text-xs text-gray-400 mt-1">仕入れ ${c.purchase_count}件 / 請求書 ${c.invoice_count}件</div>
      </div>
    `
      )
      .join('')
    list.querySelectorAll('[data-c]').forEach((el) => (el.onclick = () => navigate('#/customer/' + el.dataset.c)))
  }

  function openCustomerModal(customer) {
    const isEdit = !!customer
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50'
    modal.innerHTML = `
      <div class="card p-6 w-full max-w-sm m-3">
        <h2 class="text-lg font-black mb-4">${isEdit ? 'お客様を編集' : '新しいお客様'}</h2>
        <label class="field-label">お名前(会社名)</label>
        <input type="text" id="m-name" class="mb-3" value="${escapeHtml(customer?.name || '')}" placeholder="例: 山田太郎" />
        <label class="field-label">郵便番号</label>
        <input type="text" id="m-postal" class="mb-3" value="${escapeHtml(customer?.postal_code || '')}" placeholder="例: 123-4567" />
        <label class="field-label">住所</label>
        <input type="text" id="m-address" class="mb-3" value="${escapeHtml(customer?.address || '')}" />
        <label class="field-label">電話番号</label>
        <input type="tel" id="m-phone" class="mb-3" value="${escapeHtml(customer?.phone || '')}" />
        <label class="field-label">メモ</label>
        <textarea id="m-memo" class="mb-4" rows="2">${escapeHtml(customer?.memo || '')}</textarea>
        <div class="flex gap-2">
          <button id="m-cancel" class="big-btn bg-gray-200 text-gray-700 flex-1">キャンセル</button>
          <button id="m-save" class="big-btn bg-orange-500 text-white flex-1">保存</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
    document.getElementById('m-cancel').onclick = () => modal.remove()
    document.getElementById('m-save').onclick = async () => {
      const data = {
        name: document.getElementById('m-name').value.trim(),
        postal_code: document.getElementById('m-postal').value.trim(),
        address: document.getElementById('m-address').value.trim(),
        phone: document.getElementById('m-phone').value.trim(),
        memo: document.getElementById('m-memo').value.trim(),
      }
      if (!data.name) return toast('お名前を入力してください', true)
      try {
        if (isEdit) {
          await api('put', `/api/customers/${customer.id}`, data)
        } else {
          await api('post', '/api/customers', data)
        }
        modal.remove()
        toast('保存しました')
        route()
      } catch {}
    }
  }

  // ---------- 顧客詳細 ----------
  async function renderCustomerDetail(id) {
    shell(`<div id="detail-content" class="text-center py-10"><div class="spinner mx-auto"></div></div>`, {
      active: 'customers',
      title: 'お客様詳細',
      back: true,
    })
    const data = await api('get', `/api/customers/${id}`)
    const { customer, purchases, invoices } = data
    const box = document.getElementById('detail-content')
    box.innerHTML = `
      <div class="card p-5 mb-4">
        <div class="flex justify-between items-start">
          <div>
            <div class="text-xl font-black">${escapeHtml(customer.name)} 様</div>
            <div class="text-sm text-gray-500 mt-1">${escapeHtml(customer.address || '')}</div>
            <div class="text-sm text-gray-500">${escapeHtml(customer.phone || '')}</div>
          </div>
          <button id="edit-c-btn" class="text-orange-500"><i class="fas fa-pen"></i></button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <button id="new-purchase-btn" class="big-btn bg-orange-500 text-white text-sm flex flex-col items-center gap-1 py-3">
          <i class="fas fa-camera text-xl"></i>仕入れ取込
        </button>
        <button id="new-invoice-btn" class="big-btn bg-blue-600 text-white text-sm flex flex-col items-center gap-1 py-3">
          <i class="fas fa-file-invoice text-xl"></i>請求書作成
        </button>
      </div>

      <h3 class="font-bold text-gray-600 mb-2">請求書履歴</h3>
      <div class="mb-6">
        ${
          invoices.length === 0
            ? `<p class="text-gray-400 text-sm">まだありません</p>`
            : invoices
                .map(
                  (inv) => `
          <div class="card p-3 mb-2 flex justify-between items-center cursor-pointer" data-inv="${inv.id}">
            <div>
              <div class="font-bold text-sm">${inv.invoice_number}</div>
              <div class="text-xs text-gray-400">${inv.issue_date}</div>
            </div>
            <div class="font-black text-orange-600">${yen(inv.total_amount)}</div>
          </div>`
                )
                .join('')
        }
      </div>

      <h3 class="font-bold text-gray-600 mb-2">仕入れ取込履歴</h3>
      <div>
        ${
          purchases.length === 0
            ? `<p class="text-gray-400 text-sm">まだありません</p>`
            : purchases
                .map(
                  (p) => `
          <div class="card p-3 mb-2 flex items-center gap-3 cursor-pointer" data-p="${p.id}">
            <img src="/api/purchases/${p.id}/image" class="w-14 h-14 object-cover rounded-lg border" />
            <div class="flex-1">
              <div class="font-bold text-sm">${escapeHtml(p.vendor_name || '(業者名未設定)')}</div>
              <div class="text-xs text-gray-400">${escapeHtml(p.document_type || '')} ${p.purchase_date || ''}</div>
            </div>
            <div class="font-black">${yen(p.total_amount)}</div>
          </div>`
                )
                .join('')
        }
      </div>
    `
    document.getElementById('edit-c-btn').onclick = () => openCustomerModal(customer)
    document.getElementById('new-purchase-btn').onclick = () => navigate('#/upload/' + id)
    document.getElementById('new-invoice-btn').onclick = () => navigate('#/invoice-new/' + id)
    box.querySelectorAll('[data-inv]').forEach((el) => (el.onclick = () => navigate('#/invoice-view/' + el.dataset.inv)))
    box.querySelectorAll('[data-p]').forEach((el) => (el.onclick = () => openPurchaseModal(el.dataset.p, id)))
  }

  async function openPurchaseModal(purchaseId, customerId) {
    const data = await api('get', `/api/purchases/${purchaseId}`)
    const { purchase, items } = data
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3'
    modal.innerHTML = `
      <div class="card p-5 w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-3">
          <h2 class="font-black text-lg">仕入れ内容</h2>
          <button id="pm-close" class="text-2xl text-gray-400">&times;</button>
        </div>
        <img src="/api/purchases/${purchase.id}/image" class="w-full rounded-lg border mb-3 max-h-64 object-contain bg-gray-50" />
        <div class="text-sm text-gray-500 mb-2">業者: ${escapeHtml(purchase.vendor_name || '-')} / ${escapeHtml(
      purchase.document_type || ''
    )} / ${purchase.purchase_date || ''}</div>
        <table class="w-full text-sm mb-3">
          <thead><tr class="text-gray-400 text-left"><th>品目</th><th class="text-right">数量</th><th class="text-right">金額</th></tr></thead>
          <tbody>
            ${items
              .map(
                (it) => `<tr class="border-t"><td class="py-1">${escapeHtml(it.name)}${
                  it.used_in_invoice_id ? ' <span class="text-xs text-blue-500">(請求済)</span>' : ''
                }</td><td class="text-right">${it.quantity}</td><td class="text-right">${yen(it.amount)}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
        <div class="text-right font-black mb-3">合計 ${yen(purchase.total_amount)}</div>
        <button id="pm-delete" class="big-btn bg-red-100 text-red-600 w-full text-sm py-2">この仕入れ情報を削除</button>
      </div>
    `
    document.body.appendChild(modal)
    document.getElementById('pm-close').onclick = () => modal.remove()
    document.getElementById('pm-delete').onclick = async () => {
      if (!confirm('この仕入れ情報を削除しますか？')) return
      try {
        await api('delete', `/api/purchases/${purchase.id}`)
        modal.remove()
        toast('削除しました')
        route()
      } catch {}
    }
  }

  // ---------- 仕入れ取込 ----------
  async function renderUpload(customerId) {
    if (!STATE.customers.length) STATE.customers = await api('get', '/api/customers')

    shell(
      `
      <div class="card p-6 text-center">
        <i class="fas fa-receipt text-4xl text-orange-400 mb-3"></i>
        <p class="text-gray-600 mb-4 font-bold">見積もり・請求書・レシートの写真を選んでください</p>

        <label class="field-label text-left">お客様(あとで選んでもOK)</label>
        <select id="up-customer" class="mb-4">
          <option value="">まだ決めない</option>
          ${STATE.customers
            .map((c) => `<option value="${c.id}" ${String(c.id) === String(customerId) ? 'selected' : ''}>${escapeHtml(c.name)} 様</option>`)
            .join('')}
        </select>

        <input type="file" id="up-file" accept="image/*" capture="environment" class="hidden" />
        <button id="up-choose" class="big-btn bg-orange-500 text-white w-full mb-3 flex items-center justify-center gap-2">
          <i class="fas fa-camera"></i> 写真を撮る・選ぶ
        </button>
        <div id="up-preview"></div>
      </div>
      <div id="up-result" class="mt-4"></div>
      `,
      { active: 'upload', title: '仕入れ取込', back: true }
    )

    const fileInput = document.getElementById('up-file')
    document.getElementById('up-choose').onclick = () => fileInput.click()
    fileInput.onchange = async () => {
      const file = fileInput.files[0]
      if (!file) return
      const preview = document.getElementById('up-preview')
      preview.innerHTML = `<img src="${URL.createObjectURL(file)}" class="w-full rounded-lg border mt-3 max-h-56 object-contain" />`

      const resultBox = document.getElementById('up-result')
      resultBox.innerHTML = `<div class="text-center py-8"><div class="spinner mx-auto mb-2"></div><p class="text-gray-500 font-bold">画像を読み取っています...</p></div>`

      const form = new FormData()
      form.append('image', file)
      const custVal = document.getElementById('up-customer').value
      if (custVal) form.append('customer_id', custVal)

      try {
        const res = await api('post', '/api/purchases', form, true)
        renderUploadResult(res, custVal)
      } catch (e) {
        resultBox.innerHTML = `<p class="text-red-500 text-center">読み取りに失敗しました。もう一度お試しください。</p>`
      }
    }
  }

  function renderUploadResult(res, customerId) {
    const resultBox = document.getElementById('up-result')
    const items = res.items || []
    resultBox.innerHTML = `
      <div class="card p-5">
        <h3 class="font-black mb-3"><i class="fas fa-check-circle text-green-500"></i> 読み取り結果</h3>
        ${res.ocrError ? `<p class="text-red-500 text-sm mb-2">${escapeHtml(res.ocrError)}(手動で入力してください)</p>` : ''}
        <label class="field-label">業者名</label>
        <input type="text" id="r-vendor" class="mb-3" value="${escapeHtml(res.ocrResult?.vendor_name || '')}" />
        <label class="field-label">書類の種類</label>
        <select id="r-doctype" class="mb-3">
          ${['見積書', '請求書', 'レシート', 'その他']
            .map((t) => `<option ${t === res.ocrResult?.document_type ? 'selected' : ''}>${t}</option>`)
            .join('')}
        </select>
        <label class="field-label">日付</label>
        <input type="date" id="r-date" class="mb-3" value="${res.ocrResult?.purchase_date || ''}" />

        <label class="field-label">明細</label>
        <div id="r-items" class="space-y-2 mb-2">
          ${items
            .map(
              (it, idx) => `
            <div class="flex gap-2 items-center" data-item-row="${idx}">
              <input type="text" class="flex-1 text-sm" data-field="name" value="${escapeHtml(it.name)}" />
              <input type="number" class="w-16 text-sm" data-field="quantity" value="${it.quantity}" />
              <input type="number" class="w-24 text-sm" data-field="amount" value="${it.amount}" />
              <button data-remove="${idx}" class="text-red-400"><i class="fas fa-trash"></i></button>
            </div>`
            )
            .join('')}
        </div>
        <button id="r-add-item" class="text-orange-500 text-sm font-bold mb-3"><i class="fas fa-plus"></i> 項目を追加</button>

        <label class="field-label">合計金額</label>
        <input type="number" id="r-total" class="mb-4" value="${res.ocrResult?.total_amount || 0}" />

        <button id="r-save" class="big-btn bg-green-600 text-white w-full">この内容で保存する</button>
      </div>
    `

    function bindRemove() {
      resultBox.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.onclick = () => btn.closest('[data-item-row]').remove()
      })
    }
    bindRemove()

    document.getElementById('r-add-item').onclick = () => {
      const container = document.getElementById('r-items')
      const row = document.createElement('div')
      row.className = 'flex gap-2 items-center'
      row.setAttribute('data-item-row', 'new')
      row.innerHTML = `
        <input type="text" class="flex-1 text-sm" data-field="name" placeholder="品目名" />
        <input type="number" class="w-16 text-sm" data-field="quantity" value="1" />
        <input type="number" class="w-24 text-sm" data-field="amount" value="0" />
        <button data-remove="new"><i class="fas fa-trash text-red-400"></i></button>
      `
      container.appendChild(row)
      bindRemove()
    }

    document.getElementById('r-save').onclick = async () => {
      const purchaseId = res.id
      await api('put', `/api/purchases/${purchaseId}`, {
        customer_id: customerId || null,
        vendor_name: document.getElementById('r-vendor').value,
        document_type: document.getElementById('r-doctype').value,
        purchase_date: document.getElementById('r-date').value,
        total_amount: Number(document.getElementById('r-total').value) || 0,
      })

      // 既存アイテム更新・新規追加
      const rows = resultBox.querySelectorAll('[data-item-row]')
      const existingIds = items.map((it) => it.id)
      let idx = 0
      for (const row of rows) {
        const name = row.querySelector('[data-field="name"]').value
        const quantity = Number(row.querySelector('[data-field="quantity"]').value) || 1
        const amount = Number(row.querySelector('[data-field="amount"]').value) || 0
        const rowKey = row.getAttribute('data-item-row')
        if (rowKey !== 'new' && existingIds[Number(rowKey)]) {
          await api('put', `/api/purchases/items/${existingIds[Number(rowKey)]}`, {
            name,
            quantity,
            unit_price: quantity ? amount / quantity : amount,
            amount,
          })
        } else {
          await api('post', `/api/purchases/${purchaseId}/items`, {
            name,
            quantity,
            unit_price: quantity ? amount / quantity : amount,
            amount,
          })
        }
        idx++
      }

      toast('保存しました')
      if (customerId) {
        navigate('#/customer/' + customerId)
      } else {
        navigate('#/home')
      }
    }
  }

  // ---------- 請求書作成 ----------
  async function renderInvoiceNew(customerId) {
    if (!STATE.customers.length) STATE.customers = await api('get', '/api/customers')
    if (!STATE.settings) STATE.settings = await api('get', '/api/settings')

    shell(
      `
      <div class="card p-5 mb-4">
        <label class="field-label">お客様</label>
        <select id="inv-customer" class="mb-2">
          <option value="">選んでください</option>
          ${STATE.customers
            .map((c) => `<option value="${c.id}" ${String(c.id) === String(customerId) ? 'selected' : ''}>${escapeHtml(c.name)} 様</option>`)
            .join('')}
        </select>
      </div>
      <div id="inv-items-area"></div>
      `,
      { active: 'home', title: '請求書を作る', back: true }
    )

    const select = document.getElementById('inv-customer')
    const loadItems = async () => {
      const cid = select.value
      const area = document.getElementById('inv-items-area')
      if (!cid) {
        area.innerHTML = ''
        return
      }
      area.innerHTML = `<div class="text-center py-6"><div class="spinner mx-auto"></div></div>`
      const items = await api('get', `/api/invoices/available-items?customer_id=${cid}`)
      renderInvoiceItemsForm(area, cid, items)
    }
    select.onchange = loadItems
    if (customerId) loadItems()
  }

  function renderInvoiceItemsForm(area, customerId, items) {
    const feeDefault = STATE.settings?.default_fee_percent ?? 20
    const taxDefault = STATE.settings?.default_tax_rate ?? 10

    area.innerHTML = `
      <div class="card p-5 mb-4">
        <h3 class="font-black mb-2">請求する項目を選ぶ</h3>
        ${
          items.length === 0
            ? `<p class="text-gray-400 text-sm">未請求の仕入れ項目がありません。先に仕入れを取り込んでください。</p>`
            : `<div id="inv-item-list" class="space-y-2">
          ${items
            .map(
              (it) => `
            <label class="flex items-center gap-3 border-b pb-2">
              <input type="checkbox" class="w-5 h-5" data-inv-item="${it.id}" checked
                data-name="${escapeHtml(it.name)}" data-qty="${it.quantity}" data-unit="${it.unit_price}" data-cost="${it.amount}" />
              <span class="flex-1 text-sm">${escapeHtml(it.name)} <span class="text-gray-400 text-xs">(${escapeHtml(it.vendor_name || '')})</span></span>
              <span class="font-bold">${yen(it.amount)}</span>
            </label>`
            )
            .join('')}
          </div>`
        }
      </div>

      ${
        items.length > 0
          ? `
      <div class="card p-5 mb-4">
        <label class="field-label">手数料(％)</label>
        <input type="number" id="inv-fee" value="${feeDefault}" class="mb-3" />
        <label class="field-label">消費税(％)</label>
        <input type="number" id="inv-tax" value="${taxDefault}" class="mb-3" />
        <label class="field-label">発行日</label>
        <input type="date" id="inv-date" value="${todayStr()}" class="mb-3" />
        <label class="field-label">支払期限</label>
        <input type="date" id="inv-due" class="mb-3" />
        <label class="field-label">備考</label>
        <textarea id="inv-memo" rows="2" class="mb-2"></textarea>
      </div>

      <div class="card p-5 mb-4" id="inv-preview"></div>

      <button id="inv-create-btn" class="big-btn bg-blue-600 text-white w-full mb-8">請求書を作成する</button>
      `
          : ''
      }
    `

    if (items.length === 0) return

    const feeInput = document.getElementById('inv-fee')
    const taxInput = document.getElementById('inv-tax')
    const previewBox = document.getElementById('inv-preview')

    function updatePreview() {
      const fee = Number(feeInput.value) || 0
      const tax = Number(taxInput.value) || 0
      const checked = area.querySelectorAll('[data-inv-item]:checked')
      let subtotal = 0
      checked.forEach((cb) => (subtotal += Number(cb.dataset.cost)))
      const afterFee = Math.round(subtotal * (1 + fee / 100))
      const taxAmount = Math.round(afterFee * (tax / 100))
      const total = afterFee + taxAmount
      previewBox.innerHTML = `
        <div class="flex justify-between text-sm text-gray-500 mb-1"><span>仕入れ原価合計</span><span>${yen(subtotal)}</span></div>
        <div class="flex justify-between text-sm text-gray-500 mb-1"><span>手数料(${fee}%)</span><span>${yen(afterFee - subtotal)}</span></div>
        <div class="flex justify-between text-sm text-gray-500 mb-1"><span>消費税(${tax}%)</span><span>${yen(taxAmount)}</span></div>
        <div class="flex justify-between text-xl font-black text-orange-600 border-t mt-2 pt-2"><span>ご請求額</span><span>${yen(total)}</span></div>
      `
    }
    area.querySelectorAll('[data-inv-item]').forEach((cb) => (cb.onchange = updatePreview))
    feeInput.oninput = updatePreview
    taxInput.oninput = updatePreview
    updatePreview()

    document.getElementById('inv-create-btn').onclick = async () => {
      const checked = [...area.querySelectorAll('[data-inv-item]:checked')]
      if (checked.length === 0) return toast('項目を1つ以上選んでください', true)

      const payload = {
        customer_id: Number(customerId),
        fee_percent: Number(feeInput.value) || 0,
        tax_rate: Number(taxInput.value) || 0,
        issue_date: document.getElementById('inv-date').value,
        due_date: document.getElementById('inv-due').value,
        memo: document.getElementById('inv-memo').value,
        items: checked.map((cb) => ({
          purchase_item_id: Number(cb.dataset.invItem),
          name: cb.dataset.name,
          quantity: Number(cb.dataset.qty),
          unit_price: Number(cb.dataset.unit),
          cost_amount: Number(cb.dataset.cost),
        })),
      }

      try {
        const res = await api('post', '/api/invoices', payload)
        toast('請求書を作成しました')
        navigate('#/invoice-view/' + res.id)
      } catch {}
    }
  }

  // ---------- 請求書表示(印刷用) ----------
  async function renderInvoiceView(id) {
    const data = await api('get', `/api/invoices/${id}`)
    const { invoice, customer, items, settings } = data

    app.innerHTML = `
      <div class="min-h-screen">
        <header class="bg-orange-500 text-white px-4 py-4 flex items-center justify-between shadow no-print">
          <button id="back-btn" class="text-2xl"><i class="fas fa-chevron-left"></i></button>
          <h1 class="text-lg font-black">請求書</h1>
          <button id="print-btn" class="text-2xl"><i class="fas fa-print"></i></button>
        </header>
        <main class="max-w-2xl mx-auto p-4 pb-24">
          <div class="card print-page p-8 bg-white">
            <div class="flex justify-between items-start mb-6">
              <h2 class="text-2xl font-black tracking-widest">請求書</h2>
              <div class="text-right text-sm text-gray-500">
                <div>No. ${escapeHtml(invoice.invoice_number || '')}</div>
                <div>発行日: ${invoice.issue_date || ''}</div>
                ${invoice.due_date ? `<div>お支払期限: ${invoice.due_date}</div>` : ''}
              </div>
            </div>

            <div class="flex justify-between mb-8">
              <div>
                <div class="text-lg font-bold border-b-2 border-gray-800 pb-1 mb-2">${escapeHtml(customer?.name || '')} 様</div>
                <div class="text-sm text-gray-500">${escapeHtml(customer?.postal_code || '')}</div>
                <div class="text-sm text-gray-500">${escapeHtml(customer?.address || '')}</div>
              </div>
              <div class="text-sm text-right">
                <div class="font-bold">${escapeHtml(settings?.company_name || settings?.owner_name || '')}</div>
                <div class="text-gray-500">${escapeHtml(settings?.postal_code || '')}</div>
                <div class="text-gray-500">${escapeHtml(settings?.address || '')}</div>
                <div class="text-gray-500">TEL: ${escapeHtml(settings?.phone || '')}</div>
              </div>
            </div>

            <div class="bg-orange-50 border-2 border-orange-400 rounded-xl p-4 mb-6 text-center">
              <div class="text-sm text-gray-500">ご請求金額(税込)</div>
              <div class="text-3xl font-black text-orange-600">${yen(invoice.total_amount)}</div>
            </div>

            <table class="w-full text-sm mb-6">
              <thead>
                <tr class="border-b-2 border-gray-800 text-left">
                  <th class="py-2">品目</th>
                  <th class="py-2 text-right">数量</th>
                  <th class="py-2 text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (it) => `
                  <tr class="border-b">
                    <td class="py-2">${escapeHtml(it.name)}</td>
                    <td class="py-2 text-right">${it.quantity}</td>
                    <td class="py-2 text-right">${yen(it.billed_amount)}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>

            <div class="flex justify-end mb-6">
              <div class="w-56 text-sm">
                <div class="flex justify-between py-1"><span>小計</span><span>${yen(invoice.amount_before_tax)}</span></div>
                <div class="flex justify-between py-1"><span>消費税(${invoice.tax_rate}%)</span><span>${yen(invoice.tax_amount)}</span></div>
                <div class="flex justify-between py-2 border-t-2 border-gray-800 font-black text-base"><span>合計</span><span>${yen(invoice.total_amount)}</span></div>
              </div>
            </div>

            ${
              settings?.bank_name
                ? `
            <div class="text-sm border-t pt-4 mb-4">
              <div class="font-bold mb-1">お振込先</div>
              <div class="text-gray-600">${escapeHtml(settings.bank_name)} ${escapeHtml(settings.bank_branch || '')} ${escapeHtml(
                    settings.bank_account_type || ''
                  )} ${escapeHtml(settings.bank_account_number || '')}</div>
              <div class="text-gray-600">名義: ${escapeHtml(settings.bank_account_holder || '')}</div>
            </div>`
                : ''
            }
            ${invoice.memo ? `<div class="text-sm text-gray-500 border-t pt-3">${escapeHtml(invoice.memo)}</div>` : ''}
          </div>

          <div class="mt-4 flex gap-2 no-print">
            <select id="status-select" class="flex-1">
              ${['draft', 'issued', 'paid']
                .map(
                  (s) =>
                    `<option value="${s}" ${s === invoice.status ? 'selected' : ''}>${
                      { draft: '下書き', issued: '発行済み', paid: '入金済み' }[s]
                    }</option>`
                )
                .join('')}
            </select>
            <button id="status-save" class="big-btn bg-gray-700 text-white">状態を保存</button>
          </div>
          <button id="delete-inv-btn" class="big-btn bg-red-50 text-red-500 w-full mt-3 text-sm py-2 no-print">この請求書を削除</button>
        </main>
        ${bottomNav('')}
      </div>
    `
    document.getElementById('back-btn').onclick = () => history.back()
    document.getElementById('print-btn').onclick = () => window.print()
    document.getElementById('status-save').onclick = async () => {
      await api('put', `/api/invoices/${id}`, {
        status: document.getElementById('status-select').value,
        memo: invoice.memo,
        due_date: invoice.due_date,
      })
      toast('保存しました')
    }
    document.getElementById('delete-inv-btn').onclick = async () => {
      if (!confirm('この請求書を削除しますか？(仕入れ項目は未請求に戻ります)')) return
      await api('delete', `/api/invoices/${id}`)
      toast('削除しました')
      navigate('#/home')
    }
  }

  // ---------- 設定 ----------
  async function renderSettings() {
    const settings = await api('get', '/api/settings')
    STATE.settings = settings
    shell(
      `
      <div class="card p-5 mb-4">
        <h3 class="font-black mb-3">自社情報(請求書に印字されます)</h3>
        <label class="field-label">屋号・会社名</label>
        <input type="text" id="s-company" class="mb-3" value="${escapeHtml(settings.company_name || '')}" />
        <label class="field-label">代表者名</label>
        <input type="text" id="s-owner" class="mb-3" value="${escapeHtml(settings.owner_name || '')}" />
        <label class="field-label">郵便番号</label>
        <input type="text" id="s-postal" class="mb-3" value="${escapeHtml(settings.postal_code || '')}" />
        <label class="field-label">住所</label>
        <input type="text" id="s-address" class="mb-3" value="${escapeHtml(settings.address || '')}" />
        <label class="field-label">電話番号</label>
        <input type="tel" id="s-phone" class="mb-3" value="${escapeHtml(settings.phone || '')}" />
        <label class="field-label">メール</label>
        <input type="email" id="s-email" class="mb-1" value="${escapeHtml(settings.email || '')}" />
      </div>

      <div class="card p-5 mb-4">
        <h3 class="font-black mb-3">振込先口座</h3>
        <label class="field-label">銀行名</label>
        <input type="text" id="s-bank" class="mb-3" value="${escapeHtml(settings.bank_name || '')}" />
        <label class="field-label">支店名</label>
        <input type="text" id="s-branch" class="mb-3" value="${escapeHtml(settings.bank_branch || '')}" />
        <label class="field-label">口座種別</label>
        <input type="text" id="s-accttype" class="mb-3" placeholder="普通/当座" value="${escapeHtml(settings.bank_account_type || '')}" />
        <label class="field-label">口座番号</label>
        <input type="text" id="s-acctnum" class="mb-3" value="${escapeHtml(settings.bank_account_number || '')}" />
        <label class="field-label">口座名義</label>
        <input type="text" id="s-holder" class="mb-1" value="${escapeHtml(settings.bank_account_holder || '')}" />
      </div>

      <div class="card p-5 mb-4">
        <h3 class="font-black mb-3">請求書の初期値</h3>
        <label class="field-label">手数料(％)</label>
        <input type="number" id="s-fee" class="mb-3" value="${settings.default_fee_percent ?? 20}" />
        <label class="field-label">消費税(％)</label>
        <input type="number" id="s-tax" class="mb-3" value="${settings.default_tax_rate ?? 10}" />
        <label class="field-label">請求書番号の頭文字</label>
        <input type="text" id="s-prefix" class="mb-1" value="${escapeHtml(settings.invoice_prefix || 'INV-')}" />
      </div>

      <button id="s-save" class="big-btn bg-orange-500 text-white w-full mb-6">保存する</button>

      <div class="card p-5 mb-8">
        <h3 class="font-black mb-3">合言葉の変更</h3>
        <label class="field-label">現在の合言葉</label>
        <input type="password" id="s-cur-pass" class="mb-3" />
        <label class="field-label">新しい合言葉</label>
        <input type="password" id="s-new-pass" class="mb-3" />
        <button id="s-pass-save" class="big-btn bg-gray-700 text-white w-full mb-2">合言葉を変更</button>
        <button id="s-logout" class="big-btn bg-gray-200 text-gray-700 w-full">ログアウト</button>
      </div>
      `,
      { active: 'settings', title: '設定', back: true }
    )

    document.getElementById('s-save').onclick = async () => {
      const data = {
        company_name: document.getElementById('s-company').value,
        owner_name: document.getElementById('s-owner').value,
        postal_code: document.getElementById('s-postal').value,
        address: document.getElementById('s-address').value,
        phone: document.getElementById('s-phone').value,
        email: document.getElementById('s-email').value,
        bank_name: document.getElementById('s-bank').value,
        bank_branch: document.getElementById('s-branch').value,
        bank_account_type: document.getElementById('s-accttype').value,
        bank_account_number: document.getElementById('s-acctnum').value,
        bank_account_holder: document.getElementById('s-holder').value,
        default_fee_percent: Number(document.getElementById('s-fee').value) || 0,
        default_tax_rate: Number(document.getElementById('s-tax').value) || 0,
        invoice_prefix: document.getElementById('s-prefix').value,
      }
      await api('put', '/api/settings', data)
      STATE.settings = null
      toast('保存しました')
    }

    document.getElementById('s-pass-save').onclick = async () => {
      const currentPassword = document.getElementById('s-cur-pass').value
      const newPassword = document.getElementById('s-new-pass').value
      try {
        await api('post', '/api/auth/change-password', { currentPassword, newPassword })
        toast('合言葉を変更しました')
        document.getElementById('s-cur-pass').value = ''
        document.getElementById('s-new-pass').value = ''
      } catch {}
    }

    document.getElementById('s-logout').onclick = async () => {
      await api('post', '/api/auth/logout')
      navigate('#/home')
      route()
    }
  }

  // ---------- 起動 ----------
  route()
})()
