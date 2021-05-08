
# Viscoin

Viscoin is an experimental digital currency that enables instant payments to anyone, anywhere in the world.

---

## How Do I Mine?

### Requirements

| Link        | Version         
| ------------- |:-------------:|
| [Node.js](https://nodejs.org/en/) | Latest |
| [Visual Studio Code](https://code.visualstudio.com/download) (Preferred) | Latest |

### Setup

- Make sure Node.js is installed by running `node -v` in ur preferred terminal.
- Clone / Download this project
- Then open the folder up in any preferred IDE so that you can view the code, we recommend [Visual Studio Code](https://code.visualstudio.com/download)
- Then go to ur terminal, make sure you are in the folder u downloaded, first type `npm i` into ur terminal & then `npm run c`
- Now open the **network.json** file and set the property called `host:` on both **HTTP & TCP** to any public API host in the #hosts channel found in our [discord](https://viscoin.net/discord
- Then you'd wanna open the **settings.json** file and set the `miningRewardAddress` to your own wallet address so that the coins destination is correct ([How To Setup A Wallet](https://viscoin.github.io/))
- Now you can finally start the miner by running `node miner` in ur terminal
- ---
