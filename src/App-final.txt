import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Scissors, Boxes, Wallet, BarChart3, Factory,
  Plus, Printer, Trash2, X, ArrowUpCircle, ArrowDownCircle,
  TrendingUp, TrendingDown, Receipt, Store, ArrowRightLeft, LogOut
} from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import * as api from './api';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// ---------- nav config ----------
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'yarn', label: 'Yarn', icon: Boxes },
  { id: 'production', label: 'Production', icon: Factory },
  { id: 'fabric', label: 'Fabric', icon: Scissors },
  { id: 'outlets', label: 'Outlets', icon: Store },
  { id: 'payments', label: 'Payments', icon: Wallet, ownerOnly: true },
  { id: 'expenses', label: 'Expenses', icon: Receipt, ownerOnly: true },
  { id: 'reports', label: 'Reports', icon: BarChart3, ownerOnly: true },
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
    (async () => {
      try {
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

  // factory fabric stock: in (production) - out_sale - out_transfer
  const fabricStock = useMemo(() => {
    return fabricEntries.reduce((sum, e) => {
      if (e.direction === 'in') return sum + Number(e.qty);
      return sum - Number(e.qty); // out_sale or out_transfer
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
        <Header onMenu={() => setSidebarOpen(s => !s)} onSignOut={signOut} />
        <div className="rf-body">
          <Sidebar page={page} setPage={(p) => { setPage(p); setSidebarOpen(false); }} open={sidebarOpen} isOwner={isOwner} />
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
            {page === 'reports' && isOwner && (
              <ReportsPage
                yarnEntries={yarnEntries} fabricEntries={fabricEntries} payments={payments}
                expenses={expenses} production={production} ledger={ledger}
                yarnStock={yarnStock} fabricStock={fabricStock}
                outlets={outlets} outletStock={outletStock} outletSales={outletSales}
                totalReceivable={totalReceivable} totalPayable={totalPayable} totalExpenses={totalExpenses}
              />
            )}
            {(page === 'payments' || page === 'expenses' || page === 'reports') && !isOwner && (
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
function Header({ onMenu, onSignOut }) {
  return (
    <header className="rf-header">
      <button className="rf-hamburger" onClick={onMenu} aria-label="Toggle menu">
        <span /><span /><span />
      </button>
      <img src="/icon-192.png" alt="Royal Fabrics" className="rf-logo-badge" />
      <h1>ROYAL FABRICS INVENTORY MANAGEMENT</h1>
      <button className="rf-logout-btn" onClick={onSignOut} title="Sign out"><LogOut size={16} /></button>
    </header>
  );
}

function Sidebar({ page, setPage, open, isOwner }) {
  const items = NAV.filter(item => !item.ownerOnly || isOwner);
  return (
    <nav className={`rf-sidebar ${open ? 'rf-sidebar-open' : ''}`}>
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
    </nav>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function StatCard({ label, value, accent, icon: Icon }) {
  return (
    <div className="rf-card rf-stat-card" style={{ borderLeftColor: accent }}>
      <div className="rf-stat-top">
        <span className="rf-stat-label">{label}</span>
        {Icon && <Icon size={16} color={accent} />}
      </div>
      <div className="rf-stat-value">{value}</div>
    </div>
  );
}

function Dashboard({ yarnStock, fabricStock, totalOutletStock, totalReceivable, totalPayable, transactions, isOwner }) {
  return (
    <div>
      <div className="rf-page-head">
        <h2>Dashboard</h2>
        <button className="rf-btn-outline" onClick={() => window.print()}><Printer size={15} /> Print</button>
      </div>

      <div className="rf-stat-grid">
        <StatCard label="Fabric Stock — Factory (yd/m)" value={num(fabricStock)} accent="#2563eb" icon={Scissors} />
        <StatCard label="Fabric Stock — Outlets (yd/m)" value={num(totalOutletStock)} accent="#7c3aed" icon={Store} />
        <StatCard label="Yarn Stock (kg/lb)" value={num(yarnStock)} accent="#16a34a" icon={Boxes} />
        {isOwner && <StatCard label="Total Receivable" value={money(totalReceivable)} accent="#d4a017" icon={TrendingUp} />}
        {isOwner && <StatCard label="Total Payable" value={money(totalPayable)} accent="#dc2626" icon={TrendingDown} />}
      </div>

      <div className="rf-card" style={{ marginTop: 24 }}>
        <h3 className="rf-section-title">Recent Transactions</h3>
        <TransactionsTable rows={transactions.slice(0, 12)} />
        {transactions.length === 0 && <EmptyState text="No transactions yet. Start by recording a yarn purchase or fabric sale." />}
        {!isOwner && <p className="rf-hint" style={{ marginTop: 10 }}>Payment and expense entries are only visible to the Owner account.</p>}
      </div>
    </div>
  );
}

function TransactionsTable({ rows }) {
  if (rows.length === 0) return null;
  return (
    <div className="rf-table-wrap">
      <table className="rf-table">
        <thead>
          <tr><th>Date</th><th>Type</th><th>Party</th><th>Item</th><th>Qty</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{fmtDate(r.date)}</td>
              <td><TypeTag type={r.type} /></td>
              <td>{r.party}</td>
              <td>{r.item}</td>
              <td>{r.qty}</td>
              <td>{r.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TypeTag({ type }) {
  const isTransfer = type.includes('→') || type.includes('Outlet');
  const isIn = type.includes('In') || (type.includes('Sale') && !type.includes('Outlet'));
  let color = '#b91c1c', bg = '#fee2e2';
  if (type.includes('Expense')) { color = '#92400e'; bg = '#fef3c7'; }
  else if (type.includes('→')) { color = '#6d28d9'; bg = '#ede9fe'; }
  else if (type.includes('Outlet Sale')) { color = '#0e7490'; bg = '#cffafe'; }
  else if (isIn) { color = '#15803d'; bg = '#dcfce7'; }
  return <span style={{ color, background: bg, fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{type}</span>;
}

function EmptyState({ text }) {
  return <div className="rf-empty">{text}</div>;
}

// ============================================================
// SHARED: Modal, Form bits
// ============================================================
function Modal({ title, onClose, children }) {
  return (
    <div className="rf-modal-overlay" onClick={onClose}>
      <div className="rf-modal" onClick={e => e.stopPropagation()}>
        <div className="rf-modal-head">
          <h3>{title}</h3>
          <button className="rf-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="rf-modal-body">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="rf-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ============================================================
// YARN PAGE
// ============================================================
function YarnPage({ entries, setEntries, stock }) {
  const [modal, setModal] = useState(null);
  const sorted = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const addEntry = async (direction, data) => {
    const row = await api.insertYarnEntry({ direction, ...data });
    setEntries(prev => [...prev, row]);
    setModal(null);
  };
  const removeEntry = async (id) => {
    await api.deleteYarnEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div>
      <div className="rf-page-head">
        <h2>Yarn</h2>
        <div className="rf-btn-row">
          <button className="rf-btn-secondary" onClick={() => setModal('out')}><ArrowDownCircle size={16} /> Yarn Out</button>
          <button className="rf-btn-primary" onClick={() => setModal('in')}><ArrowUpCircle size={16} /> Yarn In (Purchase)</button>
        </div>
      </div>

      <StatCard label="Current Yarn Stock" value={`${num(stock)} kg / lb`} accent="#16a34a" icon={Boxes} />

      <div className="rf-card" style={{ marginTop: 20 }}>
        <h3 className="rf-section-title">Yarn Entries</h3>
        {sorted.length === 0 ? <EmptyState text="No yarn entries yet. Record a purchase to begin tracking stock." /> : (
          <div className="rf-table-wrap">
            <table className="rf-table">
              <thead><tr><th>Date</th><th>Direction</th><th>Quality</th><th>Party</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {sorted.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.date)}</td>
                    <td><TypeTag type={e.direction === 'in' ? 'Yarn In' : 'Yarn Out'} /></td>
                    <td>{e.quality || '—'}</td>
                    <td>{e.party || '—'}</td>
                    <td>{num(e.qty)} {e.unit}</td>
                    <td>{e.rate ? money(e.rate) : '—'}</td>
                    <td>{e.rate ? money(e.qty * e.rate) : '—'}</td>
                    <td><button className="rf-icon-btn" onClick={() => removeEntry(e.id)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal === 'in' ? 'Yarn In — Purchase' : 'Yarn Out — Manual'} onClose={() => setModal(null)}>
          <YarnForm direction={modal} onSubmit={(data) => addEntry(modal, data)} />
        </Modal>
      )}
    </div>
  );
}

function YarnForm({ direction, onSubmit }) {
  const [party, setParty] = useState('');
  const [quality, setQuality] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('kg');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!qty || Number(qty) <= 0) return;
    onSubmit({ party, quality, qty: Number(qty), unit, rate: rate ? Number(rate) : 0, date, note });
  };

  return (
    <form onSubmit={submit} className="rf-form">
      <Field label={direction === 'in' ? 'Supplier' : 'Issued To / Reference'}>
        <input value={party} onChange={e => setParty(e.target.value)} placeholder="e.g. Anand Yarns" />
      </Field>
      <Field label="Yarn Type / Quality">
        <input value={quality} onChange={e => setQuality(e.target.value)} placeholder="e.g. 30s Cotton" />
      </Field>
      <div className="rf-form-row">
        <Field label="Quantity">
          <input type="number" min="0" step="0.01" value={qty} onChange={e => setQty(e.target.value)} required />
        </Field>
        <Field label="Unit">
          <select value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </Field>
      </div>
      <Field label={direction === 'in' ? 'Rate per unit (Rs)' : 'Rate per unit (Rs) — optional'}>
        <input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Any reference / remark" />
      </Field>
      <button type="submit" className="rf-btn-primary rf-form-submit"><Plus size={16} /> Save Entry</button>
    </form>
  );
}

// ============================================================
// PRODUCTION PAGE (Yarn -> Fabric)
// ============================================================
function ProductionPage({ production, setProduction, yarnStock, fabricStock, onConsumeYarn, onProduceFabric }) {
  const [modal, setModal] = useState(false);
  const sorted = [...production].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const addBatch = async (data) => {
    const batchId = uid();
    const yarnRow = await api.insertYarnEntry({ direction: 'out', party: '', quality: data.yarnQuality, qty: Number(data.yarnQty), unit: data.yarnUnit, rate: 0, date: data.date, note: `Production batch ${batchId.slice(0, 6)}` });
    onConsumeYarn(yarnRow, true);
    const fabricRow = await api.insertFabricEntry({ direction: 'in', quality: data.fabricQuality, qty: Number(data.fabricQty), unit: data.fabricUnit, rate: 0, date: data.date, note: `Production batch ${batchId.slice(0, 6)}` });
    onProduceFabric(fabricRow, true);
    const batchRow = await api.insertProduction({ ...data, id: batchId });
    setProduction(prev => [...prev, batchRow]);
    setModal(false);
  };
  const removeBatch = async (id) => {
    await api.deleteProduction(id);
    setProduction(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div>
      <div className="rf-page-head">
        <h2>Production</h2>
        <button className="rf-btn-primary" onClick={() => setModal(true)}><Factory size={16} /> New Production Batch</button>
      </div>

      <div className="rf-stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        <StatCard label="Yarn Available" value={`${num(yarnStock)} kg/lb`} accent="#16a34a" icon={Boxes} />
        <StatCard label="Fabric Available (Factory)" value={`${num(fabricStock)} yd/m`} accent="#2563eb" icon={Scissors} />
      </div>

      <div className="rf-card" style={{ marginTop: 20 }}>
        <h3 className="rf-section-title">Production Batches</h3>
        <p className="rf-hint">Each batch records yarn consumed and fabric produced as one linked conversion — yarn stock decreases, factory fabric stock increases.</p>
        {sorted.length === 0 ? <EmptyState text="No production batches yet." /> : (
          <div className="rf-table-wrap">
            <table className="rf-table">
              <thead><tr><th>Date</th><th>Yarn Used</th><th>Fabric Produced</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {sorted.map(b => (
                  <tr key={b.id}>
                    <td>{fmtDate(b.date)}</td>
                    <td>{num(b.yarnQty)} {b.yarnUnit} {b.yarnQuality ? `(${b.yarnQuality})` : ''}</td>
                    <td>{num(b.fabricQty)} {b.fabricUnit} {b.fabricQuality ? `(${b.fabricQuality})` : ''}</td>
                    <td>{b.note || '—'}</td>
                    <td><button className="rf-icon-btn" onClick={() => removeBatch(b.id)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title="New Production Batch" onClose={() => setModal(false)}>
          <ProductionForm onSubmit={addBatch} maxYarn={yarnStock} />
        </Modal>
      )}
    </div>
  );
}

function ProductionForm({ onSubmit, maxYarn }) {
  const [yarnQty, setYarnQty] = useState('');
  const [yarnUnit, setYarnUnit] = useState('kg');
  const [yarnQuality, setYarnQuality] = useState('');
  const [fabricQty, setFabricQty] = useState('');
  const [fabricUnit, setFabricUnit] = useState('meter');
  const [fabricQuality, setFabricQuality] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!yarnQty || !fabricQty) return;
    onSubmit({ yarnQty: Number(yarnQty), yarnUnit, yarnQuality, fabricQty: Number(fabricQty), fabricUnit, fabricQuality, date, note });
  };

  return (
    <form onSubmit={submit} className="rf-form">
      <div className="rf-form-section-label">Yarn Consumed</div>
      <div className="rf-form-row">
        <Field label="Quantity">
          <input type="number" min="0" step="0.01" value={yarnQty} onChange={e => setYarnQty(e.target.value)} required />
        </Field>
        <Field label="Unit">
          <select value={yarnUnit} onChange={e => setYarnUnit(e.target.value)}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </Field>
      </div>
      <Field label="Yarn Quality (optional)">
        <input value={yarnQuality} onChange={e => setYarnQuality(e.target.value)} placeholder="e.g. 30s Cotton" />
      </Field>
      {maxYarn != null && <p className="rf-hint">Currently in stock: {num(maxYarn)} {yarnUnit}</p>}

      <div className="rf-form-section-label" style={{ marginTop: 8 }}>Fabric Produced</div>
      <div className="rf-form-row">
        <Field label="Quantity">
          <input type="number" min="0" step="0.01" value={fabricQty} onChange={e => setFabricQty(e.target.value)} required />
        </Field>
        <Field label="Unit">
          <select value={fabricUnit} onChange={e => setFabricUnit(e.target.value)}>
            <option value="meter">meter</option>
            <option value="yard">yard</option>
          </select>
        </Field>
      </div>
      <Field label="Fabric Quality (optional)">
        <input value={fabricQuality} onChange={e => setFabricQuality(e.target.value)} placeholder="e.g. Grey Twill" />
      </Field>

      <Field label="Date">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Batch reference" />
      </Field>
      <button type="submit" className="rf-btn-primary rf-form-submit"><Plus size={16} /> Save Batch</button>
    </form>
  );
}

// ============================================================
// FABRIC PAGE (Direct Sale OR Transfer to Outlet)
// ============================================================
function FabricPage({ entries, setEntries, stock, outlets, onTransfer }) {
  const [modal, setModal] = useState(null); // 'sale' | 'transfer'
  const sorted = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const addSale = async (data) => {
    const row = await api.insertFabricEntry({ direction: 'out_sale', ...data });
    setEntries(prev => [...prev, row]);
    setModal(null);
  };
  const removeEntry = async (id) => {
    await api.deleteFabricEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div>
      <div className="rf-page-head">
        <h2>Fabric</h2>
        <div className="rf-btn-row">
          <button className="rf-btn-secondary" onClick={() => setModal('transfer')}><Store size={16} /> Transfer to Outlet</button>
          <button className="rf-btn-primary" onClick={() => setModal('sale')}><ArrowDownCircle size={16} /> Direct Sale</button>
        </div>
      </div>

      <StatCard label="Current Fabric Stock — Factory" value={`${num(stock)} yard / meter`} accent="#2563eb" icon={Scissors} />
      <p className="rf-hint" style={{ marginTop: 10 }}>Fabric stock increases automatically from Production batches. Use Direct Sale to sell straight from the factory, or Transfer to Outlet to move stock into a store for retail sale.</p>

      <div className="rf-card" style={{ marginTop: 16 }}>
        <h3 className="rf-section-title">Fabric Entries</h3>
        {sorted.length === 0 ? <EmptyState text="No fabric entries yet." /> : (
          <div className="rf-table-wrap">
            <table className="rf-table">
              <thead><tr><th>Date</th><th>Type</th><th>Quality</th><th>Party / Outlet</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {sorted.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.date)}</td>
                    <td><TypeTag type={e.direction === 'in' ? 'Fabric In' : e.direction === 'out_transfer' ? 'Fabric → Outlet' : 'Fabric Out (Sale)'} /></td>
                    <td>{e.quality || '—'}</td>
                    <td>{e.direction === 'out_transfer' ? (outlets.find(o => o.id === e.outletId)?.name || '—') : (e.party || '—')}</td>
                    <td>{num(e.qty)} {e.unit}</td>
                    <td>{e.rate ? money(e.rate) : '—'}</td>
                    <td>{e.rate ? money(e.qty * e.rate) : '—'}</td>
                    <td>{e.direction !== 'in' && <button className="rf-icon-btn" onClick={() => removeEntry(e.id)}><Trash2 size={15} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === 'sale' && (
        <Modal title="Direct Sale — Factory to Customer" onClose={() => setModal(null)}>
          <FabricSaleForm onSubmit={addSale} />
        </Modal>
      )}
      {modal === 'transfer' && (
        <Modal title="Transfer Fabric to Outlet" onClose={() => setModal(null)}>
          {outlets.length === 0 ? (
            <p className="rf-hint">No outlets added yet. Go to the <strong>Outlets</strong> page first to add one.</p>
          ) : (
            <TransferForm outlets={outlets} maxStock={stock} onSubmit={(data) => { onTransfer(data.outletId, data); setModal(null); }} />
          )}
        </Modal>
      )}
    </div>
  );
}

function FabricSaleForm({ onSubmit }) {
  const [party, setParty] = useState('');
  const [quality, setQuality] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('meter');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!qty || Number(qty) <= 0) return;
    onSubmit({ party, quality, qty: Number(qty), unit, rate: rate ? Number(rate) : 0, date, note });
  };

  return (
    <form onSubmit={submit} className="rf-form">
      <Field label="Customer">
        <input value={party} onChange={e => setParty(e.target.value)} placeholder="e.g. Shree Textiles" />
      </Field>
      <Field label="Fabric Quality (optional)">
        <input value={quality} onChange={e => setQuality(e.target.value)} placeholder="e.g. Grey Twill" />
      </Field>
      <div className="rf-form-row">
        <Field label="Quantity">
          <input type="number" min="0" step="0.01" value={qty} onChange={e => setQty(e.target.value)} required />
        </Field>
        <Field label="Unit">
          <select value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="meter">meter</option>
            <option value="yard">yard</option>
          </select>
        </Field>
      </div>
      <Field label="Rate per unit (Rs)">
        <input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Invoice ref, etc." />
      </Field>
      <button type="submit" className="rf-btn-primary rf-form-submit"><Plus size={16} /> Save Sale</button>
    </form>
  );
}

function TransferForm({ outlets, maxStock, onSubmit }) {
  const [outletId, setOutletId] = useState(outlets[0]?.id || '');
  const [quality, setQuality] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('meter');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!qty || Number(qty) <= 0 || !outletId) return;
    onSubmit({ outletId, quality, qty: Number(qty), unit, date, note });
  };

  return (
    <form onSubmit={submit} className="rf-form">
      <Field label="Outlet">
        <select value={outletId} onChange={e => setOutletId(e.target.value)} required>
          {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </Field>
      <Field label="Fabric Quality (optional)">
        <input value={quality} onChange={e => setQuality(e.target.value)} placeholder="e.g. Grey Twill" />
      </Field>
      <div className="rf-form-row">
        <Field label="Quantity">
          <input type="number" min="0" step="0.01" value={qty} onChange={e => setQty(e.target.value)} required />
        </Field>
        <Field label="Unit">
          <select value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="meter">meter</option>
            <option value="yard">yard</option>
          </select>
        </Field>
      </div>
      {maxStock != null && <p className="rf-hint">Currently in factory stock: {num(maxStock)} {unit}</p>}
      <Field label="Date">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Transfer reference" />
      </Field>
      <button type="submit" className="rf-btn-primary rf-form-submit"><ArrowRightLeft size={16} /> Send to Outlet</button>
    </form>
  );
}

// ============================================================
// OUTLETS PAGE
// ============================================================
function OutletsPage({ outlets, setOutlets, outletStock, outletStockMoves, outletSales, onRecordSale }) {
  const [addingOutlet, setAddingOutlet] = useState(false);
  const [saleOutlet, setSaleOutlet] = useState(null); // outlet object
  const [detailOutlet, setDetailOutlet] = useState(null);

  const addOutlet = async (data) => {
    const row = await api.insertOutlet(data);
    setOutlets(prev => [...prev, row]);
    setAddingOutlet(false);
  };
  const removeOutlet = async (id) => {
    await api.deleteOutlet(id);
    setOutlets(prev => prev.filter(o => o.id !== id));
  };

  return (
    <div>
      <div className="rf-page-head">
        <h2>Outlets</h2>
        <button className="rf-btn-primary" onClick={() => setAddingOutlet(true)}><Plus size={16} /> Add Outlet</button>
      </div>

      {outlets.length === 0 ? (
        <div className="rf-card"><EmptyState text="No outlets yet. Add your first outlet/store to start transferring and selling fabric there." /></div>
      ) : (
        <div className="rf-stat-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
          {outlets.map(o => (
            <div key={o.id} className="rf-card rf-outlet-card">
              <div className="rf-outlet-card-top">
                <div>
                  <div className="rf-outlet-name"><Store size={15} /> {o.name}</div>
                  {o.location && <div className="rf-outlet-location">{o.location}</div>}
                </div>
                <button className="rf-icon-btn" onClick={() => removeOutlet(o.id)}><Trash2 size={15} /></button>
              </div>
              <div className="rf-outlet-stock">{num(outletStock[o.id] || 0)} <span>yd/m in stock</span></div>
              <div className="rf-btn-row" style={{ marginTop: 10 }}>
                <button className="rf-btn-outline" onClick={() => setDetailOutlet(o)} style={{ flex: 1, justifyContent: 'center' }}>History</button>
                <button className="rf-btn-primary" onClick={() => setSaleOutlet(o)} style={{ flex: 1, justifyContent: 'center' }}>Record Sale</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addingOutlet && (
        <Modal title="Add Outlet" onClose={() => setAddingOutlet(false)}>
          <OutletForm onSubmit={addOutlet} />
        </Modal>
      )}

      {saleOutlet && (
        <Modal title={`Outlet Sale — ${saleOutlet.name}`} onClose={() => setSaleOutlet(null)}>
          <OutletSaleForm
            maxStock={outletStock[saleOutlet.id] || 0}
            onSubmit={(data) => { onRecordSale(saleOutlet.id, data); setSaleOutlet(null); }}
          />
        </Modal>
      )}

      {detailOutlet && (
        <Modal title={`${detailOutlet.name} — History`} onClose={() => setDetailOutlet(null)}>
          <OutletHistory
            outletId={detailOutlet.id}
            moves={outletStockMoves.filter(m => m.outletId === detailOutlet.id)}
            sales={outletSales.filter(s => s.outletId === detailOutlet.id)}
          />
        </Modal>
      )}
    </div>
  );
}

function OutletForm({ onSubmit }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), location: location.trim() });
  };
  return (
    <form onSubmit={submit} className="rf-form">
      <Field label="Outlet Name">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Royal Fabrics — City Market" required />
      </Field>
      <Field label="Location (optional)">
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Main Bazaar Road" />
      </Field>
      <button type="submit" className="rf-btn-primary rf-form-submit"><Plus size={16} /> Add Outlet</button>
    </form>
  );
}

function OutletSaleForm({ onSubmit, maxStock }) {
  const [party, setParty] = useState('');
  const [quality, setQuality] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('meter');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!qty || Number(qty) <= 0) return;
    onSubmit({ party, quality, qty: Number(qty), unit, rate: rate ? Number(rate) : 0, date, note });
  };

  return (
    <form onSubmit={submit} className="rf-form">
      <p className="rf-hint" style={{ marginTop: 0 }}>Currently in stock at this outlet: {num(maxStock)} {unit}</p>
      <Field label="Customer">
        <input value={party} onChange={e => setParty(e.target.value)} placeholder="Walk-in / customer name" />
      </Field>
      <Field label="Fabric Quality (optional)">
        <input value={quality} onChange={e => setQuality(e.target.value)} placeholder="e.g. Grey Twill" />
      </Field>
      <div className="rf-form-row">
        <Field label="Quantity">
          <input type="number" min="0" step="0.01" value={qty} onChange={e => setQty(e.target.value)} required />
        </Field>
        <Field label="Unit">
          <select value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="meter">meter</option>
            <option value="yard">yard</option>
          </select>
        </Field>
      </div>
      <Field label="Rate per unit (Rs)">
        <input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Bill ref, etc." />
      </Field>
      <button type="submit" className="rf-btn-primary rf-form-submit"><Plus size={16} /> Save Sale</button>
    </form>
  );
}

function OutletHistory({ moves, sales }) {
  const allRows = [
    ...moves.map(m => ({ ...m, kind: m.direction === 'in' ? 'Transfer In' : 'Adjustment Out' })),
    ...sales.map(s => ({ ...s, kind: 'Sale' })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (allRows.length === 0) return <EmptyState text="No activity at this outlet yet." />;

  return (
    <div className="rf-table-wrap">
      <table className="rf-table">
        <thead><tr><th>Date</th><th>Type</th><th>Party</th><th>Qty</th><th>Amount</th></tr></thead>
        <tbody>
          {allRows.map((r, i) => (
            <tr key={i}>
              <td>{fmtDate(r.date)}</td>
              <td><TypeTag type={r.kind === 'Sale' ? 'Outlet Sale' : r.kind} /></td>
              <td>{r.party || '—'}</td>
              <td>{num(r.qty)} {r.unit}</td>
              <td>{r.rate ? money(r.qty * r.rate) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// PAYMENTS PAGE
// ============================================================
function PaymentsPage({ payments, setPayments, ledger }) {
  const [modal, setModal] = useState(null);
  const sorted = [...payments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const parties = Object.keys(ledger).sort();

  const addPayment = async (direction, data) => {
    const row = await api.insertPayment({ direction, ...data });
    setPayments(prev => [...prev, row]);
    setModal(null);
  };
  const removePayment = async (id) => {
    await api.deletePayment(id);
    setPayments(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div>
      <div className="rf-page-head">
        <h2>Payments</h2>
        <div className="rf-btn-row">
          <button className="rf-btn-secondary" onClick={() => setModal('out')}><ArrowDownCircle size={16} /> Payment Out</button>
          <button className="rf-btn-primary" onClick={() => setModal('in')}><ArrowUpCircle size={16} /> Payment In</button>
        </div>
      </div>

      <div className="rf-card">
        <h3 className="rf-section-title">Party Ledger</h3>
        <p className="rf-hint">Includes direct sales, outlet sales, yarn purchases, and payments — for every party.</p>
        {parties.length === 0 ? <EmptyState text="No party balances yet." /> : (
          <div className="rf-table-wrap">
            <table className="rf-table">
              <thead><tr><th>Party</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {parties.map(p => (
                  <tr key={p}>
                    <td>{p}</td>
                    <td>{money(Math.abs(ledger[p]))}</td>
                    <td>
                      {ledger[p] > 0 && <span style={{ color: '#15803d', fontWeight: 600 }}>Receivable</span>}
                      {ledger[p] < 0 && <span style={{ color: '#b91c1c', fontWeight: 600 }}>Payable</span>}
                      {ledger[p] === 0 && <span style={{ color: '#6b7280' }}>Settled</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rf-card" style={{ marginTop: 20 }}>
        <h3 className="rf-section-title">Payment History</h3>
        {sorted.length === 0 ? <EmptyState text="No payments recorded yet." /> : (
          <div className="rf-table-wrap">
            <table className="rf-table">
              <thead><tr><th>Date</th><th>Direction</th><th>Party</th><th>Mode</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {sorted.map(p => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.date)}</td>
                    <td><TypeTag type={p.direction === 'in' ? 'Payment In' : 'Payment Out'} /></td>
                    <td>{p.party || '—'}</td>
                    <td>{p.mode || '—'}</td>
                    <td>{money(p.amount)}</td>
                    <td><button className="rf-icon-btn" onClick={() => removePayment(p.id)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal === 'in' ? 'Payment In (from Customer)' : 'Payment Out (to Supplier)'} onClose={() => setModal(null)}>
          <PaymentForm direction={modal} onSubmit={(data) => addPayment(modal, data)} />
        </Modal>
      )}
    </div>
  );
}

function PaymentForm({ direction, onSubmit }) {
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    onSubmit({ party, amount: Number(amount), mode, date, note });
  };

  return (
    <form onSubmit={submit} className="rf-form">
      <Field label={direction === 'in' ? 'Customer' : 'Supplier'}>
        <input value={party} onChange={e => setParty(e.target.value)} placeholder="Party name" required />
      </Field>
      <Field label="Amount (Rs)">
        <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
      </Field>
      <Field label="Mode">
        <select value={mode} onChange={e => setMode(e.target.value)}>
          <option>Cash</option>
          <option>Bank Transfer</option>
          <option>Cheque</option>
          <option>UPI</option>
          <option>Other</option>
        </select>
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reference" />
      </Field>
      <button type="submit" className="rf-btn-primary rf-form-submit"><Plus size={16} /> Save Payment</button>
    </form>
  );
}

// ============================================================
// EXPENSES PAGE
// ============================================================
function ExpensesPage({ expenses, setExpenses, total }) {
  const [modal, setModal] = useState(false);
  const sorted = [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const addExpense = async (data) => {
    const row = await api.insertExpense(data);
    setExpenses(prev => [...prev, row]);
    setModal(false);
  };
  const removeExpense = async (id) => {
    await api.deleteExpense(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div>
      <div className="rf-page-head">
        <h2>Expenses</h2>
        <button className="rf-btn-primary" onClick={() => setModal(true)}><Plus size={16} /> Add Expense</button>
      </div>

      <StatCard label="Total Expenses" value={money(total)} accent="#dc2626" icon={Receipt} />

      <div className="rf-card" style={{ marginTop: 20 }}>
        <h3 className="rf-section-title">Expense Log</h3>
        {sorted.length === 0 ? <EmptyState text="No expenses recorded yet." /> : (
          <div className="rf-table-wrap">
            <table className="rf-table">
              <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {sorted.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.date)}</td>
                    <td>{e.category || '—'}</td>
                    <td>{e.note || '—'}</td>
                    <td>{money(e.amount)}</td>
                    <td><button className="rf-icon-btn" onClick={() => removeExpense(e.id)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title="Add Expense" onClose={() => setModal(false)}>
          <ExpenseForm onSubmit={addExpense} />
        </Modal>
      )}
    </div>
  );
}

function ExpenseForm({ onSubmit }) {
  const [category, setCategory] = useState('Transport');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    onSubmit({ category, amount: Number(amount), date, note });
  };

  return (
    <form onSubmit={submit} className="rf-form">
      <Field label="Category">
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option>Transport</option>
          <option>Electricity</option>
          <option>Labour / Wages</option>
          <option>Maintenance</option>
          <option>Rent</option>
          <option>Other</option>
        </select>
      </Field>
      <Field label="Amount (Rs)">
        <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Details" />
      </Field>
      <button type="submit" className="rf-btn-primary rf-form-submit"><Plus size={16} /> Save Expense</button>
    </form>
  );
}

// ============================================================
// REPORTS PAGE
// ============================================================
function ReportsPage({ yarnEntries, fabricEntries, payments, expenses, production, ledger, yarnStock, fabricStock, outlets, outletStock, outletSales, totalReceivable, totalPayable, totalExpenses }) {
  const [tab, setTab] = useState('summary');
  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'yarn', label: 'Yarn' },
    { id: 'fabric', label: 'Fabric' },
    { id: 'outlets', label: 'Outlets' },
    { id: 'cash', label: 'Cash / Payments' },
    { id: 'ledger', label: 'Party Ledger' },
  ];

  const yarnIn = yarnEntries.filter(e => e.direction === 'in').reduce((s, e) => s + Number(e.qty), 0);
  const yarnOut = yarnEntries.filter(e => e.direction === 'out').reduce((s, e) => s + Number(e.qty), 0);
  const yarnPurchaseValue = yarnEntries.filter(e => e.direction === 'in').reduce((s, e) => s + Number(e.qty) * Number(e.rate || 0), 0);

  const fabricProduced = fabricEntries.filter(e => e.direction === 'in').reduce((s, e) => s + Number(e.qty), 0);
  const fabricDirectSold = fabricEntries.filter(e => e.direction === 'out_sale').reduce((s, e) => s + Number(e.qty), 0);
  const fabricTransferred = fabricEntries.filter(e => e.direction === 'out_transfer').reduce((s, e) => s + Number(e.qty), 0);
  const directSaleValue = fabricEntries.filter(e => e.direction === 'out_sale').reduce((s, e) => s + Number(e.qty) * Number(e.rate || 0), 0);

  const outletSoldQty = outletSales.reduce((s, o) => s + Number(o.qty), 0);
  const outletSaleValue = outletSales.reduce((s, o) => s + Number(o.qty) * Number(o.rate || 0), 0);
  const totalOutletStock = Object.values(outletStock).reduce((a, b) => a + b, 0);
  const totalFabricSaleValue = directSaleValue + outletSaleValue;

  const paymentsIn = payments.filter(p => p.direction === 'in').reduce((s, p) => s + Number(p.amount), 0);
  const paymentsOut = payments.filter(p => p.direction === 'out').reduce((s, p) => s + Number(p.amount), 0);
  const netCash = paymentsIn - paymentsOut - totalExpenses;

  const outletName = (id) => outlets.find(o => o.id === id)?.name || 'Outlet';

  return (
    <div>
      <div className="rf-page-head">
        <h2>Reports</h2>
        <button className="rf-btn-outline" onClick={() => window.print()}><Printer size={15} /> Print</button>
      </div>

      <div className="rf-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`rf-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="rf-report-grid">
          <ReportBlock title="Stock">
            <RLine label="Yarn in hand" value={`${num(yarnStock)} kg/lb`} />
            <RLine label="Fabric in hand — factory" value={`${num(fabricStock)} yd/m`} />
            <RLine label="Fabric in hand — outlets" value={`${num(totalOutletStock)} yd/m`} />
          </ReportBlock>
          <ReportBlock title="Receivables & Payables">
            <RLine label="Total Receivable" value={money(totalReceivable)} positive />
            <RLine label="Total Payable" value={money(totalPayable)} negative />
          </ReportBlock>
          <ReportBlock title="Cash Flow">
            <RLine label="Payments In" value={money(paymentsIn)} positive />
            <RLine label="Payments Out" value={money(paymentsOut)} negative />
            <RLine label="Expenses" value={money(totalExpenses)} negative />
            <RLine label="Net Cash" value={money(netCash)} bold positive={netCash >= 0} negative={netCash < 0} />
          </ReportBlock>
          <ReportBlock title="Production & Sales">
            <RLine label="Batches run" value={production.length} />
            <RLine label="Total fabric produced" value={num(fabricProduced)} />
            <RLine label="Direct sales value" value={money(directSaleValue)} />
            <RLine label="Outlet sales value" value={money(outletSaleValue)} />
          </ReportBlock>
        </div>
      )}

      {tab === 'yarn' && (
        <div className="rf-card">
          <h3 className="rf-section-title">Yarn Report</h3>
          <div className="rf-report-grid" style={{ marginBottom: 16 }}>
            <ReportBlock title="Totals">
              <RLine label="Total Yarn In" value={num(yarnIn)} />
              <RLine label="Total Yarn Out" value={num(yarnOut)} />
              <RLine label="Current Stock" value={num(yarnStock)} bold />
              <RLine label="Total Purchase Value" value={money(yarnPurchaseValue)} />
            </ReportBlock>
          </div>
          <FullTable
            rows={yarnEntries.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))}
            columns={[
              { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
              { key: 'direction', label: 'Direction', render: r => <TypeTag type={r.direction === 'in' ? 'Yarn In' : 'Yarn Out'} /> },
              { key: 'quality', label: 'Quality' },
              { key: 'party', label: 'Party' },
              { key: 'qty', label: 'Qty', render: r => `${num(r.qty)} ${r.unit}` },
              { key: 'rate', label: 'Rate', render: r => r.rate ? money(r.rate) : '—' },
            ]}
          />
        </div>
      )}

      {tab === 'fabric' && (
        <div className="rf-card">
          <h3 className="rf-section-title">Fabric Report</h3>
          <div className="rf-report-grid" style={{ marginBottom: 16 }}>
            <ReportBlock title="Totals">
              <RLine label="Total Fabric Produced" value={num(fabricProduced)} />
              <RLine label="Direct Sales (factory)" value={num(fabricDirectSold)} />
              <RLine label="Transferred to Outlets" value={num(fabricTransferred)} />
              <RLine label="Current Factory Stock" value={num(fabricStock)} bold />
              <RLine label="Total Sales Value (direct + outlet)" value={money(totalFabricSaleValue)} />
            </ReportBlock>
          </div>
          <FullTable
            rows={fabricEntries.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))}
            columns={[
              { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
              { key: 'direction', label: 'Type', render: r => <TypeTag type={r.direction === 'in' ? 'Fabric In' : r.direction === 'out_transfer' ? 'Fabric → Outlet' : 'Fabric Out (Sale)'} /> },
              { key: 'quality', label: 'Quality' },
              { key: 'party', label: 'Party / Outlet', render: r => r.direction === 'out_transfer' ? outletName(r.outletId) : (r.party || '—') },
              { key: 'qty', label: 'Qty', render: r => `${num(r.qty)} ${r.unit}` },
              { key: 'rate', label: 'Rate', render: r => r.rate ? money(r.rate) : '—' },
            ]}
          />
        </div>
      )}

      {tab === 'outlets' && (
        <div className="rf-card">
          <h3 className="rf-section-title">Outlets Report</h3>
          {outlets.length === 0 ? <EmptyState text="No outlets added yet." /> : (
            <>
              <div className="rf-table-wrap" style={{ marginBottom: 18 }}>
                <table className="rf-table">
                  <thead><tr><th>Outlet</th><th>Stock (yd/m)</th><th>Units Sold</th><th>Sales Value</th></tr></thead>
                  <tbody>
                    {outlets.map(o => {
                      const sales = outletSales.filter(s => s.outletId === o.id);
                      const sold = sales.reduce((s, x) => s + Number(x.qty), 0);
                      const val = sales.reduce((s, x) => s + Number(x.qty) * Number(x.rate || 0), 0);
                      return (
                        <tr key={o.id}>
                          <td>{o.name}</td>
                          <td>{num(outletStock[o.id] || 0)}</td>
                          <td>{num(sold)}</td>
                          <td>{money(val)}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ fontWeight: 700 }}>
                      <td>Total</td>
                      <td>{num(totalOutletStock)}</td>
                      <td>{num(outletSoldQty)}</td>
                      <td>{money(outletSaleValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h4 style={{ fontSize: 13, color: '#6b7280', margin: '8px 0', fontWeight: 600 }}>ALL OUTLET SALES</h4>
              <FullTable
                rows={outletSales.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))}
                columns={[
                  { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
                  { key: 'outlet', label: 'Outlet', render: r => outletName(r.outletId) },
                  { key: 'party', label: 'Customer' },
                  { key: 'qty', label: 'Qty', render: r => `${num(r.qty)} ${r.unit}` },
                  { key: 'amount', label: 'Amount', render: r => money(r.qty * (r.rate || 0)) },
                ]}
              />
            </>
          )}
        </div>
      )}

      {tab === 'cash' && (
        <div className="rf-card">
          <h3 className="rf-section-title">Cash / Payments Report</h3>
          <div className="rf-report-grid" style={{ marginBottom: 16 }}>
            <ReportBlock title="Totals">
              <RLine label="Payments In" value={money(paymentsIn)} positive />
              <RLine label="Payments Out" value={money(paymentsOut)} negative />
              <RLine label="Expenses" value={money(totalExpenses)} negative />
              <RLine label="Net Cash" value={money(netCash)} bold positive={netCash >= 0} negative={netCash < 0} />
            </ReportBlock>
          </div>
          <h4 style={{ fontSize: 13, color: '#6b7280', margin: '16px 0 8px', fontWeight: 600 }}>PAYMENTS</h4>
          <FullTable
            rows={payments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))}
            columns={[
              { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
              { key: 'direction', label: 'Direction', render: r => <TypeTag type={r.direction === 'in' ? 'Payment In' : 'Payment Out'} /> },
              { key: 'party', label: 'Party' },
              { key: 'mode', label: 'Mode' },
              { key: 'amount', label: 'Amount', render: r => money(r.amount) },
            ]}
          />
          <h4 style={{ fontSize: 13, color: '#6b7280', margin: '20px 0 8px', fontWeight: 600 }}>EXPENSES</h4>
          <FullTable
            rows={expenses.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))}
            columns={[
              { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
              { key: 'category', label: 'Category' },
              { key: 'note', label: 'Note' },
              { key: 'amount', label: 'Amount', render: r => money(r.amount) },
            ]}
          />
        </div>
      )}

      {tab === 'ledger' && (
        <div className="rf-card">
          <h3 className="rf-section-title">Party Ledger Report</h3>
          {Object.keys(ledger).length === 0 ? <EmptyState text="No party data yet." /> : (
            <div className="rf-table-wrap">
              <table className="rf-table">
                <thead><tr><th>Party</th><th>Balance</th><th>Status</th></tr></thead>
                <tbody>
                  {Object.keys(ledger).sort().map(p => (
                    <tr key={p}>
                      <td>{p}</td>
                      <td>{money(Math.abs(ledger[p]))}</td>
                      <td>
                        {ledger[p] > 0 && <span style={{ color: '#15803d', fontWeight: 600 }}>Receivable</span>}
                        {ledger[p] < 0 && <span style={{ color: '#b91c1c', fontWeight: 600 }}>Payable</span>}
                        {ledger[p] === 0 && <span style={{ color: '#6b7280' }}>Settled</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportBlock({ title, children }) {
  return (
    <div className="rf-report-block">
      <div className="rf-report-block-title">{title}</div>
      {children}
    </div>
  );
}
function RLine({ label, value, bold, positive, negative }) {
  let color = '#1f2937';
  if (positive) color = '#15803d';
  if (negative) color = '#b91c1c';
  return (
    <div className="rf-rline">
      <span>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color }}>{value}</span>
    </div>
  );
}
function FullTable({ rows, columns }) {
  if (rows.length === 0) return <EmptyState text="No data." />;
  return (
    <div className="rf-table-wrap">
      <table className="rf-table">
        <thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {columns.map(c => <td key={c.key}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// GLOBAL CSS
// ============================================================
const GLOBAL_CSS = `
* { box-sizing: border-box; }
body { margin: 0; }
.rf-shell { min-height: 100vh; background: #f4f5f7; color: #1f2937; }

.rf-header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px;
  background: linear-gradient(120deg, #0f1f3d 0%, #1e3a6e 45%, #b8860b 100%);
  color: #fff;
  position: sticky; top: 0; z-index: 30;
}
.rf-header h1 { font-size: 15px; font-weight: 700; letter-spacing: 0.04em; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rf-logo-badge {
  width: 32px; height: 32px; border-radius: 50%;
  object-fit: cover; flex-shrink: 0;
}
.rf-hamburger {
  display: none; flex-direction: column; gap: 4px; background: none; border: none; cursor: pointer; padding: 6px;
}
.rf-hamburger span { width: 20px; height: 2px; background: #fff; border-radius: 2px; }
.rf-logout-btn {
  margin-left: auto; background: rgba(255,255,255,0.15); border: none; color: #fff;
  border-radius: 8px; padding: 7px 9px; cursor: pointer; display: flex; align-items: center; flex-shrink: 0;
}
.rf-logout-btn:hover { background: rgba(255,255,255,0.28); }

.rf-body { display: flex; }

.rf-sidebar {
  width: 200px; flex-shrink: 0; background: #16213e;
  min-height: calc(100vh - 60px);
  padding: 14px 10px;
  display: flex; flex-direction: column; gap: 4px;
}
.rf-nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px; border: none; background: none;
  color: #b9c2da; font-size: 14px; font-weight: 500; cursor: pointer; text-align: left;
  transition: background 0.15s, color 0.15s;
}
.rf-nav-item:hover { background: #1f2c52; color: #fff; }
.rf-nav-item.active { background: #2563eb; color: #fff; }

.rf-main { flex: 1; padding: 22px; min-width: 0; }

.rf-page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
.rf-page-head h2 { font-size: 22px; font-weight: 700; margin: 0; color: #111827; }
.rf-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }

.rf-btn-primary, .rf-btn-secondary, .rf-btn-outline {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: none; transition: opacity 0.15s, transform 0.1s;
}
.rf-btn-primary { background: #2563eb; color: #fff; }
.rf-btn-secondary { background: #ede9fe; color: #6d28d9; }
.rf-btn-outline { background: #fff; color: #374151; border: 1px solid #d1d5db; }
.rf-btn-primary:hover, .rf-btn-secondary:hover, .rf-btn-outline:hover { opacity: 0.85; }
.rf-btn-primary:active, .rf-btn-secondary:active, .rf-btn-outline:active { transform: scale(0.98); }

.rf-card { background: #fff; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.rf-section-title { font-size: 15px; font-weight: 700; margin: 0 0 12px; color: #111827; }
.rf-hint { font-size: 12.5px; color: #6b7280; margin: 4px 0 0; }

.rf-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin-bottom: 20px; }
@media (max-width: 980px) { .rf-stat-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (max-width: 540px) { .rf-stat-grid { grid-template-columns: 1fr; } }

.rf-stat-card { border-left: 4px solid #2563eb; padding: 16px 18px; }
.rf-stat-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.rf-stat-label { font-size: 12.5px; color: #6b7280; font-weight: 600; }
.rf-stat-value { font-size: 22px; font-weight: 800; color: #111827; }

.rf-outlet-card { border-left: 4px solid #7c3aed; }
.rf-outlet-card-top { display: flex; align-items: flex-start; justify-content: space-between; }
.rf-outlet-name { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 14.5px; color: #111827; }
.rf-outlet-location { font-size: 12px; color: #6b7280; margin-top: 2px; }
.rf-outlet-stock { font-size: 22px; font-weight: 800; margin-top: 10px; color: #111827; }
.rf-outlet-stock span { font-size: 12px; font-weight: 600; color: #6b7280; }

.rf-table-wrap { overflow-x: auto; }
.rf-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.rf-table th { text-align: left; padding: 9px 10px; color: #6b7280; font-weight: 600; border-bottom: 2px solid #f0f1f3; white-space: nowrap; }
.rf-table td { padding: 10px 10px; border-bottom: 1px solid #f3f4f6; white-space: nowrap; }
.rf-table tr:hover td { background: #fafbfc; }

.rf-empty { text-align: center; padding: 28px 10px; color: #9ca3af; font-size: 13.5px; }

.rf-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: #6b7280; display: inline-flex; }
.rf-icon-btn:hover { background: #f3f4f6; color: #dc2626; }

.rf-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
.rf-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 420px; max-height: 88vh; overflow-y: auto; }
.rf-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #f0f1f3; }
.rf-modal-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.rf-modal-body { padding: 18px; }

.rf-form { display: flex; flex-direction: column; gap: 12px; }
.rf-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.rf-form-section-label { font-size: 12px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.03em; }
.rf-field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 600; color: #374151; }
.rf-field input, .rf-field select {
  padding: 9px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-weight: 400; color: #111827; background: #fff;
}
.rf-field input:focus, .rf-field select:focus { outline: 2px solid #2563eb; outline-offset: 1px; border-color: #2563eb; }
.rf-form-submit { justify-content: center; margin-top: 6px; padding: 11px; font-size: 14px; }

.rf-tabs { display: flex; gap: 6px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px; }
.rf-tab { padding: 8px 14px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; color: #6b7280; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.rf-tab.active { background: #16213e; color: #fff; border-color: #16213e; }

.rf-report-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; margin-bottom: 6px; }
@media (max-width: 700px) { .rf-report-grid { grid-template-columns: 1fr; } }
.rf-report-block { background: #f9fafb; border-radius: 10px; padding: 14px 16px; border: 1px solid #f0f1f3; }
.rf-report-block-title { font-size: 12.5px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 10px; }
.rf-rline { display: flex; justify-content: space-between; font-size: 13.5px; padding: 5px 0; }

@media (max-width: 880px) {
  .rf-hamburger { display: flex; }
  .rf-sidebar {
    position: fixed; top: 60px; left: 0; bottom: 0; z-index: 50;
    transform: translateX(-100%); transition: transform 0.2s ease; box-shadow: 4px 0 14px rgba(0,0,0,0.2);
  }
  .rf-sidebar-open { transform: translateX(0); }
  .rf-main { padding: 16px; }
  .rf-page-head h2 { font-size: 19px; }
}

.rf-footer {
  text-align: center; padding: 14px 16px; font-size: 12px; color: #9ca3af;
  background: #f4f5f7; letter-spacing: 0.01em;
}
.rf-footer span { color: #b8860b; font-weight: 700; }

@media print {
  .rf-header, .rf-sidebar, .rf-btn-row, .rf-btn-outline, .rf-icon-btn, .rf-footer { display: none !important; }
  .rf-main { padding: 0; }
  .rf-card { box-shadow: none; border: 1px solid #e5e7eb; }
}
`;
