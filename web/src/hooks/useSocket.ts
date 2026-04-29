'use client';

import { useEffect, useRef, useState } from 'react';
import { getSocket, type AppSocket } from '@/lib/socket';

export function useSocket(): { socket: AppSocket | null; connected: boolean } {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<AppSocket | null>(null);

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;
    setConnected(s.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: socketRef.current, connected };
}
