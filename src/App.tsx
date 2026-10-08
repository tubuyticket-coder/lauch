import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, Ticket as TicketIcon, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://hpgujfzzallqfhiufuhn.supabase.co').replace(/\/$/, '');
const CREATE_PAYMENT_URL = `${SUPABASE_URL}/functions/v1/create-payment`;
const PAYMENT_STATUS_URL = `${SUPABASE_URL}/functions/v1/payment-status`;
const LOGO_URL = 'https://hpgujfzzallqfhiufuhn.supabase.co/storage/v1/object/public/dennob%20b%20photos/WhatsApp%20Image%202026-10-07%20at%209.41.16%20PM.jpeg';
const STUDIO_URL = 'https://hpgujfzzallqfhiufuhn.supabase.co/storage/v1/object/public/dennob%20b%20photos/WhatsApp%20Image%202026-10-07%20at%201.19.58%20PM.jpeg';
const SUPPORT = '0742197572';
const DEVELOPER = '0716625790';
const EVENT = { name: 'DENNO B STUDIO LAUNCH', date: '6 December 2026', time: '12 PM – 6 PM', venue: 'Nairobi, Chokaa Stage' };
const ticketTypes = [
  { id: 'regular', name: 'Regular', price: 500, description: 'Standard entry for the Studio Launch.', detail: 'General admission' },
  { id: 'vip', name: 'VIP', price: 1500, description: 'Premium access for guests who want more.', detail: 'Premium access' },
  { id: 'vvip', name: 'VVIP', price: 2000, description: 'The highest access tier for the launch.', detail: 'Exclusive access' },
];
type Ticket = { ticket_number: string; qr_token: string; status: string; issued_at: string };
type StatusResponse = { success: boolean; status: string; order_id?: string; amount_kes?: number; quantity?: number; customer_name?: string; customer_phone?: string; customer_email?: string; tickets?: Ticket[]; error?: string };
type Page = 'home'|'tickets'|'about'|'contact'|'location'|'ticket';

export default function App() {
  const [page, setPage] = useState<Page>((location.hash.replace('#','') as Page) || 'home');
  const [selected, setSelected] = useState<(typeof ticketTypes)[number] | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [details, setDetails] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [paymentState, setPaymentState] = useState<'idle'|'sending'|'waiting'|'success'|'cancelled'|'error'>('idle');
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [booking, setBooking] = useState<StatusResponse | null>(null);
  const [externalReference, setExternalReference] = useState('');
  const total = useMemo(() => selected ? selected.price * quantity : 0, [selected, quantity]);

  useEffect(() => {
    const sync = () => { const p = location.hash.replace('#','') as Page; setPage(['home','tickets','about','contact','location','ticket'].includes(p) ? p : 'home'); };
    window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync);
  }, []);
  const navigate = (p: Page) => { location.hash = p; setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const beginBooking = (ticket: (typeof ticketTypes)[number]) => { setSelected(ticket); setQuantity(1); setError(''); setPaymentState('idle'); setDetails({name:'',phone:'',email:''}); };
  const closeBooking = () => { if (!busy) { setSelected(null); setError(''); setPaymentState('idle'); } };

  async function checkPayment(ref: string) {
    const response = await fetch(`${PAYMENT_STATUS_URL}?external_reference=${encodeURIComponent(ref)}`, { headers: { 'Content-Type': 'application/json' } });
    const data: StatusResponse = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to confirm payment status.');
    return data;
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault(); if (!selected || busy) return;
    const normalizedPhone = details.phone.replace(/[\s-]/g, '');
    if (!/^0(7|1)\d{8}$/.test(normalizedPhone) && !/^254(7|1)\d{8}$/.test(normalizedPhone) && !/^\+254(7|1)\d{8}$/.test(normalizedPhone)) { setError('Enter a valid Kenyan mobile number, for example 0712345678.'); return; }
    setBusy(true); setPaymentState('sending'); setError('');
    try {
      const response = await fetch(CREATE_PAYMENT_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ticket_type: selected.id, quantity, customer_name: details.name.trim(), customer_phone: normalizedPhone, customer_email: details.email.trim().toLowerCase() }) });
      const result = await response.json();
      if (!response.ok || !result.success || !result.external_reference) throw new Error(result.error || 'Could not start the M-Pesa payment. Please try again.');
      const ref = String(result.external_reference); setExternalReference(ref); setPaymentState('waiting');
      const started = Date.now();
      while (Date.now() - started < 150000) {
        await new Promise(resolve => setTimeout(resolve, 3500));
        const status = await checkPayment(ref);
        if (status.status === 'paid' && status.tickets?.length) { setBooking(status); setPaymentState('success'); setBusy(false); return; }
        if (['cancelled','failed','expired'].includes(status.status)) { setPaymentState('cancelled'); setError('Your M-Pesa payment was not completed. No ticket was generated.'); setCancelOpen(true); setBusy(false); return; }
      }
      setError('We have not received a final payment response yet. Check your M-Pesa messages, then use Check payment status.'); setPaymentState('error');
    } catch (err) { setError(err instanceof Error ? err.message : 'Payment could not be started.'); setPaymentState('error'); }
    finally { setBusy(false); }
  }
  async function refreshStatus() {
    if (!externalReference) return; setBusy(true); setError('');
    try { const data = await checkPayment(externalReference); if (data.status === 'paid' && data.tickets?.length) { setBooking(data); setPaymentState('success'); } else if (['cancelled','failed','expired'].includes(data.status)) { setPaymentState('cancelled'); setError('Your M-Pesa payment was not completed. No ticket was generated.'); setCancelOpen(true); } else { setPaymentState('waiting'); setError('Payment is still pending. Complete the M-Pesa prompt on your phone.'); } }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not check payment status.'); } finally { setBusy(false); }
  }
  const whatsApp = (number: string) => `https://wa.me/254${number.replace(/^0/,'')}`;

  return <div className="site-shell">
    <header className="topbar"><a className="brand" href="#home" onClick={() => navigate('home')}><img src={LOGO_URL} alt="DENNO B STUDIO logo"/><span>DENNO B <small>STUDIO LAUNCH</small></span></a><nav>{(['home','tickets','about','location','contact'] as Page[]).map(p => <a key={p} className={page===p?'active':''} href={`#${p}`} onClick={() => navigate(p)}>{p==='home'?'Home':p[0].toUpperCase()+p.slice(1)}</a>)}</nav><button className="nav-cta" onClick={() => navigate('tickets')}>Get tickets <span>↗</span></button></header>
    {page==='home' && <><main><section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="gold-dot"/> A NEW CHAPTER BEGINS</p><h1>DENNO B<br/><em>STUDIO LAUNCH</em></h1><p className="hero-sub">A celebration of vision, people and purpose. Be part of the beginning.</p><div className="hero-meta"><div><span>DATE</span><strong>06 DECEMBER 2026</strong></div><div><span>TIME</span><strong>12 PM – 6 PM</strong></div><div><span>LOCATION</span><strong>NAIROBI, CHOKAA STAGE</strong></div></div><button className="button gold" onClick={() => navigate('tickets')}>Reserve your ticket <span>↗</span></button></div><div className="hero-image"><img src={STUDIO_URL} alt="DENNO B studio"/><div className="image-caption"><span>THE OPENING</span><strong>Where the next chapter begins.</strong></div></div><div className="hero-index">01 <span/> 03</div></section><section className="intro section-wrap"><p className="eyebrow">THE EXPERIENCE</p><div className="intro-row"><h2>More than a launch.<br/><em>A shared beginning.</em></h2><p>Join us for the official opening of DENNO B STUDIO — an afternoon built around connection, ambition and the people who make every vision possible.</p></div></section><TicketCards onChoose={beginBooking}/><section className="quote section-wrap"><span>“</span><p>A leader who listens<br/>and a servant who acts.</p><small>DENNO B · OUR PRINCIPLE</small></section></main></>}
    {page==='tickets' && <main className="inner-page"><p className="eyebrow">YOUR PLACE IS WAITING</p><h1>Choose your <em>experience.</em></h1><p className="page-lead">Select a ticket tier to continue to secure M-Pesa checkout.</p><TicketCards onChoose={beginBooking}/></main>}
    {page==='about' && <main className="inner-page about-page"><p className="eyebrow">ABOUT DENNO B</p><h1>People first.<br/><em>Purpose always.</em></h1><div className="about-grid"><img src={STUDIO_URL} alt="The studio"/><div><h2>A leader who listens and a servant who acts.</h2><p>DENNO B believes meaningful leadership begins with people. The studio launch marks a commitment to serve with humility and dedication, lead with honesty, and uphold strong values in every step forward.</p><ul><li>People first, in every decision.</li><li>Humility and dedication in service.</li><li>Honesty, accountability and strong values.</li><li>Leadership that listens and takes action.</li></ul></div></div></main>}
    {page==='location' && <main className="inner-page"><p className="eyebrow">FIND US</p><h1>Meet us at <em>Chokaa.</em></h1><div className="location-panel"><div><span className="eyebrow">VENUE</span><h2>Nairobi, Chokaa Stage</h2><p>Sunday, 6 December 2026 · 12 PM – 6 PM</p><a className="text-link" target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=Chokaa+Stage+Nairobi">Open directions ↗</a></div><div className="location-mark">DB<span>STUDIO LAUNCH</span></div></div></main>}
    {page==='contact' && <main className="inner-page"><p className="eyebrow">WE'RE HERE TO HELP</p><h1>Get in <em>touch.</em></h1><p className="page-lead">For ticket questions or event assistance, contact our support team.</p><div className="contact-panel"><div><span className="eyebrow">TICKET & EVENT SUPPORT</span><h2>{SUPPORT}</h2><a className="text-link" target="_blank" rel="noreferrer" href={whatsApp(SUPPORT)}>Chat on WhatsApp ↗</a></div><div><span className="eyebrow">PAYMENT HELP</span><p>Keep your M-Pesa confirmation message. If your payment was successful but your ticket is not showing, contact support with the phone number used at checkout.</p></div></div></main>}
    {page==='ticket' && <main className="inner-page"><p className="eyebrow">YOUR CONFIRMATION</p><h1>Your <em>tickets.</em></h1>{booking?.tickets?.length ? <div className="ticket-list">{booking.tickets.map(t => <TicketPass key={t.ticket_number} ticket={t} booking={booking}/>)}</div> : <div className="empty-state"><TicketIcon size={30}/><h2>No ticket displayed yet</h2><p>Complete payment to generate your ticket. If you already paid, check your booking again.</p><button className="button gold" onClick={refreshStatus} disabled={!externalReference||busy}>Check payment status</button></div>}</main>}
    <footer><div className="footer-main"><a className="brand" href="#home" onClick={() => navigate('home')}><img src={LOGO_URL} alt=""/><span>DENNO B <small>STUDIO LAUNCH</small></span></a><p>People first. Purpose always.</p><a href={whatsApp(DEVELOPER)} target="_blank" rel="noreferrer">Developer · Felix Nyabuto · {DEVELOPER}</a></div><div className="footer-bottom"><span>© 2026 DENNO B STUDIO LAUNCH</span><span>Nairobi, Kenya</span></div></footer>

    {selected && <div className="modal-backdrop" role="presentation"><section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title"><button className="close-modal" aria-label="Close" onClick={closeBooking} disabled={busy}><X/></button>{paymentState==='success' && booking?.tickets?.length ? <><div className="success-icon"><Check/></div><p className="eyebrow">PAYMENT CONFIRMED</p><h2 id="booking-title">You're on the list.</h2><p className="muted">Your ticket{booking.tickets.length>1?'s are':' is'} ready. A confirmation email will be sent to {booking.customer_email || details.email}.</p><div className="ticket-list">{booking.tickets.map(t=><TicketPass key={t.ticket_number} ticket={t} booking={booking}/>)}</div><button className="button gold full" onClick={() => { setSelected(null); navigate('ticket'); }}>View ticket page</button></> : <><p className="eyebrow">SECURE YOUR PLACE</p><h2 id="booking-title">{selected.name} ticket</h2><p className="modal-description">{selected.description}</p><div className="quantity-row"><div><strong>Quantity</strong><small>Up to 20 tickets per order</small></div><div className="stepper"><button aria-label="Remove one ticket" disabled={quantity<=1||busy} onClick={()=>setQuantity(q=>Math.max(1,q-1))}><Minus size={16}/></button><strong>{quantity}</strong><button aria-label="Add one ticket" disabled={quantity>=20||busy} onClick={()=>setQuantity(q=>Math.min(20,q+1))}><Plus size={16}/></button></div></div><div className="total-row"><span>Total to pay</span><strong>KES {total.toLocaleString('en-KE')}</strong></div><form onSubmit={pay} className="checkout-form"><label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={details.name} onChange={e=>setDetails({...details,name:e.target.value})} placeholder="Name as it should appear on ticket"/></label><label>M-Pesa phone number<input required inputMode="tel" autoComplete="tel" value={details.phone} onChange={e=>setDetails({...details,phone:e.target.value})} placeholder="0712 345 678"/></label><label>Email address<input required type="email" maxLength={254} autoComplete="email" value={details.email} onChange={e=>setDetails({...details,email:e.target.value})} placeholder="you@example.com"/></label>{error && <div className={`form-message ${paymentState==='error'?'error':''}`}>{error}</div>}{paymentState==='waiting' && <div className="waiting-note"><span className="spinner"/> M-Pesa prompt sent. Check your phone and enter your PIN to complete payment.</div>}{paymentState==='error' && externalReference && <button type="button" className="button outline full" onClick={refreshStatus} disabled={busy}>Check payment status</button>}<button className="button gold full" type="submit" disabled={busy}>{busy ? <><span className="spinner light"/> {paymentState==='waiting'?'Waiting for payment…':'Preparing payment…'}</> : <>Pay KES {total.toLocaleString('en-KE')} <span>↗</span></>}</button><p className="secure-note">Payment is processed through M-Pesa. Tickets are issued only after payment is confirmed.</p></form></>}</section></div>}
    {busy && paymentState==='waiting' && <div className="loading-overlay"><div className="loading-card"><div className="loading-orbit"><div>DB</div></div><p className="eyebrow">DENNO B STUDIO LAUNCH</p><h2>Waiting for payment</h2><p>Check your phone for the M-Pesa prompt and approve the transaction. Keep this window open while we confirm your payment.</p><span className="spinner"/></div></div>}
    {cancelOpen && <div className="notice-backdrop" role="presentation"><div className="notice-modal" role="alertdialog" aria-modal="true" aria-labelledby="cancel-title"><div className="notice-mark"><X size={22}/></div><p className="eyebrow">PAYMENT STATUS</p><h2 id="cancel-title">Payment not completed.</h2><p>Your M-Pesa payment was not completed, so no ticket was generated. You can try again whenever you're ready.</p><button className="button gold full" onClick={()=>{setCancelOpen(false);setSelected(null);setError('');setPaymentState('idle');setQuantity(1);setDetails({name:'',phone:'',email:''});setExternalReference('');setBooking(null);}}>Okay</button></div></div>}
  </div>;
}
function TicketCards({onChoose}:{onChoose:(ticket:(typeof ticketTypes)[number])=>void}) { return <section className="ticket-section section-wrap"><div className="ticket-section-heading"><div><p className="eyebrow">TICKETS & ACCESS</p><h2>Choose your <em>entry.</em></h2></div><p>Every ticket brings you into the story.</p></div><div className="ticket-grid">{ticketTypes.map((t,i)=><article className={`ticket-card ${i===1?'featured':''}`} key={t.id}>{i===1&&<span className="popular-tag">MOST POPULAR</span>}<span className="ticket-number">0{i+1}</span><p className="eyebrow">{t.detail}</p><h3>{t.name}</h3><p className="ticket-description">{t.description}</p><div className="price">KES <strong>{t.price.toLocaleString('en-KE')}</strong></div><button className={`button ${i===1?'gold':'outline'} full`} onClick={()=>onChoose(t)}>Select {t.name} <span>↗</span></button></article>)}</div></section> }
function TicketPass({ticket,booking}:{ticket:Ticket;booking:StatusResponse}) { return <article className="ticket-pass"><div className="pass-head"><div><p className="eyebrow">DENNO B STUDIO LAUNCH</p><h3>{ticket.ticket_number}</h3><p>{booking.customer_name} · {booking.quantity} ticket order</p></div><div className="pass-qr"><QRCodeSVG value={ticket.qr_token} size={108} bgColor="#ffffff" fgColor="#000000" level="H" includeMargin/></div></div><div className="pass-details"><span>{EVENT.date}</span><span>{EVENT.venue}</span><span>{ticket.status.toUpperCase()}</span></div><p className="qr-hint">Keep this QR code ready for entry. Each ticket has a unique code.</p></article> }
