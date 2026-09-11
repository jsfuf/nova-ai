import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { marked } from "marked"
import DOMPurify from "dompurify"
import { motion, AnimatePresence } from "motion/react"
import { Plus, Mic, Settings, MessageSquare, PenSquare, LayoutPanelLeft, ChevronDown, Sparkles, User, Send, Pencil, Trash2, X, LogOut, Copy, Check, FileText } from "lucide-react"
import { auth, rtdb, googleProvider } from "./firebase"
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth"
import { ref as dbRef, onValue, set, remove } from "firebase/database"
import { DEFAULT_MEMORY, subscribeMemory, saveMemory, extractName } from "./memory"

const DEFAULT_BASE = "https://nexa-ai.duckdns.org/9router/v1"
const ENV_BASE = (import.meta.env.VITE_9ROUTER_BASE_URL || "").replace(/"/g,"").trim() || DEFAULT_BASE
const ENV_KEY = (import.meta.env.VITE_9ROUTER_API_KEY || "").replace(/"/g,"").trim()
const LS_RESEARCH = "nova_research"
const FALLBACK_MODELS = ["ollama/gpt-oss:120b","claude-sonnet-4-5","nvidia/minimaxai/minimax-m2.7"]
const VISION_MODELS = ["claude-sonnet-4-5","ollama/gpt-oss:120b","nvidia/minimaxai/minimax-m2.7"]
const LINK_MODELS = ["claude-sonnet-4-5","ollama/gpt-oss:120b","nvidia/minimaxai/minimax-m2.7"]
const CHAT_SEARCH_RE = /(?:have i|have we|had i|did i|did we|do i|have you|have u|do you|do u)\b[\s\S]{0,50}\b(?:chat|chats|chatted|talk|talked|ask|asked|mention|mentioned|say|said|discuss|discussed|conversation|conversations|history|message)\b[\s\S]{0,30}\b(?:about|on|with|regarding|talking)\b/i
const CHAT_SEARCH_RE2 = /\b(?:find|search|go through|look (?:up|for|through)|show me|check)\b[\s\S]{0,40}\b(?:chat|chats|conversation|conversations|history|messages?|talk|talked)\b/i
const STOPWORDS=new Set(["the","and","for","are","that","this","have","has","had","was","were","will","with","about","from","they","you","your","them","what","when","where","which","there","their","would","could","should","been","being","please","tell","show","find","search","look","any","chat","chats","conversation","conversations","chatting","talk","talked","talking","made","make","i","we","me","my","our","us","a","an","to","of","in","on","at","do","did","does","not","just","very","like","really","phone","phones"])
const tokensFrom=(s)=>{ const raw=[...new Set((s||"").toLowerCase().replace(/[^a-z0-9'\s-]/g," ").split(/\s+/))]; return raw.filter(w=> w.length>=3 && !STOPWORDS.has(w)) }
const IMAGE_MODELS=["openai/gpt-image-1","google/imagen-3.0-fast-001","google/imagen-3.0-generate-002","black-forest-labs/flux-1.1-pro","blackforestlabs/flux-1.1-pro","openai/dall-e-3","stabilityai/stable-image-ultra","google/gemini-2.5-flash-image"]
const IMG_GEN_RE=/(?:^|[\s,.;!?])(?:generate|create|make|draw|produce|render|paint)\s+(?:(?:me|us|my)\s+)?(?:an?\s+|a\s+)?(?:image|picture|pic|photo|drawing|art|artwork|wallpaper|avatar|logo|illustration|sketch|meme)\s+/i
const IMG_GEN_RE2=/(?:generate|create|make|draw|produce|render|paint)\b[\s\S]{0,35}\b(?:image|picture|pic|photo|drawing|art|artwork|wallpaper|avatar|logo|illustration)\b/i
const b64ToDataUrl=(b64, type)=>{ const base64=(b64||"").replace(/\s+/g,""); return "data:"+((type||"image/png").startsWith("image/")?type:"image/png")+";base64,"+base64 }
const buildGenPrompt=(text)=>{
  let p=(text||"").replace(/\s+/g," ").trim()
  const m=p.match(/\b(?:generate|create|make|draw|produce|render|paint)\b([\s\S]*)$/i)
  if(m) p=m[1]
  p=p.replace(/^(?:me |us |my )+/i,"").replace(/^(?:an?|a|an|some|the)\s+/i,"")
  p=p.replace(/\s+(?:image|picture|pic|photo|drawing|art|artwork|wallpaper|avatar|logo|illustration|sketch|meme)$/i,"")
  p=p.replace(/^(?:image|picture|pic|photo|drawing|art|artwork|illustration)\s+(?:of|for|about|with)\s+/i,"")
  p=p.replace(/^(?:an?|a|an|some|the)\s+/i,"")
  return (p.trim() || "a beautiful scene").slice(0,300)
}
const generateImageNow=async (text, base, key)=>{
  const prompt=buildGenPrompt(text)
  const shuffled=[...IMAGE_MODELS].sort(()=> Math.random()-0.5)
  for(const model of shuffled){
    try{
      const res=await fetch(`${base}/images/generations`,{ method:"POST", headers:{ "Content-Type":"application/json","Authorization":`Bearer ${key}` }, body:JSON.stringify({ model, prompt, n:1 }) })
      if(!res.ok){ if(res.status===401||res.status===403) return { ok:false, blocked:true }; continue }
      const j=await res.json()
      const d=j?.data?.[0]||j?.images?.[0]||(Array.isArray(j?.output)?j.output[0]:null)||{}
      let url=d?.url||j?.url||null
      if(!url && d?.b64_json) url=b64ToDataUrl(d.b64_json, d?.media_type||j?.media_type||"image/png")
      else if(!url && j?.b64_json) url=b64ToDataUrl(j.b64_json, j?.media_type||"image/png")
      if(!url) continue
      return { ok:true, url, prompt }
    }catch{ continue }
  }
  return { ok:false }
}
const downloadGenerated=async (url)=>{
  try{
    const res=await fetch(url)
    const blob=await res.blob()
    const blobUrl=URL.createObjectURL(blob)
    const a=document.createElement("a")
    a.href=blobUrl; a.download="nova-ai-image.jpg"
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(()=> URL.revokeObjectURL(blobUrl), 2000)
  }catch{
    const a=document.createElement("a")
    a.href=url; a.download="nova-ai-image"; a.target="_blank"; a.rel="noopener"
    document.body.appendChild(a); a.click(); a.remove()
  }
}

function shortTitle(t){ const s=t.trim().replace(/\s+/g," "); if(!s) return "New chat"; if(s.length<=42) return s; const sl=s.slice(0,42); const ls=sl.lastIndexOf(" "); return (ls>18? sl.slice(0,ls):sl)+"..." }
function newId(){ return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4) }
function sanitizeBase(u){ if(!u) return DEFAULT_BASE; return u.replace(/\/+$/,"").replace(/^"+|"+$/g,"").trim() }
marked.setOptions({ gfm:true, breaks:true })
function renderMarkdown(md){ try{ return DOMPurify.sanitize(marked.parse(md||"")) }catch{ return DOMPurify.sanitize(`<p>${(md||"").replace(/</g,"&lt;")}</p>`) } }

function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") }
function renderMarkdownWithCanvas(md){
  try{
    const html=marked.parse(md||"")
    const withCanvas=html.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (m, attrs, code)=>{
      const lang=(attrs.match(/language-([a-z0-9_-]+)/i)?.[1]||"").trim()
      const label=lang? escapeHtml(lang) : "code"
      return `<div class="code-canvas"><div class="code-canvas-head"><span class="code-canvas-lang">${label}</span><button type="button" class="code-canvas-copy" aria-label="Copy code"><span class="code-canvas-copy-label">Copy</span></button></div><pre><code${attrs}>${code}</code></pre></div>`
    })
    return DOMPurify.sanitize(withCanvas)
  }catch{ return DOMPurify.sanitize(`<p>${escapeHtml(md||"")}</p>`) }
}

function ImageStrip({ images }){
  if(!images || !images.length) return null
  return (
    <div className="nova-image-strip" aria-label="Related images">
      <div className="nova-image-track">
        {images.slice(0,3).map((img,i)=>(
          <div key={i} className="nova-image-card" title={img.title||"Image"}>
            <img src={img.url} alt={img.alt||img.title||"Image"} loading="lazy" onError={e=> e.currentTarget.style.display="none"} />
            <span className="nova-image-meta"><span>{img.title||"Image"}</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}
const GREETING_RE=/^(hi|hello|hey|how are you|how are u|good morning|good afternoon|good evening|hiya|yo)[\s!?.,]*$/i
async function searchImages(query){
  if(!query) return []
  const q=query.trim()
  if(GREETING_RE.test(q) || q.length<3) return []
  try{
    let titles=[]
    if(/dwayne|the rock|johnson/i.test(q)){
      const cat=await fetch(`https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Dwayne_Johnson&cmtype=file&cmlimit=3&format=json&origin=*`).then(r=>r.json())
      titles=(cat?.query?.categorymembers||[]).map(m=>m.title).slice(0,3)
    } else {
      const s=await fetch(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srnamespace=6&srlimit=3&format=json&origin=*`).then(r=>r.json())
      titles=(s?.query?.search||[]).map(x=>x.title).slice(0,3)
    }
    if(titles.length){
      const infos=await fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=${titles.map(t=>encodeURIComponent(t)).join("|")}&prop=imageinfo&iiprop=url&format=json&origin=*`).then(r=>r.json())
      const pages=infos?.query?.pages||{}
      const urls=Object.values(pages).map(p=>p.imageinfo?.[0]?.url).filter(Boolean)
      if(urls.length) return urls.slice(0,3).map((url,i)=>({ url, title:(titles[i]||q).replace("File:",""), alt:q }))
    }
  }catch(e){ console.debug("wiki fail",e) }
  return []
}

function AuthScreen({ onAuth }){
  const [mode,setMode]=useState("signin")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [err,setErr]=useState("")
  const [loading,setLoading]=useState(false)
  const submit=async (e)=>{
    e.preventDefault(); setErr(""); setLoading(true)
    try{
      if(mode==="signin") await signInWithEmailAndPassword(auth,email,password)
      else await createUserWithEmailAndPassword(auth,email,password)
    }catch(ex){ setErr(ex.message||"Authentication failed") } finally{ setLoading(false) }
  }
  const google=async ()=>{
    setErr(""); setLoading(true)
    try{ await signInWithPopup(auth, googleProvider) }catch(ex){ setErr(ex.message||"Google sign-in failed") } finally{ setLoading(false) }
  }
  return (
    <div className="flex h-screen w-full overflow-hidden bg-black text-gray-200 relative">
      <div className="fixed inset-0 bg-black">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/20 blur-[120px] mix-blend-screen animate-pulse" style={{animationDuration:"8s"}} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-slate-800/40 blur-[120px] mix-blend-screen animate-pulse" style={{animationDuration:"10s", animationDelay:"2s"}} />
      </div>
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage:"url('data:image/svg+xml,%3Csvg viewBox=\"0 0 200 200\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cfilter id=\"noiseFilter\"%3E%3CfeTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/%3E%3C/filter%3E%3Crect width=\"100%25\" height=\"100%25\" filter=\"url(%23noiseFilter)\"/%3E%3C/svg%3E')"}}></div>
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="w-full max-w-[420px] glass-panel rounded-[32px] p-8 flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center"><Sparkles className="w-6 h-6 text-gray-200" /></div>
            <h1 className="text-[22px] font-semibold tracking-tight text-white">Welcome to Nova AI</h1>
            <p className="text-sm text-gray-400 leading-relaxed">Sign in to chat with Nova AI — your high-end collection of models for the best results.</p>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input type="email" required value={email} onChange={e=> setEmail(e.target.value)} placeholder="Email address" className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/20 focus:bg-white/[0.06]" />
            <input type="password" required value={password} onChange={e=> setPassword(e.target.value)} placeholder="Password (min 6 chars)" className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/20 focus:bg-white/[0.06]" />
            {err && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 break-words">{err}</div>}
            <button type="submit" disabled={loading} className="w-full py-3 rounded-full bg-white text-black text-sm font-semibold disabled:opacity-60">{loading?"Please wait…": mode==="signin"?"Continue":"Create account"}</button>
          </form>
          <div className="flex items-center gap-3"><div className="h-px flex-1 bg-white/10"/><span className="text-xs text-gray-500">or</span><div className="h-px flex-1 bg-white/10"/></div>
          <button onClick={google} disabled={loading} className="w-full py-3 rounded-full glass-button flex items-center justify-center gap-2 text-sm font-medium text-white">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <button onClick={()=> { setMode(mode==="signin"?"signup":"signin"); setErr("") }} className="text-xs text-gray-400 text-center hover:text-gray-200">
            {mode==="signin" ? "No account? Create one" : "Already have an account? Sign in"}
          </button>
          <p className="text-[11px] text-gray-500 text-center leading-relaxed">By continuing, you agree to Nova AI Terms. Chats are saved to your Realtime Database.</p>
        </motion.div>
      </div>
    </div>
  )
}

export default function App({ updateNotice: initialUpdateNotice }){
  const [user,setUser]=useState(null)
  const [authReady,setAuthReady]=useState(false)
  const [sidebarOpen,setSidebarOpen]=useState(true)
  const [conversations,setConversations]=useState([])
  const [activeId,setActiveId]=useState("")
  const [input,setInput]=useState("")
  const [isStreaming,setIsStreaming]=useState(false)
  const [streamText,setStreamText]=useState("")
  const [showLoader,setShowLoader]=useState(false)
  const [error,setError]=useState("")
  const [showSettings,setShowSettings]=useState(false)
  const [settingsTab,setSettingsTab]=useState("general")
  const [researchMode,setResearchMode]=useState(()=>{ try{ return localStorage.getItem(LS_RESEARCH)==="1" }catch{ return false } })
  const [attachedImage,setAttachedImage]=useState(null)
  const [cameraOn,setCameraOn]=useState(false)
  const [cameraError,setCameraError]=useState("")
  const [cameraFlash,setCameraFlash]=useState(false)
  const [isGenImage,setIsGenImage]=useState(false)
  const [isRecording,setIsRecording]=useState(false)
  const [showPlus,setShowPlus]=useState(false)
  const [dragOver,setDragOver]=useState(false)
  const [isMobile,setIsMobile]=useState(false)
  const [ctxMenu,setCtxMenu]=useState(null)
  const [renameTarget,setRenameTarget]=useState(null)
  const [renameVal,setRenameVal]=useState("")
  const [deleteTarget,setDeleteTarget]=useState(null)
  const [copiedId,setCopiedId]=useState(null)
  const [attachedDoc,setAttachedDoc]=useState(null)
  const abortRef=useRef(null), listRef=useRef(null), taRef=useRef(null), rafRef=useRef(null), streamFullRef=useRef(""), fileInputRef=useRef(null), recognitionRef=useRef(null), mediaRecorderRef=useRef(null), longPressRef=useRef(null), videoRef=useRef(null), streamRef=useRef(null)
  const [conversationsLoading,setConversationsLoading]=useState(true)
  const activeConv=useMemo(()=>{ if(!conversations.length) return null; return conversations.find(c=>c.id===activeId)||conversations[0] },[conversations,activeId])
  const [updateToast,setUpdateToast]=useState(initialUpdateNotice ? "Updated" : "")

  useEffect(()=>{ if(updateToast) setTimeout(()=> setUpdateToast(""), 1500) },[updateToast])
  const [memory,setMemory]=useState(null)

  useEffect(()=>{
    if(!user) return
    const uid=user.uid
    const unsub=subscribeMemory(uid, (m)=>{ setMemory(m) })
    return ()=> unsub()
  },[user])

  useEffect(()=>{ try{ localStorage.setItem(LS_RESEARCH, researchMode?"1":"0")}catch{} },[researchMode])
  useEffect(()=>{
    const unsub=onAuthStateChanged(auth, (u)=>{ setUser(u); setAuthReady(true) })
    return ()=> unsub()
  },[])
  useEffect(()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition
    if(SR){
      const rec=new SR(); rec.continuous=false; rec.interimResults=true; rec.lang="en-US"
      rec.onresult=(e)=>{ let t=""; for(let i=0;i<e.results.length;i++) t+=e.results[i][0].transcript; setInput(t) }
      rec.onend=()=> setIsRecording(false); rec.onerror=()=> setIsRecording(false); recognitionRef.current=rec
    }
  },[])
  // — RTDB per-user sync: users/{uid}/chats — source of truth, keep pending local chats to avoid blank on "hi"
  useEffect(()=>{
    if(!authReady) return
    if(!user){
      setConversations([])
      setActiveId("")
      setConversationsLoading(false)
      return
    }
    setConversationsLoading(true)
    const uid=user.uid
    const chatsRef=dbRef(rtdb, `users/${uid}/chats`)
    const unsub=onValue(chatsRef, (snap)=>{
      const val=snap.val()
      if(!val || typeof val !== 'object' || Object.keys(val).length===0){
        // DB empty — keep any pending local chat (prevents "hi" going blank before sync)
        setConversations(prev=> prev.length ? prev : [])
        // keep activeId if we have a pending chat
        setActiveId(prev=>{
          if(prev) return prev
          return ""
        })
        setConversationsLoading(false)
        return
      }
      const arr=Object.values(val).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0))
      const normalized=arr.map(c=>{
        if(c.messages && typeof c.messages==='object' && !Array.isArray(c.messages)){
          const msgs=Object.values(c.messages).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))
          return {...c, messages: msgs}
        }
        return {...c, messages: c.messages||[]}
      })
      setConversations(prev=>{
        // merge: keep any pending local chat not yet in RTDB (prevents blank on fresh 'hi')
        const serverIds=new Set(normalized.map(n=>n.id))
        const pending=prev.filter(p=> !serverIds.has(p.id))
        const merged=[...normalized, ...pending].sort((a,b)=> (b.createdAt||0)-(a.createdAt||0))
        try{ if(JSON.stringify(prev)===JSON.stringify(merged)) return prev }catch{}
        return merged
      })
      setActiveId(prev=>{
        if(prev && (normalized.find(x=>x.id===prev) || prev)) return prev
        if(normalized[0]) return normalized[0].id
        return ""
      })
      setConversationsLoading(false)
    }, (err)=>{ console.warn("RTDB read",err); setConversationsLoading(false) })
    return ()=> { try{ unsub() }catch{} }
  },[authReady, user])
  useEffect(()=>{ if(!taRef.current) return; taRef.current.style.height="auto"; taRef.current.style.height=Math.min(taRef.current.scrollHeight,140)+"px" },[input])
  useEffect(()=>{ const onResize=()=> setIsMobile(window.innerWidth<768); onResize(); window.addEventListener("resize",onResize); return ()=> window.removeEventListener("resize",onResize) },[])
  useEffect(()=>{ if(isMobile) setSidebarOpen(false) },[isMobile])
  useEffect(()=>{ return ()=>{ if(streamRef.current) streamRef.current.getTracks().forEach(t=> t.stop()) } },[])

  const stopCamera=()=>{ if(streamRef.current){ streamRef.current.getTracks().forEach(t=> t.stop()); streamRef.current=null } }
  const cancelCamera=()=>{ stopCamera(); setCameraOn(false); setCameraError(""); setShowPlus(false) }
  const openCamera=async ()=>{
    setShowPlus(false); setCameraError(""); setCameraOn(true)
    try{
      if(!navigator.mediaDevices?.getUserMedia){ setCameraError("Camera not supported on this device"); return }
      const stream=await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" }, audio:false })
      streamRef.current=stream
      const v=videoRef.current
      if(v){ v.srcObject=stream; try{ await v.play() }catch{} }
    }catch{ setCameraError("Camera permission denied or unavailable") }
  }
  const capturePhoto=()=>{
    const video=videoRef.current; if(!video) return
    try{
      const canvas=document.createElement("canvas")
      canvas.width=video.videoWidth||1280; canvas.height=video.videoHeight||960
      canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height)
      const url=canvas.toDataURL("image/jpeg",0.85)
      setCameraFlash(true)
      setTimeout(()=>{
        stopCamera(); setCameraOn(false); setCameraError(""); setCameraFlash(false)
        setAttachedImage({ name:"Camera", url })
      }, 220)
    }catch{ setCameraError("Could not capture photo") }
  }
  useEffect(()=>{ if(!showPlus) return; const onDocClick=(e)=>{ const plusEl=document.getElementById("nova-plus-wrap"); const ta=taRef.current; if(plusEl && !plusEl.contains(e.target) && ta && !ta.contains(e.target)) setShowPlus(false) }; document.addEventListener("mousedown",onDocClick); return ()=> document.removeEventListener("mousedown",onDocClick) },[showPlus])
  useEffect(()=>{ const onClick=()=> setCtxMenu(null); if(ctxMenu) document.addEventListener("click",onClick); return ()=> document.removeEventListener("click",onClick) },[ctxMenu])
  // delegation for canvas copy buttons — copies the actual <code> text, not an attribute
  useEffect(()=>{
    const handler=(e)=>{
      const btn=e.target.closest?.(".code-canvas-copy")
      if(!btn) return
      const canvas=btn.closest(".code-canvas")
      const codeEl=canvas?.querySelector("pre code")
      const text=codeEl ? codeEl.textContent : ""
      if(!text) return
      navigator.clipboard?.writeText(text).then(()=>{
        const label=btn.querySelector(".code-canvas-copy-label")
        if(label){ const prev=label.textContent; label.textContent="Copied!"; setTimeout(()=> label.textContent=prev, 1200) }
        btn.classList.add("copied"); setTimeout(()=> btn.classList.remove("copied"), 1200)
      }).catch(()=>{})
    }
    document.addEventListener("click", handler)
    return ()=> document.removeEventListener("click", handler)
  },[])
  const copyChat=(text, id)=>{
    navigator.clipboard?.writeText(text||"").then(()=>{
      setCopiedId(id); setTimeout(()=> setCopiedId(c=> c===id? null : c), 1400)
    }).catch(()=>{})
  }
  useEffect(()=>{ if(listRef.current) listRef.current.scrollTop=listRef.current.scrollHeight },[activeConv?.messages, streamText, showLoader, isGenImage])
  const handleFiles=useCallback(async (files)=>{
    const f=files[0]; if(!f) return
    if(f.size>10*1024*1024){ setError("File must be under 10MB"); return }
    const isImage=f.type.startsWith("image/")
    const isPdf=f.type==="application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    const isWord=f.type==="application/msword" || f.type==="application/vnd.openxmlformats-officedocument.wordprocessingml.document" || f.name.toLowerCase().endsWith(".doc") || f.name.toLowerCase().endsWith(".docx")
    const isText=f.type.startsWith("text/") || f.name.toLowerCase().endsWith(".txt") || f.name.toLowerCase().endsWith(".md") || f.name.toLowerCase().endsWith(".csv")
    if(isImage){
      const reader=new FileReader(); reader.onload=()=>{ setAttachedImage({ name:f.name, url:reader.result, file:f }); setAttachedDoc(null); setShowPlus(false) }; reader.readAsDataURL(f); return
    }
    if(isPdf || isWord || isText){
      const reader=new FileReader()
      reader.onload=()=>{
        const result=reader.result
        let text=""
        if(typeof result==="string") text=result.slice(0,12000)
        setAttachedDoc({ name:f.name, type:f.type||"document", text, kind: isPdf?"pdf": isWord?"word":"text" })
        setAttachedImage(null); setShowPlus(false)
      }
      reader.readAsText(f)
      return
    }
    setError("Unsupported file type. Use images, PDF or Word.")
  },[])
  const persistChat=useCallback(async (chat)=>{
    const uid=auth.currentUser?.uid; if(!uid) return
    try{ await set(dbRef(rtdb, `users/${uid}/chats/${chat.id}`), { ...chat, updatedAt: Date.now() }) }catch(e){ console.debug("persist",e)}
  },[])
  const createNewChat=useCallback(async()=>{
    // abort any in-flight reply so next 'hi' is never blocked as blank
    try{ abortRef.current?.abort() }catch{}
    if(rafRef.current){ cancelAnimationFrame(rafRef.current); rafRef.current=null }
    streamFullRef.current=""
    setIsStreaming(false); setShowLoader(false); setStreamText(""); setError("")
    // prevent spamming empty chats — only one empty "New chat" allowed, not persisted until user talks
    const activeIsEmpty = activeConv && (activeConv.messages||[]).length===0
    const existingEmpty = conversations.find(c=> (c.messages||[]).length===0)
    if(activeIsEmpty){
      setAttachedImage(null); setAttachedDoc(null); setShowPlus(false)
      return
    }
    if(existingEmpty){
      setActiveId(existingEmpty.id); setAttachedImage(null); setAttachedDoc(null); setShowPlus(false)
      return
    }
    const id=newId()
    const conv={ id, title:"New chat", messages:[], createdAt:Date.now(), updatedAt:Date.now() }
    setConversations(p=>[conv,...p]); setActiveId(id); setAttachedImage(null); setAttachedDoc(null); setShowPlus(false)
  },[activeConv, conversations])
  const updateActive=(updater)=>{
    const targetId=activeConv?.id || activeId || conversations[0]?.id
    if(!targetId) return
    setConversations(prev=> prev.map(c=> c.id===targetId ? updater(c):c))
  }
  const doRename=()=>{
    if(!renameTarget) return
    const t=renameVal.trim()
    if(!t) return
    setConversations(prev=> prev.map(c=> c.id===renameTarget ? {...c, title:t}:c))
    const uid=auth.currentUser?.uid; if(uid) set(dbRef(rtdb, `users/${uid}/chats/${renameTarget}/title`), t).catch(()=>{})
    setRenameTarget(null); setRenameVal("")
  }
  const doDelete=async ()=>{
    if(!deleteTarget) return
    const id=deleteTarget
    const uid=auth.currentUser?.uid
    const wasActive=activeId===id
    setDeleteTarget(null)
    if(wasActive){
      const rem=conversations.filter(c=>c.id!==id)
      setActiveId(rem[0]?.id||"")
    }
    setConversations(prev=> prev.filter(c=>c.id!==id))
    if(uid) try{ await remove(dbRef(rtdb, `users/${uid}/chats/${id}`)) }catch(e){ console.debug("remove",e)}
  }
  const handleSend=async (overrideText)=>{
    const text=(overrideText ?? input).trim()
    if(!text && !attachedImage && !attachedDoc) return
    const saidName = text ? extractName(text) : null
    let memForPrompt = memory
    if(saidName && user){
      const next={ ...(memory||DEFAULT_MEMORY()), name:saidName, updatedAt:Date.now() }
      setMemory(next); memForPrompt=next
      saveMemory(user.uid, next).catch(()=>{})
    }
    let histContext=""
    const isChatSearch= text ? (CHAT_SEARCH_RE.test(text)||CHAT_SEARCH_RE2.test(text)) : false
    if(isChatSearch && text && conversations.length){
      const topicM=text.match(/\b(?:about|on|with|regarding|involving)\b\s+([\s\S]+)$/i)
      const topicToks=tokensFrom(topicM? topicM[1] : "")
      const qToks=tokensFrom(text)
      const toks=topicToks.length ? topicToks : qToks
      if(toks.length){
        const foundChats=[]
        for(const c of conversations){
          const msgs=Array.isArray(c.messages) ? c.messages : []
          let found=null
          for(const m of msgs){
            const hay=(" "+(m.content||"")+" ").toLowerCase()
            const matched=toks.filter(t2=> hay.includes(t2))
            if(matched.length){ found={ chatTitle:c.title, time:c.updatedAt||c.createdAt, snippet:(m.content||"").replace(/\s+/g," ").trim().slice(0,180), matched }; break }
          }
          if(found) foundChats.push(found)
        }
        if(foundChats.length){
          histContext="\n\n[SYSTEM: The user asked you to search their own chat history. You searched and found these real past chats that match — answer the user using these actual facts:\n"+foundChats.slice(0,5).map(h=>`- Chat "${h.chatTitle}" (${new Date(h.time).toLocaleString()}): "...${h.snippet}..."`).join("\n")+"\n]"
        } else {
          histContext="\n\n[SYSTEM: The user asked about their chat history but you found NO past chats matching. Tell them honestly nothing matched and offer to search something else.]"
        }
      }
    }
    // if a previous reply is still streaming (e.g. you just opened a new chat and said "hi"), abort it and continue — never leave a blank bubble
    if(isStreaming){
      try{ abortRef.current?.abort() }catch{}
      if(rafRef.current){ cancelAnimationFrame(rafRef.current); rafRef.current=null }
      streamFullRef.current=""; setStreamText(""); setShowLoader(false); setIsStreaming(false)
      await new Promise(r=> setTimeout(r, 40))
    }
    const base=sanitizeBase(ENV_BASE), keyToUse=(ENV_KEY||"").trim()
    if(!keyToUse){ setError("Service unavailable."); return }
    const hasImage=!!attachedImage
    let userContent=text
    if(hasImage && !text) userContent="Describe this image in detail"
    if(attachedDoc && !text) userContent=`Summarize this document: ${attachedDoc.name}`
    if(attachedDoc && text && attachedDoc.text) userContent = text + `\n\n[Attached document: ${attachedDoc.name} (${attachedDoc.kind}) — excerpt: ${attachedDoc.text.slice(0,6000)}]`
    else if(attachedDoc && text) userContent = text + ` [Attached: ${attachedDoc.name}]`
    const uid=auth.currentUser?.uid
    // ensure a chat exists for new users with empty DB — create + persist immediately
    let targetChatId=activeConv?.id || activeId || conversations[0]?.id
    const targetChat=conversations.find(c=>c.id===targetChatId) || activeConv || null
    const userMsg={ role:"user", content:userContent, image: attachedImage?.url||null, doc: attachedDoc ? { name: attachedDoc.name, kind: attachedDoc.kind } : null, createdAt:Date.now(), id:newId() }
    let updatedUserChat
    if(!targetChatId){
      targetChatId=newId()
      updatedUserChat={ id:targetChatId, title: shortTitle(text||"Image message"), messages:[userMsg], createdAt:Date.now(), updatedAt:Date.now() }
      setConversations(prev=> prev.length ? [updatedUserChat, ...prev] : [updatedUserChat]); setActiveId(targetChatId)
      if(uid) try{ await set(dbRef(rtdb, `users/${uid}/chats/${targetChatId}`), updatedUserChat) }catch(e){ console.debug("save new chat",e)}
    } else {
      const baseChat=targetChat || { id:targetChatId, title:"New chat", messages:[], createdAt:Date.now() }
      const nextMessages=[...(baseChat.messages||[]), userMsg]
      const isFirst=(baseChat.messages||[]).length===0
      updatedUserChat={ ...baseChat, id:targetChatId, title: isFirst? shortTitle(text||"Image message"):baseChat.title, messages: nextMessages, updatedAt:Date.now(), createdAt: baseChat.createdAt||Date.now() }
      setConversations(prev=> prev.map(c=> c.id===targetChatId? updatedUserChat: c))
      if(!activeId) setActiveId(targetChatId)
      if(uid) try{ await set(dbRef(rtdb, `users/${uid}/chats/${targetChatId}`), updatedUserChat) }catch(e){ console.debug("save user msg",e)}
    }

    const genImageIntent = text ? (IMG_GEN_RE.test(text)||IMG_GEN_RE2.test(text)) : false
    if(genImageIntent && user && keyToUse){
      const uid3=auth.currentUser?.uid
      setInput(""); setError("")
      setAttachedImage(null); setAttachedDoc(null); setShowPlus(false)
      setIsStreaming(true); setIsGenImage(true); setShowLoader(false); setStreamText("")
      let assistantMsg
      try{
        const gen=await generateImageNow(text, base, keyToUse)
        assistantMsg = gen.ok
          ? { role:"assistant", content:"", imageGen:{ url:gen.url, alt:gen.prompt }, createdAt:Date.now(), id:newId() }
          : { role:"assistant", content: gen.blocked ? "I'm sorry, but image generation isn't available right now." : "I'm sorry, but I can't generate any image — no image model is available.", createdAt:Date.now(), id:newId() }
      }catch{ assistantMsg={ role:"assistant", content:"I'm sorry, but I can't generate any image right now.", createdAt:Date.now(), id:newId() } }
      setIsGenImage(false); setShowLoader(false); setStreamText("")
      const finalGenChat={ ...updatedUserChat, messages:[...updatedUserChat.messages, assistantMsg], updatedAt:Date.now() }
      setConversations(prev=> prev.map(c=> c.id===targetChatId? finalGenChat : c))
      if(uid3) try{ await set(dbRef(rtdb, `users/${uid3}/chats/${targetChatId}`), finalGenChat) }catch(e){ console.debug("save gen",e) }
      if(text && user){
        const entry={ t:Date.now(), s:text.trim().slice(0,120) }
        const prevMem=memForPrompt||memory||DEFAULT_MEMORY()
        const next={ ...prevMem, name:(saidName||prevMem.name||""), rollup:[...(Array.isArray(prevMem.rollup)?prevMem.rollup:[]), entry].slice(-12), updatedAt:Date.now() }
        setMemory(next); saveMemory(user.uid, next).catch(()=>{})
      }
      setIsStreaming(false); setIsGenImage(false)
      return
    }

    setInput(""); setError("")
    setAttachedImage(null); setAttachedDoc(null); setShowPlus(false)
    setIsStreaming(true); setStreamText(""); streamFullRef.current=""; setShowLoader(true)
    const controller=new AbortController(); abortRef.current=controller
    const payloadMessages=updatedUserChat.messages.map((m,i,arr)=>{
      const mcontent = (histContext && m.role==="user" && i===arr.length-1) ? m.content + histContext : m.content
      if(m.image && m.role==="user") return { role:m.role, content:[{type:"text", text:mcontent},{type:"image_url", image_url:{url:m.image}}] }
      return { role:m.role, content:mcontent }
    })
    // keep targetChatId in closure for assistant save
    const _saveTargetId=targetChatId
    const scheduleFlush=()=>{ if(rafRef.current) return; rafRef.current=requestAnimationFrame(()=>{ setStreamText(streamFullRef.current); rafRef.current=null }) }
    const wantsTable=/(compare|comparison|differentiat|distinguish|versus|\bvs\b|\bvs\.|between\s+.+\sand\s+|classify|classification|pros\s*and\s*cons|advantages?.*disadvantages|tabular|\btable\b)/i.test(text)
    const needsLink=/(provide.*link|give.*link|send.*link|share.*link|youtube.*link|link.*youtube|video.*link|link.*video|cut.*video|youtube\s*video)/i.test(text)
    const isDefineExplain=/(\bdefine\b|\bexplain\b|\bwhat\s+is\b|\bwho\s+is\b|\btell\s+me\s+about\b)/i.test(text)
    let memoryCtx=""
    if(memForPrompt){
      if(memForPrompt.name) memoryCtx+=`The user's name is ${memForPrompt.name}. Always address them as ${memForPrompt.name}. `
      if(Array.isArray(memForPrompt.rollup) && memForPrompt.rollup.length){
        const hist=memForPrompt.rollup.map(e=>{ const d=new Date(e.t).toLocaleString([], {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"}); return `[${d}] ${e.s}` }).join(" | ")
        memoryCtx+=`Past chats you remember with this user: ${hist}. `
      }
    }
    const identity="You are Nova AI, created by Daniel, co-founder of Nova AI. Nova AI is a curated collection of high-end AI models assembled to deliver the best results across reasoning, creativity and research. If the user asks who made you, what model you are, who built you, or similar, always answer: I was made by Daniel, co-founder of Nova AI — a platform that unites elite AI models for superior performance. Never claim to be made by Anthropic, OpenAI, Meta, Google or others. Always go straight to the point and hit the nail on the head — be direct, no filler. Keep responses concise — short paragraphs, bullets, no fluff. When asked to define or explain, give a clear structured answer with headings and bullet points, but stay brief. "
      + (memoryCtx ? ` You have a private memory of this user from previous chats. ${memoryCtx} Use it naturally to personalize your answers — call them by name and reference what you talked about before when it is relevant. Keep it subtle. ` : "")
    let extra=""
    if(wantsTable){
      extra += " The user explicitly wants a comparison/classification — provide a concise markdown table (3-6 rows, 2-4 columns) to structure it, then give the requested code/content in a fenced Canvas block if they asked for code. "
    } else {
      extra += " Do NOT create a table for simple definitions like 'who is the rock' or 'who is X' — use short paragraphs and bullets only. Tables are ONLY for compare/differentiate/classify/between/versus/pros-cons requests. "
    }
    if(needsLink){
      extra += " The user explicitly requested links (e.g. YouTube video link) — you MUST provide real clickable markdown links. Include 2-4 relevant YouTube links with titles. "
    } else if(!researchMode){
      extra += " NEVER output lists of links for images — app pastes real images inline. No bare URLs unless the user asked for links. "
    } else {
      extra += " For images, do not output link lists — app pastes images inline. Links only if user asked for video/link. "
    }
    if(isDefineExplain) extra += " This is a define/explain request — be thorough, structured and include images via the app (do not paste image URLs yourself). "
    extra += " For any code request (HTML etc.) output a complete runnable snippet in a single fenced block with language tag (e.g. ```html) — it will render as a glass Canvas with Copy. Keep explanation outside the code block. "
    const systemInstruction=identity + extra
    let modelsToTry
    if(hasImage) modelsToTry=VISION_MODELS
    else if(needsLink) modelsToTry=LINK_MODELS
    else modelsToTry=FALLBACK_MODELS
    const tryStreamWithModel=async (modelId)=>{
      const body={ model:modelId, messages:[{role:"system", content:systemInstruction}, ...payloadMessages], stream:true, temperature:0.7, max_tokens:1500 }
      const res=await fetch(`${base}/chat/completions`,{ method:"POST", headers:{ "Content-Type":"application/json","Authorization":`Bearer ${keyToUse}` }, body:JSON.stringify(body), signal:controller.signal })
      if(!res.ok){
        const txt=await res.text().catch(()=> ""); let msg=txt; try{ const j=JSON.parse(txt); msg=j?.error?.message||txt }catch{}
        if(res.status===401||res.status===403) throw Object.assign(new Error("auth"),{status:res.status})
        if(res.status===404) throw Object.assign(new Error("model404"),{status:res.status})
        throw Object.assign(new Error("http_"+res.status),{body:msg})
      }
      const ct=res.headers.get("content-type")||""
      if(!res.body || !ct.includes("text/event-stream")){
        const j=await res.json(); const content=j?.choices?.[0]?.message?.content||""; if(!content.trim()) throw new Error("empty")
        for(const ch of content){ if(controller.signal.aborted) break; streamFullRef.current+=ch; if(streamFullRef.current.length%6===0) scheduleFlush(); await new Promise(r=> setTimeout(r,3)); if(streamFullRef.current.length===1) setShowLoader(false) }
        scheduleFlush(); if(rafRef.current){ cancelAnimationFrame(rafRef.current); rafRef.current=null; setStreamText(streamFullRef.current) }
        return streamFullRef.current
      }
      const reader=res.body.getReader(), decoder=new TextDecoder("utf-8")
      let buffer="", full=streamFullRef.current, firstChunk=true
      while(true){
        const {done,value}=await reader.read(); if(done) break
        buffer+=decoder.decode(value,{stream:true}); const lines=buffer.split("\n"); buffer=lines.pop()||""
        for(const line of lines){
          const t=line.trim(); if(!t||!t.startsWith("data:")) continue
          const data=t.slice(5).trim(); if(data==="[DONE]"){ buffer=""; break }
          try{ const json=JSON.parse(data); const delta=json?.choices?.[0]?.delta?.content||""; if(delta){ full+=delta; streamFullRef.current=full; if(firstChunk){ setShowLoader(false); firstChunk=false } scheduleFlush() } }catch{}
        }
      }
      if(rafRef.current){ cancelAnimationFrame(rafRef.current); rafRef.current=null }
      setStreamText(full); if(!full.trim()) throw new Error("empty"); return full
    }
    const tryNonStreamWithModel=async (modelId)=>{
      const body={ model:modelId, messages:[{role:"system", content:systemInstruction}, ...payloadMessages], stream:false, temperature:0.7, max_tokens:1500 }
      const res=await fetch(`${base}/chat/completions`,{ method:"POST", headers:{ "Content-Type":"application/json","Authorization":`Bearer ${keyToUse}` }, body:JSON.stringify(body), signal:controller.signal })
      if(!res.ok) throw new Error("http_"+res.status)
      const j=await res.json(); const c=j?.choices?.[0]?.message?.content||""; if(!c.trim()) throw new Error("empty")
      streamFullRef.current=c; setStreamText(c); setShowLoader(false); return c
    }
    try{
      let final="", lastErr=null
      for(const modelId of modelsToTry){
        try{
          try{ final=await tryStreamWithModel(modelId) }catch(sErr){ if(controller.signal.aborted) throw sErr; if(String(sErr.message)==="auth"||String(sErr.message)==="model404") throw sErr; final=await tryNonStreamWithModel(modelId) }
          if(final && final.trim()) break
        }catch(e){ lastErr=e; if(String(e.message)==="auth") throw e; continue }
      }
      if(!final || !final.trim()){ if(lastErr) throw lastErr; throw new Error("empty") }
      let imgs=[]
      const isGreeting=GREETING_RE.test(text) || text.trim().length<3
      const defineExplainForImage=/(\bdefine\b|\bexplain\b|\bwhat\s+is\b|\bwho\s+is\b|\btell\s+me\s+about\b)/i.test(text)
      const wantsImage=!isGreeting && !hasImage && !attachedDoc && (/(image|picture|photo|wallpaper|diagram|show me|illustrate|visual|generate.*image|create.*image|give me.*image|dwayne|the rock|johnson)/i.test(text) || defineExplainForImage)
      if(wantsImage && text) try{ imgs=await searchImages(text) }catch{}
      if(final.includes("commons.wikimedia.org")||final.includes("images.google.com")||final.includes("instagram.com")){
        final=final.split("\n").filter(l=> !l.includes("commons.wikimedia.org") && !l.includes("images.google.com") && !l.includes("instagram.com")).join("\n").trim()
        if(!final) final="Here are images of "+text+":"
      }
      const assistantMsg={ role:"assistant", content:final, images:imgs, createdAt:Date.now(), id:newId() }
      const uid2=auth.currentUser?.uid
      const finalChat={ ...updatedUserChat, messages:[...updatedUserChat.messages, assistantMsg], updatedAt:Date.now() }
      // prevent 0.5s duplicate: hide streaming bubble in same batch as adding final message
      setIsStreaming(false); setShowLoader(false); if(rafRef.current){ cancelAnimationFrame(rafRef.current); rafRef.current=null }
      streamFullRef.current=""; setStreamText("")
      setConversations(prev=> prev.map(c=> c.id===_saveTargetId ? finalChat : c))
      if(uid2) try{ await set(dbRef(rtdb, `users/${uid2}/chats/${_saveTargetId}`), finalChat) }catch(e){ console.debug("save assistant",e) }
      if(text && user){
        const entry={ t:Date.now(), s:text.trim().slice(0,120) }
        const prevMem=memForPrompt||memory||DEFAULT_MEMORY()
        const next={ ...prevMem, name:(saidName||prevMem.name||""), rollup:[...(Array.isArray(prevMem.rollup)?prevMem.rollup:[]), entry].slice(-12), updatedAt:Date.now() }
        setMemory(next)
        saveMemory(user.uid, next).catch(()=>{})
      }
    }catch(e){
      if(e.name==="AbortError"){} else if(String(e.message)==="auth") setError("Authentication failed.")
      else if(String(e.message)==="empty") setError("Empty response — please try again.")
      else setError("Nova AI is temporarily unavailable. Please try again.")
    }finally{ setIsStreaming(false); setShowLoader(false); if(rafRef.current){ cancelAnimationFrame(rafRef.current); rafRef.current=null } }
  }
  const handleKeyDown=(e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); handleSend() } }
  const toggleVoice=async ()=>{
    if(isRecording){ try{ recognitionRef.current?.stop() }catch{}; if(mediaRecorderRef.current?.state==="recording") mediaRecorderRef.current.stop(); setIsRecording(false); return }
    if(recognitionRef.current){ try{ recognitionRef.current.start(); setIsRecording(true); return }catch{} }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true})
      const mr=new MediaRecorder(stream); mediaRecorderRef.current=mr
      mr.onstart=()=> setIsRecording(true); mr.onstop=()=>{ setIsRecording(false); stream.getTracks().forEach(t=> t.stop()) }; mr.start()
      setTimeout(()=>{ if(mr.state==="recording") mr.stop() },8000)
    }catch{ setError("Microphone permission denied.") }
  }
  const hasMessages=(activeConv?.messages.length||0)>0
  const toggleSidebar=()=> setSidebarOpen(v=> !v)
  const onConvContextMenu=(e,id)=>{
    e.preventDefault();
    // prevent text highlight on long press
    if(window.getSelection) try{ window.getSelection().removeAllRanges() }catch{}
    setCtxMenu({id, x:e.clientX, y:e.clientY})
  }
  const onTouchStart=(e,id)=>{
    // prevent native selection/highlight during long press
    if(e.cancelable) try{ e.preventDefault() }catch{}
    if(window.getSelection) try{ window.getSelection().removeAllRanges() }catch{}
    longPressRef.current=setTimeout(()=>{ const t=e.touches[0]; if(window.getSelection) try{ window.getSelection().removeAllRanges() }catch{}; setCtxMenu({id, x:t.clientX, y:t.clientY}) },560)
  }
  const onTouchEnd=()=>{ if(longPressRef.current) clearTimeout(longPressRef.current) }

  if(!authReady){
    return <div className="flex h-screen w-full items-center justify-center bg-black text-gray-400"><div className="nova-loader"><span className="nova-loader-dot"/><span className="nova-loader-dot"/><span className="nova-loader-dot"/></div></div>
  }
  if(!user){
    return <AuthScreen onAuth={setUser} />
  }
  if(conversationsLoading){
    return <div className="flex h-screen w-full items-center justify-center bg-black text-gray-400"><div className="nova-loader"><span className="nova-loader-dot"/><span className="nova-loader-dot"/><span className="nova-loader-dot"/></div></div>
  }

  return (
    <div className="flex h-screen w-full overflow-hidden text-gray-200 antialiased font-sans bg-black" onDragOver={e=>{ e.preventDefault(); setDragOver(true)}} onDragLeave={()=> setDragOver(false)} onDrop={e=>{ e.preventDefault(); setDragOver(false); if(e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)}}>
      <div className="fixed inset-0 z-0 bg-black">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/20 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration:"8s" }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-slate-800/40 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration:"10s", animationDelay:"2s" }} />
      </div>
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\"0 0 200 200\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cfilter id=\"noiseFilter\"%3E%3CfeTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/%3E%3C/filter%3E%3Crect width=\"100%25\" height=\"100%25\" filter=\"url(%23noiseFilter)\"/%3E%3C/svg%3E')" }}></div>

      {updateToast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] px-3 py-1 rounded-full glass-panel text-[11px] font-semibold text-white shadow-md" style={{ background:"rgba(99,102,241,0.7)", border:"1px solid rgba(255,255,255,0.15)" }}>
          Updated
        </div>
      )}

      <AnimatePresence>
        {sidebarOpen && !isMobile && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type:"spring", bounce:0, duration:0.4 }}
            className="h-full z-20 flex-shrink-0 relative overflow-hidden hidden md:flex"
          >
             <div className="w-[280px] h-full p-4 flex flex-col absolute inset-0">
               <div className="glass-panel h-full rounded-[32px] flex flex-col overflow-hidden p-3 gap-2">
                 <div className="flex items-center justify-between px-2 py-2">
                   <button className="glass-button p-2 rounded-xl" onClick={toggleSidebar} aria-label="Close sidebar">
                     <LayoutPanelLeft className="w-5 h-5 text-gray-300" />
                   </button>
                   <button className="glass-button flex-1 ml-2 py-2 px-3 rounded-xl flex items-center justify-between" onClick={createNewChat}>
                     <span className="text-sm font-medium">New Chat</span>
                     <PenSquare className="w-4 h-4 text-gray-300" />
                   </button>
                 </div>
                 <div className="mt-4 px-2 space-y-1">
                   <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 text-sm font-medium" onClick={()=> setResearchMode(v=> !v)}>
                     <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center border border-white/5">
                        <Sparkles className="w-3.5 h-3.5 text-gray-200" />
                     </div>
                     {researchMode? "Research: ON":"Explore Nova"}
                   </button>
                 </div>
                 <div className="flex-1 overflow-y-auto mt-4 px-2 custom-scrollbar">
                    <div className="text-xs font-semibold text-gray-500 mb-2 px-1">Today</div>
                    <div className="space-y-1">
                       {conversations.filter(c=> (c.messages||[]).length>0).slice(0,12).map(c=> (
                         <div key={c.id} onContextMenu={e=> onConvContextMenu(e,c.id)} onTouchStart={e=> onTouchStart(e,c.id)} onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd} style={{userSelect:'none', WebkitUserSelect:'none', WebkitTouchCallout:'none'}} className={`w-full flex items-center gap-1 rounded-xl transition-colors group select-none ${c.id===activeConv?.id?"bg-white/10 text-white":"hover:bg-white/5 text-gray-300"}`}>
                           <button onClick={()=> setActiveId(c.id)} className="flex-1 text-left px-3 py-2 flex items-center gap-2 text-sm truncate min-w-0">
                             <MessageSquare className="w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100" />
                             <span className="truncate flex-1">{c.title}</span>
                           </button>
                         </div>
                       ))}
                    </div>
                 </div>
                 <div className="mt-auto pt-2 border-t border-white/5 px-2 pb-1 space-y-1">
                    <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 text-sm text-gray-300" onClick={()=> { setSettingsTab("general"); setShowSettings(true) }}>
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    <div className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 text-sm font-medium">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                          <span className="text-xs font-bold text-white">{(user.displayName||user.email||"U").slice(0,1).toUpperCase()}</span>
                        </div>
                        <span className="truncate flex-1">{user.displayName||user.email||"Account"}</span>
                        <button onClick={()=> signOut(auth)} className="glass-button p-1.5 rounded-lg" title="Sign out"><LogOut className="w-3.5 h-3.5" /></button>
                    </div>
                 </div>
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {sidebarOpen && isMobile && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm md:hidden" onClick={()=> setSidebarOpen(false)} />
            <motion.div initial={{x:-296, opacity:1}} animate={{x:0, opacity:1}} exit={{x:-296, opacity:1}} transition={{type:"spring", bounce:0, duration:0.32}} className="fixed left-0 top-0 bottom-0 z-40 w-[296px] max-w-[82vw] p-3 md:hidden flex flex-col">
              <div className="glass-panel h-full rounded-[32px] flex flex-col overflow-hidden p-3 gap-2 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
                 <div className="flex items-center justify-between px-2 py-2">
                   <button className="glass-button p-2 rounded-xl" onClick={()=> setSidebarOpen(false)} aria-label="Close sidebar">
                     <LayoutPanelLeft className="w-5 h-5 text-gray-300" />
                   </button>
                   <button className="glass-button flex-1 ml-2 py-2 px-3 rounded-xl flex items-center justify-between" onClick={()=>{ createNewChat(); setSidebarOpen(false)}}>
                     <span className="text-sm font-medium">New Chat</span>
                     <PenSquare className="w-4 h-4 text-gray-300" />
                   </button>
                 </div>
                 <div className="mt-4 px-2 space-y-1">
                   <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 text-sm font-medium" onClick={()=> setResearchMode(v=> !v)}>
                     <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center border border-white/5"><Sparkles className="w-3.5 h-3.5 text-gray-200" /></div>
                     {researchMode? "Research: ON":"Explore Nova"}
                   </button>
                 </div>
                 <div className="flex-1 overflow-y-auto mt-4 px-2 custom-scrollbar">
                    <div className="text-xs font-semibold text-gray-500 mb-2 px-1">Today</div>
                    <div className="space-y-1">
                       {conversations.filter(c=> (c.messages||[]).length>0).slice(0,12).map(c=> (
                         <div key={c.id} onContextMenu={e=> onConvContextMenu(e,c.id)} onTouchStart={e=> onTouchStart(e,c.id)} onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd} style={{userSelect:'none', WebkitUserSelect:'none', WebkitTouchCallout:'none'}} className={`w-full flex items-center gap-1 rounded-xl transition-colors group select-none ${c.id===activeConv?.id?"bg-white/10 text-white":"hover:bg-white/5 text-gray-300"}`}>
                           <button onClick={()=> { setActiveId(c.id); setSidebarOpen(false)}} className="flex-1 text-left px-3 py-2 flex items-center gap-2 text-sm truncate min-w-0"><MessageSquare className="w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100" /><span className="truncate flex-1">{c.title}</span></button>
                         </div>
                       ))}
                    </div>
                 </div>
                 <div className="mt-auto pt-2 border-t border-white/5 px-2 pb-1 space-y-1">
                    <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 text-sm text-gray-300" onClick={()=> { setSettingsTab("general"); setShowSettings(true); setSidebarOpen(false) }}><Settings className="w-4 h-4" />Settings</button>
                    <div className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg"><span className="text-xs font-bold text-white">{(user.email||"U").slice(0,1).toUpperCase()}</span></div>
                      <span className="truncate flex-1 text-sm font-medium">{user.email}</span>
                      <button onClick={()=> signOut(auth)} className="glass-button p-1.5 rounded-lg" title="Sign out"><LogOut className="w-3.5 h-3.5" /></button>
                    </div>
                 </div>
               </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col h-full relative z-10 min-w-0">
        <header className="h-16 flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
             <button className="glass-button p-2 rounded-xl mt-4 ml-2" onClick={toggleSidebar} aria-label="Toggle sidebar">
               <LayoutPanelLeft className="w-5 h-5 text-gray-300" />
             </button>
<button className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors text-lg font-medium text-gray-200 mt-4" onClick={()=>{ if(cameraOn) cancelCamera(); setShowPlus(false) }}>
                 Nova AI
                 <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button className="glass-button px-3 py-1.5 rounded-xl text-sm font-medium" onClick={createNewChat}>+ New</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-20 lg:px-40 pb-40 flex flex-col gap-8 pt-10 custom-scrollbar" ref={listRef}>
           {!hasMessages && !isStreaming ? (
             <div className="flex flex-col gap-8 max-w-3xl mx-auto w-full">
               <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex flex-col items-center text-center gap-3 pt-6">
                 <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center">
                   <Sparkles className="w-6 h-6 text-gray-200" />
                 </div>
                 <h2 className="text-2xl font-semibold text-gray-100 tracking-tight">Welcome to Nova AI</h2>
                 <p className="text-sm text-gray-500 max-w-md">Signed in as {user.email} — ask anything, drop an image, or try “Who is the rock?”</p>
               </motion.div>
               <div className="flex flex-wrap gap-2 justify-center">
                 {["Show me Dwayne Johnson","Explain quantum computing","Write a React hook","Plan a 3-day Kyoto trip"].map(s=>(
                   <button key={s} onClick={()=> handleSend(s)} className="glass-button px-4 py-2 rounded-full text-sm text-gray-300 hover:text-white">{s}</button>
                 ))}
               </div>
             </div>
           ) : (
             <div className="flex flex-col gap-8 max-w-3xl mx-auto w-full">
                {activeConv?.messages.map((m,idx)=>{
                  const chatId=m.id || `${idx}-${m.role}`
                  const isCopied=copiedId===chatId
                  return (
                  <div key={chatId} className="relative group/chat">
                    {m.role==="user" ? (
                      <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="flex justify-end relative group">
                        <div className="glass px-5 py-3.5 rounded-3xl rounded-tr-sm max-w-[80%] text-sm leading-relaxed text-gray-100 shadow-xl min-w-0 break-words relative">
                          {m.image && <div className="msg-media mb-2 max-w-[200px]"><img src={m.image} alt="Attached" className="max-w-full" /></div>}
                          {m.doc && <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-300"><FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate max-w-[120px]">{m.doc.name}</span><span className="text-[9px] font-bold uppercase text-gray-400">{m.doc.kind}</span></div>}
                          <div className="whitespace-pre-wrap break-words pr-6">{m.content}</div>
                          <button type="button" onClick={()=> copyChat(m.content, chatId)} aria-label="Copy message" className={`chat-copy-btn ${isCopied?"copied":""}`} title={isCopied?"Copied!":"Copy"}>
                            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="flex gap-4 min-w-0 max-w-full relative group">
                        <div className="w-8 h-8 rounded-full border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                           <Sparkles className="w-4 h-4 text-gray-200" />
                        </div>
                        <div className="flex-1 min-w-0 max-w-full pt-1 text-sm leading-relaxed text-gray-300 space-y-3 overflow-hidden break-words relative">
                           <button type="button" onClick={()=> copyChat(m.content, chatId)} aria-label="Copy response" className={`chat-copy-btn ${isCopied?"copied":""}`} style={{top:0, right:0}} title={isCopied?"Copied!":"Copy"}>
                            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                           <div className="prose prose-invert prose-sm max-w-full overflow-hidden break-words pr-7" dangerouslySetInnerHTML={{__html: renderMarkdownWithCanvas(m.content)}} />
                           {m.imageGen && (
                             <div className="flex flex-col items-start gap-2 mt-2">
                               {m.imageGen.url && (
                                 <img src={m.imageGen.url} alt={m.imageGen.alt||"Generated image"} loading="lazy" className="max-w-[260px] w-full rounded-2xl border border-white/10 shadow-xl" />
                               )}
                               {m.imageGen.url && (
                                 <button type="button" onClick={()=> downloadGenerated(m.imageGen.url)} className="glass-button px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5" title="Download image">
                                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                                   Download
                                 </button>
                               )}
                             </div>
                           )}
                           {m.images && m.images.length>0 && <ImageStrip images={m.images} />}
                        </div>
                      </motion.div>
                    )}
                  </div>
                  )})}
                {isGenImage && (
                  <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="flex gap-4 min-w-0 max-w-full">
                    <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-gray-200" />
                    </div>
                    <div className="flex-1 min-w-0 max-w-full pt-1 text-sm leading-relaxed text-gray-300 overflow-hidden break-words">
                      <div className="flex items-center gap-2"><div className="nova-loader"><span className="nova-loader-dot"/><span className="nova-loader-dot"/><span className="nova-loader-dot"/></div><span style={{fontSize:"0.9em"}}>Generating image…</span></div>
                    </div>
                  </motion.div>
                )}
                {isStreaming && (
                  <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="flex gap-4 min-w-0 max-w-full">
                    <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-gray-200" />
                    </div>
                    <div className="flex-1 min-w-0 max-w-full pt-1 text-sm leading-relaxed text-gray-300 overflow-hidden break-words">
                      {showLoader && !streamText ? (
                        <div className="nova-loader"><span className="nova-loader-dot"/><span className="nova-loader-dot"/><span className="nova-loader-dot"/></div>
                      ) : (
                        <div className="prose prose-invert prose-sm max-w-full overflow-hidden break-words" dangerouslySetInnerHTML={{__html: renderMarkdownWithCanvas(streamText)}} />
                      )}
                      <span className="cursor" />
                    </div>
                  </motion.div>
                )}
                {dragOver && <div className="glass rounded-2xl p-8 text-center text-sm text-gray-300 border-dashed">Drop image to send</div>}
                {error && (
                  <div className="error-banner">
                    <span className="err-icon">!</span>
                    <span style={{flex:1}}>{error}</span>
                    <button className="mini-btn" onClick={()=> setError("")}>Dismiss</button>
                  </div>
                )}
             </div>
           )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 flex justify-center z-30 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none">
          <div className="flex items-end gap-3 w-full max-w-3xl pointer-events-auto relative">
            <AnimatePresence>
            {attachedImage && (
              <motion.div className="absolute bottom-full mb-3 left-0 flex flex-col items-start gap-1 max-w-full pointer-events-auto"
                initial={{opacity:0, y:16, scale:0.7}}
                animate={{opacity:1, y:0, scale:1}}
                exit={{opacity:0, y:12, scale:0.75}}
                transition={{type:"spring", bounce:0.35, duration:0.45}}>
                <div className="relative">
                  <img src={attachedImage.url} alt="Preview" className="w-16 h-16 rounded-xl object-cover" />
                  <button onClick={()=> setAttachedImage(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 grid place-items-center text-[10px] text-white shadow-md leading-none" aria-label="Remove">✕</button>
                </div>
                <span className="text-[10px] text-gray-400 truncate max-w-[72px]">{attachedImage.name}</span>
              </motion.div>
            )}
            </AnimatePresence>
            <AnimatePresence>
            {attachedDoc && (
              <motion.div className="absolute bottom-full mb-3 left-0 flex items-center gap-2"
                initial={{opacity:0, y:16, scale:0.85}}
                animate={{opacity:1, y:0, scale:1}}
                exit={{opacity:0, y:12, scale:0.8}}
                transition={{type:"spring", bounce:0.3, duration:0.4}}>
                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 grid place-items-center">
                  <span className="text-[9px] font-bold text-gray-300 uppercase">{attachedDoc.kind}</span>
                </div>
                <button className="mini-btn" onClick={()=> setAttachedDoc(null)}>Remove</button>
              </motion.div>
            )}
            </AnimatePresence>
<div id="nova-plus-wrap" className="relative shrink-0 mb-1">
            <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} className="w-12 h-12 rounded-full glass flex items-center justify-center" onClick={()=> setShowPlus(true)} aria-label="Attach">
              <Plus className="w-5 h-5 text-gray-300" />
            </motion.button>
              <AnimatePresence>
              {cameraOn && (
                <motion.div className="camera-pop" onClick={e=> e.stopPropagation()}
                  initial={{opacity:0, scale:0.8, y:10}}
                  animate={{opacity:1, scale:1, y:0}}
                  exit={{opacity:0, scale:0.82, y:8}}
                  transition={{type:"spring", bounce:0.3, duration:0.4}}>
                  <div className="relative rounded-[14px] overflow-hidden bg-black aspect-square w-full">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <button onClick={cancelCamera} className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm grid place-items-center text-[11px] text-white/80 hover:bg-black/70" aria-label="Back">✕</button>
                    <AnimatePresence>
                      {cameraFlash && (
                        <motion.div className="absolute inset-0 bg-white pointer-events-none z-10" initial={{opacity:0.95}} exit={{opacity:0}} transition={{duration:0.24}} />
                      )}
                    </AnimatePresence>
                    {cameraError && <div className="absolute inset-0 grid place-items-center text-[11px] text-gray-400 p-3 text-center bg-black/80">{cameraError}</div>}
                  </div>
                  <div className="flex items-center justify-center gap-5 py-1.5">
                    <button onClick={()=>{ stopCamera(); setCameraOn(false); setShowPlus(true) }} className="px-3 py-1.5 rounded-full bg-white/[0.06] text-[11px] text-gray-300 font-medium">← Back</button>
                    <button onClick={capturePhoto} className="w-11 h-11 rounded-full border-[2.5px] border-white/70 bg-white/10 flex items-center justify-center shrink-0 active:scale-95 transition-transform" aria-label="Take photo">
                      <span className="w-8 h-8 rounded-full bg-white shrink-0" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
              <AnimatePresence>
              {showPlus && (
                <motion.div className="plus-pop" onClick={e=> e.stopPropagation()}
                  initial={{opacity:0, scale:0.9, y:8}}
                  animate={{opacity:1, scale:1, y:0}}
                  exit={{opacity:0, scale:0.86, y:6}}
                  transition={{type:"spring", bounce:0.22, duration:0.3}}>
                  <button type="button" onClick={()=> fileInputRef.current?.click()}>📎 Add file — image, PDF or Word</button>
                  <button type="button" onClick={openCamera}>📷 Camera</button>
                  <button type="button" onClick={()=> { setResearchMode(v=> !v); setShowPlus(false)}}>{researchMode?"🔍 Research: ON":"🔍 Enable research"}</button>
                  <button type="button" onClick={()=> { createNewChat(); setShowPlus(false)}}>＋ New chat</button>
                </motion.div>
              )}
            </AnimatePresence>
            </div>
            <motion.div layout className="flex-1 glass rounded-3xl flex flex-col relative min-h-[56px]">
              <textarea 
                ref={taRef}
                placeholder="Ask Nova AI"
                className="w-full bg-transparent border-none outline-none text-gray-100 placeholder:text-gray-500 resize-none py-4 px-5 pr-12 text-sm max-h-32 min-h-[56px]"
                rows={1}
                value={input}
                onChange={e=> setInput(e.target.value)}
                onFocus={()=> setShowPlus(false)}
                onClick={()=> setShowPlus(false)}
                onKeyDown={handleKeyDown}
                style={{ scrollbarWidth:"none" }}
              />
              <AnimatePresence>
                {(input.trim() || attachedImage || attachedDoc) && (
                   <motion.button
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.8 }}
                     onClick={()=> handleSend()}
                     className="absolute right-3 bottom-3 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-lg"
                     aria-label="Send"
                   >
                     <Send className="w-4 h-4 ml-0.5" />
                   </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
            <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} className={`w-12 h-12 rounded-full glass flex items-center justify-center shrink-0 mb-1 ${isRecording?"!bg-red-500/20 !border-red-500/30":""}`} onClick={toggleVoice} aria-label="Voice">
              {isRecording ? <span className="wave-bars"><span/><span/><span/><span/></span> : <Mic className="w-5 h-5 text-gray-300" />}
            </motion.button>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*" hidden onChange={e=> e.target.files && handleFiles(e.target.files)} />
          </div>
        </div>
      </div>

      {ctxMenu && (
        <div className="fixed z-50 glass-panel rounded-2xl p-1.5 flex flex-col min-w-[160px] shadow-xl border border-white/10" style={{left: Math.min(ctxMenu.x, typeof window!=="undefined"? window.innerWidth-180: ctxMenu.x), top: Math.min(ctxMenu.y, typeof window!=="undefined"? window.innerHeight-120: ctxMenu.y)}} onClick={e=> e.stopPropagation()}>
          <button className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-sm text-gray-200" onClick={()=>{ setRenameVal(conversations.find(c=>c.id===ctxMenu.id)?.title||""); setRenameTarget(ctxMenu.id); setCtxMenu(null) }}><Pencil className="w-4 h-4" /> Rename</button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-red-500/10 text-sm text-red-300" onClick={()=>{ setDeleteTarget(ctxMenu.id); setCtxMenu(null) }}><Trash2 className="w-4 h-4" /> Delete</button>
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[12px] grid place-items-center p-4" onClick={()=> setRenameTarget(null)}>
          <div className="glass-panel w-full max-w-[420px] rounded-[24px] p-5 flex flex-col gap-4" onClick={e=> e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-white">Rename chat</h3><button className="glass-button w-8 h-8 grid place-items-center rounded-xl" onClick={()=> setRenameTarget(null)}><X className="w-4 h-4" /></button></div>
            <input autoFocus value={renameVal} onChange={e=> setRenameVal(e.target.value)} onKeyDown={e=> e.key==="Enter" && doRename()} placeholder="Chat name" className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/20" />
            <div className="flex justify-end gap-2"><button className="glass-button px-4 py-2 rounded-full text-sm" onClick={()=> setRenameTarget(null)}>Cancel</button><button className="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold" onClick={doRename}>Save</button></div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[12px] grid place-items-center p-4" onClick={()=> setDeleteTarget(null)}>
          <div className="glass-panel w-full max-w-[420px] rounded-[24px] p-5 flex flex-col gap-4" onClick={e=> e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white">Delete chat?</h3>
            <p className="text-sm text-gray-400">This will permanently delete “{conversations.find(c=>c.id===deleteTarget)?.title}” and its messages. This cannot be undone.</p>
            <div className="flex justify-end gap-2"><button className="glass-button px-4 py-2 rounded-full text-sm" onClick={()=> setDeleteTarget(null)}>Cancel</button><button className="px-4 py-2 rounded-full bg-red-500 text-white text-sm font-semibold" onClick={doDelete}>Delete</button></div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[12px] grid place-items-center p-4" onClick={()=> setShowSettings(false)}>
          <div className="glass-panel w-full max-w-[560px] max-h-[90vh] overflow-auto rounded-[24px] p-0" onClick={e=> e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-2">
              <h3 className="text-sm font-bold text-gray-100">Settings</h3>
              <button className="glass-button w-8 h-8 grid place-items-center rounded-xl" onClick={()=> setShowSettings(false)}>✕</button>
            </div>
            <div className="p-4 pt-2 flex flex-row-reverse gap-4">
              <div className="flex flex-col gap-1 overflow-y-auto max-h-[300px] shrink-0 w-[120px]">
                {["general","appearance","voice","research","account"].map(tab=>(
                  <button key={tab} className={`text-left px-3 py-2 rounded-xl text-sm capitalize ${settingsTab===tab?"bg-white/10 text-white":"text-gray-400 hover:bg-white/5 hover:text-gray-200"}`} onClick={()=> setSettingsTab(tab)}>{tab}</button>
                ))}
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                {settingsTab==="general" && (
                  <>
                    <div><div className="text-xs font-semibold text-gray-400 mb-1">About</div><p className="text-sm text-gray-400 leading-relaxed">Nova AI by Daniel, co-founder of Nova AI — curated collection of high-end models for the best results.</p></div>
                    <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={researchMode} onChange={e=> setResearchMode(e.target.checked)} /> Research mode — citations & images</label>
                    <div className="flex gap-2 flex-wrap"><button className="glass-button px-3 py-1.5 rounded-full text-sm" onClick={()=>{ setDeleteTarget(conversations[0]?.id) }}>Clear chats</button><button className="glass-button px-3 py-1.5 rounded-full text-sm" onClick={()=> { localStorage.clear(); location.reload()}}>Reset app</button></div>
                  </>
                )}
                {settingsTab==="appearance" && (
                  <div><div className="text-xs font-semibold text-gray-400 mb-2">Theme</div><div className="grid grid-cols-2 gap-2"><div className="glass rounded-2xl p-3 border-white/10 bg-white/5"><div className="text-sm font-semibold text-white">0 Black</div><div className="text-xs text-gray-400">Pure #000 — active</div></div><div className="glass rounded-2xl p-3 opacity-60"><div className="text-sm font-semibold text-white">Glass Dark</div><div className="text-xs text-gray-400">Liquid glass</div></div></div></div>
                )}
                {settingsTab==="voice" && (
                  <div><div className="text-xs font-semibold text-gray-400 mb-1">Voice input</div><p className="text-sm text-gray-400">Tap mic to speak — transcribed to composer. Never stored.</p><button className="mt-2 px-4 py-2 rounded-full bg-white text-black text-sm font-semibold" onClick={toggleVoice}>{isRecording?"Stop recording":"Test microphone"}</button></div>
                )}
                {settingsTab==="research" && (
                  <div><div className="text-xs font-semibold text-gray-400 mb-1">Research</div><p className="text-sm text-gray-400">When enabled, Nova pastes real Wikimedia images inline — max 3 fitted, never link lists.</p><label className="flex items-center gap-2 text-sm text-gray-300 mt-2"><input type="checkbox" checked={researchMode} onChange={e=> setResearchMode(e.target.checked)} /> Enable research & images</label></div>
                )}
                {settingsTab==="account" && (
                  <div>
                    <div className="text-xs font-semibold text-gray-400 mb-2">Account</div>
                    <div className="glass rounded-2xl p-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 grid place-items-center text-sm font-bold text-white">{(user.displayName||user.email||"U").slice(0,1).toUpperCase()}</div>
                        <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-white truncate">{user.displayName||user.email}</div><div className="text-xs text-gray-400 truncate">{user.email}</div></div>
                        <button className="glass-button px-3 py-1.5 rounded-full text-sm" onClick={()=> signOut(auth)}>Sign out</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 pt-0">
              <button className="glass-button px-4 py-2 rounded-full text-sm" onClick={()=> setShowSettings(false)}>Close</button>
              <button className="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold" onClick={()=> setShowSettings(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
