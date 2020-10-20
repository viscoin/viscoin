import * as mongoose from 'mongoose'
const schema = mongoose.Schema({
    previousHash: Buffer,
    nonce: Number,
    height: Number,
    timestamp: Number,
    difficulty: Number,
    transactions: Array,
    hash: Buffer
},
{
    collection: "blocks"
})
export default mongoose.model("Block", schema)