// PATCH_VERSION_V4B: summary button alignment, compact controls, priority-first urgency sort
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const priorities = ['low', 'normal', 'high', 'urgent'];
const emptyForm = { title: '', description: '', due_date: '', column_id: 1, priority: 'normal' };

function formatDate(dateValue) {
  if (!dateValue) return 'No due date';
  return new Date(dateValue).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeDateInput(dateValue) {
  return dateValue ? String(dateValue).slice(0, 10) : '';
}

function priorityLabel(priority) {
  return String(priority || 'normal').replace(/^./, (letter) => letter.toUpperCase());
}

function priorityScore(priority) {
  return { urgent: 4, high: 3, normal: 2, low: 1 }[priority || 'normal'] || 2;
}

function daysUntilDue(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  return Math.ceil((due - today) / 86400000);
}

function inferUrgencyScore(card) {
  let score = priorityScore(card.priority) * 2;
  const text = `${card.title} ${card.description || ''}`.toLowerCase();

  if (/block|blocked|broken|bug|fail|urgent|deadline|security|production|customer|client|login|payment|deploy|release/.test(text)) score += 3;
  if (/review|approval|contact|confirm|follow up|meeting|group lead|handoff/.test(text)) score += 1;

  const dueIn = daysUntilDue(card.due_date);
  if (dueIn !== null) {
    if (dueIn < 0) score += 5;
    else if (dueIn === 0) score += 4;
    else if (dueIn <= 2) score += 3;
    else if (dueIn <= 7) score += 1;
  }

  return score;
}

function App() {
  const [board, setBoard] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [summary, setSummary] = useState(null);
  const [sortMode, setSortMode] = useState('manual');
  const [smartPriority, setSmartPriority] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState(null);
  const [dragOverColumnId, setDragOverColumnId] = useState(null);
  const [error, setError] = useState('');

  const activeTaskCount = useMemo(
    () => board.flatMap((column) => column.cards).filter((card) => columnNameForCard(board, card) !== 'Done').length,
    [board]
  );

  async function fetchBoard({ showLoading = false } = {}) {
    setError('');
    if (showLoading) setLoadingBoard(true);
    try {
      const response = await fetch(`${API_BASE_URL}/board`);
      if (!response.ok) throw new Error('Could not load board');
      const data = await response.json();
      setBoard(data);
      if (data[0]) setForm((current) => ({ ...current, column_id: current.column_id || data[0].id }));
    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) setLoadingBoard(false);
    }
  }

  useEffect(() => {
    fetchBoard({ showLoading: true });
  }, []);

  function resetForm() {
    setForm({ ...emptyForm, column_id: board[0]?.id || 1 });
  }

  async function saveCard(event) {
    event.preventDefault();
    setError('');

    const payload = {
      ...form,
      column_id: Number(form.column_id),
      priority: form.priority || 'normal',
      due_date: form.due_date || null
    };

    try {
      const response = await fetch(`${API_BASE_URL}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Could not save card');
      }
      const newCard = await response.json();
      setBoard((current) => addCardToBoard(current, newCard));
      resetForm();
      setShowCreateForm(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateCard(cardId, updates) {
    setError('');
    const previousBoard = board;
    setBoard((current) => updateCardInBoard(current, cardId, updates));

    try {
      const response = await fetch(`${API_BASE_URL}/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, due_date: updates.due_date || null })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Could not update card');
      }
      const savedCard = await response.json();
      setBoard((current) => updateCardInBoard(current, cardId, savedCard));
      return savedCard;
    } catch (err) {
      setBoard(previousBoard);
      setError(err.message);
      throw err;
    }
  }

  async function moveCard(cardId, columnId) {
    const previousBoard = board;
    setError('');
    setBoard((current) => moveCardInBoard(current, cardId, Number(columnId)));

    try {
      const response = await fetch(`${API_BASE_URL}/cards/${cardId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_id: Number(columnId) })
      });
      if (!response.ok) throw new Error('Could not move card');
      const savedCard = await response.json();
      setBoard((current) => updateCardInBoard(current, cardId, savedCard));
    } catch (err) {
      setBoard(previousBoard);
      setError(err.message);
    }
  }

  function handleCardDragStart(event, cardId) {
    setDraggingCardId(cardId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(cardId));
  }

  function handleColumnDragOver(event, columnId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleColumnDragEnter(columnId) {
    setDragOverColumnId((currentColumnId) => (
      currentColumnId === columnId ? currentColumnId : columnId
    ));
  }

  async function handleColumnDrop(event, columnId) {
    event.preventDefault();
    const droppedCardId = Number(event.dataTransfer.getData('text/plain') || draggingCardId);
    setDraggingCardId(null);
    setDragOverColumnId(null);

    if (!droppedCardId) return;

    const sourceColumn = board.find((column) => column.cards.some((card) => card.id === droppedCardId));
    if (!sourceColumn || sourceColumn.id === columnId) return;

    moveCard(droppedCardId, columnId);
  }

  function handleDragEnd() {
    setDraggingCardId(null);
    setDragOverColumnId(null);
  }

  async function deleteCard(cardId) {
    const previousBoard = board;
    setError('');
    setBoard((current) => removeCardFromBoard(current, cardId));

    try {
      const response = await fetch(`${API_BASE_URL}/cards/${cardId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete card');
    } catch (err) {
      setBoard(previousBoard);
      setError(err.message);
    }
  }

  async function generateSummary() {
    setLoadingSummary(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/ai/daily-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smartPriority })
      });
      if (!response.ok) throw new Error('Could not generate summary');
      const data = await response.json();
      setSummary(data);
      if (smartPriority && Array.isArray(data.priorityUpdates) && data.priorityUpdates.length) {
        setBoard((current) => applyPriorityUpdates(current, data.priorityUpdates));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingSummary(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="hero compact-hero">
        <h1>Simple Kanban Board</h1>
        <p>Track tasks, move cards, and generate a focused daily summary.</p>
      </header>

      {error && <section className="alert">{error}</section>}

      <section className={`summary-panel compact-summary ${summary ? '' : 'summary-panel-empty'}`}>
        <div className="summary-copy">
          <div className="panel-heading-row">
            <h2>Daily Summary</h2>
            <button className="summary-button" onClick={generateSummary} disabled={loadingSummary}>
              {loadingSummary ? 'Summarizing...' : 'Generate daily summary'}
            </button>
          </div>
          <p>{summary?.summary || `You have ${activeTaskCount} active task${activeTaskCount === 1 ? '' : 's'}. Generate a summary to get a daily briefing and suggested order.`}</p>
          <div className="summary-meta-row">
            {summary?.source && <span className="source-pill">Source: {summary.source}</span>}
            {summary?.priorityUpdates?.length > 0 && <span className="source-pill smart">Smart Priority updated {summary.priorityUpdates.length} card{summary.priorityUpdates.length === 1 ? '' : 's'}</span>}
          </div>
        </div>
        {summary && <SummaryDetails summary={summary} />}
      </section>

      <section className="controls-panel">
        <div className="control-group">
          <span className="control-label">Board order</span>
          <div className="segmented-control" aria-label="Sort cards">
            <button className={sortMode === 'manual' ? 'active' : ''} onClick={() => setSortMode('manual')}>Manual</button>
            <button className={sortMode === 'urgency' ? 'active' : ''} onClick={() => setSortMode('urgency')}>Urgency</button>
            <button className={sortMode === 'dueDate' ? 'active' : ''} onClick={() => setSortMode('dueDate')}>Due date</button>
          </div>
        </div>

        <div className="control-group smart-priority-row">
          <span className="control-label">
            Smart Priority
            <span className="info-dot" tabIndex="0" aria-label="Smart Priority information">i
              <span className="tooltip">When enabled, priorities may be gently relabeled and reorganized as part of the daily summary.</span>
            </span>
          </span>
          <label className="switch">
            <input type="checkbox" checked={smartPriority} onChange={(event) => setSmartPriority(event.target.checked)} />
            <span className="slider" />
          </label>
        </div>

        <div className="control-group create-control">
          <button className="secondary-button" onClick={() => setShowCreateForm((value) => !value)}>
            {showCreateForm ? 'Close card form' : 'Make a card'}
          </button>
        </div>

        {showCreateForm && (
          <form className="card-form" onSubmit={saveCard}>
            <label>
              Title
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Task title" required />
            </label>
            <label>
              Description
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What needs to happen?" />
            </label>
            <label>
              Priority
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}
              </select>
            </label>
            <label>
              Due date
              <input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
            </label>
            <label>
              Column
              <select value={form.column_id} onChange={(event) => setForm({ ...form, column_id: Number(event.target.value) })}>
                {board.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
              </select>
            </label>
            <div className="form-actions">
              <button type="submit">Add card</button>
              <button type="button" className="ghost" onClick={() => { resetForm(); setShowCreateForm(false); }}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      {loadingBoard ? <p className="loading">Loading board...</p> : (
        <section className="board">
          {board.map((column) => {
            const cards = getSortedCards(column.cards, sortMode);
            return (
              <article
                className={`column ${dragOverColumnId === column.id ? 'column-drop-target' : ''}`}
                key={column.id}
                onDragOver={(event) => handleColumnDragOver(event, column.id)}
                onDragEnter={() => handleColumnDragEnter(column.id)}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setDragOverColumnId(null);
                }}
                onDrop={(event) => handleColumnDrop(event, column.id)}
              >
                <div className="column-header">
                  <h2>{column.name}</h2>
                  <span>{column.cards.length}</span>
                </div>
                <div className="cards">
                  {cards.length === 0 && <p className="empty-column">No cards yet.</p>}
                  {cards.map((card) => (
                    <TaskCard
                      key={card.id}
                      card={card}
                      columns={board}
                      onUpdate={updateCard}
                      onDelete={deleteCard}
                      onDragStart={handleCardDragStart}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingCardId === card.id}
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

function SummaryDetails({ summary }) {
  const order = Array.isArray(summary.suggestedOrder) ? summary.suggestedOrder : [];
  return (
    <div className="summary-order">
      <h3>Suggested order</h3>
      {order.length ? (
        <ol>
          {order.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ol>
      ) : (
        <p>No suggested order yet.</p>
      )}
    </div>
  );
}

function TaskCard({ card, columns, onUpdate, onDelete, onDragStart, onDragEnd, isDragging }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(cardToDraft(card));
  const urgencyClass = `priority-${card.priority || 'normal'}`;

  useEffect(() => {
    if (!isEditing) setDraft(cardToDraft(card));
  }, [card, isEditing]);

  async function saveInlineEdit(event) {
    event.preventDefault();
    await onUpdate(card.id, {
      title: draft.title,
      description: draft.description,
      priority: draft.priority,
      due_date: draft.due_date || null,
      column_id: Number(draft.column_id)
    });
    setIsEditing(false);
  }

  return (
    <article
      className={`task-card ${urgencyClass} ${isDragging ? 'dragging' : ''} ${isEditing ? 'task-card-editing' : ''}`}
      draggable={!isEditing}
      onDragStart={(event) => onDragStart(event, card.id)}
      onDragEnd={onDragEnd}
    >
      {isEditing ? (
        <form className="inline-edit-form" onSubmit={saveInlineEdit}>
          <input className="inline-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Description" />
          <div className="inline-grid">
            <label>
              Priority
              <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
                {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}
              </select>
            </label>
            <label>
              Due date
              <input type="date" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} />
            </label>
            <label>
              Status
              <select value={draft.column_id} onChange={(event) => setDraft({ ...draft, column_id: Number(event.target.value) })}>
                {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
              </select>
            </label>
          </div>
          <div className="card-actions inline-actions">
            <button type="submit">Save</button>
            <button type="button" className="ghost" onClick={() => { setDraft(cardToDraft(card)); setIsEditing(false); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="task-topline">
            <span className="priority-pill">{priorityLabel(card.priority)}</span>
            <span className="due-date">{formatDate(card.due_date)}</span>
          </div>
          <h3>{card.title}</h3>
          <p>{card.description || 'No description provided.'}</p>
          <div className="card-actions">
            <button type="button" onClick={() => setIsEditing(true)}>Edit</button>
            <button type="button" className="danger" onClick={() => onDelete(card.id)}>Delete</button>
          </div>
        </>
      )}
    </article>
  );
}

function cardToDraft(card) {
  return {
    title: card.title || '',
    description: card.description || '',
    priority: card.priority || 'normal',
    due_date: normalizeDateInput(card.due_date),
    column_id: card.column_id
  };
}

function getSortedCards(cards, sortMode) {
  if (sortMode === 'urgency') {
    return [...cards].sort((a, b) => {
      const priorityDelta = priorityScore(b.priority) - priorityScore(a.priority);
      if (priorityDelta !== 0) return priorityDelta;

      return compareByDueDate(a, b);
    });
  }

  if (sortMode === 'dueDate') {
    return [...cards].sort(compareByDueDate);
  }

  return cards;
}

function inferTextUrgencyScore(card) {
  const text = `${card.title} ${card.description || ''}`.toLowerCase();
  let score = 0;
  if (/block|blocked|broken|bug|fail|urgent|deadline|security|production|customer|client|login|payment|deploy|release/.test(text)) score += 2;
  if (/review|approval|contact|confirm|follow up|meeting|group lead|handoff/.test(text)) score += 1;
  return score;
}

function compareByDueDate(a, b) {
  if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return a.position - b.position;
}

function columnNameForCard(board, card) {
  return board.find((column) => column.id === card.column_id)?.name || '';
}

function addCardToBoard(board, card) {
  return board.map((column) => (
    column.id === card.column_id
      ? { ...column, cards: [...column.cards, card] }
      : column
  ));
}

function updateCardInBoard(board, cardId, updates) {
  return board.map((column) => ({
    ...column,
    cards: column.cards.map((card) => card.id === cardId ? { ...card, ...updates } : card)
  }));
}

function removeCardFromBoard(board, cardId) {
  return board.map((column) => ({ ...column, cards: column.cards.filter((card) => card.id !== cardId) }));
}

function moveCardInBoard(board, cardId, columnId) {
  let movedCard = null;
  const withoutCard = board.map((column) => {
    const remaining = [];
    for (const card of column.cards) {
      if (card.id === cardId) movedCard = { ...card, column_id: columnId };
      else remaining.push(card);
    }
    return { ...column, cards: remaining };
  });

  if (!movedCard) return board;
  return withoutCard.map((column) => (
    column.id === columnId
      ? { ...column, cards: [movedCard, ...column.cards] }
      : column
  ));
}

function applyPriorityUpdates(board, priorityUpdates) {
  const updateMap = new Map(priorityUpdates.map((update) => [Number(update.id), update.priority]));
  return board.map((column) => ({
    ...column,
    cards: column.cards.map((card) => updateMap.has(card.id) ? { ...card, priority: updateMap.get(card.id) } : card)
  }));
}

createRoot(document.getElementById('root')).render(<App />);
