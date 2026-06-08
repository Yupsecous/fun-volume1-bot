import assert from 'assert';
import dotenv from 'dotenv';

import * as instance from './bot';
import {
    OptionCode,
    StateCode,
} from './bot';
import * as botLogic from './bot_auto_volume_logic';
import * as utils from './utils';
import * as Jito from './jitoAPI';
import * as constants from './uniconst';
import { VersionedTransaction } from '@solana/web3.js';

dotenv.config();

/*

start - welcome
snipe - snipe setting
wallet - manage your bot wallet
*/

const parseCode = async (database: any, session: any, wholeCode: string) => {
    let codes: string[] = wholeCode.split("_");

    if (codes.length % 2 === 0) {
        for (let i = 0; i < codes.length; i += 2) {
            const type = codes[i];
            const code = codes[i + 1];

            if (type === "ref") {
                if (!session.referredBy) {
                    let referredBy: string = "";

                    referredBy = utils.decodeChatId(code);
                    if (referredBy === "" || referredBy === session.chatid) {
                        continue;
                    }

                    if (referredBy.length > 0) {
                        instance.sendInfoMessage(
                            referredBy,
                            `Great news! You have invited @${session.username}
You can earn 20% of their tax forever!`
                        );

                        session.referred = referredBy;

                        await database.updateUser(session);
                    }
                }
            }
        }
    }
    return false;
};

export const procMessage = async (message: any, database: any) => {
    let chatid = message.chat.id.toString();
    let session = instance.sessions.get(chatid);
    let userName = message?.chat?.username;
    let messageId = message?.messageId;

    if (instance.busy) {
        return
    }

    if (message.photo) {
        console.log(message.photo);
        processSettings(message, database);
    }

    if (message.animation) {
        console.log(message.animation);
        processSettings(message, database);
    }

    if (!message.text) return;

    let command = message.text;
    if (message.entities) {
        for (const entity of message.entities) {
            if (entity.type === "bot_command") {
                command = command.substring(
                    entity.offset,
                    entity.offset + entity.length
                );
                break;
            }
        }
    }

    if (command.startsWith("/")) {
        if (!session) {
            if (!userName) {
                console.log(
                    `Rejected anonymous incoming connection. chatid = ${chatid}`
                );
                instance.sendMessage(
                    chatid,
                    `Welcome to ${process.env.BOT_TITLE} bot. We noticed that your telegram does not have a username. Please create username [Setting]->[Username] and try again.`
                );
                return;
            }

            session = await instance.createSession(chatid, userName);
            await database.updateUser(session);
        }

        console.log(
            `${session.username} logined.\ntoken:${session.addr}\nwallet:${session.depositWallet}`
        );

        if (userName && session.username !== userName) {
            session.username = userName;
            await database.updateUser(session);
        }

        let params = message.text.split(" ");
        if (params.length > 0 && params[0] === command) {
            params.shift();
        }

        command = command.slice(1);

        if (command === instance.COMMAND_START) {
            let hideWelcome: boolean = false;
            if (params.length > 0 && params[0].trim() !== "") {
                let wholeCode = params[0].trim();
                hideWelcome = await parseCode(database, session, wholeCode);

                await instance.removeMessage(chatid, message.message_id);
            }

            instance.openMessage(
                chatid, "", 0,
                `😉 You are welcome, To get quick start, please enter token address.`
            );
        }

        // instance.stateMap_remove(chatid)
    } else if (message.reply_to_message) {
        processSettings(message, database);
        await instance.removeMessage(chatid, message.message_id); //TGR
        await instance.removeMessage(
            chatid,
            message.reply_to_message.message_id
        );
    } else if (utils.isValidAddress(command)) {
        if (!session) {
            session = await instance.createSession(chatid, userName);
            await database.updateUser(session);
        }
        await instance.removeMessage(chatid, messageId)
        const token: any = await database.selectToken({ chatid, addr: command })
        if (token) {
            session.addr = command
            await instance.executeCommand(chatid, messageId, undefined, {
                c: OptionCode.MAIN_MENU,
                k: 1,
            })
            await database.updateUser(session);
        }
        else {
            const token: any = await database.selectToken({ chatid, addr: session.addr })
            if (token && token.status) {
                await instance.removeMessage(chatid, message.message_id)
                instance.openMessage(
                    chatid, "", 0,
                    `⚠️ Warning, Bot is working now. If you need to start with new token, please stop the bot and try again.`
                );
            } else {
                session.addr = command
                instance.executeCommand(chatid, messageId, undefined, {
                    c: OptionCode.MAIN_NEW_TOKEN,
                    k: 1,
                })
                await database.updateUser(session);
            }
        }
        console.log(
            `${session.username} logined.\ntoken:${session.addr}\nwallet:${session.depositWallet}`
        );
    } else {
        instance.openMessage(
            chatid, "", 0,
            `😉 You are welcome, To get quick start, please enter token address.`
        );
    }
};

const processSettings = async (msg: any, database: any) => {
    const sessionId = msg.chat?.id.toString();
    let messageId = msg?.messageId;

    const session = instance.sessions.get(sessionId);
    if (!session) {
        return;
    }

    let stateNode = instance.stateMap_getFocus(sessionId);
    if (!stateNode) {
        instance.stateMap_setFocus(sessionId, StateCode.IDLE, {
            sessionId: sessionId,
        });
        stateNode = instance.stateMap_get(sessionId);

        assert(stateNode);
    }

    const stateData = stateNode.data;

    if (stateNode.state === StateCode.WAIT_WITHDRAW_WALLET_ADDRESS) {
        const addr = msg.text.trim();
        if (!addr || addr === "" || !utils.isValidAddress(addr)) {
            instance.openMessage(
                sessionId, "", 0,
                `⛔ Sorry, the token address you entered is invalid. Please try again`
            );
            return;
        }
        // process wallet withdraw
        await instance.removeMessage(sessionId, messageId)
        await botLogic.withdraw(sessionId, addr)
        await instance.bot.answerCallbackQuery(stateData.callback_query_id, {
            text: `✔️ Withdraw is completed successfully.`,
        });
        const menu: any = await instance.json_main(sessionId);
        let title: string = await instance.getMainMenuMessage(sessionId);

        await instance.switchMenu(sessionId, messageId, title, menu.options);
        //
    } else if (stateNode.state === StateCode.WAIT_SET_TARGET) {
        const amount = Number(msg.text.trim());
        if (isNaN(amount) || amount < 0.1) {
            await instance.openMessage(
                sessionId, "", 0,
                `⛔ Sorry, the amount you entered is invalid. Please try again`
            );
            return;
        }
        // process set target amount
        await instance.removeMessage(sessionId, messageId)
        await botLogic.setTargetAmount(sessionId, session.addr, amount)
        const menu: any = await instance.json_main(sessionId);
        let title: string = await instance.getMainMenuMessage(sessionId);

        await instance.switchMenu(sessionId, stateData.menu_id, title, menu.options);
        //
    } else if (stateNode.state === StateCode.WAIT_SET_WALLET_SIZE) {
        const size = Number(msg.text.trim());
        if (isNaN(size) || size <= 0) {
            await instance.openMessage(
                sessionId, "", 0,
                `⛔ Sorry, the number you entered is invalid. Please try again`
            );
            return;
        }
        // process set trx rating
        await instance.removeMessage(sessionId, messageId)
        const menu: any = await instance.json_main(sessionId);
        let title: string = await instance.getMainMenuMessage(sessionId);

        await instance.switchMenu(sessionId, stateData.menu_id, title, menu.options);
        //  
    } else if (stateNode.state === StateCode.WAIT_SET_RATING) {
        const amount = Number(msg.text.trim());
        if (isNaN(amount) || amount <= 0) {
            await instance.openMessage(
                sessionId, "", 0,
                `⛔ Sorry, the amount you entered is invalid. Please try again`
            );
            return;
        }
        // process set trx rating
        await instance.removeMessage(sessionId, messageId)
        await botLogic.setRating(sessionId, session.addr, amount)
        const menu: any = await instance.json_main(sessionId);
        let title: string = await instance.getMainMenuMessage(sessionId);

        await instance.switchMenu(sessionId, stateData.menu_id, title, menu.options);
        //
    } else if (stateNode.state === StateCode.WAIT_SET_BUY_AMOUNT) {
        const amount = Number(msg.text.trim());
        if (isNaN(amount) || amount <= 0) {
            await instance.openMessage(
                sessionId, "", 0,
                `⛔ Sorry, the amount you entered is invalid. Please try again`
            );
            return;
        }
        // process set buy amount
        await instance.removeMessage(sessionId, messageId)
        await botLogic.setBuyAmount(sessionId, session.addr, amount)
        const menu: any = await instance.json_main(sessionId);
        let title: string = await instance.getMainMenuMessage(sessionId);

        await instance.switchMenu(sessionId, stateData.menu_id, title, menu.options);
        //
    }
};
