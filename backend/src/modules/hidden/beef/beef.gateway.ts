import {
  WebSocketGateway, WebSocketServer,
  SubscribeMessage, ConnectedSocket, MessageBody,
  OnGatewayConnection,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { OnEvent } from '@nestjs/event-emitter'
import { JwtService } from '@nestjs/jwt'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { AppEvents } from '../../shared/events/app-events'
import type { BeefGameStateUpdateEvent, BeefGameFinishedEvent, BeefGameGoEvent, BeefGameBoardUpdateEvent } from '../../shared/events/app-events'
import { BeefGameService } from './beef-game.service'
import { getCorsOrigins } from '../../../common/config/cors-origins.helper'

@WebSocketGateway({
  namespace: '/hidden-beef',
  cors: {
    origin: getCorsOrigins('http://localhost:3001'),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  },
})
export class HiddenBeefGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server

  constructor(
    private readonly beefGameService: BeefGameService,
    private readonly jwtService: JwtService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private extractUserId(client: Socket): string | null {
    try {
      const token = (client.handshake.auth?.token ?? client.handshake.query?.token) as string
      const payload = this.jwtService.verify<{ sub: string }>(token)
      return payload.sub
    } catch {
      return null
    }
  }

  async handleConnection(client: Socket) {
    const userId = this.extractUserId(client)
    if (!userId) { client.disconnect(); return }

    const [{ exists }] = await this.dataSource.query(
      'SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL) AS exists',
      [userId],
    )
    if (!exists) { client.disconnect(); return }

    client.data.userId = userId
  }

  @SubscribeMessage('join_beef')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() beefId: string) {
    client.join(`beef:${beefId}`)
  }

  @SubscribeMessage('leave_beef')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() beefId: string) {
    client.leave(`beef:${beefId}`)
  }

  // Reaction: component mounted and listener registered — mark this player ready-for-go
  @SubscribeMessage('game:reaction_ready')
  async handleReactionReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { beefId: string },
  ) {
    const userId = client.data.userId as string
    if (!userId || !payload?.beefId) return
    await this.beefGameService.markReactionReady(payload.beefId, userId)
  }

  // Reaction: click event — userId resolved from authenticated socket, never from payload
  @SubscribeMessage('game:reaction_click')
  async handleReactionClick(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { beefId: string },
  ) {
    const userId = client.data.userId as string
    if (!userId || !payload?.beefId) return
    await this.beefGameService.applyReactionClick(payload.beefId, userId, Date.now())
  }

  @OnEvent(AppEvents.beefVote)
  onVote(payload: { beefId: string; initiatorCoins: number; targetCoins: number; totalVotes: number }) {
    this.server.to(`beef:${payload.beefId}`).emit('beef:vote_update', {
      initiator_coins: payload.initiatorCoins,
      target_coins: payload.targetCoins,
      total_votes: payload.totalVotes,
    })
  }

  @OnEvent(AppEvents.beefComment)
  onComment(payload: { beefId: string; comment: any }) {
    this.server.to(`beef:${payload.beefId}`).emit('beef:comment_new', payload.comment)
  }

  @OnEvent(AppEvents.beefClosed)
  onClosed(payload: { beefId: string; winnerId: string | null }) {
    this.server.to(`beef:${payload.beefId}`).emit('beef:closed', { winner_id: payload.winnerId })
  }

  @OnEvent(AppEvents.beefGameStateUpdate)
  onGameStateUpdate(payload: BeefGameStateUpdateEvent) {
    this.server.to(`beef:${payload.beefId}`).emit('game:state_update', {
      state: payload.state,
      game_type: payload.gameType,
      initiator_ready: payload.initiatorReady,
      target_ready: payload.targetReady,
    })
  }

  @OnEvent(AppEvents.beefGameGo)
  onGameGo(payload: BeefGameGoEvent) {
    this.server.to(`beef:${payload.beefId}`).emit('game:go', { sent_at: payload.sentAt })
  }

  @OnEvent(AppEvents.beefGameBoardUpdate)
  async onGameBoardUpdate(payload: BeefGameBoardUpdateEvent) {
    if (payload.gameType !== 'mastermind') {
      this.server.to(`beef:${payload.beefId}`).emit('game:board_update', {
        game_type: payload.gameType,
        ...payload.board,
      })
      return
    }

    // Mastermind: emit role-specific payloads so each player cannot see the
    // opponent's guess rows or pin feedback over the wire.
    const { initiatorId, targetId, board } = payload
    const sockets = await this.server.in(`beef:${payload.beefId}`).fetchSockets()

    for (const s of sockets) {
      const uid = (s.data as any).userId as string | undefined
      let personalBoard: Record<string, any>

      if (uid === initiatorId) {
        personalBoard = {
          initiator: board.initiator,
          target: { guesses: [], solved: board.target.solved, attempts: board.target.attempts, redacted: true },
        }
      } else if (uid === targetId) {
        personalBoard = {
          initiator: { guesses: [], solved: board.initiator.solved, attempts: board.initiator.attempts, redacted: true },
          target: board.target,
        }
      } else {
        // Spectator: full visibility
        personalBoard = { initiator: board.initiator, target: board.target }
      }

      s.emit('game:board_update', { game_type: 'mastermind', ...personalBoard })
    }
  }

  @OnEvent(AppEvents.beefGameFinished)
  onGameFinished(payload: BeefGameFinishedEvent) {
    this.server.to(`beef:${payload.beefId}`).emit('game:finished', { winner_id: payload.winnerId })
  }
}
