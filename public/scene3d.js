import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TILE = {
  width: 0.5,
  length: 1,
  thickness: 0.16,
  radius: 0.035,
  gap: 0.07,
};

const HAND_TILT = THREE.MathUtils.degToRad(78);
const HAND_Z = 2.55;
const HAND_GAP = 0.13;
const BOARD_Z = -0.45;
const MAX_BOARD_WIDTH = 13;
const PLATE_POSITIONS = {
  self: new THREE.Vector3(0, 0.028, 3.15),
  left: new THREE.Vector3(-4.65, 0.028, 2.8),
  top: new THREE.Vector3(0, 0.028, -1.85),
  right: new THREE.Vector3(4.65, 0.028, 2.8),
};

const PIP_LAYOUT = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function makeIvoryTextures(anisotropy) {
  const random = mulberry32(20260214);

  const colorCanvas = makeCanvas(512);
  const color = colorCanvas.getContext('2d');
  color.fillStyle = '#e9dcc1';
  color.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 1200; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const r = 2 + random() * 26;
    const warm = random() > 0.5;
    color.fillStyle = warm
      ? `rgba(255, 248, 226, ${0.02 + random() * 0.05})`
      : `rgba(146, 124, 88, ${0.015 + random() * 0.04})`;
    color.beginPath();
    color.ellipse(x, y, r, r * (0.4 + random() * 0.8), random() * Math.PI, 0, Math.PI * 2);
    color.fill();
  }

  for (let i = 0; i < 40; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    color.strokeStyle = `rgba(120, 100, 70, ${0.03 + random() * 0.05})`;
    color.lineWidth = 0.6 + random() * 1.2;
    color.beginPath();
    color.moveTo(x, y);
    color.bezierCurveTo(
      x + (random() - 0.5) * 160,
      y + (random() - 0.5) * 160,
      x + (random() - 0.5) * 240,
      y + (random() - 0.5) * 240,
      x + (random() - 0.5) * 320,
      y + (random() - 0.5) * 320,
    );
    color.stroke();
  }

  const edge = 70;
  const edges = [
    color.createLinearGradient(0, 0, edge, 0),
    color.createLinearGradient(512, 0, 512 - edge, 0),
    color.createLinearGradient(0, 0, 0, edge),
    color.createLinearGradient(0, 512, 0, 512 - edge),
  ];
  edges.forEach((gradient) => {
    gradient.addColorStop(0, 'rgba(112, 92, 62, 0.28)');
    gradient.addColorStop(1, 'rgba(112, 92, 62, 0)');
  });
  color.fillStyle = edges[0];
  color.fillRect(0, 0, edge, 512);
  color.fillStyle = edges[1];
  color.fillRect(512 - edge, 0, edge, 512);
  color.fillStyle = edges[2];
  color.fillRect(0, 0, 512, edge);
  color.fillStyle = edges[3];
  color.fillRect(0, 512 - edge, 512, edge);

  const surfaceCanvas = makeCanvas(512);
  const surface = surfaceCanvas.getContext('2d');
  surface.fillStyle = '#9a9a9a';
  surface.fillRect(0, 0, 512, 512);
  const image = surface.getImageData(0, 0, 512, 512);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (random() - 0.5) * 32;
    const value = Math.max(0, Math.min(255, 154 + noise));
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  surface.putImageData(image, 0, 0);
  for (let i = 0; i < 26; i += 1) {
    surface.strokeStyle = `rgba(235, 235, 235, ${0.1 + random() * 0.2})`;
    surface.lineWidth = 0.5 + random();
    surface.beginPath();
    const x = random() * 512;
    const y = random() * 512;
    surface.moveTo(x, y);
    surface.lineTo(x + (random() - 0.5) * 90, y + (random() - 0.5) * 90);
    surface.stroke();
  }

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.anisotropy = anisotropy;

  const surfaceTexture = new THREE.CanvasTexture(surfaceCanvas);
  surfaceTexture.colorSpace = THREE.NoColorSpace;
  surfaceTexture.anisotropy = anisotropy;

  return { colorTexture, surfaceTexture };
}

function makeFeltTexture(anisotropy) {
  const random = mulberry32(773311);
  const canvas = makeCanvas(256);
  const context = canvas.getContext('2d');
  context.fillStyle = '#0b271d';
  context.fillRect(0, 0, 256, 256);
  const image = context.getImageData(0, 0, 256, 256);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (random() - 0.5) * 16;
    data[i] = Math.max(0, Math.min(255, 11 + noise));
    data[i + 1] = Math.max(0, Math.min(255, 39 + noise));
    data[i + 2] = Math.max(0, Math.min(255, 29 + noise));
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 4);
  texture.anisotropy = anisotropy;
  return texture;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitFont(ctx, text, maxWidth, size, weight) {
  const family = '"Segoe UI", "Trebuchet MS", Arial, sans-serif';
  let current = size;
  while (current > 18) {
    ctx.font = `${weight} ${current}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    current -= 2;
  }
  return current;
}

function drawPlayerPlate(ctx, player, isYou, isActive) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const family = '"Segoe UI", "Trebuchet MS", Arial, sans-serif';
  ctx.clearRect(0, 0, width, height);

  roundRectPath(ctx, 8, 12, width - 16, height - 24, 26);
  ctx.fillStyle = isActive ? 'rgba(52, 32, 6, 0.86)' : 'rgba(4, 12, 9, 0.8)';
  ctx.fill();
  ctx.lineWidth = isActive ? 6 : 2;
  ctx.strokeStyle = isActive ? '#ffb340' : 'rgba(255, 255, 255, 0.16)';
  ctx.stroke();

  if (isYou) {
    ctx.fillStyle = '#2fbf85';
    roundRectPath(ctx, 26, 34, 9, 60, 4.5);
    ctx.fill();
  }

  const name = player.name || 'Pemain';
  const label = isYou ? `${name} (Kamu)` : name;
  const nameLeft = isYou ? 46 : 30;
  const nameSize = fitFont(ctx, label, 330, 38, 700);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = player.connected === false ? '#8da2bd' : '#f7ecd4';
  ctx.font = `700 ${nameSize}px ${family}`;
  ctx.fillText(label, nameLeft, 52);

  const bits = [`${player.count || 0} kartu`, `${player.score || 0} poin`];
  if (player.isHost) bits.push('Host');
  if (player.connected === false) bits.push('Offline');
  const sub = bits.join('  ·  ');
  const subSize = fitFont(ctx, sub, 446, 24, 500);
  ctx.fillStyle = isActive ? '#ffd699' : '#9fc7b6';
  ctx.font = `500 ${subSize}px ${family}`;
  ctx.fillText(sub, nameLeft, 90);

  if (isActive) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd699';
    ctx.font = `700 22px ${family}`;
    ctx.fillText('GILIRAN', width - 30, 52);
  }
}

export class DominoScene {
  constructor(container, onTileClick) {
    this.container = container;
    this.onTileClick = typeof onTileClick === 'function' ? onTileClick : () => {};
    this.records = new Map();
    this.plates = new Map();
    this.pipCache = new Map();
    this.hoveredId = null;
    this.selectedId = null;
    this.playable = new Set();
    this.interactive = false;
    this.boardWidth = 0;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.lastFrame = performance.now();
    this.tmpPos = new THREE.Vector3();
    this.tableTop = 0;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'scene-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#07110d');
    this.scene.fog = new THREE.Fog('#07110d', 16, 34);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    this.cameraTarget = new THREE.Vector3(0, 0.42, 0.55);
    this.cameraDirection = new THREE.Vector3(0, 0.68, 0.74).normalize();

    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.buildEnvironment();
    this.buildTable();
    this.buildLights();
    this.buildTileAssets();

    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerLeave = this.handlePointerLeave.bind(this);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.environment;
    if ('environmentIntensity' in this.scene) {
      this.scene.environmentIntensity = 0.62;
    }
    pmrem.dispose();
  }

  buildTable() {
    const feltTexture = makeFeltTexture(this.maxAnisotropy);

    const wood = new THREE.MeshStandardMaterial({
      color: 0x2a1a10,
      roughness: 0.55,
      metalness: 0.05,
    });
    const base = new THREE.Mesh(new RoundedBoxGeometry(27, 0.6, 15.5, 3, 0.3), wood);
    base.position.set(0, -0.31, 0.6);
    base.receiveShadow = true;
    base.castShadow = true;
    this.scene.add(base);

    const felt = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: feltTexture,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.35,
    });
    const feltTop = new THREE.Mesh(new RoundedBoxGeometry(26, 0.06, 14.5, 3, 0.18), felt);
    feltTop.position.set(0, -0.03, 0.6);
    feltTop.receiveShadow = true;
    this.scene.add(feltTop);
    this.tableTop = 0;

    const trim = new THREE.Mesh(
      new RoundedBoxGeometry(26.7, 0.14, 15.2, 3, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0x9b7634,
        metalness: 0.9,
        roughness: 0.35,
        envMapIntensity: 1,
      }),
    );
    trim.position.set(0, -0.09, 0.6);
    trim.receiveShadow = true;
    this.scene.add(trim);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x24170a, 0.55));

    const key = new THREE.DirectionalLight(0xffe7c8, 2.6);
    key.position.set(6, 11, 7);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    this.scene.add(key);
    this.scene.add(key.target);

    const rim = new THREE.DirectionalLight(0x8fc0ff, 1.1);
    rim.position.set(-9, 6, -7);
    rim.target.position.set(0, 0, 0);
    this.scene.add(rim);
    this.scene.add(rim.target);

    const fill = new THREE.PointLight(0xffc78f, 18, 26, 2);
    fill.position.set(0, 5.5, 5.5);
    this.scene.add(fill);
  }

  buildTileAssets() {
    const { colorTexture, surfaceTexture } = makeIvoryTextures(this.maxAnisotropy);

    this.bodyGeometry = new RoundedBoxGeometry(
      TILE.width,
      TILE.thickness,
      TILE.length,
      5,
      TILE.radius,
    );

    this.bodyMaterialTemplate = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: colorTexture,
      roughnessMap: surfaceTexture,
      roughness: 0.66,
      bumpMap: surfaceTexture,
      bumpScale: 0.0024,
      metalness: 0,
      clearcoat: 0.38,
      clearcoatRoughness: 0.34,
      envMapIntensity: 0.85,
    });

    this.pipMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c0d0f,
      roughness: 0.42,
      metalness: 0.08,
      envMapIntensity: 0.55,
    });

    this.pinGeometry = new THREE.CylinderGeometry(0.024, 0.024, TILE.width * 0.92, 24);
    this.pinGeometry.rotateZ(Math.PI / 2);
    this.pinGeometry.translate(0, TILE.thickness / 2 + 0.004, 0);

    this.pinMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9a24a,
      metalness: 1,
      roughness: 0.22,
      envMapIntensity: 1.5,
    });
  }

  getPipGeometry(pipKey) {
    if (this.pipCache.has(pipKey)) return this.pipCache.get(pipKey);
    const [valueA, valueB] = pipKey.split('-').map(Number);
    const geometries = [];

    for (const [value, centerZ] of [[valueA, -TILE.length / 4], [valueB, TILE.length / 4]]) {
      for (const index of PIP_LAYOUT[value] || []) {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const geometry = new THREE.CylinderGeometry(0.038, 0.031, 0.014, 24);
        geometry.translate(
          (column - 1) * 0.13,
          TILE.thickness / 2 - 0.001,
          centerZ + (row - 1) * 0.13,
        );
        geometries.push(geometry);
      }
    }

    const merged = geometries.length
      ? mergeGeometries(geometries, false)
      : new THREE.BufferGeometry();
    geometries.forEach((geometry) => geometry.dispose());
    this.pipCache.set(pipKey, merged);
    return merged;
  }

  ensureRecord(id) {
    const existing = this.records.get(id);
    if (existing) return existing;

    const group = new THREE.Group();
    group.userData.tileId = id;

    const bodyMaterial = this.bodyMaterialTemplate.clone();
    const body = new THREE.Mesh(this.bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const pin = new THREE.Mesh(this.pinGeometry, this.pinMaterial);
    pin.castShadow = true;
    group.add(pin);

    const pips = new THREE.Mesh(this.getPipGeometry('0-0'), this.pipMaterial);
    pips.castShadow = true;
    group.add(pips);

    group.position.set(0, 3.2, 1.5);
    group.scale.setScalar(0.65);
    this.scene.add(group);

    const record = {
      id,
      group,
      body,
      pips,
      bodyMaterial,
      pipKey: null,
      zone: 'hand',
      targetPos: new THREE.Vector3(),
      targetQuat: new THREE.Quaternion(),
      targetScale: new THREE.Vector3(1, 1, 1),
    };
    this.records.set(id, record);
    return record;
  }

  applyTarget(record, position, quaternion, scale, pipKey, zone) {
    record.targetPos.copy(position);
    record.targetQuat.copy(quaternion);
    record.targetScale.copy(scale);
    record.zone = zone;
    if (record.pipKey !== pipKey) {
      record.pipKey = pipKey;
      record.pips.geometry = this.getPipGeometry(pipKey);
    }
  }

  layoutBoard(board) {
    if (!board.length) {
      return { totalWidth: 0, tiles: [] };
    }
    const gap = TILE.gap;
    const rawWidths = board.map((tile) => (tile.double ? TILE.width : TILE.length));
    const rawTotal = rawWidths.reduce((sum, width) => sum + width, 0) + gap * (board.length - 1);
    const scale = Math.min(1, MAX_BOARD_WIDTH / rawTotal);
    const totalWidth = rawTotal * scale;

    let cursor = -totalWidth / 2;
    const tiles = board.map((tile, index) => {
      const width = rawWidths[index] * scale;
      const position = new THREE.Vector3(
        cursor + width / 2,
        (TILE.thickness / 2) * scale + 0.006,
        BOARD_Z,
      );
      cursor += width + gap * scale;
      const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, tile.double ? 0 : Math.PI / 2, 0),
      );
      return {
        position,
        quaternion,
        scale: new THREE.Vector3(scale, scale, scale),
      };
    });

    return { totalWidth, tiles };
  }

  layoutHand(hand) {
    if (!hand.length) return { tiles: [] };
    const totalWidth = hand.length * TILE.width + (hand.length - 1) * HAND_GAP;
    const baseY = (TILE.length / 2) * Math.sin(HAND_TILT)
      + (TILE.thickness / 2) * Math.cos(HAND_TILT)
      + 0.008;
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(HAND_TILT, 0, 0));

    return {
      tiles: hand.map((tile, index) => ({
        position: new THREE.Vector3(
          -totalWidth / 2 + TILE.width / 2 + index * (TILE.width + HAND_GAP),
          baseY,
          HAND_Z,
        ),
        quaternion: quaternion.clone(),
        scale: new THREE.Vector3(1, 1, 1),
      })),
    };
  }

  seatMap(players, myId) {
    const seats = ['self', 'left', 'top', 'right'];
    const map = new Map();
    const myIndex = players.findIndex((player) => player.id === myId);
    if (myIndex < 0) return map;
    players.forEach((player, index) => {
      map.set(player.id, seats[(index - myIndex + seats.length) % seats.length]);
    });
    return map;
  }

  createPlate(id) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.575), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    const plate = {
      id,
      canvas,
      ctx: canvas.getContext('2d'),
      texture,
      material,
      mesh,
      key: null,
    };
    this.plates.set(id, plate);
    return plate;
  }

  updatePlates(players, myId, turnId, seats) {
    const alive = new Set(players.map((player) => player.id));
    for (const [id, plate] of this.plates) {
      if (alive.has(id)) continue;
      this.scene.remove(plate.mesh);
      plate.mesh.geometry.dispose();
      plate.material.dispose();
      plate.texture.dispose();
      this.plates.delete(id);
    }

    for (const player of players) {
      const seat = seats.get(player.id) || 'self';
      const isYou = player.id === myId;
      const isActive = player.id === turnId;
      const plate = this.plates.get(player.id) || this.createPlate(player.id);
      const key = [
        player.name,
        player.count,
        player.score,
        player.connected,
        player.isHost,
        isYou,
        isActive,
        seat,
      ].join('|');
      if (plate.key !== key) {
        plate.key = key;
        drawPlayerPlate(plate.ctx, player, isYou, isActive);
        plate.texture.needsUpdate = true;
      }
      plate.mesh.position.copy(PLATE_POSITIONS[seat] || PLATE_POSITIONS.self);
    }
  }

  update(state) {
    const board = state.board || [];
    const hand = state.hand || [];
    const players = Array.isArray(state.players) ? state.players : [];
    const myId = state.myId || null;
    const seats = this.seatMap(players, myId);
    this.interactive = Boolean(state.interactive);
    this.selectedId = state.selectedId || null;
    this.playable = new Set(this.interactive ? state.playableIds || [] : []);

    const boardLayout = this.layoutBoard(board);
    const handLayout = this.layoutHand(hand);
    const seen = new Set();

    board.forEach((tile, index) => {
      const record = this.ensureRecord(tile.id);
      seen.add(tile.id);
      const target = boardLayout.tiles[index];
      this.applyTarget(
        record,
        target.position,
        target.quaternion,
        target.scale,
        `${tile.left}-${tile.right}`,
        'board',
      );
    });

    hand.forEach((tile, index) => {
      const record = this.ensureRecord(tile.id);
      seen.add(tile.id);
      const target = handLayout.tiles[index];
      this.applyTarget(
        record,
        target.position,
        target.quaternion,
        target.scale,
        `${tile.a}-${tile.b}`,
        'hand',
      );
    });

    this.updatePlates(players, myId, state.turnId || null, seats);

    for (const [id, record] of this.records) {
      if (seen.has(id)) continue;
      this.scene.remove(record.group);
      record.bodyMaterial.dispose();
      this.records.delete(id);
    }

    if (this.hoveredId && !this.playable.has(this.hoveredId)) {
      this.hoveredId = null;
      this.renderer.domElement.style.cursor = 'default';
    }

    this.boardWidth = boardLayout.totalWidth;
    this.applyHighlights();
    this.updateCamera();
  }

  applyHighlights() {
    for (const record of this.records.values()) {
      const isHand = record.zone === 'hand';
      const isPlayable = isHand && this.playable.has(record.id);
      const isDimmed = isHand && this.interactive && !isPlayable;
      const isSelected = record.id === this.selectedId;

      if (isDimmed) {
        record.bodyMaterial.color.setScalar(0.62);
      } else {
        record.bodyMaterial.color.setScalar(1);
      }

      record.bodyMaterial.emissive.setHex(isPlayable || isSelected ? 0xff9a3d : 0x000000);
      record.bodyMaterial.emissiveIntensity = isSelected ? 0.34 : isPlayable ? 0.16 : 0;
    }
  }

  updateCamera() {
    const aspect = this.camera.aspect || 1;
    const halfWidth = Math.max(6.0, this.boardWidth / 2 + 0.9);
    const fovRadians = THREE.MathUtils.degToRad(this.camera.fov);
    const distanceForWidth = halfWidth / (Math.tan(fovRadians / 2) * aspect);
    const distance = THREE.MathUtils.clamp(Math.max(distanceForWidth, 9.6), 9.6, 24);
    this.camera.position.copy(this.cameraTarget).addScaledVector(this.cameraDirection, distance);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.updateCamera();
  }

  handlePointerMove(event) {
    const id = this.pick(event);
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    this.renderer.domElement.style.cursor = id ? 'pointer' : 'default';
  }

  handlePointerDown(event) {
    if (event.button !== 0) return;
    const id = this.pick(event);
    if (id) this.onTileClick(id);
  }

  handlePointerLeave() {
    if (!this.hoveredId) return;
    this.hoveredId = null;
    this.renderer.domElement.style.cursor = 'default';
  }

  pick(event) {
    if (!this.interactive || this.playable.size === 0) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const candidates = [];
    for (const record of this.records.values()) {
      if (record.zone === 'hand' && this.playable.has(record.id)) {
        candidates.push(record.group);
      }
    }
    if (!candidates.length) return null;

    const hits = this.raycaster.intersectObjects(candidates, true);
    if (!hits.length) return null;
    let object = hits[0].object;
    while (object && !object.userData.tileId) object = object.parent;
    return object ? object.userData.tileId : null;
  }

  tick() {
    const now = performance.now();
    const delta = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    const ease = 1 - Math.exp(-delta * 13);

    for (const record of this.records.values()) {
      this.tmpPos.copy(record.targetPos);
      if (record.zone === 'hand') {
        if (record.id === this.hoveredId && this.playable.has(record.id)) {
          this.tmpPos.y += 0.055;
        }
        if (record.id === this.selectedId) {
          this.tmpPos.y += 0.13;
          this.tmpPos.z += 0.09;
        }
      }

      record.group.position.lerp(this.tmpPos, ease);
      record.group.quaternion.slerp(record.targetQuat, ease);
      record.group.scale.lerp(record.targetScale, ease);
    }

    this.renderer.render(this.scene, this.camera);
  }

  clear() {
    for (const record of this.records.values()) {
      this.scene.remove(record.group);
      record.bodyMaterial.dispose();
    }
    this.records.clear();
    for (const plate of this.plates.values()) {
      this.scene.remove(plate.mesh);
      plate.mesh.geometry.dispose();
      plate.material.dispose();
      plate.texture.dispose();
    }
    this.plates.clear();
    this.boardWidth = 0;
    this.applyHighlights();
    this.updateCamera();
  }
}
