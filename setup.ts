import * as prompts from 'prompts'
import isValidAddress from './src/isValidAddress'
import * as fs from 'fs'
import isValidHostname from './src/isValidHostname'
import * as chalk from 'chalk'

const commands = {
    commands: async () => {
        let choices: Array<{ title: string, description: string, value: Function }> = [
            { title: 'Miner', description: 'Setup Miner', value: commands.Miner },
            { title: 'Node', description: 'Setup Node', value: commands.Node },
            { title: 'Wallet', description: 'Setup Wallet', value: commands.Wallet },
            { title: 'Exit', description: 'Exits', value: commands.exit }
        ]
        const res = await prompts({
            type: 'autocomplete',
            name: 'value',
            message: 'Command',
            choices
        })
        if (typeof res.value !== 'function') {
            console.clear()
            return commands.commands()
        }
        res.value()
    },
    Miner: async () => {
        const { address } = await prompts({
            type: 'text',
            name: 'address',
            message: `Enter ${chalk.greenBright('Address')}`,
            validate: async address => {
                const valid = isValidAddress(address)
                if (valid) return true 
                return 'Invalid Address'
            }
        })
        const { http_host } = await prompts({
            type: 'text',
            name: 'http_host',
            message: `Enter ${chalk.gray('API')} ${chalk.yellowBright('HTTP')} ${chalk.cyanBright('Host')}`,
            validate: async host => {
                const code = isValidHostname(host)
                if (code !== 0) return `Invalid host ${code}`
                return true
            }
        })
        const { http_port } = await prompts({
            type: 'text',
            name: 'http_port',
            message: `Enter ${chalk.gray('API')} ${chalk.yellowBright('HTTP')} ${chalk.blueBright('Port')} ${chalk.gray('(default 80)')}`,
            validate: async port => {
                if (isNaN(parseInt(port))) return 'Invalid port'
                return true
            }
        })
        const { tcp_host } = await prompts({
            type: 'text',
            name: 'tcp_host',
            message: `Enter ${chalk.gray('API')} ${chalk.yellow('TCP')} ${chalk.cyanBright('Host')}`,
            validate: async host => {
                const code = isValidHostname(host)
                if (code !== 0) return `Invalid host ${code}`
                return true
            }
        })
        const { tcp_port } = await prompts({
            type: 'text',
            name: 'tcp_port',
            message: `Enter ${chalk.gray('API')} ${chalk.yellow('TCP')} ${chalk.blueBright('Port')} ${chalk.gray('(default 9332)')}`,
            validate: async port => {
                if (isNaN(parseInt(port))) return 'Invalid port'
                return true
            }
        })
        const settings = require('./config/settings.json')
        if (address) settings.Miner.miningRewardAddress = address
        fs.writeFileSync('./config/settings.json', JSON.stringify(settings, null, 4))
        console.log({ miningRewardAddress: settings.Miner.miningRewardAddress })
        const network = require('./config/network.json')
        if (http_host) network.Miner.HTTPApi.host = http_host
        if (http_port) network.Miner.HTTPApi.port = parseInt(http_port)
        if (tcp_host) network.Miner.TCPApi.host = tcp_host
        if (tcp_port) network.Miner.TCPApi.port = parseInt(tcp_port)
        fs.writeFileSync('./config/network.json', JSON.stringify(network, null, 4))
        console.log(network.Miner)
        console.log('Done!')
    },
    Node: async () => {
        const { http_host } = await prompts({
            type: 'text',
            name: 'http_host',
            message: `Enter ${chalk.gray('API')} ${chalk.yellowBright('HTTP')} ${chalk.cyanBright('Host')}`,
            validate: async host => {
                const code = isValidHostname(host)
                if (code !== 0) return `Invalid host ${code}`
                return true
            }
        })
        const { http_port } = await prompts({
            type: 'text',
            name: 'http_port',
            message: `Enter ${chalk.gray('API')} ${chalk.yellowBright('HTTP')} ${chalk.blueBright('Port')} ${chalk.gray('(default 80)')}`,
            validate: async port => {
                if (isNaN(parseInt(port))) return 'Invalid port'
                return true
            }
        })
        const { tcp_host } = await prompts({
            type: 'text',
            name: 'tcp_host',
            message: `Enter ${chalk.gray('API')} ${chalk.yellow('TCP')} ${chalk.cyanBright('Host')}`,
            validate: async host => {
                const code = isValidHostname(host)
                if (code !== 0) return `Invalid host ${code}`
                return true
            }
        })
        const { tcp_port } = await prompts({
            type: 'text',
            name: 'tcp_port',
            message: `Enter ${chalk.gray('API')} ${chalk.yellow('TCP')} ${chalk.blueBright('Port')} ${chalk.gray('(default 9332)')}`,
            validate: async port => {
                if (isNaN(parseInt(port))) return 'Invalid port'
                return true
            }
        })
        const { node_tcp_host } = await prompts({
            type: 'text',
            name: 'node_tcp_host',
            message: `Enter ${chalk.magentaBright('Node')} ${chalk.yellow('TCP')} ${chalk.cyanBright('Host')}`,
            validate: async host => {
                const code = isValidHostname(host)
                if (code !== 0) return `Invalid host ${code}`
                return true
            }
        })
        const { node_tcp_port } = await prompts({
            type: 'text',
            name: 'node_tcp_port',
            message: `Enter ${chalk.magentaBright('Node')} ${chalk.yellow('TCP')} ${chalk.blueBright('Port')} ${chalk.gray('(default 9333)')}`,
            validate: async port => {
                if (isNaN(parseInt(port))) return 'Invalid port'
                return true
            }
        })
        const network = require('./config/network.json')
        if (http_host) network.Node.HTTPApi.host = http_host
        if (http_port) network.Node.HTTPApi.port = parseInt(http_port)
        if (tcp_host) network.Node.TCPApi.host = tcp_host
        if (tcp_port) network.Node.TCPApi.port = parseInt(tcp_port)
        if (node_tcp_host) network.Node.TCPNode.host = node_tcp_host
        if (node_tcp_port) network.Node.TCPNode.port = parseInt(node_tcp_port)
        fs.writeFileSync('./config/network.json', JSON.stringify(network, null, 4))
        console.log(network.Node)
        console.log('Done!')
    },
    Wallet: async () => {
        const { http_host } = await prompts({
            type: 'text',
            name: 'http_host',
            message: `Enter ${chalk.gray('API')} ${chalk.yellowBright('HTTP')} ${chalk.cyanBright('Host')}`,
            validate: async host => {
                const code = isValidHostname(host)
                if (code !== 0) return `Invalid host ${code}`
                return true
            }
        })
        const { http_port } = await prompts({
            type: 'text',
            name: 'http_port',
            message: `Enter ${chalk.gray('API')} ${chalk.yellowBright('HTTP')} ${chalk.blueBright('Port')} ${chalk.gray('(default 80)')}`,
            validate: async port => {
                if (isNaN(parseInt(port))) return 'Invalid port'
                return true
            }
        })
        const network = require('./config/network.json')
        if (http_host) network.Wallet.HTTPApi.host = http_host
        if (http_port) network.Wallet.HTTPApi.port = parseInt(http_port)
        fs.writeFileSync('./config/network.json', JSON.stringify(network, null, 4))
        console.log(network.Wallet)
        console.log('Done!')
    },
    exit: () => {
        console.clear()
        process.exit(0)
    }
}
commands.commands()