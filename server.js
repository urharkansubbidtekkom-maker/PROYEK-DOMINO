'use strict';

const path = require('path');
const http = require('http');
const { randomUUID } = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { DominoGame } = require('./src/game');

const PORT = Number(process.env.PORT) || 3000;
const ROOM_CAPACITY = 4;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AUTO_PASS_DELAY = 1600;
const FINISHED_CLEANUP_DELAY = 20 * 1000;
const ROOM_IDLE_TTL = 30 * 60 * 1000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/three/addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));

const rooms = new Map();

function cleanName(name) {
  const cleaned = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return cleaned || 'Pemain';
}

function makeRoomCode() {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i += 1) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function makePlayer(name, socketId) {
  return {
    id: randomUUID(),
    token: randomUUID(),
    name: cleanName(name),
    socketId,
    connected: true,
    score: 0,
  };
}

function socketFor(player) {
  return io.sockets.sockets.get(player.socketId);
}

function roomState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.game ? room.game.phase : 'lobby',
    notice: room.notice || '',
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      score: player.score,
      isHost: player.id === room.hostId,
    })),
  };
}

function gameState(room, player) {
  const game = room.game;
  if (!game) return null;
  const state = game.getState(player.id);
  const gamePlayers = new Map(state.players.map((entry) => [entry.id, entry]));
  state.roomCode = room.code;
  state.players = room.players.map((entry) => {
    const gameEntry = gamePlayers.get(entry.id) || {};
    return {
      id: entry.id,
      name: entry.name,
      count: gameEntry.count || 0,
      pips: gameEntry.pips === undefined ? null : gameEntry.pips,
      connected: entry.connected,
      score: entry.score,
      isHost: entry.id === room.hostId,
    };
  });
  return state;
}

function broadcastRoom(room) {
  room.updatedAt = Date.now();
  const roomView = roomState(room);
  for (const player of room.players) {
    const socket = socketFor(player);
    if (!socket) continue;
    socket.emit('room:state', roomView);
    if (room.game) {
      socket.emit('game:state', gameState(room, player));
    }
  }
}

function maybeApplyResult(room) {
  const game = room.game;
  if (!game || game.phase !== 'finished' || !game.result || game.result.awarded) {
    return;
  }
  game.result.awarded = true;
  const winner = room.players.find((player) => player.id === game.result.winnerId);
  if (winner) {
    winner.score += game.result.points;
  }
}

function clearAutoPass(room) {
  if (room.autoPassTimer) {
    clearTimeout(room.autoPassTimer);
    room.autoPassTimer = null;
  }
}

function autoMoveFor(game) {
  const player = game.currentPlayer;
  if (!player) return null;
  if (game.board.length === 0) {
    const tile = player.hand.find((entry) => entry.id === game.firstTileId);
    return tile ? { tileId: tile.id, side: null } : null;
  }
  for (const tile of player.hand) {
    const { canLeft, canRight } = game.matchSides(tile);
    if (canLeft) return { tileId: tile.id, side: 'left' };
    if (canRight) return { tileId: tile.id, side: 'right' };
  }
  return null;
}

function scheduleAutoPass(room) {
  clearAutoPass(room);
  const game = room.game;
  if (!game || game.phase !== 'playing') return;
  const current = game.currentPlayer;
  const player = room.players.find((entry) => entry.id === current.id);
  if (!player || player.connected) return;

  room.autoPassTimer = setTimeout(() => {
    room.autoPassTimer = null;
    const activeGame = room.game;
    if (!activeGame || activeGame.phase !== 'playing') return;
    if (activeGame.currentPlayer.id !== current.id) return;
    const activePlayer = room.players.find((entry) => entry.id === current.id);
    if (!activePlayer || activePlayer.connected) return;

    try {
      const move = autoMoveFor(activeGame);
      if (move) {
        activeGame.play(activePlayer.id, move.tileId, move.side);
      } else {
        activeGame.pass(activePlayer.id);
      }
    } catch (error) {
      return;
    }
    maybeApplyResult(room);
    broadcastRoom(room);
    scheduleAutoPass(room);
  }, AUTO_PASS_DELAY);
}

function scheduleFinishedCleanup(room, player) {
  clearTimeout(player.removeTimer);
  player.removeTimer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    if (player.connected) return;
    if (room.game && room.game.phase === 'playing') return;
    removePlayer(room, player);
  }, FINISHED_CLEANUP_DELAY);
}

function removePlayer(room, player) {
  clearTimeout(player.removeTimer);
  room.players = room.players.filter((entry) => entry.id !== player.id);
  if (room.hostId === player.id && room.players.length > 0) {
    room.hostId = room.players[0].id;
  }
  if (room.players.length === 0) {
    clearAutoPass(room);
    rooms.delete(room.code);
    return;
  }
  if (room.game && room.game.phase === 'playing') {
    room.game = null;
    clearAutoPass(room);
    room.notice = `${player.name} keluar. Permainan dihentikan.`;
  }
  broadcastRoom(room);
}

function contextFor(socket) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) return null;
  const player = room.players.find((entry) => entry.id === socket.data.playerId);
  if (!player) return null;
  return { room, player };
}

function attachPlayer(socket, room, player) {
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
}

function makeAck(callback) {
  return typeof callback === 'function' ? callback : () => {};
}

io.on('connection', (socket) => {
  socket.on('room:create', (payload, callback) => {
    const ack = makeAck(callback);
    if (socket.data.roomCode) {
      ack({ ok: false, error: 'Anda sudah berada di dalam room' });
      return;
    }
    const player = makePlayer(payload && payload.name, socket.id);
    const room = {
      code: makeRoomCode(),
      hostId: player.id,
      players: [player],
      game: null,
      notice: '',
      autoPassTimer: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    rooms.set(room.code, room);
    attachPlayer(socket, room, player);
    ack({
      ok: true,
      code: room.code,
      playerId: player.id,
      token: player.token,
      name: player.name,
    });
    broadcastRoom(room);
  });

  socket.on('room:join', (payload, callback) => {
    const ack = makeAck(callback);
    if (socket.data.roomCode) {
      ack({ ok: false, error: 'Anda sudah berada di dalam room' });
      return;
    }
    const code = String((payload && payload.code) || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      ack({ ok: false, error: 'Room tidak ditemukan' });
      return;
    }
    if (room.players.length >= ROOM_CAPACITY) {
      ack({ ok: false, error: 'Room sudah penuh (4 pemain)' });
      return;
    }
    if (room.game && room.game.phase === 'playing') {
      ack({ ok: false, error: 'Game sedang berlangsung di room ini' });
      return;
    }

    const player = makePlayer(payload && payload.name, socket.id);
    room.players.push(player);
    room.notice = '';
    attachPlayer(socket, room, player);
    ack({
      ok: true,
      code: room.code,
      playerId: player.id,
      token: player.token,
      name: player.name,
    });
    broadcastRoom(room);
  });

  socket.on('room:rejoin', (payload, callback) => {
    const ack = makeAck(callback);
    const code = String((payload && payload.code) || '').trim().toUpperCase();
    const token = String((payload && payload.token) || '');
    const room = rooms.get(code);
    if (!room) {
      ack({ ok: false, error: 'Room sudah tidak tersedia' });
      return;
    }
    const player = room.players.find((entry) => entry.token === token);
    if (!player) {
      ack({ ok: false, error: 'Sesi pemain tidak ditemukan' });
      return;
    }

    if (player.socketId && player.socketId !== socket.id) {
      const previous = io.sockets.sockets.get(player.socketId);
      if (previous) {
        previous.data = {};
        previous.leave(room.code);
      }
    }

    clearTimeout(player.removeTimer);
    player.socketId = socket.id;
    player.connected = true;
    room.notice = '';
    attachPlayer(socket, room, player);
    ack({
      ok: true,
      code: room.code,
      playerId: player.id,
      token: player.token,
      name: player.name,
    });
    broadcastRoom(room);
    scheduleAutoPass(room);
  });

  socket.on('room:leave', () => {
    const context = contextFor(socket);
    if (!context) return;
    socket.leave(context.room.code);
    socket.data = {};
    removePlayer(context.room, context.player);
  });

  socket.on('game:start', (payload, callback) => {
    const ack = makeAck(callback);
    const context = contextFor(socket);
    if (!context) {
      ack({ ok: false, error: 'Anda tidak berada di dalam room' });
      return;
    }
    const { room, player } = context;
    if (room.hostId !== player.id) {
      ack({ ok: false, error: 'Hanya host yang bisa memulai game' });
      return;
    }
    if (room.game && room.game.phase === 'playing') {
      ack({ ok: false, error: 'Game sedang berlangsung' });
      return;
    }
    if (room.players.length !== ROOM_CAPACITY) {
      ack({ ok: false, error: 'Butuh tepat 4 pemain untuk mulai' });
      return;
    }
    if (room.players.some((entry) => !entry.connected)) {
      ack({ ok: false, error: 'Semua pemain harus terhubung' });
      return;
    }

    room.game = new DominoGame(
      room.players.map((entry) => ({ id: entry.id, name: entry.name })),
    );
    room.notice = '';
    ack({ ok: true });
    broadcastRoom(room);
    scheduleAutoPass(room);
  });

  socket.on('game:play', (payload, callback) => {
    const ack = makeAck(callback);
    const context = contextFor(socket);
    if (!context) {
      ack({ ok: false, error: 'Anda tidak berada di dalam room' });
      return;
    }
    const { room, player } = context;
    if (!room.game || room.game.phase !== 'playing') {
      ack({ ok: false, error: 'Game belum berjalan' });
      return;
    }
    const tileId = String((payload && payload.tileId) || '');
    let side = payload && payload.side;
    if (side !== 'left' && side !== 'right') side = null;

    try {
      room.game.play(player.id, tileId, side);
    } catch (error) {
      ack({ ok: false, error: error.message });
      return;
    }
    maybeApplyResult(room);
    ack({ ok: true });
    broadcastRoom(room);
    scheduleAutoPass(room);
  });

  socket.on('game:pass', (payload, callback) => {
    const ack = makeAck(callback);
    const context = contextFor(socket);
    if (!context) {
      ack({ ok: false, error: 'Anda tidak berada di dalam room' });
      return;
    }
    const { room, player } = context;
    if (!room.game || room.game.phase !== 'playing') {
      ack({ ok: false, error: 'Game belum berjalan' });
      return;
    }

    try {
      room.game.pass(player.id);
    } catch (error) {
      ack({ ok: false, error: error.message });
      return;
    }
    maybeApplyResult(room);
    ack({ ok: true });
    broadcastRoom(room);
    scheduleAutoPass(room);
  });

  socket.on('disconnect', () => {
    const context = contextFor(socket);
    if (!context) return;
    const { room, player } = context;
    if (player.socketId !== socket.id) return;
    player.connected = false;

    if (room.game && room.game.phase === 'playing') {
      broadcastRoom(room);
      scheduleAutoPass(room);
      return;
    }
    if (!room.game) {
      removePlayer(room, player);
      return;
    }
    broadcastRoom(room);
    scheduleFinishedCleanup(room, player);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = now - (room.updatedAt || room.createdAt);
    const everyoneGone = room.players.every((player) => !player.connected);
    if (everyoneGone && idle > ROOM_IDLE_TTL) {
      clearAutoPass(room);
      room.players.forEach((player) => clearTimeout(player.removeTimer));
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Domino online berjalan di http://localhost:${PORT}`);
});
