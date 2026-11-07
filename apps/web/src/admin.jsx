import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Icon from './icons.jsx';
import { api } from './api-client.js';
import { AdminApp } from './admin-app.jsx';
import './admin.css';

function normalizePhone(value){let d=String(value||'').replace(/\D/g,'');if(d.startsWith('998'))d=d.slice(3);return d.length===9?`+998${d}`:''}
function formatPhone(value){let d=String(value||'').replace(/\D/g,'');if(d.startsWith('998'))d=d.slice(3);d=d.slice(0,9);return d?`+998-${[d.slice(0,2),d.slice(2,5),d.slice(5,7),d.slice(7,9)].filter(Boolean).join('-')}`:''}
function AdminRoot(){
  const [user,setUser]=useState(null),[boot,setBoot]=useState(false),[auth,setAuth]=useState(false),[step,setStep]=useState('phone'),[phone,setPhone]=useState(''),[challenge,setChallenge]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{api('/bootstrap').then(d=>setUser(d.user)).catch(e=>setError(e.message)).finally(()=>setBoot(true))},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(t)},[notice]);
  async function send(e){e.preventDefault();const normalized=normalizePhone(phone);if(!normalized){setError('Telefon raqamini to‘liq kiriting.');return}setBusy(true);setError('');try{const d=await api('/auth/otp',{method:'POST',body:{phone:normalized}});setChallenge(d.challengeId);setStep('code')}catch(e){setError(e.message)}finally{setBusy(false)}}
  async function verify(e){e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{const d=await api('/auth/verify',{method:'POST',body:{challengeId:challenge,phone:normalizePhone(phone),code:f.get('code'),name:f.get('name')}});setUser(d.user);setAuth(false);setStep('phone');if(d.user?.role!=='admin')setError('Bu hisobda boshqaruv paneliga ruxsat yo‘q.')}catch(e){setError(e.message)}finally{setBusy(false)}}
  async function logout(){try{await api('/auth/logout',{method:'POST'});setUser(null);setNotice('Tizimdan chiqdingiz.')}catch(e){setError(e.message)}}
  const siteUrl=import.meta.env.VITE_SITE_URL||'https://e-uylar.uz';
  return <div className="admin-shell">
    <header className="admin-topbar"><a className="admin-brand" href="/"><span className="admin-brand-icon"><Icon name="home"/></span><span>Uy Joyla<small>Boshqaruv paneli</small></span></a><div className="admin-top-actions">{user?.role==='admin'&&<><span className="admin-user"><Icon name="user"/>{user.name||'Administrator'}</span><button className="btn outline" onClick={logout}>Chiqish</button></>}<a className="btn admin-site-link" href={siteUrl}>Saytga qaytish <Icon name="arrow"/></a></div></header>
    {error&&<div className="admin-alert" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="Xabarni yopish">×</button></div>}
    {notice&&<div className="admin-toast" role="status">{notice}</div>}
    <AdminApp user={user} boot={boot} openAuth={()=>{setAuth(true);setError('')}} setNotice={setNotice} setError={setError}/>
    {auth&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget){setAuth(false);setError('')}}}><section className="modal panel admin-auth" role="dialog" aria-modal="true" aria-labelledby="admin-auth-title"><button className="modal-close" onClick={()=>setAuth(false)} aria-label="Yopish">×</button><div className="admin-auth-icon"><Icon name="user"/></div><h2 id="admin-auth-title">Administrator kirishi</h2>{step==='phone'?<form onSubmit={send}><p className="muted">Tasdiqlangan administrator telefon raqamini kiriting.</p><label className="field"><span>Telefon raqami</span><input type="tel" inputMode="numeric" autoComplete="tel" placeholder="+998-__-___-__-__" value={phone} onChange={e=>setPhone(formatPhone(e.target.value))} required/></label><button className="btn primary full" disabled={busy||!normalizePhone(phone)}>{busy?'Yuborilmoqda…':'Davom etish'}</button></form>:<form onSubmit={verify}><p className="muted">{phone} raqamiga yuborilgan kodni kiriting.</p><label className="field"><span>Tasdiqlash kodi</span><input name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength="6" maxLength="6" required/></label><label className="field"><span>Ism va familiya</span><input name="name" autoComplete="name" minLength="2" maxLength="100" required/></label><button className="btn primary full" disabled={busy}>{busy?'Tekshirilmoqda…':'Kirish'}</button><button type="button" className="text-link" onClick={()=>{setStep('phone');setError('')}}>Telefonni o‘zgartirish</button></form>}</section></div>}
  </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AdminRoot/></React.StrictMode>);
