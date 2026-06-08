import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction, TransactionMessage, SystemProgram, AddressLookupTableProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from '@solana/web3.js'
import {
  Liquidity,
  LiquidityPoolKeys,
  jsonInfo2PoolKeys,
  LiquidityPoolJsonInfo,
  TokenAccount,
  Token,
  TokenAmount,
  TOKEN_PROGRAM_ID,
  MAINNET_PROGRAM_ID,
  LOOKUP_TABLE_CACHE,
  Percent,
  SPL_ACCOUNT_LAYOUT,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@raydium-io/raydium-sdk'
import {
  Market,
  MARKET_STATE_LAYOUT_V3,

} from '@project-serum/serum';
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  NATIVE_MINT
} from '@solana/spl-token';
import bs58 from 'bs58'
import * as constants from './uniconst'
import * as utils from './utils'
import * as global from './global'

export const PoolKeysMap = new Map()

export const loadPoolKeys_from_market = async (addr: string, decimal: number) => {
  let poolKeys: any = PoolKeysMap.get(addr)
  if (poolKeys && (poolKeys.baseMint.toString() === addr || poolKeys.quoteMint.toString() === addr)) {
    return poolKeys
  }

  try {
    const [{ publicKey: marketId, accountInfo }] = await Market.findAccountsByMints(
      global.web3Conn,
      new PublicKey(addr),
      NATIVE_MINT,
      MAINNET_PROGRAM_ID.OPENBOOK_MARKET
    );
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(accountInfo.data);
    poolKeys = Liquidity.getAssociatedPoolKeys({
      version: 4,
      marketVersion: 3,
      baseMint: new PublicKey(addr),
      quoteMint: NATIVE_MINT,
      baseDecimals: decimal,
      quoteDecimals: 9,
      marketId: marketId,
      programId: MAINNET_PROGRAM_ID.AmmV4,
      marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
    });
    poolKeys.marketBaseVault = marketInfo.baseVault;
    poolKeys.marketQuoteVault = marketInfo.quoteVault;
    poolKeys.marketBids = marketInfo.bids;
    poolKeys.marketAsks = marketInfo.asks;
    poolKeys.marketEventQueue = marketInfo.eventQueue;
    PoolKeysMap.set(addr, poolKeys)
    return poolKeys
  } catch (error) {

  }
  try {
    const [{ publicKey: marketId, accountInfo }] = await Market.findAccountsByMints(
      global.web3Conn,
      NATIVE_MINT,
      new PublicKey(addr),
      MAINNET_PROGRAM_ID.OPENBOOK_MARKET
    );
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(accountInfo.data);
    poolKeys = Liquidity.getAssociatedPoolKeys({
      version: 4,
      marketVersion: 3,
      baseMint: NATIVE_MINT,
      quoteMint: new PublicKey(addr),
      baseDecimals: 9,
      quoteDecimals: decimal,
      marketId: marketId,
      programId: MAINNET_PROGRAM_ID.AmmV4,
      marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
    });
    poolKeys.marketBaseVault = marketInfo.baseVault;
    poolKeys.marketQuoteVault = marketInfo.quoteVault;
    poolKeys.marketBids = marketInfo.bids;
    poolKeys.marketAsks = marketInfo.asks;
    poolKeys.marketEventQueue = marketInfo.eventQueue;
    PoolKeysMap.set(addr, poolKeys)
    return poolKeys
  } catch (error) {

  }
  return null
}

export const getCreateLookUpTableTransaction = async (payer: any, poolKeys: any) => {
  const slot = await global.web3Conn.getSlot();
  const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: payer.wallet.publicKey,
      payer: payer.wallet.publicKey,
      recentSlot: slot,
    });
  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: payer.wallet.publicKey,
    authority: payer.wallet.publicKey,
    lookupTable: lookupTableAddress,
    addresses: [
      SystemProgram.programId,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      poolKeys.id,
      poolKeys.baseMint,
      poolKeys.quoteMint,
      poolKeys.lpMint,
      poolKeys.programId,
      poolKeys.authority,
      poolKeys.baseVault,
      poolKeys.quoteVault,
      poolKeys.lpVault,
      poolKeys.openOrders,
      poolKeys.targetOrders,
      poolKeys.withdrawQueue,
      poolKeys.marketProgramId,
      poolKeys.configId,
      poolKeys.marketId,
      poolKeys.marketAuthority,
      poolKeys.marketBaseVault,
      poolKeys.marketQuoteVault,
      poolKeys.marketBids,
      poolKeys.marketAsks,
      poolKeys.marketEventQueue,
    ],
  });
  const extraExtendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: payer.wallet.publicKey,
    authority: payer.wallet.publicKey,
    lookupTable: lookupTableAddress,
    addresses: [
      payer.wallet.publicKey,
      new PublicKey("ComputeBudget111111111111111111111111111111"),
      new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      new PublicKey("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"),
      new PublicKey("SysvarRent111111111111111111111111111111111"),
      new PublicKey("SysvarC1ock11111111111111111111111111111111"),
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
      new PublicKey("EUqojwWA2rd19FZrzeBncJsm38Jm1hEhE3zsmX3bRc2o"),
      new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"),
      new PublicKey("RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr"),
      new PublicKey("27haf8L6oxUeXrHrgEgsexjSY5hbVUWEmvv9Nyxg8vQv"),
      new PublicKey("5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h"),
      new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"),
      new PublicKey("routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS"),
      new PublicKey("EhhTKczWMGQt46ynNeRX1WfeagwwJd7ufHvCDjRxjo5Q"),
      new PublicKey("CBuCnLe26faBpcBP2fktp4rp8abpcAnTWft6ZrP5Q4T"),
      new PublicKey("9KEPoZmtHUrBbhWN1v1KWLMkkvwY6WLtAVUCPRtRjP4z"),
      new PublicKey("6FJon3QE27qgPVggARueB22hLvoh22VzJpXv4rBEoSLF"),
      new PublicKey("CC12se5To1CdEuw7fDS27B7Geo5jJyL7t5UK2B44NgiH"),
      new PublicKey("9HzJyW1qZsEiSfMUf6L2jo3CcTKAyBmSyKdwQeYisHrC"),
    ],
  });

  const recentBlockhash = await global.web3Conn.getLatestBlockhash("finalized")

  const versionedTransaction1 = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer.wallet.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [lookupTableInst, extendInstruction],
    }).compileToV0Message()
  )
  versionedTransaction1.sign([payer.wallet])
  const versionedTransaction2 = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer.wallet.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [extraExtendInstruction],
    }).compileToV0Message()
  )
  versionedTransaction2.sign([payer.wallet])
  return { transactions: [versionedTransaction1, versionedTransaction2], address: lookupTableAddress }
}

export const getCreateAccountTransactionInst = (payer: any, wallet: any, addr: string) => {
  const associatedToken = getAssociatedTokenAddressSync(
    new PublicKey(addr),
    wallet.wallet.publicKey,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return createAssociatedTokenAccountInstruction(
    payer.wallet.publicKey,
    associatedToken,
    wallet.wallet.publicKey,
    new PublicKey(addr),
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )
}

export const getBuyInstructions = async (
  payer: any,
  amount: number,
  poolKeys: LiquidityPoolKeys,
  maxLamports: number = constants.PRIORITY_RATE,
  fixedSide: 'in' | 'out' = 'in'
) => {
  const directionIn = NATIVE_MINT.toString() == poolKeys.baseMint.toString()
  const { minAmountOut: tokenMinAmount, amountIn: solAmountIn } = await calcAmountOut(poolKeys, amount, directionIn)

  const userTokenAccounts = await utils.getWalletTokenAccount(payer.wallet.publicKey, false)
  const swapToTokenTransaction = await Liquidity.makeSwapInstructionSimple({
    connection: global.web3Conn,
    makeTxVersion: 0,
    poolKeys: {
      ...poolKeys,
    },
    userKeys: {
      tokenAccounts: userTokenAccounts,
      owner: payer.wallet.publicKey,
    },
    amountIn: solAmountIn,
    amountOut: tokenMinAmount,
    fixedSide: fixedSide,
    config: {
      bypassAssociatedCheck: false,
    },
    computeBudgetConfig: {
      microLamports: maxLamports,
    },
  })

  const instructions = swapToTokenTransaction.innerTransactions[0].instructions.filter(Boolean)

  return { instructions: [instructions[1], instructions[2], instructions[3], instructions[4]], amount: tokenMinAmount }
}

export const getSellInstructions = async (
  payer: any,
  amount: number,
  poolKeys: LiquidityPoolKeys,
  maxLamports: number = constants.PRIORITY_RATE,
  fixedSide: 'in' | 'out' = 'in'
) => {
  const directionIn = NATIVE_MINT.toString() == poolKeys.baseMint.toString()

  const { minAmountOut: solMinAmount, amountIn: tokenAmountIn } = await calcAmountOut(poolKeys, amount, !directionIn)

  const userTokenAccounts = await utils.getWalletTokenAccount(payer.wallet.publicKey, false)
  const swapToSolTransaction = await Liquidity.makeSwapInstructionSimple({
    connection: global.web3Conn,
    makeTxVersion: 0,
    poolKeys: {
      ...poolKeys,
    },
    userKeys: {
      tokenAccounts: userTokenAccounts,
      owner: payer.wallet.publicKey,
    },
    amountIn: tokenAmountIn,
    amountOut: solMinAmount,
    fixedSide: fixedSide,
    config: {
      bypassAssociatedCheck: false,
    },
    computeBudgetConfig: {
      microLamports: maxLamports,
    },
  })

  const instructions = swapToSolTransaction.innerTransactions[0].instructions.filter(Boolean)

  return { instructions: [instructions[1], instructions[2], instructions[3], instructions[4]], amount: solMinAmount }
}

export const getVersionedTransaction = async (payers: any[], insts: any[], lookupAddr: any): Promise<any> => {
  try {
    const recentBlockhashForSwap = await global.web3Conn.getLatestBlockhash("finalized")

    const versionedTransaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: payers[0].publicKey,
        recentBlockhash: recentBlockhashForSwap.blockhash,
        instructions: insts,
      }).compileToV0Message(lookupAddr ? [lookupAddr] : [])
    )
    versionedTransaction.sign(payers)

    return versionedTransaction
  } catch (error) {
    console.log(error);

    await utils.sleep(1000)

    return await getVersionedTransaction(payers, insts, lookupAddr)
  }
}

export const getTransferSOLInst = (fromWallet: any, toAddr: string, amount: number) => {
  return SystemProgram.transfer({
    fromPubkey: fromWallet.wallet.publicKey,
    toPubkey: new PublicKey(toAddr),
    lamports: Math.floor(amount * LAMPORTS_PER_SOL),
  })
}

export const getPriorityFeeInst = () => {
  const PRIORITY_FEE_INSTRUCTIONS = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: constants.PRIORITY_RATE })
  return PRIORITY_FEE_INSTRUCTIONS
}

export const getTransferTokenInst = async (fromWallet: any, toAddr: string, token: any, amount: number) => {
  const from = await getOrCreateAssociatedTokenAccount(
    global.web3Conn,
    fromWallet.wallet,
    new PublicKey(token.addr),
    fromWallet.wallet.publicKey
  );

  const to = await getOrCreateAssociatedTokenAccount(
    global.web3Conn,
    fromWallet.wallet,
    new PublicKey(token.addr),
    new PublicKey(toAddr)
  );

  return createTransferInstruction(
    from.address,
    to.address,
    fromWallet.wallet.publicKey,
    Math.floor(amount * (10 ** token.decimal)))
}

export const sendVersionedTransaction = async (tx: VersionedTransaction, maxRetries?: number) => {
  const txid = await global.web3Conn.sendTransaction(tx, {
    skipPreflight: true,
    maxRetries: maxRetries,
  })

  return txid
}

export const simulateVersionedTransaction = async (tx: VersionedTransaction) => {
  const txid = await global.web3Conn.simulateTransaction(tx)

  return txid
}

const getTokenAccountByOwnerAndMint = (mint: PublicKey) => {
  return {
    programId: TOKEN_PROGRAM_ID,
    pubkey: PublicKey.default,
    accountInfo: {
      mint: mint,
      amount: 0,
    },
  } as unknown as TokenAccount
}


const calcAmountOut = async (poolKeys: LiquidityPoolKeys, rawAmountIn: number, swapInDirection: boolean) => {
  const poolInfo = await Liquidity.fetchInfo({ connection: global.web3Conn, poolKeys })

  let currencyInMint = poolKeys.baseMint
  let currencyInDecimals = poolInfo.baseDecimals
  let currencyOutMint = poolKeys.quoteMint
  let currencyOutDecimals = poolInfo.quoteDecimals

  if (!swapInDirection) {
    currencyInMint = poolKeys.quoteMint
    currencyInDecimals = poolInfo.quoteDecimals
    currencyOutMint = poolKeys.baseMint
    currencyOutDecimals = poolInfo.baseDecimals
  }

  const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals)
  const amountIn = new TokenAmount(currencyIn, rawAmountIn, false)
  const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals)
  const slippage = new Percent(50, 100)

  const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = Liquidity.computeAmountOut({
    poolKeys,
    poolInfo,
    amountIn,
    currencyOut,
    slippage,
  })

  return {
    amountIn,
    amountOut,
    minAmountOut,
    currentPrice,
    executionPrice,
    priceImpact,
    fee,
  }
}
