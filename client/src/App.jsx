import { useEffect, useState } from 'react';
import { socket } from './lib/socket.js';
import { useLanguage } from './i18n/LanguageContext.jsx';

const ACTIONS = [
  { key: 'actions.repairShields', value: 'Repair Shields' },
  { key: 'actions.repairOutpost', value: 'Repair Outpost' },
  { key: 'actions.repairLifeSupport', value: 'Repair Life Support' },
  { key: 'actions.loneWolf', value: 'Lone Wolf' },
];

const SECTION_KEYS = {
  action: 'sections.action',
  corp: 'sections.corp',
  task: 'sections.task',
};

const DICE_COLORS = ['black', 'red', 'blue', 'yellow'];
const SINGLE_REVEAL_SECTIONS = new Set(['action', 'corp']);

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
  const { language, setLanguage, t } = useLanguage();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [joined, setJoined] = useState(false);
  const [feed, setFeed] = useState([]);
  const [activeSection, setActiveSection] = useState('action');
  const [joinError, setJoinError] = useState('');

  const [actionType, setActionType] = useState(ACTIONS[0].value);
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
      setJoinError(payload.message || t('errors.joinFailed'));
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
  }, [activeSection, t]);

  const joinRoom = () => {
    const trimmedCode = roomCode.trim().toUpperCase();
    const trimmedName = playerName.trim();
    if (!trimmedCode || !trimmedName) {
      setJoinError(t('errors.joinMissing'));
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
      setActionType(ACTIONS[0].value);
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
      if (SINGLE_REVEAL_SECTIONS.has(section)) {
        return { ...prev, [section]: [idx] };
      }
      return { ...prev, [section]: [...existing, idx] };
    });
  };

  const requestRoll = (section) => {
    const currentRoll = rollStates[section];
    if (currentRoll && !currentRoll.completed) {
      setSectionErrors((prev) => ({
        ...prev,
        [section]: t('errors.rollInProgress'),
      }));
      return;
    }

    setSectionErrors((prev) => ({ ...prev, [section]: '' }));

    if (section === 'action') {
      const total = totalCounts(actionCounts);
      if (total < 1 || total > 3) {
        setSectionErrors((prev) => ({
          ...prev,
          action: t('errors.actionDiceRange'),
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
          corp: t('errors.corpDiceRange'),
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
          task: t('errors.taskDiceRange'),
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
        [section]: t('errors.revealEmpty'),
      }));
      return;
    }
    if (SINGLE_REVEAL_SECTIONS.has(section) && selected.length !== 1) {
      setSectionErrors((prev) => ({
        ...prev,
        [section]: t('errors.revealSingle'),
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
      return <p className="muted">{t('roll.none')}</p>;
    }
    return (
      <div className="dice-grid">
        {roll.diceList.map((color, idx) => {
          const value = roll.outcomes[idx];
          const selected = selectedIndices[section].includes(idx);
          const isInteractive = !roll.completed;
          const colorLabel = t(`dice.${color}`);
          return (
            <button
              key={`${color}-${idx}`}
              type="button"
              className={`die ${color} ${selected ? 'selected' : ''}`}
              onClick={() => isInteractive && toggleSelection(section, idx)}
              disabled={!isInteractive}
              aria-pressed={selected}
            >
              <span className="die-label">{colorLabel}</span>
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
          <p className="eyebrow">{t('app.brand')}</p>
          <h1>{t('app.title')}</h1>
        </div>
        <div className="room-info">
          <span className="chip">
            {t('room.label')}: {joined ? roomCode : t('common.placeholder')}
          </span>
          <span className="chip">
            {t('player.label')}: {joined ? playerName : t('common.placeholder')}
          </span>
          <button
            type="button"
            className="chip language-toggle"
            onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
            aria-label={t('language.toggleLabel')}
          >
            <span className={language === 'en' ? 'active' : ''}>EN</span>
            <span className="separator">/</span>
            <span className={language === 'es' ? 'active' : ''}>ES</span>
          </button>
        </div>
      </header>

      {!joined && (
        <section className="card join">
          <h2>{t('join.title')}</h2>
          <div className="form-grid">
            <label>
              {t('join.roomCode')}
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                placeholder={t('join.roomCodePlaceholder')}
              />
            </label>
            <label>
              {t('join.displayName')}
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder={t('join.displayNamePlaceholder')}
              />
            </label>
            <button type="button" className="primary" onClick={joinRoom}>
              {t('join.button')}
            </button>
          </div>
          {joinError && <p className="error">{joinError}</p>}
        </section>
      )}

      {joined && (
        <main className="main">
          <section className="card sections">
            <div className="tabs">
              {Object.entries(SECTION_KEYS).map(([key, labelKey]) => (
                <button
                  key={key}
                  type="button"
                  className={`tab ${activeSection === key ? 'active' : ''}`}
                  onClick={() => setActiveSection(key)}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>

            <div className="panel">
              {activeSection === 'action' && (
                <div className="section">
                  <h2>{t('sections.action')}</h2>
                  <div className="control-grid">
                    <label>
                      {t('actions.label')}
                      <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
                        {ACTIONS.map((action) => (
                          <option key={action.value} value={action.value}>
                            {t(action.key)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('inputs.blackDice')}
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
                      {t('inputs.redDice')}
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
                      {t('inputs.blueDice')}
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
                      {t('buttons.roll')}
                    </button>
                    <button type="button" onClick={() => resetSection('action')}>
                      {t('buttons.reset')}
                    </button>
                  </div>
                  {sectionErrors.action && <p className="error">{sectionErrors.action}</p>}

                  <h3>{t('results.title')}</h3>
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
                      {t('buttons.revealSelected')}
                    </button>
                  </div>
                </div>
              )}

              {activeSection === 'corp' && (
                <div className="section">
                  <h2>{t('sections.corp')}</h2>
                  <div className="control-grid">
                    <label className="radio">
                      <input
                        type="radio"
                        name="corp-count"
                        checked={corpCount === 2}
                        onChange={() => setCorpCount(2)}
                      />
                      {t('corp.optionTwo')}
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        name="corp-count"
                        checked={corpCount === 3}
                        onChange={() => setCorpCount(3)}
                      />
                      {t('corp.optionThree')}
                    </label>
                  </div>
                  <div className="button-row">
                    <button type="button" className="primary" onClick={() => requestRoll('corp')}>
                      {t('buttons.roll')}
                    </button>
                    <button type="button" onClick={() => resetSection('corp')}>
                      {t('buttons.reset')}
                    </button>
                  </div>
                  {sectionErrors.corp && <p className="error">{sectionErrors.corp}</p>}

                  <h3>{t('results.title')}</h3>
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
                      {t('buttons.revealSelected')}
                    </button>
                  </div>
                </div>
              )}

              {activeSection === 'task' && (
                <div className="section">
                  <h2>{t('sections.task')}</h2>
                  <div className="control-grid">
                    <label>
                      {t('inputs.blackDice')}
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
                      {t('inputs.redDice')}
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
                      {t('inputs.blueDice')}
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
                      {t('buttons.roll')}
                    </button>
                    <button type="button" onClick={() => resetSection('task')}>
                      {t('buttons.reset')}
                    </button>
                  </div>
                  {sectionErrors.task && <p className="error">{sectionErrors.task}</p>}

                  <h3>{t('results.title')}</h3>
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
                      {t('buttons.revealSelected')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="card feed">
            <h2>{t('feed.title')}</h2>
            <div className="feed-list">
              {feed.length === 0 && <p className="muted">{t('feed.empty')}</p>}
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
        <p>{t('footer.note')}</p>
      </footer>
    </div>
  );
}
