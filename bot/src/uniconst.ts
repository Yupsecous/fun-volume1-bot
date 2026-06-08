
export const USDC_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
export const SOL_USDC_POOL_ADDRESS = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";
export const OPENBOOK_PROGRAM_ADDRESS = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
export const WSOL_ADDRESS = "So11111111111111111111111111111111111111112"
export const WSOL_DECIMALS = 9
export const WSOL2022_ADDRESS = "9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP"
export const USDT_ADDRESS = `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`

export const JITO_AUTH_KEYS = [
	'qYVSiZtoqhswnyjXyRgnoHtnwpapRfkFUz3H6k2XZrwR7zcZ7bzA9Exh3s17GfppTBfn44r1Tw4ycgtWixaYXML',
	'3mZKuu9zuvt1nZpSwNJ31owHqZniPUFxp8Ps2ybdcvBVJo2zY4Hp6PqEe4koDYG5cFtuxXfQAzoYyekJ52n87tZS'
]

export const JITO_TIP_ACCOUNT = "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe"
export const LIMIT_WALLET_SIZE = 3

export const PRIORITY_RATE = 200000

export const JITO_BUNDLE_TIP = 0.002
export const JITO_FEE_AMOUNT = 0.1;

export const MIN_DIVIDE_SOL = 0.005;
export const MIN_REST_SOL = 0.003
export const MIN_TARGET_VOLUME = 1;
export const MIN_TAX_AMOUNT = 0.01;

export const VOLUME_UNIT = 1000;

export const SOL_TAX_FEE_PER_1M_VOLUME = 10;

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const LIMIT_FREE_TOKEN_COUNT = 2;
export const LIMIT_REST_SOL_AMOUNT = 0.01;

export enum ResultCode {
	SUCCESS = 0,
	INTERNAL,
	PARAMETER,
	USER_INSUFFICIENT_SOL,
	USER_INSUFFICIENT_JITO_FEE_SOL,
	USER_INSUFFICIENT_ENOUGH_SOL,
	INVALIDE_USER,
	INVALIDE_TOKEN,
}

// export const BOT_FOOTER_DASH = "_______________________________________________________"
export const BOT_FOOTER_DASH = ""

export const RAYDIUM_POOL_KEY_URL = "https://api.raydium.io/v2/sdk/liquidity/mainnet.json"