import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import {
  loadNotificationSettings, saveNotificationSettings,
  type NotificationSettings,
} from '../services/notificationSettings';
import { isPushSupported, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from '../services/pushService';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';

interface Props {
  userId?: string | null;
}

const CARD_BG = { background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' };
const SEGMENT_BG = { background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' };

const Toggle: React.FC<{ label: string; description?: string; checked: boolean; onChange: () => void }> = ({ label, description, checked, onChange }) => (
  <button
    onClick={onChange}
    className="w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all hover:opacity-90 text-left"
    style={CARD_BG}
  >
    <div className="min-w-0 pr-3">
      <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">{label}</p>
      {description && <p className="text-[10px] font-medium text-slate-400 mt-0.5">{description}</p>}
    </div>
    <div className="w-11 h-6 rounded-full p-0.5 shrink-0 transition-all" style={{ background: checked ? 'var(--primary)' : 'var(--border-color)' }}>
      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </div>
  </button>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{children}</p>
);

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
    style={active ? { background: 'var(--primary)', color: 'var(--primary-text)' } : { ...CARD_BG, color: 'var(--text-main)' }}
  >
    {active && <Check className="w-3 h-3" strokeWidth={3} />}
    {children}
  </button>
);

export const NotificationSettingsPanel: React.FC<Props> = ({ userId }) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<NotificationSettings>(() => loadNotificationSettings());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [showDeniedHelp, setShowDeniedHelp] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    setPermission(Notification.permission);
    getExistingSubscription().then(sub => setPushEnabled(!!sub)).catch(() => {});
  }, []);

  const update = <K extends keyof NotificationSettings>(category: K, patch: Partial<NotificationSettings[K]>) => {
    setSettings(prev => {
      const next = { ...prev, [category]: { ...prev[category], ...patch } };
      saveNotificationSettings(next, userId);
      return next;
    });
  };

  const toggleExamDay = (day: number) => {
    const days = settings.exams.days.includes(day)
      ? settings.exams.days.filter(d => d !== day)
      : [...settings.exams.days, day];
    update('exams', { days });
  };

  const handleTogglePush = async () => {
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
        toast.info(t('settings.push.disabled'));
      } else {
        await subscribeToPush();
        setPushEnabled(true);
        setPermission('granted');
        toast.success(t('settings.push.enabled'));
      }
    } catch (e: any) {
      toast.error(e?.message || t('settings.push.error'));
      if (isPushSupported()) setPermission(Notification.permission);
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Browser Push */}
      {isPushSupported() ? (
        <div className="space-y-3">
          <SectionLabel>{t('sp2e.push.title')}</SectionLabel>
          {permission === 'denied' ? (
            <div className="p-5 rounded-2xl space-y-3" style={CARD_BG}>
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-500">{t('sp2e.push.denied.title')}</p>
              <p className="text-[11px] font-medium text-slate-400">{t('sp2e.push.denied.desc')}</p>
              <button
                onClick={() => setShowDeniedHelp(v => !v)}
                className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                {t('sp2e.push.denied.button')}
              </button>
              {showDeniedHelp && (
                <p className="text-[10px] font-medium text-slate-400 pt-1" style={{ borderTop: '1px solid var(--border-color)' }}>
                  {t('sp2e.push.denied.instructions')}
                </p>
              )}
            </div>
          ) : (
            <Toggle
              label={t('sp2e.push.toggle')}
              description={pushEnabled ? t('sp2e.push.toggleDescOn') : t('sp2e.push.toggleDescOff')}
              checked={pushEnabled}
              onChange={pushBusy ? () => {} : handleTogglePush}
            />
          )}
        </div>
      ) : (
        <div className="p-5 rounded-2xl" style={CARD_BG}>
          <p className="text-[11px] font-medium text-slate-400">{t('sp2e.push.unsupported')}</p>
        </div>
      )}

      {/* 1. Lernerinnerungen */}
      <div className="space-y-3">
        <SectionLabel>{t('sp2e.daily.title')}</SectionLabel>
        <Toggle
          label={t('sp2e.daily.toggle')}
          description={t('sp2e.daily.toggleDesc')}
          checked={settings.dailyReminder.enabled}
          onChange={() => update('dailyReminder', { enabled: !settings.dailyReminder.enabled })}
        />
        {settings.dailyReminder.enabled && (
          <div className="p-5 rounded-2xl space-y-4" style={CARD_BG}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest dark:text-white">{t('sp2e.daily.time')}</span>
              <input
                type="time"
                value={settings.dailyReminder.time}
                onChange={e => update('dailyReminder', { time: e.target.value })}
                className="px-3 py-2 rounded-xl text-sm dark:text-white outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/50 transition-all"
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
              />
            </div>
            {([
              ['onlyIfBlocksToday', 'sp2e.daily.onlyIfBlocks'],
              ['skipIfGoalReached', 'sp2e.daily.skipIfGoal'],
              ['includeWeekends', 'sp2e.daily.includeWeekends'],
            ] as const).map(([key, labelKey]) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300">{t(labelKey)}</span>
                <input
                  type="checkbox"
                  checked={settings.dailyReminder[key]}
                  onChange={() => update('dailyReminder', { [key]: !settings.dailyReminder[key] } as any)}
                  className="w-4 h-4 rounded accent-[var(--primary)]"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 2. Lernblöcke */}
      <div className="space-y-3">
        <SectionLabel>{t('sp2e.block.title')}</SectionLabel>
        <Toggle
          label={t('sp2e.block.toggle')}
          description={t('sp2e.block.toggleDesc')}
          checked={settings.blockLeadTime.enabled}
          onChange={() => update('blockLeadTime', { enabled: !settings.blockLeadTime.enabled })}
        />
        {settings.blockLeadTime.enabled && (
          <div className="p-5 rounded-2xl space-y-4" style={CARD_BG}>
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest dark:text-white">{t('sp2e.block.leadLabel')}</span>
              <div className="flex gap-2 flex-wrap">
                {([5, 10, 15, 30] as const).map(min => (
                  <Chip key={min} active={settings.blockLeadTime.leadMinutes === min} onClick={() => update('blockLeadTime', { leadMinutes: min })}>
                    {min} Min
                  </Chip>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300">{t('sp2e.block.onlyHigh')}</span>
              <input
                type="checkbox"
                checked={settings.blockLeadTime.onlyHighPriority}
                onChange={() => update('blockLeadTime', { onlyHighPriority: !settings.blockLeadTime.onlyHighPriority })}
                className="w-4 h-4 rounded accent-[var(--primary)]"
              />
            </label>
          </div>
        )}
      </div>

      {/* 3. Spaced Repetition */}
      <div className="space-y-3">
        <SectionLabel>{t('sp2e.srs.title')}</SectionLabel>
        <Toggle
          label={t('sp2e.srs.toggle')}
          description={t('sp2e.srs.toggleDesc')}
          checked={settings.spacedRepetition.enabled}
          onChange={() => update('spacedRepetition', { enabled: !settings.spacedRepetition.enabled })}
        />
        {settings.spacedRepetition.enabled && (
          <div className="p-5 rounded-2xl space-y-4" style={CARD_BG}>
            <div className="flex p-1 rounded-2xl gap-1" style={SEGMENT_BG}>
              {([
                ['immediate', 'sp2e.srs.modeImmediate'],
                ['bundled', 'sp2e.srs.modeBundled'],
                ['threshold', 'sp2e.srs.modeThreshold'],
              ] as const).map(([mode, labelKey]) => (
                <button
                  key={mode}
                  onClick={() => update('spacedRepetition', { mode })}
                  className={`flex-1 py-2.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${settings.spacedRepetition.mode === mode ? 'shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                  style={settings.spacedRepetition.mode === mode ? { background: 'var(--primary)', color: 'var(--primary-text)' } : {}}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            {settings.spacedRepetition.mode === 'threshold' && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest dark:text-white">{t('sp2e.srs.thresholdLabel')}</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={settings.spacedRepetition.threshold}
                  onChange={e => update('spacedRepetition', { threshold: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-20 px-3 py-2 rounded-xl text-sm text-center dark:text-white outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/50 transition-all"
                  style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Klausuren */}
      <div className="space-y-3">
        <SectionLabel>{t('sp2e.exam.title')}</SectionLabel>
        <Toggle
          label={t('sp2e.exam.toggle')}
          description={t('sp2e.exam.toggleDesc')}
          checked={settings.exams.enabled}
          onChange={() => update('exams', { enabled: !settings.exams.enabled })}
        />
        {settings.exams.enabled && (
          <div className="p-5 rounded-2xl flex gap-2 flex-wrap" style={CARD_BG}>
            {([
              [7, 'sp2e.exam.days7'],
              [3, 'sp2e.exam.days3'],
              [1, 'sp2e.exam.days1'],
              [0, 'sp2e.exam.days0'],
            ] as const).map(([day, labelKey]) => (
              <Chip key={day} active={settings.exams.days.includes(day)} onClick={() => toggleExamDay(day)}>
                {t(labelKey)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* 5. Motivation */}
      <div className="space-y-3">
        <SectionLabel>{t('sp2e.motivation.title')}</SectionLabel>
        <div className="space-y-3">
          {([
            ['dailyGoalReached', 'sp2e.motivation.dailyGoal'],
            ['weeklyGoalReached', 'sp2e.motivation.weeklyGoal'],
            ['streakSaved', 'sp2e.motivation.streakSaved'],
            ['streakAtRisk', 'sp2e.motivation.streakAtRisk'],
            ['newPersonalBest', 'sp2e.motivation.newBest'],
          ] as const).map(([key, labelKey]) => (
            <Toggle
              key={key}
              label={t(labelKey)}
              checked={settings.motivation[key]}
              onChange={() => update('motivation', { [key]: !settings.motivation[key] } as any)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
