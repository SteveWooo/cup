const { Sleep } = require('../utils/utils')
const Cup = require('./Cup')
const MemoryStorage = require('./memoryStorage/MemoryStorage')
const config = require(`${__dirname}/config.json`)
const fs = require('fs')
async function main() {
    // 清理所有数据
    const cup = new Cup(config)
    await cup.ResetDataAndRun()
    
    // 插入初始记忆
    await cup.InsertMemories([
        "我是一个真正的man",
        "我会唱",
        "我会跳",
        "我会RAP",
        "我会打篮球"
    ])

    // ========== test =========
    await Sleep(9000)
    // const cup = new Cup(config)
    // await cup.Run()
    // 测试查询
    const askIng = [
        "我的性别是"
    ]
    console.log("asking:", askIng)
    const searchMemRes = await cup.SearchMemory(askIng)
    console.log(searchMemRes)
}

main()