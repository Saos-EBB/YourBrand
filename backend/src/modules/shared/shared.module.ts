import { Global, Module } from '@nestjs/common';
import { TypedEventBus } from './events/app-events';
import { ModuleBroker } from './broker/module-broker';

@Global()
@Module({
    providers: [TypedEventBus, ModuleBroker],
    exports: [TypedEventBus, ModuleBroker],
})
export class SharedModule {}
