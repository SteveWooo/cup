const { MilvusClient, DataType, MetricType } = require('@zilliz/milvus2-sdk-node');
const crypto = require("crypto")
const fs = require('fs')
const sqlite3 = require('sqlite3').verbose()
const { Logger } = require(`${__dirname}/../../utils/utils`)

class MemoryStorage {
  constructor(config) {
    this.config = config
    this.dimension = 768; // 指定向量的维度
    this.collectionName = 'memory_storage';
    this.logger = new Logger(this.config);
    this.milvusClient = new MilvusClient({
      address: this.config.milvusServiceAddress
    });

    // this._check().then();
  }

  // ========== 各种基础初始化 ==========
  InitSqlite() {
    this.db = new sqlite3.Database("mydb.sqlite")
    return new Promise(resolve => {
      this.db.serialize(() => {
        resolve()
      })
    })
  }

  async InitSqliteTable() {
    const that = this;
    this.db.run("CREATE TABLE memories (memory_id INTEGER PRIMARY KEY AUTOINCREMENT, originText TEXT)", function(err) {
      if (err) {
        that.logger.Error('Error when init sqlite Table', err)
        return 
      }
      that.logger.Debug('Init Sqlite Table Success')
    });
    return 
  }

  async InitCollection() {
    await this._createCollection()
    return
  }

  async LoadSearchIndex() {
    await this._loadCollection()
    return
  }

  async CreateIndex() {
    await this._createIndex()
    return
  }

  async DeleteCollection() {
    const res = await this.milvusClient.dropCollection({
      collection_name: this.collectionName
    })
    this.logger.Debug("drop collection:", res)
    return;
  }

  // ======== sqlite =========
  _insertSqlite(originText) {
    return new Promise(resolve => {
      this.db.run("INSERT INTO memories (originText) VALUES (?)", originText, function(err) {
        if (err) {
          resolve ({
            status: 5000,
            message: err.message
          })
          return 
        }
        resolve({
          status: 2000,
          memoryID: this.lastID
        })
      })
    })
  }

  _querySqliteByMemoryID(memoryID) {
    const that = this;
    return new Promise(resolve => {
      this.db.each(
        "SELECT originText FROM memories WHERE memory_id= ? ",
        [memoryID],
        function(err, row) {
          if (err) {
            that.logger.Error("Error when query sqllite", err)
            resolve({
              status: 5000,
              message: err
            })
            return 
          }

          resolve({
            status: 2000,
            row: row
          })
        }
      )
    })
  }

  async _check() {
    const res = await this.milvusClient.hasCollection({
      collection_name: this.collectionName
    })
    this.logger.Debug("check", res)
    return;
  }

  async _loadCollection() {
    const res = await this.milvusClient.loadCollection({
      collection_name: this.collectionName
    });
    this.logger.Debug("Load Index", res)
    this.logger.Debug("Load Index will not Succes when milvus database is empty, dont worry about that.")
    return;
  }

  async _createCollection() {
    const params = {
      collection_name: this.collectionName,
      metric_type: MetricType.L2,
      index_file_size: 1024,
      fields: [
        {
          name: "memory_id",
          data_type: DataType.Int64,
          is_primary_key: true,
          auto_id: true
        },
        {
          name: "memory_vector",
          data_type: DataType.FloatVector,
          is_primary_key: false,
          dim: this.dimension,
        }
      ],
    };

    const res = await this.milvusClient.createCollection(params);
    console.log("create:", res)
    return;
  }

  async _createIndex() {
    const indexParams = {
      collection_name: this.collectionName,
      field_name: "memory_vector",
      extra_params: {
        index_type: "IVF_FLAT",
        metric_type: "L2",
        params: JSON.stringify({ nlist: 1024 }),
      },
    }

    const res = await this.milvusClient.createIndex(indexParams);
    this.logger.Debug("create index:", res)
    return
  }

  // ========== API ==========
  // 存储记忆向量
  async StoreMemory(memoryVector, originText) {
    // 插入sqlite
    const sqlRes = await this._insertSqlite(originText)
    if (sqlRes.status !== 2000) {
      this.logger.Error("error when insert sqlList:", sqlRes)
      return ;
    }
    const memoryID = sqlRes.memoryID

    // 插入milvus
    const res = await this.milvusClient.insert({
      collection_name: this.collectionName,
      fields_data: [{
        memory_id: memoryID,
        memory_vector: memoryVector
      }]
    })

    this.logger.Debug("New memory:", originText)
    if (res.status.code === 0) {
      return memoryID
    }
    return undefined
  }

  // 搜索记忆向量，找到最接近的一个记忆向量的ID
  async SearchMemory(queryVectors) {
    const res = await this.milvusClient.search({
      collection_name: this.collectionName,
      vectors: queryVectors,
      vector_type: DataType.FloatVector,
      search_params: {
        anns_field: "memory_vector",
        topk: "10",
        metric_type: "L2",
        params: JSON.stringify({ nprobe: 10 }),
      }
    })
    if (res.status.error_code !== 'Success') {
      return {
        status: 5000,
        message: res.status
      }
    }

    // 从sqlLite中根据ID反查数据
    const topKMemories = []
    for(let i = 0; i < res.results.length; i ++) {
      const memoryID = res.results[i].memory_id;
      const sqliteRes = await this._querySqliteByMemoryID(memoryID)
      if (sqliteRes.status !== 2000) {
        continue;
      }
      topKMemories.push({
        originText: sqliteRes.row.originText,
        score: res.results[i].score
      })
    }

    return topKMemories;
  }
}

module.exports = MemoryStorage;