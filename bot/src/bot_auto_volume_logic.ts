import assert from 'assert';

import {
    LAMPORTS_PER_SOL,
    PublicKey, SystemProgram, TransactionMessage, VersionedTransaction
} from '@solana/web3.js';

import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token'

import * as database from './db';
import * as fastSwap from './fast_swap';
import * as pumpfunSwap from './pumpfun_swap';
import * as utils from './utils';
import * as constants from './uniconst';
import * as bot from './bot';
import * as global from './global';

import * as jitoBundler from "./jito_bundler"

const LAMPORTS_PER_TOKEN = 10 ** 6;

const LookUpTableMap = new Map()

const jito_bundler = new jitoBundler.JitoBundler()

export const registerToken = async (
    chatid: string, // this value is not filled in case of web request, so this could be 0
    addr: string,
    symbol: string,
) => {
    if (await database.selectToken({ chatid, addr })) {
        return constants.ResultCode.SUCCESS
    }
    const regist = await database.registToken({ chatid, addr, symbol })
    if (!regist) {
        return constants.ResultCode.INTERNAL
    }
    return constants.ResultCode.SUCCESS
};

const catchTax = async (chatid: string, addr: string) => {
    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    let depositWalletSOLBalance: number = await utils.getWalletSOLBalance(depositWallet)
    if (depositWalletSOLBalance <= 0) {
        return constants.ResultCode.USER_INSUFFICIENT_SOL
    }

    if (depositWalletSOLBalance - constants.MIN_TAX_AMOUNT <= 0) {
        return constants.ResultCode.USER_INSUFFICIENT_ENOUGH_SOL
    }

    const token: any = await database.selectToken({ chatid, addr })
    let tax: number = (Math.floor(token.currentVolume / constants.VOLUME_UNIT) + 1) * constants.MIN_TAX_AMOUNT - token.totalPayed

    if (depositWalletSOLBalance < tax) {
        tax = depositWalletSOLBalance - 0.01
    }

    if (tax <= 0) {
        return constants.ResultCode.SUCCESS
    }

    console.log(`catchTax: tax is ${tax}`);

    const bundleInstructions: any[] = []
    bundleInstructions.push(pumpfunSwap.getTransferSOLInst(depositWallet, global.get_tax1_wallet_address(), tax))
    const versionedTransaction = await pumpfunSwap.getVersionedTransaction([depositWallet.wallet], bundleInstructions, null)
    const result: boolean = await jito_bundler.sendBundles([versionedTransaction], depositWallet, 4)
    token.totalPayed = tax
    await token.save()
    return constants.ResultCode.SUCCESS
}

const createTokenAccount = async (depositWallet: any, wallets: any, token: any) => {
    try {
        let bundleInstructions: any[] = []
        bundleInstructions.push(pumpfunSwap.getPriorityFeeInst())
        let bundleCaller: any[] = []
        for (let wallet of wallets) {

            bundleInstructions.push(pumpfunSwap.getCreateAccountTransactionInst(depositWallet, wallet, token.addr))
            if (bundleInstructions.length >= constants.LIMIT_WALLET_SIZE + 1) {
                bundleCaller.push(await pumpfunSwap.getVersionedTransaction([depositWallet.wallet], bundleInstructions, LookUpTableMap.get(token.addr)))
                bundleInstructions = []
                bundleInstructions.push(pumpfunSwap.getPriorityFeeInst())
            }
        }
        if (bundleInstructions.length > 1) {
            bundleCaller.push(await pumpfunSwap.getVersionedTransaction([depositWallet.wallet], bundleInstructions, LookUpTableMap.get(token.addr)))
            bundleInstructions = []
        }
        console.log("calling create account transaction bundling ");

        // bundleCaller = await Promise.all(bundleCaller)
        console.log("sending creation bundling");

        await jito_bundler.sendBundles(bundleCaller, depositWallet, 10)
    } catch (error) {
        console.log(error);

        await createTokenAccount(depositWallet, wallets, token)
    }
}

const getRandomAmounts = async (depositWallet: any, token: any): Promise<number[]> => {
    const walletBalance: number = (await utils.getWalletSOLBalance(depositWallet) - constants.JITO_FEE_AMOUNT) * (token.buyAmount / 100)
    const min: number = 0.007 + constants.MIN_REST_SOL
    const max: number = walletBalance / 2
    const randomAmounts: number[] = []
    if (walletBalance <= min * (constants.LIMIT_WALLET_SIZE * 1.5)) {
        console.log(`walletBalance ${walletBalance} is less than minimum balance.`)
        return randomAmounts
    }

    let total = walletBalance
    for (let i = 0; i < constants.LIMIT_WALLET_SIZE; i++) {
        const randomSolAmount: number = parseFloat((min + Math.random() * (max - min)).toFixed(5))
        console.log(`index = ${i}, randomSolAmount = ${randomSolAmount}`);
        randomAmounts.push(randomSolAmount)
        total -= randomSolAmount
    }

    console.log("getRandomAmounts----total = ", total);
    if (total < 0 || total > walletBalance * 0.9) {
        return await getRandomAmounts(depositWallet, token)
    }
    return randomAmounts
}

const makeRefundInstructions = async (depositWallet: any, token: any, wallet: any, restBal: number): Promise<any> => {
    try {
        let bundleInstructions: any[] = []
        const tokenBal: number = await utils.getWalletTokenBalance(wallet, token.addr, token.decimal)
        let solBal: number = await utils.getWalletSOLBalance(wallet)
        // console.log("===", tokenBal);
        // console.log("===", solBal);

        if (tokenBal > 1) {

            const solAmount = await pumpfunSwap.calcAmountOut(token.addr, tokenBal + restBal, false);
            const instructions: any | null = await pumpfunSwap.getSellInstructions(wallet, token.addr, 
                (tokenBal + restBal) * LAMPORTS_PER_TOKEN, solAmount * LAMPORTS_PER_SOL)

            if(!instructions) {
                return null
            }

            bundleInstructions = instructions.instructions
            solBal += parseFloat(solAmount.toFixed(9))
        }
        if (solBal > constants.MIN_REST_SOL) {
            bundleInstructions.push(pumpfunSwap.getTransferSOLInst(wallet, depositWallet.publicKey, solBal - constants.MIN_REST_SOL))
        }
        // console.log("_+_+_+", bundleInstructions.length);

        return bundleInstructions
    } catch (error) {
        await utils.sleep(500)
        return makeRefundInstructions(depositWallet, token, wallet, restBal)
    }
}

const makeTransferTokenAndSolInstructions = async (depositWallet: any, token: any, wallet: any, dest: any): Promise<any> => {
    try {
        let bundleInstructions: any[] = []
        const tokenBal: number = await utils.getWalletTokenBalance(wallet, token.addr, token.decimal)
        let solBal: number = await utils.getWalletSOLBalance(wallet)
        if (tokenBal > 1) {
            const transferToken = await pumpfunSwap.getTransferTokenInst(wallet, dest.publicKey, token, tokenBal)

            bundleInstructions.push(transferToken)
        }
        if (solBal > constants.MIN_REST_SOL) {
            bundleInstructions.push(pumpfunSwap.getTransferSOLInst(wallet, depositWallet.publicKey, solBal - constants.MIN_REST_SOL))
        }

        return bundleInstructions
    } catch (error) {
        await utils.sleep(500)
        return makeTransferTokenAndSolInstructions(depositWallet, token, wallet, dest)
    }
}

const refund = async (chatid: string, addr: string, wallets: any[]) => {
    console.log("refunding..");

    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    const token: any = await database.selectToken({ chatid, addr })

    let bundleCaller: any[] = []
    let totaltokenBalance: number = 0
    for (let wallet of wallets.slice(0, wallets.length - 1)) {
        totaltokenBalance += await utils.getWalletTokenBalance(wallet, token.addr, token.decimal)
        bundleCaller.push(makeTransferTokenAndSolInstructions(depositWallet, token, wallet, wallets[wallets.length - 1]))
    }
    bundleCaller.push(makeRefundInstructions(depositWallet, token, wallets[wallets.length - 1], totaltokenBalance))
    bundleCaller = await Promise.all(bundleCaller)

    let bundleInstructions: any[] = []
    let versionedBundleCaller: any[] = []
    let signers: any[] = []
    for (let i = 0; i < wallets.length; i++) {
        signers.push(wallets[i].wallet)
        bundleInstructions = bundleInstructions.concat(bundleCaller[i])

        if (bundleInstructions.length >= 8) {
            versionedBundleCaller.push(pumpfunSwap.getVersionedTransaction(signers, bundleInstructions, LookUpTableMap.get(token.addr)))
            bundleInstructions = []
            signers = []
        }
    }
    if (bundleInstructions.length) {
        versionedBundleCaller.push(pumpfunSwap.getVersionedTransaction(signers, bundleInstructions, LookUpTableMap.get(token.addr)))
    }
    // console.log("--", versionedBundleCaller.length);
    const bundleTransactions: any[] = await Promise.all(versionedBundleCaller)
    // console.log("--", bundleTransactions.length);

    console.log("refund request", await jito_bundler.sendBundles(bundleTransactions, depositWallet, 10))
    for (let k = 0; k < 20; k++) {
        if (await utils.getWalletSOLBalance(wallets[0]) < 0.003) {
            break
        }
        await utils.sleep(2000)
    }
}

const instructionMixer = (arrayA: any[], arrayB: any[]) => {

    const delivery: any[] = new Array(arrayA.length + arrayB.length)
    const orderIndexs: number[] = new Array(arrayA.length + arrayB.length)
    for (let index = 0; index < arrayA.length; index++) {
        let indexA: number = 0
        let indexB: number = 0
        while (indexA >= indexB || delivery[indexA] || delivery[indexB]) {
            indexA = Math.floor(Math.random() * delivery.length)
            indexB = Math.floor(Math.random() * delivery.length)
        }

        // delivery[index * 2] = arrayA[index].instructions
        delivery[indexA] = arrayA[index].instructions
        console.log("buy index ", indexA);

        // delivery[index * 2 + 1] = arrayB[index].instructions
        delivery[indexB] = arrayB[index].instructions
        console.log("sell index ", indexB);
        // orderIndexs[index * 2] = index
        orderIndexs[indexA] = index
        // orderIndexs[index * 2 + 1] = index
        orderIndexs[indexB] = index
    }

    return { mixed: delivery, order: orderIndexs }
}

const getTokenBalances = async (wallets: any[], token: any): Promise<number[]> => {
    try {
        const bundleCaller: any[] = []
        for (let index = 0; index < wallets.length; index++) {
            bundleCaller.push(utils.getWalletTokenBalance(wallets[index], token.addr, token.decimal))
        }
        return await Promise.all(bundleCaller)
    } catch (error) {
        await utils.sleep(500)
        return await getTokenBalances(wallets, token)
    }
}


const getSOLBalances = async (wallets: any[]): Promise<number[]> => {
    try {
        const bundleCaller: any[] = []
        for (let index = 0; index < wallets.length; index++) {
            bundleCaller.push(utils.getWalletSOLBalance(wallets[index]))
        }
        return await Promise.all(bundleCaller)
    } catch (error) {
        await utils.sleep(500)
        return await getSOLBalances(wallets)
    }
}


const isDefferentArray = (arrayA: any[], arrayB: any[]) => {
    let count: number = 0
    for (let item of arrayA) {
        if (arrayB.indexOf(item) >= 0) {
            count++
        }
    }
    return count == 0
}

const run = async (chatid: string, addr: string) => {
    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    let token: any = await database.selectToken({ chatid, addr })

    console.log("========================== run =============================")

    if (!token.status) {
        return
    }
    // create new wallets
    console.log("create new wallets");

    const newWallets: any[] = []
    for (let i = 0; i < constants.LIMIT_WALLET_SIZE * 4; i++) {
        //create new wallet
        const newWallet: any = utils.generateNewWallet()
        await database.addWallet({ chatid, tokenAddr: addr, prvKey: newWallet.secretKey })
        newWallets.push(newWallet)
    }

    console.log("create token accs");
    await createTokenAccount(depositWallet, newWallets, token)
    await utils.sleep(5000)

    const randomSolAmounts: any[] = await getRandomAmounts(depositWallet, token)
    console.log("randomSolAmounts: ", randomSolAmounts);

    const _wallets: any[] = newWallets.slice(0, constants.LIMIT_WALLET_SIZE)
    if (!randomSolAmounts.length) {
        await stop(chatid, addr)
        return
    }

    const bundleInstructions: any[] = []
    for (let index = 0; index < constants.LIMIT_WALLET_SIZE; index++) {
        bundleInstructions.push(pumpfunSwap.getTransferSOLInst(depositWallet, _wallets[index].publicKey, randomSolAmounts[index]))
    }
    const versionedTransaction = await pumpfunSwap.getVersionedTransaction([depositWallet.wallet], bundleInstructions, LookUpTableMap.get(token.addr))
    await jito_bundler.sendBundles([versionedTransaction], depositWallet, 10)
    await utils.sleep(10000)
    for (let i = 0; i < 20; i++) {
        let allReceived = true
        for (let wallet of _wallets) {
            const solBalance: number = await utils.getWalletSOLBalance(wallet)
            if (!solBalance) {
                allReceived = false
            }
        }
        if (allReceived) {
            break
        }
        await utils.sleep(1000)
    }

    await buyAndSell(chatid, addr, newWallets)

    // gather soll
    await refund(chatid, addr, newWallets.slice(3 * constants.LIMIT_WALLET_SIZE))
    gatherSol(depositWallet, newWallets)
    setTimeout(() => { run(chatid, addr) }, 1000)
}

const gatherSol = async (depositWallet: any, newWallets: any[]) => {
    for (let i = 0; i < newWallets.length; i++) {
        try {
            const solBal: number = await utils.getWalletSOLBalance(newWallets[i])
            if (solBal < 0.0021) {
                continue
            }
            const transactions: any[] = []
            transactions.push(SystemProgram.transfer({
                fromPubkey: newWallets[i].wallet.publicKey,
                toPubkey: depositWallet.wallet.publicKey,
                lamports: Math.floor((solBal - 0.002005) * LAMPORTS_PER_SOL),
            }))
            const messageV0 = new TransactionMessage({
                payerKey: newWallets[i].wallet.publicKey,
                recentBlockhash: (await global.web3Conn.getLatestBlockhash("finalized")).blockhash,
                instructions: transactions
            }).compileToV0Message();

            const versionedTransaction = new VersionedTransaction(messageV0)

            versionedTransaction.sign([newWallets[i].wallet])
            await pumpfunSwap.sendVersionedTransaction(versionedTransaction, 20);

        } catch (error) {
            await utils.sleep(300)
            i--
        }
        await utils.sleep(100)
    }
}

const buyAndSell = async (chatid: string, addr: string, wallets: any[]) => {
    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    let token: any = await database.selectToken({ chatid, addr })
    const totalSOLAmount: number = (await getSOLBalances(wallets.slice(0, constants.LIMIT_WALLET_SIZE))).reduce((total: number, value: number) => { return total + value })

    //buy and sell tokens per 7 wallets
    for (let index = 0; index < 4; index++) {
        const _wallets: any[] = wallets.slice(index * constants.LIMIT_WALLET_SIZE, (index + 1) * constants.LIMIT_WALLET_SIZE)

        let buyBundleCaller: any[] = []
        let sellBundleCaller: any[] = []
        let tokenAmount: number[] = [];

        const tokenOldBalances: number[] = await getTokenBalances(_wallets, token)

        const buy = async () => {
            try {
                for (let index = 0; index < _wallets.length; index++) {
                    const solBal: number = await utils.getWalletSOLBalance(_wallets[index])
                    console.log("sol balance ", solBal);

                    tokenAmount.push(Math.floor(await pumpfunSwap.calcAmountOut(addr, solBal - constants.MIN_REST_SOL, true) * 
                        LAMPORTS_PER_TOKEN * 80 / 100));
                    buyBundleCaller.push(pumpfunSwap.getBuyInstructions(_wallets[index], addr, tokenAmount[index], 
                        (solBal - constants.MIN_REST_SOL) * LAMPORTS_PER_SOL))
                    await utils.sleep(150)
                }
                buyBundleCaller = await Promise.all(buyBundleCaller)
            } catch (error) {
                buyBundleCaller = []
                console.log(error);

                await utils.sleep(500)
                await buy()
            }
        }

        const sell = async () => {
            try {
                for (let index = 0; index < _wallets.length; index++) {

                    const solAmount = Math.floor(await pumpfunSwap.calcAmountOut(token.addr, tokenAmount[index] / LAMPORTS_PER_TOKEN, false) * 
                        LAMPORTS_PER_SOL * 50 / 100);
                    sellBundleCaller.push(pumpfunSwap.getSellInstructions(_wallets[index], token.addr, tokenAmount[index], solAmount))
                    await utils.sleep(150)
                }
                sellBundleCaller = await Promise.all(sellBundleCaller)
            } catch (error) {
                sellBundleCaller = []
                console.log(error);

                await utils.sleep(500)
                await sell()
            }
        }

        let maxRetry: number = 3
        const buySell = async () => {
            try {
                await buy()
                await sell()

                const { mixed: instructions, order: newOrder } = instructionMixer(buyBundleCaller, sellBundleCaller)

                buyBundleCaller = []
                sellBundleCaller = []

                let bundleCaller: any[] = []
                let mergedInstructions: any[] = []
                let keyPairs: any[] = []

                const makeTransactions = async () => {
                    try {
                        for (let index = 0; index < instructions.length; index++) {
                            mergedInstructions = mergedInstructions.concat(instructions[index])

                            let exist: boolean = false
                            for (let keyPair of keyPairs) {
                                if (keyPair.publicKey.toString() == _wallets[newOrder[index]].wallet.publicKey.toString()) {
                                    exist = true
                                    break
                                }
                            }
                            if (!exist) {
                                keyPairs.push(_wallets[newOrder[index]].wallet)
                            }

                            if (mergedInstructions.length >= 12) {
                                bundleCaller.push(pumpfunSwap.getVersionedTransaction(keyPairs, mergedInstructions, LookUpTableMap.get(token.addr)))
                                mergedInstructions = []
                                keyPairs = []
                            }
                        }

                        if (mergedInstructions.length) {
                            mergedInstructions.push(pumpfunSwap.getTransferSOLInst(depositWallet, constants.JITO_TIP_ACCOUNT, constants.JITO_BUNDLE_TIP))
                            keyPairs.push(depositWallet.wallet)
                            bundleCaller.push(pumpfunSwap.getVersionedTransaction(keyPairs, mergedInstructions, LookUpTableMap.get(token.addr)))
                            mergedInstructions = []
                        }
                        bundleCaller = await Promise.all(bundleCaller)
                    } catch (error) {
                        keyPairs = []
                        mergedInstructions = []
                        bundleCaller = []
                        console.log(error);

                        await utils.sleep(500)
                        await makeTransactions()
                    }
                }

                await makeTransactions()

                if (!await jito_bundler.sendBundles(bundleCaller, null, 3)) {
                    maxRetry--
                    if (maxRetry > 0) {
                        await buySell()
                    }
                }
            } catch (error) {
                await buySell()
            }
        }

        token = await database.selectToken({ chatid, addr })
        if (token.status) {
            await buySell()

            // confirm and transfer
            console.log("confirm and transfer");

            let tokenNewBalances: number[] = []
            for (let i = 0; i < 15; i++) {
                try {
                    console.log("buy sell checking");

                    tokenNewBalances = await getTokenBalances(_wallets, token)
                    console.log(tokenNewBalances);

                    if (tokenNewBalances.indexOf(0) < 0 && isDefferentArray(tokenOldBalances, tokenNewBalances)) {
                        const solPrice: number = await utils.getSOLPrice()
                        token.currentVolume += totalSOLAmount * 2 * solPrice
                        const now: number = new Date().getTime()
                        token.workingTime += (now - token.lastWorkedTime)
                        token.lastWorkedTime = now
                        await token.save()
                        break
                    }
                } catch (error) {
                    i--
                }
                await utils.sleep(2500)
            }
        }
        // send random token and sol
        let nextWallets: any[] = []
        if (index < 3) {
            nextWallets = wallets.slice((index + 1) * constants.LIMIT_WALLET_SIZE, (index + 2) * constants.LIMIT_WALLET_SIZE)
        }
        if (!token.status) {
            index = 3
            nextWallets = wallets.slice(3 * constants.LIMIT_WALLET_SIZE, 4 * constants.LIMIT_WALLET_SIZE)
        }

        const sendSOLAndTokenToNextWallets = async () => {
            let mergedInstructions: any[] = []
            mergedInstructions.push(pumpfunSwap.getPriorityFeeInst())
            const bundleTransactions: any[] = []
            let keyPairs: any[] = []
            try {
                for (let j = 0; j < _wallets.length; j++) {
                    const solBal: number = parseFloat((await utils.getWalletSOLBalance(_wallets[j]) - constants.MIN_REST_SOL).toFixed(5))
                    const tokenBal: number = parseFloat((await utils.getWalletTokenBalance(_wallets[j], token.addr, token.decimal)).toFixed(5)) - 1
                    keyPairs.push(_wallets[j].wallet)
                    // console.log("rest sol ", solBal, solBal * 0.9, solBal * 0.1);
                    // console.log("rest token ", tokenBal);

                    if (tokenBal > 0) {
                        mergedInstructions.push(await pumpfunSwap.getTransferTokenInst(_wallets[j], nextWallets[j].publicKey, token, parseFloat((tokenBal / 2).toFixed(5))))
                        mergedInstructions.push(await pumpfunSwap.getTransferTokenInst(_wallets[j], nextWallets[Math.floor(Math.random() * nextWallets.length)].publicKey, token, parseFloat((tokenBal / 2).toFixed(5))))
                    }
                    if (solBal > 0) {
                        mergedInstructions.push(pumpfunSwap.getTransferSOLInst(_wallets[j], nextWallets[j].publicKey, solBal))
                        // mergedInstructions.push(pumpfunSwap.getTransferSOLInst(_wallets[j], nextWallets[Math.floor(Math.random() * nextWallets.length)].publicKey, parseFloat((solBal * 0.2).toFixed(5))))
                    }

                    if (mergedInstructions.length >= 8) {

                        bundleTransactions.push(await pumpfunSwap.getVersionedTransaction(keyPairs, mergedInstructions, LookUpTableMap.get(token.addr)))
                        keyPairs = []
                        mergedInstructions = []
                        mergedInstructions.push(pumpfunSwap.getPriorityFeeInst())
                    }
                    await utils.sleep(150)
                }
                if (mergedInstructions.length > 1) {
                    bundleTransactions.push(await pumpfunSwap.getVersionedTransaction(keyPairs, mergedInstructions, LookUpTableMap.get(token.addr)))
                    keyPairs = []
                    mergedInstructions = []
                }
                console.log("seding random sol to next wallets..", await jito_bundler.sendBundles(bundleTransactions, depositWallet, 10));
                await utils.sleep(5000)
                for (let k = 0; k < 10; k++) {
                    if (await utils.getWalletSOLBalance(_wallets[0]) < 0.0025) {
                        break
                    }
                    await utils.sleep(1000)
                }
            } catch (error) {
                await utils.sleep(500)
                await sendSOLAndTokenToNextWallets()
            }
        }

        if (nextWallets.length) {
            await sendSOLAndTokenToNextWallets()

            await utils.sleep(token.delayTime * 1000)
        }
    }
}

export const start = async (
    chatid: string,
    addr: string,
): Promise<constants.ResultCode> => {
    assert(chatid);
    assert(addr);

    const token: any = await database.selectToken({ chatid, addr })
    if (!token) {
        return constants.ResultCode.INTERNAL
    }

    if (token.status) {
        return constants.ResultCode.SUCCESS
    }
    token.status = true
    await token.save()
    // catch tax
    // if (token.workingTime === 0) {
    //     const result: any = await catchTax(chatid, addr)
    //     if (result != constants.ResultCode.SUCCESS) {
    //         return result
    //     }
    // }

    // load lookup table
    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)

    console.log(`---------${user.username} started bot with token: ${addr}---------`);

    console.log("load lookup table");
    if (token.lookupTableAddr && token.lookupTableAddr != "") {
        const lookupTableAccount: any = (await global.web3Conn.getAddressLookupTable(new PublicKey(token.lookupTableAddr), { commitment: "finalized" })).value
        LookUpTableMap.set(token.addr, lookupTableAccount)
    }

    if (!token.lookupTableAddr || token.lookupTableAddr == "") {

        let depositWalletSOLBalance: number = await utils.getWalletSOLBalance(depositWallet)
        console.log(`deposit wallet sol balance: ${depositWalletSOLBalance}`);
        if (depositWalletSOLBalance <= (constants.JITO_FEE_AMOUNT + constants.LIMIT_REST_SOL_AMOUNT)) {
            return constants.ResultCode.USER_INSUFFICIENT_JITO_FEE_SOL
        }

        const createLookupTable = await pumpfunSwap.getCreateLookUpTableTransaction(depositWallet, addr)
        if(await jito_bundler.sendBundles(createLookupTable.transactions, depositWallet, 10)) {
            token.lookupTableAddr = createLookupTable.address.toString()
            console.log(`lookup table ${token.lookupTableAddr} is created.`)

            for (let index = 0; index < 20; index++) {
                await utils.sleep(1000)
                const lookupTableAccount: any = (await global.web3Conn.getAddressLookupTable(new PublicKey(token.lookupTableAddr), { commitment: "finalized" })).value
                if (lookupTableAccount) {
                    LookUpTableMap.set(token.addr, lookupTableAccount)
                    break
                }
            }
    
            console.log(`lookup table ${token.lookupTableAddr} is confirmed.`)

        } else {
            console.log(`Creating lookup table ${token.lookupTableAddr} is failed.`)
            return constants.ResultCode.INTERNAL;
        }        
    }

    token.lastWorkedTime = new Date().getTime()
    run(chatid, addr)
    await token.save()

    return constants.ResultCode.SUCCESS
};

export const stop = async (chatid: string, addr: string) => {
    assert(addr);

    const token: any = await database.selectToken({ chatid, addr })
    if (!token) {
        return
    }
    const user: any = await database.selectUser({ chatid })
    console.log(`---------${user.username} stopped bot with token: ${addr}---------`);

    await catchTax(chatid, addr)

    token.status = false
    await token.save()
}

export const withdraw = async (chatid: string, addr: string) => {
    const user: any = await database.selectUser({ chatid })
    if (!user) {
        return false
    }
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    let depositWalletSOLBalance: number = await utils.getWalletSOLBalance(depositWallet) - 0.01
    if (depositWalletSOLBalance <= 0) {
        return false
    }

    const session: any = bot.sessions.get(chatid)
    const token: any = await database.selectToken({ chatid, addr: session.addr })
    if (!token) {
        return false
    }

    console.log("withdraw sols...")

    const bundleInstructions: any[] = []
    bundleInstructions.push(pumpfunSwap.getTransferSOLInst(depositWallet, addr, depositWalletSOLBalance))
    const bundleTransactions: any[] = []
    bundleTransactions.push(await pumpfunSwap.getVersionedTransaction([depositWallet.wallet], bundleInstructions, null))
    const result: boolean = await jito_bundler.sendBundles(bundleTransactions, depositWallet, 4)
    return true
}

export const setTargetAmount = async (chatid: string, addr: string, amount: number) => {
    const token: any = await database.selectToken({ chatid, addr })
    token.targetVolume = amount
    await token.save()
    return true
}

export const setRating = async (chatid: string, addr: string, amount: number) => {
    const token: any = await database.selectToken({ chatid, addr })
    token.delayTime = amount
    await token.save()
    return true
}

export const setBuyAmount = async (chatid: string, addr: string, amount: number) => {
    const token: any = await database.selectToken({ chatid, addr })
    token.buyAmount = amount
    await token.save()
    return true
}

