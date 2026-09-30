// Seats a few scripted players at the first table so the UI has someone to play against.
// Usage: node tools/bots.mjs [count=2] [--server=http://localhost:3000]
const server = process.argv.find((a) => a.startsWith('--server='))?.slice(9) ?? 'http://localhost:3000';
const count = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 2);
const PASSWORD = 'bot-password-123';
const NAMES = ['bot_ada', 'bot_linus', 'bot_grace', 'bot_alan', 'bot_edsger'];

async function post(path, body, token) {
  const response = await fetch(`${server}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function signIn(name) {
  await post('/auth/register', { username: name, password: PASSWORD }); // 409 when it already exists
  const login = await post('/auth/login', { username: name, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed for ${name}: ${login.status}`);
  return login.body.accessToken;
}

function chooseAction(legal) {
  const roll = Math.random();
  if (legal.canCheck) {
    if (legal.raise && roll < 0.2) return { type: legal.raise.kind, to: legal.raise.min };
    return { type: 'check' };
  }
  if (roll < 0.15) return { type: 'fold' };
  if (legal.raise && roll > 0.85) return { type: 'raise', to: legal.raise.min };
  return { type: 'call' };
}

async function runBot(name, seat, tableId) {
  const token = await signIn(name);
  const ticket = (await post('/auth/ws-ticket', {}, token)).body.ticket;
  const socket = new WebSocket(`${server.replace(/^http/, 'ws')}/ws`);
  let counter = 0;
  let handId = '';
  let userId = '';
  const send = (type, payload) => socket.send(JSON.stringify({ v: 1, id: `b${++counter}`, type, payload }));
  const sit = () => send('table.sit', { tableId, seat, buyIn: '1000' });

  socket.addEventListener('open', () => send('auth.hello', { ticket }));
  socket.addEventListener('close', () => {
    console.log(`${name}: disconnected`);
    process.exit(0);
  });
  socket.addEventListener('message', async ({ data }) => {
    const message = JSON.parse(data);
    switch (message.type) {
      case 'auth.ok':
        userId = message.payload.userId;
        send('table.join', { tableId });
        sit();
        console.log(`${name}: seated at seat ${seat + 1}`);
        break;
      case 'cmd.reject':
        console.log(`${name}: rejected (${message.payload.code}: ${message.payload.message})`);
        break;
      case 'hand.started':
        handId = message.payload.handId;
        break;
      case 'player.left':
        if (message.payload.userId === userId) setTimeout(sit, 2000); // busted or timed out: rebuy
        break;
      case 'action.requested':
        if (message.payload.seat !== seat) break;
        await sleep(700 + Math.random() * 1500); // look like a person thinking
        send('table.action', { tableId, handId, actionSeq: message.payload.actionSeq, action: chooseAction(message.payload.legal) });
        break;
      default:
    }
  });
}

const tables = await (await fetch(`${server}/tables`)).json();
if (!tables.length) throw new Error('The server has no tables');
console.log(`Seating ${count} bot(s) at "${tables[0].name}" on ${server}. Press Ctrl+C to stop.`);
for (let i = 0; i < count; i++) await runBot(NAMES[i], i + 1, tables[0].id); // seat 0 is left for you
