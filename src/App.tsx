import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, CalendarDays, Check, Clock3, MapPin, Menu, Phone, ShieldCheck, Ticket, X } from 'lucide-react';

const LOGO_URL = 'https://hpgujfzzallqfhiufuhn.supabase.co/storage/v1/object/public/dennob%20b%20photos/WhatsApp%20Image%202026-10-07%20at%209.41.16%20PM.jpeg';
const STUDIO_URL = 'https://hpgujfzzallqfhiufuhn.supabase.co/storage/v1/object/public/dennob%20b%20photos/WhatsApp%20Image%202026-10-07%20at%201.19.58%20PM.jpeg';
const SUPABASE_URL = 'https://hpgujfzzallqfhiufuhn.supabase.co';
const CREATE_PAYMENT_URL = `${SUPABASE_URL}/functions/v1/create-payment`;
const PAYMENT_STATUS_URL = `${SUPABASE_URL}/functions/v1/payment-status`;
const SUPPORT = '0742197572';
const DEVELOPER = '0716625790';

const tickets = [
  { id: 'regular', dbId: '0223b743-9fef-47c4-a72b-2ca5ca7c4906', name: 'Regular', price: 500, description: 'Standard entry for the Studio Launch.' },
  { id: 'vip', dbId: '664fc617-7a9a-49f5-84e8-986ccd3ca02f', name: 'VIP', price: 1500, description: 'Premium access for guests who want more.' },
  { id: 'vvip', dbId: '10beb201-03c6-4686-a43e-d3ec59a432ff', name: 'VVIP', price: 2000, description: 'The highest access tier for the launch.' },
];
type TicketType = typeof tickets[number];
type BookingTicket = { ticketNumber: string; issuedAt: string; qrToken: string };
type Booking = { ticketId: string; ticketName: string; price: number; quantity: number; name: string; phone: string; email: string; tickets: BookingTicket[] };
type Page = 'home' | 'about' | 'contact' | 'location' | 'tickets' | 'ticket';
type PayState = 'idle' | 'sending' | 'waiting' | 'success' | 'cancelled' | 'error';

function getPage(): Page {
  const hash = window.location.hash.slice(1);
  return (['home','about','contact','location','tickets','ticket'].includes(hash) ? hash : 'home') as Page;
}
function money(amount: number) { return amount.toLocaleString('en-KE'); }

export default function App() {
  const [page, setPage] = useState<Page>(getPage);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selected, setSelected] = useState<TicketType | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [step, setStep] = useState<'details' | 'payment'>('details');
  const [payState, setPayState] = useState<PayState>('idle');
  const [payMessage, setPayMessage] = useState('');
  const [cancelNotice, setCancelNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(() => {
    try { const saved = localStorage.getItem('denno-b-studio-ticket'); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });

  useEffect(() => {
    const onHash = () => { setPage(getPage()); setMobileOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = (p: Page) => { window.location.hash = p; };
  const openBooking = (ticket: TicketType) => {
    setSelected(ticket); setStep('details'); setForm({ name: '', phone: '', email: '' });
    setErrors({}); setQuantity(1); setPayState('idle'); setPayMessage(''); setCancelNotice(false); setBusy(false);
  };
  const validate = () => {
    const e: Record<string,string> = {};
    if (!form.name.trim()) e.name = 'Enter your full name.';
    if (!/^[0-9+ ]{9,15}$/.test(form.phone.trim())) e.phone = 'Enter a valid phone number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    setErrors(e); return Object.keys(e).length === 0;
  };
  const startPayment = async () => {
    if (!selected || busy) return;
    setBusy(true); setPayState('sending'); setPayMessage('');
    try {
      const response = await fetch(CREATE_PAYMENT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_type_id: selected.dbId, customer_name: form.name.trim(), customer_phone: form.phone.trim(), customer_email: form.email.trim(), quantity })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not start the M-Pesa payment.');
      if (!result.external_reference) throw new Error('Payment started but no external reference was returned. Check the payment function response.');
      setPayState('waiting'); setPayMessage('M-Pesa prompt sent. Complete the request on your phone.');
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const sr = await fetch(`${PAYMENT_STATUS_URL}?external_reference=${encodeURIComponent(result.external_reference)}`);
        const status = await sr.json();
        if (status.status === 'paid' && Array.isArray(status.tickets) && status.tickets.length) {
          const issued: Booking = {
            ticketId: selected.id, ticketName: selected.name, price: selected.price,
            quantity: Number(status.quantity) || quantity, name: status.customer_name || form.name.trim(),
            phone: form.phone.trim(), email: status.customer_email || form.email.trim(), tickets: status.tickets
          };
          localStorage.setItem('denno-b-studio-ticket', JSON.stringify(issued));
          setBooking(issued); setPayState('success'); setPayMessage('Done. Your payment was successful and your ticket is ready.');
          setSelected(null); setBusy(false); navigate('ticket'); return;
        }
        if (status.status === 'cancelled' || status.status === 'failed') {
          setPayState('cancelled'); setPayMessage('Payment cancelled. No ticket was generated.'); setCancelNotice(true); setBusy(false); return;
        }
      }
      setPayState('error'); setPayMessage('Payment is still pending. Check your M-Pesa messages before trying again.');
    } catch (err) {
      setPayState('error'); setPayMessage(err instanceof Error ? err.message : 'Payment could not be completed.');
    } finally { setBusy(false); }
  };
  const qrValue = (t: BookingTicket) => JSON.stringify({ ticket: t.ticketNumber, event: 'DENNO B STUDIO LAUNCH', date: '6 December 2026', venue: 'Nairobi Chokaa Stage', holder: booking?.name, tier: booking?.ticketName, qr_token: t.qrToken });

  return <div className="site-shell">
    <header className="nav-wrap"><div className="nav">
      <a href="#home" className="brand"><img src={LOGO_URL} alt="Denno B Studio logo" /><span>DENNO B <b>STUDIO LAUNCH</b></span></a>
      <button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">{mobileOpen ? <X size={22}/> : <Menu size={22}/>}</button>
      <nav className={mobileOpen ? 'nav-links open' : 'nav-links'}>
        {(['home','about','contact','location'] as Page[]).map(p => <a key={p} className={page===p?'active':''} href={`#${p}`}>{p}</a>)}
        <a className="nav-ticket" href="#tickets">Tickets</a>
      </nav>
    </div></header>
    <main>
      {page === 'home' && <>
        <section className="hero"><div className="hero-copy">
          <p className="eyebrow">THE OFFICIAL LAUNCH</p><h1>A new chapter<br/><em>begins here.</em></h1>
          <p className="lead">Join us for the DENNO B STUDIO LAUNCH — an afternoon built around people, purpose and a new beginning.</p>
          <div className="hero-actions"><a className="button gold" href="#tickets">Get your ticket <ArrowRight size={17}/></a><a className="text-link" href="#about">Discover the story</a></div>
          <div className="event-strip">
            <div><CalendarDays size={18}/><span><b>6 December 2026</b><small>Launch date</small></span></div>
            <div><Clock3 size={18}/><span><b>12:00 PM — 6:00 PM</b><small>Event time</small></span></div>
            <div><MapPin size={18}/><span><b>Nairobi Chokaa Stage</b><small>Event location</small></span></div>
          </div>
        </div><div className="hero-image"><img src={STUDIO_URL} alt="Denno B Studio"/><div className="image-caption"><span>DENNO B</span><small>STUDIO LAUNCH · 2026</small></div></div></section>
        <section className="ticket-preview section"><div className="section-head"><div><p className="eyebrow">CHOOSE YOUR ACCESS</p><h2>Tickets for the launch.</h2></div><p>Every ticket gives you a place in the room for an important new beginning.</p></div><TicketCards onSelect={openBooking}/></section>
      </>}
      {page === 'tickets' && <section className="page-section tickets-page"><PageIntro eyebrow="TICKETS" title="Reserve your place." text="Select your access level, enter your details and complete payment to receive your digital ticket with QR code."/><TicketCards onSelect={openBooking}/>{booking && <div className="existing-ticket"><ShieldCheck size={20}/><span>You already have a ticket on this device.</span><a href="#ticket">View ticket</a></div>}</section>}
      {page === 'about' && <section className="page-section"><PageIntro eyebrow="ABOUT DENNO B" title="A leader who listens. A servant who acts." text="The Studio Launch is about more than an opening. It is about people, service, responsibility and strong values."/><div className="about-grid"><div className="about-image"><img src={STUDIO_URL} alt="Denno B Studio"/></div><div className="manifesto"><p className="eyebrow">THE PURPOSE</p><h3 className="about-purpose">Leadership is service.</h3><p>Denno B is about a people-first approach: listening to people, acting with purpose and showing up with humility, dedication, honesty and strong values.</p><p className="eyebrow">WHAT REALLY IS HAPPENING</p><h2>People first.</h2><p>Denno B stands for leadership that listens before it speaks, and service that acts when people need it. The objective is simple: put people first and serve with humility, dedication and honesty.</p><p>Strong values are not a slogan. They are the standard for how leadership should be carried — with accountability, respect and a commitment to do the work.</p><div className="values">{['People first','Humility','Dedication','Honesty','Leadership','Strong values'].map(v=><span key={v}>{v}</span>)}</div></div></div></section>}
      {page === 'contact' && <section className="page-section contact-page"><PageIntro eyebrow="CONTACT" title="We are here to help." text="For ticket support, directions, payment questions or launch enquiries, reach the support team directly."/><div className="contact-grid"><ContactCard title="WhatsApp support" text="Message the support team for quick assistance." href={`https://wa.me/254${SUPPORT.slice(1)}`} action="Open WhatsApp"/><ContactCard title="Call support" text="Speak directly with the launch support team." href={`tel:${SUPPORT}`} action={SUPPORT}/><ContactCard title="Event date" text="6 December 2026 · 12:00 PM — 6:00 PM" href="#location" action="View location"/></div><p className="developer-contact">Developer: <a href={`https://wa.me/254${DEVELOPER.slice(1)}`}>Felix Nyabuto · {DEVELOPER}</a></p></section>}
      {page === 'location' && <section className="page-section"><PageIntro eyebrow="LOCATION" title="Nairobi Chokaa Stage." text="The DENNO B STUDIO LAUNCH takes place on 6 December 2026, from 12:00 PM to 6:00 PM."/><div className="location-card"><div className="location-details"><div className="location-icon"><MapPin size={26}/></div><p className="eyebrow">EVENT VENUE</p><h2>Nairobi Chokaa Stage</h2><p>Plan your journey ahead of time and arrive early for a smooth check-in.</p><a className="button charcoal" href="https://www.google.com/maps/search/?api=1&query=Nairobi+Chokaa+Stage" target="_blank" rel="noreferrer">Open in Maps <ArrowRight size={17}/></a></div><div className="map-placeholder"><MapPin size={40}/><span>NAIROBI<br/>CHOKAA STAGE</span></div></div></section>}
      {page === 'ticket' && booking && <section className="page-section ticket-page"><PageIntro eyebrow="YOUR DIGITAL TICKET" title="You’re on the list." text="Keep this ticket safe and present the QR code at the event entrance."/><div className="ticket-summary-success"><Check size={22}/><div><strong>Payment successful. Ticket generated.</strong><span>{booking.quantity} {booking.quantity===1?'ticket':'tickets'} · KES {money(booking.price*booking.quantity)}</span></div></div>{booking.tickets.map((t,i)=><div className="ticket-card" key={t.ticketNumber}><div className="ticket-main"><div className="ticket-top"><span>DENNO B</span><span>STUDIO LAUNCH</span></div><div className="ticket-title"><p className="eyebrow">ADMIT ONE · {booking.ticketName.toUpperCase()} · {i+1} OF {booking.quantity}</p><h2>{booking.name}</h2><p>{booking.email}</p></div><div className="ticket-meta"><div><small>DATE</small><b>06 DEC 2026</b></div><div><small>TIME</small><b>12 PM — 6 PM</b></div><div><small>VENUE</small><b>NAIROBI CHOKAA STAGE</b></div><div><small>TICKET</small><b>{t.ticketNumber}</b></div></div></div><div className="ticket-qr"><QRCodeSVG value={qrValue(t)} size={190} bgColor="#FFFFFF" fgColor="#000000" level="M"/><small>SCAN AT ENTRY</small></div></div>)}<div className="ticket-actions"><button className="button gold" onClick={()=>window.print()}>Print / Save Ticket</button><a className="button outline" href="#tickets">Book another</a></div></section>}
      {page === 'ticket' && !booking && <section className="page-section empty-ticket"><Ticket size={30}/><h2>No ticket found.</h2><p>Choose a ticket to start your booking.</p><a className="button gold" href="#tickets">View tickets</a></section>}
    </main>
    {page === 'home' && <footer><div className="footer-bottom"><span>© 2026 DENNO B STUDIO LAUNCH</span><a href={`https://wa.me/254${DEVELOPER.slice(1)}`} target="_blank" rel="noreferrer">Developed by Felix Nyabuto · {DEVELOPER}</a></div></footer>}
    {busy && <div className="payment-loading" role="status" aria-live="polite"><div className="payment-loading-card"><div className="payment-orbit"><div className="payment-orbit-ring"/><div className="payment-orbit-core">DB</div></div><p className="eyebrow">DENNO B STUDIO LAUNCH</p><h2>Payment request</h2><p className="payment-loading-copy">{payState==='sending'?'Sending your secure M-Pesa request.':'M-Pesa prompt sent. Please complete the payment on your phone.'}</p><div className="payment-steps"><div className={payState==='waiting'?'payment-step complete':'payment-step active'}><span>{payState==='waiting'?'✓':'1'}</span><div><b>Request sent</b><small>{payState==='waiting'?'M-Pesa request received':'Sending securely'}</small></div></div><div className={payState==='waiting'?'payment-step active':'payment-step'}><span className="payment-spinner"/><div><b>Waiting for payment</b><small>Waiting for confirmation</small></div></div></div><div className="payment-loading-line"><span/></div><p className="payment-loading-note">Keep this window open while we confirm your payment.</p></div></div>}
    {cancelNotice && <div className="notice-backdrop" role="presentation"><div className="notice-modal" role="alertdialog" aria-modal="true" aria-labelledby="cancel-title"><div className="notice-mark"><X size={22}/></div><p className="eyebrow">PAYMENT STATUS</p><h2 id="cancel-title">Payment cancelled.</h2><p>Your M-Pesa payment was not completed, so no ticket was generated.</p><button className="button gold full-button" onClick={()=>{setCancelNotice(false);setSelected(null);setPayMessage('');setPayState('idle');}}>Okay</button></div></div>}
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setSelected(null);}}><div className="booking-modal" role="dialog" aria-modal="true" aria-label="Book ticket"><button className="modal-close" onClick={()=>setSelected(null)} aria-label="Close"><X size={20}/></button>
      {step==='details' && <><p className="eyebrow">STEP 1 OF 2</p><h2>Your details.</h2><p className="modal-copy">Booking <b>{selected.name}</b></p><div className="quantity-row"><label htmlFor="ticket-quantity">Number of tickets</label><div className="quantity-control"><button type="button" onClick={()=>setQuantity(Math.max(1,quantity-1))} aria-label="Decrease quantity">−</button><input id="ticket-quantity" type="number" min="1" max="20" value={quantity} onChange={e=>setQuantity(Math.min(20,Math.max(1,Number(e.target.value)||1)))}/><button type="button" onClick={()=>setQuantity(Math.min(20,quantity+1))} aria-label="Increase quantity">+</button></div><strong>Total: KES {money(selected.price*quantity)}</strong></div><div className="form-grid"><label>Full name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your full name"/>{errors.name&&<small className="error">{errors.name}</small>}</label><label>Phone number<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="07XX XXX XXX"/>{errors.phone&&<small className="error">{errors.phone}</small>}</label><label className="full">Gmail / Email<input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@gmail.com"/>{errors.email&&<small className="error">{errors.email}</small>}</label></div><button className="button gold full-button" onClick={()=>validate()&&setStep('payment')}>Continue to payment <ArrowRight size={17}/></button></>}
      {step==='payment' && <><p className="eyebrow">STEP 2 OF 2</p><h2>Complete payment.</h2><div className="order-summary"><span>{quantity} × {selected.name}</span><strong>KES {money(selected.price*quantity)}</strong></div><div className="payment-note"><ShieldCheck size={19}/><div><b>M-Pesa secure checkout</b><p>Confirm below to receive an M-Pesa prompt. Your tickets are generated only after payment is confirmed.</p></div></div>{payMessage&&<p className={`payment-status ${payState}`}>{payMessage}</p>}<button className="button gold full-button" onClick={startPayment} disabled={busy}>{payState==='sending'?'Sending M-Pesa prompt…':busy?'Waiting for payment…':'Send M-Pesa prompt'} {busy?<Clock3 size={17}/>:<Check size={17}/>}</button><button className="back-link" disabled={busy} onClick={()=>setStep('details')}>Back to details</button></>}
    </div></div>}
  </div>;
}

function TicketCards({ onSelect }: { onSelect: (ticket: TicketType) => void }) {
  return <div className="ticket-grid">{tickets.map(t=><article className={t.id==='vip'?'ticket-option featured':'ticket-option'} key={t.id}>{t.id==='vip'&&<span className="popular">MOST POPULAR</span>}<p className="ticket-tier">{t.name}</p><div className="price"><small>KES</small><strong>{money(t.price)}</strong></div><p>{t.description}</p><button className="button outline" onClick={()=>onSelect(t)}>Select {t.name} <ArrowRight size={16}/></button></article>)}</div>;
}
function PageIntro({eyebrow,title,text}:{eyebrow:string;title:string;text:string}) { return <div className="page-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></div>; }
function ContactCard({title,text,href,action}:{title:string;text:string;href:string;action:string}) { return <article className="contact-card"><div className="contact-icon"><Phone size={20}/></div><h2>{title}</h2><p>{text}</p><a className="text-link" href={href} target={href.startsWith('http')?'_blank':undefined} rel={href.startsWith('http')?'noreferrer':undefined}>{action} <ArrowRight size={16}/></a></article>; }
