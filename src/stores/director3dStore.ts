import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ShapeType } from '@/features/director3d/shapes';

export type TransformMode = 'translate' | 'rotate' | 'scale';

export interface CameraRig {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
}

export interface SceneObject {
  id: string;
  type: ShapeType;
  label: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  color?: string;
  initialPosition?: { x: number; y: number; z: number };
  initialRotation?: { x: number; y: number; z: number };
  initialScale?: { x: number; y: number; z: number };
}

interface Director3DState {
  isActive: boolean;
  cameraRigs: CameraRig[];
  activeRigId: string | null;
  sceneObjects: SceneObject[];
  selectedObjectIds: string[];
  transformMode: TransformMode;
  placementMode: boolean;

  enterDirector3D: () => void;
  leaveDirector3D: () => void;

  addCameraRig: (rig: Omit<CameraRig, 'id'>) => void;
  removeCameraRig: (id: string) => void;
  setActiveRig: (id: string | null) => void;
  updateRig: (id: string, updates: Partial<Omit<CameraRig, 'id'>>) => void;
  renameCameraRig: (id: string, name: string) => void;
  reorderCameraRigs: (fromIndex: number, toIndex: number) => void;

  addSceneObject: (obj: Omit<SceneObject, 'id'>) => string;
  removeSceneObject: (id: string) => void;
  selectObject: (id: string) => void;
  toggleSelectObject: (id: string) => void;
  setSelectedObjects: (ids: string[]) => void;
  clearSelection: () => void;
  updateObjectTransform: (
    id: string,
    updates: Partial<Pick<SceneObject, 'position' | 'rotation' | 'scale'>>
  ) => void;
  resetObjectAxis: (id: string, field: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z') => void;
  setTransformMode: (mode: TransformMode) => void;
  setPlacementMode: (active: boolean) => void;
}

export const useDirector3DStore = create<Director3DState>((set) => ({
  isActive: false,
  cameraRigs: [],
  activeRigId: null,
  sceneObjects: [],
  selectedObjectIds: [],
  transformMode: 'translate',
  placementMode: false,

  enterDirector3D: () => set({ isActive: true }),
  leaveDirector3D: () =>
    set({
      isActive: false,
      placementMode: false,
      selectedObjectIds: [],
    }),

  addCameraRig: (rig) => {
    const id = uuidv4();
    set((state) => ({
      cameraRigs: [...state.cameraRigs, { ...rig, id }],
    }));
  },

  removeCameraRig: (id) =>
    set((state) => ({
      cameraRigs: state.cameraRigs.filter((r) => r.id !== id),
      activeRigId: state.activeRigId === id ? null : state.activeRigId,
    })),

  setActiveRig: (id) => set({ activeRigId: id }),

  updateRig: (id, updates) =>
    set((state) => ({
      cameraRigs: state.cameraRigs.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    })),

  renameCameraRig: (id, name) =>
    set((state) => ({
      cameraRigs: state.cameraRigs.map((r) =>
        r.id === id ? { ...r, name } : r
      ),
    })),

  reorderCameraRigs: (fromIndex, toIndex) =>
    set((state) => {
      const rigs = [...state.cameraRigs];
      const [moved] = rigs.splice(fromIndex, 1);
      rigs.splice(toIndex, 0, moved);
      return { cameraRigs: rigs };
    }),

  addSceneObject: (obj) => {
    const id = uuidv4();
    set((state) => ({
      sceneObjects: [
        ...state.sceneObjects,
        {
          ...obj,
          id,
          initialPosition: { ...obj.position },
          initialRotation: { ...obj.rotation },
          initialScale: { ...obj.scale },
        },
      ],
      selectedObjectIds: [id],
    }));
    return id;
  },

  removeSceneObject: (id) =>
    set((state) => ({
      sceneObjects: state.sceneObjects.filter((o) => o.id !== id),
      selectedObjectIds: state.selectedObjectIds.filter((sid) => sid !== id),
    })),

  selectObject: (id) => set({ selectedObjectIds: [id] }),

  toggleSelectObject: (id) =>
    set((state) => {
      const has = state.selectedObjectIds.includes(id);
      return {
        selectedObjectIds: has
          ? state.selectedObjectIds.filter((sid) => sid !== id)
          : [...state.selectedObjectIds, id],
      };
    }),

  setSelectedObjects: (ids) => set({ selectedObjectIds: ids }),

  clearSelection: () => set({ selectedObjectIds: [] }),

  updateObjectTransform: (id, updates) =>
    set((state) => ({
      sceneObjects: state.sceneObjects.map((o) =>
        o.id === id ? { ...o, ...updates } : o
      ),
    })),

  resetObjectAxis: (id, field, axis) =>
    set((state) => ({
      sceneObjects: state.sceneObjects.map((o) => {
        if (o.id !== id) return o;
        const initial = o[`initial${field.charAt(0).toUpperCase() + field.slice(1)}` as keyof SceneObject] as
          | { x: number; y: number; z: number }
          | undefined;
        if (!initial) return o;
        return {
          ...o,
          [field]: { ...o[field], [axis]: initial[axis] },
        };
      }),
    })),

  setTransformMode: (mode) => set({ transformMode: mode }),

  setPlacementMode: (active) =>
    set({
      placementMode: active,
      selectedObjectIds: active ? [] : [],
    }),

}));
