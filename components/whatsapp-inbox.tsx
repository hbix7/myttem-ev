'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Send, UserCheck } from 'lucide-react'
import { useStore } from '@/lib/store'
import { getNow } from '@/lib/clock'
import { useWhatsAppStore, type Conversation } from '@/lib/store/whatsapp'

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
const stamp = (iso?: string) => iso ? new Date(iso).toLocaleString('en-MY') : 'not yet'
const WINDOW_MS = 24 * 60 * 60 * 1000

const lastMessage = (c: Conversation) => c.messages[c.messages.length - 1]
const awaitingReply = (c: Conversation) => lastMessage(c)?.direction === 'in'

function waiting(c: Conversation) {
  const last = lastMessage(c)
  const hours = Math.max(0, Math.round((getNow().getTime() - new Date(last.at).getTime()) / 3_600_000))
  return hours >= 24 ? `${Math.floor(hours / 24)}d to respond` : `${hours}h to respond`
}

function ConversationRow({ c, active, jobNo, onSelect }: { c: Conversation; active: boolean; jobNo: string; onSelect: () => void }) {
  const last = lastMessage(c)
  return (
    <li>
      <button className={`wa-row ${active ? 'active' : ''}`} onClick={onSelect} aria-current={active ? 'true' : undefined}>
        <span className="wa-row-top"><strong>{c.name}</strong><small>{time(last.at)}</small></span>
        <span className="wa-row-preview">{last.direction === 'out' ? 'You: ' : ''}{last.text}</span>
        <span className="wa-row-meta">
          <span className="chip mono">{jobNo}</span>
          <span className="muted">{awaitingReply(c) ? waiting(c) : 'Responded'}</span>
          {c.unread > 0 && <b className="wa-unread" aria-label={`${c.unread} unread`}>{c.unread}</b>}
        </span>
      </button>
    </li>
  )
}

function Thread({ conversation }: { conversation: Conversation }) {
  const { users, jobs, currentUserId } = useStore()
  const sendReply = useWhatsAppStore(w => w.sendReply)
  const [text, setText] = useState('')
  const [solution, setSolution] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const job = jobs.find(j => j.id === conversation.jobId)
  const assignee = users.find(u => u.id === conversation.assignedTo)
  const lastInbound = [...conversation.messages].reverse().find(m => m.direction === 'in')
  const windowClosed = !!lastInbound && getNow().getTime() - new Date(lastInbound.at).getTime() > WINDOW_MS

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [conversation.messages.length, conversation.id])

  const send = () => {
    const body = text.trim()
    if (!body) return
    sendReply(conversation.id, body, currentUserId, solution)
    useStore.setState(s => ({
      history: [...s.history, {
        id: crypto.randomUUID(), jobId: conversation.jobId, userId: currentUserId,
        event: solution ? 'WhatsApp reply (marked as solution)' : 'WhatsApp reply sent', comment: body, at: getNow().toISOString(),
      }],
    }))
    setText('')
    setSolution(false)
  }

  return (
    <section className="wa-thread" aria-label={`Conversation with ${conversation.name}`}>
      <header className="wa-thread-head">
        <div>
          <h2>{conversation.name}</h2>
          <p className="muted">+{conversation.phone.replace(/^\+/, '')} · WhatsApp</p>
          <p className="wa-sla">First response: <b>{stamp(conversation.firstResponseAt)}</b> · First solution: <b>{stamp(conversation.firstSolutionAt)}</b></p>
        </div>
        <div className="wa-thread-tags">
          {assignee && <span className="badge tone-blue"><UserCheck size={14} aria-hidden /> Assigned</span>}
          {job && <Link href={`/jobs/${job.id}`} className="chip mono" title="Open job">{job.jobNo}</Link>}
          {assignee && <span className="muted">{assignee.name}</span>}
        </div>
      </header>

      <div className="wa-messages" role="log" aria-live="polite">
        {conversation.messages.map(m => (
          <div key={m.id} className={`wa-bubble ${m.direction}`}>
            {m.direction === 'out' && <small className="wa-agent">{users.find(u => u.id === m.agentId)?.name ?? 'Agent'}{m.solution ? ' · solution' : ''}</small>}
            <p>{m.text}</p>
            <small>{time(m.at)}</small>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <footer className="wa-composer">
        {windowClosed && <p className="wa-window">The 24-hour reply window has closed. WhatsApp may reject free-form replies until the customer writes again.</p>}
        <textarea
          aria-label="Reply"
          placeholder="Type a reply... (Enter to send, Shift+Enter for a new line)"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); send() }
          }}
        />
        <div className="wa-composer-row">
          <label className="check-row"><input type="checkbox" checked={solution} onChange={e => setSolution(e.target.checked)} /> This message is the solution</label>
          <button className="button primary" onClick={send} disabled={!text.trim()}><Send size={16} aria-hidden /> Send</button>
        </div>
      </footer>
    </section>
  )
}

export function WhatsAppInbox() {
  const conversations = useWhatsAppStore(w => w.conversations)
  const markRead = useWhatsAppStore(w => w.markRead)
  const { jobs, currentUserId } = useStore()
  const [query, setQuery] = useState('')
  const [mine, setMine] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()

  const jobNo = (id: string) => jobs.find(j => j.id === id)?.jobNo ?? ''
  const sorted = useMemo(() => [...conversations].sort((a, b) => lastMessage(b).at.localeCompare(lastMessage(a).at)), [conversations])
  const list = sorted.filter(c => {
    const q = query.trim().toLowerCase()
    return (!mine || c.assignedTo === currentUserId) && (!q || `${c.name} ${c.phone} ${jobNo(c.jobId)}`.toLowerCase().includes(q))
  })
  const unread = conversations.reduce((n, c) => n + c.unread, 0)
  const selected = conversations.find(c => c.id === selectedId) ?? list[0]

  useEffect(() => { if (selected?.unread) markRead(selected.id) }, [selected?.id, selected?.unread, markRead])

  return (
    <div className="wa-layout">
      <aside className="wa-list" aria-label="Conversations">
        <div className="wa-list-head">
          <input type="search" aria-label="Search conversations" placeholder="Search customer or case..." value={query} onChange={e => setQuery(e.target.value)} />
          <label className="check-row"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Only conversations assigned to me</label>
          <small className="muted">{unread} unread</small>
        </div>
        <ul>
          {list.map(c => <ConversationRow key={c.id} c={c} jobNo={jobNo(c.jobId)} active={c.id === selected?.id} onSelect={() => setSelectedId(c.id)} />)}
          {list.length === 0 && <li className="wa-empty">No conversations match.</li>}
        </ul>
      </aside>
      {selected ? <Thread key={selected.id} conversation={selected} /> : <section className="wa-thread wa-empty">Select a conversation.</section>}
    </div>
  )
}
