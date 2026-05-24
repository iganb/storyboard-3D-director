import { useTranslation } from 'react-i18next';
import {
  Video,
  Plus,
  RotateCcw,
  Move,
  Rotate3D,
  Maximize2,
  UserPlus,
  MousePointer2,
  Lock,
  Unlock,
  Camera,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Eye,
} from 'lucide-react';
import { useDirector3DStore, type TransformMode } from '@/stores/director3dStore';
import { CHARACTER_PALETTE } from './shapes';

export interface CameraPreset {
  pos: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
}

export const CAMERA_PRESETS: Record<string, { preset: CameraPreset; labelKey: string; icon: typeof Eye }> = {
  front: {
    preset: { pos: { x: 0, y: 2, z: 10 }, target: { x: 0, y: 2, z: 0 }, fov: 55 },
    labelKey: 'director3d.frontView',
    icon: ArrowDown,
  },
  back: {
    preset: { pos: { x: 0, y: 2, z: -10 }, target: { x: 0, y: 2, z: 0 }, fov: 55 },
    labelKey: 'director3d.backView',
    icon: ArrowUp,
  },
  left: {
    preset: { pos: { x: -10, y: 2, z: 0 }, target: { x: 0, y: 2, z: 0 }, fov: 55 },
    labelKey: 'director3d.leftView',
    icon: ArrowLeft,
  },
  right: {
    preset: { pos: { x: 10, y: 2, z: 0 }, target: { x: 0, y: 2, z: 0 }, fov: 55 },
    labelKey: 'director3d.rightView',
    icon: ArrowRight,
  },
  top: {
    preset: { pos: { x: 0, y: 12, z: 0.1 }, target: { x: 0, y: 1, z: 0 }, fov: 55 },
    labelKey: 'director3d.topView',
    icon: ArrowUp,
  },
  persp: {
    preset: { pos: { x: 8, y: 6, z: 8 }, target: { x: 0, y: 1, z: 0 }, fov: 55 },
    labelKey: 'director3d.perspView',
    icon: Eye,
  },
};

const PRESET_ORDER = ['front', 'back', 'left', 'right', 'top', 'persp'] as const;

interface DirectorToolbarProps {
  onAddCameraRig: () => void;
  onResetCamera: () => void;
  cameraLocked: boolean;
  onToggleLock: () => void;
  onScreenshot: () => void;
  screenshotRatio: '16:9' | '9:16';
  onScreenshotRatioChange: (ratio: '16:9' | '9:16') => void;
  onSelectPreset: (preset: CameraPreset) => void;
  onQuickAddCharacter: (color: string) => void;
}

const TRANSFORM_BUTTONS: { mode: TransformMode; icon: typeof Move; label: string; key: string }[] = [
  { mode: 'translate', icon: Move, label: 'director3d.translate', key: 'W' },
  { mode: 'rotate', icon: Rotate3D, label: 'director3d.rotate', key: 'E' },
  { mode: 'scale', icon: Maximize2, label: 'director3d.scale', key: 'R' },
];

export function DirectorToolbar({
  onAddCameraRig,
  onResetCamera,
  cameraLocked,
  onToggleLock,
  onScreenshot,
  screenshotRatio,
  onScreenshotRatioChange,
  onSelectPreset,
  onQuickAddCharacter,
}: DirectorToolbarProps) {
  const { t } = useTranslation();
  const transformMode = useDirector3DStore((s) => s.transformMode);
  const setTransformMode = useDirector3DStore((s) => s.setTransformMode);
  const placementMode = useDirector3DStore((s) => s.placementMode);
  const setPlacementMode = useDirector3DStore((s) => s.setPlacementMode);

  return (
    <div className="h-10 flex items-center justify-between bg-surface-dark border-b border-border-dark px-4 select-none">
      {/* Left: Title */}
      <div className="flex items-center gap-2 shrink-0">
        <Video className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold text-text-dark">{t('director3d.title')}</span>
      </div>

      {/* Center-left: Transform modes */}
      <div className="flex items-center gap-1">
        {TRANSFORM_BUTTONS.map((btn) => {
          const Icon = btn.icon;
          const isActive = transformMode === btn.mode;
          return (
            <button
              key={btn.mode}
              type="button"
              onClick={() => setTransformMode(btn.mode)}
              className={`h-7 px-2 flex items-center gap-1 text-xs rounded transition-colors ${
                isActive
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
              }`}
              title={`${t(btn.label)} (${btn.key})`}
            >
              <Icon className="w-3.5 h-3.5" />
              <kbd className="text-[10px] opacity-60">{btn.key}</kbd>
            </button>
          );
        })}
      </div>

      {/* Center-right: Character tools */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          {CHARACTER_PALETTE.map((c) => {
            const hex = c.color.toString(16).padStart(6, '0');
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => onQuickAddCharacter(hex)}
                className="w-6 h-6 rounded-sm border border-border-dark hover:scale-110 transition-transform"
                style={{ backgroundColor: `#${hex}` }}
                title={t('director3d.addCharacter') + ' - ' + c.label}
              />
            );
          })}
        </div>

        <div className="w-px h-4 bg-border-dark mx-1" />

        <button
          type="button"
          onClick={() => setPlacementMode(!placementMode)}
          className={`h-7 px-2 flex items-center gap-1 text-xs rounded transition-colors ${
            placementMode
              ? 'bg-accent text-white'
              : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
          }`}
          title={t('director3d.placeCharacter')}
        >
          <MousePointer2 className="w-3.5 h-3.5" />
          <UserPlus className="w-3 h-3" />
        </button>

        <div className="w-px h-4 bg-border-dark mx-1" />

        {/* Preset camera views */}
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-text-muted mr-0.5 hidden 2xl:inline">{t('director3d.cameraPresets')}</span>
          {PRESET_ORDER.map((key) => {
            const entry = CAMERA_PRESETS[key];
            const Icon = entry.icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectPreset(entry.preset)}
                className="h-7 w-7 flex items-center justify-center text-text-muted hover:bg-bg-dark hover:text-text-dark rounded transition-colors"
                title={t(entry.labelKey)}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>

        <div className="w-px h-4 bg-border-dark mx-1" />
      </div>

      {/* Right: Camera controls */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleLock}
          className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${
            cameraLocked
              ? 'bg-accent text-white'
              : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
          }`}
          title={cameraLocked ? t('director3d.unlockCamera') : t('director3d.lockCamera')}
        >
          {cameraLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>

        <div className="flex items-center rounded border border-border-dark bg-bg-dark text-[10px] overflow-hidden">
          <button
            type="button"
            onClick={() => onScreenshotRatioChange('16:9')}
            className={`h-6 px-1.5 transition-colors font-medium ${
              screenshotRatio === '16:9'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-dark'
            }`}
          >
            16:9
          </button>
          <button
            type="button"
            onClick={() => onScreenshotRatioChange('9:16')}
            className={`h-6 px-1.5 transition-colors font-medium ${
              screenshotRatio === '9:16'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-dark'
            }`}
          >
            9:16
          </button>
        </div>

        <button
          type="button"
          onClick={onScreenshot}
          className="h-7 w-7 flex items-center justify-center text-text-muted hover:bg-bg-dark hover:text-text-dark rounded transition-colors"
          title={t('director3d.screenshot')}
        >
          <Camera className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onResetCamera}
          className="h-7 w-7 flex items-center justify-center text-text-muted hover:bg-bg-dark hover:text-text-dark rounded transition-colors"
          title={t('director3d.resetCamera')}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onAddCameraRig}
          className="h-7 w-7 flex items-center justify-center bg-accent text-white hover:bg-accent/85 rounded transition-colors"
          title={t('director3d.addCameraRig')}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <span className="text-[9px] text-text-muted ml-1 hidden 2xl:inline">
          WASD{t('director3d.move')} | MMB{t('director3d.orbit')}
        </span>
      </div>
    </div>
  );
}
