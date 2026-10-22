import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, deleteDoc, updateDoc, onSnapshot, query, orderBy, setDoc, getDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const CATEGORIES = { food: { name: 'Еда', icon: '🍔', color: '#C9A46A' }, transport: { name: 'Транспорт', icon: '🚗', color: '#8B9EB7' }, fun: { name: 'Развлечения', icon: '🎉', color: '#FF6B6B' }, clothes: { name: 'Одежда', icon: '👕', color: '#A78BFA' }, health: { name: 'Здоровье', icon: '💊', color: '#4ADE80' }, home: { name: 'Дом', icon: '🏠', color: '#FBBF24' }, bills: { name: 'Связь и ЖКХ', icon: '📱', color: '#F472B6' }, education: { name: 'Образование', icon: '📚', color: '#34D399' }, other: { name: 'Другое', icon: '📦', color: '#60A5FA' }, none: { name: 'Без категории', icon: '❔', color: '#6B7280' } };
const CURRENCIES = { RUB: { symbol: '₽', rate: 1 }, USD: { symbol: '$', rate: 0.011 }, EUR: { symbol: '€', rate: 0.010 } };

const $ = (id) => document.getElementById(id);
const authScreen = $('auth-screen');
const loadingScreen = $('loading-screen');
const appContainer = $('app-container'); // <-- ДОБАВЛЕНО
const authForm = $('auth-form');
const authEmail = $('auth-email');
const authPassword = $('auth-password');
const authError = $('auth-error');
const authSubmit = $('auth-submit');
const authTabs = document.querySelectorAll('.auth-tab');
const btnGoogle = $('btn-google');
const userBar = $('user-bar');
const userEmail = $('user-email');
const logoutBtn = $('logout-btn');
const syncDot = $('sync-dot');
const syncText = $('sync-text');

const balanceEl = $('balance');
const incomeEl = $('total-income');
const expenseEl = $('total-expense');
const textInput = $('text');
const amountInput = $('amount');
const typeSelect = $('type');
const categorySelect = $('category');
const addBtn = $('add-btn');
const listEl = $('list');
const filterBtns = document.querySelectorAll('.filter-btn');
const searchInput = $('search');
const exportBtn = $('export-btn');
const importBtn = $('import-btn');
const importFile = $('import-file');
const clearAllBtn = $('clear-all-btn');
const themeToggle = $('theme-toggle');
const toastContainer = $('toast-container');
const expenseLegendEl = $('expense-legend');
const incomeLegendEl = $('income-legend');
const topListEl = $('top-list');
const monthFilter = $('month-filter');
const currencySelect = $('currency-select');
const budgetInput = $('budget-input');
const budgetSave = $('budget-save');
const budgetBar = $('budget-bar');
const budgetSpent = $('budget-spent');
const budgetLeft = $('budget-left');
const modal = $('modal');
const editText = $('edit-text');
const editAmount = $('edit-amount');
const editType = $('edit-type');
const editCategory = $('edit-category');
const saveBtn = $('save-btn');
const cancelBtn = $('cancel-btn');

let transactions = [];
let currentFilter = 'all';
let searchQuery = '';
let editingId = null;
let currentCurrency = localStorage.getItem('currency') || 'RUB';
let currentMonth = 'all';
let budget = 0;
let currentUser = null;
let authMode = 'login';
let unsubscribeTx = null;
let unsubscribeBudget = null;
let expenseChartInstance = null;
let incomeExpenseChartInstance = null;
let dailyChartInstance = null;

const formatMoney = (num) => Math.abs(Math.round(num * CURRENCIES[currentCurrency].rate)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const formatWithSymbol = (num) => `${formatMoney(num)} ${CURRENCIES[currentCurrency].symbol}`;
const formatDate = (ts) => ts ? new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';

function animateNumber(el, to, prefix = '') {
    const current = parseFloat(el.textContent.replace(/[^\d.-]/g, '')) || 0;
    if (current === to) { el.textContent = `${prefix}${formatMoney(to)} ${CURRENCIES[currentCurrency].symbol}`; return; }
    const duration = 400;
    const start = performance.now();
    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const val = Math.round(current + (to - current) * progress);
        el.textContent = `${prefix}${formatMoney(val)} ${CURRENCIES[currentCurrency].symbol}`;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function setSyncStatus(status) {
    if (!syncDot) return;
    syncDot.className = 'sync-dot';
    if (status === 'syncing') { syncDot.classList.add('syncing'); syncText.textContent = 'Синхронизация...'; }
    else if (status === 'offline') { syncDot.classList.add('offline'); syncText.textContent = 'Офлайн'; }
    else { syncText.textContent = 'Синхронизировано'; }
}

function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.body.dataset.theme = saved;
    themeToggle.textContent = saved === 'dark' ? '🌙' : '☀️';
}
themeToggle.addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = next;
    themeToggle.textContent = next === 'dark' ? '🌙' : '☀️';
    localStorage.setItem('theme', next);
    if (currentUser) renderList();
});

authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authMode = tab.dataset.tab;
        authSubmit.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться';
        authError.textContent = '';
    });
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    authSubmit.disabled = true;
    authSubmit.textContent = 'Подождите...';
    try {
        if (authMode === 'login') { await signInWithEmailAndPassword(auth, authEmail.value, authPassword.value); } 
        else { await createUserWithEmailAndPassword(auth, authEmail.value, authPassword.value); }
    } catch (err) {
        authError.textContent = translateAuthError(err.code);
        authSubmit.disabled = false;
        authSubmit.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться';
    }
});

btnGoogle.addEventListener('click', async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (err) { authError.textContent = translateAuthError(err.code); }
});

function translateAuthError(code) {
    const errors = {
        'auth/invalid-email': 'Неверный email', 'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль', 'auth/invalid-credential': 'Неверный email или пароль',
        'auth/email-already-in-use': 'Этот email уже зарегистрирован', 'auth/weak-password': 'Пароль должен быть не менее 6 символов',
        'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже', 'auth/popup-closed-by-user': 'Окно входа закрыто'
    };
    return errors[code] || 'Ошибка входа. Попробуйте снова';
}

logoutBtn.addEventListener('click', async () => {
    if (confirm('Выйти из аккаунта?')) { await signOut(auth); }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        userEmail.textContent = user.email;
        userBar.style.display = 'flex';
        appContainer.style.display = 'block'; // <-- ПОКАЗЫВАЕМ ПРИЛОЖЕНИЕ
        authScreen.classList.add('hidden');
        loadingScreen.classList.remove('hidden');
        
        await migrateLocalDataIfNeeded();
        subscribeToTransactions();
        subscribeToSettings();
        setTimeout(() => loadingScreen.classList.add('hidden'), 500);
    } else {
        currentUser = null;
        userBar.style.display = 'none';
        appContainer.style.display = 'none'; // <-- СКРЫВАЕМ ПРИЛОЖЕНИЕ
        authScreen.classList.remove('hidden');
        loadingScreen.classList.add('hidden');
        
        if (unsubscribeTx) { unsubscribeTx(); unsubscribeTx = null; }
        if (unsubscribeBudget) { unsubscribeBudget(); unsubscribeBudget = null; }
        transactions = []; budget = 0;
        if (expenseChartInstance) { expenseChartInstance.destroy(); expenseChartInstance = null; }
        if (incomeExpenseChartInstance) { incomeExpenseChartInstance.destroy(); incomeExpenseChartInstance = null; }
        if (dailyChartInstance) { dailyChartInstance.destroy(); dailyChartInstance = null; }
        authSubmit.disabled = false;
        authSubmit.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться';
        authPassword.value = '';
    }
});

async function migrateLocalDataIfNeeded() {
    const local = JSON.parse(localStorage.getItem('transactions') || '[]');
    if (!local.length) return;
    const metaRef = doc(db, 'users', currentUser.uid, 'meta', 'migrated');
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists()) return;
    if (!confirm(`Найдено ${local.length} записей. Перенести в облако?`)) { await setDoc(metaRef, { migrated: true }); return; }
    setSyncStatus('syncing');
    const batch = writeBatch(db);
    local.forEach(t => {
        const newRef = doc(collection(db, 'users', currentUser.uid, 'transactions'));
        batch.set(newRef, { text: t.text, amount: t.amount, category: t.category || '', createdAt: t.id || Date.now() });
    });
    await batch.commit();
    await setDoc(metaRef, { migrated: true });
    localStorage.removeItem('transactions');
    setSyncStatus('online');
    showToast(`Перенесено ${local.length} записей`, 'success');
}

function subscribeToTransactions() {
    setSyncStatus('syncing');
    const q = query(collection(db, 'users', currentUser.uid, 'transactions'), orderBy('createdAt', 'desc'));
    unsubscribeTx = onSnapshot(q, (snapshot) => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), dateId: doc.data().createdAt }));
        setSyncStatus('online');
        renderList();
    }, (err) => { console.error(err); setSyncStatus('offline'); showToast('Ошибка синхронизации', 'error'); });
}

async function subscribeToSettings() {
    const ref = doc(db, 'users', currentUser.uid, 'settings', 'main');
    unsubscribeBudget = onSnapshot(ref, (snap) => {
        if (snap.exists()) { budget = snap.data().budget || 0; if (snap.data().currency) { currentCurrency = snap.data().currency; currencySelect.value = currentCurrency; } } 
        else { budget = 0; }
        if (budgetInput) budgetInput.value = budget || '';
        updateBudget();
    });
}

async function saveSettings() {
    if (!currentUser) return;
    await setDoc(doc(db, 'users', currentUser.uid, 'settings', 'main'), { budget, currency: currentCurrency }, { merge: true });
}

function buildMonthOptions() {
    const months = new Set(['all']);
    transactions.forEach(t => { const ts = t.createdAt || t.id; if (ts) { const d = new Date(ts); months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); } });
    months.add(new Date().toISOString().slice(0, 7));
    monthFilter.innerHTML = '<option value="all">За всё время</option>';
    [...months].sort().reverse().filter(m => m !== 'all').forEach(m => {
        const [year, month] = m.split('-');
        const label = new Date(year, month - 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        monthFilter.innerHTML += `<option value="${m}">${label}</option>`;
    });
    monthFilter.value = currentMonth;
}
function getFilteredByMonth() {
    if (currentMonth === 'all') return transactions;
    return transactions.filter(t => { const ts = t.createdAt || t.id; if (!ts) return false; const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonth; });
}
monthFilter.addEventListener('change', (e) => { currentMonth = e.target.value; renderList(); });

currencySelect.value = currentCurrency;
currencySelect.addEventListener('change', async (e) => { currentCurrency = e.target.value; localStorage.setItem('currency', currentCurrency); await saveSettings(); renderList(); });

function updateBudget() {
    const monthTx = getFilteredByMonth().filter(t => t.amount < 0);
    const spent = monthTx.reduce((s, t) => s + Math.abs(t.amount), 0);
    const left = Math.max(0, budget - spent);
    const percent = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
    budgetBar.style.width = `${percent}%`;
    budgetBar.classList.remove('warning', 'danger');
    if (percent >= 100) budgetBar.classList.add('danger'); else if (percent >= 80) budgetBar.classList.add('warning');
    budgetSpent.textContent = `Потрачено: ${formatWithSymbol(spent)}`;
    budgetLeft.textContent = `Осталось: ${formatWithSymbol(left)}`;
}
budgetSave.addEventListener('click', async () => {
    const val = Number(budgetInput.value);
    if (isNaN(val) || val < 0) { showToast('Некорректная сумма', 'error'); return; }
    budget = val; await saveSettings(); updateBudget(); showToast('Бюджет сохранён', 'success');
});

function updateCharts(totalIncome, totalExpense) {
    const isDark = document.body.dataset.theme === 'dark';
    const borderColor = isDark ? '#152A43' : '#FFFFFF';
    const monthTx = getFilteredByMonth();

    const totals = {}; Object.keys(CATEGORIES).forEach(k => totals[k] = 0); let totalExpCalc = 0;
    monthTx.forEach(t => { if (t.amount < 0) { const amt = Math.abs(t.amount); const cat = t.category || 'none'; if (totals[cat] !== undefined) totals[cat] += amt; else totals['none'] += amt; totalExpCalc += amt; } });
    const activeKeys = Object.keys(CATEGORIES).filter(k => totals[k] > 0);
    const ctx1 = $('expenseChart').getContext('2d');
    if (!expenseChartInstance) {
        expenseChartInstance = new Chart(ctx1, { type: 'doughnut', data: { labels: activeKeys.map(k => CATEGORIES[k].name), datasets: [{ data: activeKeys.map(k => totals[k]), backgroundColor: activeKeys.map(k => CATEGORIES[k].color), borderColor, borderWidth: 3, hoverOffset: 6 }] }, options: { responsive: true, maintainAspectRatio: true, cutout: '65%', plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
    } else {
        expenseChartInstance.data.labels = activeKeys.map(k => CATEGORIES[k].name); expenseChartInstance.data.datasets[0].data = activeKeys.map(k => totals[k]); expenseChartInstance.data.datasets[0].backgroundColor = activeKeys.map(k => CATEGORIES[k].color); expenseChartInstance.data.datasets[0].borderColor = borderColor; expenseChartInstance.update();
    }
    expenseLegendEl.innerHTML = activeKeys.length === 0 ? '<div class="legend-empty">Нет расходов</div>' : '';
    activeKeys.forEach(k => { const percent = ((totals[k] / totalExpCalc) * 100).toFixed(1); expenseLegendEl.innerHTML += `<div class="legend-item"><div class="legend-label"><span class="legend-dot" style="background:${CATEGORIES[k].color}"></span>${CATEGORIES[k].icon} ${CATEGORIES[k].name}</div><div class="legend-value">${formatMoney(totals[k])} ${CURRENCIES[currentCurrency].symbol} <span class="legend-percent">${percent}%</span></div></div>`; });

    const ctx2 = $('incomeExpenseChart').getContext('2d');
    if (!incomeExpenseChartInstance) {
        incomeExpenseChartInstance = new Chart(ctx2, { type: 'doughnut', data: { labels: ['Доходы', 'Расходы'], datasets: [{ data: [totalIncome, totalExpense], backgroundColor: ['#4ADE80', '#FF6B6B'], borderColor, borderWidth: 3, hoverOffset: 6 }] }, options: { responsive: true, maintainAspectRatio: true, cutout: '65%', plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
    } else {
        incomeExpenseChartInstance.data.datasets[0].data = [totalIncome, totalExpense]; incomeExpenseChartInstance.data.datasets[0].borderColor = borderColor; incomeExpenseChartInstance.update();
    }
    const totalIE = totalIncome + totalExpense;
    incomeLegendEl.innerHTML = `<div class="legend-item"><div class="legend-label"><span class="legend-dot" style="background:#4ADE80"></span>Доходы</div><div class="legend-value">${formatMoney(totalIncome)} ${CURRENCIES[currentCurrency].symbol} <span class="legend-percent">${totalIE > 0 ? ((totalIncome/totalIE)*100).toFixed(1) : 0}%</span></div></div><div class="legend-item"><div class="legend-label"><span class="legend-dot" style="background:#FF6B6B"></span>Расходы</div><div class="legend-value">${formatMoney(totalExpense)} ${CURRENCIES[currentCurrency].symbol} <span class="legend-percent">${totalIE > 0 ? ((totalExpense/totalIE)*100).toFixed(1) : 0}%</span></div></div>`;

    const ctx3 = $('dailyChart').getContext('2d');
    const now = new Date();
    const daysInMonth = currentMonth === 'all' ? new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() : new Date(currentMonth.split('-')[0], currentMonth.split('-')[1], 0).getDate();
    const daily = new Array(daysInMonth).fill(0);
    monthTx.forEach(t => { if (t.amount < 0) { const ts = t.createdAt || t.id; if (ts) { const day = new Date(ts).getDate() - 1; if (day >= 0 && day < daysInMonth) daily[day] += Math.abs(t.amount); } } });
    const textColor = isDark ? '#8B9EB7' : '#7A7871'; const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    if (!dailyChartInstance) {
        dailyChartInstance = new Chart(ctx3, { type: 'line', data: { labels: Array.from({length: daysInMonth}, (_, i) => i + 1), datasets: [{ data: daily, borderColor: '#C9A46A', backgroundColor: 'rgba(201,164,106,0.15)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: gridColor } }, y: { ticks: { color: textColor, font: { size: 10 }, callback: v => formatMoney(v) }, grid: { color: gridColor } } } } });
    } else {
        dailyChartInstance.data.labels = Array.from({length: daysInMonth}, (_, i) => i + 1); dailyChartInstance.data.datasets[0].data = daily; dailyChartInstance.options.scales.x.ticks.color = textColor; dailyChartInstance.options.scales.y.ticks.color = textColor; dailyChartInstance.options.scales.x.grid.color = gridColor; dailyChartInstance.options.scales.y.grid.color = gridColor; dailyChartInstance.update();
    }

    const top = [...monthTx].filter(t => t.amount < 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5);
    topListEl.innerHTML = top.length === 0 ? '<div class="legend-empty">Нет трат</div>' : '';
    top.forEach((t, i) => { topListEl.innerHTML += `<div class="top-item"><span class="top-rank">${i + 1}</span><span class="top-item-name">${t.text}</span><span class="top-item-amount">-${formatWithSymbol(Math.abs(t.amount))}</span></div>`; });
}

function renderList() {
    if (!currentUser) return;
    listEl.innerHTML = '';
    const monthTx = getFilteredByMonth();
    let total = 0, totalIncome = 0, totalExpense = 0;
    monthTx.forEach(t => { if (t.amount > 0) totalIncome += t.amount; else totalExpense += Math.abs(t.amount); total += t.amount; });
    animateNumber(incomeEl, totalIncome, '+'); animateNumber(expenseEl, totalExpense, '-'); animateNumber(balanceEl, total, total > 0 ? '+' : '');
    balanceEl.className = total < 0 ? 'balance-amount negative' : 'balance-amount positive';
    let filtered = [...monthTx];
    if (currentFilter === 'income') filtered = filtered.filter(t => t.amount > 0);
    if (currentFilter === 'expense') filtered = filtered.filter(t => t.amount < 0);
    if (searchQuery) filtered = filtered.filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filtered.length === 0) { listEl.innerHTML = `<div class="empty-state"><span class="emoji">💸</span>${monthTx.length ? 'Ничего не найдено' : 'Пока пусто'}</div>`; } 
    else {
        filtered.forEach(t => {
            const li = document.createElement('li');
            const isIncome = t.amount > 0; li.style.borderLeftColor = isIncome ? 'var(--success)' : 'var(--danger)'; li.dataset.id = t.id;
            const cat = CATEGORIES[t.category] || CATEGORIES.none; const ts = t.createdAt || t.id;
            li.innerHTML = `<div class="item-left"><div class="item-cat-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div><div class="item-info"><span class="item-title">${t.text}</span><span class="item-category">${cat.name}</span><span class="item-date">${formatDate(ts)}</span></div></div><div class="item-right"><span class="item-amount ${isIncome ? 'amount-income' : 'amount-expense'}">${isIncome ? '+' : '-'}${formatMoney(t.amount)} ${CURRENCIES[currentCurrency].symbol}</span><button class="btn-icon" data-action="edit" data-id="${t.id}">✎</button><button class="btn-icon delete" data-action="delete" data-id="${t.id}">×</button></div>`;
            listEl.appendChild(li); attachSwipe(li);
        });
    }
    updateCharts(totalIncome, totalExpense); updateBudget();
}

function attachSwipe(el) {
    let startX = 0, currentX = 0;
    el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchmove', e => { currentX = e.touches[0].clientX; const diff = currentX - startX; if (diff < -30) el.style.transform = `translateX(${Math.max(-100, diff)}px)`; if (diff > 30) el.style.transform = `translateX(${Math.min(100, diff)}px)`; }, { passive: true });
    el.addEventListener('touchend', () => { const diff = currentX - startX; el.style.transform = ''; if (diff < -80) { const id = el.dataset.id; el.classList.add('removing'); setTimeout(() => deleteTransaction(id), 300); } else if (diff > 80) { openEdit(el.dataset.id); } startX = 0; currentX = 0; });
}

function openEdit(id) {
    const item = transactions.find(t => t.id === id); if (!item) return;
    editingId = id; editText.value = item.text; editAmount.value = Math.abs(item.amount); editType.value = item.amount > 0 ? 'income' : 'expense'; editCategory.value = item.category || ''; modal.classList.add('active'); editText.focus();
}

async function addTransaction() {
    if (textInput.value.trim() === '' || amountInput.value === '') { showToast('Заполни поля!', 'error'); return; }
    const amount = Math.abs(Number(amountInput.value)); if (amount === 0) { showToast('Сумма > 0', 'error'); return; }
    setSyncStatus('syncing');
    try {
        await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), { text: textInput.value.trim(), amount: typeSelect.value === 'income' ? amount : -amount, category: categorySelect.value, createdAt: Date.now() });
        textInput.value = ''; amountInput.value = ''; categorySelect.value = ''; textInput.focus();
    } catch (err) { console.error(err); showToast('Ошибка сохранения', 'error'); setSyncStatus('offline'); }
}
async function deleteTransaction(id) {
    setSyncStatus('syncing');
    try { await deleteDoc(doc(db, 'users', currentUser.uid, 'transactions', id)); showToast('Удалено'); } 
    catch (err) { showToast('Ошибка удаления', 'error'); setSyncStatus('offline'); }
}

addBtn.addEventListener('click', addTransaction);
textInput.addEventListener('keypress', e => { if (e.key === 'Enter') amountInput.focus(); });
amountInput.addEventListener('keypress', e => { if (e.key === 'Enter') addTransaction(); });

document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        setSyncStatus('syncing');
        try { await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), { text: btn.dataset.quick, amount: -Number(btn.dataset.amount), category: btn.dataset.cat, createdAt: Date.now() }); showToast(`Добавлено: ${btn.dataset.quick}`, 'success'); } 
        catch (err) { showToast('Ошибка', 'error'); }
    });
});

listEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'delete') { const li = btn.closest('li'); li.classList.add('removing'); setTimeout(() => deleteTransaction(id), 300); }
    if (btn.dataset.action === 'edit') openEdit(id);
});

function closeModal() { modal.classList.remove('active'); editingId = null; }
cancelBtn.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('active')) closeModal(); });

saveBtn.addEventListener('click', async () => {
    if (!editingId) return;
    if (editText.value.trim() === '' || editAmount.value === '') { showToast('Заполни все поля!', 'error'); return; }
    const amount = Math.abs(Number(editAmount.value));
    setSyncStatus('syncing');
    try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'transactions', editingId), { text: editText.value.trim(), amount: editType.value === 'income' ? amount : -amount, category: editCategory.value });
        closeModal(); showToast('Сохранено', 'success');
    } catch (err) { showToast('Ошибка', 'error'); setSyncStatus('offline'); }
});

filterBtns.forEach(btn => { btn.addEventListener('click', e => { filterBtns.forEach(b => b.classList.remove('active')); e.target.classList.add('active'); currentFilter = e.target.dataset.filter; renderList(); }); });
searchInput.addEventListener('input', e => { searchQuery = e.target.value; renderList(); });

exportBtn.addEventListener('click', () => {
    if (transactions.length === 0) { showToast('Нет данных', 'error'); return; }
    const clean = transactions.map(t => ({ text: t.text, amount: t.amount, category: t.category, createdAt: t.createdAt }));
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `finance-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
    showToast('Скачано', 'success');
});

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const imported = JSON.parse(ev.target.result); if (!Array.isArray(imported)) throw new Error('bad');
            if (!confirm(`Импортировать ${imported.length} записей в облако?`)) return;
            setSyncStatus('syncing');
            const batch = writeBatch(db);
            imported.forEach(t => { const newRef = doc(collection(db, 'users', currentUser.uid, 'transactions')); batch.set(newRef, { text: t.text, amount: t.amount, category: t.category || '', createdAt: t.createdAt || Date.now() }); });
            await batch.commit(); showToast(`Загружено ${imported.length} записей`, 'success');
        } catch { showToast('Ошибка файла', 'error'); }
    };
    reader.readAsText(file); importFile.value = '';
});

clearAllBtn.addEventListener('click', async () => {
    if (transactions.length === 0) { showToast('Уже пусто'); return; }
    if (!confirm(`Удалить ВСЕ ${transactions.length} записей из облака?`)) return;
    setSyncStatus('syncing');
    const batch = writeBatch(db);
    transactions.forEach(t => { batch.delete(doc(db, 'users', currentUser.uid, 'transactions', t.id)); });
    await batch.commit(); showToast('Всё удалено');
});

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR(); recognition.lang = 'ru-RU';
    const micBtn = document.createElement('button'); micBtn.className = 'btn-mic'; micBtn.textContent = '🎤';
    addBtn.parentNode.insertBefore(micBtn, addBtn.nextSibling);
    micBtn.addEventListener('click', () => { try { recognition.start(); micBtn.classList.add('recording'); } catch(e) {} });
    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript; const match = text.match(/(\d+)/);
        if (match) { amountInput.value = match[1]; textInput.value = text.replace(/\d+/g, '').replace(/рубл\w*|р\b|₽/gi, '').trim() || 'Голос'; showToast(`Распознано: ${text}`, 'success'); } 
        else textInput.value = text;
        micBtn.classList.remove('recording');
    };
    recognition.onerror = () => micBtn.classList.remove('recording');
    recognition.onend = () => micBtn.classList.remove('recording');
}

initTheme();