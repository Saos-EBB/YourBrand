import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleBroker } from '../../shared/broker/module-broker';
import { CoinService } from './coin.service';

// Shop-Codes wie "coins:500" schreiben ueber die Vermittlung gut. Typ
// 'purchase': die Coins wurden im Shop gekauft (chk_coin_tx_type).
@Injectable()
export class CoinUnlockProvider implements OnModuleInit {
    constructor(
        private readonly coins: CoinService,
        private readonly broker: ModuleBroker,
    ) { }

    onModuleInit() {
        this.broker.provideUnlock('coins', ({ userId, amount, idempotencyKey }) =>
            this.coins.addCoins(userId, amount, 'purchase', undefined, idempotencyKey));
    }
}
