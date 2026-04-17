/**
 * ChromaTrack - Paint Sales & Inventory Management
 * High-Performance Vanilla JS SPA
 */

console.log("IMS Application Version: 4.0");
alert("DEBUG: IMS Script Loaded v4.0");

window.onerror = function(message, source, lineno, colno, error) {
    alert("System Error: " + message + "\nLine: " + lineno);
    return false;
};

const CONFIG = {
    DB_KEYS: {
        USER: 'ims_user',
        INVENTORY: 'ims_inventory',
        SALES: 'ims_sales'
    },
    CATEGORIES: ['Electronics', 'Home & Living', 'Fashion', 'Office Supplies', 'Services'],
    BRANDS: ['Generic', 'Premium', 'Standard']
};

class App {
    constructor() {
        this.state = {
            user: null,
            inventory: [],
            sales: [],
            currentView: 'dashboard',
            authMode: 'login', // 'login' or 'signup'
            isPendingActivation: false,
            isAdmin: false,
            allUsers: [] // For admin view
        };

        this.init();
    }

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.initPWA();
        this.initFirebase();
    }

    initFirebase() {
        // Listen for Authentication State
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // Fetch User Profile from Firestore
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                if (!userDoc.exists) {
                    // Critical: If doc doesn't exist, create it as pending
                    await this.createUserProfile(user);
                    this.state.isPendingActivation = true;
                    this.state.isAdmin = false;
                } else {
                    const userData = userDoc.data();
                    this.state.isPendingActivation = !userData.isActive;
                    this.state.isAdmin = userData.role === 'admin';
                }

                this.state.user = { 
                    id: user.uid, 
                    email: user.email, 
                    name: user.email.split('@')[0] 
                };

                if (!this.state.isPendingActivation) {
                    this.setupRealtimeSync();
                    if (this.state.isAdmin) this.setupAdminSync();
                }
                
                this.render();
            } else {
                this.state.user = null;
                this.state.isPendingActivation = false;
                this.state.isAdmin = false;
                this.render();
            }
        });
    }

    async createUserProfile(user) {
        // First user signed up? Make them admin. Otherwise pending.
        const usersSnapshot = await db.collection('users').limit(1).get();
        const isFirstUser = usersSnapshot.empty;

        await db.collection('users').doc(user.uid).set({
            email: user.email,
            role: isFirstUser ? 'admin' : 'user',
            isActive: isFirstUser ? true : false,
            createdAt: new Date().toISOString()
        });
    }

    setupAdminSync() {
        db.collection('users').onSnapshot((snapshot) => {
            this.state.allUsers = [];
            snapshot.forEach(doc => {
                this.state.allUsers.push({ id: doc.id, ...doc.data() });
            });
            if (this.state.currentView === 'admin') this.renderView();
        });
    }

    setupRealtimeSync() {
        // Real-time Inventory Sync
        db.collection('inventory').onSnapshot((querySnapshot) => {
            this.state.inventory = [];
            querySnapshot.forEach((doc) => {
                this.state.inventory.push({ id: doc.id, ...doc.data() });
            });
            
            // Initial data migration if database is empty
            if (this.state.inventory.length === 0) {
                this.migrateInitialData();
            }
            
            this.renderView();
        });

        // Real-time Sales Sync
        db.collection('sales').orderBy('date', 'desc').limit(100).onSnapshot((querySnapshot) => {
            this.state.sales = [];
            querySnapshot.forEach((doc) => {
                this.state.sales.push({ id: doc.id, ...doc.data() });
            });
            this.renderView();
        });
    }

    async migrateInitialData() {
        console.log("Migrating initial inventory to cloud...");
        const initial = this.getInitialInventory();
        for (const item of initial) {
            const { id, ...data } = item;
            await db.collection('inventory').add(data);
        }
    }

    cacheDOM() {
        this.ui = {
            appContainer: document.getElementById('app'),
            authContainer: document.getElementById('auth-container'),
            mainLayout: document.getElementById('main-layout'),
            loginForm: document.getElementById('login-form'),
            logoutBtn: document.getElementById('logout-btn'),
            viewContent: document.getElementById('view-content'),
            viewTitle: document.getElementById('view-title'),
            navLinks: document.querySelectorAll('.nav-link'),
            installBtn: document.getElementById('install-app-btn'),
            confirmPasswordGroup: document.getElementById('confirm-password-group'),
            toggleAuthLink: document.getElementById('toggle-auth-link'),
            authSubmitBtn: document.getElementById('auth-submit-btn'),
            toggleText: document.getElementById('toggle-text'),
            pendingView: document.getElementById('pending-view')
        };
    }

    bindEvents() {
        this.ui.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.ui.logoutBtn.addEventListener('click', () => this.handleLogout());
        this.ui.toggleAuthLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthMode();
        });

        this.ui.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                this.switchView(view);
            });
        });

        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '') || 'dashboard';
            this.switchView(hash);
        });
    }

    // --- State Actions ---

    toggleAuthMode() {
        this.state.authMode = this.state.authMode === 'login' ? 'signup' : 'login';
        const isLogin = this.state.authMode === 'login';

        this.ui.authSubmitBtn.innerText = isLogin ? 'Sign In' : 'Create Account';
        this.ui.toggleText.innerText = isLogin ? "Don't have an account?" : "Already have an account?";
        this.ui.toggleAuthLink.innerText = isLogin ? 'Sign Up' : 'Log In';
        
        if (isLogin) {
            this.ui.confirmPasswordGroup.classList.add('hidden');
            document.getElementById('confirm-password').removeAttribute('required');
        } else {
            this.ui.confirmPasswordGroup.classList.remove('hidden');
            document.getElementById('confirm-password').setAttribute('required', 'required');
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = e.target.querySelector('#email').value;
        const password = e.target.querySelector('#password').value;

        try {
            if (this.state.authMode === 'login') {
                await auth.signInWithEmailAndPassword(email, password);
            } else {
                const confirmPassword = e.target.querySelector('#confirm-password').value;
                if (password !== confirmPassword) {
                    alert('Passwords do not match!');
                    return;
                }
                await auth.createUserWithEmailAndPassword(email, password);
                alert('Account created successfully! Welcome.');
                this.toggleAuthMode(); // Switch back to login mode
            }
        } catch (error) {
            let msg = error.message;
            if (error.code === 'auth/operation-not-allowed') {
                msg = "Login method not enabled. Please enable 'Email/Password' in your Firebase console.";
            } else if (error.code === 'auth/weak-password') {
                msg = "Password is too weak. Please use at least 6 characters.";
            }
            alert('Authentication Error: ' + msg);
        }
    }

    async handleLogout() {
        await auth.signOut();
        window.location.hash = '';
    }

    switchView(view) {
        if (!this.state.user) return;
        this.state.currentView = view;
        window.location.hash = view;

        this.ui.navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-view') === view);
        });

        this.renderView();
    }

    // --- Rendering ---

    render() {
        if (!this.state.user) {
            this.ui.authContainer.classList.remove('hidden');
            this.ui.mainLayout.classList.add('hidden');
            this.ui.pendingView.classList.add('hidden');
        } else if (this.state.isPendingActivation) {
            this.ui.authContainer.classList.add('hidden');
            this.ui.mainLayout.classList.add('hidden');
            this.ui.pendingView.classList.remove('hidden');
        } else {
            this.ui.authContainer.classList.add('hidden');
            this.ui.pendingView.classList.add('hidden');
            this.ui.mainLayout.classList.remove('hidden');
            
            // Show/Hide Admin link in sidebar
            const adminLink = document.querySelector('[data-view="admin"]');
            if (adminLink) {
                adminLink.style.display = this.state.isAdmin ? 'flex' : 'none';
            }

            this.renderView();
        }
    }

    renderView() {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
        this.ui.viewTitle.innerHTML = `<span style="color: var(--text-secondary); font-weight: 400;">${greeting},</span> ${this.state.user.name}`;
        
        switch(this.state.currentView) {
            case 'dashboard':
                this.renderDashboard();
                break;
            case 'inventory':
                this.renderInventory();
                break;
            case 'sales':
                this.renderSales();
                break;
            case 'admin':
                this.renderAdmin();
                break;
            default:
                this.renderDashboard();
        }
    }

    renderAdmin() {
        if (!this.state.isAdmin) return;
        
        this.ui.viewContent.innerHTML = `
            <div class="data-card glass">
                <h3>Member Management</h3>
                <p style="color: var(--text-secondary); margin-bottom: 2rem;">As an Admin, you can activate or deactivate users here.</p>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Joined</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.state.allUsers.map(user => `
                                <tr>
                                    <td>${user.email}</td>
                                    <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                                    <td><span class="badge">${user.role}</span></td>
                                    <td>
                                        <span class="badge ${user.isActive ? 'badge-success' : 'badge-error'}">
                                            ${user.isActive ? 'Active' : 'Pending'}
                                        </span>
                                    </td>
                                    <td>
                                        ${user.role !== 'admin' ? `
                                            <button class="btn btn-ghost" style="color: ${user.isActive ? 'var(--error)' : 'var(--success)'}" 
                                                onclick="window.app.toggleUserStatus('${user.id}', ${!user.isActive})">
                                                ${user.isActive ? 'Deactivate' : 'Activate'}
                                            </button>
                                        ` : '<span style="color:var(--text-secondary)">-</span>'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    async toggleUserStatus(userId, newStatus) {
        try {
            await db.collection('users').doc(userId).update({
                isActive: newStatus
            });
            alert(`User status updated to ${newStatus ? 'Active' : 'Inactive'}.`);
        } catch (err) {
            alert('Failed to update user: ' + err.message);
        }
    }

    renderDashboard() {
        const totalSales = this.state.sales.reduce((acc, sale) => acc + sale.total, 0);
        const totalProfit = this.state.sales.reduce((acc, sale) => acc + (sale.profit || 0), 0);
        const stockCount = this.state.inventory.reduce((acc, item) => acc + item.stock, 0);
        const lowStock = this.state.inventory.filter(item => item.stock < 10).length;

        this.ui.viewContent.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card glass">
                    <span class="stat-label">Total Revenue</span>
                    <span class="stat-value">₱${totalSales.toLocaleString()}</span>
                    <span class="stat-delta delta-up">↑ 12% vs last month</span>
                </div>
                <div class="stat-card glass">
                    <span class="stat-label">Total Profit</span>
                    <span class="stat-value" style="color: var(--success)">₱${totalProfit.toLocaleString()}</span>
                    <span class="stat-delta">Net Earnings</span>
                </div>
                <div class="stat-card glass">
                    <span class="stat-label">Stock Volume</span>
                    <span class="stat-value">${stockCount.toLocaleString()}</span>
                    <span class="stat-delta">Overall Inventory</span>
                </div>
            </div>

            <div class="data-card glass">
                <h3>Recent Sales</h3>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.state.sales.slice(-5).reverse().map(sale => `
                                <tr>
                                    <td>${new Date(sale.date).toLocaleDateString()}</td>
                                    <td>${sale.productName}</td>
                                    <td>${sale.qty}</td>
                                    <td>₱${sale.total}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="4" style="text-align:center">No sales yet</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderInventory() {
        this.ui.viewContent.innerHTML = `
            <div class="content-toolbar" style="margin-bottom: 2rem; display: flex; justify-content: space-between;">
                <input type="text" placeholder="Search products, brands..." id="inventory-search" style="width: 300px;">
                <button class="btn btn-primary" id="add-product-btn">+ Add Product</button>
            </div>
            <div class="data-card glass">
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Product Name</th>
                                <th>Brand</th>
                                <th>Stock</th>
                                <th>Price</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="inventory-tbody">
                            ${this.state.inventory.map(item => `
                                <tr>
                                    <td><span class="badge ${item.category === 'Electronics' ? 'badge-success' : ''}">${item.category}</span></td>
                                    <td style="font-weight: 600">${item.name}</td>
                                    <td>${item.brand}</td>
                                    <td>
                                        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                            <span class="${item.stock < 10 ? 'pulse-error' : ''}" style="color: ${item.stock < 10 ? 'var(--error)' : 'inherit'}; font-weight: 700;">
                                                ${item.stock}
                                            </span>
                                            <span class="badge" style="font-size: 0.65rem; padding: 0.1rem 0.4rem; background: ${item.stock === 0 ? 'rgba(239, 68, 68, 0.1)' : item.stock < 10 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color: ${item.stock === 0 ? 'var(--error)' : item.stock < 10 ? 'var(--warning)' : 'var(--success)'}; border: 1px solid ${item.stock === 0 ? 'var(--error)' : item.stock < 10 ? 'var(--warning)' : 'var(--success)'}">
                                                ${item.stock === 0 ? 'Out of Stock' : item.stock < 10 ? 'Low Stock' : 'In Stock'}
                                            </span>
                                        </div>
                                    </td>
                                    <td>₱${item.price}</td>
                                    <td>
                                        <div style="display: flex; gap: 0.5rem;">
                                            <button class="btn btn-ghost" onclick="window.app.showEditProductModal(${item.id})">Edit</button>
                                            <button class="btn btn-ghost" style="color: var(--error)" onclick="window.app.deleteProduct(${item.id})">Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('add-product-btn').addEventListener('click', () => this.showAddProductModal());
        
        const searchInput = document.getElementById('inventory-search');
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#inventory-tbody tr');
            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    renderSales() {
        this.ui.viewContent.innerHTML = `
            <div class="form-grid">
                <div class="data-card glass">
                    <h3>Record New Sale</h3>
                    <form id="new-sale-form" class="auth-form" style="margin-top: 1.5rem;">
                        <div class="input-group">
                            <label>Select Product</label>
                             <select id="sale-product" class="glass" style="padding: 0.75rem; border-radius: 8px; background: rgba(255,255,255,0.05); color: white; border: 1px solid var(--glass-border);">
                                ${this.state.inventory.map(item => `
                                    <option value="${item.id}">${item.name} (${item.stock} available)</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="input-group">
                            <label>Quantity</label>
                            <input type="number" id="sale-qty" min="1" value="1">
                        </div>
                        <button type="submit" class="btn btn-primary">Complete Sale</button>
                    </form>
                </div>
                <div class="data-card glass">
                    <h3>Recent Transactions</h3>
                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Amount</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.state.sales.slice(-10).reverse().map(sale => `
                                    <tr>
                                        <td>${new Date(sale.date).toLocaleTimeString()}</td>
                                        <td style="font-weight: 600; color: var(--accent-cyan)">₱${sale.total}</td>
                                        <td>
                                            <button class="btn btn-ghost" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="window.app.showReceiptModal(${sale.id})">
                                                <span>📄</span> Receipt
                                            </button>
                                        </td>
                                    </tr>
                                `).join('') || '<tr><td colspan="3" style="text-align:center">No transactions yet</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('new-sale-form').addEventListener('submit', (e) => this.handleNewSale(e));
    }

    async handleNewSale(e) {
        e.preventDefault();
        const productId = document.getElementById('sale-product').value;
        const qty = parseInt(document.getElementById('sale-qty').value);
        
        const product = this.state.inventory.find(p => p.id === productId);
        if (!product || product.stock < qty) {
            alert('Insufficient stock!');
            return;
        }

        try {
            // 1. Update Stock in Firestore
            await db.collection('inventory').doc(productId).update({
                stock: product.stock - qty
            });
            
            // 2. Add Sale Record to Firestore
            const newSale = {
                productId,
                productName: product.name,
                qty,
                total: product.price * qty,
                profit: (product.price - (product.costPrice || 0)) * qty,
                date: new Date().toISOString()
            };

            const saleDoc = await db.collection('sales').add(newSale);
            
            // Note: renderView will be called automatically by onSnapshot
            this.showReceiptModal(saleDoc.id);
        } catch (err) {
            alert('Sale failed: ' + err.message);
        }
    }

    exportData() {
        const data = {
            inventory: this.state.inventory,
            sales: this.state.sales,
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `IMS_Backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportToCSV() {
        if (this.state.inventory.length === 0) {
            alert('No inventory data to export.');
            return;
        }

        const headers = ['ID', 'Name', 'Category', 'Brand', 'Stock', 'Selling Price', 'Cost Price'];
        const rows = this.state.inventory.map(item => [
            item.id,
            `"${item.name}"`,
            `"${item.category}"`,
            `"${item.brand}"`,
            item.stock,
            item.price,
            item.costPrice
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `IMS_Inventory_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportSalesToCSV() {
        if (this.state.sales.length === 0) {
            alert('No sales data to export.');
            return;
        }

        const headers = ['Sale ID', 'Date', 'Product Name', 'Quantity', 'Revenue (₱)', 'Profit (₱)'];
        const rows = this.state.sales.map(sale => [
            sale.id,
            new Date(sale.date).toLocaleString(),
            `"${sale.productName}"`,
            sale.qty,
            sale.total,
            sale.profit || 0
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `IMS_Sales_Report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.inventory && data.sales) {
                    if (confirm('Are you sure? This will overwrite ALL current data with the backup file.')) {
                        this.state.inventory = data.inventory;
                        this.state.sales = data.sales;
                        this.saveState();
                        this.renderView();
                        alert('Data restored successfully!');
                    }
                } else {
                    alert('Invalid backup file format.');
                }
            } catch (err) {
                alert('Error reading backup file.');
            }
        };
        reader.readAsText(file);
    }

    saveState() {
        // Method kept for compatibility but logic removed as Firestore handles persistence
    }

    getInitialInventory() {
        return [
            { id: 1, name: 'MacBook Pro 14"', category: 'Electronics', brand: 'Apple', stock: 15, price: 95000, costPrice: 75000 },
            { id: 2, name: 'Ergonomic Office Chair', category: 'Home & Living', brand: 'Comfort Plus', stock: 45, price: 12500, costPrice: 8500 },
            { id: 3, name: 'Mechanical Keyboard', category: 'Electronics', brand: 'KeyFlow', stock: 8, price: 4500, costPrice: 2800 },
            { id: 4, name: 'Solid Oak Desk', category: 'Home & Living', brand: 'WoodCraft', stock: 12, price: 28000, costPrice: 18000 },
            { id: 5, name: 'Premium Espresso Machine', category: 'Home & Living', brand: 'Breville', stock: 5, price: 35000, costPrice: 24000 }
        ];
    }

    showAddProductModal() {
        this.renderProductModal();
    }

    showEditProductModal(id) {
        const product = this.state.inventory.find(p => p.id === id);
        if (!product) return;
        this.renderProductModal(product);
    }

    renderProductModal(product = null) {
        const isEdit = !!product;
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content glass" style="animation: fadeIn 0.3s ease;">
                <h3>${isEdit ? 'Edit Product Details' : 'Add New Product'}</h3>
                <form id="product-form" class="auth-form" style="margin-top: 1.5rem;">
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Product Name</label>
                            <input type="text" id="p-name" value="${isEdit ? product.name : ''}" required>
                        </div>
                        <div class="input-group">
                            <label>Category</label>
                            <select id="p-cat" class="glass" style="padding:0.75rem; color:white; background:rgba(255,255,255,0.05)">
                                ${CONFIG.CATEGORIES.map(c => `<option value="${c}" ${isEdit && product.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Unit Price (₱)</label>
                            <input type="number" id="p-price" value="${isEdit ? product.price : '100'}" required>
                        </div>
                        <div class="input-group">
                            <label>Cost Price (₱)</label>
                            <input type="number" id="p-cost" value="${isEdit ? product.costPrice : '70'}" required>
                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Stock Level</label>
                            <input type="number" id="p-stock" value="${isEdit ? product.stock : '0'}" required>
                        </div>
                        <div class="input-group">
                            <label>Brand</label>
                            <input type="text" id="p-brand" value="${isEdit ? product.brand : ''}" required placeholder="Manufacturer/Brand">
                        </div>
                    </div>
                    <div class="form-grid" style="margin-top: 1rem;">
                        <button type="button" class="btn btn-ghost" id="close-modal">Cancel</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? 'Update Product' : 'Save Product'}</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('close-modal').onclick = () => modal.remove();
        document.getElementById('product-form').onsubmit = async (e) => {
            e.preventDefault();
            const formData = {
                name: document.getElementById('p-name').value,
                category: document.getElementById('p-cat').value,
                brand: document.getElementById('p-brand').value,
                stock: parseInt(document.getElementById('p-stock').value),
                price: parseFloat(document.getElementById('p-price').value),
                costPrice: parseFloat(document.getElementById('p-cost').value)
            };

            try {
                if (isEdit) {
                    await db.collection('inventory').doc(product.id).set(formData, { merge: true });
                } else {
                    await db.collection('inventory').add(formData);
                }
                modal.remove();
            } catch (err) {
                alert('Save failed: ' + err.message);
            }
        };
    }

    async deleteProduct(id) {
        if (confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            try {
                await db.collection('inventory').doc(id).delete();
            } catch (err) {
                alert('Delete failed: ' + err.message);
            }
        }
    }

    showReceiptModal(saleId) {
        const sale = this.state.sales.find(s => s.id === saleId);
        if (!sale) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="receipt" style="animation: fadeIn 0.3s ease;">
                <div class="receipt-header">
                    <h2 style="font-size: 1.2rem; margin-bottom: 0.25rem;">IMS STORE</h2>
                    <p style="font-size: 0.8rem; color: #666;">Official Transaction Receipt</p>
                </div>
                <div style="margin-bottom: 1rem; font-size: 0.8rem;">
                    <p>Date: ${new Date(sale.date).toLocaleString()}</p>
                    <p>Receipt ID: #${sale.id.toString().slice(-6)}</p>
                </div>
                <div class="receipt-item" style="font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;">
                    <span>Item</span>
                    <span>Total</span>
                </div>
                <div class="receipt-item">
                    <span>${sale.productName} x ${sale.qty}</span>
                    <span>₱${sale.total}</span>
                </div>
                <div class="receipt-total">
                    <span>TOTAL</span>
                    <span>₱${sale.total}</span>
                </div>
                <div class="receipt-footer">
                    <p>Thank you for your purchase!</p>
                    <p style="margin-top: 0.5rem; font-size: 0.7rem;">Please keep this for your records.</p>
                </div>
                <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <button class="btn btn-primary" style="width: 100%;" onclick="window.print()">
                        <span>🖨️</span> Print Receipt
                    </button>
                    <button class="btn btn-ghost" style="width: 100%; color: #666; border: 1px solid #ccc;" onclick="this.closest('.modal').remove()">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // --- PWA Installation ---

    initPWA() {
        let deferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (this.ui.installBtn) {
                this.ui.installBtn.classList.remove('hidden');
            }
        });

        if (this.ui.installBtn) {
            this.ui.installBtn.addEventListener('click', (e) => {
                if (!deferredPrompt) return;
                this.ui.installBtn.classList.add('hidden');
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    deferredPrompt = null;
                });
            });
        }
    }
}

// Start the Application
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
