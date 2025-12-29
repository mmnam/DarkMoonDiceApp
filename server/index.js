const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Dark Moon Dice server running');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => console.log(`Server on ${PORT}`));


const DICE_FACES = {
  black: [4, 2, -2, -2, -2, 1],
  red: [3, 1, -2, -2, -2, -1],
  blue: [5, 3, -1, -2, -2, -2],
  yellow: [0, -1, -1, -2, -2, -3],
};

const ACTIONS = [
  'actions.repairShields',
  'actions.repairOutpost',
  'actions.repairLifeSupport',
  'actions.loneWolf',
];

const rooms = new Map();

function getRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      players: new Map(),
      feed: [],
      rolls: new Map(),
    });
  }
  return rooms.get(roomCode);
}

function pushFeed(roomCode, entry) {
  const room = getRoom(roomCode);
  room.feed.push(entry);
  if (room.feed.length > 200) {
    room.feed.shift();
  }
  io.to(roomCode).emit('feed_entry', entry);
}

function rollDie(color) {
  const faces = DICE_FACES[color];
  const idx = Math.floor(Math.random() * faces.length);
  return faces[idx];
}

function readDieCounts(diceCounts) {
  const counts = {};
  for (const color of ['black', 'red', 'blue']) {
    const value = Number(diceCounts[color] || 0);
    if (!Number.isInteger(value) || value < 0) {
      return null;
    }
    counts[color] = value;
  }
  return counts;
}

io.on('connection', (socket) => {
  socket.on('join_room', (payload) => {
    const roomCode = String(payload.roomCode || '').trim().toUpperCase();
    const playerName = String(payload.playerName || '').trim();

    if (!roomCode || !playerName) {
      socket.emit('join_error', {
        message: 'Room code and player name are required.',
      });
      return;
    }

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.playerName = playerName;

    const room = getRoom(roomCode);
    room.players.set(socket.id, playerName);

    socket.emit('room_joined', {
      roomCode,
      playerName,
      feed: room.feed,
    });

    const entry = {
      id: randomUUID(),
      type: 'JOINED',
      playerName,
      ts: Date.now(),
    };
    pushFeed(roomCode, entry);
  });

  socket.on('roll_request', (payload) => {
    const roomCode = socket.data.roomCode;
    const playerName = socket.data.playerName;

    if (!roomCode || !playerName) {
      socket.emit('roll_error', { message: 'Join a room first.', section: payload.section });
      return;
    }

    const section = payload.section;
    let diceList = [];
    let actionType = payload.actionType;

    if (section === 'action') {
      const diceCounts = readDieCounts(payload.diceCounts || {});
      if (!diceCounts) {
        socket.emit('roll_error', { message: 'Dice counts must be 0 or higher.', section });
        return;
      }
      if (!ACTIONS.includes(actionType)) {
        socket.emit('roll_error', { message: 'Select a valid action.', section });
        return;
      }
      const total = ['black', 'red', 'blue'].reduce(
        (sum, color) => sum + Number(diceCounts[color] || 0),
        0
      );

      if (total < 1 || total > 3) {
        socket.emit('roll_error', {
          message: 'Action rolls must use 1 to 3 dice total.',
          section,
        });
        return;
      }

      ['black', 'red', 'blue'].forEach((color) => {
        const count = Number(diceCounts[color] || 0);
        for (let i = 0; i < count; i += 1) {
          diceList.push(color);
        }
      });
    } else if (section === 'corp') {
      const diceCount = Number(payload.diceCount || 0);
      if (!Number.isInteger(diceCount) || ![2, 3].includes(diceCount)) {
        socket.emit('roll_error', {
          message: 'Corp rolls must be 2 or 3 yellow dice.',
          section,
        });
        return;
      }
      diceList = Array.from({ length: diceCount }, () => 'yellow');
      actionType = 'corp yellow';
    } else if (section === 'task') {
      const diceCounts = readDieCounts(payload.diceCounts || {});
      if (!diceCounts) {
        socket.emit('roll_error', { message: 'Dice counts must be 0 or higher.', section });
        return;
      }
      const total = ['black', 'red', 'blue'].reduce(
        (sum, color) => sum + Number(diceCounts[color] || 0),
        0
      );

      if (total < 1 || total > 6) {
        socket.emit('roll_error', {
          message: 'Task rolls must use 1 to 6 dice total.',
          section,
        });
        return;
      }

      ['black', 'red', 'blue'].forEach((color) => {
        const count = Number(diceCounts[color] || 0);
        for (let i = 0; i < count; i += 1) {
          diceList.push(color);
        }
      });
    } else {
      socket.emit('roll_error', { message: 'Unknown roll section.', section });
      return;
    }

    if (!diceList.length) {
      socket.emit('roll_error', { message: 'Select at least one die.', section });
      return;
    }

    const outcomes = diceList.map((color) => rollDie(color));
    const rollId = randomUUID();

    const rollEvent = {
      id: rollId,
      roomCode,
      playerName,
      socketId: socket.id,
      section,
      actionType,
      diceList,
      outcomes,
      revealedFlags: Array(diceList.length).fill(false),
      createdAt: Date.now(),
      completed: false,
    };

    const room = getRoom(roomCode);
    room.rolls.set(rollId, rollEvent);

    socket.emit('roll_result', {
      rollId,
      section,
      actionType,
      diceList,
      outcomes,
    });

    const entry = {
      id: randomUUID(),
      type: 'ROLL_LOCKED',
      section,
      playerName,
      action: section === 'action' ? actionType : undefined,
      diceCount: section === 'corp' ? diceList.length : undefined,
      ts: Date.now(),
    };

    pushFeed(roomCode, entry);
  });

  socket.on('reveal_request', (payload) => {
    const roomCode = socket.data.roomCode;
    const playerName = socket.data.playerName;

    if (!roomCode || !playerName) {
      socket.emit('reveal_error', { message: 'Join a room first.', section: payload.section });
      return;
    }

    const room = getRoom(roomCode);
    const roll = room.rolls.get(payload.rollId);

    if (!roll) {
      socket.emit('reveal_error', { message: 'Roll not found.', section: payload.section });
      return;
    }

    if (roll.socketId !== socket.id) {
      socket.emit('reveal_error', { message: 'Only the roller can reveal.', section: roll.section });
      return;
    }

    if (roll.completed) {
      socket.emit('reveal_error', { message: 'This roll is already completed.', section: roll.section });
      return;
    }

    const indices = Array.isArray(payload.indices)
      ? Array.from(new Set(payload.indices.map((idx) => Number(idx))))
      : [];

    const invalidIndex = indices.find(
      (idx) => Number.isNaN(idx) || idx < 0 || idx >= roll.diceList.length
    );

    if (!indices.length || invalidIndex !== undefined) {
      socket.emit('reveal_error', {
        message: 'Select valid dice to reveal.',
        section: roll.section,
      });
      return;
    }

    if ((roll.section === 'action' || roll.section === 'corp') && indices.length !== 1) {
      socket.emit('reveal_error', {
        message: 'Select exactly one die to reveal.',
        section: roll.section,
      });
      return;
    }

    indices.forEach((idx) => {
      roll.revealedFlags[idx] = true;
    });

    const revealedDice = indices.map((idx) => ({
      index: idx,
      color: roll.diceList[idx],
      value: roll.outcomes[idx],
    }));

    const entry = {
      id: randomUUID(),
      type: 'ROLL_REVEALED',
      section: roll.section,
      playerName,
      revealed: revealedDice.map((die) => ({
        color: die.color,
        value: die.value,
      })),
      ts: Date.now(),
    };

    pushFeed(roomCode, entry);

    roll.completed = true;

    socket.emit('roll_revealed_ack', {
      rollId: roll.id,
      section: roll.section,
      revealedIndices: indices,
    });
  });

  socket.on('reset_section', (payload) => {
    const roomCode = socket.data.roomCode;
    const playerName = socket.data.playerName;

    if (!roomCode || !playerName) {
      return;
    }

    const section = payload?.section;
    if (!['action', 'corp', 'task'].includes(section)) {
      return;
    }

    const entry = {
      id: randomUUID(),
      type: 'RESET',
      playerName,
      section,
      ts: Date.now(),
    };

    pushFeed(roomCode, entry);
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    const playerName = socket.data.playerName;
    if (!roomCode || !playerName) {
      return;
    }

    const room = getRoom(roomCode);
    room.players.delete(socket.id);

    const entry = {
      id: randomUUID(),
      type: 'LEFT',
      playerName,
      ts: Date.now(),
    };
    pushFeed(roomCode, entry);
  });
});

server.listen(PORT, () => {
  console.log(`Dark Moon server listening on port ${PORT}`);
});
