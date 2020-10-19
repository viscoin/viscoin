import * as mongoose from 'mongoose'
const schema = mongoose.Schema({
    hash: String,
    timestamp: Number,
    transactions: Array,
    previousHash: String,
    nonce: Number,
    height: Number,
    difficulty: Number
},
{
    collection: "blocks"
})
export default mongoose.model("Block", schema)