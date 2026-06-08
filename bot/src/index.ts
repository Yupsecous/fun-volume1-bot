import dotenv from 'dotenv';

import { Connection } from '@solana/web3.js';

import * as server from '../server';
import * as bot from './bot';
import * as afx from './global';

dotenv.config()

// const conn: Connection = new Connection(clusterApiUrl(afx.getCluserApiType() as any), "confirmed");
const conn: Connection = new Connection(process.env.MAINNET_RPC as string, "processed");

afx.setWeb3(conn)

bot.init()
bot.sessionInit()

process.on("SIGSEGV", async (e) => {
	await bot.bot.stopPolling()
	await bot.bot.closeWebHook()
	await bot.bot.deleteWebHook()
	// await bot.bot.close()
	await bot.init()
	await bot.sessionInit()
})

process.on("uncaughtException", async (e) => {
	await bot.bot.stopPolling()
	await bot.bot.closeWebHook()
	await bot.bot.deleteWebHook()
	// await bot.bot.close()
	await bot.init()
})


// depoDetector.start()
