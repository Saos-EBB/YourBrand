import { TicTacToeHandler } from './tictactoe.handler';

describe('TicTacToeHandler', () => {
    const h = new TicTacToeHandler();
    const I = 'initiator-id';
    const T = 'target-id';

    function playMoves(moves: { idx: number; role: 'initiator' | 'target' }[]) {
        let state: any = h.createInitialState(I, T);
        let finished = false;
        for (const m of moves) {
            ({ newState: state, finished } = h.applyMove(state, { position: m.idx }, m.role));
            // Runde vorbei: beef-game.service setzt nach dem Ergebnis-Banner zurueck
            if (state.round_over) state = h.startNextRound(state);
        }
        return { state, finished };
    }

    it('initiator wins one game', () => {
        // X wins top row
        const { state, finished } = playMoves([
            { idx: 0, role: 'initiator' }, { idx: 3, role: 'target' },
            { idx: 1, role: 'initiator' }, { idx: 4, role: 'target' },
            { idx: 2, role: 'initiator' },
        ]);
        expect(state.scores.initiator).toBe(1);
        expect(finished).toBe(false); // needs 2 wins for series
    });

    it('initiator wins series 2-0', () => {
        const moves = [
            // Game 1: X wins top row
            { idx: 0, role: 'initiator' }, { idx: 3, role: 'target' },
            { idx: 1, role: 'initiator' }, { idx: 4, role: 'target' },
            { idx: 2, role: 'initiator' },
            // Game 2: X wins top row again
            { idx: 0, role: 'initiator' }, { idx: 3, role: 'target' },
            { idx: 1, role: 'initiator' }, { idx: 4, role: 'target' },
            { idx: 2, role: 'initiator' },
        ] as { idx: number; role: 'initiator' | 'target' }[];
        const { state, finished } = playMoves(moves);
        expect(finished).toBe(true);
        expect(h.getWinner(state, I, T)).toBe(I);
    });

    it('draw resets board without awarding score', () => {
        // Fill board to draw: X O X / O X O / O X O
        const moves = [
            { idx: 0, role: 'initiator' }, { idx: 1, role: 'target' },
            { idx: 2, role: 'initiator' }, { idx: 4, role: 'target' },
            { idx: 3, role: 'initiator' }, { idx: 6, role: 'target' },
            { idx: 5, role: 'initiator' }, { idx: 8, role: 'target' },
            { idx: 7, role: 'initiator' },
        ] as { idx: number; role: 'initiator' | 'target' }[];
        const { state, finished } = playMoves(moves);
        expect(finished).toBe(false);
        expect(state.scores).toEqual({ initiator: 0, target: 0 });
        expect(state.board.every((c: any) => c === null)).toBe(true);
    });
});
