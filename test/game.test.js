'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DominoGame, GameError, buildDeck } = require('../src/game');

const PLAYERS = [
  { id: 'a', name: 'Ani' },
  { id: 'b', name: 'Budi' },
  { id: 'c', name: 'Cici' },
  { id: 'd', name: 'Dedi' },
];

const HANDS = [
  ['6-6', '5-6', '4-6', '3-6', '2-6', '1-6', '0-6'],
  ['5-5', '4-5', '3-5', '2-5', '1-5', '0-5', '4-4'],
  ['3-4', '2-4', '1-4', '0-4', '3-3', '2-3', '1-3'],
  ['0-3', '2-2', '1-2', '0-2', '1-1', '0-1', '0-0'],
];

function tile(id) {
  const [x, y] = id.split('-').map(Number);
  const a = Math.min(x, y);
  const b = Math.max(x, y);
  return { id: `${a}-${b}`, a, b, pips: a + b };
}

function deckFromHands(hands) {
  const all = buildDeck();
  const lookup = new Map(all.map((entry) => [entry.id, entry]));
  const used = new Set();
  const ordered = [];
  for (const hand of hands) {
    for (const id of hand) {
      assert.ok(lookup.has(id), `kartu tidak dikenal: ${id}`);
      assert.ok(!used.has(id), `kartu duplikat: ${id}`);
      used.add(id);
      ordered.push({ ...lookup.get(id) });
    }
  }
  for (const entry of all) {
    if (!used.has(entry.id)) ordered.push({ ...entry });
  }
  return ordered;
}

function makeGame(hands) {
  return new DominoGame(PLAYERS, { deck: deckFromHands(hands) });
}

function overrideHands(game, hands) {
  game.players.forEach((player, index) => {
    player.hand = hands[index].map((id) => tile(id));
  });
}

test('deck berisi 28 kartu unik', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 28);
  assert.equal(new Set(deck.map((entry) => entry.id)).size, 28);
});

test('pembagian kartu dan penentuan pemain pembuka', () => {
  const game = makeGame(HANDS);
  for (const player of game.players) {
    assert.equal(player.hand.length, 7);
  }
  assert.equal(game.firstTileId, '6-6');
  assert.equal(game.phase, 'playing');
  assert.equal(game.players[game.turnIndex].id, 'a');
});

test('pemilik 6-6 selalu menjadi pembuka meskipun posisinya berbeda', () => {
  const game = makeGame([HANDS[2], HANDS[3], HANDS[0], HANDS[1]]);
  assert.equal(game.firstTileId, '6-6');
  assert.equal(game.players[game.turnIndex].id, 'c');
});

test('kartu pertama wajib 6-6 dan giliran divalidasi', () => {
  const game = makeGame(HANDS);
  assert.throws(() => game.play('a', '5-6'), GameError);
  assert.match(
    (() => {
      try {
        game.play('a', '5-6');
      } catch (error) {
        return error.message;
      }
      return '';
    })(),
    /6-6/,
  );

  game.play('a', '6-6');
  assert.equal(game.board.length, 1);
  assert.equal(game.leftEnd, 6);
  assert.equal(game.rightEnd, 6);
  assert.equal(game.currentPlayer.id, 'b');

  assert.throws(() => game.play('a', '5-6'), /Bukan giliran/);
  assert.throws(() => game.play('b', '5-5'), /tidak cocok/);
});

test('kartu yang cocok di dua ujung harus memilih sisi', () => {
  const game = makeGame(HANDS);
  game.play('a', '6-6');
  game.pass('b');
  game.pass('c');
  game.pass('d');
  assert.equal(game.currentPlayer.id, 'a');
  assert.equal(game.passes, 3);

  assert.throws(() => game.play('a', '5-6'), /kiri atau kanan/);

  game.play('a', '5-6', 'left');
  assert.equal(game.leftEnd, 5);
  assert.equal(game.rightEnd, 6);
  assert.deepEqual(
    { left: game.board[0].left, right: game.board[0].right },
    { left: 5, right: 6 },
  );

  assert.equal(game.currentPlayer.id, 'b');
  game.play('b', '5-5', 'left');
  assert.equal(game.leftEnd, 5);
  assert.deepEqual(
    { left: game.board[0].left, right: game.board[0].right },
    { left: 5, right: 5 },
  );
});

test('pass hanya boleh saat tidak ada kartu yang cocok', () => {
  const game = makeGame(HANDS);
  game.play('a', '6-6');
  assert.throws(() => game.pass('a'), /Bukan giliran/);

  game.pass('b');
  assert.equal(game.passes, 1);
  assert.equal(game.currentPlayer.id, 'c');

  game.pass('c');
  game.pass('d');
  assert.equal(game.currentPlayer.id, 'a');
  assert.throws(() => game.pass('a'), /masih punya kartu/i);
});

test('ronde terkunci memilih pemain dengan sisa poin terendah', () => {
  const game = makeGame(HANDS);
  game.board = [{ id: '6-0', left: 6, right: 0, double: false, playerId: 'd' }];
  game.leftEnd = 6;
  game.rightEnd = 0;
  game.turnIndex = 0;
  overrideHands(game, [['1-1'], ['2-2'], ['3-3'], ['4-4']]);

  game.pass('a');
  game.pass('b');
  game.pass('c');
  assert.equal(game.phase, 'playing');

  game.pass('d');
  assert.equal(game.phase, 'finished');
  assert.equal(game.result.type, 'blocked');
  assert.equal(game.result.winnerId, 'a');
  assert.equal(game.result.points, 18);
  assert.equal(game.result.hands.find((hand) => hand.id === 'd').pips, 8);
});

test('pemain yang menghabiskan kartu langsung menang', () => {
  const game = makeGame(HANDS);
  game.board = [{ id: '6-6', left: 6, right: 6, double: true, playerId: 'd' }];
  game.leftEnd = 6;
  game.rightEnd = 6;
  game.turnIndex = 0;
  overrideHands(game, [['1-6'], ['0-1', '2-2'], ['3-3'], ['4-4']]);

  game.play('a', '1-6', 'right');
  assert.equal(game.phase, 'finished');
  assert.equal(game.result.type, 'empty');
  assert.equal(game.result.winnerId, 'a');
  assert.equal(game.result.points, 19);
  assert.equal(game.rightEnd, 1);
});

test('state hanya membuka tangan pemain yang meminta', () => {
  const game = makeGame(HANDS);
  const state = game.getState('b');
  assert.equal(state.hand.length, 7);
  assert.deepEqual(
    state.hand.map((entry) => entry.id).sort(),
    HANDS[1].slice().sort(),
  );
  assert.equal(state.players.find((player) => player.id === 'a').count, 7);
});

test('pemain lain tidak bisa memainkan kartu milik orang lain', () => {
  const game = makeGame(HANDS);
  game.play('a', '6-6');
  assert.throws(() => game.play('b', '5-6'), /tidak ada di tangan|Bukan giliran/);
});
