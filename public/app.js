import { DominoScene } from './scene3d.js';

const SESSION_KEY = 'domino.session.v1';
const NAME_KEY = 'domino.name.v1';
const MAX_PLAYERS = 4;

const PIP_LAYOUT = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const state = {
  socket: null,
  me: null,
  session: null,
  room: null,
  game: null,
  selectedId: null,
  rejoinPending: false,
  scene: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  lobby: $('lobby'),
  room: $('room'),
  game: $('game'),
  connection: $('connection'),
  nameInput: $('name-input'),
  codeInput: $('code-input'),
  createBtn: $('create-btn'),
  joinBtn: $('join-btn'),
  lobbyError: $('lobby-error'),
  lobbyStatus: $('lobby-status'),
  roomCode: $('room-code'),
  roomSeats: $('room-seats'),
  roomHint: $('room-hint'),
  roomNotice: $('room-notice'),
  copyBtn: $('copy-btn'),
  leaveBtn: $('leave-btn'),
  startBtn: $('start-btn'),
  playersStrip: $('players-strip'),
  gameLeaveBtn: $('game-leave-btn'),
  tableMessage: $('table-message'),
  leftEnd: $('left-end'),
  rightEnd: $('right-end'),
  sceneContainer: $('scene-container'),
  turnBanner: $('turn-banner'),
  passBtn: $('pass-btn'),
  sideChooser: $('side-chooser'),
  toast: $('toast'),
  resultOverlay: $('result-overlay'),
  resultBadge: $('result-badge'),
  resultTitle: $('result-title'),
  resultText: $('result-text'),
  resultPoints: $('result-points'),
  resultHands: $('result-hands'),
  nextRoundBtn: $('next-round-btn'),
  resultLeaveBtn: $('result-leave-btn'),
  resultHint: $('result-hint'),
};

let toastTimer = null;

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function saveSession(session) {
  state.session = session;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    /* ignore */
  }
}

function clearSession() {
  state.session = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    /* ignore */
  }
}

function showScreen(name) {
  els.lobby.classList.toggle('hidden', name !== 'lobby');
  els.room.classList.toggle('hidden', name !== 'room');
  els.game.classList.toggle('hidden', name !== 'game');
}

function toast(message, isError) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  els.toast.classList.toggle('error-toast', Boolean(isError));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 3200);
}

function setConnection(connected) {
  els.connection.textContent = connected ? 'Terhubung' : 'Terputus';
  els.connection.classList.toggle('pill-ok', connected);
  els.connection.classList.toggle('pill-bad', !connected);
  els.connection.classList.toggle('pill-wait', false);
}

function setLobbyStatus(message) {
  if (!message) {
    els.lobbyStatus.classList.add('hidden');
    els.lobbyStatus.textContent = '';
    return;
  }
  els.lobbyStatus.textContent = message;
  els.lobbyStatus.classList.remove('hidden');
}

function setLobbyError(message) {
  els.lobbyError.textContent = message || '';
}

function playerName() {
  return els.nameInput.value.replace(/\s+/g, ' ').trim();
}

function makeHalf(value) {
  const half = document.createElement('div');
  half.className = 'half';
  const active = new Set(PIP_LAYOUT[value] || []);
  for (let i = 0; i < 9; i += 1) {
    const cell = document.createElement('i');
    if (active.has(i)) cell.className = 'pip';
    half.appendChild(cell);
  }
  return half;
}

function makeTile(a, b, variant, extraClass) {
  const tile = document.createElement('div');
  tile.className = `tile ${variant || ''} ${extraClass || ''}`.trim();
  tile.appendChild(makeHalf(a));
  tile.appendChild(makeHalf(b));
  return tile;
}

function matchSides(tile, game) {
  return {
    canLeft: tile.a === game.leftEnd || tile.b === game.leftEnd,
    canRight: tile.a === game.rightEnd || tile.b === game.rightEnd,
  };
}

function isPlayable(tile, game) {
  if (game.board.length === 0) return tile.id === game.firstTileId;
  const { canLeft, canRight } = matchSides(tile, game);
  return canLeft || canRight;
}

function myTurn(game) {
  return Boolean(state.me && game.phase === 'playing' && game.turnId === state.me.playerId);
}

function renderRoom() {
  const room = state.room;
  if (!room) return;
  const myId = state.me ? state.me.playerId : null;

  els.roomCode.textContent = room.code;
  if (room.notice) {
    els.roomNotice.textContent = room.notice;
    els.roomNotice.classList.remove('hidden');
  } else {
    els.roomNotice.classList.add('hidden');
  }

  els.roomSeats.replaceChildren();
  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    const player = room.players[i];
    const seat = document.createElement('div');
    seat.className = `seat ${player ? 'filled' : 'empty'}`;

    const index = document.createElement('span');
    index.className = 'seat-index';
    index.textContent = i + 1;
    seat.appendChild(index);

    if (player) {
      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'seat-name';
      name.textContent = player.name;
      if (player.id === myId) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'Kamu';
        name.appendChild(tag);
      } else if (player.isHost) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'Host';
        name.appendChild(tag);
      }
      const sub = document.createElement('div');
      sub.className = 'seat-sub';
      sub.textContent = player.isHost ? `Host · ${player.score} poin` : `${player.score} poin`;
      info.appendChild(name);
      info.appendChild(sub);
      seat.appendChild(info);

      const dot = document.createElement('span');
      dot.className = `dot ${player.connected ? 'online' : 'offline'}`;
      dot.style.marginLeft = 'auto';
      seat.appendChild(dot);
    } else {
      const empty = document.createElement('span');
      empty.className = 'muted';
      empty.textContent = 'Menunggu pemain...';
      seat.appendChild(empty);
    }

    els.roomSeats.appendChild(seat);
  }

  const isHost = myId && room.hostId === myId;
  const allConnected = room.players.length === MAX_PLAYERS
    && room.players.every((player) => player.connected);

  els.startBtn.classList.toggle('hidden', !isHost || room.phase !== 'lobby');
  els.startBtn.disabled = !allConnected;
  els.startBtn.textContent = room.phase === 'finished' ? 'Ronde Berikutnya' : 'Mulai Game';

  if (room.players.length < MAX_PLAYERS) {
    els.roomHint.textContent = `Menunggu ${MAX_PLAYERS - room.players.length} pemain lagi...`;
  } else if (!allConnected) {
    els.roomHint.textContent = 'Menunggu semua pemain terhubung...';
  } else if (isHost) {
    els.roomHint.textContent = 'Semua pemain siap. Mulai game!';
  } else {
    els.roomHint.textContent = 'Menunggu host memulai game...';
  }

  showScreen('room');
}

function renderPlayersStrip(game) {
  els.playersStrip.replaceChildren();
  const sorted = game.players.slice();
  for (const player of sorted) {
    const card = document.createElement('div');
    card.className = 'player-card';
    if (player.id === game.turnId) card.classList.add('active');
    if (state.me && player.id === state.me.playerId) card.classList.add('you');
    if (!player.connected) card.classList.add('offline');

    const name = document.createElement('div');
    name.className = 'player-name';
    name.textContent = player.name;
    if (player.isHost) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'Host';
      name.appendChild(tag);
    }

    const meta = document.createElement('div');
    meta.className = 'player-meta';
    const count = document.createElement('span');
    count.textContent = `${player.count} kartu`;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `${player.score} pt`;
    meta.appendChild(count);
    meta.appendChild(score);

    card.appendChild(name);
    card.appendChild(meta);
    els.playersStrip.appendChild(card);
  }
}

function syncScene(game) {
  els.leftEnd.textContent = game.leftEnd === null ? '–' : game.leftEnd;
  els.rightEnd.textContent = game.rightEnd === null ? '–' : game.rightEnd;
  els.tableMessage.textContent = game.message || '';

  if (!state.scene) return;

  const interactive = myTurn(game);
  const playableIds = interactive
    ? game.hand.filter((tile) => isPlayable(tile, game)).map((tile) => tile.id)
    : [];

  state.scene.update({
    board: game.board,
    hand: game.hand,
    players: game.players,
    myId: state.me ? state.me.playerId : null,
    turnId: game.turnId,
    interactive,
    playableIds,
    selectedId: state.selectedId,
  });
}

function handleSceneTileClick(tileId) {
  const game = state.game;
  if (!game) return;
  const tile = game.hand.find((entry) => entry.id === tileId);
  if (tile) handleTileClick(tile, game);
}

function updateTurnBanner(game) {
  const banner = els.turnBanner;
  banner.classList.toggle('my-turn', myTurn(game));

  if (game.phase === 'finished') {
    banner.textContent = 'Ronde selesai';
    return;
  }
  if (myTurn(game)) {
    banner.textContent = 'Giliran kamu';
    return;
  }
  const current = game.players.find((player) => player.id === game.turnId);
  banner.textContent = current ? `Giliran ${current.name}` : 'Menunggu...';
}

function updateControls(game) {
  const turn = myTurn(game);
  const hasMove = game.hand.some((tile) => isPlayable(tile, game));
  const showPass = turn && !hasMove;
  els.passBtn.classList.toggle('hidden', !showPass);

  const chooserVisible = Boolean(state.selectedId) && turn;
  els.sideChooser.classList.toggle('hidden', !chooserVisible);
}

function renderResult(game) {
  const isFinished = game.phase === 'finished' && game.result;
  els.resultOverlay.classList.toggle('hidden', !isFinished);
  if (!isFinished) return;

  const result = game.result;
  const isHost = Boolean(state.room && state.me && state.room.hostId === state.me.playerId);

  els.resultBadge.textContent = result.type === 'empty' ? 'Kartu Habis' : 'Meja Terkunci';
  els.resultTitle.textContent = `${result.winnerName} menang!`;
  els.resultText.textContent = result.type === 'empty'
    ? 'Semua kartu di tangan lawan menjadi poin untuk pemenang.'
    : 'Tidak ada pemain yang bisa bermain. Pemain dengan sisa poin terendah menang.';
  els.resultPoints.textContent = `+${result.points} poin`;

  els.resultHands.replaceChildren();
  const hands = result.hands.slice().sort((x, y) => x.pips - y.pips);
  for (const hand of hands) {
    const row = document.createElement('div');
    row.className = 'result-row';
    if (hand.id === result.winnerId) row.classList.add('winner');

    const name = document.createElement('span');
    name.className = 'rname';
    name.textContent = hand.name;

    const pips = document.createElement('span');
    pips.className = 'rpips';
    pips.textContent = `${hand.pips} sisa`;

    const tiles = document.createElement('span');
    tiles.className = 'rtiles';
    for (const tile of hand.tiles) {
      const mini = makeTile(tile.a, tile.b, 'mini');
      tiles.appendChild(mini);
    }
    if (!hand.tiles.length) {
      const done = document.createElement('span');
      done.className = 'muted small';
      done.textContent = 'habis';
      tiles.appendChild(done);
    }

    row.appendChild(name);
    row.appendChild(pips);
    row.appendChild(tiles);
    els.resultHands.appendChild(row);
  }

  els.nextRoundBtn.classList.toggle('hidden', !isHost);
  els.resultHint.textContent = isHost
    ? 'Kamu host. Mulai ronde berikutnya saat semua pemain siap.'
    : 'Menunggu host memulai ronde berikutnya...';
}

function renderGame() {
  const game = state.game;
  if (!game) return;

  renderPlayersStrip(game);
  syncScene(game);
  updateTurnBanner(game);
  updateControls(game);
  renderResult(game);
  showScreen('game');
}

function handleTileClick(tile, game) {
  if (!myTurn(game) || game.phase !== 'playing') return;

  if (game.board.length === 0) {
    playTile(tile.id, null);
    return;
  }

  const { canLeft, canRight } = matchSides(tile, game);
  if (!canLeft && !canRight) return;

  if (canLeft && canRight) {
    state.selectedId = tile.id;
    renderGame();
    return;
  }

  playTile(tile.id, canLeft ? 'left' : 'right');
}

function playTile(tileId, side) {
  state.selectedId = null;
  state.socket.emit('game:play', { tileId, side }, (response) => {
    if (!response || !response.ok) {
      toast((response && response.error) || 'Gagal memainkan kartu', true);
    }
  });
}

function leaveRoom() {
  state.socket.emit('room:leave');
  clearSession();
  state.me = null;
  state.room = null;
  state.game = null;
  state.selectedId = null;
  if (state.scene) state.scene.clear();
  els.resultOverlay.classList.add('hidden');
  setLobbyStatus('');
  setLobbyError('');
  showScreen('lobby');
}

function createRoom() {
  const name = playerName();
  if (!name) {
    setLobbyError('Masukkan nama dulu ya.');
    els.nameInput.focus();
    return;
  }
  localStorage.setItem(NAME_KEY, name);
  setLobbyError('');
  state.socket.emit('room:create', { name }, (response) => {
    if (!response || !response.ok) {
      setLobbyError((response && response.error) || 'Gagal membuat room');
      return;
    }
    state.me = {
      playerId: response.playerId,
      token: response.token,
      name: response.name,
      code: response.code,
    };
    saveSession({ code: response.code, token: response.token });
    setLobbyStatus('');
  });
}

function joinRoom() {
  const name = playerName();
  const code = els.codeInput.value.trim().toUpperCase();
  if (!name) {
    setLobbyError('Masukkan nama dulu ya.');
    els.nameInput.focus();
    return;
  }
  if (code.length < 4) {
    setLobbyError('Masukkan kode room yang benar.');
    els.codeInput.focus();
    return;
  }
  localStorage.setItem(NAME_KEY, name);
  setLobbyError('');
  state.socket.emit('room:join', { name, code }, (response) => {
    if (!response || !response.ok) {
      setLobbyError((response && response.error) || 'Gagal masuk room');
      return;
    }
    state.me = {
      playerId: response.playerId,
      token: response.token,
      name: response.name,
      code: response.code,
    };
    saveSession({ code: response.code, token: response.token });
    setLobbyStatus('');
  });
}

function tryRejoin() {
  if (!state.session || state.rejoinPending) return;
  state.rejoinPending = true;
  setLobbyStatus(`Menyambung kembali ke room ${state.session.code}...`);
  state.socket.emit('room:rejoin', state.session, (response) => {
    state.rejoinPending = false;
    if (!response || !response.ok) {
      clearSession();
      state.me = null;
      showScreen('lobby');
      setLobbyStatus('Sesi sebelumnya tidak tersedia.');
      return;
    }
    state.me = {
      playerId: response.playerId,
      token: response.token,
      name: response.name,
      code: response.code,
    };
    saveSession({ code: response.code, token: response.token });
    setLobbyStatus('');
  });
}

function handleConnect() {
  setConnection(true);
  tryRejoin();
}

function init() {
  const savedName = localStorage.getItem(NAME_KEY);
  if (savedName) els.nameInput.value = savedName;

  state.session = readSession();
  state.socket = io();

  try {
    state.scene = new DominoScene(els.sceneContainer, handleSceneTileClick);
  } catch (error) {
    console.error('Gagal memuat tampilan 3D:', error);
    toast('Tampilan 3D tidak dapat dimuat di browser ini.', true);
  }

  state.socket.on('connect', handleConnect);
  state.socket.on('disconnect', () => {
    setConnection(false);
    state.rejoinPending = false;
  });

  state.socket.on('room:state', (room) => {
    state.room = room;
    if (!room) return;
    if (!state.me && state.session) {
      const me = room.players.find((player) => player.id === state.session.playerId);
      if (me) {
        state.me = {
          playerId: me.id,
          token: state.session.token,
          name: me.name,
          code: room.code,
        };
      }
    }
    if (room.phase === 'lobby') {
      state.game = null;
      state.selectedId = null;
      els.resultOverlay.classList.add('hidden');
      if (state.scene) state.scene.clear();
      renderRoom();
    }
  });

  state.socket.on('game:state', (game) => {
    state.game = game;
    renderGame();
  });

  els.createBtn.addEventListener('click', createRoom);
  els.joinBtn.addEventListener('click', joinRoom);
  els.nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') createRoom();
  });
  els.codeInput.addEventListener('input', () => {
    els.codeInput.value = els.codeInput.value.toUpperCase();
  });
  els.codeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') joinRoom();
  });

  els.copyBtn.addEventListener('click', async () => {
    if (!state.room) return;
    try {
      await navigator.clipboard.writeText(state.room.code);
      toast('Kode room disalin');
    } catch (error) {
      toast(`Kode room: ${state.room.code}`);
    }
  });

  els.leaveBtn.addEventListener('click', leaveRoom);
  els.gameLeaveBtn.addEventListener('click', leaveRoom);
  els.resultLeaveBtn.addEventListener('click', leaveRoom);

  els.startBtn.addEventListener('click', () => {
    state.socket.emit('game:start', {}, (response) => {
      if (!response || !response.ok) {
        toast((response && response.error) || 'Gagal memulai game', true);
      }
    });
  });

  els.nextRoundBtn.addEventListener('click', () => {
    state.socket.emit('game:start', {}, (response) => {
      if (!response || !response.ok) {
        toast((response && response.error) || 'Gagal memulai ronde', true);
      }
    });
  });

  els.passBtn.addEventListener('click', () => {
    state.selectedId = null;
    state.socket.emit('game:pass', {}, (response) => {
      if (!response || !response.ok) {
        toast((response && response.error) || 'Gagal melewati giliran', true);
      }
    });
  });

  els.sideChooser.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-side]');
    if (!button) return;
    const side = button.dataset.side;
    if (side === 'cancel') {
      state.selectedId = null;
      renderGame();
      return;
    }
    if (!state.selectedId) return;
    const tileId = state.selectedId;
    playTile(tileId, side);
  });

  showScreen('lobby');
  if (state.session) {
    setLobbyStatus(`Menghubungkan ke room ${state.session.code}...`);
  }
  if (state.socket.connected) handleConnect();
}

init();
