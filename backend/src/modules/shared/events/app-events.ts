import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface BeefVoteEvent {
    beefId: string;
    initiatorCoins: number;
    targetCoins: number;
    totalVotes: number;
}

export interface BeefCommentEvent {
    beefId: string;
    comment: {
        id: string;
        user_id: string;
        content: string;
        created_at: Date;
        nickname: string | null;
    };
}

export interface BeefClosedEvent {
    beefId: string;
    winnerId: string | null;
}

export interface ContactRequestEvent {
    requestId: string;
    senderId: string;
    receiverId: string;
}

export interface BeefGameStateUpdateEvent {
    beefId: string;
    /** Lifecycle status: 'waiting' | 'in_game' | 'finished' — NOT the JSONB game state */
    state: 'waiting' | 'in_game' | 'finished';
    gameType: string;
    initiatorReady: boolean;
    targetReady: boolean;
}

export interface BeefGameFinishedEvent {
    beefId: string;
    winnerId: string | null;
}

export interface BeefGameGoEvent {
    beefId: string;
    sentAt: number;
}

export interface BeefGameBoardUpdateEvent {
    beefId: string;
    gameType: string;
    /** Pre-shaped per game type, safe to broadcast to all room members. */
    board: Record<string, any>;
    finished: boolean;
    /** Present for mastermind only — used by gateway for per-role redaction. */
    initiatorId?: string;
    targetId?: string;
}

// Shop braucht einen Menschen: geht an alle Admins (Socket-Raum "admin")
export type ShopAlertKind = 'case_opened' | 'case_reply' | 'not_met' | 'case_overdue' | 'decide_soon' | 'expired';
export interface ShopAlertEvent {
    kind: ShopAlertKind;
    orderId?: string;
    caseId?: string;
}

// ---------------------------------------------------------------------------
// Event name constants
// ---------------------------------------------------------------------------

export const AppEvents = {
    beefVote:              'hidden.beef.vote',
    beefComment:           'hidden.beef.comment',
    beefClosed:            'hidden.beef.closed',
    contactRequest:        'contact_request.created',
    beefGameStateUpdate:   'hidden.beef.game.state_update',
    beefGameFinished:      'hidden.beef.game.finished',
    beefGameGo:            'hidden.beef.game.go',
    beefGameBoardUpdate:   'hidden.beef.game.board_update',
    shopAlert:             'shop.alert',
} as const;

// ---------------------------------------------------------------------------
// Typed event map (event name → payload)
// ---------------------------------------------------------------------------

type EventPayloadMap = {
    [AppEvents.beefVote]:              BeefVoteEvent;
    [AppEvents.beefComment]:           BeefCommentEvent;
    [AppEvents.beefClosed]:            BeefClosedEvent;
    [AppEvents.contactRequest]:        ContactRequestEvent;
    [AppEvents.beefGameStateUpdate]:   BeefGameStateUpdateEvent;
    [AppEvents.beefGameFinished]:      BeefGameFinishedEvent;
    [AppEvents.beefGameGo]:            BeefGameGoEvent;
    [AppEvents.beefGameBoardUpdate]:   BeefGameBoardUpdateEvent;
    [AppEvents.shopAlert]:             ShopAlertEvent;
};

// ---------------------------------------------------------------------------
// TypedEventBus
// Wraps EventEmitter2 to enforce payload types at emit sites.
// At @OnEvent listen sites use AppEvents.xxx as the decorator argument and
// type the handler parameter with the corresponding payload interface.
// ---------------------------------------------------------------------------

@Injectable()
export class TypedEventBus {
    constructor(private readonly emitter: EventEmitter2) {}

    emit<K extends keyof EventPayloadMap>(event: K, payload: EventPayloadMap[K]): void {
        this.emitter.emit(event, payload);
    }
}
