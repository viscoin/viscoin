# Viscoin
Official Typescript implementation of the Viscoin protocol.

## What is Viscoin?
Viscoin is an experimental digital currency that enables instant payments to anyone, anywhere in the world. Viscoin uses peer-to-peer technology to operate with no central authority: managing transactions and issuing money are carried out collectively by the network.

### Coin Specifications
| Specification | Value |
|:-|:-|
| Mining algorithm | `Argon2d` ([Argon2](https://en.wikipedia.org/wiki/Argon2)) |
| Approximate block time | `1 minute` |
| Initial mining reward | `1 Viscoin` |
| Precision | `1e-8` (0.00000001) |
| Block halving | `Every 210000 blocks` (Roughly every 4 years) |
| Max block size | `65536 bytes` |
| Port | `9333` |

## Setup & Installation

1. `git clone https://github.com/viscoin/viscoin`
2. `cd viscoin`
3. `npm run setup`

### Configuration
Create a `.env` file in the root of the project.
```
HTTP_API=:80
TCP_API=:9332
TCP_NODE=:9333
DEBUG=0
ADDRESS=your_mining_address
```

### Wallet
* `node wallet`

### Miner
* `node miner`

### Fullnode
4. `node net-config`
5. `Add` addresses to other nodes that are part of the Viscoin network.
6. *Using **[pm2](https://www.npmjs.com/package/pm2)*** `pm2 start fullnode.js` *or with **docker*** `docker-compose up -d`.

#### Tor hidden service
*/etc/tor/torrc*
```
HiddenServiceDir /var/lib/tor/viscoin-service/
HiddenServicePort 9333 127.0.0.1:9333
```
*.env*
```
USE_PROXY=1
ONION_ADDRESS=XXXXXXXXXXX.onion
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
