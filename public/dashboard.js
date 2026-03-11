// API Base URL
const API_BASE = '/api/billing';
let availablePlans = [];

// Initialize Dashboard when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Bind static Event Listeners
    document.getElementById('login-form').addEventListener('submit', login);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('nav-overview').addEventListener('click', () => switchTab('overview'));
    document.getElementById('nav-tenants').addEventListener('click', () => switchTab('tenants'));
    document.getElementById('nav-plans').addEventListener('click', () => switchTab('plans'));
    document.getElementById('force-billing-btn').addEventListener('click', triggerBillingRun);
    document.getElementById('add-tenant-btn').addEventListener('click', () => openModal('new-tenant-modal'));

    // Mobile Sidebar Toggle
    document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);

    // Form and Modal closes
    document.getElementById('onboard-form').addEventListener('submit', submitOnboarding);
    document.getElementById('copy-link-btn').addEventListener('click', copyLink);
    document.getElementById('close-link-btn').addEventListener('click', () => closeModal('link-modal'));

    document.querySelectorAll('.close-tenant-modal').forEach(btn => {
        btn.addEventListener('click', () => closeModal('new-tenant-modal'));
    });

    // Dynamic Event Delegation for Tenants Table
    document.getElementById('tenants-table').addEventListener('click', (e) => {
        const btn = e.target.closest('.generate-link-btn');
        if (btn) {
            const subId = btn.dataset.id;
            generateLink(subId);
        }
    });

    // Initial Auth Check
    verifyAuth();
});

// ==========================================
// MOBILE SIDEBAR
// ==========================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isOpen = !sidebar.classList.contains('-translate-x-full');

    if (isOpen) {
        closeSidebar();
    } else {
        sidebar.classList.remove('-translate-x-full', 'hidden');
        sidebar.classList.add('translate-x-0', 'flex');
        backdrop.classList.remove('hidden');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0', 'flex');
    backdrop.classList.add('hidden');
    // Re-add hidden after the transition
    setTimeout(() => {
        if (sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.add('hidden');
            // Re-show on desktop
            sidebar.classList.add('lg:flex');
        }
    }, 200);
}

async function apiCall(endpoint, options = {}) {
    showLoader();
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
            // Note: cookies are sent automatically with same-origin fetch
        });

        if (response.status === 401) {
            handleUnauthorized();
            throw new Error('Unauthorized');
        }

        const data = await response.json();
        hideLoader();

        if (!response.ok) {
            throw new Error(data.message || 'API Error');
        }

        return data;
    } catch (err) {
        hideLoader();
        throw err;
    }
}

async function verifyAuth() {
    try {
        // Test call to verify if the HttpOnly cookie is valid
        await apiCall('/revenue/summary');
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        initDashboard();
    } catch (err) {
        handleUnauthorized();
    }
}

async function login(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');

    if (!email || !password) return;

    try {
        btn.textContent = 'Signing in...';
        btn.disabled = true;

        const response = await fetch('/api/billing/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) throw new Error('Invalid Credentials');

        // If login successful, cookie is set automatically
        document.getElementById('login-error').classList.add('hidden');
        document.getElementById('login-password').value = '';

        await verifyAuth();
    } catch (err) {
        document.getElementById('login-error').classList.remove('hidden');
    } finally {
        btn.textContent = 'Sign In';
        btn.disabled = false;
    }
}

async function logout() {
    try {
        await fetch('/api/billing/logout', { method: 'POST' });
    } catch (e) { }
    handleUnauthorized();
}

function handleUnauthorized() {
    document.getElementById('auth-overlay').classList.remove('hidden');
    document.getElementById('main-content').classList.add('hidden');
}

// ==========================================
// UI HELPERS
// ==========================================

function showLoader() { document.getElementById('global-loader').classList.remove('hidden'); }
function hideLoader() { document.getElementById('global-loader').classList.add('hidden'); }

function showAlert(msg, type = 'success') {
    const banner = document.getElementById('alert-banner');
    banner.textContent = msg;
    banner.className = `mb-6 p-4 rounded-lg border font-medium ${type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 5000);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

const formatMoney = (amount) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString() : 'N/A';

// ==========================================
// TABS & NAVIGATION
// ==========================================

const TABS = ['overview', 'tenants', 'plans'];

const TAB_META = {
    overview: { title: 'Overview', subtitle: 'Monitor your monthly recurring revenue and platform distributions.' },
    tenants: { title: 'Tenants & Subs', subtitle: 'Manage client onboarding, subscriptions, and payment links.' },
    plans: { title: 'Billing Plans', subtitle: 'View and manage your pricing tiers and feature sets.' }
};

function switchTab(tabId) {
    TABS.forEach(t => {
        const btn = document.getElementById(`nav-${t}`);
        const content = document.getElementById(`tab-${t}`);

        if (t === tabId) {
            btn.className = 'w-full flex items-center gap-3 px-3 py-2 tab-active rounded-lg font-medium transition-colors';
            content.classList.remove('hidden');
            document.getElementById('page-title').textContent = TAB_META[t].title;
            document.querySelector('#page-title + p').textContent = TAB_META[t].subtitle;
        } else {
            btn.className = 'w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors';
            content.classList.add('hidden');
        }
    });

    if (tabId === 'overview') loadOverview();
    if (tabId === 'tenants') loadTenants();
    if (tabId === 'plans') loadPlans();

    // Auto-close sidebar on mobile after navigation
    closeSidebar();
}

// ==========================================
// DATA FETCHING
// ==========================================

async function initDashboard() {
    try {
        availablePlans = await apiCall('/plans');
        const select = document.getElementById('s-plan');
        select.innerHTML = availablePlans.map(p => `<option value="${p.id}">${p.name} (${formatMoney(p.defaultPrice)}/${p.billingCycle})</option>`).join('');

        switchTab('overview');
    } catch (err) {
        console.error("Dashboard init error:", err);
    }
}

async function loadOverview() {
    try {
        const [summary, logs] = await Promise.all([
            apiCall('/revenue/summary'),
            apiCall('/revenue/logs')
        ]);

        document.getElementById('stat-mrr').textContent = formatMoney(summary.mrr);
        document.getElementById('stat-subs').textContent = summary.activeSubscriptions;
        document.getElementById('stat-platform-rev').textContent = formatMoney(summary.platformRevenue);
        document.getElementById('stat-partner-rev').textContent = formatMoney(summary.partnerRevenue);

        const table = document.getElementById('revenue-logs-table');

        // Improve Empty State UX
        if (logs.length === 0) {
            table.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500">No revenue logs yet. Awaiting first payment!</td></tr>`;
        } else {
            table.innerHTML = logs.slice(0, 10).map(log => `
                <tr class="hover:bg-slate-50">
                    <td class="px-6 py-4 whitespace-nowrap text-slate-500">${formatDate(log.createdAt)}</td>
                    <td class="px-6 py-4 font-medium text-slate-800">${log.subscription.tenant.name}</td>
                    <td class="px-6 py-4 text-slate-700">${formatMoney(log.amountCharged)}</td>
                    <td class="px-6 py-4 font-medium text-emerald-600">${formatMoney(log.platformAmount)}</td>
                    <td class="px-6 py-4 font-medium text-blue-600">${formatMoney(log.partnerAmount)}</td>
                </tr>
            `).join('');
        }
    } catch (e) { }
}

async function loadTenants() {
    const table = document.getElementById('tenants-table');
    // Skeleton Loaders
    table.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-slate-500">Loading tenants...</td></tr>`;

    try {
        const tenants = await apiCall('/tenants');

        if (tenants.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center">
                        <div class="text-slate-500 mb-2">You have not onboarded any clients yet.</div>
                        <button onclick="openModal('new-tenant-modal')" class="text-blue-600 font-medium hover:underline">Click "+ Add New Tenant" to register your first business.</button>
                    </td>
                </tr>`;
            return;
        }

        table.innerHTML = tenants.map(t => {
            const sub = t.subscription;
            let statusBadge = `<span class="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium">No Plan</span>`;

            if (sub) {
                if (sub.status === 'ACTIVE') statusBadge = `<span class="px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-medium">Active</span>`;
                else if (sub.status === 'PENDING') statusBadge = `<span class="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-xs font-medium">Pending Payment</span>`;
                else if (sub.status === 'SUSPENDED') statusBadge = `<span class="px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-medium">Failed Payment</span>`;
                else statusBadge = `<span class="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium">${sub.status}</span>`;
            }

            return `
            <tr class="hover:bg-slate-50">
                <td class="px-6 py-4">
                    <div class="font-medium text-slate-800">${t.name}</div>
                    <div class="text-xs text-slate-400">Slug: ${t.slug}</div>
                </td>
                <td class="px-6 py-4 text-slate-600">${t.adminPhone}</td>
                <td class="px-6 py-4 text-slate-600">${sub ? sub.plan.name : '-'}</td>
                <td class="px-6 py-4">${statusBadge}</td>
                <td class="px-6 py-4 text-slate-500">${sub && sub.status === 'ACTIVE' ? formatDate(sub.nextBillingDate) : '-'}</td>
                <td class="px-6 py-4 text-right">
                    ${sub && sub.status === 'PENDING' ?
                    `<button data-id="${sub.id}" class="generate-link-btn px-3 py-1 rounded-lg bg-primary text-white text-xs font-medium hover:bg-blue-600 transition-colors">Generate Link</button>`
                    : sub && sub.status === 'ACTIVE' ?
                        `<span class="text-xs text-slate-400">Subscribed</span>`
                        : `<span class="text-xs text-slate-400">—</span>`}
                </td>
            </tr>
        `}).join('');
    } catch (e) {
        table.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Failed to load tenants.</td></tr>`;
    }
}

async function loadPlans() {
    try {
        if (!availablePlans.length) availablePlans = await apiCall('/plans');
        const grid = document.getElementById('plans-grid');

        grid.innerHTML = availablePlans.map(p => `
            <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col">
                <div class="flex justify-between items-start mb-4">
                    <h4 class="text-lg font-bold text-slate-800">${p.name}</h4>
                    <span class="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium">${p._count?.subscriptions || 0} Subs</span>
                </div>
                <div class="text-3xl font-bold text-slate-800 mb-2">${formatMoney(p.defaultPrice)}<span class="text-sm font-normal text-slate-500">/${p.billingCycle.toLowerCase()}</span></div>
                <p class="text-sm text-slate-500 mb-6 flex-1">${p.description || ''}</p>
                
                <div class="space-y-2 mb-6">
                    ${(p.features || []).map(f => `
                        <div class="flex items-center gap-2 text-sm text-slate-600">
                            <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            ${f}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } catch (e) { }
}

// ==========================================
// ACTIONS
// ==========================================

async function submitOnboarding(event) {
    event.preventDefault(); // Handled by standard submit listener now
    const btn = document.getElementById('onboard-submit-btn');
    btn.textContent = 'Processing...';
    btn.disabled = true;

    try {
        // 1. Create Tenant
        const tenant = await apiCall('/tenants', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById('t-name').value,
                slug: document.getElementById('t-slug').value,
                adminPhone: document.getElementById('t-phone').value
            })
        });

        // 2. Create Subscription
        const customPriceStr = document.getElementById('s-custom-price').value;
        const customPrice = customPriceStr ? Number(customPriceStr) : undefined;

        const sub = await apiCall('/subscriptions', {
            method: 'POST',
            body: JSON.stringify({
                tenantId: tenant.id,
                planId: document.getElementById('s-plan').value,
                email: document.getElementById('s-email').value,
                customPrice: customPrice
            })
        });

        // 3. Generate Link
        await generateLink(sub.id);

        closeModal('new-tenant-modal');
        document.getElementById('onboard-form').reset();
        loadTenants(); // refresh list

    } catch (err) {
        showAlert(err.message, 'error');
    } finally {
        btn.textContent = 'Create & Generate Payment Link';
        btn.disabled = false;
    }
}

async function generateLink(subId) {
    try {
        const response = await apiCall(`/subscriptions/${subId}/payment-link`, {
            method: 'POST',
            body: JSON.stringify({})
        });

        document.getElementById('final-payment-link').value = response.paymentUrl;
        openModal('link-modal');
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

function copyLink() {
    const el = document.getElementById('final-payment-link');
    el.select();
    document.execCommand('copy');

    // Copy link UX improvement
    const btn = document.getElementById('copy-link-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<span class="text-sm font-semibold">✓ Copied</span>`;
    btn.classList.add('bg-green-100', 'text-green-700');

    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.classList.remove('bg-green-100', 'text-green-700');
    }, 2000);
}

async function triggerBillingRun() {
    if (!confirm('Are you sure you want to force a recurring billing run manually?')) return;

    try {
        await apiCall('/run-billing', { method: 'POST' });
        showAlert('Billing run processed successfully!');
        setTimeout(loadOverview, 1000);
    } catch (err) {
        showAlert(err.message, 'error');
    }
}
