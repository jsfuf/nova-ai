import React from "react"

export default class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={ hasError:false, error:null } }
  static getDerivedStateFromError(error){ return { hasError:true, error } }
  componentDidCatch(error, info){ console.error("Nova ErrorBoundary", error, info) }
  render(){
    if(this.state.hasError){
      return (
        <div className="flex h-screen w-full items-center justify-center bg-black text-gray-300 p-6">
          <div className="glass-panel rounded-[24px] p-6 max-w-[480px] w-full flex flex-col gap-3">
            <h2 className="text-sm font-bold text-white">Something went wrong</h2>
            <p className="text-sm text-gray-400 leading-relaxed">Nova hit an unexpected error but your chats are safe. Please refresh the page.</p>
            <pre className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3 overflow-auto max-h-[160px]">{String(this.state.error?.message||this.state.error)}</pre>
            <button className="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold self-start" onClick={()=> location.reload()}>Refresh</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
