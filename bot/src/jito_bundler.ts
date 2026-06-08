import * as JitoAPI from './jitoAPI';
import * as constants from './uniconst';
import * as utils from './utils';

export class JitoBundler {
	private jitoKeys: string[] = []
	private usedKeyindex: number = 0

	public constructor() {
		this.jitoKeys = constants.JITO_AUTH_KEYS
	}

	private getAPIKey = () => {
		this.usedKeyindex++
		if (this.usedKeyindex >= this.jitoKeys.length) {
			this.usedKeyindex = 0
		}
		return this.jitoKeys[this.usedKeyindex]
	}

	public sendBundles = async (bundleTransactions: any[], payer: any, maxRetry: number = 3): Promise<boolean> => {
		const len: number = bundleTransactions.length
		// console.log("jito requesting ", len);

		if (!bundleTransactions.length || bundleTransactions.length > 5) {
			return false
		}
		const result: boolean = await JitoAPI.createAndSendBundleTransaction(bundleTransactions, payer ? payer.wallet : null, this.getAPIKey(), constants.JITO_BUNDLE_TIP)
		if (!result && maxRetry - 1 > 0) {
			await utils.sleep(500)
			// console.log("jito retrying... ", len);
			return await this.sendBundles(bundleTransactions.slice(0, len), payer, maxRetry - 1)
		}
		return result
	}
}