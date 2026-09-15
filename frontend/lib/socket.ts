import { io, Socket } from 'socket.io-client'
import { useAuthStore } from './store/authStore'

let socket: Socket | null = null

export function connect(): Socket {
  const token = useAuthStore.getState().accessToken
  if (socket?.connected) return socket
  if (socket) {
    socket.disconnect()
    socket = null
  }
  socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3000', {
    auth: { token },
    extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
  })
  return socket
}

export function reconnect(): Socket {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  return connect()
}

export function disconnect(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function getSocket(): Socket | null {
  return socket
}

let hiddenBeefSocket: import('socket.io-client').Socket | null = null

export function connectHiddenBeef(): import('socket.io-client').Socket {
  const token = useAuthStore.getState().accessToken
  if (hiddenBeefSocket?.connected) return hiddenBeefSocket
  if (hiddenBeefSocket) { hiddenBeefSocket.disconnect(); hiddenBeefSocket = null }
  hiddenBeefSocket = io(`${process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3000'}/hidden-beef`, {
    auth: { token },
    extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
  })
  return hiddenBeefSocket
}

export function disconnectHiddenBeef(): void {
  if (hiddenBeefSocket) { hiddenBeefSocket.disconnect(); hiddenBeefSocket = null }
}
