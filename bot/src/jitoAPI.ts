import base58 from 'bs58';
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher';
import { Bundle } from 'jito-ts/dist/sdk/block-engine/types';

import {
	LAMPORTS_PER_SOL,
	PublicKey,
} from '@solana/web3.js';

import * as global from './global';
import * as utils from './utils';

export const createAndSendBundleTransaction = async (bundleTransactions: any, payer: any, apiKey: string, fee: number) => {
	const wallet = utils.getWalletFromPrivateKey(apiKey)
	const seacher = searcherClient(
		global.get_jito_block_api(),
		wallet.wallet
	);

	let transactionsConfirmResult: boolean = false
	let breakCheckTransactionStatus: boolean = false
	try {
		const recentBlockhash = (await global.web3Conn.getLatestBlockhash("finalized")).blockhash;
		let bundleTx = new Bundle(bundleTransactions, 5);
		if (payer) {
			const tipAccount = new PublicKey((await seacher.getTipAccounts())[0]);
			bundleTx.addTipTx(payer, fee * LAMPORTS_PER_SOL, tipAccount, recentBlockhash);
		}

		seacher.onBundleResult(
			async (bundleResult: any) => {
				if (bundleResult.rejected) {
					console.log("Rejected: ", bundleResult.rejected.simulationFailure.msg);
					try {
						if (bundleResult.rejected.simulationFailure.msg.includes("custom program error") ||
							bundleResult.rejected.simulationFailure.msg.includes("Error processing Instruction")) {
							breakCheckTransactionStatus = true
						}
						else if (bundleResult.rejected.simulationFailure.msg.includes("This transaction has already been processed") ||
							bundleResult.rejected.droppedBundle.msg.includes("Bundle partially processed")) {
							transactionsConfirmResult = true
							breakCheckTransactionStatus = true
						}
					} catch (error) {
						console.log(`An error occured while sending bundle: ${error}`)
					}
				}
			},
			(error) => {
				breakCheckTransactionStatus = true
			}
		);
		await seacher.sendBundle(bundleTx);
		setTimeout(() => { breakCheckTransactionStatus = true }, 20000)
		const trxHash = base58.encode(bundleTransactions[bundleTransactions.length - 1].signatures[0])
		while (!breakCheckTransactionStatus) {
			await utils.sleep(1000)
			try {
				const result = await global.web3Conn.getSignatureStatus(trxHash, {
					searchTransactionHistory: true,
				});
				if (result && result.value && result.value.confirmationStatus) {
					transactionsConfirmResult = true
					breakCheckTransactionStatus = true
				}
			} catch (error) {
				transactionsConfirmResult = false
				breakCheckTransactionStatus = true
			}
		}
		return transactionsConfirmResult
	} catch (error) {
		return false
	}
};


// export const sendJitoTransaction = async (transactions: any, payer: any, fee: number) => {
//     try {
//         if (transactions.length === 0)
//             return;

//         console.log("Sending bundles...", transactions.length);
//         let bundleIds = [];
//         const rawTransactions = transactions.map(item => base58.encode(item.serialize()));
//         console.log("raw transactions >> ", rawTransactions)
//         const sendData = await axios.post(`https://mainnet.block-engine.jito.wtf/api/v1/bundles`,
//             {
//                 jsonrpc: "2.0",
//                 id: 1,
//                 method: "sendBundle",
//                 params: [
//                     rawTransactions
//                 ]
//             },
//             {
//                 headers: {
//                     "Content-Type": "application/json",
//                 },
//             }
//         );
//         if (sendData && sendData.data && sendData.data.result) {
//             console.log(sendData);
//             bundleIds = [
//                 ...bundleIds,
//                 sendData.data.result,
//             ];
//         }

//         console.log("Checking bundle's status...", bundleIds);
//         if (bundleIds.length == 0) {
//             console.log("Jito bundle failed")
//             return;
//         }
//         const sentTime = Date.now();
//         while (Date.now() - sentTime < JITO_TIMEOUT) {
//             try {
//                 const { data } = await axios.post("https://mainnet.block-engine.jito.wtf/api/v1/bundles",
//                     {
//                         jsonrpc: "2.0",
//                         id: 1,
//                         method: "getBundleStatuses",
//                         params: [
//                             bundleIds
//                         ],
//                     },
//                     {
//                         headers: {
//                             "Content-Type": "application/json",
//                         },
//                     }
//                 );
//                 if (data) {
//                     const bundleStatuses = data.result.value;
//                     console.log("Bundle Statuses:", bundleStatuses);
//                     let success = true;
//                     for (let i = 0; i < bundleIds.length; i++) {
//                         const matched = bundleStatuses.find(item => item && item.bundle_id === bundleIds[i]);
//                         if (!matched || matched.confirmation_status !== "finalized") {
//                             success = false;
//                             break;
//                         }
//                     }
//                     if (success)
//                         return true;
//                 }
//             }
//             catch (err) {
//                 console.log(err);
//             }

//             await sleep(1000);
//         }
//     }
//     catch (err) {
//         console.log(err);
//     }
//     return false;
// }