import { useEffect, useState } from 'react';
import { socket } from './lib/socket.js';

const ACTIONS = [
  'Repair Shields',
  'Repair Outpost',
  'Repair Life Support',
  'Lone Wolf',
];

const SECTION_LABELS = {
  action: 'Action Rolls',
  corp: 'Corporation Yellow Dice',
  task: 'Task Rolls',
};

const DICE_COLORS = ['black', 'red', 'blue', 'yellow'];

function clampNumber(value) {
  const next = Number(value);
  return Number.isNaN(next) ? 0 : Math.max(0, next);
}

function totalCounts(counts) {
  return Object.values(counts).reduce((sum, val) => sum + Number(val || 0), 0);
}

function formatValue(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

export default function App() {
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [joined, setJoined] = useState(false);
  const [feed, setFeed] = useState([]);
  const [activeSection, setActiveSection] = useState('action');
  const [joinError, setJoinError] = useState('');

  const [actionType, setActionType] = useState(ACTIONS[0]);
  const [actionCounts, setActionCounts] = useState({ black: 0, red: 0, blue: 0 });
  const [taskCounts, setTaskCounts] = useState({ black: 0, red: 0, blue: 0 });
  const [corpCount, setCorpCount] = useState(2);

  const [sectionErrors, setSectionErrors] = useState({ action: '', corp: '', task: '' });
  const [rollStates, setRollStates] = useState({ action: null, corp: null, task: null });
  const [selectedIndices, setSelectedIndices] = useState({ action: [], corp: [], task: [] });

  useEffect(() => {
    socket.on('connect', () => {
      console.log('[socket] connected');
    });

    socket.on('disconnect', () => {
      console.log('[socket] disconnected');
    });

    socket.on('connect_error', (err) => {
      console.log('[socket] connect_error', err.message);
    });

    socket.on('room_joined', (payload) => {
      setJoined(true);
      setFeed(payload.feed || []);
      setRoomCode(payload.roomCode);
      setPlayerName(payload.playerName);
      setJoinError('');
    });

    socket.on('join_error', (payload) => {
      setJoinError(payload.message || 'Unable to join that room.');
    });

    socket.on('feed_entry', (entry) => {
      setFeed((prev) => [...prev, entry]);
    });

    socket.on('roll_result', (data) => {
      const { section, rollId, diceList, outcomes, actionType: serverAction } = data;
      setRollStates((prev) => ({
        ...prev,
        [section]: {
          rollId,
          diceList,
          outcomes,
          actionType: serverAction || prev[section]?.actionType,
          completed: false,
        },
      }));
      setSelectedIndices((prev) => ({ ...prev, [section]: [] }));
      setSectionErrors((prev) => ({ ...prev, [section]: '' }));
    });

    socket.on('roll_error', (payload) => {
      const section = payload.section || activeSection;
      setSectionErrors((prev) => ({ ...prev, [section]: payload.message }));
    });

    socket.on('reveal_error', (payload) => {
      const section = payload.section || activeSection;
      setSectionErrors((prev) => ({ ...prev, [section]: payload.message }));
    });

    socket.on('roll_revealed_ack', (payload) => {
      const { section, rollId, revealedIndices } = payload;
      setRollStates((prev) => {
        const current = prev[section];
        if (!current || current.rollId !== rollId) {
          return prev;
        }
        const nextDiceList = revealedIndices.map((idx) => current.diceList[idx]);
        const nextOutcomes = revealedIndices.map((idx) => current.outcomes[idx]);
        return {
          ...prev,
          [section]: {
            ...current,
            diceList: nextDiceList,
            outcomes: nextOutcomes,
            completed: true,
          },
        };
      });
      setSelectedIndices((prev) => ({ ...prev, [section]: [] }));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('room_joined');
      socket.off('join_error');
      socket.off('feed_entry');
      socket.off('roll_result');
      socket.off('roll_error');
      socket.off('reveal_error');
      socket.off('roll_revealed_ack');
    };
  }, [socket, activeSection]);

  const joinRoom = () => {
    const trimmedCode = roomCode.trim().toUpperCase();
    const trimmedName = playerName.trim();
    if (!trimmedCode || !trimmedName) {
      setJoinError('Enter a room code and name to join.');
      return;
    }
    setJoinError('');
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join_room', { roomCode: trimmedCode, playerName: trimmedName });
  };

  const resetSection = (section) => {
    setSectionErrors((prev) => ({ ...prev, [section]: '' }));
    setRollStates((prev) => ({ ...prev, [section]: null }));
    setSelectedIndices((prev) => ({ ...prev, [section]: [] }));

    if (section === 'action') {
      setActionCounts({ black: 0, red: 0, blue: 0 });
      setActionType(ACTIONS[0]);
    }
    if (section === 'corp') {
      setCorpCount(2);
    }
    if (section === 'task') {
      setTaskCounts({ black: 0, red: 0, blue: 0 });
    }
  };

  const toggleSelection = (section, idx) => {
    setSelectedIndices((prev) => {
      const existing = prev[section];
      if (existing.includes(idx)) {
        return { ...prev, [section]: existing.filter((item) => item !== idx) };
      }
      return { ...prev, [section]: [...existing, idx] };
    });
  };

  const requestRoll = (section) => {
    const currentRoll = rollStates[section];
    if (currentRoll && !currentRoll.completed) {
      setSectionErrors((prev) => ({
        ...prev,
        [section]: 'Finish or reset the current roll before rolling again.',
      }));
      return;
    }

    setSectionErrors((prev) => ({ ...prev, [section]: '' }));

    if (section === 'action') {
      const total = totalCounts(actionCounts);
      if (total < 1 || total > 3) {
        setSectionErrors((prev) => ({
          ...prev,
          action: 'Action rolls must use 1 to 3 dice total.',
        }));
        return;
      }
      socket.emit('roll_request', {
        section: 'action',
        actionType,
        diceCounts: actionCounts,
      });
    }

    if (section === 'corp') {
      if (![2, 3].includes(corpCount)) {
        setSectionErrors((prev) => ({
          ...prev,
          corp: 'Corp rolls must be 2 or 3 yellow dice.',
        }));
        return;
      }
      socket.emit('roll_request', {
        section: 'corp',
        diceCount: corpCount,
      });
    }

    if (section === 'task') {
      const total = totalCounts(taskCounts);
      if (total < 1 || total > 6) {
        setSectionErrors((prev) => ({
          ...prev,
          task: 'Task rolls must use 1 to 6 dice total.',
        }));
        return;
      }
      socket.emit('roll_request', {
        section: 'task',
        diceCounts: taskCounts,
      });
    }
  };

  const revealSelected = (section) => {
    const roll = rollStates[section];
    const selected = selectedIndices[section];
    if (!roll || roll.completed) {
      return;
    }
    setSectionErrors((prev) => ({ ...prev, [section]: '' }));
    if (!selected.length) {
      setSectionErrors((prev) => ({
        ...prev,
        [section]: 'Select at least one die to reveal.',
      }));
      return;
    }
    socket.emit('reveal_request', {
      rollId: roll.rollId,
      indices: selected,
    });
  };

  const renderDice = (section) => {
    const roll = rollStates[section];
    if (!roll) {
      return <p className="muted">No roll yet. Roll dice to see private results.</p>;
    }
    return (
      <div className="dice-grid">
        {roll.diceList.map((color, idx) => {
          const value = roll.outcomes[idx];
          const selected = selectedIndices[section].includes(idx);
          const isInteractive = !roll.completed;
          return (
            <button
              key={`${color}-${idx}`}
              type="button"
              className={`die ${color} ${selected ? 'selected' : ''}`}
              onClick={() => isInteractive && toggleSelection(section, idx)}
              disabled={!isInteractive}
            >
              <span className="die-label">{color}</span>
              <span className="die-value">{formatValue(value)}</span>
              <span className="die-index">#{idx + 1}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Dark Moon</p>
          <h1>Real-time Dice Table</h1>
        </div>
        <div className="room-info">
          <span className="chip">Room: {joined ? roomCode : '---'}</span>
          <span className="chip">Player: {joined ? playerName : '---'}</span>
        </div>
      </header>

      {!joined && (
        <section className="card join">
          <h2>Join a room</h2>
          <div className="form-grid">
            <label>
              Room code
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                placeholder="E.g. MOON"
              />
            </label>
            <label>
              Display name
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="Your name"
              />
            </label>
            <button type="button" className="primary" onClick={joinRoom}>
              Join room
            </button>
          </div>
          {joinError && <p className="error">{joinError}</p>}
        </section>
      )}

      {joined && (
        <main className="main">
          <section className="card sections">
            <div className="tabs">
              {Object.entries(SECTION_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`tab ${activeSection === key ? 'active' : ''}`}
                  onClick={() => setActiveSection(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="panel">
              {activeSection === 'action' && (
                <div className="section">
                  <h2>Action Rolls</h2>
                  <div className="control-grid">
                    <label>
                      Action
                      <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
                        {ACTIONS.map((action) => (
                          <option key={action} value={action}>
                            {action}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Black dice
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={actionCounts.black}
                        onChange={(e) =>
                          setActionCounts((prev) => ({
                            ...prev,
                            black: clampNumber(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Red dice
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={actionCounts.red}
                        onChange={(e) =>
                          setActionCounts((prev) => ({
                            ...prev,
                            red: clampNumber(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Blue dice
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={actionCounts.blue}
                        onChange={(e) =>
                          setActionCounts((prev) => ({
                            ...prev,
                            blue: clampNumber(e.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button type="button" className="primary" onClick={() => requestRoll('action')}>
                      Roll
                    </button>
                    <button type="button" onClick={() => resetSection('action')}>
                      Reset
                    </button>
                  </div>
                  {sectionErrors.action && <p className="error">{sectionErrors.action}</p>}

                  <h3>My Results</h3>
                  {renderDice('action')}
                  <div className="button-row">
                    <button
                      type="button"
                      className="accent"
                      onClick={() => revealSelected('action')}
                      disabled={
                        !rollStates.action ||
                        rollStates.action.completed ||
                        selectedIndices.action.length === 0
                      }
                    >
                      Reveal selected
                    </button>
                  </div>
                </div>
              )}

              {activeSection === 'corp' && (
                <div className="section">
                  <h2>Corporation Yellow Dice</h2>
                  <div className="control-grid">
                    <label className="radio">
                      <input
                        type="radio"
                        name="corp-count"
                        checked={corpCount === 2}
                        onChange={() => setCorpCount(2)}
                      />
                      Roll 2 yellow dice
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        name="corp-count"
                        checked={corpCount === 3}
                        onChange={() => setCorpCount(3)}
                      />
                      Roll 3 yellow dice
                    </label>
                  </div>
                  <div className="button-row">
                    <button type="button" className="primary" onClick={() => requestRoll('corp')}>
                      Roll
                    </button>
                    <button type="button" onClick={() => resetSection('corp')}>
                      Reset
                    </button>
                  </div>
                  {sectionErrors.corp && <p className="error">{sectionErrors.corp}</p>}

                  <h3>My Results</h3>
                  {renderDice('corp')}
                  <div className="button-row">
                    <button
                      type="button"
                      className="accent"
                      onClick={() => revealSelected('corp')}
                      disabled={
                        !rollStates.corp ||
                        rollStates.corp.completed ||
                        selectedIndices.corp.length === 0
                      }
                    >
                      Reveal selected
                    </button>
                  </div>
                </div>
              )}

              {activeSection === 'task' && (
                <div className="section">
                  <h2>Task Rolls</h2>
                  <div className="control-grid">
                    <label>
                      Black dice
                      <input
                        type="number"
                        min="0"
                        max="6"
                        value={taskCounts.black}
                        onChange={(e) =>
                          setTaskCounts((prev) => ({
                            ...prev,
                            black: clampNumber(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Red dice
                      <input
                        type="number"
                        min="0"
                        max="6"
                        value={taskCounts.red}
                        onChange={(e) =>
                          setTaskCounts((prev) => ({
                            ...prev,
                            red: clampNumber(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Blue dice
                      <input
                        type="number"
                        min="0"
                        max="6"
                        value={taskCounts.blue}
                        onChange={(e) =>
                          setTaskCounts((prev) => ({
                            ...prev,
                            blue: clampNumber(e.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button type="button" className="primary" onClick={() => requestRoll('task')}>
                      Roll
                    </button>
                    <button type="button" onClick={() => resetSection('task')}>
                      Reset
                    </button>
                  </div>
                  {sectionErrors.task && <p className="error">{sectionErrors.task}</p>}

                  <h3>My Results</h3>
                  {renderDice('task')}
                  <div className="button-row">
                    <button
                      type="button"
                      className="accent"
                      onClick={() => revealSelected('task')}
                      disabled={
                        !rollStates.task ||
                        rollStates.task.completed ||
                        selectedIndices.task.length === 0
                      }
                    >
                      Reveal selected
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="card feed">
            <h2>Table Feed</h2>
            <div className="feed-list">
              {feed.length === 0 && <p className="muted">No activity yet.</p>}
              {feed.map((entry) => (
                <div key={entry.id} className={`feed-item ${entry.type}`}>
                  <div className="feed-message">{entry.message}</div>
                  <div className="feed-time">
                    {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      <footer className="footer">
        <p>Server-authoritative rolls. Reveal only what you select.</p>
      </footer>
    </div>
  );
}
