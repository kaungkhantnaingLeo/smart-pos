import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import type { Expense } from '../../db/types';
import { useFormat, useT, useUser, errorMessage } from '../../state/app';
import { Empty, Field, MoneyInput, PageHead, RangePicker, Sheet, Tabs, toast, useRange } from '../../ui/kit';
import { NameList } from '../../ui/NameList';
import { dayKey, parseDayKey } from '../../lib/dates';
import { uid } from '../../lib/util';

export function Expenses() {
  const t = useT();
  const [tab, setTab] = useState<'list' | 'categories'>('list');
  const categories = useLiveQuery(() => db.expenseCategories.toArray(), []);
  return (
    <div className="page">
      <PageHead title={t('expenses.title')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'list', label: t('expenses.title') },
          { value: 'categories', label: t('expenses.categories') },
        ]}
      />
      {tab === 'list' ? (
        <ExpenseList />
      ) : (
        <NameList
          items={categories}
          canEdit
          addLabel={t('expenses.newCategory')}
          onAdd={async (name) => void (await db.expenseCategories.add({ id: uid(), name }))}
          onRename={async (id, name) => void (await db.expenseCategories.update(id, { name }))}
          usage={(id) => db.expenses.where('categoryId').equals(id).count()}
          onDelete={(id) => db.expenseCategories.delete(id)}
        />
      )}
    </div>
  );
}

function ExpenseList() {
  const t = useT();
  const f = useFormat();
  const range = useRange('thisMonth');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const data = useLiveQuery(async () => {
    const rows = await db.expenses.where('date').between(dayKey(range.range.from), dayKey(range.range.to), true, true).toArray();
    const cats = new Map((await db.expenseCategories.toArray()).map((c) => [c.id, c.name]));
    return { rows: rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt), cats };
  }, [range.range.from, range.range.to]);
  const total = data?.rows.reduce((a, r) => a + r.amount, 0) ?? 0;

  return (
    <>
      <div className="filters">
        <RangePicker {...range} />
        <span className="grow" />
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={18} />
          {t('expenses.new')}
        </button>
      </div>
      <div className="panel">
        {data && data.rows.length === 0 ? (
          <Empty>{t('expenses.none')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('expenses.category')}</th>
                  <th>{t('common.note')}</th>
                  <th className="num">{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((r) => (
                  <tr key={r.id} className="click" onClick={() => setEditing(r)}>
                    <td className="tnum soft">{f.date(parseDayKey(r.date))}</td>
                    <td>{r.categoryId ? data.cats.get(r.categoryId) : '—'}</td>
                    <td className="soft">{r.note}</td>
                    <td className="num">{f.money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              {data && data.rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3}>{t('reports.totalRow')}</td>
                    <td className="num">{f.money(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
      {editing && <ExpenseForm expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ExpenseForm({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const t = useT();
  const user = useUser();
  const cats = useLiveQuery(() => db.expenseCategories.toArray(), []);
  const methods = useLiveQuery(() => db.paymentMethods.orderBy('sort').toArray(), []);
  const [date, setDate] = useState(expense?.date ?? dayKey());
  const [categoryId, setCategoryId] = useState<string>(expense?.categoryId ?? '');
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null);
  const [methodId, setMethodId] = useState<string>(expense?.methodId ?? '');
  const [note, setNote] = useState(expense?.note ?? '');

  async function save() {
    if (!amount || amount <= 0) return;
    try {
      const data = {
        date,
        categoryId: categoryId || cats?.[0]?.id || null,
        amount,
        methodId: methodId || methods?.[0]?.id || null,
        note: note.trim(),
      };
      if (expense) await db.expenses.update(expense.id, data);
      else await db.expenses.add({ ...data, id: uid(), createdAt: Date.now(), userId: user.id });
      toast(t('common.saved'));
      onClose();
    } catch (e) {
      toast(errorMessage(t, e), 'error');
    }
  }

  return (
    <Sheet
      title={expense ? t('common.edit') : t('expenses.new')}
      onClose={onClose}
      footer={
        <>
          {expense && (
            <button
              className="btn danger"
              onClick={async () => {
                await db.expenses.delete(expense.id);
                toast(t('common.deleted'));
                onClose();
              }}
            >
              <Trash2 size={16} />
              {t('common.delete')}
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={!amount} onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid2">
          <Field label={t('common.date')} htmlFor="e-date">
            <input id="e-date" type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label={t('common.amount')} htmlFor="e-amt">
            <MoneyInput id="e-amt" value={amount} onChange={setAmount} autoFocus />
          </Field>
        </div>
        <Field label={t('expenses.category')} htmlFor="e-cat">
          <select id="e-cat" className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {cats?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('common.method')} htmlFor="e-m">
          <select id="e-m" className="select" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            {methods?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('common.note')} htmlFor="e-note">
          <input id="e-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      </div>
    </Sheet>
  );
}
