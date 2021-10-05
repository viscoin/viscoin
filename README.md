# Viscoin

Official Typescript implementation of the Viscoin protocol.

![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/viscoin/viscoin?style=for-the-badge)
[![Discord](https://img.shields.io/discord/840244262615515148?label=Viscoin&logo=discord&style=for-the-badge)](https://discord.gg/viscoin)

## What is Viscoin?
Viscoin is an experimental digital currency that enables instant payments to anyone, anywhere in the world. Viscoin uses peer-to-peer technology to operate with no central authority: managing transactions and issuing money are carried out collectively by the network.

### Coin Specifications
| Specification | Value |
|:-|:-|
| Mining Algorithm | `Argon2d` ([Argon2](https://en.wikipedia.org/wiki/Argon2)) |
| Block Time | `60 seconds` |
| Mining Reward | `1000 VIS` |
| Block Size | `65536 bytes` |
| Port | `9333` |


## Setup & Installation

1. `git clone https://github.com/viscoin/viscoin`
2. `cd viscoin`
3. `npm run setup`

### Mining & Wallet
4. `node wallet`
5. `ADDRESS=your_mining_address node miner`

### Fullnode
4. `node net`
5. `Add` IP address of node in Viscoin network.
6. *using **[pm2](https://www.npmjs.com/package/pm2)*** `pm2 start fullnode.js` *or with **docker*** `docker-compose up -d`

#### Fullnode + Tor
*config/default_env.json*
```json
"USE_PROXY": true,
"ONION_ADDRESS": "XXXXXXXXXXX.onion",
```
*/etc/tor/torrc*
```
HiddenServiceDir /var/lib/tor/viscoin-service/
HiddenServicePort 9333 127.0.0.1:9333
```

#### Important
If your system clock is off by more than `30 seconds` the network will reject your blocks.
Check with [Time.is](https://time.is) if you are synchronized with the official atomic clock time for any time zone.

## Package usage

### Installation
```
npm install viscoin
```

### Examples

#### Generating a wallet
```typescript
import { Wallet } from 'viscoin'
const wallet = new Wallet()
console.log(wallet.address)
```

#### Get latest block (HTTP Request)
```typescript
import { HTTPApi } from 'viscoin'
(async () => {
    const block = await HTTPApi.getLatestBlock({ host: 'localhost', port: 80 })
    console.log(block)
})()
```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.