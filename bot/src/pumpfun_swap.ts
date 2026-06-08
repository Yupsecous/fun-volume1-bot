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
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  NATIVE_MINT
} from '@solana/spl-token';
import {
  AnchorProvider,
  Program,
  Wallet
} from '@project-serum/anchor';
import bs58 from 'bs58'
import BN from 'bn.js'
import * as constants from './uniconst'
import * as utils from './utils'
import * as global from './global'
import { IDL } from './pumpfun_idl';

const LAMPORTS_PER_TOKEN = 10 ** 6;

const MINT_AUTHORITY="TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM"
const TOKEN_PROGRRAM="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const GLOBAL_ACCOUNT="4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf"
const FEE_RECIPIENT="CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"
const EVENT_AUTHORITY="Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"
const SYSTEM_PROGRAM="11111111111111111111111111111111"
const SYSTEM_RENT="SysvarRent111111111111111111111111111111111"
const MPL_TOKEN_METADATA="metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const mintAuthority = new PublicKey(MINT_AUTHORITY);
const tokenProgram = new PublicKey(TOKEN_PROGRRAM);
const globalAccount = new PublicKey(GLOBAL_ACCOUNT);
const feeRecipient = new PublicKey(FEE_RECIPIENT);
const eventAuthority = new PublicKey(EVENT_AUTHORITY);
const systemProgram = new PublicKey(SYSTEM_PROGRAM);
const rent = new PublicKey(SYSTEM_RENT);
const mplTokenMetadata = new PublicKey(MPL_TOKEN_METADATA);

async function getBondingCurve(tokenMint: PublicKey, programId: PublicKey) {
  const seedString = "bonding-curve";
  
  const [PDA, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(seedString), tokenMint.toBuffer()],
      programId,
  );

  return new PublicKey(PDA);
}

async function getMetadataAccount(tokenMint: PublicKey, programId: PublicKey) {
  const seedString = "metadata";
  
  const [PDA, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(seedString), mplTokenMetadata.toBuffer(), tokenMint.toBuffer()],
      mplTokenMetadata,
  );

  return new PublicKey(PDA);
}

async function getMintAuthority(programId: PublicKey) {
  const seedString = "mint-authority";
  
  const [PDA, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(seedString)],
      programId,
  );

  return new PublicKey(PDA);
}


export const PoolKeysMap = new Map()

export const getCreateLookUpTableTransaction = async (payer: any, tokenAddress: string) => {
  const slot = await global.web3Conn.getSlot();
  const tokenMint = new PublicKey(tokenAddress);

  const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: payer.wallet.publicKey,
      payer: payer.wallet.publicKey,
      recentSlot: slot,
    });

  const programId = new PublicKey(PUMP_PROGRAM_ID);
  const mintAuthority = await getMintAuthority(programId);
  const bondingCurve = await getBondingCurve(tokenMint, programId);
  const associatedBondingCurve = await getAssociatedTokenAddress(tokenMint, bondingCurve, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID)
  const metadataAccount = await getMetadataAccount(tokenMint, programId);

  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: payer.wallet.publicKey,
    authority: payer.wallet.publicKey,
    lookupTable: lookupTableAddress,
    addresses: [
      SystemProgram.programId,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      new PublicKey(MINT_AUTHORITY),
      new PublicKey(TOKEN_PROGRRAM),
      new PublicKey(GLOBAL_ACCOUNT),
      new PublicKey(FEE_RECIPIENT),
      new PublicKey(EVENT_AUTHORITY),
      new PublicKey(SYSTEM_PROGRAM),
      new PublicKey(SYSTEM_RENT),
      new PublicKey(MPL_TOKEN_METADATA),
      new PublicKey(PUMP_PROGRAM_ID),
      new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
      programId,
      mintAuthority,
      bondingCurve,
      associatedBondingCurve,
      metadataAccount,
      tokenMint,
      payer.wallet.publicKey
    ],
  });

  const recentBlockhash = await global.web3Conn.getLatestBlockhash("finalized")

  const versionedTransaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer.wallet.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [lookupTableInst, extendInstruction],
    }).compileToV0Message()
  )
  versionedTransaction.sign([payer.wallet])

  return { transactions: [versionedTransaction], address: lookupTableAddress }
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
  tokenAddress: string,
  amount: number,
  maxSolCost: number
) => {

  console.log("getBuyInstructions---amount = ", amount, "maxSolCost = ", maxSolCost)
  
  try {
    const amountBN = new BN(Math.floor(amount));
    const maxSolCostBN = new BN(Math.floor(maxSolCost));
    const tokenMint = new PublicKey(tokenAddress);
    
    // Set up provider and program
    const provider = new AnchorProvider(
        // new web3.Connection(process.env.RPC_URL), // Change to 'mainnet-beta' if needed
        global.web3Conn,
        new Wallet(payer.wallet),
        { preflightCommitment: 'processed' }
    );

    const program = new Program(IDL, PUMP_PROGRAM_ID, provider);
    const bondingCurve = await getBondingCurve(tokenMint, program.programId);
    const associatedBondingCurve = await getAssociatedTokenAddress(tokenMint, bondingCurve, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID)
    const associatedToken = await getAssociatedTokenAddress(tokenMint, payer.wallet.publicKey, false, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID)
  
    let bCreateAssociatedToken = true
    let accountInfo = await global.web3Conn.getParsedAccountInfo(associatedToken);
  
    if (accountInfo.value !== null) {
        bCreateAssociatedToken = false
    }

    console.log("associatedToken: ", associatedToken.toString(), "bCreateAssociatedToken: ", bCreateAssociatedToken);

    let instructions: any[] = []
  
    const createTokenAccountInst = createAssociatedTokenAccountInstruction(
        payer.wallet.publicKey,
        associatedToken,
        payer.wallet.publicKey,
        tokenMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )
  
    // Set up the instructions for the transaction
    const buyInstructions = [
        program.instruction.buy(amountBN, maxSolCostBN, {
            accounts: {
                global: globalAccount,
                feeRecipient,
                mint: tokenMint,
                bondingCurve,
                associatedBondingCurve,
                associatedUser: associatedToken, // Assuming 'associatedUser' should be the 'user' account
                user: payer.wallet.publicKey,
                systemProgram: systemProgram,
                tokenProgram: tokenProgram,
                rent: rent,
                eventAuthority,
                program: program.programId
            }
        })
    ];

    if(bCreateAssociatedToken)
        instructions.push(createTokenAccountInst)
  
    instructions.push(...buyInstructions)
  
    return { instructions: instructions }

  } catch (e) {
    console.error(`An error occured while making buy instructions: ${e}`);
    return null;
  }  
}

export const getSellInstructions = async (
  payer: any,
  tokenAddress: string,
  amount: number,
  minSolOutput: number
) => {

  console.log("getSellInstructions---amount = ", amount, "minSolOutput = ", minSolOutput)

  try {
    const tokenMint = new PublicKey(tokenAddress);
    const amountBN = new BN(Math.floor(amount));
    const minSolOutputBN = new BN(Math.floor(minSolOutput));

    // Set up provider and program
    const provider = new AnchorProvider(
        // new web3.Connection(process.env.RPC_URL), // Change to 'mainnet-beta' if needed
        global.web3Conn,
        new Wallet(payer.wallet),
        { preflightCommitment: 'processed' }
    );

    const program = new Program(IDL, PUMP_PROGRAM_ID, provider);
    const bondingCurve = await getBondingCurve(tokenMint, program.programId);
    const associatedBondingCurve = await getAssociatedTokenAddress(tokenMint, bondingCurve, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID)
    const associatedToken = await getAssociatedTokenAddress(tokenMint, payer.wallet.publicKey, false, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID)

    console.log("associatedToken: ", associatedToken.toString());

    // Set up the instructions for the transaction
    const instructions = [
        program.instruction.sell(amountBN, minSolOutputBN, {
            accounts: {
                global: globalAccount,
                feeRecipient,
                mint: tokenMint,
                bondingCurve,
                associatedBondingCurve,
                associatedUser: associatedToken, // Assuming 'associatedUser' should be the 'user' account
                user: payer.wallet.publicKey,
                systemProgram: systemProgram,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                tokenProgram: tokenProgram,
                eventAuthority,
                program: program.programId
            }
        })
    ];

    return { instructions: instructions }

  } catch (error) {
      console.log(`An error occurred during make instructions for selling token. ${error}`)
      return null;
  }
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

export const calcAmountOut = async (tokenAddress: string, rawAmountIn: number, swapInDirection: boolean) => {

  let response = await fetch(
    `https://frontend-api-v3.pump.fun/coins/${tokenAddress}`
  );

  if (response.ok) {
      const data: any = await response.json();
      const tokensInBondingCurve =
          data.virtual_token_reserves / LAMPORTS_PER_TOKEN;
      const solsInBondingCurve = data.virtual_sol_reserves / LAMPORTS_PER_SOL;

      let amountOut = 0;

      if(swapInDirection) {
        amountOut = tokensInBondingCurve - 32190005730 / (solsInBondingCurve + rawAmountIn)
      } else {
        amountOut = (32190005730 / (tokensInBondingCurve - rawAmountIn) - solsInBondingCurve) * 101 / 100
      }

      return amountOut;
  } else {
      console.log(
          `An error occurred during fetching token info. ${response.statusText}`
      );
      return 0;
  }
}