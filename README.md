![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/viscoin/viscoin?style=for-the-badge)
![Discord](https://img.shields.io/discord/840244262615515148?label=discord&logo=discord&style=for-the-badge)

# Viscoin

#### Viscoin is an experimental digital currency that enables instant payments to anyone, anywhere in the world.

#### This is the core implementation for the Viscoin protocol.

### Coin Specifications
| Specification | Value |
|:-|:-|
| Mining Algorithm | `Argon2d` ([Argon2](https://en.wikipedia.org/wiki/Argon2)) |
| Block Time | `60 seconds` |
| Mining Reward | `1000 VIS` |
| Block Size | `65536 bytes` |
| Port | `9333` |


## Installation

### Running a node
1. Clone this repository. `git clone https://github.com/viscoin/viscoin.git`
2. Install dependencies. `npm i`
3. Compile typescript. `npm run c`
4. Run the setup script `node setup` and select Node.
5. Add a starting point, a first node to connect to. `node net`
6. Run the node. `node fullnode`

### Mining
1. Clone this repository. `git clone https://github.com/viscoin/viscoin.git`
2. Install dependencies. `npm i`
3. Compile typescript. `npm run c`
4. Run the setup script `node setup` and select Miner.
5. Start mining. `node miner`

## Package usage

#### Installation
```
npm install viscoin
```

#### Example

###### Generating a wallet
```typescript
import * as crypto from 'crypto'
import { publicKeyFromPrivateKey, addressFromPublicKey, base58 } from 'viscoin'

const privateKey = crypto.randomBytes(32)
const publicKey = publicKeyFromPrivateKey(privateKey)
const address = addressFromPublicKey(publicKey)
console.log(base58.encode(address))
```

###### Building a transaction
```typescript
import { Transaction } from 'viscoin'

const privateKey = Buffer.alloc(32, 0xff)
const transaction = new Transaction({
    to: 'visC6571qoyNNzepeCLpy4EmhqD',
    amount: '69',
    minerFee: '0.000000000000000001',
    timestamp: Date.now()
})
transaction.sign(privateKey)
console.log(transaction)
```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.