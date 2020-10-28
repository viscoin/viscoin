import * as crypto from 'crypto'
import * as prompts from 'prompts'
import * as baseX from 'base-x'
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const base58 = baseX(BASE58)

const commands = {
    commands: async () => {
        const res = await prompts({
            type: 'autocomplete',
            name: 'value',
            message: 'Command',
            choices: [
                { title: 'Send', description: 'Send money to address', value: commands.send },
                { title: 'Address', description: 'Get wallet address', value: commands.address },
                { title: 'Balance', description: 'Get balance of wallet address', value: commands.balance },
                { title: 'Commands', description: 'Lists all avaliable commands', value: commands.commands }
            ]
        })
        res.value()
    },
    send: async () => {
        const res = await prompts([
            {
                type: 'text',
                name: 'address',
                message: 'Address',
                validate: address => {
                    try {
                        crypto.createPublicKey({
                            key: base58.decode(address),
                            type: 'spki',
                            format: 'der'
                        })
                        return true
                    } catch {
                        return 'Invalid address'
                    }
                }
            },
            {
                type: 'text',
                name: 'amount',
                message: 'Amount',
                validate: amount => isNaN(parseFloat(amount)) ? 'Invalid amount' : true
            },
            {
                type: 'text',
                name: 'minerFee',
                message: 'Miners fee',
                validate: minerFee => isNaN(parseFloat(minerFee)) ? 'Invalid amount' : true
            },
            {
                type: 'toggle',
                name: 'confirm',
                message: (prev, values) => `Total ${parseFloat(values.amount) + parseFloat(values.minerFee)}. Sign and broadcast?`,
                initial: false,
                active: 'yes',
                inactive: 'no'
            }
        ])
        console.log(res)
    },
    address: async () => {

    },
    balance: async () => {

    }
}
commands.commands()