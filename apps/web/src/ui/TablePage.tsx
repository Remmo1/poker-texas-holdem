import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { controller, useApp } from '../runtime';
import { createTableGame } from '../game/createGame';
import type { TableGame } from '../game/createGame';
import { HAND_CATEGORY_NAMES, SUIT_SYMBOLS, formatChips, parseCardFace } from '../lib/format';
import { parseChipsInput } from '../lib/raise';
import { ActionPanel } from './ActionPanel';

function PokerCanvas({ onSeatClick }: { onSeatClick: (seat: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<TableGame | null>(null);
  const clickRef = useRef(onSeatClick);
  clickRef.current = onSeatClick;
  const view = useApp((s) => s.view);

  useEffect(() => {
    const instance = createTableGame(host.current!, { onSeatClick: (seat) => clickRef.current(seat) });
    game.current = instance;
    return () => {
      instance.destroy();
      game.current = null;
    };
  }, []);

  useEffect(() => {
    game.current?.update({ view, canSit: view !== null && view.mySeat === null }, () => controller.serverNow());
  }, [view]);

  return <div className="canvas" ref={host} />;
}

function SitDialog({ seat, onClose }: { seat: number; onClose: () => void }) {
  const config = useApp((s) => s.view?.config);
  const balance = useApp((s) => s.balance);
  const [text, setText] = useState(() => {
    const max = config?.maxBuyIn ?? 0n;
    return (balance !== null && balance < max ? balance : max).toString();
  });
  const [busy, setBusy] = useState(false);
  if (!config) return null;

  const amount = parseChipsInput(text);
  const valid = amount !== null && amount >= config.minBuyIn && amount <= config.maxBuyIn && (balance === null || amount <= balance);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || amount === null) return;
    setBusy(true);
    const ok = await controller.sit(seat, amount);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Take seat {seat + 1}</h2>
        <label>
          Buy-in ({formatChips(config.minBuyIn)}–{formatChips(config.maxBuyIn)})
          <input inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </label>
        {balance !== null && <p className="muted">Wallet: {formatChips(balance)} chips</p>}
        <div className="modal-buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!valid || busy}>
            Sit down
          </button>
        </div>
      </form>
    </div>
  );
}

/** Shows the last hand's result and whether the revealed deck matched the pre-deal commitment. */
function HandBanner() {
  const view = useApp((s) => s.view);
  const hand = view?.hand;
  if (!view || !hand) return null;

  if (!hand.ended) {
    return (
      <div className="banner muted" title={`Deck commitment: ${hand.deckCommit}`}>
        Hand #{hand.handNo} · deck commitment {hand.deckCommit.slice(0, 12)}…
      </div>
    );
  }

  const winners = new Map<number, bigint>();
  for (const a of hand.awards) winners.set(a.seat, (winners.get(a.seat) ?? 0n) + a.amount);
  const summary = [...winners].map(([seat, amount]) => {
    const name = view.seats[seat]?.username ?? `Seat ${seat + 1}`;
    const category = hand.reveals[seat]?.category;
    return `${name} wins ${formatChips(amount)}${category !== undefined ? ` with ${HAND_CATEGORY_NAMES[category]}` : ''}`;
  });

  return (
    <div className="banner">
      <strong>{summary.join(' · ') || 'Hand complete'}</strong>
      <span className={hand.fairnessVerified === false ? 'bad' : 'good'} title={`Commitment: ${hand.deckCommit}`}>
        {hand.fairnessVerified === null ? 'Verifying deck…' : hand.fairnessVerified ? 'Deck verified ✓' : 'Deck mismatch ✗'}
      </span>
    </div>
  );
}

const STATUS_LABEL = { idle: 'Offline', connecting: 'Connecting…', open: 'Connected', reconnecting: 'Reconnecting…', closed: 'Disconnected' } as const;

function CardText({ card }: { card: string }) {
  const { rank, suit, red } = parseCardFace(card);
  return (
    <span className={`card-text ${red ? 'red' : ''}`}>
      {rank}
      {SUIT_SYMBOLS[suit]}
    </span>
  );
}

const signed = (n: bigint) => `${n > 0n ? '+' : ''}${formatChips(n)}`;

function LastHandDialog({ onClose }: { onClose: () => void }) {
  const result = useApp((s) => s.view?.lastResult);
  if (!result) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal result" onClick={(e) => e.stopPropagation()}>
        <h2>Hand #{result.handNo}</h2>
        <p>
          Board:{' '}
          {result.board.length > 0 ? result.board.map((c) => <CardText key={c} card={c} />) : <span className="muted">no cards dealt</span>}
        </p>
        <table className="result-table">
          <tbody>
            {result.players.map((p) => (
              <tr key={p.seat} className={p.outcome}>
                <td>{p.username}</td>
                <td>{p.cards ? p.cards.map((c) => <CardText key={c} card={c} />) : <span className="muted">{p.outcome === 'folded' ? 'folded' : 'no showdown'}</span>}</td>
                <td className="muted">{p.category !== null ? HAND_CATEGORY_NAMES[p.category] : ''}</td>
                <td className={p.net === null ? 'muted' : p.net > 0n ? 'good' : p.net < 0n ? 'bad' : 'muted'}>
                  {p.net === null ? (p.won > 0n ? `won ${formatChips(p.won)}` : '') : signed(p.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={result.fairnessVerified === false ? 'bad' : 'good'}>
          {result.fairnessVerified === null ? 'Verifying deck…' : result.fairnessVerified ? 'Deck verified ✓' : 'Deck mismatch ✗'}
        </p>
        <div className="modal-buttons">
          <button className="primary" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function TablePage() {
  const view = useApp((s) => s.view);
  const connection = useApp((s) => s.connection);
  const [sitSeat, setSitSeat] = useState<number | null>(null);
  const [showLastHand, setShowLastHand] = useState(false);

  const goToLobby = () => {
    const seated = view?.mySeat != null;
    if (seated && !window.confirm('Leaving the table stands you up and returns your chips to your wallet. Leave?')) return;
    void controller.leaveTable();
  };

  return (
    <main className="table-page">
      <header className="topbar">
        <button onClick={goToLobby}>← Lobby</button>
        <div>
          <strong>{view?.name ?? 'Loading…'}</strong>
          {view && (
            <span className="muted">
              {' '}
              · Blinds {formatChips(view.config.smallBlind)}/{formatChips(view.config.bigBlind)}
            </span>
          )}
        </div>
        <div className="topbar-right">
          <button disabled={!view?.lastResult} onClick={() => setShowLastHand(true)}>
            Last hand
          </button>
          <span className={`status status-${connection}`}>{STATUS_LABEL[connection]}</span>
        </div>
      </header>

      <PokerCanvas onSeatClick={setSitSeat} />
      <HandBanner />
      <ActionPanel />
      {view && view.mySeat === null && <p className="muted center">You are watching. Click an empty seat to sit down.</p>}
      {sitSeat !== null && view?.mySeat === null && <SitDialog seat={sitSeat} onClose={() => setSitSeat(null)} />}
      {showLastHand && <LastHandDialog onClose={() => setShowLastHand(false)} />}
    </main>
  );
}
