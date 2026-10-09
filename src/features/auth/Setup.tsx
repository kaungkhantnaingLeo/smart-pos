import { useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { useApp, useT, errorMessage } from '../../state/app';
import { Field, Seg, Switch, toast } from '../../ui/kit';
import { createUser } from '../../db/services';
import { ensureBaseData, loadDemoData } from '../../db/seed';
import { markSetupComplete, saveShopSetting } from '../../db/settings';

export function Setup() {
  const t = useT();
  const lang = useApp((s) => s.settings['locale.language']) as 'my' | 'en';
  const setDevice = useApp((s) => s.setDevice);
  const signIn = useApp((s) => s.signIn);
  const [shop, setShop] = useState('');
  const [owner, setOwner] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const pinOk = /^\d{4,6}$/.test(pin);
  const match = pin === pin2;
  const valid = shop.trim() && owner.trim() && pinOk && match;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!valid) return;
    setBusy(true);
    try {
      await ensureBaseData(lang);
      await saveShopSetting('shop.name', shop.trim());
      const user = await createUser(owner, 'owner', pin);
      if (demo) await loadDemoData(user, lang);
      await markSetupComplete();
      signIn(user);
    } catch (err) {
      toast(errorMessage(t, err), 'error');
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="panel panel-pad auth-card stack" onSubmit={submit} noValidate>
        <div className="brand">
          <div className="mark">
            <ReceiptText size={22} />
          </div>
          <div>
            <h1>{t('setup.title')}</h1>
            <p className="muted small">{t('setup.intro')}</p>
          </div>
        </div>
        <Field label={t('setup.language')}>
          <Seg
            label={t('setup.language')}
            value={lang}
            onChange={(v) => setDevice('locale.language', v)}
            options={[
              { value: 'my', label: 'မြန်မာ' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>
        <Field label={t('setup.shopName')} htmlFor="shop" error={tried && !shop.trim() ? t('common.required') : undefined}>
          <input id="shop" className="input" value={shop} onChange={(e) => setShop(e.target.value)} autoFocus maxLength={60} />
        </Field>
        <Field label={t('setup.ownerName')} htmlFor="owner" error={tried && !owner.trim() ? t('common.required') : undefined}>
          <input id="owner" className="input" value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={40} />
        </Field>
        <div className="grid2">
          <Field label={t('setup.pin')} htmlFor="pin" error={tried && !pinOk ? t('err.pinFormat') : undefined}>
            <input id="pin" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </Field>
          <Field label={t('setup.pinConfirm')} htmlFor="pin2" error={tried && pinOk && !match ? t('setup.pinMismatch') : undefined}>
            <input id="pin2" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </Field>
        </div>
        <label className="row" style={{ gap: 12, cursor: 'pointer' }}>
          <Switch checked={demo} onChange={setDemo} label={t('setup.demo')} />
          <span className="soft">{t('setup.demo')}</span>
        </label>
        <button className="btn primary lg block" disabled={busy}>
          {busy ? t('setup.working') : t('setup.start')}
        </button>
      </form>
    </div>
  );
}
