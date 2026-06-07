import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface Peer {
  id: string;
  deviceType: string;
}

export interface FileTransfer {
  fileName: string;
  progress: number;
  isReceiving: boolean;
}

export const useWebRTC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [activeTransfers, setActiveTransfers] = useState<Record<string, FileTransfer>>({});
  const [myPin] = useState<string>(() => Math.floor(1000 + Math.random() * 9000).toString());
  
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  
  // For receiving file chunks
  const receiveBuffers = useRef<Record<string, { chunks: ArrayBuffer[], totalSize: number, receivedSize: number, fileName: string }>>({});

  useEffect(() => {
    // Connect to the signaling server (dynamically use current window location)
    const host = window.location.hostname;
    const newSocket = io(`http://${host}:3001`);
    
    newSocket.on('connect', () => {
      newSocket.emit('join', { deviceType: navigator.userAgent });
    });

    newSocket.on('current_peers', (currentPeers: Peer[]) => {
      setPeers(currentPeers);
    });

    newSocket.on('peer_joined', (peer: Peer) => {
      setPeers(prev => [...prev, peer]);
    });

    newSocket.on('peer_left', (peerId: string) => {
      setPeers(prev => prev.filter(p => p.id !== peerId));
      if (peerConnections.current.has(peerId)) {
        peerConnections.current.get(peerId)?.close();
        peerConnections.current.delete(peerId);
      }
      if (dataChannels.current.has(peerId)) {
        dataChannels.current.delete(peerId);
      }
    });

    // WebRTC Signaling Handlers
    newSocket.on('webrtc_offer', async ({ senderId, offer, pin }) => {
      if (pin !== myPin) {
        newSocket.emit('pin_rejected', { targetId: senderId });
        return;
      }

      // Accept offer and create connection on demand for receiver
      let pc = peerConnections.current.get(senderId);
      if (!pc) {
        pc = createReceiverConnection(senderId, newSocket);
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      newSocket.emit('webrtc_answer', { targetId: senderId, answer });
    });

    newSocket.on('webrtc_answer', async ({ senderId, answer }) => {
      const pc = peerConnections.current.get(senderId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    newSocket.on('pin_rejected', ({ senderId }) => {
      alert('Incorrect PIN entered! Transfer denied by target device.');
      const pc = peerConnections.current.get(senderId);
      if (pc) pc.close();
      peerConnections.current.delete(senderId);
      dataChannels.current.delete(senderId);
    });

    newSocket.on('webrtc_ice_candidate', async ({ senderId, candidate }) => {
      const pc = peerConnections.current.get(senderId);
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      peerConnections.current.forEach(pc => pc.close());
    };
  }, []);

  const createReceiverConnection = (peerId: string, socketInstance: Socket) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketInstance.emit('webrtc_ice_candidate', { targetId: peerId, candidate: event.candidate });
      }
    };

    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel, peerId);
      dataChannels.current.set(peerId, event.channel);
    };

    peerConnections.current.set(peerId, pc);
    return pc;
  };

  const initiateTransfer = async (peerId: string, file: File, targetPin: string) => {
    if (!socket) return;
    
    // Clean up old connection if exists
    if (peerConnections.current.has(peerId)) {
      peerConnections.current.get(peerId)?.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc_ice_candidate', { targetId: peerId, candidate: event.candidate });
      }
    };

    const dc = pc.createDataChannel('fileTransfer');
    setupDataChannel(dc, peerId);
    dataChannels.current.set(peerId, dc);

    peerConnections.current.set(peerId, pc);

    // Wait for data channel to open before sending file
    dc.onopen = () => {
      sendFile(peerId, file, dc);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc_offer', { targetId: peerId, offer, pin: targetPin });
  };

  const setupDataChannel = (dc: RTCDataChannel, peerId: string) => {
    dc.binaryType = 'arraybuffer';
    
    dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const metadata = JSON.parse(event.data);
        if (metadata.type === 'file-start') {
          receiveBuffers.current[peerId] = {
            chunks: [],
            totalSize: metadata.fileSize,
            receivedSize: 0,
            fileName: metadata.fileName
          };
          setActiveTransfers(prev => ({
            ...prev,
            [peerId]: { fileName: metadata.fileName, progress: 0, isReceiving: true }
          }));
        }
      } else {
        // Receiving binary chunk
        const bufferState = receiveBuffers.current[peerId];
        if (bufferState) {
          bufferState.chunks.push(event.data);
          bufferState.receivedSize += event.data.byteLength;
          
          const progress = (bufferState.receivedSize / bufferState.totalSize) * 100;
          setActiveTransfers(prev => ({
            ...prev,
            [peerId]: { ...prev[peerId], progress }
          }));

          if (bufferState.receivedSize === bufferState.totalSize) {
            // Transfer complete
            const blob = new Blob(bufferState.chunks);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = bufferState.fileName;
            a.click();
            URL.revokeObjectURL(url);
            
            // Cleanup
            delete receiveBuffers.current[peerId];
            setTimeout(() => {
              setActiveTransfers(prev => {
                const updated = { ...prev };
                delete updated[peerId];
                return updated;
              });
            }, 2000);
          }
        }
      }
    };
  };

  const sendFile = (peerId: string, file: File, dc: RTCDataChannel) => {
    if (!dc || dc.readyState !== 'open') {
      alert('Data channel failed to open.');
      return;
    }

    setActiveTransfers(prev => ({
      ...prev,
      [peerId]: { fileName: file.name, progress: 0, isReceiving: false }
    }));

    // Send Metadata
    dc.send(JSON.stringify({
      type: 'file-start',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    }));

    // Chunk size 64KB
    const CHUNK_SIZE = 64 * 1024;
    let offset = 0;

    const readSlice = (o: number) => {
      const slice = file.slice(offset, o + CHUNK_SIZE);
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          dc.send(e.target.result as ArrayBuffer);
          offset += CHUNK_SIZE;
          const progress = Math.min((offset / file.size) * 100, 100);
          
          setActiveTransfers(prev => ({
            ...prev,
            [peerId]: { fileName: file.name, progress, isReceiving: false }
          }));

          if (offset < file.size) {
            if (dc.bufferedAmount > dc.bufferedAmountLowThreshold) {
              dc.onbufferedamountlow = () => {
                dc.onbufferedamountlow = null;
                readSlice(offset);
              };
            } else {
              readSlice(offset);
            }
          } else {
            setTimeout(() => {
              setActiveTransfers(prev => {
                const updated = { ...prev };
                delete updated[peerId];
                return updated;
              });
            }, 2000);
          }
        }
      };
      reader.readAsArrayBuffer(slice);
    };

    readSlice(0);
  };

  return { peers, initiateTransfer, activeTransfers, myPin };
};
