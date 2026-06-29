import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Scissors, Boxes, Wallet, BarChart3, Factory,
  Plus, Printer, Trash2, X, ArrowUpCircle, ArrowDownCircle,
  TrendingUp, TrendingDown, Receipt, Store, ArrowRightLeft, LogOut,
  Search, Building2, Bell, UserCircle, Settings, ShoppingCart, Package
} from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import * as api from './api';
import { syncPendingToSupabase, refreshAllFromSupabase } from './api';
import { getPendingCount } from './db';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// ---------- nav config (ERP structure) ----------
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'yarn', label: 'Inventory · Yarn', icon: Boxes },
  { id: 'production', label: 'Inventory · Production', icon: Factory },
  { id: 'fabric', label: 'Inventory · Fabric', icon: Scissors },
  { id: 'outlets', label: 'Outlets', icon: Store },
  { id: 'sales', label: 'Sales', icon: ShoppingCart, ownerOnly: true },
  { id: 'purchases', label: 'Purchases', icon: Package, ownerOnly: true },
  { id: 'payments', label: 'Payments', icon: Wallet, ownerOnly: true },
  { id: 'expenses', label: 'Expenses', icon: Receipt, ownerOnly: true },
  { id: 'reports', label: 'Reports', icon: BarChart3, ownerOnly: true },
  { id: 'settings', label: 'Settings', icon: Settings, ownerOnly: true },
];

// ---------- top-level export: gates on auth, then renders the real app ----------
export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { session, role, loading: authLoading, roleDebug } = useAuth();

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7', fontFamily: 'Inter, system-ui, sans-serif', color: '#6b7280' }}>
        Checking session…
      </div>
    );
  }

  if (!session) return <Login />;

  return <InventoryApp role={role || 'staff'} />;
}

function InventoryApp({ role }) {
  const { signOut } = useAuth();
  const isOwner = role === 'owner';
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncMsg, setSyncMsg] = useState(null); // { text, type: 'success'|'info'|'error' }

  const [yarnEntries, setYarnEntries] = useState([]);       // {id,direction(in/out),party,quality,qty,unit,rate,date,note}
  const [production, setProduction] = useState([]);         // {id,date,yarnQty,yarnUnit,fabricQty,fabricUnit,quality,note}
  // fabricEntries direction: 'in' (from production, factory stock), 'out_sale' (direct sale, factory->customer), 'out_transfer' (factory->outlet)
  const [fabricEntries, setFabricEntries] = useState([]);
  const [outlets, setOutlets] = useState([]);               // {id,name,location}
  const [outletStockMoves, setOutletStockMoves] = useState([]); // {id,outletId,direction(in/out),quality,qty,unit,date,note,refTransferId} -- 'in' from transfer, 'out' from outlet sale
  const [outletSales, setOutletSales] = useState([]);        // {id,outletId,party,quality,qty,unit,rate,date,note}
  const [payments, setPayments] = useState([]);              // {id,direction(in/out),party,amount,mode,date,note}
  const [expenses, setExpenses] = useState([]);              // {id,category,amount,date,note}

  useEffect(() => {
    // Track online/offline and auto-sync
    const goOnline = async () => {
      setOnline(true);
      setSyncMsg({ text: 'Back online — syncing...', type: 'info' });
      try {
        const { synced } = await syncPendingToSupabase();
        await refreshAllFromSupabase();
        const [y, p, f, o, osm, os] = await Promise.all([
          api.fetchYarnEntries(), api.fetchProduction(),
          api.fetchFabricEntries(), api.fetchOutlets(),
          api.fetchOutletStockMoves(), api.fetchOutletSales(),
        ]);
        setYarnEntries(y); setProduction(p); setFabricEntries(f);
        setOutlets(o); setOutletStockMoves(osm); setOutletSales(os);
        if (isOwner) {
          const [pay, ex] = await Promise.all([api.fetchPayments(), api.fetchExpenses()]);
          setPayments(pay); setExpenses(ex);
        }
        setPendingCount(0);
        setSyncMsg(synced > 0
          ? { text: `Synced ${synced} offline change${synced > 1 ? 's' : ''} ✓`, type: 'success' }
          : { text: 'Data refreshed ✓', type: 'success' }
        );
        setTimeout(() => setSyncMsg(null), 3000);
      } catch (e) {
        setSyncMsg({ text: 'Sync error — will retry', type: 'error' });
        setTimeout(() => setSyncMsg(null), 4000);
      }
    };
    const goOffline = () => { setOnline(false); setSyncMsg(null); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const pollPending = setInterval(async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    }, 5000);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(pollPending);
    };
  }, [isOwner]);

  useEffect(() => {
    (async () => {
          api.fetchYarnEntries(), api.fetchProduction(),
          api.fetchFabricEntries(), api.fetchOutlets(),
          api.fetchOutletStockMoves(), api.fetchOutletSales(),
        ]);
        setYarnEntries(y); setProduction(p); setFabricEntries(f);
        setOutlets(o); setOutletStockMoves(osm); setOutletSales(os);
        if (isOwner) {
          const [pay, ex] = await Promise.all([api.fetchPayments(), api.fetchExpenses()]);
          setPayments(pay); setExpenses(ex);
        }
      } catch (e) {
        console.error('Failed to load data', e);
      }
      setLoading(false);
    })();
  }, [isOwner]);

  // ---------- derived stock & totals ----------
  const yarnStock = useMemo(() => {
    return yarnEntries.reduce((sum, e) => sum + (e.direction === 'in' ? Number(e.qty) : -Number(e.qty)), 0);
  }, [yarnEntries]);

  // Convert any fabric qty to meters for consistent stock calculation (1 yard = 0.9144 meters)
  const toMeters = (qty, unit) => unit === 'yard' ? Number(qty) * 0.9144 : Number(qty);

  // factory fabric stock: in (production) - out_sale - out_transfer, all normalised to meters
  const fabricStock = useMemo(() => {
    return fabricEntries.reduce((sum, e) => {
      if (e.direction === 'in') return sum + toMeters(e.qty, e.unit);
      return sum - toMeters(e.qty, e.unit); // out_sale or out_transfer
    }, 0);
  }, [fabricEntries]);

  // per-outlet stock: stock moves 'in' (transfers received) minus outlet sales
  const outletStock = useMemo(() => {
    const map = {};
    outlets.forEach(o => { map[o.id] = 0; });
    outletStockMoves.forEach(m => {
      if (!map[m.outletId]) map[m.outletId] = map[m.outletId] || 0;
      map[m.outletId] += m.direction === 'in' ? Number(m.qty) : -Number(m.qty);
    });
    return map;
  }, [outlets, outletStockMoves]);

  const totalOutletStock = useMemo(() => Object.values(outletStock).reduce((a, b) => a + b, 0), [outletStock]);

  // party ledgers: positive = they owe us (receivable), negative = we owe them (payable)
  const ledger = useMemo(() => {
    const map = {};
    const touch = (party) => { if (!map[party]) map[party] = 0; };
    fabricEntries.forEach(e => {
      if (e.direction === 'out_sale' && e.party) {
        touch(e.party);
        map[e.party] += Number(e.qty) * Number(e.rate || 0);
      }
    });
    outletSales.forEach(s => {
      if (s.party) {
        touch(s.party);
        map[s.party] += Number(s.qty) * Number(s.rate || 0);
      }
    });
    yarnEntries.forEach(e => {
      if (e.direction === 'in' && e.party) {
        touch(e.party);
        map[e.party] -= Number(e.qty) * Number(e.rate || 0);
      }
    });
    payments.forEach(p => {
      if (!p.party) return;
      touch(p.party);
      if (p.direction === 'in') map[p.party] -= Number(p.amount);
      else map[p.party] += Number(p.amount);
    });
    return map;
  }, [fabricEntries, outletSales, yarnEntries, payments]);

  const totalReceivable = useMemo(() => Object.values(ledger).filter(v => v > 0).reduce((a, b) => a + b, 0), [ledger]);
  const totalPayable = useMemo(() => Object.values(ledger).filter(v => v < 0).reduce((a, b) => a - b, 0), [ledger]);
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount || 0), 0), [expenses]);

  const outletName = (id) => outlets.find(o => o.id === id)?.name || 'Outlet';

  // unified recent transactions feed
  const transactions = useMemo(() => {
    const rows = [];
    yarnEntries.forEach(e => rows.push({
      id: 'y' + e.id, date: e.date, type: e.direction === 'in' ? 'Yarn In' : 'Yarn Out',
      party: e.party || '—', item: `${e.quality || 'Yarn'}`, qty: `${num(e.qty)} ${e.unit}`,
      amount: e.rate ? money(e.qty * e.rate) : '—', sortKey: e.date,
    }));
    fabricEntries.forEach(e => {
      const typeLabel = e.direction === 'in' ? 'Fabric In (Production)' : e.direction === 'out_transfer' ? 'Fabric → Outlet' : 'Fabric Out (Sale)';
      rows.push({
        id: 'f' + e.id, date: e.date, type: typeLabel,
        party: e.direction === 'out_transfer' ? outletName(e.outletId) : (e.party || '—'),
        item: `${e.quality || 'Fabric'}`, qty: `${num(e.qty)} ${e.unit}`,
        amount: e.rate ? money(e.qty * e.rate) : '—', sortKey: e.date,
      });
    });
    outletSales.forEach(s => rows.push({
      id: 'os' + s.id, date: s.date, type: `Outlet Sale (${outletName(s.outletId)})`,
      party: s.party || '—', item: `${s.quality || 'Fabric'}`, qty: `${num(s.qty)} ${s.unit}`,
      amount: s.rate ? money(s.qty * s.rate) : '—', sortKey: s.date,
    }));
    payments.forEach(p => rows.push({
      id: 'p' + p.id, date: p.date, type: p.direction === 'in' ? 'Payment In' : 'Payment Out',
      party: p.party || '—', item: p.mode || '—', qty: '—', amount: money(p.amount), sortKey: p.date,
    }));
    expenses.forEach(e => rows.push({
      id: 'e' + e.id, date: e.date, type: 'Expense', party: e.category || '—', item: e.note || '—',
      qty: '—', amount: money(e.amount), sortKey: e.date,
    }));
    return rows.sort((a, b) => (b.sortKey || '').localeCompare(a.sortKey || ''));
  }, [yarnEntries, fabricEntries, outletSales, payments, expenses, outlets]);

  // ---------- actions that span modules ----------
  const transferToOutlet = async (outletId, data) => {
    const transferId = uid();
    const fabricRow = await api.insertFabricEntry({
      direction: 'out_transfer', outletId, quality: data.quality,
      qty: data.qty, unit: data.unit, rate: 0, date: data.date, note: data.note,
    });
    setFabricEntries(prev => [...prev, fabricRow]);
    const moveRow = await api.insertOutletStockMove({
      outletId, direction: 'in', quality: data.quality, qty: data.qty,
      unit: data.unit, date: data.date, note: data.note, refTransferId: transferId,
    });
    setOutletStockMoves(prev => [...prev, moveRow]);
  };

  const recordOutletSale = async (outletId, data) => {
    const saleRow = await api.insertOutletSale({ outletId, ...data });
    setOutletSales(prev => [...prev, saleRow]);
    const moveRow = await api.insertOutletStockMove({
      outletId, direction: 'out', quality: data.quality, qty: data.qty,
      unit: data.unit, date: data.date, note: data.note,
    });
    setOutletStockMoves(prev => [...prev, moveRow]);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7', fontFamily: 'Inter, system-ui, sans-serif', color: '#6b7280' }}>
        Loading Royal Fabrics…
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <style>{GLOBAL_CSS}</style>
      <div className="rf-shell">
        <Header onMenu={() => setSidebarOpen(s => !s)} onSignOut={signOut} role={role} online={online} syncMsg={syncMsg} pendingCount={pendingCount} />
        <div className="rf-body">
          <Sidebar page={page} setPage={(p) => { setPage(p); setSidebarOpen(false); }} open={sidebarOpen} isOwner={isOwner} role={role} />
          <main className="rf-main">
            {page === 'dashboard' && (
              <Dashboard
                yarnStock={yarnStock} fabricStock={fabricStock} totalOutletStock={totalOutletStock}
                totalReceivable={totalReceivable} totalPayable={totalPayable}
                transactions={transactions} isOwner={isOwner}
              />
            )}
            {page === 'yarn' && (
              <YarnPage entries={yarnEntries} setEntries={setYarnEntries} stock={yarnStock} />
            )}
            {page === 'production' && (
              <ProductionPage
                production={production} setProduction={setProduction}
                yarnStock={yarnStock} fabricStock={fabricStock}
                onConsumeYarn={(row) => setYarnEntries(prev => [...prev, row])}
                onProduceFabric={(row) => setFabricEntries(prev => [...prev, row])}
              />
            )}
            {page === 'fabric' && (
              <FabricPage
                entries={fabricEntries} setEntries={setFabricEntries} stock={fabricStock}
                outlets={outlets} onTransfer={transferToOutlet}
              />
            )}
            {page === 'outlets' && (
              <OutletsPage
                outlets={outlets} setOutlets={setOutlets}
                outletStock={outletStock} outletStockMoves={outletStockMoves}
                outletSales={outletSales} onRecordSale={recordOutletSale}
              />
            )}
            {page === 'payments' && isOwner && (
              <PaymentsPage payments={payments} setPayments={setPayments} ledger={ledger} />
            )}
            {page === 'expenses' && isOwner && (
              <ExpensesPage expenses={expenses} setExpenses={setExpenses} total={totalExpenses} />
            )}
            {page === 'sales' && isOwner && (
              <SalesPage fabricEntries={fabricEntries} outletSales={outletSales} outlets={outlets} />
            )}
            {page === 'purchases' && isOwner && (
              <PurchasesPage yarnEntries={yarnEntries} />
            )}
            {page === 'settings' && isOwner && (
              <SettingsPage allData={{
                yarnEntries, setYarnEntries, fabricEntries, setFabricEntries,
                production, outlets, outletStockMoves, outletSales,
                payments, setPayments, expenses, setExpenses,
              }} />
            )}
            {page === 'reports' && isOwner && (
              <ReportsPage
                yarnEntries={yarnEntries} fabricEntries={fabricEntries} payments={payments}
                expenses={expenses} production={production} ledger={ledger}
                yarnStock={yarnStock} fabricStock={fabricStock}
                outlets={outlets} outletStock={outletStock} outletSales={outletSales}
                totalReceivable={totalReceivable} totalPayable={totalPayable} totalExpenses={totalExpenses}
              />
            )}
            {(page === 'payments' || page === 'expenses' || page === 'reports' || page === 'sales' || page === 'purchases' || page === 'settings') && !isOwner && (
              <div className="rf-card"><EmptyState text="This section is only available to the Owner account." /></div>
            )}
          </main>
        </div>
        <footer className="rf-footer">Designed &amp; created by <span>Nouman Khan</span> · 0304 9949993</footer>
      </div>
    </div>
  );
}

// ============================================================
// HEADER + SIDEBAR
// ============================================================
function Header({ onMenu, onSignOut, role, online, syncMsg, pendingCount }) {
  return (
    <div>
      {/* Offline / Sync status bar */}
      {!online && (
        <div style={{ background: '#1f2937', color: '#f9fafb', fontSize: 12, fontWeight: 600, textAlign: 'center', padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
          Offline mode — changes will sync when internet is available
          {pendingCount > 0 && <span style={{ background: '#d97706', color: '#fff', borderRadius: 10, padding: '1px 8px', marginLeft: 4 }}>{pendingCount} pending</span>}
        </div>
      )}
      {syncMsg && (
        <div style={{
          background: syncMsg.type === 'success' ? '#065f46' : syncMsg.type === 'error' ? '#7f1d1d' : '#1e3a5f',
          color: '#f9fafb', fontSize: 12, fontWeight: 600, textAlign: 'center', padding: '5px 16px',
        }}>
          {syncMsg.text}
        </div>
      )}
      <header className="rf-topnav">
        <button className="rf-hamburger" onClick={onMenu} aria-label="Toggle menu">
          <span /><span /><span />
        </button>
        <div className="rf-topnav-search">
          <Search size={16} />
          <input type="text" placeholder="Search…" disabled />
        </div>
        <div className="rf-topnav-actions">
          {/* Online/offline dot indicator */}
          <span title={online ? 'Online' : 'Offline'} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: online ? '#22c55e' : '#f59e0b', marginRight: 2, flexShrink: 0 }} />
          <button className="rf-topnav-icon" title="Branch"><Building2 size={18} /></button>
          <button className="rf-topnav-icon" title="Notifications"><Bell size={18} /></button>
          <button className="rf-topnav-profile" onClick={onSignOut} title="Sign out">
            <UserCircle size={20} />
            <span className="rf-topnav-role">{role === 'owner' ? 'Owner' : 'Staff'}</span>
            <LogOut size={15} />
          </button>
        </div>
      </header>
    </div>
  );
}

function Sidebar({ page, setPage, open, isOwner, role }) {
  const items = NAV.filter(item => !item.ownerOnly || isOwner);
  return (
    <nav className={`rf-sidebar ${open ? 'rf-sidebar-open' : ''}`}>
      <div className="rf-sidebar-brand">
        <img src="/icon-192.png" alt="Royal Fabrics" className="rf-sidebar-logo" />
        <div className="rf-sidebar-brand-text">
          <div className="rf-sidebar-name">Royal Fabrics</div>
          <div className="rf-sidebar-tag">Enterprise ERP</div>
        </div>
      </div>
      <div className="rf-sidebar-divider" />
      <div className="rf-sidebar-items">
        {items.map(item => {
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button key={item.id} className={`rf-nav-item ${active ? 'active' : ''}`} onClick={() => setPage(item.id)}>
              <Icon size={18} strokeWidth={2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="rf-sidebar-divider" />
      <div className="rf-sidebar-user">
        <UserCircle size={26} />
        <div>
          <div className="rf-sidebar-user-role">{role === 'owner' ? 'Owner' : 'Staff'}</div>
          <div className="rf-sidebar-user-sub">Signed in</div>
       
