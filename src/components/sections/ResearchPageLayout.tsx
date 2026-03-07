import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TopSectionSwitcher } from '../TopSectionSwitcher';
import { BackToTopButton } from '../BackToTopButton';
import { AppHeader } from '../ui/AppHeader';
import { useMuelMotion } from '../../hooks/useMuelMotion';
import { getMuelMotionCssVars } from '../../lib/getMuelMotionCssVars';
import { ResearchCoreSections, ResearchPresetHero } from './ResearchSharedSections';
import { ResearchPresetHistoryPanel } from './ResearchPresetHistoryPanel';
import { ControlRoomRoadmap } from './ControlRoomRoadmap';
import { apiFetch } from '../../config';
import { getResolvedResearchPreset, isResearchPresetKey, type ResearchPresetKey, type ResolvedResearchPreset } from '../../content/researchContent';

interface ResearchPageLayoutProps {
  presetKey: ResearchPresetKey;
  mainClassName?: string;
  user?: { id: string; username: string; avatar?: string | null; isPresetAdmin?: boolean } | null;
  onLogin?: () => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

export const ResearchPageLayout = ({
  presetKey,
  mainClassName,
  user,
  onLogin,
  onLogout,
}: ResearchPageLayoutProps) => {
  const location = useLocation();
  const { tokens } = useMuelMotion();
  const motionCssVars = getMuelMotionCssVars(tokens);
  const localPreset = useMemo(() => getResolvedResearchPreset(presetKey), [presetKey]);
  const [preset, setPreset] = useState<ResolvedResearchPreset>(localPreset);

  const initialHistoryId = useMemo(() => {
    if (presetKey !== 'studio') {
      return null;
    }

    const searchParams = new URLSearchParams(location.search);
    const requestedPreset = (searchParams.get('preset') || '').trim();
    if (requestedPreset && requestedPreset !== presetKey) {
      return null;
    }

    const historyId = (searchParams.get('historyId') || '').trim();
    return historyId || null;
  }, [location.search, presetKey]);

  const syncPreset = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/research/preset/${presetKey}`);
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { preset?: ResolvedResearchPreset };
      if (!payload.preset || !isResearchPresetKey(payload.preset.key)) {
        return;
      }

      setPreset(payload.preset);
    } catch {
      // keep local preset fallback
    }
  }, [presetKey]);

  useEffect(() => {
    setPreset(localPreset);

    void syncPreset();
  }, [localPreset, syncPreset]);

  const resolvedMainClassName = mainClassName ?? preset.page.mainClassName;

  return (
    <div className="surface-page surface-bridge hud-grid research-page-shell" style={motionCssVars}>
      <AppHeader
        fixed
        animated={false}
        actions={
          <TopSectionSwitcher
            isAuthenticated={Boolean(user)}
            isPresetAdmin={Boolean(user?.isPresetAdmin)}
            username={user?.username}
            onLogin={onLogin ? () => void onLogin() : undefined}
            onLogout={onLogout ? () => void onLogout() : undefined}
          />
        }
      />

      <main className={resolvedMainClassName}>
        <ResearchPresetHero preset={preset} />
        <ResearchCoreSections preset={preset} />
        <ControlRoomRoadmap compact />
        {preset.key === 'studio' ? (
          <ResearchPresetHistoryPanel
            presetKey={preset.key}
            initialHistoryId={initialHistoryId}
            onRestored={() => void syncPreset()}
          />
        ) : null}
      </main>

      <BackToTopButton />
    </div>
  );
};