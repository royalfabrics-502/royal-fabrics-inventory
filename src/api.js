import { supabase } from './supabaseClient';

// Generic helpers per table. Each function maps js camelCase fields
// to the snake_case columns used in the database, and back.

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------- YARN ----------
export async function fetchYarnEntries() {
  const { data, error } = await supabase.from('yarn_entries').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data.map(r => ({ id: r.id, direction: r.direction, party: r.party, quality: r.quality, qty: r.qty, unit: r.unit, rate: r.rate, date: r.date, note: r.note }));
}
export async function insertYarnEntry(entry) {
  const row = { id: entry.id || uid(), direction: entry.direction, party: entry.party, quality: entry.quality, qty: entry.qty, unit: entry.unit, rate: entry.rate || 0, date: entry.date, note: entry.note };
  const { error } = await supabase.from('yarn_entries').insert(row);
  if (error) throw error;
  return row;
}
export async function deleteYarnEntry(id) {
  const { error } = await supabase.from('yarn_entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------- PRODUCTION ----------
export async function fetchProduction() {
  const { data, error } = await supabase.from('production_entries').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data.map(r => ({ id: r.id, yarnQty: r.yarn_qty, yarnUnit: r.yarn_unit, yarnQuality: r.yarn_quality, fabricQty: r.fabric_qty, fabricUnit: r.fabric_unit, fabricQuality: r.fabric_quality, date: r.date, note: r.note }));
}
export async function insertProduction(batch) {
  const id = uid();
  const row = { id, yarn_qty: batch.yarnQty, yarn_unit: batch.yarnUnit, yarn_quality: batch.yarnQuality, fabric_qty: batch.fabricQty, fabric_unit: batch.fabricUnit, fabric_quality: batch.fabricQuality, date: batch.date, note: batch.note };
  const { error } = await supabase.from('production_entries').insert(row);
  if (error) throw error;
  return { id, ...batch };
}
export async function deleteProduction(id) {
  const { error } = await supabase.from('production_entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------- FABRIC ----------
export async function fetchFabricEntries() {
  const { data, error } = await supabase.from('fabric_entries').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data.map(r => ({ id: r.id, direction: r.direction, party: r.party, outletId: r.outlet_id, quality: r.quality, qty: r.qty, unit: r.unit, rate: r.rate, date: r.date, note: r.note }));
}
export async function insertFabricEntry(entry) {
  const id = entry.id || uid();
  const row = { id, direction: entry.direction, party: entry.party, outlet_id: entry.outletId || null, quality: entry.quality, qty: entry.qty, unit: entry.unit, rate: entry.rate || 0, date: entry.date, note: entry.note };
  const { error } = await supabase.from('fabric_entries').insert(row);
  if (error) throw error;
  return { id, ...entry };
}
export async function deleteFabricEntry(id) {
  const { error } = await supabase.from('fabric_entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------- OUTLETS ----------
export async function fetchOutlets() {
  const { data, error } = await supabase.from('outlets').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(r => ({ id: r.id, name: r.name, location: r.location }));
}
export async function insertOutlet(outlet) {
  const id = uid();
  const row = { id, name: outlet.name, location: outlet.location };
  const { error } = await supabase.from('outlets').insert(row);
  if (error) throw error;
  return { id, ...outlet };
}
export async function deleteOutlet(id) {
  const { error } = await supabase.from('outlets').delete().eq('id', id);
  if (error) throw error;
}

// ---------- OUTLET STOCK MOVES ----------
export async function fetchOutletStockMoves() {
  const { data, error } = await supabase.from('outlet_stock_moves').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data.map(r => ({ id: r.id, outletId: r.outlet_id, direction: r.direction, quality: r.quality, qty: r.qty, unit: r.unit, date: r.date, note: r.note, refTransferId: r.ref_transfer_id }));
}
export async function insertOutletStockMove(move) {
  const id = uid();
  const row = { id, outlet_id: move.outletId, direction: move.direction, quality: move.quality, qty: move.qty, unit: move.unit, date: move.date, note: move.note, ref_transfer_id: move.refTransferId || null };
  const { error } = await supabase.from('outlet_stock_moves').insert(row);
  if (error) throw error;
  return { id, ...move };
}

// ---------- OUTLET SALES ----------
export async function fetchOutletSales() {
  const { data, error } = await supabase.from('outlet_sales').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data.map(r => ({ id: r.id, outletId: r.outlet_id, party: r.party, quality: r.quality, qty: r.qty, unit: r.unit, rate: r.rate, date: r.date, note: r.note }));
}
export async function insertOutletSale(sale) {
  const id = uid();
  const row = { id, outlet_id: sale.outletId, party: sale.party, quality: sale.quality, qty: sale.qty, unit: sale.unit, rate: sale.rate || 0, date: sale.date, note: sale.note };
  const { error } = await supabase.from('outlet_sales').insert(row);
  if (error) throw error;
  return { id, ...sale };
}

// ---------- PAYMENTS ----------
export async function fetchPayments() {
  const { data, error } = await supabase.from('payment_entries').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data.map(r => ({ id: r.id, direction: r.direction, party: r.party, amount: r.amount, mode: r.mode, date: r.date, note: r.note }));
}
export async function insertPayment(payment) {
  const id = uid();
  const row = { id, direction: payment.direction, party: payment.party, amount: payment.amount, mode: payment.mode, date: payment.date, note: payment.note };
  const { error } = await supabase.from('payment_entries').insert(row);
  if (error) throw error;
  return { id, ...payment };
}
export async function deletePayment(id) {
  const { error } = await supabase.from('payment_entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------- EXPENSES ----------
export async function fetchExpenses() {
  const { data, error } = await supabase.from('expense_entries').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data.map(r => ({ id: r.id, category: r.category, amount: r.amount, date: r.date, note: r.note }));
}
export async function insertExpense(expense) {
  const id = uid();
  const row = { id, category: expense.category, amount: expense.amount, date: expense.date, note: expense.note };
  const { error } = await supabase.from('expense_entries').insert(row);
  if (error) throw error;
  return { id, ...expense };
}
export async function deleteExpense(id) {
  const { error } = await supabase.from('expense_entries').delete().eq('id', id);
  if (error) throw error;
}
