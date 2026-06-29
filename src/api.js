import { supabase } from './supabaseClient';
import {
  localGetAll, localPut, localPutMany, localDelete,
  localReplaceAll, enqueuePendingOp, getPendingOps, removePendingOp,
} from './db';

// Generic helpers per table. Each function maps js camelCase fields
// to the snake_case columns used in the database, and back.

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const isOnline = () => navigator.onLine;

// ── Sync engine: flush pending ops to Supabase when online ────
export async function syncPendingToSupabase() {
  if (!isOnline()) return { synced: 0, failed: 0 };

  const ops = await getPendingOps();
  if (ops.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const op of ops) {
    try {
      if (op.action === 'insert') {
        const { error } = await supabase.from(op.table).insert(op.payload);
        if (error) throw error;
      } else if (op.action === 'delete') {
        const { error } = await supabase.from(op.table).delete().eq('id', op.payload.id);
        if (error) throw error;
      } else if (op.action === 'update') {
        const { id, ...rest } = op.payload;
        const { error } = await supabase.from(op.table).update(rest).eq('id', id);
        if (error) throw error;
      }
      await removePendingOp(op.id);
      synced++;
    } catch (e) {
      console.warn('Sync failed for op', op.id, e.message);
      failed++;
    }
  }

  return { synced, failed };
}

// ── Full data refresh from Supabase (called when coming online) ──
export async function refreshAllFromSupabase() {
  if (!isOnline()) return false;
  try {
    const tables = [
      { supabase: 'yarn_entries', local: 'yarn_entries' },
      { supabase: 'production_entries', local: 'production_entries' },
      { supabase: 'fabric_entries', local: 'fabric_entries' },
      { supabase: 'outlets', local: 'outlets' },
      { supabase: 'outlet_stock_moves', local: 'outlet_stock_moves' },
      { supabase: 'outlet_sales', local: 'outlet_sales' },
      { supabase: 'payment_entries', local: 'payment_entries' },
      { supabase: 'expense_entries', local: 'expense_entries' },
    ];
    await Promise.all(
      tables.map(async ({ supabase: tbl, local }) => {
        const { data, error } = await supabase.from(tbl).select('*');
        if (!error && data) await localReplaceAll(local, data);
      })
    );
    return true;
  } catch (e) {
    console.warn('Refresh failed:', e.message);
    return false;
  }
}

// ── Helper: write to local + optionally to Supabase ──────────
async function writeRecord(table, action, row) {
  // Always write locally first
  if (action === 'insert') await localPut(table, row);
  if (action === 'delete') await localDelete(table, row.id);
  if (action === 'update') await localPut(table, row);

  if (isOnline()) {
    try {
      if (action === 'insert') {
        const { error } = await supabase.from(table).insert(row);
        if (error) throw error;
      } else if (action === 'delete') {
        const { error } = await supabase.from(table).delete().eq('id', row.id);
        if (error) throw error;
      } else if (action === 'update') {
        const { id, ...rest } = row;
        const { error } = await supabase.from(table).update(rest).eq('id', id);
        if (error) throw error;
      }
    } catch (e) {
      // Online write failed — queue for later sync
      console.warn('Online write failed, queuing:', e.message);
      await enqueuePendingOp({ table, action, payload: row });
    }
  } else {
    // Offline — queue for sync
    await enqueuePendingOp({ table, action, payload: row });
    // Register background sync if available
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      reg.sync.register('royal-fabrics-sync').catch(() => {});
    }
  }
}

// ── Helper: read local cache, refresh from network if online ─
async function readRecords(table, mapFn) {
  // Always return local cache immediately (fast)
  const local = await localGetAll(table);
  if (local.length > 0) return local.map(mapFn);

  // If cache is empty and online, fetch from Supabase
  if (isOnline()) {
    const { data, error } = await supabase.from(table).select('*').order('date', { ascending: false });
    if (error) throw error;
    if (data) {
      await localPutMany(table, data);
      return data.map(mapFn);
    }
  }
  return [];
}

// ---------- YARN ----------
export async function fetchYarnEntries() {
  return readRecords('yarn_entries', r => ({
    id: r.id, direction: r.direction, party: r.party, quality: r.quality,
    qty: r.qty, unit: r.unit, rate: r.rate, date: r.date, note: r.note,
  }));
}
export async function insertYarnEntry(entry) {
  const row = {
    id: entry.id || uid(), direction: entry.direction, party: entry.party,
    quality: entry.quality, qty: entry.qty, unit: entry.unit,
    rate: entry.rate || 0, date: entry.date, note: entry.note,
  };
  await writeRecord('yarn_entries', 'insert', row);
  return row;
}
export async function deleteYarnEntry(id) {
  await writeRecord('yarn_entries', 'delete', { id });
}
export async function updateYarnEntry(id, entry) {
  const row = {
    id, direction: entry.direction, party: entry.party, quality: entry.quality,
    qty: entry.qty, unit: entry.unit, rate: entry.rate || 0,
    date: entry.date, note: entry.note,
  };
  await writeRecord('yarn_entries', 'update', row);
  return row;
}

// ---------- PRODUCTION ----------
export async function fetchProduction() {
  return readRecords('production_entries', r => ({
    id: r.id, yarnQty: r.yarn_qty, yarnUnit: r.yarn_unit, yarnQuality: r.yarn_quality,
    fabricQty: r.fabric_qty, fabricUnit: r.fabric_unit, fabricQuality: r.fabric_quality,
    date: r.date, note: r.note,
  }));
}
export async function insertProduction(batch) {
  const id = batch.id || uid();
  const row = {
    id, yarn_qty: batch.yarnQty, yarn_unit: batch.yarnUnit, yarn_quality: batch.yarnQuality,
    fabric_qty: batch.fabricQty, fabric_unit: batch.fabricUnit, fabric_quality: batch.fabricQuality,
    date: batch.date, note: batch.note,
  };
  await writeRecord('production_entries', 'insert', row);
  return { id, ...batch };
}
export async function deleteProduction(id) {
  await writeRecord('production_entries', 'delete', { id });
}

// ---------- FABRIC ----------
export async function fetchFabricEntries() {
  return readRecords('fabric_entries', r => ({
    id: r.id, direction: r.direction, party: r.party, outletId: r.outlet_id,
    quality: r.quality, qty: r.qty, unit: r.unit, rate: r.rate,
    date: r.date, note: r.note,
  }));
}
export async function insertFabricEntry(entry) {
  const id = entry.id || uid();
  const row = {
    id, direction: entry.direction, party: entry.party,
    outlet_id: entry.outletId || null, quality: entry.quality,
    qty: entry.qty, unit: entry.unit, rate: entry.rate || 0,
    date: entry.date, note: entry.note,
  };
  await writeRecord('fabric_entries', 'insert', row);
  return { id, ...entry };
}
export async function deleteFabricEntry(id) {
  await writeRecord('fabric_entries', 'delete', { id });
}
export async function updateFabricEntry(id, entry) {
  const row = {
    id, direction: entry.direction, party: entry.party,
    outlet_id: entry.outletId || null, quality: entry.quality,
    qty: entry.qty, unit: entry.unit, rate: entry.rate || 0,
    date: entry.date, note: entry.note,
  };
  await writeRecord('fabric_entries', 'update', row);
  return { id, ...entry };
}

// ---------- OUTLETS ----------
export async function fetchOutlets() {
  return readRecords('outlets', r => ({ id: r.id, name: r.name, location: r.location }));
}
export async function insertOutlet(outlet) {
  const id = uid();
  const row = { id, name: outlet.name, location: outlet.location };
  await writeRecord('outlets', 'insert', row);
  return { id, ...outlet };
}
export async function deleteOutlet(id) {
  await writeRecord('outlets', 'delete', { id });
}

// ---------- OUTLET STOCK MOVES ----------
export async function fetchOutletStockMoves() {
  return readRecords('outlet_stock_moves', r => ({
    id: r.id, outletId: r.outlet_id, direction: r.direction, quality: r.quality,
    qty: r.qty, unit: r.unit, date: r.date, note: r.note, refTransferId: r.ref_transfer_id,
  }));
}
export async function insertOutletStockMove(move) {
  const id = uid();
  const row = {
    id, outlet_id: move.outletId, direction: move.direction, quality: move.quality,
    qty: move.qty, unit: move.unit, date: move.date, note: move.note,
    ref_transfer_id: move.refTransferId || null,
  };
  await writeRecord('outlet_stock_moves', 'insert', row);
  return { id, ...move };
}

// ---------- OUTLET SALES ----------
export async function fetchOutletSales() {
  return readRecords('outlet_sales', r => ({
    id: r.id, outletId: r.outlet_id, party: r.party, quality: r.quality,
    qty: r.qty, unit: r.unit, rate: r.rate, date: r.date, note: r.note,
  }));
}
export async function insertOutletSale(sale) {
  const id = uid();
  const row = {
    id, outlet_id: sale.outletId, party: sale.party, quality: sale.quality,
    qty: sale.qty, unit: sale.unit, rate: sale.rate || 0,
    date: sale.date, note: sale.note,
  };
  await writeRecord('outlet_sales', 'insert', row);
  return { id, ...sale };
}

// ---------- PAYMENTS ----------
export async function fetchPayments() {
  return readRecords('payment_entries', r => ({
    id: r.id, direction: r.direction, party: r.party, amount: r.amount,
    mode: r.mode, date: r.date, note: r.note,
  }));
}
export async function insertPayment(payment) {
  const id = uid();
  const row = {
    id, direction: payment.direction, party: payment.party,
    amount: payment.amount, mode: payment.mode, date: payment.date, note: payment.note,
  };
  await writeRecord('payment_entries', 'insert', row);
  return { id, ...payment };
}
export async function deletePayment(id) {
  await writeRecord('payment_entries', 'delete', { id });
}
export async function updatePayment(id, payment) {
  const row = {
    id, direction: payment.direction, party: payment.party,
    amount: payment.amount, mode: payment.mode, date: payment.date, note: payment.note,
  };
  await writeRecord('payment_entries', 'update', row);
  return { id, ...payment };
}

// ---------- EXPENSES ----------
export async function fetchExpenses() {
  return readRecords('expense_entries', r => ({
    id: r.id, category: r.category, amount: r.amount, date: r.date, note: r.note,
  }));
}
export async function insertExpense(expense) {
  const id = uid();
  const row = {
    id, category: expense.category, amount: expense.amount,
    date: expense.date, note: expense.note,
  };
  await writeRecord('expense_entries', 'insert', row);
  return { id, ...expense };
}
export async function deleteExpense(id) {
  await writeRecord('expense_entries', 'delete', { id });
}
export async function updateExpense(id, expense) {
  const row = {
    id, category: expense.category, amount: expense.amount,
    date: expense.date, note: expense.note,
  };
  await writeRecord('expense_entries', 'update', row);
  return { id, ...expense };
}

// ---------- STAFF / USER ROLES ----------
export async function fetchUserRoles() {
  if (!isOnline()) return [];
  const { data, error } = await supabase.from('user_roles').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(r => ({ id: r.id, email: r.email, role: r.role }));
}
export async function updateUserRole(id, role) {
  if (!isOnline()) throw new Error('Internet connection required to change roles.');
  const { error } = await supabase.from('user_roles').update({ role }).eq('id', id);
  if (error) throw error;
}
export async function deleteUserRole(id) {
  if (!isOnline()) throw new Error('Internet connection required to remove staff.');
  const { error } = await supabase.from('user_roles').delete().eq('id', id);
  if (error) throw error;
}
