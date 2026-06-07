import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWebRTC } from './hooks/useWebRTC';
import { MonitorSmartphone, Upload, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

function App() {
  const { peers, sendFile, activeTransfers } = useWebRTC();
  const [draggedOverPeer, setDraggedOverPeer] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent, peerId: string) => {
    e.preventDefault();
    setDraggedOverPeer(peerId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOverPeer(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, peerId: string) => {
    e.preventDefault();
    setDraggedOverPeer(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      sendFile(peerId, file);
    }
  }, [sendFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, peerId: string) => {
    if (e.target.files && e.target.files.length > 0) {
      sendFile(peerId, e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-background relative flex flex-col items-center justify-center p-8 overflow-hidden">
      {/* Animated Liquid Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/20 blur-[120px] rounded-full animate-blob animation-delay-2000"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 flex items-center justify-center gap-3">
          LocalDrop <span className="text-primary">Pro</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-md mx-auto flex items-center justify-center gap-2">
          <ShieldCheck className="w-5 h-5 text-accent" />
          End-to-End Encrypted Local Transfer
        </p>
      </motion.div>

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <AnimatePresence>
          {peers.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="col-span-full flex flex-col items-center justify-center p-12 border border-white/5 rounded-3xl bg-surface/50 backdrop-blur-xl"
            >
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <h2 className="text-xl font-semibold">Waiting for peers...</h2>
              <p className="text-gray-500 mt-2">Open this page on another device on your Wi-Fi</p>
            </motion.div>
          ) : (
            peers.map((peer) => {
              const transfer = activeTransfers[peer.id];
              const isDragging = draggedOverPeer === peer.id;

              return (
                <motion.div
                  key={peer.id}
                  layoutId={peer.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative group"
                  onDragOver={(e) => handleDragOver(e, peer.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, peer.id)}
                >
                  <motion.div 
                    animate={{
                      scale: isDragging ? 1.05 : 1,
                      boxShadow: isDragging ? '0 0 40px rgba(157, 78, 221, 0.4)' : '0 0 0px rgba(0,0,0,0)',
                      borderColor: isDragging ? '#9D4EDD' : 'rgba(255,255,255,0.1)'
                    }}
                    className={`relative w-full aspect-square flex flex-col items-center justify-center p-8 rounded-[40px] border bg-surface/80 backdrop-blur-2xl transition-colors duration-300 ${isDragging ? 'bg-surface' : ''}`}
                  >
                    {/* Wormhole effect when dragging */}
                    <AnimatePresence>
                      {isDragging && (
                        <motion.div 
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: [1, 1.2, 1], opacity: 0.8 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 rounded-[40px] border-2 border-primary border-dashed opacity-50"
                        />
                      )}
                    </AnimatePresence>

                    <div className="relative z-10 flex flex-col items-center pointer-events-none">
                      <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-6 ring-1 ring-primary/50 shadow-[0_0_30px_rgba(157,78,221,0.3)]">
                        <MonitorSmartphone className="w-10 h-10 text-primary" />
                      </div>
                      
                      <h3 className="text-xl font-bold mb-1 truncate w-full text-center">
                        Device {peer.id.substring(0, 4)}
                      </h3>
                      <p className="text-xs text-gray-500 mb-6 truncate w-full text-center px-4">
                        {peer.deviceType}
                      </p>

                      {transfer ? (
                        <div className="w-full flex flex-col items-center">
                          <p className="text-sm font-medium mb-2 truncate max-w-full px-4">
                            {transfer.isReceiving ? 'Receiving: ' : 'Sending: '} {transfer.fileName}
                          </p>
                          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-gradient-to-r from-primary to-accent"
                              initial={{ width: 0 }}
                              animate={{ width: `${transfer.progress}%` }}
                            />
                          </div>
                          {transfer.progress === 100 && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-2 text-green-400 flex items-center gap-1 text-sm">
                              <CheckCircle2 className="w-4 h-4" /> Complete
                            </motion.div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center pointer-events-auto">
                          <label className="cursor-pointer group/btn relative">
                            <div className="absolute inset-0 bg-primary/20 rounded-full blur-md opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                            <div className="relative flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-semibold transition-all">
                              <Upload className="w-4 h-4" />
                              Select File
                            </div>
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => handleFileSelect(e, peer.id)}
                            />
                          </label>
                          <p className="text-xs text-gray-600 mt-4 pointer-events-none">or drag & drop here</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default App;
