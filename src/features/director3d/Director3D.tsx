import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useDirector3DStore, type SceneObject } from '@/stores/director3dStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';
import { prepareNodeImage } from '@/features/canvas/application/imageData';
import { saveImageSourceToDirectory } from '@/commands/image';
import { DirectorToolbar, type CameraPreset } from './DirectorToolbar';
import { CharacterPanel } from './CharacterPanel';
import { CameraPanel } from './CameraPanel';
import {
  buildMeshForType,
  getShapeDef,
  hexStringToNumber,
  type ShapeType,
} from './shapes';

const GRID_SIZE = 50;
const GRID_DIVISIONS = 50;
const MOVE_SPEED = 8;
const ROTATE_SENSITIVITY = 0.002;
const ZOOM_SENSITIVITY = 0.1;
const CLICK_THRESHOLD = 5; // px — if mouse moves less than this, treat as click

function clampFov(value: number): number {
  return Math.max(10, Math.min(120, value));
}

const RAYCASTER = new THREE.Raycaster();
const MOUSE = new THREE.Vector2();

// ── Main component ──────────────────────────────────────────────
export function Director3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const animFrameRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const orbitTargetRef = useRef(new THREE.Vector3(0, 1, 0));
  const objectMapRef = useRef<Map<string, THREE.Group>>(new Map());
  const highlightMapRef = useRef<Map<string, THREE.BoxHelper>>(new Map());
  const isTransformingRef = useRef(false);

  // Camera transition (smooth lerp)
  const transitionRef = useRef<{
    active: boolean;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endTarget: THREE.Vector3;
    startFov: number;
    endFov: number;
    elapsed: number;
    duration: number;
  } | null>(null);

  // Active rig overlay
  const [overlayRigName, setOverlayRigName] = useState<string | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Camera lock
  const [cameraLocked, setCameraLocked] = useState(false);
  const cameraLockedRef = useRef(false);

  // Screenshot settings
  const director3dScreenshotRatio = useSettingsStore((s) => s.director3dScreenshotRatio);
  const setDirector3dScreenshotRatio = useSettingsStore((s) => s.setDirector3dScreenshotRatio);

  // Track pointer state for click vs drag detection
  const pointerDownRef = useRef({ x: 0, y: 0, button: -1, ctrl: false, shift: false, time: 0 });
  const isDraggingRef = useRef(false);

  // Box selection
  const boxSelectRef = useRef({ active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const [boxRect, setBoxRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Multi-select group transform
  const selectionGroupRef = useRef<THREE.Group | null>(null);

  // Store bindings
  const activeRigId = useDirector3DStore((s) => s.activeRigId);
  const cameraRigs = useDirector3DStore((s) => s.cameraRigs);
  const selectedObjectIds = useDirector3DStore((s) => s.selectedObjectIds);

  const addCameraRig = useDirector3DStore((s) => s.addCameraRig);
  const selectObject = useDirector3DStore((s) => s.selectObject);
  const toggleSelectObject = useDirector3DStore((s) => s.toggleSelectObject);
  const clearSelection = useDirector3DStore((s) => s.clearSelection);
  const updateObjectTransform = useDirector3DStore((s) => s.updateObjectTransform);
  const removeSceneObject = useDirector3DStore((s) => s.removeSceneObject);
  const setTransformMode = useDirector3DStore((s) => s.setTransformMode);
  const setPlacementMode = useDirector3DStore((s) => s.setPlacementMode);

  // Show rig name overlay when active rig changes
  useEffect(() => {
    if (activeRigId) {
      const rig = cameraRigs.find((r) => r.id === activeRigId);
      if (rig) {
        setOverlayRigName(rig.name);
        if (overlayTimerRef.current) {
          clearTimeout(overlayTimerRef.current);
        }
        overlayTimerRef.current = setTimeout(() => {
          setOverlayRigName(null);
        }, 2000);
      }
    } else {
      setOverlayRigName(null);
    }
    return () => {
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
    };
  }, [activeRigId, cameraRigs]);

  const getCameraState = useCallback(() => {
    const cam = cameraRef.current;
    const target = orbitTargetRef.current;
    return {
      position: { x: cam!.position.x, y: cam!.position.y, z: cam!.position.z },
      target: { x: target.x, y: target.y, z: target.z },
      fov: cam!.fov,
    };
  }, []);

  // ── Sync objects from store to scene ──────────────────────────
  const syncSceneObjects = useCallback((objects: SceneObject[]) => {
    const scene = sceneRef.current;
    const map = objectMapRef.current;
    if (!scene) return;

    const storedIds = new Set(objects.map((o) => o.id));

    // Remove stale objects
    for (const [id, group] of map) {
      if (!storedIds.has(id)) {
        scene.remove(group);
        map.delete(id);
      }
    }

    // Add / update objects
    for (const so of objects) {
      let group = map.get(so.id);

      // Check if rebuild needed (color or type changed)
      const prevColor = group?.userData.colorHex as number | undefined;
      const prevType = group?.userData.shapeType as ShapeType | undefined;
      const currentColor = hexStringToNumber(so.color ?? '4a90d9');
      const colorChanged = prevColor !== undefined && prevColor !== currentColor;
      const typeChanged = prevType !== undefined && prevType !== so.type;

      if (!group || typeChanged) {
        if (group) {
          const pos = group.position.clone();
          const rot = group.rotation.clone();
          const scl = group.scale.clone();
          scene.remove(group);
          group = buildMeshForType(so.type, currentColor);
          group.position.copy(pos);
          group.rotation.copy(rot);
          group.scale.copy(scl);
        } else {
          group = buildMeshForType(so.type, currentColor);
        }
        group.userData.sceneObjectId = so.id;
        group.userData.colorHex = currentColor;
        group.userData.shapeType = so.type;
        scene.add(group);
        map.set(so.id, group);
      } else if (colorChanged) {
        // Rebuild with new color but preserve transform
        const pos = group.position.clone();
        const rot = group.rotation.clone();
        const scl = group.scale.clone();
        scene.remove(group);
        group = buildMeshForType(so.type, currentColor);
        group.position.copy(pos);
        group.rotation.copy(rot);
        group.scale.copy(scl);
        group.userData.sceneObjectId = so.id;
        group.userData.colorHex = currentColor;
        group.userData.shapeType = so.type;
        scene.add(group);
        map.set(so.id, group);
      }

      // Update transform (skip if parented to selection group — TC manages those)
      const selGroup = selectionGroupRef.current;
      if (group.parent !== selGroup) {
        group.position.set(so.position.x, so.position.y, so.position.z);
        group.rotation.set(
          THREE.MathUtils.degToRad(so.rotation.x),
          THREE.MathUtils.degToRad(so.rotation.y),
          THREE.MathUtils.degToRad(so.rotation.z),
        );
        group.scale.set(so.scale.x, so.scale.y, so.scale.z);
      }
    }
  }, []);

  // ── Three.js scene setup ──────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    /* Scene */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 30, 60);
    sceneRef.current = scene;

    /* Camera */
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(8, 6, 8);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;

    /* Renderer */
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    /* Lights */
    const ambient = new THREE.AmbientLight(0x404060, 1.2);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x606080, 0x202040, 0.8);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(10, 18, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
    fill.position.set(-5, 3, -8);
    scene.add(fill);

    /* Grid */
    const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x444466, 0x222244);
    scene.add(grid);

    /* Ground (raycaster target for placement) */
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a30,
      roughness: 0.9,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    scene.add(ground);

    /* TransformControls (UE-style gizmo) */
    const tc = new TransformControls(camera, renderer.domElement);
    tc.setSize(0.8);
    tc.setSpace('world');
    const tcHelper = tc.getHelper();
    scene.add(tcHelper);
    transformRef.current = tc;

    // When gizmo moves, update the store
    tc.addEventListener('objectChange', () => {
      const obj = tc.object;
      if (!obj) return;
      if (obj.userData.isSelectionGroup) {
        // Multi-select: update all children's world transforms to store
        const store = useDirector3DStore.getState();
        obj.children.forEach((child) => {
          const sid = child.userData.sceneObjectId as string | undefined;
          if (!sid) return;
          child.updateWorldMatrix(true, false);
          const wp = new THREE.Vector3();
          child.getWorldPosition(wp);
          const q = new THREE.Quaternion();
          child.getWorldQuaternion(q);
          const euler = new THREE.Euler().setFromQuaternion(q);
          const ws = new THREE.Vector3();
          child.getWorldScale(ws);
          store.updateObjectTransform(sid, {
            position: { x: wp.x, y: wp.y, z: wp.z },
            rotation: {
              x: THREE.MathUtils.radToDeg(euler.x),
              y: THREE.MathUtils.radToDeg(euler.y),
              z: THREE.MathUtils.radToDeg(euler.z),
            },
            scale: { x: ws.x, y: ws.y, z: ws.z },
          });
        });
      } else if (obj.userData.sceneObjectId) {
        const pos = obj.position;
        const rot = obj.rotation;
        const scl = obj.scale;
        updateObjectTransform(obj.userData.sceneObjectId as string, {
          position: { x: pos.x, y: pos.y, z: pos.z },
          rotation: {
            x: THREE.MathUtils.radToDeg(rot.x),
            y: THREE.MathUtils.radToDeg(rot.y),
            z: THREE.MathUtils.radToDeg(rot.z),
          },
          scale: { x: scl.x, y: scl.y, z: scl.z },
        });
      }
    });

    // Track when TransformControls is actively dragging a gizmo handle
    tc.addEventListener('mouseDown', () => {
      if (tc.axis) {
        isTransformingRef.current = true;
      }
    });
    tc.addEventListener('mouseUp', () => {
      isTransformingRef.current = false;
    });

    // ── Input handlers ───────────────────────────────────────────

    function findSceneObjectId(object: THREE.Object3D): string | null {
      let current: THREE.Object3D | null = object;
      while (current) {
        const id = current.userData.sceneObjectId;
        if (id) return id as string;
        current = current.parent;
      }
      return null;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());

      // Number key shortcuts: 1-9 = select rig, 0 = reset free roam
      const digitKey = /^[0-9]$/.test(e.key) ? Number.parseInt(e.key, 10) : null;
      if (digitKey !== null && !e.metaKey && !e.altKey && !e.shiftKey) {
        const rigs = useDirector3DStore.getState().cameraRigs;
        if (e.ctrlKey) {
          // Ctrl+digit: save current view as rig
          e.preventDefault();
          const state = getCameraState();
          const index = digitKey === 0 ? rigs.length : digitKey - 1;
          if (index < rigs.length) {
            useDirector3DStore.getState().updateRig(rigs[index].id, state);
          } else {
            addCameraRig({ ...state, name: `Camera ${index + 1}` });
          }
        } else if (digitKey === 0) {
          e.preventDefault();
          resetFreeRoam();
        } else if (digitKey > 0 && digitKey <= rigs.length) {
          e.preventDefault();
          const rig = rigs[digitKey - 1];
          const endPos = new THREE.Vector3(rig.position.x, rig.position.y, rig.position.z);
          const endTarget = new THREE.Vector3(rig.target.x, rig.target.y, rig.target.z);
          startCameraTransition(endPos, endTarget, rig.fov);
          useDirector3DStore.getState().setActiveRig(rig.id);
        }
        return;
      }

      if (e.key === 'a' && e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const allIds = useDirector3DStore.getState().sceneObjects.map((o) => o.id);
        useDirector3DStore.getState().setSelectedObjects(allIds);
      } else if (e.key === 'w' && !e.metaKey && !e.ctrlKey) {
        if (useDirector3DStore.getState().selectedObjectIds.length > 0) {
          e.preventDefault();
          setTransformMode('translate');
        }
      } else if (e.key === 'e' && !e.metaKey && !e.ctrlKey) {
        if (useDirector3DStore.getState().selectedObjectIds.length > 0) {
          e.preventDefault();
          setTransformMode('rotate');
        }
      } else if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        if (useDirector3DStore.getState().selectedObjectIds.length > 0) {
          e.preventDefault();
          setTransformMode('scale');
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = useDirector3DStore.getState().selectedObjectIds;
        if (ids.length > 0) {
          e.preventDefault();
          ids.forEach((id) => removeSceneObject(id));
        }
      } else if (e.key === 'Escape') {
        if (boxSelectRef.current.active) {
          boxSelectRef.current.active = false;
          setBoxRect(null);
        } else if (useDirector3DStore.getState().placementMode) {
          setPlacementMode(false);
        } else if (useDirector3DStore.getState().selectedObjectIds.length > 0) {
          clearSelection();
        }
      } else if (e.key === ' ') {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const getSelectableMeshes = (): THREE.Object3D[] => {
      const all: THREE.Object3D[] = [];
      for (const obj of objectMapRef.current.values()) {
        obj.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) {
            all.push(child);
          }
        });
      }
      return all;
    };

    const handlePointerDown = (e: MouseEvent) => {
      pointerDownRef.current = {
        x: e.clientX,
        y: e.clientY,
        button: e.button,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        time: performance.now(),
      };
      isDraggingRef.current = false;

      // Ctrl+leftButton: start box selection
      if (e.ctrlKey && e.button === 0) {
        boxSelectRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          currentY: e.clientY,
        };
        e.preventDefault();
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      // Update box selection rectangle
      if (boxSelectRef.current.active) {
        const bs = boxSelectRef.current;
        bs.currentX = e.clientX;
        bs.currentY = e.clientY;
        const containerRect = container.getBoundingClientRect();
        setBoxRect({
          left: Math.min(bs.startX, bs.currentX) - containerRect.left,
          top: Math.min(bs.startY, bs.currentY) - containerRect.top,
          width: Math.abs(bs.currentX - bs.startX),
          height: Math.abs(bs.currentY - bs.startY),
        });
        return;
      }

      if (pointerDownRef.current.button < 0) return;

      // If mouse moved beyond threshold, mark as drag
      const dx = e.clientX - pointerDownRef.current.x;
      const dy = e.clientY - pointerDownRef.current.y;
      if (Math.hypot(dx, dy) > CLICK_THRESHOLD) {
        isDraggingRef.current = true;
      }

      // Handle drag operations (orbit, pan)
      if (cameraLockedRef.current) return;

      const pd = pointerDownRef.current;
      if (!isDraggingRef.current) return;

      // Ctrl+drag (non-box-select): pan only
      if (pd.ctrl) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward).normalize();
        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const speed = ZOOM_SENSITIVITY * dx * 0.5;
        camera.position.addScaledVector(right, -speed);
        camera.position.y += dy * ZOOM_SENSITIVITY * 0.5;
        orbitTargetRef.current.addScaledVector(right, -speed);
        orbitTargetRef.current.y += dy * ZOOM_SENSITIVITY * 0.5;
        camera.lookAt(orbitTargetRef.current);
        pointerDownRef.current = { ...pd, x: e.clientX, y: e.clientY };
        return;
      }

      const isRightDrag = pd.button === 2 || pd.shift;

      // Suppress right-drag orbit when placement is active (right-click cancels)
      if (pd.button === 2 && useDirector3DStore.getState().placementMode) {
        return;
      }

      if (isRightDrag) {
        // Orbit
        const pivot = orbitTargetRef.current;
        const camPos = camera.position.clone().sub(pivot);
        const radius = camPos.length();
        const theta = Math.atan2(camPos.x, camPos.z) - dx * ROTATE_SENSITIVITY;
        const phi = Math.acos(camPos.y / radius) + dy * ROTATE_SENSITIVITY;
        const clampedPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
        camera.position.set(
          pivot.x + radius * Math.sin(clampedPhi) * Math.sin(theta),
          pivot.y + radius * Math.cos(clampedPhi),
          pivot.z + radius * Math.sin(clampedPhi) * Math.cos(theta),
        );
        camera.lookAt(pivot);
      } else if (pd.button === 1 || (pd.button === 0 && !tc.object)) {
        // Pan (middle button, or left button when no gizmo active)
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward).normalize();
        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const speed = ZOOM_SENSITIVITY * dx * 0.5;
        camera.position.addScaledVector(right, -speed);
        camera.position.y += dy * ZOOM_SENSITIVITY * 0.5;
        orbitTargetRef.current.addScaledVector(right, -speed);
        orbitTargetRef.current.y += dy * ZOOM_SENSITIVITY * 0.5;
        camera.lookAt(orbitTargetRef.current);
      }

      pointerDownRef.current = { ...pd, x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: MouseEvent) => {
      const pd = pointerDownRef.current;

      // Finalize box selection
      if (boxSelectRef.current.active) {
        boxSelectRef.current.active = false;
        setBoxRect(null);

        const bs = boxSelectRef.current;
        const dx = Math.abs(bs.currentX - bs.startX);
        const dy = Math.abs(bs.currentY - bs.startY);

        // If barely moved, treat as a click (toggle under cursor)
        if (dx < CLICK_THRESHOLD && dy < CLICK_THRESHOLD) {
          const rect = container.getBoundingClientRect();
          MOUSE.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          MOUSE.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          RAYCASTER.setFromCamera(MOUSE, camera);
          const selectables = getSelectableMeshes();
          const intersects = RAYCASTER.intersectObjects(selectables, false);
          if (intersects.length > 0) {
            const objId = findSceneObjectId(intersects[0].object);
            if (objId) {
              useDirector3DStore.getState().toggleSelectObject(objId);
            }
          }
        } else {
          // Box select: find all objects whose projected position falls in the rect
          const containerRect = container.getBoundingClientRect();
          const rLeft = Math.min(bs.startX, bs.currentX) - containerRect.left;
          const rRight = Math.max(bs.startX, bs.currentX) - containerRect.left;
          const rTop = Math.min(bs.startY, bs.currentY) - containerRect.top;
          const rBottom = Math.max(bs.startY, bs.currentY) - containerRect.top;
          const matchingIds: string[] = [];

          for (const so of useDirector3DStore.getState().sceneObjects) {
            const group = objectMapRef.current.get(so.id);
            if (!group) continue;
            const wp = new THREE.Vector3();
            group.getWorldPosition(wp);
            const projected = wp.clone().project(camera);
            const sx = (projected.x * 0.5 + 0.5) * container.clientWidth;
            const sy = (-projected.y * 0.5 + 0.5) * container.clientHeight;
            if (sx >= rLeft && sx <= rRight && sy >= rTop && sy <= rBottom) {
              matchingIds.push(so.id);
            }
          }
          useDirector3DStore.getState().setSelectedObjects(matchingIds);
        }
        isDraggingRef.current = false;
        pointerDownRef.current = { x: 0, y: 0, button: -1, ctrl: false, shift: false, time: 0 };
        return;
      }

      const wasDrag = isDraggingRef.current;

      pointerDownRef.current = { x: 0, y: 0, button: -1, ctrl: false, shift: false, time: 0 };
      isDraggingRef.current = false;

      // If it was a drag (mouse moved > threshold), skip click logic
      if (wasDrag) {
        return;
      }

      // Right-click cancels placement mode
      if (e.button === 2 && useDirector3DStore.getState().placementMode) {
        useDirector3DStore.getState().setPlacementMode(false);
        isDraggingRef.current = false;
        pointerDownRef.current = { x: 0, y: 0, button: -1, ctrl: false, shift: false, time: 0 };
        return;
      }

      // Only handle left-button click
      if (e.button !== 0 || pd.button !== 0 || pd.shift) return;

      const rect = container.getBoundingClientRect();
      MOUSE.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      MOUSE.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      RAYCASTER.setFromCamera(MOUSE, camera);

      // Placement mode: click ground to place shape
      if (useDirector3DStore.getState().placementMode) {
        const intersects = RAYCASTER.intersectObject(ground, false);
        if (intersects.length > 0) {
          const pt = intersects[0].point;
          const st = useDirector3DStore.getState();
          const shapeType = st.placementShapeType;
          const shapeDef = getShapeDef(shapeType);
          const defaultScale = shapeDef?.defaultScale ?? { x: 1, y: 1, z: 1 };
          const count = st.sceneObjects.filter((o) => o.type === shapeType).length;
          st.addSceneObject({
            type: shapeType,
            label: `${shapeType} ${count + 1}`,
            position: { x: pt.x, y: 0, z: pt.z },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { ...defaultScale },
          });
        }
        isDraggingRef.current = false;
        pointerDownRef.current = { x: 0, y: 0, button: -1, ctrl: false, shift: false, time: 0 };
        return;
      }

      // Click-to-select
      const selectables = getSelectableMeshes();
      const intersects = RAYCASTER.intersectObjects(selectables, false);
      if (intersects.length > 0) {
        const objId = findSceneObjectId(intersects[0].object);
        if (objId) {
          if (pd.ctrl) {
            toggleSelectObject(objId);
          } else {
            selectObject(objId);
          }
          return;
        }
      }

      // Click on empty ground: deselect (unless ctrl, which keeps selection)
      if (!pd.ctrl) {
        const groundHit = RAYCASTER.intersectObject(ground, false);
        if (groundHit.length > 0) {
          clearSelection();
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (cameraLockedRef.current) return;
      e.preventDefault();
      // Alt+scroll adjusts FOV
      if (e.altKey) {
        const newFov = clampFov(camera.fov + e.deltaY * 0.05);
        camera.fov = newFov;
        camera.updateProjectionMatrix();
        const activeId = useDirector3DStore.getState().activeRigId;
        if (activeId) {
          useDirector3DStore.getState().updateRig(activeId, { fov: newFov });
        }
        return;
      }
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const amount = e.deltaY * ZOOM_SENSITIVITY * 0.05;
      camera.position.addScaledVector(forward, amount);
      camera.lookAt(orbitTargetRef.current);
    };

    const handleContextMenu = (e: Event) => e.preventDefault();

    /* Register events */
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('contextmenu', handleContextMenu);

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // ── Animation loop ───────────────────────────────────────────
    let lastTime = performance.now();

    function animate(now: number) {
      animFrameRef.current = requestAnimationFrame(animate);
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // ── Camera transition (smooth lerp) ─────────────────────────
      const transition = transitionRef.current;
      if (transition?.active) {
        transition.elapsed += delta;
        const t = Math.min(transition.elapsed / transition.duration, 1.0);
        // easeInOutCubic
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        camera.position.lerpVectors(transition.startPos, transition.endPos, eased);
        orbitTargetRef.current.lerpVectors(transition.startTarget, transition.endTarget, eased);
        camera.fov = transition.startFov + (transition.endFov - transition.startFov) * eased;
        camera.lookAt(orbitTargetRef.current);
        camera.updateProjectionMatrix();
        if (t >= 1.0) {
          transitionRef.current = null;
        }
      }

      const keys = keysRef.current;
      const camPos = camera.position;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward).normalize();
      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      let moved = false;
      const speed = MOVE_SPEED * delta;
      const selIds = useDirector3DStore.getState().selectedObjectIds;
      const hasSelection = selIds.length > 0;

      if (!cameraLockedRef.current && !transitionRef.current?.active) {
        if (keys.has('w') && !hasSelection) {
          camPos.addScaledVector(forward, speed);
          orbitTargetRef.current.addScaledVector(forward, speed);
          moved = true;
        }
        if (keys.has('s') && !hasSelection) {
          camPos.addScaledVector(forward, -speed);
          orbitTargetRef.current.addScaledVector(forward, -speed);
          moved = true;
        }
        if (keys.has('a')) {
          camPos.addScaledVector(right, -speed);
          orbitTargetRef.current.addScaledVector(right, -speed);
          moved = true;
        }
        if (keys.has('d')) {
          camPos.addScaledVector(right, speed);
          orbitTargetRef.current.addScaledVector(right, speed);
          moved = true;
        }
        if (keys.has('q') || keys.has(' ')) {
          camPos.y += speed;
          orbitTargetRef.current.y += speed;
          moved = true;
        }
        if (keys.has('e') && !hasSelection) {
          camPos.y -= speed;
          orbitTargetRef.current.y -= speed;
          moved = true;
        }
      }

      if (moved) {
        camera.lookAt(orbitTargetRef.current);
        useDirector3DStore.getState().setActiveRig(null);
      }

      // Sync scene objects from store (skip objects under selection group)
      if (!isTransformingRef.current) {
        syncSceneObjects(useDirector3DStore.getState().sceneObjects);
      }

      // Sync transform controls target (0, 1, or 2+ selected)
      const sIds = useDirector3DStore.getState().selectedObjectIds;
      const map = objectMapRef.current;
      const selGroup = selectionGroupRef.current;

      if (sIds.length === 0) {
        // Deselect: reparent from selection group to scene, detach TC
        if (selGroup && selGroup.children.length > 0) {
          const children = [...selGroup.children];
          children.forEach((child) => scene.attach(child));
        }
        if (tc.object) tc.detach();
      } else if (sIds.length === 1) {
        // Single select: reparent from selection group, attach TC directly
        if (selGroup && selGroup.children.length > 0) {
          const children = [...selGroup.children];
          children.forEach((child) => scene.attach(child));
        }
        const obj = map.get(sIds[0]);
        if (obj && tc.object !== obj) {
          if (tc.object) tc.detach();
          tc.attach(obj);
        }
      } else {
        // Multi-select (2+): reparent to selection group, attach TC to group
        let group = selectionGroupRef.current;
        if (!group) {
          group = new THREE.Group();
          group.userData.isSelectionGroup = true;
          selectionGroupRef.current = group;
          scene.add(group);
        }
        // Reparent selected objects to selection group (preserving world transform)
        for (const id of sIds) {
          const obj = map.get(id);
          if (obj && obj.parent !== group) {
            group.attach(obj);
          }
        }
        if (tc.object !== group) {
          if (tc.object) tc.detach();
          tc.attach(group);
        }
      }

      // Sync transform mode
      tc.setMode(useDirector3DStore.getState().transformMode);

      // Sync selection highlights (BoxHelper outline)
      const hlMap = highlightMapRef.current;
      for (const [id, box] of hlMap) {
        if (!sIds.includes(id)) {
          scene.remove(box);
          hlMap.delete(id);
        }
      }
      for (const id of sIds) {
        if (!hlMap.has(id)) {
          const group = map.get(id);
          if (group) {
            const box = new THREE.BoxHelper(group, 0xf5a623);
            box.name = `highlight-${id}`;
            scene.add(box);
            hlMap.set(id, box);
          }
        }
      }
      // Update all active highlights
      for (const [, box] of hlMap) {
        box.update();
      }

      renderer.render(scene, camera);
    }

    animFrameRef.current = requestAnimationFrame(animate);

    // ── Cleanup ─────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      tc.dispose();
      if (tcHelper.parent) scene.remove(tcHelper);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      objectMapRef.current.clear();
      highlightMapRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync selection to transform controls (when selection changes via React state) ──
  useEffect(() => {
    const tc = transformRef.current;
    const scene = sceneRef.current;
    const map = objectMapRef.current;
    const hlMap = highlightMapRef.current;
    if (!tc || !scene) return;

    if (selectedObjectIds.length === 0) {
      // Reparent from selection group to scene
      const selGroup = selectionGroupRef.current;
      if (selGroup && selGroup.children.length > 0) {
        const children = [...selGroup.children];
        children.forEach((child) => scene.attach(child));
      }
      tc.detach();
      // Remove all highlights
      for (const [, box] of hlMap) {
        scene.remove(box);
      }
      hlMap.clear();
    } else if (selectedObjectIds.length === 1) {
      // Reparent from selection group, attach directly
      const selGroup = selectionGroupRef.current;
      if (selGroup && selGroup.children.length > 0) {
        const children = [...selGroup.children];
        children.forEach((child) => scene.attach(child));
      }
      const obj = map.get(selectedObjectIds[0]);
      if (obj && tc.object !== obj) {
        if (tc.object) tc.detach();
        tc.attach(obj);
      }
    }
    // Multi-select (2+) is handled in the animation loop
  }, [selectedObjectIds]);

  // ── Camera lock & screenshot handlers ──────────────────────────
  const handleToggleLock = useCallback(() => {
    setCameraLocked((prev) => {
      const next = !prev;
      cameraLockedRef.current = next;
      return next;
    });
  }, []);

  const handleScreenshot = useCallback(async () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    // Hide transform gizmo before screenshot
    const tc = transformRef.current;
    const tcObject = tc?.object ?? null;
    if (tc && tcObject) {
      tc.detach();
    }

    // Render at configured resolution
    const settings = useSettingsStore.getState();
    const targetWidth = settings.director3dScreenshotWidth;
    const targetHeight = settings.director3dScreenshotRatio === '16:9'
      ? Math.round(targetWidth * 9 / 16)
      : Math.round(targetWidth * 16 / 9);
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevAspect = camera.aspect;
    renderer.setSize(targetWidth, targetHeight, false);
    camera.aspect = targetWidth / targetHeight;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    console.log("[screenshot] dataUrl length=" + dataUrl.length + ", prefix=" + dataUrl.substring(0, 50));
    // Restore original size
    renderer.setSize(prevSize.x, prevSize.y, false);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();

    // Re-attach gizmo after screenshot
    if (tc && tcObject) {
      tc.attach(tcObject);
    }

    // Add to canvas as upload node — use data URL directly (reliable), persist in background
    const aspectRatio = targetWidth > targetHeight ? '16:9' : '9:16';
    useCanvasStore.getState().addNode(CANVAS_NODE_TYPES.upload, { x: 100, y: 100 }, {
      imageUrl: dataUrl,
      previewImageUrl: dataUrl,
      aspectRatio,
    });
    // Persist image to storage in background for future use
    prepareNodeImage(dataUrl).catch((err) => console.warn('background prepareNodeImage failed', err));

    // Save to local — configured directory or browser download
    const screenshotSavePath = useSettingsStore.getState().screenshotSavePath;
    if (screenshotSavePath) {
      try {
        await saveImageSourceToDirectory(dataUrl, screenshotSavePath, `storyboard-3d-${Date.now()}.png`);
      } catch (err) {
        console.error('Failed to save screenshot to configured path, falling back to browser download', err);
        const link = document.createElement('a');
        link.download = `storyboard-3d-${Date.now()}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } else {
      const link = document.createElement('a');
      link.download = `storyboard-3d-${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    useDirector3DStore.getState().leaveDirector3D();
  }, []);

  // ── Add camera rig handler ────────────────────────────────────
  const handleAddCameraRig = useCallback(() => {
    const state = getCameraState();
    const existingCount = useDirector3DStore.getState().cameraRigs.length;
    addCameraRig({ ...state, name: `Camera ${existingCount + 1}` });
  }, [getCameraState, addCameraRig]);

  const startCameraTransition = useCallback(
    (targetPos: THREE.Vector3, targetLookAt: THREE.Vector3, targetFov: number) => {
      const cam = cameraRef.current;
      if (!cam) return;
      transitionRef.current = {
        active: true,
        startPos: cam.position.clone(),
        endPos: targetPos.clone(),
        startTarget: orbitTargetRef.current.clone(),
        endTarget: targetLookAt.clone(),
        startFov: cam.fov,
        endFov: targetFov,
        elapsed: 0,
        duration: 0.35,
      };
    },
    [],
  );

  const handleSelectRig = useCallback(
    (rig: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number; id: string }) => {
      const endPos = new THREE.Vector3(rig.position.x, rig.position.y, rig.position.z);
      const endTarget = new THREE.Vector3(rig.target.x, rig.target.y, rig.target.z);
      startCameraTransition(endPos, endTarget, rig.fov);
      useDirector3DStore.getState().setActiveRig(rig.id);
    },
    [startCameraTransition],
  );

  const handleSelectPreset = useCallback(
    (preset: CameraPreset) => {
      const endPos = new THREE.Vector3(preset.pos.x, preset.pos.y, preset.pos.z);
      const endTarget = new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z);
      startCameraTransition(endPos, endTarget, preset.fov);
      useDirector3DStore.getState().setActiveRig(null);
    },
    [startCameraTransition],
  );

  const handlePlaceGrid = useCallback((rows: number, cols: number) => {
    const st = useDirector3DStore.getState();
    const spacing = 1.5;
    const offsetX = (cols - 1) * spacing / 2;
    const offsetZ = (rows - 1) * spacing / 2;
    const newIds: string[] = [];
    let count = st.sceneObjects.length;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        count++;
        const id = st.addSceneObject({
          type: 'character',
          label: `character ${count}`,
          position: { x: col * spacing - offsetX, y: 0, z: row * spacing - offsetZ },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1.2, y: 1.2, z: 1.2 },
        });
        newIds.push(id);
      }
    }
    st.setSelectedObjects(newIds);
  }, []);

  const handleQuickAddCharacter = useCallback((color: string) => {
    const cam = cameraRef.current;
    if (!cam) return;
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    forward.y = 0;
    const len = Math.hypot(forward.x, forward.z);
    if (len > 0.001) {
      forward.x /= len;
      forward.z /= len;
    }
    const pos = cam.position.clone().addScaledVector(forward, 5);
    pos.y = 0;
    const st = useDirector3DStore.getState();
    const count = st.sceneObjects.filter((o) => o.type === 'character').length;
    st.addSceneObject({
      type: 'character',
      label: `character ${count + 1}`,
      position: { x: pos.x, y: 0, z: pos.z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1.2, y: 1.2, z: 1.2 },
      color,
    });
  }, []);

  const resetFreeRoam = useCallback(() => {
    const endPos = new THREE.Vector3(8, 6, 8);
    const endTarget = new THREE.Vector3(0, 1, 0);
    startCameraTransition(endPos, endTarget, 55);
    useDirector3DStore.getState().setActiveRig(null);
  }, [startCameraTransition]);

  return (
    <div className="absolute inset-0 flex flex-col bg-bg-dark">
      <DirectorToolbar
        onAddCameraRig={handleAddCameraRig}
        onResetCamera={resetFreeRoam}
        cameraLocked={cameraLocked}
        onToggleLock={handleToggleLock}
        onScreenshot={handleScreenshot}
        screenshotRatio={director3dScreenshotRatio}
        onScreenshotRatioChange={setDirector3dScreenshotRatio}
        onSelectPreset={handleSelectPreset}
        onPlaceGrid={handlePlaceGrid}
        onQuickAddCharacter={handleQuickAddCharacter}
      />
      <div className="flex-1 flex relative">
        <div ref={containerRef} className="flex-1 relative">
          {overlayRigName && (
            <div className="absolute top-3 left-3 z-10 pointer-events-none">
              <div className="rounded bg-black/65 px-3 py-1.5 text-xs text-white font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                {overlayRigName}
              </div>
            </div>
          )}
          {boxRect && (
            <div
              className="absolute z-20 pointer-events-none border border-accent border-dashed bg-accent/10"
              style={{
                left: boxRect.left,
                top: boxRect.top,
                width: boxRect.width,
                height: boxRect.height,
              }}
            />
          )}
        </div>
        <CharacterPanel />
        <CameraPanel
          cameraRigs={cameraRigs}
          activeRigId={activeRigId}
          onSelectRig={handleSelectRig}
        />
      </div>
    </div>
  );
}
