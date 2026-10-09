import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Dialog, Empty, Field, toast } from './kit';
import { useT, errorMessage } from '../state/app';

interface Item {
  id: string;
  name: string;
}

/** A simple editable list of named things (categories, units, locations…). */
export function NameList(props: {
  items: Item[] | undefined;
  addLabel: string;
  canEdit: boolean;
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  /** Return the number of records using this item; deletion is refused when > 0. */
  usage?: (id: string) => Promise<number>;
  onDelete?: (id: string) => Promise<void>;
  extra?: (item: Item) => React.ReactNode;
}) {
  const t = useT();
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [name, setName] = useState('');

  function open(item: Item | 'new') {
    setEditing(item);
    setName(item === 'new' ? '' : item.name);
  }

  async function save() {
    const n = name.trim();
    if (!n) return;
    try {
      if (editing === 'new') await props.onAdd(n);
      else if (editing) await props.onRename(editing.id, n);
      toast(t('common.saved'));
      setEditing(null);
    } catch (e) {
      toast(errorMessage(t, e), 'error');
    }
  }

  async function remove(item: Item) {
    if (!props.onDelete) return;
    const n = props.usage ? await props.usage(item.id) : 0;
    if (n > 0) {
      toast(t('catalog.inUse', { n }), 'error');
      return;
    }
    await props.onDelete(item.id);
    toast(t('common.deleted'));
  }

  return (
    <>
      {props.canEdit && (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="grow" />
          <button className="btn primary" onClick={() => open('new')}>
            <Plus size={18} />
            {props.addLabel}
          </button>
        </div>
      )}
      <div className="panel">
        {props.items && props.items.length === 0 && <Empty>{t('common.none')}</Empty>}
        {props.items?.map((it) => (
          <div key={it.id} className="list-row">
            <span className="grow">{it.name}</span>
            {props.extra?.(it)}
            {props.canEdit && (
              <>
                <button className="btn ghost sm icon" aria-label={t('common.edit')} onClick={() => open(it)}>
                  <Pencil size={16} />
                </button>
                {props.onDelete && (
                  <button className="btn ghost sm icon" aria-label={t('common.delete')} onClick={() => remove(it)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {editing && (
        <Dialog
          title={editing === 'new' ? props.addLabel : editing.name}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" disabled={!name.trim()} onClick={save}>
                {t('common.save')}
              </button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label={t('common.name')} htmlFor="nl-name">
              <input id="nl-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
            </Field>
          </form>
        </Dialog>
      )}
    </>
  );
}
