const MemoryStorage = require('./memoryStorage/MemoryStorage')
const { spawn } = require("child_process")
const path = require('path')
const fs = require('fs')
const request = require('request')
const { Sleep, Logger } = require('../utils/utils')

module.exports = class Cup {
    constructor(config) {
        this.config = config;
        this.ms = new MemoryStorage(this.config)
        this.logger = new Logger(this.config)
        this.Run = this.Run.bind(this)
    }

    async Run() {
        // bert
        await this.RunBertService()
        // milvus
        await this.ms.LoadSearchIndex() // 载入索引到内存
        // sqlite
        await this.ms.InitSqlite()
    }

    // 清空数据库所有数据，然后重新创建表和集合
    async ResetDataAndRun() {
        // run bert
        await this.RunBertService()
        // 初始化milvus集合
        await this.ms.DeleteCollection() // 删除milvus集合
        await this.ms.InitCollection() // 创建milvus集合

        // 初始化sqlite数据
        try {
            fs.rmSync(`${__dirname}/mydb.sqlite`)
        } catch (e) {

        }
        await this.ms.InitSqlite() // 序列化sqlLite数据库
        await this.ms.InitSqliteTable() // 创建sqlite数据表
    }

    // 插入记忆
    async InsertMemories(originTexts) {
        for(let i = 0; i < originTexts.length; i ++) {
            const originText = originTexts[i]
            const res = await this.text2Vector(originText)
            const vector = res.vector
            await this.ms.StoreMemory(vector, originText)
        }

        // 创建索引并把索引加载到内存
        await this.ms.CreateIndex()
        await this.ms.LoadSearchIndex()
        return
    }

    async SearchMemory(originTexts) {
        // 将自然语言转换成向量
        const queryVectors = []
        for(let i = 0; i < originTexts.length; i++) {
            const t2vRes = await this.text2Vector(originTexts[i])
            if (t2vRes.status !== 2000) {
                this.logger.Error("error when text to vector", t2vRes)
                continue;
            }
            const vector = t2vRes.vector
            queryVectors.push(vector)
        }
        const searchRes = await this.ms.SearchMemory(queryVectors)
        return searchRes
    }

    // 运行Bert向量转换服务
    RunBertService() {
        return new Promise(resolve => {
            // 启动bert服务
            const bertService = spawn('python3.10', [
                `${path.join(__dirname, 'memoryStorage/bertService.py')}`,
                this.config.bertServicePort
            ])
        
            bertService.stdout.on('data', data => {
                this.logger.Debug('bert service std:', data.toString())
                this.logger.Debug("bert service run on:" + this.config.bertServicePort)
                resolve();
                return 
            })

            bertService.stderr.on('data', data => {
                // this.logger.Debug('bert service stderr:', data.toString())
            })

            bertService.on('close', code => {
                this.logger.Debug('bert service exited with code:', code)
            })
        })
    }

    text2Vector(originText) {
        return new Promise(resolve => {
            var options = {
                url: 'http://127.0.0.1:' + this.config.bertServicePort + '/bert',
                headers: {
                    'Content-Type': 'Application/json'
                },
                body: JSON.stringify({
                    text: originText
                })
            }
    
            request.post(options, (err, res, body) => {
                if (err) {
                    this.logger.Error('Error when text2Vector', err)
                    resolve({
                        status: 5000,
                        message: err.message
                    })
                    return ;
                }
                resolve(JSON.parse(body))
            })
        })
    }
}