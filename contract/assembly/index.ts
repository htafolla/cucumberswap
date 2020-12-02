/*
 * This is an example of an AssemblyScript smart contract with two simple,
 * symmetric functions:
 *
 * 1. setGreeting: accepts a greeting, such as "howdy", and records it for the
 *    user (account_id) who sent the request
 * 2. getGreeting: accepts an account_id and returns the greeting saved for it,
 *    defaulting to "Hello"
 *
 * Learn more about writing NEAR smart contracts with AssemblyScript:
 * https://docs.near.org/docs/roles/developer/contracts/assemblyscript
 *
 */

import { context, ContractPromise, ContractPromiseBatch, logging, storage, u128, u128 } from 'near-sdk-as'

const BERRIES_CONTRACT = 'berryclub.ek.near';
const NEAR_NOMINATION = u128.from('1000000000000000000000000');
const MIN_BALANCE = NEAR_NOMINATION * u128.from(10);

function assertOwner(): void {
    //assert(context.predecessor == context.contractName, 'must be called by owner');
}

export function start(): void {
    assertOwner();
    assert(storage.contains('berries'), 'must deposit berries before starting');

    const availableBalance = context.accountBalance - MIN_BALANCE;
    storage.set('k', storage.get<u128>('berries') * availableBalance);
    storage.set('started', true);
}

export function stop(): void {
    assertOwner();

    storage.delete('started');
}

function assertPoolStarted(): void {
    assert(storage.contains('started'), 'pool not started yet');
}

export function buy(berries: u128): ContractPromiseBatch {
    assertPoolStarted();

    const internalBerries = storage.getSome<u128>('berries');
    assert(berries < internalBerries, 'not enough berries in pool');

    const resultingBerries = internalBerries - berries;
    const newNearAmount = storage.get<u128>('k') / resultingBerries;
    // TODO: What to do with remainder?
    const currentNearAmount = context.accountBalance - MIN_BALANCE;
    const nearPrice = newNearAmount - currentNearAmount;
    assert(nearPrice <= context.attachedDeposit, 'not enough NEAR attached, required ' + nearPrice.toString());

    storage.set('berries', resultingBerries);

    // TODO: Do we need to lock somehow before transfer end?
    // TODO: Transfer berries, refund NEAR
    return ContractPromiseBatch.create(context.predecessor)
        .transfer(nearPrice);

    // TODO: commission, etc
}

function sell(sender_id: string, berries: u128, nearAmount: u128): u128 {
    assertPoolStarted();

    const currentNearAmount = context.accountBalance - MIN_BALANCE;
    assert(nearAmount < currentNearAmount, 'not enough NEAR in pool');

    const newNear = currentNearAmount - nearAmount;
    const currentBerries = storage.getSome<u128>('berries');
    const k = storage.getSome<u128>('k');
    const newBerries = k / newNear;
    // TODO: What to do with remainder?
    const berriesPrice = newBerries - currentBerries;
    logging.log('k: ' + k.toString());
    logging.log('currentNearAmount: ' + currentNearAmount.toString());
    logging.log('newNear: ' + newNear.toString());
    logging.log('currentBerries: ' + currentBerries.toString());
    logging.log('newBerries: ' + newBerries.toString());
    logging.log('hey: ' + (u128.from('9801427805542018869750100000000') / u128.from('10')).toString());
    assert(berriesPrice <= berries, 'not enough berries attached, required ' + berriesPrice.toString());

    // TODO: Do we need to lock somehow before transfer end?

    storage.set('berries', newBerries);
    // TODO: Wait somehow for this promise?
    ContractPromiseBatch.create(sender_id).transfer(nearAmount);

    return berriesPrice;
}

@nearBindgen
class WithdrawFromVaultArgs {
    vault_id: string;
    receiver_id: string;
    amount: u128;
}

function withdrawFromVault(vault_id: string, receiver_id: string, amount: u128): ContractPromise {
    return ContractPromise.create<WithdrawFromVaultArgs>(BERRIES_CONTRACT,
        'withdraw_from_vault', { receiver_id, amount, vault_id }, 5000000000000);
}

export function on_receive_with_vault(sender_id: string, amount: u128, vault_id: string, payload: String): ContractPromise {
    // assert(context.predecessor == BERRIES_CONTRACT, "can only be called from token contract");

    if (payload.startsWith('sell:')) {
        const parts = payload.split(':');
        const nearAmount = u128.from(parts[0]);
        const berries = sell(sender_id, amount, nearAmount);
        if (berries < amount) {
            withdrawFromVault(vault_id, sender_id, amount - berries);
        }
        return withdrawFromVault(vault_id, context.contractName, berries);
    }

    if (payload == 'deposit') {
        assert(!storage.contains('started'), "deposit not supported after pool is started");
        storage.set('berries', storage.get('berries', u128.from(0))! + amount);
        return withdrawFromVault(vault_id, context.contractName, amount);
    }

    assert(false, 'unexpected payload: ' + payload);
    // NOTE: Never happens, but is return value is required
    return withdrawFromVault(vault_id, sender_id, amount);
}

