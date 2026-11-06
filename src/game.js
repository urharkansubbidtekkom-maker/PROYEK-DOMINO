'use strict';

const TILES_PER_PLAYER = 7;
const PLAYER_COUNT = 4;
const DOUBLE_VALUES = [6, 5, 4, 3, 2, 1, 0];

class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

function buildDeck() {
  const deck = [];
  for (let a = 0; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) {
      deck.push({ id: `${a}-${b}`, a, b, pips: a + b });
    }
  }
  return deck;
}

function shuffle(items, rng) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function byPipsDesc(x, y) {
  return (y.pips - x.pips) || (y.a - x.a) || (y.b - x.b);
}

function handPips(player) {
  return player.hand.reduce((total, tile) => total + tile.pips, 0);
}

class DominoGame {
  constructor(players, options = {}) {
    if (!Array.isArray(players) || players.length !== PLAYER_COUNT) {
      throw new GameError('Game membutuhkan tepat 4 pemain');
    }
    const rng = typeof options.rng === 'function' ? options.rng : Math.random;
    this.players = players.map((player) => ({
      id: player.id,
      name: player.name,
      hand: [],
    }));
    this.phase = 'playing';
    this.board = [];
    this.leftEnd = null;
    this.rightEnd = null;
    this.turnIndex = 0;
    this.passes = 0;
    this.lastPlayedBy = null;
    this.firstTileId = null;
    this.result = null;
    this.message = '';
    this.deal(rng, options.deck);
  }

  deal(rng, deckOverride) {
    let deck;
    if (Array.isArray(deckOverride)) {
      if (deckOverride.length !== 28) {
        throw new GameError('Deck harus berisi 28 kartu');
      }
      deck = deckOverride.map((tile) => ({ ...tile }));
    } else {
      deck = shuffle(buildDeck(), rng);
    }

    this.players.forEach((player, index) => {
      player.hand = deck
        .slice(index * TILES_PER_PLAYER, index * TILES_PER_PLAYER + TILES_PER_PLAYER)
        .sort(byPipsDesc);
    });

    let starterIndex = 0;
    let starterTile = null;
    for (const value of DOUBLE_VALUES) {
      const id = `${value}-${value}`;
      const found = this.players.findIndex((player) =>
        player.hand.some((tile) => tile.id === id),
      );
      if (found !== -1) {
        starterIndex = found;
        starterTile = id;
        break;
      }
    }

    this.turnIndex = starterIndex;
    this.firstTileId = starterTile;
    const starter = this.players[starterIndex];
    this.message = `${starter.name} memulai dengan kartu ${starterTile}.`;
  }

  get currentPlayer() {
    return this.players[this.turnIndex];
  }

  getPlayer(playerId) {
    return this.players.find((player) => player.id === playerId) || null;
  }

  playerHasMove(player) {
    if (!player) return false;
    if (this.board.length === 0) {
      return player.hand.some((tile) => tile.id === this.firstTileId);
    }
    return player.hand.some(
      (tile) => tile.a === this.leftEnd
        || tile.b === this.leftEnd
        || tile.a === this.rightEnd
        || tile.b === this.rightEnd,
    );
  }

  matchSides(tile) {
    if (this.board.length === 0) {
      return { canLeft: false, canRight: false };
    }
    return {
      canLeft: tile.a === this.leftEnd || tile.b === this.leftEnd,
      canRight: tile.a === this.rightEnd || tile.b === this.rightEnd,
    };
  }

  play(playerId, tileId, side) {
    if (this.phase !== 'playing') {
      throw new GameError('Ronde sudah selesai');
    }
    const player = this.currentPlayer;
    if (!player || player.id !== playerId) {
      throw new GameError('Bukan giliran Anda');
    }
    const tileIndex = player.hand.findIndex((tile) => tile.id === tileId);
    if (tileIndex === -1) {
      throw new GameError('Kartu itu tidak ada di tangan Anda');
    }
    const tile = player.hand[tileIndex];
    let placedSide = null;

    if (this.board.length === 0) {
      if (this.firstTileId && tile.id !== this.firstTileId) {
        throw new GameError(`Kartu pertama harus ${this.firstTileId}`);
      }
      this.board.push({
        ...tile,
        left: tile.a,
        right: tile.b,
        double: tile.a === tile.b,
        playerId: player.id,
      });
      this.leftEnd = tile.a;
      this.rightEnd = tile.b;
    } else {
      const { canLeft, canRight } = this.matchSides(tile);
      if (!canLeft && !canRight) {
        throw new GameError('Kartu tidak cocok dengan ujung meja');
      }

      let chosen = side === 'left' || side === 'right' ? side : null;
      if (chosen === 'left' && !canLeft) chosen = null;
      if (chosen === 'right' && !canRight) chosen = null;
      if (!chosen) {
        if (canLeft && canRight) {
          throw new GameError('Kartu cocok di dua sisi, pilih kiri atau kanan');
        }
        chosen = canLeft ? 'left' : 'right';
      }

      if (chosen === 'left') {
        const matchesLeftA = tile.a === this.leftEnd;
        const outer = matchesLeftA ? tile.b : tile.a;
        const match = matchesLeftA ? tile.a : tile.b;
        this.board.unshift({
          ...tile,
          left: outer,
          right: match,
          double: tile.a === tile.b,
          playerId: player.id,
        });
        this.leftEnd = outer;
      } else {
        const matchesRightA = tile.a === this.rightEnd;
        const outer = matchesRightA ? tile.b : tile.a;
        const match = matchesRightA ? tile.a : tile.b;
        this.board.push({
          ...tile,
          left: match,
          right: outer,
          double: tile.a === tile.b,
          playerId: player.id,
        });
        this.rightEnd = outer;
      }
      placedSide = chosen;
    }

    player.hand.splice(tileIndex, 1);
    this.passes = 0;
    this.lastPlayedBy = player.id;
    this.message = `${player.name} memainkan ${tile.a}-${tile.b}${placedSide ? ` di ${placedSide === 'left' ? 'kiri' : 'kanan'}` : ''}.`;

    if (player.hand.length === 0) {
      this.finish('empty', player);
    } else {
      this.advanceTurn();
    }
  }

  pass(playerId) {
    if (this.phase !== 'playing') {
      throw new GameError('Ronde sudah selesai');
    }
    const player = this.currentPlayer;
    if (!player || player.id !== playerId) {
      throw new GameError('Bukan giliran Anda');
    }
    if (this.playerHasMove(player)) {
      throw new GameError('Anda masih punya kartu yang bisa dimainkan');
    }

    this.passes += 1;
    this.message = `${player.name} tidak punya kartu yang cocok dan melewati giliran.`;

    if (this.passes >= PLAYER_COUNT) {
      this.finishBlocked();
      return;
    }
    this.advanceTurn();
  }

  advanceTurn() {
    this.turnIndex = (this.turnIndex + 1) % PLAYER_COUNT;
  }

  finish(type, winner) {
    const points = this.players.reduce(
      (total, player) => (player.id === winner.id ? total : total + handPips(player)),
      0,
    );
    this.phase = 'finished';
    this.turnIndex = this.players.findIndex((player) => player.id === winner.id);
    this.result = {
      type,
      winnerId: winner.id,
      winnerName: winner.name,
      points,
      hands: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        pips: handPips(player),
        tiles: player.hand.map((tile) => ({ id: tile.id, a: tile.a, b: tile.b })),
      })),
    };

    if (type === 'empty') {
      this.message = `${winner.name} menghabiskan kartu dan menang! +${points} poin.`;
    } else {
      this.message = `Permainan terkunci. ${winner.name} menang dengan sisa ${handPips(winner)} poin. +${points} poin.`;
    }
  }

  finishBlocked() {
    const sorted = this.players
      .slice()
      .sort((x, y) => handPips(x) - handPips(y));
    this.finish('blocked', sorted[0]);
  }

  getState(forPlayerId) {
    const me = this.getPlayer(forPlayerId);
    return {
      phase: this.phase,
      board: this.board.map((tile) => ({
        id: tile.id,
        left: tile.left,
        right: tile.right,
        double: tile.double,
        playerId: tile.playerId,
      })),
      leftEnd: this.leftEnd,
      rightEnd: this.rightEnd,
      turnId: this.phase === 'playing' ? this.currentPlayer.id : null,
      passes: this.passes,
      lastPlayedBy: this.lastPlayedBy,
      firstTileId: this.firstTileId,
      message: this.message,
      result: this.result,
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        count: player.hand.length,
        pips: this.phase === 'finished' ? handPips(player) : null,
      })),
      hand: me
        ? me.hand.map((tile) => ({ id: tile.id, a: tile.a, b: tile.b }))
        : [],
    };
  }
}

module.exports = {
  DominoGame,
  GameError,
  buildDeck,
  handPips,
  PLAYER_COUNT,
  TILES_PER_PLAYER,
};
