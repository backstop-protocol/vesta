import Web3 from "web3"
import {fromUiDeciamlPointFormat, toUiDecimalPointFormat, gasToEth} from "./Utils"
const {fromWei, toWei} = Web3.utils

function increaseABit(number) {
    return parseInt(1.2 * number);
}

function validateTx(tx) {
    debugger
    tx.arguments.forEach(arg => {
        if(!arg || arg === "0x0000000000000000000000000000000000000000"){
            const msg = "one of the TX arguments is falsy or invalid and might send ETH to an invalid account"
            console.error(msg)
            throw new Error(msg)
        }
    })
}

export const ApiAction = async function (action, user, web3, value = 0, hashCb = null, onlyGasEstimate = false) {
    return new Promise(async (resolve, reject) => {
        try {
            validateTx(action)
            const txObject = await action;
            const gasEstimate = await txObject.estimateGas({ value: value, from: user });
            const gasConsumption = increaseABit(gasEstimate);
            if(onlyGasEstimate){
                resolve(gasToEth(gasConsumption, web3))
                return
            }
            const transaction = txObject.send({ gas: gasConsumption, value: value, from: user })
                .once('transactionHash', (hash) => { if (hashCb) hashCb(hash) })
                .on('error', (error) => { console.log("hmmm?", error); reject(error) })
                .then((receipt) => {
                    resolve(receipt);
                })
                .catch((error) => {
                    console.log("oh nooo")
                    reject(error);
                })

        }
        catch (error) {
            reject(error);
        }
    })
};
