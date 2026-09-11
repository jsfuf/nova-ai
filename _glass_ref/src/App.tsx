import { useState } from 'react';
import { Plus, Mic, Settings, MessageSquare, PenSquare, LayoutPanelLeft, ChevronDown, Sparkles, User, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputText, setInputText] = useState("");

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="flex h-screen w-full overflow-hidden text-gray-200 antialiased font-sans bg-black">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 bg-black">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/20 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-slate-800/40 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\"0 0 200 200\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cfilter id=\"noiseFilter\"%3E%3CfeTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/%3E%3C/filter%3E%3Crect width=\"100%25\" height=\"100%25\" filter=\"url(%23noiseFilter)\"/%3E%3C/svg%3E')" }}></div>

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="h-full z-20 flex-shrink-0 relative overflow-hidden"
          >
             <div className="w-[280px] h-full p-4 flex flex-col absolute inset-0">
               <div className="glass-panel h-full rounded-[32px] flex flex-col overflow-hidden p-3 gap-2">
                 
                 {/* Sidebar Header */}
                 <div className="flex items-center justify-between px-2 py-2">
                   <button className="glass-button p-2 rounded-xl" onClick={toggleSidebar}>
                     <LayoutPanelLeft className="w-5 h-5 text-gray-300" />
                   </button>
                   <button className="glass-button flex-1 ml-2 py-2 px-3 rounded-xl flex items-center justify-between">
                     <span className="text-sm font-medium">New Chat</span>
                     <PenSquare className="w-4 h-4 text-gray-300" />
                   </button>
                 </div>

                 {/* Navigation Items */}
                 <div className="mt-4 px-2 space-y-1">
                   <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 text-sm font-medium">
                     <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center border border-white/5">
                        <Sparkles className="w-3.5 h-3.5 text-gray-200" />
                     </div>
                     Explore GPTs
                   </button>
                 </div>

                 {/* History List */}
                 <div className="flex-1 overflow-y-auto mt-4 px-2 custom-scrollbar">
                    <div className="text-xs font-semibold text-gray-500 mb-2 px-1">Today</div>
                    <div className="space-y-1">
                       {['Design System UI', 'React Framer Motion', 'Tailwind Glassmorphism'].map((title, i) => (
                         <button key={i} className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-2 text-sm text-gray-300 truncate group">
                           <MessageSquare className="w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                           <span className="truncate">{title}</span>
                         </button>
                       ))}
                    </div>
                 </div>

                 {/* Bottom User Area */}
                 <div className="mt-auto pt-2 border-t border-white/5 px-2 pb-1 space-y-1">
                    <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 text-sm text-gray-300">
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    <button className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 text-sm font-medium">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      User Profile
                    </button>
                 </div>
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative z-10 min-w-0">
        
        {/* Top Navbar */}
        <header className="h-16 flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
             {!sidebarOpen && (
               <button className="glass-button p-2 rounded-xl mt-4 ml-2" onClick={toggleSidebar}>
                 <LayoutPanelLeft className="w-5 h-5 text-gray-300" />
               </button>
             )}
             <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors text-lg font-medium text-gray-200 mt-4">
                ChatGPT <span className="text-gray-400 text-sm font-normal">Plus</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
             </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-20 lg:px-40 pb-40 flex flex-col gap-8 pt-10 custom-scrollbar">
           <div className="flex flex-col gap-8 max-w-3xl mx-auto w-full">
              {/* User Message */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                <div className="glass px-5 py-3.5 rounded-3xl rounded-tr-sm max-w-[80%] text-sm leading-relaxed text-gray-100 shadow-xl">
                  Can you show me an example of a realistic liquid glass interface? I want it to look like frosted glass with dynamic lighting.
                </div>
              </motion.div>

              {/* AI Message */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-4">
                <div className="w-8 h-8 rounded-full border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] bg-white/5 flex items-center justify-center shrink-0">
                   <Sparkles className="w-4 h-4 text-gray-200" />
                </div>
                <div className="flex-1 pt-1 text-sm leading-relaxed text-gray-300 space-y-4">
                   <p>Certainly! What you are seeing right now is an example of a liquid glass interface. It utilizes several key CSS properties to achieve this realistic effect:</p>
                   <ul className="list-disc pl-4 space-y-2 text-gray-400 marker:text-gray-600">
                     <li><strong className="text-gray-200">Backdrop Filter:</strong> Applying a high blur value creates the frosted glass base.</li>
                     <li><strong className="text-gray-200">Semi-transparent Background:</strong> Using a very low opacity white or black base (e.g., <code className="bg-white/10 px-1 py-0.5 rounded text-xs">bg-white/5</code>).</li>
                     <li><strong className="text-gray-200">Inner Shadows:</strong> Crucial for the "liquid" edge, simulating light catching the bevel of the glass.</li>
                     <li><strong className="text-gray-200">Drop Shadows:</strong> To lift the glass element off the background, enhancing depth.</li>
                   </ul>
                   <p>The input area below is designed as a "dynamic island" split into three distinct glass components, exactly as you requested.</p>
                </div>
              </motion.div>
           </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 flex justify-center z-30 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none">
          <div className="flex items-end gap-3 w-full max-w-3xl pointer-events-auto">
            
            {/* Left Button (Plus / File) */}
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-12 h-12 rounded-full glass flex items-center justify-center shrink-0 mb-1"
            >
              <Plus className="w-5 h-5 text-gray-300" />
            </motion.button>

            {/* Center Text Field */}
            <motion.div 
              layout
              className="flex-1 glass rounded-3xl flex flex-col relative min-h-[56px]"
            >
              <textarea 
                placeholder="Message ChatGPT..."
                className="w-full bg-transparent border-none outline-none text-gray-100 placeholder:text-gray-500 resize-none py-4 px-5 text-sm max-h-32 min-h-[56px]"
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                style={{ scrollbarWidth: 'none' }}
              />
              <AnimatePresence>
                {inputText.length > 0 && (
                   <motion.button
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.8 }}
                     className="absolute right-3 bottom-3 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-lg"
                   >
                     <Send className="w-4 h-4 ml-0.5" />
                   </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Right Button (Audio/Mic) */}
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-12 h-12 rounded-full glass flex items-center justify-center shrink-0 mb-1"
            >
              <Mic className="w-5 h-5 text-gray-300" />
            </motion.button>
            
          </div>
        </div>
        
      </div>
    </div>
  );
}
