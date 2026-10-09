import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Delete } from 'lucide-react';
import { db } from '../../db/db';
import type { User } from '../../db/types';
import { verifyPin } from '../../db/services';
import { useApp, useT } from '../../state/app';
import { cx } from '../../lib/util';

export function Lock() {
  const t = useT();
  const shop = useApp((s) => s.settings['shop.name']);
  const signIn = useApp((s) => s.signIn);
  const users = useLiveQuery(() => db.users.toArray().then((u) => u.filter((x) => x.active)), []);
  const [picked, setPicked] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (users?.length === 1) setPicked(users[0]);
  }, [users]);

  const press = useCallback(
    async (d: string) => {
      if (!picked) return;
      setWrong(false);
      const len = picked.pinLength || 6;
      const next = (pin + d).slice(0, len);
      setPin(next);
      if (next.length < len) return;
      if (await verifyPin(picked, next)) {
        signIn(picked);
      } else {
        setWrong(true);
        setPin('');
      }
    },
    [picked, pin, signIn],
  );

  useEffect(() => {
    if (!picked) return;
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Escape') {
        setPicked(null);
        setPin('');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [picked, press]);

  if (!users) return null;

  return (
    <div className="center-screen">
      <div className="panel panel-pad auth-card">
        <p className="muted small">{shop}</p>
        {!picked ? (
          <>
            <h1 style={{ marginBottom: 16 }}>{t('lock.title')}</h1>
            <div className="users">
              {users.map((u) => (
                <button key={u.id} className="user-tile" onClick={() => setPicked(u)}>
                  <span className="avatar">{u.name.trim().charAt(0).toUpperCase()}</span>
                  <span>{u.name}</span>
                  <span className="muted small">{t(`role.${u.role}`)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1>{t('lock.enterPin', { name: picked.name })}</h1>
            <div className={cx('pin-dots', wrong && 'shake')} aria-live="polite">
              {Array.from({ length: picked.pinLength || 6 }, (_, i) => (
                <span key={i} className={cx(i < pin.length && 'on')} />
              ))}
            </div>
            <p className="danger-text small" style={{ textAlign: 'center', minHeight: 22 }}>
              {wrong ? t('lock.wrongPin') : ''}
            </p>
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} onClick={() => press(d)}>
                  {d}
                </button>
              ))}
              <span />
              <button onClick={() => press('0')}>0</button>
              <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Backspace">
                <Delete size={22} />
              </button>
            </div>
            {users.length > 1 && (
              <button
                className="btn ghost block"
                style={{ marginTop: 14 }}
                onClick={() => {
                  setPicked(null);
                  setPin('');
                }}
              >
                {t('lock.back')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
