import React from 'react';
import { ResearchPageLayout } from '../components/sections/ResearchPageLayout';

interface StudioReferenceProps {
  user?: { id: string; username: string; avatar?: string | null; isPresetAdmin?: boolean } | null;
  onLogin?: () => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

export const StudioReference: React.FC<StudioReferenceProps> = ({ user, onLogin, onLogout }) => {
  return <ResearchPageLayout presetKey="studio" user={user} onLogin={onLogin} onLogout={onLogout} />;
};
