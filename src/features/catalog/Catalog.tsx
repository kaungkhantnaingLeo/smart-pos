import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { db } from '../../db/db';
import type { Product } from '../../db/types';
import { setOpeningStock } from '../../db/services';
import { useCan, useFormat, useSettings, useT, useUser, errorMessage } from '../../state/app';
import { Empty, Field, MoneyInput, PageHead, QtyInput, SearchBox, Sheet, Switch, Tabs, toast } from '../../ui/kit';
import { NameList } from '../../ui/NameList';
import { matches, uid } from '../../lib/util';

type Tab = 'products' | 'categories' | 'units';

export function Catalog() {
  const t = useT();
  const can = useCan();
  const [tab, setTab] = useState<Tab>('products');
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), []);
  const units = useLiveQuery(() => db.units.toArray(), []);
  const canEdit = can('catalog.manage');

  return (
    <div className="page">
      <PageHead title={t('nav.catalog')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'products', label: t('catalog.products') },
          { value: 'categories', label: t('catalog.categories') },
          { value: 'units', label: t('catalog.units') },
        ]}
      />
      {tab === 'products' && <Products />}
      {tab === 'categories' && (
        <NameList
          items={categories}
          addLabel={t('catalog.newCategory')}
          canEdit={canEdit}
          onAdd={async (name) => void (await db.categories.add({ id: uid(), name, sort: categories?.length ?? 0 }))}
          onRename={async (id, name) => void (await db.categories.update(id, { name }))}
          usage={(id) => db.products.where('categoryId').equals(id).count()}
          onDelete={(id) => db.categories.delete(id)}
        />
      )}
      {tab === 'units' && (
        <NameList
          items={units}
          addLabel={t('catalog.newUnit')}
          canEdit={canEdit}
          onAdd={async (name) => void (await db.units.add({ id: uid(), name }))}
          onRename={async (id, name) => void (await db.units.update(id, { name }))}
          usage={async (id) => (await db.products.toArray()).filter((p) => p.unitId === id).length}
          onDelete={(id) => db.units.delete(id)}
        />
      )}
    </div>
  );
}

function Products() {
  const t = useT();
  const f = useFormat();
  const s = useSettings();
  const can = useCan();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []);
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), []);
  const stock = useLiveQuery(async () => {
    const m = new Map<string, number>();
    for (const r of await db.stock.toArray()) m.set(r.productId, (m.get(r.productId) ?? 0) + r.qty);
    return m;
  }, []);
  const catName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories]);
  const showCost = can('reports.profit');
  const inv = s['module.inventory'];
  const rows = (products ?? []).filter((p) => (cat === 'all' || p.categoryId === cat || (cat === 'none' && !p.categoryId)) && matches(q, p.name, p.sku, p.barcode));

  return (
    <>
      <div className="filters">
        <div className="grow" style={{ minWidth: 220 }}>
          <SearchBox value={q} onChange={setQ} placeholder={t('sell.search')} />
        </div>
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('catalog.category')}>
          <option value="all">{t('common.all')}</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">{t('catalog.uncategorized')}</option>
        </select>
        {can('catalog.manage') && (
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Plus size={18} />
            {t('catalog.newProduct')}
          </button>
        )}
      </div>
      <div className="panel">
        {products && rows.length === 0 ? (
          <Empty>{products.length === 0 ? t('catalog.noProducts') : t('sell.notFound', { q })}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('catalog.category')}</th>
                  <th className="num">{t('common.price')}</th>
                  {showCost && <th className="num">{t('common.cost')}</th>}
                  {showCost && <th className="num">{t('catalog.margin')}</th>}
                  {inv && <th className="num">{t('inventory.onHand')}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const qty = stock?.get(p.id) ?? 0;
                  return (
                    <tr key={p.id} className={can('catalog.manage') ? 'click' : undefined} onClick={() => can('catalog.manage') && setEditing(p)}>
                      <td>
                        <div>{p.name}</div>
                        <div className="muted small">
                          {[p.sku, p.barcode].filter(Boolean).join(' · ')}
                          {!p.active && <span className="badge" style={{ marginLeft: 6 }}>{t('common.inactive')}</span>}
                        </div>
                      </td>
                      <td className="soft">{p.categoryId ? catName.get(p.categoryId) : '—'}</td>
                      <td className="num">{f.num(p.price)}</td>
                      {showCost && <td className="num soft">{f.num(p.cost)}</td>}
                      {showCost && <td className="num soft">{p.price ? `${Math.round(((p.price - p.cost) / p.price) * 100)}%` : '—'}</td>}
                      {inv && (
                        <td className={`num ${p.trackStock && qty <= p.reorderLevel ? (qty <= 0 ? 'danger-text' : '') : 'soft'}`} style={p.trackStock && qty > 0 && qty <= p.reorderLevel ? { color: 'var(--warn)' } : undefined}>
                          {p.trackStock ? f.qty(qty) : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} defaultCategory={cat !== 'all' && cat !== 'none' ? cat : null} />}
    </>
  );
}

function ProductForm(props: { product: Product | null; onClose: () => void; defaultCategory: string | null }) {
  const t = useT();
  const s = useSettings();
  const can = useCan();
  const user = useUser();
  const p = props.product;
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), []);
  const units = useLiveQuery(() => db.units.toArray(), []);
  const [name, setName] = useState(p?.name ?? '');
  const [sku, setSku] = useState(p?.sku ?? '');
  const [barcode, setBarcode] = useState(p?.barcode ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(p ? p.categoryId : props.defaultCategory);
  const [unitId, setUnitId] = useState<string | null>(p?.unitId ?? null);
  const [price, setPrice] = useState<number | null>(p?.price ?? null);
  const [cost, setCost] = useState<number | null>(p?.cost ?? null);
  const [trackStock, setTrackStock] = useState(p?.trackStock ?? true);
  const [reorder, setReorder] = useState<number | null>(p?.reorderLevel ?? s['inventory.defaultReorder']);
  const [opening, setOpening] = useState<number | null>(null);
  const [active, setActive] = useState(p?.active ?? true);
  const [tried, setTried] = useState(false);
  const inv = s['module.inventory'];

  const valid = name.trim() && price !== null && price >= 0;

  async function save() {
    setTried(true);
    if (!valid) return;
    try {
      if (barcode.trim()) {
        const dupe = await db.products.where('barcode').equals(barcode.trim()).first();
        if (dupe && dupe.id !== p?.id) {
          toast(t('catalog.duplicateBarcode'), 'error');
          return;
        }
      }
      const data = {
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode.trim(),
        categoryId,
        unitId,
        price: price!,
        cost: cost ?? 0,
        trackStock,
        reorderLevel: reorder ?? 0,
        active,
      };
      if (p) {
        await db.products.update(p.id, data);
      } else {
        const product: Product = { ...data, id: uid(), createdAt: Date.now() };
        await db.products.add(product);
        if (inv && trackStock && opening) await setOpeningStock(product, opening, user);
      }
      toast(t('common.saved'));
      props.onClose();
    } catch (e) {
      toast(errorMessage(t, e), 'error');
    }
  }

  return (
    <Sheet
      title={p ? t('catalog.editProduct') : t('catalog.newProduct')}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t('common.name')} htmlFor="p-name" error={tried && !name.trim() ? t('common.required') : undefined}>
          <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </Field>
        <div className="grid2">
          <Field label={t('common.price')} htmlFor="p-price" error={tried && price === null ? t('common.required') : undefined}>
            <MoneyInput id="p-price" value={price} onChange={setPrice} />
          </Field>
          {can('reports.profit') && (
            <Field label={t('common.cost')} htmlFor="p-cost">
              <MoneyInput id="p-cost" value={cost} onChange={setCost} />
            </Field>
          )}
        </div>
        <div className="grid2">
          <Field label={t('catalog.category')} htmlFor="p-cat">
            <select id="p-cat" className="select" value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
              <option value="">{t('catalog.uncategorized')}</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('catalog.unit')} htmlFor="p-unit">
            <select id="p-unit" className="select" value={unitId ?? ''} onChange={(e) => setUnitId(e.target.value || null)}>
              <option value="">—</option>
              {units?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid2">
          <Field label={t('catalog.sku')} htmlFor="p-sku">
            <input id="p-sku" className="input" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={40} />
          </Field>
          <Field label={t('catalog.barcode')} htmlFor="p-bar">
            <input id="p-bar" className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={40} inputMode="numeric" />
          </Field>
        </div>
        {inv && (
          <>
            <label className="row" style={{ gap: 12 }}>
              <Switch checked={trackStock} onChange={setTrackStock} label={t('catalog.trackStock')} />
              <span>{t('catalog.trackStock')}</span>
            </label>
            {trackStock && (
              <div className="grid2">
                <Field label={t('catalog.reorderLevel')} htmlFor="p-reorder">
                  <QtyInput id="p-reorder" value={reorder} onChange={setReorder} />
                </Field>
                {!p && (
                  <Field label={t('catalog.openingStock')} htmlFor="p-open">
                    <QtyInput id="p-open" value={opening} onChange={setOpening} />
                  </Field>
                )}
              </div>
            )}
          </>
        )}
        <label className="row" style={{ gap: 12 }}>
          <Switch checked={active} onChange={setActive} label={t('catalog.active')} />
          <span>{t('catalog.active')}</span>
        </label>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
